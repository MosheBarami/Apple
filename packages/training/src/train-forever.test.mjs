import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseYamlConfig,
  renderYamlConfig,
  deriveConfig,
  applyDryOverrides,
  classifyTraining,
  classifyTemplateCheck,
  transformTrainRows,
  readVerifiedShard,
  parseTrainLog,
  hasTurned,
  pickBestCheckpoint,
  scoresFromScored,
  shouldPromote,
  generateHypotheses,
  pickHypothesis,
  triedIds,
  formatLogLine,
  renderModelCard,
  evalProblems,
  pairedComparison,
  promotionMargin,
  configKey,
  versionsIn,
  tryLock,
  run,
  trainingInvocation,
} from './train-forever.mjs';

test('CPU training uses the local CPU wrapper and enough time for the same full config', () => {
  const gpu = trainingInvocation(false, 'lora-apple-v19.yaml', 400);
  const cpu = trainingInvocation(true, 'lora-apple-v19.yaml', 400);
  assert.deepEqual(gpu.args, ['-m', 'mlx_lm', 'lora', '--config', 'lora-apple-v19.yaml']);
  assert.deepEqual(cpu.args, ['src/mlx_lora_cpu.py', '--config', 'lora-apple-v19.yaml']);
  assert.ok(cpu.timeoutMs > gpu.timeoutMs);
  assert.equal(cpu.device, 'cpu');
});

test('template preflight must pass before a version spends CPU or GPU time', () => {
  assert.equal(classifyTemplateCheck({ code: 0 }), null);
  assert.equal(classifyTemplateCheck({ code: 3 }), 'template_mismatch');
  assert.equal(classifyTemplateCheck({ code: 1 }), 'template_failed');
  assert.equal(classifyTemplateCheck({ code: null, timedOut: true }), 'template_failed');
  assert.equal(classifyTemplateCheck({ code: null, stopped: true }), 'stopped');
});

const HERE = dirname(fileURLToPath(import.meta.url));
const V5_YAML = readFileSync(join(HERE, '../lora-apple-v5.yaml'), 'utf8');
const QUEUE = JSON.parse(readFileSync(join(HERE, '../forever-hypotheses.json'), 'utf8')).hypotheses;

// ---------- config derivation ----------

test('parses the real v5 config, comments and all', () => {
  const cfg = parseYamlConfig(V5_YAML);
  assert.equal(cfg.model, 'unsloth/Llama-3.2-3B-Instruct');
  assert.equal(cfg.learning_rate, 5e-5);
  assert.equal(cfg.max_seq_length, 2048);
  assert.equal(cfg.grad_checkpoint, true);
  assert.equal(cfg.val_batches, -1);
  assert.equal(cfg.data, 'mlxdata-apple-v5');
});

