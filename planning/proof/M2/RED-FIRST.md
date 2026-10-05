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
