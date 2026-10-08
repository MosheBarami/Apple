# Isolated OpenCode runner

This is an authenticated service behind the StudPilot Worker. Workers' Node compatibility cannot
spawn this binary; a container or another Node host is required. The Worker authenticates the
user/project, pins the catalog/policy, and signs each request. Only the existing StudPilot executor
may issue Studio operations. The runner cannot replace that executor with shell or filesystem edits.

**Not production-ready:** isolated free inference currently returns FreeTierError. The hosted
Terms of Use restrict third-party service use. Default policy reviews are empty, so no model is
ready for public inference. Installing the CLI or possessing a personal Zen key does not authorize
a public service. See `planning/proof/ai-providers/OPENCODE.md`.

## Provisioning contract

- `STUDPILOT_RUNNER_SIGNING_KEY`: independently generated 32-byte base64 secret, shared only with
  the Worker's `OPENCODE_RUNNER_SIGNING_KEY`. Never expose it to a browser or an OpenCode child.
- `OPENCODE_SERVICE_API_KEY`: an explicitly approved service credential, if required. Never copy
  the development .env key into a public environment. Anonymous mode is not proof of public-use permission.
- `OPENCODE_REVIEWS_FILE`: JSON records approved by an operator after source/terms and actual runtime
  review. Each needs `modelId`, `source`, `checkedAt`, `serviceUseAllowed`, `runtimeVerified`, `dataUse`
  (`zero-retention` or `training`) and separately verified `capabilities`. Do not assert these from a model list.
- `OPENCODE_RUNNER_URL` in the Worker: the service's HTTPS origin. TLS termination may be a trusted
  reverse proxy; neither credentials nor redirects may choose another origin.
- `RUNNER_JOURNAL_PATH` and `RUNNER_JOB_KEY`: a private SQLite volume and an independent 32-byte
  AES-GCM key kept outside it. Results are encrypted for five minutes. Prompts, stderr and provider
  or signing keys are not stored in the journal. Use one service instance per journal.

The Dockerfile pins OpenCode 1.18.23 and both CPU archive digests from the official GitHub release.
Docker is not installed on the development machine; no image build or container deployment is claimed.
Build from repository root: `docker build -f infra/opencode-runner/Dockerfile .`. Run with a read-only
root filesystem, a private tmpfs for `/tmp`, no host home/workspace mounts, dropped Linux capabilities
and no privileged mode. Restrict outbound network to required provider/catalog endpoints at the host.

## API

Every request is HMAC authenticated over method/path/timestamp/nonce/body hash, with a 60-second
window and replay rejection. Unsigned health/model endpoints reveal no service configuration.

- `GET /v1/health`: readiness, CLI/catalog version, bounded queue state and non-content counters.
- `GET /v1/models`: CLI/API intersection with distinct policy/runtime availability.
- `POST /v1/models/refresh`: controlled refresh; current queued/running records remain pinned.
- `POST /v1/infer`: actor/run/request identities, pinned model/catalog, budgets and inference input.
  Returns normalized output only after valid text + completion + reported zero cost. Timeout,
  malformed events, tool execution, missing completion and nonzero/unknown cost fail closed.

Concurrency defaults to two; queue capacity is 16; calls time out at 120 seconds. Cancellation kills
the process group and removes its private temporary HOME/XDG roots. Logs and response errors never
include stderr, prompts or provider credentials. Job results are replayable in memory for five minutes,
scoped to actor/run/request and a matching body hash. With the journal enabled, completed results and
pinned catalog versions survive restart. Interrupted receipts are separate from completed ones; the
worker may recover the pending model call once before any new Studio action. Actual container
lifecycle/SIGKILL verification remains required before production acceptance;
the worker's Studio ledger remains authoritative and no completed Studio action is replayed here.

## Costs and release gate

Cloudflare Containers requires Workers Paid and bills provisioned memory/disk plus used CPU, Workers,
Durable Objects and network egress. At the published rates checked 2026-10-08, a `basic` instance has
1 GiB memory, 4 GB disk and 1/4 vCPU. An illustrative 720-hour always-running ceiling, ignoring included
allowances, is about $6.48 memory + $0.73 disk + up to $12.96 CPU = $20.17, plus other services and the
plan. Actual CPU duty/idle sleep can lower it. This is a cost bound illustration, not a measured runner
usage or approved deployment. Source: https://developers.cloudflare.com/containers/platform/pricing/

No new paid infrastructure was provisioned. Before any public release, obtain provider permission,
approved service credentials, isolated runtime/overhead and structured-tool evidence, restart recovery
proof, a measured instance size/idle policy and explicit cost authorization for the final provisioning.

Opt-in local probes: `node infra/opencode-runner/probe.mjs --live-free --executable <absolute CLI>
--model <verified free id> [--dev-env-file <ignored file>]`. These are development proof only.
Fixtures: `node --test infra/opencode-runner/*.test.mjs` (no provider spend).
