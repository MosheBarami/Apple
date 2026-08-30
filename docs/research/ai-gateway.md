# Cloudflare AI Gateway + Workers AI **binding** — Golem research

Researched **2026-08-30** against live `developers.cloudflare.com`. Worker: `golem`.
Account: `e9b8acf2e89a1de289a1ee4abb0f3f8d`.

Everything below is quoted or transcribed from current official docs. Anything I could not
confirm from an official page is flagged **UNVERIFIED** — do not treat those as facts.

---

## TL;DR for the billing decision

**Spend limits DO exist.** AI Gateway shipped cost-based budgets on **2026-06-05**. They track
cumulative dollar spend and **block with `429`** when the budget is exceeded. This is a real
feature, not a workaround.

**But there are four caveats that matter before enabling Workers Paid:**

1. The spend-limits doc says limits apply to **Unified Billing** and **BYOK** requests "for models
   with known pricing." It **never mentions Workers AI under Standard billing**. Whether a spend
   limit actually caps a `env.AI.run()` call on a Standard-billing gateway is **UNVERIFIED**.
2. Spend limits are **eventually consistent** — "a burst of concurrent requests can briefly exceed
   the limit before enforcement catches up." Not a hard ceiling.
3. Cost tracking is "a **best-effort estimation** based on token counts and model pricing."
4. **Auto top-up defeats a hard cap.** If enabled, credits automatically refill when the balance
   drops below a threshold. And the balance "may go negative," in which case "Cloudflare will
   charge the payment method on file."

