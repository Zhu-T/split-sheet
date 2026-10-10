"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, inputClass } from "./ui";

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  /** Red confirm button, for actions that delete or remove something. */
  destructive?: boolean;
  /** Ask the person to type this exactly before confirming (for irreversible actions). */
  requireText?: string;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

/**
 * Styled replacement for window.confirm(). Usage:
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (await confirm({ title: "Delete?", confirmLabel: "Delete", destructive: true })) …
 *   return <>…{confirmDialog}</>;
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return [confirm, <ConfirmDialog key="confirm-dialog" pending={pending} onSettle={settle} />];
}

function ConfirmDialog({ pending, onSettle }: { pending: Pending | null; onSettle: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [shown, setShown] = useState<Pending | null>(pending);

  // Keep the last options rendered while the dialog animates closed.
  if (pending && pending !== shown) {
    setShown(pending);
    setTyped("");
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (pending && !dialog.open) dialog.showModal();
    if (!pending && dialog.open) dialog.close();
  }, [pending]);

  const matches = !shown?.requireText || typed.trim() === shown.requireText.trim();

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby={shown?.message ? "confirm-message" : undefined}
      onCancel={(e) => {
        e.preventDefault(); // Escape: animate closed via state instead of the browser's instant close
        onSettle(false);
      }}
      onClick={(e) => e.target === ref.current && onSettle(false)}
      className="alert m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-surface p-0 text-text shadow-2xl"
    >
      {shown && (
        <form
          className="p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (matches) onSettle(true);
          }}
        >
          <h2 id="confirm-title" className="text-lg font-semibold">
            {shown.title}
          </h2>
          {shown.message && (
            <div id="confirm-message" className="mt-2 text-[15px] text-muted">
              {shown.message}
            </div>
          )}
          {shown.requireText && (
            <label className="mt-4 block">
              <span className="mb-1 block text-sm text-muted">
                Type <span className="font-semibold text-text">{shown.requireText}</span> to confirm
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
              />
            </label>
          )}
          {/* Cancel is the default focus, so a stray Enter never confirms something destructive. */}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" autoFocus={!shown.requireText} onClick={() => onSettle(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={shown.destructive ? "destructive" : "primary"} disabled={!matches}>
              {shown.confirmLabel}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
