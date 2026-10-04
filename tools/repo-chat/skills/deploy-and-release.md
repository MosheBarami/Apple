---
name: deploy-and-release
description: Explain how the worker, the site/app and the Studio plugin are deployed or released, what is live, and what needs the owner's consent.
---
# Deploy and release

Use for "how do we deploy", "what is live", "how is the plugin released", "what version is deployed".

1. `read_file` the "Develop & deploy" part of `README.md` (search "wrangler deploy" with `search_code` to get the lines). It lists the worker deploy, the static site/app deploy (`infra/deploy-static.mjs`), the plugin build and the e2e script.
2. Read `docs/GO-LIVE.md`, `docs/DEPLOY-INTEGRATION.md` and `docs/PLUGIN-RELEASE.md` (find them with `list_dir docs` or `search_knowledge`); the owner's memory notes on deploy workflow are in `search_knowledge` "deploy workflow worker static plugin".
3. The plugin ships from `apps/studpilot-plugin` (Creator Store is the install path per ADR-017 in `docs/DECISIONS.md`); `.github/workflows/plugin-release.yml` and `ci.yml` show what CI does (CI never calls a paid provider and has no deploy step).
4. What is deployed right now: `search_knowledge` "deployed" and read `docs/autonomy/CURRENT_STATE.md` and `HANDOFF.md`; confirm with `git_log` (commit hashes named as deployed) and `git_branches`. Report the deployed commit hash and date only if a doc states it, and say how fresh that doc is.
5. Consent rules: the project says to ask the owner before anything destructive, paid or external; the owner's standing consent (memory, 2 Oct 2026) is in `search_knowledge` "standing consent". You are read-only: describe commands, never claim to have run them.
6. Answer with the sequence of steps, the files involved, what is live (with date and source), and caveats. Cite `path:line`.
