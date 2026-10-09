import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Currency } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100";

export const buttonStyles = {
  primary: cx(buttonBase, "bg-accent text-accent-ink"),
  secondary: cx(buttonBase, "bg-surface-2 text-text"),
  ghost: cx(buttonBase, "text-accent"),
  danger: cx(buttonBase, "bg-surface-2 text-danger"),
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return <button className={cx(buttonStyles[variant], className)} {...props} />;
}

/** Sticky top bar that clears the notch. */
export function TopBar({ title, back, action }: { title: ReactNode; back?: string; action?: ReactNode }) {
  return (
    <header className="pt-safe sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
        {back && (
          <Link href={back} aria-label="Back" className="-ml-2 grid size-11 place-items-center rounded-full text-accent">
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

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl px-4 pt-4 pb-32">{children}</main>;
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
    <div className="animate-pulse space-y-3" aria-busy aria-label="Loading">
      <div className="h-28 rounded-2xl bg-surface-2" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-14 rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-text outline-none placeholder:text-muted focus:border-accent";

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
