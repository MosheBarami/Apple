/**
 * THE STUDIO DIALOG NAMES WHAT HAPPENED, AND SAYS WHAT A RESTART DOES.
 *
 * F-027 (measured 2026-09-23 on production): the dialog's recent-operation rows showed bare ✓
 * marks with no words. The label was `op.summary ?? op.kind ?? 'an operation'`, and `??` only
 * falls through on null — an EMPTY summary is a string, so it was printed, as nothing.
 *
 * F-026: a Studio restart ends the pairing by design (the plugin never stores its token), and
 * nothing told the customer. They saw "Studio disconnected" and a dialog offering to "Pair a
 * different Studio" — when it is the same Studio and it simply needs a new code.
 *
 * The ConnectStudio block that once carried the connection copy had no importer left (the minimal
 * redesign replaced it with the workspace pill + this dialog), so copy put there would reach nobody.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { recentOpLabel } from '../src/lib/studio-connection.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const DIALOG = strip(readFileSync(join(WEB, 'src', 'components', 'pairing-dialog.tsx'), 'utf8'));
/** JSX text of the dialog with tags removed and whitespace collapsed — what a reader sees. */
const WORDS = DIALOG.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const row = (summary, kind) => ({ op_id: 'o1', ok: 1, created_at: 0, summary, kind });

test('an empty or blank summary is treated as missing, never printed as nothing', () => {
  for (const blank of ['', '   ', '\n\t']) {
    const label = recentOpLabel(row(blank, 'insert_part'));
    assert.ok(label.trim().length > 0, `summary ${JSON.stringify(blank)} produced a blank label`);
    assert.notEqual(label, blank);
  }
  for (const [s, k] of [['', ''], [null, '  '], ['  ', null], [null, null]]) {
    assert.ok(recentOpLabel(row(s, k)).trim().length > 0, `summary ${JSON.stringify(s)} / kind ${JSON.stringify(k)} is blank`);
  }
});

test('a real summary is shown as written, trimmed', () => {
  assert.equal(recentOpLabel(row('  Built the lobby  ', 'batch')), 'Built the lobby');
});

test('the dialog row uses that label rather than chaining the raw fields', () => {
  const span = /className="pairing-record__op">([^<]*)</.exec(DIALOG);
  assert.ok(span, 'the op row label was not found — this test would check nothing');
  assert.match(span[1], /recentOpLabel\(/);
  assert.doesNotMatch(span[1], /\?\?/, 'a `??` chain over the raw fields lets an empty string through');
});

test('the dialog says a restart of Studio needs a new code — where a code is shown', () => {
  assert.match(WORDS, /restart[^.]*Studio[^.]*new code|close or restart Studio[^.]*new code/i);
});

test('and where a paired Studio has gone quiet, which is what a restart looks like from here', () => {
  // The branch is `state === 'idle' && paired`; its copy must mention the restart and a new code.
  const at = DIALOG.indexOf("state === 'idle' && paired && (\n              <div className=\"pairing-code-box\">");
  assert.ok(at > 0, 'the paired-and-idle box was not found');
  const box = DIALOG.slice(at, DIALOG.indexOf('</div>', at)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  assert.match(box, /restart/i);
  assert.match(box, /new code/i);
});

test('the copy is short enough for a young reader', () => {
  const paragraphs = [...DIALOG.matchAll(/<p className="pairing-how">([\s\S]*?)<\/p>/g)]
    .map((m) => m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((t) => /restart/i.test(t));
  assert.ok(paragraphs.length >= 2, 'both restart sentences must exist');
  for (const t of paragraphs) assert.ok(t.split(' ').length <= 16, `too long: ${t}`);
});

test('the dead ConnectStudio block is gone and nothing imports it', () => {
  assert.equal(existsSync(join(WEB, 'src', 'components', 'ws', 'connect-studio.tsx')), false);
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  const files = walk(join(WEB, 'src')).filter((f) => /\.(tsx?|css)$/.test(f));
  assert.ok(files.length > 100, 'the walk found nothing');
  for (const f of files) {
    const code = strip(readFileSync(f, 'utf8'));
    assert.doesNotMatch(code, /from ['"][./]*(ws\/)?connect-studio['"]/, `${f} imports the deleted block`);
    assert.doesNotMatch(code, /\.gx-connect\b/, `${f} keeps styles for the deleted block`);
  }
});
