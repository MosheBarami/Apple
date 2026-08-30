# HARD spend protection on Cloudflare — what actually exists

Research date: **2026-08-30**. Target account: `e9b8acf2e89a1de289a1ee4abb0f3f8d`, worker `golem`, Workers AI via `env.AI`.
All facts below verified against live `developers.cloudflare.com` docs on 2026-08-30 (page "last updated" dates cited inline). Anything not confirmed by a doc is marked **UNVERIFIED**.

---

## BOTTOM LINE (read this first)

1. **Cloudflare has NO account-level hard spend cap.** Budget alerts exist, but the docs say verbatim: *"Budget alerts are informational only. They do not pause or cap usage."* There is no setting anywhere that stops billing or stops service at a dollar amount for Workers, D1, KV, DO, Vectorize, or Workers AI standard billing.
2. **There is exactly ONE hard, blocking, dollar-denominated control in the whole platform: AI Gateway → Spend limits.** It returns `429 Too Many Requests` and blocks the request *before* it reaches the model. But per the docs it covers **Unified Billing** and **BYOK** requests — **not** Workers AI billed under **Standard billing**.
3. **Therefore the only architecture that makes uncontrolled Workers AI billing impossible is:** create an AI Gateway → set its **Workers AI Billing = Unified billing** (prepaid credits, real-time deduction) → route every `env.AI.run()` through that gateway ID → set spend limit rules on that gateway → **leave auto-top-up OFF**. Even then, Cloudflare warns the credit balance *"may go negative"* in rare cases and it will charge the card on file, so this is a very hard ceiling, not a mathematically absolute one.
4. On Workers Paid with **Standard billing**, exceeding the 10,000 free neurons/day is **billed per neuron with no ceiling**. It does not stop. This is the exact risk the owner is worried about, and it is real.

---

## (a) Do account-level / per-product billing caps, spend alerts, or budgets exist?

### Budget alerts — ALERT ONLY, DOES NOT BLOCK

Source: [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/) (last updated May 29, 2026)

