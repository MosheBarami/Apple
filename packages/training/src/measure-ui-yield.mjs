#!/usr/bin/env node
/**
 * How many licence-cleared UI assets did the GitHub corpus actually land?
 *
 * The standing ask on this has been answered with a count of GENRES covered — how many kinds of
 * Roblox interface the reference library describes. That is a count of the map, not of the
 * territory. The question is how many distinct, rights-cleared Luau files in hand actually build
 * an interface, and until `acquire-github-luau.mjs` there was no corpus to ask it of.
 *
 *   node packages/training/src/measure-ui-yield.mjs [--dir=...]
 *
 * TWO THINGS THIS DOES THAT A GREP WOULD NOT.
 *
 *   The class list is DERIVED, never typed. Every hand-written list in this repository has
 *   outlived what it lists — `check-credit-figures.mjs` demanded a price for a withdrawn mode and
 *   printed `NaN`. The GUI classes come out of the transitive closure of `inherits:` over the 638
 *   class files in Roblox's own engine reference, which the corpus already holds at a pinned
 *   revision. If Roblox ships a new GUI class, re-running this picks it up.
 *
 *   Comments are stripped before anything is matched. Four scanners in this repository have needed
 *   that fix, and the better a file documents itself the more false hits a prose-reading scanner
 *   returns. A file whose only mention of `TextLabel` is in a sentence explaining what it does not
 *   do is not a UI asset.
 *
 * WHAT IT REPORTS AND WHY IT IS TWO NUMBERS. A file that CONSTRUCTS a GUI class is an asset — it
 * carries a shape somebody can reuse. A file that only REFERENCES one is evidence about UI, not a
 * piece of UI. Reporting the second as the first is the same overstatement as reporting 8,187
 * generated icon stubs as 8,187 contributions.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const CLASSES = join(REPO, 'packages/corpus/raw/Roblox__creator-docs/content/en-us/reference/engine/classes');

/**
 * Strip Luau comments so a scanner reads code, not prose.
 *
 * Long-bracket comments first (`--[[ ... ]]`, `--[==[ ... ]==]`), then line comments. Strings are
 * left alone: `Instance.new("Frame")` has to survive, and it is the whole signal.
 */
export function stripLuauComments(src) {
  return String(src)
    .replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

/**
 * Every GUI class Roblox ships, by transitive closure over `inherits:` from the given roots.
 *
 * Reads the engine reference the corpus already holds. Returns a Set, and the caller is expected
 * to assert it is not empty — a closure that found nothing would classify the entire corpus as
 * containing no UI and look exactly like a clean result.
 */
export function deriveGuiClasses(dir, roots = ['GuiBase2d', 'UIBase', 'GuiObject']) {
  const children = new Map();
  const names = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.yaml')) continue;
    const text = readFileSync(join(dir, f), 'utf8');
    const name = /^name:\s*(\S+)\s*$/m.exec(text)?.[1];
    if (!name) continue;
    names.push(name);
    const inh = /^inherits:\n((?:\s+-\s+\S+\n)+)/m.exec(text)?.[1] ?? '';
    for (const line of inh.split('\n')) {
      const parent = /^\s+-\s+(\S+)$/.exec(line)?.[1];
      if (!parent) continue;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(name);
    }
  }
  const out = new Set();
  const stack = [...roots];
  while (stack.length) {
    const cur = stack.pop();
    for (const c of children.get(cur) ?? []) {
      if (out.has(c)) continue;
      out.add(c);
      stack.push(c);
    }
  }
  // The roots themselves are abstract base classes nobody instantiates, so they stay out.
  return { classes: out, class_files_read: names.length };
}

/**
 * Classify one file against the GUI class set.
 *
 * `constructs` means the file names a GUI class in a position that creates one: `Instance.new`,
 * a Roact/React-lua `createElement`, a Fusion `New`, or a `.new`-style factory call. `references`
 * means the class name appears in code but nothing here creates it.
 */
