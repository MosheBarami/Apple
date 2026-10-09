// Handoff 2026-10-09 section 12: one project per game. Connect offers the person's existing project for a game instead
// of binding a second one to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(tmpdir(), `studpilot-one-project-${process.pid}.mjs`);
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
const { projectForPlace } = await import(`file://${OUT}`);
process.on('exit', () => rmSync(OUT, { force: true }));

const env = { SUPABASE_URL: 'https://sb.example', SUPABASE_ANON_KEY: 'anon' };

test('the other project for a game is found as the person, excluding this one', async () => {
  const real = globalThis.fetch;
  let asked;
  globalThis.fetch = async (url, init) => { asked = { url: String(url), init }; return Response.json([{ id: 'p-old', name: 'My Obby', place_id: 12345 }]); };
  try {
    const found = await projectForPlace(env, 'Bearer user-jwt', 'u1', 12345, 'p-new');
    assert.deepEqual(found, { id: 'p-old', name: 'My Obby' });
    assert.match(asked.url, /owner_id=eq\.u1&place_id=eq\.12345&id=neq\.p-new/);
    assert.equal(asked.init.headers.Authorization, 'Bearer user-jwt', 'read with the person\'s own token (RLS)');
    globalThis.fetch = async () => Response.json([{ id: 'p-old', name: 'X', place_id: 999 }]);
    assert.equal(await projectForPlace(env, 'Bearer x', 'u1', 12345, 'p-new'), null, 'a row for another game is not this game\'s project');
    globalThis.fetch = async () => Response.json([]);
    assert.equal(await projectForPlace(env, 'Bearer x', 'u1', 12345, 'p-new'), null);
    globalThis.fetch = async () => new Response('no', { status: 500 });
    assert.equal(await projectForPlace(env, 'Bearer x', 'u1', 12345, 'p-new'), null, 'a failed lookup never blocks Connect');
  } finally {
    globalThis.fetch = real;
  }
});
