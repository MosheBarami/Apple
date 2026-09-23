// 2026-09-23: the workspace top bar's backdrop-filter made it a stacking context under the thread, so every
// row of the open project menu hit-tested to the conversation and none could be clicked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/design/apple-minimal.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('the top bar that owns the project menu is stacked above the thread', () => {
  const rule = css.match(/\.apple-workspace__topbar\s*\{([^}]*)\}/);
  assert.ok(rule, 'the top bar rule was not found — this checks nothing');
  assert.match(rule[1], /position\s*:\s*relative/);
  const z = Number((rule[1].match(/z-index\s*:\s*(\d+)/) ?? [])[1]);
  assert.ok(z >= 2, `top bar z-index ${z} does not lift it over the thread`);
});

test('inside the open project menu, Roadmap and Checkpoints keep their words at every width', () => {
  assert.match(css, /\.studio-project-menu\[open\] > \.gx-top__actions \.gx-top__cp-label\s*\{\s*display\s*:\s*inline/);
});
