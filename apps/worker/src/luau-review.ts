/**
 * The product's seam onto the Luau intelligence cluster in `packages/evals/src`.
 *
 * That cluster — parser, symbol table, CFG, call/require graph, dataflow, formatter, and the
 * Roblox semantic rules — was complete, tested, and reachable from NOTHING a user can run. The
 * eval harness scored models with it; the agent that actually writes scripts into a place could
 * not see any of it. This module is the only import boundary: `tools.ts` talks to these functions
 * and never to the .mjs files directly, so the shape the product depends on is stated once.
 *
 * WHAT THIS FILE ADDS, rather than re-exports:
 *
 *   - `applyEdits` reproduces the plugin's `edit_script` transaction EXACTLY (first literal
 *     occurrence, or `gsub`-all; an edit that finds nothing or changes nothing fails the whole op
 *     naming its index). It exists so the worker can know the post-edit text BEFORE Studio writes
 *     it — which is what makes a pre-write syntax gate and a real before/after diff possible. It
 *     is a simulation, so it is only sound while the base text matches, which is what `sourceHash`
 *     is for.
 *   - `sourceHash` is FNV-1a/32 over the source's UTF-8 bytes, chosen because `Ops.luau` has to
 *     compute the same number over the same string inside `UpdateSourceAsync`, and Luau has no
 *     crypto. The point is agreement between the two sides, not collision resistance: it detects a
 *     Studio edit made between `read_script` and `edit_script`, which is a race, not an attacker.
 *   - `contextFindings` is the run-context check. Roblox decides where code runs by WHERE THE
 *     INSTANCE LIVES, which is a fact no single-file analysis can see — `inferContext` reads the
 *     source's API vocabulary, `list_scripts` reports the class and the container, and only the
 *     two together can say that a LocalScript in ServerScriptService will never run.
 */
import { parseLuau } from '@golem/evals/src/luau-ast.mjs';
import { analyzeFile, analyzePlace } from '@golem/evals/src/luau-intel.mjs';
import type { FileAnalysis, LuauFinding, PlaceAnalysis } from '@golem/evals/src/luau-intel.mjs';
import { buildSymbolTable, crossReference, searchSymbols } from '@golem/evals/src/luau-symbols.mjs';
import { buildDependencyGraph, indexPlace, requireOrder } from '@golem/evals/src/luau-graph.mjs';
import type { DependencyGraph } from '@golem/evals/src/luau-graph.mjs';
import { formatLuau, tokenDrift } from '@golem/evals/src/luau-format.mjs';
import { inferContext, stripComments } from '@golem/evals/src/roblox-antipatterns.mjs';
import { parseInstancePath } from './effects.ts';

export type { FileAnalysis, LuauFinding, PlaceAnalysis };

/**
 * TWO VOCABULARIES FOR THE SAME TREE, RECONCILED HERE.
 *
 * The plugin says `game.ReplicatedStorage.Modules.Shop` — dotted, rooted at `game`, with
 * `["odd name"]` for a name that needs quoting. The evals cluster says `ReplicatedStorage/Modules/
 * Shop`, because that is the form `resolveInstanceExpression` produces when it walks a
 * `game:GetService("ReplicatedStorage").Modules.Shop` expression: `game` resolves to the empty
 * string and each member joins with a slash.
 *
 * Handing the plugin's spelling straight to `buildDependencyGraph` is not a crash. It is worse: no
 * edge ever matches, so the graph has no cycles, no unresolved requires and no cross-file findings
 * — a clean bill of health produced by never having compared anything. That is exactly the shape
 * docs/FAILURES.md F-58 is about, so the conversion is a named function with a round-trip test
 * rather than an inline `.replace('.', '/')`.
 */
export function graphPath(instancePath: string): string {
  const segs = parseInstancePath(String(instancePath ?? ''));
  if (!segs || !segs.length) return String(instancePath ?? '');
  const rooted = segs[0] === 'game' || segs[0] === 'Game' ? segs.slice(1) : segs;
  return rooted.join('/');
}

