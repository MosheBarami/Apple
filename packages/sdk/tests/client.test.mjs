// The typed client: what it sends, and what it refuses to send.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AppleClient, filenameFromDisposition } from '../src/client.mjs';
import { projectPath, isProjectId } from '../src/wire.mjs';
import { startServer } from './fake-server.mjs';

const PROJECT = '3f2a1c9e-77b4-4c2a-9a1e-0b8d6e4f1234';

test('a project id that is not a UUID never reaches the network', async () => {
  const s = await startServer({ 'GET /api/admin/stats': () => ({ body: { counters: [] } }) });
  try {
    const client = new AppleClient({ baseUrl: s.baseUrl, token: 'jwt' });
    // THE ATTACK, not a typo: `/api/projects/../../admin/stats/messages` normalises to an
    // admin path. A client that only validated on the server's 404 would have sent it.
    for (const evil of ['../../admin/stats', '../..%2fadmin', 'not-a-uuid', '', null, undefined, 42]) {
      assert.throws(() => client.messages(evil), TypeError, `${String(evil)} was accepted`);
    }
    assert.equal(s.requests.length, 0, 'no request left the client');
  } finally {
    await s.close();
  }
});

test('isProjectId admits exactly the shape the worker admits', () => {
  assert.equal(isProjectId(PROJECT), true);
  assert.equal(isProjectId(PROJECT.toUpperCase()), true, 'the worker matches case-insensitively');
  assert.equal(isProjectId(`${PROJECT} `), false);
  assert.equal(isProjectId(`${PROJECT}/messages`), false);
  assert.equal(isProjectId('3f2a1c9e-77b4-4c2a-9a1e-0b8d6e4f123'), false, 'one short');
});

test('projectPath builds the documented path and nothing else', () => {
  assert.equal(projectPath(PROJECT, '/messages'), `/api/projects/${PROJECT}/messages`);
  assert.equal(projectPath(PROJECT), `/api/projects/${PROJECT}`);
});

test('each read method hits the route the worker actually serves', async () => {
  const seen = [];
  const record = (name) => (req) => {
    seen.push(`${req.method} ${req.path}`);
    return { body: { ok: name } };
  };
  const s = await startServer({
    [`GET /api/projects/${PROJECT}/messages`]: record('messages'),
    [`GET /api/projects/${PROJECT}/search`]: record('search'),
    [`GET /api/projects/${PROJECT}/memory`]: record('memory'),
    [`GET /api/projects/${PROJECT}/checkpoints`]: record('checkpoints'),
    [`GET /api/projects/${PROJECT}/attribution`]: record('attribution'),
    [`GET /api/projects/${PROJECT}/roadmap`]: record('roadmap'),
    [`GET /api/projects/${PROJECT}/roadmap/next`]: record('next'),
    'GET /api/me': record('me'),
    'GET /api/me/usage': record('usage'),
    'GET /api/health': record('health'),
    'GET /api/providers': record('providers'),
    'GET /api/docs/search': record('docs'),
    'GET /api/billing/config': record('billing'),
  });
  try {
    const c = new AppleClient({ baseUrl: s.baseUrl, token: 'jwt' });
    await c.health();
    await c.me();
    await c.usage();
    await c.providers();
    await c.searchDocs('humanoid');
    await c.billingConfig();
    await c.messages(PROJECT, { limit: 5 });
    await c.searchConversation(PROJECT, 'door');
    await c.memory(PROJECT);
    await c.checkpoints(PROJECT);
    await c.attribution(PROJECT);
    await c.roadmap(PROJECT, { polish: true });
    await c.nextMilestones(PROJECT);
    assert.equal(seen.length, 13, `some route 404ed: ${seen.join(' | ')}`);
    assert.ok(seen.includes(`GET /api/projects/${PROJECT}/roadmap/next`));
  } finally {
    await s.close();
  }
});

test('the health check sends no Authorization header even when the client holds a token', async () => {
  const s = await startServer({ 'GET /api/health': () => ({ body: { ok: true, version: '0.1.0' } }) });
  try {
    await new AppleClient({ baseUrl: s.baseUrl, token: 'jwt' }).health();
    assert.equal(s.requests.at(-1).headers.authorization, undefined);
  } finally {
    await s.close();
  }
});

