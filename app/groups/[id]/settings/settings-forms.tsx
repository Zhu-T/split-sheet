"use client";

import { useActionState, useState, useTransition, type CSSProperties } from "react";
import {
  addMember,
  removeDiscordWebhook,
  rotateInvite,
  sendTestDiscordMessage,
  setDiscordWebhook,
  setMemberActive,
  updateGroup,
  updateMember,
  type WebhookFormState,
} from "@/app/actions/groups";
import { CurrencySelect } from "@/components/currency-select";
import { Sheet } from "@/components/sheet";
import { Button, Card, ErrorText, Field, Initials, cx, inputClass } from "@/components/ui";

export function InviteCard({ groupId, groupName, token, isOwner }: { groupId: string; groupName: string; token: string; isOwner: boolean }) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
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
            onClick={() => {
              if (confirm("Make a new link? The current link will stop working.")) startTransition(() => rotateInvite(groupId));
            }}
          >
            {pending ? "…" : "New link"}
          </Button>
        )}
      </div>
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
              <button type="button" onClick={() => openSheet(m)} className="min-w-0 flex-1 text-left">
                <span className="block truncate font-medium">
                  {m.name}
                  {m.id === myMemberId && <span className="text-muted"> (you)</span>}
                </span>
                <span className="block truncate text-sm text-muted">
                  {m.role === "owner" ? "Owner · " : ""}
                  {!m.active ? "Removed" : m.placeholder ? (m.email ? `Not joined yet · ${m.email}` : "Not joined yet") : "Joined"}
                </span>
              </button>
              {isOwner && m.id !== myMemberId && (
                <Button
                  variant={m.active ? "danger" : "secondary"}
                  className="min-h-10 px-3 text-sm"
                  disabled={pending}
                  onClick={() => {
                    if (!m.active || confirm(`Remove ${m.name}? Their past expenses and balance stay.`)) {
                      startTransition(() => setMemberActive(groupId, m.id, !m.active));
                    }
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
        </div>
      </Card>
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
      title={member ? "Edit member" : "Add someone"}
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

export function GroupForm({ groupId, name, baseCurrency }: { groupId: string; name: string; baseCurrency: string }) {
  const [state, action, pending] = useActionState(updateGroup.bind(null, groupId), {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Name">
        <input name="name" defaultValue={name} required maxLength={60} className={inputClass} />
      </Field>
      <Field label="Currency">
        <CurrencySelect name="baseCurrency" defaultValue={baseCurrency} />
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <Button variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

/** Discord channel notifications. The webhook URL is a secret, so it's never shown again once saved. */
export function DiscordCard({ groupId, connected, isOwner }: { groupId: string; connected: boolean; isOwner: boolean }) {
  const [state, formAction, pending] = useActionState(setDiscordWebhook.bind(null, groupId), {} as WebhookFormState);
  const [busy, startTransition] = useTransition();
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);

  if (!isOwner) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted">
          {connected
            ? "Expense updates are posted to a Discord channel. Only the group owner can change this."
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
          New, edited and deleted expenses and payments are posted there. People who signed in with Discord get @mentioned
          when their balance changes.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
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
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (confirm("Stop posting updates to this Discord channel?")) startTransition(() => removeDiscordWebhook(groupId));
            }}
          >
            Disconnect
          </Button>
        </div>
        {note && (
          <p role="status" className={cx("toast mt-2 text-sm", note.ok ? "text-owed" : "text-danger")}>
            {note.text}
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <form action={formAction} className="space-y-3">
        <p className="text-sm text-muted">
          Post expense updates to a Discord channel. In Discord: <span className="font-medium text-text">Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL</span>, then paste it here.
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
