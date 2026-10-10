import Link from "next/link";
import type { CSSProperties } from "react";
import { CountUp } from "@/components/count-up";
import { PageMotion } from "@/components/motion";
import { PeoplePanel } from "@/components/people-panel";
import { formatDate } from "@/components/calendar";
import { Card, Initials, Money, Page, SettingsIcon, Skeleton, TopBar, cx } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { isCurrency, type Currency } from "@/lib/currencies";
import { getRates } from "@/lib/fx";
import { convert } from "@/lib/money";
import { summarisePeople } from "@/lib/people";
import { loadMyGroups } from "@/lib/queries";
import { isPastTrip } from "@/lib/rules";
import { NewGroupButton } from "./new-group-button";

export default function DashboardPage() {
  return (
    <>
      <TopBar
        wide
        title="Split"
        action={
          <Link href="/settings" transitionTypes={["nav-forward"]} aria-label="Settings" className="grid size-11 place-items-center rounded-full text-muted transition active:scale-90">
            <SettingsIcon />
          </Link>
        }
      />
      <Page wide>
        <PageMotion fallback={<Skeleton />}>
          <Dashboard />
        </PageMotion>
      </Page>
    </>
  );
}

async function Dashboard() {
  const user = await requireUser();
  const groups = await loadMyGroups(user.id);
  const home: Currency = isCurrency(user.homeCurrency) ? user.homeCurrency : "USD";

  // Overall total in the home currency at today's rates; null if rates are unavailable.
  let total: number | null = 0;
  let rates: Partial<Record<Currency, number>> = {};
  try {
    if (groups.some((g) => g.base !== home)) rates = await getRates(home);
    for (const g of groups) {
      const rate = g.base === home ? 1 : rates[g.base];
      if (!rate) throw new Error("missing rate");
      total += convert(g.net, g.base, home, 1 / rate);
    }
  } catch {
    total = null;
  }

  const people = summarisePeople(groups.flatMap((g) => g.debts), home, rates);
  const now = new Date();
  const current = groups
    .filter((g) => !isPastTrip(g.tripEnd, g.archivedAt, now))
    .sort((a, b) => (a.tripStart ?? "9999").localeCompare(b.tripStart ?? "9999"));
  const past = groups
    .filter((g) => isPastTrip(g.tripEnd, g.archivedAt, now))
    .sort((a, b) => (b.tripEnd ?? "").localeCompare(a.tripEnd ?? ""));

  if (groups.length === 0) {
    return (
      <Card className="rise mx-auto max-w-xl px-5 py-8 text-center">
        <h2 className="text-xl font-semibold">Welcome, {user.name.split(" ")[0]}</h2>
        <p className="mt-2 text-muted">Create a group, or open an invite link a friend sent you.</p>
        <div className="mt-6">
          <NewGroupButton homeCurrency={home} />
        </div>
      </Card>
    );
  }

  return (
    // Desktop: groups on the left, people on the right. Phones: one column, people last.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div>
        <Card className="rise px-5 py-5">
          <p className="text-sm text-muted">Overall</p>
          {total === null ? (
            <p className="mt-1 text-muted">Exchange rates are unavailable right now.</p>
          ) : (
            <p className="mt-1 text-3xl font-semibold tracking-tight">
              {total === 0 ? (
                "All settled up"
              ) : (
                <>
                  <span className="text-lg font-medium text-muted">{total > 0 ? "You're owed " : "You owe "}</span>
                  <CountUp minor={total} currency={home} signed />
                </>
              )}
            </p>
          )}
          {total !== null && groups.some((g) => g.base !== home) && (
            <p className="mt-1 text-xs text-muted">Approximate, converted to {home} at today&apos;s rates.</p>
          )}
        </Card>

        <div className="mt-6 mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
            {past.length ? "Current trips" : "Groups"}
          </h2>
          <NewGroupButton homeCurrency={home} variant="secondary" />
        </div>
        {current.length ? (
          <GroupList groups={current} />
        ) : (
          <Card className="px-4 py-6 text-center text-sm text-muted">No current trips. Start one with New group.</Card>
        )}

        {/* Finished trips (ended or archived) stay out of the way, but their balances still count above. */}
        {past.length > 0 && (
          <details className="group mt-6">
            <summary className="mb-2 flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-muted uppercase">
              <svg viewBox="0 0 24 24" className="size-4 transition-transform duration-200 group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
              Past trips ({past.length})
            </summary>
            <GroupList groups={past} past />
          </details>
        )}
      </div>

      <aside className="lg:sticky lg:top-18">
        <PeoplePanel people={people} home={home} />
      </aside>
    </div>
  );
}

type GroupRow = Awaited<ReturnType<typeof loadMyGroups>>[number];

function GroupList({ groups, past }: { groups: GroupRow[]; past?: boolean }) {
  return (
    <Card>
      <ul className="divide-y divide-line">
        {groups.map((g, i) => (
          <li key={g.id} className="rise" style={{ "--i": i + 1 } as CSSProperties}>
            <Link
              href={`/groups/${g.id}`}
              transitionTypes={["nav-forward"]}
              className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-2/60 active:bg-surface-2"
            >
              <Initials name={g.name} className={past ? "opacity-70" : undefined} />
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate font-medium", past && "text-muted")}>{g.name}</span>
                {past && (
                  <span className="block truncate text-xs text-muted">
                    {g.archivedAt ? "Archived" : `Ended ${formatDate(g.tripEnd!, { month: "short", day: "numeric" })}`}
                  </span>
                )}
              </span>
              <svg aria-hidden viewBox="0 0 24 24" className="order-last size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
              <span className="text-right text-sm">
                {g.net === 0 ? (
                  <span className="text-muted">settled up</span>
                ) : (
                  <>
                    <span className="block text-xs text-muted">{g.net > 0 ? "you're owed" : "you owe"}</span>
                    <Money minor={g.net} currency={g.base} signed className="font-semibold" />
                  </>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
