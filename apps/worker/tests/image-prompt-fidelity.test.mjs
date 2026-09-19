import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const worker = fileURLToPath(new URL('..', import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'apple-image-fidelity-')), 'imagegen.mjs');
execFileSync(join(worker, 'node_modules/.bin/esbuild'), [join(worker, 'src/imagegen.ts'), '--bundle', '--format=esm', '--outfile=' + out], { stdio: 'pipe' });
const { composeArtDirection } = await import(`file://${out}`);

test('explicit silver and charcoal requests are not contradicted by universal saturation rules', () => {
  const result = composeArtDirection({ subject: 'a silver crescent moon on charcoal', target: 'ui_icon' });
  assert.match(result.prompt, /silver crescent moon on charcoal/);
  assert.doesNotMatch(result.prompt, /no muted or neutral|high-key colour throughout|Do not include:[\s\S]*desaturated, muted/i);
  assert.match(result.prompt, /requested.*colou?rs.*priority/i);
});

test('default style remains a framed outlined game icon while colors are only defaults', () => {
  const { prompt } = composeArtDirection({ subject: 'a coin', target: 'ui_icon', palette: ['currency_soft'] });
  assert.match(prompt, /thick.*outline/i);
  assert.match(prompt, /yellow-gold/);
  assert.match(prompt, /when.*not.*specified|unless.*specified/i);
});

test('neutral background request is not forbidden by the negative prompt either', () => {
  const result = composeArtDirection({ subject: 'white crystal on a dark grey background', target: 'decal' });
  assert.doesNotMatch(result.prompt, /Do not include:[\s\S]*dark, moody or low-key/i);
  assert.match(result.prompt, /white crystal on a dark grey background/);
});
