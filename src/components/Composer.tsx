"use client";

import { useEffect, useId, useState } from "react";
import type { EntryType } from "@/lib/types";
import { AudioRecorder } from "./AudioRecorder";
import { VideoRecorder } from "./VideoRecorder";

type Tab = EntryType;

export type TextSubmitPayload = {
  title: string;
  body: string;
};

export type MediaSubmitPayload = {
  type: "audio" | "video";
  title: string;
  blob: Blob;
  durationMs?: number;
};

export function Composer({
  onClose,
  onSubmitText,
  onSubmitMedia,
}: {
  onClose: () => void;
  onSubmitText: (payload: TextSubmitPayload) => void;
  onSubmitMedia: (payload: MediaSubmitPayload) => void;
}) {
  const titleId = useId();
  const [tab, setTab] = useState<Tab>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function saveText(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError("Write something first.");
      return;
    }
    onSubmitText({ title, body });
  }

  function saveMedia(
    type: "audio" | "video",
    blob: Blob,
    durationMs?: number,
  ) {
    onSubmitMedia({ type, title, blob, durationMs });
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
              Private to this device.
            </p>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
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
                setTab(t);
                setError(null);
              }}
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
                  required
                />
              </label>
              <button type="submit" className="btn-primary">
                Save
              </button>
            </form>
          )}

          {tab === "audio" && (
            <AudioRecorder
              onCapture={(blob, durationMs) => saveMedia("audio", blob, durationMs)}
            />
          )}

          {tab === "video" && (
            <VideoRecorder
              onCapture={(blob, durationMs) => saveMedia("video", blob, durationMs)}
            />
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
