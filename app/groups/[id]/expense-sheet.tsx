"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteExpense, saveExpense } from "@/app/actions/expenses";
import { useConfirm } from "@/components/confirm";
import { CurrencySelect } from "@/components/currency-select";
import { Sheet } from "@/components/sheet";
import { Button, ErrorText, Field, Money, cx, inputClass } from "@/components/ui";
import { isCurrency, type Currency } from "@/lib/currencies";
import { convert, formatMoney, parseAmount, toDecimalString } from "@/lib/money";
import { computeShares, type SplitType } from "@/lib/split";
import type { ExpenseView, GroupData } from "./group-screen";

const SPLIT_LABELS: Record<SplitType, string> = { equal: "Equally", exact: "Amounts", percent: "Percent" };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function ExpenseSheet({
  open,
  expense,
  data,
  onClose,
  onDone,
}: {
  open: boolean;
  expense: ExpenseView | null;
  data: GroupData;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const initialCurrency = expense?.currency ?? data.base;
  const [amount, setAmount] = useState(expense ? toDecimalString(expense.amountMinor, expense.currency) : "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [date, setDate] = useState(expense?.date ?? today());
  const [payerId, setPayerId] = useState(expense?.payerId ?? data.myMemberId);
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [rate, setRate] = useState(() =>
    expense && expense.currency !== data.base ? String(expense.fxRate) : rateFor(data, initialCurrency),
  );
  const [splitType, setSplitType] = useState<SplitType>(expense?.splitType ?? "equal");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(expense ? expense.splits.map((s) => s.memberId) : data.members.filter((m) => m.active).map((m) => m.id)),
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (expense?.splits ?? []).map((s) => [
        s.memberId,
        expense!.splitType === "exact" ? toDecimalString(s.input, expense!.currency) : String(s.input),
      ]),
    ),
  );
  const [error, setError] = useState<string>();
  // Date and currency are usually "today" and the group's currency, so they start tucked away.
  const [showDetails, setShowDetails] = useState(() => !!expense && (expense.date !== today() || expense.currency !== data.base));
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  // Members who can appear in this split: active ones, plus anyone already on this expense.
  const candidates = data.members.filter((m) => m.active || expense?.splits.some((s) => s.memberId === m.id) || expense?.payerId === m.id);
  const amountMinor = parseAmount(amount || "0", currency) ?? 0;

  const preview = useMemo(() => {
    const ids = candidates.filter((m) => selected.has(m.id)).map((m) => m.id);
    const inputs = ids.map((memberId) => {
      const raw = values[memberId] ?? "";
      const value =
        splitType === "equal"
          ? 1
          : splitType === "exact"
            ? (parseAmount(raw || "0", currency) ?? NaN)
            : Number(raw || "0");
      return { memberId, value };
    });
    const entered = inputs.reduce((acc, i) => acc + (Number.isFinite(i.value) ? i.value : 0), 0);
    const result = amountMinor > 0 ? computeShares(amountMinor, splitType, inputs) : null;
    return { result, entered, ids };
  }, [candidates, selected, values, splitType, currency, amountMinor]);

  const shareOf = (id: string) =>
    preview.result?.ok ? (preview.result.shares.find((s) => s.memberId === id)?.shareMinor ?? 0) : null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeCurrency(code: string) {
    if (!isCurrency(code)) return;
    setCurrency(code);
    setRate(rateFor(data, code));
  }

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await saveExpense(data.groupId, {
        expenseId: expense?.id,
        expectedUpdatedAt: expense?.updatedAt,
        kind: "expense",
        description,
        date,
        payerId,
        amount,
        currency,
        fxRate: currency === data.base ? null : Number(rate) > 0 ? Number(rate) : null,
        splitType,
        splits: preview.ids.map((memberId) => ({ memberId, value: values[memberId] ?? "" })),
      });
      if (result.error) setError(result.error);
      else onDone(expense ? "Expense updated" : "Expense added");
    });
  }

  async function remove() {
    if (!expense) return;
    const ok = await confirm({
      title: "Delete this expense?",
      message: (
        <>
          <span className="font-medium text-text">{expense.description}</span> (
          {formatMoney(expense.amountMinor, expense.currency)}) will be removed and everyone&apos;s balances updated.
        </>
      ),
      confirmLabel: "Delete expense",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteExpense(data.groupId, expense.id);
      if (result.error) setError(result.error);
      else onDone("Expense deleted");
    });
  }

  const remaining =
    splitType === "exact"
      ? { label: formatMoney(amountMinor - preview.entered, currency), ok: amountMinor - preview.entered === 0 }
      : splitType === "percent"
        ? { label: `${+(100 - preview.entered).toFixed(4)}%`, ok: Math.abs(100 - preview.entered) < 1e-9 }
        : null;

  return (
    <>
      {confirmDialog}
      <Sheet
        open={open}
        onClose={onClose}
        title={expense ? "Edit expense" : "Add expense"}
        footer={
          <Button type="button" className="w-full" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : expense ? "Save changes" : "Add expense"}
          </Button>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {/* Hierarchy: the amount is the first and largest thing on the sheet. */}
          <label className="flex h-20 items-center gap-2 rounded-2xl border border-line bg-surface px-4 transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20">
            <span className="text-lg font-semibold text-muted">{currency}</span>
            <span className="sr-only">Amount</span>
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus={!expense}
              className="h-full min-w-0 flex-1 bg-transparent text-right text-4xl font-semibold tabular-nums outline-none placeholder:text-line"
            />
          </label>

          <Field label="Description">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={100}
              placeholder="Dinner, groceries, rent…"
              autoComplete="off"
              enterKeyHint="done"
              className={inputClass}
            />
          </Field>

          <Field label="Paid by">
            <select value={payerId} onChange={(e) => setPayerId(e.target.value)} className={inputClass}>
              {candidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === data.myMemberId ? "You" : m.name}
                </option>
              ))}
            </select>
          </Field>

          {/* Proximity: split type, people and the running total form one group. */}
          <section aria-label="Split" className="space-y-3">
            <SplitTypeControl value={splitType} onChange={setSplitType} />

            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {candidates.map((m) => {
                const on = selected.has(m.id);
                const share = on ? shareOf(m.id) : null;
                return (
                  <li key={m.id} className={cx("flex min-h-14 items-center gap-3 px-3 transition-colors duration-150", !on && "bg-surface-2/40")}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(m.id)}
                      className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        className={cx(
                          "grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors duration-150",
                          on ? "border-accent bg-accent text-accent-ink" : "border-line",
                        )}
                      >
                        {on && (
                          <svg viewBox="0 0 24 24" className="pop size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                            <path d="M5 12l5 5 9-10" />
                          </svg>
                        )}
                      </span>
                      <span className={cx("min-w-0 flex-1 truncate transition-colors", !on && "text-muted")}>
                        {m.id === data.myMemberId ? "You" : m.name}
                      </span>
                    </button>
                    {on && splitType !== "equal" && (
                      <input
                        aria-label={`${m.name} ${SPLIT_LABELS[splitType]}`}
                        inputMode="decimal"
                        value={values[m.id] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
                        placeholder="0"
                        className="h-10 w-20 rounded-lg border border-line bg-surface px-2 text-right text-base tabular-nums outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-3 focus:ring-accent/20"
                      />
                    )}
                    {on && splitType !== "exact" && (
                      <span className="w-20 shrink-0 text-right text-sm text-muted tabular-nums">
                        {share !== null ? <Money minor={share} currency={currency} /> : "–"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            {remaining && amountMinor > 0 && (
              <p aria-live="polite" className={cx("text-sm font-medium transition-colors", remaining.ok ? "text-owed" : "text-muted")}>
                {remaining.ok ? "Adds up ✓" : `${remaining.label} left to assign`}
              </p>
            )}
            {preview.result && !preview.result.ok && !remaining && <p className="text-sm text-muted">{preview.result.error}</p>}
          </section>

          {/* Progressive disclosure: date and currency are rarely changed, so they're summarised. */}
          <div className="rounded-2xl border border-line">
            <button
              type="button"
              aria-expanded={showDetails}
              onClick={() => setShowDetails((v) => !v)}
              className="flex min-h-12 w-full items-center gap-2 px-3 text-left"
            >
              <span className="flex-1 text-sm">
                <span className="text-muted">Date &amp; currency · </span>
                <span className="font-medium">
                  {date === today() ? "Today" : formatDay(date)} · {currency}
                </span>
              </span>
              <svg viewBox="0 0 24 24" className={cx("size-5 text-muted transition-transform duration-200", showDetails && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div className={cx("grid transition-[grid-template-rows] duration-300 ease-out", showDetails ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className="overflow-hidden" inert={!showDetails}>
                <div className="space-y-4 border-t border-line p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Date">
                      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Currency">
                      <CurrencySelect value={currency} onChange={changeCurrency} />
                    </Field>
                  </div>
                  {currency !== data.base && (
                    <Field
                      label={`Rate: 1 ${currency} = ? ${data.base}`}
                      hint={
                        amountMinor > 0 && Number(rate) > 0 ? (
                          <>≈ {formatMoney(convert(amountMinor, currency, data.base, Number(rate)), data.base)}</>
                        ) : (
                          "Today's rate is filled in; edit it to match your receipt."
                        )
                      }
                    >
                      <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
                    </Field>
                  )}
                </div>
              </div>
            </div>
          </div>

          <ErrorText>{error}</ErrorText>

          {/* Proximity: the destructive action sits apart from Save so it can't be hit by accident. */}
          {expense && (
            <div className="border-t border-line pt-4">
              <Button type="button" variant="danger" className="w-full" onClick={remove} disabled={pending}>
                Delete expense
              </Button>
            </div>
          )}
        </form>
      </Sheet>
    </>
  );
}

/** Segmented control whose selection pill slides between options. */
function SplitTypeControl({ value, onChange }: { value: SplitType; onChange: (t: SplitType) => void }) {
  const types = Object.keys(SPLIT_LABELS) as SplitType[];
  const index = types.indexOf(value);
  return (
    <div role="radiogroup" aria-label="Split type" className="relative grid grid-cols-3 rounded-xl bg-surface-2 p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-surface shadow-sm transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {types.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          onClick={() => onChange(t)}
          className={cx("relative min-h-10 rounded-lg text-sm font-semibold transition-colors duration-200", value === t ? "text-text" : "text-muted")}
        >
          {SPLIT_LABELS[t]}
        </button>
      ))}
    </div>
  );
}

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function rateFor(data: GroupData, code: Currency) {
  const r = data.fxRates[code];
  return r ? String(+r.toPrecision(6)) : "";
}
