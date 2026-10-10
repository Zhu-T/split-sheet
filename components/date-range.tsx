"use client";

import { useId, useState } from "react";
import { cx } from "./ui";

const DAY_MS = 24 * 60 * 60 * 1000;

function fmt(iso: string, withYear: boolean) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", withYear ? { ...opts, year: "numeric" } : opts);
}

/** "Oct 1 – Oct 8, 2026", or both years when the range crosses New Year. */
function rangeLabel(start: string, end: string) {
  return start.slice(0, 4) === end.slice(0, 4) ? `${fmt(start, false)} – ${fmt(end, true)}` : `${fmt(start, true)} – ${fmt(end, true)}`;
}

/** Inclusive length in days, e.g. Oct 1 – Oct 8 is 8 days. */
function days(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
}

/**
 * Trip start/end as one field: labelled "Starts → Ends" inputs in a single box, the end
 * picker can't go before the start, and a live summary ("Oct 1 – Oct 8 · 8 days") below.
 * Submits as `tripStart` / `tripEnd` (YYYY-MM-DD).
 */
export function DateRangeField({
  label: legend,
  required,
  defaultStart = "",
  defaultEnd = "",
  hint,
}: {
  label: string;
  required?: boolean;
  defaultStart?: string;
  defaultEnd?: string;
  hint?: string;
}) {
  const id = useId();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const invalid = !!start && !!end && end < start;

  return (
    <fieldset aria-describedby={`${id}-summary`}>
      <legend className="mb-1 text-sm font-medium text-muted">
        {legend}
        {!required && <span className="font-normal"> (optional)</span>}
      </legend>
      <div
        className={cx(
          "grid grid-cols-[1fr_auto_1fr] items-stretch rounded-xl border bg-surface transition-[border-color,box-shadow]",
          "focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20",
          invalid ? "border-danger" : "border-line",
        )}
      >
        <label className="flex min-w-0 flex-col px-3 pt-1.5 pb-0.5">
          <span className="block text-xs font-medium text-muted">Starts</span>
          <input
            type="date"
            name="tripStart"
            value={start}
            required={required}
            onChange={(e) => {
              setStart(e.target.value);
              // Keep the range valid: moving the start past the end moves the end along.
              if (end && e.target.value > end) setEnd(e.target.value);
            }}
            className="h-10 w-full min-w-0 bg-transparent text-base text-text outline-none focus-visible:outline-none"
          />
        </label>
        <span aria-hidden className="grid place-items-center border-x border-line px-2 text-muted">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
        <label className="flex min-w-0 flex-col px-3 pt-1.5 pb-0.5">
          <span className="block text-xs font-medium text-muted">Ends</span>
          <input
            type="date"
            name="tripEnd"
            value={end}
            min={start || undefined}
            required={required}
            onChange={(e) => setEnd(e.target.value)}
            className="h-10 w-full min-w-0 bg-transparent text-base text-text outline-none focus-visible:outline-none"
          />
        </label>
      </div>
      <p id={`${id}-summary`} aria-live="polite" className={cx("mt-1 text-sm", invalid ? "text-danger" : "text-muted")}>
        {invalid
          ? "The trip can't end before it starts."
          : start && end
            ? `${rangeLabel(start, end)} · ${days(start, end)} ${days(start, end) === 1 ? "day" : "days"}`
            : hint}
      </p>
    </fieldset>
  );
}
