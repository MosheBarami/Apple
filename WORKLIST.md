# Worklist — Apple

<!-- [ ] open · [x] done · [~] abandoned (a reason after — is REQUIRED, or it stays open) -->
<!-- Add HALT: <reason> on its own line to release the Stop hook immediately. -->
<!-- Drawn from docs/backlog/FEATURES.json (1,084 not-started) and docs/backlog/BLOCKERS.md §D. -->
<!-- Owner-blocked items (A1, A2, C2, hosted LoRA) are NOT here — they are handoffs, not work. -->

## In flight

2026-09-19 Profile follow-through, LOCAL ONLY: the actual generated module reproduced a stale
server-A release overwriting server B's already completed session, plus recreation of a missing
unowned record. Positive stored-lock ownership now fences release; no schema change. Red2/2,
then focused prefab/consumer27/27, Worker typecheck and scoped diff check passed. No Worker
deployment, native DataStore test, or blanket persistence acceptance. Existing offline reporter
recomputed59.3167701863354% checklist marks at13:31UTC (not customer-readiness); no status
inflation. Evidence: `docs/evidence/profile-cross-server-release-2026-09-19.md`.

2026-09-19 Files/focus continuation, LOCAL BUILT: main reproduced nine upload/query-selection
failures and nine remaining drawer-focus failures, applied narrow source repairs and preserved
the earlier worker fixes. Final focused Files91/91 and focus/monitoring42/42 passed; web
typecheck and scoped diff check passed. Production build `6d7a5be-dirty.fa54af2bf43e` passed
on unchanged source fingerprint. It is NOT deployed: the subsequent static-release preflight
was safety-blocked before execution, and no alternate route or upload was attempted. Actual
browser reload still served `index-155RQ2jz.js` and showed both existing project files.
Worker coordination remains unconfirmed (`WORKER_IDENTITY_LOST`). No claim of full-suite,
current-browser, Studio, billing, public-distribution or whole-product acceptance. Evidence:
`docs/evidence/customer-files-focus-continuation-2026-09-19.md`. Broad goal remains open.

2026-09-18 partial production rollout, verified20:43UTC: existing distinct outbox
tokens passed4/4 matching/swapped readiness checks. Golem deployed via the official
script to100% version0adfa419-ba2a-4a46-a85a-feaff76ed213 with outbox/Sentry bindings;
source aggregate d6562221c939ee672572f24f15af6401879ca24e53a5f16fb5383b83d23572a6
was unchanged. Apple deployment was explicitly blocked by the platform safety check
and not retried or bypassed. Independent postflight confirms Apple remains version
a67537e8-1599-4694-91c5-a0709a287664 with none of the new authority/outbox bindings.
Both health endpoints answer, but this is NOT a full rollout. Stripe stays disabled.
Browser monitoring build passed locally with release6d7a5be-dirty.f981d7946ccd and
is NOT deployed; actual Sentry ingestion/alerts remain unverified. Evidence:
`docs/evidence/resume-partial-rollout-2026-09-18.md` and the additive release section
of `docs/evidence/apple-resume-integration-2026-09-18.md`. Broad goal remains open.

2026-09-18 resumed integration, LOCAL + actual narrow Engine proofs: canonical billing
authority/legacy-replica HTTP wiring now refuses partial or malformed acknowledgements and
retries safely without duplicate credit grants; canceled/expired and superseded subscriptions
are covered by actual HTTP/SQLite tests. Creator-skill truncation, MCP knowledge-tool
classification and billing replay inventory gaps are repaired. Final integrated Worker
3434/3434, web1860/1860, site44/44 and plugin26/26 pass; typechecks/builds pass on recorded
fingerprints. This is not a live checkout or whole-product acceptance claim.

Actual restore r3 passed5/7 with2failures; targeted production detachment fix preserved Undo/Cancel state,
and separately frozen r4 passed7/7 in Studio. Current simulator UI was then inspected and
its oversized empty shop repaired. A new frozen Play proof measured three purchases and
fourth refusal, balance25/upgrades3/WalkSpeed28, at1439x755, ending normally. The fixture
still looks generic and does NOT satisfy full genre/game visual quality; no fabricated
visual pass. Live Supabase read20:28UTC confirms all10ledger entries, both configured
outbox consumers, queue0 and ledgerRLS/noanon-authgrants. No duplicate migration/token
creation, model call, payment, training run, plugin publication or asset upload in this
continuation. Current deployment/binding verification is a separate next gate. Evidence:
`docs/evidence/apple-resume-integration-2026-09-18.md`. Broad task remains active.

