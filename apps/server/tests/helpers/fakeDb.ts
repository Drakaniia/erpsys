/**
 * The smallest Mongo stand-in the route tests need: the filter operators the
 * models and services actually use, plus the cursor methods they chain.
 */
export type Row = Record<string, unknown>;

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
    if (Array.isArray(operator.$in)) {
      return operator.$in.some((value) => String(value) === String(rowValue));
    }
    if (Array.isArray(operator.$nin)) {
      return !operator.$nin.some((value) => String(value) === String(rowValue));
    }
    if ("$exists" in operator) {
      return operator.$exists ? rowValue !== undefined : rowValue === undefined;
    }
    if ("$ne" in operator) return String(operator.$ne) !== String(rowValue);
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
    return matchesValue(row[key], value);
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
    project() {
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

function applyUpdate(row: Row, update: Row): void {
  for (const [path, value] of Object.entries((update.$set ?? {}) as Row)) {
    setPath(row, path, value);
  }
  for (const path of Object.keys((update.$unset ?? {}) as Row)) {
    unsetPath(row, path);
  }
  for (const [path, value] of Object.entries((update.$inc ?? {}) as Row)) {
    setPath(row, path, Number(row[path] ?? 0) + Number(value));
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
          cursor(match(filter).map((row) => ({ ...row }))),
        findOne: async (filter?: Row) => {
          const row = match(filter)[0];
          return row ? { ...row } : null;
        },
        countDocuments: async (filter?: Row) => match(filter).length,
        findOneAndUpdate: async (filter: Row, update: Row) => {
          const row = match(filter)[0];
          if (!row) return null;
          applyUpdate(row, update);
          return { ...row };
        },
        insertOne: async (doc: Row) => {
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
              const created: Row = { ...(update.$setOnInsert ?? {}) };
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
          const next: Row = { ...(filter._id ? { _id: filter._id } : {}), ...doc };
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
