import { auth } from "@/auth";
import { findActiveMembership } from "@/lib/authz";
import { groupVersion } from "@/lib/queries";

/**
 * The group's current fingerprint, for open group pages to notice other people's changes.
 * Members only; anyone else gets a 404, like the group page itself.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/groups/[id]/version">) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!(await findActiveMembership(id, userId))) return new Response("Not found", { status: 404 });
  return Response.json({ version: await groupVersion(id) }, { headers: { "Cache-Control": "no-store" } });
}
