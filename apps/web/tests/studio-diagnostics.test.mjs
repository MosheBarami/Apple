/**
 * THE CONNECTION RECORD, WHERE A PERSON CAN READ IT.
 *
 * The worker has answered `GET /api/projects/:id/studio/diagnostics` for a while — the bound place
 * and its id, when the pairing was made, when its 30-day clock runs out, any place mismatch, and
 * the last 25 operations — and `POST .../studio/disconnect` and `POST .../studio/place/rebind`
 * have existed beside it. Three routes, all tested at the HTTP level, none of them called by
 * anything in the web app. Meanwhile two docs pages instruct the user to "disconnect from the web
 * workspace", which was a promise with no control behind it, and the workspace could say nothing
 * about the link beyond a live socket pill.
 *
 * WHAT THESE TESTS ARE REALLY GUARDING is the honesty of the three states. "We have not asked
 * yet", "we asked and could not tell" and "not paired" are three different sentences, and only the
 * last one is a fact about the project. The dashboard card already demonstrates the failure this
 * prevents: it reads `projects.place_name`, which nothing writes, so it says "Not linked" about a
 * project that is paired right now.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');
const DIALOG = readFileSync(join(WEB, 'src', 'components', 'pairing-dialog.tsx'), 'utf8');
const WORKER = readFileSync(join(WEB, '..', 'worker', 'src', 'index.ts'), 'utf8');

/**
 * One exported declaration, from `export const <name>` to the blank line after it.
 *
 * NOT "up to the first semicolon", which is what this read the first time: an inline return type
 * like `Promise<{ ok: boolean; revoked: boolean }>` carries its own semicolons, so that cut the
 * body off at the type annotation and the assertion below failed for a reason that had nothing to
 * do with what it guards. A test that fails for the wrong reason is one somebody edits until it
 * passes.
 */
function decl(name) {
  const m = new RegExp(`export const ${name}[\\s\\S]*?\\n\\n`).exec(API);
  assert.ok(m, `${name} is not declared in api.ts`);
  return m[0];
}

// -------------------------------------------------------------- the clients exist and match ---

test('each client names a path the worker actually serves', () => {
  //[[ The defect this codebase keeps finding, in the opposite direction.
  //
  //   Usually it is a control posting to a route nobody wrote. Here the routes were written first,
  //   so the risk is a client that misspells one and fails as a 404 the user reads as "not
  //   connected". Every path below is checked against index.ts's own route table. ]]
  const wants = [
    ['fetchStudioDiagnostics', '/studio/diagnostics', "app.get('/api/projects/:id/studio/diagnostics'"],
    ['disconnectStudio', '/studio/disconnect', "app.post('/api/projects/:id/studio/disconnect'"],
    ['rebindPlace', '/studio/place/rebind', "app.post('/api/projects/:id/studio/place/rebind'"],
  ];
  for (const [fn, path, route] of wants) {
    assert.match(API, new RegExp(`export const ${fn}`), `${fn} does not exist`);
    const body = decl(fn);
    assert.ok(body.includes(path), `${fn} does not call ${path}`);
    assert.ok(body.includes('encodeURIComponent(projectId)'), `${fn} interpolates an unescaped project id`);
    assert.ok(WORKER.includes(route), `the worker no longer serves ${path}`);
  }
});

test('the two that change something are POSTs, and the one that reads is not', () => {
  assert.match(decl('disconnectStudio'), /method: 'POST'/);
  assert.match(decl('rebindPlace'), /method: 'POST'/);
  assert.ok(!/method: 'POST'/.test(decl('fetchStudioDiagnostics')), 'the diagnostics read is a POST');
});

// ----------------------------------------------------------------- it is rendered somewhere ---

test('the pairing dialog is the surface, and it asks', () => {
  // The Connect control already opens this dialog from the topbar and the palette, so there is no
  // new way in to build — which is the reason it goes here and not behind another button.
  assert.match(DIALOG, /fetchStudioDiagnostics/, 'the dialog never reads the connection record');
  assert.match(DIALOG, /disconnectStudio/, "the docs' 'disconnect from the web workspace' still has no control");
  assert.match(DIALOG, /rebindPlace/, 'there is no way out of a place mismatch but re-pairing');
});

