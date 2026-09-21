/**
 * Navigation remains explicit in two places: the roadmap has an announced
 * application breadcrumb, while project-level actions live behind the native
 * Project details menu in the workspace header. The old one-hop back control
 * and its deleted roadmap stylesheet are not part of either contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

const ROADMAP = read('routes', 'roadmap.tsx');
const WS = read('routes', 'workspace.tsx');
const FILES = read('components', 'ws', 'files-panel.tsx');
const CSS = read('design', 'system.css');

function trail(src) {
  const match = /<nav aria-label="Breadcrumb"[\s\S]*?<\/nav>/.exec(src);
  assert.ok(match, 'no announced breadcrumb trail');
  return match[0];
}

function projectMenu(src) {
  const match = /<details className="studio-project-menu">[\s\S]*?<\/details>/.exec(src);
  assert.ok(match, 'the workspace has no Project details menu');
  return match[0];
}

test('the roadmap says where it is, all the way up to the project list', () => {
  const nav = trail(ROADMAP);
  assert.match(nav, /to="\/"/);
  assert.match(nav, /to=\{[^}]*projectId[^}]*\}/);
  assert.match(nav, /Roadmap/);
});

test('the current roadmap crumb is announced and is not a dead self-link', () => {
  const nav = trail(ROADMAP);
  assert.match(nav, /aria-current="page"/);
  assert.ok(/<span[^>]*aria-current="page"[^>]*>/.test(nav), 'the current crumb must be plain text');
});

test('the old one-hop back control and stylesheet are gone', () => {
  assert.doesNotMatch(ROADMAP, /className="rm-back"/);
  assert.doesNotMatch(CSS, /\.rm-back\b/);
});

test('project actions are grouped behind an accessible native Project menu', () => {
  const menu = projectMenu(WS);
  assert.match(menu, /<summary aria-label="Project actions"/);
  assert.match(menu, /className="gx-top__actions"/);
  for (const action of ['members', 'files', 'memory', 'automations', 'credits']) {
    assert.match(menu, new RegExp('setDrawer\\(' + "'" + action + "'" + '\\)'));
  }
  assert.match(CSS, /\.studio-project-menu\b/);
  assert.match(CSS, /\.studio-project-menu\s+summary/);
  assert.match(CSS, /\.gx-top__actions\b/);
});

test('the folder trail is mounted somewhere a person can reach it', () => {
  assert.match(WS, /<FilesPanel\b/);
  assert.match(FILES, /aria-label="Folder"/);
  assert.match(FILES, /aria-current=\{i === crumbs\.length - 1 \? 'page' : undefined\}/);
});
