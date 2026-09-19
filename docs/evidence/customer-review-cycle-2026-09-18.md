# Customer review loop — verified changes, 18 Sep 2026

## Independent verdict

Fresh-context Luna max round 1 did **not** recommend the product. See
`customer-review-2026-09-18-round-1.md`. Do not rewrite that verdict after fixes.
Open blockers include public plugin installation, incomplete requested Roblox
features, absent playtest evidence, contradictory connection/pricing states, and
unverified 3D. A cosmetic improvement is not a product approval.

Root re-probed the existing plugin's public Toolbox details endpoint: asset
132128477945417 returned HTTP 404 while the known-listed Rojo control 6415005344
returned HTTP 200. The public distribution blocker is still present; the shared
availability flag was not flipped and no publishing/upload action was attempted.

## Image history and download boundary

An isolated existing test project was used:
`d47e8b3b-1b23-4d34-917b-737494e0099f`.
One new image was generated after the persisted-tool-detail deployment:
`f5bb8dbb-e46d-464e-a9fb-243abb56dba4`.

- The real run completed and reported 5 Credits.
- Its image loaded at 1024×1024 before refresh.
- After a full page refresh, View results was restored from history; opening it
  loaded the same image at 1024×1024 and offered Save image.
- Save image produced
  `/Users/moshe/Downloads/apple-image-f5bb8dbb-e46d-464e-a9fb-243abb56dba4.png`.
  `sips` confirmed dimensions of 1024×1024, not file format. Round 2 then used
  `file` and found JPEG bytes incorrectly named `.png`; root reproduced it.
  The previous PNG interpretation was wrong. This download metadata defect is open.
- The browser download-event wait timed out; filesystem artifact verification,
  not that event, is the evidence of a successful download.
- Retrieval still expires after one hour. Existing pre-fix turns without stored
  detail were **not** retroactively restored. No Studio edit or Roblox upload.
- Visual inspection of the downloaded file found a gold/yellow crescent, despite
  the requested silver. Delivery is verified; prompt fidelity is **not approved**.

## Playtest status correction

Round 1 found a terminal run saying its last frame was captured while the browser
had no frame and was still displaying a waiting message.

- Added three red-first executable tests: missing locally available evidence,
  terminal console errors, and terminal warnings. All three initially failed.
- Status now derives from available run-scoped frames, not a historical delivery
  count. Errors/warnings are visible in the terminal status.
- Completed runs without frames no longer say they are waiting. Terminal runs
  no longer display live-stream degradation warnings. Error guidance points to
  Studio's Output panel; the browser does not have detailed console logs here.
- Focused playtest suite: 31/31 passed. Web typecheck and build passed.
- Full web suite: 1809/1812 passed, with the same three unrelated unshipped
  marketing/docs contrast failures. No claim that the whole suite is green.
- Official static deploy verified all eight web files served uploaded bytes.
- A separate live tab for project `4d96a88c-79e6-4147-9f5d-040c7735aa2f`
  displayed `Playtest finished — 2 console errors · frame unavailable` and
  `No frame is available for this completed playtest. Inspect the result in Studio.`
  The actual rendered screenshot was inspected. No user draft or run was changed.

## Training readiness

The training agent implemented a validator, not a trained model. Root reran all
65 training-package tests successfully. The 404-row existing dataset contains
zero Apple tool trajectories; 346 rows need external context. Strict readiness
must remain failed. No GPU training or upload was initiated.

## Continuing mechanism

Heartbeat `apple-independent-customer-quality-loop` initially ran every 30 minutes.
It repeats independent review, authorized fixes and verified deployment while
respecting the usage ceiling; it does not coach a reviewer into saying “wow”.
Round 2 uses another fresh Luna max context. Weekly usage was 18% consumed when
this batch began and 20% at the final check. The broader product goal remains open.

