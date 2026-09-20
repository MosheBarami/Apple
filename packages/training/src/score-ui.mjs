#!/usr/bin/env node
/**
 * SCORE GENERATED ROBLOX UI BY BUILDING IT AND MEASURING THE RECTANGLES.
 *
 * THE DEFECT THIS ANSWERS. The only UI suite this repository had, `packages/evals/tasks/
 * ui-implementation.json`, scores with `contains` and `regex`. Those checks read the VOCABULARY of
 * an answer. Every interesting way to get Roblox UI wrong uses the right vocabulary:
 *
 *   - a UIAspectRatioConstraint created, configured, and never given a Parent
 *   - AnchorPoint set to (0, 0) beside Position UDim2.fromScale(0.5, 1), which renders a bottom bar
 *     entirely below the screen
 *   - Size in offsets, so the panel is a postage stamp on a phone and a wall on a monitor
 *   - a ScreenGui with IgnoreGuiInset = true holding the buttons, i.e. under the topbar on mobile
 *
 * A regex passes all four. So this module does not grade the text. It runs the Luau under
 * `ui-harness.luau`, takes the instance tree that came out, resolves that tree to absolute
 * rectangles at several viewport sizes with Roblox's own layout arithmetic, and asks geometric
 * questions: is the panel's centre the container's centre, is the bar's bottom edge on screen, is
 * the tile's aspect ratio the same on a phone as on a monitor.
 *
 * WHAT A FAILURE HERE IS AND IS NOT. Four outcomes are kept separate on purpose, because three of
 * them are not "the model is bad at UI":
 *
 *   no_code_block      the answer was prose. A formatting failure.
 *   does_not_compile   luau-compile rejected it. A syntax failure.
 *   runtime_error      the chunk threw. THE MESSAGE IS ALWAYS REPORTED, because a throw can mean
 *                      the model used an API this shim does not implement — which is my gap, not
 *                      the model's mistake, and must not be counted as one without a person
 *                      reading the sentence.
 *   checks             the build ran and the geometry was measured. Only here does a number mean
 *                      something about the model's UI ability.
 *
 * THE VIEWPORTS ARE THE POINT. One size proves nothing: a panel sized in pixels is "correct" at
 * exactly the size it was written for. Everything is resolved at 1920x1080, 1366x768 and 390x844,
 * and a responsiveness check is a statement about the DIFFERENCE between them.
 *
 * WHAT IS DELIBERATELY NOT MODELLED, so nothing here is read as more than it is:
 *   - The ScreenGui's rect is taken as the whole viewport. Real safe-area insets shrink it by an
 *     amount that depends on the device, and inventing those numbers would make every centring
 *     check depend on my guess. Descendants lay out inside the ScreenGui rect in Roblox too, so
 *     centring and containment are unaffected; safe-area is scored as a PROPERTY of the ScreenGui
 *     instead, where the engine's own rule is written down rather than estimated.
 *   - AutomaticSize, TextBounds and text wrapping. A frame that sizes itself from its text cannot
 *     be resolved without a font metric, so `AutomaticSize ~= None` is reported on a node and the
 *     size checks on that node are SKIPPED rather than guessed — a skipped check is recorded as
 *     skipped, never as a pass.
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeLuau, blankStringContents, stripComments } from '../../evals/src/roblox-antipatterns.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(HERE, 'ui-harness.luau');
const TREE_MARKER = '__APPLE_UI_TREE__';

/** The screens the build is resolved on. Desktop, the commonest laptop, and a notched phone. */
export const VIEWPORTS = Object.freeze([
  { id: 'desktop', w: 1920, h: 1080 },
  { id: 'laptop', w: 1366, h: 768 },
  { id: 'phone', w: 390, h: 844 },
]);

/** Pull the first fenced Luau block, or null. Duplicated from score-eval.mjs's `fencedLuau` on
 *  purpose: importing that module pulls in the whole game-logic curriculum and a Luau bundler. */
