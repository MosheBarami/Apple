// The root route is an invitation into the real app, not a screenshot of a run. This guard keeps
// fabricated project state and hand-authored result cards out of the landing as its sections evolve.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = readFileSync(join(SITE, 'src', 'pages', 'index.astro'), 'utf8');

/** Remove prose that is not sent to a visitor before checking visible landing copy. */
function renderedSource(src) {
  return src
    .replace(/^---[\s\S]*?\n---\s*/, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
}

test('the landing contains no fabricated run, place, or result snapshot', () => {
  // These checks target the mechanism, not a particular sentence: a static result panel needs a
  // result-bearing container or a project-state value. The old landing supplied both (including
  // object counts, a place name, and a fake transcript) even though no run had happened. A future
  // redesign may change its copy, but it must not quietly return that kind of invented evidence.
  const source = renderedSource(PAGE);
  const forbiddenStructure = [
    /class=["'][^"']*\b(?:ap-(?:demo|panel|place|steps|proof|wall)|(?:run|result|snapshot|metrics?))\b[^"']*["']/i,
    /aria-label=["'][^"']*(?:example\s+(?:run|place)|result|snapshot|demo|metrics?)[^"']*["']/i,
    /<(?:table|ol|dl)\b/i,
    /class=["'][^"']*\b(?:ap-(?:slip|chips|hero__cta)|(?:fake|example)-(?:composer|prompt))\b[^"']*["']/i,
    /<(?:input|textarea)\b|contenteditable\s*=|role=["']textbox["']/i,
  ];
  for (const pattern of forbiddenStructure) {
    assert.doesNotMatch(source, pattern,
      `the landing contains a static result structure matching ${pattern}`);
  }

  // Literal signatures make the guard useful even if a stale snapshot is given generic classes.
  // Keep the list tied to the evidence it forbids, rather than banning ordinary words such as
  // "script" or "result" in explanatory copy.
  const fabricatedEvidence = [
    /\b(?:runSteps|promptSlip|assetWall|Neon Arena|PortalTeleport)\b/i,
    /\bExample\s+(?:run|place\s+state)\b/i,
    /\b(?:objects?|scripts?|parts?|checkpoints?)\s*(?:→|:)\s*\d+/i,
    /\bcaptured\s+\d{1,2}:\d{2}\b/i,
  ];
  for (const pattern of fabricatedEvidence) {
    assert.doesNotMatch(PAGE, pattern,
      `the landing contains fabricated runtime evidence matching ${pattern}`);
  }

  assert.match(source, /href=["']\/app["']/,
    'the root has no real app entry point; this guard would otherwise only verify absence');
});

test('the model cards are data-driven and do not revive the removed hand-counted sections', () => {
  // Product model identity is supplied by the shared contract. Keep this independent from the
  // autonomy mode names and from the former count-bearing modes/how-it-works sections.
  const modelImport = /import\s*\{[^}]*\bPRODUCT_MODELS\b[^}]*\}\s*from\s*['"]@golem\/shared['"]/;
  assert.match(PAGE, modelImport,
    'the landing does not import the shared product model list');
  assert.match(PAGE, /PRODUCT_MODELS\.map\s*\(/,
    'the model grid is not derived from PRODUCT_MODELS');
  assert.match(PAGE, /class=["']model-grid["']/,
    'the model cards have no identifiable grid for this check to observe');
  assert.doesNotMatch(PAGE, /\b(?:MODE_WORDS|MODE_COUNT_WORD|const\s+modes\s*=|assetWall)\b/,
    'the landing still carries the removed hand-counted mode/result data');
});
