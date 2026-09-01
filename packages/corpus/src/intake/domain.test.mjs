import test from 'node:test';
import assert from 'node:assert/strict';

import { tagDomain, stripLuauComments, blankStringContents, ERAS, ERA_THRESHOLDS, ERA_MIN_EVIDENCE } from './domain.mjs';
// The eval harness's deprecation vocabulary. Imported across the workspace on
// purpose: see the consistency test at the bottom of this file.
import { RULES as ANTIPATTERNS, stripComments } from '../../../evals/src/roblox-antipatterns.mjs';

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

test('markers inside comments are not engine usage', () => {
  // Found on the real corpus: Sleitnick/RbxCameraShaker reported 3 bare wait() calls
  // in src/CameraShaker/init.lua, and all three are inside the usage example in the
  // file's opening doc comment. Five shake and motion rules were extracted from that
  // source, so an era claim about it is not idle. This is the third time this
  // repository has counted engine vocabulary inside comments — F-43 is the roadmap
  // doing it with genre words.
  const docExample = [
    '--[[ Usage:',
    '',
    '     camShake:Shake(CameraShaker.Presets.Explosion)',
    '     wait(1)',
    '     camShake:ShakeSustain(CameraShaker.Presets.Earthquake)',
    '     wait(2)',
    ']]',
    'local m = {}',
    'task.wait(1) task.spawn(f) task.defer(g) task.delay(1,h) task.cancel(t)',
    'return m',
  ].join('\n');
  const got = tagDomain([f('init.lua', docExample)]);
  assert.deepEqual(got.deprecatedPatterns, [], 'the doc comment must not count as usage');
  assert.equal(got.engineEra, 'modern');

  // A line comment too.
  assert.deepEqual(tagDomain([f('a.luau', '-- wait(1) is deprecated\ntask.wait(1)')]).deprecatedPatterns, []);
});

test('string contents survive comment stripping', () => {
  // The stripper must not eat strings: Instance.new("BodyVelocity") is a real finding
  // and lives entirely inside a string literal.
  const got = tagDomain([f('a.luau', 'local x = Instance.new("BodyVelocity")\nwait(1) spawn(f) delay(1,g) wait(2)')]);
  assert.ok(got.deprecatedPatterns.some((p) => p.pattern === 'body-movers'), 'string contents must be kept');
  assert.equal(got.engineEra, 'legacy');
});

test('a comment marker inside a string is not a comment', () => {
  const got = tagDomain([f('a.luau', 'local s = "-- not a comment"\nwait(1) spawn(f) delay(1,g) wait(2) wait(3)')]);
  assert.equal(got.evidence.legacy, 5, 'the code after the string must still be counted');
});

test('era is a claim about Luau, not about typings or tooling', () => {
  // Found on the real corpus: Reselim/Flipper reported a bare wait() in
  // typings/Signal.d.ts. The line is `wait(): Parameters<T>` — a TypeScript method
  // declaration for a method named wait, unrelated to the Roblox global.
  const ts = tagDomain([f('typings/Signal.d.ts', 'interface S<T> {\n  wait(): Parameters<T>\n}')]);
  assert.deepEqual(ts.deprecatedPatterns, []);
  assert.equal(ts.evidence.legacy, 0);
  assert.equal(ts.engineEra, 'unknown', 'a .d.ts gives no evidence about engine era');

  // …and the same text in a .luau file IS counted.
  const luau = tagDomain([f('a.luau', 'wait(1) wait(2) wait(3) wait(4) wait(5)')]);
  assert.equal(luau.evidence.legacy, 5);
});

