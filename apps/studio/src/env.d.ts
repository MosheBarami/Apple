/** A PNG from a render_view call, read by the model as image input (agent.ts withEvidence). */
interface EvidenceImage {
  mediaType: 'image/png';
  base64: string;
  width: number;
  height: number;
  label: string;
}

/** What the Studio worker is bound to (wrangler.jsonc). */
interface StudioGate {
  openProject(jwt: string, projectId: string): Promise<{ ok: true; projectName: string; canBuild: boolean } | { ok: false }>;
  projectStatus(projectId: string): Promise<{ studio: { connected: boolean; placeName: string | null; placeId: number | null }; credits: { remaining: number; unmetered: boolean } | null }>;
  callTool(projectId: string, name: string, args: Record<string, unknown>, turnId?: string): Promise<{ ok: boolean; text: string; images?: EvidenceImage[]; sceneChanged?: boolean }>;
  cancelTurn(projectId: string, turnId: string): Promise<{ dropped: number }>;
  reserveModel(model: string, inputChars: number, maxOutputTokens: number): Promise<{ ok: true; reserved: number } | { ok: false; message: string }>;
  settleModel(model: string, reserved: number, usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number } | null): Promise<void>;
  releaseModel(model: string, reserved: number): Promise<void>;
  canSpend(projectId: string): Promise<{ ok: true } | { ok: false; message: string }>;
  chargeUsage(projectId: string, model: string, usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number }): Promise<{ ok: boolean; credits: number }>;
}

interface Env {
  AI: Ai;
  GATE: Fetcher & StudioGate;
  DOCS: D1Database;
  StudPilotAgent: DurableObjectNamespace<import('./agent.ts').StudPilotAgent>;
  FLUE_STUDPILOT: DurableObjectNamespace<import('./legacy.ts').FlueStudPilotAgent>;
  SUPABASE_URL: string;
  AI_GATEWAY_ID: string;
  /** The Workers AI model the agent runs on. */
  AGENT_MODEL?: string;
  BUILD_SHA?: string;
  /** Secret: the operator key for the conversation export (server.ts). Unset means the route does not exist. */
  ADMIN_KEY?: string;
}
