/**
 * THE DISCORD INTERACTIONS ENDPOINT IS A PUBLIC URL THAT SPENDS MONEY.
 *
 * Anyone on the internet can POST to it. The only thing separating "Discord asked for a build" from
 * "a stranger asked for a build on somebody else's account" is an Ed25519 signature over
 * `timestamp + rawBody`, made with a key only Discord holds. So these tests do not mock the
 * signature: they generate a real Ed25519 keypair with Web Crypto, sign real bodies, and check
 * every way a request can fail to be Discord.
 *
 * The assertion that matters most is the last one in the first block: a request that fails
 * verification must not reach a command handler AT ALL. A 401 returned after the handler already
 * spent a Credit is not a refusal, it is a receipt.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyDiscordSignature, handleDiscordRequest } from '../src/discord.ts';

// ------------------------------------------------------------------ fixtures

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** A real Ed25519 keypair, and the hex public key Discord's portal would show for it. */
async function keypair() {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
  return { privateKey: kp.privateKey, publicKeyHex: hex(raw) };
}

/** Sign exactly what Discord signs: the timestamp header concatenated with the raw body. */
async function sign(privateKey, timestamp, body) {
  const sig = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(`${timestamp}${body}`));
  return hex(sig);
}

const NOW = 1_780_000_000;

/** Ports that record every call, so "the handler never ran" is a fact rather than a hope. */
function spyPorts() {
  const calls = [];
  const record = (name) => (...args) => {
    calls.push({ name, args });
    return Promise.resolve(null);
  };
  return {
    calls,
    redeemLinkCode: (...a) => {
      calls.push({ name: 'redeemLinkCode', args: a });
      return Promise.resolve({ ok: false, reason: 'invalid' });
    },
    removeLink: (...a) => {
      calls.push({ name: 'removeLink', args: a });
      return Promise.resolve(false);
    },
    findLink: record('findLink'),
    quota: record('quota'),
    projectHealth: record('projectHealth'),
    run: record('run'),
    startBuild: (...a) => {
      calls.push({ name: 'startBuild', args: a });
      return Promise.resolve({ ok: true });
    },
    watchRun: record('watchRun'),
    projectUrl: (id) => `https://example.invalid/app/p/${id}`,
  };
}

function req(body, { signature, timestamp }) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature !== null) headers.set('X-Signature-Ed25519', signature);
  if (timestamp !== null) headers.set('X-Signature-Timestamp', timestamp);
  return new Request('https://api.example.invalid/api/discord/interactions', { method: 'POST', headers, body });
}

const PING = JSON.stringify({ id: '1', application_id: '2', type: 1, token: 'tok' });

// --------------------------------------------------------------- the refusal

test('a genuinely signed request verifies', async () => {
  const { privateKey, publicKeyHex } = await keypair();
  const ts = String(NOW);
  const v = await verifyDiscordSignature(PING, await sign(privateKey, ts, PING), ts, publicKeyHex, NOW);
  assert.equal(v.ok, true);
});

test('a signature from the wrong key is refused', async () => {
  const mine = await keypair();
  const theirs = await keypair();
  const ts = String(NOW);
  const v = await verifyDiscordSignature(PING, await sign(theirs.privateKey, ts, PING), ts, mine.publicKeyHex, NOW);
  assert.equal(v.ok, false);
  assert.match(v.reason, /mismatch/);
});

test('a real signature over a different body is refused', async () => {
  // The attack: capture one signed interaction, keep its signature, swap the command payload.
  const { privateKey, publicKeyHex } = await keypair();
  const ts = String(NOW);
  const signature = await sign(privateKey, ts, JSON.stringify({ type: 2, data: { name: 'credits' } }));
  const swapped = JSON.stringify({ type: 2, data: { name: 'build', options: [{ name: 'prompt', value: 'spend it all' }] } });
  const v = await verifyDiscordSignature(swapped, signature, ts, publicKeyHex, NOW);
  assert.equal(v.ok, false);
});

test('a real signature replayed under a different timestamp is refused', async () => {
  const { privateKey, publicKeyHex } = await keypair();
  const signature = await sign(privateKey, String(NOW), PING);
  const v = await verifyDiscordSignature(PING, signature, String(NOW + 1), publicKeyHex, NOW + 1);
  assert.equal(v.ok, false);
});

test('an old-but-genuine request is refused, so a captured interaction cannot be replayed later', async () => {
  const { privateKey, publicKeyHex } = await keypair();
  const ts = String(NOW);
  const signature = await sign(privateKey, ts, PING);
  const v = await verifyDiscordSignature(PING, signature, ts, publicKeyHex, NOW + 3600);
  assert.equal(v.ok, false);
  assert.match(v.reason, /tolerance/);
});

