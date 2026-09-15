// Control-flow graphs for Luau, and the three diagnostics that only a CFG can produce:
// unreachable code, loops that cannot terminate, and functions that return a value on some paths
// and fall off the end on others.
//
// WHY A CFG IS NEEDED AT ALL, GIVEN LUA'S GRAMMAR.
//
// The obvious form of dead code — a statement after `return` — IS NOT REPRESENTABLE IN LUA. The
// grammar is `block ::= {stat} [laststat]`, and `return`, `break` and `continue` are the only
// laststats, so `return x; print(1)` is a syntax error, not dead code. A checker that looks for
// statements after a jump therefore finds nothing, forever, on every file — and reads as a clean
// bill of health. That is exactly the shape docs/FAILURES.md warns about: a check that measured
// nothing rendering as an observation.
//
// Dead code in Luau is reachable-from-entry, which needs edges:
//   - `if false then ... end` and `if true then ... else ... end` — a branch with no edge into it.
//   - anything after `while true do ... end` that contains no `break` — the loop has no exit edge,
//     so the statement after it has no predecessor. This is the one that matters in Roblox, because
//     it is how an init script silently stops half-way and the symptom is "the shop never loads".
//   - anything after an unconditional `error(...)`.
//
// Non-termination likewise: `while i < n do ... end` where nothing in the body writes `i` or `n` is
// an infinite loop, and no amount of pattern matching on the loop header can tell you that. It
// needs the symbol table to know which `i` that is and whether anything assigns it.

import { parseLuau, memberPath, findNodes } from './luau-ast.mjs';
import { buildSymbolTable } from './luau-symbols.mjs';

// ---------------------------------------------------------------------------- yields

// Calls that suspend the calling thread. Getting this set right is what separates "this loop pins
// the CPU until the Roblox watchdog kills the script" from "this loop is a perfectly normal
// forever-running service".
const YIELDING_METHODS = new Set([
  'Wait', 'WaitForChild', 'GetAsync', 'SetAsync', 'UpdateAsync', 'IncrementAsync', 'RemoveAsync',
  'GetSortedAsync', 'ListKeysAsync', 'GetVersionAsync', 'InvokeServer', 'InvokeClient',
  'RequestAsync', 'GetAsyncFullUrl', 'PostAsync', 'AwaitValue', 'LoadCharacter', 'Await',
  'GetProductInfo', 'GetUserInfosByUserIdsAsync', 'GetPlayerThumbnailAsync', 'PromptPurchaseAsync',
  'PublishAsync', 'SaveAsync', 'LoadAsync', 'ReserveServerAsync', 'TeleportAsync',
]);

const YIELDING_FUNCTIONS = new Set([
  'wait', 'task.wait', 'task.synchronize', 'task.desynchronize', 'coroutine.yield',
]);

/** Does this CallExpression suspend the calling thread? */
export function callYields(node) {
  if (node?.type !== 'CallExpression') return false;
  if (node.method) {
    const name = node.base?.identifier?.name;
    return !!name && YIELDING_METHODS.has(name);
  }
  const path = memberPath(node.base);
  return !!path && YIELDING_FUNCTIONS.has(path);
}

/** Does this call never return? `error(...)` and `assert(false)` end the thread's path. */
export function callNeverReturns(node) {
  if (node?.type !== 'CallExpression' || node.method) return false;
  const path = memberPath(node.base);
  if (path === 'error') return true;
  if (path === 'assert') {
    const first = node.arguments[0];
    return first?.type === 'BooleanLiteral' && first.value === false;
  }
  return false;
}

// ---------------------------------------------------------------------------- constants

/**
 * Lua truthiness, which is NOT JavaScript's: `0` and `""` are TRUE in Lua. Only `nil` and `false`
 * are falsy. Reading this wrong would make `while 0 do` look like dead code and hide a real
 * infinite loop, so the two literal cases are spelled out rather than coerced.
 */
export function constantTruth(node) {
  if (!node) return null;
  switch (node.type) {
    case 'BooleanLiteral': return node.value;
    case 'NilLiteral': return false;
    case 'NumericLiteral': return true;
    case 'StringLiteral': return true;
    case 'TableConstructorExpression': return true;
    case 'FunctionExpression': return true;
    case 'ParenthesisExpression': return constantTruth(node.expression);
    default: return null;
  }
}

