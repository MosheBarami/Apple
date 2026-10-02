// Review of PR #12 (2026-10-02): index.html's pre-paint script must type the theme-color before any CSS loads, so it
// cannot read --paper; this pins its two literals to the --paper tokens so retuning a token cannot leave the browser
// chrome a different colour from the page during the first paint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(WEB, 'index.html'), 'utf8');
const css = readFileSync(join(WEB, 'src', 'design', 'apple-minimal.css'), 'utf8');

test('the pre-paint theme-color literals in index.html equal the --paper tokens of both themes', () => {
  const papers = [...css.matchAll(/--paper:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1].toLowerCase());
  assert.ok(papers.length >= 2, 'the --paper tokens were not found; this test would check nothing');
  const [dark] = papers;
  const lightBlock = css.slice(css.search(/\[data-theme=['"]light['"]\]/));
  const light = lightBlock.match(/--paper:\s*(#[0-9a-fA-F]{6})/)?.[1].toLowerCase();
  const literals = [...html.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toLowerCase());
  assert.ok(literals.includes(dark), `index.html does not use the dark --paper ${dark}`);
  assert.ok(light && literals.includes(light), `index.html does not use the light --paper ${light}`);
  for (const l of literals) assert.ok(l === dark || l === light, `index.html types ${l}, which is neither --paper`);
});
