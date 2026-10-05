# StudPilot critic rubric (v1, 2026-10-04)

This rubric is the only instruction a critic gets besides the request and the screenshots (plan §4.3,
handoff task 2.1). Two critics score every piece without seeing each other. Do not change this file while
a milestone's runs are being scored: version it (`critic-rubric-v2.md`) and say which version a verdict used.

## What you are given

- **The request**, exactly as the user typed it, typos included.
- **Screenshots** of what StudPilot built, on an otherwise empty Baseplate:
  - world pieces: overview, three-quarter, close-up, player's eye at spawn;
  - UI pieces: the screen at 1920×1080 and at 1280×720, plus a shot after each button the press list pressed;
  - when the request implies motion or effects: a short strip of frames taken during a play test, in order.
- Nothing else. You do not see the code, the reply, the logs or the other critic.

You judge what the pictures show. Sound is proven by the logs, not by you, so do not score or guess it.
If a picture cannot show something (for example whether a save works), leave it to the scripted checks.
If something should be visible and is not, score it as missing.

## How to score

Score each area from 0 to 10, using the anchors below. Use whole or half points. **Score what is in
the pictures, not what the piece might do.** Compare against what a top Roblox studio would ship for this
exact request, not against other AI tools.

Mark an area **N/A** only where this rubric says it may be N/A.

### 1. Delivers the request
Does the picture contain what was asked, all of it, at the size and count asked?

| Score | What it looks like |
|---|---|
| 2 | The main subject is missing or unrecognisable. Something else was built. |
| 5 | The main subject is there, but parts of the request are missing (two of six eggs, no featured item, no price), or a stated number is wrong. |
| 8 | Everything named in the request is there and recognisable at a glance. At most one minor detail is off (one label slightly different, say). |
| 10 | Everything is there, and the obvious unstated needs of the request are also met (a shop has a way to close it; an obby stage has a visible start and end). |

### 2. Visual quality and art direction
Does it look designed? Colour, materials, lighting, shape language, and one consistent style.

| Score | What it looks like |
|---|---|
| 2 | Default grey parts or default UI, flat default lighting, no chosen palette. Reads as a test or a template. |
| 5 | A palette and a style were chosen, but they are generic or inconsistent: everything is the same saturation, mixed styles, plain blocks with colour applied. The Phase T round-2 shop UI (a coherent but generic studded button skin that did not match anything) is a 4–5. |
| 8 | A clear, consistent style that fits the request's genre (simulator, tycoon, cozy, neon). Materials and colours are chosen with intent, with contrast and a focal colour. Lighting supports the mood. It would not look out of place in a front-page simulator game. |
| 10 | Distinctive and polished: a well-judged palette, considered silhouettes, depth (shadow layers, strokes, highlights on UI; material variation and lighting on world pieces). A top studio would ship it as is. |

### 3. Layout, composition and scale
Is it placed well, readable from the player's view, and the right size for a ~5-stud avatar?

| Score | What it looks like |
|---|---|
| 2 | Wrong scale (a door the avatar cannot fit through, a chest bigger than a house), pieces floating or sunk into the ground, or a UI that runs off screen. |
| 5 | Plausible scale, but awkward: parts overlap, spacing is uneven, things are lined up in a rigid grid with no hierarchy, or a world piece is lost in empty space. UI elements are crowded or unevenly spaced. |
| 8 | Correct scale for the avatar. A clear focal point. Grouping and spacing are deliberate (clusters, not grids, for world props). UI has a clear hierarchy, aligned edges, and fits both 1920×1080 and 1280×720 without clipping. |
| 10 | Composed like a designed shot: leads the eye, frames the subject, uses negative space well. UI hierarchy makes the most important action obvious within a second. |

### 4. UI/UX clarity (N/A when the piece has no screen UI and needs none)
Can a 13-year-old understand and use it at a glance?

