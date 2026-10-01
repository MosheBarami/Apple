/**
 * STUDDED GUI, the way the owner's reference video builds it ("How To Make Stud GUI In Roblox Studio", measured frame by
 * frame 2026-10-01): an ImageButton/ImageLabel whose Image is the public stud tile rbxassetid://6927295847, ScaleType Tile,
 * TileSize in offset pixels, a white base tinted by a UIGradient, UICorner {0, 8}, a black UIStroke of 3, and text in
 * Fredoka One, white, scaled, with its own black stroke. Panels are a coloured header bar over a stud body; cards carry
 * their action button inside; the close button is a big red square.
 *
 * Everything here returns plain instance specs (compose.ts InstanceSpecLite), so the same studded pieces are written by
 * the composer into StarterGui (real, editable instances in the creator's place) and by the agent's build_studded_ui tool.
 */
import type { InstanceSpecLite } from './compose';

export const STUD_IMAGE = 'rbxassetid://6927295847';

/** A typed value the plugin understands as-is (compose-run.ts passes these through). */
const udim2 = (xs: number, xo: number, ys: number, yo: number) => ({ t: 'UDim2', v: [xs, xo, ys, yo] });
const udim = (s: number, o: number) => ({ t: 'UDim', v: [s, o] });
const vec2 = (x: number, y: number) => ({ t: 'Vector2', v: [x, y] });
const hexRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255] : [1, 1, 1];
};
const gradient = (top: string, bottom: string) => ({ t: 'ColorSequence', v: [[0, hexRgb(top)], [1, hexRgb(bottom)]] });
const enumOf = (kind: string, item: string) => ({ t: 'EnumItem', v: `Enum.${kind}.${item}` });

export type Box = { size: [number, number, number, number]; pos?: [number, number, number, number]; anchor?: [number, number] };

/** Saturated studded colour pairs (top, bottom of the gradient), from the reference HUDs and ROBLOX-STYLE-SPEC.md. */
export const STUD_COLOURS = {
  green: ['#5dff7a', '#14c24a'], yellow: ['#ffe14d', '#ff9f1a'], orange: ['#ffb347', '#e0731a'], pink: ['#ff6fd8', '#c2187a'],
  blue: ['#5fd3ff', '#1f6fff'], purple: ['#c56bff', '#6a1fd1'], red: ['#ff5a5a', '#c41616'], brown: ['#c98a4b', '#7a4a22'],
  cream: ['#fff6dc', '#f2d9a6'], grey: ['#d7dde2', '#8f9aa3'],
} as const satisfies Record<string, readonly [string, string]>;
export type StudColour = keyof typeof STUD_COLOURS;

const place = (b: Box) => ({
  Size: udim2(...b.size),
  ...(b.pos ? { Position: udim2(...b.pos) } : {}),
  ...(b.anchor ? { AnchorPoint: vec2(...b.anchor) } : {}),
});

/** White text, Fredoka One, scaled, black outline: every word on a studded HUD. */
export function studText(name: string, text: string, box: Box, opts: { colour?: string; stroke?: number; align?: 'Left' | 'Center' | 'Right'; z?: number } = {}): InstanceSpecLite {
  return {
    className: 'TextLabel', name,
    props: {
      ...place(box), BackgroundTransparency: 1, Text: text, TextScaled: true, Font: enumOf('Font', 'FredokaOne'),
      TextColor3: opts.colour ?? '#ffffff', ...(opts.align ? { TextXAlignment: enumOf('TextXAlignment', opts.align) } : {}),
      ...(opts.z ? { ZIndex: opts.z } : {}),
    },
    children: [{ className: 'UIStroke', name: 'Outline', props: { Color: '#111111', Thickness: opts.stroke ?? 2.5 } }],
  };
}

/**
 * One studded surface: the stud tile over a white base, tinted by a gradient, rounded, outlined. A button when `button`.
 * `tile` is the stud tile's size in pixels (100 shows a 4x4 grid of studs; smaller buttons use smaller tiles).
 */
