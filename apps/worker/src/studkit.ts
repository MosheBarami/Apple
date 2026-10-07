/**
 * STUDKIT v2: "Premium Studs" (planning/UI-SPEC-v2.md, the owner's master plan §6, 2026-10-07). Blocks place kit
 * components; nothing else draws UI. The model never reaches this file's values: it fills text, numbers, colour-token
 * NAMES and icon NAMES, and recipe.ts expands each `{ "kit": <component>, ... }` node through `expandKit`.
 *
 * The construction of every coloured surface (spec §4.1), from the outside in:
 *   one dark navy contour (#0B1A33) on every face and every text stroke -> a pale inner rim of the face's own tint ->
 *   a 3-stop gradient face -> a solid darker lip under it -> faint studs as the last layer (1.5-3 % pattern strength).
 * Windows have a `cloud` body (white-blue), never a navy well. There is no translucent white shine band, no translucent
 * black shadow, no border in the face's own hue and no emoji: all four are lint failures (spec §3.5, §9).
 *
 * Pixel values are at 1080p. Every stroke and corner records its 1080p size in the attribute StudKitPx / StudKitCorner;
 * the ui-fx runtime (StudKitScale) rescales them to the player's screen (in proportion to the viewport height against 1080p, never under 1.5 px).
 * Every object carries StudKit = "<component>.<part>" for the kit lint.
 */
import { ICONS } from './studkit-icons.generated.ts';

export const STUD_IMAGE = 'rbxassetid://7447638591';
/** The one contour colour: every outline and every text stroke (spec §3.1). */
export const CONTOUR = '#0B1A33';
/** The Roblox currency glyph (spec §3.3); "R$" is never typed. */
export const ROBUX = '';

interface Shade { top: string; mid: string; bottom: string; lip: string; rim: string }
/** Colour tokens (spec §3.1). The only colours a block may name; `slate` is the name blocks use for grey (disabled). */
export const TOKENS: Record<string, Shade> = {
  lime: { top: '#B6F23A', mid: '#7FDB2B', bottom: '#4FBF1F', lip: '#2E7D12', rim: '#E3FFB0' },
  sky: { top: '#6FE3FF', mid: '#33BFF5', bottom: '#1E8FE0', lip: '#145A9E', rim: '#C9F4FF' },
  sun: { top: '#FFE94D', mid: '#FFC22E', bottom: '#FF9A1F', lip: '#B35E0E', rim: '#FFF6B8' },
  berry: { top: '#FF6FB1', mid: '#FF3D7F', bottom: '#E0234F', lip: '#8E1235', rim: '#FFC7DE' },
  grape: { top: '#D18BFF', mid: '#A65BFF', bottom: '#7B35E8', lip: '#4B1C99', rim: '#EED6FF' },
  teal: { top: '#5BF0D6', mid: '#22D1B6', bottom: '#10A893', lip: '#0B6B5E', rim: '#C6FFF4' },
  grey: { top: '#E6EBF0', mid: '#C9D2DB', bottom: '#A9B4BF', lip: '#6B7785', rim: '#F7F9FB' },
};
TOKENS.slate = TOKENS.grey!;
export type Token = 'lime' | 'sky' | 'sun' | 'berry' | 'grape' | 'teal' | 'grey' | 'slate';
export const TOKEN_NAMES = Object.keys(TOKENS) as Token[];
/** The window body (spec §3.1): never navy. */
export const CLOUD = { top: '#FBFDFF', bottom: '#E9F1F8' };

/** Text fills (spec §3.3): white by default; coloured numbers keep the contour stroke. */
export const INKS = { text: '#FFFFFF', money: '#B6F23A', gem: '#6FE3FF', gold: '#FFE94D', muted: '#E6EBF0' } as const;
export type Ink = keyof typeof INKS;

/** Geometry at 1080p (spec §3.2): contour, rim, corner radius (999 = a pill) and lip. */
export const GEO = {
  window: { contour: 6, rim: 7, radius: 22, lip: 0, studs: 0.7 },
  card: { contour: 5, rim: 6, radius: 14, lip: 4, studs: 0.68 },
  button: { contour: 4, rim: 4, radius: 12, lip: 8, studs: 1 },
  chip: { contour: 3, rim: 2, radius: 999, lip: 3, studs: 1 },
  close: { contour: 4, rim: 4, radius: 12, lip: 5, studs: 1 },
  tile: { contour: 5, rim: 6, radius: 16, lip: 5, studs: 0.7 },
  bar: { contour: 4, rim: 0, radius: 999, lip: 0, studs: 1 },
} as const;
/** `studs` is the stud layer's ImageTransparency, measured with ui-metrics.py to land at 1.5-3 % pattern strength. */
type Geo = { contour: number; rim: number; radius: number; lip: number; studs: number };

type V = Record<string, unknown>;
export interface Spec { className: string; name: string; props?: V; attributes?: V; children?: Spec[] }

