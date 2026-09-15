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

// THE SLICE ENDS AT THE NEXT ROUTE, not at a named one several routes further down.
//
// It used to run from the image route to `app.get('/api/projects/:id/memory')`, which swept up
// every registration in between — the audio route already, and then the attachment routes when
// they landed. The "every failure is the same 404" assertion below then read OTHER routes' status
// codes and failed on a 413 that has nothing to do with this one. A fixture whose boundary is a
// distant landmark measures whatever happens to be parked between here and there.
const ROUTE_START = INDEX.indexOf("app.get('/api/projects/:id/images/:imageId'");
const NEXT_ROUTE = INDEX.indexOf('\napp.', ROUTE_START + 1);
const route = INDEX.slice(ROUTE_START, NEXT_ROUTE === -1 ? INDEX.length : NEXT_ROUTE);

/* ------------------------------------------------- the route exists at all --- */

test('the route is present in the source (NOT proof that it is registered)', () => {
  // READ THIS BEFORE TRUSTING THIS FILE. Every assertion here reads index.ts as a STRING. A refuter
  // demonstrated what that is worth: commenting the whole route out left all nine of these green,
  // including this one, whose name used to claim it asked whether the route existed. Registering it
  // on a never-mounted sub-app passed too. Source text is not registration.
  //
  // `image-route-live.test.mjs` is the oracle for that: it builds the Hono app and issues real
  // requests through it. What survives here is the cheap half — ordering, header spelling, the
  // comment contracts — which is worth keeping and is worth nothing on its own.
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
  assert.match(route, /'Cache-Control': `private, max-age=\$\{remainingLife\(metadata\)\}`/);
  assert.equal(/Cache-Control['"`:\s]+['"`]public/.test(route), false, 'a public cache must never hold user pixels');
  assert.match(route, /'X-Content-Type-Options': 'nosniff'/);
});

test('the cache directive is computed from the REMAINING life, not the full TTL', () => {
  // This test used to assert `max-age=${IMAGE_TTL_SECONDS}` and call it "a cached copy can never
  // outlive the object it is a copy of". That claim was false and this assertion was how it went
  // unnoticed: KV anchors expirationTtl at WRITE time and the header at RESPONSE time, so an image
  // fetched 59 minutes after it was stored was cached for a further hour — outliving the object by
  // nearly the whole TTL. A refuter did the arithmetic that this assertion could not.
  //
  // The behaviour is proven in image-route-live.test.mjs, which serves an image with 100 seconds
  // left and one already expired, and checks what each is actually cached for. What remains here is
  // the shape: the header must not be a constant again.
  assert.match(route, /max-age=\$\{remainingLife\(metadata\)\}/);
  assert.equal(/max-age=\$\{IMAGE_TTL_SECONDS\}/.test(route), false, 'a constant max-age is the defect, not the fix');
  assert.equal(typeof IMAGE_TTL_SECONDS, 'number');
  assert.ok(IMAGE_TTL_SECONDS > 0);
});

/* --------------------------------------------------- the storage side agrees --- */

test('storeImage refuses to park pixels anywhere but under a project', () => {
  // The signature is the guarantee: there is no overload that stores without a project, so a future
  // call site cannot quietly reintroduce an unscoped key.
  assert.equal(storeImage.length, 3, 'storeImage must take (env, pngBase64, projectId)');
  const TOOLS = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');

  // THIS ORACLE USED TO COMPARE TWO GLOBAL indexOf RESULTS:
  //
  //   TOOLS.indexOf("if (!ctx.projectId) return { error: 'generate_image…")
  //     < TOOLS.indexOf('await storeImage(')
  //
  // which pairs the FIRST occurrence of one string with the FIRST occurrence of the other — and
  // those belong to DIFFERENT CALL SITES the moment there is more than one. It was correct only
  // while `generate_image` was the sole caller. `screenshot_page` then grew its own storeImage
  // call, correctly guarded, ABOVE generate_image's guard, and the comparison inverted: the test
  // went red while every call site was scoped. A guard that gets LESS able to see the truth as the
  // subject grows is the worst gradient a guard can have, and it cost rbxai-04 a real
  // investigation before the property was confirmed intact by reading both sites.
  //
  // So assert the property PER CALL SITE instead of once globally: every store must pass a project
  // and must sit behind a refusal, however many callers there turn out to be.
  const sites = [];
  for (let i = TOOLS.indexOf('await storeImage('); i !== -1; i = TOOLS.indexOf('await storeImage(', i + 1)) {
    sites.push(i);
  }
  assert.ok(sites.length > 0, 'no storeImage call site found — the oracle is measuring nothing');

  for (const at of sites) {
    const line = TOOLS.slice(0, at).split('\n').length;
    const call = TOOLS.slice(at, TOOLS.indexOf(';', at));
    assert.match(
      call,
      /await storeImage\([^)]*,\s*ctx\.projectId\s*\)/,
      `tools.ts:${line} stores pixels without passing ctx.projectId as the key`,
    );
    // The refusal has to be REACHABLE from the call, so look only at the enclosing run of source
    // rather than anywhere in the file — the whole point of the previous failure.
    assert.match(
      TOOLS.slice(Math.max(0, at - 700), at),
      /if \(!ctx\.projectId\)/,
      `tools.ts:${line} calls storeImage with no !ctx.projectId refusal above it`,
    );
  }
});

test('the tool still tells the model the pixels are not placed in the game', () => {
  // A serving route makes the image VISIBLE, which is exactly when a model starts claiming it has
  // been applied to a Decal. Nothing uploads to Roblox yet, and the description is the only thing
  // standing between the user and that sentence.
  const TOOLS = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  assert.match(TOOLS, /never tell the user the image has been placed/);
});
