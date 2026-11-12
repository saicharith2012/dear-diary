import { createAdapterSlot } from "./adapter";

export type CryptoSupportInfo = {
  supported: boolean;
  /** True when the page is HTTP on a non-localhost host (LAN IP, etc.). */
  insecureContext: boolean;
  localhostUrl: string | null;
};

export interface PlatformAdapter {
  /**
   * Whether SubtleCrypto is usable here, and — on the web only — whether the
   * page is being served from an insecure origin, which is the usual reason
   * it is not.
   */
  getCryptoSupportInfo(): CryptoSupportInfo;
}

/**
 * Native default: react-native-quick-crypto installs a real `crypto.subtle`,
 * and "secure context" has no meaning outside a browser.
 */
const defaultPlatform: PlatformAdapter = {
  getCryptoSupportInfo() {
    return {
      supported: typeof crypto !== "undefined" && !!crypto.subtle,
      insecureContext: false,
      localhostUrl: null,
    };
  },
};

const slot = createAdapterSlot<PlatformAdapter>("platform", defaultPlatform);

export function setPlatformAdapter(adapter: PlatformAdapter): void {
  slot.set(adapter);
}

export function getCryptoSupportInfo(): CryptoSupportInfo {
  return slot.get().getCryptoSupportInfo();
}

export function isCryptoSupported(): boolean {
  return getCryptoSupportInfo().supported;
}
