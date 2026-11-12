"use client";

import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import {
  openDecryptedMediaStream,
  type JournalEntryMeta,
} from "@dear-diary/core";
import { downloadUrl, extensionForMime, safeFileName } from "@/lib/format";
import { FullscreenVideo } from "./FullscreenVideo";
import { DownloadIcon } from "./Icons";

/**
 * Decrypts one entry's media and plays it. Mount with `key={entry.id}`: the
 * component assumes a fresh instance per entry and never resets its own state.
 */
export function MediaPlayer({
  entry,
  masterKey,
}: {
  entry: JournalEntryMeta;
  masterKey: CryptoKey;
}) {
  // Decrypt once per mount: starring or renaming the entry hands us a new
  // `entry` object, and that must not restart the decrypt.
  const [source] = useState(entry);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [immersive, setImmersive] = useState(false);

  const isVideo = entry.type === "video";
  const ready = objectUrl !== null;

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
    let url: string | null = null;

    (async () => {
      try {
        const mime = source.mimeType || (isVideo ? "video/webm" : "audio/webm");
        const parts: BlobPart[] = [];
        let done = 0;
        const reader = openDecryptedMediaStream(masterKey, source).getReader();

        while (true) {
          const { value, done: finished } = await reader.read();
          if (finished) break;
          if (cancelled) {
            void reader.cancel();
            return;
          }
          parts.push(value.slice().buffer);
          done += 1;
          setProgress(Math.round((done / Math.max(source.chunkCount, 1)) * 100));
        }

        if (cancelled) return;
        url = URL.createObjectURL(new Blob(parts, { type: mime }));
        setObjectUrl(url);
      } catch {
        if (!cancelled) {
          setError(
            "This recording couldn’t be decrypted. Its stored data may be damaged or incomplete.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source, masterKey, isVideo]);

  function download() {
    if (!objectUrl) return;
    const ext = extensionForMime(entry.mimeType, isVideo ? "webm" : "webm");
    downloadUrl(objectUrl, `${safeFileName(entry.title, "entry")}.${ext}`);
  }

  const status = (
    <>
      {!ready && !error && (
        <div className="decrypt-progress" role="status" aria-live="polite">
          <p className="text-sm font-medium text-ink">
            Unlocking {isVideo ? "video" : "recording"}… {progress}%
          </p>
          <div className="progress-track mt-2">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="notice notice-danger">
          {error}
        </p>
      )}
    </>
  );

  const downloadButton = ready && (
    <button type="button" className="btn-ghost mt-3 !px-2" onClick={download}>
      <DownloadIcon />
      Download an unencrypted copy
    </button>
  );

  if (!isVideo) {
    return (
      <div className="media-player">
        {status}
        {ready && (
          <audio
            src={objectUrl}
            className="media-el-audio w-full"
            controls
            preload="metadata"
          />
        )}
        {downloadButton}
      </div>
    );
  }

  return (
    <div className={immersive ? undefined : "media-player"}>
      {!immersive && status}

      {ready && (
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
            src={objectUrl}
            className={`media-el ${immersive ? "video-fs-contain" : ""}`}
            controls
            playsInline
          />
          {!immersive && (
            <button
              type="button"
              className="btn-secondary absolute right-3 top-3 z-10"
              onClick={enterImmersive}
            >
              Fullscreen
            </button>
          )}
        </FullscreenVideo>
      )}
      {!immersive && downloadButton}
    </div>
  );
}
