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

## The red output, test by test

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

