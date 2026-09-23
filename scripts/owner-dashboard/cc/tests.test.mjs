// Apple Test Lab API tests (cc/platforms/tests.mjs). No network: globalThis.fetch is a fake worker
// admin API. The admin key is a sentinel that must never appear in a result, only projects named
// "Gauntlet…" may be read, and the re-run action must only ever answer with a dry-run plan.
//   node --test scripts/owner-dashboard/cc/tests.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVocab, parseVerbs, presentTense, parseGauntlet, scanRounds, findingsFor, traceRow, runOf, deltaOf, cardsOf, measuresOf, tests, testsAction, USD_PER_NEURON,
} from './platforms/tests.mjs';

const KEY = 'SECRET_SENTINEL_ADMIN_KEY_5c1';
const VOCAB = parseVocab(`export const ACTIVITY = {
  searching_knowledge: { canonical: 'C01', label: 'Searching the Roblox docs' },
  building: { canonical: null, label: 'Building' },
};
export const TOOL = {
  create_instances: { kind: 'building', label: 'Created instances' },
  search_docs: { kind: 'searching_knowledge', label: 'Searched the docs' },
  read_script: { kind: 'reading_scripts', label: "Read the script" },
};`);
const VERBS = parseVerbs("const PRESENT_VERBS = [\n  [/^Created\\b/, 'Creating'],\n  [/^Read\\b/, 'Reading'],\n  [/^Searched\\b/, 'Searching'],\n  [/^checked\\b/, 'checking'],\n];");

test('the site vocabulary parses: tool labels, kinds and present-tense verbs', () => {
  assert.deepEqual(VOCAB.tools.create_instances, { kind: 'building', label: 'Created instances' });
  assert.equal(VOCAB.tools.read_script.label, 'Read the script');
  assert.equal(VOCAB.kinds.searching_knowledge, 'Searching the Roblox docs');
  assert.equal(presentTense('Created instances', VERBS), 'Creating instances');
  assert.equal(presentTense('Read the script and searched it', VERBS), 'Reading the script and searching it');
  assert.equal(presentTense('Unknown words', VERBS), 'Unknown words');
});

const GAUNTLET = `## CURRENT TARGET
### The customer prompt (fixed)
> Build a full simulator game. Make no mistakes

| Test | Refs | What same means |
|---|---|---|
| **1. map** (\`--test map\`) | \`map/1-hub.png\`, \`map/2-grove.png\` | a bright hub: grass cliffs, sandy paths, a plaza |
| **3. ui** (\`--test ui\`) | \`ui/1-shop.png\` | thick outlines, gradient cards |

# Archive
## The customer prompt
> Build Basically Grow A Garden

| File | What |
|---|---|
| \`gag.png\` | the real game |
| \`apple-max-run1-candidate.png\` | **ours, round 1**: flat |

| Gap | Skill |
|---|---|
| looked flat | **palette** |
| no props | **set dressing** |`;

test('GAUNTLET.md parses into tests, criteria, refs, the two prompts and the round-1 shot', () => {
  const g = parseGauntlet(GAUNTLET);
  assert.deepEqual(g.tests.map.criteria, ['grass cliffs', 'sandy paths', 'a plaza']);
  assert.deepEqual(g.tests.map.refs, ['docs/gauntlet/visual/refs/simulator/map/1-hub.png', 'docs/gauntlet/visual/refs/simulator/map/2-grove.png']);
  assert.deepEqual(g.tests.ui.criteria, ['thick outlines', 'gradient cards']);
  assert.deepEqual(g.tests.other.criteria, ['palette', 'set dressing']);
  assert.deepEqual(g.tests.other.refs, ['docs/gauntlet/visual/refs/gag.png']);
  assert.equal(g.ours1, 'docs/gauntlet/visual/refs/apple-max-run1-candidate.png');
  assert.equal(g.prompts.simulator, 'Build a full simulator game. Make no mistakes');
  assert.equal(g.prompts.garden, 'Build Basically Grow A Garden');
});

test('round files split into compare images per test and tester shots', () => {
  const r = scanRounds(['round-1-compare.jpg', 'round-4-map-compare.jpg', 'round-4-ui-compare.jpg', 'round-4-edit.png', 'notes.txt', 'round-x.png']);
  assert.deepEqual(r['1'].compares, { other: 'docs/gauntlet/visual/rounds/round-1-compare.jpg' });
  assert.deepEqual(Object.keys(r['4'].compares), ['map', 'ui']);
  assert.deepEqual(r['4'].shots, ['docs/gauntlet/visual/rounds/round-4-edit.png']);
  assert.equal(Object.keys(r).length, 2);
});