Round 2 completed: `customer-review-2026-09-18-round-2.md`. It independently
confirmed image viewing/saving and honest playtest status, but again declined a
paid recommendation. It additionally found the download-format mismatch,
prompt-fidelity failure, composer overlap friction and inability to inspect Luau
through the web Files drawer. The drawer explicitly stores Apple notes/data,
not Studio scripts, so its emptiness is a discoverability/capability gap rather
than proof that the observed Studio scripts were never written.

## Follow-up: image download format fixed

Root changed the authenticated image save path to inspect raster magic bytes and
use the matching extension and Blob MIME type. PNG, JPEG, WebP and GIF are
recognized; unsupported bodies are refused, not saved as mislabeled images.
No image is transcoded. Four new/updated checks first failed, then all 17 focused
image download/expiry checks passed. Web typecheck/build passed; full web suite
1811/1814 passed with the same three unrelated marketing contrast failures.

Official static deployment verified eight served files. The live Save image
button then saved `apple-image-f5bb8dbb-e46d-464e-a9fb-243abb56dba4.jpg` in Downloads;
`file` identified it as JPEG, 1024×1024. This closes the metadata defect, not the
gold-versus-silver fidelity failure.

Source diagnosis of the fidelity issue found unconditional prompt clauses in
`apps/worker/src/imagegen.ts` demanding saturated colors and forbidding muted or
neutral colors even when the subject asks for silver/charcoal. This is a concrete
next investigation, not proof that removing the contradiction will guarantee
generation quality.

## Color correction exposed an execution-integrity defect

The unconditional bans on neutral/dark colors were removed from image prompts;
explicit subject/background colors now outrank default palettes. Three red-first
prompt tests pass. The image tool now reports `appearanceVerified: false`, rather
than presenting the flatness heuristic as subject/color verification. Worker
version `bb4a3985-09f2-4304-b569-fe1f584e72aa` deployed successfully.

The subsequent live request in the isolated image project did **not** execute
`generate_image`: message `83c84a4e-fdb0-4ae8-b8ed-1a2a9144a157` claimed a new
image ID but Activity contained only Intent/Plan, with no tool result or View
results. This is a failed test, not an image-quality success. No generated image
was available to inspect.

Root then added a conservative direct-command artifact completion guard. For
recognized direct image/3D creation commands in agent modes, prose is withheld
until the corresponding tool succeeds in this run. A missing tool can be nudged
only when available, within existing step/nudge limits; failed attempts are not
automatically retried. Completion without evidence becomes `incomplete`, with
an explicit no-artifact result. Greetings, explanations, negative requests and
requests to create ImageLabels/scripts are excluded from this classifier. This
does not claim universal natural-language intent understanding.

The session-wiring regression test failed before integration. Focused tests and
the combined worker suite (3204/3204) pass. Live guard verification is pending
the next coordinated deployment; the color-output test remained unproven at that point.

## Live artifact verification and continuous review

Worker version `212bc7cc-fa14-4e1d-a200-8fb7f67190ab` was deployed through the
official verifier. A single bounded image request in the isolated project
`d47e8b3b-1b23-4d34-917b-737494e0099f` then produced real image
`2c48d5eb-c065-474c-a01f-ff44b58433cf` (6 Credits). View results displayed an actual
silver-grey crescent on charcoal, unlike the earlier gold output. This is one
observed color-fidelity success, not a general image-quality guarantee. No Studio
edits or Roblox uploads were requested. The false historical reply is preserved.

At the owner's request, the review loop now runs consecutively during active
work, without a 30-minute gap. The existing heartbeat was updated to one-minute
idle recovery only; active reviews/runs must not be duplicated. Round 3 was
commissioned with a fresh-context Luna max reviewer, a skeptical paying-customer
standard, no prior review conclusions, and no pressure to return praise. Root
retains design ownership. Weekly consumption was 26% at this batch's check;
the conservative 35% total ceiling remains until clarified.

The generated image's Save button delivered a real JPEG, 1024×1024, named
`apple-image-2c48d5eb-c065-474c-a01f-ff44b58433cf.jpg`. After refresh the image
still loaded from history. Root also corrected crowded connection instructions,
reduced the active conversation composer height, and bounded image height to the
viewport without cropping. Three new layout guards failed first; all 15 focused
layout/connection tests passed, typecheck/build passed, and full web tests were
1814/1817 (the same three unshipped marketing contrast failures). Official web
deployment verified all eight served files; the refreshed page visibly separates
the Install action from its label and uses the compact connection heading.

