/**
 * EVERY OP THE WIRE TYPE ALLOWS MUST HAVE A PLUGIN HANDLER.
 *
 * `StudioOp` in packages/shared is the contract between the worker and the Studio
 * plugin. An op in that union with no handler in `Ops.luau` type-checks perfectly on
 * the worker side and fails only in a user's open place, as a runtime error inside
 * Studio — the furthest possible point from where the mistake was made.
 *
 * This tier is CLEAN today, checked when the tool-label tier turned out to have four
 * copies and real drift in both directions. The guard is here because the two tiers are
 * kept in step by nothing but care, and one of them has already shown what that is
 * worth: `lib/tool-meta.ts` listed `get_instance`, `get_selection` and `move_instances`
 * as agent TOOLS. They are not tools; they are plugin OPS, from this very file. Two
 * vocabularies had been read as one.
 *
 * `Ops.execute` is the dispatcher, not an op, and is excluded by name.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The `op: '...'` literals in the StudioOp union. */
function wireOps() {
  const src = readFileSync(join(ROOT, 'packages/shared/src/index.ts'), 'utf8');
  const start = src.indexOf('export type StudioOp');
  // The union ends at the first blank line, which separates it from the next export.
  const union = src.slice(start, src.indexOf('\n\n', start));
  return new Set([...union.matchAll(/\bop:\s*'([a-z_]+)'/g)].map((m) => m[1]));
}

/** The functions hung off the `Ops` table in the plugin. */
function pluginHandlers() {
  const src = readFileSync(join(ROOT, 'apps/plugin/src/Ops.luau'), 'utf8');
  const named = [...src.matchAll(/function\s+\w+\.(\w+)\s*\(/g)].map((m) => m[1]);
  const assigned = [...src.matchAll(/^\s*\w+\.(\w+)\s*=\s*function/gm)].map((m) => m[1]);
  return new Set([...named, ...assigned].filter((n) => n !== 'execute'));
}

test('both sides parsed, so the comparison is not vacuous', () => {
  assert.ok(wireOps().size >= 20, `parsed ${wireOps().size} ops from StudioOp`);
  assert.ok(pluginHandlers().size >= 20, `parsed ${pluginHandlers().size} handlers from Ops.luau`);
  assert.ok(wireOps().has('get_tree'), 'a known op must be among them');
});

test('every op the worker may send has a handler in the plugin', () => {
  const handlers = pluginHandlers();
  const unhandled = [...wireOps()].filter((op) => !handlers.has(op)).sort();
  assert.deepEqual(
    unhandled,
    [],
    `these would reach Studio and fail at runtime in a user's place: ${unhandled.join(', ')}`,
  );
});

test('the plugin handles no op the wire type cannot express', () => {
  // The other direction is not a crash, it is dead code that reads like capability —
  // a handler nobody can reach, which is how a reader comes to believe the product
  // does something it does not.
  const wire = wireOps();
  const orphan = [...pluginHandlers()].filter((h) => !wire.has(h)).sort();
  assert.deepEqual(orphan, [], `handlers no worker can invoke: ${orphan.join(', ')}`);
});
