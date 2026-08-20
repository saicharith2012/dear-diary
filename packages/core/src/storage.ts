import { createAdapterSlot } from "./adapter";
import type { JournalEntryMeta, VaultProfile } from "./types";

/**
 * Everything the core needs from the device. The web app backs this with
 * IndexedDB; the native app with expo-sqlite (metadata) plus a single
 * append-only ciphertext file per entry (chunks).
 *
 * Chunk layout is identical on both platforms: `[12-byte IV][ciphertext+tag]`,
 * so `saveChunk`/`loadChunk` are index-addressed and format-agnostic.
 */
export interface StorageAdapter {
  getProfile(): Promise<VaultProfile | null>;
  saveProfile(profile: VaultProfile): Promise<void>;
  clearProfile(): Promise<void>;

  listEntries(): Promise<JournalEntryMeta[]>;
  getEntry(id: string): Promise<JournalEntryMeta | null>;
  saveEntry(entry: JournalEntryMeta): Promise<void>;
  deleteEntryRecord(id: string): Promise<void>;

  saveChunk(entryId: string, index: number, data: Uint8Array): Promise<void>;
  loadChunk(entryId: string, index: number): Promise<Uint8Array>;
  deleteChunks(entryId: string, chunkCount: number): Promise<void>;

  wipeAllData(): Promise<void>;
}

const slot = createAdapterSlot<StorageAdapter>("storage");

export function setStorageAdapter(adapter: StorageAdapter): void {
  slot.set(adapter);
}

export function getStorageAdapter(): StorageAdapter {
  return slot.get();
}

// Module-level accessors so `journal.ts` and `vault.ts` read exactly as they
// did before extraction and never learn which platform they are running on.

export function getProfile(): Promise<VaultProfile | null> {
  return slot.get().getProfile();
}

export function saveProfile(profile: VaultProfile): Promise<void> {
  return slot.get().saveProfile(profile);
}

export function clearProfile(): Promise<void> {
  return slot.get().clearProfile();
}

export function listEntries(): Promise<JournalEntryMeta[]> {
  return slot.get().listEntries();
}

export function getEntry(id: string): Promise<JournalEntryMeta | null> {
  return slot.get().getEntry(id);
}

export function saveEntry(entry: JournalEntryMeta): Promise<void> {
  return slot.get().saveEntry(entry);
}

export function deleteEntryRecord(id: string): Promise<void> {
  return slot.get().deleteEntryRecord(id);
}

export function saveChunk(
  entryId: string,
  index: number,
  data: Uint8Array,
): Promise<void> {
  return slot.get().saveChunk(entryId, index, data);
}

export function loadChunk(entryId: string, index: number): Promise<Uint8Array> {
  return slot.get().loadChunk(entryId, index);
}

export function deleteChunks(
  entryId: string,
  chunkCount: number,
): Promise<void> {
  return slot.get().deleteChunks(entryId, chunkCount);
}

export function wipeAllData(): Promise<void> {
  return slot.get().wipeAllData();
}
