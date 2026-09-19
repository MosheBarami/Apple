# Independent Studio plugin capability follow-through — 2026-09-18

This records the executable boundary between the current Worker tool registry and the independent
`apps/apple-plugin` command bridge. The capability decision is operation-based. Plugin version is
not an input: version skew is expected, and `apps/worker/src/plugin-version.ts` already treats an
unknown client as compatible unless its wire protocol is explicitly below the served floor.

## Current measured plugin surface

`apps/apple-plugin/src/Commands.luau` currently routes these operations through real handlers:

- reads: `ping`, `get_tree`, `get_instance`, `list_scripts`, `read_script`, `dump_scripts`,
  `search_scripts`, `get_selection`, `get_logs`, `viewport_info`;
- typed edits: `create_instances`, `set_props`, `delete_instances`, `move_instances`,
  `transform_instances`, `clone_instances`, `group_instances`, `ungroup_instances`,
  `rename_instance`, `set_locked`, `set_visible`, `edit_script`;
- editor hand-off: `select`, `camera_focus`;
- evidence/recovery: `snapshot`, plus the separately preflighted/recorded `restore` path;
- generation: the deferred `generate_model` path when Studio's native generation adapter is
  actually available.

`restore` and `undo_waypoint` are handled as special write paths rather than ordinary `HANDLERS`.
A command having an executable path means the bridge understands the operation; it does not promise
that every invocation succeeds. Normal refusals such as no edit consent, wrong Studio mode, an
unavailable engine service, stale restore content, or invalid typed data still apply.

The same file names these operations as deliberately unsupported and returns a specific refusal:

| Studio operation | Current reason |
| --- | --- |
| `run_code` | Received text is never loaded, required, or executed inside Studio. |
| `run_mode` | Automatic Studio run-mode control is not supported; testing is started/stopped by the person in Studio. |
| `render_view` | This build has no bounded software renderer. |
| `screenshot` | Studio plugins have no direct viewport readback and this build has no verified renderer. |
| `insert_asset` | No remote asset loader is exposed through the command bridge. |
| `inspect_model` | The verified model-quality gate is not present. |

`apps/apple-plugin/tests/protocol-coverage.test.mjs` already checks that every shared `StudioOp` is
accounted for by a handler, a named refusal, the deferred generation path, or a special write path.
Those execution tables/branches are the right source for a capability report; a second list keyed by
plugin version would immediately drift. During this work the shared checkout moved `restore` from an
explicit refusal to a preflighted special write path; re-reading the live source caught that change,
which is exactly why capability-by-version would be unsafe.

## Worker assumptions that are not executable on this plugin

The Worker still registers tools whose implementation reaches the refused operations:

| Worker tool | Studio operations that matter to capability filtering |
| --- | --- |
| `run_luau` | `run_code` |
| `run_and_check` | `run_code`, `run_mode`, `get_logs`, `snapshot`, `restore`; its live frame stream also tries `render_view`, but frames are optional to the loop |
| `render_view` | `render_view` |
| `compose_thumbnail` | `render_view` |
| `inspect_visually` | `render_view` |
| `set_mood` | `run_code` |
| `add_effect` | `run_code` |
| `audit_build` | `run_code` |
| `run_spec` | `run_code` |
| `remove_effect` | `run_code` |
| `check_composition` | `run_code` |
| `insert_asset` | `insert_asset` plus typed tree/script/delete operations used by its post-insertion safety proof |
| `inspect_model` | `inspect_model` |

The system prompt also gives unconditional instructions to use these paths: `render_view` for the
visual finish, `insert_asset` for assets, `run_luau` for repeated geometry, `audit_build` before done,
and `run_and_check` in Rune mode. Filtering the model tool list without correcting those instructions
would still ask the model to do work it cannot execute.

There are two session bypasses that need the same effective capability set. The automatic visual
gate calls `runTool(..., 'inspect_visually', ...)` directly after a visual mutation, and the normal
tool-call loop passes model-returned calls to `runTool` without rechecking the set that was offered
to the model. Capability filtering therefore has to be an execution boundary as well as a schema
filter. This also prevents a denied or stale tool call from bypassing the existing mode/user tool
narrowing.

`screenshot_page` is a browser/web tool. It is unrelated to the Studio `screenshot` operation and
must not be presented as evidence of the Studio viewport. `viewport_info` is real Studio evidence,
but it contains camera values and spatial bounds, not pixels.

## Contract implemented in this branch

`apps/worker/src/plugin-capabilities.ts` defines `golem.studio-ops.v1`. A report consists of explicit
operation entries whose status is `supported` or `unsupported`; every unsupported entry must carry
a bounded one-line reason. Missing report, unknown schema, malformed input, duplicate operation
names, and operations omitted from a valid report all remain **unknown**. Unknown means the Worker
keeps its existing compatibility behavior. Only an explicit `unsupported` entry can withhold a
tool.

The helper accepts the already-authorised candidate tool set plus a requirements map and returns:

- the effective allowed `Set<string>`;
- the tool names withheld because of explicit unsupported operations;
- grouped operation limitations containing the plugin's precise refusal reason and affected tools;
- a bounded model note containing only Worker-owned operation/tool names. Plugin-authored refusal
  text is intentionally not promoted into the system prompt.

