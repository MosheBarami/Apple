# Repo Chat

A local, read-only AI chat that answers questions **only** about the StudPilot (RbxAI) repo and product,
grounded in the repo itself. It is a dev tool for the owner: it runs on `127.0.0.1:4790`, is not a
pnpm workspace member and is not deployed anywhere.

Ask things like "where is the agent's tool registry and how do I register a tool", "what did the
benchmark baseline show", "which phase are we in", "what changed this week", "why did we pick the
Creator Store". Unrelated questions (weather, general coding help) are refused in one line.

## Run it

```sh
cd tools/repo-chat
npm install                 # its own node_modules; do not use pnpm here
cp .env.example .env.local  # then fill in the three values (see below)
npm run dev                 # http://127.0.0.1:4790  (binds to 127.0.0.1 only)
```

From the repo root the Claude preview tool can start it through the `repo-chat` entry in
`.claude/launch.json`. Production mode: `npm run build && npm start` (same host and port).

Other commands: `npm run typecheck`, `npm test` (vitest), and
`node scripts/ask.mjs "your question"` to ask a running server from the terminal (prints the tool
calls, sources and answer; it never prints headers or the key).

## Where the key goes

`tools/repo-chat/.env.local` (gitignored, `.env*` except `.env.example` is ignored):

| Variable | Meaning |
| --- | --- |
| `OPENROUTER_API_KEY` | your OpenRouter key. Read only through `process.env` on the server; never sent to the browser, logged or committed |
| `REPO_CHAT_MODEL` | model id, default `stealth/space-bunny-alpha` (needs tools and reasoning; 1M context) |
| `REPO_ROOT` | absolute path of the checkout to answer about |

Optional: `REPO_CHAT_MEMORY_DIR` (the owner's project memory, default
`~/.claude/projects/-Users-moshe-Developer-RbxAI/memory`) and `REPO_CHAT_INDEX_DIR`.

## How it works

Stack: Next.js 16 (App Router, TypeScript), Tailwind v4, shadcn/ui, Vercel AI SDK v7 (`ai`,
`@ai-sdk/react`) with `@openrouter/ai-sdk-provider`, and the AI Elements component registry.

`app/api/chat/route.ts` runs `streamText` with the tools below, `stopWhen: stepCountIs(25)`
(tools are switched off on the last step so an answer is always written), reasoning streamed to the
UI, and every file a tool touched emitted as a `source-document` part. Earlier turns are replayed as
their final answers only (tool calls and output are dropped) to keep cost down.

### Tools (all server-side, zod-validated, capped, redacted)

| Tool | What it does |
| --- | --- |
| `repo_map` | top-level layout; each app/package with a one-line purpose |
| `search_code` | ripgrep (JS walker fallback); excludes node_modules, .git, dist, .next, `packages/corpus/raw`, `.claude/worktrees`, binaries, secrets |
| `read_file` | line range with line numbers; max 400 lines / 60 KB per call |
| `list_dir` | tree, depth up to 3 |
| `git_log`, `git_show`, `git_branches`, `git_worktrees` | history, one commit (stat + capped diff), branches with last commit, worktrees |
| `search_knowledge` | BM25 over the knowledge base below |
| `bench_results` | summary of `packages/evals/owner-bench` (banks, every results file, README and BASELINE excerpts) |
| `load_skill` | returns a skill's full instructions |

There are no write tools, no shell tool and no network tools.

### Knowledge base

MiniSearch (BM25) over: root `*.md` (README, AGENTS, CLAUDE, HANDOFF, ...), `docs/**/*.md`,
`packages/evals/owner-bench/*.md`, `apps/*/README.md`, `packages/*/README.md`,
`.claude/skills/*/SKILL.md`, and the owner's project memory (read-only, shown as `memory/<file>`).
Chunks follow headings (with line ranges). The index is stored in `.index/` (gitignored), checked
against file mtimes and sizes at server start and at most every 20 s, and rebuilt on change. Force
a rebuild with the Reindex button or `curl -X POST http://127.0.0.1:4790/api/reindex`.

### Skills

`skills/*.md`, each with `name` and `description` front matter and a step-by-step method that uses
the tools: architecture-overview, where-is-it-implemented, trace-a-tool-call, benchmark-status,
phase-status, deploy-and-release, golem-rename-status, explain-a-decision, what-changed-recently,
test-and-ci-status. The system prompt lists their names and descriptions; the model calls
`load_skill` to get one. Add a skill by dropping in another file.

### UI

Conversation, Message (response, actions, branches), PromptInput (model badge, submit/stop),
Reasoning, ChainOfThought + Task + Tool (every tool call: name, input, output, state), Sources,
InlineCitation (each `path:line` in an answer is a hover card, checked against what the tools
returned; a dashed red badge means "not found in this answer's tool results"), CodeBlock (copy),
Suggestions, Shimmer (loading). Regenerate keeps the previous answer as a branch. The conversation
is saved in `localStorage`; "New chat" clears it.

## Safety

- The server binds to 127.0.0.1; API routes also reject any non-loopback `Host` or `Origin`.
- Every path is resolved (symlinks included) and must stay inside `REPO_ROOT`. Traversal, absolute
  paths outside the root and symlinks that point out are rejected.
- Refused even inside the repo: `.env*`, `*.dev.vars`, `*.pem`, `*.key`, `.npmrc`, SSH keys, anything
  under `.git/` or `~/.ssh`, and any file whose name matches `secret` or `credential`.
- All tool output is redacted: `sk-or-`, `sk-`, `ghp_`, `github_pat_`, JWTs (`eyJ...`), `AKIA...`,
  Bearer tokens, PEM private keys and `SOME_KEY=value` lines.
- git runs with fixed argument lists (no shell); revisions cannot look like options and `rev:path`
  forms are refused.
- `lib/safety.ts` is the one gate; `tests/safety.test.ts` covers it (`npm test`).

## Limits

- Read-only snapshot of the checkout on disk: it cannot see uncommitted work beyond what files show,
  and it cannot run tests or deploys.
- Docs go stale; the prompt tells the model to cross-check with git and say when sources disagree.
- Each question costs real OpenRouter credits (up to 25 model steps).
