// Scopes, symbols and cross-references for one Luau file.
//
// This is the question a regex cannot ask. "Is this local ever read" needs to know which `x` the
// `x` on line 40 is — the parameter, the upvalue, the one shadowed two lines earlier, or a global
// somebody forgot to declare. A scanner counting occurrences of `\bx\b` answers all four the same
// way, which means it answers none of them.
//
// Three Lua scoping rules the implementation is built around, each of which silently corrupts a
// naive index if you miss it:
//
//   1. `local x = x` — the initialiser is evaluated BEFORE the new `x` exists, so its `x` is the
//      OUTER one. Declaring first makes a variable look like it reads itself.
//   2. `local function f() ... f() ... end` — the name IS in scope inside its own body, which is
//      how recursion works. `local f = function() f() end` is NOT: there the inner `f` is a global.
//      The two shapes differ by exactly that, and an index that treats them alike reports the
//      recursive helper as an unknown global.
//   3. `repeat local ok = f() until ok` — the `until` condition can see the body's locals. The
//      scope closes after the condition, not at the `until`.
//
// Reads and writes are counted separately on purpose. `local total; total = 1` is a local that is
// assigned and never read — dead, and invisible to any check that only asks "does the name appear
// more than once".

import { parseLuau } from './luau-ast.mjs';

/**
 * Globals a Roblox script may legitimately read without declaring.
 *
 * Roblox gives every script its own global environment, so a global that is never assigned ANYWHERE
 * in the file is nil at runtime — which is why `unknownGlobals` is a real finding here and would be
 * meaningless in, say, Node. That makes the completeness of this list load-bearing in the expensive
 * direction: a missing entry produces a false positive on correct code.
 */
export const ROBLOX_GLOBALS = new Set([
  // Lua/Luau standard library and base functions
  'assert', 'collectgarbage', 'error', 'gcinfo', 'getfenv', 'getmetatable', 'ipairs', 'loadstring',
  'newproxy', 'next', 'pairs', 'pcall', 'print', 'rawequal', 'rawget', 'rawlen', 'rawset', 'require',
  'select', 'setfenv', 'setmetatable', 'tonumber', 'tostring', 'type', 'typeof', 'unpack', 'xpcall',
  'warn', 'tick', 'time', 'elapsedTime', 'wait', 'delay', 'spawn', 'version', 'stats',
  'coroutine', 'debug', 'math', 'os', 'string', 'table', 'task', 'utf8', 'bit32', 'buffer', 'vector',
  '_G', '_VERSION', 'shared', 'DebuggerManager', 'PluginManager', 'settings', 'UserSettings',
  // Roblox datamodel entry points
  'game', 'workspace', 'Workspace', 'script', 'plugin', 'Enum', 'Instance', 'Game',
  // Roblox data types constructible from a script
  'Axes', 'BrickColor', 'CatalogSearchParams', 'CFrame', 'Color3', 'ColorSequence',
  'ColorSequenceKeypoint', 'Content', 'DateTime', 'DockWidgetPluginGuiInfo', 'Faces', 'FloatCurveKey',
  'Font', 'NumberRange', 'NumberSequence', 'NumberSequenceKeypoint', 'OverlapParams', 'PathWaypoint',
  'PhysicalProperties', 'Random', 'Ray', 'RaycastParams', 'Rect', 'Region3', 'Region3int16',
  'RotationCurveKey', 'SharedTable', 'TweenInfo', 'UDim', 'UDim2', 'Vector2', 'Vector2int16',
  'Vector3', 'Vector3int16', 'Secret',
]);

/**
 * Is this expression certainly a number, string or boolean — a VALUE, not a reference?
 *
 * The distinction is load-bearing for termination analysis. Handing a number to a function cannot
 * change it (`while i < n do print(i) end` is still a hang), but handing a table to one can change
 * it from the inside (`while #queue > 0 do drain(queue) end` is fine). Without this split, a
 * termination check either reports every loop that prints its counter, or reports none at all.
 *
 * `and`/`or` are deliberately excluded: `local x = a or {}` is a table on one branch.
 */
