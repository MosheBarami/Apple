// build_ui: a small declarative layout tree -> ONE create_instances item (a ScreenGui in StarterGui).
//
// The model describes WHAT the screen holds (a panel with a title, a grid of cards, a buy button);
// this file decides HOW it is built, from the genre theme in ui-kit-themes.ts. Every size is a
// fraction of the parent and every text scales between a minimum and a maximum, so the same tree
// fits a phone and a monitor — the two mistakes that made hand-built screens fail on phones were
// pixel sizes and text that never scaled.
//
// Output is data only: class names, property names and enum values from a fixed vocabulary, all of
// which the plugin's create allowlist accepts (tests/phase-a-tools.test.mjs reads Commands.luau and
// ops/Ui.luau and fails if this file ever emits anything they do not list). No script is created.
import type { InstanceSpec, PropValue } from '@golem/shared';
import { APPLE_UI_THEMES, type AppleUITheme } from './ui-kit-themes';

export const UI_NODE_KINDS = ['panel', 'card', 'row', 'column', 'grid', 'scroll', 'text', 'button', 'bar', 'spacer'] as const;
export const UI_ANCHORS = ['center', 'top', 'bottom', 'left', 'right', 'top_left', 'top_right', 'bottom_left', 'bottom_right'] as const;
type Kind = (typeof UI_NODE_KINDS)[number];
type Anchor = (typeof UI_ANCHORS)[number];

export const UI_BUILD_LIMITS = Object.freeze({ nodes: 120, depth: 6, topLevel: 8, children: 32, text: 200, instances: 400 });

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
/** Names the builder gives its own decoration children; an id may not take one. */
const RESERVED = new Set(['Corner', 'Stroke', 'Padding', 'Layout', 'TextLimit', 'SizeLimit', 'Fill']);
const CONTAINERS: ReadonlySet<Kind> = new Set(['panel', 'card', 'row', 'column', 'grid', 'scroll']);
const MARGIN = 0.02;

/** Default [w, h] fractions when a node gives no size: [top level, inside a vertical stack]. */
const DEFAULT_SIZE: Record<Kind, { top: [number, number]; stacked: number }> = {
  panel: { top: [0.42, 0.62], stacked: 0.5 },
  card: { top: [0.3, 0.4], stacked: 0.3 },
  row: { top: [0.6, 0.12], stacked: 0.2 },
  column: { top: [0.25, 0.5], stacked: 0.5 },
  grid: { top: [0.5, 0.5], stacked: 0.6 },
  scroll: { top: [0.4, 0.5], stacked: 0.6 },
  text: { top: [0.3, 0.08], stacked: 0.12 },
  button: { top: [0.18, 0.09], stacked: 0.16 },
  bar: { top: [0.3, 0.04], stacked: 0.07 },
  spacer: { top: [0.1, 0.05], stacked: 0.05 },
};

type P = Record<string, PropValue>;
const udim2 = (xs: number, xo: number, ys: number, yo: number): PropValue => ({ t: 'UDim2', v: [xs, xo, ys, yo] }) as PropValue;
const udim = (s: number, o: number): PropValue => ({ t: 'UDim', v: [s, o] }) as PropValue;
const vec2 = (x: number, y: number): PropValue => ({ t: 'Vector2', v: [x, y] }) as PropValue;
const num = (v: number): PropValue => ({ t: 'number', v }) as PropValue;
const bool = (v: boolean): PropValue => ({ t: 'bool', v }) as PropValue;
const str = (v: string): PropValue => ({ t: 'string', v }) as PropValue;
const enumItem = (v: string): PropValue => ({ t: 'EnumItem', v }) as PropValue;
const round = (n: number) => Math.round(n * 10_000) / 10_000;

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => round(Number.parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
}
const colour = (hex: string): PropValue => ({ t: 'Color3', v: rgb(hex) }) as PropValue;

