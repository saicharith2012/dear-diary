import {
  getProfile,
  listEntries,
  loadChunk,
  saveChunk,
  saveEntry,
  saveProfile,
  wipeAllData,
  type JournalEntryMeta,
  type VaultProfile,
} from "@dear-diary/core";

/**
 * Backup file layout (everything stays encrypted exactly as stored):
 *
 *   "DDBKUP01"                      8 bytes magic
 *   u32 BE header length
 *   header JSON (utf-8)             { version, exportedAt, profile, entries }
 *   for each entry, for each chunk: u32 BE length, then the stored chunk
 *
 * The file is useless without the passcode: the profile only holds the
 * PBKDF2 salt and the wrapped master key.
 */
const MAGIC = "DDBKUP01";
const MAX_HEADER_BYTES = 32 * 1024 * 1024;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

type BackupHeader = {
  version: 1;
  exportedAt: number;
  profile: VaultProfile;
  entries: JournalEntryMeta[];
};

export type BackupSummary = { entryCount: number; exportedAt: number };

function u32(n: number): ArrayBuffer {
  const out = new ArrayBuffer(4);
  new DataView(out).setUint32(0, n, false);
  return out;
}

/** A standalone copy of exactly these bytes, as a BlobPart. */
function part(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function totalChunks(entries: JournalEntryMeta[]): number {
  return entries.reduce((n, e) => n + e.chunkCount, 0);
}

export async function createBackup(
  onProgress?: (ratio: number) => void,
): Promise<{ blob: Blob; fileName: string; entryCount: number }> {
  const profile = await getProfile();
  if (!profile) throw new Error("There is no vault to back up.");
  const entries = await listEntries();

  const header: BackupHeader = {
    version: 1,
    exportedAt: Date.now(),
    profile,
    entries,
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const parts: BlobPart[] = [
    part(new TextEncoder().encode(MAGIC)),
    u32(headerBytes.byteLength),
    part(headerBytes),
  ];

  const total = Math.max(1, totalChunks(entries));
  let done = 0;
  // Fold chunks into intermediate Blobs so the browser can spill a large
  // vault to disk instead of holding every chunk on the JS heap.
  let pending: BlobPart[] = [];
  for (const entry of entries) {
    for (let i = 0; i < entry.chunkCount; i++) {
      const chunk = await loadChunk(entry.id, i);
      pending.push(u32(chunk.byteLength), part(chunk));
      done++;
      if (pending.length >= 128) {
        parts.push(new Blob(pending));
        pending = [];
      }
      onProgress?.(done / total);
    }
  }
  if (pending.length) parts.push(new Blob(pending));

  const stamp = new Date(header.exportedAt).toISOString().slice(0, 10);
  return {
    blob: new Blob(parts, { type: "application/octet-stream" }),
    fileName: `dear-diary-backup-${stamp}.ddbackup`,
    entryCount: entries.length,
  };
}

async function readBytes(file: Blob, start: number, length: number): Promise<Uint8Array> {
  if (start + length > file.size) {
    throw new Error("The backup file is incomplete or damaged.");
  }
  return new Uint8Array(await file.slice(start, start + length).arrayBuffer());
}

function isProfile(p: unknown): p is VaultProfile {
  const v = p as VaultProfile | null;
  return (
    !!v &&
    typeof v.displayName === "string" &&
    typeof v.passcodeSalt === "string" &&
    typeof v.wrappedMasterKey === "string" &&
    typeof v.wrapIv === "string" &&
    typeof v.passcodeIterations === "number"
  );
}

function isEntry(e: unknown): e is JournalEntryMeta {
  const v = e as JournalEntryMeta | null;
  return (
    !!v &&
    typeof v.id === "string" &&
    v.id.length > 0 &&
    (v.type === "text" || v.type === "audio" || v.type === "video") &&
    typeof v.title === "string" &&
    typeof v.createdAt === "number" &&
    Number.isInteger(v.chunkCount) &&
    v.chunkCount >= 0
  );
}

/**
 * Restore a backup into an EMPTY device vault. Refuses to run if a vault
 * already exists, so it can never overwrite entries. The profile is written
 * last: if anything fails midway the partial data is wiped and the device is
 * left without a vault, exactly as it started.
 */
export async function restoreBackup(
  file: Blob,
  onProgress?: (ratio: number) => void,
): Promise<BackupSummary> {
  const notABackup = new Error("That file is not a Dear Diary backup.");
  if (file.size < MAGIC.length + 4) throw notABackup;
  const magic = new TextDecoder().decode(await readBytes(file, 0, MAGIC.length));
  if (magic !== MAGIC) throw notABackup;

  let offset = MAGIC.length;
  const headerLength = new DataView(
    (await readBytes(file, offset, 4)).buffer,
  ).getUint32(0, false);
  offset += 4;
  if (headerLength === 0 || headerLength > MAX_HEADER_BYTES) throw notABackup;

  let header: BackupHeader;
  try {
    header = JSON.parse(
      new TextDecoder().decode(await readBytes(file, offset, headerLength)),
    ) as BackupHeader;
  } catch {
    throw notABackup;
  }
  offset += headerLength;

  if (header.version !== 1) {
    throw new Error("This backup was made by a newer version of Dear Diary.");
  }
  if (
    !isProfile(header.profile) ||
    !Array.isArray(header.entries) ||
    !header.entries.every(isEntry)
  ) {
    throw notABackup;
  }

  if (await getProfile()) {
    throw new Error("This device already has a vault. Reset it before restoring.");
  }

  const total = Math.max(1, totalChunks(header.entries));
  let done = 0;
  try {
    // Clear any orphaned chunks left behind by an earlier failed attempt.
    await wipeAllData();
    for (const entry of header.entries) {
      for (let i = 0; i < entry.chunkCount; i++) {
        const length = new DataView(
          (await readBytes(file, offset, 4)).buffer,
        ).getUint32(0, false);
        offset += 4;
        if (length === 0 || length > MAX_CHUNK_BYTES) {
          throw new Error("The backup file is incomplete or damaged.");
        }
        await saveChunk(entry.id, i, await readBytes(file, offset, length));
        offset += length;
        done++;
        onProgress?.(done / total);
      }
      await saveEntry(entry);
    }
    if (offset !== file.size) {
      throw new Error("The backup file is incomplete or damaged.");
    }
    await saveProfile(header.profile);
  } catch (err) {
    await wipeAllData().catch(() => {});
    throw err;
  }

  return { entryCount: header.entries.length, exportedAt: header.exportedAt };
}
