// 2026-09-23: two pick mounts that lived outside their lanes' files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WS = readFileSync(new URL('../src/routes/workspace.tsx', import.meta.url), 'utf8');
const LAYOUT = readFileSync(new URL('../src/components/layout.tsx', import.meta.url), 'utf8');

test('there is no Plan card to build: no mode switch-over, no "Build this plan" (V3 G01)', () => {
  assert.doesNotMatch(WS, /onBuildPlan|setMode|buildQueued|Build this plan/);
});

//[[ RESTATED 2026-10-05 (M2 step 2.3, C6). The header is handed the avatar's letter too (`initial`, from lib/account-identity.ts), so an account with no
//   address is not drawn as "?". The property is unchanged: the account menu opens on the picked header, with the account's name and address. ]]
test('the account menu opens on the picked user-button header', () => {
  assert.match(LAYOUT, /import \{ AccountMenuHeader \} from '\.\/picks\/settings\/user-button'/);
  assert.match(LAYOUT, /label="Account">\s*<AccountMenuHeader name=\{name\} email=\{email\} initial=\{initial\} \/>/);
});

test('the composer credits ring never shows 0 while extra credits remain', () => {
  const src = readFileSync(new URL('../src/components/picks/composer/credits-ring.tsx', import.meta.url), 'utf8');
  // The spendable balance is the extra credits, shown as the model's own credits text (two decimals).
  assert.match(src, /view\.allowanceRemaining === 0 && view\.credits > 0[\s\S]{0,300}\{view\.creditsText\}/);
});

test('a click on the composer box outside the text still focuses the text', () => {
  const src = readFileSync(new URL('../src/components/ws/composer.tsx', import.meta.url), 'utf8');
  assert.match(src, /const el = panel\.current;[\s\S]{0,300}closest\('button, a, input, textarea[\s\S]{0,200}box\.current\?\.focus\(\)[\s\S]{0,120}addEventListener\('mousedown'/);
});
