import type { Metadata } from "next";
import Link from "next/link";
import { PageMotion } from "@/components/motion";
import { Page, Skeleton, TopBar } from "@/components/ui";
import { requireMember } from "@/lib/authz";
import { CURRENCY_CODES, type Currency } from "@/lib/currencies";
import { getRates } from "@/lib/fx";
import { asCurrency, balancesFor, loadExpenses, loadMembers } from "@/lib/queries";
import { GroupScreen, type GroupData } from "./group-screen";

export const metadata: Metadata = { title: "Group" };

export default function GroupPage({ params }: PageProps<"/groups/[id]">) {
  return (
    <PageMotion
      fallback={
        <>
          <TopBar title="" back="/" />
          <Page>
            <Skeleton />
          </Page>
        </>
      }
    >
      <Group params={params} />
    </PageMotion>
  );
}

async function Group({ params }: Pick<PageProps<"/groups/[id]">, "params">) {
  const { id } = await params;
  const { group, member } = await requireMember(id);
  const base = asCurrency(group.baseCurrency);
  const [members, expenses] = await Promise.all([loadMembers(id), loadExpenses(id)]);
  const { balances, transfers } = balancesFor(expenses, base);

  // Suggested rates for entering foreign-currency expenses (base units per 1 unit of X).
  let fxRates: Partial<Record<Currency, number>> = { [base]: 1 };
  try {
    const rates = await getRates(base);
    fxRates = Object.fromEntries(CURRENCY_CODES.filter((c) => rates[c]).map((c) => [c, 1 / rates[c]!]));
  } catch {
    // Rates are optional; the form asks for one manually.
  }

  const data: GroupData = {
    groupId: group.id,
    base,
    myMemberId: member.id,
    members: members.map((m) => ({
      id: m.id,
      name: m.displayName,
      active: m.active,
      placeholder: m.userId === null,
      joinedAt: m.userId ? m.joinedAt.toISOString() : null, // shown as "X joined" in activity
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      kind: e.kind,
      description: e.description,
      date: e.date,
      payerId: e.payerMemberId,
      amountMinor: e.amountMinor,
      currency: e.currency,
      fxRate: e.fxRate,
      splitType: e.splitType,
      updatedAt: e.updatedAt.toISOString(),
      splits: e.splits,
    })),
    balances: Object.fromEntries(balances),
    transfers,
    fxRates,
  };

  return (
    <>
      <TopBar
        title={group.name}
        back="/"
        action={
          <Link
            href={`/groups/${group.id}/settings`}
            transitionTypes={["nav-forward"]}
            aria-label="Members and group settings"
            className="-mr-2 grid size-11 place-items-center rounded-full text-muted transition active:scale-90"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2" />
            </svg>
          </Link>
        }
      />
      <Page>
        <GroupScreen data={data} />
      </Page>
    </>
  );
}