export function studSurface(name: string, box: Box, colour: StudColour | readonly [string, string], opts: {
  button?: boolean; tile?: number; corner?: number; stroke?: number; children?: InstanceSpecLite[]; visible?: boolean; z?: number; order?: number;
  /** A soft white gloss over the top half, the "candy" look of popular simulator HUDs. */
  shine?: boolean;
  /** See-through (0..1): a lock over a card lets the item show dimly. */
  see?: number;
} = {}): InstanceSpecLite {
  const [top, bottom] = typeof colour === 'string' ? STUD_COLOURS[colour] : colour;
  return {
    className: opts.button ? 'ImageButton' : 'ImageLabel', name,
    props: {
      ...place(box), BackgroundColor3: '#ffffff', BorderSizePixel: 0, Image: STUD_IMAGE, ImageColor3: '#ffffff',
      ScaleType: enumOf('ScaleType', 'Tile'), TileSize: udim2(0, opts.tile ?? 64, 0, opts.tile ?? 64),
      ...(opts.visible === false ? { Visible: false } : {}), ...(opts.see ? { BackgroundTransparency: opts.see, ImageTransparency: opts.see } : {}), ...(opts.z ? { ZIndex: opts.z } : {}), ...(opts.order !== undefined ? { LayoutOrder: opts.order } : {}),
    },
    children: [
      { className: 'UICorner', name: 'Corner', props: { CornerRadius: udim(0, opts.corner ?? 8) } },
      { className: 'UIStroke', name: 'Outline', props: { Color: '#111111', Thickness: opts.stroke ?? 3 } },
      { className: 'UIGradient', name: 'Tint', props: { Color: gradient(top, bottom), Rotation: 90 } },
      ...(opts.shine ? [{
        className: 'Frame', name: 'Shine', props: { Size: udim2(1, -10, 0.42, 0), Position: udim2(0.5, 0, 0, 4), AnchorPoint: vec2(0.5, 0), BackgroundColor3: '#ffffff', BackgroundTransparency: 0.78, BorderSizePixel: 0, ZIndex: opts.z ?? 1 },
        children: [{ className: 'UICorner', name: 'Corner', props: { CornerRadius: udim(0, Math.max(4, (opts.corner ?? 8) - 3)) } }],
      }] : []),
      ...(opts.children ?? []),
    ],
  };
}

/** A studded button with its caption. */
export function studButton(name: string, label: string, box: Box, colour: StudColour, opts: { tile?: number; order?: number; textScale?: number } = {}): InstanceSpecLite {
  const k = opts.textScale ?? 0.72;
  return studSurface(name, box, colour, {
    button: true, tile: opts.tile ?? 40, order: opts.order, shine: true,
    children: [studText('Label', label, { size: [0.88, 0, k, 0], pos: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5] })],
  });
}

/** The big red square close button of every panel. */
export function closeButton(): InstanceSpecLite {
  return studSurface('Close', { size: [0, 46, 0, 46], pos: [1, 10, 0, -12], anchor: [1, 0] }, 'red', {
    button: true, tile: 30, z: 5, children: [studText('Label', 'X', { size: [0.7, 0, 0.7, 0], pos: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5] }, { z: 6 })],
  });
}

/** A panel: a coloured header bar with its title over a studded body, a red close button, hidden until opened. */
export function studPanel(name: string, title: string, box: Box, header: StudColour, body: StudColour, content: InstanceSpecLite[]): InstanceSpecLite {
  return {
    className: 'Frame', name,
    props: { ...place(box), BackgroundTransparency: 1, Visible: false, ZIndex: 3 },
    children: [
      studSurface('Body', { size: [1, 0, 1, -40], pos: [0, 0, 0, 40] }, body, { tile: 90, corner: 14, children: content }),
      studSurface('Header', { size: [1, 0, 0, 58], pos: [0, 0, 0, 0] }, header, {
        tile: 50, corner: 14, z: 4,
        children: [studText('Title', title.toUpperCase(), { size: [0.8, 0, 0.72, 0], pos: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5] }, { z: 5 })],
      }),
      closeButton(),
    ],
  };
}

export interface HudItem { id: string; name: string; price: number; blurb?: string; colour?: StudColour }

/**
 * The HUD of a lane-defense game, made for the game (not a foreign kit): money, the wave and its countdown, the base's
 * health, the menu, a shop of the game's own items and an upgrades panel. AppleGameUI (packages/components/gameui) binds
 * to these names and makes every piece work.
 */