The helper deliberately contains no Worker-tool registry copy. The requirements belong next to the
real `TOOLS` implementations so the dependency and implementation change together.

The Worker-facing exports intended for integration are:

```ts
PLUGIN_CAPABILITY_SCHEMA
parsePluginCapabilities(raw)
pluginOperationVerdict(parsed, operation)
normalisePluginCapabilities(raw)
filterToolsForPlugin(candidates, requirements, rawCapabilities)
pluginCapabilityPromptNote(filter)

type ParsedPluginCapabilities
type StudioOpName
type ToolStudioRequirements
type PluginToolFilter
```

The wire DTO now lives in `@golem/shared` as `PluginCapabilityReportV1` /
`PluginOperationCapability`; the Worker parser remains separate because a TypeScript interface does
not validate an untrusted HTTP body.

`apps/worker/src/do/session.ts` imports the helper and derives the dependency map directly from the
live `TOOLS[*].studioOps` registry rather than maintaining another tool list.

```ts
const STUDIO_TOOL_REQUIREMENTS = Object.fromEntries(
  Object.entries(TOOLS)
    .filter(([, tool]) => tool.studio)
    .map(([name, tool]) => [name, tool.studioOps ?? []]),
);
```

## Integrated runtime path

The complete capability path is now wired:

1. **`Commands.luau`:** `Commands.capabilities(engine)` is exported at the bottom of the module. It
   derives supported operations from `HANDLERS`, `DEFERRED_MUTATING`, and the special
   `restore`/`undo_waypoint` branches; `UNSUPPORTED` wins exactly as it does in `execute`. A missing
   GenerationService adapter reports `generate_model` unsupported. A present adapter reports it
   supported; temporary native DynamicGeneration availability stays a per-call probe inside the
   generation adapter, so one transient outage is not cached for the whole pairing.

2. **`Bridge.luau`:** `Config.capabilities?: () -> any` is sampled once when a pairing becomes a
   live `Session`. The report is stored on that Session only and included as `outbound.capabilities`
   until the first valid successful poll response. Network failures and malformed replies retain it;
   reconnecting creates a fresh Session and samples a fresh report.

3. **`init.server.luau`:** the only new entry wiring is
   `capabilities = function() return Commands.capabilities(commands) end,` in `Bridge.new`.

4. **`tools.ts`:** every currently registered `studio: true` tool now carries a non-empty co-located
   `studioOps` list. The Worker test enumerates the live registry at runtime and fails if a future
   Studio tool lacks this metadata or names an operation absent from the shared `StudioOp` union.

5. **Shared wire:** `PluginPollRequest.capabilities?: PluginCapabilityReportV1` is additive and
   optional. Legacy clients send nothing. The DTO's `reason` field is explicitly documented as
   untrusted plugin text.

6. **Session pairing state:** the canonical validated report is persisted under
   `pluginCapabilities:<tokenHash>` and mirrored in memory with the active token hash. The same
   pairing survives Durable Object eviction and Studio-offline time. A new pairing clears the old
   report before its first await; revoke/expired pairing clears it too. A late poll carrying the old
   pairing hash cannot update the new pairing's in-memory report or storage key. Omission preserves
   an acknowledged report; a present malformed report clears it and returns to the helper's legacy
   compatibility behavior.

7. **Agent step:** the order is mode → user tool permissions → plugin capability filter. The same
   effective set drives model `toolDefs`, text-call recovery, artifact availability, automatic
   `inspect_visually`, and returned tool-call execution. Because a pairing can change while inference
   is in flight, execution intersects the newly re-read capability set with the set actually offered
   to that model call: reconnect can narrow a step but can never widen it after inference. A known
   unsupported returned call becomes a bounded failed tool result with `executed:false` and never
   reaches `runTool`/Studio.

8. **Prompt:** `systemPrompt` accepts `studioCapabilityNote`; SessionDO passes only
   `pluginCapabilityPromptNote(...)`, which is built from Worker-owned operation/tool names. The
   precise plugin-authored `reason` remains structured evidence and is never copied into SYSTEM.

9. **Completion honesty:** if render/visual inspection is explicitly unsupported, automatic visual
   critique is skipped and final visual prose is amended with the fixed statement that rendered
   appearance was not verified. If an artifact tool such as `generate_model` is capability-blocked,
   the failed attempt remains in the trace; subsequent prose cannot satisfy `artifactCompletion`, and
   the run ends `incomplete` unless a real successful artifact call occurs.

## What Apple can still build and prove with typed operations

The independent plugin is still a useful builder. `create_instances` can create bounded primitive
geometry, Models/Folders, common GUI objects, lights, constraints, highlights and value objects.
`set_properties` changes only allowlisted typed properties. `edit_script` creates or edits
Script/LocalScript/ModuleScript source with the existing read-before-write/base-hash protection.
Selection, camera focus, grouping, transforms and deletions are typed operations rather than arbitrary
code execution. `snapshot` and the current preflighted `restore` path provide typed checkpoint and
rollback behavior without arbitrary code execution.

