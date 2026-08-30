# Cloudflare Developer Platform — Free-Tier Limits (verified 2026-08-30)

Research for **Golem** (AI SaaS building Roblox games; web app + Studio plugin) targeting ~$5/month total cost on Cloudflare Workers + Workers AI + Supabase.

All numbers below were fetched from official Cloudflare docs pages on 2026-08-30. Free-plan limits are **hard caps** — operations fail (429s) when exceeded; there is no overage billing on the Free plan.

---

## 1. Workers (compute) — Free plan

| Metric | Workers Free | Workers Paid ($5/mo) |
|---|---|---|
| Requests | **100,000 / day** (resets 00:00 UTC) | 10 million / month included, then $0.30/million |
| CPU time per invocation | **10 ms** | 30 s default, configurable to 5 min; 30M CPU-ms/month included, then $0.02/million CPU-ms |
| CPU per Cron Trigger | 10 ms | 30 s (<1 h schedule) / 15 min (≥1 h schedule) |
| Memory per isolate | 128 MB | 128 MB |
| Worker size (gzip) | 3 MB | 10 MB |
| Workers per account | 100 | 500 |
| Subrequests per invocation | 50 | 10,000 |
| Simultaneous open connections | 6 | 6 |
| Env vars per Worker | 64 (5 KB each) | 128 (5 KB each) |

