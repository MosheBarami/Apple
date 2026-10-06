/**
 * STUDKIT: the one look of StudPilot UI (planning/STYLE-BIBLE.md §3), built by hand in Studio on 2026-10-06 and compared
 * side by side with the owner's references R01, R02 and R04 (planning/proof/STYLE/kit/). Blocks place kit components;
 * nothing else draws UI. The model never reaches this file's values: it fills text, numbers, colour-token NAMES and icon
 * NAMES, and recipe.ts expands each `{ "kit": <component>, ... }` node of a block recipe through `expandKit`.
 *
 * Every object a component makes carries the attribute StudKit = "<component>.<part>", which the harness's kit lint
 * reads (scripts/eval/luau/kit-lint.luau): an untagged visible object, a text without an outline, a default font or a raw
 * grey fill fails a build before any critic sees it.
 *
 * The recipe of the look, from the references:
 *   - glossy fill: a white frame tinted top -> bottom by the token's gradient, a border of the token's dark shade, small
 *     rounded corners, a 2 px white highlight near the top, a black drop shadow 4 px below;
 *   - the stud texture: one square stud per tile (free decal 7447638611 -> image 7447638591), tiled at 26 px, 40 % visible;
 *   - text: FredokaOne, scaled with a size cap, always outlined; on a coloured face the outline is that face's dark shade,
 *     elsewhere near-black; money and gem numbers are coloured with a darker outline of the same hue;
 *   - icons overflow their tiles; badges sit half outside their panel's edge.
 */
import { ICONS } from './studkit-icons.generated.ts';

export const STUD_IMAGE = 'rbxassetid://7447638591';

/** Colour tokens (bible §3.2): top, bottom, border. The only colours a block may name. */
export const TOKENS = {
  lime: ['#C9F63E', '#7FD82A', '#4E8F22'],
  sky: ['#4FE3F5', '#1FA6E0', '#1673A8'],
  sun: ['#FFE23A', '#FF9F1C', '#B06A12'],
  berry: ['#FF4FA3', '#E0263F', '#9E1838'],
  grape: ['#C77DFF', '#8A3FFC', '#5A1FB0'],
  teal: ['#37E0C8', '#13A38F', '#0B6B5E'],
  slate: ['#5A6270', '#3E4450', '#23272F'],
} as const;
export type Token = keyof typeof TOKENS;
export const TOKEN_NAMES = Object.keys(TOKENS) as Token[];

/** Text inks (bible §3.2): fill and outline. */
export const INKS = {
  text: ['#FFFFFF', '#1B1B1F'],
  money: ['#6CFF3A', '#1E6B14'],
  gem: ['#5FE6FF', '#0E5F78'],
  gold: ['#FFE23A', '#7A3E06'],
  muted: ['#D9DEE6', '#23272F'],
} as const;
export type Ink = keyof typeof INKS;

type V = Record<string, unknown>;
export interface Spec { className: string; name: string; props?: V; attributes?: V; children?: Spec[] }

const udim2 = (xs: number, xo: number, ys: number, yo: number) => ({ t: 'UDim2', v: [xs, xo, ys, yo] });
const udim = (s: number, o: number) => ({ t: 'UDim', v: [s, o] });
const vec2 = (x: number, y: number) => ({ t: 'Vector2', v: [x, y] });
const enumOf = (kind: string, item: string) => ({ t: 'EnumItem', v: `Enum.${kind}.${item}` });
const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const gradient = (top: string, bottom: string) => ({ t: 'ColorSequence', v: [[0, hexRgb(top)], [1, hexRgb(bottom)]] });
/** The glossy fill (critic 2026-10-06: "no clear lighter top"): a light band over the top third, then top -> bottom. */
const gloss = (top: string, bottom: string) => {
  const light = hexRgb(top).map((c) => c + (1 - c) * 0.55) as [number, number, number];
  const deep = hexRgb(bottom).map((c) => c * 0.76) as [number, number, number];
  return { t: 'ColorSequence', v: [[0, light], [0.4, hexRgb(top)], [0.75, hexRgb(bottom)], [1, deep]] };
};
/** A button on a card of its own colour would vanish: it takes the next colour instead. */
const CONTRAST: Record<string, Token> = { lime: 'sun', sky: 'lime', sun: 'lime', berry: 'lime', grape: 'lime', teal: 'lime', slate: 'lime' };

