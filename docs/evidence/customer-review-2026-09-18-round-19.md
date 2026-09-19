# Customer review — 2026-09-18, round 19

Fresh-context, read-only ordinary-customer pass of the live Apple site in Chrome via `cua_repl`.
Scope was `/app/settings`, workspace navigation, help/documentation discovery, keyboard access on
those surfaces, and whether the visible explanations match the visible capability.

No existing project or Studio place was opened. No build was submitted. No preference, payment,
upload, delete, publish, key, or connection action was performed. The signed-in account showed
`231 of 231` daily Credits and a very large extra-credit balance; the owner explicitly granted
that extra balance, so it is not treated as an ordinary-customer quota defect here.

## Reproduced, actionable findings

### R19-01 — Settings has no discoverable Docs/Help route (P2)

Reproduction:

1. Open `https://apple.moshe-barami111.workers.dev/app/settings` while signed in.
2. Inspect the workspace rail and then open the Conversations drawer.

The accessible navigation exposes Projects, New chat, Usage and Credits, Settings, and the
account/notification controls in the drawer, but no Docs, Help, or Status destination. A read-only
DOM check found zero anchors whose `href` contains `/docs` on `/app/settings`. The Projects list
(`/app`) does show a “Read the docs” link in its plugin-availability banner, but a customer already
in Settings or Usage must first discover their way back to Projects or know the URL.

Impact: when a customer is changing a setting or trying to understand a permission, help is not a
visible next step. Add a persistent Docs/Help (and, ideally, Status) destination to the signed-in
workspace navigation or Settings footer.

### R19-02 — Status troubleshooting paths are plain text, not links (P2)

Reproduction:

1. Open `https://apple.moshe-barami111.workers.dev/status`.
2. Read the two Known issues cards.

The “What to do” text says `See /docs/plugin`, `see /docs/troubleshooting`, and `check /docs/plugin`,
but those strings are not link roles in the accessibility tree. The keyboard focus trace goes from
the status refresh button to the mail link and footer links; it never offers the issue-specific
instructions. A read-only DOM check found one `/docs/plugin` anchor (the footer link) and zero
`/docs/troubleshooting` anchors, confirming the Known issues references themselves are not links.

Impact: a customer cannot click or Tab from the incident they are reading to the fix. Render each
path as a real link with an accessible name (for example, “See plugin installation status”).

### R19-03 — Daily and monthly Credit copy is internally ambiguous (P2, copy/contract risk)

The live surfaces repeat the same figures:

- `/app/usage`: `231 of 231 Credits of allowance remaining today`; Free plan `2,310 Credits · up to 3 builds a day`.
- `/pricing`: `231 Credits per day · 2,310 a month`.
- `/docs/credits-and-limits`: `Free plan: 231 Credits per day · 2,310 a month`, while the same page says quotas reset at midnight UTC and unused Credits do not roll over.

If `2,310 a month` is an enforced monthly cap, it conflicts with a full 231-credit allowance
resetting every day (the monthly figure is only ten daily allowances). If it is only a build-volume
estimate, the “Credits a month” wording presents it as a quota rather than an estimate. This is
reported as a customer-facing explanation problem, not as proof that the backend is mis-metering.

Impact: a free customer cannot tell whether the daily allowance is available every day, whether
there is a second monthly ceiling, or whether 2,310 is merely a rough conversion. Label the monthly
number explicitly as an estimate, or explain the interaction with a real monthly cap.

### R19-04 — Workspace skip link does not skip the workspace rail; current route is not announced (P2, keyboard/AT)

Reproduction on `/app/settings`:

1. Reload the page and press `Tab` to “Skip to content”.
2. Press `Enter`, then press `Tab` once more.

The URL becomes `/app/settings#main-content`, but the next focused element is the `Apple —
projects` workspace link, not the Settings heading or Settings search field. `#main-content` is the
outer wrapper that contains the workspace navigation, so the skip link does not skip that repeated
navigation. A read-only DOM check also found `aria-current` unset on both the current Settings link
and the Usage link (`aria-current: null`); the public Docs navigation does set `aria-current="page"`.

Impact: keyboard users still traverse the rail after activating “Skip to content”, and screen-reader
users cannot identify which workspace route is current from the navigation. Point the skip target at
the actual page content after the rail and mark the active workspace route with `aria-current="page"`.

## Verified positives / not bugs

- The public Docs overview, plugin page, getting-started page, Status page, and the Projects banner
  consistently disclose that public Studio installation is unavailable, while chat is available.
  No capability overclaim was observed there.
- Settings permission copy explicitly marks publish, live-server messaging, Creator Store, and other
  not-yet-used Roblox permissions; it also warns that uploaded images/decals cannot be deleted.
- Keyboard traversal reached Settings controls, the navigation drawer opened with `Enter` and closed
  with `Escape`, and the drawer kept focus inside itself. Docs search was reachable and its result
  links were keyboard traversable. FAQ disclosures expanded through their exposed accessibility
  action.
- No Studio/build quality claim is made: Studio and a place were intentionally not observed.

## Coverage boundary

This pass covered all four requested review areas (Settings, navigation, help/docs discovery, and
keyboard access) across the live workspace, public Docs, Status, Pricing, and Usage surfaces. It is
not a whole-product review; project conversations, Studio behavior, builds, payments, uploads,
deletion, publishing, and preference persistence remain untested by design.
