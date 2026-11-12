import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "ffmpeg");

/**
 * npm workspaces hoist dependencies to the repo root, so resolve each package
 * rather than assuming it sits under this app's own node_modules.
 */
function packageDir(name) {
  let dir;
  try {
    dir = dirname(require.resolve(name));
  } catch {
    return null;
  }
  while (dir !== dirname(dir)) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      try {
        if (JSON.parse(readFileSync(manifest, "utf8")).name === name) return dir;
      } catch {
        /* keep walking */
      }
    }
    dir = dirname(dir);
  }
  return null;
}

const corePkg = packageDir("@ffmpeg/core");
const ffmpegPkg = packageDir("@ffmpeg/ffmpeg");

// Module workers need the ESM build (UMD fails with "failed to import ffmpeg-core.js").
const coreDir = corePkg && join(corePkg, "dist", "esm");
const esmDir = ffmpegPkg && join(ffmpegPkg, "dist", "esm");

if (!coreDir || !esmDir || !existsSync(coreDir) || !existsSync(esmDir)) {
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
