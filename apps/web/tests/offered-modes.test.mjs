/**
 * ProductMode has one public vocabulary: Plan and Agent.
 *
 * Autonomous changes how an Agent run proceeds; it is not another mode. Non-workspace web must use
 * ProductMode directly rather than translating through a second internal vocabulary at its edges.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_MODES, PRODUCT_MODE_INFO } from '@golem/shared';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(WEB, 'src', p), 'utf8');

test('the complete ProductMode vocabulary is exactly Plan and Agent', () => {
  assert.deepEqual([...PRODUCT_MODES], ['plan', 'agent']);
  assert.deepEqual(PRODUCT_MODES.map((mode) => PRODUCT_MODE_INFO[mode].name), ['Plan', 'Agent']);
  assert.equal(PRODUCT_MODES.includes('autonomous'), false, 'Autonomous is an Agent option, not a mode');
});

test('non-workspace mode selectors derive directly from PRODUCT_MODES', () => {
  const usage = read('routes/usage.tsx');
  const automations = read('lib/automations.ts');
  assert.match(usage, /PRODUCT_MODES\.map/);
  assert.match(automations, /PRODUCT_MODES\.map/);
});

test('non-workspace mode flows consume the direct ProductMode contract', () => {
  for (const file of [
    'routes/usage.tsx',
    'lib/automations.ts',
    'components/usage-meter-model.ts',
    'components/roadmap/model.ts',
    'components/roadmap/brief-dialog.tsx',
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /mode:\s*['"]autonomous['"]/, `${file} treats Autonomous as a build mode`);
  }
});
