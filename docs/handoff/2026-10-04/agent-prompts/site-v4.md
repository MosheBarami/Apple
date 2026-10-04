RESUME NOTE (2026-10-04 handoff): this agent was stopped mid-work. The worktree /Users/moshe/Developer/RbxAI-site-v4 (branch site-v4) ALREADY EXISTS with deps installed; its last commit 6782c88a is an untested WIP snapshot (53 files: new Geist tokens/styles, Nav, Footer, docs kit restyle, Marquee deleted; it was about to finish the footer and add /catalog). If the worktree is missing: git -C /Users/moshe/Developer/RbxAI worktree add /Users/moshe/Developer/RbxAI-site-v4 handoff/site-v4 && pnpm install --frozen-lockfile there. Start by running the site build and checks to see what the WIP broke, then continue the original task below. Squash or amend the WIP commit into real commits when done.

---

You are rebuilding the Apple (RbxAI) marketing site from zero in a new design language, as the owner instructed. Work ONLY in the git worktree `/Users/moshe/Developer/RbxAI-site-v4` (branch `site-v4`, deps already installed with pnpm). Do not touch any other checkout, do not push, do not deploy, and do not open browsers in full screen (the owner is watching videos; use headless Playwright or `curl` only).

**Read first:**
- `/private/tmp/claude-501/-Users-moshe-Developer-RbxAI/b6bbbfc6-1fc4-4d3a-b31a-5c28d655ed47/scratchpad/design-language-v4.md`: the binding design spec, from the owner's references ai-sdk.dev and github.com/uhub/awesome-llm.
- `CLAUDE.md` and `AGENTS.md` in the worktree.

**Scope:** `apps/site` (Astro), covering every page: index, pricing, models, proof, status, changelog, docs/* (DocsLayout), privacy, terms, 404 and discord, plus a NEW `/catalog` page ("Awesome Apple", described in the spec).
- Replace the old styles (`global.css`, `landing.css`, `apple-minimal.css`, the Nav, the Footer and the layouts) with the v4 language: the black/white Geist canvas, hairlines, the code-window demo, the stats row, the feature row and the bento cards.
- The landing hero gets an install-chip equivalent: "Install the Studio plugin", a mono chip with a copy or download action pointing to the real plugin link already used on the site.
- The demo band has tabs (Build a world / Make UI / Add systems / Sound & FX). Each tab shows a mono "prompt" code window beside a chat-preview card answering with real tool calls (insert_model, insert_ui_component, add_behaviour, insert_sound, add_effect; check the real tool names in `apps/worker/src/tools.ts`).
- Add a dark/light toggle with no flash, respect prefers-reduced-motion, and use restrained motion (fade-up on scroll, tab crossfade, 1px card lift).
- Keep all existing content facts, links, prices and claims. Change presentation, not facts: the numbers are checked by scripts.

**Hard constraints (the repo has many source-text and copy tests):**
- Run `node --test tests/` at the root and the site-related checks in `package.json` scripts and `.github/workflows/ci.yml`: check-site-links, check-credit-figures, check-site-semantics, check-landing-budget, check-asset-wall, check-copy, check-deadends, check-rebrand, check-escape-hatches, and the `pnpm --filter` site build.
- Run the Playwright e2e specs that cover the site (`tests/e2e/landing.spec.ts`, `atmosphere-on-every-route.spec.ts` and others; look at the playwright config, and astro preview needs `--ignore-lock`).
- A test that pins the OLD design (for example atmosphere, Ember or a specific old class or colour) may be restated for the new design. Change it in the same commit and say why in the commit message, but never weaken a test that guards a fact, a link, accessibility, the budget or a claim.
- The landing JS/CSS budget (check-landing-budget) must still pass. Prefer CSS and tiny inline scripts; no new heavy dependencies. Geist fonts: self-host woff2 if a package is already available, otherwise Google Fonts with display=swap.
- Accessibility: semantic landmarks, visible focus rings, contrast AA in both themes, and alt text.
- Aim for Lighthouse ≥90 on performance, accessibility, best practices and SEO. If you can run Lighthouse headless via `npx lighthouse` against `astro preview`, do so and report the scores. Skip it if that needs a download over 100MB.
- Product name is Apple; infrastructure names stay golem where they already are.

**Commit** in small logical commits on `site-v4`, ending each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Finish** with a report covering:
- what changed, page by page;
- which tests you restated and why;
- the full output summary of the checks you ran (pass/fail);
- Lighthouse scores, if measured;
- 2–3 screenshot paths (headless Playwright, saved under the scratchpad dir above) of the landing page in dark and light modes and of /catalog.
