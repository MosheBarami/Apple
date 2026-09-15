// The Studio half: pairing, the long poll, and the two ways it can be lied to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioClient, StudioSessionEnded, isStudioToken, pollWaitMs } from '../src/studio.mjs';
import { startServer } from './fake-server.mjs';

const PROJECT = '3f2a1c9e-77b4-4c2a-9a1e-0b8d6e4f1234';
const SECRET = 'a'.repeat(48);
const TOKEN = `${PROJECT}.${SECRET}`;

test('isStudioToken admits exactly the shape the worker admits', () => {
  assert.equal(isStudioToken(TOKEN), true);
  // The worker checks `token.length - dot - 1 !== 48` and a UUID prefix BEFORE it touches
  // storage, so that an unauthenticated caller cannot materialise a Durable Object for an
  // arbitrary id. A client that sent these anyway would get a 401 it could not distinguish
  // from an expired pairing, and would reconnect forever.
  assert.equal(isStudioToken(`${PROJECT}.${'a'.repeat(47)}`), false, 'one short');
  assert.equal(isStudioToken(`${PROJECT}.${'A'.repeat(48)}`), false, 'the secret is lower-case hex');
  assert.equal(isStudioToken(`not-a-uuid.${SECRET}`), false);
  assert.equal(isStudioToken(`.${SECRET}`), false);
  assert.equal(isStudioToken(TOKEN + 'x'.repeat(200)), false);
  assert.equal(isStudioToken(null), false);
  assert.equal(isStudioToken(undefined), false);
});

test('claim sends the plugin identity on HEADERS and stores the token it gets back', async () => {
  const s = await startServer({
    'POST /api/studio/claim': () => ({ body: { token: TOKEN, projectId: PROJECT, projectName: 'Tower' } }),
  });
  try {
    const c = new StudioClient({ baseUrl: s.baseUrl, version: '0.2.0', protocol: 1 });
    const out = await c.claim('GLM-7F3K2Q');
    assert.equal(out.projectId, PROJECT);
    assert.equal(c.token, TOKEN);
    const req = s.requests.at(-1);
    // On headers, not in the body: `/api/studio/claim` has no body field for them, and the
    // worker reads them before it parses anything.
    assert.equal(req.headers['x-golem-plugin-version'], '0.2.0');
    assert.equal(req.headers['x-golem-plugin-protocol'], '1');
    assert.equal(req.headers.authorization, undefined, 'pairing is not a JWT call');
    assert.deepEqual(JSON.parse(req.body), { code: 'GLM-7F3K2Q' });
  } finally {
    await s.close();
  }
});

test('a client that reports no version simply omits the headers', async () => {
  const s = await startServer({ 'POST /api/studio/claim': () => ({ body: { token: TOKEN, projectId: PROJECT } }) });
  try {
    await new StudioClient({ baseUrl: s.baseUrl }).claim('CODE');
    const req = s.requests.at(-1);
    assert.equal(req.headers['x-golem-plugin-version'], undefined);
    assert.equal(req.headers['x-golem-plugin-protocol'], undefined);
  } finally {
    await s.close();
  }
});

test('a pairing that returns no token is an error, not a client that thinks it is paired', async () => {
  const s = await startServer({ 'POST /api/studio/claim': () => ({ body: { projectId: PROJECT } }) });
  try {
    const c = new StudioClient({ baseUrl: s.baseUrl });
    await assert.rejects(() => c.claim('CODE'), /no token/);
    assert.equal(c.token, null);
  } finally {
    await s.close();
  }
});

test('polling before pairing refuses instead of sending an empty token header', async () => {
  const s = await startServer({ 'POST /api/studio/poll': () => ({ body: { ops: [], waitMs: 2000 } }) });
  try {
    await assert.rejects(() => new StudioClient({ baseUrl: s.baseUrl }).poll(), TypeError);
    assert.equal(s.requests.length, 0);
  } finally {
    await s.close();
  }
});

test('the poll carries the token header and returns the ops it was given', async () => {
  const s = await startServer({
    'POST /api/studio/poll': () => ({ body: { ops: [{ id: 'o1', seq: 1, studioOp: { op: 'create' } }], waitMs: 500 } }),
  });
  try {
    const c = new StudioClient({ baseUrl: s.baseUrl, token: TOKEN, version: '0.2.0', protocol: 1 });
    const res = await c.poll({ results: [{ id: 'o0', ok: true }], events: [] });
    assert.equal(res.ops.length, 1);
    const req = s.requests.at(-1);
    assert.equal(req.headers['x-golem-token'], TOKEN);
    assert.deepEqual(JSON.parse(req.body).results, [{ id: 'o0', ok: true }]);
  } finally {
    await s.close();
  }
});

test('a 401 ends the session rather than being retried forever', async () => {
  let calls = 0;
  const s = await startServer({
    'POST /api/studio/poll': () => {
      calls += 1;
      return { status: 401, body: { error: 'invalid token' } };
    },
  });
  try {
    const c = new StudioClient({ baseUrl: s.baseUrl, token: TOKEN, sleep: () => Promise.resolve() });
    await assert.rejects(() => c.poll(), StudioSessionEnded);
    assert.equal(calls, 1, 'a 401 is not a hiccup — it must not be retried');
    assert.equal(c.token, null, 'the dead token is dropped so a caller cannot loop on it');
  } finally {
    await s.close();
  }
});

test('pollWaitMs refuses every shape that would break the poll loop', () => {
  assert.equal(pollWaitMs({ waitMs: 500 }), 500);
  // What the shipped plugin does is `data.waitMs or 2000`, which accepts all of these.
  // In Luau a string then raises inside the division; in JavaScript Infinity reaches
  // setTimeout, fires immediately, and hot-loops the worker.
  assert.equal(pollWaitMs({ waitMs: '5000' }), 2000);
  assert.equal(pollWaitMs({ waitMs: NaN }), 2000);
  assert.equal(pollWaitMs({ waitMs: Infinity }), 2000, 'Infinity is not a delay, it is a missing one');
  assert.equal(pollWaitMs({ waitMs: 999_999 }), 10_000, 'a real-but-absurd delay clamps to the ceiling');
  assert.equal(pollWaitMs({ waitMs: {} }), 2000);
  assert.equal(pollWaitMs({}), 2000);
  assert.equal(pollWaitMs(null), 2000);
  assert.equal(pollWaitMs({ waitMs: 0 }), 200, 'zero would be a spin; the floor holds');
  assert.equal(pollWaitMs({ waitMs: -1 }), 200);
});
