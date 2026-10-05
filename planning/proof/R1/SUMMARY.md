# R1: StudPilot Studio on Flue, the Agents SDK and Kumo (measured 2026-10-05)

Plan: `planning/REBUILD-PLAN.md`. PRs: #37 (9e616f51) and #39 (f74306f4). Live at https://studpilot.app/studio/.

## What is live
- Worker `studpilot-studio` (apps/studio): one Flue 2.2.2 agent per project (`FlueStudPilotAgent`, a Durable
  Object on the Agents SDK), model `cloudflare/@cf/zai-org/glm-5.3-flash` through the `studpilot` AI Gateway,
  6 read-only tools, Kumo 2.14 chat UI on `@flue/react`.
- Main worker `studpilot`: `StudioGate` entrypoint (service binding only) and the `/studio/*` proxy.

## Measured on production
| Check | Result |
| --- | --- |
| `GET /studio/`, `/studio/projects/<id>`, `/studio/api/health` | 200, 200, 200 |
| Main worker buildSha after deploy | f74306f4 (clean tree) |
| Agent POST with no session | 401 |
| Agent POST with the test user's session, a project id that is not theirs | 404 |
| Agent POST with the test user's session, their project `1ea443f2-…-f425e2df4f4d` | 202, reply read back in 10.2 s |
| Reply with Studio not paired | the agent called its tools, got "not connected", and said so; it did not invent a script list |

The test session was minted for the existing test user through the Supabase admin magic-link flow (no password,
no new account).

## Guards added (each shown failing first)
- `apps/studio/tests/gate-contract.test.mjs`: 4 tests. The agent's tools are a subset of the read-only MCP list;
  the gate refuses other names; the owner check runs before Flue sees the request.
- `packages/evals/src/security.test.mjs` A3: `studioGrantedStub` reviewed. The grant is read before the session
  is addressed, and written only after `withOwnedProject` succeeds, for the id it resolved.

## Not done in R1
- Writes to the place (R2), the agent team (R3), the rebuilt /app (R4) and site (R5).
- A read of a paired place through the new agent: it needs Studio paired to the test project (M3 harness, #36).
