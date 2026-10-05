# M2 step 2.1: the design system (2026-10-05)

A new visual system for both apps: a dark, professional base in the family of Cursor and Linear, with
ONE bright accent, a new logo, and one token file. Layouts are not touched here. That is the site and
app rebuild (M2, which the owner moved here; the handoff copy on this branch still numbers it M6); this step swaps the visual system underneath them so both apps keep rendering.

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
| Accent family | `--accent`, `--accent-strong`, `--accent-ink` (text on accent), `--accent-wash`, `--accent-ring` (the focus ring: the accent at 75%, measured at 3.25:1 or better over every surface, section 10) |
| Fixed ground | `--qr-ground #ffffff`, the same in both themes: the surface a camera reads (the two-step-verification QR) |
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

The measured columns: **text** is the accent as text on `--paper`; **worst** is the accent as text on
the worst of the five surfaces; **ring** is the focus ring as the token file draws it (`--accent-ring`,
the accent at 75% alpha, composited over each surface), on the worst of the five, and needs 3:1;
**label** is `--accent-ink` on `--accent`; **hover** is `--accent-ink` on `--accent-strong`; **chip** is
`--accent-strong` as text on the accent wash over `--surface-2`. All ratios are compared UNROUNDED
(a 4.4967 is below 4.5, and rounds to 4.50); the two places shown are only the record.

| Candidate | Theme | accent / strong / ink | text | worst | ring | label | hover | chip |
|---|---|---|---|---|---|---|---|---|
| 1 violet | dark | `#a67cff` / `#bfa2ff` / `#0c0816` | 6.51 | 5.02 | 3.45 | 6.54 | 9.25 | 6.44 |
| 1 violet | light | `#7240d8` / `#5f2fc4` / `#ffffff` | 5.74 | 5.12 | 3.30 | 6.10 | 7.81 | 6.20 |
| 2 cyan | dark | `#22d3ee` / `#67e8f9` / `#03161b` | 10.89 | 8.39 | 5.34 | 10.24 | 12.77 | 8.96 |
| 2 cyan | light | `#0b6b82` / `#085669` / `#ffffff` | 5.75 | 5.12 | 3.25 | 6.11 | 8.25 | 6.57 |
| 3 magenta | dark | `#ec62d2` / `#f58ae2` / `#17061a` | 6.79 | 5.23 | 3.53 | 6.72 | 8.93 | 6.36 |
| 3 magenta | light | `#b0178f` / `#92107a` / `#ffffff` | 5.87 | 5.23 | 3.68 | 6.24 | 8.15 | 6.35 |

Every text token (ink, status, syntax) clears 4.5:1 on every one of the five surfaces in both themes,
the lowest being 4.86:1 in dark (`--faint` on `--surface-3`) and 4.96:1 in light (`--warn` on
`--surface-3`).

To switch candidate: copy its eight values into `tokens.css` and set `"default"` in `accents.json`.
`tokens.test.mjs` fails until the two agree. The favicon is generated from the token file, so
`pnpm brand` follows.

**Which one ships is an owner decision** (the rebuild step, 6.1 in this branch's handoff copy, renders all three on the landing hero and picks
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
run. `node scripts/make-brand-assets.mjs --check` verifies every output is current (at first it wrote and
checked two of the four favicon copies; section 10.4 is what it checks now).

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
  redesign keeping the old layouts fails is the M2 rebuild's, not this step's.
- Choosing the accent (section 2).
- About twenty owner-picked interaction components still carry their own spring curves, and the
  landing's flow-line canvas (an owner pick) is unchanged. They are interactions, not the visual
  system.
- `--faint` and the other tokens are measured against the five surfaces only; text on photographs or
  on a real Studio screenshot is the blind critic's job.
- `og.png` is rendered in the system font of the machine that runs `pnpm brand`, so it is not
  byte-identical across operating systems. (`--check` is a CI step now, and compares the card by its
  manifest hashes on any other platform than the one that drew it: section 10.4.)
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

Not run: Lighthouse, a real-device check, and the blind critic's rating of the landing (a milestone M2
bar). The three accent candidates have not been rendered on the landing hero yet.

## 10. Review fixes (2026-10-05, after an independent review of this branch)

An independent review found defects in the first pass. Each is fixed with a test that failed before
the fix; the tests are listed here with the mutation that turned each red. Every number was measured in
this clone after the change.

### 10.1 The two-step-verification QR could not be scanned (a defect that broke users)

`.settings-card .mfa-qr` took its ground from `--accent-ink`. That token is the ink for a label on the
accent button: near-white while the accent was dark, `#0c0816` (near-black) in the dark theme once the
accent became violet. The provider's QR is black on transparent, so the code sat on near-black:
**1.06:1 black on the old ground in the dark theme** (21.00:1 in light, where `--accent-ink` is white).

Fix: a token meant for it, `--qr-ground: #ffffff` in the theme-independent block of `tokens.css`
(the same white in both themes), and the rule spends it. `drawn.test.mjs` resolves the ground through
the token file in both themes and requires it opaque and at least 7:1 against black: **21.00:1 in dark
and 21.00:1 in light.** Chromium on the built CSS draws `rgb(255, 255, 255)` behind `.mfa-qr` in both
themes.

### 10.2 The projects page's primary button did not answer the pointer

`dashboard.css` made the hover a `color-mix` of `--sh-accent` into `--sh-accent-deep`, which had been two
different steps of the old accent and were both `var(--accent)` now. The mix of a colour with itself is
that colour. That rule is the one that wins (the built CSS places it after the quiet layer's
`--accent-strong` hover, 111,061 against 75,144 bytes into the bundle), so the button never changed.

Fix: the hover background is `var(--accent-strong)`. Measured in Chromium on the built CSS, the
projects-page button: dark rest `rgb(166, 124, 255)`, hover `rgb(191, 162, 255)`; light rest
`rgb(114, 64, 216)`, hover `rgb(95, 47, 196)`. `drawn.test.mjs` finds every hover rule of a primary
button in both apps (11 selector parts in 6 files that set a background; 8 of them pair with a resting
rule of the same selector, 12 hover/rest pairs), and fails when a pair resolves to the same colour, in
either theme. The label on the hovered button is `--accent-ink` on `--accent-strong`: 9.25:1 dark, 7.81:1 light.

### 10.3 The focus-ring gate measured something nothing draws

`measureAccent` measured the SOLID accent as the focus ring, which is the same number as the accent's
text contrast (`ringWorst == textWorst`), so the 3:1 check could never fire on its own. The outlines the
apps actually drew used `--accent-ring`, the accent at 45% alpha: **2.09:1 on the worst surface in dark
and 1.97:1 in light** (measured by composing the token over each surface). Six rules drew a ring
under 3:1: `picks/composer/file-picker.css`, `picks/tech/line-thread.css`,
`picks/chat/context-menu.css`, the composer card and the sign-in fields in `system.css` and `auth.css`
(their border colour, beside the 14% halo), and `picks/composer/composer-fx.css`.

Fix, at the token. `--accent-ring` is now the accent at 75%. That is the lowest round figure that
clears 3:1 over all five surfaces for all three candidates in both themes (70% leaves cyan-light at
2.98:1). Measured ring ratios, worst surface: violet 3.45 dark / 3.30 light, cyan 5.34 / 3.25, magenta
3.53 / 3.68 (table in section 2). The gate now measures the ring the token file draws:
`measureAccentExact` evaluates the theme block's own `--accent-ring` over each surface, so a candidate
can fail the ring on its own (a fixture accent at 4.5:1 text and 2.99:1 ring does, in the test).

What is measured of the shipped code: `focus.test.mjs` reads both apps' 178 stylesheets, takes the 114
rules whose selector names a focus pseudo-class and the 46 of them that draw a ring (an `outline`, an
`outline-color`, or a ring-shaped `box-shadow` layer), resolves each colour through the token file for
the theme (var chains, `color-mix`, rgba), composites it over each of the five surfaces and requires
the rule's strongest indicator (a ring, or the border colour it sets) to reach 3:1 on every surface in
both themes. With the old 45% ring token the same test names the six rules above; with the token file
as it is, none fail except one the test exempts by proof: the composer card's soft ring in
`composer-fx.css`, an owner pick that is 1.22:1 dark and 1.25:1 light on its own. What carries the
composer's focus is Tailwind's `border-ring` from `components/ui/input-group.tsx`; the test asserts that
class is still there, that `--color-ring` (the token Tailwind reads, set to `--accent-ring`) reaches 3:1
on every surface in both themes, and that the exemption is still needed (it fails the moment the soft
ring passes by itself).

