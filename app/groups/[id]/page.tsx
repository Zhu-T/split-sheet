import type { Metadata } from "next";
import Link from "next/link";
import { PageMotion } from "@/components/motion";
import { Card, Initials, Page, SettingsIcon, Skeleton, TopBar, cx } from "@/components/ui";
import { requireMember } from "@/lib/authz";
import { isPastTrip, isPendingPayment } from "@/lib/rules";
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
    archived: !!group.archivedAt,
    isOwner: member.role === "owner",
    tripOver: isPastTrip(group.tripEnd, null, new Date()),
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
      edited: e.edited,
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
            className="grid size-11 place-items-center rounded-full text-muted transition active:scale-90"
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
function GroupNav({
  groups,
  currentId,
}: {
  groups: { id: string; name: string; tripEnd: string | null; archivedAt: Date | null }[];
  currentId: string;
}) {
  const now = new Date();
  const current = groups.filter((g) => !isPastTrip(g.tripEnd, g.archivedAt, now));
  const past = groups.filter((g) => isPastTrip(g.tripEnd, g.archivedAt, now));
  const item = (g: { id: string; name: string }) => {
    const here = g.id === currentId;
    return (
      <li key={g.id}>
        <Link
          href={`/groups/${g.id}`}
          aria-current={here ? "page" : undefined}
          className={cx("flex min-h-11 items-center gap-2 px-3 text-sm transition-colors hover:bg-surface-2/60", here && "bg-surface-2 font-semibold")}
        >
          <Initials name={g.name} className="size-7 text-xs" />
          <span className="truncate">{g.name}</span>
        </Link>
      </li>
    );
  };
  return (
    <Card className="overflow-hidden">
      <Link
        href="/"
        transitionTypes={["nav-back"]}
        className="flex min-h-11 items-center gap-2 border-b border-line px-4 text-sm font-medium text-accent hover:bg-surface-2/60"
      >
        All groups
      </Link>
      <ul className="py-1">{current.map(item)}</ul>
      {past.length > 0 && (
        <>
          <p className="border-t border-line px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Past trips</p>
          <ul className="pb-1">{past.map(item)}</ul>
        </>
      )}
    </Card>
  );
}
