/**
 * Read-only repo operations (pure functions, no AI SDK). Each returns JSON-able data,
 * already capped and redacted. The AI SDK wrappers live in lib/tools.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { capBytes, isSensitivePath, redact, resolveInRepo, SafetyError, validatePathspec } from "./safety";

const execFileP = promisify(execFile);

export const LIMITS = {
  readLines: 400,
  readBytes: 60 * 1024,
  searchResults: 100,
  searchLineChars: 300,
  searchBytes: 40 * 1024,
  dirEntries: 300,
  gitBytes: 30 * 1024,
  gitLog: 50,
  bytesFileMax: 8 * 1024 * 1024,
};

/** Directories never walked/searched. */
export const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  ".index",
  ".turbo",
  ".wrangler",
  "coverage",
  "test-results",
  "graphify-out",
]);
/** Repo-relative path prefixes excluded everywhere. */
export const EXCLUDED_PREFIXES = [".claude/worktrees", "packages/corpus/raw"];
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".avif", ".bmp", ".tiff",
  ".mp4", ".mov", ".webm", ".mp3", ".wav", ".ogg", ".pdf", ".zip", ".gz", ".tgz",
  ".rbxm", ".rbxl", ".rbxlx", ".rbxmx", ".wasm", ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".sqlite", ".db", ".bin", ".onnx", ".safetensors", ".gguf", ".psd", ".heic",
]);

function isExcludedRel(rel: string): boolean {
  const norm = rel.split(path.sep).join("/");
  if (EXCLUDED_PREFIXES.some((p) => norm === p || norm.startsWith(p + "/"))) return true;
  return norm.split("/").some((s) => EXCLUDED_DIRS.has(s));
}

// ------------------------------------------------------------------ search_code

export type SearchHit = { path: string; line: number; text: string };

const RG_EXCLUDE_GLOBS = [
  "!**/node_modules/**", "!**/.git/**", "!**/dist/**", "!**/.next/**", "!**/.index/**",
  "!.claude/worktrees/**", "!packages/corpus/raw/**", "!graphify-out/**", "!test-results/**",
  "!**/.env*", "!**/*.dev.vars", "!**/.dev.vars*", "!**/*.pem", "!**/*.key", "!**/*[Ss][Ee][Cc][Rr][Ee][Tt]*",
  "!**/*[Cc][Rr][Ee][Dd][Ee][Nn][Tt][Ii][Aa][Ll]*", "!**/.npmrc",
  "!**/pnpm-lock.yaml", "!**/package-lock.json", "!**/*.min.js", "!**/*.map",
  "!docs/evidence/**/*.{png,jpg,jpeg,gif,webp,mp4,mov,pdf,zip,rbxm,rbxl}",
];

let rgAvailable: boolean | undefined;
async function hasRg(): Promise<boolean> {
  if (rgAvailable !== undefined) return rgAvailable;
  try {
    await execFileP("rg", ["--version"], { timeout: 5000 });
    rgAvailable = true;
  } catch {
    rgAvailable = false;
  }
  return rgAvailable;
}

export type SearchResult = {
  query: string;
  engine: "ripgrep" | "js-walker";
  count: number;
  truncated: boolean;
  hits: SearchHit[];
};

export async function searchCode(
  root: string,
  opts: { query: string; glob?: string; maxResults?: number; regex?: boolean; engine?: "auto" | "js" },
): Promise<SearchResult> {
  const query = opts.query;
  if (!query || query.length > 500) throw new SafetyError("query must be 1-500 characters");
  const max = Math.min(Math.max(opts.maxResults ?? 30, 1), LIMITS.searchResults);
  if (opts.glob && (opts.glob.includes("..") || opts.glob.startsWith("/") || opts.glob.length > 200)) {
    throw new SafetyError("glob must be a relative pattern without '..'");
  }
  const useRg = opts.engine !== "js" && (await hasRg());
  let hits: SearchHit[];
  if (useRg) {
    hits = await rgSearch(root, query, opts.glob, !!opts.regex);
  } else {
    hits = jsSearch(root, query, opts.glob, !!opts.regex);
  }
  hits = hits.filter((h) => !isSensitivePath(h.path) && !isExcludedRel(h.path));
  hits.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1));
  const truncatedByCount = hits.length > max;
  hits = hits.slice(0, max);
  let bytes = 0;
  const out: SearchHit[] = [];
  let truncated = truncatedByCount;
  for (const h of hits) {
    const text = redact(h.text.length > LIMITS.searchLineChars ? h.text.slice(0, LIMITS.searchLineChars) + "…" : h.text);
    bytes += Buffer.byteLength(text) + h.path.length + 8;
    if (bytes > LIMITS.searchBytes) {
      truncated = true;
      break;
    }
    out.push({ path: h.path, line: h.line, text });
  }
  return { query, engine: useRg ? "ripgrep" : "js-walker", count: out.length, truncated, hits: out };
}

