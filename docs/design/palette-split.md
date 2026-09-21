# One product, two palettes, and the layer that was reading both

**Found 2026-09-21 by the design lane, measured on the live origin rather than read out of a
stylesheet.** This file records the finding and names what is still a decision. It does not make
that decision. `docs/DESIGN-TYPE.md` already carries the type, WebGL and rosebud decisions and is
not repeated here.

## The measurement

`getComputedStyle(document.documentElement).getPropertyValue('--accent')`, taken against
`https://apple.moshe-barami111.workers.dev` in a real Chromium, with the site's own theme switch
driven through `localStorage['apple-theme']`:

| surface | stylesheet | `--accent` dark | `--accent` light |
|---|---|---|---|
| `/` | `apps/site/src/styles/landing.css` | `#00d492` | `#00694a` |
| `/proof`, `/pricing`, `/docs/*`, `/status`, `/changelog`, `/terms`, `/privacy`, `/404` | `apps/site/src/styles/global.css` | `#f4f3f2` | `#292929` |

`#f4f3f2` and `#292929` are the ink. They carry no hue at all. **One route of nineteen is painted in
the brand colour.**

Both are deliberate and neither is a mistake in itself:

- `global.css` is the **warm-dark redesign of 2026-09-19**, and its own header says so: "The bar is
  tesana.ai, measured in Chrome." A monochrome charcoal system where hierarchy comes from size and
  space, which is also what `docs/DESIGN-LOCK.md` locked.
- `landing.css` is the **rosebud-in-green pass of 2026-09-20**, written the next day against the
  owner's instruction to follow rosebud.ai closely *in our own green*, deleting the current visual
  language where the two disagree and keeping only the typeface.

They are one version apart, and the second was never carried past the front page.

## What was fixed, and it is the part that is not a taste question

`components/Horizon.astro` is rendered by **both** layouts and painted in `--accent`, so a single
composition came out green on the landing and white one click later — from one line of code, with
nothing able to notice, because the token *name* agreed in both files and only its value did not.

It now reads `--horizon-key`, which `global.css` declares as the brand green in every theme block
and `landing.css` does not declare at all. The landing falls through to its own accent and not one
pixel of it moves; the other eighteen routes get the brand colour in the one layer that exists to
carry atmosphere, behind the 0.45 veil they already apply.

`--accent` is untouched, and the separation is the point: an accent is what controls are painted in
and owes contrast to the text on top of it, while this owes nothing to anybody. Tying the two
together is what produced the split.

Guarded by three tests in `apps/site/tests/horizon-runs.test.mjs`, each watched failing on its own
mutation — including one that checks `global.css` still *declares* the key, because the other two
stub `getComputedStyle` and stayed green when every declaration was deleted.

## What is still open, and it is a decision rather than a task

**Should the other eighteen routes be repainted in the brand green?**

The owner's own words sit on both sides of this:

- 2026-09-20, in Hebrew, about rosebud.ai: *"you must copy them exactly, only in green — this is a
  very aggressive decision … if it means deleting the current visual language of the site, do it
  without asking; only keep the typeface."* The later instruction, and unambiguous.
- `docs/DESIGN-LOCK.md`, locked the same day: "cinematic graphite … a **single restrained** green,
  hierarchy from size and space rather than weight or colour", with "no random visual mixing" named
  as the rule the file exists to enforce.

Those are reconcilable — "restrained" is not "absent" — but reconciling them is a design pass over
eighteen routes, not a token swap. `--accent` is aliased by `--seam`, `--clay`, `--stone`, `--rune`,
`--mode` and `--gl-key` in `global.css`, so changing that one line turns illustration fills, glyph
keys and section seams green at the same time. Measured, not guessed: six aliases in that file.
The cheap version of this instruction is how a page ends up technically compliant and ugly, which is
the outcome the owner has rejected more than once.

**It is now observable, which it was not.** `scripts/check-pixels.mjs` captures all twenty routes at
two viewports in *both* themes against a baseline from the live origin, so whoever takes this pass
can see all eighty frames before and after instead of arguing about two.
