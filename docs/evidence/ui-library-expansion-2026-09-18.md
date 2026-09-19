# AppleUI library expansion — local, engine verification pending

Root-authored implementation, 2026-09-18. **Not deployed or verified in Roblox Studio.**
Native computer inspection stopped when CUA reported the Mac locked and automatic unlocking paused.
The owner was asked to unlock it; no bypass or existing-place mutation was attempted.

## Implemented

The existing first-party `ui_kit` installable module now also provides:

- Up to eight ordered, scrollable objectives with validated finite progress, explicit completion,
  and an unknown-progress state. A full bar alone does not fabricate completion.
- Five bounded FIFO notifications, with explicit capacity refusal, 2–12-second duration, reduced
  motion, no focus capture, and paused timers while the modal shop is open.
- Automatic-height objective/notification text, UTF-8-preserving truncation and disabled rich text.
- Atomic validation before replacing displayed objectives or shop items, including sparse and
  malformed arrays. Destruction disconnects the timer and clears queued notifications.

The installation catalogue describes the actual controller API and explicitly requires server
authority. These remain presentation components, not a quest/reward system or an economic authority.
The main agent owns all visual/component changes; the independent agent audits roadmap integration.

## Tests and limits

Root executed 25 focused Luau behavior tests covering old shop behavior, new components and the
isolated proof server. Three mutations were caught: excessive queue capacity, leaked lifecycle
connections and charging in the wrong direction. The API doubles do not implement Roblox layout,
input routing, networking or real engine permissions.

The first full worker run caught catalogue API lines missing their owning module name. The API
description was clarified; after the roadmap correction, the final full run passed **3,279/3,279**,
log `/tmp/apple-ui-library-final-reviewed.log`. Worker TypeScript checks also passed. The combined
focused roadmap suites passed55/55.

The independent audit found a real integration hazard: UI text was interpreted as gameplay quest
evidence. Root rejected the agent's first header/path-only exemption because edited user code can
retain those markers. Final detection compares actual known module source; a matching capped
prefix yields unknown code evidence, not a claim about the unread tail. Separate gameplay and
modified modules retaining the header still count. Custom install paths work too. Five dedicated
behavior tests cover these cases. The readable-HUD brief now explains when to use the components
without adding unsolicited quests. This remains a heuristic project scan, not engine verification.

## Actual engine test artifact, not an engine result

`node scripts/build-ui-proof-place.mjs` compiles the current AppleUI module plus two proof scripts,
then uses Rojo to build a new temporary `.rbxlx`. It never opens, installs or publishes anything.
Each build writes source/artifact hashes and `studioExecuted: false` to a manifest.

Latest build at this recording:
`/var/folders/hw/0ybpmzsn323dbcc3cgjwrb700000gn/T/apple-ui-engine-proof-aKxYxf/AppleUI-proof.rbxlx`

SHA256: `983acb207a3e40b7b4f26ba2f811ad2a7efb0b81ec4ffa786503c676fa7ae490`.
Three scripts compiled successfully; root parsed the built XML and independently matched all three
embedded source hashes against the manifest (ModuleScript, Script, LocalScript). The fixture refuses
to run outside Studio. Its session-only
test shop uses server-owned prices and balance, duplicate-request throttling, a three-upgrade cap,
and server-confirmed feedback. No DataStore, Robux purchase, external HTTP, asset upload, plugin
installation or persisted gameplay state is used. Executed mock tests check these server decisions.

Opening this isolated place and pressing Play still needs authorized native computer access.
Its in-engine assertions have **not** executed. Actual narrow/landscape layout, text fit, scrolling,
touch/gamepad navigation, purchase feedback, respawn and teardown are still required. Generated
files and green compiler results are not screenshots or proof of a successful customer game.

## Budget and product state

No provider calls, purchases or deployments this cycle. Canonical training ledger still reserves
$0.06 of the $20 total cap; $19.94 remains unallocated. Weekly Codex snapshot: 85% consumed.
WORKLIST w23 remains open. The failed model pilot is not promoted. Broader SaaS/model/Studio
requirements remain incomplete; customer review rounds 28/29 produced additional findings.

Primary API references checked for implementation:
[UIListLayout](https://create.roblox.com/docs/reference/engine/classes/UIListLayout),
[GuiObject sizing](https://create.roblox.com/docs/reference/engine/classes/GuiObject),
[RemoteFunction](https://create.roblox.com/docs/reference/engine/classes/RemoteFunction),
[RunService](https://create.roblox.com/docs/reference/engine/classes/RunService).
