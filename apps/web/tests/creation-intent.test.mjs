import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'apple-intent-')), 'intent.mjs');
execFileSync(join(web, '../worker/node_modules/.bin/esbuild'), [join(web, 'src/lib/creation-intent.ts'), '--bundle', '--format=esm', `--outfile=${out}`], { stdio: 'pipe' });
const { creationMessage, CREATION_INTENTS, maxUpgradeAvailable, maxAccessNotice } = await import(out);

function assertUpgradeAvailability(check) {
  assert.equal(check(undefined), null, 'unobserved availability is unknown');
  assert.equal(check({ checkout: false, purchasable: ['builder'] }), false, 'no checkout means no upgrade');
  assert.equal(check({ checkout: true, purchasable: [] }), false, 'no paid prices means no upgrade');
  assert.equal(check({ checkout: true, purchasable: ['free'] }), false);
  assert.equal(check({ checkout: true, purchasable: ['builder'] }), true);
  assert.equal(check({ checkout: true, purchasable: ['studio'] }), true);
}
test('media upgrade follows observed checkout and paid-price availability', () => {
  assertUpgradeAvailability(maxUpgradeAvailable);
  assert.throws(() => assertUpgradeAvailability(() => true), /unobserved availability/);
  assert.throws(() => assertUpgradeAvailability((config) => config ? config.purchasable.includes('builder') : null), /no checkout/);
  assert.match(maxAccessNotice(false), /not available yet/);
  assert.match(maxAccessNotice(null), /could not be confirmed/);
});

test('composer gates upgrade navigation and keeps draft in unavailable states', () => {
  const composer = readFileSync(join(web, 'src/components/ws/composer.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const gate = composer.slice(composer.indexOf('const requestMaxAccess ='), composer.indexOf('const submit ='));
  assert.match(gate, /if \(maxUpgradeAvailable === true\) onUpgrade\?\./);
  assert.match(gate, /maxAccessNotice\(maxUpgradeAvailable\)/);
  assert.doesNotMatch(gate, /clearDraft|setText/);
});

test('ordinary chat reaches the existing run without added instructions', () => {
  assert.equal(creationMessage('build', '  Fix my shop  ', 100), 'Fix my shop');
});
test('image intent requests the actual tool, not place mutation or uploading', () => {
  const message = creationMessage('image', 'A moon-shaped coin', 1000);
  assert.ok(message.includes('generate_image'));
  assert.ok(message.endsWith('A moon-shaped coin'));
  assert.ok(message.includes('Do not edit my place or upload assets'));
});
test('3D intent asks for generation plus inspection and reports unavailability', () => {
  const message = creationMessage('model', 'Twisted tree', 1000);
  assert.ok(message.includes('generate_model'));
  assert.ok(message.includes('inspect its quality'));
  assert.ok(message.includes('do not silently substitute'));
  assert.match(CREATION_INTENTS.model.note, /session-only/);
});
test('whitespace never spends a run', () => {
  for (const intent of Object.keys(CREATION_INTENTS)) assert.equal(creationMessage(intent, ' \n ', 1000), null);
});
test('limits include instructions, without silently truncating the description', () => {
  const description = 'abc';
  const message = creationMessage('image', description, 1000);
  assert.equal(creationMessage('image', description, message.length), message);
  assert.equal(creationMessage('image', description, message.length - 1), null);
  assert.equal(creationMessage('build', 'abcd', 3), null);
});

test('3D cannot be selected or submitted without a verified Studio connection', () => {
  const composer = readFileSync(join(web, 'src/components/ws/composer.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(composer, /studioConnected\s*=\s*false/);
  assert.match(composer, /aria-pressed=\{creation === 'model'\}[^>]*disabled=\{running \|\| !studioConnected\}/);
  const submit = composer.slice(composer.indexOf('const submit ='), composer.indexOf('files.current.clear();'));
  assert.ok(submit.indexOf('creationUnavailable') >= 0);
  assert.ok(submit.indexOf('creationUnavailable') < submit.indexOf('onSend(message'));
  const workspace = readFileSync(join(web, 'src/routes/workspace.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(workspace, /<Composer\b[^]*?studioConnected=\{studio\.connected\}/);
});
