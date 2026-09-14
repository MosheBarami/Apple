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
   * Stripe webhook signing secret. Absent in every environment until billing is switched on,
   * and the webhook route REFUSES rather than degrading to trusting an unsigned body — an
   * unverified billing webhook is an open 'give me a subscription' endpoint.
   */
  STRIPE_WEBHOOK_SECRET?: string;
  /**
   * Stripe secret API key, used ONLY to open a hosted Checkout or Billing Portal session on the
   * user's behalf. It never grants a plan: entitlement is recomputed from the subscription events
   * that arrive at the webhook, so a redirect back from Stripe cannot be forged into an upgrade.
   * Absent everywhere until billing is switched on, and the routes refuse rather than degrade.
   */
  STRIPE_SECRET_KEY?: string;
  /**
   * The Stripe Price each purchasable tier is sold at. Per-environment, because a test-mode price
   * and a live one are different objects. Free has no price and Enterprise is a conversation, so
   * neither has an entry — a checkout for either is a bug rather than a missing variable.
   */
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_TEAM?: string;
  /**
   * Open Cloud key, scope `creator-store-product:read`, free from
   * https://create.roblox.com/dashboard/credentials. When unset, Creator Store search degrades to
   * the unauthenticated toolbox-service/v1 endpoint — it is never required.
   */
  ROBLOX_API_KEY?: string;
  /** Optional dedicated Vectorize index for the asset library; falls back to VEC. */
  VEC_ASSETS?: VectorizeIndex;
  // ---------------------------------------------------------------------------
  // Alternate model providers. ALL THREE ARE UNSET and nothing in the product sets them.
  //
  // They are declared so the provider layer can ASK whether a credential exists and answer
  // honestly, which is the whole point: a provider is reported available only when its binding is
  // actually present here at runtime. Declaring the binding does not enable the provider, does not
  // add a key, and does not change which model serves a request — GLM-5.3 Flash over the Workers
  // AI binding remains the only path inference takes.
  // ---------------------------------------------------------------------------
  /** OpenAI (GPT-5.6 Luna). Absent → the OpenAI provider reports `no_credentials`. */
  OPENAI_API_KEY?: string;
  /** Google Gemini (Gemini 3.7 Flash). Absent → the Google provider reports `no_credentials`. */
  GOOGLE_API_KEY?: string;
  /** DeepSeek (DeepSeek V4 Flash). Absent → the DeepSeek provider reports `no_credentials`. */
  DEEPSEEK_API_KEY?: string;
}

export interface AuthedUser {
  userId: string;
  email: string | null;
  role: string;
  jwt: string;
}
