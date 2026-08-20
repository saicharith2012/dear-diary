# Dear Diary → React Native (Expo) migration

## Context

`dear-diary` is a zero-backend, client-side encrypted journal (text / audio / video) built on Next.js 16.3 + React 19. Everything lives on-device: AES-256-GCM content encryption, a PBKDF2-wrapped master key, and 64 KiB encrypted chunks in IndexedDB. There is no server, no accounts, no API routes — `src/app/page.tsx` renders one client component and that is the whole app.

The goal is to ship the same product as a native iOS + Android app while **keeping the existing Next.js web app working**. The core domain logic (types, crypto, vault lifecycle, journal orchestration, auth state) is already platform-agnostic in spirit; the migration is mostly about replacing the four web-only substrates — IndexedDB, Web Crypto, MediaRecorder/getUserMedia, and Blob URLs — behind stable interfaces that both apps consume.

**Decisions already made:** monorepo with a shared core (web stays live); playback decrypts to a temp file in the app cache; `react-native-compressor` replaces ffmpeg.wasm on native; NativeWind v4 for styling.

**The key enabling fact:** `react-native-quick-crypto` v1.1.7 implements the full `SubtleCrypto` surface including `wrapKey`/`unwrapKey`/`deriveKey` with AES-GCM and PBKDF2. That means `src/lib/crypto.ts` and `src/lib/vault.ts` port essentially verbatim — the cryptographic design does not change at all.

---

## Target structure

Convert the repo to **npm workspaces** (already npm + a root `package-lock.json`; no need for pnpm/Turborepo at this size).

```
dear-diary/
  package.json            # workspaces: ["apps/*", "packages/*"]
  apps/
    web/                  # current repo contents move here verbatim
      src/app/            # layout.tsx, page.tsx, globals.css
      src/components/     # the 11 existing components, unchanged
      public/ffmpeg/      # + scripts/copy-ffmpeg-assets.mjs
    mobile/               # new Expo app (SDK 56)
      app/                # expo-router routes
      src/components/     # RN component set
  packages/
    core/                 # shared, platform-aware
      src/types.ts
      src/crypto.ts
      src/journal.ts
      src/vault.ts
      src/auth-context.tsx
      src/storage.ts       # interface + re-export
      src/storage.web.ts   # existing IndexedDB impl
      src/storage.native.ts# new expo-sqlite + expo-file-system impl
      src/transcode.web.ts / transcode.native.ts
      src/base64.web.ts / base64.native.ts
```

**Platform resolution — use explicit adapter injection, not file extensions.** Metro resolves `.native.ts`/`.ios.ts` automatically; Next.js/webpack does not, and wiring webpack `resolve.extensions` for a workspace package is fragile and easy to break silently. Instead:

- `packages/core/src/storage.ts` declares a `StorageAdapter` interface matching today's exports exactly (`getProfile`, `saveProfile`, `clearProfile`, `listEntries`, `getEntry`, `saveEntry`, `deleteEntryRecord`, `saveChunk`, `loadChunk`, `deleteChunks`, `wipeAllData`) plus `setStorageAdapter(a)`.
- Each app calls `setStorageAdapter()` once at boot — web in `App.tsx`, mobile in `app/_layout.tsx`. Same pattern for `transcode` and `base64`.
- `journal.ts` / `vault.ts` import the module-level accessor and never know which platform they're on.

This keeps the Next.js build untouched (it just imports a plain TS package) and keeps Metro from needing custom resolver config.

---

## Work by area

### 1. Shared core extraction (web must stay green)

Move `src/lib/{types,crypto,journal,vault,auth-context}.ts(x)` into `packages/core/src/` unchanged except:

- `crypto.ts`: replace `btoa`/`atob` in `toBase64`/`fromBase64` with the injected base64 adapter (`base64-js` on native, `btoa`/`atob` on web). `TextEncoder`/`TextDecoder` exist in Hermes on RN 0.74+ — verify at runtime, and fall back to `text-encoding` if not.
- `vault.ts`: `getCryptoSupportInfo()` is web-only (`window.isSecureContext`). Keep it in the web app, or have the native adapter return `{supported: true, insecureContext: false, localhostUrl: null}`.
- `journal.ts`: `attachStreamingPlayback()` is dead — delete it. `crypto.randomUUID()` is provided by react-native-quick-crypto.
- `auth-context.tsx` ports unchanged (Context + `useState`; `masterKey` never persisted).

