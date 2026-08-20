import type {
  JournalEntryMeta,
  StorageAdapter,
  VaultProfile,
} from "@dear-diary/core";

const DB_NAME = "dear-diary";
const DB_VERSION = 1;

type StoreName = "profile" | "entries" | "chunks" | "keys";

/**
 * `keys` is unused by the app but stays in the schema: dropping it would need a
 * DB_VERSION bump, and existing vaults would gain nothing from the migration.
 */
const ALL_STORES: StoreName[] = ["profile", "entries", "chunks", "keys"];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("profile")) {
        db.createObjectStore("profile");
      }
      if (!db.objectStoreNames.contains("entries")) {
        const store = db.createObjectStore("entries", { keyPath: "id" });
        store.createIndex("byCreated", "createdAt");
      }
      if (!db.objectStoreNames.contains("chunks")) {
        // key: `${entryId}:${index}`
        db.createObjectStore("chunks");
      }
      if (!db.objectStoreNames.contains("keys")) {
        db.createObjectStore("keys");
      }
    };
    req.onsuccess = () => resolve(req.result);
  }).catch((err) => {
    // Let the next call retry instead of caching a rejected promise forever.
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

async function idbGet<T>(
  storeName: StoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(
  storeName: StoreName,
  value: unknown,
  key?: IDBValidKey,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    if (key !== undefined) store.put(value, key);
    else store.put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(
  storeName: StoreName,
  key: IDBValidKey,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

const PROFILE_KEY = "vault";

function chunkKey(entryId: string, index: number): string {
  return `${entryId}:${index}`;
}

export const webStorageAdapter: StorageAdapter = {
  async getProfile(): Promise<VaultProfile | null> {
    const profile = await idbGet<VaultProfile>("profile", PROFILE_KEY);
    return profile ?? null;
  },

  async saveProfile(profile: VaultProfile): Promise<void> {
    await idbPut("profile", profile, PROFILE_KEY);
  },

  async clearProfile(): Promise<void> {
    await idbDelete("profile", PROFILE_KEY);
  },

  async listEntries(): Promise<JournalEntryMeta[]> {
    const entries = await idbGetAll<JournalEntryMeta>("entries");
    return entries.sort((a, b) => b.createdAt - a.createdAt);
  },

  async getEntry(id: string): Promise<JournalEntryMeta | null> {
    return (await idbGet<JournalEntryMeta>("entries", id)) ?? null;
  },

  async saveEntry(entry: JournalEntryMeta): Promise<void> {
    await idbPut("entries", entry);
  },

  async deleteEntryRecord(id: string): Promise<void> {
    await idbDelete("entries", id);
  },

  async saveChunk(
    entryId: string,
    index: number,
    data: Uint8Array,
  ): Promise<void> {
    // Store a copy so the ArrayBuffer is detached-safe
    const copy = data.slice();
    await idbPut("chunks", copy, chunkKey(entryId, index));
  },

  async loadChunk(entryId: string, index: number): Promise<Uint8Array> {
    const data = await idbGet<Uint8Array>("chunks", chunkKey(entryId, index));
    if (!data) throw new Error(`Missing chunk ${entryId}:${index}`);
    return data instanceof Uint8Array
      ? data
      : new Uint8Array(data as ArrayBuffer);
  },

  async deleteChunks(entryId: string, chunkCount: number): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("chunks", "readwrite");
      const store = tx.objectStore("chunks");
      for (let i = 0; i < chunkCount; i++) {
        store.delete(chunkKey(entryId, i));
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async wipeAllData(): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ALL_STORES, "readwrite");
      for (const name of ALL_STORES) {
        tx.objectStore(name).clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
