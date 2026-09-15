// The undo, rehearsed against a throwaway origin — including the failure it exists to prevent.
//
// docs/FAILURES.md F-62 ends with the rule: "rehearse the undo before you need it, on the same
// standard as watching a gate go red. An undo you have not watched work is not an undo." These
// tests are that rehearsal, run on every suite: a real HTTP origin on 127.0.0.1, the real
// `infra/rollback-static.mjs`, the real `infra/deploy-static.mjs` doing the uploading, and a
// capture directory in the same shape `infra/capture-rollback.mjs` writes.
//
// THE CENTRAL CASE IS AN UPLOADER THAT ACCEPTS EVERYTHING AND STORES NOTHING. That is exactly
// what the documented rollback command did — it returned success having transferred zero bytes —
// and a restore is the one operation where the operator has no way to notice. Here the origin is
// told to answer 200 and write nothing, and the assertion is that the run exits non-zero and that
// the string `ROLLBACK COMPLETE` never appears in its output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const execFile = promisify(execFileCb);

/**
 * A static origin in ~40 lines: a key-value store, the admin upload route deploy-static.mjs POSTs
 * to, and the `/route` → `/route/index.html` resolution the real worker performs.
 *
 * `mode` is how the origin misbehaves:
 *   'store'   — an honest origin.
 *   'silent'  — accepts every upload with 200 and writes NOTHING. F-62, as a server.
 *   'corrupt' — accepts every upload and stores different bytes under the right name.
 *   'reject:<path>' — HTTP 500 for that one path.
 */
async function fakeOrigin({ mode = 'store', store = new Map(), health = null } = {}) {
  const uploads = [];
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/admin/static-upload') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const payload = JSON.parse(body);
        uploads.push(payload.path);
        if (mode.startsWith('reject:') && payload.path === mode.slice('reject:'.length)) {
          res.writeHead(500).end('nope');
          return;
        }
        if (mode !== 'silent') {
          const bytes = Buffer.from(payload.b64, 'base64');
          const next = mode === 'corrupt' ? Buffer.from('not what was captured') : bytes;
          const prior = payload.append === true ? store.get(payload.path)?.body ?? Buffer.alloc(0) : Buffer.alloc(0);
          store.set(payload.path, { body: Buffer.concat([prior, next]), contentType: payload.contentType });
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      });
      return;
    }
    const url = req.url.split('?')[0];
    if (url === '/api/health') {
      const payload = health === null
        ? { ok: true, version: '0.2.0', buildSha: 'deadbeef', time: new Date().toISOString() }
        : health();
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
      return;
    }
    // The worker serves `/pricing` from the object stored at `/pricing/index.html`.
    const key = store.has(url) ? url : store.has(`${url.replace(/\/$/, '')}/index.html`) ? `${url.replace(/\/$/, '')}/index.html` : null;
    if (key === null) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    const row = store.get(key);
    res.writeHead(200, { 'content-type': row.contentType ?? 'application/octet-stream' }).end(row.body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, store, uploads, stop: () => new Promise((r) => server.close(r)) };
}