function luminance(hex: string): number {
  const ch = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb(hex).map(ch) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio, the same formula ops/Ui.luau uses for its low_contrast check. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** The preferred ink if it reads on `background`, else white or the theme outline, whichever reads best. */
export function readableInk(preferred: string, background: string, outline: string): string {
  for (const candidate of [preferred, '#ffffff', outline]) if (contrastRatio(candidate, background) >= 4.5) return candidate;
  return [preferred, '#ffffff', outline].sort((x, y) => contrastRatio(y, background) - contrastRatio(x, background))[0]!;
}

interface Node {
  kind: Kind;
  id?: string;
  text?: string;
  style?: string;
  size?: [number, number];
  anchor?: Anchor;
  value?: number;
  cell?: [number, number];
  gap?: number;
  children?: Node[];
}

export interface CompiledUi {
  item: InstanceSpec;
  screenName: string;
  /** Paths of every button RELATIVE to the ScreenGui ("Panel.Buy"), for play_check_ui. */
  buttons: string[];
  count: number;
}

type Fail = { error: string };

function fraction(v: unknown, label: string, lo = 0.02, hi = 1): [number, number] | Fail {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi)) {
    return { error: `${label} must be [width, height] fractions of the parent, each ${lo}-${hi} (not pixels).` };
  }
  return [v[0], v[1]];
}

/** Read and check the model's tree. Every refusal names the node by its position. */
function readTree(raw: unknown, where: string, depth: number, state: { nodes: number; ids: Set<string> }, top: boolean): Node | Fail {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: `${where} must be a node object {kind, ...}.` };
  const r = raw as Record<string, unknown>;
  if (++state.nodes > UI_BUILD_LIMITS.nodes) return { error: `The tree has more than ${UI_BUILD_LIMITS.nodes} nodes; split the screen.` };
  if (depth > UI_BUILD_LIMITS.depth) return { error: `${where} is nested deeper than ${UI_BUILD_LIMITS.depth} levels.` };
  const kind = r.kind as Kind;
  if (!UI_NODE_KINDS.includes(kind)) return { error: `${where}.kind must be one of ${UI_NODE_KINDS.join(', ')}.` };
  const node: Node = { kind };
  if (r.id !== undefined) {
    if (typeof r.id !== 'string' || !NAME.test(r.id)) return { error: `${where}.id must be a letter then letters, digits or _ (at most 41).` };
    if (RESERVED.has(r.id)) return { error: `${where}.id "${r.id}" is reserved for the builder's own parts; choose another.` };
    if (state.ids.has(r.id)) return { error: `${where}.id "${r.id}" is used twice; ids must be unique.` };
    state.ids.add(r.id);
    node.id = r.id;
  }
  if (kind === 'text' || kind === 'button') {
    if (typeof r.text !== 'string' || !r.text.trim() || r.text.length > UI_BUILD_LIMITS.text) return { error: `${where}.text must be 1-${UI_BUILD_LIMITS.text} characters.` };
    node.text = r.text;
  } else if (r.text !== undefined) {
    return { error: `${where} is a ${kind}; only text and button nodes carry text (add a text child).` };
  }
  if (r.style !== undefined) {
    const allowed = kind === 'text' ? ['title', 'body', 'muted'] : kind === 'button' ? ['primary', 'secondary', 'danger'] : [];
    if (!allowed.includes(r.style as string)) return { error: allowed.length ? `${where}.style must be ${allowed.join(', ')}.` : `${where} is a ${kind} and takes no style.` };
    node.style = r.style as string;
  }
  if (r.size !== undefined) {
    const s = fraction(r.size, `${where}.size`);
    if ('error' in s) return s;
    node.size = s;
  }
  if (r.anchor !== undefined) {
    if (!top) return { error: `${where}.anchor only applies to top-level nodes; children are placed by their container.` };
    if (!UI_ANCHORS.includes(r.anchor as Anchor)) return { error: `${where}.anchor must be one of ${UI_ANCHORS.join(', ')}.` };
    node.anchor = r.anchor as Anchor;
  }
  if (kind === 'bar') {
    const v = r.value === undefined ? 0.5 : r.value;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return { error: `${where}.value must be 0-1.` };
    node.value = v;
  }
  if (r.cell !== undefined) {
    if (kind !== 'grid') return { error: `${where}.cell only applies to a grid.` };
    const c = fraction(r.cell, `${where}.cell`, 0.05, 1);
    if ('error' in c) return c;
    node.cell = c;
  }
  if (r.gap !== undefined) {
    if (typeof r.gap !== 'number' || !Number.isFinite(r.gap) || r.gap < 0 || r.gap > 40) return { error: `${where}.gap must be 0-40 pixels.` };
    node.gap = Math.round(r.gap);
  }
  if (r.children !== undefined) {
    if (!CONTAINERS.has(kind)) return { error: `${where} is a ${kind} and cannot hold children.` };
    if (!Array.isArray(r.children) || r.children.length > UI_BUILD_LIMITS.children) return { error: `${where}.children must be a list of at most ${UI_BUILD_LIMITS.children}.` };
    const kids: Node[] = [];
    for (const [i, child] of r.children.entries()) {
      const read = readTree(child, `${where}.children[${i}]`, depth + 1, state, false);
      if ('error' in read) return read;
      kids.push(read);
    }
    node.children = kids;
  }
  return node;
}

