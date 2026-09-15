// The one entry point: everything this cluster knows about a Luau file, or about a whole place.
//
// This is where the parser-backed analyses and the existing regex scanner meet. Neither replaces
// the other and the split is by what each can decide:
//
//   - `roblox-antipatterns.mjs` knows Roblox SEMANTICS — that `:InvokeClient` hands a thread to an
//     attacker, that `GetAsync`+`SetAsync` is a lost update. None of that is visible in an AST; it
//     is domain knowledge, and it stays there.
//   - The AST passes know STRUCTURE — scopes, edges, reachability. None of that is visible to a
//     regex.
//
// TWO RULES OVERLAP, AND THE OVERLAP IS RESOLVED RATHER THAN SHIPPED. The scanner's
// `busy-wait-loop` and the CFG's `no-yield-infinite-loop` are the same defect found two ways. When
// the file parses, the CFG's finding wins and the scanner's is dropped: it is strictly better
// informed (it follows `break` out of nested loops, and it knows a helper yields because the call
// graph says so). When the file does NOT parse, the scanner's finding is kept — that is the case
// the regex exists for, and dropping it would mean a file with a syntax error gets FEWER checks
// than one without, which is backwards.

import { parseLuau, inspectLuau } from './luau-ast.mjs';
import { buildSymbolTable, unusedLocals, shadowedLocals } from './luau-symbols.mjs';
import { controlFlow, deadCode, inconsistentReturns, infiniteLoops } from './luau-flow.mjs';
import { buildCallGraph, unreachableFunctions, buildDependencyGraph, requireCycleFindings, indexPlace, searchPlace } from './luau-graph.mjs';
import { taintFindings, requireTargets } from './luau-dataflow.mjs';
import { analyzeLuau, inferContext, looksLikeTest, stripComments } from './roblox-antipatterns.mjs';

/** Names a test runner injects. Only applied to files that look like tests. */
export const TEST_GLOBALS = new Set([
  'describe', 'it', 'itFOCUS', 'itSKIP', 'itFIXME', 'expect', 'beforeAll', 'beforeEach',
  'afterAll', 'afterEach', 'FOCUS', 'SKIP', 'FIXME', 'jest', 'test', 'xit', 'xdescribe',
]);

/**
 * Analyse one Luau file.
 *
 * @param {string} source
 * @param {{path?: string, context?: string, rules?: string[]}} [opts]
 */
