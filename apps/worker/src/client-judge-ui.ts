/**
 * THE SCREEN HALF OF THE CLIENT JUDGE (judge_game): what a player's screen holds, where it sits and how it looks.
 *
 * Everything here is pure: it reads the trees get_tree returns for a ScreenGui (properties as the plugin encodes them, `{t, v}`
 * or plain) and answers questions a paying client would ask about the screen: which buttons are visible at the start, which
 * ones sit on top of each other, whether two menu sets fight for the same edge, whether two screens look like they came from
 * two different games, and which buttons are worth pressing in a play session.
 *
 * The geometry is computed from the authored Position / Size / AnchorPoint, so it is APPROXIMATE for anything a layout object
 * (UIListLayout, UIGridLayout...), AutomaticSize or a script decides: those nodes have no rectangle here and are left out rather
 * than guessed. Every result says what it could not place.
 */

export type Json = Record<string, unknown>;
export const rec = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.slice(0, max) : '');
export const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
export const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);
/**
 * The names in a path the plugin wrote. It writes a name that is not an identifier as ["name"] (with \" and \\ escaped), so
 * `game.StarterGui["Shop Gui"].Buy` is game / StarterGui / Shop Gui / Buy; splitting on dots would cut "Open/Close" and "Pack 1.5" wrong.
 */
