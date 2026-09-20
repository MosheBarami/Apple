// A file that names a GUI class is not a piece of UI, and a scanner that reads prose says it is.
//
// WHY THIS EXISTS. The standing ask — extract every kind of Roblox UI that exists into the model's
// library — has been answered with a count of GENRES covered. That is a count of the map. The
// question is how many rights-cleared files in hand actually build an interface, and there are two
// ways to get that number badly wrong, both of which return a bigger number and neither of which
// looks like an error.
//
// The first is reading comments. Four scanners in this repository have needed the same fix, and the
// perverse part is that the better a file documents itself the more false hits a prose-reading
// scanner returns — `check-rebrand` once reported an agent's own written explanation of a defect as
// the defect. A file whose only mention of `TextLabel` is in a sentence saying it deliberately does
// not build one would be counted as a UI asset.
//
// The second is counting a reference as a construction. `quadigen/Kinemium-Engine/k.d.luau` names
// twenty-eight GUI classes and builds none of them: it is a generated type-definition file. It is
// the single densest mention of Roblox UI in the entire 27,671-row corpus and it is not UI.
//
// The third, quieter one: a derived class set that comes back EMPTY classifies every file as
// containing no UI, which looks exactly like a clean measurement of a corpus with no UI in it.
//
// WHAT THIS PROVES, STATED NARROWLY: that comments are stripped before matching and strings are
// not; that construction and reference stay distinct; that class-name matching respects word
// boundaries; and that the derived GUI class set is non-empty and actually contains the classes
// real Roblox UI is made of.
//
// It proves nothing about whether the files it counts are GOOD interfaces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripLuauComments, deriveGuiClasses, classifyUi } from './measure-ui-yield.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(ROOT, '..', '..');
const CLASSES = join(REPO, 'packages/corpus/raw/Roblox__creator-docs/content/en-us/reference/engine/classes');
const REPORT = join(ROOT, 'runs/ui-yield-github-v1.json');

const GUI = new Set(['Frame', 'TextLabel', 'ScreenGui', 'UIListLayout', 'GuiObject']);

test('comments are stripped before matching, and strings are not', () => {
  assert.equal(stripLuauComments('local x = 1 -- makes a Frame\n').includes('Frame'), false,
    'a line comment survived stripping');
  // MULTI-LINE on purpose. A single-line `--[[ ... ]]` is eaten by the LINE-comment rule, so a
  // one-line fixture leaves the block rule untested — a falsification run disabled the block rule
  // and this test stayed green. Only a comment spanning a newline reaches it.
  assert.equal(stripLuauComments('--[[ builds a\n ScreenGui\n]] local y = 2').includes('ScreenGui'), false,
    'a multi-line block comment survived stripping');
  assert.equal(stripLuauComments('--[==[ a\n TextLabel\n]==] local y = 2').includes('TextLabel'), false,
    'a multi-line long-bracket comment with equals signs survived stripping');
  // The signal itself lives in a string literal and must survive.
  assert.ok(stripLuauComments('Instance.new("Frame")').includes('"Frame"'),
    'stripping ate the string literal that carries the whole signal');
});

test('a file that only talks about UI is not counted as UI', () => {
  const prose = '-- This module deliberately does not build a Frame or a TextLabel.\nreturn {}';
  const c = classifyUi(prose, GUI);
  assert.equal(c.constructs_ui, false, 'a comment about Frames was read as building one');
  assert.equal(c.references_ui, false, 'a comment about Frames was read as referencing one');

  // The k.d.luau case: names the classes in code, constructs nothing.
  const defs = 'declare class Frame end\ndeclare class TextLabel end\nexport type X = ScreenGui';
  const d = classifyUi(defs, GUI);
  assert.equal(d.constructs_ui, false, 'a type-definition file was counted as a UI asset');
  assert.equal(d.references_ui, true, 'a file naming GUI classes in code was not recorded as referencing them');

  // And a file that builds one is. It also NAMES a class it does not build (`GuiObject`, as a type
  // annotation) — without that the `referenced` set is empty and the exclusivity clause has nothing
  // to do, which is exactly how a falsification run removed the clause and this test stayed green.
  const real = 'local g = Instance.new("ScreenGui")\nlocal f: GuiObject = Instance.new("Frame")\nf.Parent = g';
  const r = classifyUi(real, GUI);
  assert.equal(r.constructs_ui, true, 'real construction was not detected');
  assert.deepEqual(r.classes_constructed, ['Frame', 'ScreenGui']);
  assert.deepEqual(r.classes_referenced, ['GuiObject'], 'the un-built class was not recorded as a reference');
  assert.equal(r.references_ui, false, 'a constructing file was double-counted as a referencing one');
});

