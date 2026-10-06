# M2 summary (measured; closed 2026-10-06)

Merged: #29 (pricing), #33 (owner update), #34 (app), #40 (M3 harness, split out of #36). Not merged: #35 (site
rebuild on new layouts): its Playwright contrast audit failed only on the Linux runner for /catalog after one fix
cycle, and the owner's rebuild request (planning/REBUILD-PLAN.md) replaced those pages with R5. Re-themed in R5 (#45).

## Measured on the deployed site (studpilot.app at 1dd1ba9e, 2026-10-06)
Lighthouse 12, one run per page (owner rule), `measured-2026-10-06/lighthouse-summary.json`:

| Page | Form factor | Performance | Accessibility | Best practices | SEO | LCP | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| / | mobile | 93 | 97 | 100 | 100 | 2615 ms | 1 ms |
| / | desktop | 92 | 97 | 100 | 100 | 1346 ms | 0 ms |
| /pricing | mobile | 98 | 100 | 100 | 100 | 1679 ms | 0 ms |
| /pricing | desktop | 100 | 100 | 100 | 100 | 458 ms | 0 ms |

The 97 on / is `color-contrast` on the stage tabs, measured mid-way through the entrance fade (#565656 sampled;
the settled colour is --muted #a1a1a1 on #0b0b0b). The rendered-pixel AA audit in CI and axe (below) pass them.

WCAG 2.2 A/AA, automated only (owner rule): axe 4.13 on 23 routes x 2 viewports x 2 themes = 92 runs,
`measured-2026-10-06/axe-summary.json`. 2 runs with a violation, one rule: `scrollable-region-focusable` x6 on
/proof at phone width. Fixed in #46.

## Gates
- Accent: one critic for all three candidates (`accent/README.md`): violet 7, cyan 6, magenta 5. Violet stays;
  R5 kept it (Kumo's own brand is the azure the owner rejected).
- Landing critic gate (overall >= 8): 6/10, then 5/10 after the one fix cycle. Not passed; `STALLED.md`. Re-run
  at M7 with passed pieces in the hero.
- Google and Discord sign-in: code merged (#34); switching them on and one live sign-in each is BLOCKED.md N2.
