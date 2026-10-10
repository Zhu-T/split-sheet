import type { Metadata } from "next";
import { PageMotion } from "@/components/motion";
import { Card, Page, SectionTitle, Skeleton, TopBar, buttonStyles } from "@/components/ui";
import { requireMember } from "@/lib/authz";
import { automaticPostPlan, nextPostAllowedAt } from "@/lib/discord";
import { formatMoney } from "@/lib/money";
import { loadMembers, loadRecentlyDeleted } from "@/lib/queries";
import { ArchiveCard, DeleteGroupCard, DiscordCard, GroupForm, InviteCard, MembersList, PaymentsCard, RecentlyDeletedCard } from "./settings-forms";

export const metadata: Metadata = { title: "Group settings" };

export default function GroupSettingsPage({ params }: PageProps<"/groups/[id]/settings">) {
  return (
    <PageMotion
      fallback={
        <>
          <TopBar title="Members & settings" />
          <Page>
            <Skeleton />
          </Page>
        </>
      }
    >
      <Settings params={params} />
    </PageMotion>
  );
}

async function Settings({ params }: Pick<PageProps<"/groups/[id]/settings">, "params">) {
  const { id } = await params;
  const { group, member } = await requireMember(id);
  const [members, deleted] = await Promise.all([loadMembers(id), loadRecentlyDeleted(id)]);
  const isOwner = member.role === "owner";
  const names = new Map(members.map((m) => [m.id, m.displayName]));
  const now = new Date();

  return (
    <>
      <TopBar title="Members & settings" back={`/groups/${id}`} />
      <Page>
        <SectionTitle>Invite</SectionTitle>
        <InviteCard groupId={id} groupName={group.name} token={group.inviteToken} isOwner={isOwner} />

        <SectionTitle>Members</SectionTitle>
        <MembersList
          groupId={id}
          isOwner={isOwner}
          myMemberId={member.id}
          members={members.map((m) => ({
            id: m.id,
            name: m.displayName,
            email: m.email,
            role: m.role,
            active: m.active,
            placeholder: m.userId === null,
          }))}
        />

        <SectionTitle>Payments</SectionTitle>
        <PaymentsCard groupId={id} requireConfirmation={group.requirePaymentConfirmation} isOwner={isOwner} />

        <SectionTitle>Discord</SectionTitle>
        {/* Only whether a webhook exists is sent to the browser, never the URL itself. */}
        <DiscordCard
          groupId={id}
          connected={!!group.discordWebhookUrl}
          isOwner={isOwner}
          autoDigest={group.discordAutoDigest}
          nextPostAt={nextPostAllowedAt(group.discordLastPostedAt, new Date())?.toISOString() ?? null}
          pausedUntil={automaticPostPlan(group.tripEnd, group.discordLastPostedAt, now) === "wait" ? group.tripEnd : null}
          automaticEnded={!!group.archivedAt || automaticPostPlan(group.tripEnd, group.discordLastPostedAt, now) === "stopped"}
        />

        <SectionTitle>Group</SectionTitle>
        <Card className="p-4">
          <GroupForm groupId={id} name={group.name} baseCurrency={group.baseCurrency} tripStart={group.tripStart} tripEnd={group.tripEnd} />
        </Card>

        <SectionTitle>Recently deleted</SectionTitle>
        <RecentlyDeletedCard
          groupId={id}
          archived={!!group.archivedAt}
          items={deleted.map((d) => ({
            id: d.id,
            kind: d.kind,
            description: d.description,
            amountLabel: formatMoney(d.amountMinor, d.currency),
            deletedAt: d.deletedAt,
            deletedBy: d.deletedBy ? (d.deletedBy === member.id ? "you" : (names.get(d.deletedBy) ?? "someone")) : "someone",
          }))}
        />

        <SectionTitle>Archive</SectionTitle>
        <ArchiveCard
          groupId={id}
          archived={!!group.archivedAt}
          isOwner={isOwner}
          autoArchiveOn={group.autoArchive}
          tripEnd={group.tripEnd}
        />

        <SectionTitle>Your data</SectionTitle>
        <Card className="p-4">
          <p className="mb-3 text-sm text-muted">Download every expense in this group as a spreadsheet.</p>
          <a href={`/groups/${id}/export`} download className={buttonStyles.secondary}>
            Export CSV
          </a>
        </Card>

        {/* Kept last and apart from everything else: it can't be undone. */}
        {isOwner && (
          <>
            <SectionTitle>Danger zone</SectionTitle>
            <DeleteGroupCard groupId={id} groupName={group.name} />
          </>
        )}
      </Page>
    </>
  );
}
