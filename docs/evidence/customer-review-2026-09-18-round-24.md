# Customer review — 2026-09-18, round 24

Observed: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used one fresh temporary Chrome tab (`1045984455`) against the deployed Apple site at
`https://apple.moshe-barami111.workers.dev/`. I first read the public docs landing page,
`/docs/getting-started`, `/docs/modes`, and `/docs/credits-and-limits`, then freshly loaded the
authenticated workspace and inspected two existing projects: one without Studio and one with a
live Studio connection. I opened the model selector and inspected the Images/3D affordances.

For the draft-preservation check, I typed only `Temporary draft — do not send` into the composer,
opened the model menu, verified the draft was still present, and cleared it before leaving. I did
not send, generate, regenerate, select a different model, select Images or 3D, follow a paid route,
change a plan or preference, pair or touch Roblox Studio, upload, publish, or expose private content.
The temporary tab was closed after the review.

## What was clear in this pass

- The public model docs say the selector chooses Apple vs Apple MAX, Apple is the limited free
  model, and Apple MAX is for eligible paid subscribers. They also state that selecting MAX on a
  free account should open plan availability without silently switching or charging the account.
- The same docs explicitly say paid checkout is not open in the current preview.
- In both workspaces the model menu exposed `Apple Free · limited daily usage` and
  `Apple MAX Subscribers · not available yet`, with Apple Free selected.
- The Images affordance exposed `Images · MAX` and the help text
  `Images require Apple MAX; paid subscriptions are not available yet`, which matches the public
  availability copy.
- Opening the model menu did not clear the temporary unsent draft. After clearing it, Send was
  disabled again. No draft-loss issue was observed.

## Reproduced issue

### R24-01 — Connected free account presents 3D as subscribable while MAX checkout is unavailable (P2)

Repro:

1. Open an existing project with Studio connected while signed in to a free account.
2. Inspect the composer affordance row.

Observed: the connected project showed a normal, enabled-looking `3D` checkbox/label. The
accessibility tree did not mark it disabled, and its help text said `Subscribe to Apple MAX for
3D`. In the same view, the model menu said `Apple MAX Subscribers · not available yet`; the public
`/docs/modes` page says `Paid checkout is not open in the current preview`; and the adjacent Images
help correctly says paid subscriptions are not available yet. I did not activate 3D because this
review was read-only.

Impact: a returning free creator cannot tell whether 3D is available, gated by the current Studio
connection, or purchasable. The control looks actionable and tells them to subscribe, but the
product currently offers no subscription path. This directly contradicts the otherwise clear
model/Images availability copy and can send a free user looking for a checkout that does not exist.

Suggested fix: align the connected-state 3D label/help with the authoritative preview state (for
example, explicitly saying `3D · MAX — paid subscriptions are not available yet`) or use the same
non-actionable availability treatment as the MAX model option until checkout exists. Keep the
Studio-connected prerequisite wording for the disconnected state, which was accurate in this pass.

## Verdict

The model selector and Images copy make the free-vs-MAX boundary understandable, and the composer
does not lose an unsent draft when the selector opens. The connected-project 3D affordance is the
one fresh contradiction in this narrow journey: it advertises subscribing to a tier the public
docs and selector say is not available.

## Coverage limit

This was a bounded returning-user affordance review. I did not test the paid route, activate any
media control, send a prompt, generate media, pair Studio, or verify an actual 3D result. Public
plugin unavailability and paid checkout unavailability were treated as disclosed product blockers,
not new findings.
