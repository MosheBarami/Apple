// A stale edit_script anchor is answered with WHAT IS THERE, so the next step can fix it.
//
// Gauntlet round 4 (2026-09-23, run 151469c3): edit_script failed "edit 1: text to find not present"
// and the model retried the same stale anchor, a paid step each time, because the refusal said only
// "read the script again". The properties pinned here:
//   - a miss carries the closest current lines of the script, numbered, so the anchor can be copied;
//   - an anchor that differs from the script only in whitespace (indentation, tabs, CRLF, trailing
//     spaces) is applied, and what Studio receives is an anchor literally present in its script;
//   - a whitespace-tolerant match that is not unique is refused, never guessed;
//   - an `all` edit whose text is absent is a miss, not "changed nothing".
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { applyEdits, sourceHash } from '../src/luau-review.ts';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'edit-anchor-'));
const bundle = join(TMP, 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + bundle],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${bundle}`);
test.after(() => rmSync(TMP, { recursive: true, force: true }));

const PATH = 'game.ServerScriptService.GameServer';

/** Studio as the plugin behaves: exact literal find, first occurrence, base hash checked. */
function studio(source) {
  const files = { [PATH]: source };
  const writes = [];
  const ctx = {
    env: {},
    studioConnected: () => true,
    addMemoryFact: async () => {},
    execStudioOp: async (o) => {
      if (o.op === 'read_script') return { ok: true, data: { path: o.path, source: files[o.path], baseHash: sourceHash(files[o.path]) } };
      if (o.op === 'edit_script') {
        writes.push(o);
        if (o.baseHash !== undefined && sourceHash(files[o.path]) !== o.baseHash) return { ok: false, error: 'changed since read' };
        let text = files[o.path];
        for (const [i, e] of (o.edits ?? []).entries()) {
          const at = text.indexOf(e.find);
          if (at < 0) return { ok: false, error: `edit ${i + 1}: text to find not present in ${o.path}` };
          text = text.slice(0, at) + e.replace + text.slice(at + e.find.length);
        }
        files[o.path] = o.source ?? text;
        return { ok: true, data: { path: o.path, mode: 'edits' } };
      }
      return { ok: true, data: {} };
    },
  };
  return { ctx, files, writes };
}

const SERVER = [
  '--!strict',
  'local Players = game:GetService("Players")',
  '',
  'local function onOrb(player: Player, orb: BasePart)',
  '\tlocal gain = 5 * Multiplier.get(player)',
  '\tCurrency.add(player, gain)',
  '\torb:Destroy()',
  'end',
  '',
  'Players.PlayerAdded:Connect(function(player)',
  '\tprint("joined", player.Name)',
  'end)',
  '',
].join('\n');

test('a stale anchor is refused with the closest current lines, numbered, and nothing written', async () => {
  const s = studio(SERVER);
  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: PATH,
    edits: [{ find: 'local gain = 10 * Multiplier.get(player)\n\tCurrency.add(player, gain)', replace: 'local gain = 20' }],
  });
  assert.match(String(res.error), /not present/);
  assert.equal(s.writes.length, 0);
  assert.equal(typeof res.closest, 'string', 'the refusal must carry the text that is actually there');
  assert.ok(res.closest.includes('local gain = 5 * Multiplier.get(player)'), res.closest);
  assert.match(res.closest, /\b5\b.*local gain/, 'lines are numbered so the anchor can be located');
});

test('an anchor that differs only in whitespace is applied, and Studio gets an anchor it holds', async () => {
  const s = studio(SERVER);
  // Spaces where the script has a tab, and a trailing space: the commonest stale-anchor shape.
  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: PATH,
    edits: [{ find: '    local gain = 5 * Multiplier.get(player) \n    Currency.add(player, gain)', replace: '\tlocal gain = 7 * Multiplier.get(player)\n\tCurrency.add(player, gain)' }],
  });
  assert.equal(res.error, undefined, String(res.error));
  assert.equal(s.writes.length, 1);
  for (const e of s.writes[0].edits) assert.ok(SERVER.includes(e.find), 'the anchor sent to Studio must be literally present');
  assert.ok(s.files[PATH].includes('\tlocal gain = 7 * Multiplier.get(player)\n\tCurrency.add(player, gain)'));
  assert.ok(!s.files[PATH].includes('5 * Multiplier'));
});

test('a whitespace-tolerant match that is not unique is refused, never guessed', () => {
  const src = 'if a then\n\tprint(1)\nend\nif b then\n\t\tprint(1)\nend\n';
  const r = applyEdits(src, [{ find: '    print(1)', replace: 'print(2)' }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /not present|more than once/);
});

test('an exact anchor behaves exactly as before', () => {
  const r = applyEdits('x\nx\nx\n', [{ find: 'x', replace: 'y' }]);
  assert.equal(r.ok, true);
  assert.equal(r.source, 'y\nx\nx\n');
});

test('an `all` edit whose text is absent is a miss with the closest lines, not "changed nothing"', () => {
  const r = applyEdits(SERVER, [{ find: 'Currency.add(player, 10)', replace: 'x', all: true }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /not present/);
  assert.ok(String(r.closest).includes('Currency.add(player, gain)'));
});
