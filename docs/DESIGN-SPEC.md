# Golem — approved visual direction

Transcribed from the two canonical reference images supplied 2026-08-31. Those
images are the source of truth; this file is a faithful written transcription of
them for anyone (or anything) that cannot see them.

Where this document and an older written description disagree, **this document
wins**.

---

## 0. Shared identity

> **Rewritten 2026-09-14.** Sections 0 and 1 described a warm charcoal landing
> with an amber accent, Inter throughout, and one screen that does not scroll.
> None of that was on the page any more, and two separate changes had left it
> behind: the warm palette went when Golem became Apple — `landing.css` says so
> in its own header, *"the previous warm palette (#0b0a09 ground, #c98a3c amber)
> belonged to Golem and is gone"* — and the single screen went when the owner
> supplied a five-section design (docs/DECISIONS.md ADR-019, ADR-020).
>
> That matters more here than in most files, because of the line six paragraphs
> up: *"where this document and an older written description disagree, this
> document wins."* A spec that claims precedence and describes a page nobody can
> open is worse than no spec — anyone following it faithfully would have undone
> two decisions on purpose. The transcription of the 2026-08-31 reference images
> that used to be here is not lost; it is what §3 still forbids, and the parts of
> it that survived are below.

### The mark

Unchanged, and the one thing that has never moved. A **hexagonal outline
containing an isometric cube**. Not a monolith, not a face, not a character.
Geometry only.

- Outer regular hexagon, flat-top orientation, stroked ~1.6px at 32px, never
  filled.
- Inside it the three visible faces of a cube: a vertical line from the top
  vertex down to the centre, and two lines from the centre out to the
  lower-left and lower-right vertices. This is the classic "cube in hexagon"
  isometric read.
- Stroke inherits the surrounding text colour. There is **no accent fill and no
  animation**. A mark that blinks or reacts is a mascot; the mascot direction
  is cancelled.
- Used at: ~26px beside the wordmark in the landing header, ~28px in the
  workspace rail, ~22px in the landing footer and as the assistant avatar.

### Palette

**Blue-black. Never warm.** This is the reverse of what this section said for
two weeks after it stopped being true.

| token | value | use |
|---|---|---|
| `--ground` | `#080A0F` | page base |
| `--ground-deep` | `#0A0C13` | panel bars, the deepest inset |
| `--surface` | `#10131C` | every card face |
| `--ink` | `#F3F5F9` | body and card titles — 16.8:1 |
| `--ink-bright` | `#FFFFFF` | the hero's first line only |
| `--ink-2` | `#B9C0CF` | card body copy — 10.2:1 on `--surface` |
| `--muted` | `#8D95A8` | section copy, all mono metadata — 5.9:1 |
| `--cyan` | `#38B6FF` | focus ring |
| `--blue` | `#2F7DFF` | marks: the eyebrow dot, list bullets |
| `--blue-soft` | `#6FA8FF` | links, eyebrows, step numerals — 8.2:1 |
| `--line` | `rgba(255,255,255,0.055)` | section seams |
| `--line-2` | `rgba(255,255,255,0.085)` | card borders |
| `--line-3` | `rgba(255,255,255,0.13)` | interactive borders |
| `--btn-grad` | `linear-gradient(135deg,#2563EB,#7C3AED)` | any fill under white type |

**The two gradients are different on purpose, and this is the part worth
reading.** The supplied design fills its primary button with its bright accent
ramp — `#38B6FF → #2F7DFF → #8B5CF6` — and labels it in white. Those stops
measure 2.26:1, 3.82:1 and 4.23:1 against white; a 14px label needs 4.5:1. It
looks completely fine. `--btn-grad` is the same hue path and the same 135°
sweep, shifted dark enough that the worst point of the interpolation measures
5.16:1. So: the bright ramp for marks and fills nothing sits on top of,
`--btn-grad` the moment type lands on it.

This was caught by the rendered-pixel audit in `tests/e2e/landing.spec.ts`,
which screenshots the page with every glyph made transparent and measures each
text box against the brightest pixel actually behind it. No palette table would
have found it, because the ramp is not a token anything declares text on.

### Type

Three variable families, one stylesheet request, each with one job.

