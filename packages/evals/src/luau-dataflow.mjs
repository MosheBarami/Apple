// Data-flow over a Luau file: where a value came from, and where a value goes.
//
// Two analyses, because the cluster needs two different answers from the same machinery.
//
// 1. CONSTANT PROPAGATION OF INSTANCE PATHS. `require(Modules.Shop)` names no file. To know which
//    script that is you have to know that `Modules` is `ReplicatedStorage.Modules`, which you learn
//    from `local Modules = RS.Modules` three lines up, which you learn from
//    `local RS = game:GetService("ReplicatedStorage")` at the top. That chain is the entire content
//    of a Roblox dependency graph, and it is invisible to anything that does not follow assignments.
//
// 2. TAINT FROM REMOTE HANDLERS. `roblox-antipatterns.mjs` already reports the DIRECT shape —
//    a remote parameter named `amount` written straight into a `.Value`. What it says about itself
//    is that it "cannot follow a value across a ModuleScript boundary"; it also cannot follow one
//    across a LOCAL. `local qty = amount` then `coins.Value += qty` is the same exploit with one
//    extra line, and the scanner's regex — which requires the parameter's own name next to the
//    assignment — cannot see it.
//
//    So `taintFindings` deliberately reports only flows with AT LEAST ONE HOP. Direct flows are the
//    scanner's job and reporting them here would double-count the same bug. The division is by what
//    each tool can actually decide, not by taste.
//
// STATED LIMIT: the taint pass is flow-INSENSITIVE within a handler. It asks "is this local ever
// assigned from something tainted", not "is it tainted at this point". That over-approximates
// (a local overwritten with a constant after a tainted assignment stays tainted) and never
// under-approximates, which is the correct direction for a security check. Table FIELDS are not
// tracked at all: `t.n = amount` does not taint `t`.

import { parseLuau, findNodes, memberPath, walk } from './luau-ast.mjs';

/** Steps a path expression can take that mean "a child of". */
const CHILD_METHODS = new Set(['WaitForChild', 'FindFirstChild', 'FindFirstChildOfClass', 'FindFirstChildWhichIsA']);

/**
 * Resolve an expression that names a DataModel object to a `/`-joined path.
 *
 * `selfPath` is the path of the script doing the resolving, which is what makes `script.Parent.X`
 * answerable at all. Returns null when the expression is not statically decidable — a computed
 * index, a function return, a variable we never saw assigned. Null is a real answer here: the
 * dependency graph reports it as unresolved rather than inventing an edge.
 */
export function resolveInstanceExpression(node, env, selfPath) {
  const join = (base, child) => (base === '' ? child : `${base}/${child}`);
  const parentOf = (p) => {
    if (p === null) return null;
    const i = p.lastIndexOf('/');
    if (i === -1) return p === '' ? null : '';
    return p.slice(0, i);
  };

  const go = (n) => {
    if (!n) return null;
    switch (n.type) {
      case 'Identifier': {
        if (n.name === 'script') return selfPath ?? null;
        if (n.name === 'game' || n.name === 'Game') return '';
        if (n.name === 'workspace' || n.name === 'Workspace') return 'Workspace';
        return env.has(n.name) ? env.get(n.name) : null;
      }
      case 'ParenthesisExpression':
        return go(n.expression);
      case 'MemberExpression': {
        const base = go(n.base);
        if (base === null) return null;
        if (n.identifier.name === 'Parent') return parentOf(base);
        return join(base, n.identifier.name);
      }
      case 'IndexExpression': {
        if (n.index?.type !== 'StringLiteral') return null;
        const base = go(n.base);
        return base === null ? null : join(base, n.index.value);
      }
      case 'CallExpression': {
        if (n.method) {
          const method = n.base?.identifier?.name;
          const base = go(n.base?.base);
          if (base === null) return null;
          if (method === 'GetService') {
            const arg = n.arguments[0];
            return arg?.type === 'StringLiteral' ? arg.value : null;
          }
          if (CHILD_METHODS.has(method)) {
            const arg = n.arguments[0];
            return arg?.type === 'StringLiteral' ? join(base, arg.value) : null;
          }
          return null;
        }
        return null;
      }
      default:
        return null;
    }
  };
  return go(node);
}

/**
 * The constant environment of a file: every local we can prove points at a DataModel object.
 *
 * Built in SOURCE ORDER so `local Modules = RS.Modules` can use the `RS` defined above it, and so a
 * name reassigned to something unresolvable is dropped rather than left stale.
 */