async function rgSearch(root: string, query: string, glob: string | undefined, regex: boolean): Promise<SearchHit[]> {
  const args = [
    "--no-config", "--line-number", "--no-heading", "--with-filename", "--color", "never",
    "--max-columns", "400", "--max-columns-preview", "--max-filesize", "1M", "--hidden",
    "--smart-case", "--max-count", "6", "--threads", "4",
  ];
  if (!regex) args.push("--fixed-strings");
  if (glob) args.push("--glob", glob);
  // exclusions come LAST: in ripgrep a later glob wins, so a user glob can never re-include them
  for (const g of RG_EXCLUDE_GLOBS) args.push("--glob", g);
  args.push("-e", query, "--", ".");
  let stdout = "";
  try {
    const r = await execFileP("rg", args, { cwd: root, timeout: 25_000, maxBuffer: 16 * 1024 * 1024 });
    stdout = r.stdout;
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string; killed?: boolean };
    if (err.code === 1 && !err.stdout) return []; // no matches
    if (err.stdout) stdout = err.stdout; // partial results (e.g. unreadable files)
    else if (err.code === 2) throw new SafetyError(`search failed: ${(err.stderr || "bad pattern").split("\n")[0].slice(0, 200)}`);
    else throw e;
  }
  const hits: SearchHit[] = [];
  for (const line of stdout.split("\n")) {
    const m = /^(?:\.\/)?(.+?):(\d+):(.*)$/.exec(line);
    if (m) hits.push({ path: m[1], line: Number(m[2]), text: m[3] });
  }
  return hits;
}

function globToRegex(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end > i) {
        re += "(?:" + glob.slice(i + 1, end).split(",").map((s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&")).join("|") + ")";
        i = end;
      } else re += "\\{";
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp("(^|/)" + re + "$");
}

function* walk(root: string, rel = ""): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (EXCLUDED_DIRS.has(e.name) || isExcludedRel(r)) continue;
      yield* walk(root, r);
    } else if (e.isFile()) {
      if (isSensitivePath(r) || BINARY_EXT.has(path.extname(e.name).toLowerCase())) continue;
      yield r;
    }
  }
}

function jsSearch(root: string, query: string, glob: string | undefined, regex: boolean): SearchHit[] {
  let re: RegExp;
  try {
    re = regex
      ? new RegExp(query, /[A-Z]/.test(query) ? "" : "i")
      : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), /[A-Z]/.test(query) ? "" : "i");
  } catch (e) {
    throw new SafetyError(`bad regex: ${(e as Error).message}`);
  }
  const gre = glob ? globToRegex(glob) : null;
  const hits: SearchHit[] = [];
  for (const rel of walk(root)) {
    if (gre && !gre.test(rel)) continue;
    const abs = path.join(root, rel);
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.size > 1024 * 1024) continue;
    let text: string;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue;
    const lines = text.split("\n");
    let perFile = 0;
    for (let i = 0; i < lines.length && perFile < 6; i++) {
      if (re.test(lines[i])) {
        hits.push({ path: rel, line: i + 1, text: lines[i] });
        perFile++;
      }
    }
    if (hits.length > 2000) break;
  }
  return hits;
}

// ------------------------------------------------------------------ read_file

export type ReadResult = {
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
  note?: string;
  content: string;
};

