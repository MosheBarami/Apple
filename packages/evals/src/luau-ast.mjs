// A real Luau tokenizer and recursive-descent parser. Source text in, AST out.
//
// WHY THIS EXISTS BESIDE `roblox-antipatterns.mjs` RATHER THAN INSIDE IT.
//
// That file is a regex-and-block scanner and says so in its own header: "It sees one file with no
// project context, so it cannot follow a value across a ModuleScript boundary", and "it answers
// 'does this code contain a known-bad shape', never 'is this code correct'". Those limits are not
// laziness — they are what a scanner IS. Every question in this cluster that a scanner cannot
// answer has the same root: there is no structure to ask about.
//
//   - "which `end` closes this function" is answered by `blockEnd()` counting tokens, which cannot
//     tell a `function` keyword in a string from one in code, and does not try.
//   - "is this local ever read" cannot be asked at all: a regex has no scopes.
//   - "can control reach this statement" cannot be asked: a regex has no edges.
//
// So this module supplies the structure and the scanner keeps its rules. `luau-intel.mjs` is where
// the two meet; nothing here re-implements a rule that already lives there.
//
// WHAT IT PARSES. Luau as Roblox ships it: local/global functions, generics, type annotations and
// type aliases, compound assignment (`+=`, `..=`), `continue`, if-expressions, string
// interpolation, type assertions (`::`), attributes (`@native`), varargs, and the Lua 5.1 core.
// Lua 5.2 `goto`/labels are accepted too, because a third of the corpus is vendored plain Lua.
//
// WHAT IT DOES NOT DO. It does not evaluate, it does not type-check, and it does not guess: a
// construct it cannot parse produces a diagnostic with a line and column, never a silently dropped
// statement. `parseLuau` NEVER THROWS — it returns `{ ok, ast, errors }` — because a parser that
// throws on one bad file cannot be run across a place, and a code-intelligence pass that stops at
// the first bad script is a pass that never finishes on real input.

// ---------------------------------------------------------------------------------- lexer

const KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in',
  'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
]);

// Longest first: `..=` must win over `..`, `...` over `..`, `//=` over `//`, `::` over `:`.
const OPERATORS = [
  '...', '//=', '..=',
  '==', '~=', '<=', '>=', '..', '::', '->', '+=', '-=', '*=', '/=', '%=', '^=', '//',
  '+', '-', '*', '/', '%', '^', '#', '<', '>', '=', '(', ')', '{', '}', '[', ']',
  ';', ':', ',', '.', '?', '|', '&', '@',
];

const isDigit = (c) => c >= '0' && c <= '9';
const isNameStart = (c) => c === '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isNameChar = (c) => isNameStart(c) || isDigit(c);

/** `[[`, `[=[`, `[==[` … at `i`; returns the level (count of `=`) or -1. */
function longBracketLevel(src, i) {
  if (src[i] !== '[') return -1;
  let j = i + 1;
  while (src[j] === '=') j += 1;
  return src[j] === '[' ? j - i - 1 : -1;
}

/**
 * Tokenize Luau.
 *
 * Returns `{ tokens, comments, errors }`. Comments are NOT in `tokens` — the parser must not see
 * them and the formatter must; both get what they need from the same single pass, which is the
 * only way the two can agree about where a comment sits.
 */
