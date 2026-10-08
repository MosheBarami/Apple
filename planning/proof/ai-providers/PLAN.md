# AI provider integration — owner mandate 2026-10-08

The attached objective supersedes the old decision to hide providers. The rest of the final plan
and handoff still govern build execution, Studio ownership, evidence, compatibility and spending.
Work is isolated on `codex/ai-provider-integration`. Initial local main was `21803602`; groundwork
was rebased onto the verified GitHub main `209650f4` before connecting the build path.

Acceptance requires all three routes through the website and the real Studio build path. Nothing
below is a completion claim until its evidence is recorded in this directory.

1. Central engine version and explicit route/provider/model/connection identities; reject unknown
   platform ids before invocation. Preserve old requests on their existing managed route.
2. Protocol adapters, documented discovery and model metadata for all requested API providers.
   Keep catalog presence, account access, contract tests, runtime tests and recommendation separate.
3. Authenticated encrypted multi-connection CRUD with owner checks on every read/write/inference;
   sanitized errors, no secrets in browser storage/logs, fixed known origins and safe advanced endpoints.
4. Pinned isolated OpenCode CLI runner with authenticated service contract, readiness/discovery,
   bounded queue/concurrency, cancellation, timeout, complete NDJSON parsing and recovery. CLI tools
   cannot mutate Studio or substitute for its operations. Measure overhead and isolation.
5. Shared task/capability router with route boundaries, opt-in BYOK auto routing, pinned catalog and
   policy per run, measured quality, bounded recovery, circuit/rate-limit handling and decision ledger.
6. Persist selection per user/project, freeze it on run start, wire every relevant inference call and
   preserve service quota while excluding user-paid provider cost from StudPilot provider billing.
7. Workspace selector and Settings Connections with real states, accessible mobile/desktop UI and
   official local brand assets with provenance. No placeholder marks or invented model brands.
8. Contract/security/regression tests; opt-in runtime probes; website-to-backend-to-runner and Studio
   evaluation proof; production release through existing scripts from integrated clean main only.

New paid infrastructure remains a separate approval boundary. Prepare and verify the runner locally
before requesting that final action. The development OpenCode key is never deployed as a public key.

## Initial observation

- Main resolves to `/Users/moshe/Developer/StudPilot`; RbxAI is a symlink.
- Main has unrelated local edits to launch/hooks and untracked private material, left intact.
- One platform adapter exists (Workers AI). Unknown model ids previously fell through to it.
- OpenCode binary reports 1.18.23. Its runtime proof from the objective must be independently repeated.
- Website, BYOK runtime, runner runtime, Studio and deployment proof are outstanding.