const tag = (component: string, part: string): V => ({ StudKit: `${component}.${part}` });
const token = (t: unknown): Token => (typeof t === 'string' && t in TOKENS ? (t as Token) : 'sky');

/** Layout a block may give a component: where it sits and how big it is. Nothing about how it looks. */
export interface Place { size?: number[]; position?: number[]; anchor?: number[]; aspect?: number; order?: number | string; visible?: unknown; z?: number }
const placeProps = (p: Place = {}): V => ({
  ...(p.size ? { Size: udim2(p.size[0]!, p.size[1]!, p.size[2]!, p.size[3]!) } : {}),
  ...(p.position ? { Position: udim2(p.position[0]!, p.position[1]!, p.position[2]!, p.position[3]!) } : {}),
  ...(p.anchor ? { AnchorPoint: vec2(p.anchor[0]!, p.anchor[1]!) } : {}),
  ...(p.order !== undefined ? { LayoutOrder: p.order } : {}),
  ...(p.visible !== undefined ? { Visible: p.visible } : {}),
});

/** An outlined label. `ink` names a text ink; `on` (a token) makes the outline that face's dark shade. */
export function label(component: string, name: string, text: unknown, opts: { ink?: Ink; on?: Token; max?: number; stroke?: number; align?: 'Left' | 'Center' | 'Right'; body?: boolean; line?: boolean } & Place = {}): Spec {
  const ink = INKS[opts.ink ?? 'text'];
  const outline = opts.on && (opts.ink ?? 'text') === 'text' ? TOKENS[opts.on][2] : ink[1];
  return {
    className: 'TextLabel', name,
    props: {
      Size: udim2(1, 0, 1, 0), ...placeProps(opts), BackgroundTransparency: 1, Text: text, TextScaled: true,
      Font: enumOf('Font', opts.body ? 'GothamBlack' : 'FredokaOne'), TextColor3: ink[0],
      TextXAlignment: enumOf('TextXAlignment', opts.align ?? 'Center'), ZIndex: opts.z ?? 6,
      // `line`: a value ("1,284 wins") shrinks to fit one line instead of breaking in two (U10 render, 2026-10-06).
      ...(opts.line ? { TextWrapped: false } : {}),
    },
    attributes: tag(component, name),
    children: [
      // Thick outlines (critics 2026-10-06: "outlines are too thin"): a seventh of the text's cap, between 4 and 7 px (Studio captures at high DPI and halves them).
      // Small labels (a cap of 30 or less) get 3 px: at their size 4+ px turned a note into a dark pill (U01 critique, 2026-10-06).
      { className: 'UIStroke', name: 'Outline', props: { Thickness: opts.stroke ?? ((opts.max ?? 40) <= 30 ? 3 : Math.max(4, Math.min(7, (opts.max ?? 40) / 5.5))), Color: outline, LineJoinMode: enumOf('LineJoinMode', 'Round') } },
      { className: 'UITextSizeConstraint', name: 'Fit', props: { MaxTextSize: opts.max ?? 40 } },
    ],
  };
}

/**
 * The glossy studded shape: a holder with a drop shadow and the Fill (gradient, border, studs, highlight). Children go in
 * the Fill. `radius` is the corner as a share of the height (bible: about 0.15-0.2).
 */
