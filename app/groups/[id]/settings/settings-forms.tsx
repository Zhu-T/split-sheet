"use client";

import Link from "next/link";
import { useActionState, useState, useTransition, type CSSProperties } from "react";
import {
  addMember,
  deleteGroup,
  postDiscordSummaryNow,
  removeDiscordWebhook,
  rotateInvite,
  sendTestDiscordMessage,
  setDiscordAutoDigest,
  setDiscordWebhook,
  setMemberActive,
  updateGroup,
  updateMember,
  type WebhookFormState,
} from "@/app/actions/groups";
import { useConfirm } from "@/components/confirm";
import { CurrencySelect } from "@/components/currency-select";
import { DateRangeField } from "@/components/date-range";
import { Sheet } from "@/components/sheet";
import { Button, Card, ErrorText, Field, Initials, cx, inputClass } from "@/components/ui";

export function InviteCard({ groupId, groupName, token, isOwner }: { groupId: string; groupName: string; token: string; isOwner: boolean }) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const link = () => `${window.location.origin}/join/${token}`;

  async function share() {
    const url = link();
    if (navigator.share) {
      try {
        await navigator.share({ title: groupName, text: `Join "${groupName}" to split expenses`, url });
        return;
      } catch {
        // cancelled: fall through to copy
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="p-4">
      <p className="text-sm text-muted">
        Anyone with this link can join the group. Send it only to people you&apos;re splitting with.
      </p>
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={share}>
          {copied ? "Link copied" : "Share invite link"}
        </Button>
        {isOwner && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: "Make a new invite link?",
                message: "The current link will stop working. People already in the group aren't affected.",
                confirmLabel: "Make new link",
              });
              if (ok) startTransition(() => rotateInvite(groupId));
            }}
          >
            {pending ? "…" : "New link"}
          </Button>
        )}
      </div>
      {confirmDialog}
    </Card>
  );
}

type MemberItem = { id: string; name: string; email: string | null; role: string; active: boolean; placeholder: boolean };

