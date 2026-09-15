// The two keyless connectors, tested against responses their live APIs actually returned.
//
// WHAT THESE TESTS ARE FOR. A connector's whole job is to carry two facts out of somebody else's
// JSON and into a row a customer's place will depend on: WHO made this, and UNDER WHAT LICENCE.
// Everything else in a row is convenience. So the fixtures here are not hand-written shapes — they
// were recorded off api.polyhaven.com and api.sketchfab.com and trimmed only of thumbnail lists —
// and every assertion is about a licence or an author surviving the mapping intact.
//
// THE FIXTURES CARRY LICENCES THAT MUST BE REFUSED, on purpose. Sketchfab publishes six CC
// variants and two proprietary ones; a fixture containing only the two we want would prove the
// mapper works and prove nothing at all about the gate. NoDerivs is in there specifically because
// it is the one that a naive "does it say attribution?" rule lets through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ALLOWED,
  canonicalLicence,
  polyHavenRows,
  readPolyHavenLicence,
  sketchfab,
  sketchfabRows,
  PH_LICENCE_URL,
  SKETCHFAB_LICENCE_SLUGS,
} from '../scripts/harvest-library.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const PH = fixture('polyhaven-models.json');
const SF = fixture('sketchfab-search.json');

// The licence string the Poly Haven harvester reads off polyhaven.com/license at run time. It is a
// PARAMETER of the mapper, never a constant inside it — that is the whole point of the connector,
// so the test supplies it the way the live run does.
const PH_STATED = 'CC0';

/* ------------------------------------------------------------------------- poly haven --- */

test('poly haven: the author comes out of the API response, not a house default', () => {
  const { rows } = polyHavenRows(PH, { type: 'models', fallbackKind: 'prop', licence: PH_STATED });
  const chair = rows.find((r) => r.id === 'poly_haven/models/armchair-01');
  assert.ok(chair, `expected an armchair row, got ${rows.map((r) => r.id).join(', ')}`);
  // The name printed in the fixture's `authors` map. "Poly Haven" would be the default the old
  // harvester fell back to, and it names the wrong party for a donated asset.
  assert.equal(chair.author, 'Kirill Sannikov');
  assert.notEqual(chair.author, 'Poly Haven');
});

test('poly haven: the licence on the row is the string read off the licence page this run', () => {
  const { rows } = polyHavenRows(PH, { type: 'models', fallbackKind: 'prop', licence: PH_STATED });
  for (const r of rows) {
    assert.equal(r.licence, PH_STATED);
    assert.equal(r.licenceUrl, PH_LICENCE_URL);
    assert.equal(canonicalLicence(r.licence), 'CC0-1.0');
    assert.equal(r.attributionRequired, false);
  }
  // A different statement on the page must reach the row, or the "read it each run" design is
  // decorative: the mapper would be free to ignore what the fetch found.
  const { rows: other } = polyHavenRows(PH, { type: 'models', fallbackKind: 'prop', licence: 'CC BY 4.0' });
  assert.equal(other[0].licence, 'CC BY 4.0');
  assert.equal(other[0].attributionRequired, true);
});

test('poly haven: an asset with no author is REFUSED, because "unknown" is not provenance', () => {
  const missing = { ...PH, Nameless_01: { ...PH.ArmChair_01, authors: {} } };
  const { rows, refused } = polyHavenRows(missing, { type: 'models', fallbackKind: 'prop', licence: PH_STATED });
  assert.ok(!rows.some((r) => r.id.endsWith('nameless-01')), 'an authorless asset must not become a row');
  assert.ok(refused.some((x) => /author/i.test(x.why)), `refusal must say why: ${JSON.stringify(refused)}`);
});

test('poly haven: max_resolution is NOT copied into textureResolution', () => {
  // The fixture says 4096. validateProvenance errors above 1024, so a mapper that helpfully
  // forwarded the source's number would make every single row invalid.
  assert.equal(PH.ArmChair_01.max_resolution[0], 4096);
  const { rows } = polyHavenRows(PH, { type: 'models', fallbackKind: 'prop', licence: PH_STATED });
  for (const r of rows) assert.equal(r.textureResolution, null);
});

/* -------------------------------------------------------------------------- sketchfab --- */

