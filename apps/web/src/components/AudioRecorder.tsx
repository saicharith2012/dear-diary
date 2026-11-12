"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/format";
import { MicIcon } from "./Icons";

function pickMime(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function AudioRecorder({
  disabled,
  onCapture,
  onDirtyChange,
}: {
  disabled?: boolean;
  /** Fires true while recording or holding an unsaved take. */
  onDirtyChange?: (dirty: boolean) => void;
  onCapture: (blob: Blob, durationMs: number) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stopTracks();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = recording || blob !== null;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime([
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ]);
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || "audio/webm";
        const b = new Blob(chunksRef.current, { type });
        const url = URL.createObjectURL(b);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setBlob(b);
        setPreviewUrl(url);
        stopTracks();
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed(Date.now() - startedAtRef.current);
      }, 200);
      recorder.start(250);
      setRecording(true);
    } catch {
      setError(
        "Can’t reach the microphone. Allow microphone access for this site in your browser, then try again.",
      );
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setElapsed(0);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {!recording && !blob && (
          <button
            type="button"
            className="btn-primary"
            onClick={start}
            disabled={disabled}
          >
            <MicIcon />
            Start recording
          </button>
        )}
        {recording && (
          <button type="button" className="btn-danger" onClick={stop}>
            <span className="rec-dot" aria-hidden />
            Stop recording
            <span className="tabular-nums">{formatClock(elapsed)}</span>
          </button>
        )}
        {blob && !recording && (
          <>
            <button
              type="button"
              className="btn-primary"
              disabled={disabled}
              onClick={() => onCapture(blob, elapsed)}
            >
              Save entry
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={disabled}
              onClick={discard}
            >
              Record again
            </button>
          </>
        )}
      </div>

      {previewUrl && (
        <audio src={previewUrl} controls className="w-full" />
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