2026-09-18 public onboarding clarity LIVE: root corrected MAX notice wording, added the missing
public-installation warning to connection instructions, made status recovery paths actual links,
and reconciled misleading privacy/export summaries with existing implementation limits. Site
build/typecheck and 52 tests passed. The official 74-file deploy detected one stale shadowing
`/status` key; targeted overwrite plus five canonical-route SHA comparisons and Chrome navigation
verified the repair. No worker/model/plugin deploy or paid provider call. Budget remains $0.06
allocated/$19.94 unallocated, weekly94%used. Evidence:
`docs/evidence/onboarding-clarity-2026-09-18.md`. Overall repository coverage59.3%, not readiness.
Critic38 passed its narrow docs-search checks;39 found asset discovery gaps;40 immediately began.
Public plugin, paid checkout, real Studio quality and independently strong custom MAX remain open.

2026-09-18 controlled model follow-through: root actually trained/reloaded a64-step local LoRA
using the exact frozen v2inputs/config (only iteration count/output path changed). Both before
responses matched the earlier run; fresh replay2/2, executable quality still0/2. Rejected again;
no production/model route change. Separate reviewed UI curriculum now24examples18/3/3; every
reference/mutant executed and all20old family assignments preserved. Root reproduced and fenced
the old splitter moving team-balance from test to train when examples are added. CLI now requires
explicit partition lineage or explicit fresh-dataset intent. Reviewed artifact is
`game-logic-seeds-v3-reviewed`; initial untrained v3 was superseded during numeric-bound review.
Training112/112, current non-pixel root466/466; preceding full run477/478 included the now-fixed
manifest failure, so is not claimed fully green. Native Mac still locked; Studio remains unverified.
No new provider cost; budget$0.06 allocated/$19.94 available, weekly92%used. Evidence:
`docs/evidence/local-model-iteration-ablation-2026-09-18.md`. Critic rounds34–37 completed,
round38 immediately started. Broad goal and w22/w23/w25 remain open.

2026-09-18 LIVE asset metadata repair: authoritative D1 audit found 511,208 catalogue rows and
a missing download_url column. Existing empty-ingest compatibility migration applied; bounded,
guarded metadata repair filled 6,835 missing expanded OpenGameArt URLs. Every column of all
12,027 source rows was compared before/after: only those URLs changed. 58 colliding IDs and
67 invalid records were excluded, not guessed. Independent live read-back and two direct HEAD
checks succeeded; actual Studio insertion was NOT performed. No Roblox upload, model call or
worker/UI deployment. Focused suites21/21 passed, including executed SQLite fence falsification.
Evidence: `docs/evidence/asset-download-repair-2026-09-18.md`. w21 and the broad goal remain open.
Budget remains $0.06 allocated/$19.94 unallocated; latest Codex weekly usage88% consumed.
Fresh customer round32 found asset-source documentation/discovery gaps; round33 found a MAX
recovery/docs mismatch; round34 immediately began. A missing training scorer CLI manifest entry
was corrected after the broad root suite caught it; focused scorer/dead-end checks18/18 passed.
The original broad suite is not fully green (it includes that pre-fix failure and slow pixel
checks remain in progress). Real Studio quality, public distribution and custom-model quality
remain unverified.

2026-09-18 UI library expansion, LOCAL ONLY: root added validated scrolling objectives and a
bounded timed notification queue to AppleUI, UTF-8-safe text, lifecycle cleanup and exact API
catalogue guidance.25 executed focused Luau tests pass, including the isolated shop proof server.
A disposable Studio-only test place builds from the actual source with3 compiled scripts; it has
not been opened/run. Native computer access reported the Mac locked; no bypass was attempted.
Final worker suite3279/3279 and TypeScript checks pass; roadmap-focused suites55/55 pass.
Root corrected the audit's header-only exemption: source identity is required, capped known UI
prefixes leave code evidence unknown, and modified/gameplay modules remain detectable.
No deployment, provider call or new cost. Budget$0.06 reserved/$19.94 available; weekly85% consumed.
Evidence: `docs/evidence/ui-library-expansion-2026-09-18.md`. w23 remains open pending real engine
and visual validation; the whole goal remains active. Fresh review rounds28/29/30 finished; round31
immediately began. Chrome remains accessible; only native Studio control is blocked by the Mac lock.
Known stale billing/changelog documentation and unavailable public distribution
remain open, not reclassified as product completion.

