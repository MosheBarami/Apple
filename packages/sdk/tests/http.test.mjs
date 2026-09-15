// The transport, against a real server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../src/http.mjs';
import { ApiError } from '../src/errors.mjs';
import { startServer } from './fake-server.mjs';

/** Backoff without the wait: the schedule is tested in retry.test.mjs, not re-timed here. */
const instant = () => Promise.resolve();

test('the bearer token rides on every authed call and is absent when there is none', async () => {
  const s = await startServer({ 'GET /api/me': () => ({ body: { userId: 'u1' } }) });
  try {
    const t = createTransport({ baseUrl: s.baseUrl, token: 'jwt-abc' });
    assert.deepEqual(await t.request('/api/me'), { userId: 'u1' });
    assert.equal(s.requests.at(-1).headers.authorization, 'Bearer jwt-abc');

    await t.request('/api/me', { token: null });
    assert.equal(s.requests.at(-1).headers.authorization, undefined);
  } finally {
    await s.close();
  }
});

test('a token function is awaited, so a refreshing session needs no new client', async () => {
  const s = await startServer({ 'GET /api/me': () => ({ body: { ok: true } }) });
  try {
    let issued = 0;
    const t = createTransport({
      baseUrl: s.baseUrl,
      token: async () => `jwt-${(issued += 1)}`,
    });
    await t.request('/api/me');
    await t.request('/api/me');
    assert.equal(s.requests[0].headers.authorization, 'Bearer jwt-1');
    assert.equal(s.requests[1].headers.authorization, 'Bearer jwt-2');
  } finally {
    await s.close();
  }
});

test('a 429 that clears is retried and the call succeeds', async () => {
  const s = await startServer({
    'GET /api/me': (_req, _body, hit) =>
      hit < 3 ? { status: 429, body: { error: 'Too many requests — slow down.' } } : { body: { userId: 'u1' } },
  });
  try {
    const t = createTransport({ baseUrl: s.baseUrl, token: 'x', sleep: instant, maxAttempts: 3 });
    const { body, attempts } = await t.raw('/api/me');
    assert.deepEqual(body, { userId: 'u1' });
    assert.equal(attempts, 3, 'the caller can see how many attempts it took');
    assert.equal(s.requests.length, 3);
  } finally {
    await s.close();
  }
});

test('a 429 that never clears surfaces the SERVER sentence, not a generic one', async () => {
  const s = await startServer({
    'GET /api/docs/search': () => ({ status: 429, body: { error: 'Daily Credits used up', hits: [] } }),
  });
  try {
    const t = createTransport({ baseUrl: s.baseUrl, token: 'x', sleep: instant, maxAttempts: 2 });
    await assert.rejects(
      () => t.request('/api/docs/search'),
      (e) => {
        assert.ok(e instanceof ApiError);
        assert.equal(e.status, 429);
        assert.equal(e.message, 'Daily Credits used up');
        assert.equal(e.attempts, 2);
        assert.deepEqual(e.body.hits, [], 'the body survives so a caller can read the rest of it');
        return true;
      },
    );
    assert.equal(s.requests.length, 2, 'the cap held');
  } finally {
    await s.close();
  }
});

test('a POST is not repeated by a 503, because repeating it would repeat its effect', async () => {
  const s = await startServer({ 'POST /api/projects/x/checkpoints': () => ({ status: 503, body: { error: 'down' } }) });
  try {
    const t = createTransport({ baseUrl: s.baseUrl, token: 'x', sleep: instant, maxAttempts: 5 });
    await assert.rejects(() => t.request('/api/projects/x/checkpoints', { method: 'POST', body: { label: 'a' } }));
    assert.equal(s.requests.length, 1, 'exactly one checkpoint attempt reached the server');
  } finally {
    await s.close();
  }
});

test('an HTML error body does not become a SyntaxError in the caller', async () => {
  const s = await startServer({
    'GET /api/me': () => ({ status: 502, headers: { 'Content-Type': 'text/html' }, body: '<html>502 Bad Gateway</html>' }),
  });
  try {
    const t = createTransport({ baseUrl: s.baseUrl, token: 'x', sleep: instant, maxAttempts: 1 });
    await assert.rejects(
      () => t.request('/api/me'),
      (e) => e instanceof ApiError && e.status === 502 && /502/.test(e.message),
    );
  } finally {
    await s.close();
  }
});

test('an unreachable server is an ApiError with status 0, never a bare fetch failure', async () => {
  const s = await startServer({ 'GET /api/health': () => ({ body: { ok: true } }) });
  const { baseUrl } = s;
  await s.close();
  const t = createTransport({ baseUrl, token: null, sleep: instant, maxAttempts: 2 });
  await assert.rejects(
    () => t.request('/api/health'),
    (e) => {
      assert.ok(e instanceof ApiError, `expected ApiError, got ${e?.name}`);
      assert.equal(e.status, 0);
      assert.equal(e.isTransport, true);
      assert.equal(e.attempts, 2, 'a safe method retries before giving up');
      return true;
    },
  );
});

test('query values are encoded, so a query with & or = cannot forge another parameter', async () => {
  const s = await startServer({ 'GET /api/projects/p/search': () => ({ body: { results: [] } }) });
  try {
    const t = createTransport({ baseUrl: s.baseUrl, token: 'x' });
    await t.request('/api/projects/p/search', { query: { q: 'door&limit=9999', limit: 10 } });
    const req = s.requests.at(-1);
    assert.equal(req.query.get('q'), 'door&limit=9999');
    assert.equal(req.query.get('limit'), '10', 'the injected limit did not win');
  } finally {
    await s.close();
  }
});

test('a maxAttempts that is not a number falls back rather than becoming an uncapped loop', async () => {
  const s = await startServer({ 'GET /api/me': () => ({ status: 500, body: { error: 'nope' } }) });
  try {
    const t = createTransport({ baseUrl: s.baseUrl, token: 'x', sleep: instant, maxAttempts: NaN });
    await assert.rejects(() => t.request('/api/me'));
    assert.equal(s.requests.length, 3, 'the default cap of 3 applied');
  } finally {
    await s.close();
  }
});
