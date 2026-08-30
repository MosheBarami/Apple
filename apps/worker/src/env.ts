export interface Env {
  ASSETS: Fetcher;
  AI: Ai;
  CORPUS: D1Database;
  KV: KVNamespace;
  VEC: VectorizeIndex;
  SESSION_DO: DurableObjectNamespace;
  QUOTA_DO: DurableObjectNamespace;
  PAIRING_DO: DurableObjectNamespace;
  ADMIN_DO: DurableObjectNamespace;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ENVIRONMENT: string;
  ADMIN_KEY?: string;
}

export interface AuthedUser {
  userId: string;
  email: string | null;
  role: string;
  jwt: string;
}
