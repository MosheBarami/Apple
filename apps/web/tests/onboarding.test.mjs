// The tour, and the four ways a tour becomes a liability.
//
// A coach mark is a pointer at a thing. That makes it the one UI element whose correctness depends
// on something outside itself, and every failure here is the same failure — the pointer outliving
// the thing:
//
//   1. IT POINTS AT NOTHING. The step names an anchor that is not on this screen, so the card
//      floats in the corner explaining a button the user cannot see.
//   2. IT TEACHES WHAT IS ALREADY DONE. "Pair your place in Studio" shown to someone whose place
//      has been paired for a week reads as the product not knowing them at all.
//   3. IT COMES BACK. Progress is persisted, and persisted state is parsed state: one bad blob and
//      the tour restarts on every load, forever, for the user least able to explain why.
//   4. IT BELIEVES A STRING. Facts arrive from storage and from queries as `unknown`, and
//      `'false'` is truthy — the classic way a gate opens on the value that was meant to close it.
//
// The model is fed each of those four inputs rather than walked down the path where none of them
// happen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const read = (f) => readFileSync(join(SRC, f), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function fakeStorage({ throwOn = null, seed = {} } = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem(k) {
      if (throwOn === 'get') throw new DOMException('blocked');
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (throwOn === 'set') throw new DOMException('QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); },
  };
}
globalThis.DOMException = globalThis.DOMException ?? class DOMException extends Error {};
const install = (storage) => { globalThis.window = { localStorage: storage }; };
install(fakeStorage());

const {
  EMPTY_PROGRESS,
  TOUR_KEY,
  TOUR_STEPS,
  dismissTour,
  markSeen,
  nextTourStep,
  readProgress,
  restartTour,
  writeProgress,
} = await import('../src/lib/onboarding.ts');

/** Every anchor that really exists in the app's own markup. */
function anchorsInSource() {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx')) {
        for (const m of readFileSync(full, 'utf8').matchAll(/data-tour="([^"]+)"/g)) found.add(m[1]);
      }
    }
  };
  walk(SRC);
  return found;
}

const allAnchors = () => TOUR_STEPS.map((s) => s.anchor);

/* ------------------------------------------------------------ the steps --- */

test('there are steps, and each one says something', () => {
  assert.ok(TOUR_STEPS.length >= 3, `a tour of ${TOUR_STEPS.length} steps is not a tour`);
  const ids = new Set();
  for (const step of TOUR_STEPS) {
    assert.ok(step.id && !ids.has(step.id), `duplicate or missing id: ${step.id}`);
    ids.add(step.id);
    assert.ok(step.title && step.title.length < 60, `${step.id}: the title is not a headline`);
    assert.ok(step.body && step.body.length > 20, `${step.id}: says nothing`);
    assert.ok(step.anchor, `${step.id}: points at nothing`);
  }
});

test('EVERY STEP POINTS AT AN ELEMENT THAT ACTUALLY EXISTS', () => {
  // The anchor is a contract with the markup, and nothing but this test enforces it. A step whose
  // anchor was renamed out of the JSX is a card floating beside the thing it used to describe.
  const real = anchorsInSource();
  assert.ok(real.size > 0, 'no data-tour anchors found at all — the sweep is measuring nothing');
  for (const step of TOUR_STEPS) {
    assert.ok(real.has(step.anchor), `${step.id}: nothing in the app carries data-tour="${step.anchor}"`);
  }
});

/* --------------------------------------------------------- what is next --- */

const present = (...anchors) => ({ anchors, done: {} });

test('the first unseen step whose anchor is on screen is the one shown', () => {
  const step = nextTourStep(EMPTY_PROGRESS, { anchors: allAnchors(), done: {} });
  assert.equal(step.id, TOUR_STEPS[0].id, 'the tour must start at the start');
});

