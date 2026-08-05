import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "ffmpeg");
// Module workers need the ESM build (UMD fails with "failed to import ffmpeg-core.js").
const coreDir = join(root, "node_modules", "@ffmpeg", "core", "dist", "esm");
const esmDir = join(root, "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm");

if (!existsSync(coreDir) || !existsSync(esmDir)) {
  console.warn(
    "[copy-ffmpeg-assets] @ffmpeg packages missing; skip (run npm install).",
  );
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  cpSync(join(coreDir, file), join(outDir, file));
}

for (const file of ["worker.js", "const.js", "errors.js", "utils.js"]) {
  cpSync(join(esmDir, file), join(outDir, file));
}

console.log("[copy-ffmpeg-assets] Copied ESM ffmpeg assets to public/ffmpeg/");
