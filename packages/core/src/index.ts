// Platform wiring — each app injects its substrates once at startup.
export { createAdapterSlot, type AdapterSlot } from "./adapter";
export {
  getBase64Adapter,
  setBase64Adapter,
  type Base64Adapter,
} from "./base64";
export {
  getCryptoSupportInfo,
  isCryptoSupported,
  setPlatformAdapter,
  type CryptoSupportInfo,
  type PlatformAdapter,
} from "./platform";
export {
  clearProfile,
  deleteChunks,
  deleteEntryRecord,
  getEntry,
  getProfile,
  getStorageAdapter,
  listEntries,
  loadChunk,
  saveChunk,
  saveEntry,
  saveProfile,
  setStorageAdapter,
  wipeAllData,
  type StorageAdapter,
} from "./storage";

// Domain.
export * from "./types";
export * from "./crypto";
export {
  changePasscode,
  registerVault,
  resetVault,
  unlockWithPasscode,
  updateDisplayName,
  validatePasscode,
} from "./vault";
export {
  createMediaEntry,
  createTextEntry,
  getAllEntries,
  openDecryptedMediaStream,
  readTextEntry,
  removeEntry,
  updateEntryDetails,
  updateTextEntry,
} from "./journal";
export { AuthProvider, useAuth } from "./auth-context";
