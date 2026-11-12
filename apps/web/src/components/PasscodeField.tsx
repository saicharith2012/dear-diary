"use client";

import { useId, useState } from "react";
import { MIN_PASSCODE_LENGTH } from "@dear-diary/core";
import { passcodeStrength } from "@/lib/format";
import { EyeIcon, EyeOffIcon } from "./Icons";

export function PasscodeField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  autoFocus,
  showStrength,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  autoFocus?: boolean;
  /** Show the strength meter (use on fields that set a new passcode). */
  showStrength?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const hintId = useId();
  const [visible, setVisible] = useState(false);
  const strength =
    showStrength && value ? passcodeStrength(value, MIN_PASSCODE_LENGTH) : null;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className="field pr-12"
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          minLength={MIN_PASSCODE_LENGTH}
          maxLength={128}
          autoFocus={autoFocus}
          data-autofocus={autoFocus ? "" : undefined}
          disabled={disabled}
          aria-describedby={strength ? hintId : undefined}
        />
        <button
          type="button"
          className="btn-icon absolute right-0 top-0"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide passcode" : "Show passcode"}
          aria-pressed={visible}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {strength && (
        <div id={hintId} className="flex items-center gap-3">
          <div
            className="strength-meter w-24 shrink-0"
            data-score={strength.score}
            aria-hidden
          >
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="text-xs text-ink-muted">{strength.label}</span>
        </div>
      )}
    </div>
  );
}
