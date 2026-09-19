# The internal UI reference library

Not user-facing. This exists so that every interface the product generates is answerable to
something real that shipped on Roblox, instead of to an agent's idea of what a game menu looks
like.

## The rule this library enforces

**No genre gets a design until at least five references for it are recorded here.** A theme with
four is not a theme, it is a guess with a colour palette.

`tests/ui-references.test.mjs` enforces it as a RATCHET, failing in both directions: a genre
outside the `PENDING` list with fewer than five references fails, and a genre INSIDE `PENDING`
that has reached five also fails, so the list of known holes cannot quietly outlive the holes. A
theme that can be rendered while being neither referenced nor declared pending fails too — the
one thing that must never happen is a design shipping with nothing behind it and nobody noticing.

Today `simulator` is the only complete genre. The other seven are in `PENDING` and the test says
so out loud rather than letting them pass.

## What a reference is, and what it is not

A reference is **a record of an observation**: where the image was seen, what kind of game it came
from, and the specific construction decisions readable in it. It is a row of notes, not a picture.

No image is copied into this repository. Roblox UI art is somebody's work; the library stores what
was *learned* — stroke weights, corner radii, the way a header overhangs its panel — which is a
description of a visual convention and not a reproduction of anyone's file. The `source` field
says where it was seen so the claim can be checked.

## Why the rules are separated from the colours

`ui-kit-themes.ts` already held a `simulator` theme with the right *palette* — saturated blue
panel, near-white cards, green accent — and rendering it in Studio showed it still did not look
like the references. The palette was never the gap. The gap was construction: no thick dark
stroke, no banner overhanging the panel, flat buttons with no bevel, no text outline, a close
button that is a small square rather than a red circle hanging off the corner.

So each reference records **construction**, and `rules` in each genre file is the distilled set.
A theme supplies colour and copy; the rules supply the shape. Getting one right and the other
wrong produces exactly the near-miss that sent this library into existence.

## Files

    <genre>.json    one per genre in ui-kit-themes.ts
      genre         matches a theme id
      references[]  >= 5, each with source, context and what it demonstrates
      rules         the construction the references agree on, in units the kit can apply

## Honest limits

- The references recorded on 2026-09-19 were supplied by the owner as screenshots of shipped
  Roblox games. They were read carefully; they were not measured with a colour picker, so stroke
  weights and radii are read off proportionally and are approximations stated as such.
- Genres beyond `simulator` and `tycoon` are not yet at five and are marked `incomplete: true`.
  The test fails on them by design rather than letting a thin genre pass quietly.
