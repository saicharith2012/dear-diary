export type EntryType = "text" | "audio" | "video";

export interface JournalEntryMeta {
  id: string;
  type: EntryType;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Plaintext byte length before encryption (media / text utf-8). */
  plainSize: number;
  chunkCount: number;
  mimeType?: string;
  durationMs?: number;
}

export interface VaultProfile {
  displayName: string;
  createdAt: number;
  /** PBKDF2 salt (base64). */
  passcodeSalt: string;
  /** PBKDF2 iteration count used when wrapping the master key. */
  passcodeIterations: number;
  /** Wrapped master key (base64). */
  wrappedMasterKey: string;
  wrapIv: string;
}

export type AuthStatus =
  | "loading"
  | "unregistered"
  | "locked"
  | "unlocked"
  | "unsupported";
