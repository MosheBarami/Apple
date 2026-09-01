import test from 'node:test';
import assert from 'node:assert/strict';

import { tagDomain, ERAS, ERA_THRESHOLDS, ERA_MIN_EVIDENCE } from './domain.mjs';
// The eval harness's deprecation vocabulary. Imported across the workspace on
// purpose: see the consistency test at the bottom of this file.
import { RULES as ANTIPATTERNS } from '../../../evals/src/roblox-antipatterns.mjs';

const f = (path, source) => ({ path, source });

test('a modern codebase reads modern', () => {
  const got = tagDomain([f('a.luau', `
    --!strict
    local TweenService = game:GetService("TweenService")
    task.wait(1)
    task.spawn(function() end)
    part:GetPropertyChangedSignal("Position"):Connect(fn)
    local v = Instance.new("LinearVelocity")
  `)]);
  assert.equal(got.engineEra, 'modern');
  assert.deepEqual(got.deprecatedPatterns, []);
});

test('a legacy codebase reads legacy and names what dated it', () => {
  const got = tagDomain([f('old.lua', `
    wait(1)
    spawn(function() end)
    delay(2, fn)
    part.Touched:connect(fn)
    local bv = Instance.new("BodyVelocity")
  `)]);
  assert.equal(got.engineEra, 'legacy');
  const names = got.deprecatedPatterns.map((p) => p.pattern).sort();
  assert.deepEqual(names, ['bare-spawn-delay', 'bare-wait', 'body-movers', 'lowercase-connect']);
  assert.ok(got.deprecatedPatterns[0].files.includes('old.lua'));
});

test('one stray wait() does not make a modern library legacy', () => {
  // The failure this guards: era decided by PRESENCE rather than density would tag
  // most maintained libraries legacy on a single five-year-old line, and a tag that
  // says "legacy" about everything answers no question at all.
  const got = tagDomain([f('a.luau', `
    --!strict
    task.wait(1) task.wait(2) task.defer(fn) task.spawn(fn)
    local ts = TweenService
    local ui = Instance.new("UIListLayout")
    part:GetPropertyChangedSignal("Size"):Connect(fn)
    wait(0.1) -- one straggler
  `)]);
  assert.equal(got.engineEra, 'modern');
  // …but the straggler is still REPORTED. Era is a summary, not a suppression.
  assert.deepEqual(got.deprecatedPatterns.map((p) => p.pattern), ['bare-wait']);
});

test('a half-migrated codebase is transitional, not rounded to a neighbour', () => {
  // 3 modern markers, 2 legacy -> 0.4, squarely between the thresholds.
  const got = tagDomain([f('a.luau', 'task.wait(1) task.spawn(f) task.defer(h) wait(2) spawn(g)')]);
  assert.equal(got.engineEra, 'transitional');
  assert.equal(got.evidence.legacyShare, 0.4);
  assert.ok(got.evidence.legacyShare > ERA_THRESHOLDS.modern);
  assert.ok(got.evidence.legacyShare < ERA_THRESHOLDS.legacy);
});

test('the era thresholds are inclusive on both edges', () => {
  // A threshold is exactly where a classifier silently misbehaves, and the first
  // fixture written for the test above landed on 0.6 and was read as a bug in the
  // module rather than as the boundary doing what it says. Pin both edges.
  const exactlyLegacy = tagDomain([f('a.luau', 'task.wait(1) task.spawn(f) wait(2) spawn(g) delay(1,h)')]);
  assert.equal(exactlyLegacy.evidence.legacyShare, ERA_THRESHOLDS.legacy);
  assert.equal(exactlyLegacy.engineEra, 'legacy', '>= legacy threshold is legacy');

  // 8 modern, 2 legacy -> 0.2, the modern edge.
  const exactlyModern = tagDomain([f('a.luau',
    'task.wait(1) task.spawn(f) task.defer(g) task.delay(1,h) task.cancel(t) '
    + ':Once( :GetPropertyChangedSignal( TweenService wait(1) spawn(x)')]);
  assert.equal(exactlyModern.evidence.legacyShare, ERA_THRESHOLDS.modern);
  assert.equal(exactlyModern.engineEra, 'modern', '<= modern threshold is modern');
});

