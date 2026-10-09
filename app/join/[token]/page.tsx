import type { Metadata } from "next";
import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, Page, Skeleton, TopBar } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authz";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Join group" };

export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <>
      <TopBar title="Join group" back="/" />
      <Page>
        <Suspense fallback={<Skeleton rows={0} />}>
          <Join params={params} />
        </Suspense>
      </Page>
    </>
  );
}

async function Join({ params }: Pick<PageProps<"/join/[token]">, "params">) {
  const { token } = await params;
  const user = await requireUser();
  const [group] = await db
    .select({ id: schema.groups.id, name: schema.groups.name })
    .from(schema.groups)
    .where(eq(schema.groups.inviteToken, token));

  if (!group) {
    return (
      <Card className="px-5 py-8 text-center">
        <h2 className="text-xl font-semibold">This link doesn&apos;t work anymore</h2>
        <p className="mt-2 text-muted">Ask whoever sent it for a new invite link.</p>
      </Card>
    );
  }

  const [mine] = await db
    .select({ active: schema.members.active, userId: schema.members.userId })
    .from(schema.members)
    .where(eq(schema.members.groupId, group.id))
    .then((rows) => rows.filter((r) => r.userId === user.id));
  if (mine?.active) redirect(`/groups/${group.id}`);

  const [{ n }] = await db.select({ n: count() }).from(schema.members).where(eq(schema.members.groupId, group.id));

  return (
    <Card className="px-5 py-8 text-center">
      <p className="text-sm text-muted">You&apos;re invited to</p>
      <h2 className="mt-1 text-2xl font-semibold break-words">{group.name}</h2>
      <p className="mt-1 text-muted">
        {n} {n === 1 ? "member" : "members"}
      </p>
      <JoinButton token={token} />
      <p className="mt-4 text-xs text-muted">Joining as {user.email}</p>
    </Card>
  );
}
