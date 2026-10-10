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

/** At most one post per group per day. 22h (not 24h) so the daily cron, which Vercel may run
 * anywhere within its scheduled hour, never skips a day. */
export const DIGEST_MIN_GAP_MS = 22 * 60 * 60 * 1000;

/** When the next post is allowed, or null if one is allowed now. */
export function nextPostAllowedAt(lastPostedAt: Date | null, now: Date): Date | null {
  if (!lastPostedAt) return null;
  const next = new Date(lastPostedAt.getTime() + DIGEST_MIN_GAP_MS);
  return next > now ? next : null;
}

export type Digest = {
  groupName: string;
  link: string | null;
  added: { description: string; amount: string; payer: Person }[];
  payments: { from: Person; to: Person; amount: string }[];
  edited: number;
  deleted: number;
  /** Suggested payments that settle the group now. */
  owes: { from: Person; to: Person; amount: string }[];
};

const MAX_LISTED = 10;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One daily summary: what changed since the last post, then who owes whom (with pings). */
export function digestMessage(d: Digest): WebhookPayload {
  const lines = [`📊 **Daily summary** for *${escapeMarkdown(d.groupName)}*`];

  if (d.added.length + d.payments.length + d.edited + d.deleted === 0) {
    lines.push("No changes since the last summary.");
  }
  if (d.added.length) {
    lines.push("", `🧾 ${plural(d.added.length, "new expense")}:`);
    for (const a of d.added.slice(0, MAX_LISTED)) {
      lines.push(`• ${escapeMarkdown(a.description)}: ${a.amount}, paid by ${mention(a.payer)}`);
    }
    if (d.added.length > MAX_LISTED) lines.push(`• …and ${d.added.length - MAX_LISTED} more`);
  }
  if (d.payments.length) {
    lines.push("", `💸 ${plural(d.payments.length, "payment")}:`);
    for (const p of d.payments.slice(0, MAX_LISTED)) lines.push(`• ${mention(p.from)} paid ${mention(p.to)} ${p.amount}`);
    if (d.payments.length > MAX_LISTED) lines.push(`• …and ${d.payments.length - MAX_LISTED} more`);
  }
  if (d.edited || d.deleted) {
    lines.push("", [d.edited && `✏️ ${plural(d.edited, "expense")} edited`, d.deleted && `🗑️ ${d.deleted} deleted`].filter(Boolean).join(" · "));
  }

  lines.push("");
  if (d.owes.length === 0) {
    lines.push("✅ Everyone is settled up.");
  } else {
    lines.push("**Who owes whom**");
    for (const o of d.owes) lines.push(`• ${mention(o.from)} owes ${mention(o.to)} **${o.amount}**`);
  }
  if (d.link) lines.push("", `<${d.link}>`);

  // Ping only people who currently owe money; they're the ones who need to act.
  return payload(lines, d.owes.map((o) => o.from));
}
