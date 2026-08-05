"use client";

import { useEffect, useId, useState } from "react";
import { createMediaEntry, createTextEntry } from "@/lib/journal";
import type { EntryType, JournalEntryMeta } from "@/lib/types";
import { AudioRecorder } from "./AudioRecorder";
import { VideoRecorder } from "./VideoRecorder";

type Tab = EntryType;

export function Composer({
  masterKey,
  onClose,
  onCreated,
}: {
  masterKey: CryptoKey;
  onClose: () => void;
  onCreated: (entry: JournalEntryMeta) => void;
}) {
  const titleId = useId();
  const [tab, setTab] = useState<Tab>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function saveText(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError("Write something first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const entry = await createTextEntry(masterKey, title, body);
      onCreated(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function saveMedia(
    type: "audio" | "video",
    blob: Blob,
    durationMs?: number,
  ) {
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const entry = await createMediaEntry(masterKey, {
        type,
        title,
        blob,
        durationMs,
        onProgress: (done, total) =>
          setProgress(Math.round((done / Math.max(total, 1)) * 100)),
      });
      onCreated(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="modal-overlay z-40" role="presentation" onClick={onClose}>
      <div
        className="modal-panel z-40 motion-safe:animate-rise"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display text-2xl font-semibold text-ink">
              New entry
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Encrypted on this device before it ever leaves memory.
            </p>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 flex gap-2" role="tablist" aria-label="Entry type">
          {(["text", "audio", "video"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`tab-btn ${tab === t ? "tab-btn-active" : ""}`}
              onClick={() => {
                if (!busy) {
                  setTab(t);
                  setError(null);
                }
              }}
              disabled={busy}
            >
              {t}
            </button>
          ))}
        </div>

        <label className="mt-6 flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">Title</span>
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional title"
            maxLength={120}
            disabled={busy}
          />
        </label>

        <div className="mt-6">
          {tab === "text" && (
            <form onSubmit={saveText} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink">Today’s words</span>
                <textarea
                  className="field min-h-48 resize-y font-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Dear diary…"
                  disabled={busy}
                  required
                />
              </label>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Encrypting…" : "Save encrypted note"}
              </button>
            </form>
          )}

          {tab === "audio" && (
            <AudioRecorder
              disabled={busy}
              onCapture={(blob, durationMs) => saveMedia("audio", blob, durationMs)}
            />
          )}

          {tab === "video" && (
            <VideoRecorder
              disabled={busy}
              onCapture={(blob, durationMs) => saveMedia("video", blob, durationMs)}
            />
          )}
        </div>

        {progress !== null && (
          <div className="mt-4">
            <p className="text-sm text-ink-muted">Encrypting chunks… {progress}%</p>
            <div className="progress-track mt-2">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