test('a step already seen does not come back', () => {
  const after = markSeen(EMPTY_PROGRESS, TOUR_STEPS[0].id);
  const step = nextTourStep(after, { anchors: allAnchors(), done: {} });
  assert.equal(step.id, TOUR_STEPS[1].id);
});

test('A STEP WHOSE ANCHOR IS NOT ON THIS SCREEN IS NOT SHOWN', () => {
  // The violating input: nothing is anchored at all, which is the state of every route the step
  // does not belong to. A tour that renders anyway is pointing at empty space.
  assert.equal(nextTourStep(EMPTY_PROGRESS, { anchors: [], done: {} }), null);
  // And it is WITHHELD, not consumed: when the user reaches the screen, it is waiting for them.
  const later = nextTourStep(EMPTY_PROGRESS, { anchors: allAnchors(), done: {} });
  assert.equal(later.id, TOUR_STEPS[0].id);
});

test('an anchors list that is not a list claims nothing is on screen', () => {
  for (const bad of [undefined, null, 'new-chat', {}, 7]) {
    assert.equal(
      nextTourStep(EMPTY_PROGRESS, { anchors: bad, done: {} }),
      null,
      `anchors of ${JSON.stringify(bad)} produced a step anyway`,
    );
  }
});

test('A STEP THE USER HAS ALREADY DONE IS SKIPPED, NOT TAUGHT', () => {
  const gated = TOUR_STEPS.find((s) => s.satisfiedBy);
  assert.ok(gated, 'at least one step must be gated on something the user may already have done');
  const step = nextTourStep(EMPTY_PROGRESS, { anchors: allAnchors(), done: { [gated.satisfiedBy]: true } });
  assert.notEqual(step && step.id, gated.id, `${gated.id} was shown to someone who had already done it`);
});

test('AND A FACT THAT IS NOT LITERALLY TRUE DOES NOT COUNT AS DONE', () => {
  // `'false'` is the input: truthy, and the exact shape a fact takes after a round trip through
  // JSON or a query that returns strings. A truthy read here SKIPS the step the user needs most.
  const gated = TOUR_STEPS.find((s) => s.satisfiedBy);
  for (const bad of ['false', 'true', 1, {}, 'yes']) {
    const step = nextTourStep(EMPTY_PROGRESS, { anchors: allAnchors(), done: { [gated.satisfiedBy]: bad } });
    assert.equal(
      step && step.id,
      TOUR_STEPS[0].id,
      `a done-fact of ${JSON.stringify(bad)} skipped past ${TOUR_STEPS[0].id}`,
    );
  }
});

test('a dismissed tour is over', () => {
  const done = dismissTour(EMPTY_PROGRESS);
  assert.equal(nextTourStep(done, { anchors: allAnchors(), done: {} }), null);
});

test('seeing the last step ends the tour without another card', () => {
  let progress = EMPTY_PROGRESS;
  for (const step of TOUR_STEPS) progress = markSeen(progress, step.id);
  assert.equal(nextTourStep(progress, { anchors: allAnchors(), done: {} }), null);
});

test('AN UNKNOWN ID IN THE SAVED PROGRESS DOES NOT CONSUME A REAL STEP', () => {
  // Steps get renamed. The saved blob then names a step that no longer exists, and a model that
  // counts entries instead of matching them skips a real one for every stale id.
  const stale = { seen: ['a-step-that-was-deleted', 'another'], dismissed: false };
  const step = nextTourStep(stale, { anchors: allAnchors(), done: {} });
  assert.equal(step.id, TOUR_STEPS[0].id, 'a stale id ate the first real step');
});

test('restarting offers the first step again', () => {
  const dead = dismissTour(markSeen(EMPTY_PROGRESS, TOUR_STEPS[0].id));
  const step = nextTourStep(restartTour(), { anchors: allAnchors(), done: {} });
  assert.equal(nextTourStep(dead, { anchors: allAnchors(), done: {} }), null);
  assert.equal(step.id, TOUR_STEPS[0].id);
});

