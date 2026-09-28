# Apple vX — conversation and interface contract V3

28 September 2026. Required by the final owner message, after Q24–Q38. This is an implementation contract, not a claim that the current website contains these components. Official component pages were read; the mapping below is Apple-specific design, not something those documentation pages promise to implement.

## Experience

A clean, near-black agent workspace with a readable English conversation is the primary surface. Friendly summaries serve the beginner; file/system/source evidence remains inspectable. Do not hide all technical detail under the obsolete V2 instruction, and do not turn the product into a crowded IDE. Current work is prominent; historical steps remain available in collapsed groups.

The header shows the current Apple vX identity and real Studio connection state. There is no model menu or Plan/Agent/Autonomous selector. Prompt Input owns the composer; UI theme options are exactly `cartoony`, `studded`, `none`. The in-game theme does not reskin the website. Only the correct, paired, authorized Studio connection unlocks writing and build controls; keyboard shortcuts and Suggestions obey the same gate. History and connection help remain usable. Stop must not inherit the composer's disabled state.

Every substantive assistant response uses the same structure where applicable: a readable result/intent summary; public work/plan and current status; affected files/systems; actual source references; output artifacts; a factual completion or unresolved-outcome note. Ordinary short replies need not fabricate file cards or citations. Never present demonstration data, imagined operations, invented code paths, made-up progress or synthetic screenshots as live activity.

## Required component map

All 23 families must be integrated for their applicable paths. They need not all be instantiated in one response. A component renders facts from the real run; installing it alone does not create the backend behavior. IDs link to exact official URLs in `Apple_RbxAI_UI_SOURCES_V3.json`.