export function face(component: string, name: string, t: Token, opts: Place & { radius?: number; studs?: boolean; children?: Spec[]; holderChildren?: Spec[]; button?: boolean; attributes?: V } = {}): Spec {
  const [top, bottom, border] = TOKENS[t];
  const corner = { className: 'UICorner', name: 'Corner', props: { CornerRadius: udim(opts.radius ?? 0.14, 0) } };
  const z = opts.z ?? 2;
  return {
    className: 'Frame', name,
    // The holder takes the component's ZIndex: with Sibling ordering a child draws inside its parent's layer, so a holder
    // left at 1 would hide a close button under the header fill it sits on.
    props: { ...placeProps(opts), BackgroundTransparency: 1, ZIndex: z },
    attributes: { ...tag(component, 'holder'), ...(opts.attributes ?? {}) },
    children: [
      ...(opts.aspect ? [{ className: 'UIAspectRatioConstraint', name: 'Shape', props: { AspectRatio: opts.aspect } }] : []),
      {
        className: 'Frame', name: 'Shadow',
        props: { Size: udim2(1, 0, 1, 0), Position: udim2(0, 0, 0, 4), BackgroundColor3: '#000000', BackgroundTransparency: 0.6, BorderSizePixel: 0, ZIndex: z },
        attributes: tag(component, 'shadow'), children: [corner],
      },
      {
        className: opts.button ? 'ImageButton' : 'Frame', name: 'Fill',
        props: {
          Size: udim2(1, 0, 1, 0), BackgroundColor3: '#FFFFFF', BorderSizePixel: 0, ZIndex: z + 1,
          ...(opts.button ? { AutoButtonColor: false, ImageTransparency: 1 } : {}),
        },
        attributes: { ...tag(component, 'fill'), Token: t, ...(opts.button ? { UI_Click: true } : {}) },
        children: [
          corner,
          { className: 'UIGradient', name: 'Gloss', props: { Color: gloss(top, bottom), Rotation: 90 } },
          { className: 'UIStroke', name: 'Border', props: { Thickness: 3.5, Color: border, ApplyStrokeMode: enumOf('ApplyStrokeMode', 'Border') } },
          ...(opts.studs === false ? [] : [{
            className: 'ImageLabel', name: 'Studs',
            props: { Size: udim2(1, 0, 1, 0), BackgroundTransparency: 1, Image: STUD_IMAGE, ScaleType: enumOf('ScaleType', 'Tile'), TileSize: udim2(0, 24, 0, 24), ImageTransparency: 0.3, ZIndex: 1 },
            attributes: tag(component, 'studs'), children: [corner],
          }]),
          // Surface layers (studs, shine, lip) sit at ZIndex 1 inside the fill, so anything placed in it (labels, buttons,
          // icons, all at 2 or more) draws over them.
          // The gloss the references have and a gradient alone does not give (three critics, 2026-10-06): a white shine
          // over the top 40 % and a darker lip along the bottom, both inside the rounded fill.
          {
            className: 'Frame', name: 'Shine',
            props: { Size: udim2(1, -10, 0.3, 0), Position: udim2(0, 5, 0, 4), BackgroundColor3: '#FFFFFF', BackgroundTransparency: 0.72, BorderSizePixel: 0, ZIndex: 1 },
            attributes: tag(component, 'highlight'),
            children: [{ className: 'UICorner', name: 'Corner', props: { CornerRadius: udim(0.35, 0) } }],
          },
          {
            className: 'Frame', name: 'Rim',
            props: { Size: udim2(1, -6, 1, -6), Position: udim2(0, 3, 0, 3), BackgroundTransparency: 1, BorderSizePixel: 0, ZIndex: 1 },
            attributes: tag(component, 'highlight'),
            children: [
              { className: 'UICorner', name: 'Corner', props: { CornerRadius: udim(opts.radius ?? 0.14, 0) } },
              { className: 'UIStroke', name: 'Light', props: { Thickness: 1.5, Color: '#FFFFFF', Transparency: 0.45, ApplyStrokeMode: enumOf('ApplyStrokeMode', 'Border') } },
            ],
          },
          {
            className: 'Frame', name: 'Lip',
            props: { Size: udim2(1, 0, 0.16, 0), Position: udim2(0, 0, 1, 0), AnchorPoint: vec2(0, 1), BackgroundColor3: border, BackgroundTransparency: 0.45, BorderSizePixel: 0, ZIndex: 1 },
            attributes: tag(component, 'lip'),
            children: [{ className: 'UICorner', name: 'Corner', props: { CornerRadius: udim(opts.radius ?? 0.14, 0) } }],
          },
          ...(opts.children ?? []),
        ],
      },
      ...(opts.holderChildren ?? []),
    ],
  };
}

