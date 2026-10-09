// build_ui / check_ui: the UI engine (rebuild 2026-10-08).
//
// The model designs the screen: every colour, font, size and the composition are its own choice, written
// as a small declarative tree. This file owns only TECHNICAL correctness: it turns that tree into the
// Roblox objects that lay it out properly (UIListLayout / UIGridLayout with LayoutOrder in tree order,
// UIPadding, AutomaticSize for content-sized things, UIFlexItem for "fill", TextWrapped or TextTruncate,
// UITextSizeConstraint for scaled text, ClipsDescendants and AutomaticCanvasSize on scroll areas,
// ZIndexBehavior Sibling), sends them as ONE create_instances item, then has the plugin lay the screen
// out at five real screen sizes (measure_ui, ops/Ui.luau) and returns every defect it measured, so the
// model fixes them by calling build_ui again with the same name, which replaces the screen.
//
// There is no theme, palette, kit or preset here, and none may be added: a default below exists only
// where Roblox would otherwise produce something broken (black text on a dark panel, a 0 px button).
//
// Every class, property and enum this file can emit is on the plugin's allowlists
// (tests/ui-engine.test.mjs parses Commands.luau and ops/*.luau and fails otherwise).
import type { GatewayToolDef, InstanceSpec, PropValue, StudioOp, UiViewport } from '@studpilot/shared';

export type OpCall = (op: StudioOp, timeoutMs?: number) => Promise<unknown>;
type Args = Record<string, unknown>;
type Refusal = { error: string };
type P = Record<string, PropValue>;
type Spec = Omit<InstanceSpec, 'parent'>;

export const UI_KINDS = ['frame', 'stack', 'grid', 'scroll', 'text', 'button', 'input', 'image', 'icon', 'divider', 'spacer'] as const;
type Kind = (typeof UI_KINDS)[number];
export const UI_PLACEMENTS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const;
type Placement = (typeof UI_PLACEMENTS)[number];
export const UI_VIEWPORTS: readonly UiViewport[] = ['desktop', 'laptop', 'tablet', 'phone_landscape', 'phone_portrait'];

export const UI_ENGINE_LIMITS = Object.freeze({ nodes: 160, depth: 10, children: 32, instances: 400, text: 2000 });

/** Font families Font.fromName resolves (rbxasset://fonts/families/<name>.json). */
export const UI_FONT_FAMILIES = [
  'BuilderSans', 'BuilderExtended', 'BuilderMono', 'Montserrat', 'GothamSSm', 'SourceSansPro', 'Roboto', 'RobotoCondensed', 'RobotoMono',
  'Arial', 'Arimo', 'Nunito', 'Oswald', 'Ubuntu', 'TitilliumWeb', 'JosefinSans', 'Merriweather', 'Inconsolata', 'Jura', 'Michroma',
  'Sarpanch', 'Zekton', 'PressStart2P', 'FredokaOne', 'LuckiestGuy', 'Bangers', 'Creepster', 'DenkOne', 'Fondamento', 'GrenzeGotisch',
  'IndieFlower', 'Kalam', 'PatrickHand', 'PermanentMarker', 'SpecialElite', 'AmaticSC', 'ComicNeueAngular', 'HighwayGothic',
  'AccanthisADFStd', 'Guru', 'Balthazar',
] as const;
const WEIGHTS = ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Heavy'] as const;

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const ASSET = /^rbxassetid:\/\/\d{1,20}$/;
/** Names the engine gives the layout objects it adds; a node may not take one. */
const RESERVED = new Set(['UICorner', 'UIStroke', 'UIGradient', 'UIPadding', 'UIListLayout', 'UIGridLayout', 'UIFlexItem', 'UITextSizeConstraint', 'UISizeConstraint', 'UIAspectRatioConstraint']);
const CONTAINERS: ReadonlySet<Kind> = new Set(['frame', 'stack', 'grid', 'scroll', 'button']);
const MAX_PX = 4096;

/* ------------------------------------------------------------------------- values --- */

const round = (n: number) => Math.round(n * 10_000) / 10_000;
const udim2 = (xs: number, xo: number, ys: number, yo: number): PropValue => ({ t: 'UDim2', v: [round(xs), round(xo), round(ys), round(yo)] });
const udim = (s: number, o: number): PropValue => ({ t: 'UDim', v: [round(s), round(o)] });
const vec2 = (x: number, y: number): PropValue => ({ t: 'Vector2', v: [round(x), round(y)] });
const num = (v: number): PropValue => ({ t: 'number', v: round(v) });
const bool = (v: boolean): PropValue => ({ t: 'bool', v });
const str = (v: string): PropValue => ({ t: 'string', v });
const en = (type: string, item: string): PropValue => ({ t: 'EnumItem', v: `Enum.${type}.${item}` });

class UiError extends Error {}
const fail = (message: string): never => { throw new UiError(message); };

function rgb(hex: string, label: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) fail(`${label} must be a hex colour like "#1e2430" (got ${JSON.stringify(hex).slice(0, 40)}).`);
  const h = m![1]!.length === 3 ? [...m![1]!].map((c) => c + c).join('') : m![1]!;
  return [0, 2, 4].map((i) => round(Number.parseInt(h.slice(i, i + 2), 16) / 255)) as [number, number, number];
}
const colour = (hex: unknown, label: string): PropValue => ({ t: 'Color3', v: rgb(String(hex), label) });

