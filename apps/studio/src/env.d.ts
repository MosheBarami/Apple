/** What the Studio worker is bound to (wrangler.jsonc). Flue adds its own FLUE_* bindings. */
interface StudioGate {
  openProject(jwt: string, projectId: string): Promise<{ ok: true; projectName: string; canBuild: boolean } | { ok: false }>;
  callTool(projectId: string, name: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }>;
  reserveModel(model: string, inputChars: number, maxOutputTokens: number): Promise<{ ok: true; reserved: number } | { ok: false; message: string }>;
  settleModel(model: string, reserved: number, usage: { inputTokens: number; outputTokens: number } | null): Promise<void>;
  releaseModel(model: string, reserved: number): Promise<void>;
}

interface Env {
  AI: Ai;
  GATE: Fetcher & StudioGate;
  SUPABASE_URL: string;
  AI_GATEWAY_ID: string;
}
