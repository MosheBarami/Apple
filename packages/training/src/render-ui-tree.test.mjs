/**
 * THE RENDERER MUST NOT DRAW A SCREEN THE SCRIPT DOES NOT SHOW.
 *
 * These guards exist because the first real showcase run produced a picture that libelled the
 * model. The tycoon shop it generated was correct — `Backdrop.Visible = false`, opened by a click —
 * and the renderer drew the backdrop's descendants anyway, because it checked `Visible` on each
 * node of a flat list instead of up the ancestor chain. The resulting PNG showed a shop standing
 * open with its confirm dialog overlapping the product grid, which reads as a layout defect the
 * model never committed.
 *
 * A renderer that invents content is worse than no renderer: the whole point of showing the owner
 * a picture is that the picture is evidence. So the inherited-visibility rule is pinned here, in
 * both directions, along with the two other places this renderer could quietly invent something.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTreeToSvg, surfaceCanvas } from './render-ui-tree.mjs';

/** Build the node shape `indexTree` produces: props in harness form, plus a `parentNode` link. */
function node(id, cls, props, parentNode = null) {
  const n = { id, class: cls, props, children: [], parentNode };
  if (parentNode) parentNode.children.push(n);
  return n;
}
const bool = (v) => ({ k: 'bool', v });
const str = (v) => ({ k: 'str', v });
const color = (r, g, b) => ({ k: 'Color3', r, g, b });

const VIEWPORT = { w: 800, h: 600 };

/** A ScreenGui -> hidden Frame -> child Frame + child TextLabel, the shape that produced the bug. */
function hiddenParentScene() {
  const gui = node(1, 'ScreenGui', { Name: str('Screen') });
  const backdrop = node(2, 'Frame', { Name: str('Backdrop'), Visible: bool(false), BackgroundColor3: color(0, 0, 0) }, gui);
  const sheet = node(3, 'Frame', { Name: str('Sheet'), BackgroundColor3: color(1, 0, 0) }, backdrop);
  const label = node(4, 'TextLabel', { Name: str('Title'), Text: str('SHOP'), TextColor3: color(1, 1, 1), BackgroundTransparency: { k: 'num', v: 1 } }, sheet);
  const rects = new Map([
    [2, { x: 0, y: 0, w: 800, h: 600 }],
    [3, { x: 100, y: 100, w: 400, h: 300 }],
    [4, { x: 120, y: 120, w: 200, h: 40 }],
  ]);
  return { guiNodes: [backdrop, sheet, label], rects };
}

test('a descendant of an invisible frame is not painted', () => {
  const { guiNodes, rects } = hiddenParentScene();
  const out = renderTreeToSvg({ guiNodes, rects, viewport: VIEWPORT });

  assert.equal(out.painted, 0, 'nothing under a Visible=false ancestor may be painted');
  assert.equal(out.textNodes, 0, 'a label inside a hidden panel is not on screen');
  assert.equal(out.hidden, 3, 'all three nodes are hidden: the backdrop itself and the two beneath it');
  assert.ok(!out.svg.includes('SHOP'), 'the hidden title must not reach the SVG');
});

test('forceVisible draws the hidden screen and says how much of it was forced', () => {
  const { guiNodes, rects } = hiddenParentScene();
  const out = renderTreeToSvg({ guiNodes, rects, viewport: VIEWPORT, forceVisible: true });

  assert.equal(out.forcedVisible, 3, 'every hidden node that got drawn must be counted as forced');
  assert.ok(out.svg.includes('SHOP'), 'the forced render is the whole point: the screen becomes visible');
  assert.ok(out.painted > 0, 'the forced render paints');
});