export function isScalarExpression(node) {
  if (!node) return false;
  switch (node.type) {
    case 'NumericLiteral':
    case 'StringLiteral':
    case 'BooleanLiteral':
      return true;
    case 'ParenthesisExpression':
      return isScalarExpression(node.expression);
    case 'UnaryExpression':
      return node.operator === '-' || node.operator === '#' || node.operator === 'not';
    case 'BinaryExpression':
      return ['+', '-', '*', '/', '//', '%', '^', '..', '==', '~=', '<', '<=', '>', '>='].includes(node.operator);
    default:
      return false;
  }
}

let nextId = 0;

class Scope {
  constructor(kind, parent, node) {
    this.id = nextId++;
    this.kind = kind;
    this.parent = parent;
    this.parentId = parent ? parent.id : null;
    this.line = node?.line ?? 1;
    this.start = node?.start ?? 0;
    this.end = node?.end ?? 0;
    this.names = new Map(); // name -> symbol (the LAST declaration wins, as in Lua)
    this.symbols = [];
  }

  declare(symbol) {
    const shadowed = this.parent ? this.parent.resolve(symbol.name) : null;
    const redeclared = this.names.get(symbol.name) ?? null;
    symbol.shadows = redeclared ? redeclared.id : (shadowed ? shadowed.id : null);
    this.names.set(symbol.name, symbol);
    this.symbols.push(symbol.id);
    return symbol;
  }

  resolve(name) {
    for (let s = this; s; s = s.parent) {
      const found = s.names.get(name);
      if (found) return found;
    }
    return null;
  }
}

/**
 * Build the symbol table for one file.
 *
 * @param {string|object} input source text, or the result of `parseLuau`
 * @returns {{
 *   ok: boolean, errors: object[], scopes: object[], symbols: object[],
 *   references: object[], globals: object[], unknownGlobals: object[], implicitGlobals: object[],
 * }}
 */