test('too little evidence is unknown, not a guess', () => {
  const got = tagDomain([f('data.json', '{"a": 1}'), f('t.luau', 'local x = 1')]);
  assert.equal(got.engineEra, 'unknown');
  assert.equal(got.evidence.legacyShare, null);
  assert.ok(got.evidence.modern + got.evidence.legacy < ERA_MIN_EVIDENCE);
  assert.ok(ERAS.includes(got.engineEra));
});

test('libraries come from require shape, not from prose', () => {
  const got = tagDomain([
    f('README.md', 'This works great with Knit and Roact and Fusion!'),
    f('init.luau', 'local Promise = require(script.Parent.Promise)\nlocal Janitor = require(pkg.Janitor)'),
  ]);
  assert.deepEqual(got.libraries, ['janitor', 'promise']);
});

test('a stateful regex does not skip the second file', () => {
  // g-flagged module-level regexes reused across calls are the classic way a
  // scanner starts silently missing every other file.
  const one = f('a.luau', 'wait(1) wait(2) wait(3) wait(4) wait(5)');
  const two = f('b.luau', 'wait(1) wait(2) wait(3) wait(4) wait(5)');
  const both = tagDomain([one, two]);
  assert.equal(both.evidence.legacy, 10, 'both files must be counted');
  assert.equal(tagDomain([one]).evidence.legacy, 5);
});

test('the era vocabulary matches what the eval harness lints for', () => {
  // Two independent lists of deprecated APIs is exactly the arrangement where one
  // of them quietly stops being true. If `deprecated-api` learns a new construct,
  // this fails until domain.mjs learns it too.
  const rule = ANTIPATTERNS.find((r) => r.id === 'deprecated-api');
  assert.ok(rule, 'the deprecated-api rule must still exist');

  const samples = [
    'wait(1)',
    'spawn(fn)',
    'delay(1, fn)',
    'x.Touched:connect(fn)',
    'Instance.new("BodyVelocity")',
    'Instance.new("BodyPosition")',
    'Instance.new("BodyGyro")',
    'Instance.new("BodyAngularVelocity")',
  ];
  for (const src of samples) {
    const flagged = rule.find({ src, path: 'x.luau' }).length > 0;
    const tagged = tagDomain([f('x.luau', src)]).deprecatedPatterns.length > 0;
    assert.equal(
      tagged,
      flagged,
      `"${src}": eval harness ${flagged ? 'flags' : 'ignores'} it, domain tagger ${tagged ? 'flags' : 'ignores'} it`,
    );
  }
});

test('a library that defines its own connect is not condemned for its naming', () => {
  // Found by running the tagger over the real corpus: Reselim/Flipper ships a
  // userland `Signal` with `function Signal:connect(handler)`, and counting its
  // seven call sites as removed-alias usage classified the whole library `legacy`.
  const flipperish = [
    f('Signal.lua', 'local Signal = {}\nfunction Signal:connect(handler)\n  return handler\nend\nreturn Signal'),
    f('BaseMotor.lua', 'return self._onStep:connect(handler)'),
    f('Motor.lua', 'self._onStart:connect(a) self._onComplete:connect(b)'),
    f('Modern.luau', 'task.wait(1) task.spawn(f) task.defer(g) TweenService :Once( :GetPropertyChangedSignal('),
  ];
  const got = tagDomain(flipperish);
  assert.equal(got.engineEra, 'modern');
  assert.deepEqual(got.deprecatedPatterns.map((p) => p.pattern), []);

  // Suppressed, not silent: the calls are still reported with the reason.
  assert.ok(got.suppressed.length > 0);
  assert.equal(got.suppressed[0].marker, 'lowercase-connect');
  assert.match(got.suppressed[0].reason, /defines its own connect/);
});

test('a checkout that does NOT define connect still gets the alias flagged', () => {
  // The suppression is per-checkout and evidence-driven; without the definition it
  // must not apply, or the whole marker would be dead.
  const got = tagDomain([f('a.lua', 'part.Touched:connect(fn)\nhum.Died:connect(fn)\nwait(1) spawn(f) delay(1,g)')]);
  assert.equal(got.engineEra, 'legacy');
  assert.ok(got.deprecatedPatterns.some((p) => p.pattern === 'lowercase-connect'));
  assert.deepEqual(got.suppressed, []);
});