export function waveDefenseHud(items: HudItem[], words: Record<string, string>): InstanceSpecLite {
  const card = (it: HudItem, i: number): InstanceSpecLite => studSurface(`Item_${it.id}`, { size: [0, 150, 0, 210] }, 'cream', {
    tile: 60, corner: 12, order: i,
    children: [
      { className: 'Frame', name: 'Icon', props: { Size: udim2(1, -16, 0, 96), Position: udim2(0, 8, 0, 8), BackgroundTransparency: 1 } },
      studText('ItemName', it.name, { size: [1, -12, 0, 26], pos: [0.5, 0, 0, 104], anchor: [0.5, 0] }),
      studText('Info', it.blurb ?? '', { size: [1, -12, 0, 18], pos: [0.5, 0, 0, 130], anchor: [0.5, 0] }, { stroke: 1.5 }),
      studButton('Buy', `$${it.price}`, { size: [1, -20, 0, 44], pos: [0.5, 0, 1, -10], anchor: [0.5, 1] }, 'green', { tile: 32 }),
      studSurface('Lock', { size: [1, 0, 1, 0] }, 'grey', {
        visible: false, tile: 60, corner: 12, z: 4, see: 0.35,
        children: [studText('Label', 'LOCKED', { size: [0.9, 0, 0, 34], pos: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5] }, { z: 5 })],
      }),
    ],
  });
  const row = (it: HudItem, i: number): InstanceSpecLite => studSurface(`Up_${it.id}`, { size: [1, -24, 0, 64] }, 'cream', {
    tile: 50, corner: 10, order: i,
    children: [
      studText('ItemName', it.name, { size: [0.42, 0, 0, 30], pos: [0, 14, 0.5, 0], anchor: [0, 0.5] }, { align: 'Left' }),
      studText('Level', 'LV 1', { size: [0.2, 0, 0, 30], pos: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5] }),
      studButton('Buy', '$50', { size: [0, 130, 0, 46], pos: [1, -10, 0.5, 0], anchor: [1, 0.5] }, 'blue', { tile: 32 }),
    ],
  });
  return {
    className: 'ScreenGui', name: 'AppleHUD',
    children: [
      studSurface('Coins', { size: [0, 250, 0, 66], pos: [0, 16, 0, 14] }, 'yellow', {
        tile: 44, corner: 12,
        children: [
          // The coin: a round gold token with a dollar sign (an emoji would not draw in the game font).
          {
            className: 'Frame', name: 'Icon',
            props: { Size: udim2(0, 50, 0, 50), Position: udim2(0, 8, 0.5, 0), AnchorPoint: vec2(0, 0.5), BackgroundColor3: '#ffd23f', ZIndex: 2 },
            children: [
              { className: 'UICorner', name: 'Round', props: { CornerRadius: udim(1, 0) } },
              { className: 'UIStroke', name: 'Outline', props: { Color: '#111111', Thickness: 3 } },
              { className: 'UIGradient', name: 'Tint', props: { Color: gradient('#fff17a', '#f0a81a'), Rotation: 90 } },
              studText('Sign', '$', { size: [0.7, 0, 0.7, 0], pos: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5] }, { z: 3 }),
            ],
          },
          studText('Value', '0', { size: [1, -126, 0.78, 0], pos: [0, 64, 0.5, 0], anchor: [0, 0.5] }, { align: 'Left' }),
          studButton('Plus', '+', { size: [0, 46, 0, 46], pos: [1, -10, 0.5, 0], anchor: [1, 0.5] }, 'green', { tile: 30 }),
        ],
      }),
      studSurface('Wave', { size: [0, 320, 0, 76], pos: [0.5, 0, 0, 12], anchor: [0.5, 0] }, 'purple', {
        tile: 50, corner: 14,
        children: [
          studText('Title', (words.wave ?? 'Wave').toUpperCase() + ' 1', { size: [0.9, 0, 0.56, 0], pos: [0.5, 0, 0, 4], anchor: [0.5, 0] }),
          studText('Timer', '', { size: [0.9, 0, 0.36, 0], pos: [0.5, 0, 1, -4], anchor: [0.5, 1] }, { stroke: 2 }),
        ],
      }),
      studSurface('Health', { size: [0, 320, 0, 30], pos: [0.5, 0, 0, 96], anchor: [0.5, 0] }, ['#3a3a3a', '#1c1c1c'], {
        tile: 30, corner: 10,
        children: [
          studSurface('Fill', { size: [1, 0, 1, 0] }, 'green', { tile: 30, corner: 10 }),
          studText('Label', (words.base ?? 'Base').toUpperCase(), { size: [1, -10, 0.86, 0], pos: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5] }, { z: 3 }),
        ],
      }),
      {
        className: 'Frame', name: 'Menu',
        props: { Size: udim2(0, 190, 0, 150), Position: udim2(0, 16, 0.5, 0), AnchorPoint: vec2(0, 0.5), BackgroundTransparency: 1 },
        children: [
          { className: 'UIListLayout', name: 'List', props: { Padding: udim(0, 14), SortOrder: enumOf('SortOrder', 'LayoutOrder') } },
          studButton('Shop', (words.shop ?? 'Shop').toUpperCase(), { size: [1, 0, 0, 64] }, 'green', { order: 1 }),
          studButton('Upgrade', 'UPGRADES', { size: [1, 0, 0, 64] }, 'blue', { order: 2 }),
        ],
      },
      { ...studText('Toast', '', { size: [0, 620, 0, 44], pos: [0.5, 0, 0.78, 0], anchor: [0.5, 0.5] }, { z: 8 }), props: { ...studText('Toast', '', { size: [0, 620, 0, 44], pos: [0.5, 0, 0.78, 0], anchor: [0.5, 0.5] }).props, Visible: false, ZIndex: 8 } },
      studPanel('ShopPanel', words.shop ?? 'Shop', { size: [0, 600, 0, 380], pos: [0.5, 0, 0.5, 20], anchor: [0.5, 0.5] }, 'green', 'orange', [
        {
          className: 'Frame', name: 'Grid',
          props: { Size: udim2(1, -28, 1, -40), Position: udim2(0, 14, 0, 30), BackgroundTransparency: 1 },
          children: [
            { className: 'UIGridLayout', name: 'Layout', props: { CellSize: udim2(0, 150, 0, 210), CellPadding: udim2(0, 30, 0, 14), SortOrder: enumOf('SortOrder', 'LayoutOrder'), HorizontalAlignment: enumOf('HorizontalAlignment', 'Center') } },
            ...items.map(card),
          ],
        },
      ]),
      studPanel('UpgradePanel', 'Upgrades', { size: [0, 560, 0, 360], pos: [0.5, 0, 0.5, 20], anchor: [0.5, 0.5] }, 'blue', 'cream', [
        {
          className: 'Frame', name: 'List',
          props: { Size: udim2(1, -16, 1, -40), Position: udim2(0, 8, 0, 30), BackgroundTransparency: 1 },
          children: [
            { className: 'UIListLayout', name: 'Layout', props: { Padding: udim(0, 10), SortOrder: enumOf('SortOrder', 'LayoutOrder'), HorizontalAlignment: enumOf('HorizontalAlignment', 'Center') } },
            ...items.map(row),
          ],
        },
      ]),
    ],
  };
}