test('sketchfab: the per-asset licence label survives into the row verbatim', () => {
  const { rows } = sketchfabRows(SF.results);
  const cc0 = rows.filter((r) => r.licence === 'CC0 Public Domain');
  assert.ok(cc0.length >= 2, `expected the fixture's CC0 rows, got ${rows.map((r) => r.licence).join(' | ')}`);
  for (const r of cc0) assert.equal(canonicalLicence(r.licence), 'CC0-1.0');

  const by = rows.find((r) => r.licence === 'CC Attribution');
  assert.ok(by, 'the CC-BY row must survive — it is half of what this connector was asked for');
  assert.equal(canonicalLicence(by.licence), 'CC-BY-4.0');
  assert.equal(by.attributionRequired, true);
});

test('sketchfab: the author is the uploader the API names, not the site', () => {
  const { rows } = sketchfabRows(SF.results);
  const museum = rows.find((r) => /Inkwell/i.test(r.name));
  assert.ok(museum, 'expected the recorded museum scan');
  assert.equal(museum.author, 'Scottish Maritime Museum');
  for (const r of rows) {
    assert.notEqual(r.author, 'Sketchfab');
    assert.ok(r.author.trim().length > 0, `${r.id} has an empty author`);
  }
});

test('sketchfab: NoDerivs is recognised and REFUSED, never mistaken for plain attribution', () => {
  // The trap this test exists for: "CC Attribution-NoDerivs" contains the word attribution, and a
  // rule that matched on that alone would admit a licence that forbids the decimating and
  // retexturing every Roblox import performs.
  assert.equal(canonicalLicence('CC Attribution-NoDerivs'), 'CC-BY-ND-4.0');
  assert.equal(ALLOWED.has('CC-BY-ND-4.0'), false);
  const { rows, refused } = sketchfabRows(SF.results);
  assert.ok(!rows.some((r) => /NoDerivs/i.test(r.licence)), 'a NoDerivs row must never be kept');
  assert.ok(refused.some((x) => /NoDerivs/i.test(x.licence)), `NoDerivs must be refused BY NAME: ${JSON.stringify(refused)}`);
});

test('sketchfab: non-commercial is refused too, and the refusal is counted rather than skipped', () => {
  const { rows, refused } = sketchfabRows(SF.results);
  assert.ok(!rows.some((r) => /NonCommercial/i.test(r.licence)));
  assert.ok(refused.some((x) => /NonCommercial/i.test(x.licence)));
  // Five recorded results, two licences allowed, three refused — the arithmetic has to close, or
  // rows are vanishing somewhere nobody is counting.
  assert.equal(rows.length + refused.length, SF.results.length);
});

test('sketchfab: the query asks only for licences the gate would allow anyway', () => {
  // Belt and braces, deliberately. The gate is the authority; the query is an optimisation. If the
  // two ever disagree, the harvest burns requests fetching rows it will throw away, and this test
  // is where that shows up rather than in a bill.
  for (const slug of SKETCHFAB_LICENCE_SLUGS) {
    assert.ok(['cc0', 'by'].includes(slug), `${slug} is not a licence this library may keep`);
  }
});

/* ------------------------------------------------------- the script and the worker agree --- */

// harvest-library.mjs keeps its own copy of the licence mapping because it is a plain script and
// the worker's is TypeScript inside a Worker bundle. The duplication is only safe while the two
// agree, so this asserts it on every string the two new connectors can actually emit — a
// divergence would mean harvesting rows the worker then refuses at ingest, which reads as data
// loss with no cause.
//
// The worker's two declarations are lifted out of the SOURCE TEXT rather than bundled, because
// bundling needs esbuild out of apps/worker/node_modules and that makes the check unrunnable in a
// checkout nobody has installed — which is where a cross-repository check is most wanted, not
// least. Both declarations are self-contained: a pure function over strings, and a literal. If
// either stops matching, the extraction FAILS THE TEST rather than quietly checking nothing, which
// is the only version of this that is worth having.
//
// They live in apps/worker/src/licences.ts, not asset-library.ts, which re-exports them: the genre
// kits need the same decision and importing it from asset-library would drag D1, Vectorize and the
// AI gateway into a module that only asks a question about a string. This file follows the
// declarations rather than the re-export, because a regex over `export { LICENCES } from …` would
// match and extract nothing — which is exactly the blind-reads-as-clean failure the asserts below
// exist to prevent.
const WORKER_SRC = readFileSync(new URL('../apps/worker/src/licences.ts', import.meta.url), 'utf8');