export function buildSymbolTable(input, opts = {}) {
  const parsed = typeof input === 'string' ? parseLuau(input, opts) : input;
  // `extraGlobals` exists for environments that really do inject names — a TestEZ/jest-lua spec is
  // handed `describe`, `it` and `expect` by its runner. Callers opt in per file; widening
  // ROBLOX_GLOBALS instead would hide a genuine typo in every production script.
  const extraGlobals = opts.extraGlobals instanceof Set ? opts.extraGlobals : new Set(opts.extraGlobals ?? []);
  const ast = parsed.ast;
  const symbols = [];
  const references = [];
  const scopes = [];
  const globals = new Map();

  nextId = 0;
  const root = new Scope('chunk', null, ast ?? { line: 1, start: 0, end: 0 });
  scopes.push(root);
  let scope = root;

  const pushScope = (kind, node) => {
    scope = new Scope(kind, scope, node);
    scopes.push(scope);
    return scope;
  };
  const popScope = () => {
    scope = scope.parent;
  };

  const declare = (name, kind, at, extra = {}) => {
    const sym = {
      id: symbols.length,
      name,
      kind,
      scopeId: scope.id,
      line: at.line,
      column: at.column,
      start: at.start,
      end: at.end,
      reads: 0,
      writes: 0,
      references: [],
      shadows: null,
      ...extra,
    };
    symbols.push(sym);
    scope.declare(sym);
    return sym;
  };

  const globalFor = (name, at) => {
    let g = globals.get(name);
    if (!g) {
      g = { name, kind: 'global', reads: 0, writes: 0, references: [], known: ROBLOX_GLOBALS.has(name) || extraGlobals.has(name), line: at.line, column: at.column };
      globals.set(name, g);
    }
    return g;
  };

  const record = (name, at, kind) => {
    const sym = scope.resolve(name);
    const target = sym ?? globalFor(name, at);
    const ref = {
      name,
      kind,
      line: at.line,
      column: at.column,
      start: at.start,
      end: at.end,
      symbolId: sym ? sym.id : null,
      scopeId: scope.id,
    };
    if (kind === 'read') target.reads += 1;
    else if (kind === 'write') target.writes += 1;
    target.references.push(ref);
    references.push(ref);
    return ref;
  };

  // ---- expression walking

  const expr = (node) => {
    if (!node) return;
    switch (node.type) {
      case 'Identifier':
        record(node.name, node, 'read');
        return;
      case 'MemberExpression':
        expr(node.base);
        return; // `.identifier` names a FIELD, never a variable
      case 'IndexExpression':
        expr(node.base);
        expr(node.index);
        return;
      case 'CallExpression':
        expr(node.base);
        for (const a of node.arguments) expr(a);
        return;
      case 'BinaryExpression':
        expr(node.left);
        expr(node.right);
        return;
      case 'UnaryExpression':
        expr(node.argument);
        return;
      case 'ParenthesisExpression':
        expr(node.expression);
        return;
      case 'TypeAssertion':
        expr(node.expression);
        typeExpr(node.typeAnnotation);
        return;
      case 'TableConstructorExpression':
        for (const f of node.fields) {
          if (f.type === 'TableKey') expr(f.key);
          expr(f.value);
        }
        return;
      case 'FunctionExpression':
        functionScope(node);
        return;
      case 'IfExpression':
        expr(node.condition);
        expr(node.consequent);
        for (const e of node.elseifs ?? []) {
          expr(e.condition);
          expr(e.value);
        }
        expr(node.alternate);
        return;
      case 'StringLiteral':
        for (const sub of node.expressions ?? []) expr(sub);
        return;
      default:
        return;
    }
  };

  /**
   * A name used in a TYPE is a use.
   *
   * `local common = require(...)` followed only by `export type X = common.Y` is a module whose
   * binding is read exactly once, at type level. Skipping types made every such module read as an
   * unused local — 21 % of the corpus files sampled carried at least one — which is the rate at
   * which a warning stops being read at all.
   *
   * An unresolved type name is DROPPED rather than recorded as a global: `number`, `Player` and
   * `Instance` are types, not variables, and filing them under globals would invent findings.
   */
  const typeExpr = (node) => {
    if (!node || typeof node !== 'object') return;
    switch (node.type) {
      case 'TypeReference': {
        const root = node.name.split('.')[0];
        const sym = scope.resolve(root);
        if (sym) {
          sym.reads += 1;
          const ref = { name: root, kind: 'read', line: node.line, column: node.column, start: node.start, end: node.end, symbolId: sym.id, scopeId: scope.id, inType: true };
          sym.references.push(ref);
          references.push(ref);
        }
        for (const a of node.typeArgs ?? []) typeExpr(a);
        return;
      }
      case 'TypeUnion':
      case 'TypeIntersection':
        typeExpr(node.left);
        typeExpr(node.right);
        return;
      case 'TypeOptional':
        typeExpr(node.inner);
        return;
      case 'TypePack':
        typeExpr(node.element);
        return;
      case 'TypeParen':
        for (const t of node.items ?? []) typeExpr(t);
        return;
      case 'TypeFunction':
        for (const t of node.params ?? []) typeExpr(t);
        typeExpr(node.returns);
        return;
      case 'TypeTable':
        typeExpr(node.arrayOf);
        for (const f of node.fields ?? []) {
          typeExpr(f.key);
          typeExpr(f.value);
        }
        return;
      case 'TypeTypeof':
        expr(node.expression);
        return;
      default:
        return;
    }
  };

  const functionScope = (fn) => {
    pushScope('function', fn);
    for (const p of fn.params) {
      if (p.vararg) {
        typeExpr(p.typeAnnotation);
        continue;
      }
      typeExpr(p.typeAnnotation);
      declare(p.name, p.implicit ? 'self' : 'parameter', p, { implicit: !!p.implicit });
    }
    typeExpr(fn.returnType);
    block(fn.body);
    popScope();
  };

  /** The target of an assignment: `x = 1` writes x; `x.y = 1` READS x and writes a field. */
  const assignTarget = (node) => {
    if (node.type === 'Identifier') {
      record(node.name, node, 'write');
      return;
    }
    expr(node);
  };

  const statement = (node) => {
    switch (node.type) {
      case 'LocalStatement': {
        for (const v of node.init) expr(v); // rule 1: initialisers see the OUTER binding
        for (const n of node.names) typeExpr(n.typeAnnotation);
        node.names.forEach((n, i) => {
          declare(n.name, 'local', n, {
            typed: !!n.typeAnnotation,
            initType: node.init[i]?.type ?? null,
            scalarInit: isScalarExpression(node.init[i]),
            nonScalarWrites: 0,
          });
        });
        return;
      }
      case 'FunctionDeclaration': {
        if (node.isLocal) {
          // rule 2: the name exists before the body, so the body can call itself
          declare(node.name, 'function', node.identifier ?? node, { isFunction: true });
          functionScope(node);
          return;
        }
        if (node.identifier?.type === 'Identifier') {
          const existing = scope.resolve(node.identifier.name);
          if (existing) record(node.identifier.name, node.identifier, 'write');
          else {
            const g = globalFor(node.identifier.name, node.identifier);
            g.writes += 1;
            g.isFunction = true;
            g.references.push({ name: node.identifier.name, kind: 'write', line: node.identifier.line, column: node.identifier.column, start: node.identifier.start, end: node.identifier.end, symbolId: null, scopeId: scope.id });
          }
        } else if (node.identifier) {
          expr(node.identifier.base);
        }
        functionScope(node);
        return;
      }
      case 'AssignmentStatement': {
        for (const v of node.values) expr(v);
        node.targets.forEach((t, i) => {
          // A compound assignment READS the target as well as writing it: `n += 1`.
          if (node.operator !== '=' && t.type === 'Identifier') record(t.name, t, 'read');
          if (t.type === 'Identifier') {
            const sym = scope.resolve(t.name);
            // `a, b = f()` gives the second target no value node: unknown, so not provably scalar.
            const value = node.operator === '=' ? node.values[i] : { type: 'BinaryExpression', operator: node.operator.slice(0, -1) };
            if (sym && !isScalarExpression(value)) sym.nonScalarWrites = (sym.nonScalarWrites ?? 0) + 1;
          }
          assignTarget(t);
        });
        return;
      }
      case 'CallStatement':
        expr(node.expression);
        return;
      case 'ReturnStatement':
        for (const a of node.arguments) expr(a);
        return;
      case 'IfStatement': {
        for (const c of node.clauses) {
          expr(c.condition);
          pushScope('block', node);
          block(c.body);
          popScope();
        }
        if (node.orelse) {
          pushScope('block', node);
          block(node.orelse);
          popScope();
        }
        return;
      }
      case 'WhileStatement':
        expr(node.condition);
        pushScope('loop', node);
        block(node.body);
        popScope();
        return;
      case 'RepeatStatement':
        pushScope('repeat', node);
        block(node.body);
        expr(node.condition); // rule 3: the condition still sees the body's locals
        popScope();
        return;
      case 'DoStatement':
        pushScope('block', node);
        block(node.body);
        popScope();
        return;
      case 'NumericForStatement':
        expr(node.start);
        expr(node.limit);
        expr(node.step);
        pushScope('loop', node);
        typeExpr(node.variable.typeAnnotation);
        declare(node.variable.name, 'loop', node.variable);
        block(node.body);
        popScope();
        return;
      case 'GenericForStatement':
        for (const it of node.iterators) expr(it);
        pushScope('loop', node);
        for (const v of node.variables) {
          typeExpr(v.typeAnnotation);
          declare(v.name, 'loop', v);
        }
        block(node.body);
        popScope();
        return;
      case 'TypeAlias':
        declare(node.name, 'type', node, { exported: !!node.exported });
        typeExpr(node.definition);
        return;
      default:
        return;
    }
  };

  const block = (stmts) => {
    for (const s of stmts ?? []) statement(s);
  };

  if (ast) block(ast.body);

  const globalList = [...globals.values()];
  return {
    ok: parsed.ok,
    errors: parsed.errors,
    ast,
    scopes: scopes.map((s) => ({ id: s.id, kind: s.kind, parentId: s.parentId, line: s.line, start: s.start, end: s.end, symbols: s.symbols })),
    symbols,
    references,
    globals: globalList,
    // A global that is only ever READ and is not a known Roblox global is nil at runtime: Roblox
    // gives each script its own environment, so nothing else can have defined it.
    unknownGlobals: globalList.filter((g) => !g.known && g.writes === 0),
    // A global that is WRITTEN without `local` leaks across the script's whole environment and is
    // the usual cause of "two systems fight over one variable".
    implicitGlobals: globalList.filter((g) => !g.known && g.writes > 0),
  };
}

