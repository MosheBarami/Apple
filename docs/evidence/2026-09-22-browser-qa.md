# Browser QA against production — 2026-09-22

Run against the **deployed origin** (`https://apple.moshe-barami111.workers.dev`), not a local
build, so what was measured is what a customer gets. Read-only: the sweep navigates, measures and
screenshots; the one probe that submits anything types into the landing composer and presses Build,
which is a GET to `/app/signup`.

**Artifacts:** `docs/evidence/2026-09-22-browser-qa/` — 32 screenshots and `report.json` (every run,
every measured value). Harness: `/tmp/prod-qa.mjs` (scratch, not committed).

```
36 runs   320x720 · 390x844 · 768x900 · 1440x900
          dark · light · LTR · RTL · prefers-reduced-motion: reduce
          /  ·  /pricing  ·  /app
```

| check | result |
|---|---|
| horizontal scroll (document wider than the viewport) | **0 failures / 36 runs** |
| elements past the viewport edge | **0** |
| animations still running under `prefers-reduced-motion: reduce` | **0 / 4 runs** |
| keyboard: tab stops reached | **30**, in DOM order, visible when focused |
| text below WCAG AA | **12 distinct** — see findings |
| focusable controls with no visible focus ring | **1** — see finding 2 |

The landing page never scrolls sideways at any of the four widths, in either direction, in either
theme. RTL does not break the layout. The site genuinely honours `prefers-reduced-motion`.

---

## Finding 1 — `--nm-faint` failed AA on the account screens. FIXED AND DEPLOYED.

`p.auth-switch` ("New here? Create an account", 13px) measured **3.94:1** where 4.5:1 is required.
The colour resolved to `rgb(111,111,111)` on `rgb(10,10,10)` — not `--muted`, which is what the
rule appears to ask for. Tracing it to `routes/nonworkspace-minimal.css`, the whole `--nm-*` set was
below the floor:

| | before | on | ratio | after | ratio |
|---|---|---|---|---|---|
| dark `--nm-faint` | `#6f6f6f` | `--nm-panel` `#0a0a0a` | 3.94 | `#8a8a8a` | 5.88 |
| dark `--nm-faint` | `#6f6f6f` | `--nm-panel-soft` `#101010` | 3.79 | `#8a8a8a` | 5.51 |
| light `--nm-faint` | `#858581` | `--nm-panel-soft` `#f1f1ef` | 3.28 | `#6b6b67` | 4.73 |

It is 10–13px everywhere it appears — timestamps, card meta, counts, placeholders — all normal text,
so the 3:1 large-text floor was never available to it.

**The light failure was invisible to this sweep.** The app serves `data-theme="dark"` to a
first-time visitor regardless of the OS setting, so `colorScheme: light` still rendered the dark
palette on every `/app` run. 3.28:1 was found by reading the token, not by looking at the page.

**Why it survived:** `apps/web/tests/contrast.test.mjs` reads `src/design/system.css` and the site's
stylesheets. It never read `routes/nonworkspace-minimal.css`, so the app's *second* palette was
unguarded. The guard now discovers the `nm-*` ink and panel tokens, measures every ink against every
panel in both themes, and asserts the ramp still descends.

Falsified red-first: restoring `#6f6f6f` turns **exactly one** test red —
`dark: the --nm-* ink ramp clears 4.5:1 on every panel it is drawn on` — and restoring the fix
returns 15/15. Web suite **2072/2072**. Re-probed against production after redeploying the SPA:
**zero** AA failures on `/app`, where the sweep had found two.

## Finding 2 — the landing composer shows no focus ring. NOT FIXED: `apps/site`, in flight.

The only control on the page with no visible focus indication is the textarea in the landing hero.

Measured after a real `Tab` keypress, not a programmatic focus:

```
:focus-visible matches        true
outline-style                 none   (outline-width is 3px — declared, and painting nothing)
box-shadow                    none
border-color                  unchanged
computed style changed?       no
```

So focusing the primary input on the front page produces **no visual change at all**. That is
WCAG 2.4.7, on the first control a stranger touches. The trap is that `outline-width: 3px` is
present and `outline-style: none` means nothing is drawn — a check on width alone would pass it.

The composer itself is **real, not dead UI**: typing "make a twelve-stage obby" and pressing Build
navigates to `/app/signup?start=make+a+twelve-stage+obby`, carrying the prompt into registration.
Verified, so the fix is a focus style, not a removal.

Not fixed here because `apps/site` is being rewritten in place by another worker (`pricing.astro`
written 19:45:48 today, three more files at 18:26, and the landing E2E spec is itself uncommitted
and red). Editing it would race that work, and the site was deliberately not deployed.

## Finding 3 — 10 × `.micro` labels at 4.35:1. NOT FIXED: `apps/site`, in flight.

Ten distinct 10px labels on `/` and `/pricing` — `proof-caption`, `proof-ask-label`, `proof-state`,
`built-label`, `screen-inventory` — sit at **4.35:1** against a 4.5:1 requirement. Identical at every
viewport and in both themes, so this is a token, not a responsive defect. Same file, same lane, same
reason as finding 2.

---

## What this sweep cannot see

Stated because a green row above is not a green claim.

- **Contrast over images and gradients.** The background is resolved by walking ancestors to the
  first opaque `background-color`. A gradient, a canvas, or a texture is invisible to it, and the
  landing hero's type sits on exactly that. `tests/e2e/landing.spec.ts` samples rendered pixels for
  this reason; this sweep does not.
- **The app's light theme.** Unreachable for a first-time visitor, as finding 1 shows.
- **Anything behind authentication.** `/app` was measured as a signed-out stranger sees it. The
  workspace, composer, reasoning card and Studio panels were not reachable from here.
- **The landing composer's focus ring** needed the targeted probe above; the generic sweep found it
  but could not say why, and the reason decides whether it is a styling bug or dead UI.
- **Two of the three findings are in `apps/site`, which was not deployed.** They are defects in the
  working tree and, for the `.micro` labels, in what is live today.

## Correction to the first run

The first pass of this harness reported **76–139 elements past the viewport edge** and **53–81
animations running under reduced motion**. Both were the instrument, not the page, and both were
fixed before anything was concluded:

- *past the edge* counted elements hanging outside the viewport inside a horizontal scroller or an
  entrance transform, on pages whose document scroll width was never wider than the screen. It now
  reports only when the document actually overflows, and its job is to name the culprit.
- *animations* counted declared `transition-duration`, which fires on state change and is not
  running. It now counts only animations with a name, a non-zero duration and a play state that is
  not `paused`.

It also had a key collision that overwrote the run labels, so the reduced-motion runs were
indistinguishable from the others. The numbers above are from the corrected harness, and the
corrected run is the one that reported 0 and 0.
