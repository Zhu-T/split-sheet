"use server";

import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ExpenseSnapshot } from "@/db/schema";
import { requireMember } from "@/lib/authz";
import { CURRENCY_CODES, type Currency } from "@/lib/currencies";
import { getRate } from "@/lib/fx";
import { describeChanges, describeEvent, snapshotsDiffer } from "@/lib/history";
import { decimals, formatMoney, parseAmount } from "@/lib/money";
import { asCurrency } from "@/lib/queries";
import { canChangeExpense, LIMITS, membersBelongToGroup, paymentConfirmedOnSave } from "@/lib/rules";
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
  if (!canChangeExpense(input.kind, group.archivedAt)) return { error: ARCHIVED };
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
    // Payments in a group that asks for confirmation wait for the recipient, unless they
    // recorded it themselves. (Re-checked on every edit, so changing a payment re-asks.)
    confirmedAt:
      input.kind === "settlement" &&
      paymentConfirmedOnSave(group.requirePaymentConfirmation, me.id, input.splits[0].memberId)
        ? now
        : null,
  };
  const inputById = new Map(splitInputs.map((s) => [s.memberId, s.value]));
  const splitRows = (expenseId: string) =>
    result.shares.map((s) => ({ expenseId, memberId: s.memberId, shareMinor: s.shareMinor, input: inputById.get(s.memberId) ?? 0 }));

  const after: ExpenseSnapshot = {
    kind: input.kind,
    description: input.description,
    amountMinor,
    currency: input.currency,
    fxRate,
    date: input.date,
    payerId: input.payerId,
    splitType: input.splitType,
    splits: result.shares.map((sh) => ({ memberId: sh.memberId, shareMinor: sh.shareMinor })),
  };

  const saved: ActionResult = await db.transaction(async (tx) => {
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
      await tx.insert(schema.expenseEvents).values({ expenseId: created.id, groupId, memberId: me.id, action: "created", after, createdAt: now });
    } else {
      const [existing] = await tx
        .select()
        .from(schema.expenses)
        .where(
          and(eq(schema.expenses.id, input.expenseId), eq(schema.expenses.groupId, groupId), isNull(schema.expenses.deletedAt)),
        )
        .for("update");
      if (!existing) return { error: "This expense no longer exists" };
      if (existing.kind !== input.kind) return { error: "An expense can't be turned into a payment (or back)" };
      if (input.expectedUpdatedAt && existing.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        return { error: "Someone else just changed this expense. Close and reopen it to see their changes." };
      }
      const oldSplits = await tx
        .select({ memberId: schema.expenseSplits.memberId, shareMinor: schema.expenseSplits.shareMinor })
        .from(schema.expenseSplits)
        .where(eq(schema.expenseSplits.expenseId, input.expenseId));
      const alreadyReferenced = new Set([existing.payerMemberId, ...oldSplits.map((s) => s.memberId)]);
      if (!membersBelongToGroup(referenced, groupMembers, alreadyReferenced)) {
        return { error: "Someone in this split isn't in the group" };
      }
      const before = snapshotOf(existing, oldSplits);
      if (!snapshotsDiffer(before, after)) return {}; // nothing changed: no write, no history entry
      await tx.update(schema.expenses).set(values).where(eq(schema.expenses.id, input.expenseId));
      await tx.delete(schema.expenseSplits).where(eq(schema.expenseSplits.expenseId, input.expenseId));
      await tx.insert(schema.expenseSplits).values(splitRows(input.expenseId));
      await tx.insert(schema.expenseEvents).values({ expenseId: input.expenseId, groupId, memberId: me.id, action: "edited", before, after, createdAt: now });
    }
    refresh();
    return {};
  });
  return saved;
}

const ARCHIVED = "This trip is archived. Unarchive it to change expenses.";

type ExpenseRowForSnapshot = Pick<
  typeof schema.expenses.$inferSelect,
  "kind" | "description" | "amountMinor" | "currency" | "fxRate" | "date" | "payerMemberId" | "splitType"
>;

function snapshotOf(e: ExpenseRowForSnapshot, splits: { memberId: string; shareMinor: number }[]): ExpenseSnapshot {
  return {
    kind: e.kind,
    description: e.description,
    amountMinor: e.amountMinor,
    currency: e.currency,
    fxRate: e.fxRate,
    date: e.date,
    payerId: e.payerMemberId,
    splitType: e.splitType,
    splits: splits.map((sp) => ({ memberId: sp.memberId, shareMinor: sp.shareMinor })),
  };
}

