// A Luau formatter that cannot change what the code means.
//
// THE SAFETY PROPERTY, AND WHY IT IS THE WHOLE DESIGN.
//
// A formatter is the one tool allowed to rewrite a file it did not write, and it runs on code
// nobody is reading at the time. So the only acceptable failure mode is "declined to format".
// Two mechanisms enforce that:
//
//   1. It works on the TOKEN STREAM, never on the AST. Nothing is re-ordered, re-wrapped, inserted
//      or deleted — only the whitespace between tokens changes. `formatLuau` therefore cannot drop
//      a statement even on a construct it has never seen, which a print-the-AST formatter can and
//      does (anything the printer forgot to handle vanishes silently).
//
//   2. Every adjacency is checked against the LEXER before it is emitted. Luau has pairs of tokens
//      that fuse into something else when you put them next to each other, and each one is a real
//      corruption, not a cosmetic slip:
//
//          `-` `-x`   -> `--x`    the rest of the line becomes a COMMENT
//          `[` `[s]`  -> `[[s]`   the rest of the file becomes a STRING
//          `..` `.5`  -> `...5`   concat-with-a-number becomes varargs
//
//      `mustSeparate` re-tokenizes the pair and inserts a space whenever the result is not the two
//      tokens it started with. That is not a list of known cases — it is a decision procedure, so a
//      pair nobody thought of is handled too.
//
// It declines on a file that does not lex (an unterminated string), because at that point the token
// stream is not a faithful account of the file and rewriting from it would delete code.

import { tokenize } from './luau-ast.mjs';

const OPENERS = new Set(['function', 'do', 'then', 'repeat', '{', '(', '[']);
const CLOSERS = new Set(['end', 'until', '}', ')', ']']);

const BINARY_OPS = new Set([
  '+', '-', '*', '/', '//', '%', '^', '..', '==', '~=', '<', '>', '<=', '>=', '=',
  '+=', '-=', '*=', '/=', '//=', '%=', '^=', '..=', '->', '::', '|', '&',
]);
const UNARY_PRECEDING = new Set([
  '(', '[', '{', ',', ';', '..', '+', '-', '*', '/', '//', '%', '^', '==', '~=', '<', '>', '<=', '>=',
  '=', '+=', '-=', '*=', '/=', '//=', '%=', '^=', '..=', 'return', 'and', 'or', 'not', 'then', 'do',
  'else', 'while', 'until', 'if', 'elseif', 'in', '->', '::',
]);

/**
 * Would `a` immediately followed by `b` lex as something other than `a` then `b`?
 * Decided by running the lexer, not by a list — see the header.
 */
const separationCache = new Map();

export function mustSeparate(a, b) {
  // Memoised because the adjacency alphabet is tiny (a few hundred distinct pairs across a whole
  // codebase) while the call count is one per token. Uncached, the corpus-wide safety test spent
  // 30 seconds re-lexing `) ,` over and over.
  const key = `${a}\u0000${b}`;
  const hit = separationCache.get(key);
  if (hit !== undefined) return hit;
  const { tokens, errors } = tokenize(`${a}${b}`);
  const real = tokens.filter((t) => t.type !== 'eof');
  const answer = errors.length > 0 || real.length !== 2 || real[0].value !== a || real[1].value !== b;
  separationCache.set(key, answer);
  return answer;
}

/**
 * How much this token changes the indent of what follows: +1, 0 or -1.
 *
 * The two zero cases are the callback idiom, which is most of Roblox code:
 *
 *     Remote.OnServerEvent:Connect(function(player)
 *         print(player)
 *     end)
 *
 * Counting brackets naively gives the body depth 2 — the call's `(` and the `function` both open —
 * and puts `end)` at -2. A `(` whose next token is `function` therefore contributes nothing (the
 * `function` supplies the indent), and symmetrically a `)` right after an `end` takes nothing back.
 */
function contribution(code, i) {
  const tok = code[i];
  const v = tok.value;
  if (v === 'else') return 0; // closes the then-branch and opens the else-branch: net zero
  if (v === 'elseif') return -1; // its own `then` supplies the matching +1
  if (v === '(' && code[i + 1]?.value === 'function') return 0;
  if (v === ')' && code[i - 1]?.value === 'end') return 0;
  if (OPENERS.has(v)) return 1;
  if (CLOSERS.has(v)) return -1;
  return 0;
}

/**
 * Does this token dedent the line it starts?
 *
 * Not the same question as `contribution`, and conflating them put `else` one level too deep:
 * `else` has NET zero (it closes one branch and opens another) but must still be drawn one level
 * out. Meanwhile `)` after an `end` has net zero AND must not dedent, because the `end` beside it
 * already did.
 */
function isLeadingDedent(code, i) {
  const v = code[i].value;
  if (v === 'else' || v === 'elseif') return true;
  return contribution(code, i) === -1;
}

function endLineOf(item) {
  let n = item.line;
  for (const ch of item.value) if (ch === '\n') n += 1;
  return n;
}

/** Is this `:` a method-call colon (`obj:Method()`) rather than a type colon (`x: number`)? */
function isMethodColon(items, i) {
  const a = items[i + 1];
  const b = items[i + 2];
  if (!a || a.type !== 'name') return false;
  if (!b) return false;
  return b.type === 'string' || (b.type === 'operator' && (b.value === '(' || b.value === '{'));
}

function isUnary(items, i) {
  const tok = items[i];
  if (tok.value === '#' || tok.value === 'not') return true;
  if (tok.value !== '-') return false;
  const prev = items[i - 1];
  if (!prev) return true;
  if (prev.type === 'comment') return true;
  if (prev.type === 'operator' || prev.type === 'keyword') return UNARY_PRECEDING.has(prev.value);
  return false;
}

