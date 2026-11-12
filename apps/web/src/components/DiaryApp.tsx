"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  createMediaEntry,
  createTextEntry,
  getAllEntries,
  readTextEntry,
  useAuth,
  type EntryType,
  type JournalEntryMeta,
} from "@dear-diary/core";
import { currentStreak, plural } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { prepareVideoForSave } from "@/lib/transcode";
import { useAutoLock } from "@/lib/useAutoLock";
import {
  Composer,
  type MediaSubmitPayload,
  type TextSubmitPayload,
} from "./Composer";
import { EntryDetail } from "./EntryDetail";
import { EntryList } from "./EntryList";
import { useFeedback } from "./Feedback";
import {
  CloseIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
} from "./Icons";
import { isModalOpen } from "./Modal";
import { SettingsModal } from "./SettingsModal";

type SaveJob = {
  title: string;
  progress: number;
  error: string | null;
};

type Filter = "all" | "starred" | EntryType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "starred", label: "Starred" },
  { value: "text", label: "Written" },
  { value: "audio", label: "Voice" },
  { value: "video", label: "Video" },
];

function formatSaveError(err: unknown): string {
  if (err instanceof DOMException && err.name === "QuotaExceededError") {
    return "This device is out of storage space for the diary. Free some space, then try again.";
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return "The entry could not be saved. Try again.";
}

function jobTitleLabel(title: string): string {
  const t = title.trim();
  return t || "Untitled";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Yield so React can paint the sidebar banner before heavy work. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  );
}

