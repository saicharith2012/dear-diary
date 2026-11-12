export type EntryType = "text" | "audio" | "video";

/** How the day felt, from best to worst. Optional on every entry. */
export type Mood = "great" | "good" | "okay" | "low" | "rough";

export const MOODS: readonly Mood[] = ["great", "good", "okay", "low", "rough"];

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
  /** Starred by the user. Absent on entries saved before starring existed. */
  favorite?: boolean;
  mood?: Mood;
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
