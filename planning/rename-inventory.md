# Full rename to StudPilot: inventory and rules (2026-10-04)

**Owner directive (2026-10-04):** rename the product completely to **StudPilot**, everywhere: the code, every platform (Cloudflare, Supabase, Sentry, GitHub, Discord, Roblox, Stripe) and the docs. The unfinished golem→Apple rename gets finished in the same pass.

**How the inventory was made:**
- Cloudflare and Supabase: read live through their MCP tools today.
- Code: counted on branch `handoff/research-feed`.
- Sentry: org and project names were **not readable** from this session. Claude Code reads them first.

## What exists today (measured)
| Where | Current name | Can it be renamed in place? | Plan |
|---|---|---|---|
| Cloudflare Worker (production) | `apple` (custom domain `studpilot.app` now attached) | **No.** A new script name means new, empty Durable Object namespaces | New Worker `studpilot`. Migrate DO data (SessionDO = projects and chats; QuotaDO; PairingDO; AdminDO; BudgetDO; DiscordDO) or bridge it with `script_name` bindings, then move the domain. Prove it by matching record counts. |
| Cloudflare Worker (old) | `golem` (still deployed; `LEGACY_QUOTA_DO` still points at it) | n/a | Fold in or migrate its QuotaDO data, then delete the Worker |
| Cloudflare Worker (probe) | `apple-cf-probe` | n/a | Delete |
| D1 database | `golem-corpus` (1.27 GB) | **No** | Create `studpilot-corpus`, export and import, verify row counts, switch the binding, delete the old one after 7 days |
| Vectorize index | `golem-docs` | **No** | Create `studpilot-docs`, re-insert the vectors, verify the count and one search |
| R2 bucket | `apple-media` | **No** | Create `studpilot-media`, copy the objects, verify the counts, switch, delete later |
| KV namespace | `golem-kv` | **Yes** (title only; the ID stays) | Rename the title to `studpilot-kv` |
| Queue | `apple-notifications` | **No** | Create `studpilot-notifications`, drain the old one, switch |
| Analytics Engine | `apple_product_events` | **No** (new name = new dataset) | New `studpilot_product_events`. The old history stays readable |
| Workflow | `apple-model-upload` | **No** | Redeploy as `studpilot-model-upload` |
| workers.dev URLs | `apple.moshe-barami111…`, `golem.moshe-barami111…` | n/a | 301-redirect to `studpilot.app` for 90 days, then remove |
| Supabase project | `AppleAI` (ref `npqvyijsvzkuwddyhtpm`) | **The name, yes. The ref and URL, no** | Rename to `StudPilot`; update the Auth site URL, redirect list, email templates and sender name. The `…supabase.co` URL stays; a custom auth domain is a paid add-on, so the owner decides |
| Sentry | org and project unknown here | Slugs can be renamed; the DSN is unchanged | Rename to `studpilot`; release names `studpilot@…` |
| GitHub | `MosheBarami/Apple` (public) | **Yes** (GitHub redirects old URLs) | Rename the repo to `StudPilot`; update the remotes, badges, CI and workflow names |
| Discord | app, bot and server branded "Apple" | Yes | Rename the app and bot to StudPilot; new avatar |
| Roblox | OAuth app = StudPilot (done). Plugin and Creator Store listing "Apple Studio" (deferred) | Plugin name yes | Rename the plugin in its source and manifest now; the store listing waits until the bar passes |
| Stripe (test mode) | Apple products | Yes | Rename products and the statement descriptor |
| Code | **1,450 files with 9,251 "apple" hits**; **132 files with 656 "golem" hits** | Yes | 10 packages `@apple/*` → `@studpilot/*`; env `APPLE_*` → `STUDPILOT_*`; config file `wrangler.apple.jsonc`; the plugin↔Worker wire protocol (accept both spellings for one release, as golem→apple did with `compat: wire-both`); UI copy, page titles (the site title still says "Apple — build Roblox games inside Studio"), logos and favicons |
| Docs and agent files | `AGENTS.md`, `CLAUDE.md`, README, planning docs, Claude Code mods, memory notes | Yes | Rewrite them. Keep the history files (`docs/autonomy/`, ADRs) unchanged, with a one-line note "Apple and Golem are former names" |
| Local folder | `/Users/moshe/Developer/RbxAI` (+ clones such as `RbxAI-rename`, `RbxAI-ci`) | Yes | Do this **last**, after consolidating to one checkout: rename it to `StudPilot`, then fix Claude Code paths and worktrees |

## Rules for the rename
1. **Data first, names second.** Never delete an old resource until its replacement has been verified by counts and a live check. Old resources stay 7 days (90 for URLs).
2. **One release where both names work** for anything a running plugin or a stored record uses (the wire protocol, env vars, DO bindings). Then remove the old spelling.
3. **Owner consent.**
   - The standing consent of 2026-10-02 covers changing and deleting Cloudflare, Supabase and Sentry resources and removing "golem".
   - Anything **paid** needs the owner's yes. That includes Supabase custom domains, extra Cloudflare products, and a new domain beyond `studpilot.app`.
4. **Allowed leftovers.** History docs, changelog entries, git history, third-party text such as "Apple Silicon" or macOS references, and the legacy-alias code during the dual-name release.

## Acceptance test (the rename is done when all of these pass)
- **`git grep`:** "apple" and "golem" (any case) return only lines listed in `planning/rename-allowlist.txt`, and each listed line has a reason.
- **Cloudflare:** the MCP listing shows no resource named apple or golem. All bindings point at `studpilot-*`.
- **Live check on `https://studpilot.app`:**
  - sign-in (Google, Discord, email, Roblox), a chat run, plugin pairing and an existing project's history all work;
  - DO record counts match the pre-migration counts.
- **Old addresses:** the workers.dev URLs return a 301 to `studpilot.app`.
- **Platform names:** Supabase, Sentry, GitHub, Discord and Stripe show "StudPilot". Proof is screenshots or API output saved to `planning/proof/rename/`.
