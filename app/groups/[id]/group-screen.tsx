"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, Money, SectionTitle, cx } from "@/components/ui";
import type { Currency } from "@/lib/currencies";
import { convert } from "@/lib/money";
import type { Transfer } from "@/lib/simplify";
import type { SplitType } from "@/lib/split";
import { ExpenseSheet } from "./expense-sheet";
import { SettleSheet } from "./settle-sheet";

export type MemberView = { id: string; name: string; active: boolean; placeholder: boolean; joinedAt: string | null };

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
  splits: { memberId: string; shareMinor: number; input: number }[];
};

export type GroupData = {
  groupId: string;
  base: Currency;
  myMemberId: string;
  members: MemberView[];
  expenses: ExpenseView[];
  balances: Record<string, number>;
  transfers: Transfer[];
  fxRates: Partial<Record<Currency, number>>;
};

type SettleDraft = { from: string; to: string; amountMinor: number };

export function GroupScreen({ data }: { data: GroupData }) {
  const [editing, setEditing] = useState<ExpenseView | "new" | null>(null);
  const [settling, setSettling] = useState<SettleDraft | null>(null);
  const justCreated = useSearchParams().get("created") === "1";

  const names = useMemo(() => new Map(data.members.map((m) => [m.id, m.name])), [data.members]);
  const nameOf = (id: string) => (id === data.myMemberId ? "You" : (names.get(id) ?? "Someone"));
  const me = data.myMemberId;
  const myNet = data.balances[me] ?? 0;
  const mine = data.transfers.filter((t) => t.from === me || t.to === me);
  const others = data.transfers.filter((t) => t.from !== me && t.to !== me);

  return (
    <>
      {justCreated && data.expenses.length === 0 && (
        <Card className="mb-4 px-4 py-3 text-sm">
          Group created. Invite people from <span className="font-semibold">Members</span> (top right), or add an expense.
        </Card>
      )}

      <Card className="px-5 py-5">
        <p className="text-sm text-muted">Your balance</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight">
          {myNet === 0 ? (
            "All settled up"
          ) : (
            <>
              <span className="text-lg font-medium text-muted">{myNet > 0 ? "You're owed " : "You owe "}</span>
              <Money minor={myNet} currency={data.base} signed />
            </>
          )}
        </p>
        {mine.length > 0 && (
          <ul className="mt-4 space-y-2">
            {mine.map((t) => (
              <TransferRow key={t.from + t.to} t={t} base={data.base} nameOf={nameOf} onSettle={() => setSettling(t)} />
            ))}
          </ul>
        )}
        {others.length > 0 && (
          <details className="mt-3 group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-accent">
              Everyone else ({others.length})
            </summary>
            <ul className="mt-1 space-y-2">
              {others.map((t) => (
                <TransferRow key={t.from + t.to} t={t} base={data.base} nameOf={nameOf} onSettle={() => setSettling(t)} />
              ))}
            </ul>
          </details>
        )}
      </Card>

      <SectionTitle>Activity</SectionTitle>
      <Activity data={data} nameOf={nameOf} onOpen={setEditing} />

      <div className="bottom-safe pointer-events-none fixed inset-x-0 z-10 mx-auto flex max-w-2xl justify-end px-4">
        <Button className="pointer-events-auto h-14 rounded-full px-6 shadow-lg" onClick={() => setEditing("new")}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add expense
        </Button>
      </div>

      <ExpenseSheet
        key={`expense-${editing === null ? "closed" : editing === "new" ? "new" : editing.id}`}
        open={editing !== null && (editing === "new" || editing.kind === "expense")}
        expense={editing === "new" ? null : editing}
        data={data}
        onClose={() => setEditing(null)}
      />
      <SettleSheet
        key={settling ? `settle-${settling.from}-${settling.to}` : editing && editing !== "new" && editing.kind === "settlement" ? `settle-${editing.id}` : "settle-closed"}
        open={settling !== null || (editing !== null && editing !== "new" && editing.kind === "settlement")}
        draft={settling}
        existing={editing !== null && editing !== "new" && editing.kind === "settlement" ? editing : null}
        data={data}
        onClose={() => {
          setSettling(null);
          setEditing(null);
        }}
      />
    </>
  );
}

function TransferRow({
  t,
  base,
  nameOf,
  onSettle,
}: {
  t: Transfer;
  base: Currency;
  nameOf: (id: string) => string;
  onSettle: () => void;
}) {
  return (
    <li className="flex items-center gap-3">
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
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search expenses"
          className="mb-3 min-h-11 w-full rounded-xl border border-line bg-surface px-3 outline-none focus:border-accent"
        />
      )}
      <Card>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted">{query ? "No matches." : "No expenses yet."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) =>
              item.type === "joined" ? (
                <li key={`j-${item.member.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm text-muted">
                  <span className="grid size-9 place-items-center">•</span>
                  <span className="min-w-0 flex-1 truncate">
                    {nameOf(item.member.id) === "You" ? "You joined" : `${item.member.name} joined`}
                  </span>
                  <span className="tabular-nums">{formatDate(item.sortKey)}</span>
                </li>
              ) : (
                <ExpenseRow key={item.expense.id} e={item.expense} data={data} nameOf={nameOf} onOpen={onOpen} />
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
}: {
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
    <li>
      <button type="button" onClick={() => onOpen(e)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
        <span className="w-9 shrink-0 text-center text-xs leading-tight text-muted uppercase tabular-nums">
          {formatDate(e.date).split(" ").map((p) => (
            <span key={p} className="block">
              {p}
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {settlement ? `${nameOf(e.payerId)} paid ${nameOf(e.splits[0]?.memberId ?? "")}` : e.description}
          </span>
          <span className="block truncate text-sm text-muted">
            {settlement ? "Payment" : `${nameOf(e.payerId)} paid `}
            {!settlement && <Money minor={e.amountMinor} currency={e.currency} />}
            {e.currency !== data.base && (
              <> · ≈ <Money minor={convert(e.amountMinor, e.currency, data.base, e.fxRate)} currency={data.base} /></>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right text-sm">
          {settlement ? (
            <Money minor={e.amountMinor} currency={e.currency} className="font-semibold" />
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
