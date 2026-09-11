/**
 * EVERY REGISTERED TOOL MUST CHOOSE ITS OWN PHASE.
 *
 * `phaseForTool` in packages/shared decides the stage the workspace announces while a
 * tool runs — session.ts:1061 sets `agent.phase` from it and broadcasts immediately,
 * under a comment promising "the UI never claims a stage the agent has not entered".
 *
 * That promise is only kept if every tool is named. A tool that is not falls through
 * to `default: 'building'` and silently claims to be building the world. It is a
 * failure with no symptom: nothing throws, the UI just says the wrong thing, and it
 * is wrong for exactly as long as nobody looks. `generate_image` had been in that
 * state — and the default it landed on was the phase it wanted anyway, which is why
 * it survived: a right answer nobody had chosen, one rename away from being wrong.
 *
 * These guards read the TOOLS registry out of the source rather than importing it,
 * because tools.ts pulls in the worker runtime. The parse is pinned by the count
 * assertion below: if it silently matched nothing, the test fails instead of passing
 * vacuously.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');

/** The keys of `export const TOOLS`, read by brace-matching its object literal. */
function registeredTools() {
  const src = readFileSync(join(ROOT, 'apps/worker/src/tools.ts'), 'utf8');
  const start = src.indexOf('{', src.indexOf('export const TOOLS'));
  let depth = 0;
  let end = start;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  // Top-level entries only: exactly two spaces of indentation.
  return [...src.slice(start, end).matchAll(/^ {2}([a-z_][a-z0-9_]*):\s*\{/gm)].map((m) => m[1]);
}

/** The tool names `phaseForTool` names explicitly, before its `default`. */
function declaredTools() {
  const src = readFileSync(join(ROOT, 'packages/shared/src/index.ts'), 'utf8');
  const fn = src.slice(src.indexOf('export function phaseForTool'));
  const body = fn.slice(0, fn.indexOf('default:'));
  return new Set([...body.matchAll(/case '([a-z_]+)'/g)].map((m) => m[1]));
}

test('the registry parse actually found the tools', () => {
  // Without this, both guards below would pass on an empty set.
  const tools = registeredTools();
  assert.ok(tools.length >= 20, `parsed ${tools.length} tools, expected the full registry`);
  assert.ok(tools.includes('create_instances'), 'a known tool must be among them');
  assert.ok(declaredTools().size >= 20, 'and phaseForTool must have been parsed too');
});

test('no registered tool relies on the phase default', () => {
  const declared = declaredTools();
  const undeclared = registeredTools().filter((t) => !declared.has(t));
  assert.deepEqual(
    undeclared,
    [],
    `these tools fall through to default: 'building' and will announce the wrong stage: ${undeclared.join(', ')}`,
  );
});

test('phaseForTool names no tool that no longer exists', () => {
  // The other direction: a case left behind after a rename is dead code that reads
  // like coverage, and hides the fact that the renamed tool now has none.
  const tools = new Set(registeredTools());
  const stale = [...declaredTools()].filter((t) => !tools.has(t));
  assert.deepEqual(stale, [], `phaseForTool names tools that are not registered: ${stale.join(', ')}`);
});