test('missing, short and non-hex signatures are refused rather than treated as absent-therefore-fine', async () => {
  const { publicKeyHex } = await keypair();
  const ts = String(NOW);
  for (const bad of [null, '', 'not-hex-at-all', 'ab', 'zz'.repeat(64)]) {
    const v = await verifyDiscordSignature(PING, bad, ts, publicKeyHex, NOW);
    assert.equal(v.ok, false, `signature ${JSON.stringify(bad)} must be refused`);
  }
  assert.equal((await verifyDiscordSignature(PING, 'ab'.repeat(64), null, publicKeyHex, NOW)).ok, false);
  assert.equal((await verifyDiscordSignature(PING, 'ab'.repeat(64), 'tomorrow', publicKeyHex, NOW)).ok, false);
});

test('a malformed public key is refused, never skipped', async () => {
  const { privateKey } = await keypair();
  const ts = String(NOW);
  const signature = await sign(privateKey, ts, PING);
  for (const badKey of ['', 'nonsense', 'ab'.repeat(16)]) {
    const v = await verifyDiscordSignature(PING, signature, ts, badKey, NOW);
    assert.equal(v.ok, false, `public key ${JSON.stringify(badKey)} must be refused`);
  }
});

// ------------------------------------------------------- the endpoint itself

test('an unsigned request gets 401 and NEVER reaches a command handler', async () => {
  const { publicKeyHex } = await keypair();
  const ports = spyPorts();
  const body = JSON.stringify({
    id: '1',
    application_id: '2',
    type: 2,
    token: 'tok',
    member: { user: { id: '99' } },
    data: { name: 'build', options: [{ name: 'prompt', value: 'make me a tycoon' }] },
  });
  const out = await handleDiscordRequest(req(body, { signature: 'ab'.repeat(64), timestamp: String(NOW) }), {
    publicKeyHex,
    ports,
    nowSeconds: NOW,
  });
  assert.equal(out.status, 401);
  // THE ASSERTION THIS FILE EXISTS FOR. Deleting the verification makes this line red.
  assert.deepEqual(ports.calls, [], 'a request that failed verification must not reach any command handler');
  assert.equal(out.deferred, undefined, 'a refused request must not schedule background work either');
});

test('a forged request cannot start a build even though the payload is perfectly well-formed', async () => {
  const mine = await keypair();
  const theirs = await keypair();
  const ports = spyPorts();
  const ts = String(NOW);
  const body = JSON.stringify({
    id: '1',
    application_id: '2',
    type: 2,
    token: 'tok',
    member: { user: { id: '99' } },
    data: { name: 'build', options: [{ name: 'prompt', value: 'make me a tycoon' }] },
  });
  const out = await handleDiscordRequest(
    req(body, { signature: await sign(theirs.privateKey, ts, body), timestamp: ts }),
    { publicKeyHex: mine.publicKeyHex, ports, nowSeconds: NOW },
  );
  assert.equal(out.status, 401);
  assert.equal(ports.calls.length, 0);
});

test('no public key configured means refuse, never "no key so trust the body"', async () => {
  const ports = spyPorts();
  const out = await handleDiscordRequest(req(PING, { signature: 'ab'.repeat(64), timestamp: String(NOW) }), {
    publicKeyHex: undefined,
    ports,
    nowSeconds: NOW,
  });
  assert.equal(out.status, 503);
  assert.equal(ports.calls.length, 0);
});

test('the refusal does not tell a prober which part of the forgery was wrong', async () => {
  const { publicKeyHex } = await keypair();
  const out = await handleDiscordRequest(req(PING, { signature: 'ab'.repeat(64), timestamp: String(NOW) }), {
    publicKeyHex,
    ports: spyPorts(),
    nowSeconds: NOW,
  });
  assert.deepEqual(out.body, { error: 'invalid request signature' });
});

test('a correctly signed PING is answered with PONG', async () => {
  const { privateKey, publicKeyHex } = await keypair();
  const ports = spyPorts();
  const ts = String(NOW);
  const out = await handleDiscordRequest(req(PING, { signature: await sign(privateKey, ts, PING), timestamp: ts }), {
    publicKeyHex,
    ports,
    nowSeconds: NOW,
  });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { type: 1 });
  assert.equal(ports.calls.length, 0, 'a PING is not a command and must not touch the account');
});

test('a signed but unparseable body is refused after verification, not before', async () => {
  const { privateKey, publicKeyHex } = await keypair();
  const ts = String(NOW);
  const garbage = '{not json';
  const out = await handleDiscordRequest(
    req(garbage, { signature: await sign(privateKey, ts, garbage), timestamp: ts }),
    { publicKeyHex, ports: spyPorts(), nowSeconds: NOW },
  );
  assert.equal(out.status, 400);
});