test('a visible subtree is unaffected by the ancestor rule', () => {
  const gui = node(1, 'ScreenGui', { Name: str('Screen') });
  const panel = node(2, 'Frame', { Name: str('Panel'), BackgroundColor3: color(0.2, 0.2, 0.3) }, gui);
  const label = node(3, 'TextLabel', { Name: str('T'), Text: str('READY'), TextColor3: color(1, 1, 1) }, panel);
  const rects = new Map([
    [2, { x: 10, y: 10, w: 200, h: 100 }],
    [3, { x: 20, y: 20, w: 100, h: 30 }],
  ]);
  const out = renderTreeToSvg({ guiNodes: [panel, label], rects, viewport: VIEWPORT });

  assert.equal(out.hidden, 0, 'nothing here is hidden');
  assert.equal(out.painted, 2, 'the panel and the label background both paint');
  assert.ok(out.svg.includes('READY'));
});

test('a ScreenGui with Enabled=false renders nothing', () => {
  const gui = node(1, 'ScreenGui', { Name: str('Screen'), Enabled: bool(false) });
  const panel = node(2, 'Frame', { Name: str('Panel'), BackgroundColor3: color(1, 1, 1) }, gui);
  const rects = new Map([[2, { x: 0, y: 0, w: 100, h: 100 }]]);
  const out = renderTreeToSvg({ guiNodes: [panel], rects, viewport: VIEWPORT });

  assert.equal(out.painted, 0, 'a disabled ScreenGui is not on screen at all');
  assert.equal(out.hidden, 1);
});

/**
 * An ImageLabel names an asset this process has never fetched. Painting anything that LOOKS like
 * artwork there would turn "the model referenced an asset" into "the model produced this artwork".
 */
test('an image is never drawn as artwork, only as a marked reference to its id', () => {
  const gui = node(1, 'ScreenGui', { Name: str('Screen') });
  const img = node(2, 'ImageLabel', { Name: str('Icon'), Image: str('rbxassetid://1234567890'), BackgroundTransparency: { k: 'num', v: 1 } }, gui);
  const rects = new Map([[2, { x: 0, y: 0, w: 200, h: 200 }]]);
  const out = renderTreeToSvg({ guiNodes: [img], rects, viewport: VIEWPORT });

  assert.equal(out.imagePlaceholders, 1, 'the reference must be counted so a caption can disclose it');
  assert.ok(out.svg.includes('rbxassetid://1234567890'), 'the id is printed, so the reference reads as a reference');
  assert.ok(out.svg.includes('url(#apple-unfetched)'), 'it is hatched, not filled with invented art');
  assert.ok(!out.svg.includes('<image'), 'no <image> element may ever be emitted: nothing was fetched');
});

/** A panel positioned off screen is one of the defects the geometry pass exists to catch. */
test('an off-screen node is counted, not quietly dropped', () => {
  const gui = node(1, 'ScreenGui', { Name: str('Screen') });
  const off = node(2, 'Frame', { Name: str('Off'), BackgroundColor3: color(1, 0, 0) }, gui);
  const rects = new Map([[2, { x: -500, y: 0, w: 100, h: 100 }]]);
  const out = renderTreeToSvg({ guiNodes: [off], rects, viewport: VIEWPORT });

  assert.equal(out.offscreen, 1);
  assert.equal(out.painted, 0);
});

/**
 * A UI THAT HANGS ON A WALL IS NOT A FAILED SCREEN.
 *
 * Asked for a tycoon leaderboard, the model built a board beside spawn — a Part carrying a
 * SurfaceGui — which is how a tycoon leaderboard usually works. The showcase looked only under
 * PlayerGui and filed it as `no_screengui_in_playergui`: a true sentence and a false verdict. The
 * canvas of such a UI is its part's face in studs times PixelsPerStud, and which face is `Face`.
 */
const v3 = (x, y, z) => ({ k: 'Vector3', x, y, z });
const enumv = (e, n) => ({ k: 'Enum', e, n });
const num = (v) => ({ k: 'num', v });