2026-09-18 local model experiment supersedes the earlier "no training" status below:
root actually trained and saved a bounded Qwen3-4B LoRA development pilot, reloaded it in a fresh
process and reproduced both answers. Executable holdout results remained0/2 before and0/2 after;
the adapter was REJECTED for production. No model or UI deployment in this experiment. Two bounded
GLM reference calls passed1/2 (different system prompt, not a controlled superiority comparison).
Training suite106/106 green. Total-budget allocation now$0.06, unallocated$19.94; no subscription,
GPU purchase or Hub upload. Current weekly Codex snapshot83% consumed. Evidence and next quality
gate: `docs/evidence/local-model-pilot-2026-09-18.md`. w22 and broad product goal remain open.
Fresh customer round27 completed: reported skip-link and project-menu Escape focus failures;
these still need root reproduction and correction. Fresh round28 immediately started read-only.
Rounds25/26 found summary freshness and project-context clarity issues, not a verified excellent
Studio result. Historical entries below describe their
then-current state and are not current deployment/training claims.

2026-09-18 image/mobile release: worker `581c1e69-9764-4f6f-bd71-70347cc4f3ed`, web
`index-DabPaM4X.js`/`index-bQpN-hqB.css`. New generated images now use a bounded private D1
project store, with atomic capacity admission, deletion tombstones (including legacy fallback),
honest save-failure handling, MIME detection and exported retention/residue disclosures. Old expired
images are not recoverable. Root executed worker3262 and web/site1883 green tests, typechecks/builds,
and tombstone-fence falsification. Official deploys verified live bytes. Root independently reproduced
the mobile overflow before reload (478px inside379px), then verified379/379 at390px and309/309 at320px;
Jump to latest now sits18px above the composer. Media gating no longer redirects free users to closed
paid checkout. Live new paid generation NOT performed; no new model charge/training. Details and
limitations: `docs/evidence/image-durability-mobile-2026-09-18.md`. Fresh customer round24 continues;
round23 confirms missing image/3D capability docs remain open. Budget unchanged: total$20,
reserved$0.05; last measured weekly Codex usage80% consumed. Broad goal remains active.

Resumed, 2026-09-18: owner explicitly lifted the weekly Codex ceiling after usage
reached 36%. Continue economical parallel work and monitor usage. The owner
re-authorized monetary spending with a $20 TOTAL cap for model training and serving,
not a recurring budget. Allocated up to $0.05 for one opt-in ten-request GLM seed-curriculum baseline (2026-09-18), now complete: estimated token cost $0.00128995, no uncertain calls, retries, or training. Allocation retained until billing reconciliation. HF Pro purchase is blocked by
the owner's debit-card situation, but current HF documentation and account UI offer Jobs via
prepaid credits without Pro. Balance is $0; no top-up submitted. Product-model
separation and root-authored public redesign deployed and verified on 2026-09-18.

## Current product rebuild — 2026-09-18

