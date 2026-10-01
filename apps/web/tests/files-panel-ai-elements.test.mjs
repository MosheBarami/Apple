/**
 * THE FILES PANEL'S TREE IS THE GENUINE AI ELEMENTS FILE TREE.
 *
 * Rendered from the real panel source with a seeded query (tests/ui-bundle.mjs), so what is asserted
 * is the markup a browser would receive, not the spelling of the JSX. Properties held:
 *   - the project's files are one ARIA tree with an accessible name, rooted in upstream's FileTree
 *   - a folder is a collapsed treeitem with an expander, and does not show its children while closed
 *   - a file row says its size, and a size that was never recorded (-1) says so instead of "0 B"
 *   - no hand-made tree class from the replaced implementation remains in the markup
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './ui-bundle.mjs';

const ui = await bundle(`
  import { createElement as h } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { MemoryRouter } from 'react-router-dom';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { FilesPanel } from './src/components/ws/files-panel';
  export function render(data, canEdit) {
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    qc.setQueryData(['project-files', 'p1'], data);
    return renderToStaticMarkup(h(MemoryRouter, null, h(QueryClientProvider, { client: qc }, h(FilesPanel, { projectId: 'p1', canEdit }))));
  }
`, { name: 'files-panel-ae', resolveDir: new URL('..', import.meta.url).pathname });

const listing = {
  files: [
    { path: 'notes/a.md', bytes: 10, updatedAt: 1 },
    { path: 'plan.md', bytes: -1, updatedAt: 0 },
    { path: 'top.txt', bytes: 3, updatedAt: 5 },
  ],
  fileCount: 3,
  trash: [],
  limits: { maxFileBytes: 1000, maxVersions: 5, trashDays: 30, extensions: ['.md', '.txt'] },
  trashRetentionDays: 30,
};

test('the files are one labelled tree: a collapsed folder with an expander, then the files', () => {
  const html = ui.render(listing, true);
  assert.match(html, /role="tree"[^>]*aria-label="Project files"|aria-label="Project files"[^>]*role="tree"/);
  const items = html.split('role="treeitem"').length - 1;
  assert.equal(items, 3, 'one folder and two files at the top level');
  assert.match(html, /aria-expanded="false"/, 'the folder has an expander and starts closed');
  assert.match(html, /<span class="truncate">notes<\/span>/);
  assert.doesNotMatch(html, /a\.md/, 'a closed folder does not draw its children');
});

test('a file row states its size; a size that was never recorded does not read as 0 B', () => {
  const html = ui.render(listing, false);
  assert.match(html, /<span class="truncate">top\.txt<\/span>[\s\S]*?3 B/);
  assert.match(html, /<span class="truncate">plan\.md<\/span>[\s\S]*?size not recorded/);
  assert.doesNotMatch(html, /plan\.md[\s\S]{0,400}0 B/);
});

test('none of the replaced implementation\'s tree markup is left', () => {
  const html = ui.render(listing, true);
  assert.doesNotMatch(html, /ai-tree|ai-file-tree/);
});