test('a SurfaceGui canvas comes from its part face and PixelsPerStud', () => {
  const part = { id: 1, class: 'Part', props: { Size: v3(20, 10, 1) }, children: [] };
  const gui = { id: 2, class: 'SurfaceGui', props: {}, children: [], parentNode: part };
  const canvas = surfaceCanvas(gui, part);

  assert.equal(canvas.face, 'Front', 'the engine default face is Front');
  assert.equal(canvas.w, 1000, '20 studs wide at the default 50 px/stud');
  assert.equal(canvas.h, 500, '10 studs tall');
  assert.equal(canvas.pixelsPerStud, 50);
});

test('the Left and Top faces use the other two dimensions of the part', () => {
  const part = { id: 1, class: 'Part', props: { Size: v3(20, 10, 4) }, children: [] };
  const left = surfaceCanvas({ id: 2, class: 'SurfaceGui', props: { Face: enumv('NormalId', 'Left') }, children: [] }, part);
  assert.equal(left.w, 200, 'a Left face is Z wide');
  assert.equal(left.h, 500, 'and Y tall');

  const top = surfaceCanvas({ id: 3, class: 'SurfaceGui', props: { Face: enumv('NormalId', 'Top') }, children: [] }, part);
  assert.equal(top.w, 1000, 'a Top face is X wide');
  assert.equal(top.h, 200, 'and Z deep');
});

test('PixelsPerStud set by the model is used, not the default', () => {
  const part = { id: 1, class: 'Part', props: { Size: v3(10, 5, 1) }, children: [] };
  const canvas = surfaceCanvas({ id: 2, class: 'SurfaceGui', props: { PixelsPerStud: num(100) }, children: [] }, part);
  assert.equal(canvas.w, 1000);
  assert.equal(canvas.h, 500);
});

test('a surface with no part, or a part with no Size, refuses rather than guessing a canvas', () => {
  assert.equal(surfaceCanvas({ id: 2, class: 'SurfaceGui', props: {}, children: [] }, null), null);
  const sizeless = { id: 1, class: 'Part', props: {}, children: [] };
  assert.equal(surfaceCanvas({ id: 2, class: 'SurfaceGui', props: {}, children: [] }, sizeless), null);
});

test('a TextWrapped label is clipped to its box, because in Roblox it wraps and stays inside', () => {
  const gui = node(1, 'ScreenGui', { Name: str('Screen') });
  const panel = node(2, 'Frame', { Name: str('Detail'), BackgroundColor3: color(0.1, 0.1, 0.12) }, gui);
  const desc = node(
    3,
    'TextLabel',
    { Name: str('Desc'), Text: str('Golden Dropper — a dependable piece of your factory line.'), TextWrapped: bool(true), TextColor3: color(1, 1, 1) },
    panel,
  );
  const rects = new Map([
    [2, { x: 0, y: 0, w: 300, h: 200 }],
    [3, { x: 10, y: 10, w: 120, h: 40 }],
  ]);
  const out = renderTreeToSvg({ guiNodes: [panel, desc], rects, viewport: VIEWPORT });

  assert.equal(out.wrappedText, 1, 'the approximation must be counted so a caption can disclose it');
  assert.ok(out.svg.includes('clipPath id="wrap-3"'), 'the label is clipped to its own rectangle');
  assert.ok(out.svg.includes('clip-path="url(#wrap-3)"'), 'and the text sits inside that clip');
});

test('a label that does NOT wrap is left to overflow, because in Roblox it really does', () => {
  const gui = node(1, 'ScreenGui', { Name: str('Screen') });
  const label = node(2, 'TextLabel', { Name: str('Cash'), Text: str('$1,482,300'), TextColor3: color(0, 1, 0) }, gui);
  const rects = new Map([[2, { x: 0, y: 0, w: 60, h: 20 }]]);
  const out = renderTreeToSvg({ guiNodes: [label], rects, viewport: VIEWPORT });

  assert.equal(out.wrappedText, 0);
  assert.ok(!out.svg.includes('clipPath'), 'clipping an unwrapped label would hide a real overflow defect');
  assert.ok(out.svg.includes('$1,482,300'));
});
