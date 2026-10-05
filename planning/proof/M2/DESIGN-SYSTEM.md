# M2 step 2.1: the design system (2026-10-05)

A new visual system for both apps: a dark, professional base in the family of Cursor and Linear, with
ONE bright accent, a new logo, and one token file. Layouts are not touched here. That is the site and
app rebuild (M6); this step swaps the visual system underneath them so both apps keep rendering.

Every number below was measured in this clone on 2026-10-05. Where a command produced it, the
command is beside it.

## 1. The tokens

One file: `packages/design/src/web/tokens.css`, exported as `@studpilot/design/tokens.css`.
`apps/site` (both layouts) and `apps/web` (`main.tsx`) import it first, and depend on the package
(`"@studpilot/design": "workspace:*"`, one lockfile change). No other sheet declares a colour, radius,
space, type or motion token.

| Group | Tokens |
|---|---|
| Surfaces (dark, default) | `--paper #0a0b0d`, `--paper-2 #0e1013`, `--surface #131519`, `--surface-2 #1a1d22`, `--surface-3 #23262c` |
| Ink | `--ink #f4f5f7`, `--ink-2 #d2d5db`, `--muted #9da2ad`, `--faint #8d929d` |
| Edges | `--hairline`, `--line`, `--line-strong` (solid), `--control-fill`, `--control-line`, `--quiet-line`, `--quiet-ink` |
| Accent family | `--accent`, `--accent-strong`, `--accent-ink` (text on accent), `--accent-wash`, `--accent-ring` |
| Status | `--good`, `--warn`, `--bad`, `--info` (green is for status only) |
| Radii | `--r-xs 4`, `--r-sm 6`, `--r-md 8`, `--r-lg 12`, `--r-xl 16`, `--r-pill` |
| Space | `--space-1` to `--space-8` on a 4 px grid |
| Type | `--font-body`, `--font-display`, `--font-sans`, `--font-mono` (system stack), `--text-xs` to `--text-3xl`, weights, leading, tracking |
| Motion | `--t-fast 120ms`, `--t-color 160ms`, `--t-base 200ms`, `--t-slow 320ms`, three easings, none overshooting |
| Elevation | `--shadow-pop`, `--shadow-modal` (menus and dialogs only), `--halo` (a flat 3 px focus ring) |

A light block exists because both apps ship a theme toggle and the existing contrast tests iterate both
themes. Each theme block declares exactly one `--accent`.

The language is flat: a surface is a colour and a hairline edge. No glass, no blur, no aurora, no
gradient. Menus and dialogs separate by a hairline and a short low shadow; cards cast nothing and do
not move. The primary action on every screen is the accent, filled, with `--accent-ink` as its label.

## 2. The accent: three candidates, all AA

Violet is the default (candidate 1). The three are `packages/design/src/web/accents.json`; the ratios
in it are written by `node packages/design/src/web/measure-accents.mjs --write`, never typed, and
`packages/design/src/web/tokens.test.mjs` recomputes them from the two files on every run and fails
if one is below AA or if the record is stale. None is green, azure blue or ember orange: those hues are
rejected by a test (`planning/sections/10-web-brand-design.md` 10.3 is where the owner rejected them).

The six measured columns: **text** is the accent as text on `--paper`; **worst** is the accent as text
on the worst of the five surfaces (this also covers the focus ring, which needs 3:1; all three
candidates clear it by at least 5:1); **label** is `--accent-ink` on `--accent`; **hover** is
`--accent-ink` on `--accent-strong`; **chip** is `--accent-strong` as text on the accent wash over
`--surface-2`.

| Candidate | Theme | accent / strong / ink | text | worst | label | hover | chip |
|---|---|---|---|---|---|---|---|
| 1 violet | dark | `#a67cff` / `#bfa2ff` / `#0c0816` | 6.51 | 5.02 | 6.54 | 9.25 | 6.45 |
| 1 violet | light | `#7240d8` / `#5f2fc4` / `#ffffff` | 5.74 | 5.12 | 6.10 | 7.81 | 6.21 |
| 2 cyan | dark | `#22d3ee` / `#67e8f9` / `#03161b` | 10.89 | 8.39 | 10.24 | 12.77 | 8.92 |
| 2 cyan | light | `#0b6b82` / `#085669` / `#ffffff` | 5.75 | 5.12 | 6.11 | 8.25 | 6.57 |
| 3 magenta | dark | `#ec62d2` / `#f58ae2` / `#17061a` | 6.79 | 5.23 | 6.72 | 8.93 | 6.34 |
| 3 magenta | light | `#b0178f` / `#92107a` / `#ffffff` | 5.87 | 5.23 | 6.24 | 8.15 | 6.36 |

