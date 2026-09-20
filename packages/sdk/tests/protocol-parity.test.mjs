// The SDK's runtime allowlists against the TypeScript unions they copy.
//
// WHY A COPY EXISTS AT ALL. `@golem/shared` is TypeScript. This SDK is plain JavaScript that
// Node, a browser, a CLI and a Worker all load with no build step, and a TypeScript union
// does not exist at runtime anyway — `MODES` has to be a real array or nothing can check a
// mode that arrived from a CLI flag or from Python.
//
// WHY THIS TEST EXISTS. A copy nothing checks is drift with a delay on it. Adding a fourth
// mode to `GolemMode`, or a `pause` variant to `ClientMsg`, would leave this SDK rejecting a
// message the server accepts — and the SDK's own tests would stay green, because they only
// ever ask the SDK about itself.
//
// EVERY ASSERTION IS ANCHORED TO ONE DECLARATION, never to "this string appears in the file".
// `'clay'` occurs in several places in shared/index.ts; a search would be satisfied by any of
// them and would never go red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WS_JWT_PREFIX, WS_SUBPROTOCOL, socketProtocols } from '../src/wire.mjs';
import { CLIENT_MSG_TYPES, DEFAULT_BASE_URL, MODES } from '../src/wire.mjs';
import { STOP_REASONS } from '../src/stream.mjs';
import { PLAN_IDS } from '../src/client.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SHARED = join(ROOT, 'packages/shared/src/index.ts');
const source = readFileSync(SHARED, 'utf8');

/** The text of one `export <kind> <Name> =` declaration, up to the next top-level export. */
function declaration(header) {
  const start = source.indexOf(header);
  assert.notEqual(start, -1, `${SHARED} no longer contains "${header}" — this test is measuring nothing`);
  const after = source.slice(start + header.length);
  const end = after.search(/\n(?:export|\/\*\*)/);
  return after.slice(0, end === -1 ? after.length : end);
}

