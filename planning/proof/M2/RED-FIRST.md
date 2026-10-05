# M2 step 2.2: the new guards, red first (2026-10-05)

Handoff M2 and plan section 6 ("no fake output"): the guards for the site rebuild were written BEFORE any page was
changed, and run against the OLD build (`pnpm --filter @studpilot/site build` at `11b39e26`, the tree before this step; the
built `apps/site/dist` of that commit). Every test below that is red is red for the reason in its own message. The
tests that were green on the old build are the scanner self-checks (a scanner that finds nothing cannot pass for a clean
site, so each guard first runs its scanner on a page it must flag and a page it must pass) and the properties the old pricing
page already held (the owner's headline, no Stripe link, no Enterprise tier, disabled paid buttons).

Command, from `apps/site`: `node --test tests/<name>.test.mjs`. Shared parsers: `apps/site/tests/lib/dist.mjs`.

| Guard | Tests | Red on the old build | Green on the old build (self-checks and held properties) |
|---|---|---|---|
| `no-fake-output.test.mjs` | 9 | 7 | 2 (both scanners prove they can see) |
| `beta-labels.test.mjs` | 6 | 2 | 4 |
| `hermetic-build.test.mjs` | 7 | 4 | 3 |
| `old-layouts-gone.test.mjs` | 5 | 4 | 1 |
| `nav-and-routes.test.mjs` | 6 | 6 | 0 |

## 1. The red output on the old build, test by test

The assertion message of each red test, as the run printed it (the full logs are not kept; the command reproduces them).

### `no-fake-output.test.mjs` (9 tests, 2 pass, 7 fail)
- RED: the build was read: every page parses, and the three picture routes exist with a <main>
    dist has no page for /catalog/: the build did not emit it
- RED: no page carries a drawn critique, a removed capability, whole-game framing or a results claim
    / says a critique the site drew (the old "Sample critique" stage): "Sample critique"
- RED: no page ships the old BuiltScreen: no marker, no recorded model screen, no proof assets
    / still carries the BuiltScreen band
- RED: a score out of ten is never shown as a result; the one "8/10" is the stated bar, inside the quality-bar region
    / shows a score out of ten outside the stated bar
- RED: screens.json: every record is complete, claims no build result, and matches the bytes in public/ and dist/
    apps/site/src/data/screens.json is missing: every image on the site needs a record there
- RED: every <img> on the landing, /catalog and /how-it-works has a record whose hash matches the file it points at
    apps/site/src/data/screens.json is missing: every image on the site needs a record there
- RED: every picture route has fixed-size screen slots; a slot holds an <img> only when screens.json has a record for it, and no <img> sits outside a slot
    apps/site/src/data/screens.json is missing: every image on the site needs a record there

### `beta-labels.test.mjs` (6 tests, 4 pass, 2 fail)
- RED: the front page, /pricing and /how-it-works each carry the Beta label as visible text
    / does not say "Beta" anywhere a reader can see it
- RED: the front page says the promise is the bar being built to, not a result
    the plan's promise is missing from the front page, word for word

### `hermetic-build.test.mjs` (7 tests, 3 pass, 4 fail)
- RED: no build-time code in apps/site/src calls fetch( or any other network API (a browser <script> may)
    lib/billing-probe.ts reaches the network at build time: fetch(
- RED: billing-probe.ts is gone and nothing asks whether a plan can be bought
    src/lib/billing-probe.ts still exists
- RED: the former workers.dev hosts appear nowhere in apps/site/src, the Astro config or robots.txt
    ../astro.config.mjs names a workers.dev host
- RED: every sitemap file in dist lists only https://studpilot.app URLs, and lists the main pages
    the sitemap does not list /how-it-works/

### `old-layouts-gone.test.mjs` (5 tests, 1 pass, 4 fail)
- RED: every old layout, component, data file and page the rebuild replaced no longer exists
    src/layouts/Landing.astro still exists: it is an old layout the M2 rebuild replaced
- RED: the layouts folder holds the one Base layout and the two document layouts that sit on it, and nothing else
    Expected values to be strictly deep-equal:
- RED: no source file imports anything that was deleted, and every page renders through Base (directly or through a layout on it)
    components/BuiltScreen.astro imports ../data/showcase-proof, which the rebuild deleted (data/showcase-proof.ts)
- RED: index.astro is on Base and carries no copy of the old front page
    The input did not match the regular expression /layouts\/Base\.astro/. Input:

### `nav-and-routes.test.mjs` (6 tests, 0 pass, 6 fail)
- RED: the resolver can see: it finds a page, a redirect and a missing path, and tells an app door from another app route
    Expected values to be strictly equal:
- RED: the header carries exactly the new navigation, derived from the built front page
    the primary navigation has no "How it works" (it has: Product, Engine, Showcase, Pricing, Docs, Sign in, Create an account)
- RED: every link in the primary navigation resolves to a built page (never a redirect), the app door, or the Discord hop
    only 7 navigation links were found
- RED: the footer keeps its product links, Privacy, Terms, Status, Discord, the operator line and the beta note, and every link resolves
    the front page has no <footer data-site-footer>
- RED: on every built page the header and footer links resolve (a page added tomorrow is checked tomorrow)
    only 0 chrome links were checked across 21 pages
- RED: the removed routes are redirects the build emits: /models and /proof to the front page and the catalog, /showcase to the catalog, /changelog to the blog
    /models/ is page in the build: it must be an Astro redirect so the built file overwrites the old static row

## 2. Mutations: every new or restated guard went red, then green (the proof the ledger cites)

Each row is one planted break in the page, the stylesheet, the layout, the config or the data (the anchor asserted to occur exactly once), the
guard run (rebuilding `apps/site/dist` first when the guard reads it), then the break restored byte for byte, the site rebuilt and the guard
run again. "Red exit" is the guard's exit code with the break in (non-zero is red); "green exit" is the exit code after the restore (0 is green).
66 of 66 went red and came back green. The harness is not committed; this list is the record. `G..` are the five guards written first, `N..` those
written for the new pages, `R..` the restated guards.

| id | the planted break | guard run | first red test | red exit | green exit |
|---|---|---|---|---|---|
| `G01` | a drawn "Sample critique" returns to the landing | `no-fake-output.test.mjs` | no page carries a drawn critique, a removed capability, whole-game framing or a results claim (1 red) | 1 | 0 |
| `G02` | an <img> outside any screen slot on the landing | `no-fake-output.test.mjs` | every <img> on the landing, /catalog and /how-it-works has a record whose hash matches the file it points at (2 red) | 1 | 0 |
| `G03` | a score shown as a result on the catalog | `no-fake-output.test.mjs` | a score out of ten is never shown as a result; the one "8/10" is the stated bar, inside the quality-bar region (1 red) | 1 | 0 |
| `G04` | the quality-bar region states a different bar | `no-fake-output.test.mjs` | a score out of ten is never shown as a result; the one "8/10" is the stated bar, inside the quality-bar region (1 red) | 1 | 0 |
| `G05` | the owner's pricing headline is reworded | `beta-labels.test.mjs` | /pricing says, in the owner's words, that it is free while in beta and paid plans start later (1 red) | 1 | 0 |
| `G06` | a Stripe checkout link appears on /pricing | `beta-labels.test.mjs` | no page links to Stripe or a checkout, and no page names an Enterprise tier (1 red) | 1 | 0 |
| `G07` | an Enterprise tier is named on /pricing | `beta-labels.test.mjs` | no page links to Stripe or a checkout, and no page names an Enterprise tier (1 red) | 1 | 0 |
| `G08` | the landing drops the Beta label (badge and note) | `beta-labels.test.mjs` | the front page, /pricing and /how-it-works each carry the Beta label in their own content, not only in the shared header and footer (1 red) | 1 | 0 |
| `G09` | a build-time fetch( comes back in terms.astro | `hermetic-build.test.mjs` | no build-time code in apps/site/src calls fetch( or any other network API (a browser <script> may) (2 red) | 1 | 0 |
| `G10` | the Astro site becomes a workers.dev host | `hermetic-build.test.mjs` | the former workers.dev hosts appear nowhere in apps/site/src, the Astro config or robots.txt (4 red) | 1 | 0 |
| `G11` | robots.txt points at another sitemap | `hermetic-build.test.mjs` | the canonical site is https://studpilot.app in the config and in robots.txt (1 red) | 1 | 0 |
| `G12` | Marquee.astro is recreated | `old-layouts-gone.test.mjs` | every old layout, component, data file and page the rebuild replaced no longer exists (1 red) | 1 | 0 |
| `G13` | the landing imports a deleted component | `old-layouts-gone.test.mjs` | no source file imports anything that was deleted, and every page renders through Base (directly or through a layout on it) (2 red) | 1 | 0 |
| `G14` | a nav link points at a page that does not exist | `nav-and-routes.test.mjs` | every link in the primary navigation resolves to a built page (never a redirect), the app door, or the Discord hop (2 red) | 1 | 0 |
| `G15` | the /showcase redirect is dropped from the config | `nav-and-routes.test.mjs` | the removed routes are redirects the build emits: /models and /proof to the front page and the catalog, /showcase to the catalog, /changelog to the bl (1 red) | 1 | 0 |
| `G16` | the primary button no longer goes to sign-up | `nav-and-routes.test.mjs` | the header carries exactly the new navigation, derived from the built front page (1 red) | 1 | 0 |
| `G17` | the footer loses the operator line | `nav-and-routes.test.mjs, one-operator.test.mjs` | the footer keeps its product links, Privacy, Terms, Status, Discord, the operator line and the beta note, and every link resolves (2 red) | 1 | 0 |
| `N01` | an invented example request on the catalog | `catalog-examples.test.mjs` | every example request on the catalog is a line of the frozen dev test set, word for word (1 red) | 1 | 0 |
| `N02` | a result is printed beside the catalog requests | `catalog-examples.test.mjs` | nothing on the catalog reads as a result, and the page says there are no examples yet (1 red) | 1 | 0 |
| `N03` | the block engine is described as working today | `how-it-works.test.mjs` | the block engine is "Being built", and the page says the blocks are not in yet (1 red) | 1 | 0 |
| `N04` | Google sign-in is described as available | `how-it-works.test.mjs` | sign-in names Google and Discord only as coming, never as available, on every marketing page (1 red) | 1 | 0 |
| `N05` | a step describes the AI looking at a screenshot | `how-it-works.test.mjs, no-fake-output.test.mjs` | nothing describes the AI looking at a picture, and no step describes a result (1 red) | 1 | 0 |
| `N06` | the blog post quotes a Free allowance the config does not hold | `blog-post.test.mjs` | the figures in the post are the config's: Free is 5 Credits a day and 30 a month, a Credit is about $0.05, a typical build about 1.40 (1 red) | 1 | 0 |
| `N07` | the post stops saying paid plans are not for sale | `blog-post.test.mjs` | every "not there yet" line is still true of the repository, so the post cannot go stale quietly (1 red) | 1 | 0 |
| `R01` | the 404 stops passing noindex to Base | `unpurchasable-and-shared-cap.test.mjs` | the 404 page nominates no canonical and is marked noindex (1 red) | 1 | 0 |
| `R02` | a page offers Ctrl+Z with no checkpoint | `undo-unit-claims.test.mjs` | every built page that offers Ctrl+Z also names the checkpoint as the whole-run exit (1 red) | 1 | 0 |
| `R03` | the landing sells a batch as one undo step | `undo-unit-claims.test.mjs` | index.astro does not sell one Ctrl+Z as a whole-run undo (2 red) | 1 | 0 |
| `R04` | Base loses the id the theme script repaints | `theme-on-every-route.test.mjs` | Base.astro gives the theme-color meta an id so the theme script can repaint it (1 red) | 1 | 0 |
| `R05` | the header loses its theme toggle | `theme-on-every-route.test.mjs` | every built page applies the stored theme before paint, has a toggle in its header, and a handler that stores the choice (1 red) | 1 | 0 |
| `R06` | site.css declares a colour token of its own | `theme-on-every-route.test.mjs` | the token file has a light ramp, and no site sheet declares a colour of its own (1 red) | 1 | 0 |
| `R07` | the scroll reveal comes back as a stylesheet rule | `reveal-cannot-hide-content.test.mjs` | no stylesheet or <style> block hides content behind a script-added class (1 red) | 1 | 0 |
| `R08` | a section carries data-reveal | `reveal-cannot-hide-content.test.mjs` | no source file carries a reveal: no data-reveal, no kinetic class, no is-in class (2 red) | 1 | 0 |
| `R09` | the primary button loses its own selection pair | `contrast.test.mjs` | dark: selected text clears 4.5:1 on every fill a control draws, and shows against it (2 red) | 1 | 0 |
| `R10` | the primary button loses its own selection pair (pixels) | `rendered-selection.test.mjs` | dark: every element that owns text, on every route, has selected text at 4.5:1 on what is drawn behind it (4 red) | 1 | 0 |
| `R11` | the example requests lose the mono token | `type-system.test.mjs` | the mono token reaches technical surfaces while reading text uses the body face (1 red) | 1 | 0 |
| `R12` | the header icon buttons lose their pointer | `cursor-reaches-every-control.test.mjs` | the built controls still ask for a pointer (1 red) | 1 | 0 |
| `R13` | the 404 label drifts off the heading axis | `rendered-typography.test.mjs` | THE 404's LABEL IS ON THE PAGE'S AXIS: its text starts where the heading does (1 red) | 1 | 0 |
| `R14` | a page title is set bold | `rendered-typography.test.mjs` | EVERY PAGE TITLE IS SET THE SAME WAY, and none falls back to the browser's bold 2em (1 red) | 1 | 0 |
| `R15` | a paragraph on the catalog strands a word | `rendered-typography.test.mjs` | NO PAGE STRANDS A WORD ON ITS OWN LINE, at 375px or at 1280px (1 red) | 1 | 0 |
| `R16` | the /showcase redirect is dropped (links-resolve) | `links-resolve.test.mjs` | the exempt routes are published by something in this repository, and no route Astro builds is still exempt (1 red) | 1 | 0 |
| `R17` | the nav drops Catalog | `links-resolve.test.mjs` | the navigation is the same on every page, and any fragment in it names an id the landing has (1 red) | 1 | 0 |
| `R18` | the nav offers a section that is not on the landing | `links-resolve.test.mjs` | every anchor names an id that is on the page it points at (2 red) | 1 | 0 |
| `R19` | the landing gains a table of results | `counted-copy.test.mjs` | the landing contains no fabricated run, place, or result snapshot (1 red) | 1 | 0 |
| `R20` | a tool name is printed on the landing | `site-names-real-tools.test.mjs` | every tool name printed on this site is one the worker actually registers (2 red) | 1 | 0 |
| `R21` | how it works prints a real tool name | `site-names-real-tools.test.mjs` | the guard has teeth, and the marketing pages say it in words: no tool name on /, /how-it-works, /catalog or /pricing (1 red) | 1 | 0 |
| `R22` | a Credit is defined as 30 neurons | `pricing-config.test.mjs` | NO PAGE DEFINES A CREDIT AS 30 NEURONS: a Credit is about $0.05 of compute, and /pricing says so (1 red) | 1 | 0 |
| `R23` | a page names a tier the table does not list | `published-version-and-modes.test.mjs` | NO PAGE INVENTS A PLAN, and the three that exist are the three that are named (1 red) | 1 | 0 |
| `R24` | a page gives a plan queue priority | `published-version-and-modes.test.mjs` | NO PAGE, AND NO PLAN CARD, GIVES A PLAN A PLACE IN A QUEUE (1 red) | 1 | 0 |
| `R25` | an atmosphere layer comes back in a sheet | `phone-drops-layers.test.mjs` | no public stylesheet carries the retired atmosphere layers (1 red) | 1 | 0 |
| `R26` | the hero gains a canvas | `living-background.test.mjs` | the hero is content and product UI rather than a decorative scene (1 red) | 1 | 0 |
| `R27` | the screenshot slot casts a shadow | `living-background.test.mjs` | the screenshot slot is a flat panel on the shared radius, and no site sheet declares a design token of its own (1 red) | 1 | 0 |
| `R28` | a layout drops the tokens import | `living-background.test.mjs` | the public layout loads the shared design tokens and does not import the retired relaunch layer (1 red) | 1 | 0 |
| `R29` | a keyframe is declared in a marketing sheet | `animation-actually-wins.test.mjs` | the rebuilt marketing sheets declare no keyframe, run no animation and loop nothing (2 red) | 1 | 0 |
| `R30` | a dead keyframe in the docs folder | `animation-actually-wins.test.mjs` | every keyframe that remains is declared and used in the same file, and every loop stops under reduced motion (1 red) | 1 | 0 |
| `R31` | an unconditional loop in a marketing sheet | `animation-actually-wins.test.mjs` | the rebuilt marketing sheets declare no keyframe, run no animation and loop nothing (2 red) | 1 | 0 |
| `R32` | the landing carries an image directly | `asset-wall.test.mjs` | the landing has no asset banner, image wall, or remote image dependency (1 red) | 1 | 0 |
| `R33` | LegalLayout.astro is renamed away (the layouts canary) | `interface-sound.test.mjs` | the walk read the site, so nothing below is vacuous (1 red) | 1 | 0 |
| `R34` | a Studio screenshot of a result is claimed on the landing (pixel scan unaffected): body text turns dark-on-dark | `pages-render-clean.test.mjs` | EVERY WORD CLEARS 4.5:1 against what is behind it, dark and light, on every route (1 red) | 1 | 0 |
| `R35` | the hero buttons are wider than a phone | `pages-render-clean.test.mjs` | NO HORIZONTAL OVERFLOW at 320, 390, 768 and 1440, on every route (1 red) | 1 | 0 |
| `R36` | the primary button loses its focus ring | `pages-render-clean.test.mjs` | THE ONE FOCUS RING: tabbing through every route, each control that takes focus draws 2px solid of the accent (1 red) | 1 | 0 |
| `R37` | the landing offers a key of your own | `pages-render-clean.test.mjs` | no page names a retired model, tier or credit rate, offers a key of your own, or gates the engine on a plan; the engine named is the registry's (1 red) | 1 | 0 |
| `R38` | the how-it-works page promises an install while the store is shut | `pages-render-clean.test.mjs` | no page promises that the plugin can be installed while the store is not live (1 red) | 1 | 0 |
| `R39` | a colour literal in a rebuilt style | `pages-render-clean.test.mjs` | the rebuilt styles spend tokens only: no colour literal, and the status colours only on a .status dot (1 red) | 1 | 0 |
| `R40` | the per-build price on a paid card is rounded wrongly | `picks-pricing-docs.test.mjs` | the per-build price on each paid card is derived from the config, never typed (1 red) | 1 | 0 |
| `R41` | the web test: the Base layout drops the tokens import | `app-ink-ramp.test.mjs` | the app and the public site use one ramp: both load the token file and neither declares an ink (1 red) | 1 | 0 |
| `N08` | a lost space before a link on a rebuilt page (the how-it-works docs line) | `rendered-text-joins.test.mjs` | no rebuilt page glues an inline tag to the word before it; the docs, /privacy and /terms are the named debt, and each still has one (1 red) | 1 | 0 |

## 3. The e2e specs (Playwright, `tests/e2e/`)

The two specs that pinned the old pages were rewritten (TEST-LEDGER.md, last two rows). Run from the repository root against `astro preview` of the
rebuilt site: `pnpm exec playwright test` runs **387 specs on the desktop, laptop and phone projects, all passing**. Two planted breaks, run by hand:

| planted break | spec | result | after the restore |
|---|---|---|---|
| the landing's headline is changed to "Build whole games from one line." | `landing.spec.ts` "renders the proposition" | red: expected the plan's promise, received the planted line | green |
| a `<canvas>` is added to the hero | `atmosphere-on-every-route.spec.ts` "/ draws no canvas and no ambient scene" | red: "/ renders a <canvas>" | green |

Two things the rewrite found, which the old routes never reached, said here because they are named exemptions in the specs: the docs' Terminal demo
(`/docs/build-from-source`) blinks its caret forever while it is out of view on a phone, and text inside a closed `<details>` (the pricing limits FAQ)
is not painted whatever box the engine reports for it. The first is excused by name (only that caret, only that page; the docs rewrite owns the component);
the second is skipped in the pixel audit and its summaries are measured.

## 4. Green on the rebuilt site (the same commands, after the last change)

| command | result |
|---|---|
| `pnpm --filter @studpilot/site build` | 22 pages and 4 redirect stubs, 0 errors |
| `cd apps/site && node --test tests/*.test.mjs` | 327 tests, 327 pass, 0 fail (381 before) |
| `node scripts/check-landing-budget.mjs` | passes without raising a budget: 10,382 B gzip of 20,000; 2,882 B JavaScript of 36,000; 2,996 B images of 40,000 |
| `node scripts/check-site-links.mjs` | 868 internal links across 26 pages, all resolve |
| `node scripts/check-site-semantics.mjs` | 22 pages and 4 redirect stubs sound (one h1, landmarks) |
| `node scripts/check-copy.mjs`, `check-offer.mjs`, `check-credit-figures.mjs` | clean |
| `node scripts/check-old-names.mjs` | clean (0 violations) |
| `pnpm --filter @studpilot/site typecheck` | 0 errors |
| `node --test tests/*.test.mjs` at the root | 661 tests, 643 pass, 2 fail (the two known `check-pixels` cases that fail because of the scratchpad location), 16 skipped: the same as before this step |
| `cd apps/web && node --test` | 2,537 tests, 2,537 pass, 0 fail (unchanged) |
| `pnpm exec playwright test` | 387 specs pass (desktop, laptop, phone) |
| Lighthouse (local preview, mobile) on `/` and `/pricing` | Accessibility 100, Best Practices 100, SEO 100 on both |


## 5. Fix cycle 1 (2026-10-05): the mutations

The review of the first pass (23 findings, 18 confirmed by two skeptics each, plus 5 minor) asked for red-first proof of every new or restated guard.
Each entry is a planted break in the named file (restored with a uniquely anchored replacement, the occurrence count asserted first, the diff read after),
the assertion that went red, and, where the finding measured it, what the same break did to the suite BEFORE the fix. "Rebuilt" means the site was built
with the break in place and again after the restore. The helper scripts that ran them are throw-away (they live outside the repository).

### 5.1 capture guard (tests/m2-capture-guard.test.mjs, scripts/lib/capture-guard.mjs)
- remove `'[data-turn]'` from TURN_SELECTORS -> 2 red ("the fixtures cover every selector", "a conversation element is caught: [data-turn]"); restored, 19/19 green
- change `canvas:not(.pk-voice__wave)` to `canvas.pk-voice__wave` -> 4 red (canvas fixture not caught, waveform judged a result, empty workspace refused, coverage); restored
- make `found()` return [] (a blind guard) -> 9 red (every conversation and picture fixture passes as clean); restored

### 5.2 blog post (tests/blog-post.test.mjs, src/content/blog/what-works-today.md); each mutation is in the .md only, then restored
- "a 6-character code" -> "an 8-character code": 1 red (the claim "New customers cannot build in Studio." against the plugin); before the fix this left the whole site suite green
- "A code works for 10 minutes" -> "30 minutes": 1 red (against TTL_MS in apps/worker/src/do/pairing.ts)
- the checks sentence -> "run a full load test of your place with a thousand players, translate your game into forty languages, and publish it to Roblox for you": 1 red (the tool names it must name; the no-load-test-or-publish rule); before the fix: green
- a new bold lead "You can pair a project with Roblox Studio." under "What works today": 3 red (no verifier; the list rule: no Studio capability as working today while the plugin cannot be had)
- "Paid plans are not for sale." -> "...and a refund is automatic.": 2 red (a lead with no verifier, and the old verifier with no line)

### 5.3 the consent promise and the plugin labels (tests/how-it-works.test.mjs, tests/lib/plugin-promises.mjs)
- how-it-works.astro: "Edits stay off until you allow them for that connection." -> "Edits are on from the moment you pair, with nothing to allow." (rebuilt): 1 red (the pairing-step test); before the fix the same mutation left 11 site test files green
- apps/studpilot-plugin/src/init.server.luau: `local allowEdits = false` -> `= true` (restored after): 2 red (how-it-works pairing test and the blog claim "New customers cannot build in Studio.")
- how-it-works.astro step 2 `status` -> always 'live' (rebuilt): 1 red ("a step is labelled Works today only when it holds for someone who can get the plugin")

### 5.4 no-fake-output over every built route (tests/no-fake-output.test.mjs); each mutation rebuilt, then restored and rebuilt
- pricing.astro: a remote `<img src="https://example.com/finished-shop.png" alt="A finished shop screen the model built">`: 2 red; before the fix: no-fake-output, asset-wall, hermetic-build, links-resolve, beta-labels and pricing-config all green
- blog post Markdown `![A finished shop](https://example.com/shop.png)`: 2 red; before the fix: green
- docs/faq.astro: a recorded file (/assets/screens/app-idle.webp) as a bare <img> outside a screenshot figure: 2 red
- screens.json: the sha256 of the hero set to zeros: 2 red (record vs bytes; the page's picture vs its record)
- index.astro: the hero without `priority`: 1 red (eager + fetchpriority=high)
- catalog.astro: the slot replaced by an empty frame carrying "A real screenshot goes here.": 2 red

### 5.5 the capture script itself (scripts/m2-capture-ui.mjs)
- the idle capture pointed at the app's mock conversation (`?mock=1` without `&empty=1`): exit 1, "app-idle: the frame is not an idle or empty state, so it is not captured. N conversation element(s) ..." ; nothing written, screens.json and the webp files unchanged
- the empty workspace without the access stub (earlier in development): the first run failed on "2 conversation element(s): <div.flex.size-full> ([role="log"] > *)" (a selector that judged the app's empty state a turn), fixed by naming the article; and the page said "We could not check your access" until the /api/shared stub, a failure text the guard now refuses

### 5.6 the share surfaces (tests/share-surfaces.test.mjs, scripts/check-copy.mjs reads og.html and site.webmanifest, scripts/lib/copy-shapes.mjs)
- og.html headline put back to "Describe a Roblox game. StudPilot builds it.": 1 red in share-surfaces; and tests/check-copy.test.mjs (old h1 in the fixture's og.html) exits 1 naming describe-it-then-builds-it and apps/site/brand/og.html
- og.html footer "Works inside Roblox Studio": 1 red (STUDIO_BUILD_CLAIMS while the plugin cannot be had)
- site.webmanifest description put back to the old sentence: 1 red; and check-copy test names apps/site/public/site.webmanifest
- index.astro description (the not-live branch) -> "...it builds it in your own Studio.": 1 red (the description tags of every page are read)
- Base.astro og:image:alt -> the old sentences: 1 red
- before these: check-copy printed CLEAN over 330 files and the old card and manifest were in the tree untouched (they were not in its denominator)

### 5.7 packages/design: the three tests that read the deleted Landing layout (brand.test.mjs, tokens.test.mjs, flat.test.mjs)
- a second document layout apps/site/src/layouts/Tmp.astro (`<html style="background:#fff">`, no tokens import, no icon links; removed after): 3 red, one in each file (tokens: does not import the tokens; flat: an inline colour on <html>; brand: no icon links)
- Base.astro without its tokens import: 1 red in tokens.test.mjs
- before: packages/design `node --test` was 162 pass / 3 fail on the branch; now 165 / 0

### 5.8 the four claim guards read every source of words (tests/lib/site-sources.mjs, tests/copy-sources.test.mjs)
- a refund promise ("If a run fails, the Credits are refunded in full, even when you kept the changes it applied") added to the blog post: 2 red (credit-refund-claims); before: green (confirmed in the first review)
- "The workspace counts the Credits spent step by step while it runs" added to src/data/pieces.ts: 1 red (no-live-cost-claim); before: green
- "There is no public API." added to the post: 1 red (api-surface-claim); "StudPilot warns you before starting work it estimates will be expensive" added to pieces.ts: 1 red (pre-run-cost-warning); before: green
- OBSERVED, NOT CHANGED: the SDK branch of api-surface-claim.test.mjs is `if (sdk.private === true)` and packages/sdk/package.json has no "private" key any more, so "Install the StudPilot SDK" in pieces.ts passes: that branch is vacuous on main today (it needs the owner's answer on whether the SDK is published)

### 5.9 hermetic-build follows imports (tests/hermetic-build.test.mjs)
- src/components/probe-net.ts (`await fetch('data:text/plain,hi')`) imported from src/pages/404.astro's frontmatter (rebuilt: the build is clean): 1 red; before the fix hermetic-build stayed 7/7 green
- CONTROL: the same module imported only from a <script> block in 404.astro (a browser script): 0 red

### 5.10 a11y and layout items (theme-on-every-route.test.mjs, status-live-region.test.mjs, tests/e2e/landing.spec.ts)
- Base.astro rewrites the theme toggle's aria-label again: 1 red; Nav.astro toggle named "Switch to light theme": 1 red; menu button named "Open the menu": 1 red (all in the new "one name and state only" test)
- status.astro: aria-live="polite" back on #status-card: 1 red; the countdown writing to the announcer: 1 red
- status.astro text box `min-height` removed (rebuilt): the Playwright spec fails "/status shifted by 0.018064079634848206 when its first check answered" (the reviewer's 0.163 at 390px was not reproduced: with the health answer delayed past first paint it is 0.018 here, from the same four sources: known, status-meta, btn status-refresh, status-orb; the spec asserts the strict property, nothing moves); with the fix: 0

### 5.11 the landing budget rebased down (scripts/check-landing-budget.mjs: 20,000 -> 12,000 markup+CSS gzip, 36,000 -> 3,500 script, 40,000 -> 31,000 image; measured 10,461 / 3,007 / 26,916)
- 7.9 KB of random text added to index.astro (rebuilt): the checker exits 1 on the markup line (it passed with 9.5 KB of growth before); restored

### 5.12 the glue (rendered-text-joins.test.mjs; astro.config.mjs compressHTML: true, the Astro 7 default is 'jsx')
- the `compressHTML: true` line deleted (rebuilt): 2 red (62 glued inline tags on 13 pages; the config assertion); with the line: 0 on every page, the legal pages included

### 5.13 the derived docs navigation (tests/docs-nav-derived.test.mjs) and the docs claims (tests/docs-claims.test.mjs)
- DocsLayout.astro `docsPages(sources)` -> `.filter((p) => p.path !== '/docs/faq')` (rebuilt): 2 red (sidebar is not the docs files; the index differs from the sidebar)
- DocsLayout.astro a typed two-page list back in place of the derivation: 2 red
- getting-started: "A pairing lasts until Studio closes. After a restart, enter a new code." -> "A pairing survives restarts: the plugin remembers the session ...": 1 red (the old Connect page's false sentence; the plugin says the opposite)
- plugin page: the plugin's "cannot publish, upload assets or execute arbitrary received Luau" -> "can publish your game and upload assets": 1 red
- getting-started "expires after 10 minutes" -> "30 minutes": 1 red (pairing.ts TTL_MS); consent sentence -> "Edits are on from the moment you pair, with nothing to allow.": 1 red

### 5.14 titles (tests/titles.test.mjs) and the docs redirects (tests/nav-and-routes.test.mjs)
- blog/index.astro title back to "Blog (beta)": 1 red; status.astro back to "Status — StudPilot": 1 red (the legal pages are a named, shrink-only debt)
- astro.config.mjs without the /docs/connect redirect (rebuilt): 1 red in nav-and-routes (the web app still links /docs/connect)

### 5.15 landmarks (tests/landmarks-unique.test.mjs)
- Footer.astro docs nav back to aria-label="Documentation" (rebuilt): 1 red (two navigation landmarks named "Documentation" on every docs page)

### 5.16 the plugin caveat sweep (tests/plugin-honesty.test.mjs)
- index.astro: the hero's flag-derived plugin line removed (rebuilt): 1 red (the hero makes its claim and the caveat is somewhere else on the page)
- catalog.astro "Where to ask" forced to the live wording (rebuilt): 1 red (the catalog talks about pairing the plugin and carries no caveat)
- index.astro meta description forced to the live wording (rebuilt): 1 red (what a search result shows leaves the caveat out)

### 5.17 the pricing layout (tests/pricing-config.test.mjs, tests/unpurchasable-and-shared-cap.test.mjs, tests/credit-purchase-claim.test.mjs); each rebuilt, then restored
- the "Price per typical build" row reading Max's builds for every paid column: 1 red ("EACH PLAN COLUMN carries its own price, allowance and build count ... and no other plan's")
- the shared-pool paragraph removed from the first panel: 1 red (the shared-cap sentence must come before the comparison table; it is still in the limits grid at the end, which is not enough)
- an unfiltered render of a plan's `highlights` ("Buy credits when you need more"): 1 red (the page advertises a purchase channel while none exists)

### 5.18 no page links to a redirect stub (tests/nav-and-routes.test.mjs)
- how-it-works.astro linking `/docs/connect` ("Connect a project") again (rebuilt): 1 red; the first pass's page did exactly this after the route was folded into Getting started


## 6. Fix cycle 2 (2026-10-05): the mutations

The second review (23 findings) asked for every new or restated guard to be shown red. Each entry below is one planted break, made in a throw-away copy of the clone (`cp -cR`, so the
clone itself was never mutated), with the occurrence count of the replaced text asserted to be exactly one; the site was rebuilt with the break in place, the named test file was run, and
the failures are quoted (the first message of each). The file was then restored from the clone, the site rebuilt, and the same file run again: every restored run is green, with the counts
given. "BEFORE" is the same break run against the previous version of the guard (the file as it stood at `5e12cef3`, the head of fix cycle 1, copied into the probe), which is what the
reviewers measured: the break passed. The helper that ran them is throw-away and lives outside the repository.

### 6.1 Roblox sign-in (finding 0; tests/roblox-signin-limit.test.mjs, how-it-works, blog-post)
- how-it-works step 1 offers "or sign in with Roblox" in the paragraph with no limit: 1 red ("/how-it-works/: "Make an account with your email and a password, or sign in with Roblox. You do not need a card." offers it with no limit in the same paragraph"); restored 5/5 (+1 skipped by design) green
- the landing rail step 01 back to "Use your email, or sign in with Roblox.": 1 red (named by route and sentence); restored green
- the post's lead back to "You can sign in with your email, or with Roblox." under What works today: 3 red (two in blog-post: a lead with no verifier, no verifier for it; one in roblox-signin-limit: the blog block offers it with no limit); restored 12/12
- `Continue with Roblox.` added to /docs/billing: 1 red ("/docs/billing/: "Continue with Roblox." offers it with no limit in the same paragraph"); restored green
- `ROBLOX_LIMIT` cut to "Sign in with Roblox is in a limited test." (half the limit): 3 red (how-it-works step 1, every page, the one-source test); restored 14/14
- `ROBLOX_OAUTH_REVIEWED` flipped to true in packages/shared: 2 red (the post, which Markdown cannot derive, still says limited test: the blog verifier says "move the line to What works today", and the opposite-lie test names the post's sentence); restored 21/21
- how-it-works step 1 `status` forced to `'live'`: 1 red ("the label of step 1 does not follow ROBLOX_OAUTH_REVIEWED"); restored 9/9
- the scanner and the block reader are proved on fixtures first (the three sentences the first rebuild shipped are offers; the limit in the NEXT paragraph does not satisfy the offer; the title and the description are read)

### 6.2 The hero screenshot (finding 1; tests/no-fake-output.test.mjs)
- screens.json: the hero record's caption without "No Studio is connected": 1 red ("app-idle: the caption does not say that no Studio is connected, and the picture shows the "2 selected" chip"); restored 14/14
- the phone record's alt without it: 1 red (app-idle-phone: the alt ...); restored green
- the capture was re-run at `ab32175d`: the pictures are byte-identical (the hashes did not change); the records' commit, alt and caption did

### 6.3 The quality bar (finding 2; tests/quality-bar-claims.test.mjs, blog-post)
- index.astro: "A fresh blind critic sees only the request and screenshots of the result" back: 1 red ("/: ... says the critic does it, and none is built"); restored 3/3
- catalog.astro: "a blind critic rates it 8 or better" with the modal "will" elsewhere in the sentence ("A piece will go in this catalog only when ...: a blind critic rates it"): 1 red (this is the break that showed the first version of the scanner exempted a whole sentence on one "will"; it now reads the modal on the critic's own clause); restored green
- the post: "No piece has passed it yet." back: 2 red (the blog verifier, and "implies pieces were rated"); restored 10/10
- index.astro: the "Target" label removed from the first row of the bar: 1 red ("a row of the bar shows its figure with no "Target""); restored green
- a critic harness appears (`scripts/eval/run.mjs`): 1 red in blog-post ("a critic harness (scripts/eval) is in the repository: re-read what the post says about the critic"); restored 7/7

### 6.4 Undecided per-day figures (finding 3; tests/undecided-figures.test.mjs, pricing-config, quota-ceiling-copy)
- pricing.astro: the paid cells of "Credits a day" print the config's 20 and 30 again: 3 red (pricing-config twice: "Pro: its Credits a day cell is not "Not decided yet""; undecided-figures: "the "Credits a day" row says "20" for Pro"); restored 22/22 (+1 skipped by design)
- pricing.astro: the paid "full days" line back ("Pro: 20 a day against 100 a month is 5 full days"): 1 red ("gives a paid plan's per-day figure (20) as a fact"); restored green
- credits-and-limits.astro: "Pro plan: 100 Credits a month · up to 20 a day" back: 1 red; the "full days" sentence for a paid plan back: 1 red; restored green
- before: the first version of the pricing guards pinned the 20 and 30 to the config (`day = { Free: '5', Pro: '20', Max: '30' }`), so the printed figures were the guarded ones

### 6.5 The pricing lede (finding 4; pricing-config)
- the lede back to "they differ only in how many Credits they include": 1 red ("the lede says the plans differ only in Credits"); restored 19/19
- the lede keeps "differ in how many Credits they include" but drops support while the table still says "answered before Free": 1 red ("the table gives paid plans priority support and the lede does not mention support"); restored green

### 6.6 support@studpilot.app (finding 5)
- No mutation: the finding is answered by evidence, not by code (DECISIONS.md 12.12): Email Routing forwarding is live, so the address and the line stay.

### 6.7 The web app's docs links (finding 6; tests/nav-and-routes.test.mjs; apps/web tests/contextual-help.test.mjs)
- apps/web empty-state-model.ts: the `waitingForStudio` link back to `/docs/connect`: 1 red in the site ("the app links a docs route that is redirected or gone"); and the same change run in apps/web: 2 red, the two tests that were red on the branch ("the empty states that mean "go and connect Studio" say where that is written", "every help link declared on an empty state names a page on disk": "waitingForStudio links to /docs/connect, which is not on disk"); restored: site 8/8, apps/web 8/8
- `cd apps/web && node --test`: 2537 tests, 2537 pass, 0 fail with the fix (it was 2535 and 2 fail on the branch)

### 6.8 plugin-honesty (finding 7)
- docs/billing.astro: "Every request is applied to your place through the Studio plugin, so you can start building today." with no caveat on the page: 1 red ("/docs/billing/: "Every request is applied ..." and no caveat anywhere on the page"); restored 4/4. BEFORE (`5e12cef3`'s short verb list): 0 failing of 3, which is the finding
- docs/credits-and-limits.astro: the flag-derived caveat removed: 1 red ("... "A run that changed your place keeps its Credits ..." and no caveat anywhere on the page"); docs/troubleshooting.astro: the same: 1 red; restored green
- the scanner is proved first on the finding's mutation sentence, the /terms sentence, "pairing Studio" and a plugin and a pair far apart (all talk), on a menu label (not talk) and on the page's meta description (read)

### 6.9 No instruction to build or load the legacy plugin (finding 8; tests/legacy-plugin-instructions.test.mjs)
- docs/plugin.astro: "Run rojo build apps/plugin/default.project.json and load the result as a local plugin.": 2 red (the built page and the source: "instructs a reader toward apps/plugin (rojo-build-legacy, legacy-project-file, build-the-legacy)"); restored 4/4
- docs/plugin.astro: "download the studpilot-studio-pr-unverified artifact from CI": 2 red ("names the unverified CI artifact studpilot-studio-pr-unverified", the name read from ci.yml); restored green
- src/data/pieces.ts: a string "build apps/plugin with Rojo and load it in Studio": 1 red (the source of words; "build-the-legacy, legacy-then-load"); restored green
- BEFORE: the first mutation with the new file removed, against the other 387 tests of the site suite: 0 failing (the finding: "355 pass, 0 fail")

### 6.10 The blog post, every block (finding 9; blog-post)
- an unbolded paragraph under What works today ("StudPilot builds the piece into your Studio place, runs every check, and shows you a finished game."): 2 red ("has no bold lead, so nothing checks it against the repository"; "claims a Studio capability"); restored 7/7
- a paragraph glued straight under the heading with no blank line: 2 red (read from the first parser's code, not run: it took a block that holds a heading line for a heading and dropped everything else in it); restored green
- an unbolded sentence added to the closing section: 1 red; a new heading "## Coming soon" with a claim under it: 3 red ("stands under the heading "Coming soon", which this test does not know"); restored green

### 6.11 Landmarks (finding 10; landmarks-unique)
- catalog.astro: the "Where to ask" section `aria-label="The four kinds of pieces"` (two region landmarks, one name): 1 red ("/catalog/: two region landmarks named "The four kinds of pieces" (<section>)"); restored 2/2. BEFORE: 0 failing of 2
- `aria-labelledby` is resolved to the heading text: proved on a fixture (two sections pointing at headings with the same words, `How  it works` and `How it works`)

### 6.12 Nothing hides content behind a class a script adds (finding 11; reveal-cannot-hide-content)
- the finding's mutation (an inline script in Base.astro adds `js-ready`, and `html:not(.js-ready) main { opacity: 0; }` in site.css): 2 red (the shape scan: "html:not(.js-ready) main: hidden unless a class or attribute is added (a negated gate)"; the browser: "/ (scripting off): "Beta" in span.badge: opacity 0.00"); restored 7/7. BEFORE (the first restatement): 0 failing of 4
- the browser measure alone: `main { opacity: 0; }` (no gate for the scanner to see): 1 red (nothing drawn, in all three scenarios); restored green
- a positive gate: `.js-ready main { opacity: 0 }` with a script adding the class: 2 red (".js-ready main: hidden behind .js-ready, which no markup carries"; and the page invisible with the observer that never fires); restored green

### 6.13 The status page's live region (finding 14; status-live-region)
- role="alert" on #status-card: 1 red ("#status-next is inside a live region, so every rewrite of it is announced"); restored 3/3. BEFORE: 0 failing of 2
- the poll writes through `announce.append(...)` (outside the countdown the first guard inspected): 1 red ("the announcer is written in 2 places (announce.textContent = | announce.append()"); restored green. BEFORE: 0 failing of 2

### 6.14 The vacuity floors (finding 15; contrast, packages/design focus)
- contrast: 151 text/ground pairs are derived per theme (measured by setting the floor above it and reading the failure). The pairing blind to the pricing page's `<style>` block derives 121, which passed the old floor of 120: now 1 red ("dark: only 121 text/ground pairs were derived (151 were measured when this floor was set)"); the floor is 147; restored 22/22
- focus: 148 stylesheets and 100 focus rules are read. The walk blind to the pages and layouts of apps/site reads 126, which passed the old floor of 120: now 1 red ("only 126 stylesheets read (148 were read when this floor was set)"); the floor is 145; restored 8/8. The focus-rule floor is 100 against 100 measured and was not changed

### 6.15 Stale test comments (finding 16; old-layouts-gone)
- the "NOT COVERED: the docs Terminal demo (components/picks-docs/Terminal.astro) ..." line put back in reveal-cannot-hide-content: 1 red ("reveal-cannot-hide-content.test.mjs:3 names components/picks-docs/Terminal.astro and does not say it is gone"); restored 8/8. (A first version of the scan accepted the words "old" and "was" anywhere within two lines and was green on this break; it was tightened.)

### 6.16 Layout and accessibility (findings 17 to 22; pages-render-clean, layout-measures)
- DocsLayout.astro: `overflow: hidden` back on `.docs__nav`: 1 red in pages-render-clean ("390px /docs/: details.docs__nav (overflow hidden/hidden) cuts the ring of summary"); restored 11/11. BEFORE (the first pages-render-clean, ring style at 1440 px only): 0 failing of 9
- pricing.astro: the phone block back to two columns for three plans: 1 red ("390px: Price: Pro is not under Free (Free/Pro/Max)"); the footer cells' own hairline back: 1 red ("390px: Get it: a plan's cell carries its own hairline"); the buttons' minimum height removed: 1 red ("520px: Get it: the buttons are 36 and 54 and 54px tall"); restored 6/6
- docs/index.astro: the summary run on after the title: 1 red ("1440px: "Getting started" has text after it that is not in its own element"); status.astro: the orb centred on the whole text box: 1 red ("390px: the orb is -8px from the centre of its headline"); DocsLayout `.docs__main` back to 72ch: 1 red ("/docs/: the footer rule ends at 1169.6, the prose at 1149.5"); pricing `.now__stats` back to `align-self: start`: 1 red ("1440px: the panel sits 0px below the top of the copy and 219px above its end"); each restored green
- each measure is also proved first on a page built to show its defect (layout-measures: the phone-table fixture, the orb injection)

### 6.17 The ledger rows that cited the placeholder `R..` (finding 13; the rows cite these)
- ScreenSlot.astro: `.slot__frame` given `backdrop-filter: blur(8px)`: 1 red in living-background ("the slot is frosted or casts a shadow; surfaces here are flat"); restored 5/5
- getting-started.astro: the unavailability callout removed from ahead of the connection steps: 1 red in onboarding-recovery ("the plugin cannot be installed, and the connect page does not say so"); restored 6/6
- Footer.astro: a second paragraph under the wordmark that reads exactly "StudPilot": 1 red in one-operator ("a footer paragraph reads exactly "StudPilot", directly under the "StudPilot" wordmark"); the copyright line naming "Acme Labs": 2 red (one-operator: "the copyright line names "Acme Labs", and the operator is StudPilot"; nav-and-routes: "the footer does not name the operator in its copyright line"); the mailto link removed: 1 red in nav-and-routes ("the footer does not link to mailto:support@studpilot.app"); each restored green
- catalog.astro: "You can ask an StudPilot for any of these": 1 red in unpurchasable-and-shared-cap ("catalog/index.html says "an StudPilot""); restored 7/7
- docs/billing.astro: `order={4}` removed: 1 red in the root tests/billing-help ("the billing page names no place in the order"); restored (root docs-search and billing-help) 14/14

### 6.18 Green after fix cycle 2 (the same commands, at the head of the branch)

| command | result |
|---|---|
| `pnpm --filter @studpilot/site build` | 19 pages built (and 7 redirect stubs), 0 errors |
| `cd apps/site && node --test tests/*.test.mjs` | 391 tests, 389 pass, 0 fail, 2 skipped (the two "opposite lie" tests, skipped by design while `ROBLOX_OAUTH_REVIEWED` and `PAID_DAILY_CAPS_DECIDED` are false); 355 before this cycle |
| `cd packages/design && node --test` | 165 tests, 165 pass, 0 fail |
| `cd apps/web && node --test` | 2537 tests, 2537 pass, 0 fail (it was 2535 and 2 fail on the branch before the finding-6 fix) |
| `node --test tests/*.test.mjs` at the root | 684 tests, 666 pass, 2 fail, 16 skipped: the two known `tests/check-pixels.test.mjs` cases (lines 78 and 108), which fail because the clone sits in a scratchpad, identical on main |
| `node scripts/check-landing-budget.mjs` | passes, nothing raised: markup and stylesheets 10,667 B gzip of 12,000; inline JavaScript 3,007 B of 3,500; images 26,916 B of 31,000 |
| `node scripts/check-site-links.mjs` | 711 internal links across 26 pages, all resolve |
| `node scripts/check-site-semantics.mjs` | 19 pages and 7 redirect stubs sound (one h1, landmarks) |
| `check-copy.mjs`, `check-offer.mjs`, `check-credit-figures.mjs` | clean (COPY CLEAN; OFFER COHERENT, 4 plans, 379 copy files; credit figures agree) |
| `node scripts/check-old-names.mjs` | clean (0 violations) |
| `node scripts/make-brand-assets.mjs --check` | BRAND ASSETS OK, 12 assets current |
| `pnpm --filter @studpilot/site typecheck`; `cd packages/shared && pnpm typecheck`; `cd apps/web && pnpm typecheck` | 0 errors |
| `E2E_PORT=4326 pnpm exec playwright test` (desktop, laptop, phone) | 345 specs pass (section 4 says 387 for the first pass; 345 is what the specs of this tree number) |
| Lighthouse | not run in this cycle (the deployed site is measured later) |

