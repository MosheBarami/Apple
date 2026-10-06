# StudPilot critic rubric (version v2, 2026-10-06)

This is the only instruction a critic gets besides the request and the screenshots. Two critics score
every piece without seeing each other. A change to this file is a new version (`critic-rubric-v2.md`),
never an edit in place while a milestone's runs are being scored; a verdict records the sha256 of the
rubric text it used.

## What you are given

- **The request**, exactly as the user typed it, typos included.
- **Screenshots** of what StudPilot built in Roblox Studio, on an otherwise empty Baseplate. The file
  name says what each one is:
  - world pieces: `overview` (high, wide), `three-quarter` (raised, at an angle), `close-up` (near the
    subject), `spawn-eye` (the player's eye height at the spawn point, looking at the piece);
  - UI pieces: the screen in a Studio viewport at the size named in the file name (for example
    `ui-1920x1080`). The real size is in the name; do not assume another;
  - `play-1`, `play-2`, `play-3`: three frames taken in order, a moment apart, while the place was
    running. Motion, particles and flicker show up as differences between them. They may be absent when
    the place could not be photographed while running; then judge feedback from the stills alone, and
    do not call an effect missing only because a still cannot show motion (a glow, a light or a
    particle emitter that is visible in a still counts).
- **The reference board** (v2, planning/STYLE-BIBLE.md §2): four fixed images from popular Roblox games, shown
  BEFORE the build's screenshots. UI pieces get R01, R02, R04 and R07; world pieces get R10, R11, R12 and R13. They
  are the target look. They are not the request: never score a build down for not containing what a reference
  contains, only for not looking like it came from the same game.
- Nothing else. You do not see the code, the reply, the logs or the other critic.

You judge what the pictures show. Sound is proven by the logs, not by you, so do not score or guess it.
Whether a button works, whether data saves and whether a number is right are checked by scripts, so
do not score them either. If something should be visible and is not, score it as missing.

Study every picture before you score. You may not score from a subset: the JSON you return lists
every screenshot you looked at, and a verdict with a missing one is discarded.

## How to score

Score each area from 0 to 10, using the anchors below. Use whole or half points; interpolate between
anchors (a 6 sits between the 5 and the 8 descriptions, nearer the 5 if most of it is still true).
**Score what is in the pictures, not what the piece might do.** Compare against what a top Roblox
studio would ship for this exact request, not against other AI tools and not against an empty place.

The Baseplate is the test stage. For a UI piece or a single prop, the bare Baseplate behind it is not a
flaw. For a zone or map area (a place a player walks through), a bare grey Baseplate left showing as the
main ground is a flaw in areas 2 and 3.

Mark an area **N/A** only where this rubric says it may be N/A.

### 1. Delivers the request
Does the picture contain what was asked, all of it, at the size and count asked?

| Score | What it looks like |
|---|---|
| 2 | The main subject is missing or unrecognisable. Something else was built, or the place is still the empty Baseplate. |
| 5 | The main subject is there, but parts of the request are missing (two of six eggs, no featured item, no price), or a stated number is wrong. |
| 8 | Everything named in the request is there and recognisable at a glance, in the count asked. At most one minor detail is off (one label slightly different, say). |
| 10 | Everything is there, and the obvious unstated needs of the request are also met (a shop has a way to close it; an obby stage has a visible start and end; a gate shows its price). |

### 2. Visual quality and art direction
Does it look designed? Colour, materials, lighting, shape language, and one consistent style.

| Score | What it looks like |
|---|---|
| 2 | Default grey parts or default UI, flat default lighting, no chosen palette, the default stud texture everywhere. Reads as a test or a template. |
| 5 | A palette and a style were chosen, but they are generic or inconsistent: everything the same saturation, mixed styles, plain blocks with colour applied, a UI skin that does not match the world around it. |
| 8 | A clear, consistent style that fits the request's genre (simulator, tycoon, cozy, neon). Materials and colours are chosen with intent, with contrast and a focal colour. Lighting supports the mood. It would not look out of place in a front-page simulator game. |
| 10 | Distinctive and polished: a well-judged palette, considered silhouettes, depth (shadow layers, strokes and highlights on UI; material variation, lighting and atmosphere on world pieces). A top studio would ship it as is. |

### 3. Layout, composition and scale
Is it placed well, readable from the player's view, and the right size for a 5-stud-tall avatar?

| Score | What it looks like |
|---|---|
| 2 | Wrong scale (a door the avatar cannot fit through, a chest bigger than a house), parts floating or sunk into the ground, a UI that runs off the screen, or a foreground object that blocks the view at spawn. |
| 5 | Plausible scale, but awkward: parts overlap, spacing is uneven, things are lined up in a rigid grid with no hierarchy, a world piece is lost in empty space, or in-world text is too small to read from the spawn-eye shot. UI elements are crowded or unevenly spaced. |
| 8 | Correct scale for the avatar. A clear focal point. Grouping and spacing are deliberate (clusters, not grids, for world props). UI has a clear hierarchy, aligned edges, and does not clip at the size shown. In-world signs are readable from where the player stands. |
| 10 | Composed like a designed shot: leads the eye, frames the subject, uses negative space well. A UI hierarchy makes the most important action obvious within a second. |

### 4. UI/UX clarity (N/A when no on-screen UI is shown and none was asked for)
Can a 13-year-old understand and use it at a glance?

This area applies when a screen UI (a layer of menus, buttons, bars or text drawn over the view) is in
the pictures, or when the request asks for one. Signs and labels attached to world objects are not
screen UI: judge them in areas 3 and 6, and mark this area N/A if there is nothing else. If the request
asks for a UI and no UI is in the pictures, score this area 0 to 2 and list severe flaw 1.

| Score | What it looks like |
|---|---|
| 2 | Text unreadable (too small, low contrast, overlapping), or no way to tell what any control does. |
| 5 | Readable, but unclear: buttons of the same size and weight that mean different things, important numbers small, no clear primary action, an ambiguous symbol, missing states (no "can't afford" look when the request asks for one). A coherent but generic button skin with readable bold labels, a locked state that looks locked, and flat hierarchy sits here: about a 4.5. |
| 8 | Every label readable at the size shown. The primary action is obvious. States shown where the request implies them (selected tab, greyed-out unaffordable, today highlighted). Buttons look pressable and are big enough to hit. Fits the screen with room for the Roblox top bar. |
| 10 | Feels like a shipped front-page game UI: instant comprehension, consistent iconography, clear feedback states, nothing to learn. |

### 5. Feedback and life
Does it look alive and responsive? Visible motion, glow, particles, highlights, state cues. Not sound.

| Score | What it looks like |
|---|---|
| 2 | Completely static where the request implies life: a "sparkle" with no particles, a portal with no swirl, a glowing egg that is not lit. |
| 5 | Some life, but thin: one particle emitter, a single glow, a pulse that barely differs between `play` frames, state cues present but faint. |
| 8 | Everything the request implies should move, glow or react is clearly doing so (particles, light, difference between the `play` frames), and the stills carry the state cues the piece needs (selected, disabled, on or off). Nothing that should be alive looks dead. |
| 10 | Rich, tasteful feedback a top studio would ship, including unrequested touches that fit (idle bob, shine sweep, light flicker, ambient drift); motion reads clearly across the `play` frames. |

A piece whose request implies no motion at all (a static settings window, a quiet landscape) is not
penalised for being still: judge whether the stills carry the cues and ambient touches that fit, and
score it 8 or more if they do.

### 6. Polish: nothing placeholder, broken or amateur
Would anything make a player think "unfinished" or "made by an AI"?

| Score | What it looks like |
|---|---|
| 2 | Obvious placeholders (default "TextLabel" text, "Button" labels, missing images shown as blank squares, Lorem ipsum), broken geometry, error-looking output, or an unlit and unreadable scene. |
| 5 | Works, but several rough edges: misaligned elements, inconsistent corner radii or stroke widths, z-fighting, a part clipping through another, generic icons, jagged edges against a void. |
| 8 | At most one tiny rough edge, visible only on close inspection. |
| 10 | Nothing to fix. |

### 7. Style: does it look like it came from the same game as the reference board?

Look at the reference board first, then at the build. For a UI piece, check each of the seven signatures and say
for each whether it is **present**, **weak** or **missing**, citing the screenshot:

1. `font`: a heavy rounded font, and every text has a thick outline (white labels with a dark outline; coloured
   numbers with a darker outline of the same hue).
2. `gloss`: buttons, tiles and cards have a vertical gradient, lighter at the top; no flat fills.
3. `studs`: a faint repeating Roblox stud pattern on buttons, tiles, headers and cards.
4. `borders`: thick borders in a darker shade of the element's own colour; windows have a dark slate frame;
   small rounded corners.
5. `icons`: big shaded 3D-looking icons that overflow their frame; badges (the X, an i, a check) sit on the
   frame's edge, half outside.
6. `colour`: saturated candy colours by role; nothing dull grey except disabled things and the window frame.
7. `layout`: game layout conventions: tabs top centre, square icon tiles on the left edge, the currency stack
   bottom left, a hotbar bottom centre, offers and quests on the right, one window at a time in the centre.
   Judge only the parts this request has (a shop window alone is judged as a window in the centre).

For a world piece the signatures are not listed; judge the ground, lighting, props and density against R10–R13
(planning/STYLE-BIBLE.md §4).

| Score | What it looks like |
|---|---|
| 2 | Generic or default Roblox UI; grey. |
| 5 | Clearly "trying": some outlines and colours, but flat, or missing the studs, the 3D icons or the overflow. |
| 8 | Same family as the references: a player would not notice a different designer. At most one signature is weak; none is missing. |
| 10 | Could be a screenshot from the same game as the references. |

## Calibration

These come from earlier blind critiques of StudPilot builds, so you know where the anchors sit.

- A "crystal mining game" request built as a default Baseplate with four flat brown tiles, three plain
  coloured squares, one knee-high crystal and a HUD: delivers 1, visual 1.5, layout 1, feedback 1,
  polish 1. Almost everything was placeholder.
- The HUD from that same piece (rounded studded buttons with icons and bold outlined white labels, a
  locked state that reads as locked, three buttons of identical size so none leads, a tiny counter, an
  ambiguous "+" button, a skin that does not match the flat world): UI/UX 4.5, and a visual-quality
  mark held down by the mismatch.
- A near-black scene where the floor cannot be told from the sky, with flat magenta slabs and a modal
  panel overlapping the HUD buttons behind it: delivers 2, polish 1, and severe flaws (the subject
  cannot be made out; overlapping UI).
- Two floating labels on neighbouring pads that overlap and read as one word: a severe flaw
  (overlapping text), whatever else is good in the shot.

## Severe flaws

A severe flaw fails the piece whatever the scores are. List one only if the pictures show it. Severe
flaws:

1. **The main subject is missing or cannot be made out**: something different from the request was
   built, the place is still the empty Baseplate, or the lighting or framing hides what was built.
2. **A broken or obviously placeholder element**: default `TextLabel` or `Button` text, an image that
   failed to load, geometry visibly broken (parts exploded, inside-out, floating debris).
3. **Text that is unreadable or overlapping**, or clipped off the screen, at the size shown.
4. **Wrong scale for the avatar**: a door, path or pad the avatar cannot use, or a prop far outside its
   real proportion to a 5-stud avatar (a chest taller than the avatar, a coin the size of a car).
5. **A requested effect or mechanic is visibly absent**: the `play` frames show a portal with no
   particles, a jukebox with no light, a "glowing" egg that is not lit, a pickup that does not move.
6. **Content against Roblox rules**: gambling framing, fake Robux, scams, or mature content.

Do not list taste disagreements as severe flaws. Put them in the area scores.

## What you return

Return JSON only, nothing before or after it:

```json
{
  "scores": {
    "delivers": 0,
    "visual": 0,
    "layout": 0,
    "ui": 0,
    "life": 0,
    "polish": 0,
    "style": 0
  },
  "signatures": { "font": "present", "gloss": "weak", "studs": "missing", "borders": "present", "icons": "missing", "colour": "present", "layout": "present" },
  "na": ["ui"],
  "severeFlaws": [{ "flaw": 3, "evidence": "overview: the price text overlaps the egg icon" }],
  "topFixes": ["the three most important improvements, most important first"],
  "notes": "two or three sentences: what the piece is, what works, what does not",
  "shotsViewed": ["every screenshot file name you looked at"]
}
```

- `scores` holds a number from 0 to 10 for every area that is not in `na`, and `null` for an area that
  is. Only `ui` may be in `na`.
- `signatures` is given for a UI piece (every one of the seven, each "present", "weak" or "missing") and left out
  for a world piece.
- `severeFlaws` is an empty list when there is none. `flaw` is the number from the list above, and
  `evidence` names the screenshot it is visible in.

## The pass rule (applied by the harness, not by you)

You do not decide whether a piece passes, and the threshold below must not move your scores: score
what the pictures show.

A piece **passes** when all of these hold:
- the **lower** of the two critics' scores is **8 or more** in every applicable area (an area counts
  as N/A only if both critics mark it N/A; if one scores it, that score is used);
- **neither** critic lists a severe flaw;
- the play test shows **0 errors** (from the console log);
- every **scripted functional check** of the piece passes;
- the **claim audit** finds **0 unsupported claims** in the reply, and the reply makes **no visual claim** (no
  "verified", "looks", "beautiful" or "matches" about how something looks: visual claims are yours);
- for a UI piece, the **style** score is 8 or more and **no signature is "missing"** in either critic's list;
- the automatic checks passed before you were asked: the kit lint and the colour gate (planning/STYLE-BIBLE.md §6).

The verdict (`verdict.json`) records each critic's scores, the lower score per area, both flaw lists,
the four non-critic results, and `pass: true|false` with the failing reasons.