| ID | Component | Documented function | Apple use | Required guard |
|---|---|---|---|---|
| UI01 | AI Elements — Reasoning | Collapsible streaming reasoning presentation. | Public execution explanation / Working section; safe summary text only. | Automatically track real active state. Never render hidden reasoning or duplicate the activity list. |
| UI02 | AI Elements — Shimmer | Animated text loading emphasis. | Indicate actual waiting/streaming beside the current step. | Stop on completion, pause or error; respect reduced motion; do not fake perpetual work. |
| UI03 | AI Elements — Sources | Collapsible sources and citations. | Sources actually used: library pack, reusable code system, cached documentation and project artifact. | Only real authorized provenance. A saved external origin does not mean live web browsing. |
| UI04 | AI Elements — Suggestion | Clickable suggestion row. | Relevant follow-ups after a response or initial ideas. | Respect Studio gate; no automatic new paid run and no compulsory asset-choice preview. |
| UI05 | AI Elements — Task | Collapsible workflow task presentation with file references. | Group meaningful world/gameplay/UI work and affected files. | Status is derived from task/operation receipts; avoid a separate model call to narrate each node. |
| UI06 | AI Elements — Tool | Tool invocation view with execution and approval/error states. | Inspectable typed invocation/result with file/system links and safe error detail. | Side-effect receipt governs success; redact payload secrets and paginate large results. |
| UI07 | AI Elements — Prompt Input | Composable chat input and submit controls. | English composer, UI theme, attachments, send/steering controls. | Hard disabled before pairing/connection/authorization; Stop is separately enabled during an authorized run. |
| UI08 | AI Elements — Plan | Collapsible streaming execution plan. | Public genre-specific feature/content plan, updated on steering. | A plan card is not a Plan mode or mandatory approval button; explicit talk-only requests never mutate. |
| UI09 | AI Elements — Message | Chat message and markdown/action component suite. | Canonical assistant/user messages, summaries and artifact sections. | Use real persisted text once; do not introduce response-branching/retry that replays mutations blindly. |
| UI10 | AI Elements — Inline Citation | Inline references with expandable source information. | Cite a source/file/system at the supported claim. | Resolve IDs server-side to real project revision/source records; no invented path or line range. |
| UI11 | AI Elements — Conversation | Conversation layout and scroll controls. | Persistent message/event history for one project/game. | Respect manual scrolling; reconnect hydration must not duplicate events or lose artifacts. |
| UI12 | AI Elements — Context | Context/token usage and estimated-cost display. | Compact per-run/model usage detail where telemetry exists. | Do not show Codex developer quota as Apple use. Unknown counts/cost are unavailable, not zero or guessed. |
| UI13 | AI Elements — Confirmation | Approval interface for consequential tool actions. | Restore/overwrite or other actually-required explicit authorization. | Not a per-asset gate. Denial is respected; do not restore removed product modes or auto-publish. |
| UI14 | AI Elements — Checkpoint | Conversation checkpoint marker with restore action. | Link durable project restore points to the associated run/changes. | A marker alone is not a backup; restore must use a real snapshot and safe authorized operation. |
| UI15 | AI Elements — Chain of Thought | Collapsible labelled steps with status and media support. | Public Activity timeline from observable execution stages. | Use as UI vocabulary only, never private internal thought. Avoid a second duplicated Reasoning panel. |
| UI16 | AI Elements — Attachments | Attachment display and preview/removal patterns. | User reference files/images and produced artifacts within the project. | Validate scope/type/size and authorization; attachment support does not add arbitrary customer-project takeover. |
| UI17 | AI Elements — Agent | Agent configuration presentation. | One Apple vX capability/operation identity card. | Show public capabilities, not raw system prompts/secrets. Jev does not become a visible second author. |
| UI18 | AI Elements — Code Block | Highlighted code with optional line numbers and copy actions. | Actual generated/modified project scripts, with identity/revision. | Lazy/collapsed for beginners; ensure full correct content when opened, no fake files or executable credentials. |
| UI19 | AI Elements — Snippet | Compact copyable code/reference display. | Short real script/path/configuration references where useful. | No invented commands or required manual coding workflow for beginners. |
| UI20 | AI Elements — Image | Renderer for AI SDK image data. | Actual output/branding images; use a typed adapter for capture/artifact data where needed. | This is not a generator. Label capture vs composed artwork and preserve provenance; never pass branding art as test evidence. |
| UI21 | AICSS — Streaming Text | Streaming text presentation with a caret. | Plain public status/message text while streaming. | One canonical stream; coordinate with MessageResponse rather than duplicate or replay artificial typing. |
| UI22 | AICSS — Data Table | Structured comparison/results table. | Real system readiness, results, source/resource tables and branding details. | Replace demo rows and column assumptions; small/lazy tables, no new model-wall comparison. |
| UI23 | AI Elements — File Tree | Expandable hierarchical file/folder view. | Actual project files and affected Studio hierarchy inside output detail. | Not a permanent full IDE or backend corpus explorer; identifiers resolve to authorized real objects. |

## One event stream, not several competing narrators

Implementation design: extend/reuse the existing stream transport and shared event vocabulary. Keep a persisted server-authoritative envelope for each event: schema version, event ID, project/run ID, monotonically ordered sequence, timestamp, public event kind/state, real operation/task ID where applicable, artifact/source references and a sanitized payload. These are proposed semantics, not asserted current field names.

Canonical event families: accepted request, public plan/revision, task progress, tool start/result/error, created/changed artifact, source used, checkpoint created/restored, Studio paused/reconnected, steering accepted/applied, usage, stop requested/acknowledged and terminal outcome. Stable IDs and replay cursors deduplicate reconnects. A human-friendly projection and an expanded technical projection use the same receipts. Do not call GLM merely to translate every individual inserted node into prose.

Proposed state progression:
`locked_disconnected → ready → planning → assembling → checking → completed | partial | failed | stopped`.
Disconnection during active work leads to `paused_disconnected`; successful reconnection leads to `awaiting_continue`, not automatic execution. Continue verifies project/place/revision and resumes from known completed operations. Steering can revise future tasks at a safe boundary; Stop interrupts it. Talk-only requests terminate without construction.

Real failures remain visible. Map operation states to the UI's supported values deliberately; do not mark “complete” because a packet was received. An operation may be applied but awaiting verification. A grouped insertion with some mutations before failure requires a partial-result record and specific recovery, not a false total rollback claim.

## Reasoning, Task, Tool and Plan have different jobs

