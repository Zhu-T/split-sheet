"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CURRENCY_CODES, currencyName, isCurrency, POPULAR_CURRENCIES, type Currency } from "@/lib/currencies";
import { CalendarDialog } from "./calendar";
import { cx } from "./ui";

type Option = { code: Currency; name: string };
const ALL: Option[] = CURRENCY_CODES.map((code) => ({ code, name: currencyName(code) }));

/** Best matches first: exact code, code prefix, name word prefix, then anywhere in code or name. */
function search(query: string): Option[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL;
  const score = (o: Option) => {
    const code = o.code.toLowerCase();
    const name = o.name.toLowerCase();
    if (code === q) return 0;
    if (code.startsWith(q)) return 1;
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 2;
    if (name.includes(q) || code.includes(q)) return 3;
    return -1;
  };
  return ALL.map((o) => [o, score(o)] as const)
    .filter(([, s]) => s >= 0)
    .sort((a, b) => a[1] - b[1] || a[0].code.localeCompare(b[0].code))
    .map(([o]) => o);
}

/**
 * Searchable currency picker: type a code or a name ("yen", "JPY", "euro"). The current value and
 * popular currencies are listed first. Keyboard: arrows move, Enter picks, Escape closes.
 * Works controlled (value/onChange) or in a form (name + defaultValue → hidden input).
 */
export function CurrencySelect({
  name,
  defaultValue,
  value,
  onChange,
  label = "Currency",
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (code: string) => void;
  label?: string;
}) {
  const id = useId();
  const [inner, setInner] = useState(defaultValue ?? "USD");
  const current = (value ?? inner) as string;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    if (query.trim()) return search(query);
    // No search yet: the current currency and popular ones first, then everything else.
    const pinned = [...new Set([current, ...POPULAR_CURRENCIES])].filter(isCurrency);
    const pinnedSet = new Set<string>(pinned);
    return [...pinned.map((code) => ({ code, name: currencyName(code) })), ...ALL.filter((o) => !pinnedSet.has(o.code))];
  }, [query, current]);
  const pinnedCount = query.trim() ? 0 : new Set([current, ...POPULAR_CURRENCIES]).size;

  function choose(code: Currency) {
    if (value === undefined) setInner(code);
    onChange?.(code);
    setOpen(false);
  }

  function openPicker() {
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  function move(delta: number) {
    const next = Math.max(0, Math.min(results.length - 1, active + delta));
    setActive(next);
    listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(e: KeyboardEvent) {
    const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
    if (e.key in steps) {
      e.preventDefault();
      move(steps[e.key]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) choose(results[active].code);
    }
  }

  const known = isCurrency(current);
  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        type="button"
        onClick={openPicker}
        aria-haspopup="dialog"
        className={cx(
          "flex min-h-11 w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 text-left text-base transition-[border-color,box-shadow]",
          "focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 focus-visible:outline-none",
        )}
      >
        <span className="font-semibold tabular-nums">{current}</span>
        {known && <span className="min-w-0 flex-1 truncate text-muted">{currencyName(current)}</span>}
        <svg viewBox="0 0 24 24" className="ml-auto size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <CalendarDialog open={open} onClose={() => setOpen(false)} title={label} top>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20">
          <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={results[active] ? `${id}-${results[active].code}` : undefined}
            aria-label="Search currencies"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            placeholder="Search code or name, e.g. yen"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              listRef.current?.scrollTo({ top: 0 });
            }}
            onKeyDown={onKeyDown}
            className="min-h-11 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted focus-visible:outline-none"
          />
        </div>

        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label="Currencies"
          className="mt-2 max-h-[min(22rem,50dvh)] overflow-y-auto overscroll-contain"
        >
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No currency matches “{query}”.</li>}
          {results.map((o, i) => (
            <li
              key={o.code}
              id={`${id}-${o.code}`}
              data-index={i}
              role="option"
              aria-selected={o.code === current}
              onClick={() => choose(o.code)}
              onMouseMove={() => setActive(i)}
              className={cx(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-[15px]",
                i === active && "bg-surface-2",
                i === pinnedCount && pinnedCount > 0 && "mt-1 border-t border-line pt-1",
              )}
            >
              <span className="w-11 shrink-0 font-semibold tabular-nums">{o.code}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{o.name}</span>
              {o.code === current && (
                <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                  <path d="M5 12l5 5 9-10" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      </CalendarDialog>
    </>
  );
}
