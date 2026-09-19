import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const code = p => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
test('each paid plan is gated by the server purchasable list, not just global checkout', () => {
  const plans = code('../src/components/plans.tsx');
  assert.match(plans, /purchasable\.includes\(id\)/);
  assert.match(plans, /availability === 'ready' && onChoose && canChoose/);
  assert.match(code('../src/routes/usage.tsx'), /purchasable=\{billing\.data\?\.purchasable/);
});
test('a missing paid price cannot fall through into cancellation or portal navigation', () => {
  assert.match(code('../src/routes/usage.tsx'), /else if \(plan === 'free'\) portal\.mutate\(\)/);
});