- **Display**: **Archivo**, weight 800, `font-stretch: 118%`, uppercase,
  `letter-spacing: -0.022em`. Headline `line-height: 0.92`; section headings
  `clamp(1.8rem, 3.6vw, 2.7rem)` at `0.98`.
  **The width axis is load-bearing.** At the default 100% the same markup reads
  as an ordinary grotesque and the direction is simply gone, with nothing
  visibly broken to notice — which is why the landing suite asserts the computed
  `font-stretch` and that Archivo actually finished loading, rather than trusting
  that the declaration is in the file.
- **Body**: **Figtree**, 300–900.
- **Micro / metadata**: **Geist Mono** — timestamps, Spark counts, step
  numerals, file names. Nothing else.

Superseded: Inter throughout, and the Fraunces serif before it.

---

## 1. Landing page

**Five sections that scroll**, no mascot, no Meshy, **no model-provider
branding anywhere**, and still **zero JavaScript on the route**.

### What replaced "one screen, no scroll"

The single-frame composition was the founding constraint of this page, and it
was a real one: how-it-works and pricing were deliberately moved onto their own
routes so the landing could hold one idea. The owner's design brings them back.
See docs/DECISIONS.md ADR-020 for the decision and the artifact it came from.

The promise underneath it survives, and is now asserted directly instead of
through the proxy. A reader must not have to scroll to learn what this is or how
to start: the headline, both calls to action and the free-to-start line are all
inside the first frame at 1440×900, 1366×768 and 390×844. The page being exactly
one screen tall was the means; that is the end.

```
┌──────────────────────────────────────────────────────────────┐
│ ⬡ APPLE   Product Modes How-it-works Pricing Docs            │
│                                    [Sign in] [Start building]│  sticky, 63px
├──────────────────────────────────────────────────────────────┤
│  · Works inside Roblox Studio                                │  badge
│                                                              │
│  DESCRIBE A ROBLOX GAME.                                     │  ink-bright
│  APPLE BUILDS IT.                                            │  clipped gradient
│                                                              │
│  The parts, the scripts, the systems — straight into the     │  on-gradient
│  place you have open in Studio.                              │
│                                                              │
│  [ Start building — free ]  [ Install for Studio ]           │  #top
│  Free to start · No card required · Works in your project    │  mono
│  ( Build a shop UI ) ( Create claimable plots ) ( … )        │  example prompts
├──────────────────────────────────────────────────────────────┤
│  · The product                                               │
│  ONE CONVERSATION, AND THE PLACE CHANGES.                    │  #product
│  ┌───────────────────────────────┐ ┌────────────────────┐    │
│  │ Neon Arena · run 4 · example  │ │ The place          │    │
│  │      [ what the person said ] │ │ Objects   41 → 44  │    │
│  │  ✓ Read the lobby   41 objects│ │ Scripts    3 → 4   │    │
│  │  ✓ … five resolved steps      │ │ Checkpoints     4  │    │
│  │  Done — the portal is in …    │ │                    │    │
│  └───────────────────────────────┘ └────────────────────┘    │
├──────────────────────────────────────────────────────────────┤
│  · Modes                                                     │
│  PICK HOW HARD IT SHOULD THINK.                              │  #modes
│  [ PLAN 2 sparks ] [ AGENT 4 sparks ] [ SUPER AGENT 10 ]     │
├──────────────────────────────────────────────────────────────┤
│  · How it works                                              │
│  THREE STEPS, THEN IT IS IN YOUR PLACE.                      │  #how
│  [ 01 Connect Studio ] [ 02 Say what … ] [ 03 Playtest … ]   │
├──────────────────────────────────────────────────────────────┤
│  · Pricing                                                   │
│  SPARKS, NOT SEATS.                                          │  #pricing
│  [ FREE $0 ] [ BUILDER $12/mo · Popular ] [ STUDIO $40/mo ]  │
└──────────────────────────────────────────────────────────────┘
```

### Details that matter

- **Header** is sticky, 63px, hairline bottom border, `rgba(8,10,15,0.84)` with
  a 14px backdrop blur. Below 760px it becomes two rows — identity and the one
  call to action, then the section nav as a single row that scrolls sideways
  *inside itself*. Left to wrap it grew to 253px on a 390px screen and pushed
  the hero's own buttons under the fold.
- **The nav points at anchors**, which the previous version of this page
  forbade in as many words. That ban existed because the one-screen rebuild had
  deleted the sections `/#how`, `/#modes` and `/#proof` named. They exist again,
  so the rule is the one the ban was standing in for: no destination may be
  dead. A route must answer 200 and an anchor must name an element that is
  actually on the page — which is strictly more than the ban ever checked.
