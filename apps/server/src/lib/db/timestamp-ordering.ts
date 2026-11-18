import { AsyncLocalStorage } from "node:async_hooks";
import type { Collection, Db, Document } from "mongodb";
import { ApiError } from "../../config/errors.js";

export const TS_ABORTED = "TS_ABORTED";
const TS_MAX_RESTARTS = 3;

type Transaction = {
  ts: number;
  anchor: "client" | "server";
  stampReads: boolean;
  wrote: boolean;
};

type Row = Record<string, unknown>;
type Op = (...args: unknown[]) => unknown;

const EXEMPT = new Set([
  "session",
  "account",
  "verification",
  "audit_log",
  "admin_action_log",
  "storage_usage",
  "admin_step_up",
]);
const STAMP_FREE = new Set(["user", "session", "account", "verification"]);
const FILTER_WRITES = new Set([
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
]);

const store = new AsyncLocalStorage<Transaction>();
let last = 0;

/**
 * Concurrency: timestamp ordering — the TS oracle.
 * Rule: every TS(T) is unique and strictly increasing: `max(last + 1, Date.now())`.
 * Ceiling: an in-process counter, correct for the single systemd process
 * (docs/ops/deployment.md); move it to a Mongo counter before running a second instance.
 */
export function nextTs(): number {
  last = Math.max(last + 1, Date.now());
  return last;
}

/**
 * Concurrency: timestamp ordering — client TS validation.
 * Rule: a client `ts` must be a positive integer no later than the newest TS
 * this server could have issued, so a client cannot claim a future TS that wins every check.
 */
export function isIssuedTs(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) > 0 &&
    (value as number) <= Math.max(last, Date.now())
  );
}

/**
 * Concurrency: timestamp ordering — transaction start.
 * Rule: a request carrying a client `ts` is a client-anchored T that began at that
 * read; otherwise T is server-anchored with a fresh TS. Writes always stamp their
 * reads; GETs stamp only once `stampWriterReads` marks the caller as a writer.
 */
export function beginTransaction(
  clientTs: number | undefined,
  method: string,
  fn: () => void,
): void {
  store.run(
    {
      ts: clientTs ?? nextTs(),
      anchor: clientTs === undefined ? "server" : "client",
      stampReads: method !== "GET",
      wrote: false,
    },
    fn,
  );
}

/**
 * Concurrency: timestamp ordering — the current transaction.
 * Returns: T for the running request, or `undefined` outside `/api/v1`
 * (sweeps, scripts, Better Auth), where no rule applies.
 */
export function currentTransaction(): Transaction | undefined {
  return store.getStore();
}

/**
 * Concurrency: timestamp ordering — work outside T.
 * Rule: session lookup is not part of the business transaction, so it neither
 * checks nor stamps the `user` document it reads.
 */
export function outsideTransaction<T>(fn: () => T): T {
  return store.exit(fn);
}

/**
 * Concurrency: timestamp ordering — selective read stamping.
 * Rule: a GET by an instructor, officer or admin surface stamps `readTs` on what it
 * reads; a student surface GET does not, so student page views and polling never
 * abort staff edits (the one deliberate deviation from basic TO).
 */
export function stampWriterReads(): void {
  const tx = store.getStore();
  if (tx) tx.stampReads = true;
}

/**
 * Concurrency: timestamp ordering — record timestamps.
 * Rule: every guarded write stamps `updatedAt`, and `createdAt` too on an insert or
 * an upsert that creates the document; Better Auth's four schema collections are
 * left alone. These are wall-clock dates, deliberately not TS values.
 */
function stampInsert(docs: Row[]): void {
  const at = new Date();
  for (const doc of docs) {
    doc.createdAt = at;
    doc.updatedAt = at;
  }
}

function stampUpdate(update: Row): Row {
  const at = new Date();
  const set = { ...(update.$set as Row | undefined) };
  delete set.createdAt;
  const onInsert = { ...(update.$setOnInsert as Row | undefined) };
  onInsert.createdAt ??= at;
  return { ...update, $set: { ...set, updatedAt: at }, $setOnInsert: onInsert };
}