The strongest available hard stop is a gateway set to **Unified billing** with prepaid credits,
**auto top-up disabled**, plus spend-limit rules. See [Recommended posture](#recommended-posture).

---

## (a) Routing `env.AI.run()` through a gateway

### Exact options object

Third argument to `env.AI.run()` is the options object containing `gateway`:

```js
export default {
	async fetch(request, env) {
		const response = await env.AI.run(
			"@cf/meta/llama-3.1-8b-instruct",
			{
				prompt: "Why should you use Cloudflare for your AI inference?",
			},
			{
				gateway: {
					id: "{gateway_id}",
					skipCache: false,
					cacheTtl: 3360,
				},
			},
		);
		return new Response(JSON.stringify(response));
	},
};
```

TypeScript form:

```ts
export interface Env {
	AI: Ai;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const response = await env.AI.run(
			"@cf/meta/llama-3.1-8b-instruct",
			{ prompt: "Why should you use Cloudflare for your AI inference?" },
			{ gateway: { id: "{gateway_id}", skipCache: false, cacheTtl: 3360 } },
		);
		return new Response(JSON.stringify(response));
	},
} satisfies ExportedHandler<Env>;
```

### Full `gateway` parameter table (verbatim from Workers Bindings API reference)

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | string | *required* | Name of your AI Gateway. Must be in the same account as your Worker. Use `"default"` to automatically create a gateway on the first authenticated request. |
| `skipCache` | boolean | `false` | Skip the cache for this request. |
| `cacheTtl` | number | — | Cache TTL in seconds. |
| `cacheKey` | string | — | Custom cache key for this request. |
| `collectLog` | boolean | — | Whether to collect logs for this request. |
| `metadata` | object | — | Custom metadata to attach to the log entry. |

> Note: the older `/ai-gateway/usage/providers/workersai/` page lists only `id`, `skipCache`,
> `cacheTtl`. The Workers Bindings API reference page is the fuller, more current list and
> includes `cacheKey`, `collectLog`, `metadata`. **`metadata` is the one that matters for
> Golem** — spend limits can be scoped by custom metadata dimensions (per-user budgets).

### Wrangler binding

```jsonc
{
	"ai": {
		"binding": "AI",
	},
}
```

```toml
[ai]
binding = "AI"
```

### Must the gateway be created first?

**No — if and only if you use the ID `"default"`.**

> "If you omit the gateway ID from your request entirely, AI Gateway defaults to using `default`
> as the gateway ID. When no gateway named `default` exists in your account, AI Gateway creates it
> on the first authenticated request."

> "Auto-creation only applies to the gateway ID `default`. Using any other gateway ID requires
> creating the gateway first."

For Workers AI bindings specifically: "the account identity from the binding is used instead of a
header" to authenticate the auto-creating request.

**Auto-created `default` gateway settings** (note these defaults — caching OFF, rate limiting OFF,
Standard billing — i.e. the default gateway gives you *no* cost protection):

| Setting | Default value |
| --- | --- |
| Authentication | On |
| Log collection | On |
| Caching | Off (TTL of 0) |
| Rate limiting | Off |
| Workers AI billing | Standard billing |

### Creating a gateway manually

**Dashboard:** Log into the Cloudflare dashboard → select account → **AI** > **AI Gateway** >
**Create Gateway** → enter **Gateway name** (64 character limit) → choose **Workers AI Billing**
(**Standard billing** = "charges your Cloudflare account at the end of each billing cycle";
**Unified billing** = "deducts from your prepaid AI Gateway credit balance in real time") →
**Create**.

**API:** `POST /accounts/{account_id}/ai-gateway/gateways`

API token needs permissions `AI Gateway - Read` and `AI Gateway - Edit`.

Known request-body fields referenced by the docs: `cache_ttl` (caching page), and
`rate_limiting_interval`, `rate_limiting_limit`, `rate_limiting_technique` (rate limiting page).
The **complete** create-gateway request body schema (exact field names/types for `authentication`,
`collect_logs`, Workers AI billing mode, etc.) is **UNVERIFIED** — the API reference page body did
not render in fetches. Confirm against `/api/resources/ai_gateway/methods/create/` before scripting.

### Other binding methods

```typescript
const myLogId = env.AI.aiGatewayLogId;      // log ID from the most recent env.AI.run()
const gateway = env.AI.gateway("my-gateway");
await gateway.patchLog("my-log-id", { feedback: 1, score: 100, metadata: { user: "123" } });
const log = await gateway.getLog("my-log-id");   // Promise<AiGatewayLog>
gateway.getUrl(/* provider? */);                  // base or provider-specific gateway URL
```

`patchLog()` returns `Promise<void>`. If the `AiGatewayLog` type is missing, run `wrangler types`.

---

## (b) Spend / budget limits — **YES, this feature exists**

Source: `/ai-gateway/features/spend-limits/` (page last updated **Aug 17, 2026**), shipped per
changelog **2026-06-05**.

### What it is (verbatim)

> "Spend limits let you set cost-based budgets on your AI Gateway. When cumulative spend reaches
> the limit within a time window, AI Gateway blocks further requests with a `429` response until
> the window resets."

> "Unlike rate limiting, which caps the number of requests, spend limits track actual dollar cost
> per request based on model pricing. You can scope limits to any combination of model, provider,
> or custom metadata dimensions like user ID, team, or application."

> "Spend limits apply to both Unified Billing requests and BYOK requests for models with known
> pricing."

### How it works (verbatim)

> "Each spend limit rule defines a budget (in dollars) over a rolling or fixed time window. AI
> Gateway calculates the cost of each request based on token usage and model pricing, then tracks
> cumulative spend against the limit in real time."

> "Before sending a request to the provider, AI Gateway evaluates all applicable spend limit rules
> at once. If any individual rule is over budget, the request is blocked with a `429` response."

> "Spend limits are eventually consistent. The current request's cost is recorded after
> completion, so a burst of concurrent requests can briefly exceed the limit before enforcement
> catches up."

### Behavior when exceeded

> "When a spend limit is exceeded, AI Gateway returns a `429 Too Many Requests` response. You have
> two options:
> - **Block requests** (default) - The request is rejected until the budget window resets.
> - **Fall back to a cheaper model** - Create a Dynamic Route with a primary model and a fallback
>   (for example, `anthropic/claude-opus-4.7` with a fallback to `@cf/moonshotai/kimi-k2.6`). Then
>   set a spend limit on the primary model using this feature. When the primary model's budget is
>   exceeded, AI Gateway automatically routes requests to the fallback model instead of blocking
>   them."

### Granularity / scoping

Per **gateway**, per **rule**, per **time window**. Each rule scoped by one or more dimensions.
Two dimension modes:

- **Split by value** — "Each distinct value gets its own independent budget bucket"
- **Filter by value** — "The rule applies only when the dimension equals a specific value"

Dimension examples table (verbatim), for a request with model `openai/gpt-5.5` and an `agent_id`
metadata value of `agent_42`:

| Scenario | Dimensions | Budget bucket |
| --- | --- | --- |
| Global budget for everyone | None | One shared bucket |
| Per-agent budget | `agent_id` metadata: split by value | Separate bucket per agent |
| Per-provider, per-agent | `agent_id` metadata: split by value, provider: split by value | Separate bucket per agent+provider combination |
| Specific model only | model: filter by value `openai/gpt-5.5` | Only applies to `openai/gpt-5.5` requests |
| Per-agent, per-model | `agent_id` metadata: split by value, model: split by value | Separate bucket per agent+model combination |

Changelog examples of realistic budgets: "give each user a $200/day budget, cap total gateway spend
at $10,000/day, or limit a specific model to $50/day per user. Each rule uses a configurable time
window with fixed or sliding enforcement."

### Where configured

> "Spend limits are configured on the gateway via the dashboard or the API. You can define up to 20
> rules per gateway."

Dashboard: **AI** > **AI Gateway** → select your gateway → spend limits settings → add a rule.
Form fields: budget amount (dollar value), time window (rolling or fixed), dimensions
(provider / model / metadata), dimension mode (split by value or filter by value).

### Documented limitations (verbatim)

> - "Cost tracking is a best-effort estimation based on token counts and model pricing. Refer to
>   your provider's dashboard for exact billing amounts."
> - "A maximum of 20 spend limit rules can be configured per gateway."

### Gaps — **UNVERIFIED**, resolve before relying on this

- **Does a spend limit cap Workers AI (`@cf/…`) calls on a Standard-billing gateway?** The doc
  scopes the feature to "Unified Billing requests and BYOK requests." Workers AI under *Standard*
  billing is neither. The page "contains no references to Workers AI or standard billing tiers."
  **This is the single most important open question for Golem.** Test empirically, or set the
  gateway to Unified billing where the doc explicitly confirms credits deduct in real time.
- Exact API endpoint + JSON body for creating a spend limit rule — no API example is published on
  the page. (Note: a legacy `POST /accounts/{account_id}/ai-gateway/billing/spending-limit` exists
  but is marked **deprecated** in the API index — do not build on it.)
- Exact allowed time-window durations (the page says "rolling or fixed" but does not enumerate
  permitted durations).

---

## (c) Rate limiting

Different feature from spend limits — caps **request count**, not dollars.

### Where set

**Dashboard:** **AI** > **AI Gateway** > **Settings** > **Enable Rate-limiting**.

**API:** POST request with parameters `rate_limiting_interval`, `rate_limiting_limit`,
`rate_limiting_technique`.

### Configuration fields

- Number of requests + time window (interval), e.g. "100 requests per 60 seconds"
- Technique: fixed or sliding

### Fixed vs sliding (verbatim)

- **Fixed window:** "the window is based on time, so there would be no more than `x` requests in a
  ten minute window"
- **Sliding window:** "there would be no more than `x` requests in the last ten minutes"

### Error when limited

`429 Too Many Requests`, and "your request will not be processed."

The exact error response **body / JSON payload** for a rate-limit rejection is **UNVERIFIED** — the
docs do not publish it.

> Caution (from AI Search docs, relevant if Golem ever shares a gateway with AI Search): "avoid
> setting rate limiting on this gateway. Rate limits apply to AI Search's own model calls,
> including the many embedding requests made while indexing, and can interrupt indexing and
> querying."

---

## (d) Caching

### Cache key (verbatim)

> "By default, AI Gateway constructs the cache key by concatenating the following and hashing the
> result with SHA-256:"
>
> - Provider (e.g. `openai`, `anthropic`)
> - Endpoint (API path)
> - Model (e.g. `gpt-4o`)
> - Provider authentication header (e.g. `Authorization` bearer token)
> - Full request body

Consequence for Golem: **only byte-identical request bodies hit cache.** Any per-request variation
(timestamps, user IDs, randomized system prompts, non-zero temperature echoed into the body)
destroys the hit rate.

### TTL bounds (verbatim)

> "The minimum TTL is 60 seconds and the maximum TTL is one month."

When `cf-aig-cache-key` is set but neither `cf-aig-cache-ttl` nor a default gateway TTL is
configured: "the cache TTL is 5 minutes."

Caching is **disabled by default** (auto-created default gateway: "Caching — Off (TTL of 0)").

### Enabling globally

Dashboard: **AI** > **AI Gateway** > **Settings** > enable **Cache Responses**, then set the
default TTL. API: POST to create a gateway including a value for `cache_ttl`.

### Force / skip cache

| Header | Type | Effect |
| --- | --- | --- |
| `cf-aig-skip-cache` | boolean | Skip the cache for this request — "bypass the cached version of the request" and fetch directly from the original provider. |
| `cf-aig-cache-ttl` | number | Cache TTL in seconds. |
| `cf-aig-cache-key` | string | "override the default cache key and opts the request into caching." |
| `cf-aig-cache-status` | *(response)* | "will be designated as `HIT` or `MISS`." |

Via the binding these map to `skipCache`, `cacheTtl`, `cacheKey` in the `gateway` object.

### Reading cache-hit status

Response header **`cf-aig-cache-status`**, values `HIT` or `MISS`.

Via the binding, `env.AI.run()` returns the parsed model result rather than a raw `Response`, so
reading that header directly from a binding call is **UNVERIFIED**. Confirmed alternatives:
`env.AI.aiGatewayLogId` + `gateway.getLog(logId)`, the Logs API, and the Analytics dashboard.

### Are cached responses billed by Workers AI? — **UNVERIFIED**

This is not stated anywhere in the AI Gateway caching docs. What *is* documented:

> "**Cost Savings:** Minimize the number of paid requests made to your AI provider, especially for
> frequently accessed or non-dynamic content."

That implies a cache HIT avoids provider-side inference cost, but Cloudflare publishes **no
explicit statement** on whether a Workers AI cache HIT consumes Neurons. **Do not assume savings —
measure Neuron usage in the Workers AI dashboard with caching on vs off.**

⚠️ Do not confuse AI Gateway **response caching** (this section) with Workers AI **prompt caching**
(`/workers-ai/features/prompt-caching/`), a separate prefix-caching feature where cached *input
tokens* are billed at a discounted rate — i.e. still billed. Two different things.

### Other caching constraints (verbatim)

> "Currently caching is supported only for text and image responses, and it applies only to
> identical requests."

> "Cache in AI Gateway is volatile. If two identical requests are sent simultaneously, the first
> request may not cache in time for the second request to use it."

---

## (e) Unified Billing / prepaid credits

Source: `/ai-gateway/features/unified-billing/`, plus changelog **2026-08-07** "Workers AI and AI
Gateway unify model access and billing."

### What it is

Consolidates Workers AI + third-party provider charges into one Cloudflare bill, paid from prepaid
credits.

- **5% fee on credit purchases.** "A 5% fee is applied to all credits purchased through Unified
  Billing. For example, a $100 credit purchase will result in a $105 charge."
- Provider inference pricing is passed through without markup.

### Does it apply to Workers AI? — **Yes, explicitly**

> "You can now use prepaid AI Gateway credits to pay for Workers AI inference. This provides one
> credit balance for Workers AI and supported third-party model providers. To use credits for
> Workers AI, set the gateway's Workers AI billing setting to **Unified billing**. Workers AI
> requests routed through that gateway deduct from your credit balance in real time."

Bonus: credits "provide access to the following Workers AI frontier models without requiring the
Workers Paid plan" — `@cf/moonshotai/kimi-k2.6`, `@cf/moonshotai/kimi-k2.7-code`,
`@cf/zai-org/glm-5.2` — at "50 requests per minute per account, per model when billed with AI
Gateway credits, compared to 20 requests per minute through standard Workers AI billing."

> This is directly relevant to Golem: **prepaid credits can substitute for the Workers Paid plan**
> for those frontier models. Whether they substitute for Workers Paid for *general* Workers AI
> usage beyond the 10,000 free daily Neurons is **UNVERIFIED**.

### Does it cap Workers AI spend? — **Only partially. Two documented leaks.**

1. **Auto top-up.** "When your balance falls below the set threshold, AI Gateway will
   automatically apply the auto top-up amount to your account." **If auto top-up is on, the
   prepaid balance is not a cap at all** — it silently refills.
2. **Negative balance.** "In rare instances, your credit balance may go negative. If this happens,
   Cloudflare will charge the payment method on file for the outstanding amount. Charges occur at
   the beginning of each month for the previous month."

The exact error / HTTP status returned when the credit balance reaches zero is **UNVERIFIED** — not
documented on the page.

### Relevant Workers AI pricing baseline (for sizing budgets)

From `/workers-ai/platform/pricing/` (last updated **Aug 28, 2026**):

- **$0.011 per 1,000 Neurons.**
- **10,000 Neurons per day free** on *both* Workers Free and Workers Paid.
- Workers Free: "N/A - Upgrade to Workers Paid" for anything above the free allocation.
- Workers Paid: "$0.011 / 1,000 Neurons" above 10,000/day.
- "All limits reset daily at 00:00 UTC."
- Workers Paid "starts at $5 per month and still includes the 10,000 free Neurons per day
  allocation, with usage beyond that billed at each model's pricing."

**This is the uncontrolled-billing exposure: on Workers Paid, overage above 10,000 Neurons/day is
metered and unbounded by default.** Nothing in the Workers AI plan itself caps it.

---

## (f) AI Gateway REST API — exact paths

Base: `https://api.cloudflare.com/client/v4`

### Gateway management

| Method | Path |
| --- | --- |
| GET | `/accounts/{account_id}/ai-gateway/gateways` |
| POST | `/accounts/{account_id}/ai-gateway/gateways` |
| GET | `/accounts/{account_id}/ai-gateway/gateways/{gateway_id}` |
| PUT | `/accounts/{account_id}/ai-gateway/gateways/{gateway_id}` |
| DELETE | `/accounts/{account_id}/ai-gateway/gateways/{gateway_id}` |
| GET | `/accounts/{account_id}/ai-gateway/gateways/{gateway_id}/url` |

### Logs

| Method | Path |
| --- | --- |
| GET | `/accounts/{account_id}/ai-gateway/gateways/{gateway_id}/logs` |
| GET | `/accounts/{account_id}/ai-gateway/gateways/{gateway_id}/logs/{log_id}` |
| PATCH | `/accounts/{account_id}/ai-gateway/gateways/{gateway_id}/logs/{log_id}` |
| DELETE | `/accounts/{account_id}/ai-gateway/gateways/{gateway_id}/logs` |
| GET | `/accounts/{account_id}/ai-gateway/gateways/{gateway_id}/logs/{log_id}/request` |
| GET | `/accounts/{account_id}/ai-gateway/gateways/{gateway_id}/logs/{log_id}/response` |

### Billing (credits, top-up, spending limit)

| Method | Path |
| --- | --- |
| GET | `/accounts/{account_id}/ai-gateway/billing/credit-balance` |
| GET | `/accounts/{account_id}/ai-gateway/billing/usage-history` |
| GET | `/accounts/{account_id}/ai-gateway/billing/invoice-history` |
| GET | `/accounts/{account_id}/ai-gateway/billing/invoice-preview` |
| POST | `/accounts/{account_id}/ai-gateway/billing/topup` |
| GET | `/accounts/{account_id}/ai-gateway/billing/topup/status` |
| GET | `/accounts/{account_id}/ai-gateway/billing/topup/config` |
| POST | `/accounts/{account_id}/ai-gateway/billing/topup/config` |
| DELETE | `/accounts/{account_id}/ai-gateway/billing/topup/config` |
| GET | `/accounts/{account_id}/ai-gateway/billing/spending-limit` |
| POST | `/accounts/{account_id}/ai-gateway/billing/spending-limit` — **deprecated** |
| DELETE | `/accounts/{account_id}/ai-gateway/billing/spending-limit` |

`DELETE …/billing/topup/config` is the programmatic way to guarantee auto top-up is off.
`GET …/billing/credit-balance` is the endpoint to poll for a balance alarm.

### Other subresources

| Method | Path |
| --- | --- |
| GET | `/accounts/{account_id}/ai-gateway/evaluation-types` |
| GET / POST | `/accounts/{account_id}/ai-gateway/custom-providers` |
| GET / DELETE | `/accounts/{account_id}/ai-gateway/custom-providers/{provider_id}` |
| GET / POST | `/accounts/{account_id}/ai-gateway/datasets` |
| GET / PUT / DELETE | `/accounts/{account_id}/ai-gateway/datasets/{dataset_id}` |
| GET / POST | `/accounts/{account_id}/ai-gateway/evaluations` |
| GET / DELETE | `/accounts/{account_id}/ai-gateway/evaluations/{evaluation_id}` |
| GET / POST | `/accounts/{account_id}/ai-gateway/dynamic-routing` |
| GET / PUT / DELETE | `/accounts/{account_id}/ai-gateway/dynamic-routing/{route_id}` |
| GET / POST | `/accounts/{account_id}/ai-gateway/dynamic-routing/{route_id}/deployments` |
| GET / POST | `/accounts/{account_id}/ai-gateway/dynamic-routing/{route_id}/versions` |
| GET | `/accounts/{account_id}/ai-gateway/dynamic-routing/{route_id}/versions/{version_id}` |
| GET / POST | `/accounts/{account_id}/ai-gateway/provider-configs` |

### Inference endpoints (distinct from management)

Base `https://api.cloudflare.com/client/v4/accounts/{account_id}`:

- `POST /ai/run` — universal endpoint for all models and modalities
- `POST /ai/v1/chat/completions` — OpenAI SDK compatible
- `POST /ai/v1/responses` — OpenAI Responses API compatible
- `POST /ai/v1/messages` — Anthropic SDK compatible

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/v1/chat/completions" \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --header "cf-aig-gateway-id: default" \
  --header "Content-Type: application/json" \
  --data '{
    "model": "@cf/moonshotai/kimi-k2.6",
    "messages": [
      {
        "role": "user",
        "content": "What is Cloudflare?"
      }
    ]
  }'