export function readFile(root: string, p: string, startLine?: number, endLine?: number): ReadResult {
  const { abs, rel } = resolveInRepo(p, root);
  const st = fs.statSync(abs);
  if (!st.isFile()) throw new SafetyError(`${rel} is a directory; use list_dir`);
  if (BINARY_EXT.has(path.extname(abs).toLowerCase())) throw new SafetyError(`${rel} is a binary file type`);
  if (st.size > LIMITS.bytesFileMax) throw new SafetyError(`${rel} is ${st.size} bytes (> ${LIMITS.bytesFileMax}); use search_code`);
  const buf = fs.readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) throw new SafetyError(`${rel} looks binary`);
  const lines = buf.toString("utf8").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const total = lines.length;
  const start = Math.max(1, Math.floor(startLine ?? 1));
  let end = Math.floor(endLine ?? start + LIMITS.readLines - 1);
  if (end < start) end = start;
  let note: string | undefined;
  if (end - start + 1 > LIMITS.readLines) {
    end = start + LIMITS.readLines - 1;
    note = `range capped at ${LIMITS.readLines} lines`;
  }
  end = Math.min(end, total);
  if (start > total) {
    return { path: rel, startLine: start, endLine: start, totalLines: total, truncated: false, note: `file has only ${total} lines`, content: "" };
  }
  const width = String(end).length;
  const numbered = lines.slice(start - 1, end).map((l, i) => `${String(start + i).padStart(width)}| ${l.length > 2000 ? l.slice(0, 2000) + "…" : l}`);
  const joined = redact(numbered.join("\n"));
  const capped = capBytes(joined, LIMITS.readBytes);
  let content = capped.text;
  if (capped.truncated) {
    // drop the partial last line so the reported range is exact
    content = content.slice(0, Math.max(content.lastIndexOf("\n"), 0));
    end = start + content.split("\n").length - 1;
    note = (note ? note + "; " : "") + `output capped at ${LIMITS.readBytes} bytes`;
  }
  if (end < total) note = (note ? note + "; " : "") + `continue with startLine=${end + 1}`;
  return { path: rel, startLine: start, endLine: end, totalLines: total, truncated: end < total, note, content };
}

// ------------------------------------------------------------------ list_dir

export function listDir(root: string, p = ".", depth = 1): { path: string; truncated: boolean; tree: string } {
  const { abs, rel } = resolveInRepo(p, root);
  if (!fs.statSync(abs).isDirectory()) throw new SafetyError(`${rel} is a file; use read_file`);
  const maxDepth = Math.min(Math.max(Math.floor(depth), 1), 3);
  const lines: string[] = [];
  let truncated = false;
  const rec = (dirAbs: string, dirRel: string, d: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
    for (const e of entries) {
      if (lines.length >= LIMITS.dirEntries) {
        truncated = true;
        return;
      }
      const childRel = dirRel === "." ? e.name : `${dirRel}/${e.name}`;
      if (isSensitivePath(childRel) || isExcludedRel(childRel) || e.isSymbolicLink()) continue;
      const indent = "  ".repeat(d - 1);
      if (e.isDirectory()) {
        lines.push(`${indent}${e.name}/`);
        if (d < maxDepth) rec(path.join(dirAbs, e.name), childRel, d + 1);
      } else {
        let size = "";
        try {
          size = ` (${fs.statSync(path.join(dirAbs, e.name)).size}B)`;
        } catch {}
        lines.push(`${indent}${e.name}${size}`);
      }
    }
  };
  rec(abs, rel, 1);
  return { path: rel, truncated, tree: redact(lines.join("\n")) };
}

// ------------------------------------------------------------------ repo_map

function firstLine(text: string): string {
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l || l.startsWith("#") || l.startsWith(">") || l.startsWith("<") || l.startsWith("```") || l.startsWith("|") || l.startsWith("---")) continue;
    return l.length > 200 ? l.slice(0, 200) + "…" : l;
  }
  return "";
}

function purposeOfDir(dirAbs: string): { name?: string; purpose: string } {
  let name: string | undefined;
  let purpose = "";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dirAbs, "package.json"), "utf8"));
    name = pkg.name;
    purpose = pkg.description || "";
  } catch {}
  if (!purpose) {
    for (const f of ["README.md", "readme.md"]) {
      try {
        purpose = firstLine(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dirAbs, f), "utf8"));
        if (purpose) break;
      } catch {}
    }
  }
  return { name, purpose };
}

let mapCache: { at: number; value: unknown } | undefined;

