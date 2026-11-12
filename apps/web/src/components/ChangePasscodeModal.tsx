"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@dear-diary/core";
import { useFeedback } from "./Feedback";
import { Modal } from "./Modal";
import { PasscodeField } from "./PasscodeField";

export function ChangePasscodeModal({ onClose }: { onClose: () => void }) {
  const { changePasscode, clearError, error } = useAuth();
  const { toast } = useFeedback();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (next !== confirm) {
      setLocalError("The two new passcodes don’t match.");
      return;
    }

    setBusy(true);
    try {
      await changePasscode(current, next);
      toast("Passcode changed");
      onClose();
    } catch {
      /* surfaced via context */
    } finally {
      setBusy(false);
    }
  }

  const shownError = localError ?? error;

  return (
    <Modal
      title="Change passcode"
      description="Your entries aren’t touched. Backups made before now still open with the old passcode."
      onClose={onClose}
      locked={busy}
    >
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <PasscodeField
          label="Current passcode"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          autoFocus
          disabled={busy}
        />
        <PasscodeField
          label="New passcode"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          placeholder="A long phrase is safest"
          showStrength
          disabled={busy}
        />
        <PasscodeField
          label="Confirm new passcode"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          disabled={busy}
        />
        {shownError && (
          <p role="alert" className="notice notice-danger">
            {shownError}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Changing passcode…" : "Change passcode"}
        </button>
      </form>
    </Modal>
  );
}
