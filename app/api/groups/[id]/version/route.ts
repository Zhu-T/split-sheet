import { z } from "zod";
import { groupVersion } from "@/lib/queries";

/**
 * The group's current fingerprint, for open group pages to notice other people's changes.
 *
 * Served from Vercel's CDN for a few seconds, so however many people have the group open, the
 * database is asked at most about once per interval per group. Because of that it can't check
 * membership per person: the proxy still requires a session cookie, the group ID is an
 * unguessable UUID only members see, and the answer is an opaque hash that reveals nothing
 * except "something changed".
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/groups/[id]/version">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  return Response.json(
    { version: await groupVersion(id) },
    // Browsers always ask again (no-store in the page's fetch); the CDN keeps it 5 seconds.
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=5" } },
  );
}
