/**
 * SOURCES UNDER A REPLY COME FROM THE REPLY'S OWN SEARCHES, OR THEY DO NOT APPEAR.
 *
 * lib/doc-sources.ts reads the documentation pages out of `search_docs` results the worker already
 * sends (`tool_end.detail`), and turn.tsx renders them with AI Elements' Sources. Three halves:
 *
 *   * the reader accepts only a real, safe page — https, no credentials, a bounded title — and
 *     never the excerpt;
 *   * the worker really sends that shape, read from its source, so the reader is not parsing a
 *     payload nobody produces;
 *   * the rendered turn shows exactly those pages, and a turn with no search shows no Sources at
 *     all — nothing is ever invented to fill the slot.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WEB, bundle, count, decomment, element, renderWith, text } from './ui-bundle.mjs';

const SRC = join(WEB, 'src');
const { docSourcesFromTools, DOC_SEARCH_TOOL } = await import(pathToFileURL(join(SRC, 'lib/doc-sources.ts')).href);

const hit = (over = {}) => ({ citation: 1, title: 'TweenService', url: 'https://create.roblox.com/docs/reference/engine/classes/TweenService', excerpt: 'EXCERPT_CANARY', ...over });
const search = (detail, over = {}) => ({ toolId: 's1', tool: DOC_SEARCH_TOOL, summary: '✓ search_docs', ok: true, startedAt: 0, done: true, detail, ...over });

// -------------------------------------------------------------------- reader ---

test('a successful search yields its pages, title and url and host only', () => {
  const out = docSourcesFromTools([search([hit(), hit({ title: '  Tweens  ', url: 'https://create.roblox.com/docs/ui/animation' })])]);
  assert.deepEqual(out, [
    { url: 'https://create.roblox.com/docs/reference/engine/classes/TweenService', title: 'TweenService', host: 'create.roblox.com' },
    { url: 'https://create.roblox.com/docs/ui/animation', title: 'Tweens', host: 'create.roblox.com' },
  ]);
  assert.equal(JSON.stringify(out).includes('EXCERPT_CANARY'), false, 'the excerpt is the model\'s context, not a source');
});

test('only a safe link survives', () => {
  const bad = [
    hit({ url: 'javascript:alert(1)' }),
    hit({ url: 'http://create.roblox.com/docs/x' }),
    hit({ url: 'https://user:pass@create.roblox.com/docs/x' }),
    hit({ url: 'not a url' }),
    hit({ url: 42 }),
    hit({ title: '   ' }),
    hit({ title: 'x'.repeat(201) }),
    hit({ title: undefined }),
    null,
    'https://create.roblox.com/docs/string',
    [hit()],
  ];
  assert.deepEqual(docSourcesFromTools([search(bad)]), []);
});

test('nothing that is not a successful search_docs array becomes a source', () => {
  assert.deepEqual(docSourcesFromTools([search([hit()], { ok: false })]), [], 'a failed search');
  assert.deepEqual(docSourcesFromTools([search([hit()], { ok: undefined })]), [], 'a search that never reported');
  assert.deepEqual(docSourcesFromTools([search({ results: [], searched: true, note: 'nothing matched' })]), [], 'the worker\'s "found nothing" shape');
  assert.deepEqual(docSourcesFromTools([search([hit()], { tool: 'web_fetch' })]), [], 'another tool\'s urls are not documentation sources');
  assert.deepEqual(docSourcesFromTools([]), []);
});

test('a page returned twice is listed once, and the list is bounded', () => {
  const many = Array.from({ length: 14 }, (_, i) => hit({ url: `https://create.roblox.com/docs/p${i}` }));
  assert.equal(docSourcesFromTools([search([hit(), hit()]), search([hit()], { toolId: 's2' })]).length, 1);
  assert.equal(docSourcesFromTools([search(many)]).length, 10);
});

// ---------------------------------------------------------- worker contract ---

test('the worker\'s search_docs sends exactly the fields the reader takes', () => {
  // Read from the worker's own source: a reader for a payload nobody produces would render nothing
  // forever and look like a quiet feature.
  const tools = decomment(readFileSync(join(WEB, '..', 'worker', 'src', 'tools.ts'), 'utf8'));
  const start = tools.indexOf(`  ${DOC_SEARCH_TOOL}: {`);
  assert.ok(start > 0, `the worker has no ${DOC_SEARCH_TOOL} tool`);
  const body = tools.slice(start, tools.indexOf('\n  },\n', start));
  assert.match(body, new RegExp(`name: '${DOC_SEARCH_TOOL}'`));
  assert.match(body, /hits\.map\(\(h\) => \(\{[^;]*\btitle: h\.title\b[^;]*\burl: h\.url\b/,
    'search_docs no longer returns { title, url } per hit — lib/doc-sources.ts must follow it');
  assert.match(body, /return \{ results: \[\]/, 'the no-results shape is an object, which the reader relies on to show nothing');
  // And the array reaches the browser: detailForUi forwards any non-error object, arrays included.
  const forward = tools.slice(tools.indexOf('function detailForUi'), tools.indexOf('export async function runTool'));
  assert.match(forward, /typeof result !== 'object' \|\| result === null/);
  assert.doesNotMatch(forward, /Array\.isArray/, 'the worker began filtering arrays out of tool_end.detail');
});

// ---------------------------------------------------------------- rendering ---

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { Turn } from './src/components/ws/turn';
`, { name: 'doc-sources', resolveDir: WEB });
const renderTurn = (tools) => renderWith(ui.renderToStaticMarkup, ui.h(ui.Turn, {
  item: { id: 'a1', role: 'assistant', content: 'Use TweenService.', tools, streaming: false, stopReason: 'done', createdAt: 1_700_000_000_000 },
  status: null,
  isLast: false,
}));

test('a reply that searched shows those pages under it as AI Elements Sources', () => {
  const html = renderTurn([search([hit(), hit({ title: 'Tweens', url: 'https://create.roblox.com/docs/ui/animation' }), hit({ url: 'javascript:alert(1)' })])]);
  const sources = element(html, /<div[^>]*class="[^"]*\bai-sources\b/);
  assert.ok(sources, 'no Sources under the reply');
  assert.match(text(sources), /^2 documentation pages/, 'the count is what the search returned, and says nothing about "used"');
  const links = [...sources.matchAll(/<a[^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  assert.deepEqual(links, ['https://create.roblox.com/docs/reference/engine/classes/TweenService', 'https://create.roblox.com/docs/ui/animation']);
  assert.equal(count(sources, 'rel="noreferrer"'), 2);
  assert.equal(html.includes('EXCERPT_CANARY') || html.includes('javascript:'), false);
});

test('a reply that did not search has no Sources at all', () => {
  const html = renderTurn([{ toolId: 't1', tool: 'edit_script', summary: 'Wrote a script', ok: true, startedAt: 0, done: true, detail: [hit()] }]);
  assert.doesNotMatch(html, /ai-sources/, 'sources were drawn from something that was not a documentation search');
});