export function fencedLuau(answer) {
  const m = /```(?:luau|lua)?\s*\n([\s\S]*?)```/.exec(String(answer ?? ''));
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------------------------
// Deprecation, read off the engine reference rather than remembered.
//
// Every entry below carries the file in Roblox/creator-docs that marks it deprecated, so the list
// can be re-derived instead of argued about. Members whose yaml has an EMPTY deprecation_message
// and no Deprecated tag are NOT here, however old-fashioned they look — `TextLabel.Font` is tagged
// Hidden and NotReplicated and superseded by FontFace, but the engine does not call it deprecated,
// so it is reported separately as `legacy` and costs nothing.
// ---------------------------------------------------------------------------------------------

export const DEPRECATED_MEMBERS = Object.freeze([
  { pattern: /\.FontSize\b/g, name: 'FontSize', use: 'TextSize', source: 'classes/TextLabel.yaml' },
  { pattern: /\.TextColor\b(?!3)/g, name: 'TextColor', use: 'TextColor3', source: 'classes/TextLabel.yaml' },
  { pattern: /\.TextWrap\b(?!ped)/g, name: 'TextWrap', use: 'TextWrapped', source: 'classes/TextLabel.yaml' },
  { pattern: /\.BackgroundColor\b(?!3)/g, name: 'BackgroundColor', use: 'BackgroundColor3', source: 'classes/GuiObject.yaml' },
  { pattern: /\.BorderColor\b(?!3)/g, name: 'BorderColor', use: 'BorderColor3', source: 'classes/GuiObject.yaml' },
  { pattern: /\.Draggable\b/g, name: 'Draggable', use: 'UIDragDetector', source: 'classes/GuiObject.yaml' },
  { pattern: /:TweenPosition\s*\(/g, name: 'TweenPosition', use: 'TweenService:Create', source: 'classes/GuiObject.yaml' },
  { pattern: /:TweenSizeAndPosition\s*\(/g, name: 'TweenSizeAndPosition', use: 'TweenService:Create', source: 'classes/GuiObject.yaml' },
  { pattern: /:TweenSize\s*\(/g, name: 'TweenSize', use: 'TweenService:Create', source: 'classes/GuiObject.yaml' },
  { pattern: /:Localize\s*\(|\.Localize\b/g, name: 'Localize', use: 'AutoLocalize', source: 'classes/GuiBase2d.yaml' },
]);

export const LEGACY_MEMBERS = Object.freeze([
  { pattern: /\.Font\s*=(?!\s*Font\.)/g, name: 'Font', use: 'FontFace = Font.new(...)', note: 'Hidden + NotReplicated in the reference; superseded, not deprecated' },
]);

/**
 * Deprecated API use, as a list of findings.
 *
 * The GLOBALS half is delegated to `analyzeLuau`'s `deprecated-api` rule so `wait`/`spawn`/`delay`
 * are judged by the same code the rest of the repository judges them by, including its careful
 * decision to blank string contents first. The MEMBERS half is this file's, because no existing
 * rule covers deprecated GUI properties at all.
 */
export function deprecatedApis(source) {
  const findings = [];
  const analysis = analyzeLuau(String(source ?? ''), { rules: ['deprecated-api'] });
  for (const f of analysis.findings ?? []) findings.push({ kind: 'global', detail: f.detail, line: f.line });
  const src = blankStringContents(stripComments(String(source ?? '')));
  for (const m of DEPRECATED_MEMBERS) {
    m.pattern.lastIndex = 0;
    if (m.pattern.test(src)) findings.push({ kind: 'member', detail: `${m.name} is deprecated — use ${m.use}`, source: m.source });
  }
  return findings;
}

export function legacyApis(source) {
  const src = blankStringContents(stripComments(String(source ?? '')));
  const out = [];
  for (const m of LEGACY_MEMBERS) {
    m.pattern.lastIndex = 0;
    if (m.pattern.test(src)) out.push({ detail: `${m.name} — prefer ${m.use}`, note: m.note });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Build: run the model's Luau under the shim and take the tree.
// ---------------------------------------------------------------------------------------------

/**
 * @returns {{ran:false, reason:string} | {ran:true, compiled:false, detail:string}
 *          | {ran:true, compiled:true, status:'ok'|'loop'|'error', detail:string, nodes:Array}}
 */
export function buildUiTree(source, { binary = 'luau', compiler = 'luau-compile', timeoutMs = 10_000 } = {}) {
  const harness = readFileSync(HARNESS, 'utf8').replace('return { emit = emit, LOOP_MARKER = LOOP_MARKER }', '');
  const program = `${harness}
local __ok, __err = pcall(function()
${source}
end)
if __ok then emit("ok", "")
elseif tostring(__err):find(LOOP_MARKER, 1, true) then emit("loop", "reached its update loop")
else emit("error", tostring(__err)) end
`;
  const dir = mkdtempSync(join(tmpdir(), 'golem-ui-'));
  try {
    const file = join(dir, 'build.luau');
    writeFileSync(file, program);

    // COMPILE FIRST, BECAUSE `luau` EXITS 1 FOR BOTH — the same boundary runSpecCase keeps in
    // tool-trajectory-verify.mjs. A syntax error and a thrown build are not the same finding, and
    // reporting one as the other is the observation failure this repository names.
    const compiled = spawnSync(compiler, ['--null', file], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    if (compiled.error) return { ran: false, reason: compiled.error.code === 'ENOENT' ? `no ${compiler} binary` : compiled.error.message };
    if (compiled.status !== 0) {
      return { ran: true, compiled: false, detail: (String(compiled.stderr).trim() || 'no output').split('\n')[0].slice(0, 300) };
    }

    const run = spawnSync(binary, [file], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
    if (run.error) return { ran: false, reason: run.error.code === 'ENOENT' ? `no ${binary} binary` : run.error.message };
    if (run.status === null) return { ran: false, reason: 'timed out' };
    const out = String(run.stdout);
    const at = out.indexOf(TREE_MARKER);
    if (at === -1) {
      return { ran: false, reason: `harness printed no tree (${(String(run.stderr).trim() || out.trim() || 'no output').split('\n')[0].slice(0, 200)})` };
    }
    let parsed;
    try {
      parsed = JSON.parse(out.slice(at + TREE_MARKER.length).trim());
    } catch (e) {
      return { ran: false, reason: `harness tree did not parse: ${e.message}` };
    }
    return {
      ran: true, compiled: true, status: parsed.status, detail: parsed.detail,
      absoluteReads: parsed.absoluteReads ?? 0,
      rendererReads: parsed.rendererReads ?? {},
      nodes: parsed.nodes,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// The tree, and Roblox's layout arithmetic over it.
// ---------------------------------------------------------------------------------------------

const GUI_OBJECTS = new Set([
  'Frame', 'TextLabel', 'TextButton', 'TextBox', 'ImageLabel', 'ImageButton',
  'ScrollingFrame', 'ViewportFrame', 'CanvasGroup', 'VideoFrame',
]);

export const isGuiObject = (node) => GUI_OBJECTS.has(node.class);

/** Index the flat node list into a navigable tree. Destroyed nodes are dropped: they are not on
 *  screen, and counting them would let a model pass by creating and then deleting the right thing. */
export function indexTree(nodes) {
  const byId = new Map();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });
  const roots = [];
  for (const n of byId.values()) {
    const p = n.parent == null ? null : byId.get(n.parent);
    if (p) p.children.push(n); else roots.push(n);
  }
  const alive = (n) => {
    if (n.destroyed) return null;
    const copy = { ...n, children: [] };
    for (const c of n.children) {
      const k = alive(c);
      if (k) { k.parentNode = copy; copy.children.push(k); }
    }
    return copy;
  };
  return { roots: roots.map(alive).filter(Boolean), byId };
}

const prop = (node, name) => node.props?.[name];
const num = (node, name, fallback = 0) => {
  const v = prop(node, name);
  return v && v.k === 'num' ? v.v : fallback;
};
const udim2 = (node, name) => {
  const v = prop(node, name);
  return v && v.k === 'UDim2' ? { xs: v.xs, xo: v.xo, ys: v.ys, yo: v.yo } : { xs: 0, xo: 0, ys: 0, yo: 0 };
};
const udim = (v, fallback = { s: 0, o: 0 }) => (v && v.k === 'UDim' ? { s: v.s, o: v.o } : fallback);
const vec2 = (node, name, fallback = { x: 0, y: 0 }) => {
  const v = prop(node, name);
  return v && v.k === 'Vector2' ? { x: v.x, y: v.y } : fallback;
};
export const enumName = (node, name) => {
  const v = prop(node, name);
  return v && v.k === 'Enum' ? v.n : null;
};
const boolOf = (node, name, fallback = false) => {
  const v = prop(node, name);
  return v && v.k === 'bool' ? v.v : fallback;
};
export const nameOf = (node) => (prop(node, 'Name')?.v ?? node.class);

const childOfClass = (node, cls) => node.children.find((c) => c.class === cls) ?? null;

/** Every GuiObject anywhere under `node`, in tree order. */
export function guiDescendants(node, out = []) {
  for (const c of node.children) {
    if (isGuiObject(c)) out.push(c);
    guiDescendants(c, out);
  }
  return out;
}

export function descendants(node, out = []) {
  for (const c of node.children) { out.push(c); descendants(c, out); }
  return out;
}

/**
 * Apply a UIAspectRatioConstraint to a computed box.
 *
 * Modelled from `ui/size-modifiers.md`, which states two things this arithmetic has to honour:
 * the constraint "enforces a width-to-height aspect ratio on a GuiObject REGARDLESS OF ITS CORE
 * SIZE, even if that size is set as a percentage of its parent", and "when a UI object is under
 * control of both a layout structure such as a UIListLayout and a UIAspectRatioConstraint, the
 * constraint will OVERRIDE the layout and control the object's size".
 *
 * So the dominant axis is kept and the other is derived from it — it is not a clamp. A zero on the
 * non-dominant axis is therefore an UNSET dimension, not a maximum of zero: `CellSize =
 * UDim2.new(0.3, 0, 0, 0)` beside a 1:1 constraint is the ordinary way to build a grid of square
 * tiles, and clamping against that zero collapsed every such tile to nothing. Only a non-zero
 * original bounds the result, and only under FitWithinMaxSize, whose summary is "the maximum size
 * possible within its own AbsoluteSize".
 */
function applyAspect(node, size, parentSize) {
  const c = childOfClass(node, 'UIAspectRatioConstraint');
  if (!c) return { size, constrained: false };
  const ratio = num(c, 'AspectRatio', 1) || 1;
  const type = enumName(c, 'AspectType') ?? 'FitWithinMaxSize';
  const axis = enumName(c, 'DominantAxis') ?? 'Width';
  const box = type === 'ScaleWithParentSize' ? { x: parentSize.x, y: parentSize.y } : { x: size.x, y: size.y };
  let w;
  let h;
  if (axis === 'Height') { h = box.y; w = h * ratio; } else { w = box.x; h = w / ratio; }
  if (box.x > 0 && w > box.x) { w = box.x; h = w / ratio; }
  if (box.y > 0 && h > box.y) { h = box.y; w = h * ratio; }
  return { size: { x: w, y: h }, constrained: true };
}

function applySizeConstraint(node, size) {
  const c = childOfClass(node, 'UISizeConstraint');
  if (!c) return size;
  const min = vec2(c, 'MinSize', { x: 0, y: 0 });
  const max = vec2(c, 'MaxSize', { x: Infinity, y: Infinity });
  return {
    x: Math.min(Math.max(size.x, min.x), max.x === 0 ? Infinity : max.x),
    y: Math.min(Math.max(size.y, min.y), max.y === 0 ? Infinity : max.y),
  };
}

/** The rect a parent offers its children, after UIPadding. */
function contentRect(node, rect) {
  const p = childOfClass(node, 'UIPadding');
  if (!p) return rect;
  const l = udim(prop(p, 'PaddingLeft'));
  const r = udim(prop(p, 'PaddingRight'));
  const t = udim(prop(p, 'PaddingTop'));
  const b = udim(prop(p, 'PaddingBottom'));
  const px = (u, basis) => u.s * basis + u.o;
  return {
    x: rect.x + px(l, rect.w),
    y: rect.y + px(t, rect.h),
    w: Math.max(0, rect.w - px(l, rect.w) - px(r, rect.w)),
    h: Math.max(0, rect.h - px(t, rect.h) - px(b, rect.h)),
  };
}

function sortedLayoutChildren(node, layout) {
  const kids = node.children.filter(isGuiObject).filter((c) => boolOf(c, 'Visible', true));
  const order = enumName(layout, 'SortOrder') ?? 'LayoutOrder';
  if (order === 'Name') return [...kids].sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b))));
  return [...kids].sort((a, b) => num(a, 'LayoutOrder', 0) - num(b, 'LayoutOrder', 0));
}

/**
 * Resolve every GuiObject to an absolute rectangle at one viewport size.
 *
 * `skipped` collects nodes whose size cannot be resolved without a text metric (AutomaticSize), so
 * a check over them can say "not measured" rather than pass or fail on a guess.
 */
export function resolveLayout(root, viewport) {
  const rects = new Map();
  const skipped = new Set();

  const place = (node, rect) => {
    rects.set(node.id, rect);
    const inner = contentRect(node, rect);
    const list = childOfClass(node, 'UIListLayout');
    const grid = childOfClass(node, 'UIGridLayout');

    const sizeOf = (child) => {
      const s = udim2(child, 'Size');
      let size = { x: s.xs * inner.w + s.xo, y: s.ys * inner.h + s.yo };
      size = applySizeConstraint(child, size);
      size = applyAspect(child, size, { x: inner.w, y: inner.h }).size;
      if ((enumName(child, 'AutomaticSize') ?? 'None') !== 'None') skipped.add(child.id);
      return size;
    };

    if (list) {
      const vertical = (enumName(list, 'FillDirection') ?? 'Vertical') === 'Vertical';
      const pad = udim(prop(list, 'Padding'));
      const padPx = pad.s * (vertical ? inner.h : inner.w) + pad.o;
      const kids = sortedLayoutChildren(node, list);
      const sizes = kids.map(sizeOf);
      const total = sizes.reduce((a, s) => a + (vertical ? s.y : s.x), 0) + padPx * Math.max(0, kids.length - 1);
      const hAlign = enumName(list, 'HorizontalAlignment') ?? 'Left';
      const vAlign = enumName(list, 'VerticalAlignment') ?? 'Top';
      let cursor = vertical
        ? (vAlign === 'Center' ? inner.y + (inner.h - total) / 2 : vAlign === 'Bottom' ? inner.y + inner.h - total : inner.y)
        : (hAlign === 'Center' ? inner.x + (inner.w - total) / 2 : hAlign === 'Right' ? inner.x + inner.w - total : inner.x);
      kids.forEach((child, i) => {
        const size = sizes[i];
        const cross = vertical
          ? (hAlign === 'Center' ? inner.x + (inner.w - size.x) / 2 : hAlign === 'Right' ? inner.x + inner.w - size.x : inner.x)
          : (vAlign === 'Center' ? inner.y + (inner.h - size.y) / 2 : vAlign === 'Bottom' ? inner.y + inner.h - size.y : inner.y);
        const r = vertical
          ? { x: cross, y: cursor, w: size.x, h: size.y }
          : { x: cursor, y: cross, w: size.x, h: size.y };
        cursor += (vertical ? size.y : size.x) + padPx;
        place(child, r);
      });
      return;
    }

    if (grid) {
      const cell = udim2(grid, 'CellSize');
      const gap = udim2(grid, 'CellPadding');
      const cw = cell.xs * inner.w + cell.xo;
      const ch = cell.ys * inner.h + cell.yo;
      const gx = gap.xs * inner.w + gap.xo;
      const gy = gap.ys * inner.h + gap.yo;
      const perRow = Math.max(1, Math.floor((inner.w + gx) / Math.max(1, cw + gx)));
      sortedLayoutChildren(node, grid).forEach((child, i) => {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        let size = applyAspect(child, { x: cw, y: ch }, { x: cw, y: ch }).size;
        size = applySizeConstraint(child, size);
        place(child, { x: inner.x + col * (cw + gx), y: inner.y + row * (ch + gy), w: size.x, h: size.y });
      });
      return;
    }

    for (const child of node.children) {
      if (!isGuiObject(child)) continue;
      const size = sizeOf(child);
      const p = udim2(child, 'Position');
      const anchor = vec2(child, 'AnchorPoint');
      place(child, {
        x: inner.x + p.xs * inner.w + p.xo - anchor.x * size.x,
        y: inner.y + p.ys * inner.h + p.yo - anchor.y * size.y,
        w: size.x,
        h: size.y,
      });
    }
  };

  place(root, { x: 0, y: 0, w: viewport.w, h: viewport.h });
  return { rects, skipped };
}

/** Every ScreenGui under a PlayerGui, which is the only place a LocalScript's UI is visible. */
export function screenGuisInPlayerGui(tree) {
  const out = [];
  const walk = (node, inPlayerGui) => {
    const here = inPlayerGui || node.class === 'PlayerGui';
    if (here && node.class === 'ScreenGui') out.push(node);
    for (const c of node.children) walk(c, here);
  };
  for (const r of tree.roots) walk(r, false);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

export const PASS = (detail = '') => ({ ok: true, detail });
export const FAIL = (detail) => ({ ok: false, detail });
/** NOT A PASS. A check that could not look at anything says so and is counted separately. */
export const SKIP = (detail) => ({ ok: false, skipped: true, detail });

const pct = (n) => `${Math.round(n * 100)}%`;

/** Rect helpers shared by the task checks. */
export const rectOf = (frames, viewportId, node) => frames[viewportId].rects.get(node.id) ?? null;
export const centerOf = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * The pixels a player actually sees for this element: its own rect unioned with every GuiObject
 * under it, ignoring zero-area nodes.
 *
 * WHY THIS AND NOT THE NODE'S OWN RECT. A real answer built its coin counter as a ZERO-SIZE Frame
 * positioned in the corner, with the sized button inside it — a positioning anchor, which is
 * ordinary Roblox practice and renders exactly right. Asking "is that Frame on screen" got "it has
 * zero area", and a correct build was recorded as a failure. "Visible on screen" is a question
 * about the rendered extent, so that is what is measured.
 */
export function visibleExtent(ctx, viewportId, node) {
  const rects = ctx.frames[viewportId].rects;
  const parts = [node, ...guiDescendants(node)]
    .map((n) => rects.get(n.id))
    .filter((r) => r && r.w > 0 && r.h > 0);
  if (!parts.length) return null;
  const x = Math.min(...parts.map((r) => r.x));
  const y = Math.min(...parts.map((r) => r.y));
  const right = Math.max(...parts.map((r) => r.x + r.w));
  const bottom = Math.max(...parts.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * Run one task's checks against one answer.
 *
 * @param task   {{id, family, prompt, checks: Array<{id, run(ctx): {ok, detail, skipped?}}>}}
 * @param answer the model's raw reply
 */
export function scoreUiTask(task, answer, opts = {}) {
  const source = fencedLuau(answer);
  if (!source) return { ok: false, stage: 'format', reason: 'no_code_block', checks: [] };

  const built = buildUiTree(source, opts);
  if (!built.ran) return { ok: false, stage: 'harness', reason: `harness_unavailable:${built.reason}`, checks: [] };
  if (!built.compiled) return { ok: false, stage: 'compile', reason: 'does_not_compile', detail: built.detail, checks: [] };
  if (built.status === 'error') {
    // Always carries the message. See the header: this outcome can be my gap rather than the model's.
    return { ok: false, stage: 'run', reason: 'runtime_error', detail: built.detail, checks: [] };
  }

  const tree = indexTree(built.nodes);
  const guis = screenGuisInPlayerGui(tree);
  const frames = {};
  for (const v of VIEWPORTS) {
    frames[v.id] = guis.length ? resolveLayout(guis[0], v) : { rects: new Map(), skipped: new Set() };
  }

  const ctx = { source, tree, guis, gui: guis[0] ?? null, frames, viewports: VIEWPORTS, reachedLoop: built.status === 'loop' };

  //[[ A BUILD THAT MEASURES ITSELF CANNOT BE MEASURED HERE, AND THAT IS NOT A VERDICT ON IT.
  //
  //   `scroll.AbsoluteSize.X` is decided by the renderer after a frame. Nothing in this process
  //   has it; the rectangles are computed afterwards, in JavaScript, from the tree. So a build that
  //   sets its grid cells from AbsoluteSize produces a tree whose sizes are zero HERE and correct
  //   in Roblox, and every geometric check over it would be measuring the harness.
  //
  //   The engine's own answer to this requirement is declarative — a UIAspectRatioConstraint keeps
  //   a tile square with no measurement at all — so reaching for AbsoluteSize is worth REPORTING.
  //   It is not worth failing, because this harness cannot tell a fragile-but-working build from a
  //   broken one. Geometry is skipped with the reason attached, structure is still scored, and the
  //   run counts these rows separately instead of folding them into a pass rate.
  const runtimeMeasured = Number(built.absoluteReads ?? 0) > 0;
  const GEOMETRIC = new Set([
    'centered', 'on_screen', 'aspect_stable', 'scales_with_screen', 'stacked', 'children_contained',
    'full_bleed', 'sits_on_bottom_edge', 'tiles_are_square', 'in_top_right',
  ]);

  const checks = task.checks.map((c) => {
    let r;
    if (runtimeMeasured && GEOMETRIC.has(c.id)) {
      const asked = Object.entries(built.rendererReads ?? {}).map(([k, v]) => `${k}x${v}`).join(', ') || `${built.absoluteReads} reads`;
      r = SKIP(`the build computes its layout from values only the renderer has (${asked}) — this harness has none of them, so nothing was measured`);
    } else {
      try { r = c.run(ctx); } catch (e) { r = SKIP(`check threw: ${e.message}`); }
    }
    return { id: c.id, ok: r.ok === true, skipped: r.skipped === true, detail: r.detail ?? '' };
  });

  const failed = checks.filter((c) => !c.ok && !c.skipped);
  const skipped = checks.filter((c) => c.skipped);
  return {
    ok: checks.every((c) => c.ok),
    /** True when every check that did not pass was one nobody could look at. */
    unmeasurable: skipped.length > 0 && failed.length === 0,
    runtimeMeasuredLayout: runtimeMeasured,
    rendererReads: built.rendererReads ?? {},
    stage: 'checks',
    reason: checks.every((c) => c.ok)
      ? null
      : failed.length ? failed.map((c) => c.id).join('+') : `unmeasurable:${skipped.map((c) => c.id).join('+')}`,
    checks,
    nodeCount: built.nodes.length,
    guiObjects: guis.length ? guiDescendants(guis[0]).length : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Reusable check builders, so a task declares what it wants rather than how to measure it.
// ---------------------------------------------------------------------------------------------

export const check = {
  /** Exactly one ScreenGui, parented into PlayerGui. */
  screenGui: () => ({
    id: 'screen_gui',
    run: ({ guis }) => (guis.length === 0
      ? FAIL('no ScreenGui reached PlayerGui')
      : guis.length > 1 ? FAIL(`${guis.length} ScreenGuis in PlayerGui`) : PASS()),
  }),

  /** An instance of this class exists under the ScreenGui — created AND parented. */
  has: (cls, min = 1) => ({
    id: `has_${cls}`,
    run: ({ gui }) => {
      if (!gui) return SKIP('no ScreenGui to look in');
      const n = descendants(gui).filter((d) => d.class === cls).length;
      return n >= min ? PASS(`${n}`) : FAIL(`found ${n}, needed ${min}`);
    },
  }),

  /** `cls` must be a DIRECT child of a node of class `parentCls`. Catches the classic
   *  "constraint created, configured, never parented" and "parented to the ScreenGui instead". */
  parentedUnder: (cls, parentCls) => ({
    id: `${cls}_under_${parentCls}`,
    run: ({ gui, tree }) => {
      if (!gui) return SKIP('no ScreenGui to look in');
      const all = descendants(tree.roots[0] ?? gui).filter((d) => d.class === cls);
      if (!all.length) return FAIL(`no ${cls} anywhere`);
      const good = descendants(gui).filter((d) => d.class === cls && d.parentNode?.class === parentCls);
      return good.length ? PASS() : FAIL(`${all.length} ${cls} exist but none is a child of a ${parentCls}`);
    },
  }),

  noDeprecated: () => ({
    id: 'no_deprecated_api',
    run: ({ source }) => {
      const found = deprecatedApis(source);
      return found.length ? FAIL(found.map((f) => f.detail).join('; ')) : PASS();
    },
  }),

  /** The centre of `select(ctx)` sits at the centre of the ScreenGui, at EVERY viewport. */
  centered: (select, tol = 0.02) => ({
    id: 'centered',
    run: (ctx) => {
      const node = select(ctx);
      if (!node) return FAIL('the element to centre was not built');
      const bad = [];
      for (const v of ctx.viewports) {
        //[[ THE NODE'S OWN RECT, AND NOT THE RENDERED EXTENT. `onScreen` USES THE EXTENT; THIS
        //   MUST NOT, AND THE DIFFERENCE WAS MEASURED RATHER THAN REASONED ABOUT.
        //
        //   Switching this to visibleExtent looked like consistency and flipped a passing
        //   shop-grid build to failing: a ScrollingFrame's CONTENT legitimately overflows the
        //   panel — that is what scrolling is — so the extent of its descendants is not where the
        //   panel is. "Is the panel centred" is a question about the panel's own box. The
        //   zero-size-anchor case that made `onScreen` use the extent does not arise here, because
        //   every task that checks centring asks for a panel with a size.
        const r = rectOf(ctx.frames, v.id, node);
        if (!r) return SKIP(`no rect at ${v.id}`);
        if (ctx.frames[v.id].skipped.has(node.id)) return SKIP('AutomaticSize — size not resolvable here');
        const c = centerOf(r);
        const dx = Math.abs(c.x - v.w / 2) / v.w;
        const dy = Math.abs(c.y - v.h / 2) / v.h;
        if (dx > tol || dy > tol) bad.push(`${v.id} off by ${pct(dx)}x/${pct(dy)}y`);
      }
      return bad.length ? FAIL(bad.join(', ')) : PASS();
    },
  }),

  /** Fully on screen at every viewport. A bar anchored to an edge with the default AnchorPoint
   *  fails here and nowhere else. */
  onScreen: (select, label = 'element') => ({
    id: 'on_screen',
    run: (ctx) => {
      const node = select(ctx);
      if (!node) return FAIL(`${label} was not built`);
      const bad = [];
      for (const v of ctx.viewports) {
        const r = visibleExtent(ctx, v.id, node);
        if (!r) return FAIL(`${label} renders nothing at ${v.id} — every rectangle under it has zero area`);
        const out = [];
        if (r.x < -0.5) out.push(`${Math.round(-r.x)}px past the left`);
        if (r.y < -0.5) out.push(`${Math.round(-r.y)}px past the top`);
        if (r.x + r.w > v.w + 0.5) out.push(`${Math.round(r.x + r.w - v.w)}px past the right`);
        if (r.y + r.h > v.h + 0.5) out.push(`${Math.round(r.y + r.h - v.h)}px past the bottom`);
        if (out.length) bad.push(`${v.id}: ${out.join(', ')}`);
      }
      return bad.length ? FAIL(bad.join('; ')) : PASS();
    },
  }),

  /** The rendered aspect ratio is the same on a phone as on a monitor. This is what a
   *  UIAspectRatioConstraint is FOR, and it is invisible to a check that looks for the word. */
  aspectStable: (select, tol = 0.02) => ({
    id: 'aspect_stable',
    run: (ctx) => {
      const node = select(ctx);
      if (!node) return FAIL('the element was not built');
      const ratios = [];
      for (const v of ctx.viewports) {
        const r = rectOf(ctx.frames, v.id, node);
        if (!r || r.h <= 0) return FAIL(`no measurable rect at ${v.id}`);
        ratios.push({ id: v.id, r: r.w / r.h });
      }
      const min = Math.min(...ratios.map((x) => x.r));
      const max = Math.max(...ratios.map((x) => x.r));
      return (max - min) / max <= tol
        ? PASS(`${ratios.map((x) => `${x.id} ${x.r.toFixed(2)}`).join(', ')}`)
        : FAIL(`ratio drifts: ${ratios.map((x) => `${x.id} ${x.r.toFixed(2)}`).join(', ')}`);
    },
  }),

  /** The element grows with the screen: its width as a FRACTION of the viewport is stable. A
   *  panel sized in offsets fails, because it is the same pixels on a phone as on a monitor. */
  scalesWithScreen: (select, tol = 0.1) => ({
    id: 'scales_with_screen',
    run: (ctx) => {
      const node = select(ctx);
      if (!node) return FAIL('the element was not built');
      const fr = [];
      for (const v of ctx.viewports) {
        const r = rectOf(ctx.frames, v.id, node);
        if (!r) return SKIP(`no rect at ${v.id}`);
        fr.push({ id: v.id, f: r.w / v.w });
      }
      const min = Math.min(...fr.map((x) => x.f));
      const max = Math.max(...fr.map((x) => x.f));
      return max > 0 && (max - min) / max <= tol
        ? PASS(fr.map((x) => `${x.id} ${pct(x.f)}`).join(', '))
        : FAIL(`width is ${fr.map((x) => `${x.id} ${pct(x.f)}`).join(', ')} of the screen — sized in pixels, not scale`);
    },
  }),

  /**
   * Safe-area handling for a ScreenGui that holds things a player must TAP.
   *
   * The engine's rule, from classes/ScreenGui.yaml: ScreenInsets defaults to CoreUISafeInsets;
   * setting IgnoreGuiInset = true demotes that default to DeviceSafeInsets, which removes the
   * topbar inset and puts interactive UI under the Roblox controls on a phone. So the failure is
   * not "did not mention ScreenInsets" — the default is already correct — it is opting OUT of it.
   */
  interactiveSafeArea: () => ({
    id: 'safe_area_interactive',
    run: ({ gui }) => {
      if (!gui) return SKIP('no ScreenGui');
      const insets = enumName(gui, 'ScreenInsets');
      const ignore = boolOf(gui, 'IgnoreGuiInset', false);
      if (insets === 'None') return FAIL('ScreenInsets = None on a ScreenGui holding interactive UI — it can sit under the topbar and the camera notch');
      if (ignore && (insets === null || insets === 'CoreUISafeInsets')) return FAIL('IgnoreGuiInset = true demotes CoreUISafeInsets to DeviceSafeInsets, so buttons can land under the topbar');
      if (insets === 'DeviceSafeInsets') return FAIL('DeviceSafeInsets clears the camera notch but not the topbar buttons; interactive UI wants CoreUISafeInsets');
      return PASS(insets ?? 'CoreUISafeInsets (default)');
    },
  }),

  /** The opposite case: a full-bleed backdrop is the one thing ScreenInsets = None is FOR. */
  fullBleed: (select) => ({
    id: 'full_bleed',
    run: (ctx) => {
      const node = select(ctx);
      if (!node) return FAIL('the backdrop was not built');
      const insets = enumName(ctx.gui, 'ScreenInsets');
      const bad = [];
      for (const v of ctx.viewports) {
        const r = rectOf(ctx.frames, v.id, node);
        if (!r) return SKIP(`no rect at ${v.id}`);
        const cover = (r.w * r.h) / (v.w * v.h);
        if (cover < 0.98) bad.push(`${v.id} covers ${pct(cover)}`);
      }
      if (bad.length) return FAIL(bad.join(', '));
      if (insets !== 'None') return FAIL(`the backdrop fills its container but ScreenInsets is ${insets ?? 'CoreUISafeInsets (default)'}, so it stops at the topbar instead of bleeding to the edge`);
      return PASS();
    },
  }),

  /** Siblings laid out by a UIListLayout must not overlap and must run in LayoutOrder. */
  stacked: (select, childCls, expected) => ({
    id: 'stacked',
    run: (ctx) => {
      const parent = select(ctx);
      if (!parent) return FAIL('the list container was not built');
      if (!childOfClass(parent, 'UIListLayout')) return FAIL('the container has no UIListLayout child');
      const kids = parent.children.filter((c) => c.class === childCls);
      if (kids.length < expected) return FAIL(`${kids.length} ${childCls} under the list, needed ${expected}`);
      for (const v of ctx.viewports) {
        const rs = kids.map((k) => rectOf(ctx.frames, v.id, k)).filter(Boolean);
        if (rs.length < expected) return SKIP(`only ${rs.length} rects at ${v.id}`);
        for (let i = 1; i < rs.length; i++) {
          if (rs[i].y + 0.5 < rs[i - 1].y + rs[i - 1].h) return FAIL(`at ${v.id}, item ${i + 1} overlaps item ${i}`);
        }
      }
      return PASS(`${kids.length} items, no overlap at any viewport`);
    },
  }),

  /** Every GuiObject stays inside its own parent's box. Catches children that spill out of the
   *  panel they were meant to fill. */
  childrenContained: () => ({
    id: 'children_contained',
    run: (ctx) => {
      if (!ctx.gui) return SKIP('no ScreenGui');
      const bad = [];
      for (const v of ctx.viewports) {
        for (const node of guiDescendants(ctx.gui)) {
          const r = rectOf(ctx.frames, v.id, node);
          const p = node.parentNode ? rectOf(ctx.frames, v.id, node.parentNode) : null;
          if (!r || !p || ctx.frames[v.id].skipped.has(node.id)) continue;
          // A zero-size parent is an ANCHOR, not a container. Its child is meant to stick out of
          // it, and ClipsDescendants is false by default, so nothing is being clipped.
          if (p.w <= 0 || p.h <= 0) continue;
          const slack = 1;
          if (r.x < p.x - slack || r.y < p.y - slack || r.x + r.w > p.x + p.w + slack || r.y + r.h > p.y + p.h + slack) {
            bad.push(`${v.id}: ${nameOf(node)} spills out of ${nameOf(node.parentNode)}`);
          }
        }
      }
      return bad.length ? FAIL([...new Set(bad)].slice(0, 3).join('; ')) : PASS();
    },
  }),

  /** A named property must hold a particular enum item. */
  enumIs: (select, propName, want) => ({
    id: `${propName}_is_${want}`,
    run: (ctx) => {
      const node = select(ctx);
      if (!node) return FAIL('the element was not built');
      const got = enumName(node, propName);
      return got === want ? PASS() : FAIL(`${propName} is ${got ?? '(unset)'}, wanted ${want}`);
    },
  }),
};

/** Selectors a task uses to name the element a check is about. */
export const select = {
  gui: (ctx) => ctx.gui,
  /** The largest GuiObject directly under the ScreenGui, by area on desktop — "the panel". */
  topFrame: (ctx) => {
    if (!ctx.gui) return null;
    const kids = ctx.gui.children.filter(isGuiObject);
    if (!kids.length) return null;
    let best = null;
    let bestArea = -1;
    for (const k of kids) {
      const r = rectOf(ctx.frames, 'desktop', k);
      const area = r ? r.w * r.h : 0;
      if (area > bestArea) { bestArea = area; best = k; }
    }
    return best;
  },
  /** The first descendant whose Name contains `needle`, case-insensitively. */
  named: (needle) => (ctx) => {
    if (!ctx.gui) return null;
    const want = needle.toLowerCase();
    return descendants(ctx.gui).find((d) => String(nameOf(d)).toLowerCase().includes(want)) ?? null;
  },
  /** The first descendant of this class. */
  firstOfClass: (cls) => (ctx) => (ctx.gui ? descendants(ctx.gui).find((d) => d.class === cls) ?? null : null),
  /** The GuiObject that owns a UIListLayout. */
  listContainer: (ctx) => {
    if (!ctx.gui) return null;
    return descendants(ctx.gui).find((d) => isGuiObject(d) && d.children.some((c) => c.class === 'UIListLayout')) ?? null;
  },
  /** The GuiObject that owns a UIGridLayout. */
  gridContainer: (ctx) => {
    if (!ctx.gui) return null;
    return descendants(ctx.gui).find((d) => isGuiObject(d) && d.children.some((c) => c.class === 'UIGridLayout')) ?? null;
  },
};