## Creator Store blocker corrected by inspecting the owner's real dashboard

The owner explicitly authorized computer use to distribute the existing plugin.
In the signed-in owner's Creator Hub, the exact existing asset
`132128477945417` is still named Golem. Its Configure page reports:
“Not distributed on Creator Store” and says the asset may violate Community
Standards, offering an Appeal link. “Distribute on Creator Store” is checked but
disabled; Save Changes is disabled. Therefore the earlier explanation that a
human simply needed to enable the toggle was incomplete: this is an actual
Roblox-side distribution restriction, not an untouched setting. No asset was
uploaded, republished, renamed, modified or bypassed. Appeal details are being
inspected read-only; no compliance assertion has been submitted.

The exact removal detail says **Misusing Roblox Systems**, dated Aug 31, 2026,
with an appeal deadline of Sep 30. The owner then requested a genuinely new plugin
instead of an appeal. No appeal was submitted. New source is isolated in
`apps/apple-plugin`; the existing installed plugin and its asset remain untouched.
Root wrote the interface and consent lifecycle; Luna agents handle the transport
and bounded command engine. This is not a release or an assertion of moderation
approval. Actual Studio verification is still required.

Round 3 remains negative (`customer-review-2026-09-18-round-3.md`). Its disconnected
3D affordance finding was fixed: connection state now gates both selecting 3D and
submitting a previously selected 3D request after disconnect, retaining the draft.
The guard failed first; all 31 focused creation/composer checks pass. Web build
passed; full web suite is 1815/1818 with the same three unrelated marketing
contrast failures. Official static deployment verified eight served files. The
live isolated page now exposes disabled 3D with “Connect Roblox Studio to use 3D”.

During this build, pnpm 11 automatically reconciled the newly added workspace
package, despite invoking `build`, not `install`. Its only tracked lockfile change
is the empty `apps/apple-plugin` importer; the web/worker shared-package symlinks
still point at the original workspace paths. Subsequent work avoids package-manager
commands and invokes installed tools directly. No dependencies were added to the
new package.

Usage reached 32% total weekly consumed. No new substantive scope is being started
while the in-flight plugin modules and verification are being finished within the
conservative 35% ceiling.

## Resumed rebuild and deployment — 18 September, 03:16 IDT

The owner explicitly removed the Codex weekly ceiling after the 36% hold; monetary
spending remains zero. Latest account reading: 43% weekly consumed. This supersedes
the earlier ceiling paragraphs, not the zero-spend rule.

- Root replaced the public landing implementation and styles, not merely its accent.
  Neutral system typography, black surfaces, original folded mark, CSS light/waves,
  reduced-motion support, no banner images, fake run snapshots, or simulated input.
  Root inspected the actual production page in Chrome after deployment.
- Model choice is now a separate product field from legacy autonomy. Free Apple has
  building tools with lower ceilings; Apple MAX is subscription-gated before spend
  and before edit history truncation across API/WS ingress. Selection is preserved
  in message history, snapshots, and exports. Both routes currently share GLM-5.3
  Flash foundation weights: this is NOT independent completed model training.
- Billing readiness now exposes only individually configured paid prices, and the
  UI gates each tier. Missing paid prices cannot fall into a portal/cancellation
  action. Production Stripe remains unconfigured; no checkout or charge occurred.
- Critic round 7 rejected blocked installation and the simulated homepage composer.
  Root replaced that composer with truthful workspace/signup links and clarified
  unavailable installation on the homepage, project shelf, connection panel,
  pairing dialog, and plugin docs. The old listing was removed, not merely waiting
  for a distribution checkbox. No replacement was installed or published.
