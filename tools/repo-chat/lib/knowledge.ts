/**
 * Local knowledge base: BM25 (MiniSearch) over the repo's own docs and the owner's project memory.
 * The index lives in tools/repo-chat/.index/ (gitignored) and is rebuilt when any source file's
 * mtime/size changes (checked on startup and at most every 20 s afterwards) or via POST /api/reindex.
 */
import fs from "node:fs";
import path from "node:path";
import MiniSearch from "minisearch";
import { indexDir, memoryDir, repoRoot } from "./config";
import { EXCLUDED_DIRS, EXCLUDED_PREFIXES } from "./repo-tools";
import { isSensitivePath, redact } from "./safety";

export type Chunk = { id: number; path: string; startLine: number; endLine: number; title: string; text: string };
type SourceFile = { abs: string; display: string };
type Manifest = Record<string, string>; // display -> "mtimeMs:size"
type Stored = { version: number; manifest: Manifest; chunks: Chunk[]; index: unknown };

const VERSION = 2;
const MAX_FILE_BYTES = 600 * 1024;
const MAX_CHUNK_LINES = 70;
const MAX_CHUNK_CHARS = 6000;

const STOP = new Set("a an and are as at be by for from has have in is it its of on or that the this to was were will with not but if so do does did can how what when where which who why".split(" "));

function options() {
  return {
    fields: ["title", "path", "text"],
    idField: "id",
    processTerm: (t: string) => {
      const l = t.toLowerCase();
      return l.length < 2 || STOP.has(l) ? null : l;
    },
    searchOptions: { boost: { title: 3, path: 2 }, prefix: true, fuzzy: 0.1, combineWith: "OR" as const },
  };
}

function listSources(): SourceFile[] {
  const root = repoRoot();
  const out: SourceFile[] = [];
  const add = (abs: string, display: string) => {
    const base = path.basename(display);
    if (isSensitivePath(display) && !display.startsWith("memory/")) return;
    if (/secret|credential/i.test(base)) return;
    out.push({ abs, display });
  };
  // root-level markdown (README, AGENTS, CLAUDE, HANDOFF, GATES, ...)
  for (const e of safeReaddir(root)) if (e.isFile() && /\.md$/i.test(e.name)) add(path.join(root, e.name), e.name);
  // docs/**/*.md
  const walkMd = (dirRel: string) => {
    for (const e of safeReaddir(path.join(root, dirRel))) {
      const r = `${dirRel}/${e.name}`;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (EXCLUDED_DIRS.has(e.name) || EXCLUDED_PREFIXES.includes(r)) continue;
        walkMd(r);
      } else if (e.isFile() && /\.md$/i.test(e.name)) add(path.join(root, r), r);
    }
  };
  walkMd("docs");
  // owner-bench docs, app and package READMEs, project skills
  for (const e of safeReaddir(path.join(root, "packages/evals/owner-bench"))) {
    if (e.isFile() && /\.md$/i.test(e.name)) add(path.join(root, "packages/evals/owner-bench", e.name), `packages/evals/owner-bench/${e.name}`);
  }
  for (const group of ["apps", "packages"]) {
    for (const e of safeReaddir(path.join(/*turbopackIgnore: true*/ root, group))) {
      if (!e.isDirectory()) continue;
      const rel = `${group}/${e.name}/README.md`;
      if (fs.existsSync(path.join(root, rel))) add(path.join(root, rel), rel);
    }
  }
  for (const e of safeReaddir(path.join(root, ".claude/skills"))) {
    const rel = `.claude/skills/${e.name}/SKILL.md`;
    if (e.isDirectory() && fs.existsSync(path.join(root, rel))) add(path.join(root, rel), rel);
  }
  // owner's project memory (read-only, outside the repo)
  const mem = memoryDir();
  for (const e of safeReaddir(mem)) if (e.isFile() && /\.md$/i.test(e.name)) add(path.join(mem, e.name), `memory/${e.name}`);
  return out;
}

function safeReaddir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function manifestOf(files: SourceFile[]): Manifest {
  const m: Manifest = {};
  for (const f of files) {
    try {
      const st = fs.statSync(f.abs);
      if (st.size <= MAX_FILE_BYTES) m[f.display] = `${Math.round(st.mtimeMs)}:${st.size}`;
    } catch {}
  }
  return m;
}