export function tokenize(source, opts = {}) {
  const src = String(source ?? '');
  const from = opts.start ?? 0;
  const to = opts.end ?? src.length;
  const tokens = [];
  const comments = [];
  const errors = [];

  let line = 1;
  let lineStart = 0;
  for (let k = 0; k < from; k += 1) {
    if (src[k] === '\n') {
      line += 1;
      lineStart = k + 1;
    }
  }

  let i = from;
  const col = (at) => at - lineStart + 1;
  const err = (message, at) => errors.push({ message, line, column: col(at), index: at });

  const advanceLines = (fromIdx, toIdx) => {
    for (let k = fromIdx; k < toIdx; k += 1) {
      if (src[k] === '\n') {
        line += 1;
        lineStart = k + 1;
      }
    }
  };

  const push = (type, start, endIdx, extra = {}) => {
    const tok = {
      type,
      value: src.slice(start, endIdx),
      start,
      end: endIdx,
      line,
      column: col(start),
      ...extra,
    };
    advanceLines(start, endIdx);
    tokens.push(tok);
    return tok;
  };

  // A `#!` shebang on line 1 is not Lua; plain-Lua corpus files carry them.
  if (from === 0 && src[0] === '#' && src[1] === '!') {
    const nl = src.indexOf('\n', 0);
    i = nl === -1 ? to : nl;
  }

  while (i < to) {
    const c = src[i];

    if (c === '\n') {
      i += 1;
      line += 1;
      lineStart = i;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i += 1;
      continue;
    }

    // comments
    if (c === '-' && src[i + 1] === '-') {
      const level = longBracketLevel(src, i + 2);
      if (level >= 0) {
        const close = `]${'='.repeat(level)}]`;
        const at = src.indexOf(close, i + 2 + level + 2);
        const stop = at === -1 ? to : at + close.length;
        if (at === -1) err('unterminated long comment', i);
        const start = i;
        const text = src.slice(start, stop);
        comments.push({ type: 'comment', value: text, start, end: stop, line, column: col(start), long: true });
        advanceLines(start, stop);
        i = stop;
        continue;
      }
      let nl = src.indexOf('\n', i);
      if (nl === -1 || nl > to) nl = to;
      comments.push({ type: 'comment', value: src.slice(i, nl), start: i, end: nl, line, column: col(i), long: false });
      i = nl;
      continue;
    }

    // long strings
    {
      const level = longBracketLevel(src, i);
      if (level >= 0) {
        const close = `]${'='.repeat(level)}]`;
        const at = src.indexOf(close, i + level + 2);
        const stop = at === -1 ? to : at + close.length;
        if (at === -1) err('unterminated long string', i);
        push('string', i, stop, { long: true, level });
        i = stop;
        continue;
      }
    }

    // short strings
    if (c === '"' || c === "'") {
      let j = i + 1;
      let closed = false;
      while (j < to) {
        const d = src[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (d === '\n') break;
        if (d === c) {
          closed = true;
          j += 1;
          break;
        }
        j += 1;
      }
      if (!closed) err('unterminated string literal', i);
      push('string', i, Math.min(j, to));
      i = Math.min(j, to);
      continue;
    }

    // interpolated strings: `hello {name}`
    if (c === '`') {
      const parts = [];
      let j = i + 1;
      let closed = false;
      while (j < to) {
        const d = src[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (d === '`') {
          closed = true;
          j += 1;
          break;
        }
        if (d === '{') {
          const exprStart = j + 1;
          let depth = 1;
          let k = exprStart;
          while (k < to && depth > 0) {
            const e = src[k];
            if (e === '{') depth += 1;
            else if (e === '}') depth -= 1;
            else if (e === '"' || e === "'") {
              // a string inside the interpolation must not have its braces counted
              let s = k + 1;
              while (s < to && src[s] !== e) s += src[s] === '\\' ? 2 : 1;
              k = s;
            }
            k += 1;
          }
          if (depth > 0) {
            err('unterminated interpolation in string', j);
            j = to;
            break;
          }
          parts.push({ start: exprStart, end: k - 1 });
          j = k;
          continue;
        }
        j += 1;
      }
      if (!closed) err('unterminated interpolated string', i);
      push('string', i, Math.min(j, to), { interpolated: true, parts });
      i = Math.min(j, to);
      continue;
    }

    // numbers
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i;
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        j = i + 2;
        while (j < to && (/[0-9a-fA-F_]/.test(src[j]))) j += 1;
      } else if (c === '0' && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
        j = i + 2;
        while (j < to && /[01_]/.test(src[j])) j += 1;
      } else {
        while (j < to && (isDigit(src[j]) || src[j] === '_')) j += 1;
        if (src[j] === '.') {
          j += 1;
          while (j < to && (isDigit(src[j]) || src[j] === '_')) j += 1;
        }
        if (src[j] === 'e' || src[j] === 'E') {
          let k = j + 1;
          if (src[k] === '+' || src[k] === '-') k += 1;
          if (isDigit(src[k])) {
            j = k;
            while (j < to && isDigit(src[j])) j += 1;
          }
        }
      }
      push('number', i, j);
      i = j;
      continue;
    }

    // names / keywords
    if (isNameStart(c)) {
      let j = i;
      while (j < to && isNameChar(src[j])) j += 1;
      const word = src.slice(i, j);
      push(KEYWORDS.has(word) ? 'keyword' : 'name', i, j);
      i = j;
      continue;
    }

    // operators
    let matched = null;
    for (const op of OPERATORS) {
      if (src.startsWith(op, i)) {
        matched = op;
        break;
      }
    }
    if (matched) {
      push('operator', i, i + matched.length);
      i += matched.length;
      continue;
    }

    err(`unexpected character ${JSON.stringify(c)}`, i);
    i += 1;
  }

  tokens.push({ type: 'eof', value: '', start: to, end: to, line, column: col(to) });
  return { tokens, comments, errors };
}

// ---------------------------------------------------------------------------------- parser

class ParseError extends Error {
  constructor(message, token) {
    super(message);
    this.token = token;
  }
}

const BLOCK_END = new Set(['end', 'else', 'elseif', 'until']);

// Binary precedence, Luau's own table. `..` and `^` are right-associative; `^` binds tighter than
// unary on its right, so `-x^2` is `-(x^2)`.
const BINARY_PRECEDENCE = {
  or: [1, 1],
  and: [2, 2],
  '<': [3, 3], '>': [3, 3], '<=': [3, 3], '>=': [3, 3], '~=': [3, 3], '==': [3, 3],
  '..': [5, 4],
  '+': [6, 6], '-': [6, 6],
  '*': [7, 7], '/': [7, 7], '//': [7, 7], '%': [7, 7],
  '^': [10, 9],
};
const UNARY_PRECEDENCE = 8;

const COMPOUND_ASSIGN = new Set(['+=', '-=', '*=', '/=', '//=', '%=', '^=', '..=']);

class Parser {
  constructor(src, tokens, errors) {
    this.src = src;
    this.toks = tokens;
    this.pos = 0;
    this.errors = errors;
  }

  peek(k = 0) {
    return this.toks[Math.min(this.pos + k, this.toks.length - 1)];
  }

  next() {
    const t = this.peek();
    if (t.type !== 'eof') this.pos += 1;
    return t;
  }

  at(type, value) {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }

  atKeyword(...words) {
    const t = this.peek();
    return t.type === 'keyword' && words.includes(t.value);
  }

  atOp(...ops) {
    const t = this.peek();
    return t.type === 'operator' && ops.includes(t.value);
  }

  accept(type, value) {
    if (this.at(type, value)) return this.next();
    return null;
  }

  expect(type, value) {
    if (this.at(type, value)) return this.next();
    const t = this.peek();
    throw new ParseError(
      `expected ${value ?? type} but found ${t.type === 'eof' ? '<eof>' : JSON.stringify(t.value)}`,
      t,
    );
  }

  node(type, tok, props) {
    return { type, line: tok.line, column: tok.column, start: tok.start, end: tok.end, ...props };
  }

  finish(node) {
    const prev = this.toks[Math.max(0, this.pos - 1)];
    node.end = prev.end;
    node.endLine = prev.line;
    return node;
  }

  // ---- blocks and statements

  parseChunk() {
    const tok = this.peek();
    const body = this.parseBlock();
    if (!this.at('eof')) {
      const t = this.peek();
      throw new ParseError(`unexpected ${t.type === 'eof' ? '<eof>' : JSON.stringify(t.value)} at top level`, t);
    }
    return this.finish(this.node('Chunk', tok, { body }));
  }

