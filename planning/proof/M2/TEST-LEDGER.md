# M2 step 2.2: the test ledger (2026-10-05)

Every site test that pinned an old page is accounted for here. The rule: restate to the property, never weaken; delete a test only when the
thing it pinned was deliberately deleted (handoff 2.2: the old layouts go); every restated or new guard has red-first proof (a planted break,
the guard goes red, the break is restored, the guard is green again). The proof column names the mutation (`G..` the five guards written
first, `N..` the three written for the new pages, `R..` the restatements); each is a row of the table in RED-FIRST.md section 2.

Counts, measured: the site suite was **381 tests, 0 failing** before this step and is **327 tests, 0 failing** after it. The root suite
was 661 tests, 2 failing (the known check-pixels cases) before and is unchanged after; the web suite 2,537 and unchanged.

Columns: `file | old test | fate | proof`. "Deleted" is only ever used with the subject that was deliberately deleted, named in the row.

| file | old test | fate | proof |
|---|---|---|---|
| `capability-demos-run` | the harness runs the real script and every stage is wired, so nothing below is vacuous | **deleted**: the old landing's three demo stages (read order, critique, Luau) and their canvases: the page is deleted (handoff 2.2); the critique stage was a drawn "sample critique" (no fake output) | n/a (subject deleted) |
| `capability-demos-run` | reading a node shows a friendly step and the write gate opens on the third read | **deleted**: the old landing's three demo stages (read order, critique, Luau) and their canvases: the page is deleted (handoff 2.2); the critique stage was a drawn "sample critique" (no fake output) | n/a (subject deleted) |
| `capability-demos-run` | selecting a defect turns exactly one marker on, from either the render or the list | **deleted**: the old landing's three demo stages (read order, critique, Luau) and their canvases: the page is deleted (handoff 2.2); the critique stage was a drawn "sample critique" (no fake output) | n/a (subject deleted) |
| `capability-demos-run` | the third ask produces the refusal, and it is marked as one | **deleted**: the old landing's three demo stages (read order, critique, Luau) and their canvases: the page is deleted (handoff 2.2); the critique stage was a drawn "sample critique" (no fake output) | n/a (subject deleted) |
| `capability-demos-run` | exactly one stage is shown at a time, and a tab click or an arrow key moves it | **deleted**: the old landing's three demo stages (read order, critique, Luau) and their canvases: the page is deleted (handoff 2.2); the critique stage was a drawn "sample critique" (no fake output) | n/a (subject deleted) |
| `capability-demos-run` | the capability stages draw on no animation-frame loop, and the page script draws nothing | **deleted**: the old landing's three demo stages (read order, critique, Luau) and their canvases: the page is deleted (handoff 2.2); the critique stage was a drawn "sample critique" (no fake output) | n/a (subject deleted) |
| `capability-demos-run` | every canvas on the front page is a decoration that stops for reduced motion, sleeps off screen, and holds its box | **deleted**: the old landing's three demo stages (read order, critique, Luau) and their canvases: the page is deleted (handoff 2.2); the critique stage was a drawn "sample critique" (no fake output) | n/a (subject deleted) |
| `capability-demos-run` | one stage cannot take the others down with it | **deleted**: the old landing's three demo stages (read order, critique, Luau) and their canvases: the page is deleted (handoff 2.2); the critique stage was a drawn "sample critique" (no fake output) | n/a (subject deleted) |
| `capability-demos-run` | every hook this harness serves is a hook the page actually renders | **deleted**: the old landing's three demo stages (read order, critique, Luau) and their canvases: the page is deleted (handoff 2.2); the critique stage was a drawn "sample critique" (no fake output) | n/a (subject deleted) |
| `demo-stages-fit` | THE BUILD AND THE BROWSER ARE BOTH HERE, or this file has measured nothing | **deleted**: the same three demo stages: layout of stages that no longer exist | n/a (subject deleted) |
| `demo-stages-fit` | no capability stage is wider than the grid that holds it, at any supported width | **deleted**: the same three demo stages: layout of stages that no longer exist | n/a (subject deleted) |
| `demo-stages-fit` | the three defect markers stay separable by a finger, and stay on the render | **deleted**: the same three demo stages: layout of stages that no longer exist | n/a (subject deleted) |
| `demo-stages-fit` | every ask in the Luau stage is inside its own panel | **deleted**: the same three demo stages: layout of stages that no longer exist | n/a (subject deleted) |
| `built-screen-is-evidence` | THERE IS A ROW TO CHECK AGAINST — a manifest without this screen makes every check below vacuous | **deleted**: BuiltScreen, the "One screen, as the model wrote it" band and its recorded svg: deleted (no fake output); the picture is not on the site | n/a (subject deleted) |
| `built-screen-is-evidence` | every figure on the band is the number its manifest field holds | **deleted**: BuiltScreen, the "One screen, as the model wrote it" band and its recorded svg: deleted (no fake output); the picture is not on the site | n/a (subject deleted) |
| `built-screen-is-evidence` | every caveat on the band is verbatim in the manifest field it names | **deleted**: BuiltScreen, the "One screen, as the model wrote it" band and its recorded svg: deleted (no fake output); the picture is not on the site | n/a (subject deleted) |
| `built-screen-is-evidence` | no figure and no caveat is typed into the markup, so the page cannot drift from the data | **deleted**: BuiltScreen, the "One screen, as the model wrote it" band and its recorded svg: deleted (no fake output); the picture is not on the site | n/a (subject deleted) |
| `built-screen-is-evidence` | the band renders every declared figure and caveat, so none can be dropped quietly | **deleted**: BuiltScreen, the "One screen, as the model wrote it" band and its recorded svg: deleted (no fake output); the picture is not on the site | n/a (subject deleted) |
| `built-screen-is-evidence` | the served picture is the evidence file, byte for byte | **deleted**: BuiltScreen, the "One screen, as the model wrote it" band and its recorded svg: deleted (no fake output); the picture is not on the site | n/a (subject deleted) |
| `built-screen-is-evidence` | the screen on the front page is one the script leaves on screen, not one forced open | **deleted**: BuiltScreen, the "One screen, as the model wrote it" band and its recorded svg: deleted (no fake output); the picture is not on the site | n/a (subject deleted) |
| `built-screen-is-evidence` | the manifest names the day the caption claims, so the two cannot drift apart | **deleted**: BuiltScreen, the "One screen, as the model wrote it" band and its recorded svg: deleted (no fake output); the picture is not on the site | n/a (subject deleted) |
| `built-screen-is-evidence` | the landing renders this band, and the gallery it opens is a route something publishes | **deleted**: BuiltScreen, the "One screen, as the model wrote it" band and its recorded svg: deleted (no fake output); the picture is not on the site | n/a (subject deleted) |
| `built-screen-pixels` | THE BUILD, THE BROWSER AND THE DECODER ARE ALL HERE, or this file has measured nothing | **deleted**: the same recorded model screen | n/a (subject deleted) |
| `built-screen-pixels` | nothing is painted over the render: its flat background is still its flat background | **deleted**: the same recorded model screen | n/a (subject deleted) |
| `proof-is-evidence` | THE BAND HAS QUOTES TO CHECK — an empty list would make every loop below vacuous | **deleted**: ConsentProof, the landing band quoting a recorded run and its capture: deleted; replaced by empty screenshot slots recorded in screens.json (held by no-fake-output) | n/a (subject deleted) |
| `proof-is-evidence` | every quoted string on the landing is verbatim in the file it names | **deleted**: ConsentProof, the landing band quoting a recorded run and its capture: deleted; replaced by empty screenshot slots recorded in screens.json (held by no-fake-output) | n/a (subject deleted) |
| `proof-is-evidence` | the plugin quotes come from the plugin and the transcript from the record | **deleted**: ConsentProof, the landing band quoting a recorded run and its capture: deleted; replaced by empty screenshot slots recorded in screens.json (held by no-fake-output) | n/a (subject deleted) |
| `proof-is-evidence` | no quoted sentence is typed into the markup, so the page cannot drift from the data | **deleted**: ConsentProof, the landing band quoting a recorded run and its capture: deleted; replaced by empty screenshot slots recorded in screens.json (held by no-fake-output) | n/a (subject deleted) |
| `proof-is-evidence` | the band renders every declared quote, so none can be dropped quietly | **deleted**: ConsentProof, the landing band quoting a recorded run and its capture: deleted; replaced by empty screenshot slots recorded in screens.json (held by no-fake-output) | n/a (subject deleted) |
| `proof-is-evidence` | the served capture is a crop of the evidence file, and that file still hashes to its pin | **deleted**: ConsentProof, the landing band quoting a recorded run and its capture: deleted; replaced by empty screenshot slots recorded in screens.json (held by no-fake-output) | n/a (subject deleted) |
| `proof-is-evidence` | every image on the landing is a declared capture — nothing undeclared, nothing remote | **deleted**: ConsentProof, the landing band quoting a recorded run and its capture: deleted; replaced by empty screenshot slots recorded in screens.json (held by no-fake-output) | n/a (subject deleted) |
| `proof-is-evidence` | the record names the day the capture claims, so the two cannot drift apart | **deleted**: ConsentProof, the landing band quoting a recorded run and its capture: deleted; replaced by empty screenshot slots recorded in screens.json (held by no-fake-output) | n/a (subject deleted) |
| `recorded-run-is-evidence` | every quote on the proof page is in the evidence file it names | **deleted**: /proof, the page of a recorded run: deleted, /proof redirects to /catalog | n/a (subject deleted) |
| `recorded-run-is-evidence` | each before/after number is inside the table row it is taken from | **deleted**: /proof, the page of a recorded run: deleted, /proof redirects to /catalog | n/a (subject deleted) |
| `recorded-run-is-evidence` | the page states the product name it is published under, and no old one | **deleted**: /proof, the page of a recorded run: deleted, /proof redirects to /catalog | n/a (subject deleted) |
| `recorded-run-is-evidence` | the guard has teeth | **deleted**: /proof, the page of a recorded run: deleted, /proof redirects to /catalog | n/a (subject deleted) |
| `models-page` | the build and the registry are both here, so nothing below is vacuous | deleted (the page it checked is gone; each re-homed test carries its own canary) |  |
| `models-page` | THE ENGINE IS THE REGISTRY'S: StudPilot, named from @studpilot/shared, on every plan | **re-homed** to `pages-render-clean.test.mjs`, derived for every route (not one page) | `pages-render-clean` names the registry's engine on /pricing; (no mutation) |
| `models-page` | NO RETIRED MODEL, TIER OR CREDIT RATE on /models or the landing (V3 G01) | **re-homed** to `pages-render-clean.test.mjs`, derived for every route (not one page) | `R37` red then green |
| `models-page` | NOTHING ON /models OR THE LANDING OFFERS A KEY OF YOUR OWN (D-VISION-1) | **re-homed** to `pages-render-clean.test.mjs`, derived for every route (not one page) | `R37` red then green |
| `models-page` | NOTHING ON /models SAYS THE PLUGIN CAN BE INSTALLED while the store is not live | **re-homed** to `pages-render-clean.test.mjs`, derived for every route (not one page) | `R38` red then green |
| `models-page` | no id repeats on /models (an inlined icon's gradient ids included) | **re-homed** to `pages-render-clean.test.mjs`, derived for every route (not one page) | `pages-render-clean` derives every page; (no mutation: identical to the old guard) |
| `models-page` | THE PAGE SPENDS NO COLOUR OF ITS OWN: tokens only, no status green, no violet, no focus override | **re-homed** to `pages-render-clean.test.mjs`, derived for every route (not one page) | `R39` red then green |
| `models-page` | NO HORIZONTAL OVERFLOW at 320, 390, 768 and 1440, on /models | **re-homed** to `pages-render-clean.test.mjs`, derived for every route (not one page) | `R35` red then green |
| `models-page` | EVERY WORD ON /models CLEARS 4.5:1 against what is behind it, dark and light | **re-homed** to `pages-render-clean.test.mjs`, derived for every route (not one page) | `R34` red then green |
| `models-page` | THE ONE FOCUS RING: a focused control on /models draws 2px of the blue accent | **re-homed** to `pages-render-clean.test.mjs`, derived for every route (not one page) | `R36` red then green |
| `picks-landing` | every pick of the landing lane is accounted for by a mount | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | ${mount.name} is mounted in ${mount.file.join('/')} (${mount.ids.join(', ')}) | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | the Nav and Footer that carry picks are on the home page | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | Scramble text runs on the real navigation links | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | each pick component starts its own behaviour, so a mount is never an inert shell | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | removing a mount turns this file red (the checker is not vacuous) | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | no pick sheet brings in a glow, a gradient fill, violet, a hidden cursor or green | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | a sheet that animates or moves something has a reduced-motion answer | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | NoiseField ${mode}: draws while on screen, stops off screen and in a hidden tab | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | NoiseField ${mode}: under reduced motion it is one still picture, and flipping the setting stops it | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | NoiseField never sizes its own box, so it cannot shift the layout | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | Ticker: runs only on screen, copies are hidden from readers and the tab order | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | Ticker: keyboard focus stops a row, and a pressed chip is typed into the composer | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | Ticker: under reduced motion it is a still list, with no copies and no frames | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | ParticleWord: sleeps until pointed at, and falls asleep again once every particle is home | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | ParticleWord: under reduced motion the pointer moves nothing | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | BeamFlow: paused until on screen, running while seen, paused again when scrolled past | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | DeviceFrame: tilts in as it arrives and rests flat; under reduced motion it is always flat | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | Scramble: the label keeps its width and its name while scrambling, and does nothing under reduced motion | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-landing` | (loop) `${mount.name} is mounted in ${mount.file}` ×13 and the Marquee/Ticker/NoiseField/ParticleWord/BeamFlow/DeviceFrame/Scramble behaviour tests | **deleted**: the owner's picked landing components (NoiseField, PointerRim, Marquee, BeamFlow, DeviceFrame, ArrowLink, CtaButton, ParticleWord, scramble): all deleted by the rebuild. Their generic properties (nothing loops past reduced motion, no glow or gradient) are held site-wide by animation-actually-wins and living-background | n/a (subject deleted) |
| `picks-pricing-docs` | `${id} is mounted on /pricing through ShinyButton \| Spotlight \| BeamBorder \| BuildEstimator \| PriceSwitch` ×7 (the seven pricing picks) | **deleted**: ShinyButton, Spotlight, BeamBorder, BuildEstimator, PriceSwitch and rolling-number are deleted (DECISIONS section 12) | n/a (subject deleted) |
| `picks-pricing-docs` | every plan card is lit by the spotlight and every price can roll | **deleted** (Spotlight, rolling prices deleted) | n/a |
| `picks-pricing-docs` | both rolling-number users share one implementation | **deleted** (rolling-number deleted) | n/a |
| `picks-pricing-docs` | the estimator and the per-build price are derived, never typed | **restated**: the estimator half is deleted with BuildEstimator; the per-build price (still printed on each paid card) is held to the config, in source and in the built page | `R40` red then green |
| `picks-pricing-docs` | the other 6 tests (Accordion on /pricing and /docs/faq, 8 docs picks mounted through Accordion/Folder/Terminal/CodeTabs/DocsKit, DocsKit hooks, the terminal prints real lines, dependency-free kit) | kept, unchanged and green | n/a |
| `unpurchasable-and-shared-cap` | the 404 page nominates no canonical and is marked noindex | **restated**: `noindex` anywhere in the `<Base>` tag (it was pinned to a line of its own) | `R01` red then green |
| `undo-unit-claims` | changelog.astro does not sell one Ctrl+Z as a whole-run undo | **deleted** (the changelog page is deleted; /changelog redirects) | n/a |
| `undo-unit-claims` | index.astro / docs/faq / docs/troubleshooting / docs/getting-started name the checkpoint as the whole-run exit beside Ctrl+Z (4 tests) | **restated**: one test over every BUILT page that offers Ctrl+Z; it must include the three docs pages (the front page no longer mentions Ctrl+Z) | `R02` red then green |
| `undo-unit-claims` | (new test in the same file) no built page sells a batch or a run as one undo step | **new**: the file's false-unit shapes now run over every built page, not five source files | `R03` red then green |
| `undo-unit-claims` | index/faq/troubleshooting/getting-started do not sell one Ctrl+Z as a whole-run undo; the two "guard can fail" tests | kept, unchanged and green | n/a |
| `theme-on-every-route` | Landing.astro and Base.astro: no retired #080808; the meta has an id; the band is read from the stylesheet (6 tests over two layouts) | **restated** onto the one layout, Base.astro (Landing.astro is deleted) | `R04` red then green |
| `theme-on-every-route` | Landing applies a stored theme before first paint, like Base does; Landing ships a toggle handler and index.astro a button | **restated**: every BUILT page applies the stored theme, has a toggle in its header and a handler that stores the choice | `R05` red then green |
| `theme-on-every-route` | landing.css has a light ramp, not one ramp | **restated**: the token file has the light ramp and base.css, site.css and global.css declare no colour token of their own | `R06` red then green |
| `theme-on-every-route` | the other 5 tests (no expression between doctype and html; the address bar agrees with the page in every theme; the manifest carries no third black; two "guard can fail" tests) | kept (the Landing layout entry left their layout list), green | n/a |
| `reveal-cannot-hide-content` | 12 tests: the ordinary path, the stagger delay, GUARANTEE 1 to 4 (no script, reduced motion, no IntersectionObserver, an observer that never fires), the reveal is used, no reveal over a scroll-driven animation, every layout found, and the three per-layout loops | **restated** (4 tests). The reveal mechanism was deleted on purpose, so the four guarantees are guaranteed by construction; the property they protected, "no page hides content behind a class a script must add", is held over every stylesheet, every source file and every built page. NOT covered, said in the file: the docs Terminal demo's own observer | `R07` red then green; `R08` red then green |
| `contrast` | the derivations found real tokens (rules > 500) | **restated**: the vacuity floor is 300 (473 rules are read now; landing.css and the pick sheets were deleted). Every measured pair is still derived from the sheets | a floor: no mutation |
| `contrast` | dark and light: selected text clears 4.5:1 on every fill a control draws (canaries `.btn-primary .cta .composer-send .skip-link .fold__paper`) | **restated**: canaries are the three fills the sheets still draw; `.cta` and `.composer-send` were the old landing's controls | `R09` red then green |
| `contrast` | the other 20 tests | kept, unchanged and green (they now read the new sheets too) | n/a |
| `type-system` | the mono token reaches technical surfaces while friendly activity uses the body face (landing.css hooks) | **restated** onto the rebuilt sheets: example requests and step numbers take the mono token, inline code does, the body takes the body token | `R11` red then green |
| `cursor-reaches-every-control` | the built controls still ask for a pointer (`.btn`, `.composer-send`) | **restated**: `.btn` and the header icon buttons (`.composer-send` is deleted) | `R12` red then green |
| `interface-sound` | the walk read the site (Base.astro and Landing.astro among the files) | **restated**: Base, DocsLayout and LegalLayout | `R33` red then green |
| `rendered-typography` | the route list (/proof, /models, /changelog and 16 more, typed) used by the stranded-word, title and 404 tests | **restated**: routes are derived from dist (redirect stubs and /discord left out); a page added tomorrow is measured tomorrow | `R15` red then green; `R14` red then green |
| `rendered-typography` | the 404 label is on the page's axis (centre against centre) | **restated**: the 404 is left-aligned now, so the label's text starts where the heading starts | `R13` red then green |
| `rendered-selection` | every route in dist, and the pixel sample `span.cta__label span.shiny__label button.composer-send a.btn-primary:not(.shiny)` | **restated**: redirect stubs and /discord skipped (they navigate away mid-scan); the pixel sample is `a.btn-primary` and its large form | `R10` red then green |
| `links-resolve` | the exempt routes are published by something in this repository (/showcase via infra/deploy-showcase.mjs) | **restated**: the exemption is removed (the test itself demanded it once Astro builds /showcase); the four removed routes must be built as redirects and none exempt | `R16` red then green |
| `links-resolve` | every page reaches the showcase, the landing included | **restated**: every real page reaches the catalog (the evidence page now; the gallery is deleted) | `R17` red then green |
| `links-resolve` | the navigation reaches every section it names (`/#fragment` links) | **restated**: the navigation is identical on every page and any fragment in it names a landing id (the new nav has no fragments) | `R18` red then green |
| `counted-copy` | the landing contains no fabricated run, place, or result snapshot | **restated**: `<ol>` is no longer banned wholesale (the new front page has a four-step rail); a table, a `<dl>` and any ordered list but the rail still are; every other rule kept | `R19` red then green |
| `counted-copy` | the model cards are data-driven and do not revive the removed hand-counted sections | **deleted** (the "One engine" model-card section is deleted; the front page names no model) | n/a |
| `site-names-real-tools` | the build and the registry are both here (at least 5 tool-shaped words on the site) | **restated**: the rebuilt pages name no tool by design, so the canary proves the scanner sees a tool name in markup and in a script literal | `R20` red then green |
| `site-names-real-tools` | the guard has teeth (at least 5 real tool names on the site; the landing activity figure) | **restated**: registry canaries kept; the activity-figure assertions go with the figure; new: no tool name on /, /how-it-works, /catalog or /pricing | `R21` red then green |
| `site-names-real-tools` | every tool name printed on this site is one the worker registers | kept, unchanged | R20 also exercises it |
| `pricing-config` | THE CHANGELOG DOES NOT DEFINE A CREDIT AS 30 NEURONS | **restated**: no built page defines a Credit as 30 neurons, and /pricing says what a Credit is (the changelog is deleted) | `R22` red then green |
| `pricing-config` | the other 17 tests (every pricing figure and guard of the pricing slice) | kept, unchanged and green | n/a |
| `published-version-and-modes` | NO PAGE INVENTS A PLAN (docs and changelog.astro) | **restated and widened**: the docs and every built non-docs page; `Planned` joins the ordinary words because the wider scan met /pricing's "Planned tier" label | `R23` red then green |
| `published-version-and-modes` | NO PAGE, AND NO PLAN CARD, GIVES A PLAN A PLACE IN A QUEUE | **widened**: also every built non-docs page | `R24` red then green |
| `phone-drops-layers` | the landing stylesheet no longer carries the retired atmosphere layers (landing.css) | **restated**: every stylesheet and component style the site ships | `R25` red then green |
| `living-background` | the public layouts load the design tokens and do not import relaunch (Base and Landing) | **restated** onto Base | `R28` red then green |
| `living-background` | the hero is product UI rather than a decorative scene (the composer form) | **restated**: the hero holds the headline, the sign-up link and the screenshot slot, and no scenery, canvas or video | `R26` red then green |
| `living-background` | the composer is a flat panel on the shared radius (landing.css `.composer`) | **restated**: the screenshot slot is a flat `--surface` panel on `--r-lg` with no blur or shadow; the no-redeclared-token half is kept | `R27` red then green |
| `animation-actually-wins` | 8 tests: a cascade-resolution harness over landing.css and index.astro (every keyframe wins; the calm budget; the composer ghost; loops stop under reduced motion; no cinematic layer; tokens before base) | **restated** (4 tests): the marketing sheets and components declare no keyframe, no animation and no loop (stronger); the three keyframes that remain (docs Folder, Terminal, status orb) are held at the level of names (declared and used, loops stop under reduced motion). NOT carried over, said in the file: specificity and source-order resolution for those three | `R29` red then green; `R30` red then green; `R31` red then green |
| `asset-wall` | the landing has no asset banner, image wall, or remote image dependency (landing.css, consent-proof.ts) | **restated**: points at site.css and ScreenSlot, and at screens.json instead of consent-proof.ts; all rules kept | `R32` red then green |
| `asset-wall` | the landing derives visible model choices from the shared list | **deleted** (the model cards are deleted) | n/a |
| `asset-wall` | the other 4 tests (the licensed dataset and its provenance) | kept, unchanged and green | n/a |
| `web/app-ink-ramp` | the app and the public site use one ramp (at least two site document layouts) | **restated**: at least one, and it must be the layout that renders the shared header (Base.astro); each document layout still imports the tokens | `R41` red then green |
| `e2e landing.spec.ts` | 27 specs pinned to the old front page (composer, demo stages, model cards, the Product anchor, `.hero .lead`, `.availability`, ...) | **restated** (full rewrite, see the file header): proposition, first frame, no horizontal scroll, header on a phone and the menu, composition, no webfont/3D/canvas, nav destinations, no unoffered model, Credits capitalised, primary actions, honest plugin line, eight steps, focus ring, reduced motion, text enlargement, AA in both themes on four pages, pricing tables on a phone, /status, no dead link (routes derived). Deleted with their subject: the composer, ghost and focus-ring-of-the-composer specs, the demo-stage tabs, the model cards | ran green, see RED-FIRST.md section "e2e" |
| `e2e atmosphere-on-every-route.spec.ts` | canvas only in an owner pick's host; stillness, no rAF, nothing drawn off screen; one header and the accent; reduced motion shows every section; pricing side by side (routes typed, picks read from components/picks) | **restated**: no canvas anywhere, the rest kept, routes derived from dist; `owner-picks.ts` deleted with the picks | ran green, see RED-FIRST.md section "e2e" |

## New guards (no old test; each written before the pages where the page existed to guard)

| file | tests | what it holds | proof |
|---|---|---|---|
| `no-fake-output.test.mjs` | 9 | no drawn critique, no score shown as a result (only the stated bar, inside `data-quality-bar`), no "Generates real geometry", no "renders the scene", no BuiltScreen, every `<img>` on `/`, `/catalog`, `/how-it-works` has a record in `screens.json` whose hash matches, empty slots hold no `<img>` | red on the old build (RED-FIRST.md section 1); `G01` red then green; `G02` red then green; `G03` red then green; `G04` red then green |
| `beta-labels.test.mjs` | 6 | Beta in the content of `/`, `/pricing`, `/how-it-works` (not only the shared chrome); the owner's headline; the promise framed as the bar; no Stripe or checkout link; no Enterprise; paid buttons disabled | red on the old build; `G05` red then green; `G06` red then green; `G07` red then green; `G08` red then green |
| `hermetic-build.test.mjs` | 7 | no build-time network call, `billing-probe.ts` gone, no workers.dev, canonical site and robots, sitemap and canonicals on studpilot.app | red on the old build; `G09` red then green; `G10` red then green; `G11` red then green |
| `old-layouts-gone.test.mjs` | 5 | Landing and every deleted component are gone and nothing imports them; the layouts folder holds Base, DocsLayout, LegalLayout | red on the old build; `G12` red then green; `G13` red then green |
| `nav-and-routes.test.mjs` | 6 | the nav and footer are derived from the built HTML and every link resolves; the removed routes are redirects to the right targets; the operator line stays | red on the old build; `G14` red then green; `G15` red then green; `G16` red then green; `G17` red then green |
| `catalog-examples.test.mjs` | 4 | every example request is a line of the frozen dev test set, two or three per kind, labelled as requests, never beside a result | `N01` red then green; `N02` red then green |
| `how-it-works.test.mjs` | 7 | eight steps, three labels; the block engine is "Being built"; Google and Discord only as coming; no vision; the question step and the pairing step match the worker and the plugin | `N03` red then green; `N04` red then green; `N05` red then green |
| `blog-post.test.mjs` | 4 | the post is Markdown in a content collection; its figures equal the config; each "not there yet" line is still true of the repository | `N06` red then green; `N07` red then green |
| `pages-render-clean.test.mjs` | 9 | every route: no horizontal overflow at 320/390/768/1440, every word at 4.5:1 against the pixels in both themes, the one focus ring, no repeated id, no retired model/key/install promise, tokens only | `R34` red then green; `R35` red then green; `R36` red then green; `R37` red then green; `R38` red then green; `R39` red then green |
| `rendered-text-joins.test.mjs` (+2 tests) | 5 | no rebuilt page loses the space before an inline tag; the docs, /privacy and /terms are a named debt that can only shrink | `N08` red then green |

## Fix cycle 1 (2026-10-05): what the review changed in the ledger

Counts, measured (corrected in fix cycle 2: the first version of this paragraph said "+32 new, -4 deleted", which the table under it contradicted; the decomposition below was measured by building
`28ea87c6` and `5e12cef3` and running every site test file on its own): the site suite was 327 tests before the fix cycle and is **355 tests, 0 failing** after it, which is **+42 added and -14 deleted,
net +28**. Added: 28 tests in 8 new files (`copy-sources` 3, `docs-claims` 6, `docs-nav-derived` 4, `landmarks-unique` 2, `plugin-honesty` 3, `share-surfaces` 6, `status-live-region` 2, `titles` 2) and 14 in
9 existing files (`blog-post` +2, `hermetic-build` +1, `how-it-works` +2, `nav-and-routes` +1, `no-fake-output` +4, `old-layouts-gone` +1, `onboarding-recovery` +1, `rendered-text-joins` +1,
`theme-on-every-route` +1). Deleted: 14 tests (4 with `build-from-source-target`, 10 from `picks-pricing-docs` going from 14 to 4). `packages/design` was 162 pass and 3 fail
on the branch and is **165 tests, 0 failing**. Each row's proof is a mutation in RED-FIRST.md section 5 (the number in brackets is the subsection); the rows that carried the placeholder `R..` cite section 6.17 now. One correction to the first pass: the message of
commit `ca3f1db5` ("the site tests, restated to the property or deleted with their subject") says the 8 deleted files held **73 tests**; the table above counts **65** titled tests (9+2+9+4+10+19+8+4).
The table is the record; the commit message cannot be amended.

| file | old test | fate | proof |
|---|---|---|---|
| `no-fake-output` | the image tests read `/`, `/catalog/` and `/how-it-works/` only; "an empty list is allowed, the slots exist and hold no <img>" | **restated**: every `<img>` on every built page is inside a screenshot figure, has its record's file, hash, alt and size, never remote; no other picture element or CSS picture; no empty frame or to-do note; the landing hero is one eager 25 KB picture; the folder holds exactly the recorded files (6 new tests) | [5.4] 6 mutations red (remote image on /pricing, Markdown image in the post, a recorded file outside a figure on a docs page, a wrong hash, the hero without priority, an empty frame) |
| `living-background` | the screenshot slot is a flat panel on the shared radius | **restated**: the panel is `.slot__frame` (the figure carries the caption) | [6.17] 1 red (the slot given `backdrop-filter: blur(8px)`) |
| `blog-post` | the figures and the "not there yet" lines | **restated**: every bold lead of the post is a claim with a verifier that reads the repository; a lead with no verifier or a verifier with no line fails; nothing about pairing, the plugin, a build or a check under "What works today" while the plugin cannot be had | [5.2] 5 mutations red (8-character code, 30 minutes, a load-test-and-publish sentence, a new unverified lead, a changed lead) |
| `how-it-works` | the pairing step | **restated and extended**: the consent promise against the plugin (`tests/lib/plugin-promises.mjs`), "Works today" only when it holds for someone who can get the plugin, Roblox sign-in is real | [5.3] 3 mutations red |
| `hermetic-build` | skip every `components/*.ts` | **restated**: follows imports from every build-time frontmatter into the modules they reach; a module imported only from a `<script>` is a browser script | [5.9] red with a fetching component, green for the script-only control |
| `credit-refund-claims`, `no-live-cost-claim`, `pre-run-cost-warning`, `api-surface-claim` | walked `src/pages/**/*.astro` only | **restated**: read every source of words under `apps/site/src` (`tests/lib/site-sources.mjs`); `copy-sources.test.mjs` (3 new tests) holds the derivation | [5.8] 4 mutations red |
| `rendered-text-joins` | the docs, /privacy and /terms are a named debt of 61 joins | **restated**: the exemption is deleted, every page is held to zero; a config test | [5.12] red without the `compressHTML` line |
| `theme-on-every-route` | (new test) | **new**: the theme toggle and the menu button keep one name and announce state through `aria-pressed` / `aria-expanded` only | [5.10] 3 mutations red |
| `status-live-region` | (new file, 2 tests) | **new**: no live region holds the countdown or the poll text; one hidden announcer is written only on a change of state; plus a Playwright spec: nothing shifts | [5.10] 2 red, and the spec red without the reserved height |
| `titles` | (new file, 2 tests) | **new**: every title is "<Page> | StudPilot" (the front page leads with the name); no two share one; the legal pages are a shrink-only debt | [5.14] 2 red |
| `landmarks-unique` | (new file, 2 tests) | **new**: no two landmarks of one role share a name; every nav is named | [5.15] red |
| `plugin-honesty` | (new file, 3 tests) | **new**: every page that talks about pairing the plugin or building in Studio says on that page that new customers cannot get it; the hero and the meta description say it | [5.16] 3 red |
| `share-surfaces` | (new file, 6 tests) | **new**: the card, the manifest and every page's title and description tags against the banned copy, the competitor shapes and the Studio-works claims | [5.6] 5 red |
| `check-copy` (root) | the shapes and the pages | **restated**: reads `og.html` and `site.webmanifest`; HTML comments stripped; shapes in `scripts/lib/copy-shapes.mjs`; 3 new cases | [5.6] |
| `m2-capture-guard` (root) | (new file, 19 tests) | **new**: one fixture per selector the capture guard looks for (turn elements, picture elements, failure text), and the empty workspace passes; the capture script inspects before it photographs | [5.1] 3 red |
| `pricing-config` | cards, the accordion FAQ, notes under the cards, the cost table | **restated** to the new layout: plan COLUMNS of the one table, limits in an always-open grid, a cost list with bars; every figure still read from the config | [5.17] 3 red |
| `unpurchasable-and-shared-cap` | the shared cap comes before "What each plan includes"; the a/an slip in /docs/updating | **restated**: the shared ceiling comes before the comparison table (it is in the first panel); the grammar of "a StudPilot" on every built page (the old test pinned the codemod's "an StudPilot") | [5.17], [6.17] (the "an StudPilot" test: 1 red) |
| `credit-purchase-claim` | the cards filter a "buy credits" highlight | **restated**: any rendered highlight is filtered, and the built page holds no invitation to buy Credits | [5.17] |
| `picks-pricing-docs` | the Accordion mounts on /pricing and /docs/faq; Folder, Terminal, Code Tabs, DocsKit mount tests; the terminal prints only lines the build prints | **restated**: the Accordion is the docs FAQ's alone; **deleted** the mount tests for Folder, Terminal, CodeTabs and DocsKit and the terminal test (subjects deleted by the docs rewrite, 12.9) | n/a (subjects deleted) |
| `old-layouts-gone` | (the list) | **extended**: the three docs pages and five components; `DocsKit` is an empty stub whose only importer is the legal lane's page, and the test fails the day that stops | red when a page imports a deleted file; [6.15] a test that names a deleted component as if it were there |
| `build-from-source-target` | 4 tests on the build-from-source page | **deleted**: the page is deleted and redirected | n/a (subject deleted) |
| `onboarding-recovery` | disclosure before the connection steps, read from `/docs/connect` | **restated**: the steps live in Getting started; `/docs/connect` is a redirect | [6.17] 1 red (the unavailability callout removed from ahead of the connection steps), and the mutation test inside the file |
| `nav-and-routes` | the operator line the former operator name in the footer; the removed routes | **restated**: the footer names the operator in its copyright and carries the contact from the shared config; the three folded docs pages are redirects; **new**: no page links to a redirect | [5.14, 5.18, 6.7, 6.17] |
| `one-operator` | the footer byline equals the operator /terms names | **restated**: the footer holds no byline that repeats the wordmark and names the operator once; tests 1 and 2 (the legal pages) are untouched and the legal lane's to restate | [6.17] 3 red (a footer paragraph that reads "StudPilot", a copyright line naming "Acme Labs", and, in nav-and-routes, the contact link removed) |
| `contrast` | floors of 150 text/ground pairs, 5 fills, canaries `.fold__paper` | **re-based** (vacuity floors, not properties; every measured pair is still derived and still held at 4.5:1): the docs picks' CSS is gone | the same assertions on the new tree |
| `animation-actually-wins` | at least three keyframes (the docs picks and the status orb) | **restated**: the status page's `orb-checking` must be found | the same assertion on the new tree |
| `docs-search` (root), `billing-help` (root) | at least ten indexed pages; the sidebar names `href: '/docs/billing'` | **restated**: seven pages and the count equals the directory; the layout derives its list from the files and the page names its heading and order | [6.17] 1 red (`order={4}` removed from the billing page) |
| `docs-nav-derived`, `docs-claims` | (new files, 4 and 6 tests) | **new**: the built sidebar and index against the directory; the pairing facts, the consent promise, the 30-day session, the update path and the plugin's own disclosure against the plugin and the worker | [5.13] 6 red |
| `packages/design`: `brand`, `tokens`, `flat` | each required two document layouts or read `Landing.astro` | **restated**: every document layout imports the tokens, links the icons and has no inline colour; the floor is one and it must be Base | [5.7] 4 red |
| `e2e landing.spec.ts` | the footer says the former operator name; the hero slot | **restated**: the footer carries the contact; the hero holds the recorded screenshot, loaded, with its caption; **new**: `/status` does not shift | [5.10] |
| `e2e atmosphere-on-every-route.spec.ts` | pricing's three cards side by side; the docs terminal caret excused by name | **restated**: the plan columns of the table on a desk and the stacked rows on a phone; **deleted** the excuse (the terminal is gone) | the spec is red when the stacked rows are removed |
| `packages/design`: `focus` | at least 150 stylesheets read | **re-based** (a vacuity floor, not a property): 148 are read after the docs rewrite deleted components that each carried a `<style>` block; every ring is still measured at 3:1 | the same assertions on the new tree |

## Fix cycle 2 (2026-10-05): what the second review changed in the ledger

Counts, measured: the site suite was 355 tests before this cycle (62 files) and is **391 tests in 67 files: 389 pass, 0 fail, 2 skipped** after it. Added: 23 tests in 5 new files (`layout-measures` 6,
`legacy-plugin-instructions` 4, `quality-bar-claims` 3, `roblox-signin-limit` 6, `undecided-figures` 4) and 13 in 9 existing files (`blog-post` +1, `nav-and-routes` +1, `no-fake-output` +1, `old-layouts-gone` +2,
`pages-render-clean` +2, `plugin-honesty` +1, `pricing-config` +1, `reveal-cannot-hide-content` +3, `status-live-region` +1); nothing deleted. The 2 skipped are the tests that hold the opposite of a flag
(`ROBLOX_OAUTH_REVIEWED`, `PAID_DAILY_CAPS_DECIDED`) and run the day it flips. `packages/design`: 165 pass, 0 fail (unchanged). `apps/web`: 2537 pass, 0 fail (2535 and 2 fail before the finding-6 fix).
Root suite: 684 tests, 666 pass, 2 fail (the two known `check-pixels` cases), 16 skipped. Each row's proof is in RED-FIRST.md section 6 (the number in brackets is the subsection).

| file | old test | fate | proof |
|---|---|---|---|
| `roblox-signin-limit` | (new file, 6 tests; the finding: Roblox sign-in shown as working for everyone) | **new**: every block of every built page, title, description, the share card and the manifest that offers Sign in with Roblox carries "in a limited test until Roblox approves the app" in the same block while `ROBLOX_OAUTH_REVIEWED` is false; the opposite when true; the legal pages are a shrink-only debt | [6.1] 7 mutations red |
| `how-it-works` | step 1 is "Works today" and says Sign in with Roblox works | **restated**: step 1 follows the flag ("Partly works today" and the limit sentence while the Roblox app is in private mode) | [6.1] |
| `blog-post` | every bold-led paragraph is a claim with a verifier; nothing about Studio under What works today | **restated** twice: the Roblox lead moved to "not there yet" with a verifier that holds the flag; EVERY block is a claim (no unbolded block under the two lists, no unknown heading, no Studio capability anywhere outside "not there yet", a heading and its paragraph with no blank line are two blocks); the critic's lead says it is being built and fails the day a harness exists | [6.1], [6.3], [6.10] |
| `undecided-figures` | (new file, 4 tests; the finding: Pro 20 and Max 30 a day printed as plan facts) | **new**: while `PAID_DAILY_CAPS_DECIDED` is false no built page, title, description, card or manifest gives a paid plan's per-day figure or "full days" arithmetic on it; the pricing row says "Not decided yet" | [6.4] 4 mutations red |
| `pricing-config`, `quota-ceiling-copy` | the "Credits a day" cell equals the config for every plan; the cutoff is derived for every plan the ceiling bites | **restated**: the cell is the config's figure for a plan whose figure is decided (Free; the paid plans once the flag says so) and "Not decided yet" otherwise; the cutoff is derived for the same plans. **New** in `pricing-config`: the lede does not say "differ only in Credits" and mentions support while the table gives paid plans priority | [6.4], [6.5] |
| `quality-bar-claims` | (new file, 3 tests; the finding: the critic described as running) | **new**: while no critic harness is in the repository no page says the critic does something in the present tense or that a piece "has not passed"; every row of the bar says "Target" | [6.3] 5 mutations red |
| `no-fake-output` | (the screens record's alt and caption) | **new test**: a picture taken in mock mode says "sample data" and, while the fixture reports a Studio selection, "No Studio is connected" in caption and alt | [6.2] 2 red |
| `plugin-honesty` | a short verb list decides what "talks about the plugin" | **restated**: any sentence that names the plugin, or Studio or the place with any action verb either way round, on the page's own words (main minus menus, plus title and descriptions); the legal pages are a shrink-only debt; new fixtures include the /terms sentence and the finding's mutation | [6.8] 3 mutations red, BEFORE 0 red |
| `legacy-plugin-instructions` | (new file, 4 tests) replaces the second test of the deleted `build-from-source-target` (no instruction to build, load or download apps/plugin; no `*-pr-unverified` artifact) | **restated as a site-wide property**: over every built page and every source of words; the premise test (apps/plugin is still the legacy build) moved with it; `apps/plugin/README.md`'s reader table and `infra/migrate-studpilot/build-allowlist.mjs` follow | [6.9] 3 mutations red, BEFORE 0 red of 387 |
| `landmarks-unique` | `<nav>` and role-only landmarks | **restated**: a bare `<section>`, `<aside>` or `<form>` with `aria-label` or `aria-labelledby` (resolved to the heading text) is a landmark | [6.11] 1 red, BEFORE 0 red |
| `reveal-cannot-hide-content` | the old mechanism's class names | **restated** to the property: no hiding rule behind a class or attribute no markup carries or a negated class (shape), and every word of every page drawn with scripting off, with an observer that never fires, and with reduced motion (result); the stale "NOT COVERED" paragraph is removed | [6.12] 3 mutations red (2 tests each where the shape and the result both see it), BEFORE 0 red |
| `status-live-region` | `aria-live` and `role="status"` only; `announce.textContent =` only | **restated**: every live-region role and any `aria-live` not "off"; every form of write to the announcer | [6.13] 2 red, BEFORE 0 red |
| `pages-render-clean` | the one focus ring at 1440 px | **extended**: no ancestor with overflow cuts the ring at 390 and 1440 px on every route (+2 tests) | [6.16] 1 red, BEFORE 0 red |
| `layout-measures` | (new file, 6 tests; findings 18 to 22) | **new**: the phone table reads Free, Pro, Max in order at 320, 390 and 480 px and in a row at 520 and 600 px with one button size and no hairline of its own; the docs summary is its own line; the status orb is on its headline; the docs column has one measure; the Free card's panel is centred | [6.16] 7 mutations red |
| `nav-and-routes` | (the web app's docs links) | **new test**: no docs link in the web app's source names a route the build redirects | [6.7] 1 red |
| `old-layouts-gone` | (the list) | **new tests**: no test file names a deleted component without saying beside it that it is gone | [6.15] 1 red |
| `docs-nav-derived` | the index items parsed as `<li>` | **restated** (the parse tolerates attributes: the page's new `<style>` scopes its elements); the property is unchanged | n/a (the same assertions) |
| `animation-actually-wins` | the header counted the Folder and Terminal keyframes | comment corrected (the one keyframe left is the status orb); no assertion changed | n/a |
| `contrast`, `packages/design focus` | vacuity floors 120 and 120 (measured 151 and 148) | **re-based back up**: 147 pairs and 145 sheets, a few under the measured counts, so a blind walk of 22 to 30 pairs or sheets fails | [6.14] 2 red, each passing the old floor |
| `apps/web contextual-help` (2 tests) | "the empty states that mean "go and connect Studio" say where that is written", "every help link declared on an empty state names a page on disk" | red on the branch (the empty states linked the redirected `/docs/connect`); **not restated**: the source was fixed (`empty-state-model.ts`: two links now `/docs/getting-started#pair`, labelled "Pair Studio with a project"); both pass | [6.7] 2 red when the link is put back |
| `build-from-source-target` (fix cycle 1 row) | 4 tests, "deleted: the page is deleted and redirected" | corrected: the four were the premise that `apps/plugin` is still the legacy build (kept: `apps/studpilot-plugin/tests/worker-capability-contract.test.mjs` and the premise test of `legacy-plugin-instructions`), "the page does not tell anybody to build, load or download the legacy plugin" (**kept as a site-wide property** in `legacy-plugin-instructions`), "the page publishes the shipped plugin and the command that builds it" (subject deleted) and "the guard has teeth" (kept as the scanner test) | `legacy-plugin-instructions`, [6.9] |

# M2 test ledger

Each lane of M2 appends one section. Rule for every section: a test is restated to the property and never weakened, derived
lists are asserted non-empty, comments are stripped before source is scanned, and every new or restated guard has red-first proof
(a planted break, watched red, restored, rerun green).

## App

Step 2.3, the web app (`apps/web`), branch `studpilot/m2-app` from `eb4b2b12`, 2026-10-05. Decisions are in `DECISIONS.md`
section 12; screenshots are in `app-local/` (see its README).

### Counts, measured in the clone

| Suite | Before | After |
|---|---|---|
| `apps/web` `node --test` | 2537 pass, 0 fail | 2714 pass, 0 fail (+177, all in the ten new files below); **2736 after fix cycle 1** (below) |
| `apps/site` `node --test` (built without network) | 381 pass | 381 pass (the two privacy-claims tests were restated in place) |
| `apps/web` `pnpm typecheck`, `pnpm build` | clean | clean; entry 144.3 kB gzipped against the 150 kB budget |
| `node scripts/check-app-bundle.mjs` | | passes, and now also fails if the pieces stub, the Pieces button's name or the panel's specimen note reaches `dist` (fix cycle 1) |
| `packages/design` `node --test` | 165 pass | 165 pass (its one test file edit is in "Restated tests") |
| `node scripts/check-old-names.mjs` | | CLEAN |

No worker file changed, so the worker suite was not run. The root suite is in the lane report.

### New test files

| File | Tests | What it holds |
|---|---|---|
| `auth-providers.test.mjs` | 21 (24 after fix cycle 1) | Google and Discord render only when `GET /auth/v1/settings` says `external.<provider> === true`: the decision function, the request, the once-per-page cache, fail-closed on every error, the buttons and the click (run), and `signInWithOAuth` called from one component only |
| `age-gate.test.mjs` | 18 (24) | The 13+ screen: boundary on the birthday, leap days, impossible dates, the soft block (a remembered refusal, also with blocked storage), a neutral screen, nothing sent on a refusal, only `{ age_gate: 'passed' }` on a pass |
| `create-project.test.mjs` | 20 | One-click create: the name rule, the hook run (reads names, inserts `{ owner_id, name }`, opens the project, hands over the landing sentence once, one project per double press), the shelf's button and empty state run, no dialog left, and the getting-started docs page says what the click does |
| `studio-shots.test.mjs` | 18 (24) | The screenshots strip: which frames (this run's own, last eight, by capture time), honest names (Studio screenshot vs Preview render), the empty state, where it shows, click to enlarge and Earlier/Later run, memory only |
| `checkpoint-history.test.mjs` | 16 (18) | History grouped by request from the fields the API returns; hand-saved checkpoints apart; "Earlier work"; the rows rendered (author, description, Restore, the restore's own sentence and counts) |
| `pieces-panel.test.mjs` | 24 (27) | The settings panel: what each control may hold, SPECIMEN, the empty state, every control named, the controls run, keyboard and focus ring, reachable from the workspace |
| `pieces-production.test.mjs` | 6 | The stub is not in a production bundle: `lib/pieces.ts` and the panel bundled both ways, the import graph, no flag can load it, and `check-app-bundle.mjs` looks for it |
| `account-connections.test.mjs` | 25 (26) | The identity cards exist only for a provider that is on (card, row, search, rail), connect and disconnect run, never the last identity, the avatar is never "?" |
| `usage-beta.test.mjs` | 7 | The in-app ladder is labelled beta in the pricing page's own words, three listed plans from the shared config, every credit figure to two decimals |
| `growth.test.mjs` | 22 | The invite link and the badge: the code, the link, plain text, the rows, the hooks run, the share press, and that nothing reads `ref` and no referral credit is promised anywhere (app and site) |

### Restated tests (the property each one keeps)

| Test | Why it had to change | Property kept |
|---|---|---|
| `apps/site/tests/privacy-claims.test.mjs`, "13 AND OLDER ..." | It said the sign-up form must not ask for a birth date. It does now. | The pages and the form agree: the form asks, the date is judged in the browser and never sent or stored, both pages say exactly that, and no page says it is kept |
| the same file, "Google and Discord sign-in are described conditionally ..." | It said no file in `apps/web/src` calls `signInWithOAuth`. One component does now, behind the project's own answer. **Restated again in fix cycle 1 (below): the pages no longer say "not offered yet".** | The only call site is the gated component; every file calling a provider API reads the project's list; the pages describe both without stating whether either is on |
| `roblox-signin.test.mjs`, "the button the pages use is NOT in the first render" | The pages mount `AlternativeSignIn` (Roblox, Google, Discord under one "or"), not `RobloxSignIn` | The first markup a visitor receives has no Roblox button and no "or" with nothing under it |
| the same, "the sign-in page and the sign-up page both offer Roblox" | Same | Both pages mount the component, which holds `RobloxSignInView` and waits for the worker |
| the same, "only Roblox is added: no Supabase OAuth button exists" | Google and Discord buttons exist | Roblox is never passed to Supabase as a provider, and no provider button is typed into the markup (the gate is in `auth-providers.test.mjs`) |
| the same, the Settings-run block (7 tests) | Settings reads the provider answer | Run with the providers off, as today: a test fake, nothing weakened |
| `command-palette.test.mjs`, "New project creates a project ...", "the dashboard both contributes commands and provides the dialog", "a request made before the dashboard exists is honoured when it mounts" | The dialog is gone | The command does what its title says (creates, from any screen, rail and shortcut included); the shelf contributes commands and its buttons create; no pending request is armed, the shell holds no new-project state |
| `project-templates.test.mjs`, the four dialog tests | The create dialog and `templateSeed` are gone | The set is offered where a request is written; no picker at creation; the landing sentence still reaches a route that reads it; a blank project carries no state |
| `checkpoint-author.test.mjs`, `checkpoint-description.test.mjs`, `restore-status.test.mjs` | The row moved from `workspace.tsx` into `components/ws/checkpoint-history.tsx` | Author, description, the restore's sentence and counts are on the row; restoring does not close the drawer (asked of the page that handles the press) |
| `picks-integration.test.mjs`, "the account menu opens on the picked user-button header" | The header is handed `initial` too | Same header, same name and address |
| `usage-page-wiring.test.mjs`, "THE PLAN LADDER IS ACTUALLY RENDERED" | The import list holds two names | The route imports the ladder and renders it |

### Harness changes (test files, additive)

`page-harness.mjs`: the Supabase stub gained `signUp`, `signInWithOAuth`, `linkIdentity`, `unlinkIdentity`, `getUserIdentities` and a
two-query `from()` for creating a project; the query stub records `mutate(...)` calls. `hook-harness.mjs`: bundles with
`import.meta.env` in its production shape, so a module that reads `MOCK_MODE` loads under node.

### Red-first proof: planted breaks, each watched red, restored, rerun green

127 breaks were planted across the ten new files and the restated tests; every one went red. The harness for it is a script that
backs the file up, replaces one exact string, runs the named test files and restores the file even on failure (kept out of the repo).

| Item | Breaks planted (each red; names are the break, not the test) |
|---|---|
| C1 (8) | truthy accepted for a provider; fail-open on a non-200; cache removed; the component hard-codes the list instead of the hook; Roblox wait skipped; request without the `apikey`; buttons not held while starting; no early return on a second press |
| C2 (14) | `>=` to `>`; birthday a day late; real-date check removed; future date accepted; refusal not written; remembered refusal ignored; in-page memory dropped; captcha asked before the gate; birth year added to the metadata; form shown despite a refusal; placeholder year on the field; refusal text names the age; refused submit falls through to sign-up |
| C1/C2 site (5) | the page says the date is stored; the form loses its field; the metadata carries more than the flag; the old "only personal information" sentence back; an ungated `signInWithOAuth` in Settings |
| C3 (14) | count instead of highest; loose name pattern; description in the insert; no in-flight guard; guard never released; seed handed on a blank start; seed copied not moved; no failure toast; header button, empty-state action, rail, palette each stop creating; a template picker reference returns; the docs page tells a reader to name a project first |
| C4 (13) | all frames; unattributed frames; first eight; arrival order; a preview captioned a screenshot; empty sentence changed; placeholder image; thumbnail not a button; chat reply gets an empty strip; strip touches storage; socket cap 80; Later not held; Turn stops taking frames |
| C5 history (15) | manual under a request; old under the first request; the next request; empty requests listed; oldest first; assistant messages as requests; row loses author, description, restore sentence, counts; status under every row; the page closes the drawer; flat list; a field the API does not return; names not handed to the row |
| C5 pieces (21) | clamp not refuse; no step snapping; hex accepts words; text not capped; SPECIMEN stamp and note dropped; empty sentence changed; switch loses its role; control without a name; invalid number reported; blur does not restore; edits leak across pieces; focus ring removed; a shadow added; the panel fetches; the stub statically imported, loaded in every build, loaded by a mock flag, forgotten by `check-app-bundle.mjs`; the drawer mounted always; a drawer missing from the remembered list |
| C6 (15) | card drawn while off; identities asked while off; row ungated; search ignores the answer; rows never held back; unlink with one identity; wrong return; unlink a copy; no refusal before the request; Discord note loses the separation; avatar `?`; placeholder as source; Roblox name ignored; menu header `?`; the header not handed the letter |
| C7 (5) | label removed; label below the ladder; wording differs from the pricing page; one decimal; an Enterprise card |
| C8 (17) | salt; a slice of the id; length; any code accepted; wrong page; markup in the badge; a credit promise; the sign-up page reads `ref`; the worker reads `ref`; no failure toast; success claimed with no link; menu item, workspace button, held Copy, failed copy reported as copied, section dropped; the ladder import dropped (restated wiring test) |

**Gaps this found in my own guards, each closed before the count above.** Five guards first came back green and were strengthened:
1. the privacy-claims sentence "never sent" passed a page that said "we store it" (now asks for "never sent or stored");
2. the restore status test checked only a class, so a row that dropped the restore sentence stayed green (now reads the sentence and the counts);
3. the two-pieces-one-parameter-name case was not covered, so edits keyed by the parameter id alone leaked between pieces (a test added);
4. the old author guard stayed green when the row lost the author (it matched the import line), which is why the rendered row test exists;
5. removing only the day comparison of the date check stays green by design: the month comparison already catches every rolled-over date, so that comparison is redundant, not unguarded; removing the whole check is red.

### Fix cycle 1 (2026-10-05): the second review's findings

A review with two skeptics per finding left 15 verified findings and 9 minor ones (`app-c1-findings.json`); `DECISIONS.md` 12.9 lists each and what was decided.

**Counts, measured in the clone after the last code change**

| Suite | Result |
|---|---|
| `cd apps/web && pnpm typecheck && node --test && pnpm build` | typecheck clean; **2736 pass, 0 fail** (+22 over the 2714 above); build clean, entry 144.6 kB gzipped |
| `node scripts/check-app-bundle.mjs` | passes on the new build; the panel, its button's name and its specimen note are absent entirely |
| `cd apps/site && npx astro build && node --test tests/*.test.mjs` (every network fetch refused: `NODE_USE_ENV_PROXY=1` with a dead proxy, checked to give `ECONNREFUSED`) | build clean (21 pages); **381 pass, 0 fail** (the two privacy-claims tests were restated in place) |
| `cd packages/design && node --test` | 165 pass, 0 fail |
| `node --test tests/*.test.mjs` at the root | 661 tests: 643 pass, **2 fail** (the two known `check-pixels` scratchpad-location failures: "THE CONTROL: against a SAME-ORIGIN baseline ..." and "against a baseline with NO provenance ..."), 16 skipped |
| `node scripts/check-old-names.mjs` | CLEAN (0 violations) |

No worker file changed, so the worker suite was not run.

**Restated tests (the property each one keeps)**

| Test | Why it had to change | Property kept |
|---|---|---|
| `privacy-claims.test.mjs`, "Google and Discord sign-in are described ..." (second restatement) | It required "not offered yet", which the app makes false by itself the day a provider is switched on; its comment promised the pages are "re-aimed in the same change", which a dashboard toggle cannot make true | The only provider call sites are the gated component and the Connections cards, the gate is `external.<provider> === true`, and both pages describe the sign-in without stating the provider's state; "not offered yet", "we will update this policy before" and "when offered, Supabase receives" are banned |
| `privacy-claims.test.mjs`, "13 AND OLDER ..." (one assertion) | It required "Roblox, Google and Discord already require", an unsourced external claim about Google and Discord | The pages say sign-up through another provider does not ask the date again and that Google and Discord apply their own age rules; any "Google ... requires 13" claim is banned |
| `pieces-panel.test.mjs`, "reachable three ways" and "the drawer mounts the panel only while it is open" | The button, the command and the drawer are not drawn in production (owner decision) | Reachable in a build that has pieces; plus: every way in sits behind `PIECES_OFFERED` (a syntax-tree walk over every `setDrawer('pieces')` and `<PiecesDrawer />`), and `PIECES_OFFERED` is the build's DEV flag |
| `studio-shots.test.mjs`, "the socket hook keeps at most the strip's limit ..." and "the strip is mounted by the turn ..." | The cap and the repeat check moved into `appendFrame`; the strip is also handed the run and Studio state | The hook keeps at most the strip's limit through `appendFrame`, whose cap and repeat check are run; the turn mounts the strip with this run's frames and nothing else draws them |
| `studio-shots.test.mjs`, "NO FRAME YET", "A LIVE RUN ...", "A FINISHED BUILD ..." | The empty sentence follows the run and Studio | The empty strip says what is true of this turn and draws no picture; a finished turn keeps no "while it builds" sentence |
| `checkpoint-history.test.mjs`, "pressing Restore hands the page THAT checkpoint" | It called the `onRestore` prop itself and asserted there were no buttons | The same property asked of the button: each row is expanded (`expose`, for the test only), the button named Restore is found and ITS `onClick` is pressed |
| `growth.test.mjs`, "NO REFERRAL CREDIT IS PROMISED ANYWHERE" | The scan needed "receive credits" with nothing between, and the invite word before the credit word | No copy offers credit for inviting or sharing, asked of an invite word and a credit word in one sentence, either order |
| `growth.test.mjs`, "a project's menu on the shelf has ..." and "the workspace has a share button ..." | The item is "Invite a friend to StudPilot" and the workspace's icon is gone | The shelf's menu has the share press under a label that names the product and not the project; the workspace has no second, unlabelled invitation beside "Who can build here" |
| `account-connections.test.mjs`, "the avatar letter ..." (one assertion) | It asserted `!== null` for an astral letter | The first code point is taken: it asserts the letter itself |
| `auth-providers.test.mjs`, the page-run fakes | The Roblox status hook fake was a constant `false` | The fake reads the test's answer, so what the page hands the view is asserted both ways |
| `packages/design/src/web/rendered.test.mjs`, `fillForm` (**missing from the first ledger**, commit `ad637aa4`) | The sign-up form asks for a date of birth, so its primary button stayed disabled and its hover was never measured | The sign-up primary's hover is measured on an enabled button: it fills the day and year and picks a month. Same measurements. Not run red-first (it is a harness helper); it would go red as a failure to find an enabled button, and the 165 tests pass |
| `auth-providers.test.mjs` and `create-project.test.mjs` (**missing from the first ledger**, commit `ad637aa4`) | `check-old-names` caught a provider name and a stored key by their former spelling | The "no hand-written provider button" scan and the pending-sentence tests hold the same properties; the provider's former name is dropped from the sample lists and the stored key is no longer restated (a one-slot session store holds whatever key the module uses) |

**New guards, each run red-first: 47 breaks** (each planted by exact string replacement with the occurrence count asserted, the named assertion watched red, the file restored by position; the full suites above were run green afterwards)

| Item | Breaks planted (each red) |
|---|---|
| Pieces (7) | button ungated; drawer ungated; palette command ungated; `loaded` true from the start; the unmount guard dropped; the skeleton dropped; the DEV flag forced to `true` and the REAL production build rerun (`check-app-bundle.mjs` red, naming "Pieces and their settings" and "sample pieces with sample values" in the workspace chunk) |
| Strip (7) | `frames={frames}` to every turn; repeat check removed from `shotsForTurn`; from `appendFrame`; the hook bypasses `appendFrame`; Earlier and Later back to `.btn`; the disabled rule removed; the live sentence shown under a finished turn |
| Restore and history (5) | `onClick={() => {}}`; no `onClick`; a wrong checkpoint; the heading back to the time alone; `clockOrDate` always the clock |
| Sign-up and sign-in (14) | the day field strips non-ASCII again; the year field; the verdict does not normalise; `normaliseDigits` off by one; no focus effect; the effect loses `refused` from its deps; `role="status"` back; the month floor lowered; `robloxConfigured={false}`; `from="/"`; the cache restore never releases; releases on every `pageshow`; no cleanup; the anchor's hairline removed |
| Privacy and growth (10) | the old promise returns (privacy); "not offered yet" returns (data page); an unsourced Google 13+ sentence returns; the app gate loosened to truthy; a planted "Invite a friend and you receive 5 Credits" in `growth.ts`, "Every friend who joins adds 5 Credits" in `plans.tsx`, "Give 5 Credits to every friend you invite" in a site page; the old menu label; the workspace invite button back; the label naming the project |
| Minors (4) | the page counts the registry's settings; the avatar splits by UTF-16 unit; the mock flag read outside the mock branch; the mock flag ignores the query |

**Two gaps in my own first drafts, found by this run and closed.** (1) The unmount-guard test for `usePieces` first came back green with the guard removed: the stand-in `settle()` had
not committed the effect before `unmount()`, so the guard was never reached; the test now calls `settle()` and `unmount()` in that order. (2) My mutation helper restored by
replacing the first occurrence of the new text, which for a deletion is the start of the file and corrupted one source file for a minute; it restores by position now, and `git diff`
was read after each break.

**What this cycle cannot show.** The `pageshow` release is proved with a stand-in `window`, not a restored page (Playwright's Chromium has no back/forward cache). The refusal's
focus move is run once (the refusal appearing on mount) and its re-run on the transition is a source assertion on the effect's dependencies, because the stand-in React cannot place a
DOM node before the effect runs. Screen-reader output after the refusal is not heard by anyone here. The screenshots are from a local dev server and a headless Chromium.

### Fix cycle 2 (2026-10-05): the third check's findings

The cycle 2 check (`app-c2-findings.json`: one item partly fixed, four things the cycle 1 fixes made false, loose or unguarded, and its own suite record) is answered in
`DECISIONS.md` 12.10. The branch was rebased onto main `30fbebd7` first (`git rebase --onto origin/main eb4b2b12`; the 24 design-system commits are main's #32 now).

**Counts.** "Before" was measured in a copy of the tree at the rebased head `37c6a691`, with the same commands as "after" (so the rebase is confirmed to have changed nothing),
"after" on this branch's last commit. Every network fetch of the site build and its tests was refused (`NODE_USE_ENV_PROXY=1` with a dead proxy).

| Suite | Before (`37c6a691`) | After |
|---|---|---|
| `cd apps/web && pnpm typecheck` | clean | clean |
| `cd apps/web && node --test` | 2736 pass, 0 fail | **2742 pass, 0 fail** (+6: three new tests in `studio-shots.test.mjs`, three in the new `legal-claims-cites.test.mjs`; the Roblox-anchor test was restated in place) |
| `cd apps/web && pnpm build` | clean | clean; entry 144.6 kB gzipped against the 150 kB budget |
| `node scripts/check-app-bundle.mjs` | passes | passes (eager graph 270.2 kB across 4 files; the pieces stub, its button's name and its specimen note absent) |
| `node --test tests/*.test.mjs` at the root | 661 tests: 643 pass, 2 fail, 16 skipped | the same: 661 tests, 643 pass, **2 fail**, 16 skipped; the two are the known `check-pixels` scratchpad-location failures ("THE CONTROL: against a SAME-ORIGIN baseline ..." and "against a baseline with NO provenance ..."), identical on the rebased head |
| `pnpm --filter @studpilot/site build` then `cd apps/site && node --test tests/*.test.mjs` | 381 pass | build clean (21 pages); 381 pass, 0 fail |
| `cd packages/design && node --test` | 165 pass | 165 pass, 0 fail |
| `node scripts/check-old-names.mjs` | CLEAN | CLEAN (0 violations) |

No worker file changed, so the worker suite was not run.

**Restated tests (the property each one keeps)**

| Test | Why it had to change | Property kept |
|---|---|---|
| `auth-providers.test.mjs`, "\"Continue with Roblox\" is an anchor and carries the hairline ..." | It pinned the text of `.auth-page a.btn { ... }`, the rule that also restyled the six primary anchor buttons | The Roblox anchor, and only it, carries the hairline and the 20px line a `<button>` gets from the element rule: no rule of `auth.css` gives a border or a line height to every anchor button (a matcher over the sheet's selectors, run on the real sheet), the rule is on `.auth-roblox-link`, exactly one element wears that class (a syntax-tree walk), and the six primary anchors it protects are still found |
| `studio-shots.test.mjs`, "WHAT THE EMPTY STRIP SAYS ..." (one assertion) | The finished-turn line now begins "No screenshots to show" and says "connect Studio" in its second sentence; its constant is `SHOTS_NONE_HERE` | The line still says what to do (`/connect Studio/i`) and still keeps no promise about "while StudPilot builds" |

**New guards, each run red first, then green.** Written before the fix and run against the cycle 1 code: the playtest test failed (the two new frames were dropped), the
finished-turn test failed on the old sentence, the Roblox-anchor test failed naming exactly `.auth-page a.btn`, and the cite test failed on 24 cites (every cite of an app file in the document was
bare or borrowed a file, so none could be checked; the six that were one line off are the ones the planted drift below shows going red once the symbols are there). Then 22 breaks planted by exact string replacement in a copy of the tree (the count of the string asserted, the file restored from the clone and checked
byte-identical afterwards), **each watched red**:

| Item | Breaks planted (each red; names are the break, not the test) |
|---|---|
| Frame key (4) | playtest key without `capturedAt` (the cycle 1 behaviour); playtest frames never equal (a replay is not dropped); the key without the counter; the time compared within a 60 second window |
| Finished-turn line (4) | the cycle 1 sentence back; "were taken" said again beside the new reason; the sentence stops saying how long they are kept; a third place that sets the frames (a reload path) |
| Roblox link (6) | the old `a.btn` selector with the class still on the markup; the class dropped from the anchor; a primary anchor wearing the class; a new `.auth-page .btn` rule with a border; a new `.auth-page .auth-card a` rule with a line height; the Roblox rule without its hairline |
| Cites (8) | one comment line added at the top of `auth-pages.tsx` (the drift itself); one line added at the top of `settings.tsx`; a cite without its symbol; a bare `:NNN` after a cite; one line number off by one; the checker accepting any line; the file lookup finding no app file; a range read as its first line |

**The checker's six drifts replayed.** With the symbols in place and the six cites put back at their old lines (795, 853, 963, 439, 836, 416) in a copy of the document, the
test went red naming each with where the symbol is: 795 to 796, 853 to 854, 963 to 964 (twice, in two rows), 439 to 440, 836 to 837, 416 to 417 (a function whose name is also a prefix of
`AlternativeSignInView` at 387, so it lists both).

**Gaps in my own first drafts, found by this run and closed.** (1) The first matcher for "a rule that reaches every anchor button" flagged the busy mark
(`.btn[data-busy='true']::before`) and the theme toggle's `.btn`, neither of which is an anchor button; it now skips pseudo-elements and requires the selector's containers to be
the ones every anchor button sits in (`.auth-page`, `.auth-card`, `.auth-form-col`). (2) The first synthetic case of the cite checker named a real line of `auth-pages.tsx`, so it
would have failed the day that file changed above it; it runs on lines of its own now. (3) I expected the "replay is not dropped" break to be caught by "A REPLAYED RING"; that
test uses frames with no playtest run, so the break is caught by the new playtest test and by "two different pictures" instead (the expectation was wrong, the break was red).

**Measured in a browser, not asserted by a test.** `/app/reset` in a headless Chromium on the local dev server (every non-local request aborted): the primary anchor button
measures `1px solid rgb(166, 124, 255)` and 47.7px; with the cycle 1 rule put back as a style, `1px solid rgba(255, 255, 255, 0.12)` and 46px (the checker's figures). The three
provider buttons on the sign-in and sign-up screens still measure `1px solid rgb(55, 59, 68)`, 20px line, 46px. Screenshots: `app-local/` (`03b` retaken, `10` added).

**What this cycle cannot show.** **(Corrected in fix cycle 3, below: the state this sentence says was reproduced, the same run id arriving with seq 1 and 2 after seq 1..3, is one the worker cannot be in. It was built by hand, and the key is a defence, not the answer to an eviction.)** No worker was touched, so the Durable Object eviction is reproduced as the checker described it (the same run id arriving with seq 1 and 2 after
seq 1..3), not by evicting one. The finished-turn sentence is a statement of what the page keeps; nobody has been shown it. The cite guard says where the code is, not that the
sentence beside a cite is still true, and a symbol that is on the cited line for another reason passes.

### Fix cycle 3 (2026-10-05): the fourth check's findings

The cycle 3 check (a checker, and a regression hunter whose two serious findings two skeptics each confirmed) is answered in `DECISIONS.md` 12.11. No worker, legal-page or
`apps/site` file changed. The branch head the findings were made on is `10c2f409`.

**Counts.** "Before" is the checker's record of `10c2f409`; "after" was measured in this clone with the same commands (every network fetch of the site build and its tests was
refused: `NODE_USE_ENV_PROXY=1` with a dead proxy).

| Suite | Before (`10c2f409`) | After |
|---|---|---|
| `cd apps/web && pnpm typecheck` | clean | clean |
| `cd apps/web && node --test` | 2742 pass, 0 fail | **2747 pass, 0 fail** (+5: three new tests in `studio-shots.test.mjs`, one in `auth-providers.test.mjs`, one in `legal-claims-cites.test.mjs`; three more were restated or replaced in place) |
| `cd apps/web && pnpm build` | clean | clean |
| `node scripts/check-app-bundle.mjs` | passes | passes (entry 144.6 kB gzipped, eager graph 270.2 kB across 4 files) |
| `node --test tests/*.test.mjs` at the root | 661 tests: 643 pass, 2 fail, 16 skipped | the same: 661 tests, 643 pass, **2 fail**, 16 skipped. The two are the known `check-pixels.test.mjs` scratchpad-location failures ("THE CONTROL: against a SAME-ORIGIN baseline ..." and "against a baseline with NO provenance ..."): they fail because this clone sits in a scratchpad, identically on main, and were not touched |
| `pnpm --filter @studpilot/site build` then `cd apps/site && node --test tests/*.test.mjs` | 381 pass | build clean (21 pages); 381 pass, 0 fail |
| `cd packages/design && node --test` | 165 pass | 165 pass, 0 fail |
| `node scripts/check-old-names.mjs` | CLEAN | CLEAN (0 violations) |

No worker file changed, so the worker suite was not run. Per-file test counts after: `studio-shots.test.mjs` 30 (was 27), `auth-providers.test.mjs` 25 (24), `legal-claims-cites.test.mjs` 4 (3).

**Restated tests (the property each one keeps)**

| Test | Why it had to change | Property kept |
|---|---|---|
| `studio-shots.test.mjs`, "THE LINE RESTS ON THIS" | Counted `setFrames(` and used a regex that cannot cross a `)`: a lazy initializer plus an effect kept frames across a reload and nothing went red | Read from the syntax tree: the one frames state starts from `[]`; its setter is only called, twice (the fixture under `if (MOCK_MODE)`, and the `studio_frame` message through `appendFrame`); its value is read once, as a plain returned member; the workspace takes it by its own name with no default. A tripwire, on purpose |
| the same file, "the strip is mounted by the turn, and is the only thing that draws frames there" | Pinned the whole opening tag as text and the tag gained `studioKnown` | The strip is handed this run's frames, whether the run is going, and Studio's state, and nothing else (the exact set of four props), and the turn draws frames no other way |
| the same file, the playtest-key test (renamed) | Its comment, header and title said the worker restarts its counter under a surviving run id, which it does not | The key still tells a new capture from a replay at the same run and counter, and an exact replay is still dropped; it now also asserts that captures 1 ms, 1 s and 4.999 s apart are distinct (a window of any size is wrong), and says plainly that it builds the case by hand |
| `auth-providers.test.mjs`, the Roblox-anchor test | Its matcher split a selector on whitespace and needed three exact container names (a child combinator escaped), forbade a line height on every anchor button (which blocked making them match a `<button>`), and carried the 20px and the hairline as numbers | Only the Roblox anchor carries the hairline, and it is the button element rule's own; no rule gives a primary anchor a border that the primary `<button>` does not also get; every full-width anchor has the line a `<button>` has, read from `system.css`. The matcher is a small selector engine with its own self-test |

**New guards, each run red first, then green.** The new tests were run against the cycle 2 source (HEAD's copy of the six source files this round changed, in a copy of the tree):
five went red (the three `studio.known` tests, the restated mount test, the restated sheet test), as they should. "THE LINE RESTS ON THIS" stays green there, because the
property is true of that code; the checker's own break is what it is proved against. Then 47 breaks planted by exact string replacement in a copy of the tree (the count of the
string asserted, each file restored from the clone and checked byte-identical afterwards): **46 went red, and 1 stayed green on purpose.** The runner reports which test went red and
its first assertion message was read for a sample (2b, 2g, c1, c3, c10, k7, 1b, g2) to see they fail for the reason named.

| Item | Breaks planted (each red unless marked) |
|---|---|
| Frame key (6) | no capture time in the key; the time compared in a 5 s window (**the one the check found alive**); in a 1 s window; in a 1 ms window; playtest frames never equal; no counter in the key |
| The line rests on this (10) | a third place sets the frames (storage); **the checker's break: a lazy `useState` initializer reading `sessionStorage` plus an effect writing it, no new `setFrames` call**; a lazy initializer alone; an eager call as the initial value; the setter handed to a helper; `useReducer` in place of `useState`; the hook returning the frames merged with a stored copy; the workspace giving them a default from storage; an effect that writes them to storage (the tripwire); the socket message setting them some way other than `appendFrame` |
| Studio heard (10) | `hello` does not mark it; `studio_status` does not; a closed socket leaves it marked; the page starts out knowing; the mock never hears; the workspace does not hand the turn `studioKnown`; `shotsEmptyLine` ignores it; the turn does not pass it on; the strip does not pass it to the decision; a turn whose caller does not say is taken not to know |
| The sheet (12) | the anchors lose the button line; a 21px line; **the checker's break, `.auth-page .auth-card > a` with a border**; the cycle 1 rule `.auth-page a.btn` back; `a[href]` with a border colour; `a:not(.auth-roblox-link)` with a border colour; the Roblox hairline not the button's; the Roblox rule on `a.btn`; a tight child combinator (`.auth-card>a.btn-primary`); a sibling rule on anchors alone; a longhand border on the anchors; and **`.auth-page .btn-primary { border-color }` (the check's `3j`), which stays green by design** because it styles the primary button and anchor alike and so cannot make them differ |
| The matcher (5, in the test itself) | it stops reading `>`; ignores `:not(...)`; reads a pseudo-element as an element; ignores attribute selectors; forgets the containers. Each turns its own self-test red. (The pseudo-element one first stayed green: the break was dead code, because `::before` is already "unknown, not a match"; a `:before` and an `::after` sample were added and it went red.) |
| Cites outside a code span (4) | a plain-prose cite; a cite deep inside a span; a bold cite (**the check's `4e`**); the scanner no longer blanking spans |

**The check's four dead guards.** `1g`: red now (the 1 ms and 1 s cases); `2e`: red now (the break is `2b`); `3j`: not a defect, green by design (above); `4e`: red now (`g1` to `g3`).

**Measured in a browser, not asserted by a test.** `/app/reset` in a headless Chromium on the local dev server (every non-local request aborted: 0 reached the network). The primary
anchor measures `1px solid rgb(166, 124, 255)`, a 20px line and **46px** (it was 21.7px and 47.7px). The check-email card's pair, rebuilt on the page's own stylesheet (a `<button class="btn btn-block">`
over the primary anchor, since that card needs a sign-up round trip): button `1px solid rgb(55, 59, 68)`, 20px, 46px; anchor 20px, 46px; with the line rule neutralised, the anchor measures 21.7px and 47.7px
(the checker's figures). The Roblox, Google and Discord buttons on the sign-up and sign-in screens still measure `1px solid rgb(55, 59, 68)`, 20px, 46px each. Screenshots: `app-local/` (`10` retaken; the rest compared and kept, see its README).

**What this cycle cannot show.** The socket hook is not run under `node --test` (it needs more of React than the harness stands in for), so `studio.known`'s four settings (initial, `hello`,
`studio_status`, close) are read from the syntax tree, and what is run is the decision, the strip and the turn. Nobody watched a real reload with a real worker: the claim is that a page
that has not heard says nothing, and it is held by those pieces, not by a reload. The guard on frames kept across a reload is a tripwire on the places a frame can enter or leave the hook;
it cannot know that a new reader is harmless. The selector matcher over-approximates and models only a primary anchor in the page's one chain; a rule it cannot parse is "not a match", so an
exotic selector could hide from it. The worker's restart of a counter was not reproduced because it does not happen; making it happen (persisting the gate and the counter) is not done.

### What these tests cannot show

- **Not rendered in a DOM.** The app has no DOM test environment. Behaviour is reached by running the shipped code against stand-ins
  (hooks, page components, the click handlers) and by rendering to markup; where only source could be read it is read as a syntax
  tree, and the places are named in the file headers. The screenshots in `app-local/` are the visual check, from a dev server.
- **Nothing here touched Supabase, Cloudflare or any provider.** The provider settings request, `linkIdentity`, `unlinkIdentity`, the
  sign-up metadata and the project insert are all asserted against stand-ins. What the live project answers is listed as unverified in
  `DECISIONS.md` (12.1, 12.6).
