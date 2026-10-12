"use client";

import { useState, type CSSProperties } from "react";
import { CalendarDialog } from "@/components/calendar";
import { Money } from "@/components/ui";
import type { Currency } from "@/lib/currencies";

export type ReviewItem = { id: string; payerName: string; amountMinor: number; currency: Currency; date: string };

/** Ask the group screen to open a payment's popup (it owns the sheets; the bell lives in the top bar). */
export const OPEN_PAYMENT_EVENT = "split:open-payment";

/**
 * Top-bar bell: a badge counts payments others recorded as paid to me that I haven't confirmed.
 * Tapping lists them; picking one opens its popup, where Confirm / Not received are.
 */
export function ReviewBell({ items }: { items: ReviewItem[] }) {
  const [open, setOpen] = useState(false);
  const count = items.length;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={count ? `${count} payment${count === 1 ? "" : "s"} waiting for your review` : "Payments to review"}
        className="relative grid size-11 place-items-center rounded-full text-muted transition active:scale-90"
      >
        <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && (
          <span className="pop absolute top-1.5 right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-owe px-1 text-[11px] leading-none font-semibold text-white tabular-nums ring-2 ring-bg">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      <CalendarDialog open={open} onClose={() => setOpen(false)} title="Waiting for your review" top>
        {count === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nothing to review. Payments people record as paid to you show up here.</p>
        ) : (
          <ul className="-mx-1 max-h-[min(24rem,60dvh)] divide-y divide-line overflow-y-auto overscroll-contain">
            {items.map((p, i) => (
              <li key={p.id} className="rise" style={{ "--i": i } as CSSProperties}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    window.dispatchEvent(new CustomEvent(OPEN_PAYMENT_EVENT, { detail: p.id }));
                  }}
                  className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 text-[15px] font-medium">
                      <span className="truncate">{p.payerName}</span>
                      <span className="shrink-0 whitespace-pre"> paid you</span>
                    </span>
                    <span className="block text-sm text-muted">{formatDay(p.date)}</span>
                  </span>
                  <Money minor={p.amountMinor} currency={p.currency} className="shrink-0 font-semibold" />
                  <span className="shrink-0 text-sm font-medium text-accent">Review</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CalendarDialog>
    </>
  );
}

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
