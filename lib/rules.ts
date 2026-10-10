// Pure authorization and limit rules, kept free of I/O so they can be unit tested.

export const LIMITS = {
  groupsPerUser: 20,
  membersPerGroup: 50,
  expensesPerGroup: 5000,
  maxAmountMajor: 10_000_000,
  nameLength: 60,
  descriptionLength: 100,
} as const;

type MembershipRow = { active: boolean } | null | undefined;

/** A user may act on a group only through an active membership row. */
export function hasAccess(row: MembershipRow): row is { active: true } {
  return !!row && row.active;
}

type GroupMember = { id: string; active: boolean };

/**
 * Every member id an action references (payer, split members) must belong to the group
 * being acted on. Inactive members are allowed only when editing an existing expense that
 * already referenced them.
 */
export function membersBelongToGroup(
  ids: string[],
  groupMembers: GroupMember[],
  alreadyReferenced: ReadonlySet<string> = new Set(),
): boolean {
  const byId = new Map(groupMembers.map((m) => [m.id, m]));
  return ids.every((id) => {
    const m = byId.get(id);
    return !!m && (m.active || alreadyReferenced.has(id));
  });
}

type PlaceholderCandidate = { id: string; userId: string | null; email: string | null };

/**
 * Joining via invite claims the placeholder whose email matches the joiner's verified
 * Discord email (sign-in already rejects unverified emails).
 */
export function findClaimablePlaceholder<T extends PlaceholderCandidate>(
  groupMembers: T[],
  verifiedEmail: string,
): T | undefined {
  const email = verifiedEmail.trim().toLowerCase();
  return groupMembers.find((m) => m.userId === null && !!m.email && m.email.toLowerCase() === email);
}

/** Only same-site paths are allowed as post-login destinations. */
export function safeRedirectPath(path: string | null | undefined, fallback = "/"): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  return path;
}

/** Validated display name: trimmed, 1–60 characters. */
export function cleanDisplayName(input: unknown): string | null {
  const name = String(input ?? "").replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

/** A payment the person being paid hasn't confirmed yet. It already counts towards balances. */
export function isPendingPayment(e: { kind: "expense" | "settlement"; confirmedAt: Date | string | null }): boolean {
  return e.kind === "settlement" && !e.confirmedAt;
}

/**
 * Whether a payment being recorded (or edited) counts straight away. Only when the group asks
 * for confirmation and someone other than the person being paid records it does it wait.
 */
export function paymentConfirmedOnSave(requireConfirmation: boolean, recorderMemberId: string, receiverMemberId: string): boolean {
  return !requireConfirmation || recorderMemberId === receiverMemberId;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Trips archive automatically, and automatic Discord summaries stop, this long after they end. */
export const ARCHIVE_AFTER_DAYS = 20;

/** End of the trip's last day (calendar days, UTC), or null without an end date. */
function tripOver(tripEnd: string | null): number | null {
  return tripEnd && /^\d{4}-\d{2}-\d{2}$/.test(tripEnd) ? Date.parse(`${tripEnd}T00:00:00Z`) + DAY_MS : null;
}

/** Listed under "Past trips": archived, or its last day is over. (Ending doesn't lock anything.) */
export function isPastTrip(tripEnd: string | null, archivedAt: Date | string | null, now: Date): boolean {
  const over = tripOver(tripEnd);
  return !!archivedAt || (over !== null && now.getTime() >= over);
}

/** More than ARCHIVE_AFTER_DAYS since the trip's last day ended. */
export function pastArchiveCutoff(tripEnd: string | null, now: Date): boolean {
  const over = tripOver(tripEnd);
  return over !== null && now.getTime() > over + ARCHIVE_AFTER_DAYS * DAY_MS;
}

/** Latest end date that has passed the cut-off, for cheap SQL filters ("trip_end < this"). */
export function archiveCutoffDate(now: Date): string {
  return new Date(now.getTime() - (ARCHIVE_AFTER_DAYS + 1) * DAY_MS).toISOString().slice(0, 10);
}

/** Should the daily job archive this trip now? Not if the owner unarchived it (autoArchive off). */
export function shouldAutoArchive(g: { tripEnd: string | null; archivedAt: Date | null; autoArchive: boolean }, now: Date): boolean {
  return !g.archivedAt && g.autoArchive && pastArchiveCutoff(g.tripEnd, now);
}

/** Archived trips keep their expenses read-only; payments are still allowed so people can settle up. */
export function canChangeExpense(kind: "expense" | "settlement", archivedAt: Date | string | null): boolean {
  return kind === "settlement" || !archivedAt;
}