AA compares unrounded ratios now (`measureAccentExact`, `roundRatios` only to record). `#4878c8` on
`--paper` is 4.4967:1, which rounds to 4.50 and used to pass; a fixture in the teeth test holds it. The
recorded `strongOnWash` ratios moved by 0.01 to 0.04 because the chip's wash is composited without
rounding to a whole channel first.

Not covered by this check: the Tailwind utility classes of the vendored shadcn components under
`components/ui/` (byte-pinned to their upstream hashes by `ai-elements-provenance.test.mjs`, so not
editable here). They draw with `--color-ring`, which passes. One of them, the `ScrollArea` viewport
(`scroll-area.tsx`), draws only `ring-ring/50` (a 3 px ring at half of `--accent-ring`, 1.84:1 dark and
1.74:1 light) beside `outline-none`; it is not fixed here and is listed in the final report.

*Superseded by section 11.2 (cycle 2): the utilities are read and measured, the ring is corrected from a
stylesheet, and the claim "they draw with `--color-ring`, which passes" was wrong: they drew it at half
strength, 1.8:1.*

### 10.4 The brand script regenerates every favicon copy, and the PNGs are tied to the mark

Found: the favicon exists in four places, and the script wrote two (`packages/design/brand/` and
`apps/site/public/`). The third, `tools/repo-chat/public/favicon.svg`, and the fourth, the inline
`data:` URI in `apps/web/index.html`, were copies made by hand that `brand.test.mjs` compared but the
generator never wrote or checked: change the accent and `pnpm brand` left two stale favicons, and
`--check` passed. The PNGs were checked only by re-rendering and comparing bytes on the same machine,
which is a local command (another machine encodes differently), so nothing in CI or in `pnpm -r test`
could see an old or hand-swapped PNG.

Fixed:

- The recipe moved to `packages/design/src/web/brand-recipe.mjs`, read by the generator and by the test,
  so they cannot drift. The generator writes all four favicon copies (the app's by rewriting the one
  `<link rel="icon">` href around its own inline data: URI) and `--check` compares all four exactly.
  Changing the inline favicon by one hex digit, or the repo-chat one, now fails `--check`; running
  `pnpm brand` restores both byte for byte (measured).
- A new test finds every file in the tree that carries the favicon's signature (a 32 unit tile with
  `rx` 7) and requires that set to equal what the generator writes (4 files).
- `packages/design/brand/brand-manifest.json`, written by the generator: a sha-256 of each input (the
  round icon SVG, the touch icon SVG, and the share card's HTML with the token file it links) and of
  each of the eight PNGs as written. `brand.test.mjs` recomputes all of it from the tree with no
  browser, in `pnpm -r test`. It fails on a moved mark, a moved token, an edited card, and a PNG that
  was swapped, left behind or edited. Its teeth test builds a copy of the tree and plants each of those.
- `--check` also re-renders every icon and compares it with the committed PNG picture for picture
  (decoded pixels: mean difference per channel and the share of pixels far off), not byte for byte.
  The tolerance is `mean <= 8` and `far <= 5%`. Measured against the committed icons: the same recipe
  in four other Chromium configurations differs by 0.00; the software-GL configuration, the
  furthest one found, by a mean of 2.21 at 16 px, 1.69 at 32, 0.26 at 180, 0.23 at 192, 0.08 at 512
  (at most 0.01% of pixels far off). A cyan accent differs by a mean of 17.2 to 17.8 (26 to 30% far),
  the old azure-brick icons by 28.8 to 32.0 (32 to 37% far), a scale of 0.70 for 0.74 by 6.4 to 7.5
  (5.7 to 7.2% far). A one-unit change to a corner of the mark (mean 0.03), a radius of 8 for 7 (0.9)
  and a base colour of `#131519` for `#0a0b0d` (5.4) are NOT visible at that tolerance, which is why
  the manifest hashes exist: they catch those exactly. A stale PNG whose manifest hash was also
  edited to match is caught by the render and not by the hashes, and the reverse; the two are one check.
  *(That sentence was not true for the previous palette's violet, which the render's tolerance admits; section 11.9 makes it true.)*
- `og.png` is drawn in the system font of the machine that made it. `--check` compares it by render
  only on the platform the manifest records (`renderedOn`, `darwin`); on any other it says so in its
  report line and the manifest hashes are its check.
- CI: `typecheck-and-test` already installs Playwright Chromium before `pnpm -r test`, so
  `node scripts/make-brand-assets.mjs --check` is a step there, after the install (a test fails if the
  step is removed or moved before the install). It fetches nothing. Not run on a Linux runner from
  here: the first CI run is its first measurement there, and the tolerance above is sized from the
  noise measured on this machine, not from a Linux render.

### 10.5 The guards had blind spots; each is closed and each blind spot is measured

For every row below the OLD guard (the one in `3c310cb8`) was run against the same planted break and
passed; the new one fails.

| Guard | What it missed | Now |
|---|---|---|
| `flat.test.mjs`: no colour written on a theme root outside `tokens.css` | a hex colour on `:root` inside `@media`; inside `@layer`; `html.dark`; an unquoted `[data-theme=light]`; `oklch()`; `lab()`; a named colour (all seven planted, old guard 0 of 7) | reads every rule at any nesting depth (4,603 rules in 178 sheets), reads a theme root in any spelling (`:root`, `html`, `body`, an attribute quoted or not, `.dark`, `.light`, `:not()` guards), and flags hex, any colour function, any named colour or `transparent`; 11 theme-root selector parts are read today |
| `tokens.test.mjs`: the accent family is written only by `tokens.css` | `style={{ '--accent': c }}`, `{ "--accent-strong": c }`, `el.style.setProperty('--accent', c)`: the old regex, run on the three, matches none | `customPropertyWrites` finds a declaration, an object key and a `setProperty` call; the scan reads 547 files, 351 of them scripts; none writes an accent token |
| `app-ink-ramp.test.mjs`: the app declares no ink | walked `.css` only | walks `.css`, `.ts` and `.tsx` with the same finder (116 stylesheets, 331 scripts) |
| `tokens.test.mjs`: no retired accent literal | four retired colours were not in `OLD_ACCENT_LITERALS` any more | `#8b5cf6`, `#7550de`, `#7657ff`, `#4f7cff` are back in the list, and a test holds the list; restoring them found one hit, a comment in `apps/site/tests/living-background.test.mjs` that typed two of them, now reworded |
| `apps/site/tests/contrast.test.mjs` | `--paper` and `--accent-ink` were filtered out of the text tokens BY NAME, so a `color: var(--paper)` on any ground passed (old test run with a planted fill-less use: 10 of 10 pass) | no token is exempt. A use is on a FILL when the element's own rules, in any state and any sheet, give it only opaque backgrounds that are not page surfaces; it is measured against exactly those. Every other use is measured on all five surfaces, where paper on paper is 1:1. Found in the CSS: 6 fill uses (`--paper` on `--ink` and `--ink-2`; `--accent-ink` on `--accent` and `--accent-strong`, in the CTA, its knob, the skip link, `.btn-primary` and the composer send); 9 pairs per theme, worst 6.54:1 dark and 6.10:1 light; no free use of either token |

One real finding came out of the stricter root guard: `apps/web/src/components/studio-icon.css`
declared `--motion-lift-shadow: 0 6px 18px -10px color-mix(in srgb, var(--accent) 55%, transparent)` on
`:root`, a coloured shadow outside the token file. It moved to `tokens.css` (the file the app loads
first) and `studio-icons.test.mjs`, which asserted every motion token is declared on `:root` in that
sheet, was restated to accept the token file (a dated note, and an assertion that the token is in the
token file alone). Not fixed: what the token is FOR, a start-sheet idea button that rises 2 px and
casts an accent glow on hover, is not the flat language ("cards cast nothing and do not move"); it goes
when that sheet is rebuilt.

### 10.6 The minor items

- **AA on unrounded ratios**: section 10.3.
- **Mark intricacy**: the proxy counted `M L H V Q A Z` and every lowercase letter, so an absolute `C`,
  `S` or `T` was not counted and a mark drawn in cubics read as simple. It counts every command
  letter of either case (and not an exponent's `e`). The mark has 13 commands against a bar of 24; a
  path of thirty cubics fails it, and the test holds that.
- **No webfont**: also `@fontsource`, `fontsource.org`, `typeface-*`, any `.woff`, `.woff2`, `.ttf`,
  `.otf` or `.eot` named in a file, a font file on disk under either app, the brand folder or the
  design package, and a font package in the dependencies of either app or of the design package. The
  old pattern, run on an `@fontsource` import, a `url(...woff2)` and a `url(...ttf)`: none matched.
- **`.auth__aura`**: a blurred (`filter: blur(46px)`) radial gradient on a 22-second drift, which is
  exactly the aurora the flat language removed. No component renders any `auth__*` class
  (`git grep` over `apps/web/src` for the class names in a `.tsx`: 0), so it was dead CSS; its three
  rules, its `auth-drift` keyframes and its reduced-motion entry are removed, and the class guard now
  matches a glass, aurora or aura WORD in any class name (`.auth__aura`, `.hero-aurora`,
  `.card__glass`), where the old pattern matched only the block form (it returned nothing on
  `.auth__aura`, `.hero-aurora` and `.card__glass`). Not removed, because it was not asked and is
  equally unrendered: `.auth__atmosphere` and `.auth__grid`, a masked repeating-gradient plane.

### 10.7 Found and not fixed here

- The vendored shadcn `ScrollArea` viewport (`components/ui/scroll-area.tsx`) draws only `ring-ring/50`
  on focus (1.84:1 dark, 1.74:1 light). The file is byte-pinned to its upstream hash, so it is not
  edited; it needs an owner decision (a local rule that outranks the utility, or an unpinned copy).
  The focus test does not read Tailwind utility classes; it reads `--color-ring`, which passes.
  *(Fixed in cycle 2, section 11.2: a rule outside every layer corrects the ring; the focus test now reads the utilities.)*
- The start sheet's idea buttons rise 2 px and cast an accent glow on hover (`studio-icon.css`, token
  now in `tokens.css`): not the flat language, and out of this review's six items.
- `.auth__atmosphere` and `.auth__grid` in `auth.css` are not rendered by any component and the grid
  is a masked repeating gradient. Dead decoration, not asked about, left in place.
- The brand check on a Linux runner: the tolerance (section 10.4) is sized from the noise measured on
  this machine. If the first CI run fails on an icon, the report line names the mean difference and the
  share of pixels off, and `SAME_PICTURE` in `scripts/make-brand-assets.mjs` is the one number to move.
- Every token edit now needs a `pnpm brand` (the share card links the whole token file, so its input
  hash moves). The PNG bytes come out identical when nothing the card draws moved, as they did for the
  two token edits in this review; the cost is one command and a one-line manifest diff.

### 10.8 Verification of the review fixes (2026-10-05, in the clone, on the final tree)

Section 9 stays as the record of the first pass. These are the numbers after the review fixes.

| Command | Result |
|---|---|
| `cd packages/design && node --test` | tests 137, pass 137, fail 0 (113 before the review fixes) |
| `cd packages/design && pnpm typecheck` | exit 0 |
| `cd apps/web && pnpm typecheck && node --test && pnpm build` | tsc exit 0; tests 2445, pass 2445, fail 0; built in 8.57s |
| `cd apps/site && npx astro build && node --test tests/*.test.mjs` | 21 pages built; tests 316, pass 316, fail 0 |
| `node --test tests/` (root) | tests 631, pass 613, fail 2, skipped 16: the two failures are the scratchpad-location check-pixels cases (`THE CONTROL: against a SAME-ORIGIN baseline...`, `against a baseline with NO provenance...`), as before |
| `node scripts/make-brand-assets.mjs --check` | BRAND ASSETS OK: 12 asset(s), all current (4 favicon copies, 8 PNGs, the manifest) |
| `node scripts/check-landing-budget.mjs` | markup and CSS 17,420 B of 20,000 (17,394 after the first pass; the lift-shadow token and the ring and QR comments are the difference); inline JS 23,714 of 36,000; images 25,873 of 40,000 |
| `node scripts/check-old-names.mjs` | CLEAN, 0 violations; `build-allowlist.mjs --write` UNCLASSIFIED 0 (counts moved: 4 lines added, 2 pins changed, for `apple-touch-icon` in the two new brand files and `-apple-system` in the font-stack tests) |
| `node scripts/check-deadends.mjs --gate` | ALL DISPOSITIONED, 43 entries |
| `node scripts/check-ci-references.mjs` | CI REFERENCES OK, 22 paths |

Two things the first run of this list caught, both mine and both fixed in the same change: the brand
recipe module was imported by the generator through a computed dynamic `import()`, which the dead-end
gate cannot see (`UNDISPOSITIONED: brand-recipe.mjs`, 1 of 44), so the generator imports it statically;
and the two new brand files and the font-stack tests moved the old-names allowlist pins.

Not run: the Playwright e2e suite (219 passed in the first pass; this change touches no layout), the
worker and evals suites (nothing under `apps/worker` or `packages/evals` changed), Lighthouse, a real
device, the brand check on a Linux CI runner (the CI step is new and its first run is its first
measurement there), and a render of the app's focus rings by a real keyboard (they are measured from the
sheets, section 10.3).