/** One script as the product sees it: the plugin gives all three for every script in the place. */
export interface ScriptFile {
  path: string;
  source: string;
  className?: string;
}

// ------------------------------------------------------------------ syntax

export interface SyntaxProblem {
  line: number;
  column: number;
  message: string;
}

/**
 * Parse errors in a script body, or an empty array.
 *
 * This is the whole reason `edit_script` can refuse: until now a bad body was discovered by
 * `run_spec` failing to compile it, which is after the write, after the user's file was replaced,
 * and with the failure attributed to the spec rather than to the edit that caused it.
 */
export function checkSyntax(source: string): SyntaxProblem[] {
  const parsed = parseLuau(String(source ?? ''));
  return parsed.errors.map((e) => ({
    line: Number(e.line) || 1,
    column: Number(e.column) || 1,
    message: String(e.message ?? 'parse error'),
  }));
}

/** The first parse error rendered for a model: "line 12, column 3: expected 'end'". */
export function describeSyntax(problems: SyntaxProblem[]): string {
  if (!problems.length) return '';
  const first = problems[0]!;
  const rest = problems.length > 1 ? ` (+${problems.length - 1} more)` : '';
  return `line ${first.line}, column ${first.column}: ${first.message}${rest}`;
}

// ------------------------------------------------------------------ edits

export interface ScriptEdit {
  find: string;
  replace: string;
  all?: boolean;
}

export type EditResult =
  | { ok: true; source: string; applied: number; edits: ScriptEdit[] }
  | { ok: false; error: string; closest?: string };

/**
 * Apply an ordered find/replace list the way `Ops.luau` does inside `UpdateSourceAsync`.
 *
 * The two implementations must agree or the pre-write gate is checking text Studio will never
 * hold. The plugin's rules, reproduced here:
 *   - `all` uses `string.gsub` with the needle escaped, so every occurrence goes;
 *   - otherwise `string.find(s, find, 1, true)` — the FIRST literal occurrence only;
 *   - a find that is not present fails the whole op, naming the 1-based edit index;
 *   - an edit that leaves the text unchanged also fails, for the same reason: it means the model
 *     believed something about the file that is not true.
 *
 * TWO ADDITIONS, both from gauntlet round 4 (2026-09-23), where a stale anchor was retried step
 * after step because the refusal said only "read the script again":
 *   - A single-occurrence find that misses only on WHITESPACE (indentation, tabs for spaces, CRLF,
 *     trailing spaces) is anchored on the text actually there, if that match is unique. `edits` on
 *     success is the list to send to Studio, with each find replaced by the literal text it matched,
 *     so the plugin's exact match finds the same place and the two implementations still agree.
 *   - A miss carries `closest`: the script's lines nearest the anchor, numbered, so the next step
 *     can copy the anchor instead of reading the whole script again.
 */
export function applyEdits(source: string, edits: ScriptEdit[]): EditResult {
  let text = String(source ?? '');
  let applied = 0;
  const anchored: ScriptEdit[] = [];
  for (let i = 0; i < edits.length; i += 1) {
    const e = edits[i]!;
    let find = String(e.find ?? '');
    const replace = String(e.replace ?? '');
    if (!find) return { ok: false, error: `edit ${i + 1}: empty find text` };
    const before = text;
    if (e.all) {
      if (!text.includes(find)) return { ok: false, error: `edit ${i + 1}: text to find not present`, ...closestTo(text, find) };
      text = text.split(find).join(replace);
    } else {
      let at = text.indexOf(find);
      if (at < 0) {
        const loose = looseMatch(text, find);
        if (loose === 'ambiguous') {
          return { ok: false, error: `edit ${i + 1}: text to find not present exactly, and it matches more than once ignoring whitespace — include more surrounding lines`, ...closestTo(text, find) };
        }
        if (!loose) return { ok: false, error: `edit ${i + 1}: text to find not present`, ...closestTo(text, find) };
        find = loose;
        at = text.indexOf(find);
      }
      text = text.slice(0, at) + replace + text.slice(at + find.length);
    }
    if (text === before) return { ok: false, error: `edit ${i + 1} changed nothing` };
    anchored.push({ ...e, find, replace });
    applied += 1;
  }
  return { ok: true, source: text, applied, edits: anchored };
}

