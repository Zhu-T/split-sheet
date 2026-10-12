"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { restoreExpense } from "@/app/actions/expenses";
import { setArchived } from "@/app/actions/groups";
import { CountUp } from "@/components/count-up";
import { Button, Card, Initials, Money, cx, inputClass } from "@/components/ui";
import type { Currency } from "@/lib/currencies";
import { convert } from "@/lib/money";
import type { Transfer } from "@/lib/simplify";
import type { SplitType } from "@/lib/split";
import { ExpenseSheet } from "./expense-sheet";
import { OPEN_PAYMENT_EVENT } from "./review-bell";
import { SettleSheet } from "./settle-sheet";

export type MemberView = {
  id: string;
  name: string;
  active: boolean;
  placeholder: boolean;
  venmo: string | null;
};

export type ExpenseView = {
  id: string;
  kind: "expense" | "settlement";
  description: string;
  date: string;
  payerId: string;
  amountMinor: number;
  currency: Currency;
  fxRate: number;
  splitType: SplitType;
  updatedAt: string;
  /** A payment the person being paid hasn't confirmed yet (it already counts towards balances). */
  pending: boolean;
  /** Changed since it was added (shown as a small "edited" note). */
  edited: boolean;
  splits: { memberId: string; shareMinor: number; input: number }[];
};

export type GroupData = {
  groupId: string;
  /** Fingerprint of the group's data; when the server's changes, the page refreshes (see useLiveUpdates). */
  version: string;
  groupName: string;
  /** Payments recorded by the payer wait for the recipient to confirm them. */
  requireConfirmation: boolean;
  /** Archived: expenses are read-only (payments still work). */
  archived: boolean;
  isOwner: boolean;
  /** The trip's last day is over (used to suggest archiving once everyone is settled). */
  tripOver: boolean;
  trip: { start: string | null; end: string | null } | null;
  base: Currency;
  myMemberId: string;
  members: MemberView[];
  expenses: ExpenseView[];
  balances: Record<string, number>;
  transfers: Transfer[];
  fxRates: Partial<Record<Currency, number>>;
};

type SettleDraft = { from: string; to: string; amountMinor: number };

type ExpenseSheetState = { open: boolean; expense: ExpenseView | null; key: number };
type SettleSheetState = { open: boolean; draft: SettleDraft | null; existing: ExpenseView | null; key: number };

/** How often an open group page checks for other people's changes, and when it stops checking. */
const POLL_MS = 10_000;
const IDLE_AFTER_MS = 10 * 60_000;

/**
 * Keeps the page in step with everyone else's changes: while the tab is visible, it asks the server
 * for the group's fingerprint every few seconds and refreshes the data when it differs. It pauses in
 * background tabs and after 10 idle minutes (so a forgotten tab doesn't keep the database awake),
 * and checks straight away when someone comes back. The answer comes from Vercel's CDN (cached a
 * few seconds), so it can briefly be a version this page already showed; those are ignored.
 */