function stampReplace(doc: Row): Row {
  const at = new Date();
  return { ...doc, createdAt: doc.createdAt ?? at, updatedAt: at };
}

function aborted(tx: Transaction): ApiError {
  return new ApiError("CONFLICT", {
    message: "This record changed since you loaded it. Reload and try again.",
    data: { code: TS_ABORTED, ts: tx.ts },
  });
}

/**
 * Concurrency: timestamp ordering — restart.
 * Rule: an aborted server-anchored T that has not written yet restarts with a new
 * TS, at most `TS_MAX_RESTARTS` times.
 * Abort: a client-anchored T, or one that already wrote, surfaces as `409`
 * `TS_ABORTED`. Ceiling: no multi-document rollback, so writes made before the
 * abort stay; wrap the request in a Mongo transaction if that ever bites.
 */
export function restartAborted(error: unknown, attempt: number): boolean {
  const tx = store.getStore();
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
  if (!tx || code !== TS_ABORTED || tx.anchor !== "server") return false;
  if (tx.wrote || attempt >= TS_MAX_RESTARTS) return false;
  tx.ts = nextTs();
  return true;
}

const stale = (ts: number) => ({
  $or: [{ writeTs: { $gt: ts } }, { readTs: { $gt: ts } }],
});
const fresh = (ts: number) => ({
  writeTs: { $not: { $gt: ts } },
  readTs: { $not: { $gt: ts } },
});

/**
 * Concurrency: timestamp ordering — read rule.
 * Rule: abort when TS(T) < writeTs(X) for any X read.
 * Pass: readTs(X) = max(readTs(X), TS(T)) when T stamps its reads.
 * Abort: `TS_ABORTED`, restarted or `409` per `restartAborted`.
 */
async function readRule(
  raw: Collection<Document>,
  rows: Row[],
  tx: Transaction,
): Promise<void> {
  if (rows.some((row) => Number(row.writeTs ?? 0) > tx.ts)) throw aborted(tx);
  const ids = rows.map((row) => row._id).filter((id) => id !== undefined);
  if (!tx.stampReads || ids.length === 0) return;
  await raw.updateMany(
    { _id: { $in: ids } } as never,
    { $max: { readTs: tx.ts } } as never,
  );
}

/**
 * Concurrency: timestamp ordering — write rule.
 * Rule: abort when TS(T) < readTs(X) or TS(T) < writeTs(X) for any X the filter matches.
 * Pass: writeTs(X) = TS(T); the write itself re-asserts the rule in its filter, so a
 * racing newer T makes it match nothing instead of overwriting.
 * Abort: `TS_ABORTED`, restarted or `409` per `restartAborted`.
 */
function writeRule(
  raw: Collection<Document>,
  name: string,
  op: Op,
  tx: Transaction,
  stamped: boolean,
): Op {
  const isDelete = name.toLowerCase().includes("delete");
  return async (filter = {}, ...rest) => {
    const conflict = await raw.findOne(
      { $and: [filter, stale(tx.ts)] } as never,
      { projection: { _id: 1 } },
    );
    if (conflict) throw aborted(tx);
    if (!isDelete) {
      const change = rest[0] as Row | Row[];
      const doc = change as Row;
      if (Array.isArray(change)) {
        rest[0] = [...change, { $set: { writeTs: tx.ts } }];
      } else if (name === "replaceOne") {
        rest[0] = stamped
          ? { ...stampReplace(doc), writeTs: tx.ts }
          : { ...doc, writeTs: tx.ts };
      } else {
        const update = stamped ? stampUpdate(doc) : doc;
        rest[0] = { ...update, $set: { ...(update.$set as Row), writeTs: tx.ts } };
      }
    }
    const options = rest[isDelete ? 0 : 1] as { upsert?: boolean } | undefined;
    const scoped = options?.upsert ? filter : { $and: [filter, fresh(tx.ts)] };
    const result = await op(scoped, ...rest);
    const count = (result as { matchedCount?: number; deletedCount?: number } | null);
    if (result === null || count?.matchedCount === 0 || count?.deletedCount === 0) {
      if (await raw.findOne({ $and: [filter, stale(tx.ts)] } as never, { projection: { _id: 1 } })) throw aborted(tx);
    }
    tx.wrote = true;
    return result;
  };
}