function luminance([r, g, b]: [number, number, number]): number {
  const ch = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
/** WCAG contrast ratio of two colours (the formula ops/Ui.luau's low_contrast check uses). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(rgb(a, 'colour')), luminance(rgb(b, 'colour'))].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const unit = (v: unknown, label: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) fail(`${label} must be a number from 0 to 1.`);
  return v as number;
};
const px = (v: unknown, label: string, min = 0): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > MAX_PX) fail(`${label} must be a number of pixels from ${min} to ${MAX_PX}.`);
  return v as number;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], label: string): T => {
  if (!list.includes(v as T)) fail(`${label} must be one of ${list.join(', ')}.`);
  return v as T;
};

/* -------------------------------------------------------------------------- nodes --- */

/** One node of the tree the model writes. See SIZE / the tool description for each field. */
export interface UiNode {
  type: Kind;
  name?: string;
  children?: UiNode[];
  // size and place
  w?: Size; h?: Size; minW?: number; maxW?: number; minH?: number; maxH?: number; aspect?: number; grow?: number;
  at?: Placement; offset?: [number, number]; z?: number; visible?: boolean;
  // containers
  dir?: 'v' | 'h'; gap?: number; pad?: number | number[]; align?: 'start' | 'center' | 'end';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'; wrap?: boolean;
  cols?: number; cell?: [number, number]; bar?: number; barColor?: string;
  // look
  bg?: string; bgT?: number; radius?: number | 'pill'; clip?: boolean;
  stroke?: { color: string; width?: number; t?: number };
  gradient?: { colors: string[]; rotation?: number; t?: [number, number] };
  // text
  text?: string; font?: string; fontSize?: number; scale?: [number, number]; color?: string; textT?: number;
  alignX?: 'left' | 'center' | 'right'; alignY?: 'top' | 'center' | 'bottom'; truncate?: boolean; rich?: boolean; lineHeight?: number;
  // input
  placeholder?: string; placeholderColor?: string; multiline?: boolean;
  // image
  image?: string; fit?: 'fit' | 'crop' | 'stretch'; tint?: string; imageT?: number;
  // divider
  thickness?: number;
  // game-UI depth (2026-10-09): outlined text, a chunky base edge, a tiled texture
  textStroke?: { color: string; width?: number; t?: number };
  depth?: { color: string; px?: number };
  pattern?: { image: string; tile?: number; t?: number; tint?: string };
  skin?: { image: string; size?: [number, number]; slice?: number | [number, number, number, number]; t?: number; tint?: string };
}
type Size = number | 'fill' | 'auto' | `${number}%`;

/** How the parent positions this node. */
type Ctx = { layout: 'v' | 'h' | 'grid' | 'free'; bg: string | null };

const TEXT_KINDS: ReadonlySet<Kind> = new Set(['text', 'button', 'input']);

interface Compiled { spec: Spec; count: number }
interface Build { count: number; nodes: number; interactive: string[]; warnings: string[] }

function axis(size: Size | undefined, dim: 'X' | 'Y', ctx: Ctx, label: string, flex: { grow?: number }, auto: Set<'X' | 'Y'>): [number, number] {
  if (size === undefined) return [0, 0];
  if (typeof size === 'number') return [0, px(size, label)];
  if (size === 'auto') { auto.add(dim); return [0, 0]; }
  if (size === 'fill') {
    const main = (ctx.layout === 'v' && dim === 'Y') || (ctx.layout === 'h' && dim === 'X');
    if (main) { flex.grow = flex.grow ?? 1; return [0, 0]; }
    return [1, 0];
  }
  const pct = typeof size === 'string' ? /^(\d{1,3}(?:\.\d+)?)%$/.exec(size) : null;
  if (pct && Number(pct[1]) <= 100) return [Number(pct[1]) / 100, 0];
  return fail(`${label} must be pixels (a number), "fill", "auto" or a percent like "50%".`);
}

function padding(v: unknown, label: string): [number, number, number, number] {
  const vals = typeof v === 'number' ? [v] : Array.isArray(v) ? v : fail(`${label} must be a number or [vertical, horizontal] or [top, right, bottom, left].`);
  const n = (vals as unknown[]).map((x, i) => px(x, `${label}[${i}]`));
  if (n.length === 1) return [n[0]!, n[0]!, n[0]!, n[0]!];
  if (n.length === 2) return [n[0]!, n[1]!, n[0]!, n[1]!];
  if (n.length === 4) return n as [number, number, number, number];
  return fail(`${label} must have 1, 2 or 4 numbers.`);
}

function fontFace(v: unknown, label: string): PropValue {
  const [family, weight = 'Regular', style] = String(v).split(':');
  if (!UI_FONT_FAMILIES.includes(family as (typeof UI_FONT_FAMILIES)[number])) fail(`${label} family must be one of ${UI_FONT_FAMILIES.join(', ')} (as "Family" or "Family:Weight", e.g. "Montserrat:Bold").`);
  oneOf(weight, WEIGHTS, `${label} weight`);
  if (style !== undefined && style !== 'Italic') fail(`${label}: the only style suffix is ":Italic".`);
  return { t: 'Font', v: [family!, weight, style ?? 'Normal'] } as PropValue;
}

const PLACE: Record<Placement, [number, number]> = {
  'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0], left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
  'bottom-left': [0, 1], bottom: [0.5, 1], 'bottom-right': [1, 1],
};
/** An offset moves INWARD from the edges the node is placed at (positive x leaves a right-placed node's right edge). */
const inward = (anchor: number, d: number) => (anchor === 1 ? -d : d);

const KNOWN_KEYS = new Set(['type', 'name', 'children', 'w', 'h', 'minW', 'maxW', 'minH', 'maxH', 'aspect', 'grow', 'at', 'offset', 'z', 'visible',
  'dir', 'gap', 'pad', 'align', 'justify', 'wrap', 'cols', 'cell', 'bar', 'barColor', 'bg', 'bgT', 'radius', 'clip', 'stroke', 'gradient',
  'text', 'font', 'fontSize', 'scale', 'color', 'textT', 'alignX', 'alignY', 'truncate', 'rich', 'lineHeight',
  'placeholder', 'placeholderColor', 'multiline', 'image', 'fit', 'tint', 'imageT', 'thickness', 'textStroke', 'depth', 'pattern', 'skin']);

/* ------------------------------------------------------------ styles and repeats --- */
// Token saver: a screen's look is written once (`styles`) and a list once (`each`), instead of the model writing the
// same colours, fonts and radii into every node. Both expand to plain nodes before compiling, so nothing below changes.

const MAX_STYLES = 40;
const MAX_EACH = 32;
const VAR = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const HAS_VAR = /\{[A-Za-z_][A-Za-z0-9_]*\}/;

function styleMap(raw: unknown): Record<string, Args> {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('styles must be an object of named styles, e.g. {"card": {"bg": "#1e2430", "radius": 12}}.');
  const out: Record<string, Args> = {};
  const entries = Object.entries(raw as Args);
  if (entries.length > MAX_STYLES) fail(`styles may define at most ${MAX_STYLES} styles.`);
  for (const [name, s] of entries) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) fail(`styles.${name} must be an object of node fields.`);
    const bad = Object.keys(s as Args).filter((k) => !KNOWN_KEYS.has(k) || k === 'name' || k === 'children');
    if (bad.length) fail(`styles.${name} has field(s) ${bad.join(', ')} a style cannot set (no name or children; only node fields).`);
    out[name] = s as Args;
  }
  return out;
}

/** `{key}` in any string of a repeated template takes the item's value; a string that is only `{key}` takes it as is. */
function fill(v: unknown, vars: Args): unknown {
  if (typeof v === 'string') {
    const whole = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(v);
    if (whole && whole[1]! in vars) return vars[whole[1]!];
    return v.replace(VAR, (m, k: string) => (k in vars ? String(vars[k]) : m));
  }
  if (Array.isArray(v)) return v.map((x) => fill(x, vars));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Args).map(([k, x]) => [k, fill(x, vars)]));
  return v;
}

function expandNode(raw: unknown, styles: Record<string, Args>, path: string): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const { style, ...own } = raw as Args;
  let n: Args = own;
  if (style !== undefined) {
    const names = Array.isArray(style) ? style : [style];
    const base: Args = {};
    for (const s of names) {
      if (typeof s !== 'string' || !(s in styles)) fail(`${path}.style ${JSON.stringify(s)} is not one of the screen's styles (${Object.keys(styles).join(', ') || 'none defined'}).`);
      Object.assign(base, styles[s as string]);
    }
    // The node's own fields win over its styles; later styles win over earlier ones.
    n = { ...base, ...own };
  }
  if (Array.isArray(n.children)) n.children = expandList(n.children, styles, `${path}.children`);
  return n;
}

/** A child with `each` becomes one copy per item: its `{key}` placeholders take the item's values or, with none, the item's fields override the template's top node. A string item means {text}. */
function expandList(list: unknown[], styles: Record<string, Args>, path: string): unknown[] {
  const out: unknown[] = [];
  list.forEach((raw, i) => {
    const at = `${path}[${i}]`;
    if (!raw || typeof raw !== 'object' || !('each' in (raw as Args))) { out.push(expandNode(raw, styles, at)); return; }
    const { each, ...template } = raw as Args;
    if (!Array.isArray(each) || each.length === 0 || each.length > MAX_EACH) fail(`${at}.each must list 1-${MAX_EACH} items (objects, or strings used as text).`);
    // A template with {key} placeholders takes the items as values; one without takes them as fields of its top node.
    const usesVars = HAS_VAR.test(JSON.stringify(template));
    (each as unknown[]).forEach((item, j) => {
      const vars: Args = typeof item === 'string' || typeof item === 'number' ? { text: String(item) } : item && typeof item === 'object' && !Array.isArray(item) ? item as Args : fail(`${at}.each[${j}] must be an object or a string.`);
      const copy = fill(template, vars) as Args;
      if (!usesVars) for (const [k, v] of Object.entries(vars)) if (KNOWN_KEYS.has(k) || k === 'style') copy[k] = v;
      // A fixed template name gets the item's number, so the copies stay unique siblings.
      if (typeof template.name === 'string' && !HAS_VAR.test(template.name) && !('name' in vars)) copy.name = `${template.name}${j + 1}`;
      out.push(expandNode(copy, styles, `${at}.each[${j}]`));
    });
  });
  return out;
}

