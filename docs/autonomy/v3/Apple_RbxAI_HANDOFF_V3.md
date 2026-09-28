# Apple / RbxAI — authoritative handoff V3

28 September 2026 · Owner-approved product reset after the Claude → Codex continuation.
**V3 is the handoff revision, NOT the Apple model/product version.** “Apple vX” is the owner's versioned product identity; do not invent a released version number.

## Read this first

Finish the existing Apple product using the owner's decisions Q1–Q38 and the final 23-component UI requirement in this conversation. These decisions replace conflicting V1/V2 handoff instructions, old D-VISION clauses, prompts, tests, dashboards and automation text. They do not retroactively change what was actually implemented. This package changes documentation only: no repository edits, deployment, Studio operation, training, purchase or live acceptance test was performed while preparing it.

Read this file first. Other files are on-demand references, not mandatory context for every turn. Preserve the historical evidence in `Apple_RbxAI_HISTORY_V3.md` and `Apple_RbxAI_STATE_V3.json`; do not revive its superseded instructions. The old “55%” is not progress against this new scope. Current V3 readiness is **unmeasured**.

## 1. Product promise and locked scope

Apple turns even a rough one-line prompt into a complete, substantial Roblox game: the world, gameplay systems, progression, suitable content, UI, models, animations, VFX and SFX work together. It is not an asset-browser product, a training project, three fixed demos, a code-only assistant or a prototype generator. The intended customer is a beginner able to install and connect a plugin, with no requirement to understand scripts or folder structures.

Its specialty is modern, saturated, colourful **studded** Roblox games, with the quality and richness targeted by **Steal a Brainrot, Grow a Garden and Arm Wrestle Simulator**, plus original features. These are quality/functional acceptance families, not an instruction to claim current parity or constrain the product to those templates. The landing page markets prompt-to-complete-game creation, not “an AI limited to studded games.” All genres may be considered within this visual direction.

**UI-only theme selection:** `cartoony | studded | none`. `none` means Apple chooses the UI style; it never means omit UI. The world, props, effects and animation direction retain the studded specialty. The Apple website itself is a restrained, polished, near-black, modern agent workspace, not an in-game studded HUD.

**All product-facing language is English:** website, onboarding, plugin labels, agent responses, game text, errors and branding. This does not require translating the historical Hebrew evidence or rejecting imperfect/non-English input before interpreting its intent.

One project is one game. Persist game context, messages, plan revisions, assets, changes and checkpoints at project level. Returning to a project continues that game. Additional conversations, if already supported, share that project context; do not build a new conversation-branching subsystem as a prerequisite. General takeover/import-and-repair of arbitrary customer projects is out of scope. Owner corpus ingestion is a separate requirement and remains in scope.

Scope is locked. New nonessential ideas go to the next release unless the owner explicitly changes the baseline. No silent reduction to an alpha, and no perpetual addition of release conditions.

## 2. One product engine, no training

The only customer-facing engine is **Apple vX**. Remove the old Apple/Apple MAX split, model walls and model-linked product tiers. Remove user-facing **Plan, Agent and Autonomous** modes. Planning and execution remain internal stages, not choices the customer must understand. Keep legacy wire values only as a temporary, tested compatibility bridge where needed; migrate persisted data safely rather than renaming protocol strings blindly.

The game-building model is **GLM 5.3 Flash through Cloudflare**, requested identifier `@cf/zai-org/glm-5.3-flash`. The official Cloudflare page documents that identifier, function calling and vision [M1]. This is not authorization to switch to non-Flash GLM or another generative model. Product version changes represent major capability improvements, not a claim of newly trained weights. Record implementation/library revisions internally without announcing a new Apple version for every patch.

