import { describe, expect, it } from "vitest";
import { findClaimablePlaceholder, hasAccess, membersBelongToGroup, safeRedirectPath } from "./rules";

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
