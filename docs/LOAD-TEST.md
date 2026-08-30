# Golem concurrency & isolation test — 2026-08-30

Run against **production** (`https://golem.moshe-barami111.workers.dev`) with 30 real Supabase
accounts. Reproduce: `node infra/loadtest.mjs 30 12`.

| phase | n | p50 | p95 | result |
|---|---|---|---|---|
| concurrent sign-in | 30 | 999 ms | 1002 ms | 30/30 ok |
| project create (PostgREST + RLS) | 30 | 852 ms | 1032 ms | 30/30 ok |
| `/api/me` (worker + QuotaDO) | 30 | 3567 ms | 3731 ms | 30/30 ok — see note |
| WebSocket connect → `hello` | 30 | 1041 ms | 1161 ms | 30/30 ok |
| concurrent Clay inference (real Workers AI) | 12 | 4331 ms | 11796 ms | 12/12 ok, **0 errors** |

**Note on `/api/me` 3.5 s:** that figure is the cold start of 30 brand-new per-user Durable
Objects being created simultaneously (each runs its schema bootstrap). Warm, serial re-measurement
of the same endpoint: **423 ms / 123 ms / 133 ms**. Steady-state is ~130 ms; `/api/health` 90 ms;
`/api/docs/search` (hybrid RAG over 8,326 chunks) 588 ms. The cold-start cost is paid once per user.

## Tenant isolation probes (executed under concurrency)

| probe | result | expected |
|---|---|---|
| user A reads user B's messages (REST) | `404` | not found ✓ |
| user A opens user B's project WebSocket | rejected | rejected ✓ |
| user A reads user B's checkpoints | `404` | not found ✓ |
| unauthenticated project access | `401` | denied ✓ |
| `/api/admin/stats` without admin key | `403` | denied ✓ |
| pairing claim with a guessed code | `404` | denied ✓ |
| user A selects user B's project row via PostgREST | `0 rows` | RLS blocks ✓ |

## Quota

After the run, user 1 showed `79/80` Sparks — exactly one Clay request (1 Spark) debited.
The ledger is authoritative per user in its own Durable Object, so concurrent requests
cannot race past the daily cap.

## Headroom

30 simultaneous users is comfortably inside Workers Free limits (100k req/day, DO 100k req/day)
and the 10,000 free daily neurons. The binding constraint at scale is inference, not the platform —
which is exactly what the Sparks quota governs.