/** An icon from the pack by name: the curated image, or its glyph while the pack has no image for it. Overflows on purpose. */
export function icon(component: string, name: unknown, opts: Place & { tint?: unknown } = {}): Spec {
  const entry = typeof name === 'string' ? ICONS[name] : undefined;
  if (entry?.image) {
    // A white pack image (`tintable`) takes its item's colour, so a list of one kind of thing reads item by item.
    // Without a tint of its own (a window's header icon) it is gold rather than an unfinished-looking white.
    const tint = entry.tintable ? { ImageColor3: TOKENS[typeof opts.tint === 'string' && opts.tint in TOKENS ? (opts.tint as Token) : 'sun'][0] } : {};
    return {
      className: 'ImageLabel', name: 'Icon',
      props: { Size: udim2(1, 0, 1, 0), ...placeProps(opts), BackgroundTransparency: 1, Image: entry.image, ScaleType: enumOf('ScaleType', 'Fit'), ZIndex: opts.z ?? 8, ...tint },
      attributes: tag(component, 'icon'),
    };
  }
  return label(component, 'Icon', entry?.glyph ?? '⭐', { ...opts, stroke: 0.01, max: 120, z: opts.z ?? 8 });
}

/** The kit's components. Each takes the node a recipe wrote (`kit`, `name`, layout and its own fields). */
const COMPONENTS: Record<string, (n: V) => Spec> = {
  /** A studded button with a label (and an optional icon on its left). */
  button: (n) => face('button', String(n.name ?? 'Button'), n.on !== undefined && token(n.on) === token(n.token) ? CONTRAST[token(n.token)]! : token(n.token), {
    ...(n as Place), button: true, attributes: n.attributes as V | undefined,
    children: [
      ...(n.icon ? [icon('button', n.icon, { size: [0.3, 0, 1.3, 0], position: [0.04, 0, 0.5, 0], anchor: [0, 0.5] })] : []),
      label('button', 'Label', n.text, { on: n.on !== undefined && token(n.on) === token(n.token) ? CONTRAST[token(n.token)]! : token(n.token), size: n.icon ? [0.62, 0, 0.7, 0] : [0.86, 0, 0.7, 0], position: n.icon ? [0.95, 0, 0.5, 0] : [0.5, 0, 0.5, 0], anchor: n.icon ? [1, 0.5] : [0.5, 0.5], max: Number(n.max ?? 40), z: 7 }),
    ],
  }),
  /** A square icon tile with its icon overflowing and its label across the bottom edge (left-edge HUD tiles). */
  tile: (n) => face('tile', String(n.name ?? 'Tile'), token(n.token), {
    ...(n as Place), aspect: 1, button: true, attributes: n.attributes as V | undefined,
    holderChildren: [
      icon('tile', n.icon, { size: [1.12, 0, 0.92, 0], position: [0.5, 0, 0.38, 0], anchor: [0.5, 0.5], z: 8 }),
      label('tile', 'Label', n.text, { size: [1.2, 0, 0.32, 0], position: [0.5, 0, 1.04, 0], anchor: [0.5, 1], max: 26, z: 9 }),
    ],
  }),
  /** A card: a coloured glossy panel for content (offers, items, rows); no studs, which belong to headers and buttons. */
  card: (n) => face('card', String(n.name ?? 'Card'), token(n.token), { ...(n as Place), radius: 0.08, studs: false, children: (n.children as Spec[] | undefined) ?? [], attributes: n.attributes as V | undefined }),
  /** Outlined text in a named ink (title, value, money, gem, gold). */
  text: (n) => label('text', String(n.name ?? 'Text'), n.text, { ...(n as Place), ink: (n.ink as Ink) ?? 'text', on: n.on ? token(n.on) : undefined, max: Number(n.max ?? 36), align: (n.align as 'Left') ?? 'Center', body: n.body === true, line: n.line === true }),
  /** An icon from the pack. */
  icon: (n) => icon('icon', n.icon, { ...(n as Place), tint: n.tint }),
  /**
   * The window: a slate frame, a studded header of the token with the title (its icon overflowing on the left) and a
   * berry close button on the edge, and a Content frame for the window's blocks. Hidden-scrollbar content is the
   * caller's. Carries ProofOpen, so the harness photographs it open.
   */
  window: (n) => ({
    className: 'Frame', name: 'Window',
    props: { ...placeProps(n as Place), BackgroundTransparency: 1 },
    attributes: { ...tag('window', 'holder'), ProofOpen: true, StartOpen: n.startOpen ?? true },
    children: [
      { className: 'UIAspectRatioConstraint', name: 'Shape', props: { AspectRatio: Number(n.aspect ?? 1.45) } },
      {
        className: 'Frame', name: 'Frame',
        props: { Size: udim2(1, 0, 1, 0), BackgroundColor3: '#FFFFFF', BorderSizePixel: 0, ZIndex: 1 },
        attributes: tag('window', 'slate'),
        children: [
          { className: 'UICorner', name: 'Corner', props: { CornerRadius: udim(0.04, 0) } },
          { className: 'UIGradient', name: 'Gloss', props: { Color: gloss(TOKENS.slate[0], TOKENS.slate[1]), Rotation: 90 } },
          { className: 'UIStroke', name: 'Border', props: { Thickness: 4, Color: TOKENS.slate[2], ApplyStrokeMode: enumOf('ApplyStrokeMode', 'Border') } },
        ],
      },
      face('window', 'Header', token(n.token), {
        size: [1, 0, 0.16, 0], radius: 0.14,
        children: [label('window', 'Title', n.title, { on: token(n.token), size: [0.62, 0, 0.72, 0], position: [0.19, 0, 0.5, 0], anchor: [0, 0.5], align: 'Left', max: 48, z: 7 })],
        holderChildren: [
          icon('window', n.icon, { size: [0.15, 0, 1.3, 0], position: [0.01, 0, 0.5, 0], anchor: [0, 0.5], z: 9 }),
          face('window', 'Close', 'berry', {
            size: [1, 0, 0.9, 0], position: [1, 0, 0, 0], anchor: [0.62, 0.32], aspect: 1, studs: false, button: true, z: 10,
            children: [label('window', 'X', 'X', { on: 'berry', size: [0.7, 0, 0.7, 0], position: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5], max: 40, z: 14 })],
          }),
        ],
      }),
      {
        className: 'ImageLabel', name: 'Inner',
        // The body is a deep navy well (handoff M5a: "dark-blue translucent body"); studs stay on the header.
        props: { Size: udim2(0.97, 0, 0.8, 0), Position: udim2(0.015, 0, 0.18, 0), BackgroundColor3: '#16233F', BackgroundTransparency: 0.1, ImageTransparency: 1, BorderSizePixel: 0, ZIndex: 1 },
        attributes: tag('window', 'slate'),
        children: [{ className: 'UICorner', name: 'Corner', props: { CornerRadius: udim(0.04, 0) } }],
      },
      {
        className: 'Frame', name: 'Content',
        props: { Size: udim2(0.96, 0, 0.8, 0), Position: udim2(0.02, 0, 0.18, 0), BackgroundTransparency: 1, ZIndex: 2 },
        attributes: tag('window', 'content'),
      },
    ],
  }),
  /** A progress bar: a dark track and a glossy fill of the token, with an optional label over it. */
  bar: (n) => ({
    className: 'Frame', name: String(n.name ?? 'Bar'),
    props: { ...placeProps(n as Place), BackgroundColor3: '#FFFFFF', BackgroundTransparency: 0.15, BorderSizePixel: 0 },
    attributes: tag('bar', 'slate'),
    children: [
      { className: 'UICorner', name: 'Corner', props: { CornerRadius: udim(0.5, 0) } },
      { className: 'UIGradient', name: 'Gloss', props: { Color: gradient(TOKENS.slate[1], TOKENS.slate[2]), Rotation: 90 } },
      { className: 'UIStroke', name: 'Border', props: { Thickness: 2, Color: TOKENS.slate[2], ApplyStrokeMode: enumOf('ApplyStrokeMode', 'Border') } },
      face('bar', 'Fill', token(n.token), { size: [Number(n.progress ?? 0) as number, 0, 1, 0], radius: 0.5, studs: false }),
      ...(n.text !== undefined ? [label('bar', 'Label', n.text, { size: [1, -12, 0.8, 0], position: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5], max: 24, z: 9 })] : []),
    ],
  }),
  /** A currency line: icon and a big coloured number (money, gem or gold ink). */
  currency: (n) => ({
    className: 'Frame', name: String(n.name ?? 'Currency'),
    props: { ...placeProps(n as Place), BackgroundTransparency: 1 },
    attributes: tag('currency', 'holder'),
    children: [
      { className: 'UIListLayout', name: 'Line', props: { FillDirection: enumOf('FillDirection', 'Horizontal'), Padding: udim(0, 6), VerticalAlignment: enumOf('VerticalAlignment', 'Center'), SortOrder: enumOf('SortOrder', 'LayoutOrder') } },
      { ...icon('currency', n.icon, { size: [0.3, 0, 1.25, 0], order: 1 }), children: [{ className: 'UIAspectRatioConstraint', name: 'Square', props: { AspectRatio: 1 } }] },
      label('currency', 'Value', n.text, { ink: (n.ink as Ink) ?? 'money', size: [0.8, 0, 1, 0], align: 'Left', order: 2, max: 44 }),
    ],
  }),
  /** A hotbar slot: lime with its item's icon when `filled`, an empty slate slot otherwise; the number top-left, the name below. */
  slot: (n) => face('slot', String(n.name ?? 'Slot'), n.filled === true ? 'lime' : 'slate', {
    ...(n as Place), aspect: 1, radius: 0.16, button: true, attributes: n.attributes as V | undefined,
    children: [
      label('slot', 'Number', n.number, { size: [0.32, 0, 0.3, 0], position: [0.07, 0, 0.04, 0], align: 'Left', max: 18 }),
      label('slot', 'Label', n.text, { size: [0.96, 0, 0.34, 0], position: [0.5, 0, 1.02, 0], anchor: [0.5, 1], max: 22, z: 9 }),
    ],
    holderChildren: [icon('slot', n.icon, { size: [0.8, 0, 0.62, 0], position: [0.5, 0, 0.44, 0], anchor: [0.5, 0.5], z: 9, visible: n.filled === true })],
  }),
  /** A toast: a short glossy pill with an icon and a line of text (no studs: they belong to headers and buttons). */
  toast: (n) => face('toast', String(n.name ?? 'Toast'), token(n.token), {
    ...(n as Place), radius: 0.3, studs: false,
    children: [label('toast', 'Text', n.text, { on: token(n.token), size: [0.72, 0, 0.62, 0], position: [0.25, 0, 0.5, 0], anchor: [0, 0.5], align: 'Left', max: 30, z: 7 })],
    holderChildren: [icon('toast', n.icon, { size: [0.24, 0, 1.4, 0], position: [0.01, 0, 0.5, 0], anchor: [0, 0.5], z: 9 })],
  }),
  /** A round badge that sits half outside its parent's edge: info (sky "i"), check (lime), close (berry "X"). */
  badge: (n) => {
    const kind = n.badge === 'check' ? ['lime', '✔'] : n.badge === 'close' ? ['berry', 'X'] : ['sky', 'i'];
    return face('badge', String(n.name ?? 'Badge'), kind[0] as Token, {
      ...(n as Place), aspect: 1, radius: 0.5, studs: false, button: n.badge === 'close', z: 12,
      children: [label('badge', 'Mark', kind[1], { on: kind[0] as Token, size: [0.62, 0, 0.62, 0], position: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5], max: 40, z: 16 })],
    });
  },
};

