/**
 * The lint backstop for scripts the agent WRITES (edit_script), the second half of milestone M4.
 *
 * add_behaviour covers the common verbs from a reviewed runtime. Where the agent still writes its own script (a behaviour no
 * verb expresses, a game system), this reads what it wrote and says what is wrong BEFORE it runs, in terms of behaviour on
 * parts, not a style guide. It sits on top of luau-review.ts (the parser, the control-flow and Roblox semantic rules) and
 * sandbox.ts (the network rule) and adds the checks that only matter for scripts that make things in a place do something:
 *
 *   unyielding-loop        ENFORCED. A loop that PROVABLY never yields (always true, no way out, every call a builtin that cannot
 *                          yield) pins the server thread until the watchdog kills the script: certain whatever the script is for,
 *                          so it is refused with the fix. Deliberately narrower than luau-review's two loop rules, which were
 *                          measured refusing fine scripts (a `break`, a helper that waits, coroutine.yield, a required module's
 *                          function, a wait inside pcall); what they suspect but cannot prove is `loop-may-not-yield`, a warning.
 *   reference-missing      A `:WaitForChild("X")` with no timeout on a name the inserted tree does not have waits forever and
 *                          the script silently stops: exactly what happens when a script written for one name meets a library
 *                          model whose parts are named otherwise. Checked against the live tree, not against memory.
 *   touched-without-guard  A Touched handler that does something and has no debounce fires dozens of times a second.
 *   connect-in-loop        A handler connected inside a `while` or `repeat` stacks another on every pass.
 *   asset-ingress, network-egress   The primitives refuseLuauIngress and the sandbox refuse elsewhere, REPORTED here: edit_script
 *                          still admits direct source (a deliberate carve-out recorded at refuseLuauIngress; changing it is the
 *                          owner's call), so this tells the agent instead of silently allowing it.
 *   hand-rolled-verb       INFORMATION, never a refusal: the script wires a trigger to an effect that add_behaviour has a verb for.
 *   behaviours-file        INFORMATION: that module is written by add_behaviour; a hand edit stops it merging.
 *   plus the run-context errors of luau-review (a LocalScript where it never runs).
 *
 * Only `unyielding-loop` is enforced; everything else is reported. That is the plan's own order ("tune false positives before
 * enforcing"). Every finding says what it measured. When the tree cannot be read the reference check says "unchecked" and
 * why, because a failure to observe must not render as an observation that nothing is wrong.
 *
 * Flag BEHAVIOUR_V2=off turns the whole thing off (no lint, no refusal).
 */
import { parseLuau } from '@golem/evals/src/luau-ast.mjs';
import { stripComments } from '@golem/evals/src/roblox-antipatterns.mjs';
import { reviewScript } from './luau-review';
import { scanSource } from './sandbox';
import { parseInstancePath } from './effects';
import { BEHAVIOUR_MODULE } from './behaviour-config';
import { parseTree, type ModelTree, type TNode } from './model-anatomy';

export interface BehaviourFinding {
  rule: string;
  severity: 'error' | 'warn' | 'info';
  line: number;
  detail: string;
  why: string;
  /** Refuses the write. Only the rules the plan has tuned. */
  enforced: boolean;
}

export interface LintInput {
  path: string;
  className?: string;
  source: string;
  /** Where the script lives (or will), for the reference check. */
  parentPath?: string;
  /** What scanLuauForAssetIngress found (tools.ts owns that scanner; passed in rather than imported, to keep this free of tools.ts). */
  ingress?: readonly { code: string; why: string }[];
}

type N = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SCRIPT_CLASSES = new Set(['Script', 'LocalScript', 'ModuleScript']);

function enabled(env: { BEHAVIOUR_V2?: string } | undefined): boolean {
  const v = String(env?.BEHAVIOUR_V2 ?? '').trim().toLowerCase();
  return !(v === 'off' || v === '0' || v === 'false');
}

// ---------------------------------------------------------------------------------------------------- AST helpers

function* children(n: N): Generator<N> {
  for (const [k, v] of Object.entries(n)) {
    if (k === 'typeAnnotation' || k === 'returnType' || k === 'generics') continue;
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x === 'object') yield x as N; }
    else if (v && typeof v === 'object') yield v as N;
  }
}

/** Depth-first over every node; `visit` returns false to skip a node's children. */
function visitAll(root: N, visit: (n: N, parents: N[]) => boolean | void, parents: N[] = []): void {
  if (visit(root, parents) === false) return;
  for (const c of children(root)) visitAll(c, visit, [...parents, root]);
}