test('findings are matched to their round only', () => {
  const text = '- [open][high] F-064: the run ended at 15 minutes (round 4, round-5) — evidence: x\n- [closed][low] F-010: round 14 thing\n- not a finding round 4';
  assert.deepEqual(findingsFor(text, 4).map((f) => f.id), ['F-064']);
  assert.equal(findingsFor(text, 4)[0].text, 'the run ended at 15 minutes (round 4, round-5)');
  assert.deepEqual(findingsFor(text, 5).map((f) => f.id), ['F-064']);
  assert.deepEqual(findingsFor(text, 1), []);
});

test('a trace entry becomes the site row: label, running label, target, failure reason', () => {
  const ok = traceRow({ tool: 'create_instances', summary: '✓ create_instances · Workspace.Hub', ok: true, durationMs: 1200 }, VOCAB, VERBS);
  assert.deepEqual(ok, { tool: 'create_instances', title: 'Created instances', running: 'Creating instances', kind: 'building', ok: true, ms: 1200, target: 'Workspace.Hub', result: null });
  const bad = traceRow({ tool: 'create_rig', summary: '✗ create_rig — the generated rig contained a script', ok: false }, VOCAB, VERBS);
  assert.equal(bad.title, 'create rig');
  assert.equal(bad.result, 'the generated rig contained a script');
  assert.equal(bad.ok, false);
});

const REPLY = {
  role: 'assistant', id: 'run-5', mode: 'agent', productModel: 'apple-max', stopReason: 'done', creditsSpent: 584, content: 'Apple stopped here.',
  context: { usedChars: 49320, maxChars: 60000, dropped: { groups: 123, chars: 9 } },
  toolTrace: [
    { tool: 'propose_plan', summary: '✓ propose_plan', ok: true, detail: { blocks: [{ type: 'build_plan', title: 'Round 5', steps: [{ title: 'Map', detail: 'hills', tool: 'create_instances' }] }] } },
    { tool: 'search_docs', summary: '✓ search_docs', ok: true, detail: [{ title: 'Parts', url: 'https://create.roblox.com/docs/parts', citation: 'D1' }] },
    { tool: 'create_instances', summary: '✗ create_instances — instance not found', ok: false },
    { tool: 'inspect_visually', summary: '✓ inspect_visually', ok: true, detail: { render: { views: [{ name: 'hero', pngDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }, { name: 'evil', pngDataUrl: 'javascript:alert(1)' }] }, critique: { score: 1, passed: false, summary: 'flat', defects: [{ dimension: 'volume', severity: 'high', observed: 'flat', fix: 'hills' }] } } },
    { tool: 'play_check', summary: '✓ play_check', ok: true, detail: { verdict: 'client_errors', clientErrors: ['a', 'b'], serverErrors: ['c'] } },
  ],
};
const USER = { role: 'user', content: 'Build a full simulator game', createdAt: '2026-09-23T18:34:01.926Z' };
const BUILD = { runId: 'run-5', steps: 142, opsApplied: 128, opsFailed: 5, durationMs: 817181, neurons: 17516, finishReason: 'loop', at: Date.parse('2026-09-23T18:48:00Z') };
const CALLS = [{ runId: 'run-5', model: '@cf/zai-org/glm-5.3-flash', outcome: 'ok', inputTokens: 100, outputTokens: 10, cachedInputTokens: 50, latencyMs: 400, neurons: 1 }, { runId: 'run-5', outcome: 'error', errorKind: 'timeout', latencyMs: 100 }];

test('a run joins the prompt, model, trace, cost, critique, playtest and only safe image data', () => {
  const r = runOf({ user: USER, reply: REPLY, build: BUILD, calls: CALLS, project: { id: 'p', name: 'Gauntlet Round 5' } }, VOCAB, VERBS);
  assert.equal(r.prompt, 'Build a full simulator game');
  assert.equal(r.model, 'Apple MAX');
  assert.equal(r.durationMs, 817181);
  assert.equal(r.credits, 584);
  assert.equal(r.usd, 17516 * USD_PER_NEURON);
  assert.equal(r.usage.calls, 2); assert.equal(r.usage.failed, 1); assert.deepEqual(r.usage.errorKinds, ['timeout']);
  assert.equal(r.plan.steps[0].tool, 'create_instances');
  assert.deepEqual(r.docs.map((d) => d.citation), ['D1']);
  assert.equal(r.knowledge[0].tool, 'search_docs');
  assert.equal(r.critique.score, 1);
  assert.equal(r.play.clientErrors.length, 2);
  assert.equal(r.appleShots.length, 1, 'a non-data: URL image is dropped');
  assert.equal(r.thinking, null); assert.equal(r.skills, null);
  assert.equal(r.context.droppedGroups, 123);
});

