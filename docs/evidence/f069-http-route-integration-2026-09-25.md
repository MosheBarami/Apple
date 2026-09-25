# F-069 — HTTP Stop route integration, 2026-09-25

The deployed Stop fix previously had source checks and unit tests for the stored stop signal. I
executed the registered Hono route in `apps/worker/tests/stop-route-live.test.mjs` with an absent
browser socket. The only replaced boundaries were JWT verification, Supabase project access and the
SessionDO fetch. The test models a project owner, editor, viewer and outsider separately.

- The owner's POST `/api/projects/:id/stop` returned HTTP 200 with `stopping: true`. The recorded
  SessionDO calls were `/init` followed by `/agent-stop` for the same project id.
- The editor reached the same route. The viewer and outsider received 404 and made no SessionDO
  calls, including no `/init`.
- Focused integration test: 2 passed, 0 failed. Full worker suite: 4,189 passed, 0 failed.

This proves routing and authorization in the local Hono app. The SessionDO signal has separate unit
coverage in `stop-signal.test.mjs`. It does **not** prove that a real Studio build stops in production
within one step. F-069 stays open until that observation is made during round 8.
