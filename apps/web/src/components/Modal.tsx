"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "./Icons";

/** Open modals, bottom to top. Only the top one reacts to Escape and Tab. */
const stack: symbol[] = [];

export function isModalOpen(): boolean {
  return stack.length > 0;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  description,
  onClose,
  locked = false,
  wide = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  /** Ignore Escape, backdrop clicks and the close button (work in progress). */
  locked?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, locked });

  useEffect(() => {
    latest.current = { onClose, locked };
  }, [onClose, locked]);

  useEffect(() => {
    const token = Symbol("modal");
    stack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const initial =
      panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    initial?.focus({ preventScroll: true });

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== token) return;
      // A fullscreen video layer portals outside the panel and owns the keys.
      if (document.querySelector(".video-fs")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (!latest.current.locked) latest.current.onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const at = stack.indexOf(token);
      if (at >= 0) stack.splice(at, 1);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className="modal-overlay z-50 motion-safe:animate-fade"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`modal-panel motion-safe:animate-rise ${wide ? "sm:!max-w-2xl" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-display text-2xl font-semibold text-ink"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-ink-muted">{description}</p>
            )}
          </div>
          <button
            type="button"
            className="btn-icon -mr-2 -mt-2"
            onClick={onClose}
            disabled={locked}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
