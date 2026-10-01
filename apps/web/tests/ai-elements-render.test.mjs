/**
 * THE AI ELEMENTS, RENDERED — NOT READ.
 *
 * Most of this suite's neighbours read source text, which proves a spelling. These render the real
 * components (bundled with esbuild, rendered with react-dom/server) and assert on the markup they
 * produce, so what is checked is what a browser would receive.
 *
 * RESTATED 2026-10-01, when the home-made AI Elements were replaced by the genuine upstream ones.
 * The properties are the same; what proves them moved:
 *
 *   * a fenced block (ws/code-block.tsx, upstream CodeBlock) names its language, a `<script>` in it
 *     is text, its lines rejoin to the source, and only a CLOSED fence has a copy control. Colour is
 *     shiki's and arrives after mount, so it is proved where shiki is called (code-presentation);
 *   * a REPLY (MessageResponse, upstream Streamdown) draws its fences as code blocks and is
 *     SANITISED: Streamdown's own hardening runs here in node, so a script, an event handler or a
 *     `javascript:` link is proved never to become markup — the pass-through DOMPurify stub this
 *     bundle uses for lib/markdown.tsx is not on that path at all;
 *   * a user turn is a user Message, carries its own direction, and its actions have names;
 *   * the jump control does not exist while the reader is at the live edge, and does once they
 *     have left it, named by the workspace's sentence (use-stick-to-bottom, which upstream's
 *     Conversation is built on, keeps the lock now — the home-made lockAfterScroll is gone);
 *   * the welcome sheet keeps its copy and its three seeds;
 *   * rendering produces no React warning (an unknown prop leaking onto a DOM element, a missing
 *     key), because each of those is a real defect that no source check would see.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEB, bundle, renderWith, text, count } from './ui-bundle.mjs';

const ui = await bundle(`
  import { createElement as h, Fragment } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { CodeBlock } from './src/components/ws/code-block';
  import { ChatWelcome } from './src/components/ws/chat-welcome';
  import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from './src/components/ai-elements/message';
  import { Conversation, ConversationContent, ConversationScrollButton } from './src/components/ai-elements/conversation';
  export { h, Fragment, renderToStaticMarkup, CodeBlock, ChatWelcome, Message, MessageAction, MessageActions, MessageContent, MessageResponse, Conversation, ConversationContent, ConversationScrollButton };
`, { name: 'ai-elements-render', resolveDir: WEB });
const { h } = ui;
const render = (element) => renderWith(ui.renderToStaticMarkup, element);

// ---------------------------------------------------------------- code blocks ---

const LUAU = [
  'local label = "<script>alert(1)</script>"',
  '',
  'function greet(name)',
  '\treturn "hi " .. name -- say it',
  'end',
].join('\n');

test('a CLOSED fence names its language, and a script inside it is text', () => {
  const html = render(h(ui.CodeBlock, { code: LUAU, lang: 'luau', closed: true }));
  assert.equal(/<script/i.test(html), false, 'a script tag in the code must never become markup');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'it is there, as text');
  assert.match(html, /data-language="luau"/);
  assert.match(html, />Luau</, 'the header names the language');
});

test('the rendered lines rejoin to the source, byte for byte', () => {
  const html = render(h(ui.CodeBlock, { code: LUAU, lang: 'luau', closed: true }));
  const inner = html.slice(html.indexOf('<code'), html.indexOf('</code>'));
  // An empty line is drawn as a newline so it keeps its height; it is still the empty line.
  const lines = inner.split(/<span class="block">/).slice(1).map((piece) => (text(piece) === '\n' ? '' : text(piece)));
  assert.equal(lines.length, LUAU.split('\n').length, 'one rendered line per source line');
  assert.equal(lines.join('\n'), LUAU);
});

test('a fence still streaming has no copy button; a closed one has exactly one, with a name', () => {
  const open = render(h(ui.CodeBlock, { code: 'local x = 1', lang: 'luau', closed: false }));
  assert.equal(count(open, '<button'), 0, 'half a function must not be copyable');
  assert.match(open, /data-writing=""/, 'and it says it is still being written');
  const closed = render(h(ui.CodeBlock, { code: 'local x = 1', lang: 'luau', closed: true }));
  assert.equal(count(closed, '<button'), 1);
  assert.match(closed, /<button[^>]*aria-label="Copy code"/);
  assert.match(closed, /<button[^>]*data-slot="button"/, 'the shadcn Button upstream CodeBlockCopyButton is built from');
});

test('an unknown language is shown as plain text, never guessed at', () => {
  const html = render(h(ui.CodeBlock, { code: 'local x = 1', lang: 'klingon', closed: true }));
  assert.match(html, /data-language="text"/);
});

test('a reply draws its fences as code blocks in their language', () => {
  const reply = 'Here it is:\n\n```luau\nlocal a = 1\n```\n';
  const html = render(h(ui.MessageResponse, { dir: 'auto', children: reply }));
  assert.match(html, /data-streamdown="code-block"[^>]*|data-language="luau"[^>]*data-streamdown="code-block"/);
  assert.match(html, /data-language="luau"/);
  assert.match(text(html), /local a = 1/);
  assert.match(html, /aria-label="Copy Code"/, 'a closed fence in a settled reply can be copied');
});

test('a reply is sanitised: no script, no event handler, no javascript: link ever becomes markup', () => {
  const evil = [
    'Hello <script>alert(1)</script>',
    '<img src="https://example.com/x.png" onerror="alert(2)">',
    '<a href="javascript:alert(3)">click</a> and [docs](javascript:alert(4))',
    '<iframe src="https://evil.example"></iframe>',
  ].join('\n\n');
  const html = render(h(ui.MessageResponse, { children: evil }));
  assert.equal(/<script/i.test(html), false, 'a script tag rendered');
  assert.equal(/\son\w+=/i.test(html), false, 'an event handler attribute rendered');
  assert.equal(/href="javascript:/i.test(html), false, 'a javascript: link rendered');
  assert.equal(/<iframe/i.test(html), false, 'an iframe rendered');
  assert.match(text(html), /Hello/, 'the words around them survive');
});

// ------------------------------------------------------------------- messages ---

test('a user turn is a user Message with its own direction, and its actions have names', () => {
  const html = render(
    h(ui.Message, { from: 'user', role: 'article' },
      h(ui.MessageContent, { dir: 'auto' }, 'שלום, build a door'),
      h(ui.MessageActions, null,
        h(ui.MessageAction, { tooltip: 'Copy this message', label: 'Copy' }, h('svg', { 'aria-hidden': 'true' })))),
  );
  assert.match(html, /^<div class="[^"]*\bis-user\b[^"]*" role="article">/, 'upstream marks the user turn is-user');
  assert.match(html, /<div class="[^"]*\bgroup-\[\.is-user\]:bg-secondary\b[^"]*" dir="auto">שלום, build a door<\/div>/);
  assert.match(html, /<button[^>]*>.*<span class="sr-only">Copy<\/span><\/button>/, 'an icon action is named by its label');
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

// F-005, 2026-09-23: the accessibility tree listed the three seeds as bare `button` — the label
// sits in a nested span beside an aria-hidden icon, and the tree the owner's browser tooling reads
// named none of them. Each seed now carries its label as its own name.
test('every welcome seed is a button named by its label', () => {
  const seeds = [
    { label: 'A portal hub', prompt: 'Build a lobby with a portal.' },
    { label: 'A floating obby', prompt: 'Build a floating obby.' },
  ];
  const html = render(h(ui.ChatWelcome, { seeds, onSeed: () => {} }));
  const buttons = html.match(/<button\b[^>]*>/g) ?? [];
  assert.equal(buttons.length, seeds.length, 'the seeds were not found — this checks nothing');
  seeds.forEach((seed, i) => assert.match(buttons[i], new RegExp(`aria-label="${seed.label}"`), `seed ${i} has no name`));
});