const MAX_LOOSE_FIND = 20_000;
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The literal text in `text` that `find` names once whitespace runs are ignored, or null, or
 * 'ambiguous' when it names more than one place. The span keeps the line's own indentation when the
 * find began with whitespace and its line end when the find ended with a newline, so a replacement
 * written with its own indentation and newline is not doubled up.
 */
function looseMatch(text: string, find: string): string | null | 'ambiguous' {
  const core = find.trim();
  if (!core || find.length > MAX_LOOSE_FIND) return null;
  const lead = /^\s/.test(find) ? '[\\t ]*' : '';
  const tail = /\n[\t ]*$/.test(find) ? '[\\t ]*\\r?\\n' : /\s$/.test(find) ? '[\\t ]*' : '';
  const re = new RegExp(lead + core.split(/\s+/).map(escapeRe).join('\\s+') + tail, 'g');
  const first = re.exec(text);
  if (!first) return null;
  if (re.exec(text)) return 'ambiguous';
  return first[0];
}

const CLOSEST_MAX_CHARS = 1_500;
const words = (s: string): Set<string> => new Set(s.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?/g) ?? []);

/** The run of script lines sharing the most words with `find`, numbered, for a refused edit. */
function closestTo(text: string, find: string): { closest?: string } {
  const lines = text.split('\n');
  const want = words(find);
  if (want.size === 0 || lines.length === 0) return {};
  const span = Math.max(1, Math.min(40, find.trim().split('\n').length));
  const perLine = lines.map(words);
  let best = -1;
  let bestAt = 0;
  for (let i = 0; i <= Math.max(0, lines.length - span); i += 1) {
    const seen = new Set<string>();
    for (let j = i; j < Math.min(lines.length, i + span); j += 1) for (const w of perLine[j]!) if (want.has(w)) seen.add(w);
    if (seen.size > best) { best = seen.size; bestAt = i; }
  }
  if (best <= 0) return {};
  const from = Math.max(0, bestAt - 2);
  const to = Math.min(lines.length, bestAt + span + 2);
  let out = '';
  for (let n = from; n < to; n += 1) {
    const row = `${n + 1}| ${lines[n]}\n`;
    if (out.length + row.length > CLOSEST_MAX_CHARS) break;
    out += row;
  }
  return out ? { closest: out } : {};
}

/**
 * FNV-1a/32 over the UTF-8 BYTES of the source, as lowercase hex.
 *
 * Bytes, not characters, and that is the load-bearing choice. `Ops.luau` has to compute the same
 * number inside `UpdateSourceAsync`, and a Luau string IS its UTF-8 bytes — `string.byte` cannot
 * see a code point. Hashing JavaScript's UTF-16 code units instead would agree with the plugin on
 * every ASCII file and silently disagree on the first script containing an em-dash in a comment,
 * which would then be refused as a concurrent edit forever. So the worker encodes first.
 *
 * `apps/worker/tests/luau-review.test.mjs` pins vectors that the plugin's own loop is checked
 * against, because "the two hashes agree" is the entire contract and two independently written
 * loops is exactly the shape that drifts.
 */