export function pathParts(path: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = path.length;
  while (i < n) {
    if (path[i] === '[') {
      const quote = path[i + 1];
      i += 2;
      let name = '';
      while (i < n && path[i] !== quote) {
        if (path[i] === '\\' && i + 1 < n) { i += 1; name += path[i] === 'n' ? '\n' : path[i] === 'r' ? '\r' : path[i] === 't' ? '\t' : path[i]; } else name += path[i];
        i += 1;
      }
      i += 2; // the closing quote and bracket
      out.push(name);
    } else {
      if (path[i] === '.') i += 1;
      let j = i;
      while (j < n && path[j] !== '.' && path[j] !== '[') j += 1;
      out.push(path.slice(i, j));
      i = j;
    }
  }
  return out;
}
/** A path as words a person reads: the leading `game` and the named services are dropped, the names joined by dots. */
export function readable(path: string, ...drop: string[]): string {
  const parts = pathParts(path);
  if (parts[0] === 'game') parts.shift();
  if (parts.length > 1 && drop.includes(parts[0]!)) parts.shift();
  return parts.join('.');
}
export const lastName = (path: string): string => pathParts(path).pop() ?? path;
export const inStarterGui = (path: string): boolean => /^game\.StarterGui[.[]/.test(path);
export const isPathUnder = (path: string, ancestor: string): boolean => path.startsWith(ancestor + '.') || path.startsWith(ancestor + '[');
/** A wire value `{t, v}` or a plain value, as the plain value. */
const wire = (v: unknown): unknown => (v && typeof v === 'object' && !Array.isArray(v) && 't' in (v as Json) ? (v as Json).v : v);

/* -------------------------------------------------------------------------------------------- the tree --- */

export interface GuiNode {
  path: string;
  name: string;
  cls: string;
  props: Json;
  attrs: Json;
  children: GuiNode[];
  parent: GuiNode | null;
  /** The layer collector (ScreenGui, BillboardGui, SurfaceGui) this node sits in, by name. */
  screen: string;
  /** The plugin cut the tree at this node (node or depth limit): what lies below is unknown. */
  cut: boolean;
}

/** One get_tree node (and everything below it) as a GuiNode tree. */
export function guiFrom(raw: unknown, parent: GuiNode | null = null, screen?: string): GuiNode {
  const r = rec(raw);
  const props: Json = {};
  for (const [k, v] of Object.entries(rec(r.props))) props[k] = wire(v);
  const attrs: Json = {};
  for (const [k, v] of Object.entries(rec(r.attributes))) attrs[k] = wire(v);
  const name = str(r.name, 120);
  const cls = str(r.class, 60);
  const layer = LAYERS.has(cls) ? name : screen ?? name;
  const node: GuiNode = { path: str(r.path, 400), name, cls, props, attrs, children: [], parent, screen: layer, cut: r.truncated === true || (num(r.moreChildren) ?? 0) > 0 };
  for (const c of arr(r.children)) node.children.push(guiFrom(c, node, layer));
  return node;
}

/** StudPilot took it out of sight when it built the game (a left-out feature's window that stays because code names it): no player reaches it. */
export function outOfSight(n: GuiNode): boolean {
  for (let a: GuiNode | null = n; a; a = a.parent) if (a.attrs.AppleHidden === true) return true;
  return false;
}

export const LAYERS: ReadonlySet<string> = new Set(['ScreenGui', 'BillboardGui', 'SurfaceGui']);
const BUTTONS = new Set(['TextButton', 'ImageButton']);
const TEXTY = new Set(['TextLabel', 'TextButton', 'TextBox']);
const GUI_OBJECT = new Set(['Frame', 'TextLabel', 'TextButton', 'TextBox', 'ImageLabel', 'ImageButton', 'ScrollingFrame', 'ViewportFrame', 'CanvasGroup', 'VideoFrame']);
const MODIFIER = /^UI[A-Z]/;
const LAYOUT = /^UI(?:List|Grid|Table|Page)Layout$/;

export const isButton = (n: GuiNode): boolean => BUTTONS.has(n.cls);
export const hasText = (n: GuiNode): boolean => TEXTY.has(n.cls);
export const isModifier = (n: GuiNode): boolean => MODIFIER.test(n.cls);
export const textOf = (n: GuiNode): string => (typeof n.props.Text === 'string' ? n.props.Text : '');
export const labelOf = (n: GuiNode): string => textOf(n).trim() || n.name;

export function walk(n: GuiNode, fn: (node: GuiNode) => void): void {
  fn(n);
  for (const c of n.children) walk(c, fn);
}
export function all(n: GuiNode): GuiNode[] {
  const out: GuiNode[] = [];
  walk(n, (x) => out.push(x));
  return out;
}

/** Whether a player can see this node at the start: it and everything above it is visible, its screen is enabled. */
export function shown(n: GuiNode): boolean {
  for (let a: GuiNode | null = n; a; a = a.parent) {
    if (LAYERS.has(a.cls)) return a.props.Enabled !== false;
    if (a.props.Visible === false) return false;
  }
  return true;
}
const related = (a: GuiNode, b: GuiNode): boolean => {
  for (let p: GuiNode | null = a; p; p = p.parent) if (p === b) return true;
  for (let p: GuiNode | null = b; p; p = p.parent) if (p === a) return true;
  return false;
};
/** The child of the layer collector this node sits under (the "widget" it belongs to), or the node itself. */
export function widgetOf(n: GuiNode): GuiNode {
  let cur = n;
  while (cur.parent && !LAYERS.has(cur.parent.cls)) cur = cur.parent;
  return cur;
}
const visibleFill = (n: GuiNode): boolean => (num(n.props.BackgroundTransparency) ?? 0) < 0.95;
const IMAGEY = new Set(['ImageLabel', 'ImageButton', 'ViewportFrame', 'VideoFrame']);
/** Something a player sees: an image, a button, text, or a filled box. A fully transparent frame with nothing in it is not. */
export function hasVisuals(n: GuiNode): boolean {
  return all(n).some((x) => shown(x) && (IMAGEY.has(x.cls) || isButton(x) || (hasText(x) && textOf(x).trim() !== '') || (GUI_OBJECT.has(x.cls) && visibleFill(x))));
}
/** An enabled screen that puts something in front of the player at the start. */
export const showsSomething = (s: GuiNode, hidden: ReadonlySet<GuiNode> = NONE): boolean => s.props.Enabled !== false && s.children.some((c) => GUI_OBJECT.has(c.cls) && shown(c) && !hidden.has(c) && hasVisuals(c));
/** Widgets the player's own screen showed hidden although they were authored visible (a script hid them at the start). */
const NONE: ReadonlySet<GuiNode> = new Set();
export const under = (n: GuiNode, hidden: ReadonlySet<GuiNode>): boolean => {
  if (!hidden.size) return false;
  for (let p: GuiNode | null = n; p; p = p.parent) if (hidden.has(p)) return true;
  return false;
};
export const visibleFillOf = visibleFill;

/* -------------------------------------------------------------------------------------------- geometry --- */

export interface Rect { x: number; y: number; w: number; h: number }
export interface Viewport { id: 'desktop' | 'phone'; w: number; h: number }
/** A desktop window and a phone held sideways: most of Roblox's players are on the second. */
export const VIEWPORTS: readonly Viewport[] = [{ id: 'desktop', w: 1600, h: 900 }, { id: 'phone', w: 844, h: 390 }];
const TOP_INSET = 58;

const quad = (v: unknown): [number, number, number, number] | null => {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  return [v[0] as number, v[1] as number, v[2] as number, v[3] as number];
};
const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0] as number, v[1] as number] : null);

