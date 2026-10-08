# OpenCode investigation, 2026-10-08

Installed binary: 1.18.23. This version is pinned in `infra/opencode-runner/cli.mjs`.
Discovery through `opencode models opencode --pure --refresh --verbose` succeeded in a fresh HOME/XDG
environment. The CLI snapshot was intersected with the live public Zen `/v1/models` response.
Neither discovery nor model cost metadata is treated as successful inference.

## Measured failure

An initial fresh per-request HOME used the binary's stale embedded model list and produced
ProviderModelNotFoundError for `mimo-v2.6-flash-free`. Pinning the discovered model record in the
request's OpenCode config fixed model resolution without reusing personal configuration.

Real inference then returned HTTP 403 / FreeTierError with both the development API key and the
CLI's normal anonymous public mode. We did not change headers, client identity or authentication.
The dedicated agent had all internal tools denied, no external plugins, no MCP, no personal
instructions/skills and no access to a personal HOME. Retaining OpenCode's own provider system
prompt also produced 403. No successful token-overhead figure is available yet.

The official project's issue tracker contains matching user reports about denial when built-in
read or shell tools are removed. These reports support a hypothesis; they do not establish a
documented license to operate a public inference proxy, and they are not our runtime evidence.

- https://github.com/anomalyco/opencode/issues/51315
- https://github.com/anomalyco/opencode/issues/50627
- https://github.com/anomalyco/opencode/issues/53347
- Pinned request implementation: https://github.com/anomalyco/opencode/blob/v1.18.23/packages/opencode/src/session/llm/request.ts

## Privacy and production gate

Source checked 2026-10-08: https://opencode.ai/docs/zen/
Some free models may train on submitted data. NVIDIA free endpoints are trial-only and reject
personal/confidential input under their terms. Jev is a separate System One decision API and does
not satisfy the chat contract. Unreviewed models are unavailable to service routing even when
discovery succeeds. Training consent is separate from the route choice. A service-use review and
successful isolated runtime proof are required before the runner reports ready.

No provider secret from the owner's .env is provisioned to a public service. The local probe is
opt-in and accepts a development env file explicitly; service startup never reads that file.
Production infrastructure, approved service credentials and public-use permission are outstanding.
The runner's tests use fixtures. Website inference and Studio build acceptance are outstanding.

## Provider terms boundary

The official Terms of Use (effective 2026-08-15, read 2026-10-08) specify internal use and prohibit
using the hosted service for the benefit of third parties. They also contain a restriction on
programmatic extraction of output. The open-source CLI license and the hosted inference terms
are explicitly distinct. A public StudPilot free inference service is not authorized by installing
the CLI or by the owner's personal Zen API key. Service reviews must remain empty/disabled until
OpenCode supplies permission for this use. No identity/header/tool spoofing is an acceptable fix.

Official source: https://opencode.ai/legal/terms-of-service