/**
 * A world title: a BillboardGui with a coloured, outlined title and an optional white subtitle (bible §4.5). Placed by a
 * recipe as a child of a part or model.
 */
COMPONENTS.billboard = (n) => ({
  className: 'BillboardGui', name: String(n.name ?? 'Title'),
  props: { Size: udim2(0, 260, 0, 90), StudsOffset: { t: 'Vector3', v: [0, Number(n.height ?? 4), 0] }, AlwaysOnTop: false, MaxDistance: 120 },
  attributes: tag('billboard', 'holder'),
  children: [
    label('billboard', 'Title', n.text, { ink: 'gold', size: [1, 0, 0.62, 0], max: 48 }),
    ...(n.subtitle ? [label('billboard', 'Subtitle', n.subtitle, { size: [1, 0, 0.34, 0], position: [0, 0, 0.64, 0], max: 26, stroke: 2.5 })] : []),
  ],
});

/**
 * A ScrollingFrame's CanvasSize scale is a share of its PARENT's size, not its own (measured in Studio, 2026-10-06: a
 * 0.62-tall stats list got a canvas 1/0.62 times its height and its last row fell outside). The canvas is the frame's
 * own height scale times the layout's height.
 */
const canvasScale = (n: V) => (Array.isArray(n.size) && Number.isFinite(Number(n.size[2])) && Number(n.size[2]) > 0 ? Number(n.size[2]) : 1);

