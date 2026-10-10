"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Button, cx } from "./ui";

// Dates are calendar days as "YYYY-MM-DD" strings. All arithmetic is done in UTC so a day never
// shifts because of the viewer's time zone or daylight saving.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const parse = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso: string, n: number) => toIso(parse(iso) + n * DAY_MS);

function addMonths(iso: string, n: number) {
  const d = new Date(parse(iso));
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  // Keep the day of month where possible (Jan 31 + 1 month -> Feb 28/29).
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toIso(target.getTime());
}

/** Today in the viewer's own time zone, as YYYY-MM-DD. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

/** The 6×7 grid of days shown for the month containing `iso` (weeks start on Sunday). */
function monthGrid(iso: string) {
  const d = new Date(parse(iso));
  const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const start = first - new Date(first).getUTCDay() * DAY_MS;
  return Array.from({ length: 42 }, (_, i) => toIso(start + i * DAY_MS));
}

type Selection = { start: string | null; end: string | null };

/**
 * A month calendar. In range mode, days between start and end are highlighted (and, before the
 * end is picked, previewed up to the hovered day). Fully keyboard operable: arrows move by day
 * or week, PageUp/PageDown by month, Home/End to the week's ends, Enter/Space picks.
 */
export function Calendar({
  selection,
  onPick,
  min,
  initialMonth,
  range = false,
}: {
  selection: Selection;
  onPick: (iso: string) => void;
  min?: string;
  initialMonth?: string;
  /** Range mode: highlight between start and end, previewing up to the hovered day. */
  range?: boolean;
}) {
  const today = todayIso();
  const [focused, setFocused] = useState(initialMonth ?? selection.start ?? today);
  const [hovered, setHovered] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  // After keyboard navigation, move real focus to the newly focused day.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused]);

  const month = new Date(parse(focused)).getUTCMonth();
  const days = monthGrid(focused);
  const { start, end } = selection;
  const previewEnd = range && start && !end && hovered && hovered > start ? hovered : null;
  const rangeEnd = end ?? previewEnd;

  function onKeyDown(e: KeyboardEvent) {
    const steps: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, -1),
      PageDown: () => addMonths(focused, 1),
      Home: () => addDays(focused, -new Date(parse(focused)).getUTCDay()),
      End: () => addDays(focused, 6 - new Date(parse(focused)).getUTCDay()),
    };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    moved.current = true;
    setFocused(step());
  }

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setFocused(addMonths(focused, -1))}
          aria-label="Previous month"
          className="grid size-10 place-items-center rounded-full text-text transition hover:bg-surface-2 active:scale-90"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <p aria-live="polite" className="text-[15px] font-semibold">
          {formatDate(focused, { month: "long", year: "numeric" })}
        </p>
        <button
          type="button"
          onClick={() => setFocused(addMonths(focused, 1))}
          aria-label="Next month"
          className="grid size-10 place-items-center rounded-full text-text transition hover:bg-surface-2 active:scale-90"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-medium text-muted" aria-hidden>
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div ref={gridRef} role="grid" aria-label={formatDate(focused, { month: "long", year: "numeric" })} onKeyDown={onKeyDown} className="grid grid-cols-7 gap-y-1">
        {days.map((iso) => {
          const outside = new Date(parse(iso)).getUTCMonth() !== month;
          const disabled = !!min && iso < min;
          const isStart = iso === start;
          const isEnd = iso === rangeEnd;
          const inRange = !!start && !!rangeEnd && iso > start && iso < rangeEnd;
          const selected = isStart || iso === end;
          const weekday = new Date(parse(iso)).getUTCDay();
          return (
            // The band behind the circles joins start and end into one continuous range.
            <div
              key={iso}
              className={cx(
                "flex justify-center",
                (inRange || (isStart && rangeEnd && rangeEnd !== start) || (isEnd && start && rangeEnd !== start)) && "bg-accent/12",
                isStart && rangeEnd && rangeEnd !== start && "rounded-l-full",
                isEnd && start && rangeEnd !== start && "rounded-r-full",
                inRange && weekday === 0 && "rounded-l-full",
                inRange && weekday === 6 && "rounded-r-full",
              )}
            >
              <button
                type="button"
                data-date={iso}
                tabIndex={iso === focused ? 0 : -1}
                disabled={disabled}
                aria-pressed={selected}
                aria-label={`${formatDate(iso, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${iso === today ? ", today" : ""}`}
                onClick={() => {
                  setFocused(iso);
                  onPick(iso);
                }}
                onMouseEnter={() => setHovered(iso)}
                onMouseLeave={() => setHovered(null)}
                className={cx(
                  "relative grid size-10 place-items-center rounded-full text-[15px] tabular-nums transition-colors duration-100",
                  selected || isEnd
                    ? "bg-accent font-semibold text-accent-ink"
                    : inRange
                      ? "font-medium text-text hover:bg-accent/20"
                      : outside
                        ? "text-muted/60 hover:bg-surface-2"
                        : "text-text hover:bg-surface-2",
                  iso === today && !selected && !isEnd && "font-semibold ring-1 ring-accent/60 ring-inset",
                  disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
                )}
              >
                {Number(iso.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Centred popup holding a calendar; animates like the confirm dialogs. */
export function CalendarDialog({
  open,
  onClose,
  title,
  status,
  children,
  footer,
  top = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  status?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Sit near the top on phones (for dialogs with a text field, so the keyboard doesn't cover them). */
  top?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      // On 320px phones, 8px margins and 12px padding leave exactly 7 × 40px day columns.
      className={cx(
        "alert w-[calc(100%-1rem)] max-w-[22rem] rounded-2xl bg-surface p-0 text-text shadow-2xl min-[360px]:w-[calc(100%-2rem)]",
        top ? "mx-auto mt-[max(env(safe-area-inset-top),1.5rem)] mb-auto sm:m-auto" : "m-auto",
      )}
    >
      {open && (
        <div className="p-3 min-[360px]:p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            {status && <p className="text-sm text-muted">{status}</p>}
          </div>
          {children}
          {footer && <div className="mt-4 flex gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

function CalendarGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

/** A button that looks like an input and opens the calendar. */
export function DateTrigger({
  children,
  onClick,
  invalid,
  id,
  ref,
}: {
  children: ReactNode;
  onClick: () => void;
  invalid?: boolean;
  id?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      id={id}
      type="button"
      onClick={onClick}
      className={cx(
        "flex min-h-11 w-full items-center gap-2.5 rounded-xl border bg-surface px-3 text-left text-base transition-[border-color,box-shadow]",
        "focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 focus-visible:outline-none",
        invalid ? "border-danger" : "border-line",
      )}
    >
      <CalendarGlyph />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

/** Single date picker (controlled). Picking a day closes the calendar. */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const today = todayIso();
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      <DateTrigger onClick={() => setOpen(true)}>
        {value === today ? "Today" : value === addDays(today, -1) ? "Yesterday" : formatDate(value, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      </DateTrigger>
      <CalendarDialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              onChange(today);
              setOpen(false);
            }}
          >
            Today
          </Button>
        }
      >
        <Calendar
          key={open ? "open" : "closed"}
          selection={{ start: value, end: null }}
          onPick={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
        />
      </CalendarDialog>
    </div>
  );
}