- Worker version `fd6cebe0-4b15-417c-aa4f-ff87f2db7d98`; deploy script verified health.
  Web final bundle `index-DHZV-hhf.js`, CSS `index-CPbDgt-8.css`; uploader verified
  eight files. Public site uploader verified 74 files. No bare deployment bypass.
- Validation: worker 3,217/3,217; web 1,823/1,823; site 32/32; worker/web TypeScript
  and both builds passed. Copy/rebrand checks and diff whitespace check passed.
  The broad repository suite was NOT green: it included stale deleted-design file
  references and dirty-tree/release-scanner controls, and its long visual fixture
  checks were interrupted. No whole-repository release pass or merge is claimed.
- Production read-only check in isolated image project: Apple selected, MAX labelled
  subscriber upgrade, 3D disabled without Studio, compact Activity/View results.
  No new prompt, regeneration, image, Studio mutation, or provider spend occurred.
- Training audit: 404 licensed-code rows, zero product tool trajectories; not ready
  for product SFT. One historical real run lacks structured trace and consent proof.
  It was NOT extracted. Offline consent/staging groundwork uses synthetic test
  fixtures only and cannot count as training data or trained model evidence.

Current checklist measurement is 59.3% weighted across 1,127 in-scope items. This is
repository bookkeeping, NOT a production-readiness or customer-satisfaction score.
Public plugin availability, verified high-quality Studio outcomes, custom model
training, and live billing remain incomplete. Goal remains active.

### Customer round 8 → immediate repair

Round 8 verified live model gating, MAX-to-Usage navigation, unavailable paid tiers,
compact activity and disconnected 3D. It found expired images still offering Save.
Root connected authenticated image-load state to Save for both single-image and
asset-grid results. Loading disables Save; failure removes Save and its misleading
availability copy. A 404 during download also fails closed. The guard failed first.

Web suite now 1,824/1,824; typecheck/build pass. Official uploader verified eight
files with `index-ApA9HDeK.js`. Root reloaded the actual isolated production image
project, opened its 02:01 result, observed disabled Save while loading, then
“Unavailable” and “Download unavailable” with no Save button. No regeneration or
download click was needed. Round 9 started immediately on the newly deployed public
onboarding, rather than rechecking unchanged blockers.

### Offline training staging boundary

Root reran the complete training suite: 73/73 passed, including eight executable
consent/staging cases. The new pure module accepts explicit structured envelopes,
checks fresh opt-in assertions and observed run/outcome metadata, and redacts common
credentials/PII. Accepted rows remain staging-only, non-promotable and subject to
human review. It cannot authenticate supplied consent assertions: a trusted,
owner-scoped production exporter is still required. Arbitrary source code or prose
can contain identifying information outside pattern matching. No real transcript
was extracted, no training was run, and no provider/GPU cost was incurred.

Latest account usage read: 45% weekly consumed. Owner's removal of the Codex ceiling
does not revoke the separate zero-monetary-spend instruction.

### Round 9 → onboarding and Usage readability

Fresh desktop/mobile customer review found unavailable-install instructions on two
docs entry pages, a stale 60-Credit promise, and run-together model labels in Usage.
Root made both entry pages follow shared installation availability, derived the
daily allowance from PLAN_LIMITS.free, and separated model names/explanations into
readable rows. The two onboarding regression guards failed before the repair.

Production inspection then exposed SVG Credits text defaulting to black on black.
Root added explicit theme-aware fills and a regression test that rejects removing
them. Latest check: 84 focused web tests and 34 site tests passed; TypeScript and
both builds passed. Official static uploaders verified 74 site files and eight web
files. Latest web bundle is `index-D3qbFZVr.js`, CSS `index-CPdr4P4G.css`.

Root observed the actual deployed getting-started page with its unavailable warning
and 231-Credit allowance, then inspected Usage pixels: separate model labels and a
readable white 231 / grey of 231 in the ring. No model call or payment was made.
Round 10 began immediately with fresh context to review app navigation/settings.
Actual new-plugin execution in an isolated Baseplate awaits explicit installation
confirmation; neither local Studio execution nor public distribution is claimed.

### Asset ingest repair and updated spending instruction

