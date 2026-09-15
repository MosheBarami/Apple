/**
 * THE ARGUMENT VALIDATOR — the layer that makes a tool's schema a runtime promise.
 *
 * Its whole reason to exist is the three shapes docs/FAILURES.md keeps finding, so the tests are
 * written as those shapes rather than as a tour of the happy path:
 *
 *   `??` DEFENDS undefined AND null AND NOTHING ELSE. So every number test feeds NaN, Infinity and
 *   the STRING "1024" — the three values `(a.width as number) ?? 1280` accepts and every later
 *   `width > 0` comparison then answers `false` to, silently.
 *
 *   A Record<Union, T> IS A COMPILE-TIME PROMISE. So the enum tests feed `__proto__` and
 *   `constructor`, the two keys that exist on every object and would satisfy a table lookup.
 *
 *   AN UNKNOWN KEY IS AN ERROR. So the tests feed the misspelling a model actually produces.
 *
 * Run with:  node --test tests/tool-contract.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'toolcontract-')), 'c.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tool-contract.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' },
);
const C = await import(`file://${out}`);

const CONTRACT = {
  name: 'demo',
  description: 'a contract with one of everything',
  args: {
    url: { type: 'string', description: 'a url', required: true, max: 200 },
    width: { type: 'integer', description: 'pixels', min: 320, max: 2000, default: 1280 },
    ratio: { type: 'number', description: 'a fraction', min: 0, max: 1 },
    extract: { type: 'string', description: 'what to take', enum: ['text', 'links'], default: 'text' },
    deep: { type: 'boolean', description: 'go deeper', default: false },
    tags: { type: 'string[]', description: 'labels', max: 3, itemMax: 10 },
    body: { type: 'string', description: 'file content', min: 0, max: 100, multiline: true },
  },
};

const ok = (raw) => {
  const r = C.validateArgs(CONTRACT, raw);
  assert.equal(r.ok, true, `expected valid, got: ${r.ok ? '' : r.errors.join('; ')}`);
  return r.args;
};
const bad = (raw) => {
  const r = C.validateArgs(CONTRACT, raw);
  assert.equal(r.ok, false, `expected invalid, but it was accepted as ${JSON.stringify(r.ok ? r.args : null)}`);
  return r.errors.join('; ');
};

test('the validator loaded, and a correct call really does pass', () => {
  // Non-vacuity: every refusal below is worth nothing if the validator refuses everything.
  const args = ok({ url: 'https://example.com', width: 800, extract: 'links', tags: ['a', 'b'], deep: true });
  assert.equal(args.url, 'https://example.com');
  assert.equal(args.width, 800);
  assert.equal(args.extract, 'links');
  assert.deepEqual(args.tags, ['a', 'b']);
});

/* ------------------------------------------------------------------ numbers --- */

test('NaN, Infinity and a numeric STRING are all refused where a number is required', () => {
  for (const width of [Number.NaN, Infinity, -Infinity, '1280', '1280px', null === undefined ? 0 : '']) {
    if (width === '') continue;
    const errors = bad({ url: 'https://example.com', width });
    assert.match(errors, /width must be a finite number/, `width=${String(width)} slipped through`);
  }
});

test('a NaN that would have defeated a bounds check never reaches one', () => {
  // `NaN > 2000` is false and `NaN < 320` is false, so a range check on NaN passes by doing
  // nothing at all. The type check has to come first, and this asserts the ordering.
  const r = C.validateArgs(CONTRACT, { url: 'https://example.com', width: Number.NaN });
  assert.equal(r.ok, false);
  assert.equal(r.errors.some((e) => /must be >=|must be <=/.test(e)), false, 'a range complaint about NaN means the range check ran on it');
});

test('a fraction is not an integer, and the difference is enforced', () => {
  assert.match(bad({ url: 'https://example.com', width: 800.5 }), /whole number/);
  assert.equal(ok({ url: 'https://example.com', ratio: 0.25 }).ratio, 0.25, 'but a genuine number argument accepts a fraction');
});

