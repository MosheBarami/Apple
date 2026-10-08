---
name: existing-games
description: Working inside a place someone else built. Covers surveying first (get_project_tree, list_scripts, search_scripts, read_script), finding and reusing the place's conventions (folders, naming, modules, remotes, data layer, frameworks), making minimal changes, reading errors from get_output_logs and play_check, fixing bugs safely, refactoring without breaking behaviour, and explaining findings to the user. Load whenever the place already has scripts or content and the request is to fix, extend, change, review or explain it.
---

# Working in an existing game

The place is someone's work. Understand it before changing it, follow its conventions, change as little as the request
needs, and prove nothing else broke.

## 1. Survey before touching anything

1. `get_project_tree` at the top level (Workspace, ReplicatedStorage, ServerScriptService, ServerStorage,
   StarterPlayer, StarterGui, SoundService, Lighting). Note how content is grouped and named.
2. `list_scripts` for every script with its class and location. Count them; spot the entry points (server Scripts in
   ServerScriptService, LocalScripts in StarterPlayerScripts/StarterGui).
3. `search_scripts` for the things the request touches: names from the request ("coins", "shop", "door"), and the
   plumbing: `RemoteEvent`, `OnServerEvent`, `DataStoreService`, `require(`, `CollectionService`, `leaderstats`,
   `ProfileService`/`ProfileStore`, `Knit`, `Fusion`, `Roact`/`React`, `Packages`/`_Index` (Wally).
4. `read_script` the relevant ones fully before editing. Follow `require` chains to the modules they use.
5. `get_output_logs` to see existing errors and warnings before you change anything — so you do not blame yourself
   for old errors or miss that the bug is already logged.
6. Summarise to yourself (and briefly to the user when it helps): architecture, data flow, where the requested change
   belongs.

## 2. Conventions to detect and follow

- **Structure**: where modules live, one-script-per-system vs scattered scripts in parts, a framework (Knit services/
  controllers, a custom loader), `Shared`/`Server`/`Client` folders.
- **Naming**: PascalCase vs camelCase for modules, variables, remotes; folder names (`Remotes`, `Events`, `Modules`).
- **Style**: tabs/spaces, `--!strict` or not, type annotations, `local Players = game:GetService("Players")` header
  style, how errors are handled.
- **Data layer**: one module owns DataStores (ProfileService/ProfileStore, a custom DataManager). Use its API to add a
  field; never open a second DataStore for the same player data. Add new fields with defaults so old saves load.
- **Remotes**: where they are created (pre-made in Studio vs created by code), how they are named, any wrapper
  (a Net/Remote module). Add yours the same way.
- **UI**: how screens are built (Studio-made ScreenGuis, a UI library, code-generated) and controlled.
- **Third-party packages** (Wally `Packages`, vendored modules): do not edit them; work around or wrap.

Match these even when you would do it differently; mention improvements as suggestions instead of applying them.

## 3. Minimal changes

- Change only what the request needs. No reformatting, renaming or "cleanup" of unrelated code.
- Prefer `edit_script` with a small targeted replacement over rewriting a whole script.
- Add new behaviour next to related behaviour (extend the existing shop module, not a new shop script).
- Keep public interfaces stable: function names other scripts call, remote names and argument order, attribute and
  tag names, instance names that code looks up with `WaitForChild`/`FindFirstChild`. `search_scripts` a name before
  renaming or deleting anything that carries it.
- Before `delete_instances`, search for references (by name, tag, path string). Before moving an instance, check for
  hard-coded paths (`workspace.Map.Door`).

## 4. Reading errors and fixing bugs

Method:
1. **Reproduce**: `play_check` (server + client errors, screen, leaderstats) or `get_output_logs` after the action.
2. **Locate**: the stack trace gives `Script path:line`. `read_script` around that line; trace values back to their
   origin (who set this attribute? who fires this remote?) with `search_scripts`.
3. **Explain the cause** in one sentence before editing (e.g. "the client reads `leaderstats` before the server
   creates it, so `WaitForChild` is needed").
4. **Fix the cause**, not the symptom: do not wrap failing code in `pcall` to hide an error unless the operation is
   genuinely fallible (network, DataStore).
5. **Verify**: re-run `play_check`; the error is gone and no new ones appear; the feature works.

Frequent causes in inherited places (details in the `roblox-scripting` skill):
- Race conditions: client indexing instances that are not replicated or streamed yet (`WaitForChild`), connecting
  `PlayerAdded` after players joined, character not loaded.
- Server/client mix-ups: LocalScript in Workspace (never runs), server code reading `Players.LocalPlayer` (nil),
  client changing values the server owns (changes do not replicate).
- Deprecated APIs (`wait`, `spawn`, `delay`, `Humanoid:LoadAnimation` without Animator, `BodyVelocity`): replace
  only where they cause the bug or when asked.
- Free-model leftovers: duplicate scripts, viruses (`require(<number>)`, `getfenv`, `loadstring`, obfuscated text,
  scripts named like "Vaccine"/"Fix"). Report and remove them with the user's knowledge.

## 5. Refactoring without breaking

- Only when asked or when the change cannot be made cleanly otherwise. State the plan in `update_plan`.
- Work in small steps; after each, `play_check` and compare with the baseline (same leaderstats, same UI, no new
  errors).
- Keep old names working while moving (e.g. leave a module that re-exports the new one) when other scripts depend on
  them, then update callers.
- Never change DataStore names or key formats on a live game: existing player data would be lost. If the shape must
  change, migrate on load (version field) and keep reading the old shape.

## 6. Explaining findings

When asked to review or explain, answer with:
- what the place is and how it is organised (services, main systems, data, remotes);
- what the requested part does, with script paths and line references;
- problems found, ordered by severity (data loss, exploits — trusting client values, errors, performance, style);
- what you changed (if anything) and what you recommend next, separately.
Quote short snippets only when they matter; never paste whole scripts back.

## 7. Before finishing

- `get_output_logs` / `play_check`: no new errors compared with the start.
- `search_scripts` for any name you changed: no stale references.
- Tell the user exactly which scripts and instances you modified or added.
