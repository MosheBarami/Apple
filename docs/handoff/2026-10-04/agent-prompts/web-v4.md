RESUME NOTE (2026-10-04 handoff): this agent was stopped mid-work. The worktree /Users/moshe/Developer/RbxAI-web-v4 (branch web-v4) ALREADY EXISTS with deps installed; its last commit 5d167867 is an untested WIP snapshot (tokens in design/system.css + new design/geist.css, layout, studio-atmosphere.tsx and glass.css deleted; it was writing the button variants block). If the worktree is missing: git -C /Users/moshe/Developer/RbxAI worktree add /Users/moshe/Developer/RbxAI-web-v4 handoff/web-v4 && pnpm install --frozen-lockfile there. Start with cd apps/web && node --test and pnpm typecheck to see what the WIP broke, then continue the original task below.

---

You are redesigning the Apple (RbxAI) web app's look in a new design language, as the owner instructed. Work ONLY in the git worktree `/Users/moshe/Developer/RbxAI-web-v4` (branch `web-v4`, deps already installed with pnpm). Do not touch any other checkout, do not push, do not deploy, and do not open browsers in full screen (the owner is watching videos; use headless Playwright only).

**Read first:**
- `/private/tmp/claude-501/-Users-moshe-Developer-RbxAI/b6bbbfc6-1fc4-4d3a-b31a-5c28d655ed47/scratchpad/design-language-v4.md`: the binding design spec, from the owner's references ai-sdk.dev and github.com/uhub/awesome-llm. The section "The app (apps/web) in this language" is yours.
- `CLAUDE.md` and `AGENTS.md` in the worktree.

**Scope:** `apps/web` (React + Vite SPA served at /app), covering:
- the global tokens (`src/styles`, `src/design`);
- the layout/header;
- the projects dashboard;
- the chat workspace (thread, message rendering, tool-call rows, code blocks, the composer and the side panels);
- dialogs, the command palette, empty states, error states, the settings/API keys panel and the sign-in screen.

Owner complaint to fix: earlier redesigns only recoloured the old UI. This one must change the *design language*: layout rhythm, the message presentation (an inverse pill for user messages, no bubble for the assistant, hairline mono tool rows), cards, the header and the composer. Use the same tokens as the spec, since the marketing site is being rebuilt in parallel with the same tokens. Restyle the AI Elements components in `src/components/ai-elements`; don't rewrite their behaviour. Add a dark/light theme toggle with no flash, reusing any existing theme storage key. Respect prefers-reduced-motion.

**Hard constraints:**
- Behaviour, routes, data flow and the WebSocket protocol stay unchanged. This is presentation only. Do not rename test ids, aria labels or roles that tests use.
- Run `cd apps/web && node --test` and `pnpm typecheck` there, `pnpm --filter` build for web, the root `node --test tests/`, check-app-bundle, check-escape-hatches, check-copy, check-deadends and check-rebrand (see `package.json` scripts and `.github/workflows/ci.yml`), and the Playwright e2e specs that touch /app.
- A test that pins the OLD look (a specific old class, colour or "atmosphere") may be restated for the new design. Change it in the same commit and explain why, but never weaken a test that guards behaviour, accessibility, the bundle budget or a claim.
- The bundle budget must still pass, with no heavy new dependencies. Geist fonts: reuse whatever the site uses (self-hosted woff2 or Google Fonts with display=swap).
- Accessibility: visible focus rings and AA contrast in both themes.

**Commit** in small logical commits on `web-v4`, ending each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Finish** with a report covering:
- what changed, by screen;
- which tests you restated and why;
- pass/fail of each check;
- 3 screenshot paths under the scratchpad dir above (dashboard dark, chat workspace dark, chat workspace light). Use a mocked or dev state if a real login is impossible. Never enter real credentials.