### 10.9 Mutations of the review fixes: every new or restated test went red, then green

Each row: one planted break (the anchor was asserted to occur exactly once; the file was restored byte
for byte and the hash compared), and the test that went red. The harness is not committed.

| Item | Planted break | Test that went red |
|---|---|---|
| 3 | `tokens.css` dark `--accent-ring` back to 45% | `dark: every focus ring either app draws reaches 3:1 on every surface`; `the exempt composer ring is still a wash...`; `the guard has teeth: it reads the shapes that shipped...`; `every candidate clears AA in both themes, and the ratios recorded in accents.json are the measured ones` |
| 3 | `picks/composer/file-picker.css` outline weakened to a 30% mix | `dark:` and `light: every focus ring either app draws reaches 3:1 on every surface` |
| 3 | `system.css` `.gx-drawer:focus` draws only the halo | the same two |
| 3 | `apps/site` `base.css` global focus outline weakened to a 30% mix | the same two |
| 3 | `ui/input-group.tsx` loses its `border-ring` on focus | `the exempt composer ring is still a wash that needs its proof, and the proof holds in both themes` |
| 3 | `css-tokens.mjs` `aaFailures` decides on a rounded ratio | `the guard has teeth: a candidate that is too dim, too bright for its label, or one hundredth short is reported` |
| 3 | `css-tokens.mjs` measures the ring as the solid accent again | `every candidate clears AA ... recorded ... measured`; `the guard has teeth: a candidate that is too dim...` |
| 1 | `settings.css` `.mfa-qr` ground back to `--accent-ink` | `dark: the QR ground is opaque and reads against black at 7:1 or better` (1.06:1) |
| 1 | `--qr-ground` set to `#808080` | the same, dark and light (5.32:1) |
| 1 | `--qr-ground` made translucent | the same, dark and light |
| 2 | `dashboard.css` hover back to the mix of two accents | `dark:` and `light: a primary button's hover background differs from its resting background...` |
| 2 | `apps/site` `base.css` `.btn-primary:hover` background set to the rest colour | the same two |
| 4 | the old azure-brick `icon-512.png` put in `apps/site/public/` | `every PNG is the one the generator wrote...`; `--check`: mean difference 31.97, 36.5% far, and the manifest hash |
| 4 | the mark's corner moved by one unit (`Q29 3 29 5.2`) | `the favicon is composed from the mark...`, `every PNG is the one the generator wrote...`, the wordmark and path tests; `--check`: all four favicon copies and the manifest inputs |
| 4 | `tools/repo-chat/public/favicon.svg` drifts by one hex digit | `--check` (it did not see this copy before) |
| 4 | the inline favicon in `apps/web/index.html` drifts by one hex digit | `--check`; `the app's inline favicon decodes to the same favicon` |
| 4 | a hand-made `favicon-copy.svg` appears in `tools/repo-chat/public/` | `no file carries a favicon the generator does not write` |
| 4 | the CI step replaced by `echo skipped` | `CI runs the brand check, headless, after Chromium is installed` |
| 4 | the CI step moved before the Chromium install | the same |
| 4 | `icon-192.png` replaced by a cyan render and its manifest hash edited to match | `--check` by render alone (mean difference 17.57, 29.4% far); the no-browser test passes, as designed |
| 5 | a hex colour on `:root` inside `@media` in a site sheet | `no sheet but tokens.css writes a colour on a theme root...` (old guard: passes) |
| 5 | the same inside `@layer`; as `html.dark`; as an unquoted `[data-theme=light]`; as `oklch()`; as a named colour; as `lab()` | the same, each one (old guard: passes all six) |
| 5 | a hex colour on `:root` inside `@layer` in `system.css` | the same |
| 5 | `studio-icon.css` writes the coloured lift shadow on `:root` again | the same |
| 5 | `el.style.setProperty('--accent', ...)` in `main.tsx`; a `'--accent-strong'` style-object key in `main.tsx` | `no other stylesheet, component style or script in either app writes a token of the accent family` (old regex: blind to both) |
| 5 | `el.style.setProperty('--faint', ...)` in `main.tsx` | web `app-ink-ramp`: `the app and the public site use one ramp...` |
| 5 | `/* #8B5CF6 */` in a site sheet | `no retired accent literal exists in any tracked source outside packages/design` |
| 5 | `#7550de` dropped from `OLD_ACCENT_LITERALS` | `the ban names every retired accent...` |
| 5 | the folder's `--paper` text set to `--ink` on an `--ink` fill | site `contrast`: `dark:` and `light: every use of text on a fill clears 4.5:1...`, and the derivation floor |
| 5 | a fill-less `color: var(--paper)` in the folder's hover label | site `contrast`: `dark:` and `light: every text token clears 4.5:1 on every surface` (old test: 10 of 10 pass) |
| 5 | the lift shadow token deleted from `tokens.css` | `studio-icons.test.mjs`: `motion reads its timing from :root tokens...` |
| 6 | an `@fontsource` import in `main.tsx`; a `url(...woff2)` in a site sheet; a `.woff2` file under `apps/site/public`; an `@fontsource` dependency in `apps/site/package.json` | `the type tokens are the system stack, and no webfont is requested anywhere`, each one |
| 6 | the intricacy proxy's regex loses the uppercase `C`, `S`, `T` | `the guard has teeth: the intricacy proxy counts every path command...` |
| 6 | an `.auth__aura` rule in the auth sheet | `no glass or aurora token, class, component or file exists in either app` (old pattern: blind) |

