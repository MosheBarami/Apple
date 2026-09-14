// RTL correctness of the workspace stylesheets.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT. The workspace sits behind a login — /ui-lab redirects to
// /app/login — so it cannot be rendered in a browser without credentials and a live Supabase
// session. This asserts the property that makes RTL work at the stylesheet level: no text-flow
// declaration is physical, so every one of them follows `dir`. It is NOT a screenshot of a
// mirrored workspace, and it does not catch a component that positions something with inline
// styles or JS.
//
// The auth screen WAS verified in a browser (dir=rtl, direction: rtl, text-align resolving to
// start, asymmetric padding mirroring). This covers the surfaces that verification could not reach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHEETS = {
  'styles.css': readFileSync(join(HERE, '..', 'src', 'styles.css'), 'utf8'),
  'workspace.css': readFileSync(join(HERE, '..', 'src', 'styles', 'workspace.css'), 'utf8'),
  'roadmap.css': readFileSync(join(HERE, '..', 'src', 'components', 'roadmap', 'roadmap.css'), 'utf8'),
};

/** Strip comments so a rule quoted in prose does not count as a declaration. */
const code = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

test('no physical text-flow property survives in any workspace stylesheet', () => {
  // These follow reading direction essentially always, so a physical one is a bug by construction.
  const BANNED = [
    /\bpadding-(left|right)\s*:/g,
    /\bmargin-(left|right)\s*:/g,
    /\bborder-(left|right)\s*:/g,
    /\bborder-(top|bottom)-(left|right)-radius\s*:/g,
    /\btext-align\s*:\s*(left|right)\b/g,
  ];
  for (const [name, css] of Object.entries(SHEETS)) {
    const body = code(css);
    for (const re of BANNED) {
      const hits = [...body.matchAll(re)].map((m) => m[0]);
      assert.deepEqual(hits, [], `${name}: ${hits.length} physical declaration(s): ${hits.slice(0, 5).join(', ')}`);
    }
  }
});

test('the logical replacements are actually present, so the rules were converted not deleted', () => {
  // A sheet with no padding at all would pass the check above vacuously.
  const all = Object.values(SHEETS).map(code).join('\n');
  for (const prop of ['padding-inline-start', 'padding-inline-end', 'margin-inline-start', 'border-inline-start', 'text-align: start']) {
    assert.ok(all.includes(prop), `expected ${prop} somewhere — the conversion should have produced it`);
  }
});

test('every surviving physical inset is symmetric, centring, or off-screen', () => {
  // `left:`/`right:` are NOT banned outright: a symmetric pair already mirrors, `left: 50%` with a
  // translate is centring, and `left: -9999px` is the visually-hidden trick. Converting those would
  // be churn that reads as progress. Anything ELSE that is single-sided must be logical.
  for (const [name, css] of Object.entries(SHEETS)) {
    const body = code(css);
    for (const block of body.match(/\{[^{}]*\}/g) ?? []) {
      const l = /(?:^|;|\{)\s*left\s*:\s*([^;}]+)/.exec(block);
      const r = /(?:^|;|\{)\s*right\s*:\s*([^;}]+)/.exec(block);
      if (!l && !r) continue;
      if (l && r) continue; // symmetric pair: already mirrors
      const v = (l ?? r)[1].trim();
      const excused = v.includes('50%') || v.includes('-9999px') || v === '0' || v === '0px';
      assert.ok(
        excused,
        `${name}: single-sided physical inset "${(l ? 'left' : 'right')}: ${v}" should be inset-inline-*`,
      );
    }
  }
});

test('direction resolution covers the languages the product actually serves', () => {
  // Hebrew is the one that matters here: the owner works in it, and JavaScript's \b is defined over
  // [A-Za-z0-9_], so a boundary-based matcher silently fails on every Hebrew string.
  const dir = readFileSync(join(HERE, '..', 'src', 'lib', 'direction.ts'), 'utf8');
  for (const tag of ['he', 'iw', 'ar', 'fa', 'ur']) {
    assert.match(dir, new RegExp(`'${tag}'`), `${tag} must be recognised as RTL`);
  }
  // Applied before React mounts — a direction applied after first paint is a visible flip.
  //
  // Compared at the CALL sites, not by a bare indexOf: `createRoot` appears in the import line
  // first, so searching for the identifier finds position ~7 and the assertion fails on correct
  // code. The first version of this test did exactly that.
  const main = readFileSync(join(HERE, '..', 'src', 'main.tsx'), 'utf8');
  const initAt = main.indexOf('initDirection();');
  const mountAt = main.indexOf('createRoot(rootEl)');
  assert.ok(initAt !== -1, 'main.tsx must call initDirection()');
  assert.ok(mountAt !== -1, 'main.tsx must mount with createRoot(rootEl)');
  assert.ok(initAt < mountAt, 'direction must be set before mount');
});