export function analyzeFile(source, opts = {}) {
  const src = String(source ?? '');
  const parsed = parseLuau(src, opts);
  const isTest = looksLikeTest(src);
  const context = opts.context ?? inferContext(stripComments(src));

  const findings = [];
  // The scanner runs whether or not the file parses — its rules do not need a tree.
  let scanner = { findings: [], skipped: [], ruleIds: [], context };
  try {
    scanner = analyzeLuau(src, { context, rules: opts.rules });
  } catch (e) {
    findings.push({ rule: 'analyzer-error', severity: 'warn', line: 1, detail: String(e?.message ?? e), why: 'a rule threw; the remaining rules still ran' });
  }

  let table = null;
  let graph = null;
  let flow = null;
  if (parsed.ast) {
    table = buildSymbolTable(parsed, { extraGlobals: isTest ? TEST_GLOBALS : undefined });
    graph = buildCallGraph(parsed);
    flow = controlFlow(parsed);
    findings.push(
      ...unusedLocals(table, opts),
      ...shadowedLocals(table).filter(() => opts.includeShadowing === true),
      ...deadCode(parsed),
      ...inconsistentReturns(parsed),
      ...infiniteLoops(parsed, { symbols: table, yieldingFunctions: graph.yieldingFunctions }),
      ...unreachableFunctions(graph),
      ...taintFindings(parsed),
    );
    for (const g of table.implicitGlobals) {
      findings.push({
        rule: 'implicit-global',
        severity: 'warn',
        line: g.line,
        detail: `\`${g.name}\` is assigned without \`local\``,
        why: 'an accidental global is shared by every function in the script and outlives the block that set it',
      });
    }
    for (const g of table.unknownGlobals) {
      findings.push({
        rule: 'unknown-global',
        severity: 'warn',
        line: g.line,
        detail: `\`${g.name}\` is read and never assigned anywhere in this script`,
        why: 'each Roblox script has its own global table, so a global nothing in the file assigns is nil at runtime',
      });
    }
  }

  // `unused-local` on a local FUNCTION and `unreachable-function` on the same line are the same
  // defect stated twice: a name nothing reads is a function nothing can reach. The direct statement
  // is kept. The transitive case — a helper that IS called, but only by another dead function —
  // has no `unused-local` on its line and survives, which is the case only the call graph can see.
  const unusedLines = new Set(findings.filter((f) => f.rule === 'unused-local').map((f) => f.line));
  for (let i = findings.length - 1; i >= 0; i -= 1) {
    if (findings[i].rule === 'unreachable-function' && unusedLines.has(findings[i].line)) findings.splice(i, 1);
  }

  const cfgLoopLines = new Set(findings.filter((f) => f.rule === 'no-yield-infinite-loop').map((f) => f.line));
  for (const f of scanner.findings) {
    // see the header: the CFG's version of this finding supersedes the scanner's
    if (f.rule === 'busy-wait-loop' && parsed.ok && cfgLoopLines.has(f.line)) continue;
    findings.push({ rule: f.rule, severity: f.severity, line: f.line, detail: f.detail, why: f.why });
  }

  for (const e of parsed.errors) {
    findings.push({ rule: 'syntax-error', severity: 'error', line: e.line, column: e.column, detail: e.message, why: 'a script that does not parse does not run' });
  }

  findings.sort((a, b) => a.line - b.line || String(a.rule).localeCompare(String(b.rule)));
  return {
    path: opts.path ?? null,
    ok: parsed.ok,
    context,
    isTest,
    findings,
    errorCount: findings.filter((f) => f.severity === 'error').length,
    warnCount: findings.filter((f) => f.severity === 'warn').length,
    symbols: table,
    callGraph: graph,
    flow,
    requires: parsed.ast ? requireTargets(parsed, { selfPath: opts.path ?? null }) : [],
    rulesRun: scanner.ruleIds ?? [],
    rulesSkipped: scanner.skipped ?? [],
  };
}

/**
 * Analyse every script in a place, plus the facts that only exist between scripts.
 *
 * @param {Array<{path: string, source: string}>} files
 */
export function analyzePlace(files, opts = {}) {
  const list = Array.isArray(files) ? files : [];
  const perFile = list.map((f) => analyzeFile(f.source, { ...opts, path: f.path }));
  const dependencies = buildDependencyGraph(list);
  const crossFindings = requireCycleFindings(dependencies);
  return {
    files: perFile,
    dependencies,
    symbols: indexPlace(list),
    findings: crossFindings,
    totals: {
      scripts: list.length,
      parsed: perFile.filter((f) => f.ok).length,
      errors: perFile.reduce((n, f) => n + f.errorCount, 0) + crossFindings.length,
      warnings: perFile.reduce((n, f) => n + f.warnCount, 0),
      requireCycles: dependencies.cycles.length,
    },
    search: (query, searchOpts) => searchPlace(list, query, searchOpts),
  };
}

/** A short structural summary of a file, for a prompt or a tool response. */
export function summarizeFile(source, opts = {}) {
  const inspected = inspectLuau(source, opts);
  const analysis = analyzeFile(source, opts);
  return {
    ok: inspected.ok,
    lines: inspected.lineCount,
    functions: inspected.functions.length,
    types: inspected.types.length,
    requires: analysis.requires.length,
    context: analysis.context,
    errors: analysis.errorCount,
    warnings: analysis.warnCount,
    topFindings: analysis.findings.slice(0, 5).map((f) => `${f.line}: ${f.rule} — ${f.detail}`),
  };
}