export function instanceEnvironment(input, opts = {}) {
  const parsed = typeof input === 'string' ? parseLuau(input, opts) : input;
  const selfPath = opts.selfPath ?? null;
  const env = new Map();
  const statements = [];
  walk(parsed.ast, (node) => {
    if (node.type === 'LocalStatement' || node.type === 'AssignmentStatement') statements.push(node);
  });
  statements.sort((a, b) => a.start - b.start);
  for (const stmt of statements) {
    if (stmt.type === 'LocalStatement') {
      stmt.names.forEach((n, i) => {
        const path = resolveInstanceExpression(stmt.init[i], env, selfPath);
        if (path === null) env.delete(n.name);
        else env.set(n.name, path);
      });
    } else if (stmt.operator === '=') {
      stmt.targets.forEach((t, i) => {
        if (t.type !== 'Identifier') return;
        const path = resolveInstanceExpression(stmt.values[i], env, selfPath);
        if (path === null) env.delete(t.name);
        else env.set(t.name, path);
      });
    }
  }
  return env;
}

/** Every `require(...)` in the file, with the path it resolves to (or null). */
export function requireTargets(input, opts = {}) {
  const parsed = typeof input === 'string' ? parseLuau(input, opts) : input;
  const env = instanceEnvironment(parsed, opts);
  const out = [];
  for (const call of findNodes(parsed.ast, 'CallExpression')) {
    if (call.method) continue;
    if (memberPath(call.base) !== 'require') continue;
    const arg = call.arguments[0];
    out.push({
      line: call.line,
      path: resolveInstanceExpression(arg, env, opts.selfPath ?? null),
      literal: arg?.type === 'StringLiteral' ? arg.value : null,
      expression: arg ? sourceOf(parsed, arg) : '',
    });
  }
  return out;
}

function sourceOf(parsed, node) {
  return typeof parsed.text === 'string' ? parsed.text.slice(node.start, node.end) : node.type;
}

// ------------------------------------------------------------------------- taint

/** Handlers whose parameters after the first are attacker-controlled. */
function remoteHandlers(ast) {
  const out = [];
  for (const call of findNodes(ast, 'CallExpression')) {
    if (!call.method) continue;
    if (call.base?.identifier?.name !== 'Connect' && call.base?.identifier?.name !== 'ConnectParallel') continue;
    const signal = memberPath(call.base?.base);
    if (!signal || !/(^|\.)OnServerEvent$/.test(signal)) continue;
    const fn = call.arguments[0];
    if (fn?.type !== 'FunctionExpression') continue;
    out.push({ node: fn, line: call.line, kind: 'OnServerEvent' });
  }
  for (const assign of findNodes(ast, 'AssignmentStatement')) {
    assign.targets.forEach((t, i) => {
      const path = memberPath(t);
      if (!path || !/(^|\.)OnServerInvoke$/.test(path)) return;
      const fn = assign.values[i];
      if (fn?.type !== 'FunctionExpression') return;
      out.push({ node: fn, line: assign.line, kind: 'OnServerInvoke' });
    });
  }
  return out;
}

const SINK_METHODS = new Map([
  ['SetAsync', 'stores unvalidated client data in a DataStore'],
  ['UpdateAsync', 'stores unvalidated client data in a DataStore'],
  ['IncrementAsync', 'increments a DataStore by a client-chosen amount'],
  ['FireAllClients', 'relays unvalidated client data to every player'],
  ['PostAsync', 'sends unvalidated client data to an external service'],
  ['RequestAsync', 'sends unvalidated client data to an external service'],
]);

const SINK_FUNCTIONS = new Map([
  ['loadstring', 'executes a client-supplied string as code'],
  ['require', 'requires a client-supplied module'],
  ['Instance.new', 'creates an instance of a client-chosen class'],
]);

/** Names of identifiers read anywhere inside an expression. */
function readsOf(node) {
  const names = new Set();
  walk(node, (n) => {
    if (n.type === 'Identifier') names.add(n.name);
    if (n.type === 'MemberExpression') {
      // only the ROOT of a member chain is a variable read
      let cur = n;
      while (cur.type === 'MemberExpression') cur = cur.base;
      if (cur.type === 'Identifier') names.add(cur.name);
      return false;
    }
    return undefined;
  });
  return names;
}

/**
 * Every flow from a remote handler parameter to a dangerous sink, with the number of assignment
 * hops it took to get there.
 */
