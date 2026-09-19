# The locked design system

**Locked 2026-09-20.** The owner supplied seven references and asked for one direction carried
through the entire product with near pixel-level fidelity: *cinematic black/graphite surfaces,
restrained teal/green/blue light, premium glass/depth, exceptional typography and spacing,
professional concise copy, subtle Roblox/Studio DNA, and absolutely no clutter, hype, generic SaaS
styling, or random visual mixing.*

This file is what "no random visual mixing" means in practice. It is not advice. A change that
contradicts it is wrong even if it looks good on the screen it was made for, because the cost of a
second visual language is paid on every other screen.

## The direction that was chosen, and the six that were not

The chosen one is the **cinematic graphite** direction — near-black surfaces, a single restrained
green, hierarchy from size and space rather than weight or colour. `packages/corpus/data/
ui-references/web-landing.json` holds it measured off the live DOM rather than described: page
rgb(20,19,18), text rgb(244,243,242), every text node at weight 400, one hairline, 10px radius on
343 elements, a 60px transparent nav, a 1280px container.

Rejected, and why each rejection is also a rule:

- **The bright-blue floating-cards landing.** Big display type, tilted game cards, gradient. It is
  hype, and hype is the thing a fifteen-year-old's parent does not trust.
- **The black-and-gold marketing page.** "The First and Strongest", a claim we cannot measure. Gold
  on black is a second hue competing with the accent.
- **The light frosted-glass app.** The glass and the depth are worth taking; the light ground is
  not, because this product is used beside Roblox Studio's dark editor for hours.
- **The brutalist light landing.** A different product's confidence, not ours.
- **The blue-grey settings drawer.** Toggle-heavy, three switches asking a customer to make
  decisions the product should have made.

What is taken from the light app is **depth**: glass, a soft ambient ground, and the sense that the
composer is an object sitting on a surface rather than a box drawn on one.

## Colour

The ramp is in `apps/web/src/design/system.css` `:root` and does not move. Four surfaces and one
hairline do all the separating.

    --paper #141312   the page
    --paper-2 #171615 a well: inputs, code, anything recessed
    --surface #232221 a card, a panel, a menu
    --surface-2 #333231  a control on a card, a chosen row
    --surface-3 #3d3b3a  the highest step that exists
    --line            one hairline, everywhere

**Ink:** `--ink` for what you read, `--muted` for what qualifies it, `--faint` for metadata. Three,
not five.

**The accent is spent once per screen.** `--accent` (#8fd3ab dark / #15603c light) marks the ONE
primary action, the current nav item, a focus ring, or a live indicator — and nothing else. Two
green things on a screen means neither is the answer. `--accent-fill` + `--accent-on-fill` is the
solid primary button. `--accent-soft` and `--accent-line` are the 8%-and-under tints.

**Status colours** — `--good --warn --bad --info` — are for status a reader must act on, one per
panel at most. A panel that tints four things has told the reader nothing.

**No new hue may be introduced.** Not for a chart, not for a genre, not for a badge.

## Type

- **Nothing is bolder than 400.** Headings included. There is one exception in the tree, the Apple
  MAX wordmark, and it is a brand mark rather than typography.
- Hierarchy is **size, colour and space**.
- Letter-spacing is negative and grows tighter with size — about `-0.01em` at body, `-0.02em` at
  display — and turns **positive** (`.018em`) on 10–11px uppercase micro-labels.
- Line height 1.55 for prose, 1.4 and under for anything set at display size.
- `text-wrap: pretty` on any paragraph a customer reads.

## Shape, depth and space

- `--r-md` (10px) is the default radius. `--r-xs` (6px) for something smaller than a chip,
  `--r-lg` (16px) for a full-bleed panel, `--r-pill` for buttons and chips only.
- **Shadows are for things that float and nothing else**: `--shadow-pop` for a menu over content,
  `--shadow-modal` for a modal. A card does not cast. Separation is a hairline plus a surface step.
- Glass — `backdrop-filter` with a translucent fill — is reserved for the composer and the top bar:
  surfaces that sit over moving content. Everywhere else it is cost without meaning.
- Spacing runs on 4px. The common steps are 8, 12, 16, 24, 32.

## Motion

- `--t-fast` (120ms) for anything attached to the cursor: hover, press.
- `--t-base` (200ms) for a state change the reader is watching: a panel opening, a row committing.
- `--t-slow` (420ms) for something entering the page for the first time. Nothing is slower.
- `--ease-out` for entering, `--ease-in-out` for a state that will come back.
- **Every animation and transition is off under `prefers-reduced-motion: reduce`.** Not reduced —
  off. A rule that adds motion must add its own opt-out in the same commit.

## States, which is where products are actually judged

Every interactive element declares all five:

1. **rest**
2. **hover** — a surface step or a hairline brightening. Never a size change.
3. **focus-visible** — `2px solid var(--accent)` at `4px` offset. Never removed, never restyled per
   component. Keyboard users get the same product.
4. **active/pressed** — visible, and distinct from hover.
5. **disabled** — `opacity:.48` and `cursor:not-allowed`, and the reason is in a `title` or beside it.

Every surface that loads declares **empty**, **loading**, **error** and **success**, and each one
says what to do next. "No results" is not an empty state; "No projects yet — describe a game and
Apple will build it" is.

## Copy

Concise, specific, lower-case-after-the-first-word, no exclamation marks, no "Oops", no "Awesome".
A sentence in this product tells somebody what happened or what to do. It never sells.

## The rules an agent may not break

1. No colour outside the tokens. No raw hex in a declaration.
2. No `font-weight` above 400.
3. No new radius value. No shadow outside the two tokens.
4. Accent once per screen.
5. Every transition has a reduced-motion opt-out.
6. Focus is `2px solid var(--accent)` at `4px` offset, everywhere.
7. Works at 375px with a 16px gutter and no horizontal scroll.
8. Both themes. If a tint only reads on one, correct it under `:root[data-theme='light']`.