test('render -> parse round-trips, including nested flow maps', () => {
  const cfg = { ...parseYamlConfig(V5_YAML), lora_parameters: { rank: 16, dropout: 0, scale: 20 }, learning_rate: 1e-4 };
  const text = renderYamlConfig(cfg, ['a header']);
  assert.match(text, /^# a header\n/);
  // PyYAML reads `1e-4` as a STRING; the renderer must always put a dot in the mantissa.
  assert.match(text, /^learning_rate: 1\.0e-4$/m);
  assert.deepEqual(parseYamlConfig(text), cfg);
});

test('deriveConfig changes exactly the lever keys plus adapter_path', () => {
  const base = parseYamlConfig(V5_YAML);
  const cfg = deriveConfig(base, { id: 'rank16', set: { 'lora_parameters.rank': 16 } }, { adapterPath: 'adapters/apple-v6' });
  assert.deepEqual(cfg.lora_parameters, { rank: 16, dropout: 0, scale: 20 }, 'mlx defaults filled in around the lever');
  const diff = Object.keys(cfg).filter((k) => JSON.stringify(cfg[k]) !== JSON.stringify(base[k]));
  assert.deepEqual(diff.sort(), ['adapter_path', 'lora_parameters']);
  assert.equal(base.lora_parameters, undefined, 'base config is not mutated');
});

test('deriveConfig computes a cosine schedule from the derived lr, iters and accumulation', () => {
  const base = parseYamlConfig(V5_YAML);
  const cfg = deriveConfig(base, { id: 'cos', set: { lr_schedule: 'cosine' } }, { adapterPath: 'x' });
  assert.deepEqual(cfg.lr_schedule, { name: 'cosine_decay', warmup: 5, arguments: [5e-5, 100, 5e-6] });
});

test('deriveConfig keeps save_every == steps_per_eval and sets the data dir for data levers', () => {
  const base = { ...parseYamlConfig(V5_YAML), save_every: 50 };
  const cfg = deriveConfig(base, { id: 'gl', data: [{ op: 'upweight', select: 'game-logic', factor: 2 }] }, { adapterPath: 'x', dataPath: 'runs/forever/data-v6' });
  assert.equal(cfg.save_every, cfg.steps_per_eval);
  assert.equal(cfg.data, 'runs/forever/data-v6');
});

test('dry overrides shrink the run to 2 iters', () => {
  const cfg = applyDryOverrides(parseYamlConfig(V5_YAML));
  assert.deepEqual([cfg.iters, cfg.steps_per_eval, cfg.save_every, cfg.val_batches], [2, 1, 1, 2]);
});

// ---------- data mix ----------

const row = (kind, family, call) => ({
  messages: [{ role: 'user', content: 'q' }, call ? { role: 'assistant', tool_calls: [{ function: { name: 't' } }] } : { role: 'assistant', content: 'done' }],
  meta: { kind, family },
});

test('data ops upweight the selected track and drop families', () => {
  const rows = [row('game-logic', 'a'), row('apple-tool-trajectory', 'b', true), row('apple-tool-trajectory', 'c', false), row('apple-tool-trajectory', 'ui-x', true)];
  const finish = transformTrainRows(rows, [{ op: 'upweight', select: 'finish', factor: 3 }]);
  assert.equal(finish.filter((r) => r.meta.family === 'c').length, 3);
  assert.equal(finish.length, 6);
  const gl = transformTrainRows(rows, [{ op: 'upweight', select: 'game-logic', factor: 2 }]);
  assert.equal(gl.filter((r) => r.meta.family === 'a').length, 2);
  const dropped = transformTrainRows(rows, [{ op: 'dropFamilies', families: ['ui-x'] }]);
  assert.deepEqual(dropped.map((r) => r.meta.family), ['a', 'b', 'c']);
  assert.throws(() => transformTrainRows(rows, [{ op: 'nope' }]), /unknown data op/);
});

test('a verified shard adds new game-logic rows to train only and refuses duplicate ids', () => {
  const rows = [row('game-logic', 'old')];
  rows[0].meta.id = 'old-1';
  const added = { ...row('game-logic', 'new'), meta: { id: 'new-1', family: 'new', kind: 'game-logic' } };
  const op = { op: 'appendVerified', source: 'data/game-logic-seeds-v4/shard-3.jsonl', sha256: 'a'.repeat(64) };
  assert.deepEqual(transformTrainRows(rows, [op], { [op.source]: [added] }).map((r) => r.meta.id), ['old-1', 'new-1']);
  assert.equal(rows.length, 1, 'the source training split was mutated');
  assert.throws(() => transformTrainRows(rows, [op], { [op.source]: [{ ...added, meta: { ...added.meta, id: 'old-1' } }] }), /duplicate/);
});

test('the new 51-row logic shard still matches its pinned bytes and passes Luau', async () => {
  const rows = await readVerifiedShard(
    'data/game-logic-seeds-v4/shard-3.jsonl',
    'bf46d88962778c37bf7a89a8a4b7d9902e290cd051392f0ada73e9c7e487863a',
  );
  assert.equal(rows.length, 51);
  assert.ok(rows.every((r) => r.meta.kind === 'game-logic' && !Object.hasOwn(r.meta, 'checks')));
  await assert.rejects(
    readVerifiedShard('data/game-logic-seeds-v4/shard-3.jsonl', '0'.repeat(64)),
    /changed/,
  );
});

// ---------- log parsing ----------

const BAR = 'Calculating loss...: 0it [00:00, ?it/s]Calculating loss...: 37it [00:31,  1.18it/s]\n';
const COMPLETE = `Loading pretrained model
Iter 1: Val loss 3.225, Val took 30.1s
Iter 10: Train loss 1.2, Learning Rate 5.000e-05, It/sec 0.5
${BAR}Iter 25: Val loss 1.246, Val took 31.0s
Iter 25: Saved adapter weights to adapters/x/adapters.safetensors and adapters/x/0000025_adapters.safetensors.
${BAR}Iter 50: Val loss 1.072, Val took 31.0s
Iter 50: Saved adapter weights to adapters/x/adapters.safetensors and adapters/x/0000050_adapters.safetensors.
Saved final weights to adapters/x/adapters.safetensors.
`;
const WATCHDOG = `Iter 1: Val loss 3.2, Val took 30s
Iter 25: Val loss 0.90, Val took 30s
Iter 50: Val loss 0.85, Val took 30s
Iter 60: Train loss 0.35, Learning Rate 5.000e-05
Traceback (most recent call last):
  File "trainer.py", line 328, in train
RuntimeError: [METAL] Command buffer execution failed: Impacting Interactivity (0000000e:kIOGPUCommandBufferCallbackErrorImpactingInteractivity).
Iter 50: Saved adapter weights to adapters/x/adapters.safetensors and adapters/x/0000050_adapters.safetensors.
`;

test('parses val loss per eval step and completion', () => {
  const r = parseTrainLog(COMPLETE);
  assert.deepEqual(r.vals, [{ iter: 1, loss: 3.225 }, { iter: 25, loss: 1.246 }, { iter: 50, loss: 1.072 }]);
  assert.equal(r.completed, true);
  assert.equal(r.watchdog, false);
  assert.equal(r.crashed, false);
  assert.equal(r.lastIter, 50);
});

test('detects the Metal watchdog even when the process exit code would have said 0', () => {
  const r = parseTrainLog(WATCHDOG);
  assert.equal(r.completed, false);
  assert.equal(r.watchdog, true);
  assert.equal(r.crashed, true);
  assert.equal(r.lastIter, 60);
});

test('an early exit with no traceback and no final save is not complete', () => {
  const r = parseTrainLog('Iter 1: Val loss 3.2, Val took 1s\nIter 10: Train loss 1.0\n');
  assert.equal(r.completed, false);
  assert.equal(r.watchdog, false);
});

test('hasTurned needs `patience` worse evals after the minimum', () => {
  assert.equal(hasTurned([{ iter: 100, loss: 0.98 }, { iter: 125, loss: 1.08 }, { iter: 150, loss: 1.09 }]), true);
  assert.equal(hasTurned([{ iter: 225, loss: 0.838 }, { iter: 250, loss: 0.861 }]), false);
  assert.equal(hasTurned([]), false);
});

test('best checkpoint is the min-val eval that has a file on disk', () => {
  const vals = [{ iter: 1, loss: 3 }, { iter: 25, loss: 0.9 }, { iter: 50, loss: 0.8 }, { iter: 75, loss: 0.85 }];
  assert.deepEqual(pickBestCheckpoint(vals, [25, 50, 75]), { iter: 50, loss: 0.8 });
  assert.deepEqual(pickBestCheckpoint(vals, [25, 75]), { iter: 75, loss: 0.85 });
  assert.equal(pickBestCheckpoint([{ iter: 1, loss: 3 }], []), null);
});


test('a run cut short before half its iters and before the val curve turned is truncated, not done', () => {
  const early = [{ iter: 1, loss: 3 }, { iter: 25, loss: 1.1 }];
  assert.deepEqual(classifyTraining({ completed: false, lastIter: 30, vals: early }, 400), { usable: false, note: 'stopped at 30/400' });
  // v5's own death: best at 225, died at 250 of 400 -> past half, so its checkpoint is kept and the log says so
  const v5 = [{ iter: 200, loss: 0.85 }, { iter: 225, loss: 0.838 }, { iter: 250, loss: 0.861 }];
  assert.deepEqual(classifyTraining({ completed: false, lastIter: 250, vals: v5 }, 400), { usable: true, note: 'stopped at 250/400' });
  const turned = [{ iter: 25, loss: 0.9 }, { iter: 50, loss: 0.95 }, { iter: 75, loss: 0.99 }];
  assert.deepEqual(classifyTraining({ completed: false, lastIter: 80, vals: turned }, 400), { usable: true, note: 'stopped at 80/400 after val turned' });
  assert.deepEqual(classifyTraining({ completed: true, lastIter: 400, vals: v5 }, 400), { usable: true, note: null });
});

// ---------- scoring and promotion ----------

const V5_SCORED = JSON.parse(readFileSync(join(HERE, '../runs/eval-v5-on-v5set-scored.json'), 'utf8'));
const PINNED_N = { trajectory: 23, gameLogic: 8, finish: 7 };

test('scores read the adapter side of a score-eval tally', () => {
  assert.deepEqual(scoresFromScored(V5_SCORED), {
    trajectory: 17, gameLogic: 0, finish: 3, total: 20, n: { trajectory: 23, gameLogic: 8, finish: 7 },
  });
});

test('evalProblems: the real v5 eval is valid; n drift, base drift and harness misses are not', () => {
  assert.deepEqual(evalProblems(V5_SCORED, { n: PINNED_N, base: V5_SCORED.tally.base }), []);
  const edited = structuredClone(V5_SCORED);
  edited.tally.adapter.trajectory.n = 22;
  assert.match(evalProblems(edited, { n: PINNED_N }).join(), /trajectory n 22 != 23/);
  const noLuau = structuredClone(V5_SCORED);
  noLuau.tally.adapter['game-logic'].reasons = { 'harness_unavailable:luau_not_found': 8 };
  assert.match(evalProblems(noLuau, { n: PINNED_N }).join(), /adapter game-logic: 8x harness_unavailable:luau_not_found/);
  const missing = structuredClone(V5_SCORED);
  missing.tally.base['game-logic'].reasons.example_not_in_curriculum = 1;
  assert.match(evalProblems(missing, {}).join(), /base game-logic: 1x example_not_in_curriculum/);
  const baseMoved = structuredClone(V5_SCORED);
  baseMoved.tally.base.finish.ok = 5;
  assert.match(evalProblems(baseMoved, { base: V5_SCORED.tally.base }).join(), /base finish 5 != 4/);
});

test('paired promotion requires the same held-out rows and base outcomes, not only equal totals', () => {
  const candidate = structuredClone(V5_SCORED);
  const best = structuredClone(V5_SCORED);
  assert.deepEqual(pairedComparison(candidate, best, PINNED_N).problems, []);

  best.perRow[0].id = 'a-different-task';
  assert.match(pairedComparison(candidate, best, PINNED_N).problems.join('; '), /row|task|id/i);
  best.perRow[0].id = candidate.perRow[0].id;

  best.perRow[0].base = { ...best.perRow[0].base, ok: !best.perRow[0].base.ok };
  assert.match(pairedComparison(candidate, best, PINNED_N).problems.join('; '), /base.*row|row.*base/i);
});

test('paired promotion refuses missing, duplicate and malformed row evidence', () => {
  const candidate = structuredClone(V5_SCORED);
  const best = structuredClone(V5_SCORED);
  best.perRow = best.perRow.slice(1);
  assert.match(pairedComparison(candidate, best, PINNED_N).problems.join('; '), /row count/i);

  best.perRow = structuredClone(candidate.perRow);
  best.perRow[1].id = best.perRow[0].id;
  assert.match(pairedComparison(candidate, best, PINNED_N).problems.join('; '), /row identities/i);

  best.perRow = structuredClone(candidate.perRow);
  best.perRow[0] = null;
  assert.match(pairedComparison(candidate, best, PINNED_N).problems.join('; '), /row evidence/i);
});

test('promotion needs the rescored best + margin; ties, reseeds and rank > 8 never promote', () => {
  const c = (total, extra = {}) => ({ lever: { id: 'x' }, scores: { total }, cfg: {}, ...extra });
  assert.equal(shouldPromote(c(21), 20, 2).promote, false, 'one point on 38 greedy rows is noise');
  assert.equal(shouldPromote(c(22), 20, 2).promote, true);
  assert.equal(shouldPromote(c(20, { valLoss: 0.1 }), 20, 2).promote, false, 'a tie never promotes, whatever the val loss');
  assert.equal(shouldPromote(c(30, { lever: { id: 'reseed@v20' } }), 20, 2).promote, false);
  assert.match(shouldPromote(c(30, { cfg: { lora_parameters: { rank: 16 } } }), 20, 2).why, /rank 16/);
  assert.equal(shouldPromote({ lever: { id: 'x' }, scores: null }, 20, 2).promote, false);
});

test('promotionMargin is max(2, spread of the reseeds around the best they re-ran)', () => {
  assert.equal(promotionMargin([]), 2);
  const h = [
    { lever: { id: 'reseed@v20' }, status: 'done', scores: { total: 17 }, bestVersionAtRun: 5, bestTotalAtRun: 20 },
    { lever: { id: 'reseed@v21' }, status: 'done', scores: { total: 22 }, bestVersionAtRun: 5, bestTotalAtRun: 20 },
    { lever: { id: 'reseed@v22' }, status: 'eval_failed', scores: null, bestVersionAtRun: 5, bestTotalAtRun: 20 },
    { lever: { id: 'lr-1e-4' }, status: 'done', scores: { total: 10 }, bestVersionAtRun: 5, bestTotalAtRun: 20 },
  ];
  assert.equal(promotionMargin(h), 6);
});

test('promotionMargin accounts for repeated paired scores of the same best adapter', () => {
  const history = [24, 24, 21].map((bestTotalAtRun, i) => ({
    version: 26 + i,
    status: 'done',
    lever: { id: `ordinary-${i}` },
    scores: { total: 19 },
    bestVersionAtRun: 22,
    bestTotalAtRun,
  }));
  assert.equal(promotionMargin(history), 4);
});

// ---------- hypotheses ----------

test('the committed queue: at least eight single-lever changes, unique ids, a reason each, rank servable', () => {
  assert.ok(QUEUE.length >= 8, `queue has ${QUEUE.length}`);
  assert.equal(new Set(QUEUE.map((h) => h.id)).size, QUEUE.length);
  for (const h of QUEUE) {
    assert.ok(h.why && h.why.length > 20, `${h.id} explains itself`);
    assert.equal(Object.keys(h.set ?? {}).length + (h.data?.length ?? 0), 1, `${h.id} changes exactly one thing`);
    const rank = h.set?.['lora_parameters.rank'];
    if (rank !== undefined) assert.ok(rank <= 8, 'rank <= 8 is the documented Workers AI limit');
  }
});

test('a lever is used up only by a done run or a second failed attempt', () => {
  const lever = QUEUE[0];
  const st = (...statuses) => ({ history: statuses.map((status, i) => ({ version: 6 + i, lever, status })) });
  assert.equal(triedIds(st('eval_failed')).has(lever.id), false);
  assert.equal(triedIds(st('truncated')).has(lever.id), false);
  assert.equal(triedIds(st('truncated', 'truncated')).has(lever.id), false,
    'Metal watchdog truncations do not measure the lever');
  assert.equal(triedIds(st('error', 'truncated')).has(lever.id), false,
    'a code error followed by a watchdog truncation does not exhaust a lever');
  assert.equal(triedIds(st('template_failed', 'template_failed')).has(lever.id), false,
    'a broken preflight cannot consume an untrained lever');
  assert.equal(triedIds(st('failed_training', 'timeout')).has(lever.id), true);
  assert.equal(triedIds(st('done')).has(lever.id), true);
  assert.equal(triedIds(st('interrupted', 'stopped', 'eval_invalid', 'interrupted')).has(lever.id), false);
});

const V5_CFG = parseYamlConfig(V5_YAML);

test('pickHypothesis walks the queue in order, skipping tried levers and retrying a first failure', () => {
  const state = { best: { version: 5, lineage: [], cfg: V5_CFG }, history: [
    { version: 6, lever: QUEUE[0], status: 'done' },
    { version: 7, lever: QUEUE[1], status: 'interrupted' },
  ] };
  assert.deepEqual([...triedIds(state)], [QUEUE[0].id]);
  assert.equal(pickHypothesis(QUEUE, state, 8).id, QUEUE[1].id);
  state.history.push({ version: 8, lever: QUEUE[1], status: 'truncated' });
  assert.equal(pickHypothesis(QUEUE, state, 9).id, QUEUE[1].id, 'second attempt');
});

test('configKey ignores names but not content, so a re-derived config is never trained twice', () => {
  const lr1e4 = QUEUE.find((h) => h.id === 'lr-1e-4');
  assert.equal(configKey(V5_CFG, lr1e4), configKey(V5_CFG, { id: 'lr-x2@v5', set: { learning_rate: 1e-4 } }));
  assert.notEqual(configKey(V5_CFG, lr1e4), configKey(V5_CFG, { id: 'y', set: { learning_rate: 2e-5 } }));
  const up = { id: 'a', data: [{ op: 'upweight', select: 'finish', factor: 3 }] };
  assert.equal(configKey(V5_CFG, up), configKey(V5_CFG, { ...up, id: 'b' }));
  assert.notEqual(configKey(V5_CFG, up), configKey(V5_CFG, { id: 'c', data: [{ op: 'upweight', select: 'finish', factor: 2 }] }));

  // The whole queue ran on v5 and nothing won: the generator must not hand back lr-x2@v5 (== lr-1e-4).
  let history = QUEUE.map((lever, i) => ({ version: 6 + i, lever, status: 'done', configKey: configKey(V5_CFG, lever), scores: { total: 10 }, bestTotalAtRun: 20 }));
  const picked = [];
  for (let v = 20; v < 30; v++) {
    const h = pickHypothesis(QUEUE, { best: { version: 5, lineage: [], cfg: V5_CFG }, history }, v);
    picked.push(h.id);
    history = [...history, { version: v, lever: h, status: 'done', configKey: configKey(V5_CFG, h) }];
  }
  assert.ok(!picked.includes('lr-x2@v5'), picked.join());
  assert.equal(new Set(history.map((h) => h.configKey)).size, history.length, 'no config trained twice');
});

test('an exhausted queue still yields a hypothesis: combos ranked by gain over the best of the day, lr perturbations, then a reseed', () => {
  const cfg = { ...V5_CFG, learning_rate: 5e-5 };
  // QUEUE[3] scored the most in absolute terms, but against a stronger best; QUEUE[5] and QUEUE[6] gained the most.
  const at = { 3: [30, 29], 5: [24, 20], 6: [23, 20] };
  const history = QUEUE.map((lever, i) => ({ version: 6 + i, lever, status: 'done', scores: { total: at[i]?.[0] ?? 10 }, bestTotalAtRun: at[i]?.[1] ?? 20, valLoss: 1 }));
  const state = { best: { version: 8, lineage: [], cfg }, history };
  const gen = generateHypotheses(state, 20);
  const expected = [QUEUE[5].id, QUEUE[6].id].sort();
  assert.equal(gen[0].id, `combo(${expected[0]}+${expected[1]})`);
  assert.ok(gen.some((h) => h.id === 'lr-x0.5@v8' && h.set.learning_rate === 2.5e-5));
  assert.ok(gen.some((h) => h.id === 'lr-x2@v8' && h.set.learning_rate === 1e-4));
  assert.equal(gen.at(-1).id, 'reseed@v20');

  let s = state;
  for (let v = 20; v < 40; v++) {
    const h = pickHypothesis(QUEUE, s, v);
    assert.ok(h && !triedIds(s).has(h.id), `v${v} got a fresh hypothesis`);
    s = { ...s, history: [...s.history, { version: v, lever: h, status: 'done', configKey: configKey(cfg, h) }] };
  }
  assert.equal(s.history.at(-1).lever.id, 'reseed@v39');
  assert.equal(s.history.at(-1).lever.set.seed, 39);
});

test('combos never merge two levers that set the same key', () => {
  const a = { id: 'lr-a', set: { learning_rate: 1e-4 } };
  const b = { id: 'lr-b', set: { learning_rate: 2e-5 } };
  const state = { best: { version: 5, lineage: [], cfg: V5_CFG }, history: [
    { version: 6, lever: a, status: 'done', scores: { total: 30 }, bestTotalAtRun: 20, valLoss: 1 },
    { version: 7, lever: b, status: 'done', scores: { total: 29 }, bestTotalAtRun: 20, valLoss: 1 },
  ] };
  assert.ok(!generateHypotheses(state, 9).some((h) => h.id.startsWith('combo(')));
});

// ---------- reporting ----------

test('log line carries version, lever, val loss, three scores, promotion, and why a run is short', () => {
  const line = formatLogLine({ version: 6, lever: { id: 'finish-x3' }, valLoss: 0.8312, bestIter: 200, status: 'done',
    scores: { trajectory: 18, gameLogic: 1, finish: 5, total: 24, n: { trajectory: 23, gameLogic: 8, finish: 7 } }, promoted: true });
  assert.match(line, /^\| v6 \| finish-x3 \| 0\.831 @200 \| 18\/23 \| 1\/8 \| 5\/7 \| 24 \| yes \| done \|$/);
  const t = formatLogLine({ version: 7, lever: { id: 'mask-prompt' }, status: 'truncated', trainNote: 'stopped at 30/400' });
  assert.match(t, /\| no \| truncated \(stopped at 30\/400\) \|$/);
  const n = formatLogLine({ version: 8, lever: { id: 'x' }, status: 'done', scores: { trajectory: 1, gameLogic: 0, finish: 0, total: 1, n: {} }, promoted: false, promoteWhy: '1 < bar 22' });
  assert.match(n, /\| no \| done; 1 < bar 22 \|$/);
});

test('model card shows the current best and completed unpromoted runs, excluding invalid measurements', () => {
  const n = { trajectory: 23, gameLogic: 8, finish: 7 };
  const score = (trajectory, gameLogic, finish) => ({ trajectory, gameLogic, finish, total: trajectory + gameLogic + finish, n });
  const state = {
    best: { version: 22, scores: score(18, 1, 5), valLoss: 0.807 },
    history: [
      { version: 22, status: 'done', lever: { id: 'logic' }, promoted: true, scores: score(18, 1, 5) },
      { version: 23, status: 'done', lever: { id: 'ui' }, promoted: false, scores: score(10, 0, 4) },
      { version: 24, status: 'eval_invalid', lever: { id: 'bad-eval' }, promoted: false, scores: score(23, 8, 7) },
    ],
  };
  const card = renderModelCard(state, 'unsloth/Llama-3.2-3B-Instruct');
  assert.match(card, /Current best: v22/);
  assert.match(card, /\| v23 \| ui \|/);
  assert.doesNotMatch(card, /\| v24 \| bad-eval \|/, 'a broken evaluation is not a completed experiment');
});

// ---------- runtime guards ----------

test('the next version skips every vN already on disk', () => {
  assert.equal(versionsIn(['lora-apple-v5.yaml', 'lora-apple-v7.yaml', 'apple-v9-best', 'apple-v3-llama', 'eval-v11-on-v5set.json', 'eval-v5i150-on-v5set.json', 'README.md']), 11);
  assert.equal(versionsIn([]), 0);
});

test('lock: empty, dead and reused-pid locks are stale; a live train-forever holder refuses', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'forever-lock-'));
  const lock = join(dir, 'lock');
  writeFileSync(lock, '');
  assert.equal(tryLock(lock), true, 'empty lock (pid 0) is stale');
  assert.equal(readFileSync(lock, 'utf8'), String(process.pid));
  writeFileSync(lock, '999999');
  assert.equal(tryLock(lock), true, 'dead pid');
  writeFileSync(lock, '1');
  assert.equal(tryLock(lock), true, 'live pid that is not a train-forever (pid reused after a reboot)');
  const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)', 'src/train-forever.mjs'], { stdio: 'ignore' });
  try {
    writeFileSync(lock, String(holder.pid));
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(tryLock(lock), false);
    assert.equal(readFileSync(lock, 'utf8'), String(holder.pid), 'the live holder keeps its lock');
  } finally {
    holder.kill('SIGKILL');
  }
});

test('run() kills a child that outlives its timeout and reports it', async () => {
  const log = join(mkdtempSync(join(tmpdir(), 'forever-run-')), 'log');
  const t0 = Date.now();
  const r = await run('sleep', ['30'], { log, timeoutMs: 300 });
  assert.equal(r.timedOut, true);
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
  assert.match(readFileSync(log, 'utf8'), /timeout after/);
});
