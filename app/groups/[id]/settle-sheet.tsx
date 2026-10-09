"use client";

import { useState, useTransition } from "react";
import { deleteExpense, saveExpense } from "@/app/actions/expenses";
import { Sheet } from "@/components/sheet";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";
import { toDecimalString } from "@/lib/money";
import type { ExpenseView, GroupData } from "./group-screen";

/** Record a payment between two members. Amounts are in the group's base currency. */
export function SettleSheet({
  open,
  draft,
  existing,
  data,
  onClose,
}: {
  open: boolean;
  draft: { from: string; to: string; amountMinor: number } | null;
  existing: ExpenseView | null;
  data: GroupData;
  onClose: () => void;
}) {
  const active = data.members.filter((m) => m.active);
  const [from, setFrom] = useState(existing?.payerId ?? draft?.from ?? data.myMemberId);
  const [to, setTo] = useState(existing?.splits[0]?.memberId ?? draft?.to ?? active.find((m) => m.id !== data.myMemberId)?.id ?? "");
  const [amount, setAmount] = useState(
    existing ? toDecimalString(existing.amountMinor, existing.currency) : draft ? toDecimalString(draft.amountMinor, data.base) : "",
  );
  const [date, setDate] = useState(existing?.date ?? new Date().toLocaleDateString("en-CA"));
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const label = (id: string) => (id === data.myMemberId ? "You" : (data.members.find((m) => m.id === id)?.name ?? ""));
  const options = data.members.filter((m) => m.active || m.id === existing?.payerId || m.id === existing?.splits[0]?.memberId);

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await saveExpense(data.groupId, {
        expenseId: existing?.id,
        expectedUpdatedAt: existing?.updatedAt,
        kind: "settlement",
        description: "Payment",
        date,
        payerId: from,
        amount,
        currency: existing?.currency ?? data.base,
        fxRate: existing && existing.currency !== data.base ? existing.fxRate : null,
        splitType: "exact",
        splits: [{ memberId: to, value: amount }],
      });
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  function remove() {
    if (!existing || !confirm("Delete this payment?")) return;
    startTransition(async () => {
      const result = await deleteExpense(data.groupId, existing.id);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? "Edit payment" : "Record a payment"}
      footer={
        <div className="flex gap-2">
          {existing && (
            <Button type="button" variant="danger" onClick={remove} disabled={pending}>
              Delete
            </Button>
          )}
          <Button type="button" className="flex-1" onClick={submit} disabled={pending || !to || from === to}>
            {pending ? "Saving…" : "Save payment"}
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
        <p className="text-muted">
          Record money that changed hands outside the app, like cash or a bank transfer.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <select value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass}>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {label(m.id)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To">
            <select value={to} onChange={(e) => setTo(e.target.value)} className={inputClass}>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {label(m.id)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={`Amount (${existing?.currency ?? data.base})`}>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-16 w-full rounded-xl border border-line bg-surface px-3 text-3xl font-semibold tabular-nums outline-none focus:border-accent"
          />
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
        {from === to && <p className="text-sm text-muted">Pick two different people.</p>}
        <ErrorText>{error}</ErrorText>
      </form>
    </Sheet>
  );
}