```

**Workers AI models require the `cf-aig-gateway-id` header** to route through a gateway; third-party
models default to `default` without it.

### Auth / token permissions — a real gotcha

- Inference REST API: token needs **Account > Workers AI > Read**, passed as
  `Authorization: Bearer $CLOUDFLARE_API_TOKEN`.
- "A token that holds only an `AI Gateway` permission returns `401` with error code `10000`."
- Gateway management (`/ai-gateway/*`): `AI Gateway - Read` + `AI Gateway - Edit`.

### Per-request `cf-aig-*` headers (REST path equivalents of the binding options)

| Header | Type | Description |
| --- | --- | --- |
| `cf-aig-skip-cache` | boolean | Skip the cache for this request. |
| `cf-aig-cache-ttl` | number | Cache TTL in seconds. |
| `cf-aig-cache-key` | string | Custom cache key. |
| `cf-aig-collect-log` | boolean | Turn logging on or off for this request. |
| `cf-aig-request-timeout` | number | Request timeout in milliseconds. |
| `cf-aig-max-attempts` | number | Retry attempts (max 5). |
| `cf-aig-retry-delay` | number | Retry delay in milliseconds (max 5000). |
| `cf-aig-backoff` | string | Backoff method: `constant`, `linear`, or `exponential`. |
| `cf-aig-metadata` | JSON string | Custom metadata to attach to the log entry. |

Also documented elsewhere: `cf-aig-custom-cost` ("Allows the customization of request cost to
reflect user-defined parameters"), and `cf-aig-collect-log-payload` (added **2026-03-17**) —
"By default, this header is set to `true` and payloads are stored alongside metadata. Set this
header to `false` to skip payload storage while still logging metadata such as token counts, model,
provider, status code, cost, and duration."

---

## Recommended posture

Ordered by how much they actually constrain spend. Layer them; none is sufficient alone.

1. **Create a named gateway explicitly** (not `default`) — the auto-created default has caching
   off, rate limiting off, Standard billing. Use `gateway: { id: "golem-prod" }`.
2. **Set Workers AI Billing = Unified billing** on that gateway. This is the only mechanism where
   the docs explicitly confirm Workers AI requests "deduct from your credit balance in real time,"
   which converts spend into a prepaid, finite pool.
3. **Disable auto top-up** — `DELETE /accounts/{account_id}/ai-gateway/billing/topup/config`.
   Without this step the prepaid balance is not a cap. Verify with
   `GET …/billing/topup/config`.
4. **Add spend limit rules** (up to 20/gateway). A global gateway-wide daily budget, plus a
   per-user rule scoped by a `metadata` dimension passed from `env.AI.run()`.
5. **Add rate limiting** as a coarse backstop (requests/interval, sliding) — it engages instantly
   and is not subject to the spend-limit eventual-consistency window.
6. **Pass `metadata` on every `env.AI.run()` call** (e.g. `{ user_id }`) so per-user spend rules and
   log filtering work at all.
7. **Enable caching** with an explicit `cacheTtl` — but treat the savings as unproven until you
   measure Neurons with it on vs off.
8. **Poll `GET …/billing/credit-balance`** on a schedule and alert well before zero.

### Verify empirically before enabling Workers Paid

- Does a spend limit block a `@cf/…` `env.AI.run()` call on a **Standard**-billing gateway?
- Does a spend limit block it on a **Unified**-billing gateway? (expected yes)
- Does a cache `HIT` consume Neurons? (compare Workers AI dashboard Neuron counts)
- What status/error comes back when the prepaid credit balance hits zero?

---

## Sources

All fetched 2026-08-30.

- [Workers Bindings API reference (`env.AI.run()` gateway options, patchLog/getLog/getUrl)](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/)
- [AI Gateway — Workers AI provider (binding code samples)](https://developers.cloudflare.com/ai-gateway/usage/providers/workersai/)
- [Integrations — Workers AI binding walkthrough (wrangler `[ai] binding`)](https://developers.cloudflare.com/ai-gateway/integrations/aig-workers-ai-binding/)
- [**Spend limits**](https://developers.cloudflare.com/ai-gateway/features/spend-limits/)
- [Changelog — Control AI costs with spend limits (2026-06-05)](https://developers.cloudflare.com/changelog/post/2026-06-05-spend-limits/)
- [Rate limiting](https://developers.cloudflare.com/ai-gateway/features/rate-limiting/)
- [Caching](https://developers.cloudflare.com/ai-gateway/features/caching/)
- [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/)
- [Manage gateway (default gateway, create, Workers AI billing setting)](https://developers.cloudflare.com/ai-gateway/configuration/manage-gateway/)
- [Get started](https://developers.cloudflare.com/ai-gateway/get-started/)
- [REST API (endpoints, auth, `cf-aig-*` headers)](https://developers.cloudflare.com/ai-gateway/usage/rest-api/)
- [Cloudflare API — AI Gateway resource index (all `/ai-gateway/*` paths)](https://developers.cloudflare.com/api/resources/ai_gateway/)
- [Cloudflare API — AI Gateway create gateway](https://developers.cloudflare.com/api/resources/ai_gateway/methods/create/)
- [Changelog — Workers AI and AI Gateway unify model access and billing (2026-08-07)](https://developers.cloudflare.com/changelog/post/2026-08-07-workers-ai-unified-billing/)
- [Changelog — Call any AI model through AI Gateway's new REST API (2026-05-21)](https://developers.cloudflare.com/changelog/post/2026-05-21-rest-api/)
- [Changelog — Log request metadata without storing payloads (2026-03-17)](https://developers.cloudflare.com/changelog/post/2026-03-17-collect-log-payload-header/)
- [Changelog — Get started with AI Gateway automatically (2026-03-02)](https://developers.cloudflare.com/changelog/post/2026-03-02-default-gateway/)
- [Changelog — Select models now require the Workers Paid plan (2026-07-28)](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/)
- [Workers AI pricing (Neurons, $0.011/1k, 10k/day free)](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [AI Gateway changelog](https://developers.cloudflare.com/ai-gateway/changelog/)
- [AI Search — AI Gateway caveats on shared gateways](https://developers.cloudflare.com/ai-search/configuration/models/ai-gateway/)