test('search and limit travel as query parameters, not as path segments', async () => {
  const s = await startServer({
    [`GET /api/projects/${PROJECT}/messages`]: () => ({ body: { messages: [] } }),
    [`GET /api/projects/${PROJECT}/search`]: () => ({ body: { results: [] } }),
    [`GET /api/projects/${PROJECT}/roadmap`]: () => ({ body: { milestones: [] } }),
  });
  try {
    const c = new AppleClient({ baseUrl: s.baseUrl, token: 'jwt' });
    await c.messages(PROJECT, { limit: 7 });
    assert.equal(s.requests.at(-1).query.get('limit'), '7');
    await c.searchConversation(PROJECT, 'a b&c');
    assert.equal(s.requests.at(-1).query.get('q'), 'a b&c');
    await c.roadmap(PROJECT);
    assert.equal(s.requests.at(-1).query.get('polish'), null, 'polish is sent only when asked for');
    await c.roadmap(PROJECT, { polish: true });
    assert.equal(s.requests.at(-1).query.get('polish'), '1');
  } finally {
    await s.close();
  }
});

test('a plan the deployment does not have is refused before checkout is opened', async () => {
  const s = await startServer({ 'POST /api/billing/checkout': () => ({ body: { url: 'https://stripe.test/x' } }) });
  try {
    const c = new AppleClient({ baseUrl: s.baseUrl, token: 'jwt' });
    for (const bad of ['pro', 'team', '', null, 'FREE']) {
      assert.throws(() => c.startCheckout(bad), TypeError, `${String(bad)} was accepted`);
    }
    assert.equal(s.requests.length, 0);
    assert.deepEqual(await c.startCheckout('studio'), { url: 'https://stripe.test/x' });
    assert.deepEqual(JSON.parse(s.requests.at(-1).body), { plan: 'studio' });
  } finally {
    await s.close();
  }
});

test('saveMemory sends the WHOLE memory and refuses a patch-shaped argument', async () => {
  const s = await startServer({ [`PUT /api/projects/${PROJECT}/memory`]: () => ({ body: { memory: { summary: null, facts: [] }, editedAt: null } }) });
  try {
    const c = new AppleClient({ baseUrl: s.baseUrl, token: 'jwt' });
    assert.throws(() => c.saveMemory(PROJECT, { summary: 'x' }), TypeError, 'facts missing');
    assert.throws(() => c.saveMemory(PROJECT, null), TypeError);
    assert.equal(s.requests.length, 0);
    await c.saveMemory(PROJECT, { summary: 'a tower', facts: ['door is red'] });
    assert.deepEqual(JSON.parse(s.requests.at(-1).body), { memory: { summary: 'a tower', facts: ['door is red'] } });
  } finally {
    await s.close();
  }
});

test('the export keeps the filename the SERVER chose', async () => {
  const s = await startServer({
    [`GET /api/projects/${PROJECT}/export`]: () => ({
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="my-tower-2026-09-15.md"',
      },
      body: '# my tower\n',
    }),
  });
  try {
    const c = new AppleClient({ baseUrl: s.baseUrl, token: 'jwt' });
    const file = await c.exportTranscript(PROJECT, 'md');
    assert.equal(file.filename, 'my-tower-2026-09-15.md');
    assert.equal(file.body, '# my tower\n');
    assert.equal(s.requests.at(-1).query.get('format'), 'md');
    // `exportTranscript` is async, so its refusal is a rejection. Asserting it with
    // `assert.throws` would have passed on a function that validated nothing at all.
    await assert.rejects(() => c.exportTranscript(PROJECT, 'pdf'), TypeError);
    assert.equal(s.requests.length, 1, 'the refused format sent no second request');
  } finally {
    await s.close();
  }
});

test('filenameFromDisposition reads the header forms, and null when there is none', () => {
  assert.equal(filenameFromDisposition('attachment; filename="a b.json"'), 'a b.json');
  assert.equal(filenameFromDisposition('attachment; filename=plain.md'), 'plain.md');
  assert.equal(filenameFromDisposition('attachment'), null);
  assert.equal(filenameFromDisposition(null), null);
});

test('an admin route without an admin key refuses instead of sending an empty header', async () => {
  const s = await startServer({ 'GET /api/admin/stats': () => ({ body: { counters: [] } }) });
  try {
    assert.throws(() => new AppleClient({ baseUrl: s.baseUrl, token: 'jwt' }).adminStats(), TypeError);
    assert.equal(s.requests.length, 0);
    const admin = new AppleClient({ baseUrl: s.baseUrl, token: 'jwt', adminKey: 'secret-key' });
    await admin.adminStats();
    assert.equal(s.requests.at(-1).headers['x-admin-key'], 'secret-key');
  } finally {
    await s.close();
  }
});

test('image bytes come back as bytes, not as a string that has been through UTF-8', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00]);
  const s = await startServer({
    [`GET /api/projects/${PROJECT}/images/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`]: () => ({
      headers: { 'Content-Type': 'image/png' },
      body: png,
    }),
  });
  try {
    const c = new AppleClient({ baseUrl: s.baseUrl, token: 'jwt' });
    const bytes = await c.image(PROJECT, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    assert.ok(bytes instanceof Uint8Array);
    assert.deepEqual([...bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'the PNG magic survived');
  } finally {
    await s.close();
  }
});
