# The Cloudflare surface, read off the account — 2026-09-21

The owner's ask: *"אתה בנוסף תסקור את כל האפשרויות האלה שצילמתי בcloudflare ותראה אם אתה יכול
להשתמש בכל אחד ממש אני רוצה שתנצל את cloudflare ותוכנות אחרות"* — review every Cloudflare product
he screenshotted and say, for each, whether it can be used.

**Every row below is read from the API, not from the wrangler config.** That distinction is the
point of the file: a binding in `wrangler.apple.jsonc` says what the code asks for, and the account
says what exists. Where the API token has no permission for a product, the row says **COULD NOT
MEASURE** and nothing else. A missing permission is not an absence of the product.

Read with `CLOUDFLARE_API_TOKEN` against `/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/…`.

## Provisioned and in use

| product | what is there | verdict |
|---|---|---|
| **Workers** | 5 scripts: `apple` (2026-09-21), `golem` (2026-09-20), and three unrelated — `fizzy-game-ai`, `dry-salad-ac0b`, `spinrewriter-bridge` | **ADOPTED.** `apple` is the product. See the note on `golem` below. |
| **Durable Objects** | 12 namespaces — `SessionDO`, `AdminDO`, `PairingDO`, `QuotaDO`, `BudgetDO`, `DiscordDO`, once under `apple` and once under `golem` | **ADOPTED**, and load-bearing: BudgetDO is the only spend guard, because the AI Gateway is on Standard with uncapped overage. |
| **D1** | one database, `golem-corpus`, **556,875,776 bytes** (531 MiB) | **ADOPTED.** Serves the corpus and the static site. Half a gigabyte is worth watching: it is a real fraction of the per-database ceiling and nothing in the repo tracks its growth. |
| **KV** | one namespace, `golem-kv` | **ADOPTED.** |
| **R2** | one bucket, `apple-media`, created 2026-09-19 | **ADOPTED.** |
| **Vectorize** | one index, `golem-docs`, 384 dimensions, cosine | **ADOPTED.** 384 dims is a small-embedding index; it matches the retrieval work in `packages/training`. |
| **Workers AI** | the inference path for every model lane | **ADOPTED.** |
| **AI Gateway** | two gateways — `golem` (logs on, cache_ttl 0, rate limit 200) and `default` (logs on, no rate limit) | **ADOPTED, with one thing to decide.** `cache_ttl: 0` is deliberate; the repo has a gate asserting response caching stays off on agent calls. The `default` gateway has **no rate limit** and is the one a stray call would land on. |

## Provisioned, not this product

| product | what is there | verdict |
|---|---|---|
| **Pages** | one project, `spin`, at `spin-b6q.pages.dev` | **NOT OURS.** The product's static site is served by the worker out of D1, not by Pages. Left alone. |
| Workers (three of the five) | `fizzy-game-ai`, `dry-salad-ac0b`, `spinrewriter-bridge` | **NOT OURS.** Not touched, not deleted, not renamed. |

## Available and deliberately empty

| product | measured | verdict |
|---|---|---|
| **Queues** | 0 | **REJECTED for now.** Nothing in the build loop is fire-and-forget; a build is a live session the user is watching, and a queue between the request and the model would add a hop without removing one. Revisit if batch corpus work moves off the laptop. |
| **Workflows** | 0 | **CANDIDATE, not adopted.** A multi-step build with retries is exactly Workflows' shape, and the agent loop currently keeps its own state in a Durable Object. Moving it is a rewrite of the busiest path in the product for a durability guarantee the DO already gives. Not tonight, and not without a measurement that the DO loses runs. |
| **Turnstile** | 0 widgets | **CANDIDATE, blocked on a decision that is not technical.** One real signup is owner-blocked; there is no abuse to measure yet, and adding a challenge to a funnel with no users is optimising the wrong end. |
| **Hyperdrive** | 0 configs (permission check passed on the endpoint in one token, failed in another — see below) | **REJECTED.** There is no external Postgres in the hot path. Supabase is reached over HTTP. |

## COULD NOT MEASURE — the token lacks the permission

These returned `Authentication error` with the same token that read everything above. That is a
statement about the token, **not about the product**, and it must not be written up as "not used":

- Images
- Stream
- Browser Rendering
- Calls / Realtime
- Email Routing
- Workers Observability telemetry keys (the endpoint did not return JSON at all)
- Workers for Platforms dispatch namespaces (`You do not have access to dispatch namespaces`) — this
  one is an entitlement message rather than a token scope, so it is closer to a real answer, but it
  came from the API rather than from the dashboard and is recorded as what it is.

To close these rows, mint a read-only token with Account → *Images: Read*, *Stream: Read*,
*Browser Rendering: Read*, *Email Routing: Read* and re-run. `CLOUDFLARE_API_TOKEN_READ_ALL` in
`.env` did **not** work — it returned `Authentication error` on every endpoint including ones the
main token reads fine, so despite its name it is not a read-all token.

## The one operational finding

`golem` still owns six live Durable Object namespaces: `golem_SessionDO`, `golem_AdminDO`,
`golem_PairingDO`, `golem_QuotaDO`, `golem_BudgetDO`, `golem_DiscordDO`. **Deleting that worker
would take their storage with it.** That is an argument the `two-live-workers` decision did not have
in front of it when it chose "redirect, do not delete" — and it makes the choice more clearly right
than the reasoning recorded at the time. Probed the same day: `golem`'s page routes 308 to `apple`
and its `/api` still answers 200. See `docs/evidence/legacy-host-2026-09-21.md`.