function rectOf(c: GuiNode, pr: Rect): Rect | null {
  if (!GUI_OBJECT.has(c.cls)) return null;
  const size = quad(c.props.Size), pos = quad(c.props.Position);
  if (!size && !pos && c.props.Size === undefined) return null;
  const [sx, ox, sy, oy] = size ?? [0, 0, 0, 0];
  let w = sx * pr.w + ox, h = sy * pr.h + oy;
  const aspect = c.children.find((x) => x.cls === 'UIAspectRatioConstraint');
  const ratio = aspect ? num(aspect.props.AspectRatio) : undefined;
  if (ratio && ratio > 0 && w > 0 && h > 0) { if (w / ratio <= h) h = w / ratio; else w = h * ratio; }
  const scale = c.children.find((x) => x.cls === 'UIScale');
  const k = scale ? num(scale.props.Scale) : undefined;
  if (k && k > 0) { w *= k; h *= k; }
  const [px, pox, py, poy] = pos ?? [0, 0, 0, 0];
  const [ax, ay] = pair(c.props.AnchorPoint) ?? [0, 0];
  return { x: pr.x + px * pr.w + pox - ax * w, y: pr.y + py * pr.h + poy - ay * h, w, h };
}
const automatic = (c: GuiNode): boolean => typeof c.props.AutomaticSize === 'string' && !/\.None$/.test(c.props.AutomaticSize as string);

/** The rectangle of every node the authored numbers place; nodes a layout object, AutomaticSize or a cut tree decides are absent. */
export function layoutRects(layer: GuiNode, vp: Viewport): Map<GuiNode, Rect> {
  const out = new Map<GuiNode, Rect>();
  const inset = layer.props.IgnoreGuiInset === true ? 0 : TOP_INSET;
  const base: Rect = { x: 0, y: inset, w: vp.w, h: vp.h - inset };
  out.set(layer, base);
  const place = (parent: GuiNode, pr: Rect): void => {
    if (parent.children.some((c) => LAYOUT.test(c.cls))) return;
    for (const c of parent.children) {
      if (MODIFIER.test(c.cls) || automatic(c)) continue;
      const r = rectOf(c, pr);
      if (!r) continue;
      out.set(c, r);
      place(c, r);
    }
  };
  place(layer, base);
  return out;
}

