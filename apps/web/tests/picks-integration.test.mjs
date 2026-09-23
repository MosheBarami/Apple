// 2026-09-23: two pick mounts that lived outside their lanes' files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WS = readFileSync(new URL('../src/routes/workspace.tsx', import.meta.url), 'utf8');
const LAYOUT = readFileSync(new URL('../src/components/layout.tsx', import.meta.url), 'utf8');

test('the plan card can be built: the latest plan, while idle, sent in Agent mode through send()', () => {
  assert.match(WS, /onBuildPlan=\{item\.id === lastAssistantId && item\.mode === 'plan' && !running/);
  assert.match(WS, /\? \(\) => \{ setMode\('agent'\); setBuildQueued\(true\); \}/);
  assert.match(WS, /if \(!buildQueued \|\| mode !== 'agent'\) return;\s*setBuildQueued\(false\);\s*send\('Build this plan\.'\);/, 'the build is sent only once Agent is the mode in state');
});

test('the account menu opens on the picked user-button header', () => {
  assert.match(LAYOUT, /import \{ AccountMenuHeader \} from '\.\/picks\/settings\/user-button'/);
  assert.match(LAYOUT, /label="Account">\s*<AccountMenuHeader name=\{name\} email=\{email\} \/>/);
});

test('the composer credits ring never shows 0 while extra credits remain', () => {
  const src = readFileSync(new URL('../src/components/picks/composer/credits-ring.tsx', import.meta.url), 'utf8');
  assert.match(src, /view\.allowanceRemaining === 0 && view\.credits > 0[\s\S]{0,300}COMPACT\.format\(view\.credits\)/);
});

test('a click on the composer box outside the text still focuses the text', () => {
  const src = readFileSync(new URL('../src/components/ws/composer.tsx', import.meta.url), 'utf8');
  assert.match(src, /const el = panel\.current;[\s\S]{0,300}closest\('button, a, input, textarea[\s\S]{0,200}box\.current\?\.focus\(\)[\s\S]{0,120}addEventListener\('mousedown'/);
});