const ANCHOR_POINTS: Record<Anchor, [number, number]> = {
  center: [0.5, 0.5], top: [0.5, 0], bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5],
  top_left: [0, 0], top_right: [1, 0], bottom_left: [0, 1], bottom_right: [1, 1],
};

interface Surface { background: string | null }

class Builder {
  count = 1; // the ScreenGui
  buttons: string[] = [];
  constructor(private theme: AppleUITheme) {}

  private spec(className: string, name: string, props: P, children: Omit<InstanceSpec, 'parent'>[] = []): Omit<InstanceSpec, 'parent'> {
    this.count += 1;
    return children.length ? { className, name, props, children } : { className, name, props };
  }

  private corner(radius = this.theme.radius) {
    return this.spec('UICorner', 'Corner', { CornerRadius: udim(0, radius) });
  }

  private stroke() {
    return this.spec('UIStroke', 'Stroke', {
      Color: colour(this.theme.outline),
      Thickness: num(Math.max(1, this.theme.stroke)),
      ApplyStrokeMode: enumItem('Enum.ApplyStrokeMode.Border'),
    });
  }

  private list(direction: 'Vertical' | 'Horizontal', gap: number) {
    return this.spec('UIListLayout', 'Layout', {
      FillDirection: enumItem(`Enum.FillDirection.${direction}`),
      HorizontalAlignment: enumItem('Enum.HorizontalAlignment.Center'),
      VerticalAlignment: enumItem(direction === 'Vertical' ? 'Enum.VerticalAlignment.Top' : 'Enum.VerticalAlignment.Center'),
      SortOrder: enumItem('Enum.SortOrder.LayoutOrder'),
      Padding: udim(0, gap),
    });
  }

  private textLimit(max: number) {
    return this.spec('UITextSizeConstraint', 'TextLimit', { MinTextSize: num(12), MaxTextSize: num(max) });
  }

  /** Size and position of one node inside its parent. */
  private placement(node: Node, parent: Kind | 'screen', siblings: number): P {
    const d = DEFAULT_SIZE[node.kind];
    if (parent === 'screen') {
      const [w, h] = node.size ?? d.top;
      const [ax, ay] = ANCHOR_POINTS[node.anchor ?? 'center'];
      const px = ax === 0 ? MARGIN : ax === 1 ? 1 - MARGIN : 0.5;
      const py = ay === 0 ? MARGIN : ay === 1 ? 1 - MARGIN : 0.5;
      return { Size: udim2(w, 0, h, 0), AnchorPoint: vec2(ax, ay), Position: udim2(px, 0, py, 0) };
    }
    if (parent === 'grid') return {}; // UIGridLayout sizes and places its cells
    if (parent === 'row') {
      const [w, h] = node.size ?? [round(0.96 / Math.max(1, siblings)), 1];
      return { Size: udim2(w, 0, h, 0) };
    }
    const [w, h] = node.size ?? [1, d.stacked];
    return { Size: udim2(w, 0, h, 0) };
  }

