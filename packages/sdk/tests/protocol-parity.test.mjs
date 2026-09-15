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
import { CLIENT_MSG_TYPES, MODES } from '../src/wire.mjs';
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
  const declared = [...body.matchAll(/^\s{2}([a-z]+):\s*\{\s*sparksPerDay/gm)].map((m) => m[1]);
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
