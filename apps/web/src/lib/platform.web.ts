import type { CryptoSupportInfo, PlatformAdapter } from "@dear-diary/core";

export const webPlatformAdapter: PlatformAdapter = {
  getCryptoSupportInfo(): CryptoSupportInfo {
    const hasWindow = typeof window !== "undefined";
    const hasCrypto = typeof crypto !== "undefined";
    const hasSubtle = hasCrypto && !!crypto.subtle;
    const supported = hasWindow && hasCrypto && hasSubtle;
    const insecureContext = hasWindow && !window.isSecureContext;
    const localhostUrl =
      hasWindow && insecureContext
        ? `${window.location.protocol}//localhost${window.location.port ? `:${window.location.port}` : ""}${window.location.pathname}${window.location.search}`
        : null;

    return { supported, insecureContext, localhostUrl };
  },
};
