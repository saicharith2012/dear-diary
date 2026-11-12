"use client";

import { useState } from "react";
import type { EntryType, Mood } from "@dear-diary/core";
import { countWords, plural } from "@/lib/format";
import { AudioRecorder } from "./AudioRecorder";
import { useFeedback } from "./Feedback";
import { TYPE_ICON } from "./Icons";
import { Modal } from "./Modal";
import { MoodPicker } from "./MoodPicker";
import { VideoRecorder } from "./VideoRecorder";

export type TextSubmitPayload = {
  title: string;
  body: string;
  mood?: Mood;
};

export type MediaSubmitPayload = {
  type: "audio" | "video";
  title: string;
  blob: Blob;
  durationMs?: number;
  mood?: Mood;
};

const TABS: { type: EntryType; label: string }[] = [
  { type: "text", label: "Write" },
  { type: "audio", label: "Voice" },
  { type: "video", label: "Video" },
];

export function Composer({
  onClose,
  onSubmitText,
  onSubmitMedia,
}: {
  onClose: () => void;
  onSubmitText: (payload: TextSubmitPayload) => void;
  onSubmitMedia: (payload: MediaSubmitPayload) => void;
}) {
  const { confirm } = useFeedback();
  const [tab, setTab] = useState<EntryType>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set once a recorder is holding (or capturing) something worth keeping.
  const [mediaDirty, setMediaDirty] = useState(false);

  const dirty = body.trim() !== "" || mediaDirty;

  async function requestClose() {
    if (dirty) {
      const ok = await confirm({
        title: "Discard this entry?",
        message: "What you’ve written or recorded here hasn’t been saved.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        danger: true,
      });
      if (!ok) return;
    }
    onClose();
  }

  async function switchTab(next: EntryType) {
    if (next === tab) return;
    if (mediaDirty) {
      const ok = await confirm({
        title: "Discard this recording?",
        message: "Switching away deletes the recording you haven’t saved.",
        confirmLabel: "Discard recording",
        cancelLabel: "Keep it",
        danger: true,
      });
      if (!ok) return;
    }
    setMediaDirty(false);
    setError(null);
    setTab(next);
  }

  function saveText(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError("Write something before saving.");
      return;
    }
    onSubmitText({ title, body, mood: mood ?? undefined });
  }

  function saveMedia(type: "audio" | "video", blob: Blob, durationMs?: number) {
    onSubmitMedia({ type, title, blob, durationMs, mood: mood ?? undefined });
  }

  return (
    <Modal
      title="New entry"
      description="Encrypted and saved on this device only."
      onClose={requestClose}
      wide
    >
      <div className="mt-6 flex gap-2" role="tablist" aria-label="Entry type">
        {TABS.map(({ type, label }) => {
          const TypeIcon = TYPE_ICON[type];
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={tab === type}
              className={`tab-btn ${tab === type ? "tab-btn-active" : ""}`}
              onClick={() => void switchTab(type)}
            >
              <TypeIcon />
              {label}
            </button>
          );
        })}
      </div>

      <label className="mt-6 flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">
          Title <span className="font-normal text-ink-muted">Optional</span>
        </span>
        <input
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            tab === "text"
              ? "Untitled note"
              : tab === "audio"
                ? "Voice note"
                : "Video note"
          }
          maxLength={120}
        />
      </label>

      <div className="mt-5">
        <MoodPicker value={mood} onChange={setMood} />
      </div>

      <div className="mt-5" role="tabpanel">
        {tab === "text" && (
          <form onSubmit={saveText} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="flex items-baseline justify-between text-sm font-medium text-ink">
                Today’s words
                <span className="font-normal text-ink-muted">
                  {plural(countWords(body), "word")}
                </span>
              </span>
              <textarea
                className="field prose-diary min-h-56 !max-w-none !text-base"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Dear diary…"
                data-autofocus
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="mr-auto hidden text-xs text-ink-muted sm:block">
                <span className="kbd">Ctrl</span>{" "}
                <span className="kbd">Enter</span> to save
              </span>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void requestClose()}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save entry
              </button>
            </div>
          </form>
        )}

        {tab === "audio" && (
          <AudioRecorder
            onDirtyChange={setMediaDirty}
            onCapture={(blob, durationMs) => saveMedia("audio", blob, durationMs)}
          />
        )}

        {tab === "video" && (
          <VideoRecorder
            onDirtyChange={setMediaDirty}
            onCapture={(blob, durationMs) => saveMedia("video", blob, durationMs)}
          />
        )}
      </div>
    </Modal>
  );
}
