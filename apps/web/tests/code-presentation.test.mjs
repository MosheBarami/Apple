/**
 * CODE IN A REPLY: highlighted, and copyable.
 *
 * Neither existed. `generative-ui/schema.ts` has declared CODE_LANGUAGES since the registry was
 * written and nothing tokenised any of them; `.markdown pre code` was plain monospace; and
 * `navigator.clipboard` appeared in exactly two places in the app, neither of them a code block.
 * The single most common thing anyone does with generated Luau — select it, copy it into Studio —
 * was the one thing the transcript did not help with.
 *
 * THE PROPERTY THIS SUITE EXISTS FOR, and it is not "the keywords are orange":
 *
 *     joining the tokens reproduces the source, byte for byte.
 *
 * A highlighter is a lens, not an editor. A scanner that loses a character, or emits one twice, is
 * showing the user code that is not the code they would run — and it fails SILENTLY, because a
 * missing brace in a coloured block looks like a missing brace in the model's output. That is a
 * worse failure than no highlighting at all, so it is asserted over every language, on inputs
 * chosen to break a scanner: unterminated strings, unterminated comments, long brackets, and the
 * half-written tail of a streaming reply.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normaliseLanguage, tokenize } from '../src/lib/highlight.ts';
import { splitFences } from '../src/lib/code-fences.ts';
import { CODE_LANGUAGES } from '../src/lib/generative-ui/schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const BLOCK = readFileSync(join(WEB, 'src', 'components', 'ws', 'code-block.tsx'), 'utf8');
// The reply's code block is AI Elements' CodeBlock, adapted (components/ai-elements/code-block.tsx).
// The rendering properties below are asserted against that owner; BLOCK is the reply's wiring.
const AI_BLOCK = readFileSync(join(WEB, 'src', 'components', 'ai-elements', 'code-block.tsx'), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const MARKDOWN = readFileSync(join(WEB, 'src', 'lib', 'markdown.tsx'), 'utf8');
const CSS = readFileSync(join(WEB, 'src', 'design', 'system.css'), 'utf8');

const joined = (src, lang) => tokenize(src, lang).map((t) => t.text).join('');
const kinds = (src, lang) => tokenize(src, lang).map((t) => t.kind);

/** Inputs chosen to break a scanner, not to look good in a screenshot. */
const SAMPLES = [
  '',
  'x',
  '\n\n\n',
  'local x = 1 -- a comment\n',
  'local s = "unterminated\nlocal y = 2',
  "local s = 'a\\'b'",
  'local long = [[a ]] b]]\nprint(long)',
  'local long = [==[ unterminated',
  '--[[ block\ncomment ]] local z = 3',
  '-- trailing comment with no newline',
  'const a = `template ${b} still a string`;',
  '/* unterminated block comment',
  'const n = 0xFF + 1.5e-3 + 1_000;',
  'function f(a, b) { return a /* inline */ + b; }',
  '{"key": "value", "n": -1.5, "ok": true, "z": null}',
  '{"unterminated": "stri',
  'if x then\n\tprint("hi")\nend\n',
  '   \t  ',
  'a"b\'c`d[[e',
];

// ---------------------------------------------------------- the whole point ---

test('the tokens reproduce the source exactly, in every language, on every sample', () => {
  for (const lang of CODE_LANGUAGES) {
    for (const src of SAMPLES) {
      assert.equal(joined(src, lang), src, `${lang} mangled ${JSON.stringify(src)}`);
    }
  }
});

test('and on a body large enough that an off-by-one would show', () => {
  const big = Array.from({ length: 400 }, (_, i) => `local v${i} = "s${i}" -- note ${i}`).join('\n');
  for (const lang of CODE_LANGUAGES) assert.equal(joined(big, lang), big, lang);
});

