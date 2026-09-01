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

**Not covered:** contrast ratios, screen-reader narration order, and the other routes
(dashboard, roadmap, usage, settings). This was the workspace, which is where a user
spends their time.
