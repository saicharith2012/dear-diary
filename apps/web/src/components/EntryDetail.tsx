"use client";

import { useEffect, useState } from "react";
import {
  readTextEntry,
  removeEntry,
  updateEntryDetails,
  updateTextEntry,
  type JournalEntryMeta,
  type Mood,
} from "@dear-diary/core";
import {
  MOOD_META,
  TYPE_LABEL,
  countWords,
  downloadBlob,
  formatBytes,
  formatClock,
  longDate,
  plural,
  safeFileName,
  shortDateTime,
  timeOfDay,
} from "@/lib/format";
import { useFeedback } from "./Feedback";
import {
  BackIcon,
  DownloadIcon,
  PenIcon,
  StarIcon,
  TrashIcon,
  TYPE_ICON,
} from "./Icons";
import { MediaPlayer } from "./MediaPlayer";
import { MoodPicker } from "./MoodPicker";

/** Mount with `key={entry.id}` so each entry gets fresh state. */
export function EntryDetail({
  entry,
  masterKey,
  onBack,
  onChanged,
  onDeleted,
}: {
  entry: JournalEntryMeta;
  masterKey: CryptoKey;
  /** Return to the list (shown on narrow screens only). */
  onBack: () => void;
  /** The entry was edited; `body` is set when a written note's text changed. */
  onChanged: (entry: JournalEntryMeta, body?: string) => void;
  onDeleted: (entry: JournalEntryMeta) => void;
}) {
  const { toast, confirm } = useFeedback();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftMood, setDraftMood] = useState<Mood | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isText = entry.type === "text";

  useEffect(() => {
    if (entry.type !== "text") return;
    let cancelled = false;
    readTextEntry(masterKey, entry.id)
      .then((body) => {
        if (!cancelled) setText(body);
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "This note couldn’t be decrypted. Its stored data may be damaged.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entry.id, entry.type, masterKey]);

  function startEditing() {
    setDraftTitle(entry.title);
    setDraftBody(text ?? "");
    setDraftMood(entry.mood ?? null);
    setEditError(null);
    setEditing(true);
  }

  const draftDirty =
    editing &&
    (draftTitle !== entry.title ||
      draftMood !== (entry.mood ?? null) ||
      (isText && draftBody !== (text ?? "")));

  async function cancelEditing() {
    if (draftDirty) {
      const ok = await confirm({
        title: "Discard your changes?",
        message: "The entry will stay as it was.",
        confirmLabel: "Discard changes",
        cancelLabel: "Keep editing",
        danger: true,
      });
      if (!ok) return;
    }
    setEditing(false);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (isText && !draftBody.trim()) {
      setEditError("A note can’t be empty. Delete it instead if you’re done with it.");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const bodyChanged = isText && draftBody !== text;
      if (bodyChanged) {
        await updateTextEntry(masterKey, entry.id, { body: draftBody });
      }
      const next = await updateEntryDetails(entry.id, {
        title: draftTitle,
        mood: draftMood,
      });
      if (bodyChanged) setText(draftBody);
      onChanged(next, bodyChanged ? draftBody : undefined);
      setEditing(false);
      toast("Changes saved");
    } catch (err) {
      setEditError(
        err instanceof Error && err.message
          ? err.message
          : "Could not save your changes. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleFavorite() {
    try {
      onChanged(
        await updateEntryDetails(entry.id, { favorite: !entry.favorite }),
      );
    } catch {
      toast("Could not update the star.", "error");
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this entry?",
      message: `“${entry.title}” will be permanently removed from this device.`,
      confirmLabel: "Delete entry",
      danger: true,
    });
    if (!ok) return;
    try {
      await removeEntry(entry);
      onDeleted(entry);
    } catch {
      toast("Could not delete the entry.", "error");
    }
  }

  function downloadText() {
    if (text === null) return;
    const content = `${entry.title}\n${longDate(entry.createdAt)}, ${timeOfDay(entry.createdAt)}\n\n${text}\n`;
    downloadBlob(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
      `${safeFileName(entry.title, "note")}.txt`,
    );
  }

  const TypeIcon = TYPE_ICON[entry.type];
  const loading = isText && text === null && error === null;
  const edited = entry.updatedAt - entry.createdAt > 1000;

  return (
    <article className="entry-detail motion-safe:animate-fade">
      <div className="-ml-2 -mt-2 mb-4 flex items-center justify-between gap-2 md:-mt-4">
        <button type="button" className="btn-ghost !px-2 md:invisible" onClick={onBack}>
          <BackIcon />
          All entries
        </button>
        {!editing && (
          <div className="flex items-center">
            <button
              type="button"
              className="btn-icon"
              onClick={toggleFavorite}
              aria-pressed={!!entry.favorite}
              aria-label={entry.favorite ? "Remove star" : "Star this entry"}
              title={entry.favorite ? "Remove star" : "Star this entry"}
            >
              <StarIcon filled={!!entry.favorite} />
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={startEditing}
              disabled={loading || !!error}
              aria-label="Edit entry"
              title="Edit entry"
            >
              <PenIcon />
            </button>
            {isText && (
              <button
                type="button"
                className="btn-icon"
                onClick={downloadText}
                disabled={text === null}
                aria-label="Download an unencrypted copy"
                title="Download an unencrypted copy"
              >
                <DownloadIcon />
              </button>
            )}
            <button
              type="button"
              className="btn-icon"
              onClick={handleDelete}
              aria-label="Delete entry"
              title="Delete entry"
            >
              <TrashIcon />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <form onSubmit={saveEdit} className="flex max-w-2xl flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">Title</span>
            <input
              className="field"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              maxLength={120}
              autoFocus
            />
          </label>
          <MoodPicker value={draftMood} onChange={setDraftMood} />
          {isText && (
            <label className="flex flex-col gap-2">
              <span className="flex items-baseline justify-between text-sm font-medium text-ink">
                Entry
                <span className="font-normal text-ink-muted">
                  {plural(countWords(draftBody), "word")}
                </span>
              </span>
              <textarea
                className="field prose-diary min-h-72 !max-w-none !text-base"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </label>
          )}
          {editError && (
            <p role="alert" className="notice notice-danger">
              {editError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void cancelEditing()}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <header>
            <p className="page-date">
              {longDate(entry.createdAt)}, {timeOfDay(entry.createdAt)}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">
              {entry.title}
            </h1>
            <div className="meta-row mt-4">
              <span>
                <TypeIcon size={16} />
                {TYPE_LABEL[entry.type]}
              </span>
              {entry.mood && (
                <span>
                  <span aria-hidden>{MOOD_META[entry.mood].emoji}</span>
                  Felt {MOOD_META[entry.mood].label.toLowerCase()}
                </span>
              )}
              {isText && text !== null && (
                <span>{plural(countWords(text), "word")}</span>
              )}
              {!isText && entry.durationMs ? (
                <span>{formatClock(entry.durationMs)}</span>
              ) : null}
              {!isText && <span>{formatBytes(entry.plainSize)}</span>}
              {edited && <span>Edited {shortDateTime(entry.updatedAt)}</span>}
            </div>
          </header>

          <div className="mt-8">
            {isText && (
              <>
                {loading && (
                  <p className="text-ink-muted" role="status">
                    Unlocking note…
                  </p>
                )}
                {error && (
                  <p role="alert" className="notice notice-danger">
                    {error}
                  </p>
                )}
                {text !== null && (
                  <div className="prose-diary whitespace-pre-wrap">{text}</div>
                )}
              </>
            )}

            {!isText && (
              <div className="max-w-3xl">
                <MediaPlayer entry={entry} masterKey={masterKey} />
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}
