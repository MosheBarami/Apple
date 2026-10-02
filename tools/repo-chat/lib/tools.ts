/**
 * The AI SDK tool set: read-only, schema-validated, capped and redacted.
 * Each tool also reports the files it touched through `onSource`, which the chat route
 * turns into `source-document` parts for the Sources / InlineCitation UI.
 */
import { tool } from "ai";
import { z } from "zod";
import { repoRoot } from "./config";
import { ensureIndex, searchKnowledge } from "./knowledge";
import { getSkill, listSkills } from "./skills";
import { redact } from "./safety";
import {
  benchResults, gitBranches, gitLog, gitShow, gitWorktrees, listDir, readFile, repoMap, searchCode,
} from "./repo-tools";

export type SourceRef = { path: string; startLine?: number; endLine?: number; kind: "file" | "knowledge" | "skill" | "git" };

const j = (v: unknown) => redact(JSON.stringify(v));

export function makeTools(onSource: (s: SourceRef) => void = () => {}) {
  const root = repoRoot();
  return {
    repo_map: tool({
      description:
        "Top-level layout of the repo and every app and package with a one-line purpose (from package.json, READMEs and the root README table). Call this first for orientation questions.",
      inputSchema: z.object({}),
      execute: async () => {
        onSource({ path: "README.md", kind: "file" });
        return repoMap(root);
      },
    }),

    search_code: tool({
      description:
        "Search the repo's text files with ripgrep (excludes node_modules, .git, dist, .next, corpus raw data, binaries, secrets). Fixed-string match by default, smart-case; set regex=true for a regular expression. Returns path:line: text. Narrow with glob (e.g. 'apps/worker/**/*.ts').",
      inputSchema: z.object({
        query: z.string().min(1).max(500).describe("text or regex to find"),
        glob: z.string().max(200).optional().describe("optional file glob, e.g. 'apps/**/*.ts' or '*.md'"),
        maxResults: z.number().int().min(1).max(100).optional().describe("max matching lines (default 30, max 100)"),
        regex: z.boolean().optional().describe("treat query as a regular expression (default false)"),
      }),
      execute: async ({ query, glob, maxResults, regex }) => {
        const r = await searchCode(root, { query, glob, maxResults, regex });
        const seen = new Set<string>();
        for (const h of r.hits) {
          if (seen.size >= 3) break;
          if (!seen.has(h.path)) {
            seen.add(h.path);
            onSource({ path: h.path, startLine: h.line, kind: "file" });
          }
        }
        const head = `${r.count} match line(s)${r.truncated ? " (truncated; refine the query or glob)" : ""} via ${r.engine}`;
        return redact(`${head}\n${r.hits.map((h) => `${h.path}:${h.line}: ${h.text}`).join("\n")}`);
      },
    }),

    read_file: tool({
      description:
        "Read a file from the repo by repo-relative path, with line numbers. Returns at most 400 lines / 60 KB per call; use startLine/endLine to page. Refuses .env*, keys, secrets and anything outside the repo.",
      inputSchema: z.object({
        path: z.string().min(1).max(1000).describe("repo-relative path, e.g. 'apps/worker/src/tools.ts'"),
        startLine: z.number().int().min(1).optional(),
        endLine: z.number().int().min(1).optional(),
      }),
      execute: async ({ path, startLine, endLine }) => {
        const r = readFile(root, path, startLine, endLine);
        onSource({ path: r.path, startLine: r.startLine, endLine: r.endLine, kind: "file" });
        const head = `${r.path} lines ${r.startLine}-${r.endLine} of ${r.totalLines}${r.note ? ` (${r.note})` : ""}`;
        return `${head}\n${r.content}`;
      },
    }),

    list_dir: tool({
      description: "List a directory (repo-relative) as a tree, depth 1-3, directories first. Skips node_modules, .git, dist and similar.",
      inputSchema: z.object({
        path: z.string().max(1000).optional().describe("directory, default '.'"),
        depth: z.number().int().min(1).max(3).optional().describe("levels to show, default 1, max 3"),
      }),
      execute: async ({ path, depth }) => {
        const r = listDir(root, path ?? ".", depth ?? 1);
        return `${r.path}/${r.truncated ? " (truncated at 300 entries)" : ""}\n${r.tree}`;
      },
    }),

    git_log: tool({
      description: "Recent commits (hash, date, author, refs, subject), newest first, optionally for one path and/or a branch/revision.",
      inputSchema: z.object({
        path: z.string().max(1000).optional().describe("limit to commits touching this repo-relative path"),
        n: z.number().int().min(1).max(50).optional().describe("how many commits (default 20, max 50)"),
        rev: z.string().max(200).optional().describe("branch, tag or commit to start from (default HEAD)"),
      }),
      execute: async ({ path, n, rev }) => j(await gitLog(root, { path, n, rev })),
    }),

    git_show: tool({
      description: "Show one commit: message, stat and a capped diff (30 KB), optionally limited to one path.",
      inputSchema: z.object({
        rev: z.string().min(1).max(200).describe("commit hash, branch or tag"),
        path: z.string().max(1000).optional(),
      }),
      execute: async ({ rev, path }) => {
        const r = await gitShow(root, { rev, path });
        onSource({ path: `git show ${rev}${path ? " -- " + path : ""}`, kind: "git" });
        return `${r.truncated ? "(diff truncated at 30 KB)\n" : ""}${r.output}`;
      },
    }),

    git_branches: tool({
      description: "Local and remote branches with the date and subject of each branch's last commit, newest first, plus the current branch.",
      inputSchema: z.object({}),
      execute: async () => j(await gitBranches(root)),
    }),

    git_worktrees: tool({
      description: "The repo's git worktrees (path, head commit, branch). Other agents work in separate worktrees.",
      inputSchema: z.object({}),
      execute: async () => j(await gitWorktrees(root)),
    }),

    search_knowledge: tool({
      description:
        "BM25 search over the knowledge base: README/AGENTS/CLAUDE/HANDOFF, all docs/**/*.md (ADRs, FAILURES, autonomy state, plans), owner-bench docs, app/package READMEs, project skills and the owner's project memory (memory/...). Returns heading-sized chunks with path and line ranges. Best first stop for 'why', 'what is the status', 'what was decided' questions.",
      inputSchema: z.object({
        query: z.string().min(1).max(400).describe("keywords, e.g. 'tool registry plugin op'"),
        maxResults: z.number().int().min(1).max(10).optional().describe("default 6"),
      }),
      execute: async ({ query, maxResults }) => {
        const r = searchKnowledge(query, maxResults);
        for (const h of r.hits.slice(0, 4)) onSource({ path: h.path, startLine: h.startLine, endLine: h.endLine, kind: "knowledge" });
        if (!r.hits.length) return `No knowledge-base chunks matched "${query}". Try other keywords or search_code.`;
        return redact(
          r.hits.map((h) => `### ${h.path}:${h.startLine}-${h.endLine} [${h.title}] (score ${h.score})\n${h.text}`).join("\n\n"),
        );
      },
    }),

    bench_results: tool({
      description:
        "Summarise the owner benchmark in packages/evals/owner-bench: the frozen request bank and held-out bank (counts, categories), every results/*.json run (judged items, mean total /18, per-criterion and per-category means, credits, items not run) and excerpts of its README and BASELINE.md.",
      inputSchema: z.object({}),
      execute: async () => {
        const r = benchResults(root);
        onSource({ path: "packages/evals/owner-bench/README.md", kind: "file" });
        onSource({ path: "packages/evals/owner-bench/BASELINE.md", kind: "file" });
        for (const run of r.results) onSource({ path: run.file, kind: "file" });
        return j(r);
      },
    }),

    load_skill: tool({
      description: "Load a skill: the step-by-step method (which tools to call, in what order) for one kind of question. Returns its full instructions.",
      inputSchema: z.object({ name: z.string().min(1).max(100).describe("skill name from the skills list") }),
      execute: async ({ name }) => {
        const s = getSkill(name);
        if (!s) return `No skill named "${name}". Available: ${listSkills().map((x) => x.name).join(", ")}`;
        onSource({ path: s.file, kind: "skill" });
        ensureIndex();
        return `# Skill: ${s.name}\n${s.description}\n\n${s.body}`;
      },
    }),
  };
}

export type RepoTools = ReturnType<typeof makeTools>;