- [x] w19: Deployed concise black chat with one-line activity, collapsed evidence, no diagnostic galleries, and rainbow MAX-only label — browser and deployed bytes verified
- [x] w20: Image generation, local save and refresh verified (f5bb8dbb-e46d-464e-a9fb-243abb56dba4, 1024×1024). Download format repaired and live download verified as .jpg with JPEG bytes. Retrieval remains limited to one hour; image prompt fidelity remains an open quality finding
- [x] w21: Asset library delivers usable licensed results — DONE 2026-09-19, by making the product tell the truth about what it can deliver. Canonical counts landed in 4f759b4 (510,014 items + 215 containers; the published 474,745 added packs to files and counted Creator Store duplicates up to 10x). The DELIVERY half was measured to the bottom with a control: InsertService:LoadAsset answers OK for an asset this account owns and "User is not authorized" for every library row, because free on the Creator Store is free to TAKE, not free to LOAD. The tool description told the model availability="insertable" means "you can pass this to insert_asset now" — false for all 81,648 live rows. availability now has THREE states: insertable (the id is in the inserting account), needs_take (a third party owns it; tell the user to take it and give them the sourceUrl instead of calling insert_asset and reporting a failure), needs_import (no id at all). insert_asset itself is now implemented and shipped, guarded so an asset carrying any script is refused before anything is parented. Evidence: docs/evidence/library-requires-ownership-2026-09-19.md.
- [x] w22: Apple MAX training dataset, isolated evaluation and saved model with verified serving — DONE 2026-09-19. Dataset rebuilt from committed verified sources (mlxdata-apple-v4: 233 rows, 110 families, 233/233 usable, 0.0% context-dependent, 153 tool trajectories, 0 harvested, verdict READY_FOR_PRODUCT_SFT; the old 404 harvested rows were 85.6% context-dependent with 0 trajectories and nothing in the repo even wrote them). Isolated evaluation on a family-disjoint held-out set, base vs adapter, scored by EXECUTION: tool trajectories 0/13 -> 8/13, game logic 0/8 -> 0/8; the base invented 5 nonexistent tool names, apple-v4 invented none. Serving verified: apple-v4 = ddde8377-8a76-4240-b083-b9e59cd38031 on @cf/meta/llama-3.2-3b-instruct, SERVED by a three-observation probe. The $20 cap in this entry was superseded by the owner; nothing was spent — training is local MLX and the upload is free. Evidence: docs/evidence/apple-v4-evaluation-2026-09-19.md, docs/evidence/lora-serving-verified-2026-09-19.md.
- [x] w23: UI library produces excellent, functioning Roblox UI with observed results — DONE 2026-09-19. Rendering OBSERVED in Studio play mode: balance card, objectives panel with a filled progress bar at 320/500, toast, and a scrimmed shop panel with priced rows. Purchase OBSERVED server-wired: client sends an id to a RemoteFunction, the server owns prices/wallet/ownership, grants 75 coins off 1,250 -> 1,175, and REFUSES the repeat click with "You already own that." leaving the balance unchanged. Evidence: docs/evidence/appleui-observed-in-studio-2026-09-19.md. Not claimed: this is not the product billing (the server script is a local stand-in), and the kit was installed by command bar, not through install_module, because the shipped plugin cannot reach this place.
- [x] w24: SaaS integration audit and critical-flow proof — DONE 2026-09-19 via scripts/critical-flows.mjs, which probes the DEPLOYED product and returns pass/fail/UNKNOWN with a control behind every check. pass 10 · fail 1 · unknown 4. AUTH: anonymous 401, forged token 401, exempt route 200 (so the gate is selective, not an outage). BILLING: config shaped and self-consistent, anonymous checkout 401. PERSISTENCE: D1 reachable, all five named tables present. MONITORING: build sha reported; SENTRY_DSN NOT SET is the one FAIL and stays open — an unhandled production error reaches nobody, and creating that account is not an agent action. The four unknowns are named with the credential each would need rather than counted as passing.
- [ ] w25: Independent fresh-context customer review of deployed app AND real Studio results recommends the product based on evidence; repeat review/fix cycles while within budget
- [x] w26: Primary-agent-owned black public presentation deployed, no banner gallery or simulated composer; root inspected production pixels and uploader verified 74 files. Further customer approval remains w25.
- [x] w27: Real 3D creation verified inside Studio — DONE 2026-09-19. GenerationService and GenerateModelAsync both confirmed present before use; the call returned a Model in 39.6s from the prompt "a small wooden treasure chest", and it IS a textured wooden chest with metal bands and a lock plate, visible in the viewport. Contents read back: Model > Model > MeshPart with a MeshId, and a descendant scan for LuaSourceContainer found NONE — generated content carries no code. Honest-unavailable handling exists in GenerationService.luau:319-322 and reports a missing capability as absent rather than offering a tool that fails at call time; read in source, never exercised live, because the service was available every time. On uploads: generation MINTS a mesh asset, which is inherent to the API and was explicitly authorized — and is a different thing from uploading harvested third-party content, which is what the rule protects against and which did not happen. Evidence: docs/evidence/generation-verified-in-studio-2026-09-19.md.
- [x] w28: Cheap non-GPT-OSS foundation model routing deployed — Apple endpoint reports GLM-5.3 Flash and native tool-call probe succeeded; this is NOT custom training
- [ ] w29: Independent Apple Studio plugin with explicit inspection/edit consent, safe typed operations, executable tests and real Studio verification; public distribution only after policy-compliant approval, not a renamed re-upload of the removed asset
- [x] w30: Product model choice separated from autonomy; limited free Apple retains build tools, MAX server/UI subscription-gated; identity persisted/exported. 3,217 worker tests and 1,823 web tests pass, live picker/disabled 3D observed. Both currently share foundation weights; custom training remains w22.