const udim2 = (xs: number, xo: number, ys: number, yo: number) => ({ t: 'UDim2', v: [xs, xo, ys, yo] });
const udim = (s: number, o: number) => ({ t: 'UDim', v: [s, o] });
const vec2 = (x: number, y: number) => ({ t: 'Vector2', v: [x, y] });
const enumOf = (kind: string, item: string) => ({ t: 'EnumItem', v: `Enum.${kind}.${item}` });
const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const seq = (stops: Array<[number, string]>) => ({ t: 'ColorSequence', v: stops.map(([t, c]) => [t, hexRgb(c)]) });
/** The 3-stop face (spec §4.1): top -> mid -> bottom, no white band. */
const faceGradient = (t: Shade) => seq([[0, t.top], [0.5, t.mid], [1, t.bottom]]);

/** A button on a card of its own colour would vanish: it takes the next colour instead. */
// A button on a card of its own colour takes the contrast colour; a grey one stays grey, since grey is the disabled or
// done state (U05 critique, 2026-10-07: 'Claimed' turned into the same green as 'Claim!').
const CONTRAST: Record<string, Token> = { lime: 'sun', sky: 'lime', sun: 'lime', berry: 'lime', grape: 'lime', teal: 'lime', grey: 'grey', slate: 'slate' };

const tag = (component: string, part: string): V => ({ StudKit: `${component}.${part}` });
const token = (t: unknown): Token => (typeof t === 'string' && t in TOKENS ? (t as Token) : 'sky');

/** A stroke in 1080p pixels (rescaled at runtime). `position` Outer for a contour, Inner for a rim. */
const stroke = (name: string, px: number, color: string, position: 'Outer' | 'Inner' | 'Center' = 'Outer', mode: 'Border' | 'Contextual' = 'Border'): Spec => ({
  className: 'UIStroke', name,
  props: { Thickness: px, Color: color, LineJoinMode: enumOf('LineJoinMode', 'Round'), ...(mode === 'Border' ? { ApplyStrokeMode: enumOf('ApplyStrokeMode', 'Border'), BorderStrokePosition: enumOf('BorderStrokePosition', position) } : {}) },
  attributes: { StudKitPx: px },
});
/** A corner in 1080p pixels (rescaled at runtime); 999 is a pill. */
const corner = (px: number): Spec => (px >= 999
  ? { className: 'UICorner', name: 'Corner', props: { CornerRadius: udim(0.5, 0) } }
  : { className: 'UICorner', name: 'Corner', props: { CornerRadius: udim(0, px) }, attributes: { StudKitCorner: px } });

/** Layout a block may give a component: where it sits and how big it is. Nothing about how it looks. */
export interface Place { size?: number[]; position?: number[]; anchor?: number[]; aspect?: number; order?: number | string; visible?: unknown; z?: number }
const placeProps = (p: Place = {}): V => ({
  ...(p.size ? { Size: udim2(p.size[0]!, p.size[1]!, p.size[2]!, p.size[3]!) } : {}),
  ...(p.position ? { Position: udim2(p.position[0]!, p.position[1]!, p.position[2]!, p.position[3]!) } : {}),
  ...(p.anchor ? { AnchorPoint: vec2(p.anchor[0]!, p.anchor[1]!) } : {}),
  ...(p.order !== undefined ? { LayoutOrder: p.order } : {}),
  ...(p.visible !== undefined ? { Visible: p.visible } : {}),
});

/** Text as it may be shown: "R$ 99" becomes the Robux glyph and the number (spec §3.3). */
export const showText = (text: unknown): unknown => (typeof text === 'string' ? text.replace(/^\s*R\$\s*/, `${ROBUX} `) : text);

/**
 * An outlined label (spec §3.3): FredokaOne, white or a coloured ink, always a contour stroke. The stroke is 5 px for a
 * cap of 40 and up, 4 for 28-39, 3 below. `line` keeps a value on one line.
 */
export function label(component: string, name: string, text: unknown, opts: { ink?: Ink; max?: number; stroke?: number; align?: 'Left' | 'Center' | 'Right'; line?: boolean } & Place = {}): Spec {
  const max = opts.max ?? 40;
  const px = opts.stroke ?? (max >= 40 ? 5 : max >= 28 ? 4 : 3);
  return {
    className: 'TextLabel', name,
    props: {
      Size: udim2(1, 0, 1, 0), ...placeProps(opts), BackgroundTransparency: 1, Text: showText(text), TextScaled: true,
      Font: enumOf('Font', 'FredokaOne'), TextColor3: INKS[opts.ink ?? 'text'],
      TextXAlignment: enumOf('TextXAlignment', opts.align ?? 'Center'), ZIndex: opts.z ?? 6,
      ...(opts.line ? { TextWrapped: false } : {}),
    },
    attributes: tag(component, name),
    children: [
      stroke('Outline', px, CONTOUR, 'Center', 'Contextual'),
      { className: 'UITextSizeConstraint', name: 'Fit', props: { MaxTextSize: max } },
    ],
  };
}

