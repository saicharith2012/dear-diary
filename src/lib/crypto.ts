const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const CHUNK_PLAIN_SIZE = 64 * 1024; // 64 KiB plaintext per chunk
export const GCM_IV_BYTES = 12;
export const GCM_TAG_BYTES = 16;

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]!);
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
    "wrapKey",
    "unwrapKey",
  ]);
}

export async function importAesKey(
  raw: ArrayBuffer | Uint8Array,
  extractable = false,
): Promise<CryptoKey> {
  const material =
    raw instanceof Uint8Array ? bufferSource(raw) : raw;
  return crypto.subtle.importKey(
    "raw",
    material,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}

/** Default PBKDF2 iterations for passcode → wrapping key. */
export const PASSCODE_PBKDF2_ITERATIONS = 310_000;

/** Minimum passcode length (stored material is still offline-bruteforceable). */
export const MIN_PASSCODE_LENGTH = 6;

/** Derive an AES-GCM wrapping key from a user passcode via PBKDF2-SHA-256. */
export async function deriveKeyFromPasscode(
  passcode: string,
  salt: Uint8Array,
  iterations = PASSCODE_PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(passcode),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: bufferSource(salt),
      iterations,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

export async function wrapMasterKey(
  wrappingKey: CryptoKey,
  masterKey: CryptoKey,
): Promise<{ wrapped: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const wrapped = await crypto.subtle.wrapKey(
    "raw",
    masterKey,
    wrappingKey,
    { name: "AES-GCM", iv },
  );
  return { wrapped, iv };
}

export async function unwrapMasterKey(
  wrappingKey: CryptoKey,
  wrapped: ArrayBuffer | Uint8Array,
  iv: Uint8Array,
  options?: {
    /** Needed to re-wrap when changing the passcode. */
    extractable?: boolean;
  },
): Promise<CryptoKey> {
  const data =
    wrapped instanceof Uint8Array ? bufferSource(wrapped) : wrapped;
  const extractable = options?.extractable ?? false;
  return crypto.subtle.unwrapKey(
    "raw",
    data,
    wrappingKey,
    { name: "AES-GCM", iv: bufferSource(iv) },
    { name: "AES-GCM", length: 256 },
    extractable,
    extractable
      ? ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
      : ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(
  key: CryptoKey,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    bufferSource(plaintext),
  );
  const out = new Uint8Array(GCM_IV_BYTES + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), GCM_IV_BYTES);
  return out;
}

export async function decryptBytes(
  key: CryptoKey,
  payload: Uint8Array,
): Promise<Uint8Array> {
  if (payload.byteLength < GCM_IV_BYTES + GCM_TAG_BYTES) {
    throw new Error("Encrypted payload too short");
  }
  const iv = payload.subarray(0, GCM_IV_BYTES);
  const cipher = payload.subarray(GCM_IV_BYTES);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferSource(iv) },
    key,
    bufferSource(cipher),
  );
  return new Uint8Array(plain);
}

export async function encryptText(
  key: CryptoKey,
  text: string,
): Promise<Uint8Array> {
  return encryptBytes(key, textEncoder.encode(text));
}

export async function decryptText(
  key: CryptoKey,
  payload: Uint8Array,
): Promise<string> {
  const bytes = await decryptBytes(key, payload);
  return textDecoder.decode(bytes);
}

/**
 * Split plaintext into fixed-size chunks and encrypt each independently
 * so playback can decrypt and stream chunk-by-chunk.
 */
export async function encryptInChunks(
  key: CryptoKey,
  data: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array[]> {
  const total = Math.max(1, Math.ceil(data.byteLength / CHUNK_PLAIN_SIZE));
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < total; i++) {
    const start = i * CHUNK_PLAIN_SIZE;
    const slice = data.subarray(start, start + CHUNK_PLAIN_SIZE);
    chunks.push(await encryptBytes(key, slice));
    onProgress?.(i + 1, total);
  }
  return chunks;
}

export async function decryptChunk(
  key: CryptoKey,
  encryptedChunk: Uint8Array,
): Promise<Uint8Array> {
  return decryptBytes(key, encryptedChunk);
}

/** Async generator that decrypts stored chunks in order for streaming. */
export async function* decryptChunksStream(
  key: CryptoKey,
  loadChunk: (index: number) => Promise<Uint8Array>,
  chunkCount: number,
): AsyncGenerator<Uint8Array, void, unknown> {
  for (let i = 0; i < chunkCount; i++) {
    const enc = await loadChunk(i);
    yield await decryptChunk(key, enc);
  }
}

export function concatUint8(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export function randomSalt(bytes = 32): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(bytes));
}
