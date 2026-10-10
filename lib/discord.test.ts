import { describe, expect, it } from "vitest";
import { escapeMarkdown, expenseMessage, mention, parseWebhookUrl, type ExpenseEvent } from "./discord";

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

describe("expenseMessage", () => {
  const tony = { name: "Tony", discordId: ID };
  const alex = { name: "Alex", discordId: "223456789012345678" };
  const sam = { name: "Sam", discordId: null };
  const base: ExpenseEvent = {
    action: "added",
    kind: "expense",
    actor: tony,
    description: "Dinner @everyone",
    amount: "$90.00",
    payer: tony,
    owes: [
      { person: alex, amount: "$30.00" },
      { person: sam, amount: "$30.00" },
    ],
    groupName: "Japan trip",
    link: "https://split.example/groups/1",
  };

  it("describes a new expense, who owes what, and pings only affected Discord users", () => {
    const p = expenseMessage(base);
    expect(p.content).toBe(
      [
        `🧾 <@${ID}> added **Dinner @everyone** in *Japan trip*: **$90.00**, paid by <@${ID}>`,
        "• <@223456789012345678> owes $30.00",
        "• **Sam** owes $30.00",
        "<https://split.example/groups/1>",
      ].join("\n"),
    );
    // @everyone in the description can't ping: no parse types allowed; the actor isn't pinged.
    expect(p.allowed_mentions).toEqual({ parse: [], users: ["223456789012345678"] });
  });

  it("describes payments and deletions without pinging on delete", () => {
    const paid = expenseMessage({ ...base, kind: "settlement", actor: alex, payer: alex, owes: [{ person: tony, amount: "$20.00" }], amount: "$20.00", link: null });
    expect(paid.content).toBe(`💸 <@223456789012345678> paid <@${ID}> **$20.00** in *Japan trip*`);
    expect(paid.allowed_mentions.users).toEqual([ID]);

    const deleted = expenseMessage({ ...base, action: "deleted", link: null });
    expect(deleted.content).toBe(`🗑️ <@${ID}> deleted **Dinner @everyone** ($90.00) in *Japan trip*`);
    expect(deleted.allowed_mentions.users).toEqual([]);
  });
});
