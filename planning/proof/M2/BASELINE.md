# M2 baseline, before the pricing-config change

Measured on 2026-10-04 in a fresh clone of `studpilot/m1-domain` at `ae3d5175`, branch `studpilot/m2`, Node v26.8.1,
`pnpm install --frozen-lockfile`, no edits. The counts are the Node test runner's own summary lines.

| Suite | Command | tests | pass | fail | skipped |
|---|---|---|---|---|---|
| site | `cd apps/site && npx astro build && node --test` | 311 | 311 | 0 | 0 |
| web | `cd apps/web && node --test` | 2454 | 2454 | 0 | 0 |
| worker | `cd apps/worker && node --test` | 5428 | 5422 | 0 | 6 |
| root | `node --test tests/` | 631 | 613 | 2 | 16 |
| evals | `cd packages/evals && pnpm test` | 1481 | 1476 | 0 | 5 |
| sdk | `cd packages/sdk && pnpm test` | 95 | 95 | 0 | 0 |
| design | `cd packages/design && pnpm test` | 80 | 80 | 0 | 0 |

Typecheck (`tsc --noEmit`): `packages/shared`, `apps/web`, `apps/worker` all exit 0. `packages/shared` has no test script
(`scripts/check-workspace-coverage.mjs` exempts it as "no runtime behaviour of its own").

The 2 root failures are the two `tests/check-pixels.test.mjs` cases that fail in any clone under the scratchpad
("THE CONTROL: against a SAME-ORIGIN baseline, a real change is still an undeclared regression" and "against a baseline
with NO provenance, the same diff is reported as a cross-build comparison"); they fail on the untouched tree too.

Guards on the untouched tree:

- `node scripts/check-old-names.mjs`: CLEAN, 11376 tracked files, 46138 hits, 46138 allowlisted by 642 lines, 0 violations.
- `node scripts/check-credit-figures.mjs`: exit 0 ("1 modes agree"); free day 231 Credits, a whole build 77 Credits, 3 a free day.
- `node scripts/check-offer.mjs`: exit 0, "OFFER COHERENT, 4 plans, 405 copy files"; Pro $12 vs a $5.82 floor, Max $40 vs a $9.70 floor.

Old figures this slice replaces (all from `packages/shared/src/index.ts` before the change): Free 231 internal credits a day
and 2,310 a month; builder 416 and 12,600; studio 700 and 21,000; enterprise 833 and 25,000; builder $12 and studio $40 a
month; `CREDITS_PER_BUILD` 77; `NEURONS_PER_CREDIT` 30.
