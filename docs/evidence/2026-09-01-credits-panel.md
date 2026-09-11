# Credits and clearance, and the one thing this panel must never say

**Date:** 2026-09-01 · **Mission Phase I / §16.2.** Completes the vertical begun in
`2026-09-01-provenance-producer.md`: the ledger now has a producer, an endpoint, and a
surface a customer can actually read.

## The trap this panel had to avoid

The attribution ledger spent its whole life empty, because nothing wrote to it, and an
empty ledger produces a **clean** report. Every project therefore looked compliant.

Fixing the producer does not fix that for the browser. From the client, "no
third-party asset was used" and "the recording did not happen" are the same bytes: an
empty list. A panel that renders an empty list as *clear to publish* would reintroduce
exactly the reassurance that was wrong before, now with a green tick on it.

So `readiness()` in `credits-model.ts` has four verdicts, not three, and the fourth is
the point:

| verdict | when | tone |
|---|---|---|
| `nothing_recorded` | `checked === 0` | muted |
| `blocked` | any finding of severity `blocker` | red |
| `obligations` | `required` + `sourceCredits` > 0 | amber |
| `clear` | assets were checked and nothing is owed | green |

`nothing_recorded` says, in the body text: *"this is not a clearance to publish."* Its
tone is muted, not green — an unknown is not drawn as a success. `commercialUse.checked`
is the only evidence the browser gets that the ledger was ever written to, so it is
what separates the two.

Ordering matters for the same reason: a blocker outranks any number of credits, so a
project that cannot ship never leads with a tidy credit count.

## The surface

An icon button in the workspace topbar, not a fourth named control beside Roadmap and
Checkpoints. This is read once, near the end, and giving it that weight would put a
rare pre-publish check in front of the thing people came to do. §16.3's rule about not
using a large form where a small one is better, applied to a control rather than an
illustration.

The icon is a new canonical `licence` — a document with a seal. Deliberately not
`shield`, which already means Admin, and not `docs`, which means the manual; reusing
either would be the icon ambiguity §16.3 names.

The panel is mounted only while the drawer is open, so the request happens when a user
asks the question rather than on every workspace load for everyone who never will.

## What it says, and what it refuses to say

- **Unaccounted assets are named**, under a heading that says Golem cannot account for
  them, with the explicit note that this is *not* a claim they are unusable — only
  that Golem cannot tell you either way. The alternative, hiding them, is what made the
  original bug invisible.
- **Modifications are stated either way.** `creditLine` writes `(as published)` rather
  than leaving a blank, so an unmodified asset is distinguishable from one whose
  modifications were never recorded.
- **A refused clipboard is not drawn as a success.** The copy button flips to "Copied"
  only on the promise's resolve; a rejection leaves it alone rather than showing a tick
  for something that did not happen.
- **The footer states the limit**: Golem records what it places, and cannot see
  anything the customer added in Studio themselves.

Nothing in the panel computes an obligation. The worker's report does that, and two
implementations of a licence rule would eventually disagree about somebody's real
project.

## Guards

`apps/web/tests/credits-model.test.mjs`, 7 tests. The first is the one that matters:

```
✔ an empty ledger is "nothing recorded", never "clear to publish"
✔ an actually-empty-but-checked project is clear, and says how many it checked
✔ a blocker outranks any number of credits
✔ warnings alone are obligations, not blockers, and say publishing is not blocked
✔ a source credit counts as an obligation even with no licence-required entries
✔ a credit line says whether the asset was modified, rather than leaving it blank
✔ the pasteable block is empty when nothing is owed, not a heading with no entries
```

The fifth exists because counting only `required` would silently drop Poly Haven's
source credit, which its licence does not require but which still has to ship.

The mock fixture is deliberately the awkward state — one blocker, one credit owed, one
CC0 courtesy, one unaccounted — rather than the happy path. The empty and clean cases
are one line each in the tests; a fixture is for the state that is hard to reach by
hand and easy to draw wrong.

## Verified in the browser

`/app/projects/p-tycoon?mock=1`, drawer open. Section order as rendered:

```
Cannot ship commercially | Golem cannot account for these | Credits to ship |
Obligations attached | No credit required
```

Red verdict banner with the I02 mark, blocker with its remediation, the unaccounted id
rendered as "Roblox asset 7042118891" rather than the internal sentinel, the credit
line with its modifications, and the footer stating what Golem cannot see.

`pnpm --filter @golem/web test`: 239 tests, 0 failures. `typecheck` clean.
