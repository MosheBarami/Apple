/** What the Studio worker is bound to (wrangler.jsonc). Flue adds its own FLUE_* bindings. */
interface StudioGate {
  openProject(jwt: string, projectId: string): Promise<{ ok: true; projectName: string; canBuild: boolean } | { ok: false }>;
  callTool(projectId: string, name: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }>;
}

interface Env {
  AI: Ai;
  GATE: Fetcher & StudioGate;
  SUPABASE_URL: string;
  AI_GATEWAY_ID: string;
}