- **Hero background** is one radial:
  `ellipse 120% 90% at 50% -10%, #1F5FD0 → #123A8A 34% → #0B1733 62% → #080A0F 88%`.
  No planes, no prism, no glow, no SVG. The amber-glow stage is gone with the
  warm palette it belonged to.
- **Headline line 2** is painted through `background-clip: text`. The fallback
  colour is set *before* the `@supports` block that makes it transparent, so a
  browser without the clip gets readable pale blue rather than an invisible
  headline.
- **Eyebrow**: a 6px `--blue` dot as a **child `<span>`**, then the label in
  `--blue-soft`. A `::before` would have been tidier and is wrong — a
  pseudo-element has no box the contrast audit can exclude, so the dot gets
  measured as the surface the words sit on. Same for list bullets. Any
  decorative mark sharing a box with text is a child element here.
- **The example run is a still frame.** The design animates it — a composer that
  types, streams steps and ticks a counter. That would be the only JavaScript on
  the route. It is rendered at its finished state instead, and labelled
  "example" in the copy *and* in the panel's accessible name, because object
  counts and a place name shown without that label are the reader's own data as
  far as the reader can tell.
- **Entrance animation** runs on load from a visible resting state, never on
  scroll. Nothing is ever parked at `opacity: 0` waiting for an observer, so a
  thumbnail, a shared link and a reader with scripting off all get the finished
  page. `prefers-reduced-motion` collapses it to 1ms rather than removing it —
  `animation: none` on a `both`-filled entrance leaves the element invisible.
- **Every figure is read, never typed.** Plan names, prices, Spark allowances and
  builds-per-month come from `PLAN_LIMITS` / `PLAN_COPY` in `packages/shared`;
  the install destination comes from `STUDIO_PLUGIN_INSTALL_HREF`.
  `scripts/check-offer.mjs` and `scripts/check-spark-figures.mjs` enforce it.

### Three deliberate departures from the supplied design

Each is a place the design states something the product cannot keep. Recorded
here as well as in `apps/site/src/pages/index.astro`, because the next person to
compare the page against the artifact will notice and need the reason.

1. **"Two models" → "Modes".** There is one authoring model; `router.ts` sends
   every authoring mode to the same one. What differs is how much work the mode
   does — which is exactly what the design's own lede says, *"same builder, two
   settings"*. Only the eyebrow overclaims, so only the eyebrow changed, and the
   count is three because the product has three.
2. **"Apple model only" on the free tier is gone.** A plan-conditional model
   entitlement has no code path in `gateway.ts`. Publishing it would advertise a
   restriction nothing enforces and a capability nothing withholds.
3. **"Credits" → "Sparks".** Credits already means something else here: the
   purchased, non-expiring balance. Two meanings for one word, on the page that
   introduces the unit, is how a reader budgets against the wrong number.

### What the landing may never say

`tests/e2e/landing.spec.ts` fails on all of it, and each entry is there because
the page said it once:

- Any model-provider name.
- "Two models", "both models", "Apple MAX", "model only".
- "Credits" anywhere in the pricing section.
- "One click", "available now", "get it now", "already installed" — the plugin
  asset is uploaded but not distributable, so the page may point at the store
  and may not claim the trip will work.
- "$0 forever", "no card required, ever", "free forever" — contractual terms,
  and `scripts/check-offer.mjs` fails the build on them.
- Adoption claims. "Trusted by builders", "Loved by teams" and "Indie devs to
  studios" were on the bottom strip of the previous design, and Apple has no
  adoption to claim. The example prompts under the hero are labelled as examples
  for the same reason.

---

## 2. Workspace / chat

Conversation-first. Two columns only: rail and conversation.

### Left rail (~320px)

```
⬡ Golem                                     [▤]   ← collapse toggle
┌──────────────────────────────────────┐
│ ✎  New chat                    ⌘ K   │        outlined, full width
└──────────────────────────────────────┘
 Chats
  Roblox NPC system design          2m           active row: subtle fill
  Data store schema review          1h
  Matchmaking flow improvements     Yesterday
  Economy balancing ideas           2d
  UI animation polish               3d
  ▤ View all chats

            (flex spacer)

┌──────────────────────────────────────┐
│ ⬡ Checkpoints                     ›  │        card, not a nav row
│   Save and compare project states    │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ (A) Alex Chen               ⌄    ⚙   │
│     alex@golem.ai                    │
└──────────────────────────────────────┘
```

