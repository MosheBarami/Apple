/**
 * THE SOUND THE PRODUCT GENERATED, AND THE 401 THE USER GOT FOR CLICKING "LISTEN".
 *
 * `generate_sound` stores a WAV in KV and builds an asset_picker block whose link is
 * `/api/projects/<id>/audio/<id>` labelled "Listen" (apps/worker/src/audio-tools.ts). The renderer
 * drew that link as a bare `<a href target="_blank">`. Every `/api/*` path on this worker requires
 * a Bearer JWT — bearerToken() reads the Authorization header and the WebSocket subprotocol, and an
 * anchor sends neither — so the click opened a new tab containing `{"error":"unauthorized"}`.
 *
 * This is the SAME defect image-expiry.test.mjs pinned for images, one media type later: a tag that
 * cannot authenticate pointed at a route that requires authentication. The fix is the same shape —
 * fetch the bytes with the token, hand the browser an object URL — and the reason it is worth a
 * test of its own is that the anchor looked correct in review both times.
 *
 * Two of these run REAL CODE rather than reading source: `parseAudioPath` is executed, and it is
 * executed against the path the WORKER builds, so the two halves cannot drift into a shape only one
 * of them accepts. The rest are source assertions, for the reason image-expiry.test.mjs states in
 * its header: apps/web has no DOM renderer, so the component's output is not executable here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');
const bundle = (abs, tag) => {
  const out = join(mkdtempSync(join(tmpdir(), `${tag}-`)), `${tag}.mjs`);
  // `import.meta.env` is Vite's, and node has no Vite. Defined away rather than stubbed, because
  // nothing under test here reads a variable out of it.
  execFileSync(ESBUILD, [abs, '--bundle', '--format=esm', '--platform=neutral',
    '--main-fields=main,module', '--define:import.meta.env={}', '--outfile=' + out], { stdio: 'pipe' });
  return out;
};

const API = await import(`file://${bundle(join(WEB, 'src', 'lib', 'api.ts'), 'api')}`);
const STORE = await import(`file://${bundle(join(WEB, '..', 'worker', 'src', 'audio-store.ts'), 'audiostore')}`);

const api = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');
const render = readFileSync(join(WEB, 'src', 'lib', 'generative-ui', 'render.tsx'), 'utf8');
const styles = readFileSync(join(WEB, 'src', 'styles.css'), 'utf8');

const PROJECT = '11111111-1111-4111-8111-111111111111';
const AUDIO = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

/* --------------------------------------------------- the two halves agree --- */

test('THE PATH THE WORKER BUILDS IS THE PATH THE BROWSER PARSES — one shape, checked across the packages', () => {
  const href = STORE.audioPathFor(PROJECT, AUDIO);
  const parsed = API.parseAudioPath(href);
  assert.deepEqual(parsed, { projectId: PROJECT, audioId: AUDIO }, 'the link generate_sound emits must be recognised as ours');
});

test('a link that is not one of our audio routes is not claimed', () => {
  // An asset_picker link can be any safe href — a Roblox catalogue page, a fragment. Claiming one
  // of those would replace a working link with a player fetching a path that is not audio.
  assert.equal(API.parseAudioPath('https://create.roblox.com/store/asset/123'), null);
  assert.equal(API.parseAudioPath(`/api/projects/${PROJECT}/images/${AUDIO}`), null, 'an image path is not an audio path');
  assert.equal(API.parseAudioPath(`/api/projects/${PROJECT}/audio/not-a-uuid`), null, 'the route 404s a non-UUID before it reaches KV');
  assert.equal(API.parseAudioPath(''), null);
});

/* --------------------------------------------------------- the authed fetch --- */

test('THE SOUND IS FETCHED WITH A TOKEN, not handed to the browser as a bare href', () => {
  assert.match(api, /export async function fetchAudioObjectUrl/, 'there must be an authed fetch for audio');
  const fn = api.slice(api.indexOf('export async function fetchAudioObjectUrl'));
  assert.match(fn.slice(0, 1400), /headers\.set\('Authorization', `Bearer \$\{token\}`\)/, 'carrying the bearer');
  assert.match(fn.slice(0, 1400), /URL\.createObjectURL/, 'and handing back something an <audio> can play');
});

test('the download goes through the same authenticated path, with the worker naming the file', () => {
  // The worker already serves `?download=1` as an attachment with a filename it builds itself
  // (apps/worker/src/index.ts). A second name invented in the browser would be a second rule.
  assert.match(api, /download=1/, 'the attachment branch must be reachable from the client');
  assert.match(api, /export async function downloadProjectAudio/, 'and there must be something that saves it');
});

test('the status survives, so an expired sound and a timed-out session are different sentences', () => {
  const fn = api.slice(api.indexOf('export async function fetchAudioObjectUrl'), api.indexOf('export async function downloadProjectAudio'));
  assert.match(fn, /res\.status === 404/, '404 is named');
  assert.match(fn, /,\s*res\.status\)/, 'and the status travels with the error');
});

/* -------------------------------------------------------------- the player --- */

test('A SOUND ASSET RENDERS A PLAYER, not an anchor that cannot authenticate', () => {
  assert.match(render, /fetchAudioObjectUrl\(/, 'the renderer must use the authed fetch');
  assert.match(render, /<audio\b/, 'and give the user something that plays');
  assert.match(render, /controls/, 'with controls, since there is no other way to start it');
  assert.match(render, /parseAudioPath\(/, 'and it must recognise our own path rather than assume every sound is ours');
});

test('the object URL is revoked, or a conversation holds every sound it ever played', () => {
  const player = render.slice(render.indexOf('function SafeAudio'), render.indexOf('function AssetPickerView'));
  assert.ok(player.length > 200, 'SafeAudio must exist and must come before the panel that uses it');
  assert.match(player, /URL\.revokeObjectURL/, 'the blob must be released');
  assert.match(player, /return \(\) => \{/, 'on unmount');
});

test('LOADING IS NOT FAILURE — the player has the third state the image panel needed', () => {
  const player = render.slice(render.indexOf('function SafeAudio'), render.indexOf('function AssetPickerView'));
  assert.match(player, /'loading' \| 'ready' \| 'failed'/, 'three states, not two');
  assert.match(player, /aria-busy="true"/, 'announced as busy rather than as a broken sound');
});

test('a foreign link still renders as a link, so nothing that worked stopped working', () => {
  const panel = render.slice(render.indexOf('function AssetPickerView'));
  assert.match(panel, /asset\.link &&/, 'the anchor branch must survive');
  assert.match(panel, /target="_blank"/, 'for links that really are elsewhere');
});

test('every class the player names exists in the stylesheet', () => {
  const player = render.slice(render.indexOf('function SafeAudio'), render.indexOf('function AssetPickerView'));
  const used = new Set();
  for (const m of player.matchAll(/className="([^"{]+)"/g)) for (const cls of m[1].split(/\s+/)) if (cls.startsWith('gu-')) used.add(cls);
  assert.ok(used.size > 0, 'the player must be styled at all');
  for (const cls of used) assert.ok(styles.includes(`.${cls}`), `.${cls} is used by the player and defined in no stylesheet`);
});
