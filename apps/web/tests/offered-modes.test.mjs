// What EXISTS and what is OFFERED are two lists, and conflating them is why "Super Agent" survived
// being removed.
//
// The owner said he does not want Super Agent. The composer dropped it and the sign-in page
// dropped it — and the usage page went on pricing it, because it read PRODUCT_MODES, which is the
// list of modes that exist. A person could read what a Super Agent run costs and find no way to
// start one anywhere in the product.
//
// `super` stays in the type and in the engine: `rune` is a real specialist the worker runs, and an
// automation or an API caller can still name it. Nothing OFFERS it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_MODES, PRODUCT_MODES_OFFERED } from '@golem/shared';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(WEB, 'src', p), 'utf8');

test('the offered list is a subset of what exists, and smaller', () => {
  for (const m of PRODUCT_MODES_OFFERED) {
    assert.ok(PRODUCT_MODES.includes(m), `${m} is offered and does not exist`);
  }
  assert.ok(PRODUCT_MODES_OFFERED.length < PRODUCT_MODES.length,
    'if the two are equal the distinction has quietly collapsed and this file is guarding nothing');
});

test('super exists and is not offered', () => {
  assert.ok(PRODUCT_MODES.includes('super'), 'the engine still runs it — rune is a real specialist');
  assert.ok(!PRODUCT_MODES_OFFERED.includes('super'), 'the owner said he does not want it offered');
});

test('every surface a person CHOOSES from reads the offered list', () => {
  //[[ THE DRIFT THIS CATCHES. Four surfaces list modes and three had been updated by hand. A
  //   fifth added next month would default to PRODUCT_MODES and re-advertise a mode nobody can
  //   start, and nothing would say so — it renders, it prices, it just cannot be reached. ]]
  for (const file of ['components/ws/composer.tsx', 'routes/usage.tsx', 'lib/automations.ts']) {
    const src = read(file);
    assert.match(src, /PRODUCT_MODES_OFFERED/, `${file} must offer from the offered list`);
    // The bare list may still be imported for a type or a lookup; what must not happen is
    // rendering a chooser from it.
    assert.doesNotMatch(src, /PRODUCT_MODES\.map/, `${file} renders a chooser from every mode that exists`);
  }
});

test('no surface a person chooses from names Super Agent in its own copy', () => {
  // The name is in PRODUCT_MODE_INFO, which is correct — a stored run from before this change must
  // still render its label. What must not happen is a chooser hard-coding it.
  for (const file of ['components/ws/composer.tsx', 'routes/usage.tsx', 'routes/auth-pages.tsx']) {
    const prose = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(prose, /Super Agent/, `${file} still writes "Super Agent" into the interface`);
  }
});
