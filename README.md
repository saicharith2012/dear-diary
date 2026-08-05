# Dear Diary

A private **text / audio / video** journal built with Next.js. Everything stays on your device—locked with a **passcode**, stored **encrypted**, and decrypted **chunk-by-chunk** on playback. No accounts, JWT, database, or backend.

## Features

- **Passcode unlock** — your code never leaves the device
- **AES-256-GCM** encryption of all entry content
- **PBKDF2** derives a wrapping key; only salt + wrapped vault key are stored
- **64 KiB encrypted chunks** in IndexedDB for media and notes
- **Streaming decrypt** on replay (pull-based chunk decryption → Blob URL)
- Text notes, voice notes, and video diary entries

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
- Change passcode (while unlocked) re-wraps the same vault key; entries are not re-encrypted.
