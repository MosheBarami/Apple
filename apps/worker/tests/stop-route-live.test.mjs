// Execute the HTTP Stop route with a silent browser socket. The SessionDO boundary is
// a recording stub so this proves routing and access, while stop-signal.test.mjs proves
// what the DO does with the request.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(tmpdir(), `apple-stop-live-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [join(HERE, '..', 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
process.on('exit', () => rmSync(OUT, { force: true }));
const app = (await import(pathToFileURL(OUT).href)).default;
const { PROJECTS, MEMBERS } = await import(pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href);

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EDITOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VIEWER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OUTSIDER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROJECT = '11111111-1111-4111-8111-111111111111';
PROJECTS.set(PROJECT, OWNER);
MEMBERS.set(PROJECT, [{ user_id: EDITOR, role: 'editor' }, { user_id: VIEWER, role: 'viewer' }]);

const calls = [];
const env = {
  SESSION_DO: {
    idFromName: (name) => name,
    get: (name) => ({
      async fetch(input, init) {
        calls.push({ name, url: String(input), method: init?.method });
        if (String(input) === 'https://do/init') return Response.json({ ok: true });
        if (String(input) === 'https://do/agent-stop') return Response.json({ ok: true, stopping: true, status: 'running' });
        return Response.json({ error: 'unexpected DO route' }, { status: 500 });
      },
    }),
  },
};
const post = (user) => ({ method: 'POST', headers: { Authorization: `Bearer ${user}` } });
const url = `https://x/api/projects/${PROJECT}/stop`;

test('owner Stop reaches the same project DO over HTTP without a socket', async () => {
  calls.length = 0;
  const res = await app.request(url, post(OWNER), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, stopping: true, status: 'running' });
  assert.deepEqual(calls.map(({ name, url: route }) => [name, route]), [
    [PROJECT, 'https://do/init'],
    [PROJECT, 'https://do/agent-stop'],
  ]);
});

test('an editor may stop, but a viewer and outsider never reach the DO', async () => {
  calls.length = 0;
  const editor = await app.request(url, post(EDITOR), env);
  assert.equal(editor.status, 200);
  assert.equal((await editor.json()).stopping, true);
  assert.deepEqual(calls.map((c) => c.url), ['https://do/init', 'https://do/agent-stop']);
  for (const user of [VIEWER, OUTSIDER]) {
    calls.length = 0;
    const refused = await app.request(url, post(user), env);
    assert.equal(refused.status, 404);
    assert.deepEqual(calls, [], 'a refused caller must not initialise or stop the project DO');
  }
});