  parseBlock() {
    const body = [];
    for (;;) {
      if (this.at('eof')) break;
      if (this.peek().type === 'keyword' && BLOCK_END.has(this.peek().value)) break;
      const before = this.pos;
      let stmt;
      try {
        stmt = this.parseStatement();
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        this.errors.push({ message: e.message, line: e.token.line, column: e.token.column, index: e.token.start });
        if (this.errors.length > 40) throw e;
        // Recovery must make progress or `parseBlock` spins forever on one bad token.
        if (this.pos === before) this.next();
        this.recover();
        continue;
      }
      if (stmt) body.push(stmt);
      if (stmt && (stmt.type === 'ReturnStatement' || stmt.type === 'BreakStatement' || stmt.type === 'ContinueStatement')) {
        this.accept('operator', ';');
        break;
      }
      if (this.pos === before) {
        // parseStatement consumed nothing and did not throw: impossible by construction, but a
        // silent infinite loop here would hang every caller, so make it loud instead.
        const t = this.peek();
        this.errors.push({ message: `parser made no progress at ${JSON.stringify(t.value)}`, line: t.line, column: t.column, index: t.start });
        this.next();
      }
    }
    return body;
  }

  recover() {
    const STARTERS = new Set(['local', 'function', 'if', 'for', 'while', 'repeat', 'return', 'do']);
    while (!this.at('eof')) {
      const t = this.peek();
      if (t.type === 'keyword' && BLOCK_END.has(t.value)) return;
      if (t.type === 'keyword' && STARTERS.has(t.value)) return;
      if (t.type === 'operator' && t.value === ';') {
        this.next();
        return;
      }
      this.next();
    }
  }

  parseStatement() {
    const tok = this.peek();

    if (tok.type === 'operator' && tok.value === ';') {
      this.next();
      return null;
    }

    // `@native`, `@checked` … attributes attach to the declaration that follows.
    if (tok.type === 'operator' && tok.value === '@') {
      const attrs = [];
      while (this.atOp('@')) {
        this.next();
        attrs.push(this.expect('name').value);
      }
      const stmt = this.parseStatement();
      if (stmt) stmt.attributes = attrs;
      return stmt;
    }

    if (tok.type === 'keyword') {
      switch (tok.value) {
        case 'local': return this.parseLocal();
        case 'if': return this.parseIf();
        case 'while': return this.parseWhile();
        case 'do': return this.parseDo();
        case 'for': return this.parseFor();
        case 'repeat': return this.parseRepeat();
        case 'function': return this.parseFunctionStatement();
        case 'return': return this.parseReturn();
        case 'break': {
          this.next();
          return this.finish(this.node('BreakStatement', tok, {}));
        }
        default: break;
      }
    }

    // `continue` and `type` and `export type` are CONTEXTUAL keywords: still legal identifiers.
    if (tok.type === 'name' && tok.value === 'continue' && this.startsNewStatementAfter(1)) {
      this.next();
      return this.finish(this.node('ContinueStatement', tok, {}));
    }
    if (tok.type === 'name' && (tok.value === 'type' || tok.value === 'export')) {
      const alias = this.tryParseTypeAlias();
      if (alias) return alias;
    }
    // Lua 5.2 labels/goto, for vendored plain-Lua sources.
    if (tok.type === 'operator' && tok.value === '::') {
      this.next();
      const name = this.expect('name').value;
      this.expect('operator', '::');
      return this.finish(this.node('LabelStatement', tok, { name }));
    }
    if (tok.type === 'name' && tok.value === 'goto' && this.peek(1).type === 'name' && this.startsNewStatementAfter(2)) {
      this.next();
      const name = this.next().value;
      return this.finish(this.node('GotoStatement', tok, { name }));
    }

    return this.parseExpressionStatement();
  }

  /**
   * Would the token `k` ahead begin a new statement?
   *
   * This is what makes `continue` a contextual keyword rather than a reserved one. `continue = 1`,
   * `continue.x`, `continue(...)` and `continue, other = 1, 2` are all legal Lua that uses
   * `continue` as a plain identifier, and treating it as a keyword there would break those files.
   */
  startsNewStatementAfter(k) {
    const t = this.peek(k);
    if (t.type === 'eof') return true;
    if (t.type === 'keyword') return !['and', 'or', 'not'].includes(t.value);
    if (t.type === 'string') return false; // `continue "s"` would be a call
    if (t.type === 'operator') {
      const CONTINUES_EXPRESSION = new Set([
        '=', '.', ':', '[', '(', '{', ',', '::', '+', '-', '*', '/', '//', '%', '^', '..',
        '==', '~=', '<', '>', '<=', '>=', '?', '->', '|', '&',
        '+=', '-=', '*=', '/=', '//=', '%=', '^=', '..=',
      ]);
      return !CONTINUES_EXPRESSION.has(t.value);
    }
    return true;
  }

  parseExpressionStatement() {
    const tok = this.peek();
    const first = this.parseSuffixedExpression();

    if (this.atOp('=') || this.atOp(',')) {
      const targets = [first];
      while (this.accept('operator', ',')) targets.push(this.parseSuffixedExpression());
      this.expect('operator', '=');
      const values = this.parseExpressionList();
      for (const t of targets) this.assertAssignable(t, tok);
      return this.finish(this.node('AssignmentStatement', tok, { targets, values, operator: '=' }));
    }

    if (this.peek().type === 'operator' && COMPOUND_ASSIGN.has(this.peek().value)) {
      const op = this.next().value;
      const value = this.parseExpression();
      this.assertAssignable(first, tok);
      return this.finish(this.node('AssignmentStatement', tok, { targets: [first], values: [value], operator: op }));
    }

    if (first.type !== 'CallExpression') {
      throw new ParseError('expression is not a statement (only calls and assignments can stand alone)', tok);
    }
    return this.finish(this.node('CallStatement', tok, { expression: first }));
  }

  assertAssignable(node, tok) {
    if (node.type === 'Identifier' || node.type === 'MemberExpression' || node.type === 'IndexExpression') return;
    throw new ParseError(`cannot assign to a ${node.type}`, tok);
  }

