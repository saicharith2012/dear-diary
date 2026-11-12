"use client";

import { useEffect } from "react";

const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
  // Media events do not bubble, but they do reach a capturing listener, so a
  // long recording that is simply playing counts as activity.
  "timeupdate",
] as const;

/**
 * Lock after `minutes` without interaction. Uses a wall-clock deadline rather
 * than one long timer so a laptop that slept past the deadline locks as soon
 * as it wakes. `paused` holds the lock off (recording, saving).
 */
export function useAutoLock(
  minutes: number,
  paused: boolean,
  onLock: () => void,
): void {
  useEffect(() => {
    if (!minutes || paused) return;
    const timeoutMs = minutes * 60_000;
    let deadline = Date.now() + timeoutMs;
    let lastBump = 0;

    function bump() {
      const now = Date.now();
      if (now - lastBump < 1000) return;
      lastBump = now;
      deadline = now + timeoutMs;
    }

    function check() {
      if (Date.now() >= deadline) onLock();
    }

    const interval = window.setInterval(check, 5000);
    for (const name of ACTIVITY_EVENTS) {
      document.addEventListener(name, bump, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);

    return () => {
      window.clearInterval(interval);
      for (const name of ACTIVITY_EVENTS) {
        document.removeEventListener(name, bump, { capture: true });
      }
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [minutes, paused, onLock]);
}