**Jev is backend decision support**, not a co-developer, game author, second chat persona or game runtime dependency. Use it for bounded semantic routing, selecting a retrieval path, classifying records and assisting documentation retrieval. Cloudflare documents `typesafe/jev` with typed state/questions [M2]; validate the actual deployed-account response before claiming integration. TypeSafe documents text input, not image input [M3]. It does not replace database reads, exact arithmetic, permission checks or evidence of success. Keep deterministic logic where sufficient; validate answers and fall back to existing deterministic/GLM paths on low confidence or failure.

**Training and LoRA are cancelled.** Remove training jobs, live supervisors, training-only runtime/build dependencies, obsolete model promotion flows and training dashboards from the active product. Preserve one recoverable historical archive where useful. Do not delete source games, usable corpus data or shared infrastructure merely because training once referenced them. No new open-weight model project, training loop or HF promotion requirement.

## 3. Build by composing rich systems, not millions of micro-actions

The model defines a genre-appropriate game specification and writes/adapts genuinely unique logic. A normal, typed execution layer handles bulk insertion, transforms, world settings, system wiring, UI assembly, dependencies and reversible changes.

Reuse complete maps, useful map regions and rich code systems from the owner's games and appropriate Roblox community sources: shops, tycoons, inventories, economy, saving, progression, etc. Preserve their source/provenance and dependency contracts, check compatibility, modernize where necessary, and cache approved reusable variants. Historical source code is not automatically current or production-safe. Do not strip all useful scripts and then force the model to reinvent every system.

Detailed props, UI and effects come from prepared assets; simple geometry and empty assembly containers may be created normally. A completed game can be “from scratch” for its customer while internally using reusable systems. This is not permission to deliver a mere recoloured template.

**Byte-identical rebuilt files are no longer a release gate.** Source preservation remains valuable, but correctness, appearance and gameplay govern acceptance. Document changes and do not hide missing features. A harmless serialization difference must not consume days of fidelity work; a broken transform, lost script or missing cross-component reference still matters.

## 4. Full library, efficient preparation, developer-owned internet research

All owner-supplied games/assets and the 400+ collected sources remain in scope. The builder/development agent—not the agent serving users in the Apple website—researches and downloads further **free, Roblox-specific community resources**, including forums, Reddit and dedicated repositories. The owner-listed resources remain inputs. Do not substitute generic OpenGameArt, Sketchfab, Poly Haven, Kenney or other general-purpose asset catalogs.

The owner asserts commercial rights for their supplied assets. Record this as owner-provided provenance, not an independent rights audit and not blanket proof for unrelated external downloads. Preserve external source terms and attribution once at ingestion; avoid repetitive licensing research for every insertion. Source discovery, review and downloads belong to a finite release-library work package, not a runtime browser loop.

Extract/index the complete source corpus efficiently: stable source IDs, hierarchy, properties, code, relationships, media references and reusable units. Parse once, deduplicate by content, process in resumable batches, cache derived artifacts and query with bounded results. Do not copy the complete history/corpus into model context.

**Not every microscopic node needs a separate screenshot, long description, materialized file and Studio test in advance.** Prepare rich useful units in batches; generate expensive detail on demand from already-ingested data and cache it. An unavailable external asset is not “downloaded,” and a media ID is not a locally available sound/texture. Track indexed, packaged, downloadable, insertable and functionally verified states separately.

A source/category/reusable-system manifest defines “100% of the official release library.” It must cover the actual supplied corpus plus the committed Roblox-specific resource collection and functional needs. No unexplained omissions, infinite internet-completeness claim, or per-million-node test campaign. Ingestion completeness does not by itself prove game-building completeness.

The released website and library must not depend on the owner's Mac. Execute construction in the **customer's connected Studio**, with project-authorized cloud access to prepared artifacts. A working local gateway is a reusable development asset, not proof of a multi-user cloud delivery path.

## 5. Customer flow and reliable execution

The composer is locked until the correct Studio place is paired, connected and authorized. It cannot be focused/typed/submitted; theme/build controls are inactive. Validate the same rule server-side. The single Apple version label is informational, not an old model selector. Project history and installation help remain readable while disconnected. **Do not disable Stop because the composer or socket is disabled.**

