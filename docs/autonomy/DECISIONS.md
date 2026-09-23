# DECISIONS

Each decision: what, evidence, alternative rejected, and the observation that would prove it wrong.
A decision is not a fact. Customer-strangers and fresh reviewers must not be given this file.

## D-AUT-1 — The first OWNER_PROMPT run is driven from the interactive session (2026-09-22)

- **Decision:** run OWNER_PROMPT.md from the interactive Claude Code desktop session, with isolated
  subagents supplying fresh context for customer-stranger, critic and reviewer roles; keep
  `scripts/autonomy-supervisor.py` installed and tested for unattended continuation.
- **Evidence:** the prompt makes real Studio and the signed-in browser release oracles. On this Mac the
  owner's signed-in session is in his Chrome (reachable by this session's Claude-in-Chrome tools) and
  the Studio GUI is controlled through computer-use, which this session holds. A `claude -p` child can
  get `--chrome` and a StudioMCP `--mcp-config`, but not the computer-use grant needed to type a
  pairing code into the plugin dock.
- **Rejected:** starting the supervisor immediately as the only driver — its children would run the
  same shared checkout concurrently with this session (the report's "single Product Owner lock" risk)
  and could not complete the Studio pairing step.
- **Falsified if:** a supervisor child demonstrably completes a paired Studio mission end to end without
  this session — then the supervisor becomes the primary driver.

## D-STORE-1 — STUDIO_PLUGIN_STORE_LIVE = true (2026-09-22 ~21:03 IDT)

- **Decision:** the Creator Store listing is the install path; every surface derives from the flag.
- **Evidence:** toolbox-service 200 for 107230158271368 with the same shape as Rojo 7 (visibilityStatus 1,
  isAssetHashApproved, fiatProduct published + free) while Moon Animator 2 200, the retired Golem id
  404 and an impossible id 404; the store page renders "Apple Studio · Get Plugin" signed out; Creator
  Store search returns exactly this id; the owner reports the plugin approved.
- **Rejected:** keeping the flag false until the appeal page is read — the distribution itself is
  measured, and telling customers the plugin cannot be installed is now false.
- **Falsified if:** the probe returns 404 again beside healthy controls — flip back.

## D-PLUGIN-1 — apps/apple-plugin is the shipped plugin; apps/plugin is legacy fixtures

- **Evidence:** commit f6ad60a; enforced by apps/apple-plugin/tests/worker-capability-contract.test.mjs;
  the published asset reports scriptCount 5, matching apple-plugin at 09-19 (legacy has 8); only
  apple-plugin sends the golem.studio-ops.v1 capability schema.
- **Rejected:** deleting apps/plugin now — ~16 test files read its sources as fixtures.
- **Falsified if:** a customer's installed store build reports the legacy VERSION 0.2.0.

## D-RUN-1 — A truncated tool call must never end a customer run (2026-09-22)

- **Decision:** a provider response cut at the output ceiling is a provider-call boundary: partial tool
  calls are discarded, never executed and never written into model history, and the run continues in
  smaller batches.
- **Evidence:** F-001 (two identical production failures).
- **Falsified if:** the same lamp prompt, re-run after the fix, still ends in `error` or builds nothing.

## 2026-09-23 — owner direction (message during the run)

- **D-UX-2 — Outputs are short; detail is hidden.** The product is for young, non-technical creators. Plan
  checklists, property tables, instance cards and long tool detail are not shown in the conversation. The
  reply says what changed in plain words; detail stays reachable only behind the Thinking disclosure.
- **D-REASONING-2 — The Thinking shimmer opens onto the model's own reasoning, live.** Overrides the earlier
  rule "never render hidden chain of thought". Only text the provider itself returns as reasoning is shown,
  as plain text, never interpreted as markup; providers that return none show only the shimmer.
- **D-BYOK-1 — Bring your own key.** Customers may add keys (OpenRouter, OpenAI, Anthropic, Google, DeepSeek)
  and pick the latest models (GPT-6 Astra/Sol/Luna, Claude Fable 5.1, Claude Opus 5.5, Gemini 3.8 Flash,
  DeepSeek V4.1 Flash, …), shown with their official icons. Keys are encrypted at rest with a worker secret,
  never returned to the browser beyond their last four characters, never logged, never put in a transcript.
  A run on the customer's own key does not spend Apple Credits.
- **D-FREE-1 — Free models are the ones OpenRouter prices at zero today, read live.** Free promotions are
  time-limited, so the list is derived from OpenRouter's catalogue (prompt and completion price 0, tool calling
  supported) and cached briefly, never hard-coded. They need an OpenRouter key; a keyless free tier switches on
  only if the owner adds a platform OpenRouter key (OPENROUTER_API_KEY) — creating that account is the owner's.
- **D-BYOK-2 — The encryption key.** `BYOK_ENCRYPTION_KEY` (32 random bytes, base64) was generated in memory and
  piped straight into `wrangler secret put` on 2026-09-23; it was never printed or written to disk. Rotating it
  makes every stored customer key unreadable — customers would have to add their keys again. Do not rotate it
  without a re-encryption step.
- **D-STORE-2 — No more public store updates until the final version; nothing is removed from the plugin.**
  Owner, 2026-09-23 ~01:35 IDT, after Roblox refused to distribute version 2 (F-038): "they always gonna flag
  this so from now on you are gonna be building without on the public and the final version should be appealed
  with roblox as before done. NEVER decrease the tools the plugin have." So: development continues on the local
  install (~/Documents/Roblox/Plugins/AppleStudio.rbxm); no Creator Store overwrite until the product's final
  plugin build; that build is published once and then appealed through the Configure page's Appeal link, as was
  done for the legacy plugin. The plugin keeps every capability (insert_asset / LoadAsset, StudioCapture); the
  store-safe variant considered first (drop both) is rejected. LATEST_PLUGIN_VERSION stays at the version the
  store serves. Roblox's record (roblox.com/report-appeals, violation 3JhaXRZAqvmSw5iIhea5QZgT67R): "Plugin
  removed — Misusing Roblox Systems", reviewed 2026-09-23 01:23, **appeal by 2026-10-23 01:23 IDT** — the final
  build has to be published and appealed before that date (version 1's appeal, 09-19, was accepted).
- **D-PLUGIN-2 — A Studio test the person starts pauses Apple's edits; it does not revoke them (2026-09-23).**
  Until now the plugin cleared the connection's edit consent whenever Studio left edit mode for any test Apple
  did not start, so after every Play the next request failed until "Enable edits…" and "Allow edits for this
  connection" were clicked again — and a test-state flicker after Apple's own playtest did the same (F-044).
  Young creators press Play constantly. Writes are refused outside edit mode regardless, so nothing is gained
  by revoking: the panel now reads "Access: edits paused while Studio is testing" and the consent resumes in
  edit mode. It still ends on Disconnect, on "Turn edits off", and a half-finished confirmation is still
  retired. Reverse by restoring `allowEdits = false` in keepEditConsentOnlyInEditMode
  (apps/apple-plugin/src/init.server.luau); entry-runtime.test.mjs holds the new behaviour.