test('bounds are enforced at both ends, inclusively', () => {
  assert.match(bad({ url: 'https://example.com', width: 319 }), /width must be >= 320/);
  assert.match(bad({ url: 'https://example.com', width: 2001 }), /width must be <= 2000/);
  assert.equal(ok({ url: 'https://example.com', width: 320 }).width, 320);
  assert.equal(ok({ url: 'https://example.com', width: 2000 }).width, 2000);
});

/* -------------------------------------------------------------------- enums --- */

test('an enum is checked against an explicit list, not by looking the value up in a table', () => {
  // `__proto__` and `constructor` are the two values that exist on every object. A membership test
  // written as a lookup would report a hit for both.
  for (const extract of ['__proto__', 'constructor', 'prototype', 'toString', 'TEXT', 'anything']) {
    assert.match(bad({ url: 'https://example.com', extract }), /must be one of/, `extract=${extract} was accepted`);
  }
  assert.equal(ok({ url: 'https://example.com', extract: 'text' }).extract, 'text');
});

/* ------------------------------------------------------------ unknown keys --- */

test('an argument nobody declared is an error, not a shrug', () => {
  const errors = bad({ uri: 'https://example.com' });
  assert.match(errors, /unknown argument uri/);
  assert.match(errors, /url is required/, 'and the real problem — the missing argument — is named too');
});

test('a prototype-pollution key is refused by name and never assigned', () => {
  // THROUGH JSON.parse, which is how arguments actually arrive — `runTool` parses the model's
  // string. The distinction matters and cost this test a rewrite: in an object LITERAL,
  // `__proto__:` sets the prototype and creates no own property at all, so a literal here would
  // have been refused by nothing and proved nothing. `JSON.parse` creates a genuine own property
  // named `__proto__`, which is the input an attacker can actually deliver.
  const raw = JSON.parse('{"url":"https://example.com","__proto__":{"polluted":true}}');
  assert.equal(Object.prototype.hasOwnProperty.call(raw, '__proto__'), true, 'the fixture is not the dangerous shape');
  const r = C.validateArgs(CONTRACT, raw);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /__proto__ is not an argument name/);
  assert.equal({}.polluted, undefined, 'Object.prototype was modified');
});

test('constructor and prototype are refused as argument names too', () => {
  for (const key of ['constructor', 'prototype']) {
    const raw = JSON.parse(`{"url":"https://example.com","${key}":1}`);
    const r = C.validateArgs(CONTRACT, raw);
    assert.equal(r.ok, false, `${key} was accepted as an argument name`);
    assert.match(r.errors.join(' '), new RegExp(`${key} is not an argument name`));
  }
});