## 11. Cycle 2 of the review fixes (2026-10-05, after the rebase onto main 555dc18b)

A second review of this branch left eight findings, each verified by two skeptics. The branch had also been
rebased onto main, which brought in the pricing config (#29) and Sign in with Roblox (#30) written on the
old design. Everything below was measured in this clone (`scratchpad/m2design`, branch `studpilot/m2-design`)
after the change it describes. Eight commits, in the order the findings were fixed (users first; findings 5 and 6
share one, both being the flat guard): `79b51bf2` (1), `b701696c` (2), `eff3b484` (3), `cb750931` (4), `0761c729`
(5 and 6), `dca70a52` (7), `ee10ba87` (8), `747c3115` (the minor items); this section is the ninth.

### 11.0 Step 0: what the rebase brought in

The three suites were run first, before any edit: design 137 of 137, web 2,532 of 2,532, site 339 of 339.
Nothing was red: main's new surfaces (the pricing page, the plans and order-summary components, the Roblox
sign-in button, the connection card, the re-auth dialog, the auth pages) spend tokens and the shared `btn`
classes, with no literal colour, no glass, and no focus rule of their own. One stale comment was fixed:
`auth-pages.tsx` quoted the retired green accent's hex values (`#99d4b0`, `#8fd3ab`) to explain why a success
tick takes no colour; it now states the rule without them. The stricter guards below then read main's code
too, and found nothing in it. They did find old-design code that predates the rebase (the cascade defect
and the destructive button's hover, 11.1), which is the point of measuring pixels.

### 11.1 The primary button's label and icon were drawn in the wrong ink (a defect that broke users)

`apps/web/src/design/system.css` had `button,input,select,textarea { font: inherit; color: inherit; }`,
unscoped and unlayered. An unlayered rule beats a rule in `@layer utilities` whatever its specificity, so
`--color-primary-foreground: var(--accent-ink)` never reached a shadcn `variant="default"` Button. The token
tests measured the token pair (6.54 and 6.10) and passed. What the browser drew, found by the new guard with
the old rule put back:

| Control | Dark | Light |
|---|---|---|
| composer Send arrow (rest) | 1.18:1 (`#9da2ad` on the accent) | 1.10:1 |
| composer Send, hovered | 1.40:1 | 1.33:1 |
| roadmap map "Build" label | 2.77:1 | 2.94:1 |
| destructive Button, hovered (a defect the guard found, not in the review) | 3.07:1 at worst (white on 90% of `--bad` over `--surface-3`) | passes (5.10:1 by the sheets) |

Fix, at the cause: the colour reset now wears `:where(:not(.aie, .aie *, [data-slot], [data-slot] *))`, the
zero-specificity scope the sheet's other element rules wear, so a colour utility wins on a shadcn control;
inside the scope Tailwind's preflight already inherits. The `font` reset stays unscoped on purpose (the app
has one weight; scoping it would let the vendored `font-medium` through). Consequence, stated: three vendored
controls that carried a muted utility the cascade had been hiding (Copy Code, Download file, the reasoning
trigger) now draw `--muted`, as upstream wrote them. The destructive hover is corrected from `ai-elements.css`
(the file is byte-pinned): 64% instead of 90% of the red, which keeps a visible step above the 60% rest.

Measured after, by drawing the app (8 routes, both themes): every element painted with the accent, text and
`currentColor` icons, at rest and under the pointer: 16 (control, state) pairs per theme, 11 text and 5 icon
measurements at rest and 3 and 3 hovered; rest 6.54:1 dark and 6.10:1 light at worst; hovered (Send's
`bg-primary/90`) 5.54:1 and 5.03:1. Every variant of the shadcn Button
on each of the five surfaces, rest and hover: 120 pairs, 4.79:1 dark and 5.03:1 light at worst.

The guard, `packages/design/src/web/rendered.test.mjs` (new): it builds `apps/web` with Vite into a temporary
folder, opens it in Chromium on the fixture data and reads what the browser painted. The build is made in
Vite's development mode with the fixture flag, because `lib/mock.ts` serves fixtures only when
`import.meta.env.DEV` (that gate is deliberate); the stylesheet is the same pipeline minus minification, and
the production stylesheet (`pnpm build`, `index-DY6LVw0F.css`) draws the same pair on a default-variant Button
(`rgb(12, 8, 22)` on `rgb(166, 124, 255)` in dark, white on `rgb(114, 64, 216)` in light, the icon stroke too; the app
itself cannot be drawn from a production build, because its fixtures are development-only). The variants are read from
`components/ui/button.tsx` and merged with tailwind-merge as `cn()` merges them (without that the destructive
variant's weak ring was hidden by a base class a real element never carries). It fails rather than skips (no Vite,
no Chromium, a failed build), and it is first pointed at fixtures it must fail and pass. The cause is also
held directly: no unscoped bare form-control rule sets a colour. Restated to the property:
`apps/web/tests/button-reset.test.mjs` found the resting button rule by what the text began with, and mistook
the colour reset for it; it now finds the rule by its selector.

### 11.2 Every focus ring is drawn at 3:1 or better

The shadcn Button, Input, Select, Tabs, Switch and ScrollArea draw focus as `focus-visible:ring-ring/50
focus-visible:ring-[3px]`: half of `--color-ring`, which is the accent at 75%, so 37.5% of it. The Button's
border is 0 wide, so the ring is its only indicator. The base layer also drew the browser's own focus outline
at half strength. Measured by tabbing (both themes): 1.87:1 dark and 1.82:1 light on the composer's toolbar,
Send and the dropdown triggers; 1.83:1 and 1.79:1 on the reply actions; the browser outline of Copy Code,
Download file and the reasoning trigger 1.87:1 and 1.82:1; the destructive Button's `ring-destructive/20`
fainter still. The old test said these "draw with `--color-ring`, which passes" and never read them.

Fix: the scope's default outline colour is `var(--color-ring)`; two rules outside every layer
(`[class*='focus-visible:ring-ring/']:focus-visible:not([aria-invalid='true'])` and the destructive one) set
`--tw-ring-color` to the token, so the vendored files stay byte-pinned and an invalid field keeps its own red
halo. Measured after: 153 focus stops per theme over 8 routes, none without an indicator, the lowest drawn
ring 3.91:1 dark and 3.56:1 light; 30 Button-variant fixtures (6 variants on each of the 5 surfaces), the
lowest 3.44:1 and 3.31:1.

Guards: `focus.test.mjs` now finds every focus-variant ring and outline utility with an opacity modifier in both
apps' sources (4 distinct today), resolves it through the theme, and requires a weak one to be corrected by a rule
that is itself measured; one halo beside the composer's `border-ring` is exempt, proven from both ends; a rule
setting `--tw-ring-color` is read as a ring; the scope's default outline colour is measured and the corrections
must sit outside every layer. `rendered.test.mjs` tabs through the routes and the variants and measures the
indicator the browser drew (outline, ring-shaped shadow, a border that changed, and the same on an ancestor
that reacts to focus-within) against the surface behind it.

