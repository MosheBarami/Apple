# Stripe (billing)

Subscriptions plus Credits. All billing code is in the worker; nothing in this folder runs.

## Names (set with `wrangler secret put <NAME>`; values never in git)

| Name | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | API key. A test key in production is refused (`billing-test-key-in-production.test.mjs`) |
| `STRIPE_WEBHOOK_SECRET` | verifies webhook signatures |
| `STRIPE_PRICE_BUILDER`, `STRIPE_PRICE_STUDIO` | price ids of the two paid plans |
| `STRIPE_PORTAL_CONFIGURATION` | customer-portal configuration id |

The authoritative list, with the reason for each, is the `Env` interface in `apps/worker/src/env.ts`.

## Routes (`apps/worker/src/index.ts`, `apps/worker/src/billing.ts`)

- `POST /api/billing/webhook`: exempt from JWT auth (Stripe has none); it authenticates by signature.
- `GET /api/billing/config`: answers whether checkout is available; the pricing page asks it.
- `POST /api/billing/checkout`, the portal and `GET /api/billing/history`: authenticated, same-origin.

## Tests

`apps/worker/tests/billing*.test.mjs` (checkout, webhook authority, origin authority, reconcile, invoices,
persistence, Stripe API shape). `docs/COST-MODEL.md` and `packages/evals/src/economics.test.mjs` hold the money
figures; `node scripts/checks/check-credit-figures.mjs` keeps the site copy in step.

## Go-live

The Stripe go-live steps are in `docs/GO-LIVE.md`.