  parseLocal() {
    const tok = this.expect('keyword', 'local');
    if (this.atKeyword('function')) {
      const fnTok = this.expect('keyword', 'function');
      const nameTok = this.expect('name');
      const fn = this.parseFunctionBody(fnTok, false);
      return this.finish(this.node('FunctionDeclaration', tok, {
        isLocal: true,
        name: nameTok.value,
        identifier: this.node('Identifier', nameTok, { name: nameTok.value, end: nameTok.end }),
        ...fn,
      }));
    }
    const names = [];
    do {
      const nameTok = this.expect('name');
      const entry = { name: nameTok.value, line: nameTok.line, column: nameTok.column, start: nameTok.start, end: nameTok.end, typeAnnotation: null, attribute: null };
      // `local x <const> = 1` — Lua 5.4 attribs, present in vendored sources.
      if (this.atOp('<') && this.peek(1).type === 'name' && this.peek(2).type === 'operator' && this.peek(2).value === '>') {
        this.next();
        entry.attribute = this.next().value;
        this.next();
      } else if (this.accept('operator', ':')) {
        entry.typeAnnotation = this.parseType();
      }
      names.push(entry);
    } while (this.accept('operator', ','));
    const init = this.accept('operator', '=') ? this.parseExpressionList() : [];
    return this.finish(this.node('LocalStatement', tok, { names, init }));
  }

  tryParseTypeAlias() {
    const save = this.pos;
    const tok = this.peek();
    let exported = false;
    if (tok.value === 'export') {
      if (!(this.peek(1).type === 'name' && this.peek(1).value === 'type' && this.peek(2).type === 'name')) return null;
      this.next();
      exported = true;
    }
    if (!(this.peek().type === 'name' && this.peek().value === 'type')) {
      this.pos = save;
      return null;
    }
    // `type` is a legal variable: `type = 5`, `type(x)`, `type.foo = 1` are NOT aliases.
    const after = this.peek(1);
    const afterAfter = this.peek(2);
    const looksLikeAlias = after.type === 'name'
      && afterAfter.type === 'operator' && (afterAfter.value === '=' || afterAfter.value === '<');
    if (!looksLikeAlias) {
      this.pos = save;
      return null;
    }
    this.next(); // `type`
    const nameTok = this.next();
    const generics = this.atOp('<') ? this.parseGenericParams() : [];
    this.expect('operator', '=');
    const definition = this.parseType();
    return this.finish(this.node('TypeAlias', tok, { name: nameTok.value, exported, generics, definition }));
  }

  parseIf() {
    const tok = this.expect('keyword', 'if');
    const clauses = [];
    const condition = this.parseExpression();
    this.expect('keyword', 'then');
    clauses.push({ condition, body: this.parseBlock() });
    while (this.atKeyword('elseif')) {
      this.next();
      const c = this.parseExpression();
      this.expect('keyword', 'then');
      clauses.push({ condition: c, body: this.parseBlock() });
    }
    let orelse = null;
    if (this.atKeyword('else')) {
      this.next();
      orelse = this.parseBlock();
    }
    this.expect('keyword', 'end');
    return this.finish(this.node('IfStatement', tok, { clauses, orelse }));
  }

  parseWhile() {
    const tok = this.expect('keyword', 'while');
    const condition = this.parseExpression();
    this.expect('keyword', 'do');
    const body = this.parseBlock();
    this.expect('keyword', 'end');
    return this.finish(this.node('WhileStatement', tok, { condition, body }));
  }

  parseDo() {
    const tok = this.expect('keyword', 'do');
    const body = this.parseBlock();
    this.expect('keyword', 'end');
    return this.finish(this.node('DoStatement', tok, { body }));
  }

  parseRepeat() {
    const tok = this.expect('keyword', 'repeat');
    const body = this.parseBlock();
    this.expect('keyword', 'until');
    const condition = this.parseExpression();
    return this.finish(this.node('RepeatStatement', tok, { body, condition }));
  }

  parseFor() {
    const tok = this.expect('keyword', 'for');
    const firstTok = this.expect('name');
    let firstType = null;
    if (this.accept('operator', ':')) firstType = this.parseType();

    if (this.accept('operator', '=')) {
      const start = this.parseExpression();
      this.expect('operator', ',');
      const limit = this.parseExpression();
      const step = this.accept('operator', ',') ? this.parseExpression() : null;
      this.expect('keyword', 'do');
      const body = this.parseBlock();
      this.expect('keyword', 'end');
      return this.finish(this.node('NumericForStatement', tok, {
        variable: { name: firstTok.value, line: firstTok.line, column: firstTok.column, start: firstTok.start, end: firstTok.end, typeAnnotation: firstType },
        start, limit, step, body,
      }));
    }

    const variables = [{ name: firstTok.value, line: firstTok.line, column: firstTok.column, start: firstTok.start, end: firstTok.end, typeAnnotation: firstType }];
    while (this.accept('operator', ',')) {
      const t = this.expect('name');
      let ta = null;
      if (this.accept('operator', ':')) ta = this.parseType();
      variables.push({ name: t.value, line: t.line, column: t.column, start: t.start, end: t.end, typeAnnotation: ta });
    }
    this.expect('keyword', 'in');
    const iterators = this.parseExpressionList();
    this.expect('keyword', 'do');
    const body = this.parseBlock();
    this.expect('keyword', 'end');
    return this.finish(this.node('GenericForStatement', tok, { variables, iterators, body }));
  }

  parseFunctionStatement() {
    const tok = this.expect('keyword', 'function');
    const nameTok = this.expect('name');
    let identifier = this.node('Identifier', nameTok, { name: nameTok.value, end: nameTok.end });
    let isMethod = false;
    const path = [nameTok.value];
    while (this.atOp('.') || this.atOp(':')) {
      const sep = this.next().value;
      const part = this.expect('name');
      identifier = this.node('MemberExpression', nameTok, {
        base: identifier,
        indexer: sep,
        identifier: this.node('Identifier', part, { name: part.value, end: part.end }),
        end: part.end,
      });
      path.push(part.value);
      if (sep === ':') {
        isMethod = true;
        break;
      }
    }
    const fn = this.parseFunctionBody(tok, isMethod);
    return this.finish(this.node('FunctionDeclaration', tok, {
      isLocal: false,
      name: path.join('.'),
      path,
      identifier,
      isMethod,
      ...fn,
    }));
  }

