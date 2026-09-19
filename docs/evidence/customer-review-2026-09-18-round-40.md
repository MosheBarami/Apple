# Customer review — 2026-09-18, round 40

Observed: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used one fresh temporary Chrome tab (`1045984520`) against the deployed Apple site and read
`/docs/connect` and `/docs/modes`. This was a bounded, read-only newcomer review focused on what
a person without an installed Studio plugin and on a free account can actually do today. I did
not sign up or sign in, submit a form, open a pairing dialog, connect Studio, send a prompt,
generate, download or upload, purchase, or change an account or preference. The temporary tab was
closed after the review.

## What the pages make clear

- The Connect page opens with a prominent warning: public plugin installation is currently
  unavailable; its steps are for people who already have a working Apple plugin; new customers
  can use chat but cannot build inside Studio yet; and there is no confirmed release date.
- The same page accurately explains the consequence of no connection: the plugin panel remains
  `Not connected`, Apple cannot see or change anything, and the pairing flow is only relevant to a
  Studio window that already has the plugin.
- The Modes page says the selector chooses the Apple or Apple MAX product model. Apple is the
  limited free model, can answer questions, and has a free allowance of 231 Credits per day,
  subject to its monthly allowance. Its building tools require Studio to be connected and changes
  to be allowed.
- The Modes page explicitly says that without a connected plugin, a chat response is not a change
  to the Roblox place. That matches the Connect-page installation blocker.
- Apple MAX is described as paid-subscriber-only. The page says paid checkout is not open in the
  current preview; choosing MAX on a free account shows an availability notice, keeps the draft,
  and does not switch the model or charge the user. Extra purchased Credits do not grant a paid
  subscription.

## Fresh finding

### R40-01 — “Use chat” has no immediate newcomer path (P2)

**Repro:** Read the Connect-page installation warning, then the Modes-page free/paid explanation
and inspect the visible navigation.

**Observed:** The pages tell a new customer that chat is available even though Studio building is
blocked, but neither page provides a direct `Open chat`/`Try Apple` route or says whether an
anonymous visitor can chat or must create an account first. The only visible entry points are the
global `Sign in` and `Create an account` links. The docs also do not state what the first chat
screen is or what a free user should do after account creation.

**Impact:** The central current offer is understandable in principle — free chat, not Studio
building — but a newcomer who accepts that limitation still has to infer the next action and the
account requirement. The honest no-plugin/MAX disclosures therefore end in a small funnel gap:
the visitor knows what is unavailable, but not where to start the thing that is available.

**Suggested fix:** Add one direct, current CTA beside the “new customers can use chat” sentence
(for example, `Try Apple free`), pointing to the correct signup or chat entry, and state plainly
whether an account is required. Keep the existing no-plugin and no-checkout disclosures next to
that CTA.

## Verdict

This pass found the current product boundary much clearer than an ordinary newcomer would expect
from a generic “build in Studio” promise: no public plugin, no Studio edits for new customers,
Apple free chat with a stated allowance, and MAX unavailable while paid checkout is closed. The
remaining issue is practical rather than factual: after learning that chat is the only available
new-customer path, the docs do not give that visitor a direct next step or account requirement.

## Coverage limit

This is evidence from the two deployed public docs pages only. I did not verify signup, anonymous
chat access, the authenticated workspace, the usage screen, a real free-account MAX selection,
plugin installation, Studio pairing, or any generated result.
