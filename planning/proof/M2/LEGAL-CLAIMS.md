# Legal pages: every factual claim, and the code that makes it true

Handoff M2 step 2.4 and plan section 7. Branch `studpilot/m2-legal`, built on `d00707e9` (main plus the Roblox sign-in lane).
Written 2026-10-05. **Nothing here is deployed.** The pages are `apps/site/src/pages/privacy.astro`, `terms.astro` and
`docs/privacy-and-data.astro`, plus the Settings > Privacy row `improvement-opt-out` in `apps/web/src/routes/settings.tsx`.

How to read the table. **Evidence** is a `file:line` on this branch that does what the sentence says. **Guard** is the test that
fails when the code and the sentence part ways (`PC` = `apps/site/tests/privacy-claims.test.mjs`, `PM` =
`tests/promises-match-the-product.test.mjs`, `AD` = `apps/web/tests/account-data.test.mjs`, `SC` =
`apps/web/tests/settings-connection-clarity.test.mjs`, `OO` = `apps/site/tests/one-operator.test.mjs`, `RO` =
`apps/worker/tests/roblox-oauth.test.mjs`, `IO` = `apps/worker/tests/improvement-opt-out.test.mjs`). Rows marked **policy** have no
code behind them and are listed again in the last section.

## 1. What was found false, and changed

These were already false or were made false by the Roblox lane. Each is now corrected, and each has a guard.

| # | What the page said | What the code does | Evidence |
|---|---|---|---|
| F1 | "our servers hold no master key to your rows" (privacy), "our own servers hold no master key" (docs) | The Worker holds `SUPABASE_SECRET_KEY`. It is used in one file, for exactly three Auth admin calls: create a user, read a user, mint a one-time sign-in link. Never a table query. | `roblox-oauth.ts:371` `:388` `:400`; the only readers are `env.ts:120` and `roblox-oauth.ts`; the test world records any use outside `/auth/v1/admin` as a stray (`RO` `test()` wrapper). Guard: `PC` "the Supabase secret key is described by what it does" |
| F2 | "Your prompts ... are not retained by the inference layer beyond serving that request" | Every text model call goes through Cloudflare AI Gateway with `collectLog: true`; the gateway log keeps the prompt and the reply. Voice is the one exception (`collectLog: false`). Nothing in the code deletes the entries. | `providers/workers-ai.ts:179`, `voice-transcribe.ts:103`, `wrangler.studpilot.jsonc:173` (`AI_GATEWAY_ID`), `docs/audit/APPLE-LEDGER.md:576`. Guard: `PC` "the model-call log is disclosed for as long as the code collects it" |
| F3 | "Temporary image previews and generated sound: one hour in cache" | With the R2 bucket (which this deployment has) generated sound is kept under a 365-day lifecycle rule. One hour is the no-bucket path only. | `retention.ts:44-52`, `audio-store.ts:35-52`, `wrangler.studpilot.jsonc:107-110`. Guard: `PC` "the sound and preview windows" |
| F4 | "Two things survive it" (deletion) | The receipt lists ten: previews, deleted-project ids, the sign-in identity, the account row, the usage ledger, support messages, memberships on other people's projects, the QuotaDO ledger and Stripe events, the request log (30 days), and (new this commit) the AI Gateway log. | `erasure.ts:82-146`. Guard: `PC` "every entry of the deletion residue is acknowledged" |
| F5 | Five recipients of data (Cloudflare, Supabase, Stripe, Discord, Roblox) | The worker calls fourteen hosts that receive data. Added: Sentry, Hugging Face (and fal-ai), AssemblyAI, Serper, Tavily, Context7, GitHub, Cloudflare Turnstile. | `sentry.ts`, `hf.ts:112` `:177`, `voice-transcribe.ts:124` `:155`, `webtools.ts:62` `:829-831`, `turnstile.ts:16-21`. Guard: `PC` "every host the worker calls is classified" |
| F6 | "the only personal information signup asks for" / "That's the entire signup form" | True for email sign-up, but a Roblox sign-in has no email and no password, and holds the Roblox user id and username. Reworded to "if you sign up with email". | `auth-pages.tsx:612-755`, `roblox-oauth.ts:125` `:136` |
| F7 | "children below the age at which they can consent ... in their country", "a parent or guardian's permission" | The product is 13 and older. | policy; guard `PC` "13 AND OLDER" (bans the old wording) |
| F8 | "Your private project data is never used to train AI models" and "no fine-print exception" (privacy, docs, terms, the changelog entry, the Settings row, the meta descriptions) | Owner decision (plan section 7): anonymised, opt-out improvement data, never Roblox data, not collected yet. Roblox data is never used for AI training. | Gate: `packages/training/src/consent-staging.mjs:93` (`false`). Guard: `PC` "no blanket never-trains remains" and `PM` three-way lock |
| F9 | "Changes to this policy" and terms 5 and 9 pointed at `/changelog` | A later lane removes that route. Reworded: the date at the top changes and account holders are told before a significant change. | guard `PC` "the terms ..." |
| F10 | (Receipt) "the empty account can still sign in until an operator removes it" | For a Roblox account the identity also still carries the Roblox user id and username. | `erasure.ts:93-101`; Supabase gets both at `roblox-oauth.ts:376-377`. Guard: `PC` residue test |