### 11.3 Text selection on the site reads at 4.5:1 in both themes

`::selection` spent `--accent-ink`'s neighbour, `--accent-ring`, which cycle 1 raised to 75%: `--ink` on it was
4.43, 4.35, 4.27, 4.16 and 4.03:1 over the five surfaces in dark (the test now prints exactly these). Fix: the
selection is the accent at 45%: 6.64:1 at worst in dark and 7.65:1 in light by the sheets; drawn by Chromium on
the built site, 8.32 to 6.62:1 and 8.26 to 7.62:1. `apps/site/tests/contrast.test.mjs` finds every `::selection` rule,
requires a background and a colour, lays the translucent background over each surface and requires 4.5:1.

### 11.4 The brand generator fails when the share card is drawn without its tokens

With the card's token stylesheet link broken the old generator printed "BRAND ASSETS OK" and wrote a white, serif
og.png (174 colours; reproduced in a throwaway copy before the change), and recorded the broken card in the
manifest. Now: `cardProblems` (no browser, `brand-recipe.mjs`) checks the card's source (every stylesheet it links
exists, one is the token file the manifest hashes, every token it spends is declared), and the generator checks
the card as the browser loaded it (no file request failed, every token it spends resolves, the page is painted
in the dark `--paper`). A failing card is reported and its PNG is not written; the manifest is written last and
only by a run that found nothing wrong. With the href broken, a token undeclared, or a token renamed in
`tokens.css`, the generator exits 1 and `og.png` and the manifest are byte-identical afterwards.

### 11.5 No blur ships, and the flat guard sees every spelling of one