/**
 * The size and place of every card a grid holds, so they fit the box they are in (U01 critique, 2026-10-06: a fixed
 * cell size cut the second row off under a hidden scroll bar). Units are the box's height; `ratio` is its width over
 * its height (a window's Content is 1.2 times the window's shape: 1.74 for the default 1.45). A `Featured` card takes a
 * full-width band on top. When the rows would make a card shorter than `minCard`, the box scrolls, with a visible bar.
 * Pure.
 */
export function gridLayout(count: number, featured: boolean, columns: number, ratio = 1.74, minCard = 0.3) {
  const pad = 0.03, gap = 0.035, band = featured ? 0.22 : 0;
  const cols = Math.max(1, Math.min(columns, Math.max(1, count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const top = pad + (featured ? band + gap : 0);
  const widthMax = (ratio - 2 * pad - gap * (cols - 1)) / cols;
  let h = (1 - top - pad - gap * (rows - 1)) / rows;
  h = Math.min(h, widthMax / 0.82); // never taller than about 1.2 times its width
  const scroll = h < minCard;
  if (scroll) h = Math.min(minCard, widthMax / 0.82);
  const w = Math.min(widthMax, h * 1.25);
  const height = scroll ? top + rows * h + (rows - 1) * gap + pad : 1;
  const cards = Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, count - row * cols);
    const x0 = (ratio - (inRow * w + (inRow - 1) * gap)) / 2;
    return { x: (x0 + (i % cols) * (w + gap)) / ratio, y: (top + row * (h + gap)) / height, w: w / ratio, h: h / height };
  });
  return { scroll, height, featured: featured ? { x: pad / ratio, y: pad / height, w: (ratio - 2 * pad) / ratio, h: band / height } : null, cards };
}