// ---------------------------------------------------------------------------- CFG

class Cfg {
  constructor(name, line) {
    this.name = name;
    this.line = line;
    this.blocks = [];
    this.entry = this.newBlock('entry');
    this.exit = this.newBlock('exit');
  }

  newBlock(kind = 'block') {
    const b = { id: this.blocks.length, kind, statements: [], successors: [], predecessors: [] };
    this.blocks.push(b);
    return b;
  }

  link(from, to) {
    if (!from || !to) return;
    if (from.successors.includes(to.id)) return;
    from.successors.push(to.id);
    to.predecessors.push(from.id);
  }

  block(id) {
    return this.blocks[id];
  }

  /** Block ids reachable from entry. */
  reachable() {
    const seen = new Set([this.entry.id]);
    const queue = [this.entry.id];
    while (queue.length) {
      const b = this.blocks[queue.pop()];
      for (const s of b.successors) {
        if (!seen.has(s)) {
          seen.add(s);
          queue.push(s);
        }
      }
    }
    return seen;
  }
}

/**
 * Build a control-flow graph for one function body (or a chunk).
 * Nested function bodies are NOT inlined — each is its own CFG, because a closure's statements do
 * not run where they are written.
 */
export function buildCfg(body, { name = '<chunk>', line = 1 } = {}) {
  const cfg = new Cfg(name, line);
  const loops = [];

  const emitBlock = (stmts, start) => {
    let cur = start;
    for (const stmt of stmts) {
      if (!cur) {
        // control cannot reach here; put it in a fresh orphan block so it is still recorded,
        // which is what makes it REPORTABLE rather than invisible
        cur = cfg.newBlock('orphan');
      }
      cur = emitStatement(stmt, cur);
    }
    return cur;
  };

  const emitStatement = (stmt, cur) => {
    switch (stmt.type) {
      case 'ReturnStatement': {
        cur.statements.push(stmt);
        cur.terminator = 'return';
        cfg.link(cur, cfg.exit);
        return null;
      }
      case 'BreakStatement': {
        cur.statements.push(stmt);
        cur.terminator = 'break';
        const ctx = loops[loops.length - 1];
        if (ctx) cfg.link(cur, ctx.breakTarget);
        return null;
      }
      case 'ContinueStatement': {
        cur.statements.push(stmt);
        cur.terminator = 'continue';
        const ctx = loops[loops.length - 1];
        if (ctx) cfg.link(cur, ctx.continueTarget);
        return null;
      }
      case 'IfStatement': {
        const join = cfg.newBlock('join');
        let fall = cur;
        let sawAlwaysTrue = false;
        for (const clause of stmt.clauses) {
          if (!fall) break;
          fall.statements.push({ type: 'Condition', node: clause.condition, line: clause.condition.line });
          const truth = constantTruth(clause.condition);
          const thenBlock = cfg.newBlock('then');
          if (truth !== false) cfg.link(fall, thenBlock);
          const after = emitBlock(clause.body, thenBlock);
          if (after) cfg.link(after, join);
          if (truth === true) {
            sawAlwaysTrue = true;
            fall = null;
            break;
          }
          const nextFall = cfg.newBlock('else');
          cfg.link(fall, nextFall);
          fall = nextFall;
        }
        if (stmt.orelse) {
          if (fall) {
            const after = emitBlock(stmt.orelse, fall);
            if (after) cfg.link(after, join);
          } else {
            // an `else` under an always-true `if` is dead, but it must still be walked so its
            // statements exist in an unreachable block and get reported
            const dead = cfg.newBlock('orphan');
            const after = emitBlock(stmt.orelse, dead);
            if (after) cfg.link(after, join);
          }
        } else if (fall) {
          cfg.link(fall, join);
        }
        void sawAlwaysTrue;
        return join.predecessors.length ? join : null;
      }
      case 'WhileStatement': {
        const head = cfg.newBlock('loop-head');
        cfg.link(cur, head);
        head.statements.push({ type: 'Condition', node: stmt.condition, line: stmt.condition.line });
        const truth = constantTruth(stmt.condition);
        const after = cfg.newBlock('loop-exit');
        const bodyBlock = cfg.newBlock('loop-body');
        if (truth !== false) cfg.link(head, bodyBlock);
        if (truth !== true) cfg.link(head, after);
        loops.push({ breakTarget: after, continueTarget: head, node: stmt });
        const end = emitBlock(stmt.body, bodyBlock);
        loops.pop();
        if (end) cfg.link(end, head);
        return after.predecessors.length ? after : null;
      }
      case 'RepeatStatement': {
        const bodyBlock = cfg.newBlock('loop-body');
        cfg.link(cur, bodyBlock);
        const after = cfg.newBlock('loop-exit');
        const cond = cfg.newBlock('loop-head');
        loops.push({ breakTarget: after, continueTarget: cond, node: stmt });
        const end = emitBlock(stmt.body, bodyBlock);
        loops.pop();
        if (end) cfg.link(end, cond);
        cond.statements.push({ type: 'Condition', node: stmt.condition, line: stmt.condition.line });
        const truth = constantTruth(stmt.condition);
        if (truth !== true) cfg.link(cond, bodyBlock);
        if (truth !== false) cfg.link(cond, after);
        return after.predecessors.length ? after : null;
      }
      case 'NumericForStatement':
      case 'GenericForStatement': {
        const head = cfg.newBlock('loop-head');
        cfg.link(cur, head);
        head.statements.push({ type: 'LoopHeader', node: stmt, line: stmt.line });
        const bodyBlock = cfg.newBlock('loop-body');
        const after = cfg.newBlock('loop-exit');
        cfg.link(head, bodyBlock);
        // A `for` may iterate zero times, so the exit edge always exists.
        cfg.link(head, after);
        loops.push({ breakTarget: after, continueTarget: head, node: stmt });
        const end = emitBlock(stmt.body, bodyBlock);
        loops.pop();
        if (end) cfg.link(end, head);
        return after;
      }
      case 'DoStatement': {
        return emitBlock(stmt.body, cur);
      }
      default: {
        cur.statements.push(stmt);
        if (stmt.type === 'CallStatement' && callNeverReturns(stmt.expression)) {
          cur.terminator = 'noreturn';
          cfg.link(cur, cfg.exit);
          return null;
        }
        return cur;
      }
    }
  };

  const end = emitBlock(body, cfg.entry);
  if (end) {
    cfg.link(end, cfg.exit);
    cfg.fallsThrough = true;
  } else {
    cfg.fallsThrough = false;
  }
  return cfg;
}

