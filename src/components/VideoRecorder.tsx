"use client";

import { useEffect, useRef, useState } from "react";

function pickMime(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function VideoRecorder({
  disabled,
  onCapture,
}: {
  disabled?: boolean;
  onCapture: (blob: Blob, durationMs: number) => void;
}) {
  const liveRef = useRef<HTMLVideoElement>(null);
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

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

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function enableCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        await liveRef.current.play();
      }
      setPreviewing(true);
    } catch {
      setError("Camera and microphone permission are required.");
    }
  }

  async function start() {
    if (!streamRef.current) await enableCamera();
    const stream = streamRef.current;
    if (!stream) return;

    const mime = pickMime([
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
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
      const type = recorder.mimeType || mime || "video/webm";
      const b = new Blob(chunksRef.current, { type });
      const url = URL.createObjectURL(b);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setBlob(b);
      setPreviewUrl(url);
      stopTracks();
      setPreviewing(false);
    };
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed(Date.now() - startedAtRef.current);
    }, 200);
    recorder.start(250);
    setRecording(true);
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
    void enableCamera();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Capture a short video diary entry. Encrypted chunk-by-chunk on this device.
      </p>

      {!previewUrl && (
        <div className="video-frame">
          <video
            ref={liveRef}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
          {!previewing && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink/40">
              <button
                type="button"
                className="btn-secondary"
                onClick={enableCamera}
                disabled={disabled}
              >
                Enable camera
              </button>
            </div>
          )}
        </div>
      )}

      {previewUrl && (
        <div className="video-frame">
          <video
            src={previewUrl}
            className="h-full w-full object-cover"
            controls
            playsInline
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {previewing && !recording && !blob && (
          <button
            type="button"
            className="btn-primary"
            onClick={start}
            disabled={disabled}
          >
            Start recording
          </button>
        )}
        {recording && (
          <button type="button" className="btn-danger" onClick={stop}>
            Stop · {formatMs(elapsed)}
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
              Encrypt & save
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={disabled}
              onClick={discard}
            >
              Re-record
            </button>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
