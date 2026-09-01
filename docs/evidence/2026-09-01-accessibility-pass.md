# Keyboard and screen-reader basics, checked in a browser

**Date:** 2026-09-01 · §28 of the master mission asks that *"accessibility/keyboard
basics are not broken"*. Nothing had checked. This is that check, run against the
workspace at `/app/projects/:id` in a real browser.

## The static audit

Measured off the live DOM, not read out of the source:

| | |
|---|---:|
| focusable elements | 36 |
| buttons | 26 |
| **buttons with no accessible name** | **0** |
| images with no `alt` | 0 |
| SVGs neither `aria-hidden` nor labelled | 0 |
| inputs with no label, `aria-label` or placeholder | 0 |
| `aria-live` regions | 3 |
| landmarks (`main`/`nav`/`header`/`footer`) | 10 |
| `<h1>` elements | 1 |

Twenty-six buttons and not one unlabelled is the number worth pausing on — icon-only
buttons are where this normally goes wrong, and the workspace is full of them.

Three `:focus-visible` rule sets exist, including a workspace-scoped one, so the focus
ring is styled rather than inherited from the UA default and then suppressed.

## The modal, which is where this usually breaks

Driven through the Checkpoints drawer with real events:

| step | result |
|---|---|
| open | `role="dialog"`, `aria-modal="true"`, `aria-label="Checkpoints"` |
| focus on open | moves **into** the panel |
| `Escape` | closes it |
| focus after close | returns to the **button that opened it** — not `<body>` |

The last row is the one that is easiest to lose and hardest to notice: it lives in the
effect's cleanup in `ws/primitives.tsx`, and a refactor can drop it while everything
still looks right. What a keyboard user gets then is focus on `<body>`, so the next Tab
starts from the top of the document and they walk the whole page back.

Reading the primitive afterwards, the Tab trap handles Shift+Tab as well as Tab, the
scrim is a real `button` with `tabIndex={-1}` and `aria-hidden` rather than a clickable
div, and the keydown listener is removed on close — a leaked one would keep firing
`onClose` and close whatever opened next.

## Disposition

**§28's accessibility item: PROVEN for the workspace.** Not broken, and better than
"not broken" in the places it usually is.

`apps/web/tests/drawer-a11y.test.mjs` is the ratchet — eight assertions against the
primitive's source, because the behaviour needs a DOM these tests do not have. The
browser pass above is the evidence; the test is what stops it regressing silently.

## The other four routes, and two findings that were mine

The sweep was extended to `/app`, `/app/projects/:id/roadmap`, `/app/usage`,
`/app/settings` and `/app/ui-lab`:

| route | buttons | unlabelled | bare SVG | unlabelled input | `<h1>` |
|---|---:|---:|---:|---:|---:|
| dashboard | 7 | 0 | 0 | 0 | 1 |
| roadmap | 25 | 0 | 0 | 0 | 1 |
| usage | 4 | 0 | 0 | 0 | 1 |
| settings | 6 | 0 | 0 | 0 | 1 |
| ui-lab | 10 | 0 | 0 | 0 | 1 |

**Clean everywhere. It did not look that way at first, and both apparent defects were
the audit being wrong rather than the code.**

The first pass reported *"settings: 1 unlabelled input"*. The input is
`<input type="checkbox" id="training-opt-in">` wrapped in a `<label>` — a valid
implicit association that computes an accessible name correctly. My check looked only
for `label[for=…]` and could not see a wrapping label.

The second reported *"roadmap: 18 bare SVGs"*. All eighteen sit inside
`<span className="rm-weight" aria-hidden="true">`, and `aria-hidden` hides the whole
subtree. My check asked each `<svg>` for its own attribute and never looked up the
tree. Corrected to `!!e.closest('[aria-hidden="true"]')`, the count is **0 of 48**.

Both were caught by looking before fixing. Either "fix" would have added a redundant
attribute and, worse, been written up as a defect this code never had — which is the
same overstatement class as calling code existence execution, pointed at someone else's
work instead of my own.

**Not covered:** contrast ratios and screen-reader narration order. Those need a real
assistive-technology pass, not a DOM audit.
