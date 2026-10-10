"use server";

import { and, count, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireMember } from "@/lib/authz";
import { CURRENCY_CODES, type Currency } from "@/lib/currencies";
import { getRate } from "@/lib/fx";
import { decimals, parseAmount } from "@/lib/money";
import { asCurrency } from "@/lib/queries";
import { LIMITS, membersBelongToGroup } from "@/lib/rules";
import { computeShares, SPLIT_TYPES, type SplitInput, type SplitType } from "@/lib/split";
import type { ActionResult } from "./groups";

const ExpenseInput = z.object({
  expenseId: z.uuid().optional(),
  expectedUpdatedAt: z.iso.datetime().optional(),
  kind: z.enum(["expense", "settlement"]),
  description: z.string().trim().min(1, "Add a description").max(LIMITS.descriptionLength),
  date: z.iso.date("Pick a date"),
  payerId: z.uuid(),
  amount: z.string().max(20),
  currency: z.enum(CURRENCY_CODES as [Currency, ...Currency[]]),
  fxRate: z.number().positive().max(1e7).nullable().optional(),
  splitType: z.enum(SPLIT_TYPES as [SplitType, ...SplitType[]]),
  splits: z
    .array(z.object({ memberId: z.uuid(), value: z.string().max(20) }))
    .min(1, "Pick at least one person")
    .max(LIMITS.membersPerGroup),
});

export type ExpenseInput = z.input<typeof ExpenseInput>;

/** Turn the raw split values typed in the form into numbers for computeShares. */
function toSplitInputs(type: SplitType, raw: { memberId: string; value: string }[], currency: Currency) {
  const inputs: SplitInput[] = [];
  for (const { memberId, value } of raw) {
    if (type === "equal") {
      inputs.push({ memberId, value: 1 });
      continue;
    }
    const n = type === "exact" ? parseAmount(value || "0", currency) : Number(value || "0");
    if (n === null || !Number.isFinite(n) || n < 0 || n > 1e9) return null;
    inputs.push({ memberId, value: n });
  }
  return inputs;
}

export async function saveExpense(groupId: string, raw: ExpenseInput): Promise<ActionResult> {
  const { group, member: me } = await requireMember(groupId);
  const parsed = ExpenseInput.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;
  const base = asCurrency(group.baseCurrency);

  const amountMinor = parseAmount(input.amount, input.currency);
  if (amountMinor === null || amountMinor <= 0) return { error: "Enter a valid amount" };
  if (amountMinor > LIMITS.maxAmountMajor * 10 ** decimals(input.currency)) return { error: "That amount is too large" };

  if (input.kind === "settlement") {
    if (input.splits.length !== 1 || input.splits[0].memberId === input.payerId) {
      return { error: "A payment goes from one person to another" };
    }
    input.splitType = "exact";
    input.splits[0].value = input.amount;
  }

  const splitInputs = toSplitInputs(input.splitType, input.splits, input.currency);
  if (!splitInputs) return { error: "Check the split values" };
  // Shares are always computed here; nothing the browser calculated is trusted.
  const result = computeShares(amountMinor, input.splitType, splitInputs);
  if (!result.ok) return { error: result.error };

  let fxRate = 1;
  if (input.currency !== base) {
    try {
      fxRate = input.fxRate ?? (await getRate(input.currency, base));
    } catch {
      return { error: "Couldn't fetch the exchange rate. Enter it manually." };
    }
  }

  const now = new Date(); // millisecond precision, so it round-trips through the client exactly
  const values = {
    kind: input.kind,
    description: input.description,
    date: input.date,
    payerMemberId: input.payerId,
    amountMinor,
    currency: input.currency,
    fxRate,
    splitType: input.splitType,
    updatedAt: now,
  };
  const inputById = new Map(splitInputs.map((s) => [s.memberId, s.value]));
  const splitRows = (expenseId: string) =>
    result.shares.map((s) => ({ expenseId, memberId: s.memberId, shareMinor: s.shareMinor, input: inputById.get(s.memberId) ?? 0 }));

  return db.transaction(async (tx) => {
    const groupMembers = await tx
      .select({ id: schema.members.id, active: schema.members.active })
      .from(schema.members)
      .where(eq(schema.members.groupId, groupId));
    const referenced = [input.payerId, ...input.splits.map((s) => s.memberId)];

    if (!input.expenseId) {
      if (!membersBelongToGroup(referenced, groupMembers)) return { error: "Someone in this split isn't in the group" };
      const [{ n }] = await tx
        .select({ n: count() })
        .from(schema.expenses)
        .where(eq(schema.expenses.groupId, groupId));
      if (n >= LIMITS.expensesPerGroup) return { error: `Groups are limited to ${LIMITS.expensesPerGroup} expenses` };
      const [created] = await tx
        .insert(schema.expenses)
        .values({ ...values, groupId, createdBy: me.id, createdAt: now })
        .returning({ id: schema.expenses.id });
      await tx.insert(schema.expenseSplits).values(splitRows(created.id));
    } else {
      const [existing] = await tx
        .select({ payer: schema.expenses.payerMemberId, updatedAt: schema.expenses.updatedAt })
        .from(schema.expenses)
        .where(
          and(eq(schema.expenses.id, input.expenseId), eq(schema.expenses.groupId, groupId), isNull(schema.expenses.deletedAt)),
        )
        .for("update");
      if (!existing) return { error: "This expense no longer exists" };
      if (input.expectedUpdatedAt && existing.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        return { error: "Someone else just changed this expense. Close and reopen it to see their changes." };
      }
      const oldSplits = await tx
        .select({ memberId: schema.expenseSplits.memberId })
        .from(schema.expenseSplits)
        .where(eq(schema.expenseSplits.expenseId, input.expenseId));
      const alreadyReferenced = new Set([existing.payer, ...oldSplits.map((s) => s.memberId)]);
      if (!membersBelongToGroup(referenced, groupMembers, alreadyReferenced)) {
        return { error: "Someone in this split isn't in the group" };
      }
      await tx.update(schema.expenses).set(values).where(eq(schema.expenses.id, input.expenseId));
      await tx.delete(schema.expenseSplits).where(eq(schema.expenseSplits.expenseId, input.expenseId));
      await tx.insert(schema.expenseSplits).values(splitRows(input.expenseId));
    }
    refresh();
    return {};
  });
}

export async function deleteExpense(groupId: string, expenseId: string): Promise<ActionResult> {
  await requireMember(groupId);
  if (!z.uuid().safeParse(expenseId).success) return { error: "Unknown expense" };
  const now = new Date();
  await db
    .update(schema.expenses)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.groupId, groupId)));
  refresh();
  return {};
}