/* ------------------------------------------------------------- storage --- */

test('progress survives a reload', () => {
  const store = fakeStorage();
  install(store);
  writeProgress(markSeen(EMPTY_PROGRESS, TOUR_STEPS[0].id));
  assert.deepEqual(readProgress().seen, [TOUR_STEPS[0].id]);
  assert.ok(store.map.has(TOUR_KEY), 'nothing was written under the tour key');
});

test('A CORRUPT BLOB RESTARTS NOTHING AND THROWS NOTHING', () => {
  // Every one of these has been in a real localStorage: a truncated write, an old shape, a value
  // someone set by hand. `JSON.parse` on the first two throws, and the rest parse into a shape
  // that a trusting reader spreads straight into state.
  for (const blob of ['{', 'undefined', 'null', '"dismissed"', '[]', '{"seen":"all"}', '{"dismissed":"yes"}']) {
    install(fakeStorage({ seed: { [TOUR_KEY]: blob } }));
    const p = readProgress();
    assert.deepEqual(p.seen, [], `${blob}: produced a seen list of ${JSON.stringify(p.seen)}`);
    assert.equal(p.dismissed, false, `${blob}: was read as a dismissal`);
    // And the shape it hands back is usable: the tour still runs rather than crashing on it.
    assert.equal(nextTourStep(p, { anchors: allAnchors(), done: {} }).id, TOUR_STEPS[0].id);
  }
});

test('a "dismissed" that is only truthy does not end the tour', () => {
  install(fakeStorage({ seed: { [TOUR_KEY]: '{"seen":[],"dismissed":"false"}' } }));
  assert.equal(readProgress().dismissed, false);
});

test('storage that throws does not take the app down', () => {
  install(fakeStorage({ throwOn: 'get' }));
  assert.deepEqual(readProgress(), EMPTY_PROGRESS);
  install(fakeStorage({ throwOn: 'set' }));
  assert.doesNotThrow(() => writeProgress(dismissTour(EMPTY_PROGRESS)));
});

/* ------------------------------------------------------------ the wiring --- */

test('the shell mounts the tour and feeds it what it can honestly observe', () => {
  const layout = code(read('components/layout.tsx'));
  assert.match(layout, /<OnboardingTour\b/, 'the tour is never mounted');
  // hasProject is the one fact the shell genuinely knows — it renders the list.
  assert.match(layout, /done=\{\{ hasProject:/, 'the tour must be told what the user has already done');
});

test('the tour can be asked for again from the palette', () => {
  const layout = code(read('components/layout.tsx'));
  assert.match(layout, /id: 'show-tour'/, 'a tour you cannot re-run is a tour you get one chance at');
  assert.match(layout, /restartTour\(\)/);
});

test('THE CARD DOES NOT TAKE FOCUS OUT OF A SENTENCE SOMEONE IS TYPING', () => {
  // The composer step appears the moment a composer is on screen, which is frequently the moment
  // someone is halfway through a prompt. A card that grabs focus then eats the rest of it, and the
  // user never finds out where it went. The check reuses lib/shortcuts.ts's own definition of "the
  // user is typing" rather than inventing a second one that will drift from it.
  const tour = code(read('components/onboarding-tour.tsx'));
  assert.match(tour, /isTypingTarget\(document\.activeElement\)/);
  assert.doesNotMatch(tour, /autoFocus/, 'autoFocus cannot ask that question, so it cannot be used here');
  // And it is not a modal: the tour explains things you can use while it is open.
  assert.match(tour, /aria-modal=\{false\}/);
});

test('the card refuses to render against an anchor it cannot find', () => {
  const tour = code(read('components/onboarding-tour.tsx'));
  assert.match(tour, /querySelector.*data-tour/, 'the card must locate its anchor');
  assert.match(tour, /getBoundingClientRect\(\)/, 'and position itself against the real element');
  assert.match(tour, /nextTourStep\(/, 'the decision stays in the model');
});
