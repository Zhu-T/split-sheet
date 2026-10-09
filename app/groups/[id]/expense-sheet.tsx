"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteExpense, saveExpense } from "@/app/actions/expenses";
import { CurrencySelect } from "@/components/currency-select";
import { Sheet } from "@/components/sheet";
import { Button, ErrorText, Field, Money, cx, inputClass } from "@/components/ui";
import { isCurrency, type Currency } from "@/lib/currencies";
import { convert, formatMoney, parseAmount, toDecimalString } from "@/lib/money";
import { computeShares, type SplitType } from "@/lib/split";
import type { ExpenseView, GroupData } from "./group-screen";

const SPLIT_LABELS: Record<SplitType, string> = { equal: "Equally", exact: "Amounts", percent: "%", shares: "Shares" };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function ExpenseSheet({
  open,
  expense,
  data,
  onClose,
}: {
  open: boolean;
  expense: ExpenseView | null;
  data: GroupData;
  onClose: () => void;
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
  const [pending, startTransition] = useTransition();

  // Members who can appear in this split: active ones, plus anyone already on this expense.
  const candidates = data.members.filter((m) => m.active || expense?.splits.some((s) => s.memberId === m.id) || expense?.payerId === m.id);
  const amountMinor = parseAmount(amount || "0", currency) ?? 0;

  const preview = useMemo(() => {
    const ids = candidates.filter((m) => selected.has(m.id)).map((m) => m.id);
    const inputs = ids.map((memberId) => {
      const raw = values[memberId] ?? "";
      const value =
        splitType === "equal" ? 1 : splitType === "exact" ? (parseAmount(raw || "0", currency) ?? NaN) : Number(raw || "0");
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
      else onClose();
    });
  }

  function remove() {
    if (!expense || !confirm(`Delete "${expense.description}"?`)) return;
    startTransition(async () => {
      const result = await deleteExpense(data.groupId, expense.id);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  const remaining =
    splitType === "exact"
      ? { label: formatMoney(amountMinor - preview.entered, currency), ok: amountMinor - preview.entered === 0 }
      : splitType === "percent"
        ? { label: `${+(100 - preview.entered).toFixed(4)}%`, ok: Math.abs(100 - preview.entered) < 1e-9 }
        : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={expense ? "Edit expense" : "Add expense"}
      footer={
        <div className="flex gap-2">
          {expense && (
            <Button type="button" variant="danger" onClick={remove} disabled={pending}>
              Delete
            </Button>
          )}
          <Button type="button" className="flex-1" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Amount</span>
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus={!expense}
              className="h-16 w-full rounded-xl border border-line bg-surface px-3 text-4xl font-semibold tabular-nums outline-none focus:border-accent"
            />
          </label>
          <label>
            <span className="sr-only">Currency</span>
            <CurrencySelect value={currency} onChange={changeCurrency} className={cx(inputClass, "h-16 w-24")} />
          </label>
        </div>

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

        {currency !== data.base && (
          <Field
            label={`Rate: 1 ${currency} = ? ${data.base}`}
            hint={amountMinor > 0 && Number(rate) > 0 ? <>≈ {formatMoney(convert(amountMinor, currency, data.base, Number(rate)), data.base)}</> : "Today's rate is filled in; edit it to match your receipt."}
          >
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid by">
            <select value={payerId} onChange={(e) => setPayerId(e.target.value)} className={inputClass}>
              {candidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === data.myMemberId ? "You" : m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-muted">Split</span>
          <div role="radiogroup" aria-label="Split type" className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
            {(Object.keys(SPLIT_LABELS) as SplitType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={splitType === t}
                onClick={() => setSplitType(t)}
                className={cx(
                  "min-h-10 rounded-lg text-sm font-semibold",
                  splitType === t ? "bg-surface text-text shadow-sm" : "text-muted",
                )}
              >
                {SPLIT_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <ul className="divide-y divide-line rounded-2xl border border-line">
          {candidates.map((m) => {
            const on = selected.has(m.id);
            const share = on ? shareOf(m.id) : null;
            return (
              <li key={m.id} className="flex min-h-14 items-center gap-3 px-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(m.id)}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    className={cx(
                      "grid size-6 shrink-0 place-items-center rounded-md border-2",
                      on ? "border-accent bg-accent text-accent-ink" : "border-line",
                    )}
                  >
                    {on && (
                      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{m.id === data.myMemberId ? "You" : m.name}</span>
                </button>
                {on && splitType !== "equal" && (
                  <input
                    aria-label={`${m.name} ${SPLIT_LABELS[splitType]}`}
                    inputMode={splitType === "shares" ? "numeric" : "decimal"}
                    value={values[m.id] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
                    placeholder={splitType === "shares" ? "1" : "0"}
                    className="h-10 w-20 rounded-lg border border-line bg-surface px-2 text-right tabular-nums outline-none focus:border-accent"
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
          <p className={cx("text-sm", remaining.ok ? "text-owed" : "text-muted")}>
            {remaining.ok ? "Adds up ✓" : `${remaining.label} left to assign`}
          </p>
        )}
        {preview.result && !preview.result.ok && !remaining && <p className="text-sm text-muted">{preview.result.error}</p>}
        <ErrorText>{error}</ErrorText>
      </form>
    </Sheet>
  );
}

function rateFor(data: GroupData, code: Currency) {
  const r = data.fxRates[code];
  return r ? String(+r.toPrecision(6)) : "";
}
