export type TranscodeFormat = "mp4" | "webm";

export type TranscodeResult = {
  blob: Blob;
  mimeType: string;
  format: TranscodeFormat;
};

export type TranscodeOptions = {
  /** Prefer this container; defaults to MP4 on Safari/iOS, WebM elsewhere. */
  format?: TranscodeFormat;
  /** Overall prepare progress from 0–1 (download + encode). */
  onProgress?: (ratio: number) => void;
};

const MAX_WIDTH = 1280;

function prefersMp4(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  return (
    /iP(hone|ad|od)/i.test(ua) ||
    (/Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/i.test(ua))
  );
}

function inputName(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("mp4") || type.includes("quicktime")) return "input.mp4";
  if (type.includes("webm")) return "input.webm";
  if (type.includes("ogg")) return "input.ogv";
  return "input.webm";
}

function mp4Args(input: string): string[] {
  return [
    "-i",
    input,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-vf",
    `scale=min(${MAX_WIDTH}\\,iw):-2`,
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    "output.mp4",
  ];
}

function webmArgs(input: string): string[] {
  return [
    "-i",
    input,
    "-c:v",
    "libvpx",
    "-b:v",
    "900k",
    "-crf",
    "32",
    "-deadline",
    "realtime",
    "-cpu-used",
    "8",
    "-vf",
    `scale=min(${MAX_WIDTH}\\,iw):-2`,
    "-c:a",
    "libopus",
    "-b:a",
    "96k",
    "output.webm",
  ];
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Video processing failed";
}

let ffmpegInstance: import("@ffmpeg/ffmpeg").FFmpeg | null = null;
let loadPromise: Promise<import("@ffmpeg/ffmpeg").FFmpeg> | null = null;

async function getFFmpeg(
  onProgress?: (ratio: number) => void,
): Promise<import("@ffmpeg/ffmpeg").FFmpeg> {
  if (ffmpegInstance?.loaded) {
    onProgress?.(0.25);
    return ffmpegInstance;
  }
  if (loadPromise) {
    const ffmpeg = await loadPromise;
    onProgress?.(0.25);
    return ffmpeg;
  }

  loadPromise = (async () => {
    onProgress?.(0.02);
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");

    const ffmpeg = new FFmpeg();
    const base = `${window.location.origin}/ffmpeg`;

    onProgress?.(0.05);
    const coreURL = await toBlobURL(
      `${base}/ffmpeg-core.js`,
      "text/javascript",
      true,
      ({ received, total }) => {
        if (total > 0) {
          onProgress?.(0.05 + 0.05 * (received / total));
        }
      },
    );
    const wasmURL = await toBlobURL(
      `${base}/ffmpeg-core.wasm`,
      "application/wasm",
      true,
      ({ received, total }) => {
        if (total > 0) {
          // WASM is ~31MB — this is the long wait. Map to 10%–24%.
          onProgress?.(0.1 + 0.14 * (received / total));
        }
      },
    );

    await ffmpeg.load({
      coreURL,
      wasmURL,
      classWorkerURL: `${base}/worker.js`,
    });
    onProgress?.(0.25);

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw new Error(errorMessage(err));
  }
}

async function runEncode(
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg,
  blob: Blob,
  format: TranscodeFormat,
  onProgress?: (ratio: number) => void,
): Promise<TranscodeResult> {
  const { fetchFile } = await import("@ffmpeg/util");
  const input = inputName(blob);
  const output = format === "mp4" ? "output.mp4" : "output.webm";
  const mimeType = format === "mp4" ? "video/mp4" : "video/webm";
  const args = format === "mp4" ? mp4Args(input) : webmArgs(input);

  const onProg = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    // ffmpeg sometimes reports >1 near the end; clamp and map into encode band.
    const t = Math.min(1, Math.max(0, progress));
    onProgress?.(0.25 + 0.75 * t);
  };
  ffmpeg.on("progress", onProg);

  try {
    onProgress?.(0.26);
    await ffmpeg.writeFile(input, await fetchFile(blob));
    onProgress?.(0.3);
    const code = await ffmpeg.exec(args);
    if (code !== 0) {
      throw new Error(`Video processing failed (exit ${code})`);
    }
    onProgress?.(0.95);
    const data = await ffmpeg.readFile(output);
    if (typeof data === "string") {
      throw new Error("Unexpected text output from video processor");
    }
    const bytes = new Uint8Array(data as Uint8Array);
    const copy = bytes.slice();
    onProgress?.(1);
    return {
      blob: new Blob([copy.buffer], { type: mimeType }),
      mimeType,
      format,
    };
  } finally {
    ffmpeg.off("progress", onProg);
    try {
      await ffmpeg.deleteFile(input);
    } catch {
      /* ignore */
    }
    try {
      await ffmpeg.deleteFile(output);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Re-encode a captured diary video for smaller size and wider playback.
 * Produces MP4 (H.264/AAC) or WebM (VP8/Opus). Defaults to MP4 on Safari/iOS.
 */
export async function transcodeVideo(
  blob: Blob,
  opts: TranscodeOptions = {},
): Promise<TranscodeResult> {
  const primary = opts.format ?? (prefersMp4() ? "mp4" : "webm");
  const fallback: TranscodeFormat = primary === "mp4" ? "webm" : "mp4";

  const ffmpeg = await getFFmpeg(opts.onProgress);

  try {
    return await runEncode(ffmpeg, blob, primary, opts.onProgress);
  } catch (primaryErr) {
    opts.onProgress?.(0.25);
    try {
      return await runEncode(ffmpeg, blob, fallback, opts.onProgress);
    } catch {
      throw new Error(errorMessage(primaryErr));
    }
  }
}

/**
 * Best-effort compress/rewrap. On failure, returns the original blob so save can proceed.
 */
export async function prepareVideoForSave(
  blob: Blob,
  opts: TranscodeOptions = {},
): Promise<Blob> {
  try {
    const result = await transcodeVideo(blob, opts);
    // Prefer smaller output; keep original if re-encode grew the file.
    if (result.blob.size > 0 && result.blob.size < blob.size * 1.15) {
      return result.blob;
    }
    return result.blob.size > 0 ? result.blob : blob;
  } catch (err) {
    console.warn("[prepareVideoForSave]", errorMessage(err));
    return blob;
  }
}
