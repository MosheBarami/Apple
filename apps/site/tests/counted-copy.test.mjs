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
    // A FAKE FIELD, WHICH IS NOT THE SAME THING AS A FIELD. `contenteditable` and `role=textbox`
    // are the two ways to draw something that looks typable without being a control, and both
    // stay banned outright. `<input>` and `<textarea>` moved out of this list and into the
    // assertion below — see the note there.
    /contenteditable\s*=|role=["']textbox["']/i,
  ];
  for (const pattern of forbiddenStructure) {
    assert.doesNotMatch(source, pattern,
      `the landing contains a static result structure matching ${pattern}`);
  }

  /*[[ RE-AIMED 2026-09-21, FROM "NO TEXT FIELD" TO "NO DECORATIVE TEXT FIELD".
   *
   *   WHAT THIS LINE USED TO SAY, AND WHY IT WAS RIGHT WHEN IT WAS WRITTEN. `<input|textarea>` was
   *   in the list above, banned outright, because the landing it was written against carried a
   *   fabricated composer: a mocked field, a hand-authored transcript, object counts and a place
   *   name, with no run behind any of it. Banning the element banned the mock.
   *
   *   WHY IT IS NOW THE WRONG SHAPE. The hero's composer was `aria-hidden="true"` and held three
   *   <span>s — the single largest object above the fold was a photograph of a text field. A
   *   keyboard user could not reach it, a screen reader was told nothing was there, and a reader
   *   who clicked into it to type their idea got nothing. It is now a real <form> with a real
   *   <textarea> that submits to /app/signup carrying what was typed. That is the opposite of the
   *   defect this guard exists for: it is the removal of a mock, and the old spelling would have
   *   made the fix fail the guard that wanted it.
   *
   *   THE PROPERTY, WHICH IS STRICTER THAN THE OLD RULE RATHER THAN LOOSER. Every text field on
   *   this page must be a REAL control: inside a <form> that posts to the app, and carrying a
   *   `name` so what is typed actually travels. A decorative field — one outside a form, or one
   *   with no name, which is exactly what a mocked composer looks like — is still the defect, and
   *   so is the old fabricated composer, which had neither. ]]*/
  const forms = [...source.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map((m) => m[0]);
  const realForms = forms.filter((f) => /action=["']\/app\b[^"']*["']/i.test(f));
  const fields = [...source.matchAll(/<(?:input|textarea)\b[^>]*>/gi)].map((m) => m[0]);
  for (const field of fields) {
    const inside = realForms.find((f) => f.includes(field));
    assert.ok(inside,
      `this text field is not inside a form that posts to the app, so it is decoration rather than ` +
      `a control — which is what the fabricated composer was: ${field.slice(0, 90)}`);
    assert.match(field, /\bname=["'][^"']+["']/,
      `this text field has no name, so nothing a reader types travels anywhere: ${field.slice(0, 90)}`);
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