/** A capture directory in capture-rollback.mjs's shape: the bytes, plus a manifest describing them. */
function capture(files, over = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'golem-rollback-'));
  const entries = Object.entries(files);
  for (const [remote, { body }] of entries) {
    const dest = join(dir, remote);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, body);
  }
  const manifest = {
    origin: 'http://127.0.0.1:0',
    at: new Date().toISOString(),
    overwritable: entries.length,
    captured: entries.length,
    additions: 0,
    unrestorable: 0,
    failures: 0,
    files: entries.map(([remote, { body, contentType }]) => ({ remote, url: remote, bytes: body.length, contentType })),
    additionPaths: [],
    unrestorablePaths: [],
    failurePaths: [],
    ...over,
  };
  writeFileSync(join(dir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return dir;
}

//[[ ASYNC, AND THAT IS NOT A STYLE CHOICE.
//
//   The origin these scripts talk to is an HTTP server in THIS process. `execFileSync` blocks the
//   event loop for the whole life of the child, so the child's first request would arrive at a
//   server that cannot answer until the child exits, and the child does not exit until it is
//   answered: a deadlock that hangs the suite rather than failing it. Measured — the first version
//   of this file used execFileSync and produced no output at all for two minutes. ]]
async function run(script, args, env = {}) {
  try {
    const { stdout, stderr } = await execFile(process.execPath, [join(ROOT, 'infra', script), ...args], {
      cwd: ROOT, encoding: 'utf8',
      env: { ...process.env, GOLEM_ADMIN_KEY: 'test-admin-key', ...env },
    });
    return { exit: 0, out: `${stdout}${stderr}` };
  } catch (e) {
    return { exit: typeof e.code === 'number' ? e.code : 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** What was live before the bad deploy, and therefore what the capture holds. */
const GOOD = {
  '/index.html': { body: Buffer.from('<!doctype html><title>the good build</title>'), contentType: 'text/html; charset=utf-8' },
  '/styles.css': { body: Buffer.from('body{color:#111}'), contentType: 'text/css; charset=utf-8' },
};
/** What the bad deploy left on the origin. */
const badOrigin = () => new Map([
  ['/index.html', { body: Buffer.from('<!doctype html><title>the BAD build</title>'), contentType: 'text/html; charset=utf-8' }],
  ['/styles.css', { body: Buffer.from('body{color:red}'), contentType: 'text/css; charset=utf-8' }],
]);

test('a rehearsal states the whole plan and writes nothing', async () => {
  const origin = await fakeOrigin({ store: badOrigin() });
  const dir = capture(GOOD);
  try {
    const r = await run('rollback-static.mjs', ['--from', dir, '--base', origin.url, '--dry-run']);
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /ROLLBACK REHEARSED/);
    assert.match(r.out, /\/index\.html/);
    assert.equal(origin.uploads.length, 0, 'a rehearsal that wrote to the origin is not a rehearsal');
    // And its token is NOT the one a real restore prints: the two must never be confusable.
    assert.doesNotMatch(r.out, /ROLLBACK COMPLETE/);
    assert.equal(origin.store.get('/index.html').body.toString().includes('BAD'), true);
  } finally { rmSync(dir, { recursive: true, force: true }); await origin.stop(); }
});

test('a real restore puts the captured bytes back and says how many', async () => {
  const origin = await fakeOrigin({ store: badOrigin() });
  const dir = capture(GOOD);
  try {
    const r = await run('rollback-static.mjs', ['--from', dir, '--base', origin.url, '--yes']);
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /ROLLBACK COMPLETE — 2 of 2 path\(s\) restored and read back byte for byte/);
    // THE RELATIONSHIP, not the token: the origin now serves what was captured.
    for (const [remote, { body }] of Object.entries(GOOD)) {
      assert.equal(origin.store.get(remote).body.toString(), body.toString(), `${remote} was not actually put back`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); await origin.stop(); }
});

test('F-62 ITSELF: an origin that accepts every upload and stores nothing must not produce a success', async () => {
  // The uploader exits 0 for every file. The only thing that can tell the difference is reading
  // the bytes back, which is why the restore does it.
  const origin = await fakeOrigin({ mode: 'silent', store: badOrigin() });
  const dir = capture(GOOD);
  try {
    const r = await run('rollback-static.mjs', ['--from', dir, '--base', origin.url, '--yes']);
    assert.equal(r.exit, 1, 'a restore that changed nothing exited 0');
    assert.doesNotMatch(r.out, /ROLLBACK COMPLETE/, 'the one string that may never appear over a no-op restore');
    assert.match(r.out, /ROLLBACK INCOMPLETE/);
    assert.match(r.out, /do not match the captured/);
    assert.equal(origin.uploads.length, 2, 'the uploads were attempted — that is what makes this the F-62 shape');
    assert.equal(origin.store.get('/index.html').body.toString().includes('BAD'), true, 'the origin is still serving the bad build');
  } finally { rmSync(dir, { recursive: true, force: true }); await origin.stop(); }
});

test('an origin that stores the wrong bytes under the right name is caught by the read-back', async () => {
  const origin = await fakeOrigin({ mode: 'corrupt', store: badOrigin() });
  const dir = capture(GOOD);
  try {
    const r = await run('rollback-static.mjs', ['--from', dir, '--base', origin.url, '--yes']);
    assert.equal(r.exit, 1);
    assert.doesNotMatch(r.out, /ROLLBACK COMPLETE/);
    assert.match(r.out, /do not match the captured/);
  } finally { rmSync(dir, { recursive: true, force: true }); await origin.stop(); }
});

test('an upload the origin rejects is named, and the run reports the origin as mixed', async () => {
  const origin = await fakeOrigin({ mode: 'reject:/styles.css', store: badOrigin() });
  const dir = capture(GOOD);
  try {
    const r = await run('rollback-static.mjs', ['--from', dir, '--base', origin.url, '--yes']);
    assert.equal(r.exit, 1);
    assert.match(r.out, /\/styles\.css/);
    assert.match(r.out, /ROLLBACK INCOMPLETE — 1 of 2/);
    // The half that did work is still reported as done: a mixed origin is the state to describe.
    assert.equal(origin.store.get('/index.html').body.toString(), GOOD['/index.html'].body.toString());
  } finally { rmSync(dir, { recursive: true, force: true }); await origin.stop(); }
});

test('a capture missing the bytes it claims to hold is refused before anything is written', async () => {
  const origin = await fakeOrigin({ store: badOrigin() });
  const dir = capture(GOOD);
  try {
    rmSync(join(dir, 'styles.css'));
    const r = await run('rollback-static.mjs', ['--from', dir, '--base', origin.url, '--yes']);
    assert.equal(r.exit, 1);
    assert.match(r.out, /ROLLBACK REFUSED/);
    assert.equal(origin.uploads.length, 0, 'a refused rollback must not have started uploading');
  } finally { rmSync(dir, { recursive: true, force: true }); await origin.stop(); }
});

test('the undo will not run without being told which origin it is undoing', async () => {
  const r = await run('rollback-static.mjs', ['--from', '/tmp', '--yes']);
  assert.equal(r.exit, 2);
  assert.match(r.out, /--base <origin> is required/);
});

test('an unrecognised flag stops the run instead of being ignored', async () => {
  // F-63: `--no-model` was passed for several passes and did nothing, which is indistinguishable
  // from a flag that works. On a rollback the equivalent typo would be `--dryrun`, and it would
  // deploy instead of rehearsing.
  const r = await run('rollback-static.mjs', ['--from', '/tmp', '--base', 'http://127.0.0.1:1', '--dryrun']);
  assert.equal(r.exit, 2);
  assert.match(r.out, /unrecognised flag --dryrun/);
});

test('writing needs --yes, so a half-typed command rehearses rather than deploys', async () => {
  const r = await run('rollback-static.mjs', ['--from', '/tmp', '--base', 'http://127.0.0.1:1']);
  assert.equal(r.exit, 2);
  assert.match(r.out, /refusing to write without --yes/);
});

/* ------------------------------------------------ the health gate that fires it --- */

test('a healthy origin passes and nothing is rolled back', async () => {
  const origin = await fakeOrigin({ store: new Map([...badOrigin(), ['/app/index.html', { body: Buffer.from('<!doctype html>app'), contentType: 'text/html' }], ['/pricing/index.html', { body: Buffer.from('<!doctype html>pricing'), contentType: 'text/html' }]]) });
  try {
    const r = await run('healthcheck.mjs', ['--base', origin.url]);
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /HEALTH OK — 4 probe\(s\) passed/);
    assert.equal(origin.uploads.length, 0);
  } finally { await origin.stop(); }
});

test('AUTOMATIC ROLLBACK: a page served as a download fails the health gate and the undo runs itself', async () => {
  // The exact live defect: `/pricing` answered 200 with application/octet-stream, so every
  // browser downloaded the commercial page of the product instead of rendering it. A status-only
  // health check passes this origin.
  const store = new Map([
    ...badOrigin(),
    ['/app/index.html', { body: Buffer.from('<!doctype html>app'), contentType: 'text/html' }],
    ['/pricing/index.html', { body: Buffer.from('<!doctype html>pricing'), contentType: 'application/octet-stream' }],
  ]);
  const origin = await fakeOrigin({ store });
  const dir = capture(GOOD);
  try {
    const r = await run('healthcheck.mjs', ['--base', origin.url, '--rollback-on-failure', dir, '--yes']);
    assert.equal(r.exit, 1, 'a failed deploy may not exit 0 just because it was undone');
    assert.match(r.out, /application\/octet-stream/);
    assert.match(r.out, /ROLLBACK COMPLETE/);
    assert.match(r.out, /HEALTH FAILED AND WAS ROLLED BACK/);
    // The undo really ran: the origin serves the captured build again.
    assert.equal(store.get('/index.html').body.toString(), GOOD['/index.html'].body.toString());
  } finally { rmSync(dir, { recursive: true, force: true }); await origin.stop(); }
});

test('a health gate that fails and CANNOT roll back says so rather than exiting quietly', async () => {
  const origin = await fakeOrigin({ mode: 'silent', store: new Map([
    ...badOrigin(),
    ['/app/index.html', { body: Buffer.from('<!doctype html>app'), contentType: 'text/html' }],
    ['/pricing/index.html', { body: Buffer.from('x'), contentType: 'application/octet-stream' }],
  ]) });
  const dir = capture(GOOD);
  try {
    const r = await run('healthcheck.mjs', ['--base', origin.url, '--rollback-on-failure', dir, '--yes']);
    assert.equal(r.exit, 1);
    assert.match(r.out, /THE ROLLBACK DID NOT COMPLETE/);
    assert.doesNotMatch(r.out, /WAS ROLLED BACK/);
  } finally { rmSync(dir, { recursive: true, force: true }); await origin.stop(); }
});

test('a build deployed without a build sha fails the health gate, because nothing could compare it to HEAD', async () => {
  const origin = await fakeOrigin({
    store: new Map([...badOrigin(), ['/app/index.html', { body: Buffer.from('a'), contentType: 'text/html' }], ['/pricing/index.html', { body: Buffer.from('p'), contentType: 'text/html' }]]),
    health: () => ({ ok: true, version: '0.2.0', buildSha: 'unknown', time: new Date().toISOString() }),
  });
  try {
    const r = await run('healthcheck.mjs', ['--base', origin.url]);
    assert.equal(r.exit, 1);
    assert.match(r.out, /buildSha is "unknown"/);
    // CONTROL: the same origin passes once the operator has said they accept it.
    const allowed = await run('healthcheck.mjs', ['--base', origin.url, '--allow-unknown-sha']);
    assert.equal(allowed.exit, 0, allowed.out);
  } finally { await origin.stop(); }
});

test('a health run thinner than the floor is UNDECIDED, and exits neither 0 nor 1', async () => {
  const origin = await fakeOrigin({ store: new Map([...badOrigin(), ['/app/index.html', { body: Buffer.from('a'), contentType: 'text/html' }], ['/pricing/index.html', { body: Buffer.from('p'), contentType: 'text/html' }]]) });
  try {
    const r = await run('healthcheck.mjs', ['--base', origin.url, '--min-probes', '99']);
    assert.equal(r.exit, 2, 'could-not-look must not share an exit code with healthy or with unhealthy');
    assert.match(r.out, /HEALTH UNDECIDED/);
  } finally { await origin.stop(); }
});