/** Every function in a file, plus the chunk itself, each with its own body. */
export function functionsOf(ast) {
  const out = [{ name: '<chunk>', line: 1, body: ast?.body ?? [], node: ast, kind: 'chunk' }];
  for (const fn of findNodes(ast, ['FunctionDeclaration', 'FunctionExpression'])) {
    out.push({
      name: fn.name ?? '<anonymous>',
      line: fn.line,
      body: fn.body,
      node: fn,
      kind: fn.type === 'FunctionDeclaration' ? (fn.isLocal ? 'local' : 'global') : 'anonymous',
    });
  }
  return out;
}

/**
 * Control-flow analysis over a whole file: one CFG per function, plus the two facts a caller
 * actually wants — which statements cannot be reached, and whether every path that should return a
 * value does.
 */
export function controlFlow(input, opts = {}) {
  const parsed = typeof input === 'string' ? parseLuau(input, opts) : input;
  const functions = functionsOf(parsed.ast).map((fn) => {
    const cfg = buildCfg(fn.body, { name: fn.name, line: fn.line });
    const reachable = cfg.reachable();
    const unreachable = [];
    for (const b of cfg.blocks) {
      if (reachable.has(b.id)) continue;
      for (const s of b.statements) {
        if (s.type === 'Condition' || s.type === 'LoopHeader') continue;
        unreachable.push(s);
      }
    }
    const returns = [];
    for (const b of cfg.blocks) {
      for (const s of b.statements) {
        if (s.type === 'ReturnStatement' && reachable.has(b.id)) returns.push(s);
      }
    }
    const valueReturns = returns.filter((r) => r.arguments.length > 0);
    return {
      name: fn.name,
      kind: fn.kind,
      line: fn.line,
      blockCount: cfg.blocks.length,
      reachableBlocks: reachable.size,
      unreachable: unreachable.sort((a, b) => a.line - b.line),
      returns,
      // A function with at least one `return value` whose end is still reachable can fall off the
      // end and hand back nil — the caller's `local x = f()` then indexes nil somewhere far away.
      inconsistentReturn: valueReturns.length > 0 && cfg.fallsThrough && fn.kind !== 'chunk',
      fallsThrough: cfg.fallsThrough,
      cfg,
    };
  });
  return { ok: parsed.ok, errors: parsed.errors, ast: parsed.ast, functions };
}

