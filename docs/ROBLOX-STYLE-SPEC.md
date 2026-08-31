# Golem — Roblox simulator/tycoon style specification

Derived from eight reference screenshots supplied 2026-08-31, by direct
inspection. Those images are **evaluation references, not source material**.
Nothing here describes a specific game, and nothing built from it may reproduce
a layout, logo, character, icon set, thumbnail or wordmark seen in them. What is
captured is the *category's* visual grammar — the shared language that makes an
experience read instantly as "a Roblox simulator" — so Golem can produce
**original** work belonging to that category.

This file is the source of truth for the visual half of the simulator benchmark.
Agents that cannot see the references build against this.

---

## 0. The one-sentence test

> If a player sees a still frame for half a second, do they think
> *"that's a Roblox simulator"* before reading a single word?

Everything below serves that. Complexity, realism and subtlety work *against* it.

---

## 1. Colour

Bright, saturated, high-key. No muted palettes, no tasteful neutrals, no dark mode.

### Environment (refs 6, 7, 8)

| role | character | approximate |
|---|---|---|
| grass | strong yellow-green, fully saturated | `#5FC94A` – `#7ED957` |
| dirt / path | warm orange-tan, clearly distinct from grass | `#C98A4B` – `#E0A45C` |
| stone path | light neutral grey, cool | `#B8BFC4` – `#D2D8DC` |
| cliff / rock face | rust red-brown, banded in layers | `#B5533A` – `#8E3F2E` |
| tree canopy | mid-to-dark green, flat | `#3E9E4E` – `#57B85F` |
| trunk / fence | mid brown, low saturation vs foliage | `#7A5230` – `#96683E` |
| sky | clear cyan-blue, soft white clouds | `#7FC8F0` – `#A8DCF7` |
| sand / plaza floor | pale warm beige | `#E8D3A9` |
| accent props | pure hue — pink, purple, yellow, cyan at full chroma | — |

**Colour zoning is a gameplay tool, not decoration.** Each functional area owns a
colour: the sand circle is the hub, rust cliffs wall it in, green is traversable,
the orange path is the route. A player reads where to go from colour alone.

### UI (refs 1–5)

One saturated hue for the header; everything else neutral — cyan header + white
body, green header + brown body, purple header + white body.

| meaning | colour |
|---|---|
| buy / confirm / positive | **green** |
| close / cancel / danger | **red** (occasionally magenta) |
| premium / VIP / rare | **gold or purple** |
| currency (soft) | **yellow-gold** |
| currency (hard) | **green or cyan** |
| locked / unavailable | **grey**, desaturated |

---

## 2. Outline — the single most important signal

**Everything is outlined in near-black, and the outline is thick.**

- Panels, buttons, cards, icons and display text all carry it.
- Roughly **3–5 px at 1080p**, and it does *not* thin down on small elements.
- Near-black (`#111`–`#1A1A1A`), never mid grey.
- Type gets it too: white fill, black stroke, soft drop shadow (§4).

An otherwise perfect design fails the category test on this point alone.
**If in doubt, the outline is too thin.**

---

## 3. Shape language

- **Rounded rectangles everywhere** — ~12–20 px on panels, buttons often full pills.
- **Chunky, not delicate.** Tall buttons, generous padding, large hit areas.
- **Slight vertical gradient** on fills: lighter top, deeper bottom. Headers
  often add a diagonal sheen band.
- **Depth is a hard bottom edge**, not a soft shadow — a darker band of the same
  hue along a button's lower edge reads as thickness.
- No glassmorphism, no blur, no thin strokes, no subtle anything.

---

## 4. Typography