function workerLicenceGate() {
  const fn = /export function normaliseLicence\(verbatim: string\): string \| null \{\n([\s\S]*?)\n\}\n/.exec(WORKER_SRC);
  assert.ok(fn, 'could not find normaliseLicence in licences.ts — this check is blind, not clean');
  const table = /export const LICENCES: Readonly<Record<string, LicenceRule>> = (\{\n[\s\S]*?\n\});\n/.exec(WORKER_SRC);
  assert.ok(table, 'could not find the LICENCES table in licences.ts — this check is blind, not clean');
  return {
    normaliseLicence: new Function('verbatim', fn[1]),
    LICENCES: new Function(`return ${table[1]}`)(),
  };
}

// Every wording Sketchfab's /v3/licenses endpoint publishes, plus what Poly Haven's licence page
// says. These are the strings that can reach a row, so these are the strings that must agree.
const EMITTABLE = ['CC0', 'CC0 Public Domain', 'CC Attribution', 'CC Attribution-ShareAlike',
  'CC Attribution-NoDerivs', 'CC Attribution-NonCommercial', 'CC Attribution-NonCommercial-ShareAlike',
  'CC Attribution-NonCommercial-NoDerivs', 'Free Standard', 'Standard', 'Editorial'];

test('every licence string these two connectors can emit means the same thing to the worker', () => {
  const { normaliseLicence } = workerLicenceGate();
  for (const s of EMITTABLE) {
    assert.equal(canonicalLicence(s), normaliseLicence(s), `the script and the worker disagree about "${s}"`);
  }
});

test('the worker would keep exactly the rows the harvest keeps, and refuse the rest', () => {
  const { normaliseLicence, LICENCES } = workerLicenceGate();
  for (const s of EMITTABLE) {
    const id = normaliseLicence(s);
    const workerKeeps = Boolean(id && LICENCES[id]?.allowedInLibrary);
    const harvestKeeps = ALLOWED.has(canonicalLicence(s));
    assert.equal(harvestKeeps, workerKeeps, `"${s}": the harvest says keep=${harvestKeeps}, the worker says keep=${workerKeeps}`);
  }
});

test('the worker excludes NoDerivs from the library for a stated reason', () => {
  const { LICENCES } = workerLicenceGate();
  const rule = LICENCES['CC-BY-ND-4.0'];
  assert.ok(rule, 'CC-BY-ND-4.0 must be IN the table so it can be recognised and refused');
  assert.equal(rule.allowedInLibrary, false);
  assert.match(rule.why, /derivativ/i);
});

test('rows from both connectors satisfy the field rules validateProvenance enforces', () => {
  // The validator itself needs the worker's whole dependency graph, so the constraints the mappers
  // were specifically engineered against are restated here: they are the ones a connector gets
  // wrong. packages/evals/src/asset-qc.test.mjs runs the real validator once the tree is installed.
  const ID_RE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/;
  const TAG_RE = /^[a-z0-9][a-z0-9-]*$/;
  const { rows: ph } = polyHavenRows(PH, { type: 'models', fallbackKind: 'prop', licence: PH_STATED });
  const { rows: sf } = sketchfabRows(SF.results);
  const kinds = ['ground', 'building', 'prop', 'foliage', 'character', 'vehicle', 'ui_icon', 'texture', 'particle'];
  assert.ok(ph.length && sf.length, 'both connectors must actually produce rows for this to mean anything');
  for (const r of [...ph, ...sf]) {
    assert.match(r.id, ID_RE, `${r.id} is not a namespaced lowercase slug`);
    assert.ok(kinds.includes(r.kind), `${r.id} has kind ${r.kind}`);
    assert.match(r.sourceUrl, /^https:\/\/\S+$/, `${r.id} sourceUrl`);
    assert.match(r.licenceUrl, /^https:\/\/\S+$/, `${r.id} licenceUrl`);
    assert.ok(r.author.trim(), `${r.id} author`);
    assert.ok(r.tags.length > 0, `${r.id} has no tags`);
    for (const t of r.tags) assert.match(t, TAG_RE, `${r.id} tag ${t}`);
    assert.equal(r.textureResolution, null);
    assert.equal(r.triangles, null);
    assert.equal(r.commercialUse, true);
  }
});