/* ------------------------------------------------- game-UI dressing (2026-10-09) --- */
// What the owner's reference UI is made of and the plain schema could not express: button text with a black outline
// on a bordered button, a tiled texture (studs) behind the content, and a chunky darker base under a button or panel.

function textStrokeProps(v: unknown, where: string): P {
  const s = v as { color?: unknown; width?: unknown; t?: unknown } | null;
  if (!s || typeof s !== 'object') fail(`${where}.textStroke must be {color, width?, t?}.`);
  return {
    Color: colour(s!.color, `${where}.textStroke.color`),
    Thickness: num(s!.width === undefined ? 2 : px(s!.width, `${where}.textStroke.width`)),
    Transparency: num(s!.t === undefined ? 0 : unit(s!.t, `${where}.textStroke.t`)),
    ApplyStrokeMode: en('ApplyStrokeMode', 'Contextual'),
  };
}

const TEXT_PROP_KEYS = ['Text', 'FontFace', 'TextColor3', 'TextSize', 'TextScaled', 'TextWrapped', 'TextTruncate', 'TextXAlignment', 'TextYAlignment', 'RichText', 'LineHeight', 'TextTransparency'];
/** What stays on the outer object when a base edge is added: how it is sized, placed, ordered and pressed. */
const OUTER_KEYS = new Set(['Size', 'Position', 'AnchorPoint', 'ZIndex', 'Visible', 'AutomaticSize', 'BorderSizePixel', 'AutoButtonColor']);
const OUTER_DECOR = new Set(['UISizeConstraint', 'UIAspectRatioConstraint', 'UIFlexItem']);

interface Dress {
  n: UiNode; kind: Kind; className: string; name: string; props: P; decor: Spec[]; childSpecs: Spec[]; where: string;
  autoAxes: Set<'X' | 'Y'>; takesText: boolean;
}

function dress(d: Dress): { spec: Spec; added: number } {
  const { n, kind, name, where, autoAxes } = d;
  let className = d.className;
  const props: P = { ...d.props };
  let decor = [...d.decor];
  let added = 0;
  const kids = (list: Spec[]) => (list.length ? { children: list } : {});

  // A button's text moves into a label of its own when the button carries anything else that draws (a texture, a base
  // edge) or the text needs an outline: a button's own UIStroke is its border.
  let label: Spec | null = null;
  if (kind === 'button' && d.takesText && !d.childSpecs.length && (n.textStroke !== undefined || n.pattern !== undefined || n.skin !== undefined || n.depth !== undefined)) {
    const lp: P = { BackgroundTransparency: num(1), BorderSizePixel: num(0) };
    for (const k of TEXT_PROP_KEYS) if (props[k] !== undefined) { lp[k] = props[k]!; delete props[k]; }
    const ax = autoAxes.has('X'), ay = autoAxes.has('Y');
    lp.Size = udim2(ax ? 0 : 1, 0, ay ? 0 : 1, 0);
    if (ax || ay) lp.AutomaticSize = en('AutomaticSize', ax && ay ? 'XY' : ax ? 'X' : 'Y');
    const ldecor: Spec[] = decor.filter((s) => s.className === 'UITextSizeConstraint');
    decor = decor.filter((s) => s.className !== 'UITextSizeConstraint');
    if (n.textStroke !== undefined) ldecor.push({ className: 'UIStroke', name: 'UIStroke', props: textStrokeProps(n.textStroke, where) });
    label = { className: 'TextLabel', name: 'Label', props: lp, ...kids(ldecor) };
    added += 1 + (n.textStroke !== undefined ? 1 : 0);
    props.Text = str('');
  }

  // A tiled texture is the object's own image: a Frame becomes an ImageLabel, a button an ImageButton.
  if (n.pattern !== undefined) {
    const pt = n.pattern as { image?: unknown; tile?: unknown; t?: unknown; tint?: unknown };
    if (!pt || typeof pt !== 'object' || !ASSET.test(String(pt.image))) fail(`${where}.pattern must be {image: "rbxassetid://N", tile?: px, t?: 0-1, tint?: "#hex"}.`);
    const tile = pt.tile === undefined ? 32 : px(pt.tile, `${where}.pattern.tile`, 4);
    if (className === 'TextButton') { className = 'ImageButton'; for (const k of TEXT_PROP_KEYS) delete props[k]; }
    else if (className === 'Frame') className = 'ImageLabel';
    props.Image = str(String(pt.image));
    props.ScaleType = en('ScaleType', 'Tile');
    props.TileSize = udim2(0, tile, 0, tile);
    props.ImageTransparency = num(pt.t === undefined ? 0.7 : unit(pt.t, `${where}.pattern.t`));
    if (pt.tint !== undefined) props.ImageColor3 = colour(pt.tint, `${where}.pattern.tint`);
  }

  // A skin is generated or found art drawn as the object itself; with slice it is 9-sliced so it stretches cleanly.
  if (n.skin !== undefined) {
    const sk = n.skin as { image?: unknown; size?: unknown; slice?: unknown; t?: unknown; tint?: unknown };
    if (!sk || typeof sk !== 'object' || !ASSET.test(String(sk.image))) fail(`${where}.skin must be {image: "rbxassetid://N", size?: [w, h], slice?: px or [l, t, r, b], t?, tint?}.`);
    if (className === 'TextButton') { className = 'ImageButton'; for (const k of TEXT_PROP_KEYS) delete props[k]; }
    else if (className === 'Frame') className = 'ImageLabel';
    props.Image = str(String(sk.image));
    if (sk.slice !== undefined) {
      const size = Array.isArray(sk.size) && sk.size.length === 2 ? sk.size.map((v, i) => px(v, `${where}.skin.size[${i}]`, 1)) : fail(`${where}.skin: slice needs size: [imageWidth, imageHeight] (make_image returns it).`);
      const sl = typeof sk.slice === 'number' ? [sk.slice, sk.slice, sk.slice, sk.slice] : Array.isArray(sk.slice) && sk.slice.length === 4 ? sk.slice : fail(`${where}.skin.slice must be px or [left, top, right, bottom].`);
      const [l, t, rr, b] = (sl as unknown[]).map((v, i) => px(v, `${where}.skin.slice[${i}]`));
      if (l! + rr! >= size![0]! || t! + b! >= size![1]!) fail(`${where}.skin.slice leaves no middle in a ${size![0]}x${size![1]} image.`);
      props.ScaleType = en('ScaleType', 'Slice');
      props.SliceCenter = { t: 'Rect', v: [l!, t!, size![0]! - rr!, size![1]! - b!] } as PropValue;
    } else {
      props.ScaleType = en('ScaleType', 'Stretch');
    }
    if (sk.t !== undefined) props.ImageTransparency = num(unit(sk.t, `${where}.skin.t`));
    if (sk.tint !== undefined) props.ImageColor3 = colour(sk.tint, `${where}.skin.tint`);
    if (n.bg === undefined) props.BackgroundTransparency = num(1);
  }

  if (n.depth === undefined) {
    return { spec: { className, name, props, ...kids([...decor, ...(label ? [label] : []), ...d.childSpecs]) }, added };
  }

  // The base edge: the outer object shows the darker base colour; a Face on top, px shorter, carries the look and content.
  const dp = n.depth as { color?: unknown; px?: unknown };
  if (!dp || typeof dp !== 'object') fail(`${where}.depth must be {color, px?}.`);
  if (autoAxes.size) fail(`${where}: depth needs a fixed, percent or fill w and h (not "auto"), because the face is the full size minus the edge.`);
  const edge = dp.px === undefined ? 4 : px(dp.px, `${where}.depth.px`, 1);
  if (edge > 24) fail(`${where}.depth.px must be 1-24.`);
  const outerProps: P = { BackgroundColor3: colour(dp.color, `${where}.depth.color`), BackgroundTransparency: num(0), BorderSizePixel: num(0) };
  const faceProps: P = { BorderSizePixel: num(0) };
  for (const [k, v] of Object.entries(props)) (OUTER_KEYS.has(k) ? outerProps : faceProps)[k] = v;
  delete faceProps.AutoButtonColor;
  faceProps.Size = udim2(1, 0, 1, -edge);
  if (kind === 'button') outerProps.Text = str('');
  const corner = decor.find((s) => s.className === 'UICorner');
  const border = decor.find((s) => s.className === 'UIStroke');
  const outerDecor = decor.filter((s) => OUTER_DECOR.has(s.className) || s === border);
  const faceDecor = decor.filter((s) => !OUTER_DECOR.has(s.className) && s !== border);
  if (corner) outerDecor.push({ ...corner });
  const faceClass = className === 'ImageLabel' || className === 'ImageButton' ? 'ImageLabel' : 'Frame';
  const outerClass = kind === 'button' ? 'TextButton' : 'Frame';
  for (const k of TEXT_PROP_KEYS) delete faceProps[k];
  const face: Spec = { className: faceClass, name: 'Face', props: faceProps, ...kids([...faceDecor, ...(label ? [label] : []), ...d.childSpecs]) };
  added += 1 + (corner ? 1 : 0);
  return { spec: { className: outerClass, name, props: outerProps, children: [...outerDecor, face] }, added };
}

