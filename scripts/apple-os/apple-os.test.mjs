import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initVault, searchWiki } from './vault.mjs';
import { directAction, localRoute, routeRequest } from './route.mjs';
import { runBrief, latestBrief } from './brief.mjs';
import { osAction } from '../owner-dashboard/cc/os.mjs';
import { discoverWorkflows } from './discover.mjs';

test('private vault is safe to initialize repeatedly and search returns source lines', () => {
  const root = mkdtempSync(join(tmpdir(), 'apple-os-test-'));
  try {
    const first = initVault(root);
    assert.ok(first.created.includes('wiki/index.md'));
    const original = readFileSync(join(root, 'wiki/index.md'), 'utf8');
    writeFileSync(join(root, 'wiki/index.md'), `${original}\nowner note\n`);
    assert.deepEqual(initVault(root).created, []);
    assert.match(readFileSync(join(root, 'wiki/index.md'), 'utf8'), /owner note/);
    const hit = searchWiki('Apple mission', root);
    assert.ok(hit.some((x) => x.path.endsWith('index.md') && x.line > 0));
    assert.deepEqual(searchWiki('', root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('exact read command has no model; implementation cannot be downgraded by Jev', async () => {
  assert.equal(directAction('show latest brief'), 'latest-brief');
  assert.equal(directAction('הצג את דוח הבעלים האחרון'), 'latest-brief');
  assert.equal(localRoute('show latest brief').tier, 1);
  assert.equal(localRoute('build a Roblox game').tier, 3);
  const fetchImpl = async (_url, req) => {
    const body = JSON.parse(req.body);
    assert.equal(body.questions.tier.type, 'choice');
    return new Response(JSON.stringify({ answers: { tier: { type: 'choice', choice: 'answer', confidence: 0.99 } } }), { status: 200 });
  };
  const r = await routeRequest('deploy a new worker', { apiKey: 'sentinel', fetchImpl });
  assert.equal(r.tier, 3);
  assert.equal(r.fallback, 'write-rule-overrides-jev');
  assert.equal((await routeRequest('What failed?', { apiKey: 'sentinel', fetchImpl })).tier, 2);
  const low = await routeRequest('What failed?', { apiKey: 'sentinel', fetchImpl: async () => new Response(JSON.stringify({ answers: { tier: { type: 'choice', choice: 'agent', confidence: 0.2 } } }), { status: 200 }) });
  assert.equal(low.source, 'conservative-local-rule');
});

test('brief reads current sources and writes a dated local artifact without changing the repo', () => {
  const root = mkdtempSync(join(tmpdir(), 'apple-os-test-'));
  try {
    const date = new Date('2026-09-25T12:00:00Z');
    const result = runBrief({ root, now: date });
    const text = readFileSync(result.path, 'utf8');
    assert.match(text, /2026-09-25T12:00:00.000Z/);
    assert.match(text, /ביקורות עצמאיות/);
    assert.match(text, /packages\/training\/runs\/forever\/state.json/);
    assert.equal(latestBrief(root).path, result.path);
    assert.ok(Number.isInteger(result.facts.acceptance.reviews));
    assert.ok(result.facts.training?.best?.total > 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dashboard request routing and vault search remain local without explicit Jev selection', async () => {
  const routed = await osAction({ kind: 'route', text: 'show latest brief', useJev: false });
  assert.equal(routed.ok, true);
  assert.equal(routed.decision.tier, 1);
  assert.equal(routed.sentToJev, false);
  const executed = await osAction({ kind: 'route', text: 'show latest brief', executeExact: true });
  assert.equal(executed.execution.kind, 'brief');
  assert.ok(executed.execution.path?.endsWith('-owner-brief.md'));
  const training = await osAction({ kind: 'route', text: 'הצג את מצב האימון', executeExact: true });
  assert.equal(training.execution.kind, 'training');
  assert.ok(training.execution.training.best.total > 0);
  assert.equal((await osAction({ kind: 'route', text: 'build a game', executeExact: true })).execution, null);
  const searched = await osAction({ kind: 'search', query: 'Apple' });
  assert.equal(searched.ok, true);
  assert.ok(Array.isArray(searched.hits));
  assert.equal((await osAction({ kind: 'route', text: '' })).ok, false);
});

test('workflow discovery excludes injected repository instructions from owner request counts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'apple-os-sessions-'));
  try {
    const dir = join(root, '2026/09/25'); mkdirSync(dir, { recursive: true });
    const rows = [
      { type: 'session_meta', payload: { cwd: '/Users/moshe/Desktop/RbxAI' } },
      { type: 'response_item', payload: { role: 'user', content: [{ type: 'input_text', text: 'Security auth secrets in AGENTS.md' }],
        internal_chat_message_metadata_passthrough: { content_item_kinds: ['agents_md.instructions'] } } },
      { type: 'response_item', payload: { role: 'user', content: [{ type: 'input_text', text: 'Test the Roblox Studio plugin' }] } },
    ];
    writeFileSync(join(dir, 'one.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n'));
    const result = await discoverWorkflows({ sessionsRoot: root, now: new Date('2026-09-25T12:00:00Z') });
    assert.equal(result.sessions, 1);
    assert.equal(result.requests, 1);
    assert.equal(result.counts.studio, 1);
    assert.equal(result.counts.security, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
