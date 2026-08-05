"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { MIN_PASSCODE_LENGTH } from "@/lib/crypto";

export function AuthScreen() {
  const {
    status,
    profile,
    error,
    cryptoSupport,
    register,
    unlock,
    reset,
    clearError,
  } = useAuth();
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    clearError();
    setLocalError(null);
    if (passcode !== confirm) {
      setLocalError("Passcodes do not match.");
      setBusy(false);
      return;
    }
    try {
      await register(name, passcode);
      setPasscode("");
      setConfirm("");
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
      setPasscode("");
    } catch {
      /* surfaced via context */
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setBusy(true);
    try {
      await reset();
      setConfirmReset(false);
      setPasscode("");
      setConfirm("");
      setName("");
    } finally {
      setBusy(false);
    }
  }

  const shownError = localError ?? error;

  if (status === "loading") {
    return (
      <div className="auth-shell">
        <p className="text-ink-muted text-base">Opening your diary…</p>
      </div>
    );
  }

  if (status === "unsupported") {
    const insecure = cryptoSupport?.insecureContext;
    const localhostUrl = cryptoSupport?.localhostUrl;
    return (
      <div className="auth-shell">
        <BrandMark />
        {insecure ? (
          <div className="mt-8 max-w-md text-center text-lg text-ink-muted">
            <p>
              This page is open over an insecure connection (
              <span className="text-ink">{typeof window !== "undefined"
                ? window.location.host
                : "this host"}
              </span>
              ), so the browser hides the Web Crypto API used to lock your
              diary.
            </p>
            <p className="mt-4">
              Open it via{" "}
              <span className="font-medium text-ink">localhost</span> or HTTPS
              instead
              {localhostUrl ? (
                <>
                  :{" "}
                  <a className="text-accent underline" href={localhostUrl}>
                    {localhostUrl}
                  </a>
                </>
              ) : (
                "."
              )}
            </p>
          </div>
        ) : (
          <p className="mt-8 max-w-md text-center text-lg text-ink-muted">
            This browser does not support the Web Crypto API needed to lock your
            diary. Try a current version of Chrome, Safari, Edge, or Firefox over
            HTTPS (or localhost).
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel motion-safe:animate-rise">
        <BrandMark />
        <p className="mt-4 max-w-sm text-center text-base leading-relaxed text-ink-muted">
          A private journal that stays on this device—encrypted, unlockable only
          with your passcode.
        </p>

        {status === "unregistered" && (
          <form
            onSubmit={handleRegister}
            className="mt-10 flex w-full flex-col gap-4"
          >
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">Your name</span>
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How should we greet you?"
                autoComplete="name"
                required
                minLength={1}
                maxLength={64}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">Passcode</span>
              <input
                className="field"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={`At least ${MIN_PASSCODE_LENGTH} characters`}
                autoComplete="new-password"
                required
                minLength={MIN_PASSCODE_LENGTH}
                maxLength={128}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">
                Confirm passcode
              </span>
              <input
                className="field"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Enter the same passcode"
                autoComplete="new-password"
                required
                minLength={MIN_PASSCODE_LENGTH}
                maxLength={128}
              />
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Creating vault…" : "Create vault & open diary"}
            </button>
            <p className="text-center text-sm text-ink-muted">
              Your passcode never leaves this device. Only a salt and wrapped
              vault key are stored locally—no account, no cloud.
            </p>
          </form>
        )}

        {status === "locked" && profile && (
          <form
            onSubmit={handleUnlock}
            className="mt-10 flex w-full flex-col gap-4"
          >
            <p className="text-center text-lg text-ink">
              Welcome back,{" "}
              <span className="font-display font-semibold">
                {profile.displayName}
              </span>
            </p>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">Passcode</span>
              <input
                className="field"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter your passcode"
                autoComplete="current-password"
                required
                minLength={MIN_PASSCODE_LENGTH}
                maxLength={128}
                autoFocus
              />
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Unlocking…" : "Unlock diary"}
            </button>
            {!confirmReset ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setConfirmReset(true)}
                disabled={busy}
              >
                Reset this device vault
              </button>
            ) : (
              <div className="rounded-lg bg-danger-soft p-4 text-sm text-danger">
                <p className="font-medium">
                  This permanently deletes all encrypted entries on this device.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-danger flex-1"
                    onClick={handleReset}
                    disabled={busy}
                  >
                    Delete everything
                  </button>
                  <button
                    type="button"
                    className="btn-ghost flex-1"
                    onClick={() => setConfirmReset(false)}
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
          <p
            role="alert"
            className="mt-6 w-full rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            {shownError}
          </p>
        )}
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="font-display text-5xl font-semibold tracking-tight text-ink md:text-6xl">
        Dear Diary
      </p>
      <span className="h-1 w-16 rounded-full bg-accent" aria-hidden />
    </div>
  );
}
