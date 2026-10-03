import { guard } from "@/lib/guard";
import { modelId } from "@/lib/config";
import { ensureIndex } from "@/lib/knowledge";
import { listSkills } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Non-secret facts for the UI: model name, skills, index size. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return Response.json({
    model: modelId(),
    keyConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    skills: listSkills().map((s) => ({ name: s.name, description: s.description })),
    index: ensureIndex(),
  });
}
