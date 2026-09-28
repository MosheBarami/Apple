# Stranger's-eye review — 2026-09-22

Read of the **live** site (`https://apple.moshe-barami111.workers.dev`) as a prospective buyer.
Text extracted from the served HTML, not from source.

**Provenance, stated honestly:** this pass was made by someone who knows the internals, so it is
**not** a fresh-context review. A separate reviewer with no prior context was launched for that and
had not reported at the time of writing. What follows is therefore a *claim audit* — every
customer-facing statement about what the product can do, checked against what the product can do —
which is the part that does not depend on being naive.

---

## The honesty check, which is the one that matters

The plugin is not publicly installable. The site says so, repeatedly, in the places that matter:

**`/pricing`**
> Paid checkout is not open yet; the paid plans below describe the planned offering.

> Studio integration · **public installation removed by Roblox moderation, appeal filed**

> Roblox Studio plugin — **Public installation unavailable** *(in every column of the capability
> table, including the paid ones)*

> Apple cannot sell Credits in this preview — there is no checkout for them on any plan.

**`/docs`**
> **Public Studio installation is unavailable.** Building inside Studio requires an existing working
> plugin; new users should check installation status before following the setup guides.

> Otherwise, wait for an approved public installation path.

**`/`**
> It cannot publish, upload assets or run code inside the plugin.

**Verdict: a reasonable person cannot come away believing they can install this today.** The paid
tiers are labelled *planned*, the checkout is stated as closed on the pricing page *and* in the FAQ,
and the capability table puts "Public installation unavailable" in the same row as the paid plan
names. This is the opposite of the usual failure mode, where a preview product quietly implies
availability. Two guards already pin it: `the landing never links straight to an undistributable
store page` and `no copy on the landing promises the plugin is installable today`.

## Capability claims that are checkable, and check out

The landing page shows **real tool output with real values** rather than mock-ups:

> `get_project_tree` … ok · `render_view` eye · 288×180 ok · `inspect_visually` score 6/10 · 3 defects

`288×180` is inside the rasteriser's actual clamp (`48..320` × `32..240`), and `inspect_visually` is
one of the five registered verifier tools. The sample critique names **defects, not a verdict**:

> Floor is one flat slab — no material break · Two towers share an edge and read as one · Nothing
> marks where a player spawns

That matches the product's actual design (a visual gate that reports named defects). And the consent
claim carries a citation rather than an assurance:

> Record: docs/evidence/plugin-consent-verified-in-studio-2026-09-19

## One inconsistency the owner should decide on

**The site says installation is unavailable; the Creator Store listing now answers HTTP 200.**
Measured 2026-09-22 with controls (Rojo 7 → 200, Moon Animator 2 → 200, a garbage id → 404): the
listing flipped 404 → 200 between 2026-09-19 and 2026-09-22. `STUDIO_PLUGIN_STORE_LIVE` was
deliberately **left `false`** — a probe reports distribution, not cause, and the appeal window runs to
2026-10-19. Recorded in `2026-09-22-plugin-store-listing-flipped.md`.

The site is not lying: "removed by Roblox moderation, appeal filed" is accurate about *why* it went,
and installation being *unavailable* is accurate until the owner confirms otherwise. But if the
listing really is restored, the site is now **understating** the product, and the first impression
becomes "wait for an approved public installation path" when the path may already be open. That is a
decision only the owner can make, and it is a one-line change to `STUDIO_PLUGIN_STORE_LIVE` plus the
copy in nine files.

## What a stranger does get, and it is coherent

- **What it does:** writes and builds inside the Roblox place you already have open in Studio, naming
  every step while it happens, changing nothing until you say so.
- **The differentiator is stated as a behaviour, not an adjective:** "Individual writes stay in
  Studio's own Ctrl+Z history; restoring the checkpoint is the whole-run exit." That is a specific,
  falsifiable promise about reversibility, and it is the kind of claim that earns trust.
- **The cost is stated in the unit the product actually charges:** Credits per day, with "About 30
  quality-gated builds a month" for Free — a countable number rather than "generous free tier".
- **`/status` exists** ("Status & known issues") and is linked from the footer on every page.

## Not covered

- **Signed-in product surfaces.** The review stopped at the sign-in form; no account was created.
- **Whether the claims hold in use.** Nothing here tests that a prompt produces a working build — see
  `2026-09-22-studio-acceptance.md`, where the paired loop is explicitly listed as unproven.

---

# Fresh-context review (subagent, no prior context)

A reviewer with **no access to this repository, brief or conversation** read the live site. Its
verdicts, with the claims I independently re-verified marked ✅.

**A. What it is.** "Apple is an AI assistant that builds Roblox experiences for you, inside the
Roblox Studio project you already have open… for solo developers, hobbyists and small teams who want
to skip the boilerplate… Free tier exists, everything else is 'planned'." It read the paid state
correctly.

**B. Trust — mostly earned, and for an unusual reason.** It singled out `/proof`:
> The strongest trust signal is the /proof page: it publishes its own failures, not just successes —
> "I reached the step limit for this run", "1.3s ERROR checkpoint: Couldn't snapshot your project".
> That is the kind of thing a marketing page normally hides.

That is the opposite of the usual finding, and it matches the house style in this codebase. What
loses belief: **the evidence is self-authored and unverifiable** — "nothing links to an external
source, a third-party benchmark, or a user testimonial I could check."

**C. Honesty — passes, with one crack.** It concluded a reasonable person *would* come away thinking
installation is unavailable ("Public installation unavailable" is stated in every tier row on
`/pricing`). But it found a contradiction in *why*:

> The landing page says Roblox **has not approved** it for distribution (never approved); /pricing
> says public installation was **removed by Roblox moderation, appeal filed** (was live, then pulled).
> Those are two different stories about the same plugin.

**✅ VERIFIED.** `/` contains *"Roblox has not approved it for distribution."*; `/pricing` contains
*"public installation removed by Roblox moderation, appeal filed"* (three times, once per tier).
Both are live now. A reviewer who reads both pages gets two mutually exclusive accounts.

**D. Would it sign up?** No — "there is no working product to try" without the plugin. Its single
highest-value change: **a dated waitlist or an ETA**, instead of "wait for an approved public
installation path".

**E. Top 3, worst first**

1. **The CTA contradicts the page it sits on.** ✅ **VERIFIED.** `/pricing` carries a
   **"Start building — free"** button while the same page's tier rows say *"public installation
   removed by Roblox moderation, appeal filed"*. The reviewer: *"the headline says I can start
   building today, while the status section says I can't install the plugin at all."* (The landing
   page no longer has this CTA — 0 occurrences — so this is `/pricing` only.)
2. **Two naming systems collide.** The prose says *"Apple is the limited free tier. Apple MAX is for
   paid subscribers"* while the cards are named Free / Builder (planned) / Studio (planned) and a
   table row reads *"Apple MAX Model access — Not included / Included"*. Nothing on the page defines
   whether Apple MAX is a tier or a model.
3. **Unverifiable provenance** — as in B.

## What the two reviews agree on

Independently: the honesty about installation is genuinely good, the `/proof` page's publication of
its own failures is the strongest trust asset, and the paid/checkout state is stated clearly. The
one hard defect both passes surface is the **`/pricing` CTA contradicting `/pricing`'s own tier
rows** — a one-line copy fix with a real trust cost, and it is in `apps/site`, which was not
deployed from this session.