Review workflow: immediate consecutive harsh independent review → root fixes → verified deployment → fresh review.
Owner correction, 2026-09-18 (current Chat On Steroids continuation): functional success alone is insufficient. Generated Roblox UI, maps and low-poly assets must be inspected in the real engine against relevant original creator references for the requested genre. A prototype-looking result is unfinished even if its code tests pass. The reference collection must cover UI, map composition, props, materials, scripts and training needs; prefer low-poly construction rather than 4K texture detail. Build a large retrievable library of grounded skills and rules, and actually train/evaluate a model without calling a small pilot production-ready. Main owns visual design. Do not manufacture a positive reviewer verdict.
- [ ] w31: Curated genre reference catalogue with source provenance, recorded visual observations, coverage gaps and explicit reference-only versus reusable-asset rights
- [ ] w32: Hundreds of distinct source-grounded creation skills available through bounded runtime retrieval, with validation and real implementation/evaluation status kept separate
- [ ] w33: Genre-aware Roblox UI presentation and real engine visual review, including mobile layout, interaction states and comparison to the relevant reference profile; expand beyond the existing ten genres when a requested genre is not covered
The earlier `apple-independent-customer-quality-loop` heartbeat is no longer present: the app rejected a budget update because the automation does not exist (possibly manually deleted). It was NOT recreated. Reviews continue within active goal work; do not claim scheduled background recovery exists.
No weekly Codex ceiling currently applies; latest measured usage is 73% consumed. Training/serving budget is $20 TOTAL. The bounded ten-request baseline completed: estimated token cost $0.00128995, zero uncertain requests; conservatively retain its $0.05 budget allocation until billing reconciles ($19.95 unallocated). Canonical local allocation ledger is `packages/training/data/spend-budget-2026-09-18.json`; the evaluator now requires this existing ledger and reserves before inference across separate runs. It is not a provider-wide billing cap. No credential expansion without required approval.
Training progress: 10 original engine-independent Luau seeds in `packages/training/data/game-logic-seeds-v1`, all executed with property checks and assertion-failing semantic mutants; 8/1/1 family-separated split, zero detected eight-word overlap against 88 evaluation tasks. This is NOT a production-ready dataset or observed Studio trajectories. Live GLM baseline passed 7/10 exact contracts; three returned tables instead of requested functions. Responses and cost report are in `packages/training/data/game-logic-baseline-2026-09-18`. No model training began. Training plus site tests passed 125/125. Fresh customer round17 completed; its plugin entitlement/status-copy findings are being corrected by root; core public installation remains blocked.
Latest training artifact supersedes v1 for development only: `game-logic-seeds-v2` has20 original examples in20 families,16/2/2 splits; root reviewed/fixed extension boundary contracts and executed all reference answers/mutants. Final training suite98/98. No new paid call, training or deployment in this budget/data cycle. Total-budget guard is complete for the local evaluator, not provider-wide billing. Dataset remains explicitly not production-ready. Round19 found help/skip-link/credit-copy issues; round20 found one-hour image-result expiry and unclear image access while paid plans are unavailable. These remain open; fresh round21 now reviews returning-project navigation without mutations or spending.
Latest root UI release: `index-BJn5oV4H.js`, eight files verified by official uploader. Site pricing/status availability corrected and production bytes compared; API status no longer claims all systems/builds work. Live Usage breakdown changed from “Usage stone 455” to “Agent 455” using canonical legacy-mode mapping, never inferring Apple/MAX from old records. Regression failed before fix; web tests1841/1841, site38/38, web build/typecheck and copy gate pass. Fresh customer round18 is running. Backend revocation changes remain local pending separate security verification/deployment.
Round18 follow-through supersedes the web bundle above with `index-DI2PkNAM.js`: extra-credit balance now says purchased OR granted (the owner requested a grant; no evidence this balance is systemic), and Studio no longer advertises all-tier collaboration as an exclusive benefit. Shared behavior remains unchanged. Combined web/site1881/1881 pass; both builds pass; uploader verified8webfiles; root compared live pricing bytes and verified both updated surfaces in Chrome. Fresh round19 now reviews settings/help/accessibility. Core public Studio installation still blocks ordinary new customers.
Revocation fence deployed as worker `a316ba77-c05c-4b03-8a52-0c6072c55b3b` after root's independent typecheck and worker3249/3249 run. Root replaced the hold-expression pin with an executable eight-case truth table and a missing-fence mutant;6/6 focused pass. Initiator separated from owner billing, revoked/demoted/suspended/expired member runs stop at durable/model/queue/poll boundaries, regrant does not revive the invalidated run. Limits: membership notification remains best-effort after DB/KV mutation; lost pushes can leave a run alive, no delivery retry/outbox yet. Legacy unidentified runs are not guessed at; already-delivered Studio operations cannot be undone. Live worker upload/version and health verified, not an actual production revocation/Studio scenario.
Asset progress: local ingest no longer drops rows at lifecycle batch boundaries. Dry-run accounts for 524,002 unique local records in 1,049 batches (94,334 carrying Roblox IDs, not proof of live availability). No live ingest occurred. Stale public inventory counts were removed and import/Credit limits clarified in verified web bundle `index-ClgbnafO.js`. Round 12 verified Settings fixes with no new defect in its bounded review; round 13 is reviewing asset-source/onboarding journeys. w21 remains open until actual licensed insertion is observed.
Latest release: worker `d03a562e-0efa-46f8-a22a-6fa9726772b6`, web `index-zriocBJV.js`. Search hits carry canonical libraryId and provenance; explicit module replacements omit create and use the observed source hash. Settings loading/error and round-14 planned-pricing contradictions repaired. Round 15/16 findings addressed: inert navigation background, project search with clear/zero-results state, no false “nothing built/not linked” claims from missing metadata. Root verified production desktop/mobile focus restoration and search; full web 1,847 and worker 3,243 tests passed; earlier this turn site 36 passed. Usage export now supports live legacy storage via a narrow aliased fallback. No Studio or paid GPU operation occurred.
Live Supabase audit: all 10 public tables have RLS; archive/pinning/tags/lifecycle columns exist. `usage_events.sparks` versus expected `credits` drift is handled in deployed export compatibility, with both PostgREST projections verified using limit=0 and no customer rows. SQL hardening remains separate. Sentry's existing org has no projects; approval for creating two error-only projects is pending. Fresh reviewer spawning hit the agent-thread limit after round 16; do not describe further rounds as running. Pure training-trajectory ledger and its 6 tests are complete but unconnected: no collection, consent authentication, dataset, training, or serving claim.
Round 1 did not recommend the product. Evidence and verified fixes:
`docs/evidence/customer-review-cycle-2026-09-18.md`.
Next priority is the public plugin installation blocker and a complete observed Studio result;
do not interpret the repaired status copy as repairing the underlying Roblox build.