function compileNode(raw: unknown, ctx: Ctx, path: string, depth: number, build: Build, auto: string, parentPath: string): Compiled {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`${path} must be an object with a type.`);
  const n = raw as UiNode & Args;
  const kind = oneOf(n.type, UI_KINDS, `${path}.type`);
  const unknown = Object.keys(n).filter((k) => !KNOWN_KEYS.has(k));
  if (unknown.length) fail(`${path} has unknown field(s) ${unknown.join(', ')}.`);
  if (depth > UI_ENGINE_LIMITS.depth) fail(`${path} is nested deeper than ${UI_ENGINE_LIMITS.depth}.`);
  if (++build.nodes > UI_ENGINE_LIMITS.nodes) fail(`the tree has more than ${UI_ENGINE_LIMITS.nodes} nodes; split the UI into more screens.`);
  const name = n.name ?? auto;
  if (!NAME.test(name) || RESERVED.has(name)) fail(`${path}.name ${JSON.stringify(name)} must be letters, digits and _ (starting with a letter) and not a UI* layout name.`);
  const where = `${path}(${name})`;
  const namePath = parentPath ? `${parentPath}.${name}` : name;

  const kids = n.children ?? [];
  if (!Array.isArray(kids)) fail(`${where}.children must be a list.`);
  if (kids.length && !CONTAINERS.has(kind)) fail(`${where}: a ${kind} cannot have children (containers: ${[...CONTAINERS].join(', ')}).`);
  if (kids.length > UI_ENGINE_LIMITS.children) fail(`${where} has more than ${UI_ENGINE_LIMITS.children} children; group them.`);
  const hasImage = n.image !== undefined;
  if (hasImage && kind !== 'image' && kind !== 'icon' && kind !== 'button') fail(`${where}: image belongs on an image, icon or button (put an image node inside a ${kind}).`);
  if (hasImage && !ASSET.test(String(n.image))) fail(`${where}.image must be "rbxassetid://<digits>".`);
  if ((kind === 'image' || kind === 'icon') && !hasImage) fail(`${where}: an ${kind} needs image "rbxassetid://<digits>".`);

  const className = kind === 'scroll' ? 'ScrollingFrame'
    : kind === 'text' ? 'TextLabel'
      : kind === 'input' ? 'TextBox'
        : kind === 'image' || kind === 'icon' ? 'ImageLabel'
          : kind === 'button' ? (hasImage && n.text === undefined ? 'ImageButton' : 'TextButton')
            : 'Frame';
  const props: P = { BorderSizePixel: num(0) };
  const decor: Spec[] = [];
  const dec = (cls: string, p: P) => decor.push({ className: cls, name: cls, props: p });

  // What this node's own children are positioned by.
  const ownLayout: Ctx['layout'] = kind === 'grid' || (kind === 'scroll' && (n.cols !== undefined || n.cell !== undefined)) ? 'grid'
    : kind === 'stack' || kind === 'scroll' || ((kind === 'frame' || kind === 'button') && n.dir !== undefined) ? (n.dir === 'h' ? 'h' : 'v')
      : 'free';
  if (n.dir !== undefined) oneOf(n.dir, ['v', 'h'] as const, `${where}.dir`);

  /* size ------------------------------------------------------------------------------ */
  const inStack = ctx.layout === 'v' || ctx.layout === 'h';
  const vertical = ctx.layout === 'v';
  const defaults: Record<Kind, [Size, Size]> = {
    frame: ['fill', 'auto'], stack: ['fill', 'auto'], grid: ['fill', 'auto'], scroll: ['fill', 'fill'],
    text: [vertical || !inStack ? 'fill' : 'auto', 'auto'],
    button: [vertical ? 'fill' : 'auto', 44],
    input: ['fill', n.multiline ? 96 : 44],
    image: [64, 64], icon: [24, 24],
    divider: vertical ? ['fill', n.thickness ?? 1] : [n.thickness ?? 1, 'fill'],
    spacer: vertical ? [0, 'fill'] : ['fill', 0],
  };
  if (ctx.layout === 'free' && (kind === 'text' || kind === 'frame' || kind === 'stack' || kind === 'grid')) defaults[kind] = ['auto', 'auto'];
  if (kind === 'button' && kids.length) defaults.button = [vertical ? 'fill' : 'auto', 'auto'];
  const w = n.w ?? defaults[kind][0];
  const h = n.h ?? defaults[kind][1];
  const autoAxes = new Set<'X' | 'Y'>();
  const flex: { grow?: number } = {};
  if (n.grow !== undefined) {
    if (!inStack) fail(`${where}.grow only works inside a stack.`);
    flex.grow = px(n.grow, `${where}.grow`);
  }
  if (ctx.layout !== 'grid') {
    const [xs, xo] = axis(w, 'X', ctx, `${where}.w`, flex, autoAxes);
    const [ys, yo] = axis(h, 'Y', ctx, `${where}.h`, flex, autoAxes);
    props.Size = udim2(xs, xo, ys, yo);
  } else if (n.w !== undefined || n.h !== undefined) {
    build.warnings.push(`${where}: w/h are ignored inside a grid; the grid's cell decides the size.`);
  }
  // Text decides its own width only on one line; a filled or fixed width wraps.
  if (autoAxes.size) props.AutomaticSize = en('AutomaticSize', autoAxes.size === 2 ? 'XY' : autoAxes.has('X') ? 'X' : 'Y');
  if (flex.grow !== undefined) {
    dec('UIFlexItem', flex.grow === 1 ? { FlexMode: en('UIFlexMode', 'Fill') } : { FlexMode: en('UIFlexMode', 'Custom'), GrowRatio: num(flex.grow), ShrinkRatio: num(1) });
  }
  if ([n.minW, n.maxW, n.minH, n.maxH].some((v) => v !== undefined)) {
    const min = [n.minW ?? 0, n.minH ?? 0].map((v, i) => px(v, `${where}.${i ? 'minH' : 'minW'}`));
    const max = [n.maxW ?? 100_000, n.maxH ?? 100_000].map((v, i) => (v === 100_000 ? v : px(v, `${where}.${i ? 'maxH' : 'maxW'}`)));
    if (max[0]! < min[0]! || max[1]! < min[1]!) fail(`${where}: a max size is below its min size.`);
    dec('UISizeConstraint', { MinSize: vec2(min[0]!, min[1]!), MaxSize: vec2(max[0]!, max[1]!) });
  }
  if (n.aspect !== undefined) {
    if (typeof n.aspect !== 'number' || !(n.aspect > 0.05 && n.aspect < 20)) fail(`${where}.aspect must be width/height between 0.05 and 20.`);
    dec('UIAspectRatioConstraint', { AspectRatio: num(n.aspect) });
  }

  /* place ------------------------------------------------------------------------------- */
  if (n.at !== undefined || n.offset !== undefined) {
    if (ctx.layout !== 'free') build.warnings.push(`${where}: at/offset do nothing inside a ${ctx.layout === 'grid' ? 'grid' : 'stack'}; the layout places it.`);
    else {
      const [ax, ay] = PLACE[oneOf(n.at ?? 'top-left', UI_PLACEMENTS, `${where}.at`)];
      const off = n.offset ?? [0, 0];
      if (!Array.isArray(off) || off.length !== 2 || !off.every((v) => typeof v === 'number' && Math.abs(v) <= MAX_PX)) fail(`${where}.offset must be [x, y] pixels.`);
      props.AnchorPoint = vec2(ax, ay);
      props.Position = udim2(ax, inward(ax, off[0]!), ay, inward(ay, off[1]!));
    }
  }
  if (n.z !== undefined) {
    if (!Number.isInteger(n.z) || n.z < 0 || n.z > 100) fail(`${where}.z must be a whole number 0-100.`);
    props.ZIndex = num(n.z);
  }
  if (n.visible === false) props.Visible = bool(false);

  /* look -------------------------------------------------------------------------------- */
  let bg = ctx.bg;
  if (n.bg !== undefined) {
    props.BackgroundColor3 = colour(n.bg, `${where}.bg`);
    const t = n.bgT === undefined ? 0 : unit(n.bgT, `${where}.bgT`);
    props.BackgroundTransparency = num(t);
    if (t < 0.5) bg = String(n.bg);
  } else {
    props.BackgroundTransparency = num(1);
  }
  if (n.radius !== undefined) dec('UICorner', { CornerRadius: n.radius === 'pill' ? udim(1, 0) : udim(0, px(n.radius, `${where}.radius`)) });
  if (n.stroke !== undefined) {
    const s = n.stroke;
    if (!s || typeof s !== 'object') fail(`${where}.stroke must be {color, width?, t?}.`);
    dec('UIStroke', {
      Color: colour(s.color, `${where}.stroke.color`),
      Thickness: num(s.width === undefined ? 1 : px(s.width, `${where}.stroke.width`)),
      Transparency: num(s.t === undefined ? 0 : unit(s.t, `${where}.stroke.t`)),
      // Text strokes outline the glyphs; everything else draws a border.
      ApplyStrokeMode: en('ApplyStrokeMode', kind === 'text' ? 'Contextual' : 'Border'),
    });
  }
  if (n.gradient !== undefined) {
    const g = n.gradient;
    if (!g || !Array.isArray(g.colors) || g.colors.length < 2 || g.colors.length > 6) fail(`${where}.gradient.colors must list 2-6 hex colours.`);
    const p: P = {
      Color: { t: 'ColorSequence', v: g.colors.map((c, i) => [round(i / (g.colors.length - 1)), rgb(c, `${where}.gradient.colors[${i}]`)]) } as PropValue,
    };
    if (g.rotation !== undefined) {
      if (typeof g.rotation !== 'number' || Math.abs(g.rotation) > 360) fail(`${where}.gradient.rotation must be degrees -360..360.`);
      p.Rotation = num(g.rotation);
    }
    if (g.t !== undefined) {
      // One number means the same transparency at both ends.
      const gt = typeof g.t === 'number' ? [g.t, g.t] : g.t;
      if (!Array.isArray(gt) || gt.length !== 2) fail(`${where}.gradient.t must be [start, end] transparency (or one number for both).`);
      p.Transparency = { t: 'NumberSequence', v: [[0, unit(gt[0], `${where}.gradient.t[0]`), 0], [1, unit(gt[1], `${where}.gradient.t[1]`), 0]] } as PropValue;
    }
    dec('UIGradient', p);
  }
  if (n.clip === true) props.ClipsDescendants = bool(true);

  /* text -------------------------------------------------------------------------------- */
  const takesText = TEXT_KINDS.has(kind) && className !== 'ImageButton';
  if (!takesText) {
    for (const k of ['text', 'font', 'fontSize', 'scale', 'color', 'alignX', 'alignY', 'truncate', 'rich', 'lineHeight', 'placeholder'] as const) {
      if (n[k] !== undefined && !(k === 'color' && kind === 'divider')) fail(`${where}: ${k} belongs on a text, button or input, not a ${kind}${kind === 'button' ? ' with only an image' : ''}.`);
    }
  } else {
    const text = n.text ?? '';
    if (typeof text !== 'string' || text.length > UI_ENGINE_LIMITS.text) fail(`${where}.text must be a string of up to ${UI_ENGINE_LIMITS.text} characters.`);
    if (kind === 'button' && kids.length && text) fail(`${where}: a button with children shows them, not text; put the label in a text child.`);
    props.Text = str(text);
    props.FontFace = fontFace(n.font ?? 'BuilderSans', `${where}.font`);
    // No colour given: the readable one of white and near-black over the nearest filled background.
    const ink = n.color ?? (bg && contrast('#ffffff', bg) < contrast('#111111', bg) ? '#111111' : '#ffffff');
    props.TextColor3 = colour(ink, `${where}.color`);
    if (n.textT !== undefined) props.TextTransparency = num(unit(n.textT, `${where}.textT`));
    if (n.scale !== undefined) {
      if (!Array.isArray(n.scale) || n.scale.length !== 2) fail(`${where}.scale must be [minPx, maxPx].`);
      const [lo, hi] = [px(n.scale[0], `${where}.scale[0]`, 1), px(n.scale[1], `${where}.scale[1]`, 1)];
      if (lo > hi || hi > 100) fail(`${where}.scale must be [min, max] with min <= max <= 100.`);
      if (autoAxes.size) fail(`${where}: scaled text needs a box that does not size to its text; give w and h, not "auto".`);
      props.TextScaled = bool(true);
      dec('UITextSizeConstraint', { MinTextSize: num(lo), MaxTextSize: num(hi) });
    } else {
      props.TextSize = num(n.fontSize === undefined ? 16 : px(n.fontSize, `${where}.fontSize`, 6));
    }
    const singleLine = n.truncate === true || (autoAxes.has('X') && !n.multiline);
    props.TextWrapped = bool(!singleLine);
    if (n.truncate === true) {
      if (autoAxes.has('X')) fail(`${where}: truncate needs a width that is not "auto" (it grows instead of cutting).`);
      props.TextTruncate = en('TextTruncate', 'AtEnd');
    }
    const alignX = n.alignX ?? (kind === 'input' || kind === 'text' ? 'left' : 'center');
    props.TextXAlignment = en('TextXAlignment', { left: 'Left', center: 'Center', right: 'Right' }[oneOf(alignX, ['left', 'center', 'right'] as const, `${where}.alignX`)]);
    const alignY = n.alignY ?? (kind === 'input' && n.multiline ? 'top' : 'center');
    props.TextYAlignment = en('TextYAlignment', { top: 'Top', center: 'Center', bottom: 'Bottom' }[oneOf(alignY, ['top', 'center', 'bottom'] as const, `${where}.alignY`)]);
    if (n.rich === true) props.RichText = bool(true);
    if (n.textStroke !== undefined && kind !== 'button') {
      if (n.stroke !== undefined && kind === 'text') fail(`${where}: on a text, stroke already outlines the letters; use one of stroke or textStroke.`);
      dec('UIStroke', textStrokeProps(n.textStroke, where));
    }
    if (n.lineHeight !== undefined) {
      if (typeof n.lineHeight !== 'number' || n.lineHeight < 0.8 || n.lineHeight > 3) fail(`${where}.lineHeight must be 0.8-3.`);
      props.LineHeight = num(n.lineHeight);
    }
  }
  if (kind === 'input') {
    props.ClearTextOnFocus = bool(false);
    if (n.placeholder !== undefined) props.PlaceholderText = str(String(n.placeholder).slice(0, 200));
    if (n.placeholderColor !== undefined) props.PlaceholderColor3 = colour(n.placeholderColor, `${where}.placeholderColor`);
    if (n.multiline) props.MultiLine = bool(true);
  }
  if (kind === 'button') props.AutoButtonColor = bool(true);
  if (hasImage) {
    props.Image = str(String(n.image));
    props.ScaleType = en('ScaleType', { fit: 'Fit', crop: 'Crop', stretch: 'Stretch' }[oneOf(n.fit ?? 'fit', ['fit', 'crop', 'stretch'] as const, `${where}.fit`)]);
    if (n.tint !== undefined) props.ImageColor3 = colour(n.tint, `${where}.tint`);
    if (n.imageT !== undefined) props.ImageTransparency = num(unit(n.imageT, `${where}.imageT`));
  } else if (n.fit !== undefined || n.tint !== undefined || n.imageT !== undefined) {
    fail(`${where}: fit/tint/imageT need an image.`);
  }
  if (kind === 'divider') {
    props.BackgroundColor3 = colour(n.color ?? n.bg ?? (bg && contrast('#ffffff', bg) < contrast('#111111', bg) ? '#111111' : '#ffffff'), `${where}.color`);
    props.BackgroundTransparency = num(n.bgT ?? (n.color || n.bg ? 0 : 0.85));
  }

  /* padding: an explicit pad wins; text on a filled box always gets room to breathe --------- */
  const filled = n.bg !== undefined && (n.bgT ?? 0) < 0.95;
  let pad = n.pad === undefined ? null : padding(n.pad, `${where}.pad`);
  if (!pad && takesText && (filled || kind === 'input')) pad = kind === 'text' ? [4, 8, 4, 8] : [0, 12, 0, 12];
  if (!pad && kind === 'button' && kids.length) pad = [0, 12, 0, 12];
  if (pad && pad.some((v) => v > 0)) {
    dec('UIPadding', { PaddingTop: udim(0, pad[0]), PaddingRight: udim(0, pad[1]), PaddingBottom: udim(0, pad[2]), PaddingLeft: udim(0, pad[3]) });
  }

  /* layout of the children -------------------------------------------------------------- */
  if (ownLayout === 'v' || ownLayout === 'h') {
    const lp: P = {
      FillDirection: en('FillDirection', ownLayout === 'h' ? 'Horizontal' : 'Vertical'),
      SortOrder: en('SortOrder', 'LayoutOrder'),
      Padding: udim(0, n.gap === undefined ? 0 : px(n.gap, `${where}.gap`)),
    };
    const align = n.align === undefined ? null : oneOf(n.align, ['start', 'center', 'end'] as const, `${where}.align`);
    const justify = n.justify === undefined ? null : oneOf(n.justify, ['start', 'center', 'end', 'between', 'around', 'evenly'] as const, `${where}.justify`);
    const H = { start: 'Left', center: 'Center', end: 'Right' } as const;
    const V = { start: 'Top', center: 'Center', end: 'Bottom' } as const;
    const crossKey = ownLayout === 'h' ? 'VerticalAlignment' : 'HorizontalAlignment';
    const mainKey = ownLayout === 'h' ? 'HorizontalAlignment' : 'VerticalAlignment';
    if (align) lp[crossKey] = en(crossKey, (ownLayout === 'h' ? V : H)[align]);
    if (justify === 'start' || justify === 'center' || justify === 'end') lp[mainKey] = en(mainKey, (ownLayout === 'h' ? H : V)[justify]);
    else if (justify) lp[ownLayout === 'h' ? 'HorizontalFlex' : 'VerticalFlex'] = en('UIFlexAlignment', { between: 'SpaceBetween', around: 'SpaceAround', evenly: 'SpaceEvenly' }[justify]);
    if (n.wrap === true) {
      if (ownLayout !== 'h') fail(`${where}.wrap: only a horizontal stack wraps (chips, tags).`);
      lp.Wraps = bool(true);
    }
    dec('UIListLayout', lp);
  } else if (ownLayout === 'grid') {
    const gap = n.gap === undefined ? 0 : px(n.gap, `${where}.gap`);
    let cell: PropValue;
    if (n.cols !== undefined) {
      if (!Number.isInteger(n.cols) || n.cols < 1 || n.cols > 12) fail(`${where}.cols must be 1-12.`);
      const cellH = Array.isArray(n.cell) ? px(n.cell[1], `${where}.cell[1]`, 8) : fail(`${where}: a grid with cols needs cell: [0, heightPx] (the width comes from cols).`);
      // Each column takes 1/cols of the width minus its share of the gaps.
      cell = udim2(1 / n.cols, -gap * (n.cols - 1) / n.cols, 0, cellH);
    } else if (Array.isArray(n.cell) && n.cell.length === 2) {
      cell = udim2(0, px(n.cell[0], `${where}.cell[0]`, 8), 0, px(n.cell[1], `${where}.cell[1]`, 8));
    } else {
      return fail(`${where}: a grid needs cell: [widthPx, heightPx], or cols with cell: [0, heightPx].`);
    }
    const gp: P = { SortOrder: en('SortOrder', 'LayoutOrder'), CellSize: cell, CellPadding: udim2(0, gap, 0, gap) };
    if (n.align) gp.HorizontalAlignment = en('HorizontalAlignment', { start: 'Left', center: 'Center', end: 'Right' }[oneOf(n.align, ['start', 'center', 'end'] as const, `${where}.align`)]);
    dec('UIGridLayout', gp);
  } else if (n.gap !== undefined || n.align !== undefined || n.justify !== undefined) {
    fail(`${where}: gap/align/justify need a layout: for children in a column or row use type "stack" (or add dir "v"/"h" to this ${kind}); a frame without dir places children only by their at/offset.`);
  }
  if (kind === 'scroll') {
    const dirH = ownLayout === 'h';
    props.ScrollingDirection = en('ScrollingDirection', dirH ? 'X' : 'Y');
    props.AutomaticCanvasSize = en('AutomaticSize', dirH ? 'X' : 'Y');
    props.CanvasSize = udim2(0, 0, 0, 0);
    props.ScrollBarThickness = num(n.bar === undefined ? 6 : px(n.bar, `${where}.bar`));
    if (n.barColor !== undefined) props.ScrollBarImageColor3 = colour(n.barColor, `${where}.barColor`);
    // The bar takes its own lane, so it never sits on the content.
    props.VerticalScrollBarInset = en('ScrollBarInset', dirH ? 'None' : 'ScrollBar');
    props.ClipsDescendants = bool(true);
    if (autoAxes.has(dirH ? 'X' : 'Y')) fail(`${where}: a scroll area must not size to its content along its scroll axis; give ${dirH ? 'w' : 'h'} a number, a percent or "fill".`);
  }

  /* children ----------------------------------------------------------------------------- */
  const childCtx: Ctx = { layout: ownLayout, bg };
  const names = new Set<string>();
  const childSpecs: Spec[] = [];
  let count = 1 + decor.length;
  const counters: Record<string, number> = {};
  kids.forEach((child, i) => {
    const t = child && typeof child === 'object' ? String((child as UiNode).type) : 'node';
    counters[t] = (counters[t] ?? 0) + 1;
    const autoName = `${t.charAt(0).toUpperCase()}${t.slice(1)}${counters[t]}`;
    const c = compileNode(child, childCtx, `${where}.children[${i}]`, depth + 1, build, autoName, namePath);
    if (names.has(c.spec.name)) fail(`${where} has two children named ${c.spec.name}; sibling names must differ so each has one path.`);
    names.add(c.spec.name);
    if (ownLayout !== 'free') c.spec.props = { ...c.spec.props, LayoutOrder: num(i + 1) };
    childSpecs.push(c.spec);
    count += c.count;
  });
  if (decor.length + childSpecs.length > 40) fail(`${where} has too many children for one object; group some.`);

  /* lint what the engine cannot fix ------------------------------------------------------ */
  const mainAuto = (ownLayout === 'v' && autoAxes.has('Y')) || (ownLayout === 'h' && autoAxes.has('X'));
  if (mainAuto && kids.some((k) => (ownLayout === 'v' ? k?.h : k?.w) === 'fill' || k?.type === 'spacer')) {
    build.warnings.push(`${where} sizes to its content along ${ownLayout === 'v' ? 'h' : 'w'}, so a "fill" child or spacer inside it gets 0 px; give ${where} a fixed or percent ${ownLayout === 'v' ? 'h' : 'w'}.`);
  }
  if (ownLayout === 'v' || ownLayout === 'h') {
    const key = ownLayout === 'v' ? 'h' : 'w';
    const pct = kids.reduce((sum, k) => { const m = /^(\d+(?:\.\d+)?)%$/.exec(String(k?.[key] ?? '')); return sum + (m ? Number(m[1]) : 0); }, 0);
    if (pct > 100 || (pct === 100 && (n.gap ?? 0) > 0)) build.warnings.push(`${where}: its children's ${key} percents add up to ${pct}% plus gaps, so they overflow; use "fill" (with grow for weights).`);
  }
  if (ownLayout === 'free') {
    const unplaced = kids.filter((k) => k && typeof k === 'object' && k.at === undefined && k.offset === undefined);
    if (unplaced.length > 1) build.warnings.push(`${where} places children freely and ${unplaced.length} of them have no at/offset, so they sit on top of each other at the top-left; make ${where} a stack (or give it dir) to lay them out in order.`);
  }
  if (kind === 'button' || kind === 'input') build.interactive.push(namePath);

  if (n.textStroke !== undefined && !takesText) fail(`${where}: textStroke outlines text; put it on a text, button or input.`);
  if (n.pattern !== undefined || n.depth !== undefined || n.skin !== undefined) {
    if (kind !== 'frame' && kind !== 'stack' && kind !== 'grid' && kind !== 'button') fail(`${where}: pattern, skin and depth go on a frame, stack, grid or button.`);
    if (n.pattern !== undefined && n.skin !== undefined) fail(`${where}: one image per object: use pattern or skin, not both (nest a frame for the other).`);
    if (className === 'ImageButton') fail(`${where}: an image-only button already shows an image; put pattern or depth on a frame around it.`);
  }
  const dressed = dress({ n, kind, className, name, props, decor, childSpecs, where, autoAxes, takesText });
  return { spec: dressed.spec, count: count + dressed.added };
}