Every text token (ink, status, syntax) clears 4.5:1 on every one of the five surfaces in both themes,
the lowest being 4.86:1 in dark (`--faint` on `--surface-3`) and 4.96:1 in light (`--warn` on
`--surface-3`).

To switch candidate: copy its eight values into `tokens.css` and set `"default"` in `accents.json`.
`tokens.test.mjs` fails until the two agree. The favicon is generated from the token file, so
`pnpm brand` follows.

**Which one ships is an owner decision** (handoff 6.1 renders all three on the landing hero and picks
the one the blind critic rates highest). Nothing in this step picked it by taste; candidate 1 is the
default because the task made it so.

## 3. The logo

One new mark, `packages/design/brand/studpilot-mark.svg`: a rounded tile with one circular stud knocked
out of it and one corner left sharp, pointing up and to the right. One filled path in `currentColor`,
two closed shapes, 32 by 32 units. The wordmark lockup is the mark plus live text in the system
font. `PROVENANCE.md` states it was drawn in this repository by Claude Code as vector path data, not
generated by an AI image service, and that no network call was made.

Rendered at 16, 32 and 180 px in `planning/proof/M2/logo/` (`favicon-16.png`, `favicon-32.png`,
`favicon-180.png`). `scripts/make-brand-assets.mjs` was rewritten to the system font and the new
mark: it composes `favicon.svg` from the mark and the tokens, renders `icon-16/32/180/512.png` into
`packages/design/brand/` and the site's set (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`,
`og.png`) into `apps/site/public/`. It fetches nothing: a request to anything but `file://` fails the
run. `node scripts/make-brand-assets.mjs --check` verifies every output is current.

Every use of an old mark was replaced:

| Where | Was | Now |
|---|---|---|
| `apps/site` favicon, icon set, `og.png` | azure studded brick | the new mark, generated |
| `apps/site` `StudPilotMark.astro` (header, footer, flow diagram, engine page) | folded sheet | the new mark, in the accent |
| `apps/site/brand/og.html` | hexagon holding a cube, Google Fonts | the new mark, system font, tokens linked by path |
| `apps/web/index.html` favicon | folded sheet | the new favicon, inline |
| `apps/web` rail, sign-in, loading pulse (`glyphs.tsx`) | hexagon holding a cube | the new mark |
| `apps/web` assistant avatar (`model-mark.tsx`) | folded sheet | the new mark |
| `apps/web` empty-state illustrations (project shelf, roadmap, 404) | the cube-in-hexagon drawn large | drawn from the new mark's tile and stud |
| `tools/repo-chat` favicon, `scripts/owner-dashboard` rail and registry | brick, folded sheet | the new mark |

## 4. What was deleted

- `apps/site/src/styles/studpilot-minimal.css` (398 lines): its tokens moved to `tokens.css`; the rest is
  `apps/site/src/styles/base.css` (234 lines), without the `.glass` class and the pill and lift on
  `.btn`.
- `apps/web/src/design/studpilot-minimal.css` (608 lines): tokens moved; the shell rules are
  `apps/web/src/design/shell.css` (535 lines), without the blur and the rgba greys.
- `apps/web/src/design/glass.css` (339 lines): deleted whole, the glass shell, aurora and lifts.
- The two token blocks of `apps/web/src/design/system.css` (168 lines of a green-era palette, which
  the later sheets had been overriding), and its `.studio-atmosphere` rules.
- `apps/web/src/components/studio-atmosphere.tsx`, `apps/site/src/components/picks/Aura.astro` and
  `aura.css`: the aurora layers.