test('no token is empty, and every token has a kind the stylesheet knows', () => {
  // An empty token is a span that renders nothing and costs a DOM node; an unknown kind is a class
  // with no rule behind it, which renders as unstyled text and looks like the highlighter failed.
  const styled = new Set(['plain', ...[...CSS.matchAll(/\.tok--([a-z]+)\s*\{/g)].map((m) => m[1])]);
  for (const lang of CODE_LANGUAGES) {
    for (const src of SAMPLES) {
      for (const t of tokenize(src, lang)) {
        assert.notEqual(t.text, '', `${lang} emitted an empty token`);
        assert.ok(styled.has(t.kind), `${lang} emitted kind "${t.kind}" with no .tok--${t.kind} rule`);
      }
    }
  }
});

test('an empty source produces no tokens at all', () => {
  for (const lang of CODE_LANGUAGES) assert.deepEqual(tokenize('', lang), []);
});

// ------------------------------------------------------------- what it marks ---

test('Luau keywords are keywords and the rest is not', () => {
  const t = tokenize('local x = 1', 'luau');
  assert.equal(t[0].kind, 'kw');
  assert.equal(t[0].text, 'local');
  assert.equal(kinds('local x = 1', 'luau').includes('num'), true);
});

test('a comment is a comment to the end of its line, and not past it', () => {
  const t = tokenize('-- note\nlocal x', 'luau');
  const com = t.find((x) => x.kind === 'com');
  assert.equal(com.text, '-- note');
  assert.equal(t.some((x) => x.kind === 'kw' && x.text === 'local'), true, 'the next line is still code');
});

test('an unterminated quote does not paint the rest of the file as a string', () => {
  // The failure this prevents: one stray quote in a long script turning every line after it the
  // colour of a string, which reads as "the model wrote nonsense" when the model did not.
  const src = 'local s = "oops\nlocal t = 2\nlocal u = 3';
  const t = tokenize(src, 'luau');
  assert.equal(t.filter((x) => x.kind === 'kw' && x.text === 'local').length, 3);
});

test('a template literal may span lines, because in JavaScript it does', () => {
  const src = 'const a = `one\ntwo`;\nconst b = 1;';
  const t = tokenize(src, 'js');
  const str = t.find((x) => x.kind === 'str');
  assert.equal(str.text, '`one\ntwo`');
});

test('a JSON key reads differently from a JSON value', () => {
  const t = tokenize('{"k": "v"}', 'json');
  const strings = t.filter((x) => x.kind === 'fn' || x.kind === 'str');
  assert.equal(strings[0].kind, 'fn', 'the key');
  assert.equal(strings[1].kind, 'str', 'the value');
});

test('JSON literals are keywords; bare words are not', () => {
  assert.ok(tokenize('true', 'json').some((t) => t.kind === 'kw'));
  assert.ok(tokenize('null', 'json').some((t) => t.kind === 'kw'));
  assert.equal(tokenize('maybe', 'json').every((t) => t.kind !== 'kw'), true);
});

test('plain text is never coloured', () => {
  // 'text' is the answer for anything unrecognised, and it must not be a scanner with a smaller
  // keyword list — a false keyword in someone's prose asserts a structure that is not there.
  const src = 'local function return -- "quoted"';
  assert.deepEqual(tokenize(src, 'text'), [{ kind: 'plain', text: src }]);
});

test('an unknown fence language is text, never a guess', () => {
  assert.equal(normaliseLanguage('rust'), 'text');
  assert.equal(normaliseLanguage('python'), 'text');
  assert.equal(normaliseLanguage(undefined), 'text');
  assert.equal(normaliseLanguage(''), 'text');
});

test('the aliases the model actually writes resolve to a real language', () => {
  assert.equal(normaliseLanguage('Luau'), 'luau');
  assert.equal(normaliseLanguage('  TypeScript '), 'ts');
  assert.equal(normaliseLanguage('jsx'), 'js');
  assert.equal(normaliseLanguage('rbxlua'), 'luau');
});

test('every declared language resolves to itself', () => {
  for (const l of CODE_LANGUAGES) assert.equal(normaliseLanguage(l), l);
});

// ------------------------------------------------------------ fence splitting ---

test('prose with no fence is one text segment', () => {
  assert.deepEqual(splitFences('just words'), [{ kind: 'text', value: 'just words' }]);
});

test('a fenced block becomes a code segment with its language', () => {
  const segs = splitFences('before\n```luau\nprint(1)\n```\nafter');
  assert.deepEqual(segs.map((s) => s.kind), ['text', 'code', 'text']);
  assert.equal(segs[1].lang, 'luau');
  assert.equal(segs[1].value, 'print(1)');
  assert.equal(segs[1].closed, true);
});

test('AN UNCLOSED FENCE IS STILL CODE — this is most of a streaming reply', () => {
  // Treating it as prose makes the block flash as unformatted text and reflow when the fence
  // closes; refusing to terminate would drop everything written so far.
  const segs = splitFences('here:\n```luau\nprint(1)\nprint(2)');
  assert.equal(segs[1].kind, 'code');
  assert.equal(segs[1].closed, false);
  assert.equal(segs[1].value, 'print(1)\nprint(2)');
});

test('a longer fence can contain a shorter one', () => {
  const segs = splitFences('````\n```\nnested\n```\n````');
  assert.equal(segs.length, 1);
  assert.equal(segs[0].value, '```\nnested\n```');
});

test('a tilde fence is not closed by a backtick fence', () => {
  const segs = splitFences('~~~\na\n```\nb\n~~~');
  assert.equal(segs[0].kind, 'code');
  assert.equal(segs[0].value, 'a\n```\nb');
});

test('an empty fence is kept rather than silently dropped', () => {
  // The model emitted it. Hiding it would misreport what the reply said.
  const segs = splitFences('```\n```');
  assert.equal(segs.length, 1);
  assert.equal(segs[0].kind, 'code');
  assert.equal(segs[0].value, '');
});

test('empty prose around a block does not become empty segments', () => {
  const segs = splitFences('```js\nx\n```');
  assert.deepEqual(segs.map((s) => s.kind), ['code']);
});

test('two blocks in one reply stay two blocks', () => {
  const segs = splitFences('```js\na\n```\nmid\n```json\n{}\n```');
  assert.deepEqual(segs.map((s) => s.kind), ['code', 'text', 'code']);
  assert.equal(segs[2].lang, 'json');
});

test('splitting loses nothing: every line of the source is in some segment', () => {
  // The counterpart of the tokenizer's invariant, at the layer above it.
  const src = 'a\n```luau\nlocal x = 1\n```\nb\n~~~\nplain\n~~~\nc';
  const seen = splitFences(src)
    .map((s) => s.value)
    .join('\n');
  for (const line of src.split('\n')) {
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) continue; // fence lines are structure, not content
    assert.ok(seen.includes(line), `lost: ${JSON.stringify(line)}`);
  }
});

