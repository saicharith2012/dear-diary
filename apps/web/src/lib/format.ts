import type { JournalEntryMeta, Mood } from "@dear-diary/core";

export const MOOD_META: Record<Mood, { label: string; emoji: string }> = {
  great: { label: "Great", emoji: "😄" },
  good: { label: "Good", emoji: "🙂" },
  okay: { label: "Okay", emoji: "😐" },
  low: { label: "Low", emoji: "😔" },
  rough: { label: "Rough", emoji: "😣" },
};

export const TYPE_LABEL: Record<JournalEntryMeta["type"], string> = {
  text: "Written note",
  audio: "Voice note",
  video: "Video note",
};

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? m.toString().padStart(2, "0") : m.toString();
  return `${h > 0 ? `${h}:` : ""}${mm}:${r.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Local-time day key, e.g. "2026-11-12". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
    .getDate()
    .toString()
    .padStart(2, "0")}`;
}

export function monthLabel(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(ts));
}

export function longDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ts));
}

export function timeOfDay(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function shortDateTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

/** Consecutive days with an entry, counting back from today (or yesterday). */
export function currentStreak(entries: JournalEntryMeta[], now = Date.now()): number {
  const days = new Set(entries.map((e) => dayKey(e.createdAt)));
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** A short excerpt of `body`, centred on the first match of `query` if any. */
export function excerpt(body: string, query: string, max = 90): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const q = query.trim().toLowerCase();
  const at = q ? flat.toLowerCase().indexOf(q) : -1;
  if (at <= max * 0.6) {
    return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
  }
  const start = Math.max(0, at - Math.floor(max / 3));
  const piece = flat.slice(start, start + max).trim();
  return `…${piece}${start + max < flat.length ? "…" : ""}`;
}

export function safeFileName(title: string, fallback: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

export function extensionForMime(mime: string | undefined, fallback: string): string {
  const base = (mime ?? "").split(";")[0]!.trim();
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "video/quicktime": "mov",
  };
  return map[base] ?? fallback;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadUrl(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export type PasscodeStrength = {
  /** 0 (too short) … 4 (strong) */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
};

/**
 * Rough offline-guessing estimate. Length dominates because the stored vault
 * can be attacked without rate limits; character variety only helps a little.
 */
export function passcodeStrength(passcode: string, minLength: number): PasscodeStrength {
  if (passcode.length < minLength) return { score: 0, label: "Too short" };
  let pool = 0;
  if (/[a-z]/.test(passcode)) pool += 26;
  if (/[A-Z]/.test(passcode)) pool += 26;
  if (/\d/.test(passcode)) pool += 10;
  if (/[^a-zA-Z\d]/.test(passcode)) pool += 32;
  const unique = new Set(passcode).size;
  const effectiveLength = Math.min(passcode.length, unique * 2);
  const bits = effectiveLength * Math.log2(Math.max(pool, 2));
  if (bits < 36) return { score: 1, label: "Weak — easy to guess" };
  if (bits < 56) return { score: 2, label: "Fair — longer is safer" };
  if (bits < 76) return { score: 3, label: "Good" };
  return { score: 4, label: "Strong" };
}
