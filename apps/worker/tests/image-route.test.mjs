// Serving a generated image.
//
// THE DEFECT. `generate_image` has parked PNGs in KV and handed back a key since it shipped, and
// nothing served them — there was no image route in index.ts at all. Every image the product
// generated therefore rendered as the client's expired-state fallback, telling the user their
// image had expired when in truth it had never been reachable once. Honest copy over a path that
// does not exist still reads as a broken feature, and it is worse than a blunt error because it
// blames a TTL for an absence.
//
// Reported twice by a peer session before it was picked up, which is its own finding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const INDEX = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');

const out = join(tmpdir(), `apple-image-route-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'imagegen.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const { imageKvKey, IMAGE_TTL_SECONDS, storeImage } = await import(`file://${out}`);
process.on('exit', () => rmSync(out, { force: true }));

const route = INDEX.slice(
  INDEX.indexOf("app.get('/api/projects/:id/images/:imageId'"),
  INDEX.indexOf("app.get('/api/projects/:id/memory'"),
);

/* ------------------------------------------------- the route exists at all --- */

test('there is a route that serves a generated image', () => {
  // The whole defect in one assertion. Everything below is about the route being RIGHT; this is
  // about it being there, which it was not.
  assert.ok(route.length > 0, 'no image route in index.ts — generated images are unreachable');
  assert.match(route, /app\.get\('\/api\/projects\/:id\/images\/:imageId'/);
});

/* ------------------------------------------ authorisation is in the address --- */

test('an image id alone cannot address an image — the project is half the key', () => {
  // EXECUTED, not asserted against source, because this is the authorisation. The pixels live
  // under `image:<projectId>:<imageId>`, so a caller who owns a different project cannot construct
  // a key into someone else's images whatever id they present.
  const imageId = '11111111-1111-4111-8111-111111111111';
  const mine = imageKvKey('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', imageId);
  const theirs = imageKvKey('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', imageId);
  assert.notEqual(mine, theirs, 'the same image id in two projects must not be the same key');
  assert.ok(mine.includes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'the project must appear in the key');
});

test('the route proves ownership BEFORE it builds a key', () => {
  // Order is the property. Reading KV first and checking ownership after would still return 404,
  // but it would confirm existence through timing and would be one refactor from leaking bytes.
  assert.ok(
    route.indexOf('withOwnedProject') < route.indexOf('imageKvKey'),
    'ownership must be established before the key is constructed',
  );
  // And the key is built from the PROVEN project row, never from the path parameter the caller sent.
  assert.match(route, /imageKvKey\(ctx\.project\.id,/);
  assert.equal(/imageKvKey\(\s*c\.req\.param\('id'\)/.test(route), false, 'the key must not come from unvalidated input');
});

test('the image id is validated before it is concatenated into a key', () => {
  // Without this, a crafted id containing `:` addresses a different namespace in the same KV store.
  assert.match(route, /UUID_RE\.test\(imageId\)/);
  assert.ok(route.indexOf('UUID_RE.test(imageId)') < route.indexOf('imageKvKey'), 'validate before building the key');
});

test('every failure is the same 404, so the route is not an existence oracle', () => {
  // "Not yours", "no such image" and "expired" must be indistinguishable to a stranger. A distinct
  // 403 would confirm that a given id exists in some other account.
  const statuses = [...route.matchAll(/,\s*(\d{3})\)/g)].map((m) => m[1]);
  assert.ok(statuses.length >= 3, `expected several failure returns, found ${statuses.length}`);
  assert.deepEqual([...new Set(statuses)], ['404'], `every failure must be 404, saw ${statuses.join(', ')}`);
});

/* ---------------------------------------------------------- what it returns --- */

test('the bytes are served as a private, non-sniffable image', () => {
  assert.match(route, /'Content-Type': 'image\/png'/);
  // PRIVATE: one user's generated content behind an authorised route. A shared cache holding it
  // would serve it to whoever asked next.
  assert.match(route, /'Cache-Control': `private, max-age=\$\{IMAGE_TTL_SECONDS\}`/);
  assert.equal(/Cache-Control['"`:\s]+['"`]public/.test(route), false, 'a public cache must never hold user pixels');
  assert.match(route, /'X-Content-Type-Options': 'nosniff'/);
});

test('a cached copy can never outlive the object it is a copy of', () => {
  // max-age is the TTL, not a number chosen beside it. If the two drifted apart a browser could
  // hold an image the store had already dropped, and the user would see it reappear and vanish
  // depending on which machine they opened.
  assert.match(route, /max-age=\$\{IMAGE_TTL_SECONDS\}/);
  assert.equal(typeof IMAGE_TTL_SECONDS, 'number');
  assert.ok(IMAGE_TTL_SECONDS > 0);
});

/* --------------------------------------------------- the storage side agrees --- */

test('storeImage refuses to park pixels anywhere but under a project', () => {
  // The signature is the guarantee: there is no overload that stores without a project, so a future
  // call site cannot quietly reintroduce an unscoped key.
  assert.equal(storeImage.length, 3, 'storeImage must take (env, pngBase64, projectId)');
  const TOOLS = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  assert.match(TOOLS, /if \(!ctx\.projectId\) return \{ error: 'generate_image needs a project/);
  assert.ok(
    TOOLS.indexOf("if (!ctx.projectId) return { error: 'generate_image needs a project") < TOOLS.indexOf('await storeImage('),
    'the refusal must precede the store',
  );
});

test('the tool still tells the model the pixels are not placed in the game', () => {
  // A serving route makes the image VISIBLE, which is exactly when a model starts claiming it has
  // been applied to a Decal. Nothing uploads to Roblox yet, and the description is the only thing
  // standing between the user and that sentence.
  const TOOLS = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  assert.match(TOOLS, /never tell the user the image has been placed/);
});
