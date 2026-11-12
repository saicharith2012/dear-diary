"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

function getFullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function requestFs(el: HTMLElement): Promise<void> {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (el.requestFullscreen) {
    await el.requestFullscreen();
    return;
  }
  if (anyEl.webkitRequestFullscreen) {
    await anyEl.webkitRequestFullscreen();
  }
}

async function exitFs(): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  if (!getFullscreenElement()) return;
  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen();
  }
}

/**
 * Viewport-covering video shell (YouTube-style).
 * Uses the Fullscreen API when available, and portals to document.body
 * so the layer is never clipped by modal transforms.
 */
export function FullscreenVideo({
  active,
  onExit,
  dock,
  children,
  className,
}: {
  active: boolean;
  onExit: () => void;
  dock?: ReactNode;
  children: ReactNode;
  /** Extra classes when not immersive (e.g. video-frame, relative) */
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onExitRef = useRef(onExit);
  const activeRef = useRef(active);
  useLayoutEffect(() => {
    onExitRef.current = onExit;
    activeRef.current = active;
  }, [onExit, active]);

  // Request browser fullscreen while still inside the user-gesture turn
  // (parents should set `active` via flushSync on click).
  useLayoutEffect(() => {
    if (!active) return;
    const el = rootRef.current;
    if (!el || getFullscreenElement() === el) return;
    void requestFs(el).catch(() => {
      // CSS fixed + portal still covers the viewport.
    });
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onFsChange() {
      if (!getFullscreenElement() && activeRef.current) {
        onExitRef.current();
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onExitRef.current();
      }
    }

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    window.addEventListener("keydown", onKey, true);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      window.removeEventListener("keydown", onKey, true);
      void exitFs().catch(() => {});
    };
  }, [active]);

  const shell = (
    <div
      ref={rootRef}
      className={active ? "video-fs" : className}
      role={active ? "dialog" : undefined}
      aria-modal={active ? true : undefined}
      aria-label={active ? "Fullscreen video" : undefined}
    >
      <div className={active ? "video-fs-stage" : "contents"}>{children}</div>
      {active && dock != null && <div className="video-fs-dock">{dock}</div>}
    </div>
  );

  if (active && typeof document !== "undefined") {
    return (
      <>
        <div className={className} aria-hidden="true" />
        {createPortal(shell, document.body)}
      </>
    );
  }

  return shell;
}