/**
 * Rays (spec §4.9): 14 thin wedges, white at 0.86 transparency, 360/14 degrees apart, behind an icon. `spin` marks
 * them for the runtime to turn once every 18 s (hero cards).
 */
export function rays(component: string, opts: Place & { spin?: boolean } = {}): Spec {
  return {
    className: 'Frame', name: 'Rays',
    props: { Size: udim2(1, 0, 1, 0), ...placeProps(opts), BackgroundTransparency: 1, ZIndex: opts.z ?? 2 },
    attributes: { ...tag(component, 'rays'), ...(opts.spin ? { UI_Spin: 18 } : {}) },
    children: [
      { className: 'UIAspectRatioConstraint', name: 'Square', props: { AspectRatio: 1 } },
      ...Array.from({ length: 14 }, (_, i): Spec => ({
        className: 'Frame', name: `Ray${i + 1}`,
        props: { Size: udim2(0.07, 0, 1, 0), Position: udim2(0.5, 0, 0.5, 0), AnchorPoint: vec2(0.5, 0.5), Rotation: (360 / 14) * i, BackgroundColor3: '#FFFFFF', BackgroundTransparency: 0.86, BorderSizePixel: 0, ZIndex: opts.z ?? 2 },
        attributes: tag(component, 'ray'),
      })),
    ],
  };
}

/**
 * The face every coloured surface shares (spec §4.1): a holder with a solid lip under the face; the face is a 3-stop
 * gradient with the contour outside and the pale rim inside; faint studs over it; children go in the Face.
 */
export function face(component: string, name: string, t: Token, opts: Place & { geo?: Geo; studs?: boolean; children?: Spec[]; holderChildren?: Spec[]; button?: boolean; attributes?: V; pattern?: 'rays' | 'rays-spin' } = {}): Spec {
  const shade = TOKENS[t]!;
  const g = opts.geo ?? GEO.card;
  const z = opts.z ?? 2;
  return {
    className: 'Frame', name,
    props: { ...placeProps(opts), BackgroundTransparency: 1, ZIndex: z },
    attributes: { ...tag(component, 'holder'), ...(opts.attributes ?? {}) },
    children: [
      ...(opts.aspect ? [{ className: 'UIAspectRatioConstraint', name: 'Shape', props: { AspectRatio: opts.aspect } }] : []),
      ...(g.lip > 0 ? [{
        className: 'Frame', name: 'Lip',
        props: { Size: udim2(1, 0, 1, 0), Position: udim2(0, 0, 0, g.lip), BackgroundColor3: shade.lip, BorderSizePixel: 0, ZIndex: z },
        attributes: { ...tag(component, 'lip'), StudKitLip: g.lip },
        children: [corner(g.radius), stroke('Contour', g.contour, CONTOUR)],
      } as Spec] : []),
      {
        className: opts.button ? 'ImageButton' : 'Frame', name: 'Fill',
        props: { Size: udim2(1, 0, 1, 0), BackgroundColor3: '#FFFFFF', BorderSizePixel: 0, ZIndex: z + 1, ...(opts.button ? { AutoButtonColor: false, ImageTransparency: 1 } : {}) },
        attributes: { ...tag(component, 'fill'), Token: t, ...(opts.button ? { UI_Click: true } : {}) },
        children: [
          corner(g.radius),
          { className: 'UIGradient', name: 'Gradient', props: { Color: faceGradient(shade), Rotation: 90 } },
          stroke('Contour', g.contour, CONTOUR),
          ...(g.rim > 0 ? [{
            className: 'Frame', name: 'Rim',
            props: { Size: udim2(1, 0, 1, 0), BackgroundTransparency: 1, BorderSizePixel: 0, ZIndex: 1 },
            attributes: tag(component, 'rim'),
            children: [corner(g.radius), stroke('Rim', g.rim, shade.rim, 'Inner')],
          } as Spec] : []),
          ...(opts.studs === false || g.studs >= 1 ? [] : [{
            className: 'ImageLabel', name: 'Studs',
            // Tuned against ui-metrics.py: pattern strength 1.5-3 % (spec §3.4; v1's 0.3 measured 4.6-5.6 %).
            props: { Size: udim2(1, 0, 1, 0), BackgroundTransparency: 1, Image: STUD_IMAGE, ScaleType: enumOf('ScaleType', 'Tile'), TileSize: udim2(0, 26, 0, 26), ImageTransparency: g.studs, ZIndex: 1 },
            attributes: { ...tag(component, 'studs'), StudKitTile: 26 },
            children: [corner(g.radius)],
          } as Spec]),
          ...(opts.pattern ? [rays(component, { size: [0.9, 0, 0.9, 0], position: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5], z: 1, spin: opts.pattern === 'rays-spin' })] : []),
          ...(opts.children ?? []),
        ],
      },
      ...(opts.holderChildren ?? []),
    ],
  };
}

