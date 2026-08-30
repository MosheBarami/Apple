export interface Env {
  AI: Ai;
  CORPUS: D1Database;
  KV: KVNamespace;
  VEC: VectorizeIndex;
  SESSION_DO: DurableObjectNamespace;
  QUOTA_DO: DurableObjectNamespace;
  PAIRING_DO: DurableObjectNamespace;
  ADMIN_DO: DurableObjectNamespace;
  BUDGET_DO: DurableObjectNamespace;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ENVIRONMENT: string;
  /** AI Gateway id; when unset, calls bypass the gateway (still budget-gated) */
  AI_GATEWAY_ID?: string;
  ADMIN_KEY?: string;
  /**
   * Open Cloud key, scope `creator-store-product:read`, free from
   * https://create.roblox.com/dashboard/credentials. When unset, Creator Store search degrades to
   * the unauthenticated toolbox-service/v1 endpoint — it is never required.
   */
  ROBLOX_API_KEY?: string;
  /** Optional dedicated Vectorize index for the asset library; falls back to VEC. */
  VEC_ASSETS?: VectorizeIndex;
}

export interface AuthedUser {
  userId: string;
  email: string | null;
  role: string;
  jwt: string;
}
