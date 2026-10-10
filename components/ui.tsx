import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Currency } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition duration-150 ease-out active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100";

export const buttonStyles = {
  primary: cx(buttonBase, "bg-accent text-accent-ink"),
  secondary: cx(buttonBase, "bg-surface-2 text-text"),
  ghost: cx(buttonBase, "text-accent"),
  /** Secondary destructive actions (remove a member, delete an expense). */
  danger: cx(buttonBase, "bg-surface-2 text-danger"),
  /** Irreversible, high-stakes actions only (delete account): highest contrast. */
  destructive: cx(buttonBase, "bg-danger text-danger-ink"),
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return <button className={cx(buttonStyles[variant], className)} {...props} />;
}

/** Sticky top bar that clears the notch. */
export function TopBar({ title, back, action, wide }: { title: ReactNode; back?: string; action?: ReactNode; wide?: boolean }) {
  return (
    // Named so route transitions keep it fixed while the page content slides.
    <header style={{ viewTransitionName: "top-bar" }} className="pt-safe sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
      <div className={cx("mx-auto flex h-14 items-center gap-2 px-4", wide ? "max-w-6xl" : "max-w-2xl")}>
        {back && (
          <Link href={back} transitionTypes={["nav-back"]} aria-label="Back" className="-ml-2 grid size-11 place-items-center rounded-full text-accent transition active:scale-90">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
        {action}
      </div>
    </header>
  );
}

/** Page body. `wide` pages use the extra width on desktop for side panels. */
export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <main className={cx("mx-auto w-full px-4 pt-4 pb-32 md:pb-12", wide ? "max-w-6xl" : "max-w-2xl")}>{children}</main>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-line bg-surface", className)}>{children}</section>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mt-6 mb-2 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{children}</h2>;
}

/** Amount with sign-aware colour: positive = you're owed, negative = you owe. */
export function Money({ minor, currency, signed, className }: { minor: number; currency: Currency; signed?: boolean; className?: string }) {
  const tone = !signed || minor === 0 ? "" : minor > 0 ? "text-owed" : "text-owe";
  return <span className={cx("tabular-nums", tone, className)}>{formatMoney(signed ? Math.abs(minor) : minor, currency)}</span>;
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden className={cx("grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-muted", className)}>
      {letters || "?"}
    </span>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy aria-label="Loading">
      <div className="shimmer h-28 rounded-2xl" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="shimmer h-14 rounded-xl" />
      ))}
    </div>
  );
}

// text-base (16px) keeps iOS Safari from zooming into a focused field. Every input sets
// its own size (inputs default to ~13px), so larger fields like the amount can use text-4xl.
export const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-text outline-none placeholder:text-muted transition-[border-color,box-shadow] focus:border-accent focus:ring-3 focus:ring-accent/20";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

/** Gear icon for settings links (top bars on the dashboard and group pages). */
export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