- [x] w1: Conversation export — DO handler, worker route, JSON + Markdown, client download, gate
- [x] w2: Project rename — worker route, workspace UI, RLS already permits it

## Workspace — the surfaces a daily user touches

- [x] w3: Command palette — one keystroke to every action, searchable, keyboard-only
- [x] w4: Keyboard shortcuts — a real map, discoverable from the palette, no browser collisions
- [x] w5: Conversation search — across a project's messages, server-side, not a client filter
- [x] w6: Conversation archive — hide without deleting, restore, and a way to see archived
- [x] w7: Message edit and resend — correct a prompt without retyping the thread
- [x] w8: Stop and retry a run from the workspace, not only from the plugin
- [x] w9: Drafts — an unsent message survives a reload

## Memory

- [x] w10: Memory viewer — what Apple believes about this project, readable
- [x] w11: Memory editor — correct or delete a belief, with the change taking effect next run

## Billing — the SaaS the owner asked for

- [x] w12: Plans and credits surfaced in the product, not only in the webhook — on grow/main (b0f86ae), pending merge
- [x] w13: Usage meter against plan allowance, visible before the run not after — on grow/main, pending merge
- [x] w14: Upgrade and downgrade path through the UI, with the entitlement recomputed — on grow/main (ba72fec), pending merge; needs STRIPE_SECRET_KEY + price ids set to go live

## Quality

- [x] w15: Error taxonomy — every failure the user can see says what to do next — on grow/main (193e773), pending merge
- [x] w16: Empty, loading and error states re-audited across the new surfaces above — on grow/main (13eea14), pending merge
- [x] w17: The whole suite, typecheck and E2E green, recorded as gate evidence — run on grow/main (925fbf6): typecheck clean, 1407 pass / 1 fail (the agreed phaseForTool red) / 4 skip, e2e 54/54. Gate EVIDENCE deliberately not written: it would have to go in main's GATES.md for a suite main does not yet contain. Belongs to whoever runs the gates after the merge.
- [x] w18: Project archive migration present in live Supabase — 2026-09-18 read-only catalogue and migration history confirm `archived_at` and migration0004. No replay or new SQL write performed.