Update `apps/web` imports from `@/lib/*` → `@dear-diary/core`. **Verify web still builds and runs before touching anything else.**

### 2. Storage rewrite (`storage.native.ts`) — the one file that must be fully rebuilt

Recommendation: **`expo-sqlite` for metadata + `expo-file-system` for ciphertext, one file per entry.**

- `profile` and `entries` → two SQLite tables. Keep a single cached `openDatabaseAsync` handle at module scope (today's web version calls `openDb()` on *every* operation, including inside the per-chunk save loop — fix that during the port).
- Chunks → **one encrypted file per entry** at `${documentDirectory}vault/${entryId}.bin`, with each 64 KiB chunk written sequentially. The on-disk chunk format is unchanged (`[12-byte IV][ciphertext+tag]`), so chunk size is fixed at `CHUNK_PLAIN_SIZE + 12 + 16 = 65564` bytes and chunk *i* lives at offset `i * 65564`. `loadChunk(entryId, i)` becomes a `readAsStringAsync` with `position`/`length`.

Why one file rather than 800 files or 800 SQLite BLOB rows: a 50 MB video is ~800 chunks. 800 filesystem entries per video is pathological for delete/enumerate; 800 BLOB rows bloats the DB and complicates `wipeAllData`. One file keeps `deleteChunks()` to a single `deleteAsync` and makes the decrypt-to-temp-file playback path a clean sequential read.

**Base64 round-trip cost is the main risk here.** `expo-file-system` is string-based, so every chunk pays a base64 encode on write and decode on read (~33% size inflation plus conversion). Mitigations, in order: (a) batch — encrypt and concatenate N chunks in memory, then do one write per batch rather than per chunk; (b) if measurement shows this dominates, switch the chunk store to `expo-sqlite`'s BLOB support, which avoids base64 entirely. **Measure before optimizing** — benchmark a 50 MB save early in Milestone 3 and let the number decide.

Drop the dead `keys` object store and the unused `byCreated` index; sorting stays in `listEntries()` (or becomes `ORDER BY createdAt DESC` in SQL, which is free).

### 3. Crypto integration

Install `react-native-quick-crypto`. In `apps/mobile/index.js` (before anything else imports core):

```js
import { install } from 'react-native-quick-crypto';
install();  // patches global.crypto incl. crypto.subtle and randomUUID
```

`crypto.ts` and `vault.ts` then need **no algorithmic changes** — same AES-256-GCM, same PBKDF2-SHA-256 @ 310k iterations, same wrap/unwrap flow, same IV-prefix payload layout. Requires a **dev build** (`npx expo prebuild` + `expo run:ios/android`); this will not run in Expo Go.

### 4. Media pipeline

**Capture → save:**
1. `expo-camera` (video) / `expo-audio` (voice) records to a cache file URI — already H.264/AAC MP4 or M4A natively, no WebM.
2. `prepareVideoForSave()` native adapter → `react-native-compressor`'s `Video.compress()` with the same `onProgress(ratio)` shape, preserving the existing best-effort contract (return original on failure; keep original if output grew >1.15×).
3. Read the file, encrypt in 64 KiB chunks, append to `vault/${id}.bin`, insert the `JournalEntryMeta` row.
4. `DiaryApp`'s `runBackgroundSave()` progress bands (video 0–78% transcode / 78–100% encrypt) carry over unchanged.

**Playback:**
1. Decrypt chunks sequentially from `vault/${id}.bin` into `${cacheDirectory}playback/${id}.${ext}`, driving the existing "Decrypting… N%" UI off chunk count.
2. Hand the `file://` URI to `expo-video` / `expo-audio`.
3. **Temp-file lifecycle:** delete on player unmount, on `lock()`, and on `AppState` change to `background`. Also sweep `cacheDirectory/playback/` on app boot to clean up after crashes. This is the security-relevant part of the decrypt-to-temp-file tradeoff and must not be skipped.

### 5. Component port map

| Web | Native |
|---|---|
| `App.tsx` | `app/_layout.tsx` — adapter injection + `AuthProvider` + auth gate |
| `AuthScreen.tsx` | RN screen; `TextInput` with `secureTextEntry` |
| `DiaryApp.tsx` | Two-pane desktop layout → **expo-router** stack: list screen → detail screen. Save-progress banner stays on the list screen. |
| `EntryList.tsx` | `FlatList`; swipe-to-delete instead of hover-reveal trash |
| `EntryDetail.tsx` | Detail route |
| `Composer.tsx` | Modal route (`presentation: 'modal'`) with the same text/audio/video tabs |
| `AudioRecorder.tsx` | `expo-audio` recording API |
| `VideoRecorder.tsx` | `expo-camera` `CameraView` + `recordAsync()` |
| `MediaPlayer.tsx` | `expo-video` `VideoView` / `expo-audio` player, fed the temp-file URI |
| `FullscreenVideo.tsx` | Delete. `expo-video` has native fullscreen; pair with `expo-screen-orientation`. |
| `ChangePasscodeModal.tsx` | Modal route |
| `window.confirm` | `Alert.alert` |

Styling: NativeWind v4 with the existing tokens (`ink`, `ink-muted`, `paper`, `accent`, `sage`, `danger`) ported into a `tailwind.config.js`. The ~40 `@layer components` classes get re-declared; layout classes need genuine rethinking for a phone. The `body::before` feTurbulence noise overlay and `color-mix()` have no RN equivalent — use a flat tint or a small PNG.

Fonts: `next/font/google` → `expo-font` with bundled Fraunces + Figtree files.

### 6. Main-thread encryption

`encryptInChunks()` is a sequential `await` loop. react-native-quick-crypto is JSI/C++ and each 64 KiB AES-GCM op is sub-millisecond, so raw crypto throughput is not the concern — **the base64 and file I/O around it are**. Start by measuring a 50 MB save. If the UI janks, the cheap fix is to `await` a yield every N chunks so React can paint the progress bar (the codebase already has this instinct in `yieldToUi()`). Do not reach for worklets or a custom native module unless measurement proves it necessary.

---

## Milestones

Each ends in something runnable.

1. **Monorepo + core extraction.** npm workspaces, move web into `apps/web`, extract `packages/core` with adapter interfaces. *Verify: web app builds and works exactly as before.*
2. **Expo app skeleton.** SDK 56 + dev build + NativeWind + fonts + expo-router. Install quick-crypto; wire `AuthProvider`. *Verify: register a vault, lock, unlock with the right passcode, get rejected with a wrong one.*
3. **Native storage + text entries.** `storage.native.ts`, entry list, composer, detail. *Verify: create/read/delete text entries; benchmark a large synthetic save.*
4. **Audio.** expo-audio record → encrypt → decrypt-to-temp-file → play, with cleanup.
5. **Video.** expo-camera + react-native-compressor + fullscreen playback.
6. **Polish.** Change passcode, reset vault, background/lock temp-file wipe, boot-time cache sweep, permissions copy, app icons.

---

## Verification

- **Web regression (after every milestone):** `npm run build -w apps/web` and manual pass — register, unlock, create one entry of each type, play back, change passcode, reset.
- **Native:** `npx expo run:ios` / `run:android` on a dev build. Per-milestone flows as listed above.
- **Crypto parity:** write a small Node script that generates a vault with the web code path and unwraps it with the shared `vault.ts` — confirms the PBKDF2/AES-GCM parameters didn't drift during extraction.
- **Security checks:** after playing a video, confirm `cacheDirectory/playback/` is empty; confirm it's also empty after locking and after backgrounding the app.
- **Perf:** record a ~2 minute video, time compress → encrypt → save, and watch for dropped frames on the progress bar.

## Risks

- **Dev build required** — quick-crypto, expo-camera, and compressor are all native modules. No Expo Go.
- **NativeWind + Metro + workspaces** need `watchFolders` pointing at `packages/core` and `nodeModulesPaths` configured; this is the most common source of "module not found" churn.
- **babel-plugin-react-compiler** is on in the web app. Don't enable it in the Expo app initially — add it only after the app is stable.
- **Permissions:** camera + microphone entries in `app.json` for both platforms; handle denial gracefully (the web app already has this branch).
- **No data migration path.** IndexedDB contents cannot transfer to a phone. Existing web vaults stay on the web; this is inherent to the product's design and should be stated in the README.
- **Playback tradeoff:** decrypted media briefly exists as a plaintext file in the app sandbox. It's OS-encrypted at rest and unreadable by other apps, but it's a real narrowing of the current guarantee — document it in the README's privacy notes alongside the existing brute-force caveat.
