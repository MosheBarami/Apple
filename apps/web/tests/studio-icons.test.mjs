/**
 * ROBLOX STUDIO OBJECT ICONS ON THE ROWS, AND THE MOTION AROUND THEM.
 *
 * What can go wrong silently, and what each test below holds:
 *
 *   - The sprite and the index drift apart: every row shows the NEIGHBOUR's icon — a Script row
 *     wearing a Folder — and nothing errors. The strips are measured against the class list.
 *   - A tool or op is mapped that no longer exists, or an entry names a class with no cell. Both
 *     read as coverage. Checked against the tool and op tables, in the direction that can rot.
 *   - A step that touches no object gets an object icon anyway: a Roblox Part beside "Searched the
 *     web" is a claim about the place that is not true. Rendered and checked.
 *   - Motion that ignores reduced motion. Checked on the shipped stylesheet, comments stripped.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WEB, bundle, decomment, renderWith } from './ui-bundle.mjs';

const SRC = join(WEB, 'src');
const model = await import(pathToFileURL(join(SRC, 'components/studio-icon-model.ts')).href);
const { OP_LABEL } = await import(pathToFileURL(join(SRC, 'components/ws/op-vocabulary.ts')).href);
const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { Tool, ToolHeader } from './src/components/ai-elements/tool';
  export { TOOL } from './src/components/ws/tool-vocabulary';
`, { name: 'studio-icons', resolveDir: WEB });

const CSS = decomment(readFileSync(join(SRC, 'components/studio-icon.css'), 'utf8'));
const ICONS = join(SRC, 'assets/studio-icons');
const { STUDIO_ICON_CLASSES: CLASSES } = model;

const header = (tool, state) => renderWith(ui.renderToStaticMarkup,
  ui.h(ui.Tool, null, ui.h(ui.ToolHeader, { title: tool, type: `tool-${tool}`, state })));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path) {
  const b = readFileSync(path);
  assert.equal(b.toString('latin1', 1, 4), 'PNG', `${path} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

test('the class list is read and has no repeats', () => {
  assert.ok(CLASSES.length > 20, `only ${CLASSES.length} classes — this suite would check nothing`);
  assert.equal(new Set(CLASSES).size, CLASSES.length);
  assert.equal(CLASSES[0], model.STUDIO_ICON_FALLBACK, 'cell 0 is what an unknown class falls back to');
});

test('each theme strip has exactly one 32px cell per class, in one column', () => {
  for (const theme of ['dark', 'light']) {
    const { width, height } = pngSize(join(ICONS, `studio-icons-${theme}.png`));
    assert.equal(width, 32, `${theme}: one column`);
    assert.equal(height, 32 * CLASSES.length, `${theme}: ${height / 32} cells for ${CLASSES.length} classes — the index would point at a neighbour`);
  }
});

test('an unknown, empty or missing class falls back to the neutral cell; a known one finds its own', () => {
  for (const c of ['NotARealClass', '', null, undefined]) assert.equal(model.studioIconIndex(c), 0, String(c));
  CLASSES.forEach((c, i) => assert.equal(model.studioIconIndex(c), i, c));
});

test('object icons only: nothing in the set is a logo', () => {
  for (const c of CLASSES) assert.doesNotMatch(c, /logo|roblox|brand/i, c);
  const provenance = readFileSync(join(ICONS, 'PROVENANCE.md'), 'utf8');
  assert.match(provenance, /Roblox Corporation/);
  assert.match(provenance, /[Nn]ever the Roblox logo/);
});

test('every mapped tool and op exists, and every mapped class has a cell', () => {
  const tools = Object.keys(model.TOOL_CLASS);
  const ops = Object.keys(model.OP_CLASS);
  assert.ok(tools.length > 20 && ops.length > 10, 'the maps are nearly empty');
  assert.deepEqual(tools.filter((t) => !(t in ui.TOOL)), [], 'mapped tools this build does not have');
  assert.deepEqual(ops.filter((k) => !(k in OP_LABEL)), [], 'mapped ops the worker does not write');
  const used = [...Object.values(model.TOOL_CLASS), ...Object.values(model.OP_CLASS)];
  assert.deepEqual(used.filter((c) => model.studioIconIndex(c) === 0), [], 'a mapped class with no cell draws the fallback');
});

test('a step on an object wears that object’s icon; a step on no object keeps its line icon', () => {
  const script = header('edit_script', 'output-available');
  assert.match(script, /class="studio-icon[^"]*"[^>]*data-roblox-class="Script"/);
  assert.match(script, new RegExp(`--studio-icon-i:${CLASSES.indexOf('Script')}\\b`));
  const lighting = header('set_mood', 'input-available');
  assert.match(lighting, /data-roblox-class="Lighting"/);

  for (const tool of ['web_search', 'search_docs', 'remember']) {
    assert.equal(model.classForTool(tool), null, `${tool} touches nothing in the place`);
    const html = header(tool, 'output-available');
    assert.doesNotMatch(html, /studio-icon/, `${tool} must not wear a Roblox object`);
    assert.match(html, /<svg[^>]*ai-tool__icon/, `${tool} keeps a line icon`);
  }
});

test('a finished step draws its tick; a running one does not claim to be finished', () => {
  const done = header('edit_script', 'output-available');
  assert.match(done, /picks-step__tick/);
  assert.match(done, /ai-tool__badge--output-available/);
  const running = header('edit_script', 'input-available');
  assert.doesNotMatch(running, /picks-step__tick/);
  assert.match(running, /ai-tool__badge--input-available/);
});

test('the sprite cell is chosen by the index, at the drawn size, per theme', () => {
  const rule = /\.studio-icon \{([^}]*)\}/.exec(CSS)?.[1] ?? '';
  assert.match(rule, /background-image:url\([^)]*studio-icons-dark\.png/);
  assert.match(rule, /background-size:var\(--studio-icon-size\) auto/);
  assert.match(rule, /background-position:0 calc\(var\(--studio-icon-i[^)]*\) \* var\(--studio-icon-size\) \* -1\)/);
  assert.match(CSS, /:root\[data-theme='light'\] \.studio-icon \{ background-image:url\([^)]*studio-icons-light\.png/);
});

test('motion reads its timing from :root tokens, and every animation is switched off under reduced motion', () => {
  const root = /:root \{([^}]*)\}/.exec(CSS)?.[1] ?? '';
  const used = [...new Set([...CSS.matchAll(/var\((--motion-[\w-]+)/g)].map((m) => m[1]))];
  assert.ok(used.length >= 3, 'the motion rules use no tokens');
  for (const token of used) assert.match(root, new RegExp(`${token}:`), `${token} is used but not declared on :root`);

  // The entrance plays when a step STARTS, not on every row: keyed to the running state.
  assert.match(CSS, /\.ai-tool:has\(\.ai-tool__badge--input-available\) > \.ai-tool__header \{\s*animation:studio-row-in/);

  const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? '';
  const animated = [...CSS.replace(/@media[\s\S]*$/, '').matchAll(/([^{}]+)\{[^}]*\banimation:/g)]
    .map((m) => m[1].trim()).filter((s) => !s.startsWith('@keyframes') && !/^(from|to|\d)/.test(s));
  assert.ok(animated.length >= 2, `found ${animated.length} animated rule(s)`);
  for (const selector of animated) {
    const first = selector.split(',')[0].trim();
    assert.ok(reduced.includes(first), `${first} animates and is not stopped under reduced motion`);
  }
  assert.match(reduced, /animation:none/);
});

test('the welcome cards lift under the pointer, and not under reduced motion', () => {
  assert.match(CSS, /\.start-sheet__ideas > button:hover:not\(:disabled\)[^{]*\{[^}]*translate:0 var\(--motion-lift\)/);
  const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? '';
  assert.match(reduced, /start-sheet__ideas > button:hover[^{]*\{ translate:none/);
});

test('the Studio op rows wear the icon of what the op acted on', () => {
  for (const file of ['components/ws/studio-activity.tsx', 'components/pairing-dialog.tsx']) {
    const src = decomment(readFileSync(join(SRC, file), 'utf8'));
    assert.match(src, /<StudioIcon\b[^>]*robloxClass=\{classForOp\(\s*\w+\.kind\s*\)\}/, file);
  }
  assert.equal(model.classForOp('edit_script'), 'Script');
  assert.equal(model.classForOp('ping'), null, 'a ping acts on no object');
});

test('the stylesheet and the strips ship with the component', () => {
  const component = readFileSync(join(SRC, 'components/studio-icon.tsx'), 'utf8');
  assert.match(component, /import '\.\/studio-icon\.css'/);
  for (const theme of ['dark', 'light']) assert.ok(existsSync(join(ICONS, `studio-icons-${theme}.png`)));
});
