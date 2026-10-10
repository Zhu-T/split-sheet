// Regression test for "unexpected iss" on Discord sign-in: the issuer Auth.js validates the
// OAuth callback against must match what Discord sends back.
import * as o from "oauth4webapi";
import Discord from "next-auth/providers/discord";
import { describe, expect, it } from "vitest";

const callback = new URLSearchParams({ code: "abc", state: "xyz", iss: "https://discord.com" });
const client = { client_id: "123" };

describe("Discord OAuth issuer", () => {
  it("accepts Discord's callback when the issuer is declared", () => {
    // Auth.js merges a provider's `options` over its defaults at runtime.
    const raw = Discord({ issuer: "https://discord.com" });
    const provider = { ...raw, ...raw.options };
    const as = { issuer: provider.issuer! };
    expect(() => o.validateAuthResponse(as, client, callback, "xyz")).not.toThrow();
  });

  it("rejects it with Auth.js's placeholder issuer (the original bug)", () => {
    const as = { issuer: "https://authjs.dev" };
    expect(() => o.validateAuthResponse(as, client, callback, "xyz")).toThrow(/unexpected "iss"/);
  });
});
