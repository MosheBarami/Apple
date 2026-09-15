// Call graph (inside a file) and dependency graph (across a place's scripts).
//
// The two exist for the same reason: a fact about one function or one script is usually a fact
// about its neighbours. `step()` looks harmless until you know it spins on `os.clock()` and never
// yields; a `while true` loop that calls it inherits that. `ShopService` looks fine until you know
// it requires `Economy`, which requires `ShopService` — a require cycle, which in Roblox does not
// error cleanly: `require` on a module that is mid-load YIELDS, and if nothing breaks the cycle the
// two scripts wait on each other forever with no stack trace and no output. "Nothing loaded and
// nothing printed" is the single hardest Roblox bug to diagnose from a bug report, and it is fully
// decidable from the graph.
//
// RESOLUTION IS NAME-BASED AND SAYS SO. A call to `foo` binds to a function named `foo` in the same
// file; `self:bar()` inside a method of `M` binds to `M.bar`. Calls through a variable holding a
// function, or into a required module's table, are reported as UNRESOLVED rather than guessed — an
// invented edge would make the transitive yield set wrong in the dangerous direction.

import { parseLuau, findNodes, memberPath, walk } from './luau-ast.mjs';
import { callYields } from './luau-flow.mjs';
import { requireTargets } from './luau-dataflow.mjs';

/** Every function definition in a file, with the name a call site would use. */
function definitionsOf(ast) {
  const defs = [];
  const seen = new Set();
  const add = (name, node, owner, kind) => {
    if (seen.has(node)) return;
    seen.add(node);
    defs.push({
      id: `${name}@${node.line}`,
      name,
      owner,
      kind,
      line: node.line,
      endLine: node.endLine ?? node.line,
      start: node.start,
      end: node.end,
      node,
    });
  };

  for (const fn of findNodes(ast, 'FunctionDeclaration')) {
    const owner = fn.path && fn.path.length > 1 ? fn.path.slice(0, -1).join('.') : null;
    add(fn.name, fn, owner, fn.isLocal ? 'local' : 'global');
  }
  // `local f = function() end` and `M.f = function() end`
  for (const stmt of findNodes(ast, 'LocalStatement')) {
    stmt.names.forEach((n, i) => {
      const v = stmt.init[i];
      if (v?.type === 'FunctionExpression') add(n.name, v, null, 'local');
      if (v?.type === 'TableConstructorExpression') {
        for (const f of v.fields) {
          if (f.type === 'TableKeyString' && f.value?.type === 'FunctionExpression') {
            add(`${n.name}.${f.key.name}`, f.value, n.name, 'field');
          }
        }
      }
    });
  }
  for (const stmt of findNodes(ast, 'AssignmentStatement')) {
    stmt.targets.forEach((t, i) => {
      const v = stmt.values[i];
      if (v?.type !== 'FunctionExpression') return;
      const path = memberPath(t);
      if (!path) return;
      const owner = path.includes('.') ? path.split('.').slice(0, -1).join('.') : null;
      add(path, v, owner, 'field');
    });
  }
  // `return { Start = function() ... end }` — a module's entire public API is often written this
  // way and never bound to a name, so without this pass `indexPlace` returns nothing for the
  // commonest module shape in the corpus.
  for (const tbl of findNodes(ast, 'TableConstructorExpression')) {
    for (const f of tbl.fields) {
      if (f.type === 'TableKeyString' && f.value?.type === 'FunctionExpression') {
        add(f.key.name, f.value, null, 'field');
      }
    }
  }
  return defs;
}

