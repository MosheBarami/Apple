/**
 * THE WEB'S TOOL TABLE MUST MATCH THE WORKER'S TOOL REGISTRY, BOTH WAYS.
 *
 * Before this file there were three copies of the table — TOOL_KIND and STEP_LABEL in
 * activity-model, TOOL_LABEL in thinking-model — and they had drifted in both of the
 * ways a copy can:
 *
 *   MISSING: none of the three knew `generate_image`, so a run that generated one
 *   showed "generate image", the underscore-stripped fallback, next to steps that
 *   read as sentences. No error, no warning, just a worse sentence than its
 *   neighbours for as long as nobody looked.
 *
 *   PHANTOM: two of them carried `visual_critique`, which is not a tool. It is the
 *   name of a JSON schema in the worker's vision.ts. A label for a tool that cannot
 *   run looks exactly like coverage from the inside.
 *
 * Neither is catchable by a test that only exercises the table against itself, which
 * is why this one reads the worker's registry off disk. If the parse ever stops
 * matching, the first test fails rather than the other two passing on an empty set.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '../..');

const out = join(mkdtempSync(join(tmpdir(), 'toolvocab-')), 'v.mjs');
execFileSync(
  join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src/components/ws/tool-vocabulary.ts'), '--format=esm', `--outfile=${out}`],
  { cwd: ROOT, stdio: 'pipe' },
);
const { TOOL, ACTIVITY, ACTIVITY_NOT_MODELLED, kindForTool, labelForTool } = await import(out);

/** The keys of the worker's `export const TOOLS`, by brace-matching its literal. */
function registeredTools() {
  const src = readFileSync(join(ROOT, 'apps/worker/src/tools.ts'), 'utf8');
  const start = src.indexOf('{', src.indexOf('export const TOOLS'));
  let depth = 0;
  let end = start;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return [...src.slice(start, end).matchAll(/^ {2}([a-z_][a-z0-9_]*):\s*\{/gm)].map((m) => m[1]);
}

test('the worker registry parse actually found the tools', () => {
  const tools = registeredTools();
  assert.ok(tools.length >= 20, `parsed ${tools.length} tools; the guards below would be vacuous`);
  assert.ok(tools.includes('generate_image'), 'including the one that started this');
});

test('every tool the worker can run has a written label', () => {
  const missing = registeredTools().filter((t) => !(t in TOOL));
  assert.deepEqual(missing, [], `these would render as raw tool names: ${missing.join(', ')}`);
});

test('the table names no tool the worker cannot run', () => {
  const real = new Set(registeredTools());
  const phantom = Object.keys(TOOL).filter((t) => !real.has(t));
  assert.deepEqual(phantom, [], `vocabulary for tools that cannot run: ${phantom.join(', ')}`);
});

test('every tool maps to a kind that exists', () => {
  for (const [tool, spec] of Object.entries(TOOL)) {
    assert.ok(spec.kind in ACTIVITY, `${tool} maps to unknown kind ${spec.kind}`);
    assert.ok(spec.label.length > 0, `${tool} has no label`);
  }
});

test('an unknown tool is `working` and keeps its own name', () => {
  // The fallback must stay honest: the step happened, so it is shown, and it is
  // shown under its real name rather than a description nobody wrote.
  assert.equal(kindForTool('some_tool_from_the_future'), 'working');
  assert.equal(labelForTool('some_tool_from_the_future'), 'some tool from the future');
  assert.equal(labelForTool(undefined), 'A step with no reported name');
});

test('the canonical C-series ids are unique, and the gaps are declared', () => {
  const ids = Object.values(ACTIVITY)
    .map((a) => a.canonical)
    .filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, 'two activities claim the same C number');

  // C10 and C12 are absent on purpose. An undeclared gap is an oversight; a
  // declared one is a decision, and it has to carry its reason.
  const declared = new Set([...ids, ...Object.keys(ACTIVITY_NOT_MODELLED)]);
  const expected = Array.from({ length: 18 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);
  const unaccounted = expected.filter((c) => !declared.has(c));
  assert.deepEqual(unaccounted, [], `C-series entries neither implemented nor explained: ${unaccounted.join(', ')}`);
  for (const [id, reason] of Object.entries(ACTIVITY_NOT_MODELLED)) {
    assert.ok(reason.length > 60, `${id} needs a real reason, not a shrug`);
  }
});

test('there is only one tool LABEL/KIND table left in the web app', () => {
  // Four existed: TOOL_KIND and STEP_LABEL in activity-model, TOOL_LABEL in
  // thinking-model, and a `TOOLS` map in lib/tool-meta.ts. The last was the worst —
  // three of its entries were tools that do not exist and seven real ones were
  // missing, so a work-surface panel from `generate_model` was headed "Working".
  //
  // NARROWLY defined, because a per-tool map is not automatically a duplicate. The
  // first version of this guard flagged `ws/evidence-model.ts`, which maps a tool to
  // which EVIDENCE CARD its result yields — a different fact about tools, deliberately
  // narrow, and documented as such. Only two value shapes are the vocabulary's own:
  //
  //   a LABEL — prose, so it starts with a capital and contains a space;
  //   a KIND  — one of the activity names in ACTIVITY.
  //
  // This cannot catch a duplicate that invents a third value shape. It catches the
  // drift that actually happened, which was wrong words on the screen.
  const real = new Set(registeredTools());
  const kinds = new Set(Object.keys(ACTIVITY));
  const offenders = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist') continue;
        walk(join(dir, e.name));
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        const p = join(dir, e.name);
        if (p.endsWith('tool-vocabulary.ts')) continue;
        // op-vocabulary.ts is a table of STUDIO OPS, not of tools. Thirteen names appear in both
        // sets — edit_script is a tool the agent calls AND the wire op the plugin performs — but
        // the sets are different (set_props and delete_instances are ops with no tool; search_docs
        // is a tool that touches no Studio op) and so are the sentences: this table is a past-tense
        // RECORD of what happened to the place, the one above is the present-tense activity shown
        // while a run is going. The exemption is earned rather than granted — studio-activity.test
        // holds that file to the worker's own StudioOp union in both directions, which is the same
        // discipline this file applies to the tool registry.
        if (p.endsWith('op-vocabulary.ts')) continue;
        const src = readFileSync(p, 'utf8');
        // LINE BY LINE. A table entry occupies one line, and matching across the whole
        // file let a greedy character class run past a newline — the first version of
        // this loop read one key's "value" as the next two lines of source and skipped
        // the entry between them, so it found nothing and passed.
        const hits = new Set();
        for (const line of src.split('\n')) {
          const key = /^\s{2,}([a-z_][a-z0-9_]*):/.exec(line)?.[1];
          if (!key || !real.has(key)) continue;
          for (const [, value] of line.matchAll(/['"]([^'"\n]*)['"]/g)) {
            if (kinds.has(value) || (/^[A-Z]/.test(value) && value.includes(' '))) hits.add(key);
          }
        }
        if (hits.size >= 3) offenders.push(`${relative(WEB, p)} (${hits.size} tool labels or kinds)`);
      }
    }
  };
  walk(join(WEB, 'src'));
  assert.deepEqual(offenders, [], `a second tool label/kind table has appeared in: ${offenders.join(', ')}`);
});
