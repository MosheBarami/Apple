# Rebuild on Cloudflare agents (owner request, 2026-10-05)

The owner's request: rebuild the site on https://github.com/cloudflare/agents-starter, `@flue/react`
(https://github.com/withastro/flue) and the ideas in https://blog.cloudflare.com/cloudflare-os/.

## What each source gives us

| Source | Version checked | What we take |
| --- | --- | --- |
| Flue (`@flue/runtime`, `@flue/vite`, `@flue/sdk`, `@flue/react`) | 2.2.2 | The agent harness. On Cloudflare, each `'use agent'` function becomes its own Durable Object built on the Agents SDK, with durable recovery, tools, skills and SQLite-stored conversations. `useFlueAgent({ url })` is the chat hook. |
| agents-starter (`agents` 0.17, `@cloudflare/kumo` 2.6, `streamdown`, Tailwind 4, Vite 8) | main, 2026-08-19 | The chat layout and Kumo, Cloudflare's design system, with dark and light modes; a reasoning display that streams and then collapses; tool calls that ask for approval; debug view of raw messages. NOT image input or vision (the product has no vision, plan 3.1). |
| Cloudflare OS (`cloudflare/cloudflare-os`, Apache-2.0) | blog post | Patterns only, because it is an internal company workspace, not a product base. Agents start with no access and get typed capability bindings; credentials never reach generated code; one "gatekeeper" Worker per external system (here: Roblox OAuth and the Studio plugin queue); all inference goes through AI Gateway. |

Everything stays on Cloudflare Workers with Supabase and D1: no new paid product.

## What stays

- Supabase auth and the project registry (RLS), billing and spend caps, legal pages, and the site's text.
- The Studio plugin (`apps/studpilot-plugin`) and its pairing protocol. The new agent reaches it through one
  gatekeeper (the existing worker's op queue), not directly.
- The M4 decision rule: the harness executes only a block the model selected in this run.
- The frozen 60 dev requests and the M3 harness, for measuring the new agent against the old one.

## Stages, first draft (replaced by the revised stages below)

- **R1, the shell.** Add `apps/studio` (Vite with `@flue/vite` and `@cloudflare/vite-plugin`, React 19, Kumo,
  Tailwind 4). It holds one Flue agent, `StudPilot`, on Workers AI through AI Gateway, with the four read-only tools
  (status, list the tree, read a script, read a property) going through a service binding to the `studpilot` worker.
  It deploys as its own worker `studpilot-studio` on workers.dev; the Supabase JWT is checked at the gatekeeper.
- **R2, the tools.** Port the post-M4 tool set (25 or fewer) as Flue tools. Writes need approval in the UI
  (agents-starter's approval cards); blocks come from `packages/components`.
- **R3, the app.** Rebuild `/app` (projects, the workspace, settings, billing) with Kumo and `useFlueAgent`.
  Keep the routes and the current features (sign-in providers, the 13+ gate, one-click create, history).
- **R4, the site.** Rebuild the Astro marketing pages with Kumo components as React islands (Flue is an Astro project),
  keeping every claim and legal text and their tests.
- **R5, the switch.** Serve `/app` from the new worker on studpilot.app. Remove the old SessionDO agent loop once the
  5-request smoke test is not worse than the M3 baseline in any area. Data moves only after 7 days (handoff M1).

## The open-source base (owner request, 2026-10-05, second message)

The owner named four Roblox projects to rebuild around. Checked 2026-10-05:

| Project | License | What it is | How we use it |
| --- | --- | --- | --- |
| [Nixera-Studio/roblox-ai-studio](https://github.com/Nixera-Studio/roblox-ai-studio) | MIT | Luau plugin (long-polls a backend, one undo step per action) with ScriptOps, InstanceOps, LogOps, PlaytestOps, TestOps and an in-Studio chat panel; a Node backend where a Coordinator hands work to a Planner, Coder, Reviewer and Test Engineer, with a `run_tests` QA loop | **The core.** Its plugin ops come into `apps/studpilot-plugin` behind our allowlist (`Commands.luau`). Its agent team becomes Flue subagents. Its chat panel becomes a second front end in Studio. NOT `VisionOps` or `capture_viewport` (no vision, plan 3.1); `RunLuau` only if it passes the allowlist |
| [Chrrxs/robloxstudio-mcp](https://github.com/Chrrxs/robloxstudio-mcp) (maintained fork of boshyxd/robloxstudio-mcp, which is archived) | MIT | MCP server plus a roblox-ts plugin; 49 tools including line-level script edits, `grep_scripts`, `solo_playtest`, `get_runtime_logs`, `find_and_replace_in_scripts` | **Tool contract.** Our tool names, schemas and descriptions follow its definitions where they overlap, so external MCP clients and our agent see one surface. Its playtest and runtime-log handlers are the reference for ours |
| [madebyshaurya/stud](https://github.com/madebyshaurya/stud) | **AGPL-3.0** | Tauri desktop app (React 19 with prompt-kit) plus a Rust bridge and a plugin | **Ideas only, no code.** Copying it would put all of StudPilot, a hosted service, under the AGPL. The owner decides: BLOCKED.md N10. Ideas taken: show each action live, one undo waypoint per AI change, diff view for script edits |
| [iamjrmh/mcpbridge](https://github.com/iamjrmh/mcpbridge) | MIT | Local MCP server that talks to Studio and Blender over localhost ports | **Not used.** Local only, and what it does is covered by the two above. Listed for credit |

All four assume a local backend on the creator's machine. StudPilot is hosted, so their transports are
replaced by our pairing code and the cloud long-poll; everything else keeps their shape. The MIT notices
go to `THIRD_PARTY_NOTICES.md`.

## Stages, revised for the open-source base

- **R1, the shell (built).** `apps/studio`: a Flue agent with Kumo and `@flue/react`, reading a place through
  `StudioGate`.
- **R2, the Studio side.** Port roblox-ai-studio's ScriptOps, InstanceOps, LogOps, PlaytestOps and TestOps
  into the plugin, behind the allowlist, with one undo waypoint per call. Tool schemas follow robloxstudio-mcp.
  `StudioGate` gains the write tools; the UI asks for approval before each write.
- **R3, the team.** Coordinator, Planner, Coder, Reviewer and Test Engineer as Flue subagents, with the
  `run_tests` QA loop. The M4 rule still holds: blocks are chosen only by the model.
- **R4, the app.** `/app` rebuilt with Kumo; plus the in-Studio chat panel from roblox-ai-studio talking to
  the same agent.
- **R5, the site.** As before.
- **R6, the switch.** As R5 before: smoke test against the M3 baseline, then retire the old loop.

## Open PRs at the decision

- #34 (app): merged before the decision (57eec56f).
- #35 (site): its Playwright contrast check fails on /catalog. R5 replaces those pages, so there is no fix cycle;
  its text, legal and docs changes are taken into R5.
- #36 (M3 harness): still needed to measure the old agent as the baseline; merge once green.
- M4 (the cleanup branch, #38): stages 1 and 2 done (vision, the whole-game path and the owner library removed).
  Stages 3 and 4 move to the new agent: the Flue StudPilot agent's instructions stay at 10,000 characters or fewer
  and it is offered 25 tools or fewer per run, each with a test (R2 and R3), because the old loop is retired in R6.