// ------------------------------------------------------------------------------------------------ any game's studded screen

export type StudAnchor = 'top-left' | 'top' | 'top-right' | 'left' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';
export type StudPiece =
  | { kind: 'counter'; name: string; text: string; icon?: string; colour?: StudColour; plus?: boolean; at: StudAnchor; caption?: string }
  | { kind: 'button'; name: string; text: string; colour?: StudColour; at: StudAnchor; icon?: string; badge?: boolean }
  | { kind: 'bar'; name: string; text: string; colour?: StudColour; at: StudAnchor }
  | { kind: 'panel'; name: string; title: string; header?: StudColour; body?: StudColour; cards?: StudCard[] };
/** A shop or upgrade card: an icon in a coloured bubble, a level badge, the name, what it does, and its price. */
export interface StudCard { name: string; label: string; price?: string; colour?: StudColour; icon?: string; blurb?: string; level?: string }
export interface StudScreenSpec { name: string; pieces: StudPiece[] }

const REGIONS: Record<StudAnchor, { pos: [number, number, number, number]; anchor: [number, number]; size: [number, number, number, number]; across: boolean; align: string }> = {
  'top-left': { pos: [0, 16, 0, 14], anchor: [0, 0], size: [0, 560, 0, 70], across: true, align: 'Left' },
  top: { pos: [0.5, 0, 0, 12], anchor: [0.5, 0], size: [0, 640, 0, 80], across: true, align: 'Center' },
  'top-right': { pos: [1, -16, 0, 14], anchor: [1, 0], size: [0, 560, 0, 70], across: true, align: 'Right' },
  left: { pos: [0, 16, 0.5, 0], anchor: [0, 0.5], size: [0, 200, 0, 420], across: false, align: 'Left' },
  right: { pos: [1, -16, 0.5, 0], anchor: [1, 0.5], size: [0, 200, 0, 420], across: false, align: 'Right' },
  'bottom-left': { pos: [0, 16, 1, -16], anchor: [0, 1], size: [0, 560, 0, 80], across: true, align: 'Left' },
  bottom: { pos: [0.5, 0, 1, -16], anchor: [0.5, 1], size: [0, 640, 0, 90], across: true, align: 'Center' },
  'bottom-right': { pos: [1, -16, 1, -16], anchor: [1, 1], size: [0, 560, 0, 80], across: true, align: 'Right' },
};