- The three old logos' source render, `apps/site/brand/studpilot-mark-source.png`, and every copy of
  the old geometry (found by `grep` for the paths and the brick's three face colours).
- Counts, measured at `932a502d` (before) and now, over `apps/site/src` and `apps/web/src`:
  `backdrop-filter` lines 90 to 0; `--glass-*`, `--aurora-*` and `--aura-*` references 250 to 0;
  old accent literals (`#5b7cfa`, `#4568e8`, `#8ca4ff`, `#4264e8`, `#3155d4` and their rgba forms) in
  the tree outside records, 53 lines in 15 files to 0 (the product apps, the packages, the scripts
  including the owner dashboard, the tools and the tests).
- Two web tests that tested the deleted layer: `glass-shell.test.mjs` and
  `decoration-yields-to-the-composer.test.mjs`. Their property, "nothing frosted, nothing ambient behind
  the controls", is `packages/design/src/web/flat.test.mjs` now.

Renamed tokens (so no alias layer exists): `--primary`, `--on-primary`, `--primary-hover` to
`--accent`, `--accent-ink`, `--accent-strong`; `--accent-soft`, `--accent-glow` to `--accent-wash`;
`--accent-light` to `--accent-strong`; `--accent-deep`, `--accent-fill` to `--accent`;
`--accent-on-fill` to `--accent-ink`; `--accent-line` to `--accent-ring`; `--glow` to `--halo`;
`--ease-spring` to `--ease-out`.

## 5. Why the system font

The system stack (`-apple-system`, Segoe UI, Roboto, ...) and no webfont. First paint never waits on a
font; the site's privacy page stays true (no third-party request, and the old `og.html` fetched Google
Fonts); the landing budget keeps its headroom (17,394 B of 20,000 B after, 17,847 B before); and a
dark developer-tool look does not need a licensed face, because the weight, spacing and tracking carry
it. A test (`tokens.test.mjs`) fails on any `@font-face`, Google Fonts, Bunny or Typekit reference in
either app, the brand folder or the card source.

## 6. What the tests hold

`packages/design/src/web/` (new, 33 tests, all green): `tokens.test.mjs` (both apps import the one
file and it is first; one `--accent` per theme and none elsewhere; no retired accent literal outside
the package and no candidate value typed into an app; three candidates, AA, recorded ratios equal the
measured ones, the token file equals candidate 1; every text token on every surface; the system stack
and no webfont; the scale tokens), `brand.test.mjs` (the mark is one path in `currentColor`;
provenance; every place that draws the mark draws the same path; the icon set and manifest; the three
old logos gone, with a positive control that finds each in the form it shipped), `flat.test.mjs` (no
glass, no aurora, no `backdrop-filter`, the three sheets gone, no colour on `:root` outside the file).

Restated, to the property and never weakened (each carries a dated note): site `contrast`,
`living-background`, `theme-on-every-route`, `type-system`, `undefined-custom-property`,
`animation-actually-wins`, `picks-landing`; web `app-ink-ramp`, `contrast`, `code-presentation`,
`image-expiry`, `undefined-custom-property`, `autonomous-default`, `project-menu-above-thread`,
`green-is-for-status-dots`, `picks-settings`, `rtl-workspace`; and the e2e spec
`tests/e2e/atmosphere-on-every-route.spec.ts`: its accent assertion wanted a blue and now asserts the
default candidate, and its pricing layout test now waits for the reveal to finish. That second change
was forced by this step: replacing the spring easing with `--ease-out` made the plan cards start
revealing sooner, and the phone half of that test (which measured at once after load) failed 5 loads in
30, against 0 in 30 on the previous build. Its desktop half had the same hole, since "all three tops are
equal" is also true before the reveal begins. The property is unchanged (side by side on a desk, one
column on a phone); a planted `display: block` on the rail turns it red.

## 7. Not done here

- The page layouts. Both apps keep their old anatomy in the new colours; the owner's rule that a
  redesign keeping the old layouts fails is the M6 rebuild's, not this step's.
- Choosing the accent (section 2).
- About twenty owner-picked interaction components still carry their own spring curves, and the
  landing's flow-line canvas (an owner pick) is unchanged. They are interactions, not the visual
  system.
- `--faint` and the other tokens are measured against the five surfaces only; text on photographs or
  on a real Studio screenshot is the blind critic's job.