The composer card was `bg-card/90` over `backdrop-blur` and the vendored attachment remove button
`backdrop-blur-sm`; the guard grepped the hyphenated property in stylesheets only. Fix: an opaque `bg-card` and no
blur on the composer; a rule outside every layer switches the filter off for any element that carries a
`backdrop-blur` utility (the vendored file is pinned). `flat.test.mjs` finds a backdrop filter as a CSS property,
a Tailwind utility in any string (bare, sized, arbitrary, variant-prefixed, in a `cn()`, in a conditional), a
style-object key, or a script write, in both apps and `apps/web/index.html`; a vendored file may carry one only
in the plain form the rule can switch off, and only while the rule exists. A second test finds `filter: blur()`
outside a keyframe (the removed `.auth__aura` under another name), and allows only a blur the same rule fades to
nothing (the landing's 220 ms text swap). `rendered.test.mjs`: no element on any of 8 routes draws a backdrop
filter, and a fixture carrying the vendored utility comes back unblurred.

### 11.6 The theme-root matcher reads the subject, and index.html

A rule is a theme root when its SUBJECT is `html`, `:root` or `body` with any qualifier, or is a head-less theme
switch (`.dark`, `.dark-mode`, `.is-light`, `.theme-dark`, any attribute named for a theme, mode or scheme).
The old matcher (kept in the probe record) returned false for all eleven forms tried (`html.no-js`, `html.js`,
`:root.dark-mode`, `html.is-dark`, `:root[data-mode]`, `[data-bs-theme]`, `html[data-color-scheme]`,
`html[dir=rtl]`, `:root[dir=rtl]`, `.dark-mode`, `html > body.x`); the new one returns true for all eleven and
false for `.dark-card`, `.theme-btn`, `html .card`, `html::selection`. `apps/web/index.html` is in the walk, its
`<style>` blocks are read, and so are an inline `style` on `<html>` or `<body>` and a script that writes a colour on
the document element.

### 11.7 The colour guards compare colours, and scripts/ is read

`coloursIn` reads every colour literal in hex (3, 4, 6, 8 digits), rgb()/rgba() (commas or spaces, percentages,
a slash alpha), hsl()/hsla(), hwb(), color(srgb), oklab() and oklch(); `listedColoursIn` finds a list of hexes in
any of them within 6/255 (a whole-number hsl lands within 2.9 of every colour listed, measured over all 24; the
review's loosely written one within 4). The retired-accent guard and the typed-accent guard use it, over
`scripts/` too; the site page test does as well. The retired list gained the owner dashboards' azure inks
(`#8aa2ff`, `#3454d1`, `#b9c6ff`); their eleven lines now sit in the violet family. Each retired colour is found in
11 spellings and each candidate value in 11. Exemptions, each held from both ends: the dashboards for the
typed-accent guard, and their third-party brand skins for the retired guard (Sentry's purple `#7553ff` is 4/255
from a retired violet).

### 11.8 The site contrast test pairs a text colour with the fill of the same state and context

New `apps/site/tests/lib/cascade-pairs.mjs`: a rule is read as { subject, context, states, theme } and a pair is the
text colour that wins in a state and context together with the fill that wins in the same state and context (by
specificity; a tie keeps both). Two shapes passed the old test (16 of 16 on the old test with each planted):
paper text that is only on a fill when hovered (at rest it is paper on paper, 1:1), and an accent label whose fill
a descendant rule changes inside a modal. `color: var(--paper, #000)` was not a use at all; now any colour that
resolves is (a token, a fallback, a literal, a color-mix; a mix driven by a runtime percentage at both its ends).
On the real CSS: 247 pairs per theme (1,209 ratios; 19 hovered, 101 in a context, 9 on an opaque fill: the same nine
as before, worst 6.54:1 dark and 6.10:1 light), all at 4.5:1 or better, the worst on a surface 4.86:1 dark and
4.98:1 light.

### 11.9 The minor items

- **Owner dashboards**: azure removed (11.7). Not fixed, a residual: they still hand-copy the default accent, 57
  literals over six files (`index.html` 27, `control/skins/studpilot.css` 16, `control/styles.css` 9, `control/logos.js` 3,
  `repo-kit.css` 1, `control/pages/costs.js` 1), in a local tool with its own palette, Google webfonts, a glass header
  and an aurora. Moving them onto `tokens.css` is a rebuild of the tool (a route for the file, six files of
  rewrites), not a thirty-line fix. If the default candidate changes, they keep the old accent.
- **Brand render compare**: loose on purpose, so the previous violet (`#8b5cf6`, mean difference 5.06) passed as
  "the same picture". Every committed icon is now also read for its flat colours (an opaque colour filling 10% of the
  frame; measured on all seven: 53 to 70% tile, 19.5 to 29.5% mark, exactly `#0a0b0d` and `#a67cff`), which must be
  the tokens' `--paper` and `--accent` within 2 of 255. Planted in `icon-192.png` with the manifest hash edited to
  match: `#8b5cf6` (compare: same picture, 5.06), `#7657ff` (6.33) and `#bfa2ff` (4.69) each fail naming the flat
  colours; one unit off the accent still passes the render check and is caught by the manifest hash.
- **No-webfont guard**: refuses a stylesheet from any other origin (a link or an `@import`; `rsms.me/inter/inter.css`
  declares its own `@font-face` and passed), reads each app's build configuration (found by name) for a font
  provider, and reads every workspace manifest under `apps`, `packages` and `tools` and the root's, not three.

### 11.10 Mutations: every new or restated guard went red, then green

Each row: one planted break (the anchor asserted to occur exactly once, the file restored byte for byte and the
hash compared), and what went red. The harness is not committed. "Old" is the guard before this cycle, where it
was run on the same planted tree.

| Finding | Planted break | Red |
|---|---|---|
| 1 | the unscoped `color:inherit` back in `system.css` | rendered: both accent-fill and both variant tests, and the cause test; the numbers in 11.1 |
| 1 | `--color-primary-foreground` mapped to `--ink` | rendered: both accent-fill and both variant tests |
| 1 | `.btn-primary` draws `--muted` | rendered: both accent-fill tests (hand-written CSS, not Tailwind) |
| 1 | the destructive hover correction removed | rendered: the dark variant test |
| 1 | the bare button rule loses its background | `button-reset`: both tests that read it |
| 2 | the ring correction no longer matches the utility | focus: the utility test; rendered: both tab tests and both variant-ring tests |
| 2 | the correction draws half strength again | focus: both ring tests and the utility test; the four rendered tab tests |
| 2 | the scope outline half strength again | focus: the default-outline test; rendered: both tab tests |
| 2 | the destructive ring correction removed | focus: the utility test; rendered: both variant-ring tests |
| 2 | the corrections moved into a layer | focus: the layer test; rendered: four |
| 3 | the selection spends `--accent-ring` again (as shipped) | site contrast: dark selection test (4.43 to 4.03) |
| 3 | the selection loses its colour; the rule renamed away; 70% accent | site contrast: both themes; both themes; dark |
| 4 | the card links a stylesheet that is not there; spends a token nobody declares; the token file renames one | generator exit 1, `og.png` and manifest unchanged (old generator: OK, wrote a 174-colour og.png); `brand.test`: all four fixtures |
| 5 | the composer blurs again; a style object; a Tailwind utility in a site page; the aurora under a new name; a script write; a first-paint `<style>` in index.html | flat: the backdrop test (five) and the blur test (one) |
| 5 | the stylesheet stops switching the vendored blur off | flat: the backdrop test; rendered: the backdrop test |
| 6 | `html.no-js`, `html.dark-mode`, `[data-bs-theme]`, `html[dir=rtl]` in a sheet; a `<style>` and an inline style in index.html; an inline style in a site layout; a script write | flat: the theme-root test, each one (old: blind to all) |
| 7 | the retired violet as `rgba()`, the retired azure as `rgb() / %` and as `hsl(228 93% 66%)`, in a root script, the dashboards' azure back | tokens: the retired test, each one |
| 7 | the shipping accent as `rgba()` in a sheet, as `hsl()` in a root script, a candidate's cyan as `rgb()`, an `rgb()` in a site page | tokens: the typed-accent test (three); site `living-background` (one) |
| 8 | hover-only fill; a descendant fill; a fallback use; a literal white on `--ink`; a light-only paper text | site contrast: the surface test (three, both themes), the fill test, the light surface test. Old: green on the first four |
| minor | icons in `#8b5cf6`, `#7657ff`, `#bfa2ff` with the manifest edited to match | `--check`: no flat mark colour within 2 |
| minor | a stylesheet from another host; an `@import`; a font provider in the Astro config; a font package in `packages/shared`; a font plugin in the Vite config | tokens: the no-webfont test, each one |

### 11.11 Verification (2026-10-05, in the clone, on the final tree)

| Command | Result |
|---|---|
| `cd packages/design && node --test` | tests 157, pass 157, fail 0 (137 before; the build takes about 30 s of it) |
| `cd packages/design && pnpm typecheck` | exit 0 |
| `cd apps/web && pnpm typecheck && node --test && pnpm build` | tsc exit 0; tests 2,532, pass 2,532, fail 0; built in 10.94 s |
| `cd apps/site && npx astro build && node --test tests/*.test.mjs` | 21 pages built; tests 345, pass 345, fail 0 (339 after the rebase) |
| `node --test tests/*.test.mjs` (root) | tests 658, pass 640, fail 2, skipped 16: the two failures are the scratchpad-location check-pixels cases (`THE CONTROL: against a SAME-ORIGIN baseline...`, `against a baseline with NO provenance...`), as before |
| `cd apps/worker && node --test` | tests 5,581, pass 5,575, fail 0, skipped 6 (main's code is in the tree) |
| `cd packages/evals && pnpm test` | tests 1,481, pass 1,476, fail 0, skipped 5 |
| `node scripts/make-brand-assets.mjs --check` | BRAND ASSETS OK: 12 asset(s), all current |
| `node scripts/check-landing-budget.mjs` | markup and CSS 17,423 B of 20,000; inline JS 23,714 of 36,000; images 25,873 of 40,000 |
| `build-allowlist.mjs --write`, `check-old-names.mjs` | UNCLASSIFIED 0; CLEAN, 46,296 hits all allowlisted, 0 violations |
| `node scripts/check-deadends.mjs --gate` | ALL DISPOSITIONED, 43 entries |
| `node scripts/check-ci-references.mjs` | CI REFERENCES OK, 24 paths in 3 workflow files |
| `node scripts/check-offer.mjs` | OFFER COHERENT, 4 plans, 409 copy files |

### 11.12 What stays open

- The dashboards' hand-copied accent (11.9). The guard exempts `scripts/owner-dashboard/` by directory and fails when the
  directory stops copying the accent, so the exemption cannot outlive the need.
- The corrections of vendored utilities are attribute selectors on class strings (`[class*='focus-visible:ring-ring/']`,
  `[class*='backdrop-blur']`). If upstream respells a utility, the correction stops matching: the utility scan then
  finds the new weak ring and the rendered tests measure it, so it fails rather than drifts. A vendored blur aimed at
  another element (`[&>x]:backdrop-blur`) cannot be switched off this way and is refused.
- Not guarded: a blur in a script (`filter: blur(4px)` in `modal.tsx`'s and `morph-card.tsx`'s Web Animations keyframes),
  because a keyframe object and a style object are the same text; both are transient entrances. The start sheet's
  `drop-shadow` glow (`system.css`) is overridden to none by `shell.css`.
- The rendered guard draws 8 mock routes. A control that only appears behind an interaction the mock cannot reach (the
  re-auth dialog, the order summary, the checkpoint "Restore anyway") is covered through the shared `.btn-primary` rule and
  the variant fixtures, not drawn itself. It builds in Vite's development mode (11.1), takes about 30 s, and needs Vite
  and Chromium: CI installs Chromium before `pnpm -r test`, but this guard's first CI run is its first measurement there.
- Not run: the Playwright e2e suite (no layout changed), Lighthouse, a real device, the brand check on the Linux runner.
- The owner should know that three vendored controls (Copy Code, Download file, the reasoning trigger) now draw the muted
  ink upstream wrote for them, where the cascade defect had been drawing them in full ink.

## 12. Cycle 3, the last of the review fixes (2026-10-05, on the cycle 2 tree 4f1c1583)

The cycle 2 checker measured five defects in the built apps that the cycle 2 guards had not. This section fixes each, extends the rendered
guard so it would have caught it, and says what was measured before and after. Everything was measured in this clone
(`scratchpad/m2design`, branch `studpilot/m2-design`) with the change it describes in place. Commits, in order: `a7f7a3f5` (items 1, 2 and 4:
the web app and its rendered guard), `570cb965` (items 3 and 5: the site), `0a02031b` (a press must look different from a hover),
`e58d8abe` (item 2 again: where the map node's ring lives; 12.2 says why it moved), `7853a693` (a comment's ratios), `11b48102` (the selection test sets the theme by its attribute alone, which the old-name guard asked for); this section is the seventh.

### 12.1 The primary button's label on hover and press (item 1; a defect that broke users)

Measured on the unchanged tree, by the checker's probe and by the extended guard (identical): the label of the legacy `.btn-primary` on the
five sign-in pages (login, signup, forgot, recovery, confirm), hovered or pressed, is `--ink` on `--accent-strong`: **1.96:1 in dark and 2.30:1
in light** (rest 6.54 and 6.10, focus 6.54 and 6.10). The same pair inside the `.usage-page` and `.settings-page` wrappers (the checker's fixtures; the cycle 2 guard read hover only
on the controls the mock routes happen to render, and drew no sign-in page at all).

Cause, in one line: `system.css` hovers every `<button>` with `button:hover:not(:disabled):not([aria-disabled='true'])`, specificity (0,3,1),
which sets `color:var(--ink)` and a 12% ink wash; the primary's own hover, `.btn-primary:hover:not(:disabled)`, was (0,3,0), so it lost. Where a
page rule restyled the primary's fill (`.auth-page .btn-primary:hover`, `:is(.shelf,.usage-page,.settings-page) .btn-primary:hover`, both (0,4,0), fill
only) the fill came back and the label did not; where no page rule did (a modal, the workspace) the button turned grey on hover, with the label on the
wash. A first version of the fix raised only the label's specificity, and the fixture scan (750 fixtures, 8,548 measurements) found what it did to the
second case: the accent-ink label on the grey wash, 1.28:1 light and 1.32:1 dark. So the fix is the whole rule.

Fix, `apps/web/src/design/system.css`: the hover and press rules of `.btn-primary` and `.gx-btn--primary` carry `:not([aria-disabled='true'])`, so they are
(0,4,0) and outrank the element rule. They tie only with a page rule that restyles the primary on purpose (`.settings-card .btn-primary:hover`, a tinted
pill with an accent label), which loads later and wins. A disabled button keeps its resting look, as the element rule leaves it. The press fill is now the
documented `color-mix(accent 86%, black)` where it was the hover fill or the grey wash.

Measured after, by the checker's probe on the production build (`auth-hover.mjs`, five pages, both themes) and by the fixture scan:

| label on the accent | rest | hover | press | focus |
|---|---|---|---|---|
| dark (was 6.54, 1.96, 1.96, 6.54) | 6.54 | 9.25 | 4.99 | 6.54 |
| light (was 6.10, 2.30, 2.30, 6.10) | 6.10 | 7.81 | 7.57 | 6.10 |

The fixture scan (every legacy button family in eight page wrappers, five surfaces, four states) has 4.99:1 as its lowest accent-fill label, the press in dark.
That is the narrowest margin of the lane: a press is the label on the darkest fill the button draws.

The guard (`packages/design/src/web/rendered.test.mjs` and `tests/`): the build no longer forces `VITE_STUDPILOT_MOCK=1` (with the flag on the app is always signed in to
a fixture and `/app/login` draws the project shelf, so the signed-out pages could not be drawn; fixtures are asked for per page with `?mock=1`, as the routes
already did). It now draws 14 routes: the six signed-out pages (sign in, sign up, forgot, recovery, confirm, reset), each afresh in each theme, and the eight mock
routes. On each it reads every control the browser paints with the accent in five states, the label's text at 4.5:1 and its icons at 3:1: at rest; disabled (where it keeps
the fill, undimmed: a disabled sign-in submit is read before the form is typed into); under the pointer; pressed (the mouse held on it and released off it, so nothing is
clicked); and focused from the keyboard. A state is read on whatever fill the control draws in it (the cycle 2 read dropped a control that left the accent on hover instead of
measuring it on the fill it moved to), carries the pseudo-classes the browser reports, and a state that was not reached fails. A control inside a faded ancestor is refused as
not measured. A press must also draw a different fill from a hover (the press rule is a state of its own; a mutation that put it back turned nothing red until this was asserted).
Measured by the guard, per theme: rest 20 elements (15 controls) at 6.54 / 6.10 at worst, disabled 5 at 6.54 / 6.10, hover 15 (14 controls) at 5.54 / 5.03, press 15 (14) at 4.99 / 5.03, focus 15 (14) at 6.54 / 6.10.
Second, the legacy primary is drawn in every page wrapper the stylesheets restyle it in, DERIVED from the rules (`tests/sheets.mjs primaryButtonContexts`: 8 wrappers today, none
listed) and wrapped as the app's own markup writes them (`shelf` is `page shelf`: the dashboard's custom properties are on `.page.shelf`, and a bare `.shelf` draws a page
that does not exist, which this guard did at first and which read 1.96:1 on a label the real page draws correctly), as a button, a block button, a link and the workspace's
`gx-btn--primary`, with a disabled twin: 40 controls per theme (32 live in four states, 8 disabled twins at rest), at worst 6.54 / 6.10 at rest, 5.59 / 5.60 hovered, 4.99 / 5.12 pressed, 6.54 / 6.10 focused.