export interface CompiledScreen { item: InstanceSpec; name: string; count: number; interactive: string[]; warnings: string[] }

const INSETS = { safe: 'CoreUISafeInsets', device: 'DeviceSafeInsets', none: 'None' } as const;

/** Compile build_ui arguments to one create_instances item (a ScreenGui in StarterGui), or say exactly what is wrong. */
export function compileScreen(a: Args): CompiledScreen | Refusal {
  try {
    const name = typeof a.name === 'string' ? a.name : '';
    if (!NAME.test(name)) fail('name must be the ScreenGui name: letters, digits and _, starting with a letter (e.g. "AdminPanel").');
    if (!Array.isArray(a.children) || a.children.length === 0) fail('children must list the top-level nodes of the screen (1-12).');
    const top = expandList(a.children as unknown[], styleMap(a.styles), 'children');
    if (top.length > 12) fail('children may list at most 12 top-level nodes.');
    const insets = oneOf(a.insets ?? 'safe', Object.keys(INSETS) as (keyof typeof INSETS)[], 'insets');
    const props: P = {
      ResetOnSpawn: bool(false),
      ZIndexBehavior: en('ZIndexBehavior', 'Sibling'),
      IgnoreGuiInset: bool(true),
      ScreenInsets: en('ScreenInsets', INSETS[insets]),
    };
    if (a.enabled === false) props.Enabled = bool(false);
    if (a.displayOrder !== undefined) {
      if (!Number.isInteger(a.displayOrder) || (a.displayOrder as number) < -100 || (a.displayOrder as number) > 100) fail('displayOrder must be a whole number -100..100.');
      props.DisplayOrder = num(a.displayOrder as number);
    }
    const build: Build = { count: 0, nodes: 0, interactive: [], warnings: [] };
    const seen = new Set<string>();
    const counters: Record<string, number> = {};
    const children: Spec[] = [];
    let count = 1;
    top.forEach((node, i) => {
      const t = node && typeof node === 'object' ? String((node as UiNode).type) : 'node';
      counters[t] = (counters[t] ?? 0) + 1;
      const c = compileNode(node, { layout: 'free', bg: null }, `children[${i}]`, 1, build, `${t.charAt(0).toUpperCase()}${t.slice(1)}${counters[t]}`, '');
      if (seen.has(c.spec.name)) fail(`two top-level nodes are named ${c.spec.name}.`);
      seen.add(c.spec.name);
      children.push(c.spec);
      count += c.count;
    });
    if (count > UI_ENGINE_LIMITS.instances) fail(`the screen compiles to ${count} objects (limit ${UI_ENGINE_LIMITS.instances}); split it into more screens.`);
    return {
      item: { className: 'ScreenGui', name, parent: 'game.StarterGui', props, children },
      name, count, interactive: build.interactive, warnings: build.warnings,
    };
  } catch (err) {
    if (err instanceof UiError) return { error: `${err.message} Nothing was sent to Studio.` };
    throw err;
  }
}

