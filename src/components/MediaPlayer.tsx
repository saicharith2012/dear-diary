"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { openDecryptedMediaStream } from "@/lib/journal";
import type { JournalEntryMeta } from "@/lib/types";
import { FullscreenVideo } from "./FullscreenVideo";

export function MediaPlayer({
  entry,
  masterKey,
}: {
  entry: JournalEntryMeta;
  masterKey: CryptoKey;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [immersive, setImmersive] = useState(false);

  const isVideo = entry.type === "video";

  const exitImmersive = useCallback(() => {
    setImmersive(false);
  }, []);

  const enterImmersive = useCallback(() => {
    flushSync(() => {
      setImmersive(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    setReady(false);
    setProgress(0);
    setError(null);
    setImmersive(false);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setObjectUrl(null);

    (async () => {
      try {
        const mime =
          entry.mimeType ||
          (isVideo ? "video/webm" : "audio/webm");
        const parts: BlobPart[] = [];
        let done = 0;
        const stream = openDecryptedMediaStream(masterKey, entry);
        const reader = stream.getReader();

        while (true) {
          const { value, done: finished } = await reader.read();
          if (finished) break;
          parts.push(value.slice().buffer);
          done += 1;
          if (!cancelled) {
            setProgress(
              Math.round((done / Math.max(entry.chunkCount, 1)) * 100),
            );
          }
        }

        const blob = new Blob(parts, { type: mime });
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrlRef.current = url;
        setObjectUrl(url);
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Playback failed");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [entry, masterKey, isVideo]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || isVideo || !objectUrl) return;
    el.src = objectUrl;
  }, [objectUrl, isVideo]);

  if (!isVideo) {
    return (
      <div className="media-player">
        {!ready && !error && (
          <DecryptProgress progress={progress} chunkCount={entry.chunkCount} />
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <audio
          ref={audioRef}
          className={`media-el-audio w-full ${ready ? "opacity-100" : "pointer-events-none absolute opacity-0"}`}
          controls
        />
      </div>
    );
  }

  return (
    <div className={immersive ? undefined : "media-player"}>
      {!immersive && !ready && !error && (
        <DecryptProgress progress={progress} chunkCount={entry.chunkCount} />
      )}

      {!immersive && error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}

      <FullscreenVideo
        active={immersive}
        onExit={exitImmersive}
        className="relative aspect-video overflow-hidden rounded-xl"
        dock={
          <button
            type="button"
            className="btn-secondary"
            onClick={exitImmersive}
          >
            Exit fullscreen
          </button>
        }
      >
        <video
          src={objectUrl ?? undefined}
          className={`media-el ${ready ? "opacity-100" : "pointer-events-none absolute opacity-0"} ${immersive ? "video-fs-contain" : ""}`}
          controls
          playsInline
        />
        {!immersive && ready && (
          <button
            type="button"
            className="btn-secondary absolute right-3 top-3 z-10"
            onClick={enterImmersive}
          >
            Fullscreen
          </button>
        )}
      </FullscreenVideo>
    </div>
  );
}

function DecryptProgress({
  progress,
  chunkCount,
}: {
  progress: number;
  chunkCount: number;
}) {
  return (
    <div className="decrypt-progress" aria-live="polite">
      <p className="text-sm font-medium text-ink">
        Decrypting stream… {progress}%
      </p>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Chunks unlocked on demand from device storage
        {chunkCount > 1 ? ` (${chunkCount} chunks)` : ""}.
      </p>
    </div>
  );
}
