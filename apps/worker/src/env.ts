export interface Env {
  AI: Ai;
  CORPUS: D1Database;
  KV: KVNamespace;
  /**
   * Generated media — images, audio, attachments. Optional ON PURPOSE.
   *
   * A deployment without the binding (a local `wrangler dev` without R2, an older config) must
   * degrade to the KV path rather than throw on the first write. Every caller therefore asks
   * whether it is there instead of assuming; `mediaStore()` in media-store.ts is the one place
   * that decides, so the question is answered once rather than at each call site.
   */
  MEDIA?: R2Bucket;
  /** The git sha this worker was deployed from, injected by `deploy:api`. */
  BUILD_SHA?: string;
  VEC: VectorizeIndex;
  SESSION_DO: DurableObjectNamespace;
  QUOTA_DO: DurableObjectNamespace;
  /** Explicit deployment identity; a request host must never choose the billing authority. */
  BILLING_WORKER_NAME?: 'apple' | 'golem';
  /** Apple-only external binding to golem's existing QuotaDO namespace during migration. */
  LEGACY_QUOTA_DO?: DurableObjectNamespace;
  PAIRING_DO: DurableObjectNamespace;
  ADMIN_DO: DurableObjectNamespace;
  BUDGET_DO: DurableObjectNamespace;
  DISCORD_DO: DurableObjectNamespace;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ENVIRONMENT: string;
  /**
   * Purpose-scoped secret used only to claim and acknowledge membership-access outbox rows. The
   * raw value is a Worker secret; Supabase stores its SHA-256 digest (migration 0009). Without it,
   * membership mutations still enqueue atomically and the immediate local push still runs, but a
   * scheduled consumer refuses to claim anything rather than reading the queue anonymously.
   */
  MEMBERSHIP_OUTBOX_TOKEN?: string;
  /**
   * Durable Object namespace this deployment owns (`golem` or `apple`). Both deployments share
   * Supabase and therefore need distinct acknowledgements for the same access event.
   */
  MEMBERSHIP_OUTBOX_CONSUMER?: string;
  /**
   * Where uncaught errors are reported. `https://<publicKey>@<host>/<projectId>`, from
   * Sentry → Settings → Projects → <project> → Client Keys (DSN).
   *
   * CONFIGURATION, NOT A CREDENTIAL. A DSN carries a PUBLIC key by construction — the browser
   * half of this same integration ships its DSN inside the JavaScript bundle, where anybody can
   * read it — so it grants nothing but the ability to send this project events. It is still kept
   * out of the repository, because the repository is not where deployment-specific configuration
   * belongs and because a DSN in git follows every fork of this tree forever:
   *
   *     cd apps/worker && npx wrangler secret put SENTRY_DSN      # production
   *     echo 'SENTRY_DSN=https://…' >> apps/worker/.dev.vars      # local, untracked
   *
   * UNSET IS A SUPPORTED STATE AND THE DEFAULT ONE. With no DSN the worker reports nothing,
   * crashes at nothing, and answers every request exactly as it would with monitoring on. See
   * sentry.ts — the outermost middleware re-throws in every branch, so the error a client is
   * shown does not depend on whether this variable is set.
   */
  SENTRY_DSN?: string;
  /** AI Gateway id; when unset, calls bypass the gateway (still budget-gated) */
  AI_GATEWAY_ID?: string;
  ADMIN_KEY?: string;
  //[[ `RESVG_WASM?: WebAssembly.Module` WAS HERE, AND WAS A DIRECTION TO A PLACE THAT DOES NOT EXIST.
  //
  //   Its comment read "the resvg renderer, bound in wrangler.jsonc. Absent means this deployment
  //   cannot rasterise." No wrangler file in this repository has ever contained a `wasm_modules`
  //   section — neither wrangler.jsonc nor wrangler.apple.jsonc — and the same change that added
  //   the field recorded, in asset-import.ts, that wrangler rejects `wasm_modules` for this
  //   ES-module worker and that the static import it would need broke 33 test files.
  //
  //   Nothing read it. The behaviour it implied — SVG assets are refused — is decided somewhere
  //   else entirely and unconditionally: see the Iconify branch in asset-import.ts, which returns
  //   "this deployment does not rasterise" without consulting any binding. So this interface, the
  //   file a reader consults to learn what the worker is WIRED TO, named a binding that exists in
  //   neither deployment and sent the reader to look for it in a file that has never had it. ]]
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
   * Stripe secret API key for billing requests and the authority's current-subscription read.
   * It never grants a plan by itself: a signed event initiates authority reconciliation, so a
   * redirect back from Stripe cannot be forged into an upgrade.
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
  // Customer keys (owner decisions D-BYOK-1, D-BYOK-2, D-FREE-1).
  // ---------------------------------------------------------------------------
  /**
   * 32 random bytes, base64: the AES-GCM key that seals customers' own model-provider keys at rest
   * (model-keys.ts). Set in production on 2026-09-23. Absent → the key routes refuse and store
   * nothing. Rotating it makes every stored key unreadable (D-BYOK-2).
   */
  BYOK_ENCRYPTION_KEY?: string;
  /**
   * A PLATFORM OpenRouter key. Absent today. Present → free OpenRouter models run without the
   * customer's own key; absent → free models say they need the customer's key (D-FREE-1).
   */
  OPENROUTER_API_KEY?: string;
}

export interface AuthedUser {
  userId: string;
  email: string | null;
  role: string;
  jwt: string;
}
