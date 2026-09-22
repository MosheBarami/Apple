/**
 * THE VENDORED AI ELEMENTS, RENDERED — NOT READ.
 *
 * Most of this suite's neighbours read source text, which proves a spelling. These render the real
 * components (bundled with esbuild, rendered with react-dom/server) and assert on the markup they
 * produce, so what is checked is what a browser would receive:
 *
 *   * a closed Luau fence in a reply is HIGHLIGHTED — the block this replaced dropped the colours
 *     the moment a fence closed — and a `<script>` in it is text, not a tag;
 *   * the highlighted lines rejoin to the source, byte for byte;
 *   * a fence still streaming has no copy button; a closed one has exactly one, with a name;
 *   * a user turn is a user Message, carries its own direction, and its actions have names;
 *   * the jump control does not exist while the reader is at the live edge, and does once they
 *     have left it, named by the workspace's sentence;
 *   * the lock rule — near the end re-arms, moving up releases, a follow still travelling down
 *     keeps it — behaves as stick-to-bottom.tsx says;
 *   * the welcome sheet keeps its copy and its three seeds;
 *   * rendering produces no React warning (an unknown prop leaking onto a DOM element, a missing
 *     key), because each of those is a real defect that no source check would see.
 *
 * NOT CHECKED HERE: sanitisation. DOMPurify needs a DOM and node has none, so this bundle swaps it
 * for a pass-through, and a reply rendered here is NOT sanitised. That property is held where it
 * lives: lib/markdown.tsx (code-presentation.test.mjs), which MessageResponse renders through.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = await import(pathToFileURL(join(WEB, '..', 'worker', 'node_modules', 'esbuild', 'lib', 'main.js')).href);

const entry = `
  import { createElement as h, Fragment } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { CodeBlock } from './src/components/ws/code-block';
  import { ChatWelcome } from './src/components/ws/chat-welcome';
  import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from './src/components/ai-elements/message';
  import { Conversation, ConversationContent, ConversationScrollButton } from './src/components/ai-elements/conversation';
  import { lockAfterScroll } from './src/components/ai-elements/stick-to-bottom';
  export { h, Fragment, renderToStaticMarkup, CodeBlock, ChatWelcome, Message, MessageAction, MessageActions, MessageContent, MessageResponse, Conversation, ConversationContent, ConversationScrollButton, lockAfterScroll };
`;

const passThroughPurify = {
  name: 'dompurify-without-a-dom',
  setup(build) {
    build.onResolve({ filter: /^dompurify$/ }, () => ({ path: 'dompurify', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export default { addHook() {}, sanitize(html) { return html; } };',
      loader: 'js',
    }));
  },
};

const out = join(mkdtempSync(join(tmpdir(), 'ai-elements-render-')), 'bundle.cjs');
const built = await esbuild.build({
  // Written against the package root (`./src/...`) so scripts/check-deadends.mjs resolves these edges.
  stdin: { contents: entry, resolveDir: WEB, loader: 'tsx', sourcefile: 'entry.tsx' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  plugins: [passThroughPurify],
  outfile: out,
  logLevel: 'silent',
});
assert.deepEqual(built.errors, []);
const ui = createRequire(import.meta.url)(out);
const { h, renderToStaticMarkup } = ui;

/** Render, and fail on any React warning printed while doing it. */
function render(element) {
  const warnings = [];
  const original = console.error;
  console.error = (...args) => warnings.push(args.map(String).join(' '));
  try {
    return renderToStaticMarkup(element);
  } finally {
    console.error = original;
    assert.deepEqual(warnings, [], `React warned while rendering:\n${warnings.join('\n')}`);
  }
}

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
const text = (html) => unescape(html.replace(/<[^>]+>/g, ''));
const count = (html, needle) => html.split(needle).length - 1;

// ---------------------------------------------------------------- code blocks ---

const LUAU = [
  'local label = "<script>alert(1)</script>"',
  '',
  'function greet(name)',
  '\treturn "hi " .. name -- say it',
  'end',
].join('\n');

test('a CLOSED fence is highlighted, and a script inside it is text', () => {
  const html = render(h(ui.CodeBlock, { code: LUAU, lang: 'luau', closed: true }));
  assert.match(html, /class="[^"]*\btok tok--kw\b[^"]*">local</, 'the keyword carries its colour class');
  assert.match(html, /tok--str/, 'the string is highlighted');
  assert.match(html, /tok--com/, 'the comment is highlighted');
  assert.equal(/<script/i.test(html), false, 'a script tag in the code must never become markup');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'it is there, as text');
  assert.match(html, /data-language="luau"/);
  assert.match(html, />Luau</, 'the header names the language');
});

test('the highlighted lines rejoin to the source, byte for byte', () => {
  const html = render(h(ui.CodeBlock, { code: LUAU, lang: 'luau', closed: true }));
  const inner = html.slice(html.indexOf('<code'), html.indexOf('</code>'));
  const lines = inner.split(/<span class="block ai-code-block__line">/).slice(1).map((piece) => {
    const line = text(piece);
    return line === '\n' ? '' : line;
  });
  assert.equal(lines.length, LUAU.split('\n').length, 'one rendered line per source line');
  assert.equal(lines.join('\n'), LUAU);
});

