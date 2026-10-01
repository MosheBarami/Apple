import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './ui-bundle.mjs';

const ui = await bundle(`
  import { createElement as h } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  export * from './src/components/ws/evidence/files-code-media-table';
  export * from './src/components/ws/evidence/files-code-media-table-model';
  export { h, renderToStaticMarkup };
`, { name: 'evidence-fcmt', resolveDir: new URL('..', import.meta.url).pathname });
const { h, renderToStaticMarkup } = ui;

function render(el) {
  const warnings = [];
  const original = console.error;
  console.error = (...a) => warnings.push(a.map(String).join(' '));
  try { return renderToStaticMarkup(el); } finally {
    console.error = original;
    assert.deepEqual(warnings, [], warnings.join('\n'));
  }
}

const readScript = {
  path: 'game.ServerScriptService.Spawner', className: 'Script', baseHash: '1a2b3c4d',
  source: 'local x = 1\nprint(x)', complete: true, startLine: 1, endLine: 2, totalLines: 2, nextStartLine: null,
};

test('script block: identity, revision, full source, collapsed', () => {
  const html = render(h(ui.ScriptCodeBlock, { script: ui.scriptOf(readScript) }));
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.match(html, /Spawner/);
  assert.match(html, /revision 1a2b3c4d/);
  assert.match(html, /game\.ServerScriptService\.Spawner/);
  assert.match(html, /print/);
});

test('script without hash says unavailable; a page says which lines', () => {
  const s = ui.scriptOf({ ...readScript, baseHash: undefined, complete: false, startLine: 1, endLine: 2, totalLines: 9 });
  const html = render(h(ui.ScriptCodeBlock, { script: s }));
  assert.match(html, /revision unavailable/);
  assert.match(html, /lines 1-2 of 9/);
});

test('snippet copies a one-line reference only', () => {
  const html = render(h(ui.ReferenceSnippet, { text: 'game.Workspace.Lobby', label: 'Path' }));
  assert.match(html, /value="game\.Workspace\.Lobby"/);
  assert.match(html, /aria-label="Copy reference"/);
  assert.equal(ui.snippetOf('a\nb'), null);
});

test('image labels its origin; composed art is not test evidence', () => {
  const frame = { rgbBase64: 'AAAA', encoding: 'png', source: 'studio_viewport', width: 2, height: 2, view: 'front', subject: 'Lobby', capturedAt: 1 };
  const cap = render(h(ui.EvidenceImage, { image: ui.captureImage(frame) }));
  assert.match(cap, /data-origin="capture"/);
  assert.match(cap, /Studio capture/);
  assert.match(cap, /front view, Lobby/);
  assert.doesNotMatch(cap, /not test evidence/);
  const art = ui.composedImage({ base64: 'BBBB', mediaType: 'image/png', label: 'Icon' });
  assert.equal(art.isTestEvidence, false);
  assert.match(render(h(ui.EvidenceImage, { image: art })), /Composed artwork[\s\S]*not test evidence/);
  assert.match(render(h(ui.EvidenceImage, { image: ui.fetchedImage('attachment', { base64: 'CC', mediaType: 'image/png' }, 'ref.png') })), /Your attachment/);
  assert.match(render(h(ui.EvidenceImage, { image: ui.fetchedImage('library_preview', { base64: 'CC', mediaType: 'image/png' }) })), /Library preview/);
  assert.equal(ui.captureImage({ ...frame, encoding: 'rle24' }), null, 'raw frames are unavailable as <img>');
  assert.equal(ui.fetchedImage('attachment', { base64: 'x', mediaType: 'text/html' }), null);
});

test('table shows real rows, unavailable cells, and counts the cut', () => {
  const t = ui.tableOf({ caption: 'Readiness', columns: ['Check', 'Result'], rows: [['Studio', 'ready'], ['Place', '']] });
  const html = render(h(ui.EvidenceTable, { table: t }));
  assert.match(html, /<caption>Readiness/);
  assert.match(html, /<td>ready<\/td>/);
  assert.match(html, /<td>unavailable<\/td>/);
  const big = ui.tableOf({ columns: ['a'], rows: Array.from({ length: 60 }, (_, i) => [String(i)]) });
  assert.equal(big.rows.length, 50);
  assert.match(render(h(ui.EvidenceTable, { table: big })), /10 more rows not shown/);
});

test('tree folds affected paths with ancestors and marks touched ones', () => {
  const rows = ui.treeOf(ui.pathsOf({ paths: ['game.Workspace.Lobby.Door', 'game.Workspace.Lobby'] }));
  assert.deepEqual(rows.map((r) => [r.name, r.level, r.kind, r.affected]), [
    ['game', 1, 'folder', false], ['Workspace', 2, 'folder', false], ['Lobby', 3, 'folder', true], ['Door', 4, 'file', true],
  ]);
  const html = render(h(ui.AffectedTree, { rows }));
  assert.match(html, /role="tree"/);
  // Property: exactly the touched rows (a folder and a file here) say "changed"; the ancestors that
  // only hold them do not. Proved against the genuine FileTree's markup, where a row's label is its name.
  assert.equal(html.split('(changed)').length - 1, 2);
  assert.match(html, /Lobby \(changed\)/);
  assert.match(html, /Door \(changed\)/);
  assert.doesNotMatch(html, /Workspace \(changed\)/);
  assert.doesNotMatch(html, /game \(changed\)/);
  // Every ancestor is drawn open, so the touched file is in the markup, nested under its folder.
  assert.equal(html.split('role="treeitem"').length - 1, 4);
});

test('every renderer draws nothing for empty or absent input', () => {
  assert.equal(render(h(ui.ScriptCodeBlock, { script: ui.scriptOf({}) })), '');
  assert.equal(render(h(ui.ScriptCodeBlock, { script: ui.scriptOf({ path: 'game.A', source: '' }) })), '');
  assert.equal(render(h(ui.ReferenceSnippet, { text: '' })), '');
  assert.equal(render(h(ui.EvidenceImage, { image: ui.composedImage(null) })), '');
  assert.equal(render(h(ui.EvidenceTable, { table: ui.tableOf({ columns: ['a'], rows: [] }) })), '');
  assert.equal(render(h(ui.AffectedTree, { rows: ui.treeOf([]) })), '');
  assert.equal(ui.treeOf(['not a path!', 5]), null);
});
