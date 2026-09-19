# Customer review — 2026-09-18, round 22

Observed: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used a fresh temporary Chrome tab (`1045984444`) against the deployed Apple workspace in the
already-authenticated session. I set that tab to a 390×844 mobile viewport and inspected one
existing project with a prior Studio run and saved conversation history. I collapsed the mobile
Studio stage to reach the conversation, expanded and collapsed the historical Activity disclosures,
and scrolled through the run details to the long script/action paths.

This was read-only. I did not submit a prompt, regenerate, copy text, open an attachment picker,
change preferences, spend Credits, pair or touch Studio, publish, delete, or edit anything. I did
not copy or reproduce private message contents. A read-only DOM check found no code/pre block and no
copy-labelled control in this fixture: it exposed prose and Activity text only. The previously
documented missing web code artifact is not scored as a new finding here. I did not re-score the
known image-expiry, public-plugin, or paid-preview
findings. The viewport override was reset and the temporary tab was closed after the review.

## What was clear in the checked journey

- At 390×844, the mobile header kept the navigation button, project title, `Studio ↗`, and
  `Project +` controls visible.
- The Studio stage exposed an accessible `Collapse project stage` control. After collapsing it,
  the conversation and composer were reachable without leaving the project.
- Both historical run disclosures were usable through the accessibility tree: each was announced
  as `Activity` with an explicit expanded/collapsed state and an `Expand`/`Collapse` action. The
  result also exposed a labelled `Regenerate` control with a warning tooltip. I did not activate it.
- The page itself stayed 390px wide (`body.scrollWidth === body.clientWidth`); the overflow below
  is inside the conversation/run-details surface, not a full-page horizontal scroll.

## New findings

### P2 — Expanded Activity overflows horizontally and clips run details on mobile

**Repro:** At a 390×844 viewport, open one existing project, collapse the Studio stage, expand a
historical `Activity` disclosure, and scroll down through its completed actions.

**Observed:** The conversation’s scroll surface was 379px wide but had 478px of horizontal content
(`scrollWidth`), while the page remained 390px wide. Long script/object paths visibly ended at the
right edge in the mobile screenshot; the inner horizontal scrollbar appeared at the bottom of the
conversation. The accessibility tree still exposed the full action strings, but the rendered view
did not wrap them into the available width.

**Impact:** A creator checking whether a generated script or inspection step completed cannot read
the full path at a glance on a phone. The low-visibility horizontal scrollbar is easy to miss. This
is a mobile presentation defect in the run evidence, separate from whether the underlying Studio
work succeeded.

**Suggested fix:** Let long action/path tokens wrap or truncate with an explicit reveal action; ensure
the conversation flex child has `min-width: 0`; and keep any intentional horizontal-scroll affordance
clearly inside the run-details panel rather than beneath the fixed composer.

### P2 — `Jump to latest` overlays the composer at the mobile breakpoint

**Repro:** At the same viewport, expand Activity and scroll away from the latest position so the
`Jump to latest` control appears.

**Observed:** The accessible `Jump to latest` button was rendered at `(x=131, y=615, w=128, h=39)`.
The composer input occupied `(x=13, y=612, w=364, h=64)`, so the button overlapped the input’s top
36px. The screenshot showed the pill sitting on top of the composer placeholder while the
conversation’s horizontal scrollbar was immediately above it.

**Impact:** The control obscures the typing affordance and can intercept a tap intended for the
composer. The customer must first understand that the pill is separate from the composer, then
avoid the overlap while trying to start a new message.

**Suggested fix:** Reserve a bottom inset for the jump control, or anchor it inside the conversation
viewport above the composer with a non-overlapping gap. Re-check at 320–390px widths while Activity
is expanded and while the composer has focus.

## Verdict

The run disclosures are semantically clear and keyboard/screen-reader discoverable, and the mobile
header and stage collapse affordance work. The checked conversation is not mobile-ready for detailed
run inspection: expanded Activity produces a wider-than-viewport surface, and the latest-jump pill
overlaps the composer. These are fresh layout/interaction issues in this narrow journey; no claim is
made here about code correctness or the Studio result itself.

## Coverage limit

This covered 100% of the requested existing-project/mobile conversation slice, but far below 1% of
the whole product. I did not test a new project, prompt/build, code generation, copy/download,
files, billing, settings, navigation drawer, pairing, or Roblox Studio behavior. No account or
project state was changed.
