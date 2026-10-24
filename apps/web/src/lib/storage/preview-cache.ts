type PreviewKind = "blob" | "fallback";

type PreviewRecord = {
  id: string;
  type: PreviewKind;
  mime: string | null;
  blob: Blob | null;
  url: string | null;
  size: number;
  createdAt: number;
};

const DB_NAME = "erpsys-preview-cache";
const STORE = "previews";
const VERSION = 1;
const MAX_BYTES = 64 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("open failed"));
  });
}

function reqPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

export type CachedPreview =
  | { kind: "blob"; blob: Blob; mime: string | null }
  | { kind: "fallback"; url: string };

export async function getCachedPreview(
  id: string,
): Promise<CachedPreview | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const rec = (await reqPromise(store.get(id))) as PreviewRecord | undefined;
    db.close();
    if (!rec) return null;
    if (rec.type === "blob" && rec.blob) {
      return { kind: "blob", blob: rec.blob, mime: rec.mime };
    }
    if (rec.type === "fallback" && rec.url) {
      return { kind: "fallback", url: rec.url };
    }
    return null;
  } catch {
    return null;
  }
}

async function putRecord(rec: PreviewRecord): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await evictIfNeeded(db, rec.size);
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    await txDone(tx);
    db.close();
  } catch {
    // Quota/existence failures are non-fatal; preview still works without cache.
  }
}

async function evictIfNeeded(db: IDBDatabase, incoming: number): Promise<void> {
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const all = (await reqPromise(store.getAll())) as PreviewRecord[];
  let total = all.reduce((n, r) => n + (r.size || 0), 0);
  if (total + incoming <= MAX_BYTES) {
    await txDone(tx);
    return;
  }
  const ordered = all.slice().sort((a, b) => a.createdAt - b.createdAt);
  for (const rec of ordered) {
    if (total + incoming <= MAX_BYTES) break;
    store.delete(rec.id);
    total -= rec.size || 0;
  }
  await txDone(tx);
}

export async function cachePreviewBlob(id: string, blob: Blob): Promise<void> {
  const rec: PreviewRecord = {
    id,
    type: "blob",
    mime: blob.type || null,
    blob,
    url: null,
    size: blob.size,
    createdAt: Date.now(),
  };
  await putRecord(rec);
}

export async function cachePreviewFallback(
  id: string,
  url: string,
): Promise<void> {
  const rec: PreviewRecord = {
    id,
    type: "fallback",
    mime: null,
    blob: null,
    url,
    size: url.length * 2,
    createdAt: Date.now(),
  };
  await putRecord(rec);
}

export async function deleteCachedPreview(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
    db.close();
  } catch {
    // Ignore; stale entries are harmless.
  }
}