const quoted = (text) => [...text.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

test('MODES is exactly the GolemMode union', () => {
  const declared = quoted(declaration('export type GolemMode ='));
  assert.ok(declared.length >= 2, 'the union was not parsed — fix this test before trusting it');
  assert.deepEqual([...MODES].sort(), [...declared].sort());
});

test('CLIENT_MSG_TYPES is exactly the set of ClientMsg variants', () => {
  const body = declaration('export type ClientMsg =');
  // Each variant is `{ type: 'name'; ... }`. Anchored to the `type:` field so that a
  // `mode: 'clay'` or a comment elsewhere in the union cannot satisfy the match.
  const declared = [...body.matchAll(/\{\s*type:\s*'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(declared.length >= 5, `parsed only ${declared.length} variants — the shape changed`);
  assert.deepEqual([...CLIENT_MSG_TYPES].sort(), [...new Set(declared)].sort());
});

test('STOP_REASONS is exactly the msg_end stopReason union', () => {
  const body = declaration('export type ServerMsg =');
  const line = /stopReason:\s*([^;]+);/.exec(body);
  assert.ok(line, 'ServerMsg no longer declares a stopReason — this test is measuring nothing');
  const declared = quoted(line[1]);
  assert.deepEqual([...STOP_REASONS].sort(), [...declared].sort());
});

test('PLAN_IDS is exactly the keys of PLAN_LIMITS', () => {
  const body = declaration('export const PLAN_LIMITS = {');
  const declared = [...body.matchAll(/^\s{2}([a-z]+):\s*\{\s*creditsPerDay/gm)].map((m) => m[1]);
  assert.ok(declared.length >= 2, `parsed only ${declared.length} plans — the shape changed`);
  assert.deepEqual([...PLAN_IDS].sort(), [...declared].sort());
});

test('the WebSocket subprotocol literals match the ones the worker echoes', () => {
  const auth = readFileSync(join(ROOT, 'apps/worker/src/auth.ts'), 'utf8');
  const session = readFileSync(join(ROOT, 'apps/worker/src/do/session.ts'), 'utf8');
  // Anchored to the LINES that carry the claim: the prefix the worker slices the token out
  // of, and the value it echoes back in the handshake response.
  // THIS TEST IS CALLED "parity" AND HAD ONLY ONE SIDE IN IT. Both assertions compared the
  // worker's literal against a string typed into this file, so the SDK's own WS_JWT_PREFIX and
  // WS_SUBPROTOCOL were never read. Measured: changing WS_JWT_PREFIX to 'apple.jwt.' and
  // WS_SUBPROTOCOL to 'apple.v1' left all ten test files green, 81 pass 0 fail, both times.
  // stream.test.mjs does not catch it either — it builds its expected array FROM the same two
  // constants it is meant to be checking, which is a tautology wearing an assertion's clothes.
  //
  // These two literals are on the never-rename list for the reason this test exists: a client
  // that sends 'apple.v1' to a worker expecting 'golem.v1' does not fail loudly, it fails as a
  // handshake that never completes. Compare the SDK's constants to the worker's, so a rename on
  // EITHER side reddens.
  const prefixLine = /const tok = parts\.find\(\(p\) => p\.startsWith\('([^']+)'\)\);/.exec(auth);
  assert.ok(prefixLine, 'bearerToken no longer reads a subprotocol — re-read auth.ts');
  assert.equal(prefixLine[1], WS_JWT_PREFIX, 'the worker slices a prefix the SDK does not send');
  assert.equal(WS_JWT_PREFIX, 'golem.jwt.', 'and the shared value is the one the wire is pinned to');

  const echoLine = /'Sec-WebSocket-Protocol': '([^']+)'/.exec(session);
  assert.ok(echoLine, 'the DO no longer echoes a subprotocol — re-read do/session.ts');
  assert.equal(echoLine[1], WS_SUBPROTOCOL, 'the worker echoes a subprotocol the SDK does not offer');
  assert.equal(WS_SUBPROTOCOL, 'golem.v1', 'and the shared value is the one the wire is pinned to');

  // The handshake array the SDK actually sends must be built from those same two constants.
  const offered = socketProtocols('tok-123');
  assert.deepEqual(offered, [WS_SUBPROTOCOL, `${WS_JWT_PREFIX}tok-123`]);
});

/*
 * THE DEFAULT HOST, IN ALL THREE CLIENTS AND THE SHARED PACKAGE.
 *
 * The JS and Python clients shipped with `https://golem.moshe-barami111.workers.dev` as their
 * default while the Luau client already used `apple`. That is not a cosmetic split: the legacy
 * host serves /api/* from a SEPARATE, OLDER deployment — measured 2026-09-20, /api/health gave
 * buildSha 44d9ded-dirty there against e30b7f9-dirty on the canonical origin, 31 commits apart —
 * and the page redirect that moves a browser across deliberately EXEMPTS /api/*, so no SDK caller
 * was ever carried over. Anyone handed this package talked to a month-old worker and had no way to
 * see it.
 *
 * The existing guard, apps/worker/tests/legacy-host.test.mjs's 'no shipped client points at the
 * legacy host', lists three client files and neither of the two that were wrong. It passed the
 * whole time. This one is anchored to the DECLARATIONS, in this package's own suite, so the
 * package that ships the defaults is the package that fails.
 */
test('every SDK client defaults to the canonical origin, never the legacy host', () => {
  const canonical = declaration('export const PRODUCT_ORIGIN =').match(/'([^']+)'/)?.[1];
  assert.equal(canonical, 'https://apple.moshe-barami111.workers.dev',
    'PRODUCT_ORIGIN in @golem/shared is not what this test was written against — re-read it');
  const legacy = declaration('export const LEGACY_PRODUCT_HOST =').match(/'([^']+)'/)?.[1];
  assert.ok(legacy, 'LEGACY_PRODUCT_HOST is gone from @golem/shared — re-aim this test');

  // (1) The JavaScript default, via the value the client actually resolves against.
  assert.equal(DEFAULT_BASE_URL, canonical);

  // (2) The Python default, read from its declaration rather than from a grep of the file.
  const py = readFileSync(join(ROOT, 'packages/sdk/python/apple_sdk/client.py'), 'utf8');
  const pyDefault = /^DEFAULT_BASE_URL = "([^"]+)"/m.exec(py);
  assert.ok(pyDefault, 'the Python client no longer declares DEFAULT_BASE_URL — re-aim this test');
  assert.equal(pyDefault[1], canonical);

  // (3) The Luau default, which was already right and must stay right.
  const luau = readFileSync(join(ROOT, 'packages/sdk/luau/AppleClient.luau'), 'utf8');
  const luauDefault = /Client\.DEFAULT_API = "([^"]+)"/.exec(luau);
  assert.ok(luauDefault, 'the Luau client no longer declares DEFAULT_API — re-aim this test');
  assert.equal(luauDefault[1], canonical);

  // (4) And nothing shipped by this package may name the legacy host at all. The wire literals
  //     `golem.v1` / `golem.jwt.` / `X-Golem-` are a different question and are pinned above.
  for (const rel of [
    'packages/sdk/src/wire.mjs',
    'packages/sdk/src/client.mjs',
    'packages/sdk/src/http.mjs',
    'packages/sdk/bin/apple.mjs',
    'packages/sdk/python/apple_sdk/client.py',
    'packages/sdk/luau/AppleClient.luau',
    'packages/sdk/README.md',
  ]) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    // The comment explaining WHY the default moved has to be allowed to name the old host.
    const code = text.split('\n').filter((l) => !/^\s*(\/\/|#|--|\*|\/\*)/.test(l)).join('\n');
    assert.ok(!code.includes(legacy), `${rel} still points a shipped client at ${legacy}`);
  }
});