A build request is persisted, interpreted and expanded into a complete genre-specific feature/content plan. Show a brief public plan and proceed automatically: no compulsory planning questionnaire, per-asset three-choice preview, or routine approval gate. Explicit “discuss only” requests must not mutate Studio.

Accept user direction during a run. Queue and apply it at a safe boundary, revise only the affected plan and avoid duplicate concurrent writers. On Studio disconnection, checkpoint/pause. After reconnection to the correct place, the user presses **Continue**; do not auto-resume or replay completed actions. Stop requires real server acknowledgement and bounded cancellation. Preserve partial results and failures honestly; repeated unchanged failure leads to diagnosis or a different path, not infinite retries.

The owner removed the automatic in-product screenshot/reference-comparison/self-critic loop. Do not recreate it under another name. Short execution checks and targeted repair of concrete errors remain; the development team must still verify release results in Studio. User-requested image understanding and genuine result/branding images remain allowed. A screenshot card does not imply an autonomous critique cycle.

## 6. Codex-style output — latest UI decision wins

The previous “technical details can never be visible” and “erase all previous steps” rules are superseded. Every substantive agent response belongs to an evidence-aware conversation with understandable English summaries, public work progress, relevant files/systems, real sources and expandable detail.

Use all **23 components specified by the owner**, mapped in `Apple_RbxAI_UI_CONTRACT_V3.md`: AI Elements Reasoning, Shimmer, Sources, Suggestion, Task, Tool, Prompt Input, Plan, Message, Inline Citation, Conversation, Context, Confirmation, Checkpoint, Chain of Thought, Attachments, Agent, Code Block, Snippet, Image and File Tree; AICSS Streaming Text and Data Table.

These are a complete component vocabulary, **not a demand to place 23 panels in every message**. The UI is simple by default and inspectable on demand. Show only real events and applicable artifacts; never invent files, sources, tool actions, progress percentages or usage to fill a card. A public source reference may point to a prepared library record collected earlier; it is not evidence Apple browsed the internet during this run.

Reasoning/Chain of Thought render safe public explanations and execution stages, not hidden chain-of-thought, system prompts, credentials or private raw provider traces. Project files and provenance are visible only to authorized project users; the full backend corpus is still not a public gallery. Component names and documentation examples do not authorize restoring modes, public multi-agent controls, training, browsing or an IDE.

One persisted event source drives streaming and replay. Rich cards do not require extra model calls to narrate every small operation. Keep code, file trees and lengthy results collapsed/lazy until relevant. Source links and displayed counts must be grounded in the actual project revision.

## 7. Finished game and Generate Branding

Determine content volume from the prompt and genre. The specification includes the appropriate core loop, progression, economy, saving, onboarding, UI and world/content; optional genre systems are selected intentionally rather than added indiscriminately. Support **desktop, phone and tablet**; console/controller support is not a release requirement. Validate multiplayer where the chosen game requires it.

When a fitting asset is missing, adapt/recombine existing assets or choose a quality alternative preserving the idea. Report an essential unresolved gap instead of replacing it with low-quality primitives or declaring success.

The delivered Roblox game is editable and playable **without an Apple connection, active Apple subscription, GLM or Jev calls**. Prepare in-game monetization integration when appropriate, but keep products inactive until the game owner supplies valid configuration. Do not fake purchases or product IDs.

After the game, expose **Generate Branding** inside its project. It opens a separate details window with actual images, game-name suggestions and descriptions; results are editable, saved and reusable without rebuilding the game. Do not reduce this to a future suggestion or image prompts only. Implementation default: produce artwork using real game captures/prepared assets and compositing, with GLM generating names/copy/layout guidance. The UI Image component is a renderer, not an image-generation backend [UI20]. Do not silently add an unapproved model or imply GLM Flash generates raster images. Public Roblox publishing remains explicit, not automatic.

