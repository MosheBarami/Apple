/**
 * EVERY CONTROL KEEPS THE OPERATING SYSTEM'S POINTER — IN WHAT WAS BUILT, NOT ONLY IN THE SOURCE.
 *
 * RESTATED 2026-09-22, WHEN THE CUSTOM CURSOR WAS REMOVED.
 *
 * This file existed because the source and the build disagreed. Cursor.astro wrote
 * `:root.has-cursor * { cursor: none !important; }`, Astro's scoping rewrote the universal selector,
 * and 44 of 44 controls on the deployed origin still showed the native arrow while the source read
 * correctly. Its lesson — read the BUILT bytes, because that is the only artifact a browser
 * receives — is exactly as true now that the custom cursor is gone.
 *
 * So the property is the new one, checked at the same boundary: nothing the build emits hides the
 * pointer or carries the retired cursor's machinery, and the site's controls still ask for a
 * pointer (`cursor: pointer`) in the built CSS. Run from apps/site, after `npx astro build`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(SITE, 'dist');

function builtFiles() {
  assert.ok(existsSync(join(DIST, 'index.html')),
    'apps/site/dist/index.html is missing — run `npx astro build` in apps/site first. This test is '
    + 'about what the BUILD produced, so without a build it has verified nothing.');
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(html|css|js)$/.test(e.name)) out.push([p.slice(DIST.length + 1), readFileSync(p, 'utf8')]);
    }
  };
  walk(DIST);
  return out;
}

test('nothing the build emits hides the pointer or carries the retired cursor machinery', () => {
  const files = builtFiles();
  assert.ok(files.filter(([f]) => f.endsWith('.html')).length >= 10, 'too few built pages to mean anything');
  assert.ok(files.some(([f]) => f.endsWith('.css')), 'no built stylesheet found — the walk has drifted');
  const bad = files
    .filter(([, body]) => /cursor\s*:\s*none\b|has-cursor|data-cursor/.test(body))
    .map(([f]) => f);
  assert.deepEqual(bad, [], `the build still hides the pointer or wires a custom cursor in: ${bad.join(', ')}`);
});

test('the built controls still ask for a pointer', () => {
  const css = builtFiles().filter(([f]) => f.endsWith('.css')).map(([, b]) => b).join('\n');
  // The shared button primitive and the header's icon buttons (the theme toggle and the menu button) are the controls every route
  // renders; both must keep the pointer that says "this can be pressed". RESTATED 2026-10-05 (M2 rebuild): the second was the
  // landing's composer submit (`.composer-send`), deleted with the composer.
  assert.match(css, /\.btn\{[^}]*cursor:pointer/, 'the shared .btn lost its pointer in the build');
  assert.match(css, /\.iconbtn(?:\[[^\]]*\])?\{[^}]*cursor:pointer/, 'the header icon buttons lost their pointer in the build');
});