test('a fence still streaming has no copy button; a closed one has exactly one, with a name', () => {
  const open = render(h(ui.CodeBlock, { code: 'local x = 1', lang: 'luau', closed: false }));
  assert.equal(count(open, '<button'), 0, 'half a function must not be copyable');
  assert.match(open, /tok--kw/, 'and it is highlighted while it streams, too');
  const closed = render(h(ui.CodeBlock, { code: 'local x = 1', lang: 'luau', closed: true }));
  assert.equal(count(closed, '<button'), 1);
  assert.match(closed, /<button[^>]*aria-label="Copy code"/);
  assert.match(closed, /<button[^>]*type="button"|<button[^>]*data-slot="button"/);
});

test('an unknown language is shown as plain text, never guessed at', () => {
  const html = render(h(ui.CodeBlock, { code: 'local x = 1', lang: 'klingon', closed: true }));
  assert.equal(/tok--/.test(html), false, 'text is not highlighted as anything');
  assert.match(html, /data-language="text"/);
});

test('a reply routes its fences through the same highlighted block', () => {
  // MessageResponse -> ./streamdown -> lib/markdown.tsx -> splitFences -> this CodeBlock.
  const reply = 'Here it is:\n\n```luau\nlocal a = 1\n```\n';
  const html = render(h(ui.MessageResponse, { className: 'gx-prose', dir: 'auto', children: reply }));
  assert.match(html, /class="[^"]*\bai-message__response\b[^"]*\bgx-prose\b/);
  assert.match(html, /dir="auto"/);
  assert.match(html, /ai-code-block/);
  assert.match(html, /tok--kw/);
});

// ------------------------------------------------------------------- messages ---

test('a user turn is a user Message with its own direction, and its actions have names', () => {
  const html = render(
    h(ui.Message, { from: 'user', role: 'article', className: 'gx-turn gx-turn--user' },
      h(ui.MessageContent, { className: 'gx-user', dir: 'auto' }, 'שלום, build a door'),
      h(ui.MessageActions, { className: 'gx-user__foot' },
        h(ui.MessageAction, { size: 'sm', className: 'gx-user__edit', tooltip: 'Edit this message and run again from here' }, 'Edit'))),
  );
  assert.match(html, /^<div class="[^"]*\bai-message\b[^"]*\bis-user\b/);
  assert.match(html, /role="article"/);
  assert.match(html, /<div class="[^"]*\bgx-user\b[^"]*" dir="auto">שלום, build a door<\/div>/);
  assert.match(html, /<button[^>]*class="[^"]*\bgx-user__edit\b[^"]*"[^>]*>Edit<span class="sr-only">Edit this message and run again from here<\/span><\/button>/);
  assert.equal(/role="tooltip"/.test(html), false, 'a tooltip is not in the page until it is asked for');
});

// --------------------------------------------------------------- conversation ---

const conversation = (props) =>
  h(ui.Conversation, props,
    h(ui.ConversationContent, { className: 'gx-thread', role: 'log', 'aria-relevant': 'additions' }, h('p', null, 'turn')),
    h(ui.ConversationScrollButton, { 'aria-label': '3 new messages — jump to latest', 'data-unseen': '3 new' }));

test('the jump control does not exist while the reader is at the live edge', () => {
  const html = render(conversation({ role: undefined }));
  assert.equal(/<button/.test(html), false);
  assert.equal(count(html, 'role="log"'), 1, 'exactly one log, and it is the content');
});

test('and it does once the reader has left, named by the sentence it is given', () => {
  // `initial={false}` starts the lock released — the state a reader is in after scrolling up.
  const html = render(conversation({ role: undefined, initial: false }));
  assert.equal(count(html, '<button'), 1);
  assert.match(html, /<button[^>]*aria-label="3 new messages — jump to latest"/);
  assert.match(html, /data-unseen="3 new"/);
});

test('the lock: near the end re-arms, moving up releases, a follow still travelling keeps it', () => {
  const at = (scrollTop) => ({ scrollTop, scrollHeight: 2000, clientHeight: 500 });
  assert.equal(ui.lockAfterScroll(false, 0, at(1500)), true, 'at the end: following again');
  assert.equal(ui.lockAfterScroll(false, 1000, at(1460)), true, 'inside the slack counts as the end');
  assert.equal(ui.lockAfterScroll(true, 1500, at(900)), false, 'the reader scrolled up: released');
  assert.equal(ui.lockAfterScroll(true, 600, at(900)), true, 'a smooth follow moving DOWN keeps the lock');
  assert.equal(ui.lockAfterScroll(false, 600, at(900)), false, 'and moving down while released stays released');
});

// -------------------------------------------------------------------- welcome ---

test('the welcome sheet keeps its copy and its seeds, and none of the upstream default text', () => {
  const seeds = [
    { label: 'A portal hub', prompt: 'Build a lobby with a portal.' },
    { label: 'A floating obby', prompt: 'Build a floating obby.' },
    { label: 'A coin simulator', prompt: 'Build a coin simulator.' },
  ];
  const html = render(h(ui.ChatWelcome, { seeds, onSeed: () => {} }));
  assert.match(html, /^<div class="[^"]*\bstart-sheet\b[^"]*" role="region" aria-labelledby="start-title">/);
  assert.match(html, /<h1 id="start-title">What do you want to build\?<\/h1>/);
  assert.equal(count(html, '<button'), seeds.length);
  for (const seed of seeds) assert.match(html, new RegExp(`<span>${seed.label}</span>`));
  assert.equal(/No messages yet|Start a conversation/.test(html), false);
});