- `og.png` is rendered in the system font of the machine that runs `pnpm brand`, so it is not
  byte-identical across operating systems; `--check` is a local command, not a CI step.
- `scripts/check-pixels.mjs` rule 4 (a frame differing from its baseline by more than 2%) fires on every
  frame, because the look changed on purpose. The 80-frame baseline (11 MB) is re-taken with
  `--write-baseline` when the rebuilt layouts land, not twice.

## 8. Mutations: every new or restated test went red, then green

Each row: one planted break (anchor asserted to occur exactly once, then restored byte for byte), the test
that went red, and the exit code of the run after the restore (always 0). 45 of 45. The harness is not
committed; the list is the record.

| Planted break | First test to go red |
|---|---|
| tokens: a second --accent in the dark block | the token file declares exactly one --accent per theme, and has exactly two theme blocks |
| tokens: Base.astro stops importing the tokens | every document layout of the site imports the tokens, and the app imports them before any other sheet |
| tokens: a retired accent literal returns in Nav.astro | no retired accent literal exists in any tracked source outside packages/design |
| tokens: dark --accent drifts from candidate 1 | the token file uses candidate 1: the four accent values match accents.json in both themes |
| tokens: a candidate falls below AA (cyan dark accent dimmed) | every candidate clears AA in both themes, and the ratios recorded in accents.json are the measured ones |
| tokens: a recorded ratio goes stale | every candidate clears AA in both themes, and the ratios recorded in accents.json are the measured ones |
| tokens: a webfont declared in the site base | the type tokens are the system stack, and no webfont is requested anywhere |
| tokens: a candidate lands on green (magenta dark accent -> green) | accents.json holds three distinct candidates, none of them a hue the owner rejected |
| tokens: a candidate accent value typed into the web shell | no accent value of any candidate is typed into an app: an app reads the token |
| tokens: a second sheet declares --accent | no other stylesheet or component style in either app declares a token of the accent family |
| tokens: the pixel vocabulary names a token the file lacks | the hand-written vocabulary the pixel checker reads names only tokens this file declares |
| tokens: faint dimmed below 4.5 (design test) | dark: every ink and status colour clears 4.5:1 on every surface |
| brand: the Astro mark drifts from the brand path | every place that draws the mark draws the same path |
| brand: the old brick geometry returns in Footer.astro | no geometry, palette or source name of the three old logos appears anywhere in the tree |
| brand: the favicon radius changes without the recipe | the favicon is composed from the mark and the tokens, and every copy of it is identical |
| brand: the mark gains a second path | the mark is one filled path in currentColor, simple enough for 16 px |
| brand: the provenance claim is dropped | the provenance states the mark was drawn here by Claude Code, not generated by an image service |
| brand: the manifest names the wrong icon size | the site links the favicon and touch icon, and its manifest points at icons that exist |
| brand: the old brick source render reappears | no file of the three old logos exists |
| flat: a backdrop-filter returns | no backdrop-filter has a value anywhere in either app |
| flat: a glass token returns | no glass or aurora token, class, component or file exists in either app |
| flat: a colour is declared on :root outside tokens.css | no sheet but tokens.css declares a colour on :root, html or a theme attribute |
| flat: glass.css returns | no glass or aurora token, class, component or file exists in either app |
| site contrast: dark --faint dimmed | dark: every text token clears 4.5:1 on every surface |
| site contrast: accent-ink loses contrast on the accent | dark: the focus ring clears 3:1 on every surface, and the accent button reads |
| site living-background: the composer is frosted again | the composer is a flat panel on the shared radius, and no site sheet declares a design token of its own |
| site living-background: an accent typed into the landing page | no rule spends the violet tokens, and nothing glows or grades |
| site living-background: a site sheet re-declares a token | the composer is a flat panel on the shared radius, and no site sheet declares a design token of its own |
| site theme-on-every-route: the address bar disagrees with the page | the address bar cannot disagree with the page, in any theme of either stylesheet |
| site type-system: a literal font stack in a site sheet | EVERY font-family ON THIS SITE SPENDS A TOKEN, rather than restating a stack |
| site type-system: --font-mono removed from the token file | the walk found real sheets and real type declarations, so nothing below is vacuous |
| site undefined-custom-property: a var() nobody defines | every bare var() names a custom property something defines |
| site animation-actually-wins: Landing stops importing the tokens | both public layouts load the design tokens and then the site base, not relaunch.css |
| web app-ink-ramp: faint dimmed | every ink clears 4.5:1 on paper and on every surface, in both themes |
| web app-ink-ramp: the app re-declares --faint | the app and the public site use one ramp: both load the token file and neither declares an ink |
| web contrast: --nm-faint becomes a dim literal | dark: the --nm-* ink ramp clears 4.5:1 on every panel it is drawn on |
| web contrast: an unread colour token is declared | the token file declares no colour token nothing reads |
| web code-presentation: a syntax token missing in the light theme | every token kind the renderer can emit has a colour in BOTH themes |
| web image-expiry: the failure state reads an undefined token | the styles do not reach for a token that does not exist |
| web undefined-custom-property: a var() nobody defines | every bare var() names a custom property something defines |
| web autonomous-default: the workspace column can no longer shrink | the workspace grid column can be narrower than its widest child |
| web project-menu-above-thread: the top bar loses its z-index | the top bar that owns the project menu is stacked above the thread |
| web picks-settings: the sidebar pill goes back to glass | ui-layouts--liquid-glass-sidebar-menu is imported and rendered in routes/settings.tsx |
| web green-is-for-status-dots: the success dot loses its green | CONTROL: status dots keep their green |
| site contrast: --ink-2 darkened so the paper-on-ink pair fails | dark: every text token clears 4.5:1 on every surface |