const area = (r: Rect): number => Math.max(0, r.w) * Math.max(0, r.h);
const inter = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export interface Placed { node: GuiNode; rect: Rect; kind: 'button' | 'widget'; /** Sits in (or is) a window: a panel that opens and closes, not a piece that stays on the player's screen. */ window: boolean; /** The library game the screen was imported from. */ source?: string }
const WINDOW_SHARE = 0.2;
/** A top-level piece that fills a fifth of the screen with a panel or a picture. Whether it is open is up to the game's scripts, not to its authored Visible. */
export function isWindow(widget: GuiNode, rect: Rect | undefined, vp: Viewport): boolean {
  if (!rect) return false;
  const share = area(rect) / (vp.w * (vp.h - TOP_INSET));
  if (share < WINDOW_SHARE) return false;
  if (visibleFill(widget) || IMAGEY.has(widget.cls)) return true;
  // A see-through container as wide as the whole screen is where the HUD is laid out; a smaller one with things inside is a window
  // whose panel is drawn by its children.
  return share < 0.7 && all(widget).filter((x) => GUI_OBJECT.has(x.cls)).length >= 4;
}
/** The shown buttons and shown top-level widgets of the enabled screens that have a rectangle at this viewport. */
export function placedItems(screens: readonly GuiNode[], vp: Viewport, hidden: ReadonlySet<GuiNode> = NONE): Placed[] {
  const out: Placed[] = [];
  for (const s of screens) {
    if (s.cls !== 'ScreenGui' || s.props.Enabled === false) continue;
    const rects = layoutRects(s, vp);
    const total = vp.w * (vp.h - TOP_INSET);
    const source = typeof s.attrs.AppleLibraryGame === 'string' ? s.attrs.AppleLibraryGame : undefined;
    for (const [node, rect] of rects) {
      if (node === s || rect.w < 4 || rect.h < 4 || !shown(node) || under(node, hidden)) continue;
      const owner = widgetOf(node);
      const window = isWindow(owner, rects.get(owner), vp);
      if (isButton(node) && (node.cls === 'ImageButton' || textOf(node).trim() !== '' || visibleFill(node))) out.push({ node, rect, kind: 'button', window, ...(source ? { source } : {}) });
      else if (node.parent === s && area(rect) < total * 0.5 && rect.w >= 20 && rect.h >= 20 && hasVisuals(node)) out.push({ node, rect, kind: 'widget', window, ...(source ? { source } : {}) });
    }
  }
  return out;
}

/**
 * Pieces that are on the player's screen and take the clicks meant for what is under them: a shown top-level piece that fills at least
 * half the screen and is a button itself or has Active on (a tutorial, a loading cover, a dimmer). A see-through frame without Active
 * lets clicks through, so it is not one.
 */
export function coveringPieces(screens: readonly GuiNode[], hidden: ReadonlySet<GuiNode> = NONE): string[] {
  const vp = VIEWPORTS[0]!;
  const total = vp.w * (vp.h - TOP_INSET);
  const out: string[] = [];
  for (const s of screens) {
    if (s.cls !== 'ScreenGui' || s.props.Enabled === false) continue;
    const rects = layoutRects(s, vp);
    for (const c of s.children) {
      const r = rects.get(c);
      if (!r || !shown(c) || under(c, hidden) || area(r) < total * 0.5 || !(c.props.Active === true || isButton(c))) continue;
      out.push(`${s.name}.${c.name}`);
    }
  }
  return out;
}
export interface Overlap { a: string; b: string; ratio: number; viewport: Viewport['id']; what: 'widgets' | 'buttons' }
/**
 * Pieces of the player's screen that sit on top of each other: two buttons from different widgets that cover a quarter of the
 * smaller one, or two widgets from DIFFERENT screens that cover 30% of the smaller. Worst first.
 */
