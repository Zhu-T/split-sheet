import Link from "next/link";
import type { CSSProperties } from "react";
import type { Currency } from "@/lib/currencies";
import type { PersonSummary } from "@/lib/people";
import { Card, Initials, Money } from "./ui";

/** Everyone you share a group with and where you stand with them, across all groups. */
export function PeoplePanel({ people, home }: { people: PersonSummary[]; home: Currency }) {
  return (
    <Card className="rise overflow-hidden">
      <h2 className="border-b border-line px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">People</h2>
      {people.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">You&apos;re all square with everyone.</p>
      ) : (
        <ul className="divide-y divide-line">
          {people.map((p, i) => (
            <li key={p.key} className="rise flex items-start gap-3 px-4 py-3" style={{ "--i": i + 1 } as CSSProperties}>
              <Initials name={p.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <ul className="mt-0.5 space-y-0.5 text-xs text-muted">
                  {p.groups.map((g) => (
                    <li key={g.groupId} className="flex justify-between gap-2">
                      <Link href={`/groups/${g.groupId}`} transitionTypes={["nav-forward"]} className="min-w-0 truncate hover:underline">
                        {g.groupName}
                      </Link>
                      <Money minor={g.amountMinor} currency={g.currency} signed />
                    </li>
                  ))}
                </ul>
              </div>
              <div className="shrink-0 text-right text-sm">
                {p.netHome === null ? (
                  <span className="text-muted">see groups</span>
                ) : (
                  <>
                    <span className={p.netHome > 0 ? "block text-xs text-owed" : "block text-xs text-owe"}>
                      {p.netHome > 0 ? "owes you" : "you owe"}
                    </span>
                    <Money minor={p.netHome} currency={home} signed className="font-semibold" />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