## 9. Verification (2026-10-05, in the clone, after the last edit)

| Command | Result |
|---|---|
| `cd packages/design && node --test` | tests 113, pass 113, fail 0 |
| `cd apps/web && pnpm typecheck && node --test && pnpm build` | tsc exit 0; tests 2444, pass 2444, fail 0; built in 9.24s |
| `cd apps/site && npx astro build && node --test tests/*.test.mjs` | 21 pages built; tests 313, pass 313, fail 0 |
| `cd apps/site && pnpm typecheck` (astro check) | 0 errors, 0 warnings, 2 hints |
| `node --test tests/` (root) | tests 631, pass 613, fail 2, skipped 16: the two failures are the scratchpad-location check-pixels cases, as before this change |
| `node scripts/check-old-names.mjs` | CLEAN, 0 violations; `build-allowlist.mjs --write` UNCLASSIFIED 0 (4 lines added, 3 removed) |
| `node scripts/check-landing-budget.mjs` | markup and CSS 17,394 B of 20,000 (17,847 before); inline JS 23,714 of 36,000; images 25,873 of 40,000 |
| `node scripts/make-brand-assets.mjs --check` | BRAND ASSETS OK: 10 asset(s), all current |
| `node scripts/check-app-bundle.mjs` | entry 139.5 kB gzipped, eager graph 265.2 kB |
| `node scripts/check-site-links.mjs`, `check-site-semantics.mjs`, `check-copy.mjs`, `check-offer.mjs`, `check-credit-figures.mjs`, `check-proof-figures.mjs` | all pass (785 links, 21 pages, 334 pages and 156 stylesheets clean) |
| `node scripts/check-deadends.mjs --gate` | ALL DISPOSITIONED, 43 entries |
| `pnpm install --frozen-lockfile` | Already up to date |
| `pnpm -r typecheck` and `pnpm -r test` | both exit 0 (worker 5428, 5422 pass, 6 skipped; evals 1481, 1476 pass, 5 skipped; site, web, design as above) |
| `pnpm exec playwright test` (e2e) | 219 passed |
| `node scripts/check-unstyled-classes.mjs` | 14 classes with no rule, the same 14 at `HEAD`: not caused by this change |
| `node scripts/check-pixels.mjs --base <local preview> --baseline <none>` | 83 frames; rules 1 to 3 (one colour, bare system font, no token) fired on none; the 2 findings are `/discord`, which redirects to an external invite and times out offline; rule 4 not evaluated |

Not run: Lighthouse, a real-device check, and the blind critic's rating of the landing (a milestone M6
bar). The three accent candidates have not been rendered on the landing hero yet.
