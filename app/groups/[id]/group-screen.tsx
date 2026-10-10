"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { confirmPayment, deleteExpense, restoreExpense } from "@/app/actions/expenses";
import { setArchived } from "@/app/actions/groups";
import { useConfirm } from "@/components/confirm";
import { CountUp } from "@/components/count-up";
import { Button, Card, Initials, Money, SectionTitle, cx, inputClass } from "@/components/ui";
import type { Currency } from "@/lib/currencies";
import { convert } from "@/lib/money";
import type { Transfer } from "@/lib/simplify";
import type { SplitType } from "@/lib/split";
import { ExpenseSheet } from "./expense-sheet";
import { SettleSheet } from "./settle-sheet";

export type MemberView = {
  id: string;
  name: string;
  active: boolean;
  placeholder: boolean;
  joinedAt: string | null;
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

export function GroupScreen({ data, nav }: { data: GroupData; nav?: ReactNode }) {
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
  const others = data.transfers.filter((t) => t.from !== me && t.to !== me);

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

  const panel = <GroupPanel data={data} nameOf={nameOf} others={others} onSettle={openSettle} />;

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
        <PendingForMe data={data} nameOf={nameOf} onDone={done} />

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
              <Button variant="secondary" onClick={() => openSettle(mine[0] ?? null)}>
                Settle up
              </Button>
              {!data.archived && (
                <Button onClick={() => openEntry(null)} aria-keyshortcuts="n" title="Add expense (N)">
                  Add expense
                </Button>
              )}
            </div>
          </div>
          {mine.length > 0 && (
            <ul className="mt-4 space-y-2">
              {mine.map((t) => (
                <TransferRow key={t.from + t.to} t={t} base={data.base} nameOf={nameOf} onSettle={() => openSettle(t)} />
              ))}
            </ul>
          )}
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

        <SectionTitle>Activity</SectionTitle>
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

/** Every member's balance, suggested payments between others, and spending totals. */
function GroupPanel({
  data,
  nameOf,
  others,
  onSettle,
}: {
  data: GroupData;
  nameOf: (id: string) => string;
  others: Transfer[];
  onSettle: (t: SettleDraft) => void;
}) {
  const me = data.myMemberId;
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
      </Card>

      {others.length > 0 && (
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">
            Suggested payments
          </h2>
          <ul className="space-y-2 px-4 py-3">
            {others.map((t, i) => (
              <TransferRow key={t.from + t.to} index={i} t={t} base={data.base} nameOf={nameOf} onSettle={() => onSettle(t)} />
            ))}
          </ul>
        </Card>
      )}

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

function TransferRow({
  t,
  base,
  nameOf,
  onSettle,
  index,
}: {
  index?: number;
  t: Transfer;
  base: Currency;
  nameOf: (id: string) => string;
  onSettle: () => void;
}) {
  return (
    <li className={cx("flex items-center gap-3", index !== undefined && "rise")} style={index !== undefined ? ({ "--i": index } as CSSProperties) : undefined}>
      <span className="min-w-0 flex-1 text-[15px]">
        {/* Names truncate; the amount always stays fully visible on its own line. */}
        <span className="block truncate">
          <span className="font-medium">{nameOf(t.from)}</span>
          {nameOf(t.from) === "You" ? " owe " : " owes "}
          <span className="font-medium">{nameOf(t.to)}</span>
        </span>
        <Money minor={t.amountMinor} currency={base} className="block font-semibold" />
      </span>
      <Button variant="secondary" className="min-h-10 px-3 text-sm" onClick={onSettle}>
        Settle
      </Button>
    </li>
  );
}

type ActivityItem =
  | { type: "expense"; sortKey: string; expense: ExpenseView }
  | { type: "joined"; sortKey: string; member: MemberView };

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
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: ActivityItem[] = data.expenses
      .filter((e) => !q || e.description.toLowerCase().includes(q))
      .map((e) => ({ type: "expense", sortKey: e.date, expense: e }));
    if (!q) {
      for (const m of data.members) {
        if (m.joinedAt) list.push({ type: "joined", sortKey: m.joinedAt.slice(0, 10), member: m });
      }
    }
    return list.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
  }, [data.expenses, data.members, query]);

  return (
    <>
      {data.expenses.length > 8 && (
        <input
          id="activity-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search expenses"
          aria-keyshortcuts="/"
          className={cx(inputClass, "mb-3")}
        />
      )}
      <Card>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted">{query ? "No matches." : "No expenses yet."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item, i) =>
              item.type === "joined" ? (
                <li key={`j-${item.member.id}`} className="rise flex min-h-12 items-center gap-3 px-4 py-2 text-sm text-muted" style={{ "--i": i } as CSSProperties}>
                  <span className="grid size-9 place-items-center">•</span>
                  <span className="min-w-0 flex-1 truncate">
                    {nameOf(item.member.id) === "You" ? "You joined" : `${item.member.name} joined`}
                  </span>
                  <span className="tabular-nums">{formatDate(item.sortKey)}</span>
                </li>
              ) : (
                <ExpenseRow key={item.expense.id} index={i} e={item.expense} data={data} nameOf={nameOf} onOpen={onOpen} />
              ),
            )}
          </ul>
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

  return (
    <li className="rise" style={{ "--i": index } as CSSProperties}>
      <button
        type="button"
        onClick={() => onOpen(e)}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-2/60 active:bg-surface-2"
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
            <span className="truncate font-medium">
              {settlement ? `${nameOf(e.payerId)} paid ${nameOf(e.splits[0]?.memberId ?? "")}` : e.description}
            </span>
            {e.edited && <span className="shrink-0 text-xs text-muted">edited</span>}
          </span>
          {/* Amount first, so on narrow screens only the payer's name gets truncated, never the money. */}
          <span className="block truncate text-sm text-muted">
            {settlement ? (
              e.pending ? (
                e.splits[0]?.memberId === data.myMemberId ? "Waiting for you to confirm" : `Waiting for ${nameOf(e.splits[0]?.memberId ?? "")} to confirm`
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
                <span className="block text-xs font-medium text-muted">unconfirmed</span>
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

/** Payments others recorded as paid to me, waiting for me to confirm (or reject) them. */
function PendingForMe({
  data,
  nameOf,
  onDone,
}: {
  data: GroupData;
  nameOf: (id: string) => string;
  onDone: (message?: string, undoId?: string) => void;
}) {
  const [busy, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const pending = data.expenses.filter((e) => e.pending && e.splits[0]?.memberId === data.myMemberId);
  if (pending.length === 0) return null;

  return (
    <Card className="rise mb-4 border-accent/40 p-4">
      <h2 className="font-semibold">Confirm payments</h2>
      <p className="mt-0.5 text-sm text-muted">
        These already count towards balances. Confirm you received them, or mark one as not received to undo it.
      </p>
      <ul className="mt-3 space-y-3">
        {pending.map((e) => (
          <li key={e.id} className="space-y-2">
            <p className="text-[15px] break-words">
              <span className="font-medium">{nameOf(e.payerId)}</span> says they paid you{" "}
              <Money minor={e.amountMinor} currency={e.currency} className="font-semibold" />
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button
                variant="secondary"
                className="min-h-11 px-2 text-sm whitespace-nowrap"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Payment not received?",
                    message: `This removes the payment ${nameOf(e.payerId)} recorded, and balances go back to how they were before it.`,
                    confirmLabel: "Remove payment",
                    destructive: true,
                  });
                  if (ok) startTransition(async () => {
                    const r = await deleteExpense(data.groupId, e.id);
                    onDone(r.error ?? "Payment removed", r.deletedId);
                  });
                }}
              >
                Not received
              </Button>
              <Button
                className="min-h-11 px-3 text-sm"
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    const r = await confirmPayment(data.groupId, e.id);
                    onDone(r.error ?? "Payment confirmed");
                  })
                }
              >
                Confirm
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {confirmDialog}
    </Card>
  );
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