  parseFunctionBody(tok, isMethod) {
    const generics = this.atOp('<') ? this.parseGenericParams() : [];
    this.expect('operator', '(');
    const params = [];
    if (isMethod) params.push({ name: 'self', implicit: true, line: tok.line, column: tok.column, start: tok.start, end: tok.end, typeAnnotation: null });
    if (!this.atOp(')')) {
      do {
        if (this.atOp('...')) {
          const v = this.next();
          let ta = null;
          if (this.accept('operator', ':')) ta = this.parseType();
          params.push({ name: '...', vararg: true, line: v.line, column: v.column, start: v.start, end: v.end, typeAnnotation: ta });
          break;
        }
        const p = this.expect('name');
        let ta = null;
        if (this.accept('operator', ':')) ta = this.parseType();
        params.push({ name: p.value, line: p.line, column: p.column, start: p.start, end: p.end, typeAnnotation: ta });
      } while (this.accept('operator', ','));
    }
    this.expect('operator', ')');
    let returnType = null;
    if (this.accept('operator', ':')) returnType = this.parseReturnType();
    const body = this.parseBlock();
    this.expect('keyword', 'end');
    return { generics, params, returnType, body, isMethod: !!isMethod };
  }

  parseReturn() {
    const tok = this.expect('keyword', 'return');
    const t = this.peek();
    const ends = t.type === 'eof'
      || (t.type === 'keyword' && BLOCK_END.has(t.value))
      || (t.type === 'operator' && t.value === ';');
    const args = ends ? [] : this.parseExpressionList();
    return this.finish(this.node('ReturnStatement', tok, { arguments: args }));
  }

  // ---- expressions

  parseExpressionList() {
    const out = [this.parseExpression()];
    while (this.accept('operator', ',')) out.push(this.parseExpression());
    return out;
  }

  parseExpression(limit = 0) {
    let left;
    const tok = this.peek();
    if (this.atKeyword('not') || this.atOp('-') || this.atOp('#')) {
      const op = this.next().value;
      const argument = this.parseExpression(UNARY_PRECEDENCE);
      left = this.finish(this.node('UnaryExpression', tok, { operator: op, argument }));
    } else {
      left = this.parseSimpleExpression();
    }

    for (;;) {
      const t = this.peek();
      const op = (t.type === 'operator' || t.type === 'keyword') ? t.value : null;
      const prec = op ? BINARY_PRECEDENCE[op] : undefined;
      if (!prec || prec[0] <= limit) break;
      this.next();
      const right = this.parseExpression(prec[1]);
      left = { type: 'BinaryExpression', operator: op, left, right, line: left.line, column: left.column, start: left.start, end: right.end };
    }
    return left;
  }

  parseSimpleExpression() {
    const tok = this.peek();
    // Attributes are legal on a function EXPRESSION too: `read = @native function(b) ... end`.
    if (tok.type === 'operator' && tok.value === '@') {
      const attrs = [];
      while (this.atOp('@')) {
        this.next();
        attrs.push(this.expect('name').value);
      }
      const fnTok = this.expect('keyword', 'function');
      const fn = this.parseFunctionBody(fnTok, false);
      return this.withTypeAssertion(this.finish(this.node('FunctionExpression', tok, { ...fn, attributes: attrs })));
    }
    if (tok.type === 'number') {
      this.next();
      return this.withTypeAssertion(this.finish(this.node('NumericLiteral', tok, { raw: tok.value, value: numericValue(tok.value) })));
    }
    if (tok.type === 'string') {
      this.next();
      const node = this.node('StringLiteral', tok, {
        raw: tok.value,
        value: stringValue(tok),
        interpolated: !!tok.interpolated,
        long: !!tok.long,
      });
      if (tok.interpolated && tok.parts?.length) {
        node.expressions = tok.parts.map((p) => parseSubExpression(this.src, p.start, p.end, this.errors));
      }
      return this.withTypeAssertion(this.finish(node));
    }
    if (tok.type === 'keyword') {
      if (tok.value === 'nil') {
        this.next();
        return this.withTypeAssertion(this.finish(this.node('NilLiteral', tok, {})));
      }
      if (tok.value === 'true' || tok.value === 'false') {
        this.next();
        return this.withTypeAssertion(this.finish(this.node('BooleanLiteral', tok, { value: tok.value === 'true' })));
      }
      if (tok.value === 'function') {
        this.next();
        const fn = this.parseFunctionBody(tok, false);
        return this.withTypeAssertion(this.finish(this.node('FunctionExpression', tok, fn)));
      }
      if (tok.value === 'if') return this.parseIfExpression();
    }
    if (tok.type === 'operator') {
      if (tok.value === '...') {
        this.next();
        return this.withTypeAssertion(this.finish(this.node('VarargLiteral', tok, {})));
      }
      if (tok.value === '{') return this.withTypeAssertion(this.parseTableConstructor());
    }
    return this.parseSuffixedExpression();
  }

  parseIfExpression() {
    const tok = this.expect('keyword', 'if');
    const condition = this.parseExpression();
    this.expect('keyword', 'then');
    const consequent = this.parseExpression();
    const elseifs = [];
    while (this.atKeyword('elseif')) {
      this.next();
      const c = this.parseExpression();
      this.expect('keyword', 'then');
      elseifs.push({ condition: c, value: this.parseExpression() });
    }
    this.expect('keyword', 'else');
    const alternate = this.parseExpression();
    return this.finish(this.node('IfExpression', tok, { condition, consequent, elseifs, alternate }));
  }

