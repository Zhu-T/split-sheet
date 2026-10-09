import { auth } from "@/auth";
import { findActiveMembership } from "@/lib/authz";
import { toCsv } from "@/lib/csv";
import { toDecimalString } from "@/lib/money";
import { asCurrency, loadExpenses, loadMembers } from "@/lib/queries";

export async function GET(_req: Request, ctx: RouteContext<"/groups/[id]/export">) {
  const { id } = await ctx.params;
  const session = await auth();
  const userId = session?.user?.id;
  const membership = userId ? await findActiveMembership(id, userId) : null;
  if (!membership) return new Response("Not found", { status: 404 });

  const [members, expenses] = await Promise.all([loadMembers(id), loadExpenses(id)]);
  const name = new Map(members.map((m) => [m.id, m.displayName]));
  const base = asCurrency(membership.group.baseCurrency);

  const rows: (string | number)[][] = [
    ["Date", "Type", "Description", "Paid by", "Amount", "Currency", `Rate to ${base}`, "Person", "Share"],
  ];
  for (const e of expenses.toReversed()) {
    for (const s of e.splits) {
      rows.push([
        e.date,
        e.kind,
        e.description,
        name.get(e.payerMemberId) ?? "",
        toDecimalString(e.amountMinor, e.currency),
        e.currency,
        e.fxRate,
        name.get(s.memberId) ?? "",
        toDecimalString(s.shareMinor, e.currency),
      ]);
    }
  }

  const filename = `${membership.group.name.replace(/[^\w -]+/g, "").trim() || "group"}.csv`;
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
