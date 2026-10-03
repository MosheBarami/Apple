/**
 * CREDITS: the deferred tools are unlocked by need.
 *
 * more_tools used to add all of the deferred tool definitions to every later step of a run. A map that needs
 * edit_terrain paid for sound synthesis, web research and the workspace store as well. The groups below let a run
 * ask for what it needs; asking for nothing still unlocks everything, so no capability is cut.
 *
 * Run with:  node --test tests/more-tools-by-need.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'more-tools-'));
const OUT = join(TMP, 'tools.mjs');
await esbuild.build({ entryPoints: [join(WORKER, 'src', 'tools.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: OUT, logLevel: 'silent' });
const W = await import(pathToFileURL(OUT).href);
test.after(() => rmSync(TMP, { recursive: true, force: true }));

const chars = (names) => JSON.stringify(W.toolDefs(true, new Set(names))).length;

test('every deferred tool is a real tool and sits in exactly one group', () => {
  const registry = new Set(W.toolNames());
  const seen = new Map();
  for (const [group, tools] of Object.entries(W.DEFERRED_GROUPS)) {
    for (const t of tools) {
      assert.ok(registry.has(t), `${group} names ${t}, which is not a tool`);
      assert.equal(seen.get(t), undefined, `${t} is in both ${seen.get(t)} and ${group}`);
      seen.set(t, group);
    }
  }
  assert.ok(seen.size > 20, 'the groups are nearly empty: this test would check nothing');
  assert.deepEqual([...W.DEFERRED_TOOLS].sort(), [...seen.keys()].sort());
});

test('resolveDeferred answers a tool name, a group name, or neither', () => {
  assert.deepEqual(W.resolveDeferred(['edit_terrain']), { tools: ['edit_terrain'], unknown: [] });
  assert.deepEqual(W.resolveDeferred(['Terrain']).tools, [...W.DEFERRED_GROUPS.terrain]);
  assert.deepEqual(W.resolveDeferred(['no_such_tool']), { tools: [], unknown: ['no_such_tool'] });
  assert.deepEqual(W.resolveDeferred(['edit_terrain', 'edit_terrain']).tools, ['edit_terrain'], 'a repeat adds nothing');
  // A tool that is not deferred is already offered: naming it unlocks nothing new.
  assert.deepEqual(W.resolveDeferred(['create_instances']).tools, []);
  assert.equal(W.offeredWhenFocused('edit_terrain'), false);
  assert.equal(W.offeredWhenFocused('edit_terrain', ['edit_terrain']), true);
  assert.equal(W.offeredWhenFocused('generate_sound', ['edit_terrain']), false);
  assert.equal(W.offeredWhenFocused('create_instances'), true);
});

test('the terrain group costs a fraction of the full lift (measured serialized definition chars)', () => {
  const all = chars([...W.DEFERRED_TOOLS]);
  const terrain = chars(W.DEFERRED_GROUPS.terrain);
  const one = chars(['edit_terrain']);
  console.log(`full lift ${all} chars; terrain group ${terrain} chars (${Math.round((terrain / all) * 100)}%); edit_terrain alone ${one} chars`);
  assert.ok(all > 20_000, `the full lift is only ${all} chars: the measurement is not what the plan assumed`);
  assert.ok(terrain < all / 3, `the terrain group is ${terrain} of ${all} chars`);
  assert.ok(one < terrain);
});