- Chat rows show a **right-aligned relative timestamp** in `--faint`.
- The active row gets a `--surface` fill and `--ink` text.
- `New chat` shows a `⌘K` keyboard badge on the right.
- **Checkpoints is a card at the foot of the rail** with a title, a one-line
  description and a chevron — plus a matching button in the conversation header.
  It is not a permanent panel.
- The user card is the last element: round avatar with an initial, name, email
  in `--faint`, a chevron for the account menu and a gear for settings.

### Conversation header

`<conversation title>  <relative time>` on the left in `--ink` / `--faint`; on
the right a **`≡ Checkpoints ›` outlined button**.

### Messages

- **User turn**: right-aligned, `--surface` fill, `--line` border, radius 12px,
  max-width ~72%, with a right-aligned **timestamp below the bubble** in
  `--faint`.
- **Assistant turn**: a **22px hexagon-mark avatar** in a `--surface-2` rounded
  square on the left, prose flowing on the canvas beside it — **no card, no
  border**. Timestamp below the prose in `--faint`.

### The Thinking card — this is the centrepiece

A **bordered rounded card** (`--surface`, `--line`), not a bare list.

```
┌────────────────────────────────────────────────────────┐
│ ✦  Thinking     Click to expand                    ⌄   │  header row
├────────────────────────────────────────────────────────┤
│ ○ Intent                                               │
│   Design a Roblox NPC system with behaviors, …         │
│ ○ Plan                                                 │
│   Outline architecture, data models, behavior …        │
│ ○ Actions                                              │
│     ✓ Research Roblox NPC patterns                     │
│     ✓ Draft system architecture                        │
│     ◐ Design data schema            ← live spinner     │
│     ○ Plan implementation steps                        │
│ ○ Validation                                           │
│   Ensure performance, scalability, and designer …      │
└────────────────────────────────────────────────────────┘
```

- Header: a small **amber sparkle glyph**, the word `Thinking`, then
  `Click to expand` in `--faint`, then a chevron pushed right that rotates on
  open.
- Body: a **vertical timeline**. Each stage is a hollow ring bullet with a
  connecting hairline running down the left. Stage name in `--ink`, its
  description on the next line in `--muted`.
- The four stages are **Intent, Plan, Actions, Validation**.
- `Actions` nests a checklist: `✓` done, `◐` a rotating ring for in-flight, `○`
  pending — indented under the stage.

**Honesty constraint, non-negotiable.** Every row must come from something the
worker actually reported: a real `agent_status` phase or a real tool event.
Intent/Plan/Validation render **only** when the backend has genuinely supplied
them. A pending `○` may only be shown for a step the backend has actually
announced as upcoming — never an invented roadmap, never a fake percentage, and
never raw chain-of-thought.

### Composer

A rounded `--surface` box with a `--line-2` border.

```
┌────────────────────────────────────────────────────────┐
│ Ask anything about your project...                     │
│                                                        │
│ [⬡ Golem 1.5 ⌄]  [⚖ Balanced]              📎  🎤  (↑) │
└────────────────────────────────────────────────────────┘
   Golem can make mistakes. Always review important information.
```

- Placeholder: `Ask anything about your project...`
- Bottom row inside the box: a **model chip** (mark + name + caret) and a **mode
  chip**, both pill-shaped; on the right, attach and mic icon buttons and a
  **filled circular send button** with an up arrow.
- Below the box, centred, `--faint`, ~12px: the mistakes disclaimer.

> The reference renders the model chip as `Golem 1.5`. In this product that
> control is the **provider** picker and the mode chip is **Plan / Agent / Super
> Agent** (ADR-018 — this line said Clay / Stone / Rune until 2026-09-01, which
> are the internal specialist identities and must never appear in product UI).
> Keep the reference's *form* — two chips, model-ish on the left, mode beside it
> — and this product's *meaning*. Never invent a provider name or show a provider
> as available when it is not.

---

## 3. Things that must not come back

No mascot. No Meshy. No three.js on the landing. No generated or scraped
provider logos — text labels only. No permanent right rail. No cluttered side
panels. No debug-console feel. No model-provider branding on the landing.
