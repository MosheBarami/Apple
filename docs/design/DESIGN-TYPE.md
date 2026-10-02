# The type decision, and the two design decisions beside it

Three rows of the outstanding ledger ask for a decision rather than for code. This file is the
decision, with the measurement behind it, so that the next person to read the stylesheet and the
next person to read a memory file are reading the same thing.

Written 2026-09-21. Every number here was measured on that day and the command that measured it is
given, so a later reader can re-run it rather than trust it.

---

## 1. Type: the system stack is final, and both halves of the site now spend it

**The row.** `typography-system` — "large high-craft headlines, excellent readable body text,
monospace for technical content, selective kinetic typography and variable-font motion where
valuable." Its recorded next step was: decide in writing whether the system stack is the final
answer, or ship one self-hosted variable display face, and stop leaving the memory and the
stylesheet disagreeing.

**The decision: the system stack stays. No webfont.**

The stack is

```
-apple-system, BlinkMacSystemFont, 'Inter', system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif
ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
```

Three reasons, in the order they actually decide it.

1. **The owner's one standing instruction about type is to keep ours.** It is in the same sentence
   as the instruction to delete the rest of the visual language: *"…only keep the typeface."* A
   self-hosted display face is the one change that sentence forbids.
2. **The payload has no room for it.** `node scripts/check-landing-budget.mjs` measured the landing
   route at **21,042 B gzip against a 12,000 B budget** at commit `8b61c91`, before any of tonight's
   work — the budget was already exceeded by 75%. One variable display face at a usable subset is
   another request and another 20–40 KB, to replace a stack that resolves to SF on the owner's own
   machine and to Segoe or Inter everywhere else.
3. **A webfont buys a flash of unstyled text on the one page whose whole job is a first
   impression.** `font-display: swap` reflows the headline after the reader has started reading it;
   `font-display: block` shows them nothing for up to three seconds. Neither is better than SF.

**What was actually missing, and is now fixed.** Not the faces — the *system*. `global.css`, which
dresses `/docs`, `/pricing`, `/changelog`, `/status` and the legal routes, has declared
`--font-display`, `--font-body`, `--font-sans` and `--font-mono` since the warm-dark pass.
`landing.css` does not import it and had **spelled the same two stacks out nine times**: the sans
once on `body`, the mono eight times across the activity log, the step figures and the four
capability stages.

That is not a missing system. It is a system on one half of a site and nine chances to drift on the
other — and the drift is invisible: change the mono stack for the docs and the landing keeps the
old one, so two pages of one site set code in two different faces and a screenshot of either looks
correct.

`landing.css` now declares the four tokens with values character-identical to `global.css`'s and
spends them everywhere. **Nothing renders differently**, and that was measured rather than assumed:
the computed `font-family`, `font-size`, `line-height`, `letter-spacing` and `font-weight` of all
**303 elements** of the landing page were compared between the deployed build (literals) and the
new build (tokens). **Zero differed.**

`apps/site/tests/type-system.test.mjs` holds it: every `font-family` in every stylesheet and every
component `<style>` must spend a token, and where two sheets declare the same token they must
declare the same value. It pins no face, because which faces are in the stack is this document's
decision and a guard that pinned it would go red the day the decision is revisited rather than the
day the system breaks.

**Kinetic typography and variable-font motion.** Kinetic type ships and is deliberate: the hero
composer cross-fades three typed sentences with one `@keyframes` and no script, and each step of
"How a run actually goes" brightens on a scroll-driven timeline. Variable-font *axis* motion does
not ship and cannot, because a system stack exposes no reliable variable axis — that is a cost of
decision 1 above, and it is named here rather than left as an unexplained gap.

**Where this disagrees with memory.** `~/.claude/.../memory/golem-visual-direction.md` is outside
this repository and is not this lane's to edit. If it still describes a webfont, this file is the
newer decision and the stylesheet agrees with this file.

---

## 2. WebGL: the canvas stays 2D, and that is a decision rather than an omission

**The row.** `webgl-marketing-experience` — "real-time scenes, responsive camera, lighting,
controlled particles, interactions, scroll-linked moments and high-quality fallbacks; both
real-time 3D and pre-rendered cinematic sequences."