Agent isolated an in-batch duplicate-ID defect: the main table collapsed duplicate
IDs but FTS could retain duplicate mirror rows and written counts were inflated.
Root reviewed the narrow change and reran 35 relevant asset tests, worker TypeScript,
then the complete worker suite: 3,218/3,218 pass. Official worker deployment verified
version `990343e9-afed-475b-a3a4-b199e4c193f9` and health build `6d7a5be-dirty`.
No ingest, corpus upload, or Roblox asset operation was performed. Canonical asset
manifest reconciliation and row-specific import handoff remain open.

The owner subsequently clarified spending is allowed, while buying HF Pro is blocked
by their debit-card situation. A new total dollar cap was requested; the earlier
$20 approval is not silently revived. Paid training/resources remain unstarted until
the cap and any required checkout approval are resolved. Weekly usage last read: 47%.

Owner explicitly answered the budget question: $20 TOTAL for model training and
serving, including alternative providers. This is not a monthly subscription budget.
New approval ledger: $0 spent, $20 remaining. Do not start paid training on the
current unready dataset; verify readiness, total provider cost, and any required
credential/checkout confirmations first.

Attempting to update the earlier heartbeat to the new $20 cap returned "Automation
does not exist". No automation files were present locally either. The prior claim
that the heartbeat is active is therefore superseded; it was not silently recreated.
Reviews in this active turn continue, but scheduled recovery must not be claimed.

### Round 10 → single accessible navigation close action

The fresh reviewer observed two identically named Close navigation buttons: the
drawer control and its pointer scrim. Root made the scrim aria-hidden and removed
it from keyboard tab order, retaining click-to-dismiss and the dialog's real close
button. Nineteen focused navigation/accessibility tests passed, including a guard
that rejects removal of the pointer-only treatment; TypeScript and build passed.
Official uploader verified web bundle `index-n_KoBHAu.js`. Root opened production
navigation, observed exactly one Close navigation action in AX, clicked it, and
verified focus returned to Open navigation. Round 11 immediately began on Settings.

Root also replaced the obsolete mode-picker guide with concise Apple/Apple MAX
documentation, updated the shared docs navigation and removed the fixed 2-Credit
Plan footer claim. The guide explicitly separates model access from edit permission,
states free/paid access, shared current foundation weights and incomplete custom
training. Site build and all 34 tests passed; uploader verified 74 files; root
read the actual deployed /docs/modes and verified the new content and navigation.

### Round 11 → Settings connection clarity

Fresh review found a login email in the numeric Roblox-ID field, concatenated scope
descriptions, missing disconnected Discord state and ambiguous training privacy copy.
Source confirms creatorId initially empty, not derived from the Apple email; browser
autofill is the likely cause, not proven backend misbinding. Root gave Roblox fields
distinct names, new-password/off autocomplete hints and a numeric ID pattern. Scope
labels now have explicit spacing and block layout. Discord renders checking/error/
pending/not-connected states and cannot mint while status is unknown. Privacy copy
states training contribution is off by default, consistent with optional opt-in.

Complete web suite: 1,839/1,839; TypeScript/build passed. Official uploader verified
eight files with `index-CZu6ESw1.js`, CSS `index-lV7nVOoJ.css`. Root observed production
Settings: Not connected for Discord, Roblox ID empty with its numeric placeholder,
and separate, readable scope explanations and irreversible-write warnings. No
credential entry, connection, toggle, code creation or settings submission occurred.
Autocomplete hints cannot guarantee every third-party password manager behaves.

### Training alternative, without spending

Root verified official https://www.runpod.io/pricing and
https://docs.runpod.io/pods/pricing on 2026-09-18: listed A40 48GB is $0.49/hour,
on-demand compute bills per second; network storage below 1TB is $0.07/GB/month.
These are a potential small experiment route, not a promise of GPU availability,
card acceptance, model quality, completion time or permanent $20 SaaS serving.
No paid resource was launched. Dataset still lacks verified product trajectories;
funding does not repair that gap. $20 total approved / $0 spent. Weekly usage 50%.

