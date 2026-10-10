"use client";

import { useState, useTransition } from "react";
import { getExpenseHistory, type HistoryEntry } from "@/app/actions/expenses";

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Collapsible "History" for an expense or payment; loads only when first opened. */
export function HistorySection({ groupId, expenseId }: { groupId: string; expenseId: string }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loading, startTransition] = useTransition();

  return (
    <details
      className="group rounded-2xl border border-line"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && entries === null) {
          startTransition(async () => setEntries(await getExpenseHistory(groupId, expenseId)));
        }
      }}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium">
        <svg viewBox="0 0 24 24" className="size-4 text-muted transition-transform duration-200 group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
        History
      </summary>
      <div className="border-t border-line px-3 py-3">
        {loading || entries === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted">No history yet.</p>
        ) : (
          <ol className="space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="relative pl-4">
                <span aria-hidden className="absolute top-2 left-0 size-1.5 rounded-full bg-muted" />
                <p className="text-sm">
                  <span className="font-medium">{e.headline}</span>
                  <span className="text-muted" suppressHydrationWarning>
                    {" · "}
                    {when(e.at)}
                  </span>
                </p>
                {e.lines.length > 0 && (
                  <ul className="mt-0.5 space-y-0.5 text-sm text-muted">
                    {e.lines.map((line, i) => (
                      <li key={i} className="break-words">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}