**The decision: real-time drawing yes, a WebGL context and a 3D library no.**

What ships today against that list:

| asked for | what ships | where |
|---|---|---|
| real-time scene | a perspective floor, a glow band and 110 drifting particles, redrawn every frame | `components/Horizon.astro`, 2D canvas |
| responsive camera | the vanishing point eases toward the pointer | same |
| lighting | the sky particles are lit by the glow band; alpha falls off with distance from it | same |
| controlled particles | 110, capped, paused on a hidden tab | same |
| interactions | a wireframe mesh you drag to turn, on the fourth capability stage | `pages/index.astro`, 2D canvas |
| scroll-linked moments | the step list and the activity log run on `animation-timeline: view()` | `landing.css` |
| high-quality fallbacks | reduced motion draws one finished frame; a refused context leaves an SVG still; no 2D context draws nothing and shows what is behind | all three |
| pre-rendered cinematic sequence | **does not ship** | — |

**Why not a WebGL context.** `scripts/check-landing-budget.mjs` carries a tripwire for a three.js
chunk anywhere in `dist`, because the 3D mascot was cancelled by the owner and the tripwire is what
stops it coming back. Reintroducing a 3D library to this page would trip a guard that exists to
enforce a decision the owner has already made, and it would do it on the route that is already over
its payload budget. Hand-projecting sixteen edges costs nothing and is what the fourth stage does.

**Why not a pre-rendered cinematic sequence.** A cinematic sequence is a video of the product. We do
not have footage of the product doing anything that is not also a claim, and a rendered sequence
that depicts a build nobody watched is precisely the thing the rest of this repository exists to
prevent. When a real recorded run exists — `docs/evidence/` is where they land — that is the asset
to cut, and it will be a recording rather than a render.

**This may be a reversal, and it is worth saying so plainly.** The reference the owner named on
09-20 has, measured, zero `@keyframes`, zero running animations and zero `<canvas>`. He was shown
that measurement and asked for the opposite anyway, so the motion is the brief. But "3D/WebGL as a
major part of the marketing experience" and "copy rosebud closely" cannot both be taken to the
letter; what ships is the first read through the second's restraint.

---

## 3. rosebud: what was taken, what was not, and the one thing that was not measured

**The row.** `rosebud-in-green` — follow rosebud.ai closely in our own green, walk every page and
component, take a full HAR, adopt their look and their button click-sound, delete our visual
language where the two disagree, keep our typeface.

**What was measured, and it was not rosebud.** `packages/corpus/data/ui-references/web-landing.json`
carries sixteen claims under the id `rosebud-ai-design-language`, taken by walking a live DOM with
`getComputedStyle`, plus nineteen derived rules. The *geometry* the current page is built on —
1024px shell behind a 32px gutter, four quantised control heights, an 8px radius, two transition
bands — is cited throughout `pages/index.astro` and `landing.css` against that file.

**The HAR he asked for was not taken, in this session or any recorded before it.** That is a gap,
not a decision. It is stated here rather than left to be discovered because "adopt their look" has
been reported as done four times against a measurement whose provenance is one DOM walk.

**What was deliberately not taken, which is the harder half.** Most of the reference's page area is
social proof: play counts, hearts, a populated gallery of other people's games. We have none of
those. Reproducing the shells with placeholder numbers would make the page a lie in exactly the
shape this repository exists to prevent, so those sections are absent rather than empty.

**The click-sound ships.** `layouts/InterfaceSound.astro` is one synth, one stored preference and
one listener for the whole site, and `layouts/SoundDock.astro` is the control on the landing.

---

## What is still open in the design rows after this

- `loading-is-branded-and-honest` — the branded loading sequences live in the signed-in app, and
  photographing them needs an authenticated session. The owner has to sign in once in his own
  browser; no lane can do it for him. **Open, and owner-blocked.**
- `rosebud-in-green` — the HAR above. **Open.**
- `exceptional-original-visual-identity` — not a checklist item. The four capability stages and the
  cursor are reach rather than polish, which was the diagnosis; whether it lands is the owner's
  line to write and nobody else's.
