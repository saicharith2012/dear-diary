"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { MIN_PASSCODE_LENGTH } from "@/lib/crypto";

export function ChangePasscodeModal({ onClose }: { onClose: () => void }) {
  const { changePasscode, clearError, error } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (next !== confirm) {
      setLocalError("New passcodes do not match.");
      return;
    }

    setBusy(true);
    try {
      await changePasscode(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      /* surfaced via context */
    } finally {
      setBusy(false);
    }
  }

  const shownError = localError ?? error;

  return (
    <div
      className="modal-overlay z-50"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="modal-panel motion-safe:animate-rise"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-passcode-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="change-passcode-title"
              className="font-display text-2xl font-semibold text-ink"
            >
              Change passcode
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Entries stay encrypted with the same vault key. Only the wrap that
              protects that key is updated.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost shrink-0"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
        </div>

        {done ? (
          <div className="mt-8 flex flex-col gap-4">
            <p className="rounded-lg bg-sage-soft px-4 py-3 text-sm text-sage">
              Passcode updated. Use the new passcode next time you unlock.
            </p>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">
                Current passcode
              </span>
              <input
                className="field"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
                minLength={MIN_PASSCODE_LENGTH}
                maxLength={128}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">New passcode</span>
              <input
                className="field"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder={`At least ${MIN_PASSCODE_LENGTH} characters`}
                autoComplete="new-password"
                required
                minLength={MIN_PASSCODE_LENGTH}
                maxLength={128}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">
                Confirm new passcode
              </span>
              <input
                className="field"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                minLength={MIN_PASSCODE_LENGTH}
                maxLength={128}
              />
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Updating…" : "Update passcode"}
            </button>
            {shownError && (
              <p
                role="alert"
                className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger"
              >
                {shownError}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
