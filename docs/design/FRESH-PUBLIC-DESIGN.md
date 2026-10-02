# Fresh public design

This is the visual brief for the public Apple site (the marketing landing page and the shared
documentation, pricing, status and legal chrome). It is intentionally independent from the signed-in
workspace. The workspace can evolve on its own; the public site should make the product legible before
someone signs in.

## Direction

Apple is a small editorial studio for making Roblox ideas real. The page should feel like a printed
creative tool catalogue that happens to contain a live conversation: calm, tactile and precise, with
one decisive colour. It should not look like a generic AI chat, a game launcher, or a dashboard.

The landing is light-first and spacious. Its composition uses an asymmetric margin, oversized serif
headlines, thin registration lines and hard paper edges. A representative chat preview is a page in
the composition, not a simulated product screen floating in space. The copy says what Apple does in an
open Roblox Studio place and labels illustrative content as illustrative.

## Palette

| token | value | role |
| --- | --- | --- |
| porcelain | `#f4f1ea` | page ground and browser theme colour |
| ink | `#17201b` | headlines, controls and high-contrast surfaces |
| vermilion | `#ef512c` | action, emphasis and the one active signal |
| paper | `#fffdf8` | reading surfaces and cards |
| paper shadow | `#ebe6dc` | quiet alternation and inset diagrams |

The default palette is deliberately warm and opaque. There are no green glows, blurred glass panels,
orb fields, concentric rings or full-bleed promotional banners. Shadows are short, hard offsets that
make a card feel placed on a desk. The accent is a signal, not an atmosphere.

## Type and layout

- `Newsreader` carries display copy and the Apple wordmark; `DM Sans` carries utility and body copy;
  `IBM Plex Mono` carries labels, costs, timestamps and file names.
- Headline type remains below the site's 3.4rem display cap so it stays readable on phones and does
  not turn the page into a poster that hides the product.
- The hero uses a narrow editorial margin, a broad copy column and a tilted conversation preview.
  Sections alternate porcelain and paper-shadow grounds. Cards use square-ish corners and generous
  internal space.
- The library is a provenance ledger. Its local thumbnails are product evidence, not decorative hero
  media: every card keeps its pack, author, licence and source link.

## Motion

The hero's only ambient motion is two fine vermilion registration lines drifting over the paper. The
chat status line, card lifts and thumbnail scale are small interaction cues. Section reveals are
subtle and additive. `prefers-reduced-motion: reduce` freezes the lines, collapses entrance animation
to an instant, and removes lift transitions. No autoplay, video, canvas or third-party animation
runtime is used.

## Content and trust

The landing derives mode and plan names, costs, credits and build counts from `@golem/shared`. Its
library figures point at the checked manifest fields (`library.total`, `library.withRobloxId` and
`templates.usable`). The plugin link still follows the live-store flag. All sign-in, sign-up, docs,
pricing, legal and source links remain real routes or the existing worker surface.

Illustrative transcripts, counts and place names are marked as examples. The page never implies a
visitor's project was inspected before Studio is paired. Pricing remains honest about Credits and the
free tier; the pricing route remains the canonical source for the full plan table.

## Accessibility contract

- There is one `main`, one page `h1`, ordered section headings, a skip link and labelled navigation.
- The conversation and place panels have accessible names and explicitly say they are illustrative.
- Library thumbnails have intrinsic dimensions, lazy loading and empty alt text because their adjacent
  card text already names them. Source links open with `noopener nofollow`.
- Focus rings use vermilion on every interactive control. Layout collapses to one column without
  clipping at narrow widths.

## Source of truth

The landing implementation is deliberately self-contained in `apps/site/src/pages/index.astro` and
`apps/site/src/styles/landing.css`. Shared public routes use `apps/site/src/styles/global.css`; the
shared navigation and footer keep the same token names so there is one language across docs, pricing,
status and legal pages. This document records the direction; it is not a claim that the full Apple
product or its signed-in workspace has been redesigned.