### 12.2 The roadmap map's node buttons: the ring was never drawn (item 2)

Measured on the unchanged tree. The checker's pixel read gave 1.18:1 dark and 1.22:1 light on the two nodes the map fades. The extended guard reads each node's ring
two ways, and they disagree, which is the finding. The model (the ring's computed colour, now composited through every ancestor's opacity) reads 1.56:1 and 1.61:1 on
the two faded nodes and at least 3:1 on the other four. The pixels (a clip of the card with nothing focused, the same clip with the button focused, compared) read **no ring on
any node**: 0 to 1 pixels changed on the faded nodes and on the in-progress one, and 56 to 202 on the others, antialiased corners where the card's rounded clip meets the button's
square one (1.4 to 1.8:1 against what they replaced). The button is the whole card (`size-full`) and the card is `overflow-hidden`, so a ring drawn outside the button is outside
the clip: the dimming (`opacity-40`) was the smaller defect, and lifting it alone would have drawn nothing. Two other placements were drawn before the one that stayed: an inset box-shadow ring is painted under
the header's fill (looked at: visible on three sides); a box-shadow ring on the card replaces the selected node's own ring, so focusing the selected node reads 1.38:1 dark and 1.31:1 light
against not focusing it (measured).

Fix, `apps/web/src/components/roadmap/dependency-map.tsx`: the button draws an OUTLINE inset by two pixels (`focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`),
which is painted over the header, is not clipped, is its own property so it shows beside the selected node's ring, and is the focused element's own indicator (the first fix put it on the card:
drawn, 3.56:1 or better as pixels, but the focused button itself carried none, which a reader of its own style finds); and a faded node returns to full strength while it has focus
(`focus-within:opacity-100`). Measured as pixels, per node (six nodes, two of them faded), both themes: dark 5.07 / 3.80 / 3.65 (selected) / 3.96 / 3.97 / 5.07, light 6.61 / 3.60 / 3.39 (selected) /
3.71 / 3.69 / 6.61. The checker's own scan on this build (`focus-scan.mjs`, pixels and styles, 20 route-theme pairs signed in, 12 signed out): 410 and 46 stops, none under 3:1 by either
read; the lowest style read 3.34:1 (light) and the lowest pixel read 3.24:1 (light, the selected map node), no stop without an indicator of its own.

The guard: `inPageFocusIndicator` composites every ancestor's opacity (premultiplied, group by group, from the parent up to the root) once with the ring and once without, so the ratio is
between two pixels the browser paints and a stop reports the opacity it sits under; and `inPageRingPixels` reads a ring as pixels (the changed pixels grouped by the colour they were repainted
in, the group that reads best against what it replaced), applied to every map node, with canaries (six nodes, at least one faded and one not, no card that moved). Measured by the guard: 185
focus stops per theme (153 before: the signed-out pages), none dimmed, lowest ring 3.91 dark and 3.56 light (the model), and the nodes' pixel read 3.65 dark and 3.39 light at worst.

### 12.3 Selected text on a filled control, on the site (item 3)

Measured on the unchanged tree, by the checker's selection probe over the 20 built routes in both themes (4,020 text elements): 14 groups below 4.5:1, lowest 1.53:1 dark and 1.51:1 light. The
accent controls (the call to action's label, the composer's Send, the shiny and the primary button, the skip link) read **2.77:1 dark and 2.94:1 light**: `::selection` is a translucent
wash of the accent, which over an accent fill paints the accent, with `--ink` on it. The docs folder's paper sheets (`--paper` text on an `--ink` fill, 8px labels) read 1.53 and 1.51: the wash over
`--ink` under `--ink`. Read as pixels, the folder's selected label is the same colour as the fill (1.00:1).

Fix: every control the sheets fill sets its own OPAQUE selection pair, for its own text and its descendants' (`X::selection` and `X ::selection`; the descendant form is the one that beats the
page-wide rule on a label span). On the accent the pair is the label's own pair swapped (the accent-ink as the highlight, the accent as the text), which reads exactly as the control does at rest and
is visibly not the control; on the paper sheets it is `--paper` behind `--ink`. The rules sit beside the fills they pair with: `base.css` (the skip link, `.btn-primary`), `landing.css` (`.composer-send`),
`picks/cta-button.css` (`.cta`, and `.cta__knob`, which carries an arrow today and declares the pair so a label added to it reads), `picks-docs/Folder.astro` (`.fold__paper`).

Measured after: the checker's probe, 4,020 text elements, **min 6.54:1 dark and 6.10:1 light, 0 groups below 4.5 or in the browser's own highlight**; pixels, the accent controls' selected text,
6.54 and 6.10. The one pixel read below that is the probe's own sample of `.fold__paper` at rest (1.00): the sheet's label sits behind the folder's front flap (decorative art; the label peeks above it
on hover), so the probe reads the flap, not a selection; the style read for the same element is ink on paper, 18.05:1 dark and 16.87:1 light on either sheet, and a hovered folder was selected and drawn to check that the highlight shows.