export function classifyUi(source, guiClasses) {
  const code = stripLuauComments(source);
  const constructed = new Set();
  const referenced = new Set();

  // Instance.new("Frame") / Instance.new('Frame')
  for (const m of code.matchAll(/Instance\s*\.\s*new\s*\(\s*(["'])([A-Za-z0-9_]+)\1/g)) {
    if (guiClasses.has(m[2])) constructed.add(m[2]);
  }
  // Roact.createElement("Frame") / React.createElement("Frame") / e("Frame") / New "Frame" (Fusion)
  for (const m of code.matchAll(/(?:createElement|\bNew\b|\be\b)\s*\(?\s*(["'])([A-Za-z0-9_]+)\1/g)) {
    if (guiClasses.has(m[2])) constructed.add(m[2]);
  }
  for (const cls of guiClasses) {
    if (constructed.has(cls)) continue;
    // Word-boundary match so `Frame` does not fire on `Framework` or `frameCount`.
    if (new RegExp(`\\b${cls}\\b`).test(code)) referenced.add(cls);
  }
  return {
    constructs_ui: constructed.size > 0,
    references_ui: constructed.size === 0 && referenced.size > 0,
    classes_constructed: [...constructed].sort(),
    classes_referenced: [...referenced].sort(),
  };
}

/* c8 ignore start -- filesystem driver */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const a = process.argv.find((x) => x.startsWith('--dir='));
  const DIR = resolve(a ? a.split('=')[1] : join(HERE, '..', 'data', 'roblox-github-v1'));
  const ROWS = join(DIR, 'rows.jsonl');
  if (!existsSync(ROWS)) { console.error(`${ROWS} does not exist — run acquire-github-luau.mjs first.`); process.exit(2); }
  if (!existsSync(CLASSES)) { console.error(`${CLASSES} does not exist — the engine reference is not in this checkout.`); process.exit(2); }

  const { classes, class_files_read } = deriveGuiClasses(CLASSES);
  if (classes.size === 0) {
    console.error('the derived GUI class set is EMPTY — every file would be classified as no-UI and the result would look clean. Refusing.');
    process.exit(3);
  }
  console.error(`derived ${classes.size} GUI classes from ${class_files_read} engine reference class files`);

  const rows = readFileSync(ROWS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const constructs = []; const references = [];
  const classTally = new Map();
  for (const r of rows) {
    const c = classifyUi(r.text, classes);
    if (c.constructs_ui) {
      constructs.push({ row: r, classes: c.classes_constructed });
      for (const k of c.classes_constructed) classTally.set(k, (classTally.get(k) ?? 0) + 1);
    } else if (c.references_ui) references.push(r);
  }

  const hand = constructs.filter((c) => c.row.generated !== true);
  const report = {
    generated_at: new Date().toISOString(),
    generator: 'packages/training/src/measure-ui-yield.mjs',
    corpus: DIR.replace(`${REPO}/`, ''),
    gui_classes_derived: classes.size,
    engine_reference_class_files_read: class_files_read,
    rows_in_corpus: rows.length,
    rows_that_construct_ui: constructs.length,
    rows_that_construct_ui_hand_written: hand.length,
    distinct_shapes_that_construct_ui: new Set(constructs.map((c) => c.row.shape_sha256)).size,
    distinct_shapes_that_construct_ui_hand_written: new Set(hand.map((c) => c.row.shape_sha256)).size,
    rows_that_only_reference_ui: references.length,
    reference_is_not_an_asset: 'a file that names a GUI class without creating one is evidence about UI, not a piece of UI, and is counted separately on purpose',
    repositories_contributing_ui: new Set(constructs.map((c) => c.row.provenance.source_id)).size,
    classes_constructed: Object.fromEntries([...classTally].sort((x, y) => y[1] - x[1])),
    rights: 'every row counted here carries rights.status upstream_licence_text_verified; none is approved for training',
  };

  const out = join(REPO, 'packages/training/runs/ui-yield-github-v1.json');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`\n${report.rows_that_construct_ui} of ${rows.length} rows construct a Roblox GUI class`);
  console.error(`  hand-written: ${report.rows_that_construct_ui_hand_written}`);
  console.error(`  distinct shapes: ${report.distinct_shapes_that_construct_ui} (${report.distinct_shapes_that_construct_ui_hand_written} hand-written)`);
  console.error(`  across ${report.repositories_contributing_ui} repositories`);
  console.error(`${report.rows_that_only_reference_ui} more reference a GUI class without constructing one — NOT counted as assets`);
  console.error(`wrote ${out}`);
}
/* c8 ignore stop */