Readiness remains 59.3% weighted repository checklist, measured again this turn,
not customer satisfaction or production-readiness. Public plugin approval, actual
isolated new-plugin execution, useful trained model and live billing remain open.
Root is awaiting the requested explicit local-plugin installation confirmation
before moving from UI reviews to a real isolated Studio result.

### Asset lifecycle batches and honest availability — 2026-09-18

Root reproduced a local ingest bug: a fixed-size batch crossing the pending/active
boundary filtered out the second lifecycle, then advanced past the discarded rows.
The new iterator advances by included rows and separates both seed and status.
The regression failed for both queue orders with the old algorithm; all five
batch tests pass after repair. Nine related expanded-file import tests also pass.
Dry-run through the real script: 21,796 duplicate IDs skipped; 524,002 unique local
records, 94,334 with Roblox IDs and 429,668 pending; all rows accounted for in 1,049
batches. No network ingest, remote provenance validation or Roblox upload occurred.
Historical harvest index was deliberately not rewritten as a live inventory count.

Root removed frozen 510,979/81,311 and unlimited claims from asset choices, replaced
the quality-checked implication with recorded provenance, and disclosed build Credits,
import requirements and Roblox availability constraints. The new guard failed on the
old claim, then passed with the fix. All 1,833 tests under apps/web/tests passed;
TypeScript/Vite build passed. Official static uploader verified eight files including
`index-ClgbnafO.js`. Root inspected production Settings filtered to assets: readable
source descriptions and import/credit caveats, no old counts. No preference saved.

Fresh round 12 found no additional defect in its bounded Settings/Delivery review;
this is not a product endorsement. Round 13 started immediately with fresh context
on asset sources and onboarding. Model training/serving approval remains $20 total,
$0 spent. Latest weekly Codex usage: 52% consumed. Product/Studio/training gates stay open.

### First-party Roblox UI library and asset/installer integration

Root authored `apps/worker/src/ui-kit.ts`: installable AppleUI ModuleScript, HUD-only
option, responsive safe-area shop, scrolling item catalog, literal text, unknown
balance placeholder, explicit unavailable/pending/refused/error states, reduced-motion
option and gamepad focus restoration. Requests pass only an item ID to a caller-supplied
server-confirmed handler. No currency grant/deduction, remote call, external image or
upload is built into presentation. No handler means unavailable, not pretend success.
Destruction (including external ScreenGui destruction) disconnects global input;
late callbacks cannot write into destroyed UI. Replacement item lists validate first.

Thirteen tests execute the actual module under Luau with explicit Roblox doubles.
Pending-guard falsification failed when the guard was removed in memory. All prefab
sources compile, and a separate install-tool test passes the exact source to a
ModuleScript in ReplicatedStorage. These tests do NOT prove engine layout, actual
input routing, animation quality, live purchase integration or a Studio result.
Official Roblox references consulted: https://create.roblox.com/docs/ui/on-screen-containers,
https://create.roblox.com/docs/ui/size-modifiers and
https://create.roblox.com/docs/tutorials/building/ui/interactive-buttons.
The first full worker suite caught the module absent from roadmap briefs; root wired
the actual HUD and shop build instructions before deployment, then reran green.

Agent's bounded result-contract repair adds libraryId, numeric/null assetId, lifecycle
and licence metadata to search_asset_library without any import/upload side effect.
Root ran its SQLite behavioral regression. Plugin compatibility audit also exposed
replacement installs incorrectly sending create. Replacement now omits create and
uses the observed source hash; new installs still create, unread paths still refuse,
identical reinstalls remain no-ops. Independent new plugin was not installed or run.

Full worker suite: 3,232/3,232, TypeScript passed. One additional UI installation test
was subsequently added and passed in a 46-test focused suite; no worker runtime edits
followed the full suite. Official deploy version `65dcb3c6-8ac3-402d-aa66-62c2de77d49a`,
health stamp `6d7a5be-dirty`. No live tool/Studio invocation proves the new module yet.

### Rounds 13–14 follow-through

