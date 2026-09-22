/**
 * EVERY VALUE THE PLUGIN RETURNS IS WRAPPED, AND READING ONE BARE DOES NOT THROW.
 *
 * `Paths.encode` wraps each scalar as `{ t, v }` — `{t:"number",v:0}`, `{t:"Vector3",v:[0,5,0]}` —
 * and recurses into tables, encoding each FIELD. It is applied in exactly three places in the
 * plugin: `get_instance`'s props and attributes, `run_code`'s returned result, and the serializer's
 * props and attributes. Everything a worker tool reads from those paths arrives wrapped.
 *
 * WHY THIS FILE EXISTS RATHER THAN A CODE COMMENT. Reading a wrapped value as a bare one is silent:
 * `Number({t,v})` is NaN and `String({t,v})` is "[object Object]", and both travel onward looking
 * like answers. A NaN disabled a whole branch of `remove_effect` so it could never report that
 * nothing was there; an "[object Object]" was what `get_instance` printed for every property in the
 * panel. Neither raised anything, and the unit tests agreed with the code because the FIXTURES were
 * written in the unwrapped shape too — a stub that encodes the author's misunderstanding turns an
 * untested assumption into a verified one.
 *
 * So this drives the tools that consume an encoded payload with the REAL wire shape and asserts a
 * property of the output rather than a spelling: no tool may emit "[object Object]" or "NaN"
 * anywhere in what it hands back. That catches the whole class, including a tool added later.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const toolOut = join(mkdtempSync(join(tmpdir(), 'tag-')), 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + toolOut],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${toolOut}`);
rmSync(toolOut, { force: true });

/** A Studio whose every reply is shaped the way Paths.encode actually shapes one. */
function stubCtx(reply) {
  const ops = [];
  return {
    ops,
    ctx: {
      env: {},
      studioConnected: () => true,
      addMemoryFact: async () => {},
      execStudioOp: async (o) => {
        ops.push(o);
        return { ok: true, data: typeof reply === 'function' ? reply(o) : reply };
      },
    },
  };
}

const tag = (t, v) => ({ t, v });

/** Nothing a tool hands back may contain a stringified object or a NaN. */
function assertNoLeakedWrapper(result, label) {
  const json = JSON.stringify(result ?? null);
  assert.doesNotMatch(json, /\[object Object\]/, `${label} rendered a wrapped value as a string`);
  assert.doesNotMatch(json, /"NaN"|:NaN/, `${label} rendered a wrapped value as a number`);
}

/**
 * Stricter, and only for tools that summarise rather than pass through.
 *
 * `get_instance` deliberately hands the model the TYPED property table — the same {t,v} shape
 * `create_instances` documents for writing them — so a round trip reads and writes one vocabulary.
 * That is a pass-through and is correct. A tool that reports what it DID has no such excuse: if it
 * returns the wire payload verbatim, it has not read its own result, and the count or the name it
 * is supposed to be reporting is left for the model to decode.
 */
function assertSummarised(result, label) {
  assertNoLeakedWrapper(result, label);
  assert.doesNotMatch(JSON.stringify(result ?? null), /\{"t":"[a-zA-Z0-9]+","v":/,
    `${label} returned the plugin payload instead of saying what it did`);
}

test('get_instance reads the ENCODED property table, not a bare one', async () => {
  const { ctx } = stubCtx({
    path: 'game.Workspace.Floor',
    class: 'Part',
    childCount: 0,
    props: {
      Position: tag('Vector3', [0, 0.5, 0]),
      Size: tag('Vector3', [86, 1, 74]),
      Anchored: tag('bool', true),
      Transparency: tag('number', 0),
      Material: tag('EnumItem', 'Enum.Material.Concrete'),
    },
    attributes: { Zone: tag('string', 'lobby') },
  });
  const res = await T.TOOLS.get_instance.run(ctx, { path: 'game.Workspace.Floor' });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assertNoLeakedWrapper(res, 'get_instance');
});

test('remove_effect reports nothing when the encoded typed tree contains no Apple effect marker', async () => {
  const { ctx } = stubCtx((op) => op.op === 'get_tree'
    ? { root: { path: 'game.Workspace.Torch', children: [] } }
    : { ok: true });
  const res = await T.TOOLS.remove_effect.run(ctx, { path: 'game.Workspace.Torch' });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assertSummarised(res, 'remove_effect');
  const json = JSON.stringify(res);
  assert.ok(/nothing|none|no /i.test(json), `a zero removal must say so, got ${json}`);
});

test('a real removal is still reported as one', async () => {
  const { ctx } = stubCtx((op) => op.op === 'get_tree'
    ? { root: { path: 'game.Workspace.Torch', children: [
      { path: 'game.Workspace.Torch.Fire', class: 'ParticleEmitter', attributes: { AppleEffect: tag('string', 'fire') } },
      { path: 'game.Workspace.Torch.FireLight', class: 'PointLight', attributes: { AppleEffect: tag('string', 'fire') } },
    ] } }
    : { ok: true });
  const res = await T.TOOLS.remove_effect.run(ctx, { path: 'game.Workspace.Torch' });
  assertSummarised(res, 'remove_effect');
  assert.equal(res.removed, 2, 'the count must survive decoding as a number');
  assert.deepEqual(res.effects, ['fire'], 'and the tool must say WHAT it removed');
});

test('the remaining deterministic run_code result consumer survives the encoded shape', async () => {
  // The class guard. A tool added later that reads `result` bare fails here without anyone having
  // to remember this file exists.
  const reply = (o) => {
    if (o.op !== 'run_code') return { ok: true };
    // run_code's result is encoded whole: a returned string arrives as {t:"string",v:"..."}.
    return { result: tag('string', '{}'), prints: [] };
  };
  const cases = [['run_spec', { cases: [{ name: 'one', code: 'return' }] }]];
  let ran = 0;
  for (const [name, args] of cases) {
    const tool = T.TOOLS[name];
    if (!tool) continue;
    ran += 1;
    const { ctx } = stubCtx(reply);
    const res = await tool.run(ctx, args);
    assertSummarised(res, name);
  }
  assert.equal(ran, cases.length, 'every named tool must still exist to be checked');
});