const nameOf = (n: N | undefined): string | null => (n?.type === 'Identifier' ? String(n.name) : null);
const methodName = (call: N): string | null => (call.type === 'CallExpression' && call.base?.type === 'MemberExpression' ? nameOf(call.base.identifier) : null);
const strArg = (call: N, i: number): string | null => {
  const a = call.arguments?.[i];
  return a?.type === 'StringLiteral' && !a.interpolated ? String(a.value) : null;
};

/** The name at the root of a chain: `cool[player].x` -> "cool", `a.b:c()` -> "a". */
function rootName(n: N | undefined): string | null {
  let at = n;
  for (let i = 0; at && i < 64; i++) {
    if (at.type === 'Identifier') return String(at.name);
    at = at.base ?? at.expression;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------- rules

/**
 * A loop that PROVABLY never yields: its condition is the constant true (`while true`, `while 1`, `repeat … until false`), its body
 * has no way out (no break, return or goto outside nested functions), and every call in it is to a function known not to yield
 * (print, math.*, string.*, table.*, Vector3.new …). Anything else (a method call, a call to a function of the script's own or of
 * a required module, task.*, pcall, coroutine.*) might yield, so it is not claimed.
 *
 * This is deliberately narrower than luau-review's `busy-wait-loop` and `no-yield-infinite-loop`. Measured on invented scripts:
 * the first refuses a `while true` with a `break`, one that calls a local helper which waits, one that yields through
 * coroutine.yield and one that returns; the second refuses a loop that calls a required module's function and one that waits
 * inside pcall. Those are fine scripts, and a refusal that is wrong costs more than the rule is worth, so only the certain subset
 * is enforced and the rest is reported as `loop-may-not-yield`.
 */
const PURE_GLOBALS = new Set(['print', 'warn', 'tostring', 'tonumber', 'type', 'typeof', 'ipairs', 'pairs', 'next', 'select', 'rawget', 'rawset', 'rawequal', 'rawlen', 'setmetatable', 'getmetatable', 'unpack', 'tick', 'time']);
const PURE_NAMESPACES = new Set(['math', 'string', 'table', 'bit32', 'utf8', 'Vector3', 'Vector2', 'CFrame', 'Color3', 'UDim2', 'UDim', 'Random', 'Rect', 'Color3']);

function constantTrue(cond: N | undefined): boolean {
  if (!cond) return false;
  if (cond.type === 'BooleanLiteral') return cond.value === true;
  if (cond.type === 'NumericLiteral') return Number(cond.value) !== 0;
  return cond.type === 'UnaryExpression' && cond.operator === 'not' && cond.argument?.type === 'BooleanLiteral' && cond.argument.value === false;
}

/** Every name the script itself declares or assigns (locals, functions, parameters, loop variables, globals): these shadow a builtin. */
function ownNames(ast: N): Set<string> {
  const names = new Set<string>();
  visitAll(ast, (n) => {
    if (n.type === 'LocalStatement') for (const x of n.names ?? []) names.add(String(x.name));
    if (n.type === 'FunctionDeclaration') names.add(String(n.path?.[0] ?? n.name));
    if (Array.isArray(n.params)) for (const x of n.params) names.add(String(x.name));
    if (n.type === 'GenericForStatement') for (const x of n.variables ?? []) names.add(String(x.name));
    if (n.type === 'NumericForStatement' && n.variable) names.add(String(n.variable.name));
    if (n.type === 'AssignmentStatement') for (const t of n.targets ?? []) { const r = rootName(t); if (r) names.add(r); }
  });
  return names;
}

function pureCall(call: N, own: ReadonlySet<string>): boolean {
  if (call.method) return false;
  const base = call.base;
  if (base?.type === 'Identifier') return PURE_GLOBALS.has(String(base.name)) && !own.has(String(base.name));
  if (base?.type === 'MemberExpression' && base.indexer === '.' && base.base?.type === 'Identifier') {
    const ns = String(base.base.name), fn = String(base.identifier?.name);
    if (own.has(ns)) return false;
    return PURE_NAMESPACES.has(ns) || (ns === 'os' && (fn === 'clock' || fn === 'time')) || (ns === 'Instance' && fn === 'new');
  }
  return false;
}

function provablyFrozenLoops(ast: N): number[] {
  const lines: number[] = [];
  const own = ownNames(ast);
  visitAll(ast, (n) => {
    const loop = (n.type === 'WhileStatement' && constantTrue(n.condition)) || (n.type === 'RepeatStatement' && n.condition?.type === 'BooleanLiteral' && n.condition.value === false);
    if (!loop) return;
    let frozen = true;
    const inspect = (x: N): boolean | void => {
      if (!frozen) return false;
      if (x.type === 'FunctionExpression' || x.type === 'FunctionDeclaration' || x.type === 'LocalFunctionStatement') return false; // defined, not run
      if (x.type === 'BreakStatement' || x.type === 'ReturnStatement' || x.type === 'GotoStatement') frozen = false;
      if (x.type === 'CallExpression' && !pureCall(x, own)) frozen = false;
    };
    for (const c of children(n)) visitAll(c, inspect);
    if (frozen) lines.push(n.line);
  });
  return lines;
}

const EFFECT_METHODS = new Set(['Play', 'Emit', 'Clone', 'Destroy', 'TakeDamage', 'FireClient', 'FireAllClients', 'ApplyImpulse', 'Create', 'SetAttribute', 'Fire']);
const EFFECT_PROPS = new Set(['CFrame', 'Position', 'Transparency', 'Enabled', 'Health', 'Value', 'AssemblyLinearVelocity', 'Anchored', 'Color', 'Size', 'Material', 'Text', 'Visible']);

function bodyEffects(fn: N): boolean {
  let found = false;
  visitAll(fn, (n) => {
    if (found) return false;
    if (n.type === 'CallExpression') {
      const m = methodName(n);
      if (m && EFFECT_METHODS.has(m)) found = true;
      if (n.base?.type === 'MemberExpression' && nameOf(n.base.base) === 'Instance' && nameOf(n.base.identifier) === 'new') found = true;
    }
    if (n.type === 'AssignmentStatement') {
      for (const t of n.targets ?? []) if (t.type === 'MemberExpression' && EFFECT_PROPS.has(String(t.identifier?.name))) found = true;
    }
    return !found;
  });
  return found;
}

/** A debounce, in any of its shapes: a clock read, a disconnect, or a variable the handler both tests and sets. */
function bodyGuarded(fn: N): boolean {
  const declared = new Set<string>();
  const assigned = new Set<string>();
  const tested = new Set<string>();
  let clock = false;
  visitAll(fn, (n) => {
    if (n.type === 'LocalStatement') for (const x of n.names ?? []) declared.add(String(x.name));
    if (n.type === 'AssignmentStatement') for (const t of n.targets ?? []) { const r = rootName(t); if (r) assigned.add(r); }
    if (n.type === 'IfStatement') {
      for (const c of n.clauses ?? []) visitAll(c.condition ?? {}, (x) => { if (x.type === 'Identifier') tested.add(String(x.name)); });
    }
    if (n.type === 'WhileStatement' || n.type === 'RepeatStatement') visitAll(n.condition ?? {}, (x) => { if (x.type === 'Identifier') tested.add(String(x.name)); });
    if (n.type === 'CallExpression') {
      const m = methodName(n);
      if (m === 'Disconnect' || m === 'Once' || m === 'GetServerTimeNow') clock = true;
      const base = n.base;
      const path = base?.type === 'MemberExpression' ? `${nameOf(base.base) ?? ''}.${nameOf(base.identifier) ?? ''}` : nameOf(base) ?? '';
      if (path === 'os.clock' || path === 'os.time' || path === 'tick' || path === 'time') clock = true;
    }
  });
  if (clock) return true;
  for (const name of assigned) if (!declared.has(name) && tested.has(name)) return true;
  return false;
}

function signalHandlers(ast: N, signal: string): { call: N; fn: N }[] {
  const out: { call: N; fn: N }[] = [];
  visitAll(ast, (n) => {
    if (n.type === 'CallExpression' && methodName(n) === 'Connect' && n.base.base?.type === 'MemberExpression' && nameOf(n.base.base.identifier) === signal) {
      const fn = n.arguments?.[0];
      if (fn?.type === 'FunctionExpression') out.push({ call: n, fn });
    }
  });
  return out;
}

function touchedWithoutGuard(ast: N): BehaviourFinding[] {
  const out: BehaviourFinding[] = [];
  for (const { call, fn } of signalHandlers(ast, 'Touched')) {
    if (bodyEffects(fn) && !bodyGuarded(fn)) {
      out.push({
        rule: 'touched-without-guard', severity: 'warn', line: call.line, enforced: false,
        detail: 'a Touched handler that does something and has no debounce',
        why: 'Touched fires for every limb of every part touching, many times a second; without a flag, a cooldown or a Disconnect the effect repeats (a sound stacks, a tween restarts, damage multiplies)',
      });
    }
  }
  return out;
}

function connectInLoop(ast: N): BehaviourFinding[] {
  const out: BehaviourFinding[] = [];
  visitAll(ast, (n, parents) => {
    if (n.type !== 'CallExpression' || methodName(n) !== 'Connect') return;
    // The nearest enclosing function ends the question: a Connect inside a function runs when that function does.
    for (let i = parents.length - 1; i >= 0; i--) {
      const p = parents[i]!;
      if (p.type === 'FunctionExpression' || p.type === 'FunctionDeclaration' || p.type === 'LocalFunctionStatement') return;
      if (p.type === 'WhileStatement' || p.type === 'RepeatStatement') {
        out.push({
          rule: 'connect-in-loop', severity: 'warn', line: n.line, enforced: false,
          detail: 'an event is connected inside a while or repeat loop',
          why: 'every pass of the loop adds another handler on the same event, so the effect runs more times each time round; connect once outside the loop (a `for` over a list that connects once per item is fine)',
        });
        return;
      }
    }
  });
  return out;
}

/** What `script` and the aliases of it and of its children resolve to, within the subtree we were given. */
function referenceCheck(ast: N, tree: ModelTree): BehaviourFinding[] {
  const SCRIPT = Symbol('script');
  type V = TNode | typeof SCRIPT | undefined;
  const decls = new Map<string, N[]>();
  const assignedLater = new Set<string>();
  visitAll(ast, (n) => {
    if (n.type === 'LocalStatement' && n.names?.length === 1 && n.init?.length === 1) {
      const name = String(n.names[0].name);
      decls.set(name, [...(decls.get(name) ?? []), n.init[0]]);
    } else if (n.type === 'LocalStatement') {
      for (const x of n.names ?? []) decls.set(String(x.name), [...(decls.get(String(x.name)) ?? []), {}, {}]); // not a plain alias: unusable
    }
    if (n.type === 'AssignmentStatement') for (const t of n.targets ?? []) { const r = nameOf(t); if (r) assignedLater.add(r); }
    // Any function form (expression, `function f()`, `local function f()`): its parameters shadow outer names.
    if (Array.isArray(n.params)) for (const p of n.params) decls.set(String(p.name), [...(decls.get(String(p.name)) ?? []), {}, {}]);
    if (n.type === 'NumericForStatement' || n.type === 'GenericForStatement') {
      for (const v of [...(n.variables ?? []), ...(n.variable ? [n.variable] : [])]) decls.set(String(v.name), [...(decls.get(String(v.name)) ?? []), {}, {}]);
    }
  });
  const findings: BehaviourFinding[] = [];
  const reported = new Set<N>();
  const memo = new Map<N, V>();
  const resolving = new Set<N>();

  const res = (e: N | undefined): V => {
    if (!e) return undefined;
    if (memo.has(e)) return memo.get(e);
    if (resolving.has(e)) return undefined;
    resolving.add(e);
    let v: V;
    if (e.type === 'ParenthesisExpression') v = res(e.expression);
    else if (e.type === 'Identifier') {
      if (e.name === 'script') v = SCRIPT;
      else {
        const d = decls.get(String(e.name));
        v = d && d.length === 1 && !assignedLater.has(String(e.name)) && d[0]!.type ? res(d[0]) : undefined;
      }
    } else if (e.type === 'MemberExpression' && e.indexer === '.' && nameOf(e.identifier) === 'Parent') {
      const base = res(e.base);
      v = base === SCRIPT ? tree.root : base ? (base as TNode).parent ?? undefined : undefined;
    } else if (e.type === 'CallExpression' && e.method) {
      const m = methodName(e);
      const want = strArg(e, 0);
      const base = res(e.base?.base);
      if ((m === 'WaitForChild' || m === 'FindFirstChild') && want !== null && base && base !== SCRIPT) {
        const node = (base as TNode).children.find((c) => c.name === want);
        if (node) v = node;
        else {
          // WaitForChild with no timeout on a name that is not there waits forever. FindFirstChild is nil-safe by design.
          if (m === 'WaitForChild' && (e.arguments?.length ?? 0) === 1 && !reported.has(e)) {
            reported.add(e);
            const have = [...new Set((base as TNode).children.map((c) => c.name))].slice(0, 8);
            findings.push({
              rule: 'reference-missing', severity: 'error', line: e.line, enforced: false,
              detail: `:WaitForChild("${want}") on ${(base as TNode).address}, which has no child named "${want}" (it has: ${have.join(', ') || 'nothing'}${(base as TNode).children.length > have.length ? ', …' : ''})`,
              why: 'an untimed WaitForChild on a name that is not there yields forever: the script stops at that line and reports nothing. Use a name the tree has (model_anatomy lists them), give a timeout and handle nil, or create the child first',
            });
          }
          v = undefined;
        }
      }
    }
    resolving.delete(e);
    memo.set(e, v);
    return v;
  };
  visitAll(ast, (n) => { if (n.type === 'CallExpression') res(n); });
  return findings.sort((a, b) => a.line - b.line);
}

const VERB_HINTS: { verb: string; test: RegExp }[] = [
  { verb: 'swing or slide', test: /TweenService|:Create\s*\(|CFrame\s*=|Position\s*=/ },
  { verb: 'spin', test: /CFrame\.Angles|Orientation\s*=/ },
  { verb: 'bob', test: /math\.sin\s*\(/ },
  { verb: 'fade', test: /Transparency\s*=/ },
  { verb: 'light', test: /\bPointLight\b|\bSpotLight\b|\bSurfaceLight\b|\.Enabled\s*=/ },
  { verb: 'sound', test: /:Play\s*\(|\bSound\b|\.Looped\b/ },
  { verb: 'emit', test: /:Emit\s*\(/ },
  { verb: 'bounce', test: /AssemblyLinearVelocity|ApplyImpulse|LinearVelocity/ },
];
const TRIGGER_HINT = /\.MouseClick\b|\.Triggered\b|\.Touched\b|ClickDetector|ProximityPrompt/;

function handRolledVerb(src: string, path: string): BehaviourFinding[] {
  if (!path.startsWith('game.Workspace')) return [];
  const clean = stripComments(src);
  if (!TRIGGER_HINT.test(clean)) return [];
  const verbs = VERB_HINTS.filter((h) => h.test.test(clean)).map((h) => h.verb);
  if (verbs.length === 0) return [];
  return [{
    rule: 'hand-rolled-verb', severity: 'info', line: 1, enforced: false,
    detail: `this script ties a click, prompt or touch to an effect (${verbs.join(', ')}) that add_behaviour has verbs for`,
    why: 'add_behaviour attaches those verbs to parts by path from a reviewed runtime, with no script to maintain. Keep this script if it does something the verbs cannot express',
  }];
}

// ------------------------------------------------------------------------------------------------------------- run

const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 } as const;

/** The pure part: every finding for one script, given the tree around it when there is one. */
export function lintBehaviourScript(input: LintInput, tree?: ModelTree | null): BehaviourFinding[] {
  const parsed = parseLuau(input.source, { path: input.path });
  if (!parsed.ok || !parsed.ast) return [];
  const ast = parsed.ast as N;
  const out: BehaviourFinding[] = [];

  // The loop that provably never yields is enforced; luau-review's broader suspicion and its run-context errors are reported.
  const frozen = new Set(provablyFrozenLoops(ast));
  for (const line of frozen) {
    out.push({
      rule: 'unyielding-loop', severity: 'error', line, enforced: true,
      detail: 'a loop that is always true, has no break or return, and calls nothing that could yield',
      why: 'a loop that never yields pins the thread until Roblox\'s watchdog kills the script ("Script timeout: exhausted allowed execution time"): it seems to work in Studio and stops live. Put task.wait() in it, or drive it from an event (RunService.Heartbeat:Connect, a Touched or Changed signal)',
    });
  }
  const review = reviewScript(input.path, input.source, input.className);
  for (const f of review.findings) {
    if (f.rule === 'no-yield-infinite-loop' && !frozen.has(f.line)) {
      out.push({
        rule: 'loop-may-not-yield', severity: 'warn', line: f.line, enforced: false,
        detail: 'a `while true` loop whose body has no call known to yield',
        why: 'if nothing in it yields (task.wait, an event :Wait(), a yielding call) the thread is pinned until the watchdog kills the script; if a function it calls yields, ignore this',
      });
    } else if (f.severity === 'error' && (f.rule === 'localscript-in-server-container' || f.rule === 'server-script-in-client-container' || f.rule === 'client-requires-server-module')) {
      out.push({ rule: f.rule, severity: 'error', line: f.line, detail: f.detail, why: f.why ?? f.rule, enforced: false });
    }
  }

  out.push(...touchedWithoutGuard(ast));
  out.push(...connectInLoop(ast));
  if (tree) out.push(...referenceCheck(ast, tree));

  for (const f of input.ingress ?? []) {
    if (f.code === 'asset_uri') continue; // an asset id literal is ordinary in a script that plays a library sound
    out.push({ rule: 'asset-ingress', severity: 'warn', line: 1, enforced: false, detail: f.code, why: `${f.why}. run_luau and workspace-file sources are refused for this; a direct edit_script is still admitted (owner decision pending), so this is reported, not silent` });
  }
  for (const f of scanSource('luau', 'studio', input.source)) {
    out.push({ rule: 'network-egress', severity: 'warn', line: 1, enforced: false, detail: f.code, why: f.why });
  }
  out.push(...handRolledVerb(input.source, input.path));
  if (input.path.endsWith(`.${BEHAVIOUR_MODULE}`)) {
    out.push({ rule: 'behaviours-file', severity: 'info', line: 1, enforced: false, detail: `${BEHAVIOUR_MODULE} is written by add_behaviour`, why: 'a hand edit makes add_behaviour refuse to merge into this file (it detects the difference); change behaviours with add_behaviour {model, behaviours | remove}' });
  }
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line);
}

const NEEDS_TREE = /:\s*WaitForChild\s*\(\s*["']/;

export interface WriteLint {
  refusal?: { error: string; lint: string[] };
  /** What to put on the tool result: short lines, plus how far the reference check got. */
  summary?: { findings: string[]; references: string };
}

const line = (f: BehaviourFinding) => `line ${f.line}: ${f.rule} — ${f.detail}`;

/** Before an edit_script write: read the tree around the script when a reference needs checking, lint, and decide. */
export async function lintScriptWrite(
  ctx: { env?: { BEHAVIOUR_V2?: string }; execStudioOp: (op: never, timeoutMs?: number) => Promise<{ ok: boolean; data?: unknown; error?: string }> },
  input: LintInput,
): Promise<WriteLint> {
  if (!enabled(ctx.env)) return {};
  if (input.className && !SCRIPT_CLASSES.has(input.className)) return {};
  let tree: ModelTree | null = null;
  let references = 'not needed (no :WaitForChild("name") with a literal name)';
  if (NEEDS_TREE.test(input.source)) {
    const parentPath = input.parentPath ?? parentOf(input.path);
    if (!parentPath) {
      references = 'unchecked (the script\'s parent could not be worked out)';
    } else {
      try {
        const got = await ctx.execStudioOp({ op: 'get_tree', root: parentPath, maxDepth: 4, maxNodes: 300 } as never, 20_000);
        if (!got.ok) references = `unchecked (${String(got.error ?? 'the place did not answer').slice(0, 120)})`;
        else {
          const t = parseTree(got.data);
          if ('error' in t) references = `unchecked (${t.error})`;
          else if (t.truncated) references = 'unchecked (the tree around the script is too large to read in one go)';
          else { tree = t; references = 'checked against the tree in the place now'; }
        }
      } catch (e) {
        references = `unchecked (${String(e instanceof Error ? e.message : e).slice(0, 120)})`;
      }
    }
  }
  const findings = lintBehaviourScript(input, tree);
  const refused = findings.filter((f) => f.enforced);
  if (refused.length) {
    return {
      refusal: {
        error: `refused: this script would freeze the server — ${refused.map(line).join('; ')}. ${refused[0]!.why}. Nothing was written, ${input.path} is unchanged.`,
        lint: findings.slice(0, 6).map(line),
      },
    };
  }
  const shown = findings.slice(0, 6).map(line);
  if (!shown.length && !references.startsWith('unchecked')) return {};
  return { summary: { findings: shown, references } };
}

function parentOf(path: string): string | null {
  const segs = parseInstancePath(path);
  if (!segs || segs.length < 2) return null;
  const parent = segs.slice(0, -1);
  return `game${parent.map((s) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? `.${s}` : `["${s}"]`)).join('')}`;
}
