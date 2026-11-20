/**
 * The smallest Mongo stand-in the route tests need: the filter operators the
 * models and services actually use, plus the cursor methods they chain.
 */
import { isDeepStrictEqual } from "node:util";
import { ObjectId } from "mongodb";

export type Row = Record<string, unknown>;

function clone<T>(value: T): T {
  if (value instanceof ObjectId) return new ObjectId(value.toHexString()) as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(item => clone(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  }
  return value;
}

function project(row: Row, projection?: Row): Row {
  if (!projection) return clone(row);
  const inclusions = Object.entries(projection).filter(([key, value]) => key !== "_id" && Boolean(value));
  const result: Row = inclusions.length ? {} : clone(row);
  if (inclusions.length && projection._id !== 0 && row._id !== undefined) result._id = clone(row._id);
  for (const [path] of inclusions) {
    const value = getPath(row, path);
    if (value !== undefined) setPath(result, path, clone(value));
  }
  for (const [path, value] of Object.entries(projection)) {
    if (!value) unsetPath(result, path);
  }
  return result;
}

function getPath(value: unknown, path: string): unknown {
  if (!path) return value;
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const found = getPath(item, path);
      return Array.isArray(found) ? found : [found];
    });
  }
  const [head, ...tail] = path.split(".");
  return value && typeof value === "object"
    ? getPath((value as Row)[head], tail.join("."))
    : undefined;
}

const asTime = (value: unknown): number =>
  typeof value === "number"
    ? value
    : value instanceof Date
      ? value.getTime()
      : new Date(String(value)).getTime();

function matchesValue(rowValue: unknown, filterValue: unknown): boolean {
  // Mongo matches a missing field against `null`, and so must the stand-in.
  if (filterValue === null) return rowValue === null || rowValue === undefined;
  if (
    filterValue &&
    typeof filterValue === "object" &&
    !Array.isArray(filterValue)
  ) {
    const operator = filterValue as Record<string, unknown>;
    const conditions = Object.keys(operator).filter((key) => key.startsWith("$") && key !== "$options");
    if (conditions.length > 1) {
      return conditions.every((key) => matchesValue(rowValue, {
        [key]: operator[key],
        ...(key === "$regex" && operator.$options ? { $options: operator.$options } : {}),
      }));
    }
    if ("$elemMatch" in operator) {
      return (
        Array.isArray(rowValue) &&
        rowValue.some((item) =>
          matches(item as Row, operator.$elemMatch as Row),
        )
      );
    }
    if ("$size" in operator)
      return Array.isArray(rowValue) && rowValue.length === operator.$size;
    if (Array.isArray(operator.$in)) {
      return operator.$in.some((value) => matchesValue(rowValue, value));
    }
    if (Array.isArray(operator.$nin)) {
      return !operator.$nin.some((value) => matchesValue(rowValue, value));
    }
    if ("$exists" in operator) {
      return operator.$exists ? rowValue !== undefined : rowValue === undefined;
    }
    if ("$ne" in operator) return !matchesValue(rowValue, operator.$ne);
    if ("$eq" in operator) return matchesValue(rowValue, operator.$eq);
    // Timestamp ordering filters stamps with `$not: { $gt: ts }`, which must
    // match a missing stamp the way Mongo does.
    if ("$not" in operator) return !matchesValue(rowValue, operator.$not);
    if ("$gt" in operator) return asTime(rowValue) > asTime(operator.$gt);
    if ("$gte" in operator) return asTime(rowValue) >= asTime(operator.$gte);
    if ("$lt" in operator) return asTime(rowValue) < asTime(operator.$lt);
    if ("$lte" in operator) return asTime(rowValue) <= asTime(operator.$lte);
    if ("$regex" in operator) {
      const options =
        typeof operator.$options === "string" ? operator.$options : undefined;
      return new RegExp(String(operator.$regex), options).test(
        String(rowValue ?? ""),
      );
    }
  }
  if (Array.isArray(filterValue)) return isDeepStrictEqual(rowValue, filterValue);
  if (Array.isArray(rowValue)) {
    return rowValue.some((value) => matchesValue(value, filterValue));
  }
  if (filterValue && typeof filterValue === "object") {
    return isDeepStrictEqual(rowValue, filterValue);
  }
  return String(rowValue) === String(filterValue);
}