/* ------------------------------------------- the failure path, which is the other half --- */

// WHY THESE EXIST. Every assertion above is about a row that got made. These are about the run
// where no row can be made, and they matter more, because main() writes `failed: false, kept: 0`
// for any source that RETURNS. A sweep that cannot reach its API therefore has exactly one way to
// say so — throw — and if it does not, the index records "sketchfab: 0 assets" in the same voice
// it uses for a source that genuinely holds nothing. That is the house failure by name: a failure
// to observe rendering as an observation.

test('poly haven: a licence page that has lost its sentence takes the whole source down', () => {
  // Not "fall back to CC0". The constant this connector replaced would have gone on asserting CC0
  // for years after the site changed its mind, inside a paying customer's place.
  assert.throws(
    () => readPolyHavenLicence('<html><body><h1>License</h1><p>Assets are free to use.</p></body></html>'),
    /no longer contains the sentence/,
  );
});

test('poly haven: a licence the library may not keep is refused, never recorded', () => {
  assert.throws(() => readPolyHavenLicence('<p>Our assets are all licensed as CC BY-NC 4.0, so use them.</p>'), /may not keep/);
  // The sentence still parses — the refusal is about the licence, not about a read that broke.
  assert.equal(canonicalLicence('CC BY-NC 4.0'), 'CC-BY-NC-4.0');
  assert.equal(readPolyHavenLicence('<p>Our assets are all licensed as CC0, no rights reserved.</p>'), 'CC0');
});

test('sketchfab: a sweep the API answers with nothing is a real, reportable zero', async () => {
  const r = await sketchfab({ fetchPage: async () => ({ results: [] }), sleepMs: 0 });
  assert.equal(r.rows.length, 0);
  assert.equal(r.requestFailures, 0);
  assert.ok(r.queriesAttempted > 0, 'a sweep that attempted nothing is evidence of nothing');
  assert.equal(r.queriesAnswered, r.queriesAttempted);
});

test('sketchfab: an API that answers NO query fails the source instead of reporting zero rows', async () => {
  // The change this is written against is not hypothetical: public search starts wanting a key and
  // every request comes back 403. Before this guard the sweep swallowed each one and returned [].
  await assert.rejects(
    () => sketchfab({ fetchPage: async () => { throw new Error('HTTP 403'); }, sleepMs: 0 }),
    (e) => {
      assert.match(e.message, /HTTP 403/, `the real error must reach the failure file: ${e.message}`);
      assert.match(e.message, /answered none/i, `the message must say what was not observed: ${e.message}`);
      return true;
    },
  );
});

test('sketchfab: queries lost mid-sweep are COUNTED in the artefact, not smoothed away', async () => {
  const fetchPage = async (url) => {
    if (/q=rock|q=tree/.test(url)) throw new Error('HTTP 500');
    return { results: SF.results, next: null };
  };
  const r = await sketchfab({ fetchPage, sleepMs: 0 });
  assert.ok(r.rows.length > 0, 'the queries that answered must still produce their rows');
  // Two terms lost, under each of the two licence slugs.
  assert.equal(r.requestFailures, 4);
  assert.equal(r.queriesAttempted - r.queriesAnswered, 4);
  assert.ok(
    r.failures.some((f) => /HTTP 500/.test(f.error) && f.term === 'rock'),
    `the artefact must name what failed: ${JSON.stringify(r.failures)}`,
  );
});

test('sketchfab: zero rows WITH lost queries is not a zero anyone may publish', async () => {
  // Half the sweep 403s and the half that answers is empty. Kept: 0 — arithmetically identical to
  // a catalogue that holds nothing, and only the source knows the difference.
  let n = 0;
  await assert.rejects(
    () => sketchfab({ fetchPage: async () => { if (n++ % 2) throw new Error('HTTP 403'); return { results: [] }; }, sleepMs: 0 }),
    /failure to look/,
  );
});

test('sketchfab: a response missing its results array is a shape change, not an empty page', async () => {
  await assert.rejects(
    () => sketchfab({ fetchPage: async () => ({ models: [] }), sleepMs: 0 }),
    /shape has changed/,
  );
});