/** Every symbol whose name matches, newest scope first. Powers symbol search over a place. */
export function searchSymbols(table, query, opts = {}) {
  const needle = String(query ?? '').toLowerCase();
  const kinds = opts.kinds ? new Set(opts.kinds) : null;
  return table.symbols
    .filter((s) => (!kinds || kinds.has(s.kind)) && s.name.toLowerCase().includes(needle))
    .sort((a, b) => a.line - b.line || a.column - b.column);
}

/** The symbol declared at, or referenced at, a 1-based line/column. */
export function symbolAt(table, line, column) {
  const ref = table.references.find(
    (r) => r.line === line && column >= r.column && column < r.column + r.name.length,
  );
  if (ref && ref.symbolId !== null) return table.symbols[ref.symbolId];
  const decl = table.symbols.find(
    (s) => s.line === line && column >= s.column && column < s.column + s.name.length,
  );
  return decl ?? null;
}

/** Declaration site plus every reference, for go-to-definition and find-all-references. */
export function crossReference(table, line, column) {
  const sym = symbolAt(table, line, column);
  if (!sym) return null;
  return {
    symbol: sym,
    definition: { line: sym.line, column: sym.column, kind: sym.kind },
    references: sym.references.map((r) => ({ line: r.line, column: r.column, kind: r.kind })),
    reads: sym.reads,
    writes: sym.writes,
  };
}