export function DiaryApp() {
  const { profile, masterKey, lock } = useAuth();
  const { toast } = useFeedback();
  const prefs = usePrefs();
  const [entries, setEntries] = useState<JournalEntryMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saveJob, setSaveJob] = useState<SaveJob | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // Decrypted text of written notes, held in memory only while unlocked, for
  // list previews and search. `indexed` remembers which version was read.
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const indexed = useRef(new Map<string, number>());
  const searchRef = useRef<HTMLInputElement>(null);

  const saving = saveJob !== null && saveJob.error === null;
  const saveBlocked = saveJob !== null;

  const refresh = useCallback(async () => {
    try {
      setEntries(await getAllEntries());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAllEntries()
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Decrypt written notes in the background for previews and search.
  useEffect(() => {
    if (!masterKey) return;
    let cancelled = false;
    (async () => {
      let batch: Record<string, string> = {};
      let pending = 0;
      const flush = () => {
        if (pending === 0) return;
        const done = batch;
        batch = {};
        pending = 0;
        setBodies((prev) => ({ ...prev, ...done }));
      };
      for (const entry of entries) {
        if (entry.type !== "text") continue;
        if (indexed.current.get(entry.id) === entry.updatedAt) continue;
        try {
          const body = await readTextEntry(masterKey, entry.id);
          if (cancelled) return;
          indexed.current.set(entry.id, entry.updatedAt);
          batch[entry.id] = body;
          if (++pending >= 20) flush();
        } catch {
          // Unreadable note: it simply has no preview. Opening it explains.
        }
      }
      if (!cancelled) flush();
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, masterKey]);

  useAutoLock(prefs.autoLockMinutes, saving || composing, lock);

  // Leaving mid-save would drop the entry.
  useEffect(() => {
    if (!saving) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target) || isModalOpen()) return;
      if (e.key === "/") {
        e.preventDefault();
        const input = searchRef.current;
        input?.focus();
        if (input && document.activeElement !== input) {
          // On a phone the list is hidden behind the open page; go back first.
          flushSync(() => setSelectedId(null));
          input.focus();
        }
      } else if (e.key === "n" && !saveBlocked) {
        e.preventDefault();
        setComposing(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveBlocked]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === "starred" ? !e.favorite : filter !== "all" && e.type !== filter) {
        return false;
      }
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (bodies[e.id]?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [entries, bodies, query, filter]);

  const streak = useMemo(() => currentStreak(entries), [entries]);
  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const filtering = query.trim() !== "" || filter !== "all";

  function updateProgress(progress: number) {
    const next = Math.min(100, Math.max(0, Math.round(progress)));
    setSaveJob((prev) => {
      if (!prev || prev.error) return prev;
      // Never move the bar backwards mid-job (phase handoffs).
      return { ...prev, progress: Math.max(prev.progress, next) };
    });
  }

  async function runBackgroundSave(
    title: string,
    work: (onProgress: (n: number) => void) => Promise<JournalEntryMeta>,
  ) {
    setComposing(false);
    setSaveJob({ title: jobTitleLabel(title), progress: 2, error: null });
    await yieldToUi();
    try {
      const entry = await work(updateProgress);
      updateProgress(100);
      await sleep(450);
      await refresh();
      setQuery("");
      setFilter("all");
      setSelectedId(entry.id);
      setSaveJob(null);
      toast("Entry saved");
    } catch (err) {
      setSaveJob({
        title: jobTitleLabel(title),
        progress: 0,
        error: formatSaveError(err),
      });
    }
  }

  function handleSubmitText(payload: TextSubmitPayload) {
    if (!masterKey || saveBlocked) return;
    const key = masterKey;
    void runBackgroundSave(payload.title, async (onProgress) => {
      onProgress(30);
      const entry = await createTextEntry(key, payload.title, payload.body, {
        mood: payload.mood,
      });
      onProgress(100);
      return entry;
    });
  }

  function handleSubmitMedia(payload: MediaSubmitPayload) {
    if (!masterKey || saveBlocked) return;
    const key = masterKey;
    void runBackgroundSave(payload.title, async (onProgress) => {
      let mediaBlob = payload.blob;
      if (payload.type === "video") {
        // Prepare (download + transcode) occupies 0–78%.
        mediaBlob = await prepareVideoForSave(payload.blob, {
          onProgress: (ratio) => onProgress(ratio * 78),
        });
        onProgress(78);
      } else {
        onProgress(20);
      }
      return createMediaEntry(key, {
        type: payload.type,
        title: payload.title,
        blob: mediaBlob,
        durationMs: payload.durationMs,
        mood: payload.mood,
        onProgress: (done, total) => {
          const start = payload.type === "video" ? 78 : 20;
          const span = 100 - start;
          onProgress(start + (done / Math.max(total, 1)) * span);
        },
      });
    });
  }

  function handleChanged(next: JournalEntryMeta, body?: string) {
    setEntries((list) => list.map((e) => (e.id === next.id ? next : e)));
    if (body !== undefined) {
      indexed.current.set(next.id, next.updatedAt);
      setBodies((prev) => ({ ...prev, [next.id]: body }));
    }
  }

  function handleDeleted(entry: JournalEntryMeta) {
    setSelectedId(null);
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    indexed.current.delete(entry.id);
    setBodies((prev) => {
      const next = { ...prev };
      delete next[entry.id];
      return next;
    });
    toast("Entry deleted");
  }

  if (!masterKey) return null;

  return (
    <div className="diary-shell">
      <header className="diary-header">
        <div className="min-w-0">
          <p className="font-display text-2xl font-semibold leading-none text-ink md:text-3xl">
            Dear Diary
          </p>
          <p className="mt-1.5 truncate text-sm text-ink-muted">
            {profile?.displayName}’s private journal
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="btn-primary mr-1 !px-4"
            onClick={() => setComposing(true)}
            disabled={saveBlocked}
            title="New entry (N)"
          >
            <PlusIcon />
            <span>
              New<span className="hidden sm:inline"> entry</span>
            </span>
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon size={20} />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={lock}
            disabled={saving}
            aria-label="Lock diary"
            title={saving ? "Wait for the save to finish" : "Lock diary"}
          >
            <LockIcon size={20} />
          </button>
        </div>
      </header>

      <div className="diary-body" data-pane={selected ? "page" : "list"}>
        <aside className="diary-sidebar" aria-label="Entries">
          {entries.length > 0 && (
            <div className="sidebar-tools">
              <div className="search-field" role="search">
                <SearchIcon />
                <input
                  ref={searchRef}
                  className="field"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setQuery("");
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder="Search titles and notes"
                  aria-label="Search entries"
                />
                {query && (
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                    aria-label="Clear search"
                  >
                    <CloseIcon size={16} />
                  </button>
                )}
              </div>
              <div className="filter-row" role="group" aria-label="Show">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    className="filter-chip"
                    aria-pressed={filter === f.value}
                    onClick={() => setFilter(f.value)}
                  >
                    {f.value === "starred" && <StarIcon size={13} filled />}
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {saveJob && (
            <div
              className="sidebar-save-banner"
              role="status"
              aria-live="polite"
            >
              {saveJob.error ? (
                <>
                  <p className="text-sm font-semibold text-danger">
                    “{saveJob.title}” wasn’t saved
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">{saveJob.error}</p>
                  <button
                    type="button"
                    className="btn-ghost mt-2 !px-0 text-sm"
                    onClick={() => setSaveJob(null)}
                  >
                    Dismiss
                  </button>
                </>
              ) : (
                <>
                  <p className="flex items-baseline justify-between gap-3 text-sm font-medium text-ink">
                    <span className="truncate">Saving “{saveJob.title}”…</span>
                    <span className="tabular-nums text-ink-muted">
                      {saveJob.progress}%
                    </span>
                  </p>
                  <div className="progress-track mt-2">
                    <div
                      className={
                        saveJob.progress < 8
                          ? "progress-fill progress-fill-pulse"
                          : "progress-fill"
                      }
                      style={{
                        width: `${Math.max(saveJob.progress, 8)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    Keep this tab open until it finishes.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="sidebar-scroll">
            {loading ? (
              <p className="px-4 py-8 text-sm text-ink-muted" role="status">
                Opening your entries…
              </p>
            ) : loadError ? (
              <div className="px-4 py-8 text-sm">
                <p className="text-danger">
                  Your entries couldn’t be read from this browser’s storage.
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-4"
                  onClick={() => void refresh()}
                >
                  Try again
                </button>
              </div>
            ) : entries.length === 0 ? (
              <p className="px-4 py-8 text-sm leading-relaxed text-ink-muted">
                Nothing here yet. Your entries will be listed by date as you
                add them.
              </p>
            ) : visible.length === 0 ? (
              <div className="px-4 py-8 text-sm text-ink-muted">
                <p>
                  {query.trim()
                    ? `No entries match “${query.trim()}”.`
                    : "No entries of this kind yet."}
                </p>
                {query.trim() && (
                  <p className="mt-2">
                    Search covers titles and written notes, not what’s said in
                    recordings.
                  </p>
                )}
                <button
                  type="button"
                  className="btn-ghost mt-3 !px-0"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Show all entries
                </button>
              </div>
            ) : (
              <EntryList
                entries={visible}
                selectedId={selectedId}
                onSelect={setSelectedId}
                bodies={bodies}
                query={query}
              />
            )}
          </div>

          {entries.length > 0 && (
            <div className="sidebar-foot">
              <span>
                {filtering
                  ? `${visible.length.toLocaleString()} of ${plural(entries.length, "entry", "entries")}`
                  : plural(entries.length, "entry", "entries")}
              </span>
              {streak > 0 && (
                <span title="Days in a row with an entry">
                  {streak}-day streak
                </span>
              )}
            </div>
          )}
        </aside>

        <main className="diary-main">
          {selected ? (
            <EntryDetail
              key={selected.id}
              entry={selected}
              masterKey={masterKey}
              onBack={() => setSelectedId(null)}
              onChanged={handleChanged}
              onDeleted={handleDeleted}
            />
          ) : (
            <EmptyState
              onNew={() => setComposing(true)}
              hasEntries={entries.length > 0}
              disabled={saveBlocked}
            />
          )}
        </main>
      </div>

      {composing && (
        <Composer
          onClose={() => setComposing(false)}
          onSubmitText={handleSubmitText}
          onSubmitMedia={handleSubmitMedia}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          entries={entries}
          saving={saving}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function EmptyState({
  onNew,
  hasEntries,
  disabled,
}: {
  onNew: () => void;
  hasEntries: boolean;
  disabled?: boolean;
}) {
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="flex h-full min-h-64 flex-col items-start justify-center md:px-6">
      <p className="page-date" suppressHydrationWarning>
        {today}
      </p>
      <p className="mt-2 font-display text-4xl font-semibold leading-tight text-ink md:text-5xl">
        {hasEntries ? "Pick up where you left off" : "Today is unwritten"}
      </p>
      <p className="mt-4 max-w-md text-base leading-relaxed text-ink-muted">
        {hasEntries
          ? "Open an entry from the list, or add something new for today."
          : "Write a few lines, record your voice, or film a short video. Whatever you add is encrypted and kept on this device only."}
      </p>
      <button
        type="button"
        className="btn-primary mt-8"
        onClick={onNew}
        disabled={disabled}
      >
        <PlusIcon />
        {hasEntries ? "New entry" : "Write the first entry"}
      </button>
      <p className="mt-6 hidden text-xs text-ink-muted md:block">
        Press <span className="kbd">N</span> for a new entry,{" "}
        <span className="kbd">/</span> to search
      </p>
    </div>
  );
}