- Exact name: **Budget alerts**
- Configured at: **Manage Account → Billing → Billable Usage → Create budget alert**. Also reachable via **Notifications → Add → Budget Alert**.
- Fields: Alert name, Description (optional), **Budget threshold (USD)**, Email recipients.
- Verbatim behavior: *"Budget alerts evaluate your cumulative usage-based spend for the current billing period."* … *"Budget alerts are informational only. They do not pause or cap usage. Your monthly invoice remains the authoritative source for billing."*
- Eligibility: *"Budget alerts are available to Pay-as-you-go accounts only. Enterprise contract accounts are not supported."*
- **Default alert:** per changelog [Budget alerts now on by default](https://developers.cloudflare.com/changelog/post/2026-06-15-budget-alerts-default-on/) (published July 20, 2026): eligible Pay-as-you-go accounts get an auto-created alert with a **$10 account-level threshold**, enabling at the turn of the next billing cycle.
- **Latency:** *"Usage is processed once per day for the prior day's activity, so budget alerts fire the day after the threshold is reached rather than in real time."* — i.e. up to ~24h blind window.
- **Scope exclusion:** *"Budget alerts only consider spend on usage-based products. Recurring subscription fees, such as the Workers Paid plan fee or other monthly plan charges, are not included in the threshold calculation."*
- No documented maximum number of alerts. Multiple thresholds are deduplicated by the notifications system.

### Usage notifications (per-product) — ALERT ONLY

Source: [Usage-based billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/) (last updated May 29, 2026)

- Exact name: **Billable Usage** notifications, configured at **Notifications → Add → Billable Usage**.
- Per-product metric thresholds (bytes, requests, minutes), not dollars.
- Requires **Professional plan or higher** per the doc: *"If you are on a Professional plan or higher, you can monitor the usage of individual Cloudflare add-ons by turning on email notifications."*
- Verbatim: *"The email notifications are for informational purposes only. Actual usage and billing may vary."*

### Billable Usage dashboard — OBSERVE ONLY

Source: [Monitor billable usage](https://developers.cloudflare.com/billing/manage/billable-usage/) (last updated Jun 30, 2026). **Manage Account → Billing → Billable Usage**. Daily cost breakdown chart + per-product table (Product / Total usage / Billable usage / Usage cost). Pay-as-you-go only. Requires Billing read permission. No control surface — display only.

### AI Gateway → Spend limits — **THE ONLY HARD BLOCK**

Source: [Spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/) (last updated Aug 17, 2026)

- Verbatim: *"Spend limits let you set cost-based budgets on your AI Gateway. When cumulative spend reaches the limit within a time window, AI Gateway blocks further requests with a `429` response until the window resets."*
- **Scope, verbatim:** *"Spend limits apply to both Unified Billing requests and BYOK requests for models with known pricing."* The docs do **not** state that they apply to Workers AI requests billed under Standard billing. See UNVERIFIED section.
- Enforcement point: *"Before sending a request to the provider, AI Gateway evaluates all applicable spend limit rules at once. If any individual rule is over budget, the request is blocked with a `429` response."*
- **Leak, verbatim:** *"Spend limits are eventually consistent. The current request's cost is recorded after completion, so a burst of concurrent requests can briefly exceed the limit before enforcement catches up."*
- **Accuracy caveat, verbatim:** *"Cost tracking is a best-effort estimation based on token counts and model pricing."*
- Configured at: **Cloudflare dashboard → AI → AI Gateway → select gateway → spend limits settings → add rule**. Also available via API.
- **Max 20 spend limit rules per gateway.**
- Scoping dimensions: **provider**, **model**, **custom metadata key** (e.g. `user_id`, `agent_id`). Each dimension is either **Split by value** (independent budget bucket per distinct value) or **Filter by value** (rule applies only to that value). *"If a dimension is not configured on a rule, all values share one budget bucket."*
- Per-user budgets: with Cloudflare Access in front of the gateway, the reserved metadata key **`cf.user_id`** is added automatically; without Access, pass your own `user_id` as custom metadata.
- Behavior on limit: **Block requests (default)**, or **fall back to a cheaper model** via a Dynamic Route.
- Time windows: docs say *"a rolling or fixed time window"*; exact selectable durations are **UNVERIFIED** (the changelog gives examples of `$200/day`, `$10,000/day`, `$50/day`).
- Availability: per the [blog post](https://blog.cloudflare.com/ai-gateway-spend-limits/) (June 5, 2026), spend limits are in **open beta for all AI Gateway users across all plans**.

### AI Gateway → Rate limiting — hard block on request COUNT (not dollars)

Source: [Rate limiting](https://developers.cloudflare.com/ai-gateway/features/rate-limiting/) (last updated Jun 5, 2026)

- N requests per time window, **fixed** or **sliding** technique. Exceeding returns `429 Too Many Requests` and *"your request will not be processed."*
- Configured at **AI → AI Gateway → Settings → Rate-limiting**, or via API fields `rate_limiting_interval`, `rate_limiting_limit`, `rate_limiting_technique`.
- Applies uniformly to all requests through that gateway. This is a real hard block and is **plan-independent and billing-mode-independent** — useful as a belt-and-braces cap even under Standard billing.

---

## (b) Workers Paid plan — exact inclusions and overage rates

Source: [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) (last updated Aug 28, 2026)

Plan framing, verbatim: *"The Workers Paid plan includes Workers, Pages Functions, Workers KV, Hyperdrive, and Durable Objects usage for a minimum charge of $5 USD per month for an account."* *"There are no additional charges for data transfer (egress) or throughput (bandwidth)."* All included usage is monthly.

### Workers (Standard usage model)

| Metric | Included / month | Overage rate |
|---|---|---|
| Requests | 10,000,000 | **$0.30 per additional million** |
| CPU time | 30,000,000 CPU-milliseconds | **$0.02 per additional million CPU-ms** |
| Duration (wall clock) | — | **No charge or limit for duration** |

- Max **5 minutes** CPU time per invocation (default 30 seconds); **15 minutes** per Cron Trigger or Queue Consumer invocation.
- Subrequests made *from* your Worker are **not** billed. Requests to static assets are **free and unlimited**.
- A WebSocket `Upgrade` counts as one request; WebSocket messages routed through a Worker do not count as requests.
- With Workers Caching enabled, cache-served requests are billed at the same per-request rate; CPU time is only billed on cache miss/bypass.

### Workers KV

| Metric | Paid plan included | Overage rate |
|---|---|---|
| Keys read | 10 million / month | **$0.50 / million** |
| Keys written | 1 million / month | **$5.00 / million** |
| Keys deleted | 1 million / month | **$5.00 / million** |
| List requests | 1 million / month | **$5.00 / million** |
| Stored data | 1 GB | **$0.50 / GB-month** |

Billing is per key; bulk reads bill per key read.

### D1

| Metric | Paid plan included | Overage rate |
|---|---|---|
| Rows read | First 25 billion / month | **$0.001 / million rows** |
| Rows written | First 50 million / month | **$1.00 / million rows** |
| Storage | First 5 GB | **$0.75 / GB-month** |

Rows read = rows *scanned*, not returned. DDL contributes to both. Indexes add one extra written row per indexed-column write. Monthly included limits reset on the subscription renewal date (day of first subscribe), not the calendar month.

### Durable Objects — compute

| Metric | Paid plan included | Overage rate |
|---|---|---|
| Requests | 1 million / month | **$0.15 / million** |
| Duration | 400,000 GB-s / month | **$12.50 / million GB-s** |

- Billable usage is *"rounded up to the next billable unit before the corresponding rate is applied"* — e.g. 500,000 GB-s of billable duration is rounded up to 1,000,000 GB-s.
- Requests include HTTP requests, RPC sessions, WebSocket messages, and alarm invocations. Incoming WebSocket messages are billed at a **20:1 ratio** (100 incoming messages → 5 billed requests).
- Duration bills for the full **128 MB** allocation regardless of actual memory use. `accept()`ing a WebSocket incurs duration charges for the whole connection lifetime — use the WebSocket Hibernation API.

### Durable Objects — SQLite storage backend

| Metric | Paid plan included | Overage rate |
|---|---|---|
| Rows read | First 25 billion / month | **$0.001 / million rows** |
| Rows written | First 50 million / month | **$1.00 / million rows** |
| SQL stored data | 5 GB-month | **$0.20 / GB-month** |

KV-style methods (`get`/`put`/`delete`/`list`) on a SQLite-backed DO are billed as rows read/written. Each `setAlarm()` = one row written. Deletes count as rows written. Note: storage billing for SQLite-backed DOs was enabled January 2026 (target Jan 7, 2026).

### Durable Objects — key-value storage backend (legacy; Paid plan only, existing namespaces only)

| Metric | Paid plan included | Overage rate |
|---|---|---|
| Read request units | 1 million | **$0.20 / million** |
| Write request units | 1 million | **$1.00 / million** |
| Delete requests | 1 million | **$1.00 / million** |
| Stored data | 1 GB | **$0.20 / GB-month** |

A request unit = 4 KB read or written (a 9 KB write = 3 write request units).

### Vectorize

| Metric | Paid plan included | Overage rate |
|---|---|---|
| Queried vector dimensions | First 50 million / month | **$0.01 per million** |
| Stored vector dimensions | First 10 million | **$0.05 per 100 million** |

Cost formula, verbatim from docs:
`((queried vectors + stored vectors) * dimensions * ($0.01 / 1,000,000)) + (stored vectors * dimensions * ($0.05 / 100,000,000))`

Vectorize is **Workers Paid only** (Free plan gets 30M queried / 5M stored dimensions but the doc states *"Vectorize is currently only available on the Workers paid plan"*).

### Hyperdrive

Free plan: 100,000 database queries/day. **Paid plan: Unlimited** (no per-query charge documented).

### Computing a worst-case overage bill

Formula per dimension: `max(0, usage - included) x rate`. Sum across dimensions, add the $5 base. Every dimension above is **unbounded** — there is no plan-level ceiling on any of them.

---

## (c) Workers AI on Workers Paid — neuron allocation and rate

Source: [Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) (last updated Aug 28, 2026)

- **Free daily allocation is still 10,000 Neurons per day**, and it **does apply on the Workers Paid plan**. Verbatim: *"Our free allocation allows anyone to use a total of 10,000 Neurons per day at no charge."*
- **Rate: `$0.011 per 1,000 Neurons`** (i.e. $0.000011 per neuron, $11 per million neurons).
- Verbatim: *"On Workers Paid, you will be charged at $0.011 / 1,000 Neurons for any usage above the free allocation of 10,000 Neurons per day."*

| | Free allocation | Pricing |
|---|---|---|
| Workers Free | 10,000 Neurons per day | N/A — Upgrade to Workers Paid |
| Workers Paid | 10,000 Neurons per day | $0.011 / 1,000 Neurons |

- **All limits reset daily at 00:00 UTC.**
- Confirmed again in the [Jul 28, 2026 changelog](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/): *"The Workers Paid plan starts at $5 per month and still includes the 10,000 free Neurons per day allocation, with usage beyond that billed at each model's pricing."*
- Monitor at **Cloudflare dashboard → AI → Workers AI**.
- Docs note pricing is now presented per-model in token units but *"still billing in neurons in the back end."*

### Sample per-model rates (for cost modelling — from the live pricing table)

| Model | Price in tokens | Price in neurons |
|---|---|---|
| `@cf/meta/llama-3.2-1b-instruct` | $0.027 /M in, $0.201 /M out | 2,457 /M in, 18,252 /M out |
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast` | $0.045 /M in, $0.384 /M out | 4,119 /M in, 34,868 /M out |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | $0.293 /M in, $2.253 /M out | 26,668 /M in, 204,805 /M out |
| `@cf/openai/gpt-oss-20b` | $0.200 /M in, $0.300 /M out | 18,182 /M in, 27,273 /M out |
| `@cf/zai-org/glm-4.7-flash` | $0.060 /M in, $0.400 /M out | 5,500 /M in, 36,400 /M out |
| `@cf/moonshotai/kimi-k2.6` | $0.950 /M in, $0.160 /M cached in, $4.000 /M out | 86,364 / 14,545 / 363,636 per M |
| `@cf/zai-org/glm-5.3` | $1.400 /M in, $0.260 /M cached in, $4.400 /M out | 127,273 / 23,636 / 400,000 per M |
| `@cf/baai/bge-m3` (embeddings) | $0.012 /M input tokens | 1,075 /M input tokens |
| `@cf/black-forest-labs/flux-1-schnell` (image) | $0.0000528 per 512x512 tile, $0.0001056 per step | 4.80 neurons/tile, 9.60 neurons/step |

Calibration: 10,000 free neurons/day is small. On `llama-3.1-8b-instruct-fp8-fast` that is roughly **287,000 output tokens/day** (10,000 / 34,868 x 1,000,000) before any charge begins. On `glm-5.3` it is roughly **25,000 output tokens/day**.

---

## (d) Models that CANNOT be billed to the free allocation / require prepaid credits

Verbatim from the pricing page: *"Some models require a paid billing method. This applies to `@cf/moonshotai/kimi-k2.6`, `@cf/moonshotai/kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `@cf/zai-org/glm-5.3`, `@cf/zai-org/glm-5.3-flash`, `@cf/deepseek-ai/deepseek-v4-flash-0731`, and `@cf/deepseek-ai/deepseek-v4-pro-0813`. You can access these models with either the Workers Paid plan or prepaid AI Gateway credits."*

Full list (7 models):

1. `@cf/moonshotai/kimi-k2.6`
2. `@cf/moonshotai/kimi-k2.7-code`
3. `@cf/zai-org/glm-5.2`
4. `@cf/zai-org/glm-5.3`
5. `@cf/zai-org/glm-5.3-flash`
6. `@cf/deepseek-ai/deepseek-v4-flash-0731`
7. `@cf/deepseek-ai/deepseek-v4-pro-0813`

Related, from the [Jul 28, 2026 changelog](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/): on the **Workers Free plan**, requests to `kimi-k2.6`, `kimi-k2.7-code`, and `glm-5.2` return **HTTP `403`, internal error `5035`**, prompting an upgrade.

**Frontier-model rate limits** ([Workers AI Limits](https://developers.cloudflare.com/workers-ai/platform/limits/), last updated Aug 7, 2026) — per account, per model:

| Model | Standard Workers AI billing | Prepaid AI Gateway credits |
|---|---|---|
| `@cf/moonshotai/kimi-k2.6` | 20 req/min | 50 req/min |
| `@cf/moonshotai/kimi-k2.7-code` | 20 req/min | 50 req/min |
| `@cf/zai-org/glm-5.2` | 20 req/min | 50 req/min |

General Workers AI rate limits by task type (these are the *only* automatic throttles under Standard billing): Text Generation **300 req/min**; Text Embeddings **3000 req/min** (`bge-large-en-v1.5` is 1500); Text Classification 2000; Summarization 1500; Image Classification / Object Detection 3000; ASR / Image-to-Text / Text-to-Image / Translation **720 req/min**. Wrangler local-mode inferences count toward these limits.

---

## (e) What happens on Workers Paid when Workers AI exceeds the free daily allocation?

**It is billed per neuron with NO ceiling. It does not stop.**

The pricing page sentence *"All limits reset daily at 00:00 UTC. If you exceed any one of the above limits, further operations will fail with an error"* applies to the **Workers Free** row of the table (Free is listed as *"N/A - Upgrade to Workers Paid"*). The **Workers Paid** row is *"$0.011 / 1,000 Neurons"* — a rate, not a stop. No document anywhere states a daily or monthly neuron ceiling on Workers Paid.

The only things that throttle a runaway loop under Standard billing are the **per-task-type request-per-minute rate limits** above. Those bound *request rate*, not *cost* — 300 text-generation req/min against a 400,000-neuron/M-output-token model is an enormous uncapped daily spend.

### The one configuration that produces a hard ceiling

Sources: [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/) (last updated Aug 7, 2026), [Manage gateways](https://developers.cloudflare.com/ai-gateway/configuration/manage-gateway/) (last updated Aug 7, 2026), [Spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/)

1. **Load prepaid credits.** Dashboard → **AI Gateway** → **Credits Available** → **Manage** → **Top-up credits**. Note: *"A 5% fee is applied to all credits purchased through Unified Billing. For example, a $100 credit purchase will result in a $105 charge."* Provider inference pricing is passed through with no markup.
2. **DO NOT enable auto-top-up.** Auto top-up (**Manage → Setup auto top-up credits**, threshold + recharge amount) automatically replenishes the balance and therefore **destroys the ceiling**. Leave it off.
3. **Set the gateway's Workers AI Billing to Unified billing.** Dashboard → **AI → AI Gateway → select gateway → Settings → Workers AI Billing → Unified billing → Save.** The two documented options are verbatim:
   - *"**Standard billing** charges your Cloudflare account at the end of each billing cycle."*
   - *"**Unified billing** deducts from your prepaid AI Gateway credit balance in real time."*
   Default for a newly auto-created `default` gateway is **Standard billing**.
4. **Route every `env.AI` call through that gateway.** Verbatim: *"Workers AI requests routed through that gateway deduct from your prepaid credit balance in real time. In the AI binding, include the gateway ID in the third argument to `env.AI.run()`."*

   ```typescript
   const resp = await env.AI.run(
   	"openai/gpt-4.1-mini",
   	{
   		messages: [{ role: "user", content: "What is Cloudflare?" }],
   	},
   	{
   		gateway: { id: "my-gateway" },
   	},
   );
   ```

   (Exact snippet from the Unified Billing docs. Gateway ID `default` auto-creates a gateway on the first authenticated request; any other ID must be created first.)
5. **Add spend limit rules on that gateway** (max 20), scoped globally and/or per-user via `user_id` custom metadata.
6. **Also enable gateway rate limiting** as a second, billing-mode-independent hard stop.

**Residual leak in this design**, verbatim from the Unified Billing docs: *"In rare instances, your credit balance may go negative. If this happens, Cloudflare will charge the payment method on file for the outstanding amount. Charges occur at the beginning of each month for the previous month."* Combined with the spend-limit eventual-consistency note, the ceiling is very hard but not absolute.

**Credential precedence** (matters if BYOK keys are ever added): 1) provider key on the request → forwarded unchanged, BYOK and Unified Billing not consulted; 2) BYOK stored key under the `default` alias; 3) Unified Billing with Cloudflare-managed credentials. On Unified Billing endpoints (`env.AI.run()`, `/ai/v1/chat/completions`), **only** the `default`-alias BYOK key prevents fall-through to Unified Billing.

---

## Architecture implications for Golem

- Enabling Workers Paid **alone** does not make uncontrolled AI billing impossible. It makes it *possible*, because it lifts the Free-plan hard stop at 10,000 neurons/day.
- The gate the owner wants is **AI Gateway + Unified billing + spend limits + no auto-top-up**, layered with gateway rate limiting.
- Because AI Gateway spend limits are documented only for Unified Billing and BYOK, **any `env.AI.run()` call in the codebase that omits the `gateway` option is an uncapped billing path.** Treat "no bare `env.AI.run()` calls" as a lint/CI invariant before enabling Paid.
- Non-AI dimensions (Workers requests/CPU, D1 rows, KV ops, DO duration, Vectorize dimensions) have **no hard cap of any kind** and must be bounded in application code (per-user quotas in D1/KV/DO, Turnstile/auth in front, WAF rate limiting rules) — Cloudflare offers no platform control for these beyond alerts.
- Set a budget alert well below pain threshold anyway (default is $10). Accept the ~24h reporting lag and the exclusion of the $5 subscription fee from the threshold math.

---

## UNVERIFIED / open questions

- **Do AI Gateway spend limits enforce on Workers AI requests routed through a gateway that is still on *Standard billing*?** UNVERIFIED. The spend-limits page states scope as *"Unified Billing requests and BYOK requests for models with known pricing"* and never mentions Workers AI standard billing. Assume **NO** until confirmed; do not rely on it.
- **What exactly happens to a Workers AI request when the Unified Billing credit balance reaches $0?** UNVERIFIED — no doc states the error code or whether it falls back to Standard billing / Workers-plan neuron billing. Must be tested empirically before trusting the ceiling.
- **Exact selectable time-window durations for spend limit rules.** UNVERIFIED — docs say "rolling or fixed time window"; changelog examples use per-day budgets.
- **Whether Workers AI neuron overage is included in the account-wide "usage-based spend" figure that budget alerts evaluate.** UNVERIFIED — Workers AI is *not* listed in the usage-based-billing product table (which lists Workers, R2, Argo, Cache Reserve, Load Balancing, Stream, Images, Spectrum, Rate Limiting, Log Explorer, Zero Trust, Vectorize, Analytics Engine).
- **Whether an account-level setting can force ALL Workers AI traffic through a specific gateway** (so a forgotten bare `env.AI.run()` cannot bypass the cap). UNVERIFIED — no such setting documented; enforcement appears to be per-call.
- **Exact API endpoint/body shape for creating spend limit rules.** UNVERIFIED — docs say "via the API" without showing the schema for spend-limit rules specifically.
- **Whether the $10 default budget alert already exists on account `e9b8acf2e89a1de289a1ee4abb0f3f8d`.** Not checkable from docs; rollout was in cohorts. Verify in the dashboard.

---

## Sources

- [Budget alerts · Cloudflare Billing docs](https://developers.cloudflare.com/billing/manage/budget-alerts/) — updated May 29, 2026
- [Monitor billable usage · Cloudflare Billing docs](https://developers.cloudflare.com/billing/manage/billable-usage/) — updated Jun 30, 2026
- [Usage-based billing · Cloudflare Billing docs](https://developers.cloudflare.com/billing/understand/usage-based-billing/) — updated May 29, 2026
- [Budget alerts now on by default for Pay-as-you-go accounts · Changelog](https://developers.cloudflare.com/changelog/post/2026-06-15-budget-alerts-default-on/) — July 20, 2026
- [Introducing Billable Usage dashboard and Budget alerts · Changelog](https://developers.cloudflare.com/changelog/post/2026-04-13-billable-usage-dashboard-and-budget-alerts/)
- [Billable usage and budget alerts now in product sidebars · Changelog](https://developers.cloudflare.com/changelog/post/2026-06-04-billable-usage-product-sidebar/)
- [Pricing · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/pricing/) — updated Aug 28, 2026
- [Pricing · Cloudflare Workers AI docs](https://developers.cloudflare.com/workers-ai/platform/pricing/) — updated Aug 28, 2026
- [Limits · Cloudflare Workers AI docs](https://developers.cloudflare.com/workers-ai/platform/limits/) — updated Aug 7, 2026
- [Spend limits · Cloudflare AI Gateway docs](https://developers.cloudflare.com/ai-gateway/features/spend-limits/) — updated Aug 17, 2026
- [Unified Billing · Cloudflare AI Gateway docs](https://developers.cloudflare.com/ai-gateway/features/unified-billing/) — updated Aug 7, 2026
- [Manage gateways · Cloudflare AI Gateway docs](https://developers.cloudflare.com/ai-gateway/configuration/manage-gateway/) — updated Aug 7, 2026
- [Rate limiting · Cloudflare AI Gateway docs](https://developers.cloudflare.com/ai-gateway/features/rate-limiting/) — updated Jun 5, 2026
- [Control AI costs with spend limits · Changelog](https://developers.cloudflare.com/changelog/post/2026-06-05-spend-limits/) — June 5, 2026
- [Workers AI and AI Gateway unify model access and billing · Changelog](https://developers.cloudflare.com/changelog/post/2026-08-07-workers-ai-unified-billing/) — Aug 7, 2026
- [Select models now require the Workers Paid plan · Changelog](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/) — July 28, 2026
- [Your AI bill is out of control. Cloudflare can fix it now. · Cloudflare Blog](https://blog.cloudflare.com/ai-gateway-spend-limits/) — June 5, 2026
