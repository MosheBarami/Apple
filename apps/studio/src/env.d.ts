/** What the Studio worker is bound to (wrangler.jsonc). Flue adds its own FLUE_* bindings. */
interface StudioGate {
  prepareInference(jwt: string, projectId: string, selection: unknown, identity?: { conversation: string; requestKey: string; inputHash: string }): Promise<{ runRef: string; selection: unknown; engineVersion: string; policyVersion: string }>;
  inferenceEvidence(projectId: string, runRef: string): Promise<Record<string, unknown>>;
  openProject(jwt: string, projectId: string): Promise<{ ok: true; projectName: string; canBuild: boolean } | { ok: false }>;
  callTool(projectId: string, name: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }>;
  reserveModel(model: string, inputChars: number, maxOutputTokens: number): Promise<{ ok: true; reserved: number } | { ok: false; message: string }>;
  settleModel(model: string, reserved: number, usage: { inputTokens: number; outputTokens: number } | null): Promise<void>;
  releaseModel(model: string, reserved: number): Promise<void>;
  canSpend(projectId: string): Promise<{ ok: true } | { ok: false; message: string }>;
  chargeUsage(projectId: string, model: string, usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number }): Promise<{ ok: boolean; credits: number }>;
}

interface Env {
  AI: Ai;
  GATE: Fetcher & StudioGate;
  SUPABASE_URL: string;
  AI_GATEWAY_ID: string;
  BUILD_SHA?: string;
}