const UTF8 = new TextEncoder();
export function sourceHash(source: string): string {
  const bytes = UTF8.encode(String(source ?? ''));
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ------------------------------------------------------------------ diff

export type DiffLineKind = 'add' | 'del' | 'ctx';
export interface ReviewDiffLine {
  kind: DiffLineKind;
  text: string;
  n?: number;
}
export interface ReviewDiffHunk {
  header?: string;
  lines: ReviewDiffLine[];
}

/** Longest common subsequence over lines. Bounded: past `maxCells` the diff degrades to whole-file. */
function lcs(a: string[], b: string[], maxCells: number): number[][] | null {
  if ((a.length + 1) * (b.length + 1) > maxCells) return null;
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

/**
 * Line hunks for the `code_diff` block: changed runs plus `context` unchanged lines either side.
 *
 * Line numbers are the AFTER file's, except on a deletion, where they are the BEFORE file's —
 * which is what a reader needs to find the line that went away.
 */
export function diffHunks(
  before: string,
  after: string,
  opts: { context?: number; maxHunks?: number; maxLines?: number } = {},
): ReviewDiffHunk[] {
  const context = opts.context ?? 3;
  const maxHunks = opts.maxHunks ?? 12;
  const maxLines = opts.maxLines ?? 300;
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');
  const table = lcs(a, b, 4_000_000);

  type Op = { kind: DiffLineKind; text: string; an: number; bn: number };
  const ops: Op[] = [];
  if (!table) {
    a.forEach((text, i) => ops.push({ kind: 'del', text, an: i + 1, bn: 0 }));
    b.forEach((text, i) => ops.push({ kind: 'add', text, an: 0, bn: i + 1 }));
  } else {
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        ops.push({ kind: 'ctx', text: a[i]!, an: i + 1, bn: j + 1 });
        i += 1;
        j += 1;
      } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
        ops.push({ kind: 'del', text: a[i]!, an: i + 1, bn: 0 });
        i += 1;
      } else {
        ops.push({ kind: 'add', text: b[j]!, an: 0, bn: j + 1 });
        j += 1;
      }
    }
    while (i < a.length) {
      ops.push({ kind: 'del', text: a[i]!, an: i + 1, bn: 0 });
      i += 1;
    }
    while (j < b.length) {
      ops.push({ kind: 'add', text: b[j]!, an: 0, bn: j + 1 });
      j += 1;
    }
  }

  const changed = ops.map((o) => o.kind !== 'ctx');
  if (!changed.some(Boolean)) return [];

  // Grow each changed run by `context` lines, then merge runs that touch.
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((_, idx) => {
    if (!changed[idx]) return;
    for (let k = Math.max(0, idx - context); k <= Math.min(ops.length - 1, idx + context); k += 1) keep[k] = true;
  });

  const hunks: ReviewDiffHunk[] = [];
  let lines: ReviewDiffLine[] = [];
  let startB = 0;
  let startA = 0;
  let budget = maxLines;
  const flush = (): void => {
    if (!lines.length) return;
    if (hunks.length < maxHunks) {
      hunks.push({ header: `@@ -${startA || 1} +${startB || 1} @@`, lines });
    }
    lines = [];
  };
  for (let idx = 0; idx < ops.length; idx += 1) {
    if (!keep[idx]) {
      flush();
      startA = 0;
      startB = 0;
      continue;
    }
    const o = ops[idx]!;
    if (!lines.length) {
      startA = o.an || o.bn;
      startB = o.bn || o.an;
    }
    if (budget <= 0) break;
    budget -= 1;
    const n = o.kind === 'del' ? o.an : o.bn;
    lines.push(n > 0 ? { kind: o.kind, text: o.text, n } : { kind: o.kind, text: o.text });
  }
  flush();
  return hunks;
}

/** Added / removed line counts, for the one-line summary above a diff. */
export function diffStat(hunks: ReviewDiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const h of hunks) {
    for (const l of h.lines) {
      if (l.kind === 'add') added += 1;
      else if (l.kind === 'del') removed += 1;
    }
  }
  return { added, removed };
}

// ------------------------------------------------------------------ run context

/**
 * Where Roblox actually runs each script class, keyed by the first path segment after `game`.
 *
 * This is a property of the engine, not of the code: a LocalScript is replicated to a client only
 * from a container the client receives, and a legacy `Script` runs only where the server runs one.
 * Containers not listed here (a player's Character, a Tool moved at runtime) are DELIBERATELY
 * absent — an unknown container yields no finding rather than a guess.
 */