export function overlaps(screens: readonly GuiNode[], hidden: ReadonlySet<GuiNode> = NONE): Overlap[] {
  const found: Overlap[] = [];
  for (const vp of VIEWPORTS) {
    const items = placedItems(screens, vp, hidden).slice(0, 400);
    // Windows open and close: two of them on the same spot are two windows, not two things fighting for the screen.
    const widgets = items.filter((i) => i.kind === 'widget' && !i.window);
    const covered = new Set<GuiNode>();
    for (let i = 0; i < widgets.length; i++) for (let j = i + 1; j < widgets.length; j++) {
      const a = widgets[i]!, b = widgets[j]!;
      // Two screens of ONE imported game are that game's own design (it opens, closes and stacks them); the defect is two games' pieces.
      if (a.node.screen === b.node.screen || (a.source && a.source === b.source)) continue;
      const ratio = inter(a.rect, b.rect) / Math.max(1, Math.min(area(a.rect), area(b.rect)));
      if (ratio > 0.3) { found.push({ a: a.node.path, b: b.node.path, ratio, viewport: vp.id, what: 'widgets' }); covered.add(a.node); covered.add(b.node); }
    }
    const buttons = items.filter((i) => i.kind === 'button' && !i.window);
    for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
      const a = buttons[i]!, b = buttons[j]!;
      if (related(a.node, b.node) || (a.source && a.source === b.source)) continue;
      const wa = widgetOf(a.node), wb = widgetOf(b.node);
      if (wa === wb || (covered.has(wa) && covered.has(wb))) continue;
      const ratio = inter(a.rect, b.rect) / Math.max(1, Math.min(area(a.rect), area(b.rect)));
      if (ratio > 0.25) found.push({ a: a.node.path, b: b.node.path, ratio, viewport: vp.id, what: 'buttons' });
    }
  }
  // The same pair on both viewports counts once.
  const seen = new Set<string>();
  return found.sort((x, y) => y.ratio - x.ratio).filter((o) => { const k = [o.a, o.b].sort().join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
}

export type Side = 'left' | 'right' | 'top' | 'bottom' | 'centre';
export interface MenuCluster { screen: string; path: string; buttons: string[]; side: Side; /** The library game the screen came from (AppleLibraryGame), when it was imported. */ source?: string }
/**
 * A set of side-menu buttons: a small container (under a third of the screen) near the top of a screen holding three or more
 * short-labelled buttons, on one edge; or three or more short-labelled buttons placed straight on the screen along one edge.
 * A shop with a grid of Buy buttons is big and is not one.
 */
export function menuClusters(screens: readonly GuiNode[], hidden: ReadonlySet<GuiNode> = NONE): MenuCluster[] {
  const vp = VIEWPORTS[0]!;
  const total = vp.w * (vp.h - TOP_INSET);
  const sideOf = (r: Rect): Side => {
    const cx = (r.x + r.w / 2) / vp.w, cy = (r.y + r.h / 2 - TOP_INSET) / (vp.h - TOP_INSET);
    return cx < 0.25 ? 'left' : cx > 0.75 ? 'right' : cy < 0.2 ? 'top' : cy > 0.8 ? 'bottom' : 'centre';
  };
  const short = (c: GuiNode): boolean => isButton(c) && shown(c) && !under(c, hidden) && textOf(c).trim().length <= 18;
  const inFrames: MenuCluster[] = [];
  const onScreen: MenuCluster[] = [];
  for (const s of screens) {
    if (s.cls !== 'ScreenGui' || s.props.Enabled === false) continue;
    const rects = layoutRects(s, vp);
    const source = typeof s.attrs.AppleLibraryGame === 'string' ? s.attrs.AppleLibraryGame : undefined;
    const bySide = new Map<Side, GuiNode[]>();
    for (const b of s.children.filter(short)) {
      const r = rects.get(b);
      if (r) bySide.set(sideOf(r), [...(bySide.get(sideOf(r)) ?? []), b]);
    }
    for (const [side, buttons] of bySide) if (buttons.length >= 3 && side !== 'centre') onScreen.push({ screen: s.name, path: s.path, buttons: buttons.slice(0, 8).map(labelOf), side, ...(source ? { source } : {}) });
    for (const node of all(s)) {
      if ((node.cls !== 'Frame' && node.cls !== 'ScrollingFrame') || !shown(node) || under(node, hidden)) continue;
      let depth = 0;
      for (let p: GuiNode | null = node; p && p !== s; p = p.parent) depth += 1;
      if (depth > 3) continue;
      const buttons = node.children.filter(short);
      if (buttons.length < 3) continue;
      // The nearest ancestor with a rectangle places a container that a layout object arranges.
      let at: GuiNode | null = node;
      while (at && !rects.has(at)) at = at.parent;
      const r = at ? rects.get(at) : undefined;
      if (!r || at === s || area(r) > total * 0.33) continue;
      inFrames.push({ screen: s.name, path: node.path, buttons: buttons.slice(0, 8).map(labelOf), side: sideOf(r), ...(source ? { source } : {}) });
    }
  }
  // A container that holds another qualifying container is reported once, by the inner one.
  return [...inFrames.filter((c) => !inFrames.some((d) => d !== c && isPathUnder(d.path, c.path))), ...onScreen];
}
/**
 * Two menu sets from different screens on the same edge: the second one is a duplicate system fighting for the first one's place.
 * Two screens of ONE imported game are that game's own design (its HUD and its side bar), not two systems.
 */
export function competingMenus(clusters: readonly MenuCluster[]): [MenuCluster, MenuCluster][] {
  const pairs: [MenuCluster, MenuCluster][] = [];
  for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
    const a = clusters[i]!, b = clusters[j]!;
    if (a.screen !== b.screen && a.side === b.side && a.side !== 'centre' && !(a.source && a.source === b.source)) pairs.push([a, b]);
  }
  return pairs;
}

