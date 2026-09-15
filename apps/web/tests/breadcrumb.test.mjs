/**
 * TWO TRAILS, AND UNTIL NOW NEITHER ONE WAS BOTH BUILT AND REACHABLE.
 *
 * The folder trail in the files panel was written properly — crumbs from a storage prefix, inside
 * <nav aria-label="Folder">, aria-current on the last one — and nothing mounted the panel, so no
 * user ever saw it. That half is fixed: the workspace mounts it behind the Files drawer.
 *
 * The application trail did not exist at all. The roadmap is two levels down from the project
 * list and offered a single chevron link back to the conversation — one hop, which is a back
 * button wearing a trail's clothes. It does not say where you are, and it cannot reach the
 * project list, which is the level people actually want.
 *
 * These assertions pin both: the roadmap has a real three-level trail with the right ancestors,
 * and the folder trail is still mounted somewhere a person can reach it.
 *
 * Run with:  node --test apps/web/tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

const ROADMAP = read('routes', 'roadmap.tsx');
const ROADMAP_CSS = read('components', 'roadmap', 'roadmap.css');
const WS = read('routes', 'workspace.tsx');
const FILES = read('components', 'ws', 'files-panel.tsx');

/** The markup of the first <nav aria-label="Breadcrumb"> in `src`. */
function trail(src) {
  const m = /<nav aria-label="Breadcrumb"[\s\S]*?<\/nav>/.exec(src);
  assert.ok(m, 'no <nav aria-label="Breadcrumb"> — a trail has to be announced as one');
  return m[0];
}

test('the roadmap says where it is, all the way up to the project list', () => {
  const nav = trail(ROADMAP);
  assert.match(nav, /to="\/"/, 'the top of the trail is the project list, which is the level people want');
  assert.match(nav, /to=\{`\/projects\/\$\{projectId\}`\}/, 'the middle crumb is the project itself');
  assert.match(nav, /Roadmap/, 'the last crumb names where you are');
});

test('the crumb you are standing on is marked, and is not a link to itself', () => {
  const nav = trail(ROADMAP);
  assert.match(nav, /aria-current="page"/, 'a screen reader needs to be told which crumb is here');
  // The current page as a <Link> to itself is a control that does nothing, which is the same
  // defect as a dead route wearing different clothes.
  const current = /<span[^>]*aria-current="page"[^>]*>/.exec(nav);
  assert.ok(current, 'the current crumb must be plain text, not a link');
});

test('the one-hop back link it replaces is gone, and took its styles with it', () => {
  assert.doesNotMatch(ROADMAP, /className="rm-back"/, 'two ancestor controls in one header is one too many');
  assert.doesNotMatch(ROADMAP_CSS, /\.rm-back\b/, 'a rule whose only class no longer exists is dead CSS');
});

test('the folder trail is mounted somewhere a person can reach it', () => {
  // It was written, tested and never rendered — a trail nobody could see.
  assert.match(WS, /<FilesPanel\b/, 'the files panel must be mounted by a route');
  assert.match(FILES, /aria-label="Folder"/);
  assert.match(FILES, /aria-current=\{i === crumbs\.length - 1 \? 'page' : undefined\}/);
});
