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
**1.06:1 black on the old ground in the dark theme** (21.00:1 in light, which is why nobody saw it in
a light-theme check).

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
either theme. The
label on the hovered button is `--accent-ink` on `--accent-strong`: 9.25:1 dark, 7.81:1 light.

### 10.3 The focus-ring gate measured something nothing draws

`measureAccent` measured the SOLID accent as the focus ring, which is the same number as the accent's
text contrast (`ringWorst == textWorst`), so the 3:1 check could never fire on its own. The outlines the
apps actually drew used `--accent-ring`, the accent at 45% alpha: **2.09:1 on the worst surface in dark
and 1.97:1 in light** (measured by composing the token over each surface). Six rules drew a ring at
that strength: `picks/composer/file-picker.css`, `picks/tech/line-thread.css`,
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
- `og.png` is drawn in the system font of the machine that made it. `--check` compares it by render
  only on the platform the manifest records (`renderedOn`, `darwin`); on any other it says so in its
  report line and the manifest hashes are its check.
- CI: `typecheck-and-test` already installs Playwright Chromium before `pnpm -r test`, so
  `node scripts/make-brand-assets.mjs --check` is a step there, after the install (a test fails if the
  step is removed or moved before the install). It fetches nothing. Not run on a Linux runner from
  here: the first CI run is its first measurement there, and the tolerance above is sized from the
  noise measured on this machine, not from a Linux render.

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
