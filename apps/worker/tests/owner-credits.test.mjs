/**
 * THE OWNER'S UNMETERED-CREDIT SWITCH, ASKED OVER HTTP.
 *
 * `POST /api/me/owner-credits` turns metering off for the caller's own account. It used to decide
 * who "the owner" is by comparing the session's email claim to a personal address written into the
 * source: a public repository then carried that address, and the identity check rested on a claim
 * the worker never checks was verified. The owner is now named by configuration, OWNER_USER_IDS, a
 * comma list of Supabase auth user ids (the JWT `sub`, which the signature does prove), and the
 * route fails closed when that list is unset.
 *
 * Nothing here prints an address: the source scan reports file and line only.
 *
 * Run with:  node --test tests/owner-credits.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(WORKER, 'package.json'));
const jose = require_('jose');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

// ------------------------------------------------------------------ no personal address in source

/** Comments go first: a comment that documents an address is not the worker matching on one. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')) // keeps line numbers true
  .replace(/(?<!:)\/\/[^\n]*/g, ' ');
/** RFC 2606 / 6761 names cannot belong to a person, so a literal on one is a template, not an identity. */
const RESERVED = /(?:^|\.)(?:example|test|invalid|localhost)(?:\.[a-z]+)?$/i;
const ADDRESS = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;

function personalAddresses(src) {
  const hits = [];
  const lines = stripComments(src).split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(ADDRESS)) if (!RESERVED.test(m[1])) hits.push(i + 1);
  });
  return hits;
}

test('the worker source names no personal email address in code', () => {
  const found = [];
  let files = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.ts')) continue;
      files += 1;
      for (const line of personalAddresses(readFileSync(full, 'utf8'))) found.push(`${relative(WORKER, full)}:${line}`);
    }
  };
  walk(join(WORKER, 'src'));
  assert.ok(files > 50, 'the source walk found almost no files, so it verified nothing');
  // Locations only, never the matched text: the point is that the address stops being published.
  assert.deepEqual(found, [], `an email literal on a non-reserved domain is in worker code at ${found.join(', ')}`);
});

test('CONTROL: the address matcher finds a literal in code and ignores comments and reserved domains', () => {
  assert.deepEqual(personalAddresses("if (e !== 'someone@mail.co') deny();"), [1]);
  assert.deepEqual(personalAddresses("// someone@mail.co used to be here\nconst a = 1;"), []);
  assert.deepEqual(personalAddresses("const url = 'https://x.dev/'; const e = 'someone@mail.co';"), [1],
    'a URL before the literal must not hide it as a comment');
  assert.deepEqual(personalAddresses("const t = 'Name@Example.com';"), []);
  assert.deepEqual(personalAddresses("const t = 'buyer@apple.test';"), []);
});

// ------------------------------------------------------------------ the route, over HTTP

const TMP = mkdtempSync(join(tmpdir(), 'apple-owner-credits-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');
const OUT = join(TMP, 'worker.mjs');
execFileSync(ESBUILD, [join(WORKER, 'src', 'index.ts'), '--bundle', '--format=esm', '--target=es2022',
  `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${OUT}`], { stdio: 'pipe', cwd: WORKER });
const APP = (await import(`file://${OUT}`)).default;

const SUPABASE_URL = 'https://supa.owner.test';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'owner-test', alg: 'ES256', use: 'sig' };
const sign = (sub, email) => new jose.SignJWT({ email, role: 'authenticated' })
  .setProtectedHeader({ alg: 'ES256', kid: 'owner-test' })
  .setIssuer(`${SUPABASE_URL}/auth/v1`)
  .setAudience('authenticated')
  .setSubject(sub)
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(privateKey);

globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/.well-known/jwks.json')) return json({ keys: [jwk] });
  return json([]);
};

/** Every QuotaDO call, with the account it addressed, so "whose metering changed" is observed. */
let doCalls = [];
const namespace = {
  idFromName: (n) => ({ toString: () => n }),
  idFromString: (n) => ({ toString: () => n }),
  get: (id) => ({
    async fetch(url, init) {
      const u = new URL(typeof url === 'string' ? url : url.url);
      doCalls.push({ path: u.pathname, id: id.toString(), body: init?.body ? JSON.parse(init.body) : null });
      return new Response(JSON.stringify({ ok: true, unmetered: true }), { status: 200 });
    },
  }),
};

const env = (over = {}) => ({
  SUPABASE_URL,
  SUPABASE_ANON_KEY: 'anon-test',
  ENVIRONMENT: 'test',
  KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
  CORPUS: { exec: async () => ({}), prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) }), batch: async () => [] },
  SESSION_DO: namespace, QUOTA_DO: namespace, LEGACY_QUOTA_DO: namespace, PAIRING_DO: namespace, ADMIN_DO: namespace, BUDGET_DO: namespace,
  ...over,
});

async function grant(jwt, over) {
  doCalls = [];
  const res = await APP.fetch(new Request('https://apple.test/api/me/owner-credits', {
    method: 'POST', headers: { Authorization: `Bearer ${jwt}` },
  }), env(over));
  return { status: res.status, unmeteredCalls: doCalls.filter((c) => c.path === '/set-unmetered') };
}

test('a user id listed in OWNER_USER_IDS turns metering off for THAT account', async () => {
  const r = await grant(await sign(OWNER_ID, 'owner@mail.owner.test'), { OWNER_USER_IDS: ` ${OTHER_ID.slice(0, 8)}x , ${OWNER_ID} ` });
  assert.equal(r.status, 200);
  assert.equal(r.unmeteredCalls.length, 1, 'the QuotaDO was asked');
  assert.equal(r.unmeteredCalls[0].id, OWNER_ID, 'and it was the caller\'s own account');
  assert.equal(r.unmeteredCalls[0].body?.enabled, true);
});

test('an account not listed is refused, whatever email its token claims', async () => {
  const r = await grant(await sign(OTHER_ID, 'owner@mail.owner.test'), { OWNER_USER_IDS: OWNER_ID });
  assert.equal(r.status, 403);
  assert.equal(r.unmeteredCalls.length, 0, 'nothing was switched');
});

test('FAILS CLOSED: with OWNER_USER_IDS unset or blank, nobody is the owner', async () => {
  const jwt = await sign(OWNER_ID, 'owner@mail.owner.test');
  for (const over of [{}, { OWNER_USER_IDS: '' }, { OWNER_USER_IDS: ' , ' }]) {
    const r = await grant(jwt, over);
    assert.equal(r.status, 403, `refused with ${JSON.stringify(over)}`);
    assert.equal(r.unmeteredCalls.length, 0);
  }
});

test('an unsigned caller never reaches the switch', async () => {
  const r = await grant('not-a-token', { OWNER_USER_IDS: OWNER_ID });
  assert.equal(r.status, 401);
  assert.equal(r.unmeteredCalls.length, 0);
});
