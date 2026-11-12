import { setPlatformAdapter, setStorageAdapter } from "@dear-diary/core";
import { webPlatformAdapter } from "./platform.web";
import { webStorageAdapter } from "./storage.web";

let installed = false;

/**
 * Point the shared core at the browser's substrates. Must run before any core
 * call that touches storage — `App` does it during module evaluation, which is
 * before `AuthProvider`'s first effect.
 *
 * Base64 needs no injection here: core defaults to `btoa`/`atob`, which the
 * browser always has. The native app overrides it with `base64-js`.
 */
export function installWebAdapters(): void {
  if (installed) return;
  installed = true;
  setStorageAdapter(webStorageAdapter);
  setPlatformAdapter(webPlatformAdapter);
}
