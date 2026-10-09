---
name: ui-design
description: Design and build Roblox screen UI (ScreenGui) with the build_ui tool - menus, shops, inventories, admin and moderation panels, settings, HUDs, dialogs, toasts, leaderboards. Use it whenever a request puts something on the player's screen or changes an existing screen. It covers how to decide what the UI should look like for THIS request (game UI vs tool/admin UI vs HUD), hierarchy, spacing and type scales, colour and contrast, states and feedback, responsive layout across phone, tablet and desktop, the Roblox layout pitfalls, the exact build_ui schema, and how to read and fix the defects build_ui and check_ui measure. Contains no presets: every colour, font and size is chosen for the request.
---

# Designing Roblox UI with build_ui

You design the screen. The engine guarantees the mechanics (layouts, padding, wrapping, flex fill, scroll
canvas, z-order) and measures the result at five screen sizes. Nothing here is a template: decide every
colour, font, size and arrangement from what was asked and the game it lives in.

## 1. Decide what this UI is before drawing anything

Write down (to yourself) four things, then design from them:

1. **Job.** What does the player or operator do here, in one sentence? ("Find a player and kick, mute or
   ban them." "Pick an item and buy it." "Glance at health and coins mid-fight.")
2. **Kind.** It sets density, tone and motion:
   - **Tool / admin / moderation / settings**: dense, calm, precise. Neutral surfaces, one accent colour
     used only for the primary action and selection, a destructive colour reserved for destructive
     actions. Left-aligned text, clear columns, compact rows (36-48 px), small radii (4-8 px), thin 1 px
     strokes or none, a sans family at Regular/Medium/SemiBold. It should look like a deliberately
     designed internal tool, not a toy.
   - **Game UI (shop, inventory, rewards, menus)**: expressive and on-theme. Bigger type, chunky
     buttons (48-64 px tall), generous radii, gradients, outlines, a display font for headings, colour
     that belongs to the game's world (a candy simulator and a horror game must not share a palette).
     Rewards and prices are the loudest things on the screen.
   - **HUD**: minimal and peripheral. Pin to corners and edges, never the centre; small footprint;
     translucent backing (bgT 0.3-0.5) so the world shows through; numbers big enough to read in one
     glance; nothing pressable under the player's thumbs on phone unless it must be.
   - **Dialog / toast / modal**: one message, one or two actions, centred (modal) or edge-anchored
     (toast), drawn above everything else (displayOrder, z).
3. **Primary action.** Exactly one per view gets the strongest visual weight.
4. **Content at its worst.** Longest name (20-char usernames), biggest number (1,000,000,000), empty
   list, 50 rows. Design for those, not for "Bob" and "5".

## 2. Hierarchy, spacing, type

- **One spacing scale** per screen, e.g. 4 / 8 / 12 / 16 / 24 / 32. Gaps inside a group are smaller than
  gaps between groups. Panel padding is at least the largest inner gap.
- **One type scale**, 3-4 sizes: e.g. 13-14 caption, 15-16 body, 18-20 section heading, 24-32 title.
  Game UI can go bigger (title 36-48, prices 22-28). Never below 12 px for anything a phone user reads.
- **Weight and colour before size**: a muted colour (60-70% contrast) for secondary text keeps the
  hierarchy without adding sizes.
- **Alignment**: text in lists and forms is left-aligned; centred text is for buttons, short titles and
  hero numbers. Numbers in a column align right.
- **Grouping**: a surface (slightly lighter or darker than its parent) or a divider, not both.
- **Fonts**: pick one family for body and at most one display family for headings. A tool UI uses a
  neutral sans (BuilderSans, Montserrat, GothamSSm, Roboto, Nunito, SourceSansPro, Ubuntu...). A game can
  use a display family for headings only (FredokaOne, LuckiestGuy, Bangers, Creepster, PressStart2P,
  Michroma, Oswald, Merriweather...) chosen for its world. Weight is part of the name: "Montserrat:Bold".

## 3. Colour and contrast

- Start from the context: the game's world, the brand of the request, or (for tools) a neutral dark or
  light base. Choose: a base surface, one or two surface steps, a text colour, a muted text colour, one
  accent, and semantic colours only if needed (danger for destructive, success for confirmations).
- Text must reach 4.5:1 against what is behind it (3:1 for text 18 px and up). The checker measures it.
- Coloured buttons: the label colour is whichever of near-white or near-black reads on that button.
- Gradients: two close hues (same family, 10-20% lightness apart) read as polish; rainbow reads as noise.
- Transparency on a backing (bgT 0.2-0.5) helps HUDs; on a panel full of text it hurts contrast.

## 4. States and feedback

- Buttons get AutoButtonColor (engine default) so hover and press darken. For richer states write a
  LocalScript: hover lightens or lifts (TweenService, 0.08-0.15 s), press shrinks slightly (UIScale 0.96)
  or darkens, disabled drops to ~50% opacity and stops responding (Active/Interactable false), selected
  uses the accent fill or an accent stroke.
- Every action answers: a toast, a number that changes, a row that disappears, a button that switches
  to "Bought". Destructive actions (ban, delete, reset) ask to confirm.
- Empty states say what is missing and what to do ("No players match "bu". Clear the search.").

## 5. Responsive on Roblox

- The same screen must work at 1920x1080, 1366x768, 1024x768 (tablet), 844x390 (phone landscape) and
  390x844 (phone portrait). build_ui measures all five.
- **Panels**: a percent width with a pixel cap and floor, e.g. `w: "92%", maxW: 640, minW: 280` and
  `h: "80%", maxH: 560`. On a phone the percent wins; on a monitor the cap does. Never a bare 700 px.
- **Inside panels**: pixels for things that should stay finger-sized (rows, buttons, icons, padding)
  and `fill` for the space that should stretch. Avoid percents inside stacks: they ignore gaps.
- **Touch**: buttons and inputs at least 44 px tall on screens a phone uses (32 px is the hard floor the
  checker reports). Keep 8 px between adjacent tappable things.
- **Safe areas**: `insets: "safe"` (default) keeps the screen clear of Roblox's top bar and notches. Use
  `"none"` only for full-bleed backgrounds, and then keep buttons out of the top 58 px.
- **HUD corners**: `at: "top-right", offset: [16, 16]` (offset moves inward from the anchored edges).
- **Text**: fixed `fontSize` is predictable and is the default choice. Use `scale: [min, max]` only for
  a hero number or title that should grow with its box; the engine always bounds it.
- **Grids**: `cols: 3, cell: [0, 140]` makes columns that share the width; `cell: [120, 140]` makes
  fixed cards that reflow by count. Put a grid of many items inside a scroll.

## 6. Pitfalls the engine or the checker catch (and what they mean)

| Measured defect | Usual cause | Fix |
|---|---|---|
| `text_overflow` | box too small for the text at that size, or too long a word | widen (`fill`), let it wrap (`h: "auto"`), shorten, or lower fontSize one step |
| `text_truncated` | `truncate: true` cut it | fine for names in a list; not for titles, prices, buttons |
| `text_cramped` | text touching the edge of a filled box | add `pad`, or make the box `w: "auto"` |
| `collapsed` | `fill`/percent child inside an `auto`-sized parent | give the parent a real size on that axis |
| `overflows_parent` / `cut_off` | fixed sizes adding up to more than the parent, a percent stack plus gaps | use `fill` + `grow`, fewer px, or a scroll |
| `overlap` | two free-placed siblings sharing space | put them in a stack, or move one with `at`/`offset` |
| `covered` | something drawn over a button or input | a stack instead of free placement, or raise the button's `z` |
| `past_screen_edge` / `off_screen` | fixed px panel on a small screen | percent width with `maxW`, or less content |
| `small_touch_target` | buttons under 32 px on touch screens | 44 px tall rows/buttons, larger icons |
| `tiny_text` | under 12 px on a phone | raise the type scale's smallest step |
| `unbounded_scaled_text` | TextScaled without limits (made by other tools) | use fontSize, or `scale: [min, max]` |
| `under_top_bar` | button in the top 58 px with insets none | `insets: "safe"` or move it down |
| `low_contrast` | text colour too close to its background | darker/lighter text, or a more opaque backing |

The compiler also returns `warnings` for things only a different design fixes (fill inside auto, percents
over 100%). Treat warnings like defects.

## 7. The build_ui schema

```
build_ui({ name, children: [Node...], styles?: {name: fields}, insets?: "safe"|"device"|"none", enabled?,
           displayOrder?, replaceScripts?, viewports? })
```

`name` is the ScreenGui in StarterGui. Calling build_ui again with the same name REPLACES that screen
(it refuses if the old screen holds scripts, unless `replaceScripts: true`). Top-level children are placed
freely.

**Node** `{ type, name?, children?, ...fields }`. Unnamed nodes are named by type and number (Text1,
Button2); name every node a script will look up. Sibling names must differ.

| type | Roblox object | notes |
|---|---|---|
| `frame` | Frame | free placement of children (`at`/`offset`), or a list when it has `dir` |
| `stack` | Frame + UIListLayout | `dir: "v"` (default) or `"h"` |
| `grid` | Frame + UIGridLayout | `cell: [w, h]` px, or `cols` + `cell: [0, h]` |
| `scroll` | ScrollingFrame + list or grid | clips, canvas sizes itself, bar never covers content |
| `text` | TextLabel | wraps unless `truncate` or `w: "auto"` |
| `button` | TextButton / ImageButton | `text`, or `image` only, or `children` (icon + label) with `dir` |
| `input` | TextBox | `placeholder`, `multiline`; keeps its text on focus |
| `image`, `icon` | ImageLabel | `image: "rbxassetid://N"`, `fit`, `tint` |
| `divider` | 1 px Frame | `color`, `thickness`; spans the stack's cross axis |
| `spacer` | empty Frame | fills the free space in a stack (pushes siblings apart) |

**Size and place**
- `w`, `h`: pixels (number) | `"fill"` | `"auto"` (size to content) | `"NN%"` of the parent.
  In a stack, `fill` along the stack direction takes the remaining space (a flex item; `grow: 2` takes a
  double share); across it, `fill` is the full width/height.
  Defaults: in a vertical stack most things fill the width; text and containers are `auto` tall; buttons and
  inputs are 44 px tall; scrolls fill.
- `minW`, `maxW`, `minH`, `maxH` px; `aspect` (width / height).
- `at`: top-left | top | top-right | left | center | right | bottom-left | bottom | bottom-right, with
  `offset: [x, y]` px inward. Only outside stacks and grids. `z` (0-100) orders siblings; `visible`.

**Containers** (`stack`, `scroll`, `frame`/`button` with `dir`): `gap`, `pad` (n | [vertical, horizontal]
| [top, right, bottom, left]), `align` (cross axis: start|center|end), `justify` (main axis: start |
center | end | between | around | evenly), `wrap` (horizontal stacks: chips that flow onto new lines).
`grid`: `cell`, `cols`, `gap`, `align`. `scroll`: `bar` (thickness px), `barColor`.

**Look**: `bg` "#hex", `bgT` 0-1, `radius` px | "pill", `stroke {color, width?, t?}` (a border on boxes, an
outline on text), `gradient {colors: [2-6 hex], rotation?, t?: [start, end]}`, `clip`.

**Text** (text, button, input): `text`, `font` ("Family" or "Family:Weight", weights Thin..Heavy, add
":Italic"), `fontSize` px (default 16) or `scale: [min, max]`, `color` (default: the readable one of white
and near-black over the nearest filled background), `textT`, `alignX` left|center|right, `alignY`,
`truncate`, `rich`, `lineHeight`. Text on a filled box gets breathing room automatically (`pad: 0` turns it
off).

**Write it once (styles and each).** Every token you write is paid for, so never repeat a look or a row:
- `styles: { "card": { "bg": "#16181d", "radius": 8 }, "btn": { "type": "button", "h": 32, "fontSize": 14 } }`
  at the top level; a node takes `style: "card"` or `style: ["btn", "danger"]`. A style may hold any node
  field except `name` and `children` (including `type`). Later styles win; the node's own fields win over all.
- A child with `each: [...]` is repeated once per item. A string item sets `text`; an object item sets that
  copy's fields (`{ "text": "Ban", "style": "danger" }`). A template with `{key}` placeholders anywhere in
  it (nested children, names) takes the items as values instead: `"text": "{price} coins"`,
  `"name": "Row_{id}"`. A fixed template `name` gets the item's number (Tab1, Tab2, ...).
- Change one element after a build with `set_properties` on its path; rebuild only for structural changes.

**Behaviour** is a LocalScript you write with `edit_script` in `StarterPlayerScripts`, finding the screen
with `player.PlayerGui:WaitForChild("<name>")` and elements by their names. It survives rebuilds.

## 8. Method

1. Load this skill; decide job, kind, primary action, worst-case content (section 1).
2. Choose the scales and colours (sections 2-3) for this request; write them down in your reasoning.
3. Write the tree: one outer panel or a few edge-anchored HUD groups, stacks inside, names on everything
   a script needs. Put every repeated look in `styles` and every list in `each`.
4. Call build_ui. Read `layout.defects` and `warnings`. Fix each by changing the design (section 6): one or
   two properties with `set_properties` then `check_ui`; a structural change by calling build_ui again with
   the same name. Repeat until `verdict: "pass"`, or explain any defect you keep
   on purpose (a truncated long username in a list is acceptable; a cut-off price is not).
5. Wire behaviour (edit_script), then prove it with play_check.
6. For UI built by other means, run check_ui.

## 9. Three different screens (illustrations of the schema, not templates)

**A moderation panel** (tool UI: dense, neutral, one accent, destructive colour only on destructive actions)

```json
{ "name": "ModPanel",
  "styles": {
    "ink": { "color": "#e8eaf0" },
    "act": { "type": "button", "w": 72, "h": 32, "fontSize": 14, "bg": "#2a2e37", "radius": 6, "color": "#e8eaf0" },
    "danger": { "bg": "#b4232c", "color": "#ffffff" } },
  "children": [
  { "type": "stack", "name": "Panel", "at": "center", "w": "94%", "maxW": 620, "h": "86%", "maxH": 520,
    "bg": "#16181d", "radius": 8, "stroke": { "color": "#2b2f38" }, "pad": 16, "gap": 12, "children": [
    { "type": "frame", "name": "Header", "dir": "h", "h": 32, "align": "center", "gap": 8, "children": [
      { "type": "text", "name": "Title", "style": "ink", "text": "Players", "font": "Montserrat:SemiBold", "fontSize": 18, "w": "fill" },
      { "style": "act", "name": "Close", "text": "Close", "w": "auto", "bg": "#23262e" } ] },
    { "type": "input", "name": "Query", "style": "ink", "h": 40, "placeholder": "Search by name", "bg": "#0f1115", "radius": 6, "stroke": { "color": "#2b2f38" }, "placeholderColor": "#7b8090" },
    { "type": "scroll", "name": "List", "gap": 4, "barColor": "#3a3f4b", "children": [
      { "type": "frame", "name": "Row_{id}", "dir": "h", "h": 44, "pad": [0, 10], "gap": 8, "align": "center", "bg": "#1d2027", "radius": 6, "children": [
        { "type": "text", "name": "PlayerName", "style": "ink", "text": "{id}", "w": "fill", "truncate": true },
        { "style": "act", "name": "Mute", "text": "Mute" },
        { "style": ["act", "danger"], "name": "Kick", "text": "Kick" } ],
        "each": [{ "id": "builderman" }, { "id": "Roblox" }] } ] } ] } ] }
```

**A game shop** (game UI: loud, on-theme, chunky; here a candy world)

```json
{ "name": "CandyShop", "children": [
  { "type": "stack", "name": "Shop", "at": "center", "w": "90%", "maxW": 760, "h": "84%", "maxH": 560,
    "bg": "#ff7ab8", "radius": 24, "stroke": { "color": "#7a1d4f", "width": 4 }, "pad": 18, "gap": 14,
    "gradient": { "colors": ["#ff8cc6", "#ff5fa2"], "rotation": 90 }, "children": [
    { "type": "text", "name": "Title", "text": "SWEET SHOP", "font": "FredokaOne", "fontSize": 36, "alignX": "center", "color": "#ffffff", "stroke": { "color": "#7a1d4f", "width": 3 } },
    { "type": "scroll", "name": "Items", "cols": 3, "cell": [0, 170], "gap": 12, "children": [
      { "type": "button", "name": "Lollipop", "dir": "v", "pad": 10, "gap": 6, "align": "center", "bg": "#fff3f9", "radius": 18, "stroke": { "color": "#7a1d4f", "width": 3 }, "children": [
        { "type": "icon", "image": "rbxassetid://0", "w": 72, "h": 72 },
        { "type": "text", "text": "Lollipop", "font": "FredokaOne", "fontSize": 18, "alignX": "center", "color": "#7a1d4f" },
        { "type": "text", "name": "Price", "text": "250", "font": "FredokaOne", "fontSize": 22, "alignX": "center", "color": "#1f9d55" } ] } ] } ] } ] }
```
(Replace `rbxassetid://0` with a real image id from an asset search, or drop the icon.)

**A minimal HUD** (peripheral, translucent, glanceable)

```json
{ "name": "Hud",
  "styles": { "chip": { "type": "text", "w": "auto", "h": 40, "font": "BuilderSans:Bold", "fontSize": 20, "bg": "#000000", "bgT": 0.45, "radius": "pill", "pad": [0, 14] } },
  "children": [
  { "type": "stack", "name": "Stats", "at": "top-left", "offset": [12, 12], "dir": "h", "w": "auto", "h": 40, "gap": 8, "children": [
    { "style": "chip", "name": "Coins", "text": "1,250", "color": "#ffd34d" },
    { "style": "chip", "name": "Level", "text": "Lv 7", "color": "#ffffff" } ] } ] }
```

Each of these is one way to answer one request. A different request (a sci-fi upgrade bay, a cosy farm
inventory, a light-themed settings sheet) needs its own decisions from sections 1-5.