/* ---------------------------------------------------------------------------------------------- style --- */

export interface Style {
  screen: string;
  /** How many text and button nodes the screen has: a screen with fewer than four says too little to compare. */
  weight: number;
  font: string;
  fontShare: number;
  corners: 'square' | 'rounded';
  stroke: number;
  tone: 'dark' | 'mid' | 'light';
}
const FONT_WEIGHTS = /(?:Black|Bold|Semibold|Medium|Light|Regular|Italic|Heavy|Extra)+$/;
const fontFamily = (font: string): string => font.replace(/^Enum\.Font\./, '').replace(FONT_WEIGHTS, '') || font;

/** How a screen looks, from its text fonts, UICorner / UIStroke children and filled backgrounds. */
export function styleOf(screen: GuiNode): Style {
  const fonts = new Map<string, number>();
  let objects = 0, rounded = 0, stroked = 0, weight = 0, lit = 0, lightSum = 0;
  for (const n of all(screen)) {
    if (!GUI_OBJECT.has(n.cls) || outOfSight(n)) continue;
    const filled = visibleFill(n) && n.props.BackgroundColor3 !== undefined;
    const text = hasText(n) && textOf(n).trim() !== '';
    if (text && typeof n.props.Font === 'string' && !/\.Unknown$/.test(n.props.Font)) { const f = fontFamily(n.props.Font); fonts.set(f, (fonts.get(f) ?? 0) + 1); }
    if (text || isButton(n)) weight += 1;
    if (filled || text || isButton(n)) {
      objects += 1;
      const corner = n.children.find((c) => c.cls === 'UICorner');
      const radius = corner ? pair(corner.props.CornerRadius) : null;
      if (radius && radius[0] * 50 + radius[1] > 1) rounded += 1;
      if (n.children.some((c) => c.cls === 'UIStroke' && c.props.Enabled !== false)) stroked += 1;
    }
    if (filled) {
      const c = Array.isArray(n.props.BackgroundColor3) ? (n.props.BackgroundColor3 as unknown[]).map(Number) : null;
      if (c && c.length === 3 && c.every(Number.isFinite)) { lit += 1; lightSum += 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; }
    }
  }
  const [font, count] = [...fonts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const total = [...fonts.values()].reduce((a, b) => a + b, 0);
  const light = lit ? lightSum / lit : 0.5;
  return {
    screen: screen.name,
    weight,
    font,
    fontShare: total ? count / total : 0,
    corners: objects && rounded / objects >= 0.25 ? 'rounded' : 'square',
    stroke: objects ? stroked / objects : 0,
    tone: light < 0.3 ? 'dark' : light > 0.65 ? 'light' : 'mid',
  };
}
export const describeStyle = (s: Style): string =>
  `${s.font || 'no text font'}, ${s.corners === 'rounded' ? 'rounded corners' : 'square corners'}, ${s.stroke >= 0.5 ? 'thick outlines' : s.stroke >= 0.15 ? 'some outlines' : 'no outlines'}, ${s.tone} colours`;

/** What differs between two screens' looks; two or more differences read as two different games. */
export function styleDifferences(a: Style, b: Style): string[] {
  const out: string[] = [];
  if (a.font && b.font && a.font !== b.font) out.push('font');
  if (a.corners !== b.corners) out.push('corners');
  if (Math.abs(a.stroke - b.stroke) > 0.5) out.push('outlines');
  if ((a.tone === 'dark' && b.tone === 'light') || (a.tone === 'light' && b.tone === 'dark')) out.push('colours');
  return out;
}
export interface StyleClash { base: Style; other: Style; differs: string[] }
/** Screens whose look clashes with the heaviest screen's (the one most of the game's UI looks like). */
export function styleClashes(screens: readonly GuiNode[]): StyleClash[] {
  const styles = screens.filter((s) => s.cls === 'ScreenGui' && s.props.Enabled !== false).map(styleOf).filter((s) => s.weight >= 4);
  if (styles.length < 2) return [];
  const base = [...styles].sort((a, b) => b.weight - a.weight)[0]!;
  return styles.filter((s) => s !== base).map((other) => ({ base, other, differs: styleDifferences(base, other) })).filter((c) => c.differs.length >= 2);
}

/* ---------------------------------------------------------------------------------------- what to press --- */

export type ButtonRole = 'action' | 'open' | 'close' | 'other';
export interface ButtonPick { path: string; label: string; role: ButtonRole; screen: string }
const MAX_PRESS_PATH = 320;
const ACTION = /\b(collect|claim|buy|purchase|sell|harvest|plant|water|hatch|upgrade|spin|start|play|equip|open|craft|steal|rebirth|reroll|feed|pick|grab|deposit|withdraw|cash ?out|unlock|use)\b/i;
const OPENER = /\b(shop|store|market|inventory|backpack|bag|menu|settings|options|index|collection|pets?|quests?|missions?|daily|rewards?|leaderboard|stats|codes?|gifts?|seeds|gear|items?|trade|friends|help|info|more)\b/i;
const CLOSE = /^\s*(x|×|✕|✖|close|back|exit|cancel|done|ok|okay|no)\s*$/i;
/** Buttons the Studio test cannot honestly try (they leave the place, sell for Robux, or invite someone). */
const NOT_TESTABLE = /teleport|rejoin|server ?hop|new server|invite|share|copy|discord|youtube|twitter|group|follow|rate|like|favou?rite|donat|robux|r\$|gamepass|game pass|premium|\bvip\b|leave|quit|log ?out|report/i;

function roleOf(text: string, name: string): ButtonRole {
  const t = `${text} ${name}`;
  if (CLOSE.test(text) || CLOSE.test(name) || /^(close|exit|back)/i.test(name)) return 'close';
  if (ACTION.test(text) || (!text && ACTION.test(name))) return 'action';
  if (OPENER.test(t)) return 'open';
  return 'other';
}
const RANK: Record<ButtonRole, number> = { action: 0, other: 1, open: 2, close: 3 };

/**
 * The buttons a player could press at the start (their screen enabled and every parent visible), in the order a play session
 * should press them: actions first, then the rest, then the buttons that open windows (a window that opens covers the buttons
 * pressed after it), closers last. `skipped` are the ones a Studio test cannot honestly try.
 */
export function pickButtons(screens: readonly GuiNode[], max = 15, hidden: ReadonlySet<GuiNode> = NONE): { picks: ButtonPick[]; skipped: { label: string; why: string }[]; total: number; /** Of `total`, the buttons outside windows: the ones that crowd the screen while nothing is open. */ hud: number } {
  const picks: ButtonPick[] = [];
  const skipped: { label: string; why: string }[] = [];
  let total = 0, hud = 0;
  const vp = VIEWPORTS[0]!;
  for (const s of screens) {
    if (s.cls !== 'ScreenGui' || s.props.Enabled === false) continue;
    const rects = layoutRects(s, vp);
    for (const n of all(s)) {
      if (!isButton(n) || !shown(n) || under(n, hidden) || !inStarterGui(n.path)) continue;
      total += 1;
      const owner = widgetOf(n);
      if (!isWindow(owner, rects.get(owner), vp)) hud += 1;
      // A press names its button by path, and the plugin takes at most 320 characters of it.
      if (n.path.length > MAX_PRESS_PATH) { skipped.push({ label: labelOf(n), why: 'its path is too long for a Studio test to press' }); continue; }
      const text = textOf(n).trim();
      if (NOT_TESTABLE.test(`${text} ${n.name}`)) { skipped.push({ label: labelOf(n), why: 'leaves the place, sells for Robux or invites someone; a Studio test cannot try it' }); continue; }
      picks.push({ path: n.path, label: labelOf(n), role: roleOf(text, n.name), screen: s.name });
    }
  }
  picks.sort((a, b) => RANK[a.role] - RANK[b.role]);
  return { picks: picks.slice(0, max), skipped, total, hud };
}

const SHOPPY = /\b(shop|store|market|upgrades?|buy|sell|seeds|gear|items?|craft|index|inventory|pets?|quests?)\b/i;
const BUYISH = /\b(buy|purchase|equip|upgrade|claim|sell|collect|plant|unlock|craft|hatch|\$|price|cost)\b|\d/i;
/**
 * A window a player opens and then uses: the opener button that is visible at the start, and up to three buttons inside the
 * window it opens (hidden at the start) that buy, equip or claim something. Pressing them in one session in that order shows
 * whether "Shop -> Buy" works.
 */
export function pickFlow(screens: readonly GuiNode[], picks: readonly ButtonPick[]): { opener: ButtonPick; inner: ButtonPick[]; panel: string } | null {
  // The topmost thing a player cannot see at the start: a window switched off, or a whole screen that is disabled.
  const closed = screens.flatMap((s) => all(s).filter((n) => n !== s && (n.cls === 'Frame' || n.cls === 'ScrollingFrame' || n.cls === 'ImageLabel' || n.cls === 'CanvasGroup')
    && !shown(n) && n.parent !== null && (LAYERS.has(n.parent.cls) || shown(n.parent))));
  for (const opener of picks) {
    if (opener.role !== 'open' || !SHOPPY.test(opener.label)) continue;
    const words = opener.label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3);
    const named = closed.find((p) => words.some((w) => p.name.toLowerCase().includes(w) || p.screen.toLowerCase().includes(w)))
      ?? closed.find((p) => p.screen === opener.screen && all(p).some((b) => isButton(b) && BUYISH.test(labelOf(b))));
    if (!named) continue;
    const inner = all(named).filter((b) => isButton(b) && BUYISH.test(labelOf(b)) && !NOT_TESTABLE.test(labelOf(b))).slice(0, 3)
      .map((b) => ({ path: b.path, label: labelOf(b), role: 'action' as ButtonRole, screen: named.screen }));
    if (inner.length) return { opener, inner, panel: named.path };
  }
  return null;
}