## 8. Deferred launch work versus removed product work

The destination is a self-service public commercial website. However, **live Stripe billing/subscriptions and public plugin distribution are held** until a new owner instruction or a distinct approved launch step after product completion. Do not charge customers, publish the plugin, send the old appeal or label those tasks done. Before launch, allow building only for the owner and approved accounts, through ordinary customer paths. Provide a working installation/connection route to approved testers; a dead Creator Store link is not onboarding.

Freeze voice, extra Discord upgrades, the expanded owner dashboard, multi-editor collaboration, public galleries and a separate general benchmark project. Keep already-working noninterfering capabilities, but do not extend them. Retain a small operational view for real runs, failures, cost and library readiness. Security, account isolation, saving, Stop and recovery are not optional cuts.

**“100%” means all locked product-completion gates pass; commercial launch remains separately held.** Use `Apple_RbxAI_ACCEPTANCE_V3.json`, not an old training/Apple MAX/three-review percentage gate. No numeric schedule, cost saving or readiness claim without evidence. Existing Cloudflare paid usage is authorized with no stated numeric cap, but use bounded economical calls, record usage/cost and never interpret this as permission for new subscriptions or waste.

## 9. Exact historical handoff and first work

Repository: `/Users/moshe/Desktop/RbxAI`; documented remote: `github.com/MosheBarami/Apple.git`. Historical stack: Cloudflare Worker/Durable Objects, React/Vite web, Astro site, Supabase, canonical `apps/apple-plugin`, and `packages/owner-corpus`. Do not confuse this with Blockwright or assume a current branch, deployed SHA, plugin version or running process.

The last Codex message is export lines **5787–5791** in `page-2026-09-28-00-28-15.md`. A private native-readiness service returned **203 model records from 230 reviewed files**, but a response/consumer mismatch prevented the plugin reading the catalog; the background fix was not shown completed. Another large-map conversion discrepancy remained. The final edit summary listed `gateway.py`, `gateway_native_readiness.py` and `test_gateway_native_readiness.py`. No precise field-level root cause is known.

Reported prior progress: 438 unique sources (411 binary, 27 XML); 9,619,989 binary nodes; 194,593 XML nodes; ItemShop 363 nodes inserted through Apple; a 2,875-node map unit; Simulator 244 objects; 19 verified references on one page; three units/2,296 nodes in one call. The 832-node lobby was inserted through Studio tools, **not yet proven through Apple**. Terrain/world settings/full gameplay remained incomplete. These are historical reports, not current live proof. Stop/F-069 and basic Discord were reported addressed; do not restart their old investigations without regression evidence.

First reconcile current code, relevant diffs, gateway, queued work and plugin narrowly. Adopt V3 in the current mission/decision/acceptance documents and mark old instructions superseded. Repair the catalog handoff if still needed. Triage the remaining map mismatch for actual functionality, not byte equality. Reuse completed extraction/batch work. In parallel migrate to the single engine and the new event/UI flow, remove active training/obsolete branches, and close the cloud-to-customer-Studio delivery path. Then prove complete games through the ordinary Apple UI, not manual Studio construction disguised as agent output.

Infrastructure replacement is authorized **only when a bounded comparison shows a faster, simpler path**, including migration and rollback. Preserve useful work; no blind rewrite, destructive reset, indiscriminate staging or deletion of user projects. Use small scoped parallel tasks when they save effort, one writer per file, and one integration owner. No re-reading millions of records or starting duplicate background jobs by default.

References: [M1–M3] and [UI01–UI23] are the exact official documentation URLs in `Apple_RbxAI_UI_SOURCES_V3.json`. Owner decisions are traced to the numbered questions in `Apple_RbxAI_DECISIONS_V3.md`. Historical identifiers and coverage are in `Apple_RbxAI_HISTORY_V3.md`.
