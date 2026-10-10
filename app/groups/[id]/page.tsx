import type { Metadata } from "next";
import Link from "next/link";
import { PageMotion } from "@/components/motion";
import { Card, Initials, Page, SettingsIcon, Skeleton, TopBar, cx } from "@/components/ui";
import { requireMember } from "@/lib/authz";
import { isPendingPayment } from "@/lib/rules";
import { CURRENCY_CODES, type Currency } from "@/lib/currencies";
import { getRates } from "@/lib/fx";
import { asCurrency, balancesFor, loadExpenses, loadGroupNav, loadMembers } from "@/lib/queries";
import { GroupScreen, type GroupData } from "./group-screen";

export const metadata: Metadata = { title: "Group" };

export default function GroupPage({ params }: PageProps<"/groups/[id]">) {
  return (
    <PageMotion
      fallback={
        <>
          <TopBar wide title="" back="/" />
          <Page wide>
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
  const { group, member, user } = await requireMember(id);
  const base = asCurrency(group.baseCurrency);
  const [members, expenses, myGroups] = await Promise.all([loadMembers(id), loadExpenses(id), loadGroupNav(user.id)]);
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
    groupName: group.name,
    requireConfirmation: group.requirePaymentConfirmation,
    trip: group.tripStart || group.tripEnd ? { start: group.tripStart, end: group.tripEnd } : null,
    base,
    myMemberId: member.id,
    members: members.map((m) => ({
      id: m.id,
      name: m.displayName,
      active: m.active,
      placeholder: m.userId === null,
      venmo: m.venmoUsername,
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
      pending: isPendingPayment(e),
      splits: e.splits,
    })),
    balances: Object.fromEntries(balances),
    transfers,
    fxRates,
  };

  return (
    <>
      <TopBar
        wide
        title={group.name}
        back="/"
        action={
          <Link
            href={`/groups/${group.id}/settings`}
            transitionTypes={["nav-forward"]}
            aria-label="Group settings"
            className="-mr-2 grid size-11 place-items-center rounded-full text-muted transition active:scale-90"
          >
            <SettingsIcon />
          </Link>
        }
      />
      <Page wide>
        <GroupScreen data={data} nav={<GroupNav groups={myGroups} currentId={group.id} />} />
      </Page>
    </>
  );
}

/** Desktop sidebar: jump between groups without going back to the dashboard. */
function GroupNav({ groups, currentId }: { groups: { id: string; name: string }[]; currentId: string }) {
  return (
    <Card className="overflow-hidden">
      <Link
        href="/"
        transitionTypes={["nav-back"]}
        className="flex min-h-11 items-center gap-2 border-b border-line px-4 text-sm font-medium text-accent hover:bg-surface-2/60"
      >
        All groups
      </Link>
      <ul className="py-1">
        {groups.map((g) => {
          const current = g.id === currentId;
          return (
            <li key={g.id}>
              <Link
                href={`/groups/${g.id}`}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "flex min-h-11 items-center gap-2 px-3 text-sm transition-colors hover:bg-surface-2/60",
                  current && "bg-surface-2 font-semibold",
                )}
              >
                <Initials name={g.name} className="size-7 text-xs" />
                <span className="truncate">{g.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