Verification should be moved to Worker-side pure inspection over typed reads:

- **Read-back of edits:** `get_instance` after create/set/transform/rename and `get_tree` after
  structural edits. Report observed values, never the requested values.
- **Scene census and destructive delta:** derive paths/classes/counts from bounded `get_tree` data.
  This replaces the census Luau used by `run_and_check` for structural comparison; it does not make
  automatic run mode available.
- **Blockout/layout:** the plugin's current `get_tree` nodes already include allowlisted properties
  and attributes. For Parts this includes `Size`, `CFrame`/`Position`/`Orientation`, `Color`,
  `Material`, anchoring/collision fields and more. Worker code can derive bounds, height/mass
  dominance, material/color diversity and top-level composition metrics from that data instead of
  injecting `LAYOUT_LUAU`.
- **Deterministic build audit:** the same tree is enough for several current `audit_build` checks:
  unanchored static parts, factory-grey Plastic, material/color counts, very small geometry, basic
  overlap/coplanar candidates, and whether the Lighting service still has default-like typed values.
  Metrics that need data not present in the typed reads must be reported as unchecked.
- **Scripts:** `dump_scripts`/`read_script` feed the existing Worker-side parser, syntax review,
  symbol and dependency analysis. `get_logs` can read real Studio output after the user manually
  starts a test.
- **Framing hand-off:** `viewport_info` reports the real Studio camera CFrame/FOV/viewport size and
  top-level workspace bounds, while `camera_focus` can frame a chosen object for the person. Neither
  is a screenshot and neither supports a visual-quality verdict.

There is no honest typed replacement today for pixel-level visual judgement, automatic playtest,
remote asset insertion, arbitrary plugin-context Luau, or the refused `inspect_model` gate. A build
can be structurally verified and handed to the user for a Studio visual/playtest pass; it must not be
marked visually verified. Lighting can still use typed `Lighting` properties and allowed light
instances. Particle/post-processing effects whose classes are outside the plugin create allowlist
remain unavailable until the typed allowlist deliberately grows.

## Validation run

Measured in the shared checkout after the full shared/SessionDO/prompt integration:

```text
node --test apps/apple-plugin/tests/*.test.mjs
tests 25 · pass 25 · fail 0

node --test apps/worker/tests/plugin-capability-session.test.mjs
tests 5 · pass 5 · fail 0

node --test apps/worker/tests/plugin-capabilities.test.mjs apps/worker/tests/artifact-completion.test.mjs apps/worker/tests/prompt-tool-names.test.mjs
tests 19 · pass 19 · fail 0

node --test apps/worker/tests/collab-access-change.test.mjs apps/worker/tests/checkpoint-identity.test.mjs
tests 20 · pass 20 · fail 0

pnpm --filter @golem/worker typecheck
tsc --noEmit · exit 0
```

The tests exercise the named failure mode rather than source spelling: legacy/malformed/unknown-schema
reports preserve the old set; explicit unsupported operations remove all dependent fixture tools;
omitted operations stay compatible; contradictory reports fail back to unknown; exact refusal reasons
remain structured while plugin-authored text is excluded from system-prompt prose; the prose note is bounded without truncating structured limitation evidence;
the helper bundles for a Worker/browser runtime without filesystem or network access; and the plugin's
own protocol coverage proves the current handler/refusal/restore-preflight accounting against the shared
`StudioOp` union. The Bridge tests prove failed polls retain the report, a valid response acknowledges
it, and reconnecting reports again from a fresh per-pairing Session. The registry test enumerates every
live Studio tool, so adding a future one without `studioOps` fails immediately. The real SessionDO tests
use `node:sqlite` and prove same-pairing restart persistence, offline behavior, new-pairing clearing,
old-token race fencing, malformed-report legacy fallback, SYSTEM-note trust separation, a model-returned
forbidden `run_luau` producing zero Studio calls, visual verification remaining explicitly unverified,
and a blocked generated-model artifact remaining incomplete.

### Source/test fingerprint

Fingerprint algorithm: for each path below, in the listed order, SHA-256 is updated with UTF-8 path,
a NUL byte, the exact file bytes, then another NUL byte.

Source set:

1. `packages/shared/src/index.ts`
2. `apps/worker/src/plugin-capabilities.ts`
3. `apps/worker/src/tools.ts`
4. `apps/worker/src/prompts.ts`
5. `apps/worker/src/do/session.ts`
6. `apps/apple-plugin/src/Commands.luau`
7. `apps/apple-plugin/src/Bridge.luau`
8. `apps/apple-plugin/src/init.server.luau`

`SOURCE_AGGREGATE_SHA256 = 93cd007d72180d80d4bf745ce1b7fba5c7143a41af3fb1e89c97d0757d873dce`

Test set is the six focused/regression Worker tests used above plus the nine
`apps/apple-plugin/tests/*.test.mjs` files (15 files total, lexicographically sorted within the plugin
glob).

`TEST_AGGREGATE_SHA256 = 7698a64f74339a447ab682a4679fd88578c11e6753353bc6a53d108f08c15611`