/* -------------------------------------------------------------------------- tools --- */

const isRefusal = (v: unknown): v is Refusal => !!v && typeof v === 'object' && 'error' in (v as object);

function viewportsArg(v: unknown): UiViewport[] | undefined | Refusal {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length === 0 || v.length > 5 || !v.every((d) => UI_VIEWPORTS.includes(d as UiViewport))) {
    return { error: `viewports must list 1-5 of ${UI_VIEWPORTS.join(', ')}. Nothing was sent to Studio.` };
  }
  return [...new Set(v as UiViewport[])];
}

/** The plugin's report, with what to do about it. */
function verdict(raw: unknown): unknown {
  if (isRefusal(raw)) return { notChecked: raw.error };
  const r = (raw ?? {}) as Args;
  const defects = Array.isArray(r.defects) ? r.defects : [];
  return {
    verdict: defects.length ? 'defects' : 'pass',
    defects,
    ...(r.truncated ? { truncated: true } : {}),
    viewports: r.viewports,
  };
}

const VIEWPORT_SCHEMA = { type: 'array', items: { type: 'string', enum: [...UI_VIEWPORTS] }, maxItems: 5, description: 'default: all five (desktop 1920x1080, laptop 1366x768, tablet 1024x768, phone_landscape 844x390, phone_portrait 390x844)' };