function matches(row: Row, filter?: Row): boolean {
  return Object.entries(filter ?? {}).every(([key, value]) => {
    if (key === "$or") {
      return (value as Row[]).some((alternative) => matches(row, alternative));
    }
    if (key === "$and") {
      return (value as Row[]).every((alternative) => matches(row, alternative));
    }
    return matchesValue(getPath(row, key), value);
  });
}

function cursor(found: Row[]) {
  const state = { rows: found };
  const api = {
    sort(spec: Row) {
      const entries = Object.entries(spec);
      state.rows = [...state.rows].sort((a, b) => {
        for (const [key, direction] of entries) {
          const left = a[key];
          const right = b[key];
          const cmp =
            left instanceof Date && right instanceof Date
              ? left.getTime() - right.getTime()
              : String(left).localeCompare(String(right), undefined, {
                  numeric: true,
                });
          if (cmp !== 0) return Number(direction) < 0 ? -cmp : cmp;
        }
        return 0;
      });
      return api;
    },
    project(projection: Row) {
      state.rows = state.rows.map(row => project(row, projection));
      return api;
    },
    skip(n: number) {
      state.rows = state.rows.slice(n);
      return api;
    },
    limit(n: number) {
      state.rows = state.rows.slice(0, n);
      return api;
    },
    async toArray() {
      return state.rows;
    },
  };
  return api;
}

function setPath(row: Row, path: string, value: unknown): void {
  const parts = path.split(".");
  let target = row;
  for (const part of parts.slice(0, -1)) {
    const next = target[part];
    if (!next || typeof next !== "object") target[part] = {};
    target = target[part] as Row;
  }
  target[parts[parts.length - 1]] = value;
}

function unsetPath(row: Row, path: string): void {
  const parts = path.split(".");
  let target = row;
  for (const part of parts.slice(0, -1)) {
    const next = target[part];
    if (!next || typeof next !== "object") return;
    target = next as Row;
  }
  delete target[parts[parts.length - 1]];
}

function evaluate(expr: unknown, row: Row, vars: Row = {}): unknown {
  if (typeof expr === "string" && expr.startsWith("$$")) {
    const [name, field] = expr.slice(2).split(".");
    return field ? (vars[name] as Row)?.[field] : vars[name];
  }
  if (typeof expr === "string" && expr.startsWith("$")) return getPath(row, expr.slice(1));
  if (expr === null || typeof expr !== "object" || expr instanceof Date) return expr;
  if (Array.isArray(expr)) return expr.map((value) => evaluate(value, row, vars));
  const [[op, arg]] = Object.entries(expr);
  if (op === "$literal") return arg;
  const values = () => (arg as unknown[]).map((value) => evaluate(value, row, vars));
  switch (op) {
    case "$ifNull": {
      const [a, b] = values();
      return a ?? b;
    }
    case "$concatArrays":
      return values().flat();
    case "$filter": {
      const { input, as, cond } = arg as { input: unknown; as: string; cond: unknown };
      return (evaluate(input, row, vars) as unknown[]).filter((value) =>
        evaluate(cond, row, { ...vars, [as]: value }),
      );
    }
    case "$map": {
      const { input, as, in: expression } = arg as { input: unknown; as: string; in: unknown };
      return (evaluate(input, row, vars) as unknown[]).map((value) =>
        evaluate(expression, row, { ...vars, [as]: value }),
      );
    }
    case "$cond": {
      const [condition, yes, no] = arg as unknown[];
      return evaluate(evaluate(condition, row, vars) ? yes : no, row, vars);
    }
    case "$eq": {
      const [a, b] = values();
      return isDeepStrictEqual(a, b);
    }
    case "$not":
      return !values()[0];
    case "$and":
      return values().every(Boolean);
    case "$or":
      return values().some(Boolean);
    case "$slice": {
      const [items, count] = values() as [unknown[], number];
      return count < 0 ? items.slice(count) : items.slice(0, count);
    }
    case "$gt": {
      const [a, b] = values();
      return asTime(a) > asTime(b);
    }
    case "$ne": {
      const [a, b] = values();
      return a !== b;
    }
    default:
      throw new Error(`Unsupported update pipeline expression: ${op}`);
  }
}

