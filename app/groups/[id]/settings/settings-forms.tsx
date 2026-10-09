"use client";

import { useActionState, useState, useTransition } from "react";
import { addMember, rotateInvite, setMemberActive, updateGroup, updateMember } from "@/app/actions/groups";
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
  const [editing, setEditing] = useState<MemberItem | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Card>
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className={cx("flex min-h-16 items-center gap-3 px-4 py-2", !m.active && "opacity-60")}>
              <Initials name={m.name} />
              <button type="button" onClick={() => setEditing(m)} className="min-w-0 flex-1 text-left">
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
          <Button variant="ghost" className="w-full" onClick={() => setEditing("new")}>
            Add someone by name
          </Button>
        </div>
      </Card>
      {editing && (
        <MemberSheet
          key={editing === "new" ? "new" : editing.id}
          groupId={groupId}
          member={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function MemberSheet({ groupId, member, onClose }: { groupId: string; member: MemberItem | null; onClose: () => void }) {
  const action = member ? updateMember.bind(null, groupId, member.id) : addMember.bind(null, groupId);
  const [state, formAction, pending] = useActionState(async (prev: { error?: string }, form: FormData) => {
    const result = await action(prev, form);
    if (!result.error) onClose();
    return result;
  }, {});
  const emailEditable = !member || member.placeholder;

  return (
    <Sheet
      open
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