export function MembersList({
  groupId,
  members,
  isOwner,
  myMemberId,
}: {
  groupId: string;
  members: MemberItem[];
  isOwner: boolean;
  myMemberId: string;
}) {
  // The sheet stays mounted while closing so it can animate out; `key` resets the form per open.
  const [sheet, setSheet] = useState<{ open: boolean; member: MemberItem | null; key: number }>({ open: false, member: null, key: 0 });
  const openSheet = (member: MemberItem | null) => setSheet((s) => ({ open: true, member, key: s.key + 1 }));
  const [confirm, confirmDialog] = useConfirm();
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Card>
        <ul className="divide-y divide-line">
          {members.map((m, i) => (
            <li
              key={m.id}
              className={cx("rise flex min-h-16 items-center gap-3 px-4 py-2 transition-opacity", !m.active && "opacity-60")}
              style={{ "--i": i } as CSSProperties}
            >
              <Initials name={m.name} />
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {m.name}
                  {m.id === myMemberId && <span className="text-muted"> (you)</span>}
                </span>
                <span className="block truncate text-sm text-muted">
                  {m.role === "owner" ? "Owner · " : ""}
                  {!m.active ? "Removed" : m.placeholder ? (m.email ? `Not joined yet · ${m.email}` : "Not joined yet") : "Joined"}
                </span>
              </div>
              {/* People who've joined choose their own name; only added-by-name spots are editable here. */}
              {m.placeholder && (
                <button
                  type="button"
                  onClick={() => openSheet(m)}
                  aria-label={`Edit ${m.name}`}
                  title="Edit name or email"
                  className="grid size-11 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 active:scale-90"
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              )}
              {isOwner && m.id !== myMemberId && (
                <Button
                  variant={m.active ? "danger" : "secondary"}
                  className="min-h-10 px-3 text-sm"
                  disabled={pending}
                  onClick={async () => {
                    const ok =
                      !m.active ||
                      (await confirm({
                        title: `Remove ${m.name}?`,
                        message: "They'll lose access to the group. Their past expenses and balance stay, and you can restore them later.",
                        confirmLabel: "Remove",
                        destructive: true,
                      }));
                    if (ok) startTransition(() => setMemberActive(groupId, m.id, !m.active));
                  }}
                >
                  {m.active ? "Remove" : "Restore"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-line p-3">
          <Button variant="ghost" className="w-full" onClick={() => openSheet(null)}>
            Add someone by name
          </Button>
          <p className="mt-1 text-center text-xs text-muted">
            People choose their own name when they join. Change yours in{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>
            .
          </p>
        </div>
      </Card>
      {confirmDialog}
      <MemberSheet
        key={sheet.key}
        open={sheet.open}
        groupId={groupId}
        member={sheet.member}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </>
  );
}

function MemberSheet({
  open,
  groupId,
  member,
  onClose,
}: {
  open: boolean;
  groupId: string;
  member: MemberItem | null;
  onClose: () => void;
}) {
  const action = member ? updateMember.bind(null, groupId, member.id) : addMember.bind(null, groupId);
  const [state, formAction, pending] = useActionState(async (prev: { error?: string }, form: FormData) => {
    const result = await action(prev, form);
    if (!result.error) onClose();
    return result;
  }, {});
  const emailEditable = !member || member.placeholder;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={member ? "Edit person" : "Add someone"}
      footer={
        <Button form="member-form" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      }
    >
      <form id="member-form" action={formAction} className="space-y-4">
        {!member && (
          <p className="text-sm text-muted">
            Add people before they join so you can split with them right away. If you add their email, they&apos;ll take
            over this spot when they open the invite link.
          </p>
        )}
        <Field label="Name">
          <input name="displayName" defaultValue={member?.name} required maxLength={60} autoComplete="off" className={inputClass} />
        </Field>
        {emailEditable ? (
          <Field label="Email (optional)">
            <input name="email" type="email" defaultValue={member?.email ?? ""} autoComplete="off" className={inputClass} />
          </Field>
        ) : (
          <p className="text-sm text-muted">{member?.email}</p>
        )}
        <ErrorText>{state.error}</ErrorText>
      </form>
    </Sheet>
  );
}

export function GroupForm({
  groupId,
  name,
  baseCurrency,
  tripStart,
  tripEnd,
}: {
  groupId: string;
  name: string;
  baseCurrency: string;
  tripStart: string | null;
  tripEnd: string | null;
}) {
  const [state, action, pending] = useActionState(updateGroup.bind(null, groupId), {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Name">
        <input name="name" defaultValue={name} required maxLength={60} className={inputClass} />
      </Field>
      <Field label="Currency">
        <CurrencySelect name="baseCurrency" defaultValue={baseCurrency} />
      </Field>
      <DateRangeField
        label="Trip dates"
        defaultStart={tripStart ?? ""}
        defaultEnd={tripEnd ?? ""}
        hint="Discord summaries wait until the trip ends, then post a wrap-up."
      />
      <ErrorText>{state.error}</ErrorText>
      <Button variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

/** Discord daily summary. The webhook URL is a secret, so it's never shown again once saved. */
export function DiscordCard({
  groupId,
  connected,
  isOwner,
  autoDigest,
  nextPostAt,
  pausedUntil,
}: {
  groupId: string;
  connected: boolean;
  isOwner: boolean;
  /** The notifications toggle: whether summaries are posted automatically. */
  autoDigest: boolean;
  /** When the next summary may be posted; null if one can be posted now. */
  nextPostAt: string | null;
  /** The trip's end date while the trip is still in progress (automatic posts wait for it). */
  pausedUntil: string | null;
}) {
  const [state, formAction, pending] = useActionState(setDiscordWebhook.bind(null, groupId), {} as WebhookFormState);
  const [busy, startTransition] = useTransition();
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const nextAt = nextPostAt ? new Date(nextPostAt) : null;
  const postedRecently = !!nextAt;

  if (!isOwner) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted">
          {connected
            ? "A daily summary is posted to a Discord channel. Only the group owner can change this."
            : "Not connected to Discord. The group owner can connect a channel."}
        </p>
      </Card>
    );
  }

  if (connected) {
    return (
      <Card className="p-4">
        <p className="flex items-center gap-2 font-medium">
          <span aria-hidden className="size-2 rounded-full bg-owed" />
          Connected to a Discord channel
        </p>
        <p className="mt-1 text-sm text-muted">
          At most one summary a day: new expenses and payments, then who owes whom. People who owe money get @mentioned.
        </p>

        <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-between gap-3">
          <span>
            <span className="block text-[15px] font-medium">Notifications</span>
            <span className="block text-sm text-muted">
              {!autoDigest
                ? "Off. Turn on to post a summary automatically."
                : pausedUntil
                  ? `Paused until the trip ends on ${formatDay(pausedUntil)}, then a trip wrap-up is posted.`
                  : "Posted each evening (US time) when something changed."}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoDigest}
            disabled={busy}
            onClick={() => startTransition(() => setDiscordAutoDigest(groupId, !autoDigest))}
            className="-mr-1 grid h-11 w-14 shrink-0 place-items-center rounded-full"
          >
            {/* The visible track is smaller than the 44px tap area around it. */}
            <span aria-hidden className={cx("relative h-7 w-12 rounded-full transition-colors duration-200", autoDigest ? "bg-accent" : "bg-line")}>
              <span
                className={cx(
                  "absolute top-1 left-1 size-5 rounded-full bg-surface shadow transition-transform duration-200",
                  autoDigest && "translate-x-5",
                )}
              />
            </span>
          </button>
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const r = await sendTestDiscordMessage(groupId);
                setNote(r.error ? { text: r.error, ok: false } : { text: "Test message sent", ok: true });
              })
            }
          >
            Send test message
          </Button>
          <Button
            variant="secondary"
            disabled={busy || postedRecently}
            onClick={() =>
              startTransition(async () => {
                const r = await postDiscordSummaryNow(groupId);
                setNote(r.error ? { text: r.error, ok: false } : { text: "Summary posted", ok: true });
              })
            }
          >
            Post summary now
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm({
                title: "Disconnect Discord?",
                message: "Daily summaries will stop. You can connect a channel again any time.",
                confirmLabel: "Disconnect",
                destructive: true,
              });
              if (ok) startTransition(() => removeDiscordWebhook(groupId));
            }}
          >
            Disconnect
          </Button>
        </div>
        {postedRecently && nextAt && (
          <p className="mt-2 text-sm text-muted" suppressHydrationWarning>
            Today&apos;s summary has been posted. The next one can go out after{" "}
            {nextAt.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}.
          </p>
        )}
        {note && (
          <p role="status" className={cx("toast mt-2 text-sm", note.ok ? "text-owed" : "text-danger")}>
            {note.text}
          </p>
        )}
        {confirmDialog}
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <form action={formAction} className="space-y-3">
        <p className="text-sm text-muted">
          Post summaries to a Discord channel. The group&apos;s invite link is shared there when you connect. In Discord:{" "}
          <span className="font-medium text-text">Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL</span>,
          then paste it here.
        </p>
        <Field label="Webhook URL">
          <input
            name="webhookUrl"
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="https://discord.com/api/webhooks/…"
            className={inputClass}
          />
        </Field>
        <ErrorText>{state.error}</ErrorText>
        <Button disabled={pending}>{pending ? "Connecting…" : "Connect channel"}</Button>
      </form>
    </Card>
  );
}

/** Owner-only: permanently delete the group, confirmed by typing its name. */
export function DeleteGroupCard({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [confirm, confirmDialog] = useConfirm();

  async function remove() {
    const ok = await confirm({
      title: `Delete ${groupName}?`,
      message: "This permanently deletes the group, every expense and payment, and its member list for everyone. It can't be undone. Export a CSV first if you want a copy.",
      confirmLabel: "Delete group",
      destructive: true,
      requireText: groupName,
    });
    if (!ok) return;
    setError(undefined);
    startTransition(async () => {
      // On success the server redirects to the dashboard; only an error comes back.
      const r = await deleteGroup(groupId, groupName);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <Card className="border-danger/40 p-4">
      <p className="font-medium">Delete this group</p>
      <p className="mt-1 text-sm text-muted">Removes the group and all of its expenses for every member.</p>
      <Button variant="destructive" className="mt-3" disabled={pending} onClick={remove}>
        {pending ? "Deleting…" : "Delete group"}
      </Button>
      <ErrorText>{error}</ErrorText>
      {confirmDialog}
    </Card>
  );
}

/** "2026-10-08" -> "Oct 8", independent of the viewer's time zone. */
function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
