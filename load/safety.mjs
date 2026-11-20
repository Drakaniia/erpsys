import { ConfigError } from "./config.mjs";

export function assertDisposableDatabase(config) {
  let url;
  try { url = new URL(config.databaseUrl); } catch { throw new ConfigError(["Invalid load database URL."]); }
  const name = url.pathname.slice(1);
  if (config.nodeEnv === "production" || !/^erpsys_load_[a-zA-Z0-9_]+$/.test(name) || config.disposableDatabase !== name || !["mongodb:", "mongodb+srv:"].includes(url.protocol)) {
    throw new ConfigError(["Load seeding requires a dedicated erpsys_load_<run> database and LOAD_DISPOSABLE_DATABASE set to its exact name; production is forbidden."]);
  }
  const origin = new URL(config.baseUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) || origin.protocol !== "http:") {
    throw new ConfigError(["Load traffic is restricted to a local HTTP test server connected to the disposable database."]);
  }
  return name;
}

export async function assertEmptyDatabase(db, config) {
  const name = assertDisposableDatabase(config);
  if (db.databaseName !== name) throw new ConfigError(["Connected database does not match the confirmed disposable database."]);
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  for (const { name: collection } of collections) {
    if (await db.collection(collection).findOne({})) {
      throw new ConfigError(["Disposable load database must be empty before seeding. Use a fresh database for each run."]);
    }
  }
}