The guards: `apps/site/tests/contrast.test.mjs` derives every opaque non-surface fill from the cascade (the six today: `.btn-primary`, `.cta`, `.cta__knob`, `.composer-send`, `.skip-link`, `.fold__paper`, found, not listed) and
requires both forms for each, 4.5:1 for the text and 3:1 of the highlight against the fill; its fixtures fail the shipped wash, each missing half, a pair that paints the fill itself, a wash of the accent over its own
fill, and a rule for another element. `apps/site/tests/rendered-selection.test.mjs` (new) serves the build, reads the `::selection` style the browser resolved for every text element of every built route
(derived from `dist`) in both themes, over what is really behind it (every ancestor's fill and opacity), and selects the text of four accent controls and reads the painted pixels; it is first pointed at an accent
control with no pair of its own (must fail) and at one with the inverted pair (must pass), and at a card at 40% opacity (the dimming must be read).

### 12.4 The destructive Badge as a link, in dark (item 4; latent)

Measured by drawing every variant of the shadcn Badge as the `span` it is and as the `a` it becomes: the destructive link hovered, 3.07 to 3.17:1 on the five surfaces (white on 90% of `--bad`; rest 5.15, a span has
no hover). Fixed with the destructive Button's correction, one more selector in `styles/ai-elements.css` (`a[class*='[a&]:hover:bg-destructive/90']`, an `a` only, so a span badge does not gain a hover step): 4.79:1 dark,
5.03 light at worst over the 80 badge fixtures per theme. The rendered guard now draws them (variants read from `components/ui/badge.tsx`, not listed).

### 12.5 The stale comment (item 5)

`apps/site/src/styles/global.css`, above `.table-scroll table th[scope='row']`: "Frosted too, so the plans scrolling under it blur rather than show through." The rule is an opaque `--surface-2` and
the site draws no blur; the comment says so.

### 12.6 Mutations: every new or restated guard went red, then green

One planted break per row (the anchors asserted to occur exactly once, every file restored byte for byte and the hash compared, a lock so that only one harness mutates the tree; the harness is not committed).
Run on the final tree. "Pixels" and "model" are the two reads of a ring.

| Item | Planted break | Red |
|---|---|---|
| 1 | the primary's hover rule back at (0,3,0) | rendered: both accent-fill tests and both legacy-primary tests (the sign-in pages at 1.96 / 2.30) |
| 1 | the press rule back at (0,3,0), hover kept | rendered: both accent-fill tests ("draws the same fill pressed as hovered"; before that assertion: nothing) |
| 1 | a state read keeps only the elements that still match the accent (the cycle 2 read) | rendered: the states fixture test, the dark legacy test, the light accent-fill and legacy tests |
| 1 | the press is never made | rendered: both accent-fill tests, both legacy tests, the states fixture test |
| 1 | the fixture flag forced on again | rendered: both accent-fill tests (the sign-in pages are not drawn) |
| 1 | the wrapper derivation finds no wrapper | rendered: both legacy-primary tests |
| 1 | the signed-out routes dropped from the list | rendered: both accent-fill tests (the floor) |
| 2 | the faded node is not lifted on focus | rendered: both map-pixel tests and both tab tests (the model sees 1.2:1) |
| 2 | the ring back on the button, outside the card's clip (the cycle 2 ring) | rendered: both map-pixel tests. The tab tests stay GREEN: the model reads a ring that the clip never draws |
| 2 | a box-shadow ring on the card, replacing the selected node's own | rendered: both map-pixel tests (the selected node, 1.38 / 1.31:1) |
| 2 | the focus model ignores every ancestor's opacity | rendered: the faded-card fixture test (the real tab tests stay green with the fix in place) |
| 4 | the destructive badge link's correction removed | rendered: the dark Badge test (3.07 to 3.17:1; red on the unfixed tree before the fix) |
| 3 | the skip link and primary-button pair removed | site contrast: both fill tests; rendered-selection: the dark and light scan and pixel tests |
| 3 | the composer Send pair removed | site contrast: both fill tests; rendered-selection: the four scan and pixel tests |
| 3 | the call to action pair removed | site contrast: both fill tests; rendered-selection: the four scan and pixel tests |
| 3 | the paper sheets' pair removed | site contrast: both fill tests; rendered-selection: both scan tests (the pixel sample does not draw the folder) |
| 3 | the pair paints the fill itself (the accent behind the accent-ink label) | site contrast: both fill tests ("does not show"); rendered-selection: both pixel tests (the style scan reads 6.54 and stays green) |
| 3 | only the descendant forms removed | site contrast: both fill tests; rendered-selection: four |
| 3 | every pair removed (the cycle 2 state) | site contrast: both; rendered-selection: four |
| 3 | the scan's ground reader ignores the element's own fill | rendered-selection: the fixture test |
| 3 | the contrast guard checks the element's own text only; the visibility check removed | site contrast: the fixture test, each |

### 12.7 Verification (2026-10-05, in the clone, on the final tree)

| Command | Result |
|---|---|
| `cd packages/design && node --test` | tests 165, pass 165, fail 0 (157 before: eight new, the guards of 12.1 to 12.4; about 50 s of it is the build and the browser) |
| `cd packages/design && pnpm typecheck` | exit 0 |
| `cd apps/web && pnpm typecheck && node --test && pnpm build` | tsc exit 0; tests 2,532, pass 2,532, fail 0; built in 8.61 s |
| `cd apps/site && npx astro build && node --test tests/*.test.mjs` | 21 pages built; tests 353, pass 353, fail 0 (345 before: three contrast tests, five in the new `rendered-selection.test.mjs`) |
| `node --test tests/*.test.mjs` (root) | tests 658, pass 640, fail 2, skipped 16: the two failures are the scratchpad-location check-pixels cases (`THE CONTROL: against a SAME-ORIGIN baseline...`, `against a baseline with NO provenance...`), as before |
| `node scripts/make-brand-assets.mjs --check` | BRAND ASSETS OK: 12 asset(s), all current |
| `node scripts/check-landing-budget.mjs` | markup and CSS 17,481 B of 20,000 (17,423 before: the selection pairs); inline JS 23,714 of 36,000; images 25,873 of 40,000 |
| `build-allowlist.mjs --write`, `check-old-names.mjs` | UNCLASSIFIED 0; CLEAN, 46,296 hits all allowlisted by 644 lines, 0 violations; the allowlist file is unchanged by this cycle (a first draft of the new test wrote the site's former-name theme key and was caught by this guard; it was removed, not allowlisted) |
| `node scripts/check-deadends.mjs --gate` | ALL DISPOSITIONED, 43 entries |
| `node scripts/check-ci-references.mjs` | CI REFERENCES OK, 24 paths in 3 workflow files |
| `node scripts/check-offer.mjs` | OFFER COHERENT, 4 plans, 409 copy files |

The checker's own probes, re-run on the new build (scripts in `scratchpad/probes/c3`, copies of the cycle 2 checker's, repointed at this clone):

| Probe | Lowest measured |
|---|---|
| sign-in label, rest / hover / press / focus (`auth-hover.mjs`, five pages) | dark 6.54 / 9.25 / 4.99 / 6.54, light 6.10 / 7.81 / 7.57 / 6.10 (was 1.96 and 2.30 hovered and pressed) |
| legacy button families, 750 fixtures, 8,548 measurements (`fixtures-scan.mjs`) | accent-fill labels 4.99:1; the only pair under the bar is the `gx-chip` of 12.8 (4.41); the destructive Badge link 4.78 (was 3.07) |
| every focus stop (`focus-scan.mjs`: 410 signed in, 46 signed out; style and pixels) | style 3.34:1 (light), pixels 3.24:1 (light, the selected map node); none under 3:1; no stop without an indicator of its own (the cycle 2 tree: the two faded map nodes at 1.18 and 1.22) |
| the map's node rings as pixels (`ringpx.mjs`) | 3.65:1 dark, 3.39:1 light (the selected node); the faded nodes 5.07 and 6.61 |
| selected text, every text element of the 20 built routes (`site-selection.mjs`, 4,020) | 6.54:1 dark, 6.10:1 light; 0 groups under 4.5 or in the browser's own highlight (was 14 groups, 1.53 and 1.51) |
| selected text as pixels (`sel-pixels.mjs`) | the accent controls 6.54 and 6.10; `.fold__paper` at rest reads 1.00 because its label is behind the folder's flap (12.3) |

### 12.8 What stays open

- `gx-chip` with a `model-signature` in light, hovered or pressed: 4.41:1 (`--accent` on an 18% accent wash). Found by the same fixture scan, which also found it on the cycle 2 tree. It is a tint, not an accent fill, and not one of the five items;
  it is left as it is.
- The press is the narrowest margin on the branch: 4.99:1 (dark), the label on the darkest fill the button draws.
- A ring is read as pixels for the roadmap map's nodes only. Every other stop is read by the model, which now accounts for ancestor opacity but not for a clip or a sibling painted over the ring: a ring clipped elsewhere would pass it.
  The checker's all-stops pixel scan on this build read 370 of the 410 signed-in stops and the lowest was 3.24:1; the guard does not run that scan.
- The disabled primary is read where it keeps the accent fill (the sign-in pages). Where a page repaints it as an outline (the shelf) it has no fill and is not read, as WCAG exempts an inactive control.
- `a[class*='[a&]:hover:bg-destructive/90']` is an attribute selector on a class string, like the other corrections of vendored utilities (11.12): if upstream respells the utility it stops matching, and the badge test measures it.
- `settings.css` still describes `.btn-primary` as "the tinted pill, 10% green behind 90% green", a description of the old accent that predates the filled primary; the comment is stale and was not touched.
- Not run: the Playwright e2e suite, Lighthouse, a real device, the brand check on the Linux runner.
