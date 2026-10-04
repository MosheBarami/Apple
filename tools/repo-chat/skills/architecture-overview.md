---
name: architecture-overview
description: Explain how the product is put together (worker, Durable Objects, web app, Studio plugin, data stores, packages) and where each part lives.
---
# Architecture overview

Use for "how does it work", "what are the parts", "what does X app/package do".

1. Call `repo_map` for the layout and one-line purposes of every app and package.
2. Call `search_knowledge` with "how it works architecture worker Durable Object plugin" and read the top hits. The root `README.md` ("How it works" and "Repo layout") and `AGENTS.md` section 1 and the architecture sections are the best summaries; `docs/DECISIONS.md` holds the reasons (ADR-002 Cloudflare Workers, ADR-003 Supabase, ADR-004 Studio plugin and typed op protocol, ADR-009 zero-secret data plane).
3. For any component you describe, confirm it exists in code: `list_dir` on `apps/<name>/src` (depth 1) or `read_file` its README.md. Do not describe a component you have not seen in a result.
4. Note the naming caveat: the product is called StudPilot, but a few spellings of the old name remain until the cloud steps run (cloud resource names, and wire strings the published Studio plugin still sends). Say so when relevant, and check `golem-rename-status` if the owner asks about it.
5. Answer in layers: one sentence for the whole system; the flow (browser -> SessionDO <- long-poll <- Studio plugin; agent loop; Workers AI + RAG; Supabase auth); then a short table of apps/packages with paths. Cite `path:line` for each claim.
