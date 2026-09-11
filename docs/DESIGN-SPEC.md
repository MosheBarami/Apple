# Golem — approved visual direction

Transcribed from the two canonical reference images supplied 2026-08-31. Those
images are the source of truth; this file is a faithful written transcription of
them for anyone (or anything) that cannot see them.

Where this document and an older written description disagree, **this document
wins**.

---

## 0. Shared identity

### The mark

A **hexagonal outline containing an isometric cube**. Not a monolith, not a
face, not a character. Geometry only.

- Outer regular hexagon, flat-top orientation, stroked ~1.6px at 32px, never
  filled.
- Inside it the three visible faces of a cube: a vertical line from the top
  vertex down to the centre, and two lines from the centre out to the
  lower-left and lower-right vertices. This is the classic "cube in hexagon"
  isometric read.
- Stroke inherits the surrounding text colour. There is **no accent fill and no
  animation**. A mark that blinks or reacts is a mascot; the mascot direction
  is cancelled.
- Used at: 32px beside the wordmark in the landing nav, ~28px in the workspace
  rail, and ~22px as the assistant avatar in the conversation.

### Palette

Warm-neutral charcoal. Never blue-black.

| token | value | use |
|---|---|---|
| `--ground` | `#0B0A09` | page base |
| `--surface` | `#121110` | raised card face |
| `--surface-2` | `#171614` | second raise, chips |
| `--ink` | `#F5F2EC` | primary type, headline line 1 |
| `--ink-warm` | `#C9C0B2` | headline line 2, warm secondary |
| `--muted` | `#9A938A` | body copy |
| `--faint` | `#6E6862` | meta, timestamps, disclaimers |
| `--line` | `rgba(245,242,236,0.08)` | hairline |
| `--line-2` | `rgba(245,242,236,0.14)` | readable border |
| `--cream` | `#E6DECF` | primary CTA fill |
| `--cream-ink` | `#14120F` | type on cream |
| `--amber` | `#C98A3C` | the single accent |

The amber appears **twice on the whole landing**: as the short dash before the
eyebrow, and as a very low-alpha glow rising from bottom centre. Nothing else
emits.

### Type

- **Display**: a tight grotesque sans — Inter (or the platform grotesque),
  weight 600, tracking `-0.035em`, line-height `0.98`. **Not a serif.** The
  earlier Fraunces treatment is superseded.
- **Body**: Inter 400.
- **Micro / eyebrow / meta**: monospace, uppercase where shown, tracking
  `0.14em` for the eyebrow and `0.06em` for the CTA micro-line.

---

## 1. Landing page

Still **one screen, no scroll**, no mascot, no Meshy, **no model-provider
branding anywhere**, no marketing sprawl. What changes is the composition.

### Layout — centred, not left-aligned

```
┌──────────────────────────────────────────────────────────────┐
│ ⬡ Golem      How it works  Modes  Pricing  Docs  Changelog   │
│                                        [ Open Golem  ↗ ]     │  nav, ~104px
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                  — AI BUILDER FOR ROBLOX                     │  eyebrow, centred
│                                                              │
│                     Describe it.                             │  ink
│                   Golem builds it.                           │  ink-warm
│                                                              │
│            Go from an idea in your head to a working         │
│            experience in Roblox Studio. Golem reads your     │  centred, 3 lines
│            project, writes the code, writes the instances    │
│            — then presses Play to prove it works.            │
│                                                              │
│        [ Start building — free ↗ ]  [ Install Studio plugin ]│
│                                                              │
│      Free to start • No card required • Works in your project│  mono, faint
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ ⛨ Built for creators │ ⚡ Fast. Reliable.  │ ⛊ Loved by teams │
│   Trusted by builders │   From idea to …   │   Indie devs …   │
└──────────────────────────────────────────────────────────────┘
```

### Details that matter

- **Nav** is full-width with generous padding and a hairline bottom border.
  Links are `--muted`, ~15px. `Open Golem` is a **cream filled button with a ↗
  arrow**, radius ~10px.
- **Eyebrow**: a ~28px amber horizontal dash, a gap, then
  `AI BUILDER FOR ROBLOX` in mono caps, `--muted`, ~12px, tracking `0.14em`.
  Centred as a unit.
- **Headline**: two lines, centred. Line 1 `Describe it.` in `--ink`. Line 2
  `Golem builds it.` in `--ink-warm`. Size `clamp(3rem, 7.5vw, 6.5rem)`.
- **Lede**: centred, max-width ~52ch, `--muted`, with `Roblox Studio` picked out
  in `--ink`.
- **Two CTAs**, centred, side by side, ~52px tall:
  - `Start building — free ↗` — cream fill, dark ink.
  - `Install Studio plugin` — transparent with a `--line-2` border, ink text.
- **Micro-line**: monospace, `--faint`, ~12px, three claims separated by a
  middot with generous spacing.
- **Bottom strip**: three cells separated by vertical hairline dividers, each
  `icon + bold title + faint subtitle` stacked in two lines:
  - shield · **Built for creators** / Trusted by builders
  - lightning · **Fast. Reliable. Consistent.** / From idea to working prototype
  - people · **Loved by teams** / Indie devs to studios

  Icons are 16px line icons in `--muted`.

### The stage (background)

Large matte planes forming a **prism/mountain silhouette rising from the bottom
centre**, with a warm amber glow behind the peak. Long thin diagonal hairlines
sweep across the upper left and upper right. All CSS + one inline SVG. No
images, no canvas, no 3D, **zero JavaScript on the route**.

The bottom third reads darker and heavier than the top, so the type sits in the
lighter upper field. The peak apex sits roughly under the CTA row.

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
