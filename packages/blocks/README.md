# Blocks

A block is a reviewed, parameterised piece of a Roblox game (plan section 3.3). The model picks blocks and fills their
parameters; the worker's interpreter (`apps/worker/src/recipe.ts`) runs them through the Studio plugin's ops and checks
every step. The system never picks a block itself.

`node scripts/gen-blocks.mjs` validates every block and compiles them into `apps/worker/src/blocks.generated.ts`;
`--check` exits 1 when that file is stale or a block is invalid.

## Folder: `packages/blocks/<kind>/<id>/`

| File | Holds |
|---|---|
| `block.json` | `id` (the folder name), `kind` (the parent folder: `ui`, `system`, `prop`, `zone`, `fx`, `lighting`), `summary` (one line, at most 120 characters, shown in the model's menu), `params` (a JSON Schema object; every property has a `default`), `provides` (APIs other blocks and custom code may call, e.g. `Economy.grant`), `depends` (ids of blocks that must be selected too) |
| `recipe.json` | `{ "steps": [...] }`, run in order. Each step has an `id` and an `op`: `create_instances` (`items`), `set_props` (`path`, `props`), `edit_script` (`path`, `file` under `src/`, `create: { className, parent }`) or `clone_instances` (`paths`, `parent`) |
| `src/*.luau` | the runtime code an `edit_script` step ships: reviewed, server-authoritative, commented |
| `checks.json` | what proves the block worked. Each check has an `id`, a `kind`, `describes` (plain words) and optionally `after` (the step it runs after; without it, it runs after the last step) and `param` (the parameter a failure points at, so the interpreter can ask for a better value and re-run the step) |
| `hint.md` | at most 600 characters for the model |
| `proof/` | a scripted Studio test |

Check kinds: `exists` (`path`), `prop` (`path`, `prop`, `equals`), `script_has` (`path`, `contains`), `play_clean` (a
play test with no client or server errors; always runs last, never `after` a step).

## Parameters

`{{param}}` slots may appear in any recipe or check string. A string that is exactly one slot takes the parameter's
value with its type (a number stays a number); a slot inside a longer string is interpolated, and a value that would add
a path segment (`.`, `[`, `]`) is refused. In `src/*.luau` a slot becomes a Luau literal (a string is quoted and
escaped), so a parameter can never become code.

Parameter schemas use only: `type` (`string`, `number`, `integer`, `boolean`, `array`), `enum`, `minimum`, `maximum`,
`minLength`, `maxLength`, `pattern`, `items`, `minItems`, `maxItems`, `default`, `description`. The worker's validator
(`apps/worker/src/block-schema.ts`) covers exactly this set, and the generator refuses anything else.

Every class and property a recipe writes must be on the plugin's allowlists (`apps/studpilot-plugin/src/Commands.luau`);
`apps/worker/tests/blocks.test.mjs` derives the list from the blocks and fails on a gap.
