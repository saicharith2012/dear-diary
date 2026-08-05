"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getAllEntries, removeEntry } from "@/lib/journal";
import type { JournalEntryMeta } from "@/lib/types";
import { ChangePasscodeModal } from "./ChangePasscodeModal";
import { Composer } from "./Composer";
import { EntryDetail } from "./EntryDetail";
import { EntryList } from "./EntryList";

export function DiaryApp() {
  const { profile, masterKey, lock } = useAuth();
  const [entries, setEntries] = useState<JournalEntryMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [changingPasscode, setChangingPasscode] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await getAllEntries();
    setEntries(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAllEntries().then((list) => {
      if (cancelled) return;
      setEntries(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  async function handleDelete(entry: JournalEntryMeta) {
    if (!confirm(`Delete “${entry.title}”? This cannot be undone.`)) return;
    await removeEntry(entry);
    if (selectedId === entry.id) setSelectedId(null);
    await refresh();
  }

  if (!masterKey) return null;

  return (
    <div className="diary-shell">
      <header className="diary-header">
        <div>
          <p className="font-display text-2xl font-semibold text-ink md:text-3xl">
            Dear Diary
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {profile?.displayName}
            {" · passcode vault"}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setComposing(true)}>
            New entry
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setChangingPasscode(true)}
          >
            Change passcode
          </button>
          <button type="button" className="btn-ghost" onClick={lock}>
            Lock
          </button>
        </div>
      </header>

      <div className="diary-body">
        <aside className="diary-sidebar">
          {loading ? (
            <p className="px-4 py-8 text-sm text-ink-muted">Loading entries…</p>
          ) : (
            <EntryList
              entries={entries}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDelete={handleDelete}
            />
          )}
        </aside>

        <main className="diary-main">
          {selected && masterKey ? (
            <EntryDetail
              key={selected.id}
              entry={selected}
              masterKey={masterKey}
              onDeleted={() => {
                setSelectedId(null);
                void refresh();
              }}
            />
          ) : (
            <EmptyState onNew={() => setComposing(true)} hasEntries={entries.length > 0} />
          )}
        </main>
      </div>

      {composing && (
        <Composer
          masterKey={masterKey}
          onClose={() => setComposing(false)}
          onCreated={async (entry) => {
            setComposing(false);
            await refresh();
            setSelectedId(entry.id);
          }}
        />
      )}

      {changingPasscode && (
        <ChangePasscodeModal onClose={() => setChangingPasscode(false)} />
      )}
    </div>
  );
}

function EmptyState({
  onNew,
  hasEntries,
}: {
  onNew: () => void;
  hasEntries: boolean;
}) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-8 text-center">
      <p className="font-display text-3xl font-semibold text-ink">
        {hasEntries ? "Pick a page" : "Today is unwritten"}
      </p>
      <p className="mt-3 max-w-sm text-base text-ink-muted">
        {hasEntries
          ? "Choose an entry from the list, or start a new one."
          : "Capture a thought, a voice note, or a short video—stored only on this device."}
      </p>
      <button type="button" className="btn-primary mt-8" onClick={onNew}>
        Write today’s entry
      </button>
    </div>
  );
}
