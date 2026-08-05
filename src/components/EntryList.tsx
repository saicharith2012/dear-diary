"use client";

import type { JournalEntryMeta } from "@/lib/types";

const TYPE_LABEL: Record<JournalEntryMeta["type"], string> = {
  text: "Text",
  audio: "Audio",
  video: "Video",
};

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function EntryList({
  entries,
  selectedId,
  onSelect,
  onDelete,
}: {
  entries: JournalEntryMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (entry: JournalEntryMeta) => void;
}) {
  if (entries.length === 0) {
    return (
      <p className="px-4 py-8 text-sm text-ink-muted">
        No entries yet. Your encrypted pages will appear here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1 p-2" role="list">
      {entries.map((entry) => {
        const active = entry.id === selectedId;
        return (
          <li key={entry.id}>
            <div
              className={`entry-row group ${active ? "entry-row-active" : ""}`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onSelect(entry.id)}
              >
                <span className="block truncate font-medium text-ink">
                  {entry.title}
                </span>
                <span className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                  <span className="type-chip">{TYPE_LABEL[entry.type]}</span>
                  <span>{formatDate(entry.createdAt)}</span>
                </span>
              </button>
              <button
                type="button"
                className="btn-icon opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                aria-label={`Delete ${entry.title}`}
                onClick={() => onDelete(entry)}
              >
                <TrashIcon />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7h12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
