"use client";

import { useEffect, useState } from "react";
import { readTextEntry, removeEntry } from "@/lib/journal";
import type { JournalEntryMeta } from "@/lib/types";
import { MediaPlayer } from "./MediaPlayer";

export function EntryDetail({
  entry,
  masterKey,
  onDeleted,
}: {
  entry: JournalEntryMeta;
  masterKey: CryptoKey;
  onDeleted: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entry.type !== "text") return;
    let cancelled = false;
    readTextEntry(masterKey, entry.id)
      .then((body) => {
        if (!cancelled) setText(body);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Decrypt failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entry.id, entry.type, masterKey]);

  async function handleDelete() {
    if (!confirm(`Delete “${entry.title}”?`)) return;
    await removeEntry(entry);
    onDeleted();
  }

  const date = new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(entry.createdAt));

  const loading = entry.type === "text" && text === null && error === null;

  return (
    <article className="entry-detail motion-safe:animate-fade">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="type-chip">{entry.type}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink md:text-4xl">
            {entry.title}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{date}</p>
        </div>
        <button type="button" className="btn-ghost" onClick={handleDelete}>
          Delete
        </button>
      </header>

      <div className="mt-8">
        {entry.type === "text" && (
          <>
            {loading && <p className="text-ink-muted">Decrypting note…</p>}
            {error && (
              <p role="alert" className="text-danger">
                {error}
              </p>
            )}
            {text !== null && (
              <div className="prose-diary whitespace-pre-wrap">{text}</div>
            )}
          </>
        )}

        {(entry.type === "audio" || entry.type === "video") && (
          <MediaPlayer entry={entry} masterKey={masterKey} />
        )}
      </div>
    </article>
  );
}