  parseTableConstructor() {
    const tok = this.expect('operator', '{');
    const fields = [];
    while (!this.atOp('}')) {
      if (this.atOp('[')) {
        const at = this.next();
        const key = this.parseExpression();
        this.expect('operator', ']');
        this.expect('operator', '=');
        const value = this.parseExpression();
        fields.push({ type: 'TableKey', key, value, line: at.line });
      } else if (this.peek().type === 'name' && this.peek(1).type === 'operator' && this.peek(1).value === '=') {
        const k = this.next();
        this.next();
        const value = this.parseExpression();
        fields.push({ type: 'TableKeyString', key: this.node('Identifier', k, { name: k.value, end: k.end }), value, line: k.line });
      } else {
        const value = this.parseExpression();
        fields.push({ type: 'TableValue', value, line: value.line });
      }
      if (!this.accept('operator', ',') && !this.accept('operator', ';')) break;
    }
    this.expect('operator', '}');
    return this.finish(this.node('TableConstructorExpression', tok, { fields }));
  }

  parsePrimaryExpression() {
    const tok = this.peek();
    if (tok.type === 'name') {
      this.next();
      return this.finish(this.node('Identifier', tok, { name: tok.value }));
    }
    if (this.atOp('(')) {
      this.next();
      const expression = this.parseExpression();
      this.expect('operator', ')');
      return this.finish(this.node('ParenthesisExpression', tok, { expression }));
    }
    throw new ParseError(
      `expected an expression but found ${tok.type === 'eof' ? '<eof>' : JSON.stringify(tok.value)}`,
      tok,
    );
  }

  parseSuffixedExpression() {
    let base = this.parsePrimaryExpression();
    for (;;) {
      const tok = this.peek();
      if (this.atOp('.')) {
        this.next();
        const name = this.expect('name');
        base = { type: 'MemberExpression', base, indexer: '.', identifier: this.node('Identifier', name, { name: name.value, end: name.end }), line: base.line, column: base.column, start: base.start, end: name.end };
        continue;
      }
      if (this.atOp('[')) {
        this.next();
        const index = this.parseExpression();
        const close = this.expect('operator', ']');
        base = { type: 'IndexExpression', base, index, line: base.line, column: base.column, start: base.start, end: close.end };
        continue;
      }
      if (this.atOp(':')) {
        this.next();
        const name = this.expect('name');
        const callee = { type: 'MemberExpression', base, indexer: ':', identifier: this.node('Identifier', name, { name: name.value, end: name.end }), line: base.line, column: base.column, start: base.start, end: name.end };
        const args = this.parseCallArguments();
        base = { type: 'CallExpression', base: callee, arguments: args.list, method: true, line: base.line, column: base.column, start: base.start, end: args.end };
        continue;
      }
      if (this.atOp('(') || this.atOp('{') || this.peek().type === 'string') {
        const args = this.parseCallArguments();
        base = { type: 'CallExpression', base, arguments: args.list, method: false, line: base.line, column: base.column, start: base.start, end: args.end };
        continue;
      }
      if (this.atOp('::')) {
        this.next();
        const typeAnnotation = this.parseType();
        base = { type: 'TypeAssertion', expression: base, typeAnnotation, line: base.line, column: base.column, start: base.start, end: this.toks[this.pos - 1].end };
        continue;
      }
      void tok;
      break;
    }
    return base;
  }

  withTypeAssertion(node) {
    let out = node;
    while (this.atOp('::')) {
      this.next();
      const typeAnnotation = this.parseType();
      out = { type: 'TypeAssertion', expression: out, typeAnnotation, line: out.line, column: out.column, start: out.start, end: this.toks[this.pos - 1].end };
    }
    return out;
  }

  parseCallArguments() {
    if (this.peek().type === 'string') {
      const s = this.next();
      return { list: [this.node('StringLiteral', s, { raw: s.value, value: stringValue(s), end: s.end })], end: s.end };
    }
    if (this.atOp('{')) {
      const t = this.parseTableConstructor();
      return { list: [t], end: t.end };
    }
    this.expect('operator', '(');
    const list = this.atOp(')') ? [] : this.parseExpressionList();
    const close = this.expect('operator', ')');
    return { list, end: close.end };
  }

  // ---- types
  //
  // Types are PARSED, not skipped. A skipper that balances brackets cannot tell where a type ends
  // in `local a: {number} = {}` versus `local a: {number}` — and getting that wrong silently eats
  // the initialiser, which is the expression every later analysis depends on.

  parseGenericParams() {
    this.expect('operator', '<');
    const out = [];
    if (!this.atOp('>')) {
      do {
        const t = this.expect('name');
        const entry = { name: t.value, pack: false, default: null };
        if (this.atOp('...')) {
          this.next();
          entry.pack = true;
        }
        if (this.accept('operator', '=')) entry.default = this.parseType();
        out.push(entry);
      } while (this.accept('operator', ','));
    }
    this.expectCloseAngle();
    return out;
  }

  /** `>` may have been lexed as part of `>=` in `Map<string, Foo>=`. Split it rather than fail. */
  expectCloseAngle() {
    const t = this.peek();
    if (t.type === 'operator' && t.value === '>') {
      this.next();
      return;
    }
    if (t.type === 'operator' && t.value === '>=') {
      this.toks[this.pos] = { ...t, value: '=', start: t.start + 1, column: t.column + 1 };
      return;
    }
    this.expect('operator', '>');
  }

  parseReturnType() {
    return this.parseType();
  }

  parseType() {
    // A leading `|` or `&` is legal and idiomatic for a union written one variant per line:
    //   export type Trackable =
    //     | Instance
    //     | RBXScriptConnection
    this.accept('operator', '|') || this.accept('operator', '&');
    let left = this.parseTypeIntersection();
    while (this.atOp('|')) {
      this.next();
      const right = this.parseTypeIntersection();
      left = { type: 'TypeUnion', left, right, line: left.line, column: left.column, start: left.start, end: right.end };
    }
    return left;
  }

  parseTypeIntersection() {
    let left = this.parseSimpleType();
    while (this.atOp('&')) {
      this.next();
      const right = this.parseSimpleType();
      left = { type: 'TypeIntersection', left, right, line: left.line, column: left.column, start: left.start, end: right.end };
    }
    return left;
  }

