"use client";

import { useState, useTransition } from "react";
import { deleteExpense, saveExpense } from "@/app/actions/expenses";
import { Sheet } from "@/components/sheet";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";
import { formatMoney, parseAmount, toDecimalString } from "@/lib/money";
import { venmoPayUrl } from "@/lib/venmo";
import type { ExpenseView, GroupData, MemberView } from "./group-screen";

/** Record a payment between two members. Amounts are in the group's base currency. */
export function SettleSheet({
  open,
  draft,
  existing,
  data,
  onClose,
  onDone,
}: {
  open: boolean;
  draft: { from: string; to: string; amountMinor: number } | null;
  existing: ExpenseView | null;
  data: GroupData;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const active = data.members.filter((m) => m.active);
  const [from, setFrom] = useState(existing?.payerId ?? draft?.from ?? data.myMemberId);
  const [to, setTo] = useState(existing?.splits[0]?.memberId ?? draft?.to ?? active.find((m) => m.id !== data.myMemberId)?.id ?? "");
  const [amount, setAmount] = useState(
    existing ? toDecimalString(existing.amountMinor, existing.currency) : draft ? toDecimalString(draft.amountMinor, data.base) : "",
  );
  const [date, setDate] = useState(existing?.date ?? new Date().toLocaleDateString("en-CA"));
  const [error, setError] = useState<string>();
  const [venmoOpened, setVenmoOpened] = useState(false);
  const [pending, startTransition] = useTransition();
  const currency = existing?.currency ?? data.base;
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
        currency,
        fxRate: existing && existing.currency !== data.base ? existing.fxRate : null,
        splitType: "exact",
        splits: [{ memberId: to, value: amount }],
      });
      if (result.error) setError(result.error);
      else onDone(existing ? "Payment updated" : "Payment recorded");
    });
  }

  function remove() {
    if (!existing || !confirm("Delete this payment?")) return;
    startTransition(async () => {
      const result = await deleteExpense(data.groupId, existing.id);
      if (result.error) setError(result.error);
      else onDone("Payment deleted");
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? "Edit payment" : "Record a payment"}
      footer={
        <Button type="button" className="w-full" onClick={submit} disabled={pending || !to || from === to}>
          {pending ? "Saving…" : existing ? "Save changes" : venmoOpened ? "I paid. Record payment" : "Record payment"}
        </Button>
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
        <Field label={`Amount (${currency})`}>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-16 w-full rounded-xl border border-line bg-surface px-3 text-3xl font-semibold tabular-nums outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-3 focus:ring-accent/20"
          />
        </Field>
        {/* Venmo is USD-only, and only the person paying can send money from their own account. */}
        {!existing && from === data.myMemberId && to && to !== from && currency === "USD" && (
          <VenmoPay
            recipient={data.members.find((m) => m.id === to)}
            amount={amount}
            note={`Split: ${data.groupName}`}
            opened={venmoOpened}
            onOpen={() => setVenmoOpened(true)}
          />
        )}
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
        {from === to && <p className="text-sm text-muted">Pick two different people.</p>}
        <ErrorText>{error}</ErrorText>
        {/* Kept apart from the primary action so it can't be tapped by accident. */}
        {existing && (
          <div className="border-t border-line pt-4">
            <Button type="button" variant="danger" className="w-full" onClick={remove} disabled={pending}>
              Delete payment
            </Button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

/**
 * Opens a pre-filled Venmo payment (app on phones, website elsewhere). Venmo has no API to
 * confirm the payment, so the person records it here once they've sent it.
 */
function VenmoPay({
  recipient,
  amount,
  note,
  opened,
  onOpen,
}: {
  recipient: MemberView | undefined;
  amount: string;
  note: string;
  opened: boolean;
  onOpen: () => void;
}) {
  if (!recipient) return null;
  if (!recipient.venmo) {
    return <p className="text-sm text-muted">{recipient.name} hasn&apos;t added a Venmo username yet.</p>;
  }
  const minor = parseAmount(amount || "", "USD");
  const venmo = recipient.venmo;

  function open() {
    if (!minor) return;
    const phone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const url = venmoPayUrl(venmo, toDecimalString(minor, "USD"), note, phone);
    onOpen();
    if (phone) window.location.assign(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-2 rounded-2xl border border-line p-3">
      <button
        type="button"
        onClick={open}
        disabled={!minor}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0074de] px-4 text-[15px] font-semibold text-white transition active:scale-[0.97] disabled:opacity-50"
      >
        Pay {minor ? formatMoney(minor, "USD") : ""} with Venmo
      </button>
      <p className="text-center text-xs text-muted">
        {opened ? "Finished in Venmo? Record the payment below so balances update." : `Opens Venmo to pay @${venmo}.`}
      </p>
    </div>
  );
}
