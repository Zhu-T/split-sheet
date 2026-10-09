import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeBalances, type LedgerEntry } from "./balances";
import { isCurrency, type Currency } from "./currencies";
import { simplifyDebts } from "./simplify";

export type GroupMemberRow = Awaited<ReturnType<typeof loadMembers>>[number];

export function loadMembers(groupId: string) {
  return db
    .select({
      id: schema.members.id,
      userId: schema.members.userId,
      displayName: schema.members.displayName,
      email: schema.members.email,
      role: schema.members.role,
      active: schema.members.active,
      joinedAt: schema.members.joinedAt,
    })
    .from(schema.members)
    .where(eq(schema.members.groupId, groupId))
    .orderBy(asc(schema.members.joinedAt));
}

export async function loadExpenses(groupId: string) {
  const rows = await db
    .select()
    .from(schema.expenses)
    .where(and(eq(schema.expenses.groupId, groupId), isNull(schema.expenses.deletedAt)))
    .orderBy(desc(schema.expenses.date), desc(schema.expenses.createdAt));
  const splits = rows.length
    ? await db
        .select()
        .from(schema.expenseSplits)
        .where(inArray(schema.expenseSplits.expenseId, rows.map((r) => r.id)))
    : [];
  const byExpense = Map.groupBy(splits, (s) => s.expenseId);
  return rows.map((e) => ({
    ...e,
    currency: asCurrency(e.currency),
    splits: (byExpense.get(e.id) ?? []).map((s) => ({
      memberId: s.memberId,
      shareMinor: s.shareMinor,
      input: s.input,
    })),
  }));
}

export type ExpenseRow = Awaited<ReturnType<typeof loadExpenses>>[number];

export function asCurrency(code: string): Currency {
  return isCurrency(code) ? code : "USD";
}

export function balancesFor(expenses: ExpenseRow[], base: Currency) {
  const entries: LedgerEntry[] = expenses.map((e) => ({
    payerMemberId: e.payerMemberId,
    amountMinor: e.amountMinor,
    currency: e.currency,
    fxRate: e.fxRate,
    splits: e.splits,
  }));
  const balances = computeBalances(entries, base);
  return { balances, transfers: simplifyDebts(balances) };
}

/** Every active group of a user with their net balance in that group's base currency. */
export async function loadMyGroups(userId: string) {
  const rows = await db
    .select({ group: schema.groups, memberId: schema.members.id })
    .from(schema.members)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.members.groupId))
    .where(and(eq(schema.members.userId, userId), eq(schema.members.active, true)))
    .orderBy(desc(schema.groups.createdAt));

  return Promise.all(
    rows.map(async ({ group, memberId }) => {
      const base = asCurrency(group.baseCurrency);
      const { balances } = balancesFor(await loadExpenses(group.id), base);
      return { id: group.id, name: group.name, base, net: balances.get(memberId) ?? 0 };
    }),
  );
}