export function repoMap(root: string): unknown {
  if (mapCache && Date.now() - mapCache.at < 60_000) return mapCache.value;
  // purposes from the root README's "Repo layout" table, when present
  const readmeRows = new Map<string, string>();
  try {
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    for (const m of readme.matchAll(/^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*$/gm)) readmeRows.set(m[1].replace(/\/$/, ""), m[2]);
  } catch {}
  const top = fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(".") || e.name === ".claude" || e.name === ".github")
    .filter((e) => !EXCLUDED_DIRS.has(e.name) && !isSensitivePath(e.name))
    .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
  const topLevel = top.map((e) => {
    const rel = e.name;
    let purpose = readmeRows.get(rel) || "";
    if (e.isDirectory() && !purpose) purpose = purposeOfDir(path.join(root, rel)).purpose;
    if (e.isFile() && !purpose && /\.md$/i.test(rel)) {
      try { purpose = firstLine(fs.readFileSync(path.join(root, rel), "utf8")); } catch {}
    }
    return { path: e.isDirectory() ? rel + "/" : rel, purpose };
  });
  const group = (dir: string) => {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !EXCLUDED_DIRS.has(e.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => {
        const { name, purpose } = purposeOfDir(path.join(abs, e.name));
        return { path: `${dir}/${e.name}/`, package: name, purpose: purpose || readmeRows.get(`${dir}/${e.name}`) || "" };
      });
  };
  const value = { root: path.basename(root), topLevel, apps: group("apps"), packages: group("packages"),
    note: "Purposes come from package.json descriptions, README first lines and the root README layout table; empty means none was written." };
  mapCache = { at: Date.now(), value };
  return value;
}

// ------------------------------------------------------------------ git

async function git(root: string, args: string[], maxBytes = LIMITS.gitBytes): Promise<{ text: string; truncated: boolean }> {
  try {
    const r = await execFileP("git", ["-C", root, "-c", "core.pager=cat", "-c", "core.quotepath=false", ...args], {
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
    });
    const c = capBytes(redact(r.stdout), maxBytes);
    return { text: c.text, truncated: c.truncated };
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    if (err.stdout) {
      const c = capBytes(redact(err.stdout), maxBytes);
      return { text: c.text, truncated: true };
    }
    throw new SafetyError(`git failed: ${(err.stderr || err.message || "").split("\n")[0].slice(0, 200)}`);
  }
}

const REV_RE = /^[A-Za-z0-9][A-Za-z0-9._/~^@{}-]{0,199}$/;
function validateRev(rev: string): string {
  // must start alphanumeric: a revision can never be parsed as an option
  if (!REV_RE.test(rev)) throw new SafetyError("invalid revision");
  return rev;
}

export async function gitLog(root: string, opts: { path?: string; n?: number; rev?: string }) {
  const n = Math.min(Math.max(Math.floor(opts.n ?? 20), 1), LIMITS.gitLog);
  const args = ["log", `-n${n}`, "--date=short", "--format=%h%x09%ad%x09%an%x09%D%x09%s"];
  if (opts.rev) args.push(validateRev(opts.rev));
  args.push("--");
  if (opts.path) args.push(validatePathspec(opts.path));
  const { text, truncated } = await git(root, args);
  const commits = text.split("\n").filter(Boolean).map((l) => {
    const [hash, date, author, refs, ...subject] = l.split("\t");
    return { hash, date, author, refs: refs || undefined, subject: subject.join("\t") };
  });
  return { count: commits.length, truncated, commits };
}

export async function gitShow(root: string, opts: { rev: string; path?: string }) {
  const rev = validateRev(opts.rev);
  const args = ["show", "--no-color", "--no-ext-diff", "--no-textconv", "--stat=120", "--patch", "--date=iso",
    "--format=commit %H%nAuthor: %an%nDate:   %ad%n%n%B", rev, "--"];
  if (opts.path) args.push(validatePathspec(opts.path));
  const { text, truncated } = await git(root, args, LIMITS.gitBytes);
  return { rev, path: opts.path, truncated, output: text };
}

export async function gitBranches(root: string) {
  const fmt = "%(refname:short)%09%(committerdate:short)%09%(objectname:short)%09%(subject)";
  const [local, remote, head] = await Promise.all([
    git(root, ["for-each-ref", "--sort=-committerdate", `--format=${fmt}`, "refs/heads"], 20_000),
    git(root, ["for-each-ref", "--sort=-committerdate", `--format=${fmt}`, "refs/remotes"], 20_000),
    git(root, ["rev-parse", "--abbrev-ref", "HEAD"], 200),
  ]);
  const parse = (t: string) => t.split("\n").filter(Boolean).map((l) => {
    const [name, date, hash, ...subject] = l.split("\t");
    return { name, lastCommit: date, hash, subject: subject.join("\t") };
  });
  const l = parse(local.text), r = parse(remote.text).filter((b) => !b.name.endsWith("/HEAD"));
  return { current: head.text.trim(), local: l.slice(0, 80), localTotal: l.length, remote: r.slice(0, 80), remoteTotal: r.length };
}

