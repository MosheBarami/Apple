import { guard } from "@/lib/guard";
import { ensureIndex } from "@/lib/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Force a rebuild of the BM25 knowledge index. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return Response.json(ensureIndex({ force: true }));
}
