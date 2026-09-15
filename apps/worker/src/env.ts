export interface Env {
  AI: Ai;
  CORPUS: D1Database;
  KV: KVNamespace;
  /** The git sha this worker was deployed from, injected by `deploy:api`. */
  BUILD_SHA?: string;
  VEC: VectorizeIndex;
  SESSION_DO: DurableObjectNamespace;
  QUOTA_DO: DurableObjectNamespace;
  PAIRING_DO: DurableObjectNamespace;
  ADMIN_DO: DurableObjectNamespace;
  BUDGET_DO: DurableObjectNamespace;
  DISCORD_DO: DurableObjectNamespace;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ENVIRONMENT: string;
  /** AI Gateway id; when unset, calls bypass the gateway (still budget-gated) */
  AI_GATEWAY_ID?: string;
  ADMIN_KEY?: string;
  /** The resvg renderer, bound in wrangler.jsonc. Absent means this deployment cannot rasterise. */
  RESVG_WASM?: WebAssembly.Module;
  /** 32 bytes, base64. Wraps customers' own third-party credentials; without it they are refused. */
  CREDENTIAL_KEY?: string;
  /** The Roblox account library assets are created under. Public id, not a credential;
   *  the credential is ROBLOX_API_KEY, declared further down beside the other asset fields. */
  ROBLOX_CREATOR_USER_ID?: string;
  ROBLOX_CREATOR_GROUP_ID?: string;
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
  STRIPE_PRICE_BUILDER?: string;
  STRIPE_PRICE_STUDIO?: string;
  /**
   * Which Billing Portal configuration (`bpc_…`) the portal opens with.
   *
   * Unset, Stripe uses the dashboard's default configuration — so whether a customer can update
   * their card at all is a toggle in a web UI this repo cannot read, cannot assert and cannot
   * notice being turned off, while the product's own copy promises the control by name. Set it to
   * a configuration with payment_method_update, invoice_history and subscription_cancel enabled:
   * those three are what 'Update your payment method' and 'Manage billing, invoices and
   * cancellation' claim exists.
   *
   * Optional, and an ABSENT value is sent as no parameter rather than as an empty one — Stripe
   * refuses a blank configuration id, and the portal is a customer's only route to their own card.
   */
  STRIPE_PORTAL_CONFIGURATION?: string;
  /**
   * The Discord application's PUBLIC KEY, from the developer portal's General Information page.
   * It is what proves an interaction really came from Discord. Absent everywhere until the owner
   * creates the application, and `/api/discord/interactions` REFUSES with 503 rather than
   * degrading to trusting an unsigned body — unverified, that endpoint is a public button that
   * spends other people's credits.
   */
  DISCORD_PUBLIC_KEY?: string;
  /**
   * The bot token. Used for exactly one thing: registering the slash commands. Replying to an
   * interaction and editing that reply are authenticated by the interaction's own token, so
   * nothing on the hot path needs this and nothing on the hot path is given it.
   */
  DISCORD_BOT_TOKEN?: string;
  /**
   * Open Cloud key, scope `creator-store-product:read`, free from
   * https://create.roblox.com/dashboard/credentials. When unset, Creator Store search degrades to
   * the unauthenticated toolbox-service/v1 endpoint — it is never required.
   */
  ROBLOX_API_KEY?: string;
  /** Optional dedicated Vectorize index for the asset library; falls back to VEC. */
  VEC_ASSETS?: VectorizeIndex;
  // ---------------------------------------------------------------------------
  // The web-facing tools (webtools.ts). Every one of these is OPTIONAL and unset by default, and
  // each absence has a defined, visible answer rather than a silent degradation — a tool whose
  // capability is missing reports `not_configured` and is dropped from the offered toolset, so
  // the model is never handed a tool that cannot work here.
  // ---------------------------------------------------------------------------
  /**
   * Extra hosts the web tools may reach, comma-separated (`docs.example.com,.example.org`).
   * ADDED to the built-in allowlist, never replacing it. A malformed list is refused whole:
   * see `webPolicy`, and the note there about why a partially-applied allowlist is worse than none.
   */
  WEB_TOOL_ALLOWLIST?: string;
  /** JSON search endpoint for `web_search`. Its own host must also be on the allowlist. */
  SEARCH_API_URL?: string;
  SEARCH_API_KEY?: string;
  /** PNG rendering endpoint for `screenshot_page`. Its own host must also be on the allowlist. */
  SCREENSHOT_API_URL?: string;
  SCREENSHOT_API_KEY?: string;
  /** Raises GitHub's rate limit for `github_lookup` and `git_history`. Both are read-only either way. */
  GITHUB_TOKEN?: string;
  /** Extra repositories those two tools may read: `owner/name` or `owner/*`, comma-separated. */
  GITHUB_REPO_ALLOWLIST?: string;
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
