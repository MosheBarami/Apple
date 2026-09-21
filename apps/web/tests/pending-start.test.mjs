/**
 * The landing's form has carried `?start=` to /app/signup for a while and nothing read it.
 *
 * These pin the three properties that make carrying it safe rather than merely possible: it cannot
 * outlive the tab, it cannot seed a second project, and it cannot break a page by being absent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'apple-start-')), 'ps.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'pending-start.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WEB, stdio: 'pipe' });

/** A sessionStorage that behaves, and one that throws the way a private window does. */
function withStorage(impl) {
  const prev = globalThis.sessionStorage;
  Object.defineProperty(globalThis, 'sessionStorage', { value: impl, configurable: true });
  return () => Object.defineProperty(globalThis, 'sessionStorage', { value: prev, configurable: true });
}
const working = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const hostile = () => ({
  getItem() { throw new Error('The operation is insecure.'); },
  setItem() { throw new Error('The operation is insecure.'); },
  removeItem() { throw new Error('The operation is insecure.'); },
});

const { capturePendingStart, takePendingStart, clearPendingStart, normaliseStart, MAX_START } = await import(out);

test('a sentence survives sign-up and seeds exactly one project', async () => {
  const restore = withStorage(working());
  try {
    assert.equal(capturePendingStart('?start=a+lobby+with+a+round+timer'), 'a lobby with a round timer');
    assert.equal(takePendingStart(), 'a lobby with a round timer');
    // THE MOVE IS THE POINT. A second project created in the same tab must start empty, or a
    // sentence typed once silently reappears in work it has nothing to do with.
    assert.equal(takePendingStart(), null, 'the sentence survived being taken and would seed a second project');
  } finally { restore(); }
});

test('it is capped where the landing caps it, and blank is nothing', () => {
  assert.equal(normaliseStart('   '), null);
  assert.equal(normaliseStart(null), null);
  assert.equal(normaliseStart('  hello  '), 'hello');
  assert.equal(normaliseStart('x'.repeat(MAX_START + 50)).length, MAX_START,
    `a sentence longer than the landing's maxlength=${MAX_START} was stored whole`);
});

test('a page with no sentence, and a page that cannot use storage at all, both just carry on', () => {
  const restore = withStorage(working());
  try {
    assert.equal(capturePendingStart(''), null);
    assert.equal(capturePendingStart('?other=1'), null);
    assert.equal(takePendingStart(), null);
  } finally { restore(); }

  //[[ THE ONE THAT MATTERS FOR A REAL VISITOR. sessionStorage THROWS in a private window and with
  //   site data blocked. A prefill is a courtesy; it may never be the reason a sign-up page fails
  //   to render. Every one of these must return rather than throw. ]]
  const restoreHostile = withStorage(hostile());
  try {
    assert.doesNotThrow(() => capturePendingStart('?start=hello'));
    assert.equal(capturePendingStart('?start=hello'), 'hello', 'it should still report what it read, even unstored');
    assert.doesNotThrow(() => takePendingStart());
    assert.equal(takePendingStart(), null);
    assert.doesNotThrow(() => clearPendingStart());
  } finally { restoreHostile(); }
});

test('an unparseable search string carries no sentence and does not throw', () => {
  const restore = withStorage(working());
  try {
    assert.equal(capturePendingStart(undefined), null);
  } finally { restore(); }
});