- **Heavy weight only.** No light or regular display type in the category.
- **Predominantly uppercase** for titles and buttons.
- **White fill + black outline + drop shadow** — near-universal.
- Rounded, wide, friendly sans (Roblox's `GothamBold`/`FredokaOne` class), never
  condensed or geometric-severe.
- Numbers large and comma-separated (`999,999,999`). Big numbers are part of the
  fantasy; never truncate to `1B` in the main HUD.
- Emoji appear as *ornamental* section decoration (`🔥 FEATURED 🔥`). Acceptable
  in that role only — never as functional icons.

---

## 5. Panel / modal construction

```
┌──────────────────────────────────────────┐  ← thick black outline
│  ▓▓▓ SATURATED HEADER BAR ▓▓▓      [ X ] │  ← title centred, close top-right
├──────────────────────────────────────────┤
│   ── SECTION HEADING ──                  │  ← outlined, often emoji-flanked
│   ┌────────────────────────────┐         │
│   │  item card          [ BUY ]│         │  ← white, outlined, rounded
│   └────────────────────────────┘         │
│   ── SECOND SECTION ──                   │
│   ┌──────┐ ┌──────┐ ┌──────┐             │  ← equal-width card row
│   └──────┘ └──────┘ └──────┘             │
└──────────────────────────────────────────┘
```

1. **Header is the only saturated surface**; body is white or a neutral texture.
2. **Close button is a large red/magenta rounded square, top-right**, white `X`,
   outlined — never a small glyph.
3. **Sections are labelled**, centred, outlined.
4. **Item cards are white**, outlined, rounded, action button *inside* the card,
   right-aligned.
5. **Grids are equal-width**, generously gapped, wrap rather than scroll
   horizontally.
6. Panels centred, roughly **50–70% of viewport width** on desktop.

---

## 6. HUD layout

- **Left edge**: vertical stack or 2-wide grid of **circular icon buttons** —
  Shop, Pets, Rebirth, Settings, VIP, Prizes. Distinct saturated colour each,
  white pictogram, heavy outline.
- **Right edge**: **wide pill buttons** for monetisation/sell actions, leading icon.
- **Top centre**: the single most important action as a wide pill.
- **Top left**: **currency counters** — dark rounded pills, coin icon, big number.
- **Bottom left**: version string, small social prompt.
- **Progress bars**: thick, rounded, icon at the left end, label inside.

Everything sits at the screen edges. **The centre stays empty** so the world is
readable. This is a hard rule and a common way first attempts fail.

---

## 7. World construction

### Form

- **Low-poly, flat-shaded, untextured** natural geometry. Colour does the work.
- Conifers are **stacked cones**; deciduous are **one to three rounded blobs** on
  a straight trunk.
- Rocks are **faceted lumps**, grouped in twos and threes, never evenly scattered.
- Grass is **small spiky tufts** clustered at path edges and against props —
  never a uniform field.
- Cliffs are **banded horizontally** in two or three tones of the same rust hue.
  That banding is what makes them read as rock rather than a brown wall.

### Scale and composition

- **Props are oversized relative to the player.** Realistic scale reads as empty.
- **Paths are wide** — 3–4 players abreast — and contrast hard with the ground.
- **The hub is a clearing**, usually circular, in a distinct floor colour, ringed
  by cliffs or trees so the world does not leak away.
- **One landmark dominates**, visible from spawn, and the eye lands on it.
- **Progression is signposted physically**: oversized arrows, glowing pads,
  coloured floor rings, gates. No text should be needed to know where to go.

### What the category does *not* do

No realistic architecture, PBR materials, photoreal foliage, dark lighting, heavy
fog, or visual clutter. Density is *moderate*, with clear ground between clusters.

---

## 8. Interaction affordances

- **Pads**: flat coloured discs/squares on the ground, outlined, floating label.
- **Arrows**: giant, outlined, usually green, floating, pointing at the objective.
- **Kiosks**: small structure with a bright sign, *beside* the path, not blocking.
- **Reward feedback** is immediate and loud — number pop, sound, particle burst.
  Silence reads as breakage.

---

## 9. Pass criteria

An original build passes the style gate when **all** hold:

1. Every UI surface carries a thick near-black outline.
2. Display type is heavy, mostly uppercase, white with a black stroke.
3. Panels use one saturated header over a neutral body, large red close button
   top-right.
4. HUD lives at the screen edges; the centre is clear.
5. Ground colours zone the space; the path contrasts with the ground.
6. Natural geometry is flat-shaded low-poly, untextured.
7. Props are oversized and clustered, not evenly scattered.
8. One landmark dominates the hub and is visible from spawn.
9. Progression is physically signposted.
10. Nothing on screen is thin, subtle, desaturated or realistic.

A grey Roblox default `Frame`, a hairline border, a thin font, a realistic
material, or an evenly-scattered prop field is an automatic fail.

---

## 10. Provenance and rights

The reference screenshots are **not** in this repository and are not
redistributed. They were inspected once to produce this description. Any fixture
built from this document must be **original geometry and original UI** created to
the grammar above. Do not train an image model on third-party screenshots. Do not
reproduce any observed logo, character, icon or wordmark.
