import { describe, expect, it } from "vitest";
import { myDebts, summarisePeople, type Counterpart } from "./people";

const people: Record<string, Counterpart> = {
  alex: { key: "u:alex", name: "Alex" },
  sam: { key: "u:sam", name: "Sam" },
  jo: { key: "m:jo", name: "Jo" },
};

describe("myDebts", () => {
  it("keeps only payments involving me, signed from my side", () => {
    const debts = myDebts(
      [
        { from: "alex", to: "me", amountMinor: 500 },
        { from: "me", to: "sam", amountMinor: 200 },
        { from: "jo", to: "sam", amountMinor: 900 },
      ],
      "me",
      (id) => people[id],
      { id: "g1", name: "Trip", currency: "USD" },
    );
    expect(debts.map((d) => [d.person.name, d.amountMinor])).toEqual([
      ["Alex", 500],
      ["Sam", -200],
    ]);
  });
});

describe("summarisePeople", () => {
  it("merges the same person across groups and converts to the home currency", () => {
    const rows = summarisePeople(
      [
        { person: people.alex, groupId: "g1", groupName: "Trip", currency: "USD", amountMinor: 1000 },
        { person: people.alex, groupId: "g2", groupName: "Flat", currency: "EUR", amountMinor: -500 }, // €5 = $5.50
        { person: people.sam, groupId: "g1", groupName: "Trip", currency: "USD", amountMinor: -300 },
      ],
      "USD",
      { EUR: 1 / 1.1 },
    );
    expect(rows.map((r) => [r.name, r.netHome, r.groups.length])).toEqual([
      ["Alex", 450, 2],
      ["Sam", -300, 1],
    ]);
  });

  it("drops people who net to zero and flags missing rates", () => {
    const rows = summarisePeople(
      [
        { person: people.alex, groupId: "g1", groupName: "A", currency: "USD", amountMinor: 100 },
        { person: people.alex, groupId: "g2", groupName: "B", currency: "USD", amountMinor: -100 },
        { person: people.jo, groupId: "g3", groupName: "C", currency: "JPY", amountMinor: 1000 },
      ],
      "USD",
      {},
    );
    expect(rows).toEqual([
      { key: "m:jo", name: "Jo", netHome: null, groups: [{ groupId: "g3", groupName: "C", currency: "JPY", amountMinor: 1000 }] },
    ]);
  });
});