/** Statements control can never reach, as findings. */
export function deadCode(input, opts = {}) {
  const analysis = controlFlow(input, opts);
  const out = [];
  for (const fn of analysis.functions) {
    for (const s of fn.unreachable) {
      out.push({
        rule: 'unreachable-code',
        severity: 'warn',
        line: s.line,
        detail: `control never reaches this statement in ${fn.name}`,
        why: 'unreachable code is either a bug in the branch above it or a feature that silently never runs',
      });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/** Functions that return a value on one path and nothing on another. */
export function inconsistentReturns(input, opts = {}) {
  const analysis = controlFlow(input, opts);
  return analysis.functions
    .filter((f) => f.inconsistentReturn)
    .map((f) => ({
      rule: 'inconsistent-return',
      severity: 'warn',
      line: f.line,
      detail: `${f.name} returns a value on ${f.returns.filter((r) => r.arguments.length).length} path(s) and falls off the end on another`,
      why: 'a function that sometimes returns nil hands the caller a nil it has no reason to check for',
    }))
    .sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------------------- infinite loops

function bodyYields(stmts, yieldsByName) {
  let found = false;
  const visit = (node) => {
    if (!node || typeof node !== 'object' || found) return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') return; // a closure's yield is not this loop's
    if (node.type === 'CallExpression') {
      if (callYields(node)) {
        found = true;
        return;
      }
      const path = memberPath(node.base);
      if (path && yieldsByName?.has(path)) {
        found = true;
        return;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'cfg' || key === 'parent') continue;
      const v = node[key];
      if (v && typeof v === 'object') visit(v);
    }
  };
  visit(stmts);
  return found;
}

function identifiersIn(node) {
  const names = [];
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      for (const x of n) visit(x);
      return;
    }
    if (n.type === 'Identifier') {
      names.push(n);
      return;
    }
    if (n.type === 'MemberExpression') {
      names.push({ ...n, unresolvable: true });
      return;
    }
    if (n.type === 'IndexExpression' || n.type === 'CallExpression') {
      names.push({ ...n, unresolvable: true });
      return;
    }
    for (const key of Object.keys(n)) {
      const v = n[key];
      if (v && typeof v === 'object') visit(v);
    }
  };
  visit(node);
  return names;
}

/**
 * Loops that cannot terminate.
 *
 * Two shapes, and they are different bugs:
 *
 *   `no-yield-infinite-loop` — the loop has no exit edge AND never yields. Roblox's watchdog kills
 *   the script with "exhausted allowed execution time". Works in Studio, dies live.
 *
 *   `never-updated-loop-condition` — `while i < n do ... end` where nothing in the body assigns `i`
 *   or `n`. This is the forgotten `i += 1`. It is reported ONLY when every variable in the
 *   condition resolves to a local, none of them is written in the body, none of them is handed to a
 *   call (which could mutate a table through the reference), and the condition contains no field
 *   access or `#` — because any of those means something outside the loop's text can change the
 *   answer, and a finding we cannot justify is a style opinion, not a bug report.
 */
export function infiniteLoops(input, opts = {}) {
  const parsed = typeof input === 'string' ? parseLuau(input, opts) : input;
  const table = opts.symbols ?? buildSymbolTable(parsed, opts);
  const yieldsByName = opts.yieldingFunctions ?? new Set();
  const out = [];

  const loopNodes = findNodes(parsed.ast, ['WhileStatement', 'RepeatStatement']);
  for (const loop of loopNodes) {
    const isWhile = loop.type === 'WhileStatement';
    const truth = constantTruth(loop.condition);
    const forever = isWhile ? truth === true : truth === false;
    const yields = bodyYields(loop.body, yieldsByName);
    const escapes = hasEscape(loop.body);

    if (forever && !escapes && !yields) {
      out.push({
        rule: 'no-yield-infinite-loop',
        severity: 'error',
        line: loop.line,
        detail: `${isWhile ? 'while' : 'repeat'} loop never yields and has no break or return`,
        why: 'a loop with no yield pins the thread until the Roblox watchdog kills the script',
      });
      continue;
    }
    if (forever) continue; // a yielding forever-loop is the normal shape of a service

    if (!isWhile) continue;
    if (escapes) continue;
    // If the body yields, ANOTHER THREAD can run between iterations and change the condition.
    // `while not ready do task.wait() end` is the idiomatic wait-for-flag, not a hang.
    if (yields) continue;
    const names = identifiersIn(loop.condition);
    if (!names.length) continue;
    if (names.some((n) => n.unresolvable)) continue;
    const syms = names.map((n) => symbolFor(table, n));
    if (syms.some((s) => !s)) continue;
    if (syms.some((s) => s.kind === 'global')) continue;
    // Every condition variable must be a VALUE, not a reference. A table in the condition
    // (`while #queue > 0`) can be emptied from inside a call the body makes, and we would be
    // reporting correct code; a number cannot.
    if (syms.some((s) => !s.scalarInit || (s.nonScalarWrites ?? 0) > 0)) continue;
    const written = new Set();
    for (const ref of table.references) {
      if (ref.kind !== 'write') continue;
      if (ref.start >= loop.start && ref.end <= loop.end) written.add(ref.symbolId);
    }
    if (syms.some((s) => written.has(s.id))) continue;

    out.push({
      rule: 'never-updated-loop-condition',
      severity: 'error',
      line: loop.line,
      detail: `loop condition reads ${syms.map((s) => `\`${s.name}\``).join(', ')} and the body never assigns ${syms.length > 1 ? 'any of them' : 'it'}`,
      why: 'the condition can never change, so the loop runs until the watchdog kills the script',
    });
  }
  return out.sort((a, b) => a.line - b.line);
}

function symbolFor(table, idNode) {
  const ref = table.references.find((r) => r.start === idNode.start && r.name === idNode.name);
  if (!ref) return null;
  if (ref.symbolId === null) return { kind: 'global', name: idNode.name, id: -1 };
  return table.symbols[ref.symbolId];
}

const LOOP_TYPES = new Set(['WhileStatement', 'RepeatStatement', 'NumericForStatement', 'GenericForStatement']);

/**
 * Does this statement list contain a jump that leaves THIS loop?
 *
 * `break` is loop-scoped and a `break` in a NESTED loop leaves that one, so it does not count here.
 * `return` and `error()` are not loop-scoped: they leave every enclosing loop at once, so they
 * count at any depth. Conflating the two is the difference between silently exempting every loop
 * that happens to contain an inner loop with a break, and reporting the real hang.
 */
function hasEscape(stmts) {
  let found = false;
  const visit = (node, loopDepth) => {
    if (!node || typeof node !== 'object' || found) return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, loopDepth);
      return;
    }
    if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') return;
    if (node.type === 'ReturnStatement') {
      found = true;
      return;
    }
    if (node.type === 'BreakStatement') {
      if (loopDepth === 0) found = true;
      return;
    }
    if (node.type === 'CallStatement' && callNeverReturns(node.expression)) {
      found = true;
      return;
    }
    const nextDepth = LOOP_TYPES.has(node.type) ? loopDepth + 1 : loopDepth;
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (v && typeof v === 'object') visit(v, nextDepth);
    }
  };
  visit(stmts, 0);
  return found;
}
