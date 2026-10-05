/**
 * FLAT SURFACES: no glass, no aurora, one set of sheets.
 *
 * The language is flat surfaces with hairline borders. Before M2 both apps had a frosted-glass layer
 * (blurred translucent panels over a drifting aurora) and each carried its own copy of the token
 * sheet. These tests hold what replaced them:
 *
 *   - no `backdrop-filter` with a real value, anywhere in either app;
 *   - no glass or aurora token, class, component or file;
 *   - the three duplicated sheets are deleted, and no sheet but tokens.css declares a colour on :root.
 *
 * Motion is deliberately NOT asserted here. The token file's easings never overshoot
 * (tokens.test.mjs holds that), but about twenty owner-picked interaction components still carry
 * their own spring curves; those are interactions, not the visual system, and they stay until the
 * app rebuild.
 *
 * Comments are stripped before anything is searched: the better a removal is documented, the more a
 * scanner that reads prose finds its own explanation and reports it as the defect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments, topLevelRules, declarations } from './css-tokens.mjs';
import { ROOT, readText, walkText } from './tests/repo-walk.mjs';

const APPS = ['apps/site/src', 'apps/web/src'];
const FILES = walkText(APPS);
const code = (f) => stripComments(readText(f)).replace(/<!--[\s\S]*?-->/g, ' ').replace(/(^|[^:\w'"`])\/\/[^\n]*/g, '$1');
const isStyle = (f) => /\.(css|astro)$/.test(f.rel);

test('the walk found both apps', () => {
  assert.ok(FILES.length > 450, `only ${FILES.length} app files scanned; the walk has drifted`);
  assert.ok(FILES.some((f) => f.rel.startsWith('apps/site/')) && FILES.some((f) => f.rel.startsWith('apps/web/')), 'one app is missing from the walk');
});

test('no backdrop-filter has a value anywhere in either app', () => {
  const hits = [];
  for (const f of FILES) {
    for (const m of code(f).matchAll(/(?:-webkit-)?backdrop-filter\s*:\s*([^;}\n]+)/gi)) {
      if (m[1].trim().toLowerCase() !== 'none') hits.push(`${f.rel}: ${m[0].trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(hits, [], `frosted glass is back:\n  ${hits.join('\n  ')}`);
});

test('no glass or aurora token, class, component or file exists in either app', () => {
  const hits = [];
  for (const f of FILES) {
    if (/(^|\/)(glass|aurora|aura|studio-atmosphere)[^/]*$/i.test(f.rel)) hits.push(`${f.rel}: a glass or aurora file`);
    const src = code(f);
    for (const m of src.matchAll(/--(?:glass|aurora|aura)[a-z0-9-]*/gi)) hits.push(`${f.rel}: ${m[0]}`);
    if (isStyle(f)) for (const m of src.matchAll(/\.(?:glass|aurora|aura|studio-atmosphere)(?:__[a-z-]+|--[a-z-]+)?\b/g)) hits.push(`${f.rel}: ${m[0]}`);
    for (const m of src.matchAll(/\b(?:StudioAtmosphere|Aura)\b|pk-glide--glass/g)) hits.push(`${f.rel}: ${m[0]}`);
  }
  assert.deepEqual([...new Set(hits)], [], `a glass or aurora layer is back:\n  ${[...new Set(hits)].join('\n  ')}`);
});

test('the three duplicated sheets are deleted and nothing names them', () => {
  for (const rel of ['apps/site/src/styles/studpilot-minimal.css', 'apps/web/src/design/studpilot-minimal.css', 'apps/web/src/design/glass.css']) {
    assert.ok(!existsSync(join(ROOT, rel)), `${rel} must stay deleted`);
  }
  const hits = FILES.filter((f) => /studpilot-minimal|design\/glass\.css/.test(readText(f))).map((f) => f.rel);
  assert.deepEqual(hits, [], `a file still names a deleted sheet:\n  ${hits.join('\n  ')}`);
});

test('no sheet but tokens.css declares a colour on :root, html or a theme attribute', () => {
  const colour = /^(#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|color-mix\()/i;
  const themeRoot = /^(:root|html)(\[data-theme=['"](dark|light)['"]\])?$/;
  const stray = [];
  let rulesRead = 0;
  for (const f of FILES.filter(isStyle)) {
    const src = f.rel.endsWith('.astro')
      ? [...readText(f).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
      : readText(f);
    for (const rule of topLevelRules(src)) {
      rulesRead += 1;
      const roots = rule.selector.split(',').map((s) => s.trim()).filter((s) => themeRoot.test(s));
      if (roots.length === 0) continue;
      for (const d of declarations(rule.body)) if (colour.test(d.value)) stray.push(`${f.rel}: ${rule.selector} { ${d.name}: ${d.value} }`);
    }
  }
  assert.ok(rulesRead > 2000, `only ${rulesRead} rules read; the parse has drifted`);
  assert.deepEqual(stray, [], `a colour token is declared outside tokens.css:\n  ${stray.join('\n  ')}`);
});
