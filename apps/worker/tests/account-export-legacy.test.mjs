// The production catalogue and the migration catalogue currently disagree on one historical
// spelling: public.usage_events has `sparks` in the live database while the current contract calls
// it `credits`. Execute the collector against a stubbed PostgREST boundary so the compatibility
// retry is tested as behavior, including the cases that must NOT retry.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-account-export-legacy-${process.pid}.mjs`);
const SUPA_FIXTURE = `
  const state = globalThis.__APPLE_EXPORT_SUPA_FIXTURE ??= { calls: [], responses: [] };
  export const calls = state.calls;
  export const responses = state.responses;
  export async function supaRest(env, jwt, path, init) {
    calls.push({ env, jwt, path, init });
    return responses.shift() ?? { ok: false, status: 599, data: null };
  }
`;

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'account-export.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: OUT,
  plugins: [{
    name: 'stub-supabase-boundary',
    setup(build) {
      build.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: 'supa-fixture', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: SUPA_FIXTURE, loader: 'js' }));
    },
  }],
});

const {
  collectAccountExport,
  isMissingPostgrestColumn,
} = await import(pathToFileURL(OUT).href);
process.on('exit', () => rmSync(OUT, { force: true }));
const { calls, responses } = globalThis.__APPLE_EXPORT_SUPA_FIXTURE;

const USER_ID = 'alice';
const JWT = 'jwt-owned-by-alice';
const ENV = { SUPABASE_URL: 'https://supabase.invalid', SUPABASE_ANON_KEY: 'test-only' };
const USER = { userId: USER_ID, email: 'alice@example.com', role: 'user', jwt: JWT };
const usage = {
  store: 'postgres',
  table: 'usage_events',
  access: 'rls',
  ownerColumn: 'owner_id',
  fields: ['id', 'owner_id', 'project_id', 'kind', 'credits', 'input_tokens', 'output_tokens', 'model', 'created_at'],
  excluded: {},
};

function reset(...queued) {
  calls.length = 0;
  responses.length = 0;
  responses.push(...queued);
}

function row(overrides = {}) {
  return {
    id: 1,
    owner_id: USER_ID,
    project_id: 'project-1',
    kind: 'chat',
    input_tokens: 100,
    output_tokens: 50,
    model: 'glm',
    created_at: '2026-09-18T00:00:00Z',
    ...overrides,
  };
}

async function readUsage() {
  const doc = await collectAccountExport(ENV, USER, { specs: [usage] });
  return doc.tables.usage_events;
}

test('modern usage_events exports credits directly with the caller scope intact', async () => {
  reset({ ok: true, status: 200, data: [row({ credits: 4 })] });
  const table = await readUsage();

  assert.equal(table.status, 'ok');
  assert.equal(table.rows[0].credits, 4);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].jwt, JWT);
  assert.match(calls[0].path, /owner_id=eq\.alice/);
  assert.match(decodeURIComponent(calls[0].path), /select=.*\bcredits\b/);
});

test('the exact missing credits column retries sparks and preserves the public credits key', async () => {
  reset(
    { ok: false, status: 400, data: { code: '42703', message: 'column usage_events.credits does not exist' } },
    { ok: true, status: 200, data: [row({ credits: 7 })] },
  );
  const table = await readUsage();

  assert.equal(table.status, 'ok');
  assert.equal(table.rows[0].credits, 7);
  assert.equal('sparks' in table.rows[0], false, 'the legacy storage name must not leak into the export');
  assert.equal(calls.length, 2, 'only the deliberate legacy projection may be retried');
  for (const call of calls) {
    assert.equal(call.jwt, JWT, 'the fallback must use the caller JWT so RLS still applies');
    assert.match(call.path, /owner_id=eq\.alice/, 'the fallback must retain the owner filter');
  }
  assert.match(decodeURIComponent(calls[0].path), /\bcredits\b/);
  assert.match(decodeURIComponent(calls[1].path), /credits:sparks/);
});

test('schema-cache missing-column wording is accepted, but unrelated errors are not', () => {
  assert.equal(
    isMissingPostgrestColumn(
      { code: 'PGRST204', message: "Could not find the 'credits' column of 'usage_events' in the schema cache" },
      'usage_events', 'credits',
    ),
    true,
  );
  for (const error of [
    { code: 'PGRST301', message: 'JWT expired' },
    { code: '42703', message: 'column usage_events.sparks does not exist' },
    { code: '42703', message: 'column projects.credits does not exist' },
    { code: 'PGRST204', message: "Could not find the 'credits' column of 'projects' in the schema cache" },
    null,
  ]) {
    assert.equal(isMissingPostgrestColumn(error, 'usage_events', 'credits'), false,
      `unexpectedly classified ${JSON.stringify(error)} as the compatibility case`);
  }
});

test('auth, outage, and wrong-column failures do not retry or become successful exports', async () => {
  for (const failure of [
    { status: 401, data: { code: 'PGRST301', message: 'JWT expired' } },
    { status: 503, data: null },
    { status: 400, data: { code: '42703', message: 'column usage_events.sparks does not exist' } },
    { status: 401, data: { code: '42703', message: 'column usage_events.credits does not exist' } },
    { status: 500, data: { code: 'PGRST204', message: "Could not find the 'credits' column of 'usage_events' in the schema cache" } },
  ]) {
    reset({ ok: false, status: failure.status, data: failure.data });
    const table = await readUsage();
    assert.equal(table.status, 'failed');
    assert.equal(table.httpStatus, failure.status);
    assert.equal(calls.length, 1, `failure ${failure.status} was retried`);
  }
});
