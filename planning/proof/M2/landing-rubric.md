# Landing rubric: "looks like a top-tier product" (M2 final critics)

This rubric is for the M2 bar in plan section 6: the blind critic rates the landing page at 8 or more out of 10 on
"looks like a top-tier product". It is not `planning/critic-rubric.md`, which judges Roblox pieces in M3.

## What the critic receives, and nothing else

- This file.
- PNG screenshots of the deployed landing page (`https://studpilot.app/`): the full page at 1440x900 (desktop) and
  the full page at 390x844 (phone), plus the first screen (above the fold) of each.
- One line of context: "a website for an AI tool for Roblox creators".

The critic does not see the code, the plan, earlier scores, other critics' replies or the design notes. Each critic is
a fresh agent.

## The question

How much does this page look like the landing page of a top-tier software product (the standard set by the best
developer and creator tools of 2026), judged only on what is visible?

## Areas (score each 1 to 10)

1. **First screen.** In five seconds, is it clear what the product is and what to do next? One clear headline, one
   primary action, a visual that supports the message.
2. **Hierarchy and layout.** One reading path down the page; sections with a clear purpose; a grid that holds;
   nothing that looks empty, crowded or unfinished.
3. **Typography.** Sizes, weights and line lengths that read easily; consistent scale; no orphans, cramped headings
   or runs of tiny grey text.
4. **Colour and contrast.** One accent used with purpose; text readable on every surface; nothing muddy or garish.
5. **Imagery.** Images look real and crisp, support the claim next to them, and are not stock, clip art or obvious
   placeholders.
6. **Polish and consistency.** Spacing rhythm, alignment, radii, borders and buttons consistent across sections;
   nothing broken, overlapping or misaligned.
7. **Phone.** The 390 px page is designed, not merely squeezed: readable, tappable, no horizontal scroll, no stacks that
   lose their meaning.

## Anchors for the overall score

- **2:** looks broken or abandoned: overlapping or cut-off text, missing images, default browser styles, no clear
  product.
- **5:** a competent template: works and reads, but generic, uneven spacing, weak hierarchy, imagery that does not
  sell anything; nobody would mistake it for a leading product.
- **8:** looks like a real, well-funded product team made it: confident hierarchy, consistent rhythm, crisp real
  imagery, one accent used well, a phone layout that was designed; at most a few small nits.
- **10:** indistinguishable from the best in class; nothing to fix.

## Severe flaws (any one caps the overall score at 5)

- Text that overlaps, is cut off, or cannot be read against its background.
- A broken, empty or obviously placeholder image or section.
- Horizontal scrolling or a layout that breaks at 390 px.
- A primary action that cannot be found on the first screen.

## Reply format (JSON)

```json
{
  "areas": { "first_screen": 0, "hierarchy": 0, "typography": 0, "colour": 0, "imagery": 0, "polish": 0, "phone": 0 },
  "severe_flaws": ["..."],
  "overall": 0,
  "top_fixes": ["the three changes that would raise the score most, each naming where on the page"]
}
```

## Gate

Two fresh critics score the finished, deployed landing. The landing passes when the LOWER of the two overall scores
is 8 or more and neither critic names a severe flaw. Up to 3 fix cycles; each cycle uses two new critics.
