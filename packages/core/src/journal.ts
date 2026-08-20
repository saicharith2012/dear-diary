import {
  decryptChunksStream,
  decryptText,
  encodeUtf8,
  encryptInChunks,
  encryptText,
} from "./crypto";
import {
  deleteChunks,
  deleteEntryRecord,
  getEntry,
  listEntries,
  loadChunk,
  saveChunk,
  saveEntry,
} from "./storage";
import type { EntryType, JournalEntryMeta } from "./types";

function newId(): string {
  return crypto.randomUUID();
}

export async function getAllEntries(): Promise<JournalEntryMeta[]> {
  return listEntries();
}

export async function createTextEntry(
  key: CryptoKey,
  title: string,
  body: string,
): Promise<JournalEntryMeta> {
  const encrypted = await encryptText(key, body);
  const id = newId();
  const now = Date.now();
  await saveChunk(id, 0, encrypted);
  const entry: JournalEntryMeta = {
    id,
    type: "text",
    title: title.trim() || "Untitled note",
    createdAt: now,
    updatedAt: now,
    plainSize: encodeUtf8(body).byteLength,
    chunkCount: 1,
    mimeType: "text/plain",
  };
  await saveEntry(entry);
  return entry;
}

export async function readTextEntry(
  key: CryptoKey,
  entryId: string,
): Promise<string> {
  const entry = await getEntry(entryId);
  if (!entry || entry.type !== "text") throw new Error("Text entry not found");
  const enc = await loadChunk(entryId, 0);
  return decryptText(key, enc);
}

export async function createMediaEntry(
  key: CryptoKey,
  opts: {
    type: Extract<EntryType, "audio" | "video">;
    title: string;
    blob: Blob;
    durationMs?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<JournalEntryMeta> {
  const buffer = new Uint8Array(await opts.blob.arrayBuffer());
  const chunks = await encryptInChunks(key, buffer, opts.onProgress);
  const id = newId();
  const now = Date.now();

  for (let i = 0; i < chunks.length; i++) {
    await saveChunk(id, i, chunks[i]!);
  }

  const entry: JournalEntryMeta = {
    id,
    type: opts.type,
    title:
      opts.title.trim() || (opts.type === "audio" ? "Voice note" : "Video note"),
    createdAt: now,
    updatedAt: now,
    plainSize: buffer.byteLength,
    chunkCount: chunks.length,
    mimeType:
      opts.blob.type || (opts.type === "audio" ? "audio/webm" : "video/webm"),
    durationMs: opts.durationMs,
  };
  await saveEntry(entry);
  return entry;
}

/**
 * Decrypt media chunk-by-chunk into a ReadableStream so callers can
 * stream-assemble a Blob (or pipe elsewhere) without loading ciphertext wholly first.
 */
export function openDecryptedMediaStream(
  key: CryptoKey,
  entry: JournalEntryMeta,
): ReadableStream<Uint8Array> {
  const gen = decryptChunksStream(
    key,
    (index) => loadChunk(entry.id, index),
    entry.chunkCount,
  );

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await gen.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel() {
      void gen.return?.(undefined);
    },
  });
}

export async function removeEntry(entry: JournalEntryMeta): Promise<void> {
  await deleteChunks(entry.id, entry.chunkCount);
  await deleteEntryRecord(entry.id);
}
