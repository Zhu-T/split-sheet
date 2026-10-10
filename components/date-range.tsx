"use client";

import { useId, useRef, useState } from "react";
import { Calendar, CalendarDialog, DateTrigger, formatDate } from "./calendar";
import { Button } from "./ui";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Oct 1 – Oct 8, 2026", or both years when the range crosses New Year. */
function rangeLabel(start: string, end: string) {
  const short = { month: "short", day: "numeric" } as const;
  return start.slice(0, 4) === end.slice(0, 4)
    ? `${formatDate(start, short)} – ${formatDate(end)}`
    : `${formatDate(start)} – ${formatDate(end)}`;
}

/** Inclusive length in days, e.g. Oct 1 – Oct 8 is 8 days. */
function days(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
}

const plural = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/**
 * Trip start/end, picked on one calendar: tap the start, then the end. Submits as `tripStart` /
 * `tripEnd` (YYYY-MM-DD) through hidden inputs. When required, an invisible required input sits
 * under the trigger so the browser's "please fill in" message points at it and opens the calendar.
 */
export function DateRangeField({
  label,
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
  const [value, setValue] = useState({ start: defaultStart, end: defaultEnd });
  const [draft, setDraft] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [open, setOpen] = useState(false);
  const complete = !!value.start && !!value.end;
  const triggerRef = useRef<HTMLButtonElement>(null);

  function openPicker() {
    setDraft({ start: value.start || null, end: value.end || null });
    setOpen(true);
  }

  // First tap picks the start; the next picks the end (or restarts if it's before the start).
  function pick(iso: string) {
    setDraft((d) => (!d.start || d.end || iso < d.start ? { start: iso, end: null } : { start: d.start, end: iso }));
  }

  const status = !draft.start
    ? "Pick the first day of the trip"
    : !draft.end
      ? `Starts ${formatDate(draft.start, { month: "short", day: "numeric" })}. Now pick the last day`
      : `${rangeLabel(draft.start, draft.end)} · ${plural(days(draft.start, draft.end))}`;

  return (
    <div>
      <span id={`${id}-label`} className="mb-1 block text-sm font-medium text-muted">
        {label}
        {!required && <span className="font-normal"> (optional)</span>}
      </span>
      <div className="relative">
        <DateTrigger ref={triggerRef} onClick={openPicker}>
          {complete ? (
            <>
              {rangeLabel(value.start, value.end)}
              <span className="text-muted"> · {plural(days(value.start, value.end))}</span>
            </>
          ) : (
            <span className="text-muted">Select start and end dates</span>
          )}
        </DateTrigger>
        {required && (
          <input
            tabIndex={-1}
            aria-hidden
            required
            value={complete ? "set" : ""}
            onChange={() => {}}
            // The browser focuses this when the form is submitted without dates. Hand focus to the
            // visible button, and open the calendar only while dates are still missing (focus also
            // comes back here when the calendar closes, which must not reopen it).
            onFocus={() => {
              triggerRef.current?.focus();
              if (!complete) openPicker();
            }}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
          />
        )}
      </div>
      <input type="hidden" name="tripStart" value={value.start} />
      <input type="hidden" name="tripEnd" value={value.end} />
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}

      <CalendarDialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        status={<span aria-live="polite">{status}</span>}
        footer={
          <>
            {!required && complete && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setValue({ start: "", end: "" });
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            )}
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!draft.start || !draft.end}
              onClick={() => {
                setValue({ start: draft.start!, end: draft.end! });
                setOpen(false);
              }}
            >
              Done
            </Button>
          </>
        }
      >
        <Calendar key={open ? "open" : "closed"} range selection={draft} onPick={pick} initialMonth={draft.start ?? undefined} />
      </CalendarDialog>
    </div>
  );
}