/**
 * A grid of cards that fits its box: the recipe gives the cards (a `Featured` one first, if any), the grid sizes and
 * places them (gridLayout). It replaces a UIGridLayout, whose fixed cells cannot know how many rows there are.
 */
COMPONENTS.grid = (n) => {
  const kids = (Array.isArray(n.children) ? n.children : []) as V[];
  const feat = kids.filter((k) => k.name === 'Featured');
  const cards = kids.filter((k) => k.name !== 'Featured');
  const L = gridLayout(cards.length, feat.length > 0, Number(n.columns ?? 3), Number(n.ratio ?? 1.74));
  const at = (k: V, b: { x: number; y: number; w: number; h: number }) => expandKit({ ...k, size: [b.w, 0, b.h, 0], position: [b.x, 0, b.y, 0], anchor: [0, 0] }) as Spec;
  return {
    className: 'ScrollingFrame', name: String(n.name ?? 'Grid'),
    props: {
      ...placeProps(n as Place), BackgroundTransparency: 1, BorderSizePixel: 0, ZIndex: 2,
      CanvasSize: udim2(0, 0, L.height * canvasScale(n), 0), ScrollingDirection: enumOf('ScrollingDirection', 'Y'),
      ScrollBarThickness: L.scroll ? 10 : 0, ScrollBarImageColor3: '#FFFFFF',
    },
    attributes: { ...tag('grid', 'layout'), ...((n.attributes as V | undefined) ?? {}) },
    children: [...feat.slice(0, 1).map((k) => at(k, L.featured!)), ...cards.map((k, i) => at(k, L.cards[i]!))],
  };
};

/**
 * The rows of a list, sized to share the box they are in (U07 and U10 renders, 2026-10-06: fixed 78 px rows cut the
 * fifth row off under a hidden scroll bar). A row is at most `maxRow` and at least `minRow` of the box's height; past
 * that the box scrolls, with a visible bar. Units as gridLayout. Pure.
 */