## 2. The privacy policy (`/privacy`)

| Claim | Evidence | Guard |
|---|---|---|
| Operator "Apple Labs", contact `apple.labs.app@gmail.com` | **policy** (BLOCKED N6: the legal name and inbox are the owner's). Left exactly as it was. | `OO` |
| Email sign-up asks for an email and a password, nothing else; the password is hashed | `auth-pages.tsx:644` (`signUp` with email and password), `:749` (the Roblox button); hashing is Supabase Auth's | `PC` birth-date test reads this form |
| The display name starts as the part of the email before the `@`, and can be changed in Settings | `infra/supabase/migrations/0001_init.sql:98`; `settings.tsx:2148` | none new (carried over) |
| Projects: names, descriptions, place name and id | `0001_init.sql:13-26` | none new |
| Chat history, tool record, attachments, checkpoints | carried over from the previous page and `AGENTS.md` (SessionDO owns them) | none new |
| Checkpoints: the newest 25 per project | `retention.ts:38` | `PC` retention test |
| Request log: 30 days or 5,000 entries; account id withheld on opt-out | `retention.ts:24-26`; `preferences.ts:61`; `analytics-consent.ts:33` | `PC`, `AD` |
| Credits ledger 35 days; notifications 30/90; automations 90; trash 30 days | `retention.ts:34` `:30-32` `:28` `:54` | `PC` |
| Model-call log holds the prompt and reply, labelled with kind and model, no account id (a project id rides as a routing hint); voice excluded | `providers/workers-ai.ts:167` `:179`; `voice-transcribe.ts:103` | `PC` |
| Retention of the model-call log is not set by the code | there is no delete path (grep `collectLog`, `gateway` in `erasure.ts`: none); Cloudflare dashboard setting, **not verifiable here** | `PC` (text only) |
| Stripe handles payment; we keep subscription state and invoice references; checkout is not open | `index.ts:2764` `:2802`; `billing-origin-authority.ts:333`; terms probe `index.ts:3042` | `PC` (existing) |
| Open Cloud key: encrypted at rest with a key the database does not hold; never returned; fingerprint and last four shown; deleting removes it | `user-credentials.ts:143` (`sealSecret`, `CREDENTIAL_KEY` is a Worker secret); `:63` `:279` (fingerprint); `erasure.ts:397` | `PC` (existing) |
| Discord account id if you link one | `discord.ts` | none new |
| Google and Discord sign-in are conditional and not offered | no `signInWithOAuth` anywhere in `apps/web/src` | `PC` "Google and Discord sign-in ..." |
| **Roblox: scopes `openid` and `profile` only; nothing for assets, experiences, friends, inventory** | `roblox-oauth.ts:57` `:545` | `PC` columns test (also fails if an `asset:` scope appears) |
| **Kept from Roblox: the user id and username only** (never a password; no email) | `roblox-oauth.ts:319-329` reads `sub`, `preferred_username`, `nickname`, `name` and nothing else. "Roblox sends no email address" is the file header's reading of Roblox (`:5-6`): **external**, the code reads none. | `RO` |
| `roblox_identities`: Roblox user id, StudPilot account id, username, time linked, time last confirmed | `roblox-oauth.ts:125` | `PC` columns test, derived from this `CREATE TABLE` |
| `roblox_oauth_tokens`: encrypted refresh token, Roblox id, permissions, version, generation, last replaced, lock | `roblox-oauth.ts:136` | `PC` columns test |
| The id (not the username) finds the account; the username is refreshed at each sign-in | `roblox-oauth.ts:436-448` | `RO` |
| The refresh token is encrypted, never returned, never in the export | `roblox-oauth.ts:495-502` (`sealSecret` first), `user-export.ts:256-265` (withheld, with the reason), `RO` "the refresh token is stored sealed, is not in any response" | `RO` |
| The token exists so StudPilot can ask Roblox to withdraw access on disconnect, deletion, or "Go back" | `roblox-oauth.ts:349` `:774-791` `:1074-1083` `:1105-1126` | `RO` |
| The confirmation time is written by the server's clock and good for ten minutes | `roblox-oauth.ts:88` `:926` `:944` | `PC` outside-the-tables test; `RO` |
| A Supabase account with a placeholder address `@users.studpilot.invalid`, the Roblox id in `app_metadata`, the Roblox username as the display name | `roblox-oauth.ts:78` `:370-377` | `PC` outside-the-tables test |
| A first sight is held up to five minutes (id, username, encrypted token) in short-term storage; "Go back" deletes it and revokes | `roblox-oauth.ts:65` `:662` `:674` `:774-791` | `PC` outside-the-tables test; `RO` |
| A Roblox sign-in makes its own StudPilot account, not attached to an email account | `roblox-signin.ts:303` (the card says it), `roblox-oauth.ts:612-679` | `RO` |
| **When Roblox says the grant is gone (`invalid_grant`) the stored token is deleted; found out only when the token is next used; nothing uses it yet; the id and username stay** | NEW: `roblox-oauth.ts:981-1001` and the call site in `refreshRobloxAccessToken` (`:1011`). No caller exists (grep). | `RO` "ACCESS LOST" and the "WITHOUT saying the grant is dead" test; `PC` "Roblox data is never used ..." (fails when a caller appears: reword then) |
| Roblox data is never used for AI training, and is not part of improvement data | **policy**, with the mechanism that nothing in the worker or training package reads it: `consent-staging.mjs:93` (`false`); the Roblox token has no caller. Roblox Third-Party App Policy as the source is **external** (plan section 7). | `PC`, `PM` lock 1 |
| Improvement data: anonymised, opt-out, never Roblox data / Open Cloud key / credentials / payment data | **policy** (the owner's decision); no code collects it | `PC`, `PM` locks 1 and 3 |
| Collection is not active; nothing about projects, chats or checkpoints is collected for it; the code that would is switched off | `packages/training/src/consent-staging.mjs:93` | `PM` lock 3 (fails if the gate opens, or if "not active" is deleted from any surface) |
| You can opt out now in Settings > Privacy > Improvement data; the choice is saved and honoured later | `settings.tsx:1953` (mutation), `:2503` (row); `preferences.ts:66` `:254` `:461` | `AD`, `SC`, `IO`, `PM` lock 2 |
| Before collection starts every account holder is emailed; Roblox-only accounts have no email so are told in the app | **policy**. The in-app notice is **not built**; the address is a placeholder (`roblox-oauth.ts:78`). See section 4. | `PC` (text only) |
| The Supabase key: create the account, read its sign-in address, issue the one-time link; not used for any table or to delete accounts | `roblox-oauth.ts:371` `:388` `:400` | `PC` |
| Cloudflare Turnstile guards the sign-in, sign-up, password-reset and account-recovery forms | `turnstile.ts` (web) `:18-21`; `turnstile.ts` (worker) `:16` | `PC` hosts test |
| Sentry gets error reports: kind, scrubbed message, location; built from a closed field list (no body, header, cookie or query string) | `apps/worker/src/sentry.ts:22-26` (closed allowlist) and the header of `apps/web/src/lib/sentry.ts`. Whether a DSN is set in production is **not verifiable here**; the page over-discloses rather than under-discloses. | `PC` hosts test |
| Web search (Serper or Tavily), documentation lookup (Context7), GitHub's API, public pages: sent from the server, no cookie, token or account detail of yours | `webtools.ts:827-831` (`AGENT_USER_AGENT` comment: no cookie and no forwarded user header), `:62` | `PC` hosts test |
| Hugging Face and fal-ai get an image description (and the picture for a 3D model) on the optional route | `hf.ts:112` `:177` (prompt cut to 2,000 characters); on only when `HF_TOKEN` is set (`:116`) | `PC` hosts test |
| Voice: Cloudflare speech model, or AssemblyAI where a key exists; never stored; AssemblyAI asked to delete the transcript | `voice-transcribe.ts:6-14` `:103` `:155` `:208` | `PC` |
| Export includes the Roblox id, username and permissions; never the token | `user-export.ts:243-265` | export tests (existing), `RO` |
| Delete: Roblox asked to withdraw first, token deleted, link deleted last and only once everything else succeeded; unreachable Roblox: copy still deleted, receipt says so | `erasure.ts:401-405` `:423-434` | `PC` "what deletion does with the Roblox data", `RO` |
| Disconnect deletes nothing unless Roblox confirms; not offered while Roblox is the only way in | `roblox-oauth.ts:1105-1132`; `roblox-signin.ts:309-317` | `PC`, `RO` |
| Residue list (ten entries) | `erasure.ts:82-146` | `PC` |
| Backups expire within 30 days | **policy** / infrastructure, carried over, **not verifiable here** | none |
| 13 and older; Roblox sign-in needs a 13+ Roblox account; an account found to belong to someone under 13 is deleted on report | **policy**; "Roblox's sign-in service is for 13+" is **external** (plan section 7). The sign-up form has no birth-date field (`auth-pages.tsx:612-755`) and no page claims one. | `PC` 13+ test |
| The date at the top changes; account holders are emailed before a significant change | **policy** | `PC` |
| Israeli law; rights wording; "authorized operators can access production systems" | **policy** (carried over) | `PC` (existing), `onboarding-recovery.test.mjs` |

## 3. The terms (`/terms`) and the data page (`/docs/privacy-and-data`)

The data page repeats the privacy rows above in shorter form; the same guards read both. The terms add:

| Claim | Evidence | Guard |
|---|---|---|
| 13 or older to create an account; under-13 accounts are deleted | **policy** | `PC` |
| Roblox sign-in: you authorise through Roblox's consent screen; Disconnect Roblox (Settings > Connections) asks Roblox to revoke and deletes what StudPilot holds; Roblox-only accounts have no Disconnect | `roblox-oauth.ts:1105-1132`, `roblox-signin.ts:299-323`, `settings.tsx:2365` | `PC` terms test |
| Free while in beta; the Free plan is 5 Credits a day and up to 30 a month; paid plans start later and cannot be bought yet | `packages/shared/src/index.ts:2290-2293` (`PLAN_TABLE`), rendered into the page by `terms.astro` (`{PLAN_TABLE.free.creditsPerDay}` and `.creditsPerMonth`, `fullRateDays`); pricing page headline "Free while in beta. Paid plans start later" (`pricing.astro:266`); checkout state is probed from `/api/billing/config` (`index.ts:3042`) at build time, and an unreachable probe means "closed" | `PC`, `pricing-config.test.mjs` |
| Improvement data and Roblox data are as the Privacy Policy says, and the Policy controls | **policy** | `PC` |
| Beta, as-is, liability, acceptable use, governing law | **policy** (legal text, carried over) | none |
| "Operated by Apple Labs" | **policy** (BLOCKED N6), unchanged | `OO` |

## 4. The Settings row (`improvement-opt-out`)

| Claim | Evidence | Guard |
|---|---|---|
| A switch, on = opted out, off by default (absent = not opted out) | `settings.tsx:2503-2533`; `preferences.ts:66` (key), `:254-258` (boolean only), `:461-470` (narrows: any layer's true wins) | `AD` (writes `improvement_opt_out` at user scope, reads `?? false`), `IO` |
| What came back, not what was sent, is what the toast says; a failed read is not shown as "not opted out" | `settings.tsx:1953-1969` and the row's `storedPrefs.isError` branch | `AD` |
| The choice is exported and erased with the rest of the preferences (they are `memory_entries` rows of the user scope) | `erasure.ts:387`; export of `memory_entries` (existing) | none new |
| "Improvement data is anonymised, is opt-out, and never includes data from Roblox, an Open Cloud key, credentials or payment details" | the same sentence as the pages (**policy**) | `PC`, `PM` lock 2 (string equality with the pages) |
| "Collection is not active yet" | `consent-staging.mjs:93` | `PM` lock 3 |
| "we will tell every account holder" | **policy** (says "tell", not "email", because a Roblox-only account has no inbox) | none |
| Search: "training" lands on it | `settings-search.ts` entry `improvement-opt-out` | `AD`, `settings-search.test.mjs` |

Left alone, as instructed: `profiles.training_opt_in` (`0001_init.sql:9`), its export, and its reset to `false` at erasure
(`erasure.ts:488`). **It is a dead column**: nothing reads it (the training gate that read it is closed). A later cleanup can drop it with
a migration. `packages/training/src/consent-staging.mjs` was not touched; its header comment still says "Apple never trains" (history).

## 5. What is policy rather than code

1. "We never sell your data." No code can show a negative.
2. Roblox data is never used for AI training. The mechanism is that nothing reads it; the commitment is the owner's and Roblox's Third-Party App Policy (external).
3. Improvement data: anonymised, opt-out, excluding Roblox data, an Open Cloud key, credentials and payment data. Nothing is collected, so there is nothing to test beyond the closed gate.
4. "Before collection starts we email every account holder." **The in-app notice for Roblox-only accounts does not exist** (such an account's address is `@users.studpilot.invalid`, which nothing can deliver to). The pages promise it; M6/M7 must build it before the gate can open. The same applies to "email account holders before a significant change".
5. 13 and older, "Roblox's sign-in service is for 13+" (external), and "an account found to belong to someone under 13 is deleted on report" (operational: an operator removes the sign-in identity, which the app cannot do).
6. "Roblox sends us no email address" is Roblox's behaviour for `openid profile`; the code reads none.
7. Backup rotation of at most 30 days, the 365-day audio lifecycle rule, and how long Cloudflare keeps AI Gateway log entries are settings outside the repository.
8. Whether the Sentry DSN, `HF_TOKEN`, a search key and `ASSEMBLYAI_API_KEY` are set in production decides whether those recipients actually receive anything today. The pages disclose them either way.
9. Legal text: as-is, liability, governing law, rights wording, operator name and inbox.

## 6. For later lanes and the owner

- **M5c must call `refreshRobloxAccessToken` and no other path to the stored token.** The wipe on `invalid_grant` is inside that function, so any
  caller inherits it. The day a caller exists, `PC` fails on purpose ("nothing uses it yet" is then false): reword the three pages to say what the
  connection is used for, and say what the uploads ask Roblox for (new scopes need a new consent screen, which the pages already promise).
- A lost grant is only noticed when something uses the token. If the owner wants the stored token gone promptly after somebody removes StudPilot in Roblox,
  a periodic validity check is a new feature; today the page says so plainly.
- On loss the token is wiped but the Roblox user id and username stay (they are the sign-in link, and a Roblox-only account cannot get back in without
  them). Whether Roblox's policy wants those wiped too is an owner decision; the page states what the code does.
- **AI Gateway logs hold every prompt and reply (`collectLog: true`) and nothing deletes them.** The pages now say so. Switching the log off for text
  calls (as voice already does), or setting a retention in the Cloudflare dashboard, would let the pages say less. Owner decision; it costs the spend
  attribution the log provides.
- The legal operator name and inbox (BLOCKED N6) are unchanged everywhere; `OO` is green.
- The receipt text in `erasure.ts` says "under Connections in your Roblox account settings"; the Settings card says "Connected apps". The pages say
  "the apps authorized on your Roblox account" so as not to name a menu this branch cannot check.
- `docs/` (SECURITY.md, FAILURES) and `packages/training/src/consent-staging.mjs` still carry the old "never trains" wording as history; they are outside
  the files this lane was asked to change.
