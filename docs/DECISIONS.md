# Golem — Architecture Decision Record (living)

Mission: public, production-quality AI SaaS that takes a Roblox game from idea to working experience.
Constraints: ~$5/mo recurring, server-side inference only, independent commercially-usable open-weight AI core,
no paid-per-token API dependency, no dependency on the dev Mac, tens of concurrent users at launch.

## ADR-001 — Brand: "Golem"
The golem is a builder animated by words — exactly what the product is. Friendly to young creators
(Minecraft golem association), serious enough for professionals. Company handle: Golem Labs.
Tagline: "Describe it. Golem builds it in Studio."
AI modes (user-facing, hide implementation): **Clay** (fast conversational edits), **Stone** (standard
builder agent), **Rune** (deep agent: plan → build → verify → fix). Modes map internally to model+
routing+tool policies, not to single models.

## ADR-002 — Platform: Cloudflare Workers as the spine
- One Worker (Hono) serves: marketing site (static), app SPA (static), REST/WS API under /api.
- **Durable Objects** (free tier, SQLite-backed) — one per active project session: WebSocket to the
  browser, HTTP long-poll command queue for the Studio plugin (Studio HttpService has no WebSocket).
- **Workers AI** — server-side open-weight inference (Qwen2.5-Coder-32B Apache-2.0 class, gpt-oss,
  Llama 3.3, bge-m3 embeddings, vision model for screenshot review). Free daily neuron allocation;
  hard per-user quotas keep cost at $0–5/mo. Optional opportunistic providers (HF Inference, Groq)
  behind a gateway with circuit breakers — product functions if they vanish.
- **Vectorize + D1** — hybrid RAG (vector + FTS5) over the Roblox creator-docs corpus (CC-BY-4.0).
- **R2** — checkpoint blobs, uploads, generated assets.
Rationale: everything in one vendor's generous free tier, commercial use allowed on free plan,
zero cold-start ops burden, and the $5 Workers Paid plan is the single justified overage lever.

## ADR-003 — Data & auth: Supabase
Free-tier Postgres + Auth (email/password). Tenant isolation via RLS on every table; the Worker
verifies Supabase JWTs (JWKS) and additionally scopes every query by user id. App data: users,
projects, sessions, messages, checkpoints metadata, usage ledger, feedback. Private project data is
never used for training; a separate explicit opt-in table gates any future contribution program.

## ADR-004 — Studio integration: real plugin, typed op protocol
Luau plugin ("Golem for Studio"), developed with Rojo, built to .rbxm. Pairing: user gets short-lived
code in web app → plugin exchanges it for a scoped session token. Plugin long-polls the project DO,
executes typed ops (read/search scripts, edit scripts via ScriptEditorService, create/modify instances
+ properties, DataModel tree snapshots, selection, terrain ops, playtest hooks, log capture,
screenshot if API allows), reports results. ChangeHistoryService recording around every op batch =
native undo; server-side checkpoints in R2 = restore across sessions.
Validated against actual Roblox Studio via the local Studio MCP during development.

## ADR-005 — AI strategy: measure, don't vibe
Roblox-specific eval suite (Luau correctness, API knowledge, project comprehension, debugging, tool
use, multi-file edits, long tasks, failure recovery) in `packages/evals`. Baseline candidate
open models on Workers AI → add RAG → routing → (LoRA only if evals justify it; Workers AI supports
BYO LoRA on select bases). Every claimed improvement ships with baseline-vs-candidate numbers.
Training data: only license-compatible sources (creator-docs CC-BY-4.0, permissively-licensed OSS
Luau, official API dump, synthetic self-generated). Provenance tracked in docs/research/provenance.md.

## ADR-006 — Business model: free tier with hard quotas, Pro later
Free: daily "Sparks" energy quota sized so worst-case usage stays inside the free/paid-plan neuron
allocation; queueing + per-user rate limits; abuse caps. Pro tier designed (higher quota, priority
queue, more checkpoints) but launches as waitlist — no payment processing at v1, so no card risk and
no per-user subsidy. Revenue switch-on is a config change, not a rebuild.

## ADR-007 — Monorepo
pnpm workspaces: `apps/worker` (Hono API + DO + serves static), `apps/web` (Vite React SPA),
`apps/site` (Astro marketing), `apps/plugin` (Rojo/Luau), `packages/shared` (types, op protocol),
`packages/evals`, `packages/corpus` (RAG build pipeline), `infra` (SQL migrations, wrangler config).

## ADR-008 — No purchases without approval
Everything targets $0 tiers. The only candidate charges (one-time GPU for LoRA training; Workers
Paid $5/mo if free neurons prove insufficient) are presented to the owner for explicit approval first.

## ADR-009 — Zero-secret data plane (R2 pivot)
R2 requires dashboard enablement + card on file → rejected for v1. Blob store = per-project
Durable Object SQLite (messages, gzipped checkpoints, op logs). Supabase keeps auth + registry
(profiles/projects/feedback/waitlist) accessed ONLY with the user's own verified JWT + anon key +
RLS — the Worker never holds a service-role key. Supabase project npqvyijsvzkuwddyhtpm uses
asymmetric ES256 signing keys; Worker verifies via JWKS (cached). Quota = per-user QuotaDO
(authoritative sparks ledger, daily reset). Pairing codes = singleton PairingDO (KV free tier
allows only 1k writes/day, so KV is reserved for JWKS/config cache).
Provisioned: D1 golem-corpus 32c9471e-a7d7-49ee-a8fe-0a7def2c68bd, KV cc341a7db4d748139f161fdc292e6e84,
Vectorize golem-docs (1024d cosine; may recreate at 384d pending free-tier stored-dims check),
CF account e9b8acf2e89a1de289a1ee4abb0f3f8d, workers.dev subdomain moshe-barami111 (rename = user
decision, breaks 2 existing worker URLs). Corpus embedding runs through an admin-gated worker
endpoint (AI binding) so no raw CF API token is ever needed locally.
