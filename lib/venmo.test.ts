import { describe, expect, it } from "vitest";
import { parseVenmoUsername, venmoPayUrl } from "./venmo";

describe("parseVenmoUsername", () => {
  it("accepts usernames with or without @, and profile URLs", () => {
    expect(parseVenmoUsername("Tony-Zhu")).toBe("Tony-Zhu");
    expect(parseVenmoUsername("  @tony_zhu99 ")).toBe("tony_zhu99");
    expect(parseVenmoUsername("https://venmo.com/u/Tony-Zhu")).toBe("Tony-Zhu");
    expect(parseVenmoUsername("https://account.venmo.com/u/Tony-Zhu?foo=1")).toBe("Tony-Zhu");
  });
  it("rejects anything that isn't a valid username", () => {
    for (const bad of ["", "abc", "has space", "a".repeat(31), "<script>", "tony.zhu", "javascript:alert(1)"]) {
      expect(parseVenmoUsername(bad)).toBeNull();
    }
  });
});

describe("venmoPayUrl", () => {
  it("builds an app deep link with recipient, amount and encoded note", () => {
    const url = new URL(venmoPayUrl("Tony-Zhu", "26.67", "Split: Japan trip & more", true));
    expect(url.protocol).toBe("venmo:");
    expect(url.searchParams.get("txn")).toBe("pay");
    expect(url.searchParams.get("recipients")).toBe("Tony-Zhu");
    expect(url.searchParams.get("amount")).toBe("26.67");
    expect(url.searchParams.get("note")).toBe("Split: Japan trip & more");
  });
  it("builds a web link for desktops", () => {
    expect(venmoPayUrl("Tony-Zhu", "5.00", "Dinner out", false)).toBe("https://venmo.com/Tony-Zhu?txn=pay&amount=5.00&note=Dinner%20out");
  });
});
