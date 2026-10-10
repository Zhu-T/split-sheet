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