const CLIENT_CONTAINERS = new Set(['StarterPlayer', 'StarterGui', 'StarterPack', 'ReplicatedFirst', 'Players']);
const SERVER_CONTAINERS = new Set(['ServerScriptService', 'Workspace']);
/** Never replicated to a client, so a LocalScript cannot `require` anything under here. */
const SERVER_ONLY_STORAGE = new Set(['ServerScriptService', 'ServerStorage']);

/** The service a script lives under: `ServerScriptService` for `game.ServerScriptService.Round`. */
function container(instancePath: string): string {
  return String(graphPath(instancePath).split('/')[0] ?? '');
}

/**
 * Findings that need the instance tree, not just the text: a script in a container where its class
 * never runs, and a client script requiring a module the client never receives.
 */
export function contextFindings(files: ScriptFile[]): (LuauFinding & { path: string })[] {
  const out: (LuauFinding & { path: string })[] = [];
  const classOf = new Map<string, string>();
  for (const f of files) if (f.className) classOf.set(f.path, f.className);

  for (const f of files) {
    const where = container(f.path);
    const cls = f.className ?? '';
    if (cls === 'LocalScript' && SERVER_CONTAINERS.has(where)) {
      out.push({
        rule: 'localscript-in-server-container',
        severity: 'error',
        path: f.path,
        line: 1,
        detail: `${f.path} is a LocalScript under ${where}`,
        why: 'a LocalScript only runs from a container the client receives (StarterPlayerScripts, StarterGui, StarterPack, ReplicatedFirst); here it never runs at all and the feature is simply absent',
      });
    }
    if (cls === 'Script' && CLIENT_CONTAINERS.has(where)) {
      out.push({
        rule: 'server-script-in-client-container',
        severity: 'error',
        path: f.path,
        line: 1,
        detail: `${f.path} is a Script (server) under ${where}`,
        why: 'a legacy Script in a Starter container is copied to the player, where it does not run — the code is dead in both places',
      });
    }
    if (cls === 'LocalScript' || cls === 'Script') {
      const implied = inferContext(stripComments(String(f.source ?? '')));
      const actual = cls === 'LocalScript' ? 'client' : 'server';
      if (implied !== 'unknown' && implied !== actual) {
        out.push({
          rule: 'run-context-mismatch',
          severity: 'warn',
          path: f.path,
          line: 1,
          detail: `${f.path} is a ${cls} (${actual}) but its code reads as ${implied}`,
          why: `${implied}-only API in a ${actual} script errors at runtime — LocalPlayer is nil on the server, DataStoreService is refused on the client`,
        });
      }
    }
  }

  // A client script requiring something the client never receives. The require does not fail
  // loudly: `WaitForChild` on a server-only container yields forever, so the script just stops.
  const { graph, toInstance } = dependencyGraph(files);
  for (const edge of graph.edges) {
    const from = toInstance(edge.from);
    const to = toInstance(edge.to);
    if (classOf.get(from) !== 'LocalScript') continue;
    if (!SERVER_ONLY_STORAGE.has(String(edge.to.split('/')[0] ?? ''))) continue;
    out.push({
      rule: 'client-requires-server-module',
      severity: 'error',
      path: from,
      line: edge.line,
      detail: `${from} requires ${to}, which is never replicated to a client`,
      why: 'ServerScriptService and ServerStorage exist only on the server; the client waits for a child that never arrives and the script stops with no error',
    });
  }
  return out;
}

/**
 * Rewrite evals-style paths inside a finding's prose back into plugin paths.
 *
 * `requireCycleFindings` builds its detail string by joining paths, so the only place the cycle is
 * legible to a user is inside that sentence. Leaving it in the other vocabulary would hand someone
 * `ReplicatedStorage/A -> ReplicatedStorage/B`, which is not a path they can paste anywhere.
 */