const IGNORED_PREFIX = /^_/;

/**
 * Locals that are declared and never read.
 *
 * Split into two findings, because they are different bugs:
 *   - `unused-local`: never touched again. Usually a leftover or a typo'd second name.
 *   - `write-only-local`: assigned after declaration but never read. This is the one that hides a
 *     real defect — the value was computed and thrown away, so whatever depended on it is reading
 *     something else.
 *
 * `_`-prefixed names are exempt: that is the language-wide convention for a binding you are
 * required to name and do not intend to use (`for _, v in pairs(t)`).
 */
export function unusedLocals(table, opts = {}) {
  const includeParams = opts.includeParams ?? false;
  // Loop variables are off by default for the same reason as parameters: `for i = 1, 2 do` with an
  // unused `i` is "do this twice", and reporting it buries the findings that are defects. Measured
  // over the corpus, loop counters were a third of the raw signal and none of them was a bug.
  const includeLoopVariables = opts.includeLoopVariables ?? false;
  const out = [];
  for (const sym of table.symbols) {
    if (sym.kind === 'type' || sym.kind === 'self') continue;
    if (sym.kind === 'parameter' && !includeParams) continue;
    if (sym.kind === 'loop' && !includeLoopVariables) continue;
    if (IGNORED_PREFIX.test(sym.name)) continue;
    if (sym.reads > 0) continue;
    out.push({
      rule: sym.writes > 0 ? 'write-only-local' : 'unused-local',
      severity: 'warn',
      symbol: sym.name,
      kind: sym.kind,
      line: sym.line,
      column: sym.column,
      detail: sym.writes > 0
        ? `\`${sym.name}\` is assigned ${sym.writes} time(s) and never read`
        : `\`${sym.name}\` is declared and never used`,
    });
  }
  return out.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Locals that hide an outer binding of the same name. */
export function shadowedLocals(table) {
  const out = [];
  for (const sym of table.symbols) {
    if (sym.shadows === null || sym.shadows === undefined) continue;
    const outer = table.symbols[sym.shadows];
    if (!outer) continue;
    if (IGNORED_PREFIX.test(sym.name)) continue;
    out.push({
      rule: 'shadowed-local',
      severity: 'info',
      symbol: sym.name,
      line: sym.line,
      column: sym.column,
      shadowsLine: outer.line,
      detail: `\`${sym.name}\` shadows the one declared on line ${outer.line}`,
    });
  }
  return out.sort((a, b) => a.line - b.line);
}
