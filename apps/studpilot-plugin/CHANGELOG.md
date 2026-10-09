# StudPilot Studio plugin — changelog

## 2.0.0 — 2026-10-08

The first real release. Owner decision, 2026-10-08: **"i accept the reduced safety"** — the limits that kept blocking
the agent are removed; the gates that protect a place are kept.

**Permission model: allow by default, deny a short explicit list** (`src/Permissions.luau`, `src/ApiDump.luau`)
- Any class Roblox's API dump marks creatable may be created; any property it marks scriptable and plugin-writable may
  be set, typed from the dump. The ~1,000-line hand-written class/property/enum allowlists are gone.
- Denied, each with its reason: `Source`/`LinkedSource` (scripts go through edit_script), `Parent`, `ClassName`,
  script `Capabilities`/`Sandboxed`; CoreGui, CorePackages, plugin GUI/debug services, HttpService, ScriptContext,
  networking, DataStoreService and MarketplaceService; `HttpService.HttpEnabled`, `ServerScriptService.LoadStringEnabled`.
- Content properties take any `rbxassetid://<digits>`, `rbxasset://<path>` or `rbxthumb://<query>` (Creator Store and
  Toolbox assets included), or `""` to clear.
- Writes reach every normal service, now including Chat.
- The typed `{t,v}` decoder also takes PhysicalProperties, Faces, Axes, a font asset as a Font family, an enum item by
  name or number (typed from the dump) and a bare-position CFrame.

**Checkpoints never fail on an unknown class**
- A class is recreated from its dump properties, or held as a detached copy (unions, meshes, cameras, surface
  appearances, classes newer than the dump); only an object that can be neither is skipped and named. Values equal to
  Instance.new's defaults are left out; values the wire cannot carry are reported in `coverageNotes`.
- Bounds raised to 4,000 objects, 1,000 children per parent, 2.4 M characters of script.
- The worker no longer refuses a Studio write when the checkpoint cannot be saved; it says so in the result.

**New operations**: `grep`, `glob`, `list` (`src/ops/Search.luau`), `serialize`, `deserialize`
(`src/ops/Serialize.luau`), `run_tests` (`src/ops/Tests.luau`, TestEZ specs in a Test session).

**Reliability**: every payload sent is made valid UTF-8 (`Bridge.luau`); the play check's own deadline follows the
requested seconds, and run_tests ends at its timeout with partial results. The dock says "Allow StudPilot to reach
studpilot.app in the prompt Studio is showing" when the first request has not returned after 8 seconds.

**Kept**: writes only in edit mode and on a live connection, one ChangeHistoryService recording per op, the pairing and
token model, edit_script's written-source refusal list, and the detached-tree script scan on inserted assets.
