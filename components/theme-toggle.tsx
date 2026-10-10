"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, getTheme, setTheme, subscribeTheme, type Theme } from "@/lib/theme";

/** The current theme. The server always renders the default; the client corrects it after hydration. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getTheme, () => DEFAULT_THEME);
}

/** Icon button for top bars: shows a sun in dark mode (switch to light) and a moon in light mode. */
export function ThemeToggleButton() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="grid size-11 place-items-center rounded-full text-muted transition hover:bg-surface-2 active:scale-90"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
        </svg>
      )}
    </button>
  );
}

/** Settings: "Light | Dark" segmented control. */
export function ThemeSegmented() {
  const theme = useTheme();
  const options: { value: Theme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="relative grid grid-cols-2 rounded-xl bg-surface-2 p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-lg bg-raised shadow-sm transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${theme === "dark" ? 100 : 0}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          onClick={() => setTheme(o.value)}
          className={`relative min-h-10 rounded-lg text-sm font-semibold transition-colors ${theme === o.value ? "text-text" : "text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