test('the comment stripper agrees with the eval harness on the same inputs', () => {
  // packages/corpus is upstream of packages/evals and must not depend on it, so the
  // stripper is implemented locally — which means divergence has to be caught by a
  // test rather than prevented by a coupling, exactly like the vocabulary above.
  const samples = [
    '-- wait(1)\ntask.wait(1)',
    '--[[ wait(1) ]]\ntask.wait(2)',
    '--[=[ spawn(f) ]=]\nlocal x = 1',
    'local s = "-- wait(1)"\nwait(2)',
    "local s = '--[[ nope ]]'\nspawn(g)",
    'local a = 1 -- delay(1, f)\nlocal b = 2',
    'local t = "BodyVelocity"\n-- BodyGyro\nwait(1)',
    // Arbitrary bracket levels, and code resuming after a long comment closes.
    '--[==[ wait(1) ]==]\ntask.wait(2)',
    '--[[ a ]] wait(1)',
    'local s = "a--b" wait(1)',
  ];
  for (const src of samples) {
    const mine = stripLuauComments(src);
    const theirs = stripComments(src);
    // Compare what SURVIVES rather than byte-for-byte: the two blank comments with
    // different filler, and only the surviving tokens can change a verdict.
    const tokens = (s) => s.replace(/\s+/g, ' ').trim();
    assert.equal(
      tokens(mine),
      tokens(theirs),
      `stripper disagreement on ${JSON.stringify(src)}\n  mine:   ${JSON.stringify(mine)}\n  theirs: ${JSON.stringify(theirs)}`,
    );
  }
});

test('a library belongs to itself, which require-shape cannot see', () => {
  // §1 defines this tag as "which library/libraries it belongs to". Sleitnick/Knit has
  // no require(...Knit) in its runtime code — only in a fenced example inside a doc
  // comment — so once comments stopped being counted, Knit stopped belonging to knit.
  const files = [f('src/init.luau', 'return require(script.KnitServer)')];
  assert.deepEqual(tagDomain(files).libraries, [], 'require-shape alone sees nothing');
  assert.deepEqual(tagDomain(files, { repo: 'Sleitnick__Knit' }).libraries, ['knit']);
  assert.deepEqual(tagDomain(files, { repo: 'Sleitnick/Knit' }).libraries, ['knit'], 'either separator');
});

test('a repo name cannot invent a library the vocabulary does not know', () => {
  // Checked against the SAME marker list, so a checkout called `Owner__Whatever` does
  // not mint a library tag nothing else in the pipeline can recognise.
  assert.deepEqual(tagDomain([f('a.luau', 'local x = 1')], { repo: 'Owner__NotALibrary' }).libraries, []);
});

test('call syntax inside a string is prose; a class name inside a string is usage', () => {
  // Found by pointing the tagger at this repository's own Luau. Ops.luau contains a
  // refusal message — "no task.wait, wait() or :Wait()" — explaining to a user which
  // yields are allowed. It was the single deprecated marker across 37 of our files,
  // and it was not one. Meanwhile Instance.new("BodyVelocity") is real deprecated
  // usage whose entire evidence lives inside a string, so strings cannot simply be
  // discarded. The split is by what the marker IS.
  const prose = tagDomain([f('a.luau', [
    'local m = "no task.wait, wait() or :Wait()"',
    'task.wait(1) task.spawn(f) task.defer(g) task.delay(1,h) task.cancel(x)',
  ].join('\n'))]);
  assert.deepEqual(prose.deprecatedPatterns, [], 'a call name quoted in prose is not a call');
  assert.equal(prose.engineEra, 'modern');

  const classInString = tagDomain([f('a.luau', 'local x = Instance.new("BodyVelocity")\nlocal y = 1')]);
  assert.deepEqual(classInString.deprecatedPatterns.map((p) => p.pattern), ['body-movers']);

  // And a real call is still a real call.
  assert.equal(tagDomain([f('a.luau', 'wait(1) wait(2) wait(3) wait(4) wait(5)')]).evidence.legacy, 5);
});

test('blanking string contents preserves length, quotes and line structure', () => {
  const src = 'local a = "hello"\nlocal b = 1';
  const out = blankStringContents(src);
  assert.equal(out.length, src.length, 'offsets must not shift');
  assert.equal(out.split('\n').length, src.split('\n').length);
  assert.ok(out.includes('"     "'), `quotes kept, contents blanked: ${JSON.stringify(out)}`);
  assert.ok(out.includes('local b = 1'), 'code outside strings is untouched');
  // An escaped quote must not end the string early — otherwise the blanking stops
  // mid-literal and the rest of the string is scanned as code.
  assert.equal(
    tagDomain([f('a.luau', 'local s = "a\\"wait(1) b" wait(2) wait(3) wait(4) wait(5) wait(6)')]).evidence.legacy,
    5,
    'the five calls after the literal, and not the one inside it',
  );
});
