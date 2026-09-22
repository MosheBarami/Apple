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
