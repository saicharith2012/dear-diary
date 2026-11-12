"use client";

import type { JournalEntryMeta } from "@dear-diary/core";
import {
  MOOD_META,
  excerpt,
  formatClock,
  monthLabel,
  timeOfDay,
} from "@/lib/format";
import { StarIcon, TYPE_ICON } from "./Icons";

function weekday(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
    new Date(ts),
  );
}

function groupByMonth(
  entries: JournalEntryMeta[],
): { label: string; items: JournalEntryMeta[] }[] {
  const groups: { label: string; items: JournalEntryMeta[] }[] = [];
  for (const entry of entries) {
    const label = monthLabel(entry.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }
  return groups;
}

export function EntryList({
  entries,
  selectedId,
  onSelect,
  bodies,
  query,
}: {
  /** Already filtered, newest first. */
  entries: JournalEntryMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Decrypted text of written notes, by entry id, as it becomes available. */
  bodies: Record<string, string>;
  query: string;
}) {
  return (
    <div className="pb-2">
      {groupByMonth(entries).map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2 className="month-heading">{group.label}</h2>
          <ul className="flex flex-col gap-0.5 px-2" role="list">
            {group.items.map((entry) => {
              const active = entry.id === selectedId;
              const TypeIcon = TYPE_ICON[entry.type];
              const body = bodies[entry.id];
              const detail =
                entry.type === "text"
                  ? body !== undefined
                    ? excerpt(body, query)
                    : ""
                  : [
                      entry.durationMs ? formatClock(entry.durationMs) : "",
                      entry.type === "audio" ? "voice recording" : "video",
                    ]
                      .filter(Boolean)
                      .join(" ");
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`entry-row ${active ? "entry-row-active" : ""}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => onSelect(entry.id)}
                  >
                    <span className="entry-date" aria-hidden>
                      <span className="entry-day">
                        {new Date(entry.createdAt).getDate()}
                      </span>
                      <span className="entry-dow">
                        {weekday(entry.createdAt)}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-ink">
                          {entry.title}
                        </span>
                        {entry.favorite && (
                          <StarIcon
                            filled
                            size={14}
                            className="shrink-0 text-accent"
                            aria-label="Starred"
                            aria-hidden={false}
                            role="img"
                          />
                        )}
                      </span>
                      <span className="mt-0.5 line-clamp-2 min-h-5 text-sm text-ink-muted">
                        {detail}
                      </span>
                      <span className="mt-1.5 flex items-center gap-2 text-xs text-ink-muted">
                        <TypeIcon size={14} />
                        <span>{timeOfDay(entry.createdAt)}</span>
                        {entry.mood && (
                          <span title={MOOD_META[entry.mood].label}>
                            <span aria-hidden>
                              {MOOD_META[entry.mood].emoji}
                            </span>
                            <span className="sr-only">
                              Mood: {MOOD_META[entry.mood].label}
                            </span>
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
