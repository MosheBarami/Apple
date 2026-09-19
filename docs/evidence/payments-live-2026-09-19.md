# The product can take a payment — observed, 2026-09-19

Until today Apple had never been able to sell anything, and the reason was not the code. The
checkout route, the entitlement path and 143 billing tests have existed for a long time.
`wrangler secret list` on the `apple` worker returned two names:

```
ADMIN_KEY, ROBLOX_API_KEY
```

No Stripe credential existed anywhere. A fully implemented payment system had simply never been
given a key.

The owner supplied test-mode keys. What follows is what was done with them and what each step
proved, including the two things that were broken underneath.

## 1. The key works, and the account was empty

```
GET /v1/account        -> acct_1S14gn2EKuysPnHr, country US, charges_enabled: false
GET /v1/products       -> 0
GET /v1/prices         -> 0
```

Verified rather than assumed: a valid key with no products still sells nothing. Created to match
what the site advertises (`PLAN_COPY.priceUsdMonthly`: builder 12, studio 40):

| plan | product | price | amount |
|---|---|---|---|
| builder | `prod_VI2Sfu4bAoHFLj` | `price_1UHSNZ2EKuysPnHr6c0kbS5G` | $12.00/month usd |
| studio | `prod_VI2SQ6MhqvWgZc` | `price_1UHSNa2EKuysPnHrW10NXgMn` | $40.00/month usd |

## 2. `/api/billing/config` answered 401 to every prospective customer

The route answers "can this deployment sell anything, and which plans". It was not in
`AUTH_EXEMPT`, so it required a JWT — and the PUBLIC pricing page, which deliberately asks the
server instead of hard-coding the answer, read that 401 as "nothing is purchasable".

Until today that produced the right words for the wrong reason, because nothing was purchasable.
Configuring Stripe is what turns it into a lie: the plans go live and the page still says they are
not. **A failure to observe rendering as an observation, in the one place where being wrong costs
a sale.**

Safe to expose because of what it cannot return — `billingConfigFor` yields a boolean, a list of
plan ids and the charge currency; no key, no price id, no customer, no account, and it never reads
the request. The `A4` security test compares the whole exempt list under the comment "ADDING A
LINE HERE IS THE REVIEW", so the entry carries its own written justification, and three new
assertions now hold the handler to the shape the exemption rests on (answers from
`billingConfigFor(c.env)`, never reads `c.get('user')`, never names a billing secret). Each was
falsified.

## 3. Checkout correctly refused until the webhook secret existed

With the key and both prices set, `/api/billing/config` still reported `checkout: false`. That was
right, and worth recording as a thing the system got correct on its own: `checkoutConfigured`
requires `STRIPE_WEBHOOK_SECRET`, because **entitlement comes only from the webhook**. Without it,
a customer could have paid and never been granted the plan. Offering the button first would have
sold something that could not activate.

Endpoint `we_1UHSQM2EKuysPnHrhyrIBQOm`, registered for exactly the five events
`interpretStripeEvent` reads: `checkout.session.completed`, `checkout.session.expired`,
`customer.subscription.created|updated|deleted`. Its signing secret is a worker secret; it is not
in this file and not in the repository.

## 4. Observed, live

```
GET https://apple.moshe-barami111.workers.dev/api/billing/config   (no credential)
{ "checkout": true, "purchasable": ["builder", "studio"], "currency": "USD" }
```

The pricing page, rebuilt and deployed, now renders `Choose Builder` and `Choose Studio`, and the
"not available to purchase" prose is gone. `deploy-static.mjs` confirmed every page serves the
bytes it just uploaded.

And the prices are genuinely chargeable — two real Checkout Sessions:

```
builder -> cs_test_a1gCoCC0h0UKIVpXXNOVyqEWCVhGBW1JHEr4B24ZKDaGN2m22SxKoSksi5  1200 usd  open
studio  -> cs_test_a1hV3ueA5EOOewLRo9gEfv4pcMQfeaRVx8TYW0vkEEbmRvx1HYsxlcPETO  4000 usd  open
```

Both returned a payable URL at the advertised amount.

## What this does NOT establish

- **These are TEST keys** (`sk_test_`/`pk_test_`). No real money can move through them. Live mode
  needs live keys and a separate webhook endpoint with its own signing secret.
- **`charges_enabled: false`** — Stripe onboarding for this account is incomplete. Test-mode
  checkout works; live charges do not, and that is an account step the owner must complete.
- **No human has completed a purchase end to end.** No card, test or otherwise, has been entered;
  no `checkout.session.completed` has been delivered; no account has been moved to a paid plan by
  the webhook. The path is proven up to Stripe's hosted page and no further.
- **The publishable key is not wired anywhere**, because nothing in `env.ts` reads one — the
  product redirects to Stripe's hosted page rather than mounting Stripe Elements, so it needs no
  publishable key. It was supplied and is not used.

## Reproduce

```bash
curl -s https://apple.moshe-barami111.workers.dev/api/billing/config
npx wrangler secret list --config apps/worker/wrangler.apple.jsonc
```

## A note on how the keys arrived

They were pasted into chat. That is the one part of this worth changing: a chat transcript is not
a secret store, and anything pasted there should be treated as exposed and rotated once the real
ones are issued. Test keys make the exposure cheap this time. Live keys belong in
`wrangler secret put` typed by the owner, and nowhere else.
