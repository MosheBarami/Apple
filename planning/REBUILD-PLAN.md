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

## Stages (each one merged, deployed and measured before the next)

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

## Open PRs at the decision

- #34 (app): merged before the decision (57eec56f).
- #35 (site): its Playwright contrast check fails on /catalog. R4 replaces those pages, so there is no fix cycle;
  its text, legal and docs changes are taken into R4.
- #36 (M3 harness): still needed to measure the old agent as the baseline; merge once green.
- M4 (the cleanup branch): continues, because it shrinks what R2 has to port.