Reasoning carries a concise public explanation of the current work. Chain of Thought presents observable labelled Activity steps, grouped at useful granularity. Task holds meaningful checklist work and links to affected files. Tool exposes the concrete call/result. Plan shows the intended feature scope and revisions. Collapse or choose the relevant projection to avoid four copies of the same event. Never render private chain-of-thought, hidden provider reasoning, system prompts or raw security policy.

No Plan approval button is required on every build. The component's demonstration button is not product policy. Confirmation is for a genuinely consequential action needing authorization, such as restoring over later edits; it is not an asset-choice or model-selection flow. Continue after reconnect remains explicit.

## Documents, sources and code

File Tree represents only real artifacts/current-project hierarchy. File selection opens the associated authorized revision, using Code Block or appropriate preview. It is not a full corpus gallery. Human labels explain what a file/system does without requiring the user to code. Snippet handles genuinely short references, not an invented command the beginner must execute.

Sources and Inline Citation bind to records of the data actually used. An asset source record should retain origin identity, prepared artifact revision, source URL/title when available, and a permitted project-facing description. A code claim must refer to the actual snapshot or location. Private absolute paths, tokens, account identifiers and inaccessible owner archives are not customer-facing citation destinations. Clicking a source is not permission to reveal the whole backend library.

The development agent may have collected an external source before release; product output can cite that saved origin. Do not label it “Searching the web” during a customer run when only prepared catalog retrieval happened.

## Images and Generate Branding

Image is a presentation component, not an automatic image-generation service. Use validated URLs/data and typed adapters for stored captures/composed images. Each asset has its own type: real Studio capture, user attachment, stored library preview or generated/composited marketing artwork. Never conflate them in verification claims. A library preview may be shown when useful without resurrecting compulsory three-way approvals.

Generate Branding is a real project action **after the game-building path**. It opens a separate window/panel, contains actual image choices/results, names and descriptions, supports editing/saving/exporting the resulting bundle, and does not rebuild the game. Text and results are English. Use the existing authorized model scope for copy and a real image-production route based on captures/assets/composition by default. Do not silently add an image model, return only prompts, pretend an image renderer generated artwork, or publish to Roblox automatically.

## Rendering and data integrity

Use AICSS Streaming Text for live plain text where appropriate and AI Elements Message/MessageResponse for message structure/markdown. Feed both from one canonical message, with no duplicated final paragraph or artificial replay delay. Shimmer reflects actual activity and stops on pause/error/completion. Respect reduced motion.

Context shows actual supported telemetry and clearly labelled estimated costs. Provider context use, customer usage and developer Codex quota are different things. Unknown usage is unavailable. Do not rely on demo model prices or assume the generic cost component knows the configured GLM/Jev route.

Use AICSS Data Table for genuine compact structured results, with dynamic rows/headers rather than its model-comparison demo. Render lazy/paginated large code, trees, tables and tool payloads. Keep keyboard navigation, focus restoration, readable contrast, mobile-safe dialogs and error states. Checkpoint has a real backend snapshot; UI rendering is not checkpoint creation.

## Integration notes and acceptance

Reuse existing legitimate AI Elements/AICSS code when present. Pin the actual component revisions and inspect local compatibility. Documentation examples that use Next.js, another model, voice, mock delays or synthetic tasks are examples—not requirements to replace the current React/Vite stack or add those features.

Both AICSS pages document registry installation. A direct web fetch of their registry JSON returned an internal tool error in this review; installation availability and entitlement were not tested. Use public or legitimately licensed sources and record the actual version. Do not declare them Pro-only based on a site-wide banner, and do not reconstruct inaccessible licensed source from previews.

Use a small real-event fixture set to validate all 23 renderers, then an actual product run for integration proof. Cover the disconnected gate, steering, a tool error/partial result, files/sources, Stop, reconnect plus Continue, checkpoint restore and persisted history. This verifies the interface contract without 23 separate paid model sessions. No pixel-perfect Codex claim is made; the owner requested its documentation-rich interaction style.

The recorded competitor HAR remains historical. Its mandatory plan approval, browsing and visual-critique loop are not imported when they conflict with V3. Its useful lessons are persistent conversation, honest long-running progress, genuine result artifacts, interruption and continuation—not its misleading completion states.