/** Calls made directly by this function — not by closures nested inside it. */
function directCalls(fnNode) {
  const out = [];
  const body = fnNode.body ?? fnNode;
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    if (node !== fnNode && (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration')) return;
    if (node.type === 'CallExpression') {
      out.push(node);
    }
    for (const key of Object.keys(node)) {
      if (key === 'node') continue;
      const v = node[key];
      if (v && typeof v === 'object') visit(v);
    }
  };
  visit(body);
  return out;
}

/**
 * Build the call graph of one file.
 *
 * Node 0 is always the chunk itself — top-level code is a caller too, and leaving it out makes
 * every module's initialisation invisible to reachability.
 */
export function buildCallGraph(input, opts = {}) {
  const parsed = typeof input === 'string' ? parseLuau(input, opts) : input;
  const defs = definitionsOf(parsed.ast);
  const byName = new Map();
  for (const d of defs) {
    if (!byName.has(d.name)) byName.set(d.name, d);
  }

  const chunk = {
    id: '<chunk>@0', name: '<chunk>', owner: null, kind: 'chunk', line: 1,
    endLine: parsed.ast?.endLine ?? 1, node: parsed.ast, start: 0, end: parsed.ast?.end ?? 0,
  };
  const nodes = [chunk, ...defs];

  // Top-level statements are the chunk's body minus every function body.
  const edges = [];
  const unresolved = [];

  const resolveCallee = (call, from) => {
    const raw = call.method
      ? `${memberPath(call.base?.base) ?? ''}.${call.base?.identifier?.name ?? ''}`
      : memberPath(call.base);
    if (!raw) return { name: null, target: null };
    // `self:foo()` inside a method of `M` is `M.foo`.
    let name = raw;
    if (name.startsWith('self.') && from.owner) name = `${from.owner}.${name.slice(5)}`;
    const target = byName.get(name) ?? null;
    return { name, target };
  };

  for (const from of nodes) {
    const fnNode = from === chunk ? parsed.ast : from.node;
    for (const call of directCalls(fnNode)) {
      const { name, target } = resolveCallee(call, from);
      if (target) edges.push({ from: from.id, to: target.id, line: call.line, name });
      else unresolved.push({ from: from.id, name: name ?? '<computed>', line: call.line });
    }
  }

  // Direct yields, then the transitive closure over the edges.
  const yieldsDirect = new Map();
  for (const from of nodes) {
    const fnNode = from === chunk ? parsed.ast : from.node;
    yieldsDirect.set(from.id, directCalls(fnNode).some((c) => callYields(c)));
  }
  const yields = new Map(yieldsDirect);
  for (let pass = 0; pass < nodes.length + 1; pass += 1) {
    let changed = false;
    for (const e of edges) {
      if (yields.get(e.to) && !yields.get(e.from)) {
        yields.set(e.from, true);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const enriched = nodes.map((n) => ({
    id: n.id,
    name: n.name,
    kind: n.kind,
    owner: n.owner,
    line: n.line,
    endLine: n.endLine,
    yieldsDirectly: !!yieldsDirect.get(n.id),
    yields: !!yields.get(n.id),
    callers: edges.filter((e) => e.to === n.id).map((e) => e.from),
    callees: edges.filter((e) => e.from === n.id).map((e) => e.to),
  }));

  return {
    ok: parsed.ok,
    errors: parsed.errors,
    nodes: enriched,
    edges,
    unresolved,
    /**
     * Names whose VALUE leaves the file's call sites — `signal:Connect(handler)`,
     * `M.Start = handler`, `return handler`. The function is then callable from somewhere the call
     * graph cannot see, so reachability can say nothing about it.
     */
    escaped: escapedNames(parsed.ast),
    /** Names whose bodies yield, for feeding `infiniteLoops`. */
    yieldingFunctions: new Set(enriched.filter((n) => n.yields && n.name !== '<chunk>').map((n) => n.name)),
    cycles: findCycles(enriched.map((n) => n.id), edges.map((e) => [e.from, e.to])),
  };
}

/**
 * Functions no reachable path from top-level code can call.
 *
 * `local` scope is the decidable case: a local function nobody in the file calls and that is never
 * returned or stored cannot be called at all. A GLOBAL or a table field can be called by another
 * script, so it is never reported — a dead-code claim we cannot justify is worse than none.
 */
export function unreachableFunctions(graph) {
  // ROOTS ARE NOT JUST THE CHUNK. A module returns a table of methods and another script calls
  // them, so every non-local definition is an entry point; starting only from top-level code
  // reported four correct helpers as dead in the first module this was run on, because their only
  // caller was `M:Start`, which nothing in the same file calls.
  const seen = new Set();
  const queue = [];
  for (const n of graph.nodes) {
    if (n.kind === 'local') continue;
    seen.add(n.id);
    queue.push(n.id);
  }
  while (queue.length) {
    const id = queue.pop();
    for (const e of graph.edges) {
      if (e.from === id && !seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return graph.nodes
    .filter((n) => n.kind === 'local' && !seen.has(n.id) && !graph.escaped.has(n.name))
    .map((n) => ({
      rule: 'unreachable-function',
      severity: 'warn',
      line: n.line,
      detail: `local function \`${n.name}\` is never called from anything top-level code can reach`,
      why: 'a local function nothing calls cannot be called from another script either — it is dead weight or a wiring mistake',
    }))
    .sort((a, b) => a.line - b.line);
}

/**
 * Identifiers used as a VALUE rather than as the thing being called.
 *
 * The exclusion set is the whole point and the first version of it was wrong in the fail-open
 * direction: `walk` visits a FunctionDeclaration's own `identifier`, so every declared function
 * counted as escaping its own declaration and `unreachableFunctions` could never report anything.
 * A filter that excludes everything reads exactly like a clean codebase.
 */
function escapedNames(ast) {
  const excluded = new Set();
  const excludeChain = (node) => {
    let cur = node;
    while (cur) {
      if (cur.type === 'MemberExpression') {
        excluded.add(cur.identifier);
        cur = cur.base;
        continue;
      }
      excluded.add(cur);
      return;
    }
  };
  for (const call of findNodes(ast, 'CallExpression')) {
    if (call.base?.type === 'Identifier') excluded.add(call.base);
  }
  for (const fn of findNodes(ast, 'FunctionDeclaration')) {
    if (fn.identifier) excludeChain(fn.identifier);
  }
  for (const m of findNodes(ast, 'MemberExpression')) excluded.add(m.identifier);
  for (const a of findNodes(ast, 'AssignmentStatement')) {
    for (const t of a.targets) if (t.type === 'Identifier') excluded.add(t);
  }

  const escaped = new Set();
  walk(ast, (node) => {
    if (node.type !== 'Identifier') return undefined;
    if (excluded.has(node)) return undefined;
    escaped.add(node.name);
    return undefined;
  });
  return escaped;
}

/** Simple-cycle detection over a directed graph, as arrays of node ids. */
export function findCycles(nodeIds, edgePairs) {
  const adj = new Map(nodeIds.map((n) => [n, []]));
  for (const [a, b] of edgePairs) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
  }
  const cycles = [];
  const seen = new Set();
  const stack = [];
  const onStack = new Set();

  const dfs = (node) => {
    stack.push(node);
    onStack.add(node);
    for (const next of adj.get(node) ?? []) {
      if (onStack.has(next)) {
        const at = stack.indexOf(next);
        const cycle = stack.slice(at);
        const key = normaliseCycle(cycle);
        if (!cycles.some((c) => normaliseCycle(c) === key)) cycles.push(cycle);
      } else if (!seen.has(next)) {
        seen.add(next);
        dfs(next);
      }
    }
    stack.pop();
    onStack.delete(node);
  };

  for (const n of adj.keys()) {
    if (seen.has(n)) continue;
    seen.add(n);
    dfs(n);
  }
  return cycles;
}

function normaliseCycle(cycle) {
  // rotate so the smallest element leads, making two spellings of one cycle compare equal
  let best = 0;
  for (let i = 1; i < cycle.length; i += 1) if (cycle[i] < cycle[best]) best = i;
  return [...cycle.slice(best), ...cycle.slice(0, best)].join('>');
}

// ------------------------------------------------------------------- dependency graph

/**
 * Build the require graph for a place.
 *
 * @param {Array<{path: string, source: string}>} files `path` is the instance path of the script,
 *   e.g. `ReplicatedStorage/Modules/Shop`. Paths are how `script.Parent.X` is resolved, so they
 *   must be the real tree, not filenames.
 */
export function buildDependencyGraph(files, opts = {}) {
  const nodes = [];
  const edges = [];
  const unresolved = [];
  const byPath = new Map();
  for (const f of files) byPath.set(f.path, f);

  for (const file of files) {
    const parsed = parseLuau(file.source, { path: file.path });
    const targets = requireTargets(parsed, { selfPath: file.path });
    const requires = [];
    for (const t of targets) {
      if (t.path && byPath.has(t.path)) {
        edges.push({ from: file.path, to: t.path, line: t.line });
        requires.push(t.path);
      } else {
        unresolved.push({ from: file.path, line: t.line, expression: t.expression, resolved: t.path ?? null });
      }
    }
    nodes.push({ path: file.path, requires, ok: parsed.ok, errors: parsed.errors });
  }

  const cycles = findCycles(files.map((f) => f.path), edges.map((e) => [e.from, e.to]));
  return {
    nodes,
    edges,
    unresolved,
    cycles,
    /** Scripts nothing requires — entry points, or orphans nobody wired up. */
    roots: files.map((f) => f.path).filter((p) => !edges.some((e) => e.to === p)),
    /** Scripts that require nothing. */
    leaves: files.map((f) => f.path).filter((p) => !edges.some((e) => e.from === p)),
  };
}

/** Require cycles as findings, one per cycle, reported on the first file in the loop. */
export function requireCycleFindings(graph) {
  return graph.cycles.map((cycle) => {
    const edge = graph.edges.find((e) => e.from === cycle[0] && e.to === cycle[1 % cycle.length]);
    return {
      rule: 'require-cycle',
      severity: 'error',
      path: cycle[0],
      line: edge?.line ?? 1,
      detail: `require cycle: ${[...cycle, cycle[0]].join(' -> ')}`,
      why: 'requiring a module that is still loading yields forever; both scripts stop with no error and no output',
    };
  });
}

/** Topological order of the require graph, or null when a cycle makes one impossible. */
export function requireOrder(graph) {
  if (graph.cycles.length) return null;
  const indegree = new Map(graph.nodes.map((n) => [n.path, 0]));
  for (const e of graph.edges) indegree.set(e.from, (indegree.get(e.from) ?? 0) + 1);
  const ready = [...indegree.entries()].filter(([, d]) => d === 0).map(([p]) => p).sort();
  const order = [];
  while (ready.length) {
    const p = ready.shift();
    order.push(p);
    for (const e of graph.edges.filter((x) => x.to === p)) {
      const left = (indegree.get(e.from) ?? 0) - 1;
      indegree.set(e.from, left);
      if (left === 0) ready.push(e.from);
    }
    ready.sort();
  }
  return order.length === graph.nodes.length ? order : null;
}

/** Text/symbol search across a place, returning file + line + the matching line's text. */
export function searchPlace(files, query, opts = {}) {
  const re = opts.regex ? new RegExp(query, opts.flags ?? 'g') : null;
  const needle = String(query);
  const out = [];
  for (const file of files) {
    const lines = String(file.source ?? '').split('\n');
    lines.forEach((text, i) => {
      const hit = re ? re.test(text) : text.includes(needle);
      if (re) re.lastIndex = 0;
      if (hit) out.push({ path: file.path, line: i + 1, text: text.trim().slice(0, 200) });
    });
  }
  return out;
}

/** Every declaration in a place, for a symbol search that knows what a symbol is. */
export function indexPlace(files) {
  const out = [];
  for (const file of files) {
    const parsed = parseLuau(file.source, { path: file.path });
    for (const d of definitionsOf(parsed.ast)) {
      out.push({ path: file.path, name: d.name, kind: d.kind, line: d.line, endLine: d.endLine });
    }
    for (const t of findNodes(parsed.ast, 'TypeAlias')) {
      out.push({ path: file.path, name: t.name, kind: t.exported ? 'exported type' : 'type', line: t.line, endLine: t.line });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}