function renamePaths(detail: string, name: (p: string) => string): string {
  return String(detail ?? '').replace(/[A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)+/g, (m) => name(m));
}

/** The require graph over the place, plus the map back from evals paths to plugin paths. */
function dependencyGraph(files: ScriptFile[]): { graph: DependencyGraph; toInstance: (p: string) => string } {
  const back = new Map<string, string>();
  const list = files.map((f) => {
    const gp = graphPath(f.path);
    back.set(gp, f.path);
    return { path: gp, source: String(f.source ?? '') };
  });
  return { graph: buildDependencyGraph(list), toInstance: (p: string) => back.get(p) ?? p };
}

// ------------------------------------------------------------------ review

export interface ScriptReview {
  path: string;
  ok: boolean;
  context: string;
  findings: LuauFinding[];
  errors: number;
  warnings: number;
  requires: string[];
}

/** One script: parse errors, structure findings and the Roblox semantic rules, in one list. */
export function reviewScript(path: string, source: string, className?: string): ScriptReview {
  const analysis = analyzeFile(String(source ?? ''), { path: graphPath(path) });
  const extra = className ? contextFindings([{ path, source, className }]).filter((f) => f.path === path) : [];
  const findings = [...analysis.findings, ...extra].sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return {
    path,
    ok: analysis.ok,
    context: analysis.context,
    findings,
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warn').length,
    requires: analysis.requires.map((r) => r.path).filter((p): p is string => typeof p === 'string'),
  };
}

export interface PlaceReview {
  scripts: ScriptReview[];
  crossFile: (LuauFinding & { path: string })[];
  dependencies: {
    edges: { from: string; to: string }[];
    unresolved: { from: string; line: number; expression: string }[];
    cycles: string[][];
    roots: string[];
    order: string[] | null;
  };
  totals: { scripts: number; parsed: number; errors: number; warnings: number; requireCycles: number };
}

/** Every script, plus the facts that only exist between scripts (require cycles, run context). */
export function reviewPlace(files: ScriptFile[]): PlaceReview {
  // Analysis happens in the evals cluster's path vocabulary; everything reported comes back in the
  // plugin's, because the plugin's is the one a user can paste into Studio.
  const back = new Map<string, string>();
  const list = files.map((f) => {
    const gp = graphPath(f.path);
    back.set(gp, f.path);
    return { path: gp, source: String(f.source ?? '') };
  });
  const name = (p: string): string => back.get(p) ?? p;
  const place: PlaceAnalysis = analyzePlace(list);
  const ctxFindings = contextFindings(files);
  const scripts: ScriptReview[] = place.files.map((analysis, i) => {
    const file = files[i]!;
    const mine = ctxFindings.filter((f) => f.path === file.path);
    const findings = [...analysis.findings, ...mine].sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
    return {
      path: file.path,
      ok: analysis.ok,
      context: file.className === 'LocalScript' ? 'client' : file.className === 'Script' ? 'server' : analysis.context,
      findings,
      errors: findings.filter((f) => f.severity === 'error').length,
      warnings: findings.filter((f) => f.severity === 'warn').length,
      requires: analysis.requires.map((r) => r.path).filter((p): p is string => typeof p === 'string').map(name),
    };
  });
  const dep: DependencyGraph = place.dependencies;
  const crossFile = [
    ...place.findings.map((f) => ({ ...f, path: name(f.path), detail: renamePaths(f.detail, name) })),
    ...ctxFindings.filter((f) => f.rule === 'client-requires-server-module'),
  ];
  return {
    scripts,
    crossFile,
    dependencies: {
      edges: dep.edges.map((e) => ({ from: name(e.from), to: name(e.to) })),
      unresolved: dep.unresolved.map((u) => ({ from: name(u.from), line: u.line, expression: u.expression })),
      cycles: dep.cycles.map((c) => c.map(name)),
      roots: dep.roots.map(name),
      order: requireOrder(dep)?.map(name) ?? null,
    },
    totals: {
      scripts: scripts.length,
      parsed: scripts.filter((s) => s.ok).length,
      errors: scripts.reduce((n, s) => n + s.errors, 0) + crossFile.filter((f) => f.severity === 'error').length,
      warnings: scripts.reduce((n, s) => n + s.warnings, 0),
      requireCycles: dep.cycles.length,
    },
  };
}

