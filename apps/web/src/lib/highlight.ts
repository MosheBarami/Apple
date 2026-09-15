// Syntax highlighting for the code the agent writes back.
//
// WHY THERE IS NO LIBRARY HERE. highlight.js, Prism and Shiki all solve a much larger problem —
// two hundred grammars, themes, and in Shiki's case a WASM regex engine — and all three are paid
// for on the first paint of a chat that may contain no code at all. This product emits code in
// exactly the languages `generative-ui/schema.ts` already declares: Luau, Lua, TypeScript,
// JavaScript, JSON and plain text. Six, of which four share a scanner.
//
// AND THE SAFETY ARGUMENT IS THE REAL ONE. A highlighter that returns an HTML STRING has to escape
// the code it is decorating, inside a pipeline whose whole reason for existing is that model output
// is untrusted (see markdown.tsx: marked → DOMPurify). This one returns TOKENS. They are rendered
// as React children, which cannot be interpreted as markup, so a script tag in a code block is text
// no matter what any escaping function did or did not do.
//
// THE PROPERTY THAT MATTERS, and the one `highlight.test.mjs` pins hardest: the tokens concatenate
// back to the input, byte for byte. A highlighter is a lens, not an editor — a scanner that loses a
// character, or emits one twice, is showing the user code that is not the code they would run, and
// that is a worse failure than no highlighting at all.
import { CODE_LANGUAGES, type CodeLanguage } from './generative-ui/schema.ts';

export type TokenKind =
  /** language keyword — `local`, `function`, `const`, and JSON's `true`/`false`/`null` */
  | 'kw'
  /** string literal, including its quotes and any unterminated tail */
  | 'str'
  /** numeric literal */
  | 'num'
  /** comment, including its introducer */
  | 'com'
  /** an identifier in call position, or a JSON object key */
  | 'fn'
  /** everything else: operators, whitespace, ordinary identifiers */
  | 'plain';

export interface Token {
  kind: TokenKind;
  text: string;
}

/**
 * Language aliases the model actually writes in a fence, mapped onto the vocabulary the product
 * already has. Anything unrecognised becomes 'text', which renders as unhighlighted code rather
 * than as a guess — mis-highlighting is worse than not highlighting, because it asserts a structure
 * the code does not have.
 */
const ALIASES: Record<string, CodeLanguage> = {
  luau: 'luau',
  lua: 'lua',
  rbxlua: 'luau',
  roblox: 'luau',
  ts: 'ts',
  typescript: 'ts',
  tsx: 'ts',
  js: 'js',
  javascript: 'js',
  jsx: 'js',
  mjs: 'js',
  json: 'json',
  json5: 'json',
  text: 'text',
  txt: 'text',
  plain: 'text',
  '': 'text',
};

export function normaliseLanguage(raw: string | undefined | null): CodeLanguage {
  const key = (raw ?? '').trim().toLowerCase();
  const hit = ALIASES[key];
  if (hit) return hit;
  return (CODE_LANGUAGES as readonly string[]).includes(key) ? (key as CodeLanguage) : 'text';
}

const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local',
  'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while', 'continue',
  // Luau adds these, and they are what Roblox code is actually written with.
  'type', 'export', 'self',
]);

const JS_KEYWORDS = new Set([
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
  'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'of', 'return',
  'satisfies', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'var',
  'void', 'while', 'yield',
]);

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdent = (c: string) => /[A-Za-z0-9_$]/.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';

/** Append, merging into the previous token when the kind is unchanged. Fewer spans, same text. */
function push(out: Token[], kind: TokenKind, text: string): void {
  if (text === '') return;
  const last = out[out.length - 1];
  if (last && last.kind === kind) last.text += text;
  else out.push({ kind, text });
}

/**
 * A quoted string starting at `i`, returning the index just past it.
 *
 * An UNTERMINATED string runs to the end of the source and is still a string. This is the normal
 * case while a reply is streaming — the closing quote has not arrived yet — and a scanner that
 * refused to terminate would either hang or drop the tail.
 */
function scanQuoted(src: string, i: number, quote: string): number {
  let j = i + 1;
  while (j < src.length) {
    const c = src[j]!;
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === quote) return j + 1;
    // A single-quoted or double-quoted Lua/JS string cannot span a raw newline. Ending it at the
    // line break keeps one unclosed quote from painting the rest of the file as a string.
    if (c === '\n' && quote !== '`') return j;
    j += 1;
  }
  return src.length;
}

/** `[[ ... ]]` / `[=[ ... ]=]`, Lua's long brackets. Returns -1 when this is not one. */
function longBracketEnd(src: string, i: number): number {
  if (src[i] !== '[') return -1;
  let j = i + 1;
  let eq = 0;
  while (src[j] === '=') {
    eq += 1;
    j += 1;
  }
  if (src[j] !== '[') return -1;
  const close = `]${'='.repeat(eq)}]`;
  const at = src.indexOf(close, j + 1);
  return at === -1 ? src.length : at + close.length;
}

