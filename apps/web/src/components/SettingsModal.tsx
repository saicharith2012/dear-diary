"use client";

import { useEffect, useState } from "react";
import { useAuth, type JournalEntryMeta } from "@dear-diary/core";
import { createBackup } from "@/lib/backup";
import { downloadBlob, formatBytes, plural, shortDateTime } from "@/lib/format";
import {
  AUTO_LOCK_OPTIONS,
  setPrefs,
  usePrefs,
  type ThemePref,
} from "@/lib/prefs";
import { ChangePasscodeModal } from "./ChangePasscodeModal";
import { useFeedback } from "./Feedback";
import { DownloadIcon } from "./Icons";
import { Modal } from "./Modal";

const THEMES: { value: ThemePref; label: string }[] = [
  { value: "system", label: "Match device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function autoLockLabel(minutes: number): string {
  if (minutes === 0) return "Never";
  if (minutes === 60) return "After 1 hour";
  return `After ${plural(minutes, "minute")}`;
}

export function SettingsModal({
  entries,
  saving,
  onClose,
}: {
  entries: JournalEntryMeta[];
  /** An entry is being saved; hold off on backups and deletion. */
  saving: boolean;
  onClose: () => void;
}) {
  const { profile, updateDisplayName, reset } = useAuth();
  const { toast, confirm } = useFeedback();
  const prefs = usePrefs();
  const [name, setName] = useState(profile?.displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [changingPasscode, setChangingPasscode] = useState(false);
  const [backupProgress, setBackupProgress] = useState<number | null>(null);
  const [deviceUsage, setDeviceUsage] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    navigator.storage
      ?.estimate?.()
      .then((estimate) => {
        if (!cancelled && typeof estimate.usage === "number") {
          setDeviceUsage(estimate.usage);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const contentBytes = entries.reduce((n, e) => n + e.plainSize, 0);
  const nameChanged =
    name.trim() !== "" && name.trim() !== (profile?.displayName ?? "");
  const working = backupProgress !== null;

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!nameChanged) return;
    setSavingName(true);
    try {
      await updateDisplayName(name);
      toast("Name saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the name.", "error");
    } finally {
      setSavingName(false);
    }
  }

  async function downloadBackup() {
    setBackupProgress(0);
    try {
      const { blob, fileName, entryCount } = await createBackup((ratio) =>
        setBackupProgress(Math.round(ratio * 100)),
      );
      downloadBlob(blob, fileName);
      toast(`Backup of ${plural(entryCount, "entry", "entries")} downloaded`);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not create the backup.",
        "error",
      );
    } finally {
      setBackupProgress(null);
    }
  }

  async function deleteVault() {
    const ok = await confirm({
      title: "Delete this diary?",
      message: (
        <>
          This permanently deletes{" "}
          {entries.length > 0
            ? `all ${plural(entries.length, "entry", "entries")}`
            : "the vault"}{" "}
          and the passcode from this device. Download a backup first if you
          might want them back.
        </>
      ),
      confirmLabel: "Delete everything",
      danger: true,
    });
    if (!ok) return;
    await reset();
    toast("Vault deleted from this device");
  }

  return (
    <>
      <Modal title="Settings" onClose={onClose} locked={working} wide>
        <div className="mt-6">
          <section className="settings-section">
            <h3>Your name</h3>
            <form onSubmit={saveName} className="settings-row">
              <input
                className="field min-w-0 flex-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                aria-label="Your name"
                autoComplete="name"
              />
              <button
                type="submit"
                className="btn-secondary"
                disabled={!nameChanged || savingName}
              >
                Save name
              </button>
            </form>
          </section>

          <section className="settings-section">
            <h3>Appearance</h3>
            <div className="settings-row">
              <div className="segmented" role="group" aria-label="Theme">
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={prefs.theme === t.value}
                    onClick={() => setPrefs({ theme: t.value })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>Security</h3>
            <div className="settings-row">
              <label htmlFor="auto-lock" className="text-sm text-ink-muted">
                Lock the diary when you’ve been away
              </label>
              <select
                id="auto-lock"
                className="field"
                value={prefs.autoLockMinutes}
                onChange={(e) =>
                  setPrefs({ autoLockMinutes: Number(e.target.value) })
                }
              >
                {AUTO_LOCK_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {autoLockLabel(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-row">
              <p className="text-sm text-ink-muted">
                The passcode is the only key to your entries.
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setChangingPasscode(true)}
              >
                Change passcode
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3>Backup</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Entries live only in this browser. Clearing site data, or losing
              the device, loses them. A backup file stays encrypted and opens
              with the passcode you have today; restore it from the start
              screen of a new browser or device.
            </p>
            <div className="settings-row">
              <p className="text-sm text-ink-muted">
                {plural(entries.length, "entry", "entries")},{" "}
                {formatBytes(contentBytes)}
                {deviceUsage !== null &&
                  ` (${formatBytes(deviceUsage)} used on this device)`}
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={downloadBackup}
                disabled={working || saving}
              >
                <DownloadIcon />
                {working
                  ? `Preparing backup… ${backupProgress}%`
                  : "Download backup"}
              </button>
            </div>
            {profile && (
              <p className="mt-3 text-xs text-ink-muted">
                Diary started {shortDateTime(profile.createdAt)}
              </p>
            )}
          </section>

          <section className="settings-section">
            <h3>Delete diary</h3>
            <div className="settings-row">
              <p className="max-w-sm text-sm text-ink-muted">
                Removes every entry and the passcode from this device. This
                can’t be undone.
              </p>
              <button
                type="button"
                className="btn-ghost !text-danger"
                onClick={deleteVault}
                disabled={working || saving}
              >
                Delete diary…
              </button>
            </div>
          </section>
        </div>
      </Modal>

      {changingPasscode && (
        <ChangePasscodeModal onClose={() => setChangingPasscode(false)} />
      )}
    </>
  );
}
