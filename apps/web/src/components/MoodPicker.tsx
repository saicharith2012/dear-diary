"use client";

import { useId } from "react";
import { MOODS, type Mood } from "@dear-diary/core";
import { MOOD_META } from "@/lib/format";

export function MoodPicker({
  value,
  onChange,
}: {
  value: Mood | null;
  onChange: (mood: Mood | null) => void;
}) {
  const labelId = useId();
  return (
    <div>
      <p className="text-sm font-medium text-ink" id={labelId}>
        How was the day?{" "}
        <span className="font-normal text-ink-muted">Optional</span>
      </p>
      <div
        className="mt-2 flex flex-wrap gap-1"
        role="radiogroup"
        aria-labelledby={labelId}
      >
        {MOODS.map((mood) => (
          <button
            key={mood}
            type="button"
            role="radio"
            aria-checked={value === mood}
            className="mood-btn"
            onClick={() => onChange(value === mood ? null : mood)}
          >
            <span aria-hidden>{MOOD_META[mood].emoji}</span>
            <span>{MOOD_META[mood].label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