/** Soft-delete an expense or payment. Returns its id so the screen can offer Undo. */
export async function deleteExpense(groupId: string, expenseId: string): Promise<ActionResult & { deletedId?: string }> {
  const { group, member: me } = await requireMember(groupId);
  if (!z.uuid().safeParse(expenseId).success) return { error: "Unknown expense" };
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ kind: schema.expenses.kind })
      .from(schema.expenses)
      .where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.groupId, groupId), isNull(schema.expenses.deletedAt)))
      .for("update");
    if (!row) return { error: "This expense no longer exists" };
    if (!canChangeExpense(row.kind, group.archivedAt)) return { error: ARCHIVED };
    await tx.update(schema.expenses).set({ deletedAt: now, updatedAt: now }).where(eq(schema.expenses.id, expenseId));
    await tx.insert(schema.expenseEvents).values({ expenseId, groupId, memberId: me.id, action: "deleted", createdAt: now });
    refresh();
    return { deletedId: expenseId };
  });
}

/** Undo a delete (from the toast or Recently deleted). Any member can, as any member can delete. */
export async function restoreExpense(groupId: string, expenseId: string): Promise<ActionResult> {
  const { group, member: me } = await requireMember(groupId);
  if (!z.uuid().safeParse(expenseId).success) return { error: "Unknown expense" };
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ kind: schema.expenses.kind })
      .from(schema.expenses)
      .where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.groupId, groupId), isNotNull(schema.expenses.deletedAt)))
      .for("update");
    if (!row) return { error: "Nothing to restore" };
    if (!canChangeExpense(row.kind, group.archivedAt)) return { error: ARCHIVED };
    await tx.update(schema.expenses).set({ deletedAt: null, updatedAt: now }).where(eq(schema.expenses.id, expenseId));
    await tx.insert(schema.expenseEvents).values({ expenseId, groupId, memberId: me.id, action: "restored", createdAt: now });
    refresh();
    return {};
  });
}

/** The person being paid confirms they received a payment. */
export async function confirmPayment(groupId: string, expenseId: string): Promise<ActionResult> {
  const { member: me } = await requireMember(groupId);
  if (!z.uuid().safeParse(expenseId).success) return { error: "Unknown payment" };
  const [receiver] = await db
    .select({ memberId: schema.expenseSplits.memberId })
    .from(schema.expenseSplits)
    .innerJoin(schema.expenses, eq(schema.expenses.id, schema.expenseSplits.expenseId))
    .where(
      and(
        eq(schema.expenses.id, expenseId),
        eq(schema.expenses.groupId, groupId),
        eq(schema.expenses.kind, "settlement"),
        isNull(schema.expenses.deletedAt),
      ),
    );
  if (!receiver) return { error: "This payment no longer exists" };
  // Only the person who received the money can confirm it.
  if (receiver.memberId !== me.id) return { error: "Only the person being paid can confirm this" };
  const confirmed = await db
    .update(schema.expenses)
    .set({ confirmedAt: new Date() })
    .where(and(eq(schema.expenses.id, expenseId), isNull(schema.expenses.confirmedAt)))
    .returning({ id: schema.expenses.id });
  if (confirmed.length) {
    await db.insert(schema.expenseEvents).values({ expenseId, groupId, memberId: me.id, action: "confirmed" });
  }
  refresh();
  return {};
}

export type HistoryEntry = { id: string; at: string; headline: string; lines: string[] };

/** An expense's history, newest first, as readable lines (with people's current names). */
export async function getExpenseHistory(groupId: string, expenseId: string): Promise<HistoryEntry[]> {
  await requireMember(groupId);
  if (!z.uuid().safeParse(expenseId).success) return [];
  const [events, members] = await Promise.all([
    db
      .select()
      .from(schema.expenseEvents)
      .where(and(eq(schema.expenseEvents.expenseId, expenseId), eq(schema.expenseEvents.groupId, groupId)))
      .orderBy(desc(schema.expenseEvents.createdAt))
      .limit(50),
    db.select({ id: schema.members.id, name: schema.members.displayName }).from(schema.members).where(eq(schema.members.groupId, groupId)),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const nameOf = (id: string) => names.get(id) ?? "Someone";
  const money = (minor: number, currency: string) => formatMoney(minor, asCurrency(currency));
  return events.map((e) => {
    const kind = (e.after ?? e.before)?.kind ?? "expense";
    return {
      id: e.id,
      at: e.createdAt.toISOString(),
      headline: describeEvent(e.action, e.memberId ? nameOf(e.memberId) : "Someone", kind),
      lines: e.action === "edited" && e.before && e.after ? describeChanges(e.before, e.after, nameOf, money) : [],
    };
  });
}
