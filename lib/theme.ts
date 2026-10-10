// Light/dark theme, chosen in the app (not by the device) and remembered per browser.
// <html data-theme> is set before first paint by THEME_INIT_SCRIPT, so there's no flash.

export type Theme = "light" | "dark";

export const DEFAULT_THEME: Theme = "dark";
const STORAGE_KEY = "theme";
const EVENT = "themechange";
const BG: Record<Theme, string> = { light: "#f6f5f2", dark: "#141412" };

/** Inline script for <head>: apply the saved theme (default dark) before anything renders. */
export const THEME_INIT_SCRIPT = `(() => {
  let t = "${DEFAULT_THEME}";
  try { const s = localStorage.getItem("${STORAGE_KEY}"); if (s === "light" || s === "dark") t = s; } catch {}
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", t === "light" ? "${BG.light}" : "${BG.dark}");
})();`;

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function subscribeTheme(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

/** Switch theme: cross-fades where supported (instant with reduced motion), and remembers it. */
export function setTheme(theme: Theme) {
  const apply = () => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BG[theme]);
    window.dispatchEvent(new Event(EVENT));
  };
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the theme still applies for this visit.
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && "startViewTransition" in document) document.startViewTransition(apply);
  else apply();
}