// ------------------------------------------------------------------ symbols

export interface SymbolHit {
  path: string;
  name: string;
  kind: string;
  line: number;
  endLine: number;
}

export interface SymbolLookup {
  name: string;
  kind: string;
  path: string;
  definition: { line: number; column: number };
  reads: number;
  writes: number;
  references: { line: number; column: number; kind: string }[];
}

/**
 * The declaration a position refers to, plus every read and write of THAT binding.
 *
 * The difference from `search_scripts` is the whole point: text search cannot tell one `x` from
 * another, so it returns the shadowed local in the loop below and the parameter three functions
 * away. This resolves scope, so `local x = x` names two symbols and the answer is about one.
 */
export function symbolLookup(path: string, source: string, line: number, column: number): SymbolLookup | null {
  const table = buildSymbolTable(String(source ?? ''), { path });
  const xref = crossReference(table, line, column);
  if (!xref) return null;
  return {
    name: xref.symbol.name,
    kind: xref.symbol.kind,
    path,
    definition: { line: xref.definition.line, column: xref.definition.column },
    reads: xref.reads,
    writes: xref.writes,
    references: xref.references,
  };
}

/** Declarations across a place whose name contains `query` — a symbol index, not a text grep. */
export function symbolSearch(files: ScriptFile[], query: string, limit = 60): SymbolHit[] {
  const needle = String(query ?? '').toLowerCase();
  const back = new Map<string, string>();
  const list = files.map((f) => {
    const gp = graphPath(f.path);
    back.set(gp, f.path);
    return { path: gp, source: String(f.source ?? '') };
  });
  const all = indexPlace(list);
  const hits = needle ? all.filter((d) => d.name.toLowerCase().includes(needle)) : all;
  return hits.slice(0, limit).map((d) => ({ ...d, path: back.get(d.path) ?? d.path }));
}

/** Declarations in ONE file whose name contains `query`, with scope kinds. */
export function symbolsInFile(path: string, source: string, query: string, limit = 60): SymbolHit[] {
  const table = buildSymbolTable(String(source ?? ''), { path });
  return searchSymbols(table, String(query ?? ''))
    .slice(0, limit)
    .map((s) => ({ path, name: s.name, kind: s.kind, line: s.line, endLine: s.line }));
}

// ------------------------------------------------------------------ formatting

export type FormatResult =
  | { ok: true; code: string; changed: boolean }
  | { ok: false; error: string };

/**
 * Format a script, refusing rather than returning output whose tokens differ from the input's.
 *
 * `formatLuau` states the meaning-preserving property and `tokenDrift` is the falsifier for it.
 * Running the falsifier here rather than trusting the claim is the difference between a formatter
 * and a formatter you can point at a user's file: the one case where drift appears is the one case
 * where writing the output would silently change what the script does.
 */
export function formatScript(source: string, opts: { indent?: string } = {}): FormatResult {
  const src = String(source ?? '');
  const res = formatLuau(src, { indent: opts.indent ?? '\t' });
  if (!res.ok) {
    const first = res.errors[0];
    return {
      ok: false,
      error: first
        ? `this script does not lex, so it was not formatted — line ${first.line}: ${first.message}`
        : 'this script does not lex, so it was not formatted',
    };
  }
  const drift = tokenDrift(src, res.code);
  if (drift) {
    return {
      ok: false,
      error: `formatting was discarded: it would have changed the code, not just the layout (${drift.reason} at token ${drift.index})`,
    };
  }
  return { ok: true, code: res.code, changed: res.changed };
}