export const buildUi = {
  def: {
    name: 'build_ui',
    description:
      'Build a whole screen of UI (a ScreenGui in StarterGui) from a declarative tree YOU design: your colours, fonts, sizes and composition, fitted to what was asked. ' +
      'The engine makes it technically correct (layouts, padding, wrapping, flex fill, scroll canvas, z-order) and then lays it out at five screen sizes and returns every defect it measured: text that does not fit, things spilling out of their parent, overlapping siblings, covered buttons, small touch targets, tiny text. ' +
      'Fix each defect by calling build_ui again with the same name: it REPLACES that screen. Load the ui-design skill first for the full schema and design method. ' +
      `Node = {type, name?, children?, ...}. types: ${UI_KINDS.join(', ')}. ` +
      'Size: w/h = pixels | "fill" | "auto" | "NN%"; minW/maxW/minH/maxH px; aspect; grow (weight of a fill in a stack). ' +
      `Place (outside stacks/grids): at ${UI_PLACEMENTS.join('|')}, offset [x, y] px inward; z. ` +
      'Containers: stack {dir v|h, gap, pad, align start|center|end, justify start|center|end|between|around|evenly, wrap}; grid {cell [w,h] px, or cols + cell [0,h], gap}; scroll {dir, gap, pad, or cols/cell}; frame (free placement, or dir for a list); button may hold children. ' +
      'Look: bg "#hex", bgT 0-1, radius px|"pill", stroke {color, width, t}, gradient {colors, rotation, t:[a,b]}, clip. ' +
      `Text (text, button, input): text, font "Family" or "Family:Weight" (${UI_FONT_FAMILIES.slice(0, 8).join(', ')}, ...), fontSize px or scale [min,max], color, alignX, alignY, truncate, rich, lineHeight. ` +
      'input: placeholder, placeholderColor, multiline. image/icon: image "rbxassetid://N", fit fit|crop|stretch, tint. divider: color, thickness. ' +
      'Art: skin {image, size:[w,h], slice} draws a picture (from make_image) as the object itself, 9-sliced so it stretches; text sits on top. ' +
      'Game-UI depth: textStroke {color,width,t} outlines text (also on bordered buttons); depth {color,px} puts a darker base edge under a button or panel (needs non-auto w/h; the content sits in a child named Face); pattern {image,tile,t,tint} tiles a texture such as studs across a frame, stack, grid or button. ' +
      'Write less: define each look once in `styles` ({"card":{"bg":"#1e2430","radius":12},"label":{"type":"text","font":"Montserrat:Medium","color":"#c9d1e0"}}) and give nodes style:"card" or ["card","label"] (the node\'s own fields win). ' +
      'Repeat a child with each: [...]: {"type":"button","style":"tab","each":["Kick","Ban"]} makes one per item (a string sets text; an object sets fields), or use {key} placeholders: {"type":"stack","dir":"h","children":[{"type":"text","text":"{n}"},{"type":"text","text":"{p}"}],"each":[{"n":"Sword","p":"100"}]}. ' +
      'Behaviour goes in a LocalScript you write with edit_script in StarterPlayerScripts (it survives a rebuild), finding the screen with PlayerGui:WaitForChild(name).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'the ScreenGui name, e.g. "AdminPanel"; an existing screen of this name is replaced' },
        children: { type: 'array', items: { type: 'object' }, maxItems: 12, description: 'top-level nodes, placed freely with at/offset' },
        styles: { type: 'object', description: 'named looks used by nodes\' style field: {"name": {node fields except name/children}}' },
        insets: { type: 'string', enum: Object.keys(INSETS), description: 'safe (default): keep clear of the top bar and notches; device: only notches; none: the whole screen' },
        enabled: { type: 'boolean', description: 'false for a screen a script opens later (default true)' },
        displayOrder: { type: 'integer', description: 'which screen draws on top (higher)' },
        replaceScripts: { type: 'boolean', description: 'allow replacing a screen that holds scripts (they are deleted with it)' },
        viewports: VIEWPORT_SCHEMA,
      },
      required: ['name', 'children'],
    },
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    const compiled = compileScreen(a);
    if (isRefusal(compiled)) return compiled;
    const viewports = viewportsArg(a.viewports);
    if (isRefusal(viewports)) return viewports;
    // Same name = the same screen: the old one goes, so every path into the screen stays unique.
    const existing = await call({ op: 'query_instances', root: 'game.StarterGui', className: 'ScreenGui', name: compiled.name, limit: 20 });
    if (isRefusal(existing)) return { error: `${existing.error} Could not check for an existing ${compiled.name}, so nothing was built.` };
    const old = (((existing as Args).matches as Array<{ path?: unknown }> | undefined) ?? [])
      .map((m) => m.path)
      .filter((p): p is string => typeof p === 'string' && p.endsWith(`StarterGui.${compiled.name}`));
    if (old.length && a.replaceScripts !== true) {
      for (const path of old) {
        const scripts = await call({ op: 'query_instances', root: path, isA: 'LuaSourceContainer', limit: 10 });
        const found = isRefusal(scripts) ? [] : (((scripts as Args).matches as Array<{ path?: unknown }> | undefined) ?? []).map((m) => String(m.path));
        if (found.length) {
          return { error: `${path} holds script(s) ${found.join(', ')}, which a rebuild would delete. Move them to StarterPlayerScripts (edit_script), or pass replaceScripts: true. Nothing was changed.` };
        }
      }
    }
    if (old.length) {
      const removed = await call({ op: 'delete_instances', paths: old });
      if (isRefusal(removed)) return { error: `${removed.error} The old ${compiled.name} could not be removed, so nothing was built.` };
    }
    const made = await call({ op: 'create_instances', items: [compiled.item] }, 60_000);
    if (isRefusal(made)) return made;
    const created = (made as Args).created;
    const screen = Array.isArray(created) && typeof created[0] === 'string' ? created[0] : `game.StarterGui.${compiled.name}`;
    const measured = await call({ op: 'measure_ui', screen, ...(viewports ? { viewports } : {}) }, 90_000);
    const check = verdict(measured) as Args;
    return {
      built: screen,
      replaced: old.length > 0,
      objects: compiled.count,
      ...(compiled.interactive.length ? { interactive: compiled.interactive.slice(0, 24).map((p) => `${screen}.${p}`) } : {}),
      ...(compiled.warnings.length ? { warnings: compiled.warnings } : {}),
      layout: check,
      next: check.notChecked
        ? 'The screen is built but its layout was NOT measured; say so rather than calling it correct.'
        : check.verdict === 'pass'
          ? 'Built and measured clean at every size. Wire behaviour with a LocalScript (edit_script), then prove it with play_check.'
          : 'Fix every defect (resize, pad, wrap or shorten text, move, use fill/grow, raise z): a few values with set_properties then check_ui, or a structural change with build_ui again under the same name.',
      ...(made && typeof made === 'object' && 'propIssues' in (made as object) ? { propIssues: (made as Args).propIssues } : {}),
    };
  },
};

export const checkUi = {
  def: {
    name: 'check_ui',
    description:
      'Measure an existing ScreenGui at five screen sizes WITHOUT changing the place (a temporary copy in Studio\'s own UI layer, always removed) and list every defect: text that does not fit, elements spilling out of their parent or the screen, overlapping siblings, covered buttons/inputs, touch targets under 32 px and text under 12 px on touch screens, scaled text with no size limit, low contrast. ' +
      'Use it on UI made or edited by other means; build_ui already runs it.',
    parameters: {
      type: 'object',
      properties: { screen: { type: 'string', description: 'a ScreenGui path, e.g. game.StarterGui.AdminPanel' }, viewports: VIEWPORT_SCHEMA },
      required: ['screen'],
    },
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    if (typeof a.screen !== 'string' || !a.screen || a.screen.length > 320) return { error: 'screen must be a ScreenGui path. Nothing was sent to Studio.' };
    const viewports = viewportsArg(a.viewports);
    if (isRefusal(viewports)) return viewports;
    const measured = await call({ op: 'measure_ui', screen: a.screen, ...(viewports ? { viewports } : {}) }, 90_000);
    if (isRefusal(measured)) return measured;
    return { screen: a.screen, ...(verdict(measured) as Args) };
  },
};
