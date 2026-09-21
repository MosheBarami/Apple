/**
 * THE CURSOR RULE HAS TO SURVIVE THE BUILD, NOT JUST THE SOURCE FILE.
 *
 * Cursor.astro writes `:root.has-cursor * { cursor: none !important; }`, which is the whole point:
 * a custom cursor is only custom if the real one is hidden EVERYWHERE, not just over the component
 * that declares it.
 *
 * Astro scopes component styles. It rewrote that universal selector into
 * `:root.has-cursor [data-astro-cid-msvfyisy]`, an attribute only elements of that one component
 * carry. Measured on the deployed origin 2026-09-21: `has-cursor` present, `body` computing
 * `cursor: none`, and **44 of 44 controls still computing a native cursor**. The feature was
 * reported CLOSED and a person moving the mouse over any button saw the operating system's arrow.
 *
 * `cursor-never-blinds.test.mjs` could not catch it and still cannot: it reads the component
 * SOURCE, where the selector is correct. The transform happens afterwards. So this reads what was
 * BUILT, which is the only artifact a browser ever receives.
 *
 * Run from apps/site, after `npx astro build`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(SITE, 'dist', 'index.html');

function built() {
  //[[ A MISSING dist IS NOT A PASS AND NOT A SKIP.
  //   A test that quietly skips when the artifact is absent reports the same green as one that
  //   examined it, which is the exact shape of defect this file exists to catch. ]]
  assert.ok(existsSync(INDEX),
    'apps/site/dist/index.html is missing — run `npx astro build` in apps/site first. This test is '
    + 'about what the BUILD produced, so without a build it has verified nothing.');
  return readFileSync(INDEX, 'utf8');
}

test('the hide-the-native-cursor rule still applies to every element after the build', () => {
  const css = built();
  const rules = [...css.matchAll(/([^{}]*has-cursor[^{}]*)\{([^}]*cursor\s*:\s*none[^}]*)\}/g)];
  assert.ok(rules.length > 0,
    'no `has-cursor` rule setting `cursor: none` survived into dist/index.html. Either the custom '
    + 'cursor stopped hiding the real one, or the component stopped being inlined — both are the '
    + 'feature being absent for a visitor.');

  for (const [, selector] of rules) {
    assert.match(selector, /\*/,
      `the built rule \`${selector.trim()}\` hides the native cursor without a universal selector. `
      + 'Astro scoped it — almost certainly to a [data-astro-cid-…] attribute — so it now applies '
      + 'only to elements of the component that declared it, and every control elsewhere on the '
      + 'page keeps the operating system arrow. Use `:global(*)` in the component.');
    assert.doesNotMatch(selector, /\[data-astro-cid-/,
      `the built rule \`${selector.trim()}\` is scoped to a component-id attribute. That is the `
      + 'exact rewrite that made 44 of 44 controls show a native cursor on 2026-09-21.');
  }
});

test('the source says :global, which is what makes the built rule survive', () => {
  // The pair matters: the test above proves the OUTCOME, this one names the CAUSE, so a future
  // reader who breaks it is told what to type rather than only that something is wrong.
  const src = readFileSync(join(SITE, 'src', 'components', 'Cursor.astro'), 'utf8');
  const universal = [...src.matchAll(/:root\.has-cursor\s+([^,{]+)\{/g)].map((m) => m[1].trim());
  assert.ok(universal.length > 0, 'Cursor.astro no longer has a `:root.has-cursor` descendant rule');
  for (const sel of universal) {
    if (sel.includes('*')) {
      assert.match(sel, /:global\(\s*\*\s*\)/,
        `Cursor.astro writes \`${sel}\`. A bare \`*\` inside a component's <style> is scoped by `
        + 'Astro and stops applying to the rest of the page. Write `:global(*)`.');
    }
  }
});
