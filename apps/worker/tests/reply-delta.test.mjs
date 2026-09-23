/**
 * F-045, 2026-09-23: finishRun's reconciliation delta re-sent the whole reply whenever the stream
 * held more than the last step's text, so multi-step replies read twice live. The property: the
 * stream plus the delta never shows a body twice, and never splices mid-word.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OUT = join(mkdtempSync(join(tmpdir(), 'reply-delta-')), 'd.mjs');
await esbuild.build({ entryPoints: [join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'reply-delta.ts')], bundle: true, format: 'esm', outfile: OUT, logLevel: 'silent' });
const { replyDelta } = await import(pathToFileURL(OUT).href);

test('the stream already ends with the reply: nothing more is sent', () => {
  assert.equal(replyDelta('Adding a coin.Fixed. It spins.', 'Fixed. It spins.'), '');
  assert.equal(replyDelta('Fixed.', 'Fixed.'), '');
});

test('the stream ends with the reply\'s leading paragraphs: only the rest is sent', () => {
  assert.equal(replyDelta('Looking.Fixed.', 'Fixed.\n\nYou have not been charged.'), '\n\nYou have not been charged.');
  assert.equal(replyDelta('Fixed.', 'Fixed.\n\nYou have not been charged.'), '\n\nYou have not been charged.');
});

test('a closing written in place of the model\'s text is sent once, as its own paragraph', () => {
  assert.equal(replyDelta('Everything works.', 'I did not change anything.'), '\n\nI did not change anything.');
  assert.equal(replyDelta('', 'Stopped.'), 'Stopped.');
});

test('a shared letter is not a shared paragraph: nothing is spliced mid-word', () => {
  // The stream ends "…I" and the reply begins "I did …" — the old slice arithmetic had no such guard.
  assert.equal(replyDelta('Let me check what I', 'I did not change anything.'), '\n\nI did not change anything.');
});