export function rowsLayout(count: number, ratio = 1.74, maxRow = 0.21, minRow = 0.15) {
  const pad = 0.025, gap = 0.025;
  const n = Math.max(1, count);
  let h = Math.min(maxRow, (1 - 2 * pad - gap * (n - 1)) / n);
  const scroll = h < minRow;
  if (scroll) h = minRow;
  const height = scroll ? 2 * pad + n * h + (n - 1) * gap : 1;
  return { scroll, height, rows: Array.from({ length: count }, (_, i) => ({ x: pad / ratio, y: (pad + i * (h + gap)) / height, w: (ratio - 2 * pad) / ratio, h: h / height })) };
}

/** A list of row cards that fits its box (rowsLayout); each row keeps its order for the scripts that read it. */
COMPONENTS.rows = (n) => {
  const kids = (Array.isArray(n.children) ? n.children : []) as V[];
  const L = rowsLayout(kids.length, Number(n.ratio ?? 1.74), Number(n.maxRow ?? 0.21));
  return {
    className: 'ScrollingFrame', name: String(n.name ?? 'List'),
    props: {
      ...placeProps(n as Place), BackgroundTransparency: 1, BorderSizePixel: 0, ZIndex: 2,
      CanvasSize: udim2(0, 0, L.height * canvasScale(n), 0), ScrollingDirection: enumOf('ScrollingDirection', 'Y'),
      ScrollBarThickness: L.scroll ? 10 : 0, ScrollBarImageColor3: '#FFFFFF',
    },
    attributes: { ...tag('rows', 'layout'), ...((n.attributes as V | undefined) ?? {}) },
    children: kids.map((k, i) => expandKit({ ...k, size: [L.rows[i]!.w, 0, L.rows[i]!.h, 0], position: [L.rows[i]!.x, 0, L.rows[i]!.y, 0], anchor: [0, 0] }) as Spec),
  };
};

export const KIT_COMPONENTS = Object.keys(COMPONENTS);

/** A recipe item with `kit` nodes anywhere in it, as plain instance specs. Pure. */
export function expandKit(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expandKit);
  if (!node || typeof node !== 'object') return node;
  const n = node as V;
  if (typeof n.kit === 'string') {
    const make = COMPONENTS[n.kit];
    if (!make) throw new Error(`StudKit has no component "${n.kit}" (it has ${KIT_COMPONENTS.join(', ')})`);
    // A grid places its cards itself, before they are expanded; every other component gets its children expanded.
    // A component at the top of a recipe item keeps the item's place in the tree (`parent`).
    const keep = (spec: Spec): Spec => (n.parent !== undefined ? ({ ...spec, parent: n.parent } as Spec) : spec);
    if (n.kit === 'grid' || n.kit === 'rows') return keep(make(n));
    const kids = Array.isArray(n.children) ? (n.children as unknown[]).map(expandKit) as Spec[] : undefined;
    const spec = make({ ...n, children: kids });
    // Extra children a recipe puts in a component go in its content: the Fill of a face, the Content of a window.
    if (kids?.length && n.kit !== 'card') {
      const host = spec.children?.find((c) => c.name === 'Fill' || c.name === 'Content') ?? spec;
      host.children = [...(host.children ?? []), ...kids];
    }
    if (n.attributes && typeof n.attributes === 'object') spec.attributes = { ...(spec.attributes ?? {}), ...(n.attributes as V) };
    return keep(spec);
  }
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, k === 'children' || k === 'items' ? expandKit(v) : v]));
}

/**
 * A whole value that is a raw look value a model may never send (bible §5): a hex colour, an asset id, an Enum item, a
 * Color3/UDim/rgb expression or a font name. Whole values only, so a title like "Gotham City" is still text. Pure.
 */
export const RAW_STYLE = /^(#?[0-9a-f]{6}|rbxassetid:\/\/\d+|rbxasset:\/\/\S+|Enum\.\w+\.\w+|(Color3|UDim2?|Vector2)\.\w+\(.*\)|rgb\(.*\)|FredokaOne|Gotham\w*|SourceSans\w*|Arial\w*|BuilderSans\w*)$/i;
