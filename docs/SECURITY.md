# StudPilot — security review (2026-08-30)

This is a record of a real adversarial audit of the deployed service, not a checklist. Four
reviewers worked disjoint threat dimensions against the actual source; every claimed finding was
then handed to an independent agent whose job was to **refute** it. 26 raw findings → 16 verdicts
rendered, and the confirmed ones were fixed and re-tested against the live deployment.

## Design properties that hold

- **The worker holds no auth secret.** Supabase JWTs are verified against the project's public
  JWKS (ES256). Compromising the worker yields no ability to mint sessions.
- **The worker never uses a service-role key.** Every database call travels with the *user's own*
  JWT through PostgREST, so Postgres RLS is the enforcement point, not application code.
- **Update 2026-10-05: those two properties now have one stated exception.** Sign in with Roblox needs
  to create users and mint sign-in tokens, and Roblox gives no email, so when `SUPABASE_SECRET_KEY` is set
  the worker holds a Supabase secret key. It is used in `apps/worker/src/roblox-oauth.ts` and nowhere
  else, for Auth admin calls (create a user, read a user's address, mint a one-time sign-in token, and, since
  2026-10-05 (owner decision D-14), delete a user when that person deletes their account and clear the Roblox id
  and username from a user whose Roblox grant was lost), and for one table call: the PATCH that clears a Roblox
  username from a profile's display name. The worker still signs no JWT: Supabase issues the session. With the key
  unset the routes answer 503 and the two properties above hold as written. The reasoning and the
  rejected alternatives are in `planning/proof/M2/ROBLOX-SIGNIN.md`.
- **Defence in depth on tenancy.** Ownership is checked in the worker *and* by RLS *and* by the
  Durable Object's owner binding. Verified live: cross-tenant reads return 404, cross-tenant
  WebSocket upgrades are rejected, and a cross-tenant PostgREST select returns 0 rows
  (see `docs/LOAD-TEST.md`, executed under 30-user concurrency).

## Confirmed findings and their fixes

| # | Finding | Impact | Fix |
|---|---|---|---|
| 1 | **Quoted `tool_call` fences were re-parsed in native-tool mode** (`gateway.ts`). Tool results carry untrusted content — script sources, Studio logs. A model *quoting* a fence found in that content turned it into an executed `run_luau` call in the victim's Studio. | prompt-injection → code execution | Removed the fence-parsing fallback entirely; fences are parsed **only** for models without native tool calling, where no untrusted text is echoed back as a tool result. |
| 2 | **Headless `StudPilotPairingCode` pairing** (`init.server.luau`) — a script resident in *any* place could drop a `StringValue` and silently re-point the user's Studio at an attacker's project. I had added this myself as a dev convenience. | zero-click Studio takeover | Now gated behind an explicit per-machine opt-in setting (off by default), never re-points an active session, and warns loudly when used. |
| 3 | **Clients could choose a project's primary key** (RLS insert). A released project UUID could be re-registered by a different user and inherit that project's Durable Object. | cross-tenant session hijack | `force_project_id` BEFORE INSERT trigger overrides `id` with `gen_random_uuid()` and pins `owner_id` to `auth.uid()`. |
| 4 | **Durable Objects addressed by the raw path parameter.** Casing/encoding variants of one UUID mapped to unbounded distinct DOs. | quota exhaustion, split state | DOs are addressed by the canonical row id from the database; the path parameter is UUID-validated first, and a failed `/init` owner check now refuses the request. |
| 5 | **`/api/studio/poll` was unauthenticated at the edge** and materialized a Durable Object for any attacker-chosen id. | free-tier exhaustion | Token shape (UUID + 48-hex secret) is validated before any storage is touched, plus per-IP rate limiting. Verified: malformed → 401. |
| 6 | **`/api/docs/search` ran unmetered Workers AI embeddings** for any signed-in user. | unbounded inference spend | Now costs 1 Credit and is served from the same per-user quota ledger as chat. |
| 7 | **Edge-cache poisoning** via tab/CR/LF in the request path (`static.ts`), and an uncaught `URIError` on malformed `%`-encoding returning 500. | cache poisoning of the SPA bundle; error amplification | Control characters, `..`, and over-long paths are rejected with 400; decoding is wrapped. Verified live. |
| 8 | **Anonymous writes to `feedback`** were accepted with only the public anon key. | spam into the tenant database | Policy scoped `to authenticated` with `auth.uid() = owner_id`. Verified: anon insert → 401. |
| 9 | **Plugin tokens never expired**, and comparison was not constant-time. | stolen token usable forever | 30-day TTL with re-pair required, and a constant-time hash comparison. A new pairing supersedes the old token. |
| 10 | **The user's raw JWT was persisted in DO storage.** | blast radius on any future storage-exposure bug | Kept in memory for the DO instance's lifetime only; never written to durable storage. |
| 11 | **Unbounded agent transcript and checkpoint size.** | runaway token cost; DO write failures | Transcript trimmed to 120k chars (system prompt preserved); snapshots over 12 MB refused with a clear message. |
| 12 | **Memory distillation ran an unmetered extra model call** after every run. | quota bypass | Metered at 1 Credit and only runs after substantive runs. |

## Accepted risks (documented, not fixed)

- **A well-formed but invalid plugin token still instantiates an empty Durable Object.** Cloudflare
  has no "does this DO exist" probe. The DO writes nothing before the token check fails, is evicted
  quickly, and the endpoint is UUID-gated plus IP-rate-limited. Cost is bounded by the free DO
  request allowance; a KV existence check would cost more reads than it saves.
- **`run_luau` has no true timeout.** Luau cannot preempt a tight loop from outside, so an injected
  infinite loop would hang the user's Studio until they restart it. Mitigated by removing the
  injection path (finding 1); a real fix needs an engine capability that does not exist today.
- **Free accounts are unlimited.** Signup is email+password with no card. The spend ceiling is
  enforced per user by the Credits ledger, and globally by Cloudflare's own daily neuron allocation,
  which fails closed rather than billing. Turnstile is the next lever if abuse appears.

## Abuse boundaries on the agent itself

The agent may only act through the typed op protocol in `packages/shared` — there is no shell, no
arbitrary HTTP, and no filesystem. Every mutating op is wrapped in a `ChangeHistoryService`
recording, so any action is undoable in Studio, and builder modes take an automatic checkpoint
first. Destructive ops refuse to touch `Terrain`, `Camera`, or `game` itself.
