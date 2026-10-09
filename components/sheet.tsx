"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const CLOSE_MS = 380; // matches --duration-move in globals.css

/**
 * Full-height bottom sheet on phones, centred dialog on wider screens. Built on <dialog>
 * for focus trapping, Escape-to-close and an accessible modal role. Slides in/out via
 * CSS (dialog.sheet); content stays mounted until the close animation has finished.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [rendered, setRendered] = useState(open);
  // Mount content as soon as the sheet opens (adjusting state during render, not in an effect).
  if (open && !rendered) setRendered(true);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (dialog.open) dialog.close();
    const t = setTimeout(() => setRendered(false), CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Keep the footer (Save) above the on-screen keyboard: iOS doesn't shrink dvh when the
  // keyboard opens, but visualViewport does report the visible height.
  useEffect(() => {
    const vv = window.visualViewport;
    const dialog = ref.current;
    if (!open || !vv || !dialog) return;
    const sync = () => dialog.style.setProperty("--sheet-h", `${vv.height}px`);
    sync();
    vv.addEventListener("resize", sync);
    return () => vv.removeEventListener("resize", sync);
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={() => open && onClose()}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="sheet m-0 mt-0 h-[var(--sheet-h,100dvh)] max-h-none w-full max-w-none bg-transparent p-0 text-text sm:m-auto sm:h-auto sm:max-h-[85dvh] sm:max-w-lg"
    >
      {rendered && (
        <div className="flex h-full flex-col overflow-hidden bg-surface shadow-2xl sm:max-h-[85dvh] sm:rounded-2xl">
          <div className="pt-safe flex shrink-0 items-center gap-2 border-b border-line px-4">
            <h2 className="h-14 flex-1 truncate text-lg leading-[3.5rem] font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 grid size-11 place-items-center rounded-full text-muted transition active:scale-90"
            >
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
          {footer && <div className="pb-safe shrink-0 border-t border-line bg-surface px-4 pt-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
