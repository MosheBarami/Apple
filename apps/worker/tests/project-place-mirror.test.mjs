/**
 * "WHICH PLACE" — THE FOURTH FACT ON A PROJECT CARD, WHICH NOTHING EVER WROTE.
 *
 * The owner's definition of done (docs/spec/DONE.md, F1) says one project is one experience:
 * "name, description, when updated, which place". Three of those are on every card. The fourth is
 * `projects.place_name`, and an audit of the LIVE product on 2026-09-20 found it empty on every
 * card on the shelf — including the card for a project that had been paired minutes earlier to a
 * place called "Zeta Test Place", whose name the topbar pill was showing at that moment.
 *
 * The place was never a mystery to the worker: `placeAdmission` resolves it on every poll and it is
 * written to Durable Object storage. It was simply never mirrored to the row the shelf reads, and
 * the web app's own pairing dialog carries a comment saying so.
 *
 * WHAT IS REAL HERE AND WHAT IS A FIXTURE. The poll, the place admission, the branch that decides a
 * binding is new, and the PATCH itself are the production code. `liveJwt` is set directly because
 * the harness cannot open a WebSocket — `WebSocketPair` does not exist outside workerd — and that
 * socket is the only thing that sets it in production. `fetch` is captured rather than performed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness } from './session-harness.mjs';

const state = (over = {}) => ({
  kind: 'state', placeName: 'Zeta Test Place', placeId: 4815, gameId: 162342,
  isRunMode: false, selectionCount: 0, pluginVersion: '0.2.0', ...over,
});

/** A session with a member's JWT in memory, exactly as an open workspace tab leaves one. */
async function signedIn(opts = {}) {
  const h = sessionHarness(opts);
  await new Promise((r) => setTimeout(r, 0));
  h.env.SUPABASE_URL = 'https://supa.test';
  h.env.SUPABASE_ANON_KEY = 'anon-key';
  h.session.liveJwt = 'jwt-of-the-owner';
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : null });
    return new Response('[]', { status: 200 });
  };
  return { h, calls, restore: () => { globalThis.fetch = real; } };
}

const patches = (calls) => calls.filter((c) => c.method === 'PATCH' && c.url.includes('/rest/v1/projects'));

test('pairing to a named place writes that name onto the project row', async () => {
  const { h, calls, restore } = await signedIn();
  try {
    await h.session.handlePluginPoll({ state: state() });
  } finally {
    restore();
  }
  const wrote = patches(calls);
  assert.equal(wrote.length, 1, 'the shelf was never told which place this project is — the card still reads "No place name yet"');
  assert.match(wrote[0].url, /projects\?id=eq\.p1$/);
  assert.equal(wrote[0].body.place_name, 'Zeta Test Place');
  assert.equal(wrote[0].body.place_id, 4815);
});

test('and does not write it again on every poll after that', async () => {
  const { h, calls, restore } = await signedIn();
  try {
    await h.session.handlePluginPoll({ state: state() });
    await h.session.handlePluginPoll({ state: state() });
    await h.session.handlePluginPoll({ state: state() });
  } finally {
    restore();
  }
  assert.equal(patches(calls).length, 1, 'a plugin polling every two seconds would rewrite this row forever');
});

test('a place that was RENAMED in Studio corrects the card', async () => {
  const { h, calls, restore } = await signedIn();
  try {
    await h.session.handlePluginPoll({ state: state() });
    await h.session.handlePluginPoll({ state: state({ placeName: 'Zeta Test Place v2' }) });
  } finally {
    restore();
  }
  const wrote = patches(calls);
  assert.equal(wrote.length, 2);
  assert.equal(wrote[1].body.place_name, 'Zeta Test Place v2');
});

test('a registry that refuses does not break the Studio link', async () => {
  const h = sessionHarness();
  await new Promise((r) => setTimeout(r, 0));
  h.env.SUPABASE_URL = 'https://supa.test';
  h.env.SUPABASE_ANON_KEY = 'anon-key';
  h.session.liveJwt = 'jwt-of-a-viewer-whose-patch-rls-will-refuse';
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const res = await h.session.handlePluginPoll({ state: state() });
    assert.equal(res.status, 200, 'a cosmetic mirror failure must not fail the poll that carries the ops');
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(h.session.boundPlace.placeName, 'Zeta Test Place', 'the binding itself must still have happened');
});

test('no signed-in tab, no write — and no crash either', async () => {
  const h = sessionHarness();
  await new Promise((r) => setTimeout(r, 0));
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), method: init?.method }); return new Response('[]'); };
  try {
    const res = await h.session.handlePluginPoll({ state: state() });
    assert.equal(res.status, 200);
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(patches(calls).length, 0, 'there is no credential to write with; inventing one is not an option');
});

test('a project paired BEFORE this shipped is backfilled on its next poll', async () => {
  // The binding is in Durable Object storage and nothing was ever mirrored: exactly the state of
  // every project on the live shelf on 2026-09-20.
  const { h, calls, restore } = await signedIn({
    store: [['pluginPlace', { placeId: 4815, gameId: 162342, placeName: 'Zeta Test Place', boundAt: 1 }]],
  });
  try {
    await h.session.handlePluginPoll({ state: state() });
  } finally {
    restore();
  }
  const wrote = patches(calls);
  assert.equal(wrote.length, 1, 'an existing pairing was left reading "No place name yet" forever');
  assert.equal(wrote[0].body.place_name, 'Zeta Test Place');
});

test('a write that was REFUSED is retried, not recorded as done', async () => {
  const h = sessionHarness();
  await new Promise((r) => setTimeout(r, 0));
  h.env.SUPABASE_URL = 'https://supa.test';
  h.env.SUPABASE_ANON_KEY = 'anon-key';
  h.session.liveJwt = 'jwt-of-a-viewer';
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    return new Response('{"message":"permission denied"}', { status: 403 });
  };
  try {
    await h.session.handlePluginPoll({ state: state() });
    assert.equal(h.store.get('placeMirrored'), undefined, 'a refusal was recorded as a successful mirror');
    // The owner arrives. Their tab's JWT replaces the viewer's, and the retry must not be blocked
    // by the failure — but it IS rate limited, so time has to pass.
    h.session.placeMirrorTriedAt = Date.now() - 61_000;
    h.session.liveJwt = 'jwt-of-the-owner';
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), method: init?.method, body: JSON.parse(init.body) });
      return new Response('[]', { status: 200 });
    };
    await h.session.handlePluginPoll({ state: state() });
  } finally {
    globalThis.fetch = real;
  }
  const wrote = patches(calls);
  assert.equal(wrote.length, 2, 'the owner never got a second chance to write the place');
  assert.equal(h.store.get('placeMirrored'), '4815:Zeta Test Place', 'a success must be remembered, or the next poll writes again');
});