- Wall-clock duration is unbilled/unlimited on both plans (CPU time is what's metered) — important for long-lived WebSocket proxying and streaming AI responses.
- WebSockets are supported on the Free plan; an accepted WebSocket costs 1 request against the daily cap.

## 2. Static assets (Workers Assets)

- **Requests to static assets are free and unlimited on ALL plans** — they do NOT count against the 100k/day request cap ("Requests to static assets are free and unlimited"). Storage of assets is also free.
- Caveat: routes configured with `run_worker_first` invoke the Worker script and DO count against the request cap.
- File limits per Worker version: **20,000 files (Free) / 100,000 (Paid), 25 MiB max per file** (both plans).
- Practical implication: Golem's web-app frontend can be served entirely free; only API/DO traffic burns the 100k/day.

## 3. Durable Objects — available on Free plan (SQLite backend only)

| Metric | Free | Paid |
|---|---|---|
| Backend | **SQLite-backed DOs only** | SQLite + key-value backends |
| DO requests | **100,000 / day** | 1 million / month included, then $0.15/million |
| Duration | **13,000 GB-s / day** | 400,000 GB-s / month included, then $12.50/million GB-s |
| SQLite rows read | **5 million / day** | 25 billion / month included, then $0.001/million |
| SQLite rows written | **100,000 / day** | 50 million / month included, then $1.00/million |
| SQLite storage | **5 GB total per account** (~max 1 GB/object effective; 10 GB/object on Paid) | 5 GB-month included, then $0.20/GB-month; unlimited account total |
| DO classes per account | 100 | 500 |
| CPU per request | 30 s default, configurable to 5 min | same |

**WebSockets on DOs (Free plan — key for the Studio-plugin ↔ web-app link):**
- Supported on Free. Incoming WebSocket messages are billed at a **20:1 ratio** (20 incoming messages = 1 DO request, charged against the 100k/day). The initial connection = 1 request. Outgoing messages incur no request charge.
- **WebSocket Hibernation API is available and duration (GB-s) charges do NOT accrue during hibernation** — clients stay connected while the DO is evicted from memory. Use hibernation or idle DOs will eat the 13,000 GB-s/day (a DO pinned in memory 24 h at 128 MB = ~11,059 GB-s/day, nearly the whole budget).
- Hibernation `setWebSocketAutoResponse` (ping/pong) messages incur no duration charge.
- WebSocket message size limit: **32 MiB (received messages only)**. Serialized hibernation attachments: 16,384 bytes max. No documented hard cap on concurrent WebSocket connections per DO ("thousands of clients per instance"; memory-bound at 128 MB). Outbound WebSocket connections keep a DO awake (no hibernation) for up to 15 min.
- Note: SQLite storage billing (rows/GB) became active January 2026 — the free daily row caps above are now enforced.

## 4. D1 (serverless SQLite) — Free plan

| Metric | Free | Paid |
|---|---|---|
| Rows read | **5 million / day** | 25 billion / month, then $0.001/million |
| Rows written | **100,000 / day** | 50 million / month, then $1.00/million |
| Total storage | **5 GB / account** | 1 TB; first 5 GB free, then $0.75/GB-month |
| Max DB size | **500 MB (Free)** | 10 GB |
| Databases per account | 10 | 50,000 |
| Queries per Worker invocation | 50 | 1,000 |
| Time Travel restore window | 7 days | 30 days |

Other (both plans): 100 columns/table, 2 MB max row/blob, 100 KB max SQL statement, 30 s max query duration, 6 simultaneous D1 connections per Worker.

## 5. Vectorize — available on Free plan

| Metric | Free | Paid |
|---|---|---|
| Queried vector dimensions | **30 million / month** (hard cap) | 50 million / month included, then $0.01/million |
| Stored vector dimensions | **5 million** (hard cap) | 10 million included, then $0.05/100 million |
| Indexes per account | 100 | 50,000 |

Both plans: max **1536 dimensions per vector** (fp32), 20M vectors/index max, 10 KiB metadata/vector, 10 metadata indexes per index, topK ≤ 50 with values/metadata (≤ 100 without). Example: 768-dim embeddings → ~6,510 vectors stored free; each query burns 768 × topK-scan dimensions from the monthly query budget.
(Note: the Workers pricing page's product table phrases Vectorize availability confusingly, but the Vectorize pricing page has an explicit Workers Free row with the numbers above.)

## 6. R2 (object storage) — free tier is monthly, account-wide, Standard class only

- Storage: **10 GB-month / month free**, then $0.015/GB-month
- Class A ops (writes/lists): **1 million / month free**, then $4.50/million
- Class B ops (reads): **10 million / month free**, then $0.36/million
- **Egress: $0 — always free**
- Infrequent Access class has no free tier ($0.01/GB-mo, retrieval $0.01/GB, 30-day minimum).
- R2 free tier does NOT require the $5 Workers Paid plan (separate product; a card on file may be required to enable R2).

## 7. Workers KV — Free plan

- Reads: **100,000 / day** | Writes: **1,000 / day** | Deletes: **1,000 / day** | List ops: **1,000 / day** | Storage: **1 GB**
- Same key: max 1 write/second (both plans). Key ≤ 512 B, value ≤ 25 MiB.
- Paid: 10M reads, 1M writes/deletes/lists per month included; $0.50/million reads, $5.00/million writes over.
- The 1,000 writes/day cap is the sharpest KV constraint — use DO storage or D1 for anything write-heavy.

## 8. Queues — works on Free plan

- Free plan: **10,000 operations / day** included (an operation = each 64 KB written/read/deleted; a message touched by producer + consumer + delete ≈ 3 ops).
- Free-plan restriction: **message retention fixed at 24 hours** (Paid: configurable up to 14 days).
- Paid: 1M operations/month included, then $0.40/million.
- Both plans: 10,000 queues/account, 128 KB max message, 5,000 msg/s per queue, 100 messages max batch, 25 GB backlog per queue.

## 9. Cron Triggers — Free plan

- Available on Free: **5 Cron Triggers per account** (Paid: 250).
- Scheduled handler CPU: **10 ms on Free** (Paid: 30 s, or 15 min for schedules ≥ 1 h apart). 10 ms is tight — a free-plan cron can realistically only enqueue work or ping a DO.

## 10. Workers Logs (observability)

- Free: **200,000 log events / day, 3-day retention**.
- Paid: 20 million events/month included, then $0.60/million; 7-day retention.
- Account safety valve: >5 billion logs/day triggers automatic 1% sampling. `head_sampling_rate` (0–1) configurable. Max 256 KB per log.

## 11. Turnstile (CAPTCHA alternative) — free

- Free for everyone (no Workers plan needed): **up to 20 widgets, 10 hostnames per widget, unlimited challenges**, all widget types (managed/invisible), pre-clearance, 7-day analytics.
- Enterprise (contact sales): unlimited widgets, 200 hostnames/widget, wildcard/any-hostname, ephemeral IDs, off-label branding, 30-day analytics.
- siteverify API: no documented quota/charge (UNVERIFIED: no explicit "unlimited" statement found, but no limit is published).

## 12. Rate-limiting bindings

- Configured via `[[ratelimits]]` in wrangler config (requires **Wrangler ≥ 4.36.0**); `period` must be **10 or 60 seconds**; counters are per-Cloudflare-location and eventually consistent.
- No pricing is listed in the docs (feature has no metered billing). The docs page no longer carries an "open beta" banner and states no plan gate. **UNVERIFIED:** an explicit "available on Free plan" statement — docs simply don't restrict it; community usage on free plan is widely reported.

## 13. Workers AI on the Free plan

- **Yes, Workers AI bindings work on Workers Free**: **10,000 Neurons/day free** (resets 00:00 UTC). On Free, usage hard-stops at the allocation (no overage possible); Paid unlocks $0.011 / 1,000 Neurons beyond it.
- Neuron burn varies hugely by model (e.g. ~1,542 neurons/M input tokens for the smallest LLMs up to ~443,756 neurons/M output tokens for DeepSeek R1). Some premium open-weight models (Kimi, GLM, DeepSeek families) **require the Paid plan or prepaid AI Gateway credits even within the free allocation**.

## 14. Custom domains: workers.dev vs Pages

- Every Worker gets a free `<name>.<subdomain>.workers.dev` URL; Cloudflare treats workers.dev as a "Free website" for hobby use and recommends custom domains for production.
- **Workers Custom Domains and Routes work on the Free plan** — requirement is an active Cloudflare zone you own (no CNAME conflict), not a paid Workers plan. No documented cap on number of custom domains per Worker.
- Pages Free: **100 custom domains per project**, 500 builds/month, 100 projects/account, 20,000 files, 25 MiB/file. (Cloudflare is steering new projects to Workers static assets; Pages is maintenance-mode.)

## 15. What actually REQUIRES the $5 Workers Paid plan

- CPU > 10 ms per invocation (the single most likely forcing function for an AI backend doing JSON assembly/validation).
- More than 100k Worker requests/day or 100k DO requests/day.
- Durable Objects **key-value backend** (SQLite DOs are free-plan-eligible).
- D1 DBs > 500 MB, > 5M rows read/day, > 100k rows written/day.
- KV > 1,000 writes/day.
- Workers Trace Events Logpush (10M/month included on Paid, $0.05/million after).
- Cloudflare Containers (no free tier).
- Queues retention > 24 h; > 10k queue ops/day.
- Workers AI beyond 10k neurons/day; certain premium models (Kimi/GLM/DeepSeek) even below it.
- Higher cron CPU (30 s vs 10 ms) and 250 cron triggers.

## Golem-specific read

1. The **10 ms CPU cap** is the real free-plan wall for an AI orchestration backend — network wait on Workers AI/Supabase doesn't count, but JSON parsing of large Luau codegen payloads does. The $5 Paid plan (30 s CPU, 10M req, 30M CPU-ms) is almost certainly where Golem lands, and it fits the $5/mo budget exactly.
2. On Paid, everything else (DO for plugin WebSocket sessions with hibernation, D1 or Supabase for data, R2 for asset storage with free egress, Vectorize for RAG over Roblox docs, Turnstile free, Queues, Logs) stays within included allocations at early-stage scale — realistic marginal cost $0.
3. Use **DO WebSocket Hibernation** for the Studio plugin connection or the 13k GB-s/day duration budget dies with ~1 always-resident DO.
4. Supabase free tier covers Postgres/auth independently of all the above.

---

## Sources

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Static assets billing: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Durable Objects limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- DO WebSockets/hibernation: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Vectorize pricing: https://developers.cloudflare.com/vectorize/platform/pricing/
- Vectorize limits: https://developers.cloudflare.com/vectorize/platform/limits/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- KV pricing: https://developers.cloudflare.com/kv/platform/pricing/
- KV limits: https://developers.cloudflare.com/kv/platform/limits/
- Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/
- Queues limits: https://developers.cloudflare.com/queues/platform/limits/
- Workers Logs: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- Turnstile plans: https://developers.cloudflare.com/turnstile/plans/
- Rate limiting binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Custom domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- workers.dev routing: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