  node(node: Node, parent: Kind | 'screen', order: number, siblings: number, surface: Surface, path: string, autoName: string, scrollScale = 1): Omit<InstanceSpec, 'parent'> {
    const t = this.theme;
    const name = node.id ?? autoName;
    const here = path ? `${path}.${name}` : name;
    const place = this.placement(node, parent, siblings);
    if (scrollScale !== 1 && place.Size) {
      const [w, h] = (place.Size as unknown as { v: number[] }).v;
      place.Size = udim2(w!, 0, round(h! / scrollScale), 0);
    }
    const base: P = { ...place, ...(parent === 'screen' ? {} : { LayoutOrder: num(order) }) };
    const onSurface = (preferred: string) => readableInk(preferred, surface.background ?? t.panel, t.outline);

    switch (node.kind) {
      case 'text': {
        const style = node.style ?? 'body';
        const ink = style === 'muted' ? onSurface(t.muted) : onSurface(t.ink);
        const font = style === 'title' ? t.titleFont : style === 'muted' ? 'Gotham' : 'GothamMedium';
        const max = style === 'title' ? t.titleSize : style === 'muted' ? 18 : 22;
        return this.spec('TextLabel', name, {
          ...base,
          BackgroundTransparency: num(1),
          Text: str(node.text!),
          TextColor3: colour(ink),
          Font: enumItem(`Enum.Font.${font}`),
          TextScaled: bool(true),
          TextWrapped: bool(true),
          ...(surface.background === null ? { TextStrokeTransparency: num(0.4), TextStrokeColor3: colour(t.outline) } : {}),
        }, [this.textLimit(max)]);
      }
      case 'button': {
        const style = node.style ?? 'primary';
        const fill = style === 'primary' ? t.accent : style === 'danger' ? t.danger : t.card;
        const ink = readableInk(style === 'primary' ? t.accentInk : t.ink, fill, t.outline);
        this.buttons.push(here);
        return this.spec('TextButton', name, {
          ...base,
          BackgroundColor3: colour(fill),
          BorderSizePixel: num(0),
          Text: str(node.text!),
          TextColor3: colour(ink),
          Font: enumItem(`Enum.Font.${t.titleFont}`),
          TextScaled: bool(true),
          TextWrapped: bool(true),
        }, [
          this.corner(Math.min(t.radius, 14)),
          this.stroke(),
          this.spec('UISizeConstraint', 'SizeLimit', { MinSize: vec2(88, 44) }),
          this.textLimit(24),
        ]);
      }
      case 'bar': {
        return this.spec('Frame', name, { ...base, BackgroundColor3: colour(t.edge), BorderSizePixel: num(0) }, [
          this.corner(999),
          this.stroke(),
          this.spec('Frame', 'Fill', { Size: udim2(node.value ?? 0.5, 0, 1, 0), BackgroundColor3: colour(t.accent), BorderSizePixel: num(0) }, [this.corner(999)]),
        ]);
      }
      case 'spacer':
        return this.spec('Frame', name, { ...base, BackgroundTransparency: num(1) });
      default:
        return this.container(node, base, surface, here);
    }
  }