test('the delta compares only what both rounds recorded, in the right direction', () => {
  const d = deltaOf({ selfScore: 3, opsApplied: 128, opsFailed: 5, toolErrors: 5, playErrors: null }, { selfScore: null, opsApplied: 26, opsFailed: 8, toolErrors: 5, playErrors: 2 });
  assert.deepEqual(d.items.map((i) => [i.key, i.dir]), [['opsApplied', 'better'], ['opsFailed', 'better'], ['toolErrors', 'same']]);
  assert.equal(d.better, 2); assert.equal(d.worse, 0); assert.equal(d.same, 1);
  assert.equal(deltaOf({}, {}).items.length, 0);
});

test('cards: one per round and test, newest first, each against the last round of the same test', () => {
  const run = (a, f) => ({ trace: [{ ok: true }, { ok: f === 0 }], opsApplied: a, opsFailed: f, critique: null, play: null });
  const cards = cardsOf([
    { round: 1, compares: { other: 'x' }, run: null },
    { round: 4, compares: { map: 'm4', ui: 'u4' }, run: run(26, 8) },
    { round: 5, compares: { map: 'm5', models: 'o5', ui: 'u5' }, run: run(128, 5) },
  ]);
  assert.deepEqual(cards.map((c) => c.id), ['r5-ui', 'r5-models', 'r5-map', 'r4-ui', 'r4-map', 'r1-other']);
  const r5map = cards.find((c) => c.id === 'r5-map');
  assert.equal(r5map.delta.vs, 'r4-map');
  assert.equal(r5map.delta.better, 2);
  assert.equal(cards.find((c) => c.id === 'r5-models').delta, null);
  assert.equal(r5map.score, null, 'no hardness score is invented');
  assert.deepEqual(measuresOf(null), {});
});

test('tests() reads only Gauntlet projects, never leaks the key, and re-run is a dry-run plan only', async () => {
  const seen = [];
  const P5 = '0416b631-da5f-4ab2-8f1d-855c95febd61'; const PX = '11111111-2222-3333-4444-555555555555';
  process.env.GOLEM_ADMIN_KEY = KEY; process.env.API_BASE = 'https://worker.test';
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), method: init?.method || 'GET', key: init?.headers?.['x-admin-key'] });
    const u = new URL(url); const json = (x) => new Response(JSON.stringify(x), { status: 200 });
    if (u.pathname === '/api/admin/logs' && u.searchParams.get('kind') === 'build') return json({ events: [{ ...BUILD, projectId: P5 }, { runId: 'z', projectId: PX }, { projectId: '../etc' }] });
    if (u.pathname === '/api/admin/logs') return json({ events: CALLS });
    if (u.pathname === `/api/admin/session-info/${P5}`) return json({ project: { id: P5, name: 'Gauntlet Round 5 - Simulator' } });
    if (u.pathname === `/api/admin/session-info/${PX}`) return json({ project: { id: PX, name: 'A customer project' } });
    if (u.pathname === `/api/admin/session-messages/${P5}`) return json({ messages: [USER, REPLY] });
    return new Response('{}', { status: 404 });
  };
  const d = await tests();
  const out = JSON.stringify(d);
  assert.ok(!out.includes(KEY), 'the admin key never leaves the module');
  assert.ok(!seen.some((s) => s.url.includes(`session-messages/${PX}`)), 'a non-Gauntlet project is never read');
  assert.ok(!seen.some((s) => s.url.includes('../')), 'a non-uuid project id is never requested');
  assert.ok(seen.every((s) => s.method === 'GET'), 'reading is GET only');
  assert.equal(d.worker.ok, true);
  const r5 = d.rounds.find((r) => r.round === 5);
  assert.equal(r5.run.prompt, 'Build a full simulator game');
  assert.equal(r5.dateSource, 'worker');

  const before = seen.length;
  const a = await testsAction({ op: 'rerun', id: 'r5-map', confirm: true });
  assert.equal(a.dryRun, true);
  assert.equal(a.plan.method, 'POST');
  assert.match(a.plan.url, /\/api\/admin\/agent-run\//);
  assert.equal(a.plan.body.text, 'Build a full simulator game');
  assert.ok(!JSON.stringify(a).includes(KEY));
  assert.ok(!seen.slice(before).some((s) => s.url.includes('agent-run') || s.method !== 'GET'), 'the re-run is never sent');
  assert.equal((await testsAction({ op: 'delete' })).ok, false);
  assert.equal((await testsAction({ op: 'rerun', id: 'r99-map' })).ok, false);
});
