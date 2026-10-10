// Discord channel webhooks: URL validation and message formatting (pure, no I/O).

/**
 * Accept only real Discord webhook URLs, so the server never POSTs to an arbitrary address.
 * Returns the canonical https://discord.com/api/webhooks/{id}/{token} form, or null.
 */
export function parseWebhookUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = /^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/i;
  const path = /^\/api(?:\/v\d+)?\/webhooks\/(\d{17,20})\/([\w-]{60,100})\/?$/;
  const m = path.exec(url.pathname);
  if (url.protocol !== "https:" || !host.test(url.hostname) || url.port || url.username || url.password || !m) return null;
  return `https://discord.com/api/webhooks/${m[1]}/${m[2]}`;
}

/** Escape Discord markdown so names and descriptions render as plain text. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_~`|>#\[\]()<:-])/g, "\\$1").replace(/\n+/g, " ");
}

export type Person = { name: string; discordId: string | null };

/** A ping for people who signed in with Discord, otherwise their name in bold. */
export function mention(p: Person): string {
  return p.discordId && /^\d{17,20}$/.test(p.discordId) ? `<@${p.discordId}>` : `**${escapeMarkdown(p.name)}**`;
}

export type WebhookPayload = {
  content: string;
  allowed_mentions: { parse: never[]; users: string[] };
  flags: number;
};

const SUPPRESS_EMBEDS = 1 << 2;

/**
 * Build a webhook body. Only the listed Discord users can be pinged: no @everyone, @here or
 * role pings, whatever a description contains. Link previews are suppressed.
 */
export function payload(lines: string[], ping: Person[]): WebhookPayload {
  const users = [...new Set(ping.map((p) => p.discordId).filter((id): id is string => !!id && /^\d{17,20}$/.test(id)))].slice(0, 100);
  return {
    content: lines.join("\n").slice(0, 2000),
    allowed_mentions: { parse: [], users },
    flags: SUPPRESS_EMBEDS,
  };
}

export type ExpenseEvent = {
  action: "added" | "edited" | "deleted";
  kind: "expense" | "settlement";
  actor: Person;
  description: string;
  amount: string; // formatted, e.g. "$80.00"
  payer: Person;
  /** Who owes the payer what for this entry (payer excluded). For a settlement: the receiver. */
  owes: { person: Person; amount: string }[];
  groupName: string;
  link: string | null;
};

/** Human-readable message for an expense or payment change. */
export function expenseMessage(e: ExpenseEvent): WebhookPayload {
  const group = `*${escapeMarkdown(e.groupName)}*`;
  const by = mention(e.actor);
  const lines: string[] = [];

  if (e.kind === "settlement") {
    const to = e.owes[0]?.person;
    const what = `${mention(e.payer)} paid ${to ? mention(to) : "someone"} **${e.amount}**`;
    lines.push(
      e.action === "added" ? `💸 ${what} in ${group}` : e.action === "edited" ? `✏️ ${by} edited a payment in ${group}: ${what}` : `🗑️ ${by} deleted a payment in ${group} (${what})`,
    );
  } else {
    const title = `**${escapeMarkdown(e.description)}**`;
    if (e.action === "deleted") {
      lines.push(`🗑️ ${by} deleted ${title} (${e.amount}) in ${group}`);
    } else {
      lines.push(
        e.action === "added"
          ? `🧾 ${by} added ${title} in ${group}: **${e.amount}**, paid by ${mention(e.payer)}`
          : `✏️ ${by} edited ${title} in ${group}: now **${e.amount}**, paid by ${mention(e.payer)}`,
      );
      for (const o of e.owes) lines.push(`• ${mention(o.person)} owes ${o.amount}`);
    }
  }
  if (e.link) lines.push(`<${e.link}>`);
  // Ping the people whose balance changed, but not the person who made the change.
  const ping = e.action === "deleted" ? [] : [e.payer, ...e.owes.map((o) => o.person)].filter((p) => p.discordId !== e.actor.discordId);
  return payload(lines, ping);
}
