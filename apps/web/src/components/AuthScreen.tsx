"use client";

import { useRef, useState } from "react";
import { useAuth } from "@dear-diary/core";
import { restoreBackup } from "@/lib/backup";
import { plural } from "@/lib/format";
import { useFeedback } from "./Feedback";
import { LockIcon } from "./Icons";
import { PasscodeField } from "./PasscodeField";

export function AuthScreen() {
  const {
    status,
    profile,
    error,
    cryptoSupport,
    register,
    unlock,
    reset,
    reloadVault,
    clearError,
  } = useAuth();
  const { toast } = useFeedback();
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [restoreProgress, setRestoreProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setLocalError(null);
    if (passcode !== confirm) {
      setLocalError("The two passcodes don’t match.");
      return;
    }
    setBusy(true);
    try {
      await register(name, passcode);
    } catch {
      /* surfaced via context */
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    clearError();
    setLocalError(null);
    try {
      await unlock(passcode);
    } catch {
      setPasscode("");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setBusy(true);
    try {
      await reset();
      setConfirmReset(false);
      setResetPhrase("");
      setPasscode("");
      setConfirm("");
      setName("");
      toast("Vault deleted from this device");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(file: File) {
    clearError();
    setLocalError(null);
    setBusy(true);
    setRestoreProgress(0);
    try {
      const summary = await restoreBackup(file, (ratio) =>
        setRestoreProgress(Math.round(ratio * 100)),
      );
      await reloadVault();
      toast(
        `Restored ${plural(summary.entryCount, "entry", "entries")}. Unlock with that backup’s passcode.`,
      );
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Could not restore that backup.",
      );
    } finally {
      setBusy(false);
      setRestoreProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const shownError = localError ?? error;

  if (status === "loading") {
    return (
      <div className="auth-shell" role="status">
        <p className="text-base text-ink-muted">Opening your diary…</p>
      </div>
    );
  }

  if (status === "unsupported") {
    const insecure = cryptoSupport?.insecureContext;
    const localhostUrl = cryptoSupport?.localhostUrl;
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <BrandMark />
          {insecure ? (
            <div className="mt-8 max-w-md text-center text-base leading-relaxed text-ink-muted">
              <p>
                This page is open over an insecure connection (
                <span className="text-ink">
                  {typeof window !== "undefined"
                    ? window.location.host
                    : "this host"}
                </span>
                ), so the browser hides the encryption features that lock your
                diary.
              </p>
              <p className="mt-4">
                Open it via{" "}
                <span className="font-medium text-ink">localhost</span> or HTTPS
                instead
                {localhostUrl ? (
                  <>
                    :{" "}
                    <a
                      className="font-medium text-accent-text underline"
                      href={localhostUrl}
                    >
                      {localhostUrl}
                    </a>
                  </>
                ) : (
                  "."
                )}
              </p>
            </div>
          ) : (
            <p className="mt-8 max-w-md text-center text-base leading-relaxed text-ink-muted">
              This browser can’t encrypt your diary. Use a current version of
              Chrome, Safari, Edge, or Firefox over HTTPS (or localhost).
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <main className="auth-panel motion-safe:animate-rise">
        <BrandMark />

        {status === "unregistered" && (
          <>
            <p className="mt-4 max-w-sm text-center text-base leading-relaxed text-ink-muted">
              A private journal for words, voice, and video. It stays on this
              device, encrypted, and opens only with your passcode.
            </p>
            <form
              onSubmit={handleRegister}
              className="mt-8 flex w-full flex-col gap-4"
            >
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink">Your name</span>
                <input
                  className="field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What should the diary call you?"
                  autoComplete="name"
                  required
                  maxLength={64}
                  disabled={busy}
                />
              </label>
              <PasscodeField
                label="Passcode"
                value={passcode}
                onChange={setPasscode}
                autoComplete="new-password"
                placeholder="A long phrase is safest"
                showStrength
                disabled={busy}
              />
              <PasscodeField
                label="Confirm passcode"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                disabled={busy}
              />
              <p className="notice notice-ok">
                There is no “forgot passcode”. If you lose it, the entries can’t
                be recovered by anyone.
              </p>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy && restoreProgress === null
                  ? "Creating your diary…"
                  : "Create diary"}
              </button>
            </form>

            <div className="mt-6 w-full border-t border-line pt-5 text-center">
              <input
                ref={fileRef}
                type="file"
                accept=".ddbackup,application/octet-stream"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleRestore(file);
                }}
              />
              {restoreProgress === null ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  Restore from a backup file
                </button>
              ) : (
                <div role="status" aria-live="polite">
                  <p className="text-sm font-medium text-ink">
                    Restoring backup… {restoreProgress}%
                  </p>
                  <div className="progress-track mt-2">
                    <div
                      className="progress-fill"
                      style={{ width: `${restoreProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {status === "locked" && profile && (
          <form
            onSubmit={handleUnlock}
            className="mt-8 flex w-full flex-col gap-4"
          >
            <p className="flex items-center justify-center gap-2 text-center text-lg text-ink">
              <LockIcon className="text-ink-muted" />
              <span>
                Welcome back,{" "}
                <span className="font-display font-semibold">
                  {profile.displayName}
                </span>
              </span>
            </p>
            <PasscodeField
              label="Passcode"
              value={passcode}
              onChange={(v) => {
                setPasscode(v);
                if (error) clearError();
              }}
              autoComplete="current-password"
              autoFocus
              disabled={busy}
            />
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy && !confirmReset ? "Unlocking…" : "Unlock diary"}
            </button>
            {!confirmReset ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setConfirmReset(true)}
                disabled={busy}
              >
                Forgot passcode?
              </button>
            ) : (
              <div className="notice notice-danger">
                <p className="font-semibold">
                  A forgotten passcode can’t be recovered.
                </p>
                <p className="mt-1">
                  The only way forward is to delete this device’s vault and
                  every entry in it, then start a new diary. Type{" "}
                  <span className="font-semibold">delete</span> to confirm.
                </p>
                <input
                  className="field mt-3"
                  value={resetPhrase}
                  onChange={(e) => setResetPhrase(e.target.value)}
                  aria-label="Type delete to confirm"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn-danger flex-1"
                    onClick={handleReset}
                    disabled={
                      busy || resetPhrase.trim().toLowerCase() !== "delete"
                    }
                  >
                    Delete everything
                  </button>
                  <button
                    type="button"
                    className="btn-ghost flex-1"
                    onClick={() => {
                      setConfirmReset(false);
                      setResetPhrase("");
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        {shownError && (
          <p role="alert" className="notice notice-danger mt-6 w-full">
            {shownError}
          </p>
        )}
      </main>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex flex-col items-center gap-2">
      <h1 className="font-display text-5xl font-semibold tracking-tight text-ink md:text-6xl">
        Dear Diary
      </h1>
      <span className="h-1 w-16 rounded-full bg-accent" aria-hidden />
    </div>
  );
}