  parseSimpleType() {
    const tok = this.peek();
    let node;

    if (this.atOp('...')) {
      this.next();
      const inner = this.parseSimpleType();
      return { type: 'TypePack', element: inner, line: tok.line, column: tok.column, start: tok.start, end: inner.end };
    }
    // A generic function TYPE: `<T>(x: T) -> T`, which appears as a field type and after `::`.
    if (this.atOp('<')) {
      const generics = this.parseGenericParams();
      const fn = this.parseSimpleType();
      fn.generics = generics;
      return fn;
    }
    if (tok.type === 'string') {
      this.next();
      node = this.node('TypeSingleton', tok, { value: stringValue(tok), end: tok.end });
    } else if (tok.type === 'keyword' && (tok.value === 'nil' || tok.value === 'true' || tok.value === 'false')) {
      this.next();
      node = this.node('TypeSingleton', tok, { value: tok.value, end: tok.end });
    } else if (this.atOp('(')) {
      // `(A, B) -> C`, or a parenthesised type.
      this.next();
      const items = [];
      if (!this.atOp(')')) {
        do {
          // named parameter in a function type: `(self: Foo, n: number) -> ()`
          if (this.peek().type === 'name' && this.peek(1).type === 'operator' && this.peek(1).value === ':') {
            this.next();
            this.next();
          }
          items.push(this.parseType());
        } while (this.accept('operator', ','));
      }
      const close = this.expect('operator', ')');
      if (this.atOp('->')) {
        this.next();
        const ret = this.parseType();
        node = { type: 'TypeFunction', params: items, returns: ret, line: tok.line, column: tok.column, start: tok.start, end: ret.end };
      } else {
        node = { type: 'TypeParen', items, line: tok.line, column: tok.column, start: tok.start, end: close.end };
      }
    } else if (this.atOp('{')) {
      node = this.parseTableType();
    } else if (tok.type === 'name' && tok.value === 'typeof' && this.peek(1).type === 'operator' && this.peek(1).value === '(') {
      this.next();
      this.next();
      const expression = this.parseExpression();
      const close = this.expect('operator', ')');
      node = { type: 'TypeTypeof', expression, line: tok.line, column: tok.column, start: tok.start, end: close.end };
    } else if (tok.type === 'name') {
      this.next();
      let name = tok.value;
      let endIdx = tok.end;
      if (this.atOp('.')) {
        this.next();
        const part = this.expect('name');
        name = `${name}.${part.value}`;
        endIdx = part.end;
      }
      let typeArgs = [];
      if (this.atOp('<')) {
        this.next();
        if (!this.atOp('>')) {
          do {
            typeArgs.push(this.parseType());
          } while (this.accept('operator', ','));
        }
        const before = this.peek();
        this.expectCloseAngle();
        endIdx = before.end;
      }
      node = { type: 'TypeReference', name, typeArgs, line: tok.line, column: tok.column, start: tok.start, end: endIdx };
    } else {
      throw new ParseError(`expected a type but found ${tok.type === 'eof' ? '<eof>' : JSON.stringify(tok.value)}`, tok);
    }

    // Trailing `...` is a generic type PACK, not the vararg prefix: `(Arguments...) -> ()`.
    if (this.atOp('...')) {
      const dots = this.next();
      node = { type: 'TypePack', element: node, trailing: true, line: node.line, column: node.column, start: node.start, end: dots.end };
    }
    while (this.atOp('?')) {
      const q = this.next();
      node = { type: 'TypeOptional', inner: node, line: node.line, column: node.column, start: node.start, end: q.end };
    }
    if (this.atOp('->')) {
      this.next();
      const ret = this.parseType();
      node = { type: 'TypeFunction', params: [node], returns: ret, line: node.line, column: node.column, start: node.start, end: ret.end };
    }
    return node;
  }

  parseTableType() {
    const tok = this.expect('operator', '{');
    const fields = [];
    let arrayOf = null;
    if (!this.atOp('}')) {
      // `{ T }` array shorthand vs `{ a: T }` record vs `{ [K]: V }` map vs `{ read a: T }`
      const head = this.peek();
      const isRecord = this.atOp('[')
        || (head.type === 'name' && this.peek(1).type === 'operator' && this.peek(1).value === ':')
        || (head.type === 'name' && (head.value === 'read' || head.value === 'write')
            && (this.peek(1).type === 'name' || (this.peek(1).type === 'operator' && this.peek(1).value === '[')));
      if (!isRecord) {
        arrayOf = this.parseType();
      } else {
        do {
          if (this.atOp('}')) break;
          // `read`/`write` property variance modifiers: `read __T: T`, `write count: number`.
          let access = null;
          if (this.peek().type === 'name' && (this.peek().value === 'read' || this.peek().value === 'write')
              && (this.peek(1).type === 'name' || (this.peek(1).type === 'operator' && this.peek(1).value === '['))) {
            access = this.next().value;
          }
          if (this.atOp('[')) {
            this.next();
            const key = this.parseType();
            this.expect('operator', ']');
            this.expect('operator', ':');
            fields.push({ kind: 'indexer', key, access, value: this.parseType() });
          } else {
            const nameTok = this.expect('name');
            this.expect('operator', ':');
            fields.push({ kind: 'prop', name: nameTok.value, access, value: this.parseType() });
          }
        } while (this.accept('operator', ',') || this.accept('operator', ';'));
      }
    }
    const close = this.expect('operator', '}');
    return { type: 'TypeTable', fields, arrayOf, line: tok.line, column: tok.column, start: tok.start, end: close.end };
  }
}

function parseSubExpression(src, start, end, errors) {
  const { tokens, errors: lexErrors } = tokenize(src, { start, end });
  errors.push(...lexErrors);
  const p = new Parser(src, tokens, errors);
  try {
    return p.parseExpression();
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    errors.push({ message: e.message, line: e.token.line, column: e.token.column, index: e.token.start });
    return null;
  }
}