/*
 * A COMMENT THAT NAMES A TYPE MUST NAME ONE THAT EXISTS.
 *
 * packages/shared/src/index.ts carried, twice, "still carries `mode: AppleMode`" and "keeps a
 * stored session's `mode: AppleMode` meaning the same thing". There is no AppleMode. The sentences
 * are not decoration — they exist to tell the next person WHICH DECLARATION is load-bearing before
 * they rename it, and they pointed at a declaration that could not be found, so the warning was
 * unactionable. The type is `GolemMode`, and it is on the wire and in the Durable Object's SQLite.
 *
 * This lives in the SDK suite because packages/shared is exempt from `pnpm -r test` by
 * scripts/check-workspace-coverage.mjs ("no runtime behaviour of its own"), and this file already
 * exists to keep that file's text from drifting away from its declarations.
 */
test('every backticked *Mode name in @golem/shared is a type that exists', () => {
  // Every backtick-quoted SPAN, then the *Mode identifiers inside it. NOT
  // /`([A-Z][A-Za-z]*Mode)`/ — the defect's own form is `mode: AppleMode`, where the backtick sits
  // before `mode:`, so a pattern anchored to the identifier's own backticks walks straight past it.
  // This test was written that way first and the deliberate re-break stayed green, which is the
  // only reason the aim is stated here instead of assumed.
  const modeNamesIn = (text) => [...new Set(
    [...text.matchAll(/`([^`\n]{1,120})`/g)]
      .flatMap((m) => [...m[1].matchAll(/\b([A-Z][A-Za-z]*Mode)\b/g)].map((x) => x[1])),
  )];
  // The aim, pinned on a fixture rather than on whatever shared happens to say today.
  assert.deepEqual(modeNamesIn('still carries `mode: AppleMode`, the DO persists it'), ['AppleMode'],
    'the extractor no longer sees the form this defect took — re-aim it before trusting the result');
  const named = modeNamesIn(source);
  assert.ok(named.includes('GolemMode'),
    `the scan of shared found ${JSON.stringify(named)} and not GolemMode — re-aim this test`);
  const declared = new Set([...source.matchAll(/export type ([A-Za-z]*Mode)\b/g)].map((m) => m[1]));
  assert.ok(declared.has('GolemMode'), 'GolemMode is no longer declared — re-aim this test');
  const invented = named.filter((n) => !declared.has(n));
  assert.deepEqual(invented, [],
    `these comments name types that do not exist: ${invented.join(', ')} (declared: ${[...declared].join(', ')})`);
});