function renderLine(items) {
  let out = '';
  for (let i = 0; i < items.length; i += 1) {
    const tok = items[i];
    const prev = items[i - 1];
    const text = tok.value;
    if (!prev) {
      out += text;
      continue;
    }

    let space = true;
    const p = prev.value;
    const c = text;

    if (c === ',' || c === ';') space = false;
    else if (c === ')' || c === ']') space = false;
    else if (c === '}') space = p !== '{';
    else if (p === '(' || p === '[') space = false;
    else if (p === '{') space = c !== '}';
    else if (p === '.' || c === '.') space = false;
    else if (c === '::' || p === '::') space = true;
    else if (c === ':') space = false; // never a space before a colon, either kind
    else if (p === ':') space = !isMethodColon(items, i - 1); // `obj:Method` vs `x: number`
    else if (c === '?') space = false;
    else if (c === '(' || c === '{' || c === '[') {
      // a call/index sticks to its callee; everything else gets a space
      space = !(prev.type === 'name' || p === 'function' || p === ')' || p === ']' || p === '}' || prev.type === 'string');
      if (c === '{' && (prev.type === 'name' || p === ')')) space = true; // `f {a}` reads as a call, keep it spaced
    } else if (prev.type === 'operator' && isUnary(items, i - 1)) space = p === 'not';
    else if (BINARY_OPS.has(c) || BINARY_OPS.has(p)) space = true;
    else if (c === '...' || p === '...') space = !(p === '(' || c === ')' || c === ',');

    if (!space && mustSeparate(p, c)) space = true;
    out += space ? ` ${text}` : text;
  }
  return out;
}

/**
 * Format Luau.
 *
 * @returns {{ code: string, changed: boolean, ok: boolean, errors: object[] }}
 *   `ok: false` means the file did not lex and `code` is the INPUT, unchanged.
 */
export function formatLuau(source, opts = {}) {
  const src = String(source ?? '');
  const indentWith = opts.indent ?? '\t';
  const maxBlankLines = opts.maxBlankLines ?? 1;
  const { tokens, comments, errors } = tokenize(src);
  if (errors.length) return { code: src, changed: false, ok: false, errors };

  const items = [...tokens.filter((t) => t.type !== 'eof'), ...comments].sort((a, b) => a.start - b.start);
  if (!items.length) return { code: src.trim() ? src : '', changed: false, ok: true, errors: [] };

  // group by the line each item STARTS on; a long string keeps its own interior lines
  const lines = [];
  let current = null;
  for (const item of items) {
    if (!current || item.line !== current.line) {
      current = { line: item.line, endLine: endLineOf(item), items: [item] };
      lines.push(current);
    } else {
      current.items.push(item);
      current.endLine = Math.max(current.endLine, endLineOf(item));
    }
  }

  const out = [];
  let depth = 0;
  let previousEnd = null;
  for (const line of lines) {
    if (previousEnd !== null) {
      const gap = Math.min(Math.max(line.line - previousEnd - 1, 0), maxBlankLines);
      for (let i = 0; i < gap; i += 1) out.push('');
    }
    previousEnd = line.endLine;

    const code = line.items.filter((t) => t.type !== 'comment');
    let leadingDedent = 0;
    for (let i = 0; i < code.length; i += 1) {
      if (!isLeadingDedent(code, i)) break;
      leadingDedent += 1;
    }
    const lineDepth = Math.max(0, depth - leadingDedent);

    let net = 0;
    for (let i = 0; i < code.length; i += 1) net += contribution(code, i);

    const rendered = renderLine(line.items);
    out.push(rendered ? indentWith.repeat(lineDepth) + rendered : '');
    depth = Math.max(0, depth + net);
  }

  // NO global trailing-whitespace strip here, and this is not an oversight.
  //
  // A `/[ \t]+$/gm` pass over the finished output looks obviously right and is not: it reaches
  // INSIDE multi-line tokens. Run over the corpus it rewrote 70 files' long comments — deleting the
  // indentation on blank lines inside `--[=[ ... ]=]` docblocks — and the same edit inside a long
  // STRING would change the program's data, silently, in a tool whose entire promise is that it
  // cannot. Nothing here emits trailing whitespace in the first place: `renderLine` never appends
  // one, and the indent is only written when the line has content.
  const code = `${out.join('\n')}\n`;
  return { code, changed: code !== src, ok: true, errors: [] };
}

/**
 * The falsifiable claim the formatter makes about itself: the output holds exactly the same tokens
 * and comments, in the same order, as the input. Returns the first difference, or null.
 */
export function tokenDrift(before, after) {
  const a = tokenize(before);
  const b = tokenize(after);
  const seqA = [...a.tokens.filter((t) => t.type !== 'eof'), ...a.comments].sort((x, y) => x.start - y.start).map((t) => `${t.type}:${t.value}`);
  const seqB = [...b.tokens.filter((t) => t.type !== 'eof'), ...b.comments].sort((x, y) => x.start - y.start).map((t) => `${t.type}:${t.value}`);
  if (seqA.length !== seqB.length) return { index: Math.min(seqA.length, seqB.length), before: seqA.length, after: seqB.length, reason: 'token count changed' };
  for (let i = 0; i < seqA.length; i += 1) {
    if (seqA[i] !== seqB[i]) return { index: i, before: seqA[i], after: seqB[i], reason: 'token changed' };
  }
  return null;
}