/**
 * An icon from the family by name. A white family image (`tintable`) takes the pastel (rim) shade of its item's colour,
 * so it stands out on a card of that colour; a name the family does not
 * have draws nothing (no emoji fallback, spec §3.5) and says so in StudKitMissingIcon for the lint.
 */
export function icon(component: string, name: unknown, opts: Place & { tint?: unknown } = {}): Spec {
  const entry = typeof name === 'string' ? ICONS[name] : undefined;
  const tint = entry?.tintable ? { ImageColor3: TOKENS[typeof opts.tint === 'string' && opts.tint in TOKENS ? (opts.tint as Token) : 'sun']!.rim } : {};
  return {
    className: 'ImageLabel', name: 'Icon',
    props: { Size: udim2(1, 0, 1, 0), ...placeProps(opts), BackgroundTransparency: 1, Image: entry?.image ?? '', ScaleType: enumOf('ScaleType', 'Fit'), ZIndex: opts.z ?? 8, ...tint },
    attributes: { ...tag(component, 'icon'), ...(entry?.tintable ? { StudKitTinted: true } : {}), ...(entry?.image ? {} : { StudKitMissingIcon: String(name ?? '') }) },
  };
}

/** The kit's components. Each takes the node a recipe wrote (`kit`, `name`, layout and its own fields). */
const COMPONENTS: Record<string, (n: V) => Spec> = {
  /** A button (spec §4.3): [icon] label or [glyph] number on a token face with a lip; press sinks the face. */
  button: (n) => {
    const t = n.on !== undefined && token(n.on) === token(n.token) ? CONTRAST[token(n.token)]! : token(n.token);
    return face('button', String(n.name ?? 'Button'), t, {
      ...(n as Place), geo: GEO.button, button: true, attributes: n.attributes as V | undefined,
      children: [
        ...(n.icon ? [icon('button', n.icon, { size: [0.24, 0, 0.92, 0], position: [0.05, 0, 0.5, 0], anchor: [0, 0.5] })] : []),
        label('button', 'Label', n.text, { size: n.icon ? [0.64, 0, 0.74, 0] : [0.86, 0, 0.74, 0], position: n.icon ? [0.95, 0, 0.5, 0] : [0.5, 0, 0.5, 0], anchor: n.icon ? [1, 0.5] : [0.5, 0.5], max: Number(n.max ?? 40), z: 7, line: true }),
      ],
    });
  },
  /** A HUD icon tile (spec §4.6): the icon takes 80 % of the tile, the label overlaps the bottom edge. */
  tile: (n) => face('tile', String(n.name ?? 'Tile'), token(n.token), {
    ...(n as Place), aspect: 1, geo: GEO.tile, button: true, attributes: n.attributes as V | undefined,
    holderChildren: [
      icon('tile', n.icon, { size: [0.8, 0, 0.8, 0], position: [0.5, 0, 0.44, 0], anchor: [0.5, 0.5], z: 8 }),
      label('tile', 'Label', n.text, { size: [1.15, 0, 0.32, 0], position: [0.5, 0, 1.08, 0], anchor: [0.5, 1], max: 26, z: 9 }),
      // An offer tile carries its price on a ribbon across the top edge (KIT pass 9 #7: a bare floating price).
      ...(n.price ? [COMPONENTS.ribbon!({ name: 'Price', text: n.price, token: 'lime', size: [0.9, 0, 0.3, 0], position: [0.5, 0, -0.14, 0], anchor: [0.5, 0.5], tilt: -6 })] : []),
    ],
  }),
  /** A card (spec §4.4): a rarity face with a lip; `rays` puts rays behind its icon; `hero` spins them (spec §4.5). */
  card: (n) => face('card', String(n.name ?? 'Card'), token(n.token), {
    ...(n as Place), geo: GEO.card, studs: n.studs !== false, pattern: n.hero ? 'rays-spin' : n.rays ? 'rays' : undefined,
    children: (n.children as Spec[] | undefined) ?? [], attributes: n.attributes as V | undefined,
  }),
  /** Outlined text in a named ink. */
  text: (n) => label('text', String(n.name ?? 'Text'), n.text, { ...(n as Place), ink: (n.ink as Ink) ?? 'text', max: Number(n.max ?? 36), align: (n.align as 'Left') ?? 'Center', line: n.line === true }),
  /** An icon from the family. */
  icon: (n) => icon('icon', n.icon, { ...(n as Place), tint: n.tint }),
  /** Rays on their own (behind a hero icon). */
  rays: (n) => rays('rays', { ...(n as Place), spin: n.spin === true }),
  /**
   * The window (spec §4.2): a token face (contour 6, rim 5, radius 22) whose top band is the studded header with the
   * title and an icon breaking its top-left edge; a berry close button half outside the top-right corner; a `cloud`
   * body inset 14 px with its own 5 px contour; a soft contour shadow 8 px below. Content sits on the body. Carries
   * ProofOpen, so the harness photographs it open.
   */
  window: (n) => {
    const t = token(n.token);
    const shade = TOKENS[t]!;
    return {
      className: 'Frame', name: 'Window',
      props: { ...placeProps(n as Place), BackgroundTransparency: 1 },
      attributes: { ...tag('window', 'holder'), ProofOpen: true, StartOpen: n.startOpen ?? true, StudKitPhoneSize: udim2(0.98, 0, 0.86, 0) },
      children: [
        { className: 'UIAspectRatioConstraint', name: 'Shape', props: { AspectRatio: Number(n.aspect ?? 1.45) } },
        // The world and the HUD dim behind an open window (P05, P06), so the window is the one thing to look at.
        { className: 'Frame', name: 'Scrim', props: { Size: udim2(8, 0, 8, 0), Position: udim2(0.5, 0, 0.5, 0), AnchorPoint: vec2(0.5, 0.5), BackgroundColor3: CONTOUR, BackgroundTransparency: 0.6, BorderSizePixel: 0, ZIndex: 0 }, attributes: tag('window', 'scrim') },
        {
          className: 'Frame', name: 'Shadow',
          props: { Size: udim2(1, 0, 1, 0), Position: udim2(0, 0, 0, 8), BackgroundColor3: CONTOUR, BackgroundTransparency: 0.7, BorderSizePixel: 0, ZIndex: 1 },
          attributes: { ...tag('window', 'shadow'), StudKitLip: 8 },
          children: [corner(GEO.window.radius)],
        },
        {
          className: 'Frame', name: 'Frame',
          props: { Size: udim2(1, 0, 1, 0), BackgroundColor3: '#FFFFFF', BorderSizePixel: 0, ZIndex: 1 },
          attributes: { ...tag('window', 'fill'), Token: t },
          children: [
            corner(GEO.window.radius),
            { className: 'UIGradient', name: 'Gradient', props: { Color: faceGradient(shade), Rotation: 90 } },
            stroke('Contour', GEO.window.contour, CONTOUR),
            { className: 'Frame', name: 'Rim', props: { Size: udim2(1, 0, 1, 0), BackgroundTransparency: 1, ZIndex: 1 }, attributes: tag('window', 'rim'), children: [corner(GEO.window.radius), stroke('Rim', GEO.window.rim, shade.rim, 'Inner')] },
            {
              className: 'ImageLabel', name: 'Studs',
              props: { Size: udim2(1, 0, 0.16, 0), BackgroundTransparency: 1, Image: STUD_IMAGE, ScaleType: enumOf('ScaleType', 'Tile'), TileSize: udim2(0, 26, 0, 26), ImageTransparency: GEO.window.studs, ZIndex: 1 },
              attributes: { ...tag('window', 'studs'), StudKitTile: 26 },
              children: [corner(GEO.window.radius)],
            },
          ],
        },
        {
          className: 'Frame', name: 'Header',
          props: { Size: udim2(1, 0, 0.16, 0), BackgroundTransparency: 1, ZIndex: 4 },
          attributes: tag('window', 'header'),
          children: [
            label('window', 'Title', n.title, { size: [0.62, 0, 0.82, 0], position: [0.17, 0, 0.52, 0], anchor: [0, 0.5], align: 'Left', max: 72, z: 7 }),
            icon('window', n.icon, { size: [0.14, 0, 1.3, 0], position: [0.015, 0, 0.42, 0], anchor: [0, 0.5], z: 9 }),
            face('window', 'Close', 'berry', {
              size: [1, 0, 0.82, 0], position: [1, 0, 0, 0], anchor: [0.62, 0.32], aspect: 1, studs: false, button: true, z: 10, geo: GEO.close,
              children: [label('window', 'X', 'X', { size: [0.62, 0, 0.62, 0], position: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5], max: 40, z: 14 })],
            }),
          ],
        },
        {
          className: 'Frame', name: 'Body',
          props: { Size: udim2(1, -28, 0.84, -24), Position: udim2(0, 14, 0.16, 10), BackgroundColor3: '#FFFFFF', BorderSizePixel: 0, ZIndex: 2 },
          attributes: { ...tag('window', 'body'), StudKitInset: 14 },
          children: [
            corner(14),
            { className: 'UIGradient', name: 'Gradient', props: { Color: seq([[0, CLOUD.top], [1, CLOUD.bottom]]), Rotation: 90 } },
            stroke('Contour', 5, CONTOUR),
          ],
        },
        {
          className: 'Frame', name: 'Content',
          props: { Size: udim2(1, -48, 0.84, -44), Position: udim2(0, 24, 0.16, 20), BackgroundTransparency: 1, ZIndex: 3 },
          attributes: tag('window', 'content'),
        },
      ],
    };
  },
  /** A progress bar (spec §4.8): a contour track, a token fill with a 2 px highlight, the label over a tall bar. */
  bar: (n) => ({
    className: 'Frame', name: String(n.name ?? 'Bar'),
    props: { ...placeProps(n as Place), BackgroundColor3: CONTOUR, BorderSizePixel: 0 },
    attributes: tag('bar', 'track'),
    children: [
      corner(999),
      stroke('Contour', GEO.bar.contour, CONTOUR),
      {
        className: 'Frame', name: 'Fill',
        props: { Size: udim2(Number(n.progress ?? 0), 0, 1, 0), BackgroundColor3: '#FFFFFF', BorderSizePixel: 0, ZIndex: 2 },
        attributes: { ...tag('bar', 'fill'), Token: token(n.token) },
        children: [
          corner(999),
          { className: 'UIGradient', name: 'Gradient', props: { Color: faceGradient(TOKENS[token(n.token)]!), Rotation: 90 } },
          { className: 'Frame', name: 'Highlight', props: { Size: udim2(1, -28, 0, 2), Position: udim2(0, 14, 0, 3), BackgroundColor3: TOKENS[token(n.token)]!.rim, BorderSizePixel: 0, ZIndex: 3 }, attributes: { ...tag('bar', 'highlight'), StudKitPx: 2 } },
        ],
      },
      ...(n.text !== undefined ? [label('bar', 'Label', n.text, { size: [1, -12, 0.8, 0], position: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5], max: 24, z: 9, line: true })] : []),
      // A slider shows its knob at the end of the fill, so it reads as a control and not as a progress bar.
      ...(n.knob === true ? [{
        className: 'Frame', name: 'Knob',
        props: { Size: udim2(0.1, 0, 1.7, 0), Position: udim2(Number(n.progress ?? 0), 0, 0.5, 0), AnchorPoint: vec2(0.5, 0.5), BackgroundColor3: '#FFFFFF', BorderSizePixel: 0, ZIndex: 4 },
        attributes: tag('bar', 'knob'),
        children: [{ className: 'UIAspectRatioConstraint', name: 'Round', props: { AspectRatio: 1 } }, corner(999), stroke('Contour', GEO.bar.contour, CONTOUR)],
      } as Spec] : []),
    ],
  }),
  /** A currency pill (spec §4.6): the icon overflows the left end, the number in its ink, a small lime "+" button. */
  currency: (n) => face('currency', String(n.name ?? 'Currency'), 'grey', {
    ...(n as Place), geo: GEO.chip, studs: false,
    children: [label('currency', 'Value', n.text, { ink: (n.ink as Ink) ?? 'money', size: [0.5, 0, 0.78, 0], position: [0.28, 0, 0.5, 0], anchor: [0, 0.5], align: 'Left', max: 44, line: true })],
    holderChildren: [
      { ...icon('currency', n.icon, { size: [0.3, 0, 1.06, 0], position: [-0.02, 0, 0.5, 0], anchor: [0, 0.5], z: 9 }), children: [{ className: 'UIAspectRatioConstraint', name: 'Square', props: { AspectRatio: 1 } }] },
      COMPONENTS.button!({ name: 'Add', token: 'lime', text: '+', size: [0.16, 0, 0.78, 0], position: [0.97, 0, 0.46, 0], anchor: [1, 0.5], max: 40, z: 5 }),
    ],
  }),
  /** A hotbar slot (spec §4.6): a tile with its item's icon; an empty slot is a clean grey tile with only its number. */
  slot: (n) => face('slot', String(n.name ?? 'Slot'), n.filled === true ? 'lime' : 'grey', {
    ...(n as Place), aspect: 1, geo: GEO.tile, button: true, attributes: n.attributes as V | undefined,
    children: [
      label('slot', 'Number', n.number, { size: [0.32, 0, 0.3, 0], position: [0.07, 0, 0.04, 0], align: 'Left', max: 20, z: 10 }),
      ...(n.filled === true ? [label('slot', 'Label', n.text, { size: [0.96, 0, 0.34, 0], position: [0.5, 0, 1.02, 0], anchor: [0.5, 1], max: 22, z: 9 })] : []),
    ],
    holderChildren: n.filled === true ? [icon('slot', n.icon, { size: [0.8, 0, 0.62, 0], position: [0.5, 0, 0.44, 0], anchor: [0.5, 0.5], z: 9 })] : [],
  }),
  /** A toast (spec §4.7): a token pill, the icon breaking the left end, the text in large type. */
  toast: (n) => face('toast', String(n.name ?? 'Toast'), token(n.token), {
    ...(n as Place), geo: GEO.chip, studs: false,
    children: [label('toast', 'Text', n.text, { size: [0.72, 0, 0.66, 0], position: [0.25, 0, 0.5, 0], anchor: [0, 0.5], align: 'Left', max: 30, z: 7, line: true })],
    holderChildren: [icon('toast', n.icon, { size: [0.24, 0, 1.4, 0], position: [0.01, 0, 0.5, 0], anchor: [0, 0.5], z: 9 })],
  }),
  /** A ribbon on a hero card (spec §4.5): a sun chip tilted -8 degrees with "NEW!" or "BEST VALUE". */
  ribbon: (n) => {
    const r = face('ribbon', String(n.name ?? 'Ribbon'), token(n.token ?? 'sun'), {
      ...(n as Place), geo: { ...GEO.chip, lip: 3 }, studs: false, z: 12,
      children: [label('ribbon', 'Text', n.text ?? 'NEW!', { size: [0.86, 0, 0.7, 0], position: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5], max: 30, z: 16, line: true })],
    });
    r.props = { ...(r.props ?? {}), Rotation: Number(n.tilt ?? -8) };
    return r;
  },
  /** A round badge on a frame edge (spec §4.8): info "i", new "!", close "X"; a check shows the family's check icon. */
  badge: (n) => {
    const kind: [Token, string] = n.badge === 'check' ? ['lime', ''] : n.badge === 'close' ? ['berry', 'X'] : n.badge === 'new' ? ['sun', '!'] : ['sky', 'i'];
    return face('badge', String(n.name ?? 'Badge'), kind[0], {
      ...(n as Place), aspect: 1, geo: { ...GEO.chip, lip: 2 }, studs: false, button: n.badge === 'close', z: 12,
      children: kind[1] ? [label('badge', 'Mark', kind[1], { size: [0.62, 0, 0.62, 0], position: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5], max: 40, z: 16 })] : [icon('badge', 'check', { size: [0.7, 0, 0.7, 0], position: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5], z: 16 })],
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
/** The smallest card on a landscape phone, as a share of its box (U01-U08 phone captures, 2026-10-07: 7 px text). */
export const PHONE_MIN_CARD = 0.46;

const canvasScale = (n: V) => (Array.isArray(n.size) && Number.isFinite(Number(n.size[2])) && Number(n.size[2]) > 0 ? Number(n.size[2]) : 1);

/**
 * The size and place of every card a grid holds, so they fit the box they are in (U01 critique, 2026-10-06: a fixed
 * cell size cut the second row off under a hidden scroll bar). Units are the box's height; `ratio` is its width over
 * its height (a window's Content is 1.2 times the window's shape: 1.74 for the default 1.45). A `Featured` card takes a
 * full-width band on top. When the rows would make a card shorter than `minCard`, the box scrolls, with a visible bar.
 * Pure.
 */
export function gridLayout(count: number, featured: boolean, columns: number, ratio = 1.74, minCard = 0.3, phone = false) {
  const gap = 0.035;
  // A hero's ribbon sits on its top edge (spec §4.5), so the box keeps room above it: the grid clips what leaves it.
  const pad = featured ? 0.07 : 0.03;
  const cols = Math.max(1, Math.min(columns, Math.max(1, count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const widthMax = (ratio - 2 * pad - gap * (cols - 1)) / cols;
  // The hero is 1.6 times a card's height (spec §4.5): solve the card height with the hero in the same column.
  const room = featured ? 1 - pad - 0.03 - gap * rows : 1 - 2 * pad - gap * (rows - 1);
  let h = featured ? room / (1.6 + rows) : room / rows;
  // ...but never more than 0.42 of the box: with one row the rest goes to the cards.
  if (featured && 1.6 * h > 0.42) h = (room - 0.42) / rows;
  h = Math.min(h, widthMax / 0.82); // never taller than about 1.2 times its width
  // On a phone the hero keeps the same floor as a card, so its text stays readable.
  const floor = featured && !phone ? 0.2 : minCard;
  const scroll = h < floor;
  if (scroll) h = Math.min(floor, widthMax / 0.82);
  const band = featured ? Math.min(0.42, 1.6 * h) : 0;
  const top = pad + (featured ? band + gap : 0);
  // Cards take their column's full width (spec §5.3: content covers at least 80 % of the body).
  const w = widthMax;
  const height = scroll ? top + rows * h + (rows - 1) * gap + pad : 1;
  // A partial last row keeps the columns, and its last card spans the columns left over (spec §5.2: no orphan rows;
  // critic v3: the grand prize, Day 7, gets the double-width slot as in P06, and the columns stay aligned).
  const fullRow = cols * w + (cols - 1) * gap;
  const cards = Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, count - row * cols);
    const col = i % cols;
    const span = inRow < cols && col === inRow - 1 ? cols - inRow + 1 : 1;
    const cw = span * w + (span - 1) * gap;
    const x0 = (ratio - fullRow) / 2;
    return { x: (x0 + col * (w + gap)) / ratio, y: (top + row * (h + gap)) / height, w: cw / ratio, h: h / height };
  });
  return { scroll, height, featured: featured ? { x: (ratio - fullRow) / 2 / ratio, y: pad / height, w: fullRow / ratio, h: band / height } : null, cards };
}

/**
 * A grid of cards that fits its box: the recipe gives the cards (a `Featured` one first, if any), the grid sizes and
 * places them (gridLayout). It replaces a UIGridLayout, whose fixed cells cannot know how many rows there are.
 */
/** Where each part of a portrait card goes (title on top, the icon on its rays in the middle, then note and button). */
const PORTRAIT: Record<string, V> = {
  rays: { size: [0.95, 0, 0.62, 0], position: [0.5, 0, 0.46, 0], anchor: [0.5, 0.5] },
  icon: { size: [0.92, 0, 0.5, 0], position: [0.5, 0, 0.43, 0], anchor: [0.5, 0.5] },
  Title: { size: [0.92, 0, 0.16, 0], position: [0.5, 0, 0.04, 0], anchor: [0.5, 0], align: 'Center' },
  Note: { size: [0.92, 0, 0.1, 0], position: [0.5, 0, 0.7, 0], anchor: [0.5, 0], align: 'Center' },
  Buy: { size: [0.86, 0, 0.17, 0], position: [0.5, 0, 0.95, 0], anchor: [0.5, 1] },
};
const stack = (c: V): V => ({ ...c, ...(PORTRAIT[String(c.name ?? c.kit)] ?? PORTRAIT[String(c.kit)] ?? {}) });

COMPONENTS.grid = (n) => {
  const kids = (Array.isArray(n.children) ? n.children : []) as V[];
  const feat = kids.filter((k) => k.name === 'Featured');
  const cards = kids.filter((k) => k.name !== 'Featured');
  const L = gridLayout(cards.length, feat.length > 0, Number(n.columns ?? 3), Number(n.ratio ?? 1.74));
  // A landscape phone shows the same box about 0.4 times as tall: at most 2 columns of cards at least 0.46 of the box,
  // scrolling. UiFx swaps to these on a phone (StudKitPhone*).
  const P = gridLayout(cards.length, feat.length > 0, Math.min(2, Number(n.columns ?? 3)), Number(n.ratio ?? 1.74), PHONE_MIN_CARD, true);
  type Box = { x: number; y: number; w: number; h: number };
  const ratio = Number(n.ratio ?? 1.74);
  const at = (k: V, b: Box, p: Box) => {
    // A card taller than wide stacks its parts (title, a big icon, the note, the button) instead of a cramped row.
    const portrait = k.name !== 'Featured' && b.h * L.height > 0.8 * b.w * ratio;
    const phonePortrait = k.name !== 'Featured' && p.h * P.height > 0.8 * p.w * ratio;
    // Each part also carries where it goes on a phone, whose card may have the other shape (UiFx swaps them).
    const place = (c: V, tall: boolean) => (tall ? stack(c) : c);
    const node = { ...k, children: ((k.children as V[] | undefined) ?? []).map((c) => {
      const here = place(c, portrait), there = place(c, phonePortrait);
      if (here === there || !Array.isArray(there.size) || !Array.isArray(there.position)) return here;
      const [sx, so, sy, syo] = there.size as number[], [px, po, py, pyo] = there.position as number[], [ax, ay] = (there.anchor as number[] | undefined) ?? [0, 0];
      return { ...here, attributes: { ...((here.attributes as V | undefined) ?? {}), StudKitPhoneSize: udim2(sx!, so!, sy!, syo!), StudKitPhonePos: udim2(px!, po!, py!, pyo!), StudKitPhoneAnchor: vec2(ax!, ay!) } };
    }) };
    const sp = expandKit({ ...node, size: [b.w, 0, b.h, 0], position: [b.x, 0, b.y, 0], anchor: [0, 0] }) as Spec;
    return { ...sp, attributes: { ...(sp.attributes ?? {}), StudKitPhoneSize: udim2(p.w, 0, p.h, 0), StudKitPhonePos: udim2(p.x, 0, p.y, 0) } } as Spec;
  };
  return {
    className: 'ScrollingFrame', name: String(n.name ?? 'Grid'),
    props: {
      ...placeProps(n as Place), BackgroundTransparency: 1, BorderSizePixel: 0, ZIndex: 2,
      CanvasSize: udim2(0, 0, L.height * canvasScale(n), 0), ScrollingDirection: enumOf('ScrollingDirection', 'Y'),
      ScrollBarThickness: L.scroll ? 10 : 0, ScrollBarImageColor3: '#FFFFFF',
    },
    attributes: { ...tag('grid', 'layout'), StudKitPhoneCanvas: udim2(0, 0, P.height * canvasScale(n), 0), StudKitPhoneBar: P.scroll ? 10 : 0, ...((n.attributes as V | undefined) ?? {}) },
    children: [...feat.slice(0, 1).map((k) => at(k, L.featured!, P.featured!)), ...cards.map((k, i) => at(k, L.cards[i]!, P.cards[i]!))],
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
