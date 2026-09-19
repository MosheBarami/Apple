// The canonical empty/waiting/failed state vocabulary.
//
// These states are the product's behaviour on a user's worst days, and they were
// fourteen hand-written blocks across two CSS layers. The tests here are about the
// two things a shared component can actually get wrong: claiming a state the product
// cannot honestly observe, and colouring a state against its own meaning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const out = join(mkdtempSync(join(tmpdir(), 'empty-')), 'empty-state.mjs');
// The MODEL, which imports no React — the same split every other model here uses.
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'components', 'empty-state-model.ts'), '--bundle', '--format=esm',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
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
  const css = readFileSync(join(WEB, 'src', 'design', 'system.css'), 'utf8');
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

// --- no route quietly hand-writes a state that has a canonical form ------------
// The point of the vocabulary is that a surface PICKS a state rather than inventing
// prose. That only holds while new full-block empty states go through the component,
// and the cheapest way for it to stop holding is someone copying the old markup.

test('the only hand-written block states are the two that have no canonical form', () => {
  const routes = join(WEB, 'src', 'routes');
  const offenders = [];
  for (const f of readdirSync(routes).filter((n) => n.endsWith('.tsx'))) {
    const src = readFileSync(join(routes, f), 'utf8');
    if (/className="empty-state/.test(src)) offenders.push(f);
  }
  // not-found: a 404 is a routing state, not a product state — M01–M10 has no entry
  //   for it and inventing one would be the drift, not the fix.
  // admin: "this area is for operators" is an authorization notice, same reasoning.
  // join: the fate of a share-link TOKEN, which is not one of the product states either.
  //   Four of its five branches have no canonical form at all — "Opening the link…" is a
  //   write in flight, "You're in" is a success confirmation, "This link is incomplete" is a
  //   malformed address (not-found's reasoning) and "This link didn't work" is an
  //   authorization notice (admin's). Only the fifth, the request failing to arrive, is near
  //   M07 — and M07's title is "Could not reach Apple", which is not what happened: the
  //   sentence that branch exists to say is that the LINK MAY STILL BE FINE, and a title this
  //   component deliberately does not let a caller override would contradict it. Routing one
  //   of five branches through <EmptyState> would also leave the other four hand-written, so
  //   the file would still be here.
  assert.deepEqual(offenders.sort(), ['admin.tsx', 'join.tsx', 'not-found.tsx'],
    'a route is hand-writing a block empty state. If it maps to an M01–M10 state, use '
    + '<EmptyState>. If it genuinely does not, add it here with the reason.');
});

// --- the Studio place label ----------------------------------------------------
// Not an empty state, but it lives in the Project details menu. The full place name is
// useful evidence about the paired Studio document, so it should remain valid at every
// width; a narrow-viewport label swap only recreates the old truncated-header problem.

test('the Studio place label stays full inside the Project menu', () => {
  const tsx = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
  const menu = /<details className="studio-project-menu">[\s\S]*?<\/details>/.exec(tsx);
  assert.ok(menu, 'the Project details menu is gone');
  assert.match(menu[0], /gx-pill__place/, 'the full Studio place label must live in Project details');
  assert.match(menu[0], /title=\{studio\.state\?\.placeName[\s\S]*?Connected to Studio/);

  const css = readFileSync(join(WEB, 'src', 'design', 'system.css'), 'utf8');
  // The full Studio place label remains valid at every width. There is no second
  // narrow-viewport label swap, and introducing one would recreate the old header.
  assert.match(css, /\.gx-pill__place[^{}]*\{[^{}]*overflow:\s*hidden/);
  assert.doesNotMatch(css, /@media[^{}]*\{[^{}]*\.gx-pill__place[^{}]*display:\s*none/);
  assert.doesNotMatch(css, /@media[^{}]*\{[^{}]*\.gx-pill__short[^{}]*display:\s*inline/);
});