// --------------------------------------------------------------- the rendering ---

test('code is rendered as React children, never as an HTML string', () => {
  // The safety argument, and the reason there is no escaping step to get wrong: a `<script>` in a
  // code block is text by construction. An HTML-string highlighter would have had to escape it
  // inside the one pipeline that exists because this text is untrusted.
  //
  // RESTATED, not relaxed: the tokens are now rendered by AI Elements' CodeBlock, so the property
  // is asserted there — each token's text is a React child of its span — and on the reply's
  // wiring, which must hand the code to that block rather than render any of it itself.
  // ai-elements-render.test.mjs renders it and checks the markup a `<script>` fence produces.
  for (const [name, src] of [['ws/code-block.tsx', BLOCK], ['ai-elements/code-block.tsx', AI_BLOCK]]) {
    assert.equal(/dangerouslySetInnerHTML/.test(stripComments(src)), false, `${name} must not set innerHTML`);
  }
  assert.match(AI_BLOCK, /keyedLine\.tokens\.map\(/, 'the lines are rendered token by token');
  assert.match(AI_BLOCK, /\{token\.content\}/, "each token's text is a React child");
  assert.match(AI_BLOCK, /import \{ codeToTokens \} from "\.\/highlight-compat"/, 'the tokens come from the local highlighter, not shiki');
  const COMPAT = readFileSync(join(WEB, 'src', 'components', 'ai-elements', 'highlight-compat.ts'), 'utf8');
  assert.match(COMPAT, /tokenize\(code, normaliseLanguage\(language\)\)/, 'the local highlighter is lib/highlight.ts');
  assert.match(stripComments(BLOCK), /<AICodeBlock[^>]*code=\{code\}/, 'the reply passes its code to the AI Elements block');
});

test('prose keeps the sanitiser it always had', () => {
  assert.match(MARKDOWN, /DOMPurify\.sanitize/);
  assert.match(MARKDOWN, /ALLOWED_URI_REGEXP: \/\^\(\?:https\?\|mailto\):\/i/);
});

test('the markdown component routes fences to the code block and the rest to prose', () => {
  assert.match(MARKDOWN, /splitFences\(source\)/);
  assert.match(MARKDOWN, /<CodeBlock key=\{i\} code=\{seg\.value\} lang=\{seg\.lang\} closed=\{seg\.closed\} \/>/);
});

test('there is a copy control, and it copies the code rather than the rendered text', () => {
  // RESTATED against AI Elements' CodeBlockCopyButton: it copies `code` from the block's context,
  // and the block puts its own `code` prop there — the source, not the rendered text.
  assert.match(stripComments(BLOCK), /<CodeBlockCopyButton\b/);
  assert.match(AI_BLOCK, /const \{ code \} = useContext\(CodeBlockContext\)/);
  assert.match(AI_BLOCK, /await navigator\.clipboard\.writeText\(code\)/);
  assert.match(AI_BLOCK, /const contextValue = useMemo\(\(\) => \(\{ code \}\), \[code\]\)/);
});

test('NO COPY CONTROL ON A FENCE THAT HAS NOT CLOSED', () => {
  // Copying a half-written function puts half a function on the clipboard, and the user finds out
  // in Studio. A control that is present and gives the wrong answer is worse than one that is a
  // second late. (ai-elements-render.test.mjs renders both cases and counts the buttons.)
  const code = stripComments(BLOCK);
  const guard = code.indexOf('{closed && (');
  const copy = code.indexOf('<CodeBlockCopyButton');
  assert.ok(guard !== -1 && copy > guard, 'the copy button must sit inside the closed guard');
  assert.equal(code.split('<CodeBlockCopyButton').length - 1, 1, 'exactly one copy button, and it is the guarded one');
});

test('a refused clipboard shows no tick', () => {
  // The only promise this can keep: no confirmation for a copy that did not happen. The tick is
  // set only AFTER the clipboard write resolved, inside the try; the catch reports and sets nothing.
  const fn = AI_BLOCK.slice(AI_BLOCK.indexOf('const copyToClipboard = useCallback('), AI_BLOCK.indexOf('const Icon = isCopied'));
  assert.ok(fn.length > 0, 'the copy handler was not found — this test checks nothing');
  const write = fn.indexOf('await navigator.clipboard.writeText(code)');
  const tick = fn.indexOf('setIsCopied(true)');
  assert.ok(write !== -1 && tick > write, 'the tick must come after the write resolved');
  const failure = fn.slice(fn.indexOf('} catch'));
  assert.match(failure, /onError\?\.\(/);
  assert.equal(/setIsCopied\(true\)/.test(failure), false, 'a failed write must not show a tick');
});

test('the copied tick clears itself, and clears on unmount too', () => {
  // An edit-and-resend can replace the turn mid-timeout, and a setState on an unmounted component
  // is a warning in the console the team reads for real problems.
  assert.match(AI_BLOCK, /window\.setTimeout\(\s*\(\) => setIsCopied\(false\),\s*timeout\s*\)/);
  assert.match(AI_BLOCK, /useEffect\(\s*\(\) => \(\) => \{\s*window\.clearTimeout\(timeoutRef\.current\);\s*\}/);
});

test('the reply block is the AI Elements CodeBlock, and a closed fence keeps its highlighting', () => {
  // The block this replaced sent a CLOSED fence to a copy-only component that drew plain lines, so
  // a script lost its colours the moment its closing fence arrived. One block now serves both.
  assert.match(BLOCK, /from '\.\.\/ai-elements\/code-block'/);
  const code = stripComments(BLOCK);
  assert.equal(/if \(closed\)/.test(code), false, 'closed and streaming fences render the same block');
  assert.equal(code.split('<AICodeBlock').length - 1, 1, 'one block for both states');
  assert.match(AI_BLOCK, /`tok tok--\$\{token\.kind\}`/, 'each highlighted token carries its colour class');
});

test('every token kind the renderer can emit has a colour in BOTH themes', () => {
  // A colour declared only in the dark block paints light-theme code with an inherited ink, which
  // silently removes the highlighting for half the users rather than failing.
  const used = new Set();
  for (const lang of CODE_LANGUAGES) for (const src of SAMPLES) for (const t of tokenize(src, lang)) used.add(t.kind);
  used.delete('plain');
  for (const kind of used) {
    const rule = new RegExp(`\\.tok--${kind}\\s*\\{[^}]*color:\\s*var\\((--[a-z0-9-]+)\\)`, 'i');
    const m = rule.exec(CSS);
    assert.ok(m, `.tok--${kind} has no colour`);
    const declarations = [...CSS.matchAll(new RegExp(`${m[1]}:\\s*[^;]+;`, 'g'))];
    assert.ok(declarations.length >= 2, `${m[1]} is declared ${declarations.length} time(s) — both themes need it`);
  }
});