test('the Roact and Fusion idioms count as construction', () => {
  assert.equal(classifyUi('Roact.createElement("Frame", {})', GUI).constructs_ui, true, 'Roact.createElement missed');
  assert.equal(classifyUi('React.createElement("TextLabel", {})', GUI).constructs_ui, true, 'React.createElement missed');
  assert.equal(classifyUi('local ui = New "Frame" { Size = s }', GUI).constructs_ui, true, 'the Fusion New idiom missed');
});

test('class-name matching respects word boundaries', () => {
  // `Framework`, `frameCount` and `MyFrame` are not `Frame`. A substring match would count all of
  // them and quietly inflate the answer on the most common word in the set.
  for (const src of ['local Framework = require(x)', 'local frameCount = 0', 'local MyFrameHelper = {}']) {
    const c = classifyUi(src, GUI);
    assert.equal(c.constructs_ui, false, `${src}: matched as construction`);
    assert.equal(c.references_ui, false, `${src}: matched as a reference`);
  }
  assert.equal(classifyUi('local f: Frame = nil', GUI).references_ui, true,
    'a genuine type annotation stopped being recognised');
});

test('the derived GUI class set is non-empty and holds the classes real UI is made of',
  { skip: !existsSync(CLASSES) && 'the engine reference is not in this checkout' }, () => {
    const { classes, class_files_read } = deriveGuiClasses(CLASSES);
    assert.ok(class_files_read > 300, `only ${class_files_read} class files were read — the reference directory is not what this expects`);
    // An empty closure would classify the whole corpus as UI-free and read as a clean result.
    assert.ok(classes.size > 20, `the derived class set holds ${classes.size} classes — too thin to be the real GUI tree`);
    for (const c of ['Frame', 'TextLabel', 'TextButton', 'ScreenGui', 'ScrollingFrame', 'ImageLabel',
      'UIListLayout', 'UICorner', 'UIPadding', 'BillboardGui', 'SurfaceGui', 'ViewportFrame']) {
      assert.ok(classes.has(c), `${c} is missing from the derived GUI class set`);
    }
    // And must not have swallowed the rest of the engine.
    for (const c of ['Part', 'Humanoid', 'RemoteEvent', 'Workspace', 'Sound']) {
      assert.equal(classes.has(c), false, `${c} is not a GUI class and is in the derived set`);
    }
  });

test('the published yield keeps construction and reference apart',
  { skip: !existsSync(REPORT) && 'the measurement has not been run' }, () => {
    const r = JSON.parse(readFileSync(REPORT, 'utf8'));
    assert.ok(r.rows_that_construct_ui > 0, 'the measurement found no UI at all — check the instrument before believing it');
    assert.ok(r.rows_that_construct_ui <= r.rows_in_corpus);
    assert.ok(r.distinct_shapes_that_construct_ui <= r.rows_that_construct_ui,
      'more distinct UI shapes than UI rows');
    assert.ok(Object.prototype.hasOwnProperty.call(r, 'rows_that_only_reference_ui'),
      'the reference count was dropped, so the headline no longer says what it excluded');
    assert.match(String(r.reference_is_not_an_asset), /not a piece of UI/,
      'the note explaining why references are counted separately was removed');
    assert.match(String(r.rights), /upstream_licence_text_verified/,
      'the yield stopped saying which rights tier the counted rows carry');
    assert.ok(r.gui_classes_derived > 20, 'the report records a class set too thin to have measured anything');
  });
