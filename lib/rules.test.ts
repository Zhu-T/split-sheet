import { describe, expect, it } from "vitest";
import {
  cleanDisplayName,
  findClaimablePlaceholder,
  hasAccess,
  archiveCutoffDate,
  canChangeExpense,
  isPastTrip,
  isPendingPayment,
  pastArchiveCutoff,
  shouldAutoArchive,
  membersBelongToGroup,
  paymentConfirmedOnSave,
  safeRedirectPath,
} from "./rules";

describe("hasAccess", () => {
  it("allows only active memberships", () => {
    expect(hasAccess({ active: true })).toBe(true);
    expect(hasAccess({ active: false })).toBe(false); // deactivated member
    expect(hasAccess(undefined)).toBe(false); // non-member
    expect(hasAccess(null)).toBe(false);
  });
});

describe("membersBelongToGroup", () => {
  const group = [
    { id: "a", active: true },
    { id: "b", active: true },
    { id: "gone", active: false },
  ];
  it("accepts members of the group", () => {
    expect(membersBelongToGroup(["a", "b"], group)).toBe(true);
  });
  it("rejects a member id from another group", () => {
    expect(membersBelongToGroup(["a", "other-group-member"], group)).toBe(false);
  });
  it("rejects inactive members unless already on the expense", () => {
    expect(membersBelongToGroup(["a", "gone"], group)).toBe(false);
    expect(membersBelongToGroup(["a", "gone"], group, new Set(["gone"]))).toBe(true);
  });
});

describe("findClaimablePlaceholder", () => {
  const members = [
    { id: "1", userId: "u1", email: "taken@x.com" },
    { id: "2", userId: null, email: "Bob@Example.com" },
    { id: "3", userId: null, email: null },
  ];
  it("matches an unclaimed placeholder by case-insensitive email", () => {
    expect(findClaimablePlaceholder(members, "bob@example.com")?.id).toBe("2");
  });
  it("never claims a member that already has a user, or a different email", () => {
    expect(findClaimablePlaceholder(members, "taken@x.com")).toBeUndefined();
    expect(findClaimablePlaceholder(members, "mallory@example.com")).toBeUndefined();
  });
});

describe("safeRedirectPath", () => {
  it("only allows same-site paths", () => {
    expect(safeRedirectPath("/join/abc")).toBe("/join/abc");
    expect(safeRedirectPath("https://evil.com")).toBe("/");
    expect(safeRedirectPath("//evil.com")).toBe("/");
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
  });
});

describe("cleanDisplayName", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanDisplayName("  Tony   Zhu  ")).toBe("Tony Zhu");
  });
  it("rejects empty or overly long names", () => {
    expect(cleanDisplayName("   ")).toBeNull();
    expect(cleanDisplayName(null)).toBeNull();
    expect(cleanDisplayName("a".repeat(61))).toBeNull();
    expect(cleanDisplayName("a".repeat(60))).toBe("a".repeat(60));
  });
});

describe("payment confirmation", () => {
  it("counts payments straight away unless the group asks for confirmation", () => {
    expect(paymentConfirmedOnSave(false, "payer", "receiver")).toBe(true);
  });
  it("waits for the receiver when the payer records it in a confirming group", () => {
    expect(paymentConfirmedOnSave(true, "payer", "receiver")).toBe(false);
    expect(paymentConfirmedOnSave(true, "receiver", "receiver")).toBe(true); // receiver recorded it themselves
  });
  it("treats only unconfirmed payments as pending", () => {
    expect(isPendingPayment({ kind: "settlement", confirmedAt: null })).toBe(true);
    expect(isPendingPayment({ kind: "settlement", confirmedAt: new Date() })).toBe(false);
    expect(isPendingPayment({ kind: "expense", confirmedAt: null })).toBe(false);
  });
});

describe("past and archived trips", () => {
  const end = "2026-10-08";
  it("lists a trip as past once its last day is over, or when archived", () => {
    expect(isPastTrip(end, null, new Date("2026-10-08T23:00:00Z"))).toBe(false);
    expect(isPastTrip(end, null, new Date("2026-10-09T00:00:00Z"))).toBe(true);
    expect(isPastTrip(null, null, new Date())).toBe(false);
    expect(isPastTrip("2099-01-01", new Date(), new Date())).toBe(true);
  });
  it("auto-archives 20 days after the trip ends, unless the owner unarchived it", () => {
    const g = { tripEnd: end, archivedAt: null, autoArchive: true };
    expect(shouldAutoArchive(g, new Date("2026-10-28T23:59:00Z"))).toBe(false); // 19.99 days after
    expect(shouldAutoArchive(g, new Date("2026-10-29T00:01:00Z"))).toBe(true); // 20 days + 1 min
    expect(shouldAutoArchive({ ...g, autoArchive: false }, new Date("2026-12-01T00:00:00Z"))).toBe(false);
    expect(shouldAutoArchive({ ...g, archivedAt: new Date() }, new Date("2026-12-01T00:00:00Z"))).toBe(false);
    expect(shouldAutoArchive({ ...g, tripEnd: null }, new Date("2026-12-01T00:00:00Z"))).toBe(false);
    expect(pastArchiveCutoff(end, new Date("2026-10-29T00:01:00Z"))).toBe(true);
  });
  it("gives a conservative cut-off date for SQL filters", () => {
    expect(archiveCutoffDate(new Date("2026-10-29T12:00:00Z"))).toBe("2026-10-08");
  });
  it("keeps archived expenses read-only but allows payments", () => {
    expect(canChangeExpense("expense", new Date())).toBe(false);
    expect(canChangeExpense("settlement", new Date())).toBe(true);
    expect(canChangeExpense("expense", null)).toBe(true);
  });
});