function numericValue(raw) {
  const clean = raw.replace(/_/g, '');
  if (/^0[bB]/.test(clean)) return Number.parseInt(clean.slice(2), 2);
  return Number(clean);
}

function stringValue(tok) {
  const raw = tok.value;
  if (tok.long) {
    const level = tok.level ?? 0;
    return raw.slice(level + 2, Math.max(level + 2, raw.length - (level + 2)));
  }
  if (tok.interpolated) return raw.slice(1, -1);
  const body = raw.slice(1, raw.endsWith(raw[0]) && raw.length > 1 ? -1 : undefined);
  return body.replace(/\\(u\{([0-9a-fA-F]+)\}|x([0-9a-fA-F]{2})|(\d{1,3})|z\s*|.)/g, (m, g1, uni, hex, dec) => {
    if (uni) return String.fromCodePoint(Number.parseInt(uni, 16));
    if (hex) return String.fromCharCode(Number.parseInt(hex, 16));
    if (dec) return String.fromCharCode(Number.parseInt(dec, 10));
    const c = g1[0];
    if (c === 'z') return '';
    return { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'", '\n': '\n' }[c] ?? c;
  });
}

/**
 * Parse Luau source.
 *
 * NEVER THROWS. `{ ok, ast, errors, tokens, comments }` — `ok` is false when anything was reported,
 * and `ast` is still the best partial tree the recovery could build, because a caller indexing a
 * place wants the 400 good scripts even when one is mid-edit.
 */
export function parseLuau(source, opts = {}) {
  const src = String(source ?? '');
  const { tokens, comments, errors } = tokenize(src);
  const parser = new Parser(src, tokens, errors);
  let ast = null;
  try {
    ast = parser.parseChunk();
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    errors.push({ message: e.message, line: e.token.line, column: e.token.column, index: e.token.start });
    ast = { type: 'Chunk', body: [], line: 1, column: 1, start: 0, end: src.length, partial: true };
  }
  if (ast) {
    ast.comments = comments;
    ast.source = opts.path ?? null;
  }
  return { ok: errors.length === 0, ast, errors, tokens, comments, text: src };
}

// ---------------------------------------------------------------------------------- AST walking

const CHILD_KEYS = [
  'body', 'init', 'targets', 'values', 'arguments', 'expression', 'expressions', 'base', 'index',
  'identifier', 'argument', 'left', 'right', 'condition', 'consequent', 'alternate', 'start',
  'limit', 'step', 'iterators', 'fields', 'key', 'value', 'orelse', 'params', 'clauses', 'elseifs',
];

/**
 * Depth-first walk of every AST node.
 *
 * `visit(node, parent)` may return `false` to skip the node's children. Type annotations are NOT
 * walked as expressions — `typeof(x)` inside a type is reachable through `node.typeAnnotation`
 * deliberately, so a reference counter does not silently count type-level mentions as uses.
 */
export function walk(root, visit) {
  const seen = new Set();
  const go = (node, parent) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) go(item, parent);
      return;
    }
    if (!node.type) {
      // plain record (an if-clause, a table field, a for-variable): descend into its parts
      for (const key of CHILD_KEYS) if (key in node) go(node[key], parent);
      return;
    }
    if (seen.has(node)) return;
    seen.add(node);
    if (visit(node, parent) === false) return;
    for (const key of CHILD_KEYS) {
      if (key in node) go(node[key], node);
    }
  };
  go(root, null);
}

/** Every node of the given type, in source order. */
export function findNodes(root, type) {
  const out = [];
  const want = Array.isArray(type) ? new Set(type) : new Set([type]);
  walk(root, (node) => {
    if (want.has(node.type)) out.push(node);
  });
  return out.sort((a, b) => a.start - b.start);
}

/** Dotted source text of a member chain: `game.Workspace.Baseplate`, or null if it is computed. */
export function memberPath(node) {
  const parts = [];
  let cur = node;
  for (;;) {
    if (!cur) return null;
    if (cur.type === 'Identifier') {
      parts.unshift(cur.name);
      return parts.join('.');
    }
    if (cur.type === 'MemberExpression') {
      parts.unshift(cur.identifier.name);
      cur = cur.base;
      continue;
    }
    if (cur.type === 'ParenthesisExpression') {
      cur = cur.expression;
      continue;
    }
    if (cur.type === 'IndexExpression' && cur.index?.type === 'StringLiteral') {
      parts.unshift(cur.index.value);
      cur = cur.base;
      continue;
    }
    return null;
  }
}

/**
 * A compact structural summary of one file: what it declares, what it calls, what it requires.
 * This is the "AST inspection" surface a tool or a prompt reads; it is derived, never hand-kept.
 */
export function inspectLuau(source, opts = {}) {
  const { ok, ast, errors, tokens, comments } = parseLuau(source, opts);
  const functions = findNodes(ast, ['FunctionDeclaration', 'FunctionExpression']).map((fn) => ({
    name: fn.name ?? '<anonymous>',
    kind: fn.type === 'FunctionDeclaration' ? (fn.isLocal ? 'local function' : 'function') : 'anonymous',
    isMethod: !!fn.isMethod,
    line: fn.line,
    endLine: fn.endLine ?? fn.line,
    params: fn.params.map((p) => p.name),
    hasTypedParams: fn.params.some((p) => p.typeAnnotation),
    returnType: !!fn.returnType,
  }));
  const calls = findNodes(ast, 'CallExpression').map((c) => ({
    callee: memberPath(c.base) ?? '<computed>',
    method: !!c.method,
    args: c.arguments.length,
    line: c.line,
  }));
  const types = findNodes(ast, 'TypeAlias').map((t) => ({ name: t.name, exported: t.exported, line: t.line }));
  const requires = calls.filter((c) => c.callee === 'require');
  return {
    ok,
    errors,
    tokenCount: tokens.length - 1,
    commentCount: comments.length,
    lineCount: source ? String(source).split('\n').length : 0,
    functions,
    calls,
    types,
    requireCount: requires.length,
    ast,
  };
}