test('the record shows the place, the pairing date and the expiry', () => {
  // The 30-day clock is the thing a user cannot otherwise discover. Its absence is why a pairing
  // that lapses reads as the plugin breaking.
  for (const field of ['placeName', 'pairedAt', 'pairingExpiresAt']) {
    assert.match(DIALOG, new RegExp(`\\b${field}\\b`), `the record does not show ${field}`);
  }
});

test('a place mismatch is shown in the worker’s own words, not re-worded here', () => {
  //[[ studio-place.ts writes that message with the two place names in it and the reason the
  //   binding refused. Restating it in the client would produce a second explanation that drifts
  //   from the one the plugin and the oplog carry. ]]
  assert.match(DIALOG, /placeMismatch/, 'a mismatched place is invisible in the dialog');
  assert.match(DIALOG, /placeMismatch\.message|mismatch\.message/, 'the mismatch is re-worded rather than quoted');
});

// ---------------------------------------------------- a failure to observe is not an answer ---

test('NOT ASKED YET, COULD NOT TELL, and NOT PAIRED are three different states', () => {
  //[[ The rule this product is built on, at the one place where breaking it is most tempting.
  //
  //   A diagnostics call that 404s or times out must not render as "no Studio is connected" — the
  //   user then goes and re-pairs a project that was already paired, and the second pairing
  //   supersedes the first. The dialog must be able to say "we could not check". ]]
  assert.match(DIALOG, /isPending|isLoading/, 'the in-flight state is not distinguished');
  assert.match(DIALOG, /isError/, 'a failed check is not distinguished from a negative answer');
  const failure = /isError[\s\S]{0,400}?\n/.exec(DIALOG)[0];
  assert.ok(
    /could not|couldn|unable/i.test(failure),
    'a failed diagnostics check does not say that it failed',
  );
});

test('the dialog never claims "not paired" from anything but a paired:false answer', () => {
  // `link.paired` is the worker's own field. Deriving the claim from a falsy `data` — which is
  // also what pending and error look like — is the failure-to-observe pattern written as one `?:`.
  assert.match(DIALOG, /link\.paired|\.paired\b/, 'the paired flag is never read');
});

// ------------------------------------------------------------------------ disconnect is real ---

test('disconnecting asks first, and says what it costs', () => {
  // It revokes the plugin's token: the next poll is answered 401 and Studio clears its session.
  // That is not recoverable with an undo, so it takes a confirmation rather than a toast.
  const section = DIALOG.slice(DIALOG.indexOf('disconnectStudio'));
  assert.ok(/confirm|Are you sure|sure\?/i.test(section), 'disconnect fires on a single click with no confirmation');
});

// F-008, measured 2026-09-22: the plugin dock read "Apple-Acceptance-2026-09-22.rbxl" while this row
// said "Paired to a place Studio has not named". An unpublished place reports placeId 0 and is never
// BOUND, but Studio did name it, and `openPlace` carries that name. "Has not named" is only true when
// Studio has reported nothing at all.
test('an unpublished place is named from what Studio reported, not called unnamed', () => {
  assert.match(DIALOG, /const open = record\.data\.openPlace;/, 'the dialog must read what Studio last reported');
  const row = /<p className="pairing-record__place">\{([^}]*)\}<\/p>/.exec(DIALOG);
  assert.ok(row, 'the place row was not found — this test would check nothing');
  assert.match(row[1], /open \? open\.placeName/, 'with no bound place, the reported name is shown');
  assert.ok(row[1].indexOf('open.placeName') < row[1].indexOf('has not named'),
    '"has not named" must be the last resort, after the reported name');
  assert.match(DIALOG, /Not published to Roblox yet/, 'placeId 0 is explained, not shown as "Place 0"');
});