export async function gitWorktrees(root: string) {
  const { text } = await git(root, ["worktree", "list", "--porcelain"], 40_000);
  const trees: Array<{ path: string; head?: string; branch?: string; detached?: boolean }> = [];
  let cur: (typeof trees)[number] | undefined;
  for (const line of text.split("\n")) {
    if (line.startsWith("worktree ")) {
      cur = { path: line.slice(9) };
      trees.push(cur);
    } else if (cur && line.startsWith("HEAD ")) cur.head = line.slice(5, 12);
    else if (cur && line.startsWith("branch ")) cur.branch = line.slice(7).replace("refs/heads/", "");
    else if (cur && line === "detached") cur.detached = true;
  }
  return { total: trees.length, worktrees: trees.slice(0, 60) };
}

// ------------------------------------------------------------------ bench_results

function readCapped(file: string, bytes: number): string {
  try {
    return redact(capBytes(fs.readFileSync(file, "utf8"), bytes).text);
  } catch {
    return "";
  }
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

export function benchResults(root: string) {
  const dir = path.join(root, "packages", "evals", "owner-bench");
  if (!fs.existsSync(dir)) throw new SafetyError("packages/evals/owner-bench not found");
  const bank = (file: string) => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      const cats: Record<string, number> = {};
      for (const it of j.items ?? []) cats[it.category] = (cats[it.category] || 0) + 1;
      return { file: `packages/evals/owner-bench/${file}`, version: j.version, frozen: j.frozen, items: (j.items ?? []).length, categories: cats };
    } catch {
      return null;
    }
  };
  const resDir = path.join(dir, "results");
  const runs = fs.existsSync(resDir) ? fs.readdirSync(resDir).filter((f) => f.endsWith(".json")).sort() : [];
  const results = runs.map((f) => {
    const rel = `packages/evals/owner-bench/results/${f}`;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(resDir, f), "utf8"));
      const rows: any[] = Array.isArray(j) ? j : j.rows ?? j.items ?? [];
      const done = rows.filter((r) => r.status === "done" && typeof r.total === "number");
      const crit: Record<string, number[]> = {};
      const byCat: Record<string, number[]> = {};
      for (const r of done) {
        for (const [k, v] of Object.entries(r.scores ?? {})) (crit[k] ||= []).push(Number(v));
        (byCat[r.category] ||= []).push(r.total);
      }
      const status: Record<string, number> = {};
      for (const r of rows) status[r.status] = (status[r.status] || 0) + 1;
      return {
        file: rel,
        rows: rows.length,
        statusCounts: status,
        judged: done.length,
        meanTotalOf18: mean(done.map((r) => r.total)),
        totalCredits: rows.reduce((a, r) => a + (Number(r.credits) || 0), 0),
        meanPerCriterion0to2: Object.fromEntries(Object.entries(crit).map(([k, v]) => [k, mean(v)])),
        meanTotalByCategory: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, mean(v)])),
        best: [...done].sort((a, b) => b.total - a.total).slice(0, 3).map((r) => ({ id: r.id, category: r.category, total: r.total })),
        worst: [...done].sort((a, b) => a.total - b.total).slice(0, 3).map((r) => ({ id: r.id, category: r.category, total: r.total })),
        notRun: rows.filter((r) => r.status !== "done").map((r) => ({ id: r.id, status: r.status, note: r.note || r.error })),
      };
    } catch (e) {
      return { file: rel, error: `unreadable: ${(e as Error).message}` };
    }
  });
  const docs: Record<string, string> = {};
  for (const f of ["README.md", "BASELINE.md"]) docs[`packages/evals/owner-bench/${f}`] = readCapped(path.join(dir, f), 6000);
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith("."));
  return {
    dir: "packages/evals/owner-bench",
    files,
    banks: { requests: bank("requests.json"), heldout: bank("heldout-v1.json") },
    results,
    docsExcerpts: docs,
    note: "Scores are the vision judge's first pass (9 criteria, 0-2 each, 18 max) unless a review lowered them. Read BASELINE.md for validity notes.",
  };
}