test('every error is returned at once, so a caller fixes one call rather than four', () => {
  const r = C.validateArgs(CONTRACT, { width: 'big', extract: 'nope', tags: 'not-an-array' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 4, `only ${r.errors.length} errors: ${r.errors.join('; ')}`);
});

/* ------------------------------------------ required, null, and the default --- */

test('a required argument that is absent, null or the wrong type is named', () => {
  assert.match(bad({}), /url is required/);
  assert.match(bad({ url: null }), /url is required/);
  assert.match(bad({ url: 42 }), /url must be a string/);
});

test('null on an OPTIONAL argument means "not passing it", and the default applies', () => {
  const args = ok({ url: 'https://example.com', width: null, extract: null });
  assert.equal(args.width, 1280);
  assert.equal(args.extract, 'text');
});

test('a default never overwrites a value that was given, even a falsy one', () => {
  assert.equal(ok({ url: 'https://example.com', deep: false }).deep, false);
  assert.equal(ok({ url: 'https://example.com' }).deep, false);
  assert.equal(ok({ url: 'https://example.com', deep: true }).deep, true);
});

test('a present-but-invalid argument does NOT silently fall back to its default', () => {
  // The quiet version of this bug: `width: 'huge'` becoming 1280 and the call proceeding as
  // though the caller asked for 1280.
  const r = C.validateArgs(CONTRACT, { url: 'https://example.com', width: 'huge' });
  assert.equal(r.ok, false);
});

/* ------------------------------------------------------------------ strings --- */

test('a control character in a single-line argument is refused', () => {
  for (const url of ['https://example.com\nHost: evil', 'https://example.com\r\nX: 1', 'https://ex\u0000ample.com']) {
    assert.match(bad({ url }), /control character/, `${JSON.stringify(url)} was accepted`);
  }
});

test('but file CONTENT may contain newlines and tabs, because that is what content is', () => {
  const args = ok({ url: 'https://example.com', body: 'line one\n\tline two\n' });
  assert.equal(args.body, 'line one\n\tline two\n');
  // And a genuinely dangerous control character is still refused there.
  assert.match(bad({ url: 'https://example.com', body: 'a\u0000b' }), /control character/);
});

test('length limits are enforced on strings and on arrays', () => {
  assert.match(bad({ url: 'https://' + 'a'.repeat(300) }), /at most 200 characters/);
  assert.match(bad({ url: 'https://example.com', tags: ['a', 'b', 'c', 'd'] }), /at most 3 entries/);
  assert.match(bad({ url: 'https://example.com', tags: ['a'.repeat(20)] }), /at most 10 characters/);
  assert.match(bad({ url: 'https://example.com', tags: ['a', 7] }), /tags\[1\] must be a string/);
});

test('one bad argument does not invalidate a good one of a different kind', () => {
  // `checkStringArray` used to consult the SHARED error list to decide whether its own array was
  // fine, so an unrelated bad field would discard a perfectly good array.
  const r = C.validateArgs(CONTRACT, { url: 42, tags: ['fine'] });
  assert.equal(r.ok, false);
  assert.equal(r.errors.some((e) => e.startsWith('tags')), false, `tags was blamed for url's mistake: ${r.errors.join('; ')}`);
});

/* ----------------------------------------------------------- the raw payload --- */

test('arguments that are not an object at all are refused without throwing', () => {
  for (const raw of ['a string', 42, true, ['an', 'array']]) {
    const r = C.validateArgs(CONTRACT, raw);
    assert.equal(r.ok, false);
    assert.match(r.errors.join(' '), /must be a JSON object/);
  }
});

test('an absent payload is the same as an empty one — and still fails a required argument', () => {
  for (const raw of [undefined, null]) {
    const r = C.validateArgs(CONTRACT, raw);
    assert.equal(r.ok, false);
    assert.match(r.errors.join(' '), /url is required/);
  }
});

/* ------------------------------------------------ the schema the model sees --- */

test('the advertised schema is DERIVED from the contract, so the two cannot drift', () => {
  // The bug this rules out: a schema that advertises `maxBytes` while the validator calls it
  // `max_bytes`, so every obedient call is rejected for passing an argument it was told to pass.
  const params = C.contractParameters(CONTRACT);
  assert.deepEqual(Object.keys(params.properties).sort(), Object.keys(CONTRACT.args).sort());
  assert.deepEqual(params.required, ['url']);
  assert.deepEqual(params.properties.extract.enum, ['text', 'links']);
  assert.equal(params.properties.width.minimum, 320);
  assert.equal(params.properties.width.maximum, 2000);
  assert.equal(params.properties.tags.type, 'array');
  assert.equal(params.properties.tags.items.type, 'string');
  assert.equal(params.properties.width.default, 1280);
});

test('every property the schema advertises is one the validator will accept', () => {
  // Drives the point home by ROUND-TRIPPING: each advertised key is passed with a plausible value
  // and must not come back as "unknown argument".
  const params = C.contractParameters(CONTRACT);
  const sample = { url: 'https://example.com', width: 400, ratio: 0.5, extract: 'text', deep: true, tags: ['x'], body: 'hi' };
  for (const key of Object.keys(params.properties)) {
    const r = C.validateArgs(CONTRACT, { url: 'https://example.com', [key]: sample[key] });
    assert.equal(r.ok, true, `the schema advertises "${key}" but the validator rejects it: ${r.ok ? '' : r.errors.join('; ')}`);
  }
});

test('the error message names the tool, so a model can tell which call it is fixing', () => {
  const r = C.validateArgs(CONTRACT, {});
  assert.match(C.errorsToMessage(CONTRACT, r.errors), /^demo: /);
});
