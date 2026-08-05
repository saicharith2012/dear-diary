"use client";

import { useEffect, useRef, useState } from "react";
import { attachStreamingPlayback } from "@/lib/journal";
import type { JournalEntryMeta } from "@/lib/types";

export function MediaPlayer({
  entry,
  masterKey,
}: {
  entry: JournalEntryMeta;
  masterKey: CryptoKey;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVideo = entry.type === "video";

  useEffect(() => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    setReady(false);
    setProgress(0);
    setError(null);

    (async () => {
      try {
        cleanup = await attachStreamingPlayback(
          el,
          masterKey,
          entry,
          (done, total) => {
            if (!cancelled) {
              setProgress(Math.round((done / Math.max(total, 1)) * 100));
            }
          },
        );
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Playback failed");
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [entry, masterKey, isVideo]);

  return (
    <div className="media-player">
      {!ready && !error && (
        <div className="decrypt-progress" aria-live="polite">
          <p className="text-sm font-medium text-ink">
            Decrypting stream… {progress}%
          </p>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Chunks unlocked on demand from device storage
            {entry.chunkCount > 1 ? ` (${entry.chunkCount} chunks)` : ""}.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}

      {isVideo ? (
        <video
          ref={videoRef}
          className={`media-el ${ready ? "opacity-100" : "pointer-events-none absolute opacity-0"}`}
          controls
          playsInline
        />
      ) : (
        <audio
          ref={audioRef}
          className={`media-el-audio w-full ${ready ? "opacity-100" : "pointer-events-none absolute opacity-0"}`}
          controls
        />
      )}
    </div>
  );
}