function applyUpdate(row: Row, update: Row | Row[]): void {
  if (Array.isArray(update)) {
    for (const stage of update) {
      const before = { ...row };
      for (const [path, expr] of Object.entries(stage.$set as Row)) {
        setPath(row, path, evaluate(expr, before));
      }
    }
    return;
  }
  for (const [path, value] of Object.entries((update.$set ?? {}) as Row)) {
    setPath(row, path, value);
  }
  for (const path of Object.keys((update.$unset ?? {}) as Row)) {
    unsetPath(row, path);
  }
  for (const [path, value] of Object.entries((update.$inc ?? {}) as Row)) {
    setPath(row, path, Number(row[path] ?? 0) + Number(value));
  }
  for (const [path, value] of Object.entries((update.$pull ?? {}) as Row)) {
    const current = getPath(row, path);
    if (Array.isArray(current)) {
      setPath(row, path, current.filter(item => value && typeof value === "object" && item && typeof item === "object"
        ? !matches(item as Row, value as Row) : !matchesValue(item, value)));
    }
  }
  for (const [path, value] of Object.entries((update.$max ?? {}) as Row)) {
    setPath(row, path, Math.max(Number(row[path] ?? -Infinity), Number(value)));
  }
}

export function fakeDb(seed: Record<string, Row[]>) {
  const store: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([key, rows]) => [
      key,
      rows.map((row) => ({ ...row })),
    ]),
  );

  const db = {
    collection(name: string) {
      const rows = (store[name] ??= []);
      const match = (filter?: Row) =>
        rows.filter((row) => matches(row, filter));

      return {
        // Reads hand back copies, like the driver: a handler that mutates a
        // fetched doc must not mutate the stored one.
        find: (filter?: Row) =>
          cursor(match(filter).map((row) => clone(row))),
        findOne: async (filter?: Row, options?: { projection?: Row }) => {
          const row = match(filter)[0];
          return row ? project(row, options?.projection) : null;
        },
        countDocuments: async (filter?: Row) => match(filter).length,
        findOneAndUpdate: async (filter: Row, update: Row | Row[]) => {
          const row = match(filter)[0];
          if (!row) return null;
          applyUpdate(row, update);
          return clone(row);
        },
        insertOne: async (doc: Row) => {
          if (rows.some((row) => row._id === doc._id))
            throw Object.assign(new Error("Duplicate _id"), { code: 11000 });
          rows.push({ ...doc });
          return { insertedId: doc._id };
        },
        insertMany: async (docs: Row[]) => {
          for (const doc of docs) rows.push({ ...doc });
          return { insertedCount: docs.length };
        },
        updateOne: async (filter: Row, update: Row, options?: Row) => {
          const row = match(filter)[0];
          if (!row) {
            if (options?.upsert) {
              const created: Row = {};
              for (const [path, value] of Object.entries(filter)) {
                if (!path.startsWith("$") && (value === null || typeof value !== "object")) {
                  setPath(created, path, value);
                }
              }
              Object.assign(created, update.$setOnInsert ?? {});
              applyUpdate(created, update);
              rows.push(created);
              return { matchedCount: 0, upsertedCount: 1 };
            }
            return { matchedCount: 0 };
          }
          applyUpdate(row, update);
          return { matchedCount: 1 };
        },
        replaceOne: async (filter: Row, doc: Row, options?: Row) => {
          const index = rows.findIndex((row) => match(filter).includes(row));
          const next: Row = {
            ...(filter._id ? { _id: filter._id } : {}),
            ...doc,
          };
          if (index >= 0) rows[index] = { ...next, _id: rows[index]._id };
          else if (options?.upsert) rows.push(next);
          return { matchedCount: index >= 0 ? 1 : 0 };
        },
        updateMany: async (filter: Row, update: Row) => {
          const found = match(filter);
          for (const row of found) applyUpdate(row, update);
          return { matchedCount: found.length, modifiedCount: found.length };
        },
        deleteOne: async (filter: Row) => {
          const index = rows.findIndex((row) => match(filter).includes(row));
          if (index >= 0) rows.splice(index, 1);
          return { deletedCount: index >= 0 ? 1 : 0 };
        },
        deleteMany: async (filter: Row) => {
          const found = match(filter);
          for (const row of found) rows.splice(rows.indexOf(row), 1);
          return { deletedCount: found.length };
        },
      };
    },
  };

  return { db, store };
}
