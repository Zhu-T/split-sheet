import { describe, expect, it } from "vitest";
import {
  automaticPostPlan,
  connectedMessage,
  digestMessage,
  escapeMarkdown,
  mention,
  nextPostAllowedAt,
  parseWebhookUrl,
  tripEndBoundary,
  type Digest,
} from "./discord";

describe("trip schedule", () => {
  it("treats the end date as finished at the end of that day (UTC)", () => {
    expect(tripEndBoundary("2026-10-08")).toEqual(new Date("2026-10-09T00:00:00Z"));
    expect(tripEndBoundary(null)).toBeNull();
    expect(tripEndBoundary("not a date")).toBeNull();
  });
  it("waits during the trip, wraps up once after it, then posts daily", () => {
    const end = "2026-10-08";
    expect(automaticPostPlan(end, null, new Date("2026-10-08T20:00:00Z"))).toBe("wait"); // last day
    expect(automaticPostPlan(end, null, new Date("2026-10-09T01:00:00Z"))).toBe("wrap-up");
    // A post during the trip (e.g. manual) doesn't count as the wrap-up.
    expect(automaticPostPlan(end, new Date("2026-10-05T12:00:00Z"), new Date("2026-10-09T01:00:00Z"))).toBe("wrap-up");
    expect(automaticPostPlan(end, new Date("2026-10-09T01:00:00Z"), new Date("2026-10-10T01:00:00Z"))).toBe("daily");
    expect(automaticPostPlan(null, null, new Date())).toBe("daily");
  });
});

describe("connectedMessage", () => {
  it("shares the invite link without pinging anyone", () => {
    const p = connectedMessage("Japan *trip*", "https://split.example/join/abc");
    expect(p.content).toBe(
      "👋 This channel is now connected to *Japan \\*trip\\** on Split.\nJoin the group to add and split expenses: <https://split.example/join/abc>",
    );
    expect(p.allowed_mentions.users).toEqual([]);
  });
});

const ID = "123456789012345678";
const TOKEN = "a".repeat(68);

describe("parseWebhookUrl", () => {
  it("accepts Discord webhook URLs and normalises them", () => {
    const canonical = `https://discord.com/api/webhooks/${ID}/${TOKEN}`;
    expect(parseWebhookUrl(` ${canonical} `)).toBe(canonical);
    expect(parseWebhookUrl(`https://discordapp.com/api/webhooks/${ID}/${TOKEN}`)).toBe(canonical);
    expect(parseWebhookUrl(`https://canary.discord.com/api/v10/webhooks/${ID}/${TOKEN}/`)).toBe(canonical);
  });
  it("rejects anything that could send requests elsewhere", () => {
    for (const bad of [
      `http://discord.com/api/webhooks/${ID}/${TOKEN}`, // not https
      `https://discord.com.evil.com/api/webhooks/${ID}/${TOKEN}`,
      `https://evil.com/discord.com/api/webhooks/${ID}/${TOKEN}`,
      `https://user:pass@discord.com/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com:8443/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com/api/webhooks/${ID}`,
      `https://discord.com/api/channels/${ID}/messages`,
      "not a url",
      "",
    ]) {
      expect(parseWebhookUrl(bad)).toBeNull();
    }
  });
});

describe("formatting", () => {
  it("escapes markdown and neutralises mention syntax in user text", () => {
    expect(escapeMarkdown("**bold** <@&999> @everyone _x_")).toBe("\\*\\*bold\\*\\* \\<@&999\\> @everyone \\_x\\_");
  });
  it("pings people with a Discord ID and bolds everyone else", () => {
    expect(mention({ name: "Tony", discordId: ID })).toBe(`<@${ID}>`);
    expect(mention({ name: "Sam *", discordId: null })).toBe("**Sam \\***");
  });
});

describe("daily limit", () => {
  const now = new Date("2026-10-10T01:30:00Z");
  it("allows a post when there's never been one or the last was 22h+ ago", () => {
    expect(nextPostAllowedAt(null, now)).toBeNull();
    expect(nextPostAllowedAt(new Date("2026-10-09T01:59:00Z"), now)).toBeNull(); // yesterday's cron, late in its hour
  });
  it("blocks a second post within the same day and says when the next is allowed", () => {
    expect(nextPostAllowedAt(new Date("2026-10-09T18:00:00Z"), now)).toEqual(new Date("2026-10-10T16:00:00Z"));
  });
});

describe("digestMessage", () => {
  const tony = { name: "Tony", discordId: ID };
  const alex = { name: "Alex", discordId: "223456789012345678" };
  const sam = { name: "Sam", discordId: null };
  const base: Digest = {
    groupName: "Japan trip",
    link: "https://split.example/groups/1",
    added: [{ description: "Dinner @everyone", amount: "$90.00", payer: tony }],
    payments: [{ from: alex, to: tony, amount: "$20.00" }],
    edited: 1,
    deleted: 0,
    owes: [
      { from: alex, to: tony, amount: "$10.00" },
      { from: sam, to: tony, amount: "$30.00" },
    ],
  };

  it("summarises changes and who owes whom, pinging only people who owe", () => {
    const p = digestMessage(base);
    expect(p.content).toBe(
      [
        "📊 **Daily summary** for *Japan trip*",
        "",
        "🧾 1 new expense:",
        `• Dinner @everyone: $90.00, paid by <@${ID}>`,
        "",
        "💸 1 payment:",
        `• <@223456789012345678> paid <@${ID}> $20.00`,
        "",
        "✏️ 1 expense edited",
        "",
        "**Who owes whom**",
        `• <@223456789012345678> owes <@${ID}> **$10.00**`,
        `• **Sam** owes <@${ID}> **$30.00**`,
        "",
        "<https://split.example/groups/1>",
      ].join("\n"),
    );
    // @everyone in a description can't ping; only Alex (who owes and has Discord) is pinged.
    expect(p.allowed_mentions).toEqual({ parse: [], users: ["223456789012345678"] });
  });

  it("handles quiet days and settled groups", () => {
    const p = digestMessage({ ...base, added: [], payments: [], edited: 0, owes: [], link: null });
    expect(p.content).toBe(["📊 **Daily summary** for *Japan trip*", "No changes since the last summary.", "", "✅ Everyone is settled up."].join("\n"));
    expect(p.allowed_mentions.users).toEqual([]);
  });

  it("caps long lists", () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ description: `Item ${i}`, amount: "$1.00", payer: tony }));
    expect(digestMessage({ ...base, added: many }).content).toContain("• …and 3 more");
  });
});

describe("trip wrap-up message", () => {
  it("uses a trip heading with the date range", () => {
    const p = digestMessage({ trip: { start: "2026-10-01", end: "2026-10-08" }, groupName: "Japan trip", link: null, added: [], payments: [], edited: 0, deleted: 0, owes: [] });
    expect(p.content.split("\n")[0]).toBe("🏁 **Trip summary** for *Japan trip* (Oct 1 – Oct 8)");
  });
});