| Score | What it looks like |
|---|---|
| 2 | Text unreadable (too small, low contrast, overlapping), or no way to tell what any control does. |
| 5 | Readable, but unclear: buttons look alike when they mean different things, important numbers are small, no clear primary action, missing states (no "can't afford" look when the request asks for one). |
| 8 | Every label readable at both resolutions. Primary action obvious. States shown where the request implies them (selected tab, greyed-out unaffordable, today highlighted). Buttons look pressable and are big enough to hit. |
| 10 | Feels like a shipped front-page game UI: instant comprehension, consistent iconography, clear feedback states, nothing to learn. |

World pieces with a prompt or a sign (a "Press E" prompt, a price sign) are scored here too; a world piece
with no text and no prompt is N/A.

### 5. Feedback and life
Does it look alive and responsive? Visible motion, glow, particles, highlights, press states. Not sound.

| Score | What it looks like |
|---|---|
| 2 | Completely static where the request implies life: a "sparkle" with no particles, a portal with no swirl, a button with no pressed state. |
| 5 | Some life, but thin: one particle emitter, a single glow, a press state that is barely different. |
| 8 | The effects the request asks for are clearly visible in the frames (particles, light, motion between frames, hover/press states), and the piece has at least one unrequested touch of life that fits (idle bob, shine sweep, light flicker). |
| 10 | Rich, tasteful feedback that a top studio would ship; motion reads clearly across the frame strip; nothing feels dead. |

If the request implies no motion at all (a static settings window) and the frames show correct press states,
score 8 or more; do not penalise a still piece for being still.

### 6. Polish: nothing placeholder, broken or amateur
Would anything make a player think "unfinished" or "made by an AI"?

| Score | What it looks like |
|---|---|
| 2 | Obvious placeholders (default "TextLabel" text, "Button" labels, missing images shown as blank squares, Lorem ipsum), broken geometry, or error-looking output. |
| 5 | Works, but several rough edges: misaligned elements, inconsistent corner radii or stroke widths, z-fighting, a part clipping through another, generic icons. |
| 8 | At most one tiny rough edge, visible only on close inspection. |
| 10 | Nothing to fix. |

## Severe flaws

A severe flaw fails the piece whatever the scores are. List one only if the pictures show it. Severe flaws:

1. **The main subject is missing**, or something different from the request was built.
2. **A broken or obviously placeholder element**: default `TextLabel`/`Button` text, an image that failed to load, geometry visibly broken (parts exploded, inside-out, floating debris).
3. **Text that is unreadable or overlapping** at either UI resolution, or clipped off the screen.
4. **Wrong scale for the avatar**: a door, path or pad the avatar cannot use, or a prop scaled far outside its real-world proportion to the avatar (for example a chest taller than the avatar or a coin the size of a car).
5. **A dead mechanic you can see**: a control or prompt that the frames show was pressed or triggered and nothing changed, or a requested effect visibly absent (a portal with no particles, a jukebox with no light).
6. **Content against Roblox rules**: gambling framing, fake Robux, scams, or mature content.

Do not list taste disagreements as severe flaws. Put them in the area scores.

## What you return

Return JSON only:

```json
{
  "scores": {
    "delivers": 0,
    "visual": 0,
    "layout": 0,
    "ui": 0,
    "life": 0,
    "polish": 0
  },
  "na": ["ui"],
  "severeFlaws": [{ "flaw": 3, "evidence": "shot 2: the price text overlaps the egg icon" }],
  "topFixes": ["the three most important improvements, most important first"],
  "notes": "two or three sentences: what the piece is, what works, what does not"
}
```

- `scores` holds a number for every area that is not in `na`; an area in `na` has `null`.
- Every severe flaw cites the shot it is visible in.

## The pass rule (applied by the harness, not by the critic)

A piece **passes** when all of these hold:
- the **lower** of the two critics' scores is **≥ 8** in every applicable area (an area counts as N/A only if
  both critics mark it N/A; if one scores it, that score is used);
- **neither** critic lists a severe flaw;
- the play test shows **0 errors** (from the console log);
- every **scripted functional check** of the piece passes;
- the **claim audit** finds **0 unsupported claims** in the reply.

The verdict (`verdict.json`) records each critic's scores, the lower score per area, both flaw lists, the
four non-critic results, and `pass: true|false` with the failing reasons.