function scanNumber(src: string, i: number): number {
  let j = i;
  if (src[j] === '0' && (src[j + 1] === 'x' || src[j + 1] === 'X')) {
    j += 2;
    while (j < src.length && /[0-9a-fA-F_]/.test(src[j]!)) j += 1;
    return j;
  }
  while (j < src.length && /[0-9_]/.test(src[j]!)) j += 1;
  if (src[j] === '.') {
    j += 1;
    while (j < src.length && /[0-9_]/.test(src[j]!)) j += 1;
  }
  if (src[j] === 'e' || src[j] === 'E') {
    let k = j + 1;
    if (src[k] === '+' || src[k] === '-') k += 1;
    if (k < src.length && isDigit(src[k]!)) {
      j = k;
      while (j < src.length && isDigit(src[j]!)) j += 1;
    }
  }
  return j;
}

/** The next non-space character at or after `i`, for deciding "is this a call?" / "is this a key?". */
function peekNonSpace(src: string, i: number): string {
  let j = i;
  while (j < src.length && (src[j] === ' ' || src[j] === '\t')) j += 1;
  return src[j] ?? '';
}

function tokenizeCurly(src: string, keywords: Set<string>, lua: boolean): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;

    // ---- comments
    if (lua && c === '-' && src[i + 1] === '-') {
      const long = longBracketEnd(src, i + 2);
      if (long !== -1) {
        push(out, 'com', src.slice(i, long));
        i = long;
        continue;
      }
      const nl = src.indexOf('\n', i);
      const end = nl === -1 ? src.length : nl;
      push(out, 'com', src.slice(i, end));
      i = end;
      continue;
    }
    if (!lua && c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      const end = nl === -1 ? src.length : nl;
      push(out, 'com', src.slice(i, end));
      i = end;
      continue;
    }
    if (!lua && c === '/' && src[i + 1] === '*') {
      const at = src.indexOf('*/', i + 2);
      const end = at === -1 ? src.length : at + 2;
      push(out, 'com', src.slice(i, end));
      i = end;
      continue;
    }

    // ---- strings
    if (c === '"' || c === "'" || (!lua && c === '`')) {
      const end = scanQuoted(src, i, c);
      push(out, 'str', src.slice(i, end));
      i = end;
      continue;
    }
    if (lua && c === '[') {
      const end = longBracketEnd(src, i);
      if (end !== -1) {
        push(out, 'str', src.slice(i, end));
        i = end;
        continue;
      }
    }

    // ---- numbers
    if (isDigit(c)) {
      const end = scanNumber(src, i);
      push(out, 'num', src.slice(i, end));
      i = end;
      continue;
    }

    // ---- identifiers
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdent(src[j]!)) j += 1;
      const word = src.slice(i, j);
      if (keywords.has(word)) push(out, 'kw', word);
      else if (peekNonSpace(src, j) === '(') push(out, 'fn', word);
      else push(out, 'plain', word);
      i = j;
      continue;
    }

    push(out, 'plain', c);
    i += 1;
  }
  return out;
}

function tokenizeJson(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '"') {
      const end = scanQuoted(src, i, '"');
      // A string immediately followed by a colon is a KEY, and reading a JSON object is mostly
      // reading its keys — colouring them apart is the single most useful thing here.
      push(out, peekNonSpace(src, end) === ':' ? 'fn' : 'str', src.slice(i, end));
      i = end;
      continue;
    }
    if (isDigit(c) || (c === '-' && isDigit(src[i + 1] ?? ''))) {
      const end = scanNumber(src, c === '-' ? i + 1 : i);
      push(out, 'num', src.slice(i, end));
      i = end;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdent(src[j]!)) j += 1;
      const word = src.slice(i, j);
      push(out, word === 'true' || word === 'false' || word === 'null' ? 'kw' : 'plain', word);
      i = j;
      continue;
    }
    push(out, 'plain', c);
    i += 1;
  }
  return out;
}

/**
 * Split source into coloured tokens.
 *
 * The invariant every caller may rely on, and the one the tests exist for: joining the tokens'
 * text reproduces `src` exactly. 'text' is not a degenerate case of the scanner — it returns the
 * whole source as one plain token, which is the same guarantee stated in its simplest form.
 */
export function tokenize(src: string, language: CodeLanguage): Token[] {
  if (src === '') return [];
  switch (language) {
    case 'luau':
    case 'lua':
      return tokenizeCurly(src, LUA_KEYWORDS, true);
    case 'ts':
    case 'js':
      return tokenizeCurly(src, JS_KEYWORDS, false);
    case 'json':
      return tokenizeJson(src);
    case 'text':
    default:
      return [{ kind: 'plain', text: src }];
  }
}