function useLiveUpdates(groupId: string, version: string) {
  const router = useRouter();
  const seen = useRef(new Set<string>());
  useEffect(() => {
    seen.current.add(version);
    let lastActive = Date.now();
    let inFlight = false;

    async function check() {
      if (document.hidden || inFlight || Date.now() - lastActive > IDLE_AFTER_MS) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/groups/${groupId}/version`, { cache: "no-store" });
        if (!res.ok) return;
        const { version: latest } = (await res.json()) as { version: string };
        if (!seen.current.has(latest)) {
          seen.current.add(latest); // refresh once per change
          router.refresh();
        }
      } catch {
        // Offline or a blip: try again next time.
      } finally {
        inFlight = false;
      }
    }
    function wake() {
      const wasIdle = Date.now() - lastActive > IDLE_AFTER_MS;
      lastActive = Date.now();
      if (wasIdle) void check();
    }
    function onVisible() {
      if (document.hidden) return;
      lastActive = Date.now();
      void check();
    }

    const timer = setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    for (const e of ["pointerdown", "keydown", "scroll"] as const) window.addEventListener(e, wake, { passive: true });
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      for (const e of ["pointerdown", "keydown", "scroll"] as const) window.removeEventListener(e, wake);
    };
  }, [groupId, version, router]);
}

export function GroupScreen({ data, nav }: { data: GroupData; nav?: ReactNode }) {
  useLiveUpdates(data.groupId, data.version);
  // Sheets stay mounted while closing so they can animate out; `key` resets their form on each open.
  const [expenseSheet, setExpenseSheet] = useState<ExpenseSheetState>({ open: false, expense: null, key: 0 });
  const [settleSheet, setSettleSheet] = useState<SettleSheetState>({ open: false, draft: null, existing: null, key: 0 });
  const [toast, setToast] = useState<{ id: number; text: string; undoId?: string } | null>(null);
  const [undoing, startUndo] = useTransition();
  const justCreated = useSearchParams().get("created") === "1";

  const names = useMemo(() => new Map(data.members.map((m) => [m.id, m.name])), [data.members]);
  const nameOf = (id: string) => (id === data.myMemberId ? "You" : (names.get(id) ?? "Someone"));
  const me = data.myMemberId;
  const archived = data.archived;
  const myNet = data.balances[me] ?? 0;
  const mine = data.transfers.filter((t) => t.from === me || t.to === me);

  const openEntry = (e: ExpenseView | null) => {
    if (e?.kind === "settlement") setSettleSheet((s) => ({ open: true, draft: null, existing: e, key: s.key + 1 }));
    else setExpenseSheet((s) => ({ open: true, expense: e, key: s.key + 1 }));
  };
  const openSettle = (t: SettleDraft | null) => setSettleSheet((s) => ({ open: true, draft: t, existing: null, key: s.key + 1 }));
  /** Close any open sheet and show a toast; `undoId` (after a delete) adds an Undo button. */
  const done = (text?: string, undoId?: string) => {
    setExpenseSheet((s) => ({ ...s, open: false }));
    setSettleSheet((s) => ({ ...s, open: false }));
    if (text) setToast({ id: Date.now(), text, undoId });
  };
  const undo = (expenseId: string) =>
    startUndo(async () => {
      const r = await restoreExpense(data.groupId, expenseId);
      setToast({ id: Date.now(), text: r.error ?? "Restored" });
    });

  // The review bell in the top bar asks for a payment's popup to be opened.
  useEffect(() => {
    function onOpenPayment(ev: Event) {
      const e = data.expenses.find((x) => x.id === (ev as CustomEvent<string>).detail);
      if (e) setSettleSheet((s) => ({ open: true, draft: null, existing: e, key: s.key + 1 }));
    }
    window.addEventListener(OPEN_PAYMENT_EVENT, onOpenPayment);
    return () => window.removeEventListener(OPEN_PAYMENT_EVENT, onOpenPayment);
  }, [data.expenses]);

  useEffect(() => {
    if (!toast) return;
    // Longer when there's an Undo button, so there's time to tap it.
    const t = setTimeout(() => setToast(null), toast.undoId ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Shortcuts for keyboard users: N adds an expense, / jumps to search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if ((e.key === "n" || e.key === "N") && !archived) {
        e.preventDefault();
        setExpenseSheet((s) => ({ open: true, expense: null, key: s.key + 1 }));
      } else if (e.key === "/") {
        const search = document.getElementById("activity-search");
        if (search) {
          e.preventDefault();
          search.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [archived]);

  const panel = <GroupPanel data={data} nameOf={nameOf} onSettle={openSettle} />;

  return (
    // Phones: one column. Tablets: activity + balances panel. Desktop: groups nav on the left too.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[200px_minmax(0,1fr)_300px] md:items-start">
      {nav && <nav aria-label="Your groups" className="hidden lg:sticky lg:top-18 lg:block">{nav}</nav>}

      <div className="min-w-0">
        {justCreated && data.expenses.length === 0 && (
          <Card className="rise mb-4 px-4 py-3 text-sm">
            Group created. Invite people from <span className="font-semibold">group settings</span> (the gear, top right), or add an expense.
          </Card>
        )}

        {data.archived && <ArchivedBanner groupId={data.groupId} isOwner={data.isOwner} />}
        {data.isOwner && !data.archived && data.tripOver && data.transfers.length === 0 && data.expenses.length > 0 && (
          <ArchiveSuggestion groupId={data.groupId} />
        )}
        {/* Hierarchy: the one number that matters comes first and largest. */}
        <Card className="rise px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              {data.trip && (
                <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M3 10h18M8 3v4M16 3v4" />
                  </svg>
                  {tripLabel(data.trip)}
                </p>
              )}
              <p className="text-sm text-muted">Your balance</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {myNet === 0 ? (
                  "All settled up"
                ) : (
                  <>
                    <span className="text-lg font-medium text-muted">{myNet > 0 ? "You're owed " : "You owe "}</span>
                    <CountUp minor={myNet} currency={data.base} signed />
                  </>
                )}
              </p>
            </div>
            {/* Wider screens: primary actions sit with the balance instead of floating. */}
            <div className="hidden gap-2 md:flex">
              {/* A blank payment form (no amount or suggested person filled in); Settle on a row pre-fills. */}
              <Button variant="secondary" onClick={() => openSettle(null)}>
                Record a payment
              </Button>
              {!data.archived && (
                <Button onClick={() => openEntry(null)} aria-keyshortcuts="n" title="Add expense (N)">
                  Add expense
                </Button>
              )}
            </div>
          </div>
          {/* Progressive disclosure on phones: everyone's balances are one tap away. */}
          <details className="group mt-3 md:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-accent">
              <svg viewBox="0 0 24 24" className="size-4 transition-transform duration-200 group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
              Group balances &amp; spending
            </summary>
            <div className="mt-2 space-y-4">{panel}</div>
          </details>
        </Card>
        <MySettlements transfers={mine} me={me} base={data.base} nameOf={nameOf} onSettle={openSettle} />

        <Activity data={data} nameOf={nameOf} onOpen={openEntry} />
      </div>

      <aside aria-label="Group balances" className="hidden space-y-4 md:sticky md:top-18 md:block">
        {panel}
      </aside>

      <div className="bottom-safe pointer-events-none fixed inset-x-0 z-10 mx-auto flex max-w-6xl flex-col items-end gap-3 px-4">
        <div role="status" aria-live="polite" className="w-full">
          {toast && (
            <div
              key={toast.id}
              className="toast pointer-events-auto mx-auto flex w-fit items-center gap-3 rounded-full bg-text py-1.5 pr-1.5 pl-4 text-sm font-medium text-bg shadow-lg"
            >
              <span className="py-1">{toast.text}</span>
              {toast.undoId ? (
                <button
                  type="button"
                  disabled={undoing}
                  onClick={() => undo(toast.undoId!)}
                  className="min-h-9 rounded-full bg-bg/15 px-3 font-semibold text-bg transition active:scale-95"
                >
                  Undo
                </button>
              ) : (
                <span className="pr-2.5" />
              )}
            </div>
          )}
        </div>
        <Button
          hidden={data.archived}
          className="pointer-events-auto h-14 rounded-full px-6 shadow-lg md:hidden"
          onClick={() => openEntry(null)}
          aria-keyshortcuts="n"
          title="Add expense (N)"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add expense
        </Button>
      </div>

      <ExpenseSheet
        key={`expense-${expenseSheet.key}`}
        open={expenseSheet.open}
        expense={expenseSheet.expense}
        data={data}
        onClose={() => done()}
        onDone={done}
      />
      <SettleSheet
        key={`settle-${settleSheet.key}`}
        open={settleSheet.open}
        draft={settleSheet.draft}
        existing={settleSheet.existing}
        data={data}
        onClose={() => done()}
        onDone={done}
      />
    </div>
  );
}

/** Every member's balance (with who owes whom behind a button) and spending totals. */
function GroupPanel({
  data,
  nameOf,
  onSettle,
}: {
  data: GroupData;
  nameOf: (id: string) => string;
  onSettle: (t: SettleDraft) => void;
}) {
  const me = data.myMemberId;
  const [showPayments, setShowPayments] = useState(false);
  // Me first, then whoever is furthest from settled.
  const rows = data.members
    .map((m) => ({ ...m, net: data.balances[m.id] ?? 0 }))
    .filter((m) => m.active || m.net !== 0)
    .sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name)));

  const stats = useMemo(() => {
    let total = 0;
    let paid = 0;
    let share = 0;
    let count = 0;
    for (const e of data.expenses) {
      if (e.kind !== "expense") continue;
      count += 1;
      const inBase = convert(e.amountMinor, e.currency, data.base, e.fxRate);
      total += inBase;
      if (e.payerId === me) paid += inBase;
      const mine = e.splits.find((s) => s.memberId === me)?.shareMinor ?? 0;
      share += convert(mine, e.currency, data.base, e.fxRate);
    }
    return { total, paid, share, count };
  }, [data.expenses, data.base, me]);

  return (
    <>
      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">Group balances</h2>
        <ul className="divide-y divide-line">
          {rows.map((m, i) => (
            <li key={m.id} className="rise flex items-center gap-3 px-4 py-2.5" style={{ "--i": i } as CSSProperties}>
              <Initials name={m.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{m.id === me ? "You" : m.name}</p>
                <p className={cx("text-sm", m.net > 0 ? "text-owed" : m.net < 0 ? "text-owe" : "text-muted")}>
                  {m.net === 0 ? (
                    "settled up"
                  ) : (
                    <>
                      {m.net > 0 ? (m.id === me ? "get back " : "gets back ") : m.id === me ? "owe " : "owes "}
                      <Money minor={Math.abs(m.net)} currency={data.base} className="font-semibold" />
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {/* Who pays whom to settle everyone, only when asked for. */}
        {data.transfers.length > 0 && (
          <>
            {showPayments && (
              <div className="border-t border-line">
                <h3 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Who owes who</h3>
                <ul className="divide-y divide-line">
                  {data.transfers.map((t, i) => (
                    <li
                      key={t.from + t.to}
                      className="rise flex items-center gap-3 px-4 py-3"
                      style={{ "--i": i } as CSSProperties}
                    >
                      <div className="min-w-0 flex-1">
                        {/* Names truncate on narrow screens; the amount always stays visible. */}
                        <p className="flex min-w-0 items-center gap-1.5 text-[15px] font-medium">
                          {/* The payer keeps up to half the width so a long recipient name can't squeeze it away. */}
                          <span className="max-w-[50%] shrink-0 truncate">{nameOf(t.from)}</span>
                          <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="pays">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                          <span className="truncate">{nameOf(t.to)}</span>
                        </p>
                        <Money minor={t.amountMinor} currency={data.base} className="mt-0.5 block text-sm font-semibold text-owe" />
                      </div>
                      <Button variant="secondary" className="min-h-10 shrink-0 px-4 text-sm" onClick={() => onSettle(t)}>
                        Settle
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              aria-expanded={showPayments}
              onClick={() => setShowPayments((v) => !v)}
              className="flex min-h-12 w-full items-center justify-center gap-1.5 border-t border-line text-sm font-medium text-accent hover:bg-surface-2/60"
            >
              {showPayments ? "Show less" : "Show more"}
              <svg viewBox="0 0 24 24" className={cx("size-4 transition-transform duration-200", showPayments && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </>
        )}
      </Card>

      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">Spending</h2>
        <dl className="grid grid-cols-2 gap-px bg-line">
          {[
            ["Group total", stats.total],
            ["Expenses", null],
            ["You paid", stats.paid],
            ["Your share", stats.share],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-surface px-4 py-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 font-semibold">
                {value === null ? <span className="tabular-nums">{stats.count}</span> : <Money minor={value as number} currency={data.base} />}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}

/** Who I pay and who pays me, one row per person, each with Settle. */
function MySettlements({
  transfers,
  me,
  base,
  nameOf,
  onSettle,
}: {
  transfers: Transfer[];
  me: string;
  base: Currency;
  nameOf: (id: string) => string;
  onSettle: (t: SettleDraft) => void;
}) {
  const sections = [
    { title: "You owe", rows: transfers.filter((t) => t.from === me), other: (t: Transfer) => t.to, tone: "text-owe" },
    { title: "Owes you", rows: transfers.filter((t) => t.to === me), other: (t: Transfer) => t.from, tone: "text-owed" },
  ].filter((sec) => sec.rows.length > 0);
  if (sections.length === 0) return null;

  return (
    <Card className="rise mt-4 overflow-hidden">
      {sections.map((sec, si) => (
        <section key={sec.title} className={cx(si > 0 && "border-t border-line")}>
          <h2 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{sec.title}</h2>
          <ul className="divide-y divide-line">
            {sec.rows.map((t, i) => {
              const name = nameOf(sec.other(t));
              return (
                <li key={t.from + t.to} className="rise flex items-center gap-3 px-4 py-3" style={{ "--i": i } as CSSProperties}>
                  <Initials name={name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{name}</p>
                    <Money minor={t.amountMinor} currency={base} className={cx("block text-sm font-semibold", sec.tone)} />
                  </div>
                  <Button variant="secondary" className="min-h-10 shrink-0 px-4 text-sm" onClick={() => onSettle(t)}>
                    Settle
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Card>
  );
}

/** Activity rows shown at first. Each "Show more" doubles what's shown (10, 20, 40, 80…), so even a long list is a few taps away. */
const PAGE = 10;

function Activity({
  data,
  nameOf,
  onOpen,
}: {
  data: GroupData;
  nameOf: (id: string) => string;
  onOpen: (e: ExpenseView) => void;
}) {
  const [query, setQuery] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  // Expenses arrive newest first (by date, then most recently added); oldest first is the reverse.
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.expenses.filter((e) => !q || e.description.toLowerCase().includes(q));
    return newestFirst ? list : [...list].reverse();
  }, [data.expenses, query, newestFirst]);
  const shown = items.slice(0, limit);

  return (
    <>
      <div className="mt-6 mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Activity</h2>
        {data.expenses.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setNewestFirst((v) => !v);
              setLimit(PAGE);
            }}
            aria-label={newestFirst ? "Sorted newest first. Switch to oldest first" : "Sorted oldest first. Switch to newest first"}
            className="-mr-2 flex min-h-10 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted transition hover:bg-surface-2"
          >
            {newestFirst ? "Newest first" : "Oldest first"}
            <svg viewBox="0 0 24 24" className={cx("size-4 transition-transform duration-200", !newestFirst && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>
      {data.expenses.length > 8 && (
        <input
          id="activity-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Search expenses"
          aria-keyshortcuts="/"
          className={cx(inputClass, "mb-3")}
        />
      )}
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted">{query ? "No matches." : "No expenses yet."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((e, i) => (
              <ExpenseRow key={e.id} index={i % PAGE} e={e} data={data} nameOf={nameOf} onOpen={onOpen} />
            ))}
          </ul>
        )}
        {items.length > shown.length && (
          <button
            type="button"
            onClick={() => setLimit((n) => n * 2)}
            className="flex min-h-12 w-full items-center justify-center border-t border-line text-sm font-medium text-accent hover:bg-surface-2/60"
          >
            {items.length - shown.length <= limit ? `Show all (${items.length - shown.length} more)` : `Show ${limit} more`}
          </button>
        )}
      </Card>
    </>
  );
}

function ExpenseRow({
  e,
  data,
  nameOf,
  onOpen,
  index,
}: {
  index: number;
  e: ExpenseView;
  data: GroupData;
  nameOf: (id: string) => string;
  onOpen: (e: ExpenseView) => void;
}) {
  const me = data.myMemberId;
  const myShare = e.splits.find((s) => s.memberId === me)?.shareMinor ?? 0;
  // My effect from this entry, in the entry's own currency.
  const myEffect = (e.payerId === me ? e.amountMinor : 0) - myShare;
  const settlement = e.kind === "settlement";
  // A payment to me that I haven't confirmed yet: highlighted so it stands out in the list.
  const toReview = settlement && e.pending && e.splits[0]?.memberId === me;

  return (
    <li className={cx("rise", toReview && "bg-accent/8")} style={{ "--i": index } as CSSProperties}>
      <button
        type="button"
        onClick={() => onOpen(e)}
        className={cx(
          "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-2/60 active:bg-surface-2",
          toReview && "shadow-[inset_3px_0_0_var(--accent)]",
        )}
      >
        <span className="w-9 shrink-0 text-center text-xs leading-tight text-muted uppercase tabular-nums">
          {formatDate(e.date).split(" ").map((p) => (
            <span key={p} className="block">
              {p}
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-1.5">
            {settlement ? (
              // Each name shortens on its own, so "paid" always stays visible.
              <span className="flex min-w-0 font-medium">
                <span className={cx("truncate", nameOf(e.payerId) === "You" && "shrink-0")}>{nameOf(e.payerId)}</span>
                <span className="shrink-0 whitespace-pre"> paid </span>
                <span className={cx("truncate", nameOf(e.splits[0]?.memberId ?? "") === "You" && "shrink-0")}>
                  {nameOf(e.splits[0]?.memberId ?? "")}
                </span>
              </span>
            ) : (
              <span className="truncate font-medium">{e.description}</span>
            )}
            {e.edited && <span className="shrink-0 text-xs text-muted">edited</span>}
          </span>
          {/* Amount first, so on narrow screens only the payer's name gets truncated, never the money. */}
          <span className={cx("block text-sm text-muted", !toReview && "truncate")}>
            {settlement ? (
              toReview ? (
                <span className="font-medium text-accent">Waiting for you to confirm · tap to review</span>
              ) : e.pending ? (
                `Waiting for ${nameOf(e.splits[0]?.memberId ?? "")} to confirm`
              ) : (
                "Payment"
              )
            ) : (
              <>
                <Money minor={e.amountMinor} currency={e.currency} />
                {e.currency !== data.base && (
                  <span className="hidden min-[400px]:inline">
                    {" ≈ "}
                    <Money minor={convert(e.amountMinor, e.currency, data.base, e.fxRate)} currency={data.base} />
                  </span>
                )}
                {` · paid by ${nameOf(e.payerId)}`}
              </>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right text-sm">
          {settlement ? (
            e.pending ? (
              <>
                <span className={cx("block text-xs font-medium", toReview ? "text-accent" : "text-muted")}>{toReview ? "to review" : "unconfirmed"}</span>
                <Money minor={e.amountMinor} currency={e.currency} className="font-semibold" />
              </>
            ) : (
              <Money minor={e.amountMinor} currency={e.currency} className="font-semibold" />
            )
          ) : myEffect === 0 ? (
            <span className="text-muted">{myShare === 0 && e.payerId !== me ? "not involved" : "even"}</span>
          ) : (
            <>
              <span className={cx("block text-xs", myEffect > 0 ? "text-owed" : "text-owe")}>
                {myEffect > 0 ? "you lent" : "you borrowed"}
              </span>
              <Money minor={myEffect} currency={e.currency} signed className="font-semibold" />
            </>
          )}
        </span>
      </button>
    </li>
  );
}

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Oct 1 – Oct 8", "From Oct 1" or "Until Oct 8" (dates are calendar days, shown in UTC). */
function tripLabel(trip: { start: string | null; end: string | null }) {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (trip.start && trip.end) return `${day(trip.start)} – ${day(trip.end)}`;
  return trip.start ? `From ${day(trip.start)}` : `Until ${day(trip.end!)}`;
}

/** Shown on archived trips. The owner can unarchive from here. */
function ArchivedBanner({ groupId, isOwner }: { groupId: string; isOwner: boolean }) {
  const [busy, startTransition] = useTransition();
  return (
    <Card className="rise mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
      <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="4" rx="1" />
        <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
      </svg>
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">This trip is archived.</span>{" "}
        <span className="text-muted">Expenses are read-only; payments still work.</span>
      </p>
      {isOwner && (
        <Button variant="secondary" className="min-h-10 px-3 text-sm" disabled={busy} onClick={() => startTransition(() => setArchived(groupId, false))}>
          Unarchive
        </Button>
      )}
    </Card>
  );
}

/** Owner: suggest archiving once the trip is over and everyone has settled up. */
function ArchiveSuggestion({ groupId }: { groupId: string }) {
  const [busy, startTransition] = useTransition();
  return (
    <Card className="rise mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-accent/40 p-4">
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">Trip&apos;s over and everyone&apos;s settled.</span>{" "}
        <span className="text-muted">Archive it to keep it as a read-only record?</span>
      </p>
      <Button className="min-h-10 px-3 text-sm" disabled={busy} onClick={() => startTransition(() => setArchived(groupId, true))}>
        Archive
      </Button>
    </Card>
  );
}