/**
 * A studded screen for any game, from a short spec: counters (icon, number, green "+"), buttons, bars and panels with
 * item cards, each piece on a screen edge (the centre stays empty for play). Pieces at the same edge line up with a
 * gap. Panels open hidden, centred, with a red X. Every name given is the instance's name, so the game's scripts find
 * them (player.PlayerGui.<screen>.<region>.<name>, panels at player.PlayerGui.<screen>.<name>).
 */
export function studdedScreen(spec: StudScreenSpec): InstanceSpecLite {
  const regions = new Map<StudAnchor, InstanceSpecLite[]>();
  const panels: InstanceSpecLite[] = [];
  spec.pieces.forEach((p, i) => {
    if (p.kind === 'panel') {
      // The owner's reference look (Grow a Garden-style shops): a big icon in a bright bubble fills the top of the card.
      const BUBBLES: StudColour[] = ['blue', 'purple', 'pink', 'yellow', 'green', 'red'];
      const cards = (p.cards ?? []).map((c, k) => studSurface(c.name, { size: [0, 160, 0, 236] }, 'cream', {
        tile: 60, corner: 14, order: k, children: [
          studSurface('IconBubble', { size: [0, 92, 0, 92], pos: [0.5, 0, 0, 12], anchor: [0.5, 0] }, BUBBLES[k % BUBBLES.length]!, {
            tile: 40, corner: 46, z: 2, children: [studText('Icon', c.icon ?? '\u2B50', { size: [0.78, 0, 0.78, 0], pos: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5] }, { z: 3, stroke: 0 })],
          }),
          ...(c.level !== undefined ? [studSurface('Level', { size: [0, 58, 0, 28], pos: [1, -6, 0, 6], anchor: [1, 0] }, 'purple', {
            tile: 24, corner: 10, z: 4, children: [studText('Text', c.level, { size: [0.86, 0, 0.8, 0], pos: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5] }, { z: 5 })],
          })] : []),
          studText('ItemName', c.label, { size: [1, -12, 0, 28], pos: [0.5, 0, 0, 110], anchor: [0.5, 0] }),
          ...(c.blurb ? [studText('Blurb', c.blurb, { size: [1, -16, 0, 22], pos: [0.5, 0, 0, 140], anchor: [0.5, 0] }, { colour: '#fff4c2', stroke: 2 })] : []),
          ...(c.price ? [studButton('Buy', c.price, { size: [1, -20, 0, 46], pos: [0.5, 0, 1, -10], anchor: [0.5, 1] }, c.colour ?? 'green', { tile: 32 })] : []),
        ],
      }));
      // The panel fits its cards (owner, 2026-10-01: cards sat at the top of a half-empty panel and looked off-centre).
      const perRow = Math.min(3, Math.max(1, cards.length));
      const rows = Math.max(1, Math.ceil(cards.length / 3));
      const width = Math.max(420, perRow * 160 + (perRow - 1) * 26 + 70);
      const height = 40 + 30 + rows * 236 + (rows - 1) * 14 + 26;
      panels.push(studPanel(p.name, p.title, { size: [0, width, 0, height], pos: [0.5, 0, 0.5, 20], anchor: [0.5, 0.5] }, p.header ?? 'green', p.body ?? 'orange', [{
        className: 'Frame', name: 'Grid', props: { Size: udim2(1, -28, 1, -56), Position: udim2(0, 14, 0, 30), BackgroundTransparency: 1 },
        children: [{ className: 'UIGridLayout', name: 'Layout', props: { CellSize: udim2(0, 160, 0, 236), CellPadding: udim2(0, 26, 0, 14), SortOrder: enumOf('SortOrder', 'LayoutOrder'), HorizontalAlignment: enumOf('HorizontalAlignment', 'Center'), VerticalAlignment: enumOf('VerticalAlignment', 'Center') } }, ...cards],
      }]));
      return;
    }
    const region = REGIONS[p.at];
    const list = regions.get(p.at) ?? [];
    let piece: InstanceSpecLite;
    if (p.kind === 'counter') {
      piece = studSurface(p.name, { size: [0, p.caption ? 270 : 240, 0, 62] }, p.colour ?? 'yellow', {
        tile: 44, corner: 12, order: i, shine: true, children: [
          {
            className: 'Frame', name: 'Icon', props: { Size: udim2(0, 46, 0, 46), Position: udim2(0, 8, 0.5, 0), AnchorPoint: vec2(0, 0.5), BackgroundColor3: '#ffd23f', ZIndex: 2 },
            children: [
              { className: 'UICorner', name: 'Round', props: { CornerRadius: udim(1, 0) } },
              { className: 'UIStroke', name: 'Outline', props: { Color: '#111111', Thickness: 3 } },
              studText('Sign', p.icon ?? '$', { size: [0.7, 0, 0.7, 0], pos: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5] }, { z: 3 }),
            ],
          },
          ...(p.caption
            ? [studText('Value', p.text, { size: [1, p.plus === false ? -70 : -120, 0.62, 0], pos: [0, 60, 0, 3], anchor: [0, 0] }, { align: 'Left' }),
              studText('Caption', p.caption.toUpperCase(), { size: [1, p.plus === false ? -70 : -120, 0.3, 0], pos: [0, 61, 1, -4], anchor: [0, 1] }, { align: 'Left', stroke: 1.5, colour: '#fff4c2' })]
            : [studText('Value', p.text, { size: [1, p.plus === false ? -70 : -120, 0.78, 0], pos: [0, 60, 0.5, 0], anchor: [0, 0.5] }, { align: 'Left' })]),
          ...(p.plus === false ? [] : [studButton('Plus', '+', { size: [0, 44, 0, 44], pos: [1, -9, 0.5, 0], anchor: [1, 0.5] }, 'green', { tile: 30 })]),
        ],
      });
    } else if (p.kind === 'bar') {
      piece = studSurface(p.name, { size: [0, 320, 0, 32] }, ['#3a3a3a', '#1c1c1c'], {
        tile: 30, corner: 10, order: i, children: [
          studSurface('Fill', { size: [1, 0, 1, 0] }, p.colour ?? 'green', { tile: 30, corner: 10 }),
          studText('Label', p.text, { size: [1, -10, 0.86, 0], pos: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5] }, { z: 3 }),
        ],
      });
    } else {
      piece = studButton(p.name, p.icon ? `${p.icon} ${p.text}` : p.text, { size: region.across ? [0, 190, 0, 62] : [1, 0, 0, 64] }, p.colour ?? 'blue', { order: i });
      // A red "!" that the game's script shows when something can be bought (hidden until then).
      if (p.badge) piece.children!.push(studSurface('Badge', { size: [0, 30, 0, 30], pos: [1, 8, 0, -8], anchor: [1, 0] }, 'red', {
        tile: 20, corner: 15, z: 6, visible: false, children: [studText('Text', '!', { size: [0.7, 0, 0.8, 0], pos: [0.5, 0, 0.5, 0], anchor: [0.5, 0.5] }, { z: 7 })],
      }));
    }
    list.push(piece);
    regions.set(p.at, list);
  });
  const regionFrames: InstanceSpecLite[] = [...regions.entries()].map(([at, items]) => {
    const r = REGIONS[at];
    return {
      className: 'Frame', name: `Region_${at.replace('-', '_')}`,
      props: { Size: udim2(...r.size), Position: udim2(...r.pos), AnchorPoint: vec2(...r.anchor), BackgroundTransparency: 1 },
      children: [
        { className: 'UIListLayout', name: 'List', props: {
          FillDirection: enumOf('FillDirection', r.across ? 'Horizontal' : 'Vertical'), Padding: udim(0, 12), SortOrder: enumOf('SortOrder', 'LayoutOrder'),
          HorizontalAlignment: enumOf('HorizontalAlignment', r.align), VerticalAlignment: enumOf('VerticalAlignment', 'Center'),
        } },
        ...items,
      ],
    };
  });
  return { className: 'ScreenGui', name: spec.name, children: [...regionFrames, ...panels] };
}
