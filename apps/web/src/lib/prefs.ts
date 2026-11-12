"use client";

import { useSyncExternalStore } from "react";
export type ThemePref = "system" | "light" | "dark";

export interface Prefs {
  theme: ThemePref;
  /** Minutes of inactivity before the diary locks itself. 0 = never. */
  autoLockMinutes: number;
}

export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60, 0] as const;

import { PREFS_STORAGE_KEY as STORAGE_KEY } from "./theme-boot";

const DEFAULTS: Prefs = { theme: "system", autoLockMinutes: 15 };

const listeners = new Set<() => void>();
let cached: Prefs | null = null;

function read(): Prefs {
  if (cached) return cached;
  let next = DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      next = {
        theme:
          parsed.theme === "light" || parsed.theme === "dark"
            ? parsed.theme
            : "system",
        autoLockMinutes: (AUTO_LOCK_OPTIONS as readonly number[]).includes(
          parsed.autoLockMinutes as number,
        )
          ? (parsed.autoLockMinutes as number)
          : DEFAULTS.autoLockMinutes,
      };
    }
  } catch {
    // Private mode or corrupt value: fall back to defaults.
  }
  cached = next;
  return next;
}

export function applyTheme(theme: ThemePref): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function setPrefs(patch: Partial<Prefs>): void {
  cached = { ...read(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // Still applies for this session.
  }
  if (patch.theme) applyTheme(cached.theme);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}
