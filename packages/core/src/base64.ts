import { createAdapterSlot } from "./adapter";

export interface Base64Adapter {
  encode(bytes: Uint8Array): string;
  decode(b64: string): Uint8Array;
}

/**
 * `btoa`/`atob` exist in every browser and in Node 16+, so the web app gets a
 * working default with no wiring. Hermes has neither, so the native app
 * injects a `base64-js` implementation before core is used.
 */
const webBase64: Base64Adapter = {
  encode(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  },
  decode(b64) {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  },
};

const slot = createAdapterSlot<Base64Adapter>(
  "base64",
  typeof btoa === "function" && typeof atob === "function"
    ? webBase64
    : undefined,
);

export function setBase64Adapter(adapter: Base64Adapter): void {
  slot.set(adapter);
}

export function getBase64Adapter(): Base64Adapter {
  return slot.get();
}