export function chunkMarkdown(display: string, text: string, firstId: number): Chunk[] {
  const lines = text.split("\n");
  const chunks: Chunk[] = [];
  const stack: string[] = [];
  let start = 0;
  let title = display;
  let fence = false;
  let fmEnd = -1;
  if (lines[0]?.trim() === "---") {
    const close = lines.slice(1, 40).findIndex((l) => l.trim() === "---");
    if (close >= 0) fmEnd = close + 1;
  }
  const flush = (end: number) => {
    // [start, end) -> chunks of at most MAX_CHUNK_LINES, split at blank lines when possible
    let s = start;
    while (s < end) {
      let e = Math.min(s + MAX_CHUNK_LINES, end);
      if (e < end) {
        for (let k = e; k > s + MAX_CHUNK_LINES / 2; k--) if (lines[k - 1].trim() === "") { e = k; break; }
      }
      let body = lines.slice(s, e).join("\n").trim();
      if (body.length > 0) {
        if (body.length > MAX_CHUNK_CHARS) body = body.slice(0, MAX_CHUNK_CHARS) + "…";
        chunks.push({ id: firstId + chunks.length, path: display, startLine: s + 1, endLine: e, title, text: body });
      }
      s = e;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence || i <= fmEnd) continue;
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(l);
    if (m) {
      flush(i);
      start = i;
      const level = m[1].length;
      stack.length = level - 1;
      stack[level - 1] = m[2];
      title = `${path.basename(display)} > ${stack.filter(Boolean).join(" > ")}`;
    }
  }
  flush(lines.length);
  return chunks;
}

type State = { mini: MiniSearch; chunks: Chunk[]; manifest: Manifest; checkedAt: number; builtAt: number; building?: boolean };
const g = globalThis as unknown as { __repoChatKb?: State };

function build(files: SourceFile[], manifest: Manifest): State {
  const chunks: Chunk[] = [];
  for (const f of files) {
    if (!(f.display in manifest)) continue;
    let text: string;
    try {
      text = fs.readFileSync(f.abs, "utf8");
    } catch {
      continue;
    }
    chunks.push(...chunkMarkdown(f.display, text, chunks.length));
  }
  const mini = new MiniSearch<Chunk>(options());
  mini.addAll(chunks);
  const state: State = { mini, chunks, manifest, checkedAt: Date.now(), builtAt: Date.now() };
  try {
    fs.mkdirSync(indexDir(), { recursive: true });
    const stored: Stored = { version: VERSION, manifest, chunks, index: mini.toJSON() };
    fs.writeFileSync(path.join(indexDir(), "knowledge.json"), JSON.stringify(stored));
  } catch {
    // index is a cache; failing to persist is not fatal
  }
  return state;
}

function loadStored(): State | null {
  try {
    const stored = JSON.parse(fs.readFileSync(path.join(indexDir(), "knowledge.json"), "utf8")) as Stored;
    if (stored.version !== VERSION) return null;
    const mini = MiniSearch.loadJS(stored.index as never, options());
    return { mini, chunks: stored.chunks, manifest: stored.manifest, checkedAt: 0, builtAt: Date.now() };
  } catch {
    return null;
  }
}

function sameManifest(a: Manifest, b: Manifest): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

export type IndexStats = { files: number; chunks: number; builtAt: string; rebuilt: boolean; ms: number };

/** Make sure the in-memory index matches the files on disk. Cheap when nothing changed. */
export function ensureIndex(opts: { force?: boolean } = {}): IndexStats {
  const t0 = Date.now();
  const cur = g.__repoChatKb;
  if (!opts.force && cur && Date.now() - cur.checkedAt < 20_000) return statsOf(cur, false, t0);
  const files = listSources();
  const manifest = manifestOf(files);
  let state = opts.force ? null : (cur ?? loadStored());
  let rebuilt = false;
  if (!state || !sameManifest(state.manifest, manifest)) {
    state = build(files, manifest);
    rebuilt = true;
  }
  state.checkedAt = Date.now();
  g.__repoChatKb = state;
  return statsOf(state, rebuilt, t0);
}

function statsOf(s: State, rebuilt: boolean, t0: number): IndexStats {
  return { files: Object.keys(s.manifest).length, chunks: s.chunks.length, builtAt: new Date(s.builtAt).toISOString(), rebuilt, ms: Date.now() - t0 };
}

export type KnowledgeHit = { path: string; startLine: number; endLine: number; title: string; score: number; text: string };

export function searchKnowledge(query: string, maxResults = 6): { query: string; count: number; hits: KnowledgeHit[]; index: IndexStats } {
  const index = ensureIndex();
  const max = Math.min(Math.max(Math.floor(maxResults), 1), 10);
  const st = g.__repoChatKb!;
  const raw = st.mini.search(query.slice(0, 400));
  const perPath = new Map<string, number>();
  const hits: KnowledgeHit[] = [];
  for (const r of raw) {
    const c = st.chunks[r.id as number];
    if (!c) continue;
    const n = perPath.get(c.path) ?? 0;
    if (n >= 3) continue;
    perPath.set(c.path, n + 1);
    hits.push({
      path: c.path,
      startLine: c.startLine,
      endLine: c.endLine,
      title: c.title,
      score: Math.round(r.score * 100) / 100,
      text: redact(c.text.length > 1800 ? c.text.slice(0, 1800) + "…" : c.text),
    });
    if (hits.length >= max) break;
  }
  return { query, count: hits.length, hits, index };
}
