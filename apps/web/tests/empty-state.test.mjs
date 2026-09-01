// The canonical empty/waiting/failed state vocabulary.
//
// These states are the product's behaviour on a user's worst days, and they were
// fourteen hand-written blocks across two CSS layers. The tests here are about the
// two things a shared component can actually get wrong: claiming a state the product
// cannot honestly observe, and colouring a state against its own meaning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const out = join(mkdtempSync(join(tmpdir(), 'empty-')), 'empty-state.mjs');
// The MODEL, which imports no React — the same split every other model here uses.
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'components', 'empty-state-model.ts'), '--bundle', '--format=esm',
   '--platform=neutral', '--outfile=' + out], { stdio: 'pipe' });
const { EMPTY_STATES, M06_NOT_MODELLED } = await import(out);

test('every state carries a canonical id from the reference board', () => {
  for (const [name, spec] of Object.entries(EMPTY_STATES)) {
    assert.match(spec.canonical, /^M\d{2}$/, `${name} has no canonical id`);
  }
});

test('no two states claim the same canonical id', () => {
  const ids = Object.values(EMPTY_STATES).map((s) => s.canonical);
  assert.equal(new Set(ids).size, ids.length, `duplicate canonical ids in ${ids.join(', ')}`);
});

test('M06 is reserved with a reason, not silently dropped', () => {
  // The browser cannot observe whether a Studio plugin is installed. Modelling it
  // would mean inventing a fact and then rendering it confidently — lib/
  // studio-connection.ts already refuses to, for the same reason. An id that is
  // simply absent reads as an oversight; this one has to explain itself.
  assert.equal(M06_NOT_MODELLED.canonical, 'M06');
  assert.match(M06_NOT_MODELLED.reason, /cannot observe/);
  const ids = Object.values(EMPTY_STATES).map((s) => s.canonical);
  assert.ok(!ids.includes('M06'), 'M06 must not be a state this product claims to detect');
});

test('the canonical vocabulary is covered except for the one reserved id', () => {
  const ids = new Set(Object.values(EMPTY_STATES).map((s) => s.canonical));
  ids.add(M06_NOT_MODELLED.canonical);
  for (let i = 1; i <= 10; i += 1) {
    const id = `M${String(i).padStart(2, '0')}`;
    assert.ok(ids.has(id), `${id} is in the reference board and has no state or reason`);
  }
});

test('tone never contradicts the meaning of its state', () => {
  // §16.3's anti-drift rule: decorative colour that fights status semantics. A
  // failure painted "proven" green is the exact defect, and it is easy to introduce
  // by copying a neighbouring entry.
  const MUST = {
    noProjects: 'creation', noConversation: 'creation',
    waitingForStudio: 'studio', studioDisconnected: 'studio', playtestUnavailable: 'studio',
    connectionFailed: 'failure', generationFailed: 'failure',
    projectComplete: 'proven', noRoadmap: 'future',
  };
  for (const [name, tone] of Object.entries(MUST)) {
    assert.equal(EMPTY_STATES[name].tone, tone, `${name} is toned ${EMPTY_STATES[name].tone}`);
  }
});

test('every tone has a stylesheet rule, so none renders unstyled', () => {
  const css = readFileSync(join(WEB, 'src', 'styles', 'workspace.css'), 'utf8');
  for (const spec of Object.values(EMPTY_STATES)) {
    assert.ok(css.includes(`.es--${spec.tone}`), `.es--${spec.tone} has no rule`);
  }
});

test('a state says what it is and what to do about it', () => {
  for (const [name, spec] of Object.entries(EMPTY_STATES)) {
    assert.ok(spec.title && spec.title.length > 3, `${name} has no title`);
    assert.ok(spec.body && spec.body.length > 20, `${name} tells the user nothing`);
    // "Something went wrong" is the generic SaaS empty state §16.3 forbids.
    assert.ok(!/something went wrong/i.test(spec.body), `${name} is a generic placeholder`);
  }
});
