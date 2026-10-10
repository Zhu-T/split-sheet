import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeBalances, type LedgerEntry } from "./balances";
import { isCurrency, type Currency } from "./currencies";
import { myDebts, type Counterpart } from "./people";
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
      venmoUsername: schema.users.venmoUsername,
    })
    .from(schema.members)
    .leftJoin(schema.users, eq(schema.users.id, schema.members.userId))
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
  // Every payment counts as soon as it's recorded, including ones awaiting confirmation.
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
      const [expenses, members] = await Promise.all([loadExpenses(group.id), loadMembers(group.id)]);
      const { balances, transfers } = balancesFor(expenses, base);
      const byId = new Map(members.map((m) => [m.id, m]));
      // Claimed members are keyed by user so the same friend merges across groups.
      const counterpartOf = (id: string): Counterpart => {
        const m = byId.get(id);
        return m?.userId ? { key: `u:${m.userId}`, name: m.displayName } : { key: `m:${id}`, name: m?.displayName ?? "Someone" };
      };
      return {
        id: group.id,
        name: group.name,
        base,
        net: balances.get(memberId) ?? 0,
        debts: myDebts(transfers, memberId, counterpartOf, { id: group.id, name: group.name, currency: base }),
      };
    }),
  );
}

/** Names of a user's groups, for the group page's sidebar (no balances, so it's cheap). */
export function loadGroupNav(userId: string) {
  return db
    .select({ id: schema.groups.id, name: schema.groups.name })
    .from(schema.members)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.members.groupId))
    .where(and(eq(schema.members.userId, userId), eq(schema.members.active, true)))
    .orderBy(desc(schema.groups.createdAt));
}
