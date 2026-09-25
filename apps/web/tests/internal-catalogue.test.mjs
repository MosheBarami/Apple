import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(web, 'src', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('the internal UI catalogue has no customer route or navigation', () => {
  const app = read('app.tsx');
  const layout = read('components/layout.tsx');
  assert.doesNotMatch(app, /path="\/library"|\.\/routes\/library/);
  assert.doesNotMatch(layout, /nav-library|to="\/library"|navigate\('\/library'\)/);
});

test('customers are not shown a Creator Store versus scratch choice', () => {
  const workspace = read('routes/workspace.tsx');
  const settings = read('routes/settings.tsx');
  assert.doesNotMatch(workspace, /AssetSourceDialog|askFirst\(|ws-asset-sources/);
  assert.doesNotMatch(settings, /AssetSourceSettings|id: 'assets', label: 'Assets'/);
});
