"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createMediaEntry,
  createTextEntry,
  getAllEntries,
  removeEntry,
  useAuth,
  type JournalEntryMeta,
} from "@dear-diary/core";
import { prepareVideoForSave } from "@/lib/transcode";
import { ChangePasscodeModal } from "./ChangePasscodeModal";
import {
  Composer,
  type MediaSubmitPayload,
  type TextSubmitPayload,
} from "./Composer";
import { EntryDetail } from "./EntryDetail";
import { EntryList } from "./EntryList";

type SaveJob = {
  title: string;
  progress: number;
  error: string | null;
};

function formatSaveError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return "Could not save. Please try again.";
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

export function DiaryApp() {
  const { profile, masterKey, lock } = useAuth();
  const [entries, setEntries] = useState<JournalEntryMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [changingPasscode, setChangingPasscode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveJob, setSaveJob] = useState<SaveJob | null>(null);

  const saveBlocked = saveJob !== null;

  const refresh = useCallback(async () => {
    const list = await getAllEntries();
    setEntries(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAllEntries().then((list) => {
      if (cancelled) return;
      setEntries(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  async function handleDelete(entry: JournalEntryMeta) {
    if (!confirm(`Delete “${entry.title}”? This cannot be undone.`)) return;
    await removeEntry(entry);
    if (selectedId === entry.id) setSelectedId(null);
    await refresh();
  }

  function updateProgress(progress: number) {
    const next = Math.min(100, Math.max(0, Math.round(progress)));
    setSaveJob((prev) => {
      if (!prev || prev.error) return prev;
      // Never move the bar backwards mid-job (phase handoffs).
      return { ...prev, progress: Math.max(prev.progress, next) };
    });
  }

  async function runBackgroundSave(
    key: CryptoKey,
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
      setSelectedId(entry.id);
      setSaveJob(null);
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
    void runBackgroundSave(key, payload.title, async (onProgress) => {
      onProgress(30);
      const entry = await createTextEntry(key, payload.title, payload.body);
      onProgress(100);
      return entry;
    });
  }

  function handleSubmitMedia(payload: MediaSubmitPayload) {
    if (!masterKey || saveBlocked) return;
    const key = masterKey;
    void runBackgroundSave(key, payload.title, async (onProgress) => {
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
        onProgress: (done, total) => {
          const start = payload.type === "video" ? 78 : 20;
          const span = 100 - start;
          onProgress(start + (done / Math.max(total, 1)) * span);
        },
      });
    });
  }

  if (!masterKey) return null;

  return (
    <div className="diary-shell">
      <header className="diary-header">
        <div>
          <p className="font-display text-2xl font-semibold text-ink md:text-3xl">
            Dear Diary
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {profile?.displayName}
            {" · passcode vault"}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setComposing(true)}
            disabled={saveBlocked}
          >
            New entry
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setChangingPasscode(true)}
          >
            Change passcode
          </button>
          <button type="button" className="btn-ghost" onClick={lock}>
            Lock
          </button>
        </div>
      </header>

      <div className="diary-body">
        <aside className="diary-sidebar">
          {saveJob && (
            <div
              className="sidebar-save-banner"
              role="status"
              aria-live="polite"
            >
              {saveJob.error ? (
                <>
                  <p className="text-sm font-medium text-danger">
                    Couldn’t save
                    {saveJob.title ? ` “${saveJob.title}”` : ""}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">{saveJob.error}</p>
                  <button
                    type="button"
                    className="btn-ghost mt-3 !px-0 text-sm"
                    onClick={() => setSaveJob(null)}
                  >
                    Dismiss
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-ink">
                    Saving
                    {saveJob.title ? ` “${saveJob.title}”` : ""}…
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {saveJob.progress}%
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
                </>
              )}
            </div>
          )}

          {loading ? (
            <p className="px-4 py-8 text-sm text-ink-muted">Loading entries…</p>
          ) : (
            <EntryList
              entries={entries}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDelete={handleDelete}
            />
          )}
        </aside>

        <main className="diary-main">
          {selected && masterKey ? (
            <EntryDetail
              key={selected.id}
              entry={selected}
              masterKey={masterKey}
              onDeleted={() => {
                setSelectedId(null);
                void refresh();
              }}
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

      {changingPasscode && (
        <ChangePasscodeModal onClose={() => setChangingPasscode(false)} />
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
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-8 text-center">
      <p className="font-display text-3xl font-semibold text-ink">
        {hasEntries ? "Pick a page" : "Today is unwritten"}
      </p>
      <p className="mt-3 max-w-sm text-base text-ink-muted">
        {hasEntries
          ? "Choose an entry from the list, or start a new one."
          : "Capture a thought, a voice note, or a short video—stored only on this device."}
      </p>
      <button
        type="button"
        className="btn-primary mt-8"
        onClick={onNew}
        disabled={disabled}
      >
        Write today’s entry
      </button>
    </div>
  );
}