/**
 * Concurrency: timestamp ordering — insert.
 * Pass: a new X starts with writeTs(X) = TS(T); nothing can be older than it.
 */
function insertRule(op: Op, tx: Transaction, many: boolean, stamped: boolean): Op {
  return async (docs, ...rest) => {
    const rows = (many ? docs : [docs]) as Row[];
    for (const doc of rows) doc.writeTs = tx.ts;
    if (stamped) stampInsert(rows);
    const result = await op(docs, ...rest);
    tx.wrote = true;
    return result;
  };
}

function stampingInsert(op: Op, many: boolean): Op {
  return async (docs, ...rest) => {
    stampInsert((many ? docs : [docs]) as Row[]);
    return op(docs, ...rest);
  };
}

function stampingWrite(op: Op, name: string): Op {
  const isDelete = name.toLowerCase().includes("delete");
  return async (filter, ...rest) => {
    if (!isDelete) {
      const change = rest[0] as Row | Row[];
      rest[0] = Array.isArray(change)
        ? change
        : name === "replaceOne"
          ? stampReplace(change as Row)
          : stampUpdate(change as Row);
    }
    return op(filter, ...rest);
  };
}

function guardCollection(
  raw: Collection<Document>,
  name: string,
): Collection<Document> {
  const stamped = !STAMP_FREE.has(name);
  const insert = (op: Op, many: boolean, tx: Transaction | undefined): Op =>
    tx ? insertRule(op, tx, many, stamped) : stamped ? stampingInsert(op, many) : op;
  const write = (op: Op, prop: string, tx: Transaction | undefined): Op =>
    tx ? writeRule(raw, prop, op, tx, stamped) : stamped ? stampingWrite(op, prop) : op;
  return new Proxy(raw, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      const op = (value as Op).bind(target);
      const tx = store.getStore();
      if (typeof prop !== "string") return op;
      if (FILTER_WRITES.has(prop)) return write(op, prop, tx);
      if (prop === "insertOne" || prop === "insertMany") {
        return insert(op, prop === "insertMany", tx);
      }
      if (!tx) return op;
      if (prop === "findOne") {
        return async (...args: unknown[]) => {
          const doc = (await op(...args)) as Row | null;
          if (doc) await readRule(target, [doc], tx);
          return doc;
        };
      }
      if (prop === "find") {
        return (...args: unknown[]) => {
          const cursor = op(...args) as { toArray: () => Promise<Row[]> };
          const toArray = cursor.toArray.bind(cursor);
          cursor.toArray = async () => {
            const rows = await toArray();
            await readRule(target, rows, tx);
            return rows;
          };
          return cursor;
        };
      }
      return op;
    },
  });
}

/**
 * Concurrency: timestamp ordering — the single enforcement point.
 * Rule: every collection handed out by `getDbSync()` applies the read, write and
 * insert rules while a request transaction is running; the collections in
 * `EXEMPT` (Better Auth state, logs, usage counters) are never guarded.
 * Use: the guarded writes also stamp `createdAt` on insert and `updatedAt` on
 * every insert, update and upsert; `STAMP_FREE` holds the Better Auth schema,
 * whose field names that library owns.
 */
export function guardDb(db: Db): Db {
  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop !== "collection") {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (name: string, ...rest: unknown[]) => {
        const raw = target.collection(name, ...(rest as []));
        return EXEMPT.has(name) ? raw : guardCollection(raw, name);
      };
    },
  });
}