  private container(node: Node, base: P, surface: Surface, here: string): Omit<InstanceSpec, 'parent'> {
    const t = this.theme;
    const kids = node.children ?? [];
    const styled = node.kind === 'panel' || node.kind === 'card';
    const background = node.kind === 'panel' ? t.panel : node.kind === 'card' ? t.card : surface.background;
    const inner: Surface = { background };
    const gap = node.gap ?? (styled ? 10 : 8);
    const decoration: Omit<InstanceSpec, 'parent'>[] = [];
    const props: P = { ...base, BorderSizePixel: num(0) };
    if (styled) {
      props.BackgroundColor3 = colour(background!);
      decoration.push(this.corner(), this.stroke(), this.spec('UIPadding', 'Padding', {
        PaddingTop: udim(0, 12), PaddingBottom: udim(0, 12), PaddingLeft: udim(0, 12), PaddingRight: udim(0, 12),
      }));
    } else {
      props.BackgroundTransparency = num(1);
    }
    let scrollScale = 1;
    let className = 'Frame';
    if (node.kind === 'grid') {
      const [cw, ch] = node.cell ?? [0.3, 0.45];
      decoration.push(this.spec('UIGridLayout', 'Layout', {
        CellSize: udim2(cw, 0, ch, 0),
        CellPadding: udim2(0, gap, 0, gap),
        HorizontalAlignment: enumItem('Enum.HorizontalAlignment.Center'),
        SortOrder: enumItem('Enum.SortOrder.LayoutOrder'),
      }));
    } else if (node.kind === 'row') {
      decoration.push(this.list('Horizontal', gap));
    } else {
      decoration.push(this.list('Vertical', gap));
    }
    if (node.kind === 'scroll') {
      // A fixed canvas measured in window heights: children given as fractions of the VISIBLE
      // window are divided by it, so a card of 0.3 is 0.3 of the window however long the list is.
      // (Scale-sized children inside an AutomaticCanvasSize canvas grow with the canvas itself.)
      className = 'ScrollingFrame';
      const total = kids.reduce((sum, k) => sum + (k.size?.[1] ?? DEFAULT_SIZE[k.kind].stacked), 0) + 0.04 * kids.length;
      scrollScale = round(Math.max(1, total));
      Object.assign(props, {
        CanvasSize: udim2(0, 0, scrollScale, 0),
        ScrollingDirection: enumItem('Enum.ScrollingDirection.Y'),
        ScrollBarThickness: num(6),
        ClipsDescendants: bool(true),
      });
    }
    const counters = new Map<Kind, number>();
    const children = kids.map((child, i) => {
      const n = (counters.get(child.kind) ?? 0) + 1;
      counters.set(child.kind, n);
      const auto = `${child.kind[0]!.toUpperCase()}${child.kind.slice(1)}${n}`;
      return this.node(child, node.kind, i + 1, kids.length, inner, here, auto, scrollScale);
    });
    return this.spec(className, here.split('.').pop()!, props, [...decoration, ...children]);
  }
}

/** Compile build_ui arguments to one create_instances item, or say exactly what is wrong. */
export function compileUi(args: { screen: unknown; theme: unknown; tree: unknown; safeArea?: unknown }): CompiledUi | Fail {
  if (typeof args.screen !== 'string' || !NAME.test(args.screen)) return { error: 'screen must be a name like "ShopGui": a letter, then letters, digits or _.' };
  const theme = APPLE_UI_THEMES.find((th) => th.id === args.theme);
  if (!theme) return { error: `theme must be one of ${APPLE_UI_THEMES.map((th) => th.id).join(', ')}.` };
  if (args.safeArea !== undefined && typeof args.safeArea !== 'boolean') return { error: 'safeArea must be true or false.' };
  const rawTop = Array.isArray(args.tree) ? args.tree : [args.tree];
  if (rawTop.length === 0 || rawTop.length > UI_BUILD_LIMITS.topLevel) return { error: `tree must be one node or a list of 1-${UI_BUILD_LIMITS.topLevel} top-level nodes.` };
  const state = { nodes: 0, ids: new Set<string>() };
  const top: Node[] = [];
  for (const [i, raw] of rawTop.entries()) {
    const node = readTree(raw, Array.isArray(args.tree) ? `tree[${i}]` : 'tree', 1, state, true);
    if ('error' in node) return node;
    top.push(node);
  }
  const b = new Builder(theme);
  const counters = new Map<Kind, number>();
  const children = top.map((node) => {
    const n = (counters.get(node.kind) ?? 0) + 1;
    counters.set(node.kind, n);
    const auto = `${node.kind[0]!.toUpperCase()}${node.kind.slice(1)}${n}`;
    return b.node(node, 'screen', 0, top.length, { background: null }, '', auto);
  });
  if (b.count > UI_BUILD_LIMITS.instances) {
    return { error: `That screen needs ${b.count} instances; the limit for one call is ${UI_BUILD_LIMITS.instances}. Build it as two screens or with fewer nodes.` };
  }
  const safe = args.safeArea !== false;
  const item: InstanceSpec = {
    className: 'ScreenGui',
    name: args.screen,
    parent: 'game.StarterGui',
    props: {
      ResetOnSpawn: bool(false),
      ZIndexBehavior: enumItem('Enum.ZIndexBehavior.Sibling'),
      ...(safe ? { ScreenInsets: enumItem('Enum.ScreenInsets.CoreUISafeInsets') } : { IgnoreGuiInset: bool(true) }),
    },
    children,
  };
  return { item, screenName: args.screen, buttons: b.buttons, count: b.count };
}