Round 13's transient empty asset policy was also observed by root. The Settings
section now renders explicit loading/error and Retry before exposing choices, uses
stored selections directly until edited, and refreshes cached preferences from the
save response. No controls are editable during save. React derived-state guidance
informed this change. Regression failed against old rendering, passed after repair;
full web suite 1,841/1,841, TypeScript/Vite passed. Official uploader verified eight
files with `index-D5jaiwDp.js`. Root saw production `Loading asset sources…`, then
the actual two saved selections and disabled unchanged Save. No preference saved.

Round 14's pricing findings were repaired: no paid availability CTA to an unavailable
checkout; planned status appears on paid cards and comparison columns; free access
copy no longer says there is nothing to start. Site tests 36/36 and Astro build passed.
Official single-file uploader updated /pricing; root separately compared full SHA256
of served bytes with built HTML, equal, and inspected live page content. No billing
entitlement or Stripe configuration was changed. Round 15 immediately followed.

Sentry audit cannot query issue data through the installed read-only skill: no
SENTRY_AUTH_TOKEN is present in process/repo environment files. This does not prove
the deployed DSN absent; issue-store health remains unverified. No credentials created.
Model budget $20 total / $0 spent; weekly Codex usage 56%. w21/w22/w23/w24/w25/w27/w29
remain open; no whole-product completion or independent customer endorsement claimed.

### Rounds 15–16, live schema and monitoring audit

Navigation drawer now makes the underlying main inert for its mounted lifetime,
restores the previous inert state before restoring keyboard focus, and retains the
existing pointer-only/aria-hidden scrim. Root observed no main in the open drawer's
AX tree and `inert` present, then absent with focus restored after Escape, on desktop
and a 390×844 viewport. The scrim already had aria-hidden before this repair; the
reviewer's unnamed-scrim claim is not independently reproduced by root.

Project shelf now has literal multi-term name/description/summary/place/tag search
within the loaded scope, matching counts, clear control and explicit zero-results
copy. It preserves fetched pin/recency order and cannot promise to search rows beyond
the fetched list. Tag chips already existed when tags are present; their absence in
the review account was not proof of missing implementation. Missing saved metadata
no longer claims “nothing built” or “not linked”. No project data was mutated.

Five search behavioral tests include in-memory all-terms falsification; modal
regression failed before repair. Full web suite 1,847/1,847, TypeScript/Vite passed.
Official eight-file deploy verified `index-zriocBJV.js` / `index-RhH0kZou.css`.
Root observed live Laundry search 2/3, impossible query 0/3 with an escape path,
clear restoring cards, no mobile horizontal overflow, and inspected mobile pixels.
Viewport reset and verification tab closed.

Live read-only Supabase audit is recorded in `supabase-readiness-2026-09-18.md`:
ten public tables with RLS, archive/pin/tag columns present, one schema-name drift
affecting usage export (`sparks` in live storage versus `credits` in repository).
No production schema/grant changes or customer-row reads. Separate compatibility
repair is in progress; advisor warnings are qualified rather than called exploits.

Existing logged-in Sentry organization `moshe-s6` reports no projects. Root reached
the new-project form but submitted nothing. Approval for error-only apple-worker /
apple-web projects, no replay/chat content/paid upgrade, is pending; handoff tab kept.
Training audit confirmed zero complete tool trajectories and missing historical
consent proof. A bounded local trajectory module is in progress, not activated.
No GPU spend ($0/$20); weekly Codex consumed 58%. Fresh reviewer spawning hit the
agent-thread limit after round 16; no further fresh reviewer is claimed running.

### Export compatibility, audit repairs and training eligibility correction

The narrow `usage_events.credits` compatibility fix is deployed in worker
`d03a562e-0efa-46f8-a22a-6fa9726772b6`. A read-only PostgREST probe with limit=0
confirmed the credits projection fails with 42703 while `credits:sparks` succeeds;
no customer rows were read. Full worker tests passed 3,243/3,243 and typecheck passed.