export function taintFlows(input, opts = {}) {
  const parsed = typeof input === 'string' ? parseLuau(input, opts) : input;
  const flows = [];

  for (const handler of remoteHandlers(parsed.ast)) {
    const params = handler.node.params.map((p) => p.name);
    // The first parameter of OnServerEvent is the Player, supplied by Roblox, not by the client.
    const tainted = new Map();
    for (const p of params.slice(1)) tainted.set(p, { hops: 0, origin: p });
    if (tainted.size === 0) continue;

    // Flow-insensitive fixpoint: keep propagating until no new local becomes tainted.
    const assignments = [];
    walk(handler.node.body, (n) => {
      if (n.type === 'LocalStatement') {
        n.names.forEach((name, i) => assignments.push({ target: name.name, value: n.init[i] ?? n.init[0], line: name.line }));
      } else if (n.type === 'AssignmentStatement') {
        n.targets.forEach((t, i) => {
          if (t.type === 'Identifier') assignments.push({ target: t.name, value: n.values[i] ?? n.values[0], line: t.line });
        });
      }
      return undefined;
    });
    for (let pass = 0; pass < assignments.length + 1; pass += 1) {
      let changed = false;
      for (const a of assignments) {
        if (!a.value) continue;
        const names = readsOf(a.value);
        let best = null;
        for (const n of names) {
          const t = tainted.get(n);
          if (t && (best === null || t.hops < best.hops)) best = t;
        }
        if (!best) continue;
        const existing = tainted.get(a.target);
        const next = { hops: best.hops + 1, origin: best.origin };
        if (!existing || existing.hops > next.hops) {
          tainted.set(a.target, next);
          changed = true;
        }
      }
      if (!changed) break;
    }

    const taintOf = (node) => {
      const names = readsOf(node);
      let best = null;
      for (const n of names) {
        const t = tainted.get(n);
        if (t && (best === null || t.hops < best.hops)) best = t;
      }
      return best;
    };

    // sinks: `<x>.Value = tainted`
    walk(handler.node.body, (n) => {
      if (n.type !== 'AssignmentStatement') return undefined;
      n.targets.forEach((t, i) => {
        if (t.type !== 'MemberExpression' || t.identifier.name !== 'Value') return;
        const value = n.operator === '=' ? n.values[i] : n.values[0];
        const t2 = taintOf(value);
        if (!t2) return;
        flows.push({
          origin: t2.origin,
          hops: t2.hops,
          line: n.line,
          sink: `${memberPath(t) ?? '<computed>'} =`,
          why: 'a client-supplied number is written straight into a replicated value',
          handlerLine: handler.line,
          handlerKind: handler.kind,
        });
      });
      return undefined;
    });

    // sinks: calls
    for (const call of findNodes(handler.node.body, 'CallExpression')) {
      const name = call.method ? call.base?.identifier?.name : memberPath(call.base);
      const reason = call.method ? SINK_METHODS.get(name) : SINK_FUNCTIONS.get(name);
      if (!reason) continue;
      for (const arg of call.arguments) {
        const t = taintOf(arg);
        if (!t) continue;
        flows.push({
          origin: t.origin,
          hops: t.hops,
          line: call.line,
          sink: `${name}(…)`,
          why: reason,
          handlerLine: handler.line,
          handlerKind: handler.kind,
        });
        break;
      }
    }
  }
  return flows.sort((a, b) => a.line - b.line || a.sink.localeCompare(b.sink));
}

/**
 * Taint flows as findings.
 *
 * `minHops` defaults to 1 ON PURPOSE. A zero-hop flow — the parameter used at the sink by its own
 * name — is what `roblox-antipatterns.mjs`'s `server-trusts-client-amount` already reports, and
 * emitting it again would make one bug look like two. Everything at one hop or more is a flow that
 * rule structurally cannot see, which is the whole reason this pass exists.
 */
export function taintFindings(input, opts = {}) {
  const minHops = opts.minHops ?? 1;
  return taintFlows(input, opts)
    .filter((f) => f.hops >= minHops)
    .map((f) => ({
      rule: 'remote-taint-reaches-sink',
      severity: 'error',
      line: f.line,
      detail: `\`${f.origin}\` from the ${f.handlerKind} handler on line ${f.handlerLine} reaches ${f.sink} through ${f.hops} assignment(s)`,
      why: f.why,
    }));
}
