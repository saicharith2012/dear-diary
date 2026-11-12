# Dear Diary

A private **text / audio / video** journal built with Next.js. Everything stays on your device—locked with a **passcode**, stored **encrypted**, and decrypted **chunk-by-chunk** on playback. No accounts, JWT, database, or backend.

## Features

- **Passcode unlock** — your code never leaves the device
- **AES-256-GCM** encryption of all entry content
- **PBKDF2** derives a wrapping key; only salt + wrapped vault key are stored
- **64 KiB encrypted chunks** in IndexedDB for media and notes
- **Streaming decrypt** on replay (pull-based chunk decryption → Blob URL)
- Text notes, voice notes, and video diary entries
- **Edit** written notes; rename, star, and set a mood on any entry
- **Search** across titles and the text of written notes, with filters by type and starred
- **Encrypted backup file** — download from Settings, restore from the start screen of a new browser
- **Auto-lock** after inactivity (default 15 minutes, configurable)
- Light / dark theme, phone-sized layout, keyboard shortcuts (`N` new entry, `/` search)
- Download an unencrypted copy of a single entry

## Repo layout

This is an npm workspaces monorepo. The web app and the (in-progress) React
Native app share one platform-agnostic domain core.

```
apps/web/          Next.js app — components, IndexedDB storage, ffmpeg.wasm transcode
packages/core/     types, crypto, vault, journal, auth state + adapter interfaces
```

`packages/core` never imports a platform API directly. It declares adapter
interfaces (`StorageAdapter`, `Base64Adapter`, `PlatformAdapter`) and each app
injects its implementations once at startup — the web app in
`apps/web/src/lib/adapters.ts`. That keeps the Next.js build free of custom
module resolution while letting a native app supply SQLite and the filesystem
instead of IndexedDB.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other commands, all from the repo root:

```bash
npm run build           # production build of the web app
npm run lint            # eslint over apps/web
npm run typecheck       # tsc --noEmit in every workspace
npm run verify:crypto   # prove the shared core is byte-compatible with the
                        # pre-monorepo crypto (see scripts/verify-crypto-parity.mjs)
```

## How encryption works

1. On first launch you choose a display name and passcode, and a random AES-256 master key is generated.
2. PBKDF2-SHA-256 (with a random salt) derives a wrapping key from your passcode; the master key is wrapped with AES-GCM and stored in IndexedDB.
3. The passcode itself is never stored—only salt, iteration count, and the wrapped key blob.
4. Text and media are encrypted in fixed-size chunks before write.
5. On play/read, chunks are loaded and decrypted in order through a `ReadableStream`.

## Privacy notes

- Clearing site data permanently destroys the vault.
- Entries never leave the browser origin.
- Use Lock when stepping away; the master key is held only in memory while unlocked.
- A weak passcode can be brute-forced offline by anyone with your IndexedDB data—prefer a long passphrase.
- Entry **content** is encrypted. Entry **details** — title, date, type, mood, star, size — are stored unencrypted so the list can render without decrypting everything; don't put secrets in a title.
- While unlocked, written notes are decrypted into memory for search and list previews; locking discards them.
- A backup file is the vault exactly as stored (still encrypted) and opens with the passcode in use when it was made.
- Theme and auto-lock preferences live in `localStorage`, outside the vault.
- Change passcode (while unlocked) re-wraps the same vault key; entries are not re-encrypted.