The bounded trajectory ledger is complete with six behavioral tests, not connected
to live collection. It still requires authenticated, historical run-bound consent,
an exporter, redaction/review and independent outcome evidence. The offline staging
module is likewise not a live collector or training-ready dataset.

Repository scanners now enumerate current non-ignored source, including untracked
files and excluding deleted paths. A temporary-tree falsification reopens the false
dead-end finding when untracked importers are omitted. The graph resolves 1,451 edges
and leaves the three known fixture-only strings unresolved; thresholds were not
relaxed. Both unconnected training modules have explicit blocked dispositions.
Non-browser root suite: 460/460 passed. The earlier browser pixel suite was interrupted
and is NOT counted as passed; whole-repository/release completion is not claimed.

Strict local data audit: 404 rows (327/39/38), 395 structurally usable pairs,
346 context-dependent rows, nine instruction-quality defects, zero Apple tool
trajectories. No evaluation shingle leaks or licence regressions were found, but
the product-SFT readiness verdict is still NOT_READY_FOR_PRODUCT_SFT.

Current HF documentation contradicts the installed training skill's old paid-plan
prerequisite: https://huggingface.co/docs/hub/jobs-pricing now permits Jobs with a
positive prepaid credit balance, no Pro required. Root inspected the signed-in
billing UI: balance $0, compute usage none, $10/$20 one-time top-up options available.
The dialog was cancelled without payment or automatic recharge. No assertion about
whether the debit card would be accepted was tested. Connected OAuth exposes jobs
and read-repos, not repository-write permission. No credentials were expanded.
No GPU job or new-budget charge. Weekly Codex consumed 63%; repository checklist
remains weighted 59.3%, which is not a customer-readiness percentage.
# Round17 root follow-through — 2026-09-18 05:01 EEST

Round18 follow-through: the review's huge-balance finding is scoped to the owner's explicit
earlier credit-grant request, not proof of systemic customer balances. Root preserved the
balance and changed aggregate extra-credit wording to include grants without claiming a
purchase. Studio plan no longer lists all-tier shared projects as something it adds.
Combined web/site1881/1881, both builds passed. Final bundle `index-DI2PkNAM.js` verified
by uploader8files; root observed exact unchanged balance with “purchased or granted”, Studio
card and pricing table in Chrome and compared pricing response bytes with built HTML.
Round19 started immediately for settings/help/accessibility; it must not infer build quality
without observing an actual Studio result. No public plugin release, payment or training.

Follow-up root observation: live Usage printed internal specialist label “Usage stone455”.
Canonical shared specialist-to-public-activity mapping now normalizes labels AND buckets,
so old admission/settlement rows join without changing totals. Red-first regression observed
two buckets instead of one, then passed after fix. Final web tests1841/1841 and build/typecheck
passed; official uploader verified8files for `index-BJn5oV4H.js`. Root saw live “Agent455”
(455 unchanged) in Chrome. No historical ledger rows were changed or model identity invented.

Root corrected the shared Free highlight and all plan-comparison cells to state
public installation is unavailable. Both derive from the existing distribution flag;
tests compile both flag states and reject a mutation restoring unqualified inclusion.
Status now distinguishes a observed paired connection from unknowable local installation,
states the removed listing and lack of public workaround, and reports only API health
instead of “All systems operational / Build away”. No public plugin was released.

Verification: site38/38, web tests directory1840/1840, web TypeScript+Vite build,
focused plugin-entitlement/known-issues/support15/15; git diff check clean at check time.
Official uploader deployed web bundle `index-jq4UWcnx.js`, verified8files. Pricing/status
uploaded individually; root independently compared live bytes to local build and inspected
live Chrome pricing row, Usage Free plan and refreshed Status text. Usage screenshot
observed existing black/glow presentation; this change is copy/state truth, not a redesign.
Fresh independent round18 started immediately after verification, while backend work continues.

Separate model work: original ten-seed curriculum and bounded baseline are recorded in
`docs/evidence/model-seed-baseline-2026-09-18.md`. No training or Studio run claimed.
Whole-product checklist remains measured59.3%, not a customer-readiness score.
