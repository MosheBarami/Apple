/**
 * build_object: ANY thing a person asks for ("a stick of butter", "an asmr keyboard", "a giant donut that spins"), done
 * completely in ONE call (owner, 2026-10-01: dumb questions, perfect results, fast and token-cheap).
 *
 * The model writes a compact spec: the parts in real proportions (a repeat grid turns one entry into 60 keys), labels,
 * and what moves and how. The tool does everything else the way a good Roblox builder would:
 *   - one Model, upright and grounded on a studded stage, with the spawn in front of it, facing it;
 *   - studs on every surface (Resurface's variant), unless the user asked for another surface;
 *   - every moving part rigged to a still root, RigEdit's way, with its pivot on its hinge;
 *   - preset motions (press, spin, bob, open, wobble, pop) on a click, touch, prompt, loop, once or a REAL key press;
 *   - a library sound for each motion (found by the words given), so an ASMR keyboard clicks on every key;
 *   - the studded lighting from the owner's lighting tutorial;
 *   - optionally a studded HUD with a live counter and a hint.
 * Pure parts (expandObject) are exported for tests (tests/object.test.mjs).
 */
import type { AgentCtx } from './tools';
import type { InstanceSpecLite } from './compose';
import { luau } from './compose';
import { typed } from './compose-run';
import { findSounds, soundAssetId } from './fx-library';
import { applySurfaceOp, userWantsOwnSurface } from './surfaces';
import { studdedScreen } from './stud-ui';
import { writeScreen } from './studded-ui-tool';
import { installAnimationPlayer } from './animate-tool';
import { vfxPlan } from './fx-library';

type V3 = [number, number, number];
const SHAPES = new Set(['block', 'ball', 'cylinder', 'wedge']);
const MOTIONS = new Set(['press', 'spin', 'bob', 'open', 'wobble', 'pop']);
const TRIGGERS = new Set(['click', 'touch', 'prompt', 'loop', 'once', 'key']);
const HINGES = new Set(['bottom', 'top', 'back', 'front', 'left', 'right', 'center']);
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_PARTS = 400;

/**
 * A request for one THING ("make me a stick of butter", "build an asmr keyboard", "a giant spinning donut"), as
 * opposed to a game, a change to what exists, or a look. Such a run calls build_object first (session.ts objectFirst):
 * seen live 2026-10-01, the model hand-built a keyboard part by part instead and was refused. Pure.
 */
const GAME_OR_EDIT = /\b(game|obby|tycoon|simulator|sim|rpg|shooter|lobby|map|world|level|island|round|wave|defen[cs]e|plots?|shop system|economy|ui|hud|screen|menu|cooler|better|prettier|improve|fix|change|edit|remove|delete|move|make it|lighting|script|leaderboard)\b/i;
const SCENE = /\b(hill|mountain|harbou?r|river|lake|forest|beach|city|town|village|terrain|landscape|room|area|zone|park|garden|farm|arena|stage|base|shop|store|system)\b/i;
export function isObjectRequest(text: string | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t || t.length > 140 || GAME_OR_EDIT.test(t) || SCENE.test(t)) return false;
  if (/\band\b|,|;|\bthen\b/i.test(t)) return false; // several things, or steps: a scene or a plan, not one object
  return /^(please\s+)?(can you\s+)?(make|build|create|give|spawn)\s+(me\s+|us\s+)?(a|an|one|some|the|my)?\b/i.test(t) || /^(an?|one)\s+\w+/i.test(t);
}

/** What people and models write for a key, as Roblox's Enum.KeyCode name. Unknown keys return undefined (click only). */
const DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const KEY_WORDS: Record<string, string> = {
  ' ': 'Space', space: 'Space', spacebar: 'Space', enter: 'Return', return: 'Return', backspace: 'Backspace', back: 'Backspace', bksp: 'Backspace', del: 'Delete', delete: 'Delete', tab: 'Tab',
  shift: 'LeftShift', lshift: 'LeftShift', rshift: 'RightShift', ctrl: 'LeftControl', control: 'LeftControl', alt: 'LeftAlt',
  caps: 'CapsLock', capslock: 'CapsLock', esc: 'Escape', escape: 'Escape', ',': 'Comma', '.': 'Period', ';': 'Semicolon',
  '/': 'Slash', '-': 'Minus', '=': 'Equals', '[': 'LeftBracket', ']': 'RightBracket', "'": 'Quote', '\\': 'BackSlash',
  '`': 'Backquote', up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  win: 'LeftSuper', cmd: 'LeftSuper', super: 'LeftSuper', menu: 'Menu', ins: 'Insert', pgup: 'PageUp', pgdn: 'PageDown',
};
const KEYCODE_NAMES = new Set([
  ...DIGITS, ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  'Space', 'Return', 'Backspace', 'Tab', 'Escape', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'CapsLock',
  'LeftShift', 'RightShift', 'LeftControl', 'RightControl', 'LeftAlt', 'RightAlt', 'LeftSuper', 'RightSuper', 'LeftMeta', 'RightMeta', 'Menu',
  'Comma', 'Period', 'Semicolon', 'Slash', 'BackSlash', 'Minus', 'Equals', 'Plus', 'LeftBracket', 'RightBracket', 'Quote', 'Backquote',
  'Up', 'Down', 'Left', 'Right', 'NumLock', 'ScrollLock', 'Print', 'Pause',
  // Fn has no KeyCode: a keyboard's Fn cap is a key nobody's real keyboard sets off, clicked or stepped on only.
  'Fn',
  ...['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Period', 'Divide', 'Multiply', 'Minus', 'Plus', 'Enter', 'Equals'].map((k) => `Keypad${k}`),
]);
export function keyCodeName(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  const t = raw.trim();
  if (/^[0-9]$/.test(t)) return DIGITS[Number(t)];
  if (/^[a-zA-Z]$/.test(t)) return t.toUpperCase();
  if (KEY_WORDS[t.toLowerCase()] ?? KEY_WORDS[t]) return KEY_WORDS[t.toLowerCase()] ?? KEY_WORDS[t];
  if (/^F([1-9]|1[0-2])$/i.test(t)) return t.toUpperCase();
  // Already an Enum.KeyCode name (One, LeftShift, Space...) — a real one only: any capitalised word passed before, so
  // "BUTTER", "SALTED" and "KING" printed on a butter's parts were keys and the butter was laid out as a keyboard (test 3
  // round 6, 2026-10-01).
  if (KEYCODE_NAMES.has(t)) return t;
  return undefined;
}

/** The nearest plain colour word for a hex colour. Pure. */
export function colourWord(hex: string | undefined): string {
  if (!hex || !HEX.test(hex)) return 'Grey';
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const WORDS: [string, number[]][] = [['White', [245, 245, 245]], ['Black', [25, 25, 25]], ['Red', [230, 50, 50]], ['Orange', [255, 150, 30]],
    ['Yellow', [255, 225, 80]], ['Gold', [230, 180, 40]], ['Green', [80, 200, 70]], ['Cyan', [70, 220, 255]], ['Blue', [60, 120, 255]],
    ['Purple', [160, 90, 255]], ['Pink', [255, 110, 210]], ['Brown', [140, 90, 50]], ['Grey', [150, 155, 160]], ['Cream', [255, 243, 196]]];
  return WORDS.map(([w, v]) => [w, (v[0]! - c[0]!) ** 2 + (v[1]! - c[1]!) ** 2 + (v[2]! - c[2]!) ** 2] as const).sort((a, b) => a[1] - b[1])[0]![0];
}
/** A name for an unnamed part from its colour and shape: GoldBlock, CyanWedge. Pure. */
export function lookName(hex: string | undefined, shape: string): string {
  const s = shape.toLowerCase();
  const word = s === 'ball' || s === 'sphere' ? 'Ball' : s === 'cylinder' || s === 'cyl' ? 'Cylinder' : s === 'wedge' ? 'Wedge' : 'Block';
  return `${colourWord(hex)}${word}`;
}

/** A colour as "#rrggbb": hex as given, a few names, or Roblox-ish defaults. */
const COLOUR_NAMES: Record<string, string> = {
  white: '#ffffff', black: '#1b1b1b', red: '#ff4b4b', orange: '#ff9f1a', yellow: '#ffe14d', green: '#5dd94a', blue: '#4fa3ff',
  purple: '#a46bff', pink: '#ff6fd8', brown: '#8e5b32', grey: '#9aa3ab', gray: '#9aa3ab', cyan: '#4fe0ff', gold: '#ffc83d',
  silver: '#c9d1d9', cream: '#fff3c4', butter: '#ffe680', beige: '#eedcb3',
};
const BRICK: Record<string, string> = {
  'bright red': '#c4281c', 'really red': '#ff0000', 'bright blue': '#0d69ac', 'really blue': '#0000ff', 'bright green': '#4b974b',
  'lime green': '#00ff00', 'bright yellow': '#f5cd30', 'new yeller': '#ffff00', 'bright orange': '#da8541', 'hot pink': '#ff00bf',
  'magenta': '#aa00aa', 'royal purple': '#6225d1', 'toothpaste': '#00ffff', 'cyan': '#04afec', 'institutional white': '#f8f8f8',
  'medium stone grey': '#a3a2a5', 'dark stone grey': '#635f62', 'really black': '#111111', 'reddish brown': '#694028', 'pastel blue': '#80bbdb',
  'pink': '#ff66cc', 'electric blue': '#09137a', 'deep orange': '#ffb000', 'teal': '#12eed4', 'lavender': '#8c5b9f', 'sand green': '#789082',
};
export function colourHex(raw: unknown): string | undefined {
  // [r, g, b] in 0-255 or 0-1, and {r, g, b}.
  const arr = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [(raw as Record<string, unknown>).r ?? (raw as Record<string, unknown>).R, (raw as Record<string, unknown>).g ?? (raw as Record<string, unknown>).G, (raw as Record<string, unknown>).b ?? (raw as Record<string, unknown>).B] : null;
  if (arr && arr.length === 3 && arr.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    const nums = arr as number[];
    const k = nums.every((n) => n <= 1) ? 255 : 1;
    return '#' + nums.map((n) => Math.max(0, Math.min(255, Math.round(n * k))).toString(16).padStart(2, '0')).join('');
  }
  if (typeof raw !== 'string') return undefined;
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(raw.trim());
  if (rgb) return colourHex([Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map((n) => n === 0 ? 0 : n) as unknown);
  if (BRICK[raw.trim().toLowerCase()]) return BRICK[raw.trim().toLowerCase()];
  const t = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(t)) return t;
  if (/^#[0-9a-f]{3}$/.test(t)) return '#' + t.slice(1).split('').map((c) => c + c).join('');
  if (/^[0-9a-f]{6}$/.test(t)) return '#' + t;
  if (/^[0-9a-f]{3}$/.test(t)) return '#' + t.split('').map((c) => c + c).join('');
  return COLOUR_NAMES[t];
}

export interface Move { as: string; on: string; hinge?: string; amount?: number; sound?: string; prompt?: string }
export interface ObjectPart {
  name: string; shape: string; size: V3; at: V3; rot?: V3; color: string; transparency?: number;
  text?: { value: string; face: string; color: string; font?: string; glow?: boolean; inked?: boolean }; move?: Move; key?: string;
  /** Neon for a glow (a keyboard's underglow); everything else is Plastic. */
  material?: 'Neon';
  /** Made by the rows layout itself (its case and glow), not by the model. */
  own?: boolean;
  /** Moves with this other part (a keycap's skirt rides its cap): rigged with it, posed with it in its clip. */
  rides?: string;
  /** Smooth plastic instead of studs (a keycap, like the owner's reference keyboard). */
  surface?: 'smooth';
}
export interface ObjectPlan {
  name: string; parts: ObjectPart[]; footprint: { x0: number; x1: number; z0: number; z1: number; top: number }; skipped?: string[];
  /** Parts the spec asked for that were left out because a keyboard has no such part (relayKeyboard). */
  dropped?: string[];
  /** How a keyboard was made to look (keyboardTheme). */
  theme?: KeyboardTheme;
  /** Parts moved out of a bigger part that hid them (unbury). */
  unburied?: string[];
  /** The part given a wobble because nothing moved (giveMotion). */
  gaveMotion?: string;
  /** How much the object was grown to be worth walking up to (fitFactor). */
  grown?: number;
  /** The "make it cooler" kit was added (coolKit). */
  cool?: boolean;
}

/** [x, y, z] from an array, an {x, y, z} object or "x, y, z" text; null when it is none of those. */
const v3 = (v: unknown): V3 | null => {
  let a: unknown[] | null = null;
  if (Array.isArray(v)) a = v;
  else if (v && typeof v === 'object') { const o = v as Record<string, unknown>; a = [o.x ?? o.X, o.y ?? o.Y, o.z ?? o.Z]; }
  else if (typeof v === 'string') a = v.split(/[\s,]+/).filter(Boolean);
  if (!a || a.length !== 3) return null;
  const n = a.map((x) => typeof x === 'string' ? Number(x) : x);
  return n.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 2000) ? n as V3 : null;
};

/** How many key widths a key of this label takes on a real keyboard. */
const KEY_WIDTH: [RegExp, number][] = [
  [/^(space|spacebar)$/i, 6.25], [/^(enter|return)$/i, 2.25], [/^(shift|lshift|rshift)$/i, 2.25], [/^(back|backspace|bksp|delete|del)$/i, 2],
  [/^(caps|capslock|caps lock)$/i, 1.75], [/^tab$/i, 1.5], [/^(ctrl|control|alt|win|cmd|fn|menu)$/i, 1.25],
];
const PASTEL = ['#7be0ff', '#ff7bd1', '#ffe27a', '#9bff8a', '#b69bff'];

const GLOW_NAME = /glow|neon|led(?![a-z])|laser|flame|fire(?!truck)|plasma|lava|spark(?!le)|beam|aura/i;
const vol = (p: ObjectPart) => p.size[0] * p.size[1] * p.size[2];
const holds = (q: ObjectPart, at: V3, margin = 0.05) => [0, 1, 2].every((i) => Math.abs(at[i]! - q.at[i]!) < q.size[i]! / 2 - margin);
const UP_WORDS = /top|lid|icing|frosting|glaze|topping|sprinkle|cap|cream|sauce|fold|flap|knob|handle|stem|leaf|bow/i;
const DOWN_WORDS = /bottom|base|tray|plate|dish|wrapper|paper|foil|stand|feet|foot|leg|saucer|mat/i;
const SIDE_WORDS = /label|sticker|logo|sign|text|print|stripe|face|eye|mouth|window|door|badge|brand/i;

/**
 * A part whose centre is inside a bigger part cannot be seen (test 2 round 2, 2026-10-01: the butter's Label, its
 * ButterTop and its WrapperFold all sat at the butter's own centre, and the reply still promised "a printed label on
 * the side"). Each one is pushed out along its thinnest side until it sits flush on the face of what hid it: up for a
 * topping, down for a tray or wrapper, toward the player (+Z) for a label, otherwise the way it already leaned.
 * Moving parts and keys stay where they are. Pure; returns the names it moved.
 */
export function unbury(parts: ObjectPart[]): string[] {
  const moved: string[] = [];
  for (const p of parts) {
    if (p.key || p.rides || p.own || (p.transparency ?? 0) > 0.5) continue;
    for (let pass = 0; pass < 4; pass++) {
      const q = parts.find((o) => o !== p && !o.own && (o.transparency ?? 0) <= 0.5 && vol(o) > vol(p) && holds(o, p.at));
      if (!q) break;
      // An end or a cap comes out at the body's end, never under it, even when it is a "WrapperEnd" (test 3 round 11:
      // two wrapper ends pushed under the butter held it up like table legs).
      const ofEnd = /end|cap/i.test(p.name);
      const axis = ofEnd ? (q.size[0] >= q.size[2] ? 0 : 2) : SIDE_WORDS.test(p.name) ? 2 : UP_WORDS.test(p.name) || DOWN_WORDS.test(p.name) ? 1 : p.size.indexOf(Math.min(...p.size));
      const lean = p.at[axis]! - q.at[axis]!;
      // Down words win unless the name says top or lid (round 3: a "WrapperFold" went on top as a lid over the butter).
      const dir = axis === 1 && !ofEnd ? (DOWN_WORDS.test(p.name) && !/top|lid/i.test(p.name) ? -1 : 1) : Math.abs(lean) > 1e-3 ? Math.sign(lean) : /left|1$|a$/i.test(p.name) ? -1 : 1;
      p.at[axis] = q.at[axis]! + dir * (q.size[axis]! / 2 + p.size[axis]! / 2);
      if (!moved.includes(p.name)) moved.push(p.name);
    }
  }
  // A wrapper, tray or plate laid over the body's top goes under it (round 4: the model put a 31 x 7 "Wrapper" flat on
  // the butter's whole top, a lid again).
  const body = [...parts].filter((o) => !o.own).sort((a, b) => vol(b) - vol(a))[0];
  for (const p of parts) {
    if (!body || p === body || p.key || p.rides || p.own || !DOWN_WORDS.test(p.name) || /top|lid|end|cap/i.test(p.name)) continue;
    const overlap = (i: number) => Math.max(0, Math.min(p.at[i]! + p.size[i]! / 2, body.at[i]! + body.size[i]! / 2) - Math.max(p.at[i]! - p.size[i]! / 2, body.at[i]! - body.size[i]! / 2));
    const covers = overlap(0) * overlap(2) >= 0.5 * body.size[0] * body.size[2];
    if (!covers || p.at[1] <= body.at[1] || p.size[1] >= body.size[1]) continue;
    p.at[1] = body.at[1] - body.size[1] / 2 - p.size[1] / 2;
    if (!moved.includes(p.name)) moved.push(p.name);
  }
  return moved;
}

const AROUND_WORDS = /band|ring|belt|strap|sleeve|collar|wrap(?!per)|sash|ribbon/i;
/**
 * A band, ring or belt goes around the body's middle, not perched on it (round 10: a "WrapperBand" stood half above
 * the butter). One whose two thin sides are both at least the body's is centred on the body's middle on them. Pure.
 */
export function wrapAround(parts: ObjectPart[]): string[] {
  const body = [...parts].filter((o) => !o.own).sort((a, b) => vol(b) - vol(a))[0];
  const moved: string[] = [];
  if (!body) return moved;
  const long = body.size.indexOf(Math.max(...body.size));
  for (const p of parts) {
    if (p === body || p.key || p.rides || p.own || !AROUND_WORDS.test(p.name)) continue;
    const thin = [0, 1, 2].filter((i) => i !== long);
    if (!thin.every((i) => p.size[i]! >= body.size[i]! - 0.05)) continue;
    for (const i of thin) p.at[i] = body.at[i]!;
    moved.push(p.name);
  }
  return moved;
}

/**
 * Two parts named for an end ("WrapperEnd1", "WrapperEnd2", "CapLeft") that sit in the same place go to the two ends of
 * the body's long side (test 3 round 10, 2026-10-01: both wrapper ends stood at the butter's middle, one inside the
 * other). Pure; returns the parts it moved.
 */
export function toEnds(parts: ObjectPart[]): string[] {
  const body = [...parts].filter((o) => !o.own).sort((a, b) => vol(b) - vol(a))[0];
  if (!body) return [];
  const long = body.size[0] >= body.size[2] ? 0 : 2;
  const stem = (n: string) => n.replace(/(_?\d+|Left|Right|Front|Back|A|B)$/, '');
  const ends = parts.filter((p) => p !== body && !p.key && !p.rides && /end|cap/i.test(p.name));
  const moved: string[] = [];
  for (const p of ends) {
    if (moved.includes(p.name)) continue;
    const twin = ends.find((q) => q !== p && !moved.includes(q.name) && stem(q.name) === stem(p.name) && [0, 1, 2].every((i) => Math.abs(q.at[i]! - p.at[i]!) < 0.5));
    if (!twin) continue;
    const reach = body.size[long]! / 2 - p.size[long]! / 2;
    p.at[long] = body.at[long]! - reach;
    twin.at[long] = body.at[long]! + reach;
    moved.push(p.name, twin.name);
  }
  return moved;
}

/**
 * A detail hovering a little over what is under it comes down onto it (round 10: the butter's TopSlab floated 1.9
 * studs over the butter, held up only by a band). A gap under 3 studs is a slip, not a design: the part rests on the
 * highest top beneath its footprint. Further up it is left (a halo, a balloon). Lowest first, so a stack settles. Pure.
 */
export function settle(parts: ObjectPart[]): string[] {
  const moved: string[] = [];
  const overlaps = (a: ObjectPart, b: ObjectPart) => [0, 2].every((i) => Math.abs(a.at[i]! - b.at[i]!) < (a.size[i]! + b.size[i]!) / 2 - 0.05);
  for (const p of [...parts].sort((a, b) => (a.at[1] - a.size[1] / 2) - (b.at[1] - b.size[1] / 2))) {
    if (p.key || p.rides || p.own) continue;
    const bottom = p.at[1] - p.size[1] / 2;
    const under = parts.filter((q) => q !== p && overlaps(p, q) && q.at[1] + q.size[1] / 2 <= bottom + 0.05);
    if (!under.length) continue;
    const rest = Math.max(...under.map((q) => q.at[1] + q.size[1] / 2));
    const gap = bottom - rest;
    if (gap > 0.05 && gap < 3) { p.at[1] -= gap; moved.push(p.name); }
  }
  return moved;
}

/**
 * A long thing lies across the player's view, not pointing at the spawn (round 4: a 6 x 6 x 30 stick of butter showed
 * the spawn only its square end). When the object is more than 1.5 times deeper (Z) than wide (X), every part is
 * turned a quarter about the vertical: X and Z swap, and words on a side go to the side the spawn sees. Parts with a
 * rotation of their own keep the object as it is. Pure; true when it turned.
 */
export function faceAcross(parts: ObjectPart[], basis: ObjectPart[] = parts): boolean {
  const span = (i: number) => Math.max(...basis.map((p) => p.at[i]! + p.size[i]! / 2)) - Math.min(...basis.map((p) => p.at[i]! - p.size[i]! / 2));
  if (parts.length === 0 || parts.some((p) => p.rot) || span(2) <= 1.5 * span(0)) return false;
  for (const p of parts) {
    p.size = [p.size[2], p.size[1], p.size[0]];
    p.at = [-p.at[2], p.at[1], p.at[0]];
    if (p.text && p.text.face !== 'Top' && p.text.face !== 'Bottom') p.text = { ...p.text, face: 'Back' };
    // A hinge named by side turns with it (as at above, x' = -z and z' = x: +Z goes to -X, +X to +Z).
    const hinge: Record<string, string> = { back: 'left', front: 'right', right: 'back', left: 'front' };
    if (p.move?.hinge && hinge[p.move.hinge]) p.move = { ...p.move, hinge: hinge[p.move.hinge] };
  }
  return true;
}

/**
 * Words on a part's top that another part covers, or on a part under the body, cannot be read (round 3: the butter's
 * "BUTTER" sat under its melty top). They go on the side the spawn sees (Back, +Z): the part's own when it is at least
 * 1.5 studs tall there, otherwise the body's (the biggest part) when the body has no words. Pure; returns the parts
 * whose words moved.
 */
export function readableText(parts: ObjectPart[]): string[] {
  const moved: string[] = [];
  const body = [...parts].sort((a, b) => vol(b) - vol(a))[0];
  for (const p of parts) {
    if (!p.text || p.key || p.text.face !== 'Top') continue;
    const above: V3 = [p.at[0], p.at[1] + p.size[1] / 2 + 0.1, p.at[2]];
    if (!parts.some((q) => q !== p && holds(q, above, 0))) continue;
    // A thin part whose body already has words keeps its own on its spawn-side edge when that edge is a stud tall or
    // more; on a thinner edge nobody can read them, so they go (round 6: "SALTED" on a 0.4-stud wrapper edge).
    if (p.size[1] >= 1.5 || !body || body === p) p.text = { ...p.text, face: 'Back' };
    else if (!body.text) { body.text = { ...p.text, face: 'Back' }; delete p.text; }
    else if (p.size[1] >= 1) p.text = { ...p.text, face: 'Back' };
    else delete p.text;
    moved.push(p.name);
  }
  return moved;
}

/** The face a part's words go on when none is given: Top for a flat part, else the thin side facing the spawn. Pure. */
export function thinFace(size: V3): string {
  const thin = size.indexOf(Math.min(...size));
  return thin === 2 && size[2] < size[1] ? 'Back' : thin === 0 && size[0] < size[1] ? 'Right' : 'Top';
}

const LONG_WORDS = /\b(stick|bar|pencil|crayon|sword|baguette|log|rod|wand|pole|plank|ruler|candle|hotdog|hot dog|eclair|churro|noodle|chopstick|flute|spear|branch)s?\b/i;
const FLAT_WORDS = /\b(coin|pizza|cookie|pancake|plate|disc|disk|frisbee|tortilla|waffle|biscuit|cracker|token|mat|rug|carpet|card|phone)s?\b/i;
/** What shape the words name: a stick or bar is long, a coin or pizza is flat. Pure. */
export function shapeWord(words: string): 'long' | 'flat' | undefined {
  const spaced = words.replace(/([a-z])([A-Z])/g, '$1 $2');
  return LONG_WORDS.test(spaced) ? 'long' : FLAT_WORDS.test(spaced) ? 'flat' : undefined;
}

/**
 * A thing named for its shape gets that shape whatever proportions the model sent (rounds 3 and 7 of test 2: a "stick
 * of butter" came out 20 x 6 x 10 and 12 x 9 x 6, a block). Long: the longer side across the ground is stretched to 3.5
 * times the next one. Flat: the height is squashed to a quarter of the shorter side across. Positions stretch with
 * the sizes, so details stay on the body. Pure; the factor used, 1 when it was already that shape.
 */
export function shapeTo(parts: ObjectPart[], shape: 'long' | 'flat' | undefined, basis: ObjectPart[] = parts): number {
  if (!shape || parts.length === 0 || basis.length === 0) return 1;
  const span = (i: number) => Math.max(...basis.map((p) => p.at[i]! + p.size[i]! / 2)) - Math.min(...basis.map((p) => p.at[i]! - p.size[i]! / 2));
  const [x, y, z] = [span(0), span(1), span(2)];
  if (shape === 'long') {
    const axis = x >= z ? 0 : 2, along = Math.max(x, z), next = Math.max(Math.min(x, z), y);
    if (along >= 3 * next) return 1;
    const k = 3.5 * next / along;
    // Parts that run most of the length stretch with it; a small detail keeps its size and only moves with the body
    // (test 3 round 11, 2026-10-01: a label stretched into a block jutting 8 studs out of the butter's front).
    for (const p of parts) { if (p.size[axis] >= 0.5 * along) p.size[axis] *= k; p.at[axis] *= k; }
    return k;
  }
  const lowest = Math.min(...basis.map((p) => p.at[1]! - p.size[1]! / 2));
  if (y <= 0.35 * Math.min(x, z)) return 1;
  const k = 0.25 * Math.min(x, z) / y;
  for (const p of parts) { if (p.size[1] >= 0.5 * y) p.size[1] *= k; p.at[1] = lowest + (p.at[1] - lowest) * k; }
  return k;
}

/** Where each detail sits on the body, said plainly (round 7: the reply put a wrapper "on top" that was under it). Pure. */
export function placesOf(parts: ObjectPart[]): string[] {
  const body = [...parts].filter((p) => !p.own).sort((a, b) => vol(b) - vol(a))[0];
  if (!body) return [];
  const top = body.at[1] + body.size[1] / 2, bottom = body.at[1] - body.size[1] / 2;
  return parts.filter((p) => p !== body && !p.own).map((p) => {
    const lo = p.at[1] - p.size[1] / 2, hi = p.at[1] + p.size[1] / 2;
    const where = lo >= top - 0.05 ? 'on top of' : hi <= bottom + 0.05 ? 'under' : p.at[2] > body.at[2] + body.size[2] / 2 - 0.05 ? 'on the front of' : 'on';
    return `${p.name} is ${where} ${body.name}`;
  });
}

/** A player is 5 studs tall; a thing to walk up to is 2-4 player heights at its longest (owner: "a butter stick taller than the player"). */
export const PLAYER_HEIGHT = 5;
const FIT_MIN = 12, FIT_TO = 15, MIN_TALL = 4, FIT_MAX = 40;
/**
 * The factor that makes a too-small object worth walking up to: its longest side becomes FIT_TO studs when it is under
 * FIT_MIN (test 2 round 2: the model sent an 8 x 2 x 2 stick of butter, under half a player tall, though the tool asks
 * for 1.5-3 player heights). 1 when it is big enough already. Pure.
 */
export function fitFactor(parts: ObjectPart[]): number {
  if (parts.length === 0) return 1;
  const span = (i: number) => Math.max(...parts.map((p) => p.at[i]! + p.size[i]! / 2)) - Math.min(...parts.map((p) => p.at[i]! - p.size[i]! / 2));
  const longest = Math.max(span(0), span(1), span(2)), tall = span(1);
  if (!(longest > 0)) return 1;
  // And at least 4 studs tall, so it is not a curb at the player's feet (round 10: a 13.6 x 2 x 2.5 butter), while
  // never more than FIT_MAX long.
  const k = Math.max(longest < FIT_MIN ? FIT_TO / longest : 1, tall > 0 && tall < MIN_TALL ? MIN_TALL / tall : 1);
  return k > 1 ? Math.max(1, Math.min(k, FIT_MAX / longest)) : 1;
}

/**
 * An object nobody can do anything with is a statue (test 2 round 2: no move on any part, so no click, no sound, no
 * counter). When nothing moves, the biggest part wobbles on a click with a squish and the rest ride it, so the whole
 * thing reacts as one. Pure; returns the part that now moves, if any.
 */
export function giveMotion(parts: ObjectPart[]): string | undefined {
  if (parts.length === 0 || parts.some((p) => p.key)) return undefined;
  // Moves that only play by themselves leave the player nothing to do (round 6: a butter that bobbed on a loop, a
  // reply saying "click it!", and a counter stuck at 0): the biggest of them plays on a click instead.
  const moving = parts.filter((p) => p.move);
  if (moving.length && moving.every((p) => p.move!.on === 'loop' || p.move!.on === 'once')) {
    const lead = [...moving].sort((a, b) => vol(b) - vol(a))[0]!;
    lead.move = { ...lead.move!, on: 'click' };
    return lead.name;
  }
  if (moving.length || parts.some((p) => p.rides)) return undefined;
  const body = [...parts].filter((p) => (p.transparency ?? 0) <= 0.5).sort((a, b) => vol(b) - vol(a))[0] ?? parts[0]!;
  body.move = { as: 'wobble', on: 'click', sound: 'squish' };
  for (const p of parts) if (p !== body) p.rides = body.name;
  return body.name;
}

/** The colour covering the most of an object (by part volume). Pure. */
export function mainColour(parts: ObjectPart[]): string {
  const by = new Map<string, number>();
  for (const p of parts) by.set(p.color, (by.get(p.color) ?? 0) + p.size[0] * p.size[1] * p.size[2]);
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#ffffff';
}

/** A stage colour that stands apart from an object's main colour: blue under warm colours, gold under cool ones. Pure. */
export function contrastStage(hex: string): string {
  const n = parseInt(hex.slice(1), 16), [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 30) return '#4f8cff';            // grey, white or black: a clear blue
  const h = max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  return h < 2.2 || h > 5.2 ? '#4f8cff' : '#ffd23f'; // red, orange, yellow (and pink) stand on blue; green, cyan, blue on gold
}

/** A colour from hue, saturation and value (each 0..1) as "#rrggbb". Pure. */
export function hsvHex(h: number, sat: number, val: number): string {
  const hh = ((h % 1) + 1) % 1 * 6, i = Math.floor(hh), f = hh - i;
  const p = val * (1 - sat), q = val * (1 - sat * f), t = val * (1 - sat * (1 - f));
  const [r, g, b] = [[val, t, p], [q, val, p], [p, val, t], [p, q, val], [t, p, val], [val, p, q]][i % 6]!;
  return '#' + [r, g, b].map((c) => Math.round((c ?? 0) * 255).toString(16).padStart(2, '0')).join('');
}

/** A colour made lighter (amount > 0, toward white) or darker (toward black). Pure. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)));
  return `#${c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * How a keyboard looks, from the user's own words (owner's references, 2026-10-01: a dark gamer board with small glowing
 * rainbow legends, and a Roblox walk-on board of caramel keycaps with black letters; our pastel toy slabs were neither).
 * rgb unless the words ask for sweets, for pastel, or name colours of their own. Pure.
 */
export type KeyboardTheme = 'rgb' | 'candy' | 'pastel' | 'given';
export function keyboardTheme(request: string | undefined): KeyboardTheme {
  const t = String(request ?? '').toLowerCase();
  if (/\b(chocolate|caramel|candy|sweets?|cookies?|cake|dessert|toffee|cocoa)\b/.test(t)) return 'candy';
  if (/\b(pastel|cute|kawaii|rainbow|colou?rful|toy|bubbly)\b/.test(t)) return 'pastel';
  if (/\b(red|blue|green|white|black|gold|golden|purple|pink|orange|yellow|silver|cyan|teal|grey|gray)\b/.test(t)) return 'given';
  return 'rgb';
}
const CANDY_CAPS = ['#f0c48a', '#d9975c', '#c27f45', '#e8b070'];

const ROW_START = /^(tab|caps|capslock|caps lock|shift|lshift|ctrl|control|lctrl)$/i;
const ROW_MAX = 16;

/**
 * Rows a keyboard can have. A lone key on a row of its own (an ENTER under its row) joins the row above; when most rows
 * hold one key the model wrote one key per row, so they are one sequence; and a row longer than any real keyboard row is
 * wrapped where real rows start (Tab, Caps, the first Shift, Ctrl), else in thirteens. Live 2026-10-01: an ENTER sat cut
 * off from the board, and then 53 keys came out in one 270-stud row. Pure.
 */
/** A symbol key written by name ("Backslash", the build_object schema asks for it) as the character on its cap. */
const SYMBOL_NAMES: Record<string, string> = {
  backslash: '\\', quote: "'", apostrophe: "'", backquote: '`', grave: '`', tilde: '`', semicolon: ';', comma: ',', period: '.', dot: '.',
  slash: '/', minus: '-', dash: '-', equals: '=', equal: '=', leftbracket: '[', rightbracket: ']', lbracket: '[', rbracket: ']',
};
export function symbolOf(label: string): string {
  return SYMBOL_NAMES[label.trim().toLowerCase().replace(/[\s_-]+/g, '')] ?? label;
}

const BOTTOM_ROW = ['Ctrl', 'Win', 'Alt', 'Space', 'Alt', 'Fn', 'Ctrl'];
const F_ROW = ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];

/**
 * A board is a real board: a space bar alone on its row gets the modifiers either side of it, and a board with a number
 * row and no function row gets Esc and F1-F12 above it, Esc moving up off the number row (owner's reference keyboard,
 * 2026-10-01; ours had a lone 6-key space bar and no F row). Pure.
 */
export function completeKeyboard(rows: string[][]): string[][] {
  // A space-bar row without its modifiers becomes the real bottom row; anything else on it (an Enter, a Shift) moves up to
  // the end of the row above, where a real board has it (round 13: a bottom row of only SPACE and ENTER).
  const out = rows.map((r) => [...r]);
  for (let i = 0; i < out.length; i++) {
    const r = out[i]!;
    const hasSpace = r.some((l) => /^(space|spacebar)$/i.test(l.trim()));
    const hasMods = r.some((l) => /^(ctrl|control|alt|win|cmd|fn|option)$/i.test(l.trim()));
    if (!hasSpace || hasMods) continue;
    const others = r.filter((l) => !/^(space|spacebar)$/i.test(l.trim()));
    out[i] = [...BOTTOM_ROW];
    if (!others.length) continue;
    // No row above: the other keys become one, never lost.
    if (i === 0) { out.splice(0, 0, others); i += 1; continue; }
    for (const l of others) if (!out[i - 1]!.some((x) => x.toLowerCase() === l.toLowerCase())) out[i - 1]!.push(l);
  }
  const numbers = out.findIndex((r) => r.includes('1') && r.includes('2'));
  const hasF = out.some((r) => r.some((l) => /^F([1-9]|1[0-2])$/i.test(l.trim())));
  // Only a typing keyboard: a calculator or a keypad has 1 and 2 on a row too.
  const qwerty = out.some((r) => r.some((l) => /^q$/i.test(l.trim())) && r.some((l) => /^w$/i.test(l.trim())));
  if (numbers >= 0 && !hasF && qwerty) {
    out[numbers] = out[numbers]!.map((l) => /^(esc|escape)$/i.test(l.trim()) ? '`' : l);
    out.splice(numbers, 0, [...F_ROW]);
  }
  return out;
}

export function keyboardRows(given: string[][]): string[][] {
  const singles = given.filter((r) => r.length === 1).length;
  const merged = given.length > 2 && singles > given.length / 2
    ? [given.flat()]
    : given.reduce<string[][]>((acc, r) => {
      if (r.length === 1 && acc.length && !/^(space|spacebar)$/i.test(r[0]!.trim())) acc[acc.length - 1]!.push(r[0]!);
      else acc.push([...r]);
      return acc;
    }, []);
  return merged.flatMap((row) => {
    if (row.length <= ROW_MAX) return [row];
    const out: string[][] = [[]];
    const seen = new Set<string>();
    for (const label of row) {
      const kind = label.trim().toLowerCase().replace(/^(l|left)\s*/, '').replace(/\s+/g, '');
      const starts = ROW_START.test(label.trim()) && !seen.has(kind);
      if (starts) seen.add(kind);
      if (starts && out[out.length - 1]!.length) out.push([]);
      out[out.length - 1]!.push(label);
    }
    return out.flatMap((r) => r.length <= ROW_MAX ? [r] : Array.from({ length: Math.ceil(r.length / 13) }, (_, i) => r.slice(i * 13, i * 13 + 13)));
  });
}

/**
 * A `rows` entry (a keyboard, a keypad, a piano, a calculator): rows of labels laid out by code, so keys never overlap
 * however many there are (owner, 2026-10-01: the hand-placed keyboard put ENTER on BACK). Keys are a `unit` wide (2
 * studs) times their real width, `gap` apart, rows left-aligned front to back, on a case; each key is pressed by its
 * real keyboard key when the move is on "key". Pure: returns plain part entries for expandObject.
 */
export function unrollRows(p: Record<string, unknown>, index: number): Record<string, unknown>[] {
  // The same label twice in a row is one wide key written as cells (live 2026-10-01: "Space" five times made a 176-stud
  // board with five space bars), so it is one key at its real width.
  const given = (p.rows as unknown[]).filter(Array.isArray)
    .map((r) => (r as unknown[]).map((l) => symbolOf(String(l ?? '').slice(0, 12))).filter(Boolean)
      .filter((l, i, r) => i === 0 || l.trim().toLowerCase() !== r[i - 1]!.trim().toLowerCase()))
    .filter((r) => r.length > 0);
  const rows = completeKeyboard(keyboardRows(given));
  const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  // Low enough to walk onto (owner's play test, 2026-10-01: he had to jump onto the keyboard): case and key together are
  // under half a key, so a player steps up onto it and runs across the keys.
  // Chunky caps on a thin case: the same step up as before (under half a key), most of it keycap (the references).
  const unit = num(p.unit, 2, 0.5, 20), gap = num(p.gap, unit * 0.1, 0, unit), height = num(p.height ?? p.keyHeight, unit * 0.36, 0.2, 20);
  const theme: KeyboardTheme = ['rgb', 'candy', 'pastel', 'given'].includes(String(p.theme)) ? p.theme as KeyboardTheme : 'pastel';
  // A slim keyboard body just around the keys, not a wide plane (owner, 2026-10-01: "a giant plane with cubes").
  const margin = num(p.margin, unit * 0.3, 0, 50);
  const colours = (Array.isArray(p.colors ?? p.colours) ? (p.colors ?? p.colours) as unknown[] : PASTEL).map(colourHex).filter(Boolean) as string[];
  const widthOf = (label: string) => KEY_WIDTH.find(([re]) => re.test(label))?.[1] ?? num((p.widths as Record<string, unknown> | undefined)?.[label], 1, 0.5, 12);
  const rowWidth = (r: string[]) => r.reduce((w, l) => w + widthOf(l) * unit, 0) + gap * (r.length - 1);
  const width = Math.max(...rows.map(rowWidth)), depth = rows.length * unit + gap * (rows.length - 1);
  const origin = v3(p.at ?? p.position) ?? [0, 0, 0];
  const caseTop = p.case === false ? 0 : num(p.caseHeight, unit * 0.1, 0.2, 20);
  const base = String(p.name ?? 'Key').replace(/[^A-Za-z0-9_]/g, '') || `Key${index + 1}`;
  const out: Record<string, unknown>[] = [];
  if (p.case !== false) {
    const caseColour = theme === 'rgb' ? '#16171b' : theme === 'candy' ? '#4a2c1a' : colourHex(p.case) ?? '#eef0f6';
    out.push({ name: `${base}Case`, size: [width + 2 * margin, caseTop, depth + 2 * margin], at: [origin[0], origin[1] + caseTop / 2, origin[2]], color: caseColour, surface: 'smooth', own: true });
    // A gamer board glows underneath: a thin neon band just inside the case's foot.
    if (theme === 'rgb') {
      out.push({ name: `${base}GlowCase`, size: [width + 2 * margin + 0.3, Math.min(0.25, caseTop * 0.5), depth + 2 * margin + 0.3], at: [origin[0], origin[1] + Math.min(0.25, caseTop * 0.5) / 2, origin[2]], color: '#b44dff', surface: 'smooth', material: 'Neon', own: true });
    }
  }
  const used = new Set<string>();
  rows.forEach((row, ri) => {
    // A row of one or two keys (the space bar row) sits in the middle, like a real keyboard; the rest start at the left.
    let x = origin[0] - (row.length <= 2 ? rowWidth(row) / 2 : width / 2);
    const z = origin[2] - depth / 2 + ri * (unit + gap) + unit / 2;
    row.forEach((label, ci) => {
      const w = widthOf(label) * unit;
      let name = `Key_${keyCodeName(label) ?? (label.replace(/[^A-Za-z0-9]/g, '') || `${ri}_${ci}`)}`;
      while (used.has(name)) name += '_';
      used.add(name);
      // A real keycap (owner's reference, 2026-10-01: "it just a textured cube"): a darker skirt with a lighter, inset
      // top that carries the letter in dark ink, smooth plastic; the skirt rides the top, so they press as one.
      const colour = theme === 'rgb' ? '#30323a' : theme === 'candy' ? CANDY_CAPS[(ri * 3 + ci) % CANDY_CAPS.length]! : colours[(ri + ci) % colours.length] ?? '#d7dde2';
      // The legend: a rainbow across the board on a gamer keyboard (its hue follows the key's place left to right), black
      // on caramel, dark ink on pastel.
      const across = width > 0 ? (x + w / 2 - (origin[0] - width / 2)) / width : 0;
      const legend = theme === 'rgb' ? hsvHex(0.83 - across * 0.83, 0.85, 1) : theme === 'candy' ? '#2a1a10' : '#3a3a4a';
      const skirtH = height * 0.6, capH = height * 0.4, y0 = origin[1] + caseTop;
      out.push({
        name: `${name}Skirt`, size: [w, skirtH, unit], at: [x + w / 2, y0 + skirtH / 2, z], color: shade(colour, theme === 'rgb' ? -0.3 : -0.16), rides: name, surface: 'smooth',
      });
      out.push({
        name, size: [Math.max(0.4, w - unit * 0.18), capH, unit * 0.82], at: [x + w / 2, y0 + skirtH + capH / 2, z], color: shade(colour, theme === 'rgb' ? 0.06 : 0.22),
        text: { value: label.length > 1 ? (theme === 'rgb' ? label : label.toUpperCase()) : (theme === 'pastel' ? label.toLowerCase() : label.toUpperCase()), face: 'Top', color: legend, ...(theme === 'rgb' ? { font: 'GothamBold', glow: true } : {}) }, key: label, surface: 'smooth',
        // A keyboard key always answers its real key (owner, 2026-10-01: the model asked for "click" and typing on the
        // real keyboard stopped working); a key clip is also clicked and stepped on (AppleAnimate).
        ...(p.move ? { move: { ...(p.move as Record<string, unknown>), ...(keyCodeName(label) ? { on: 'key' } : {}) } } : {}),
      });
      x += w + gap;
    });
  });
  return out;
}

const NOT_A_KEYBOARD_PART = /screen|monitor|display|desk|table|wall|counter|sign|board(?!.*key)/i;
const KEYBOARD_EXTRA = /wrist|palm|rest|knob|dial|cable|cord/i;

/**
 * A wrist or palm rest lies on the ground just in front of the bottom row, no wider than the keys (live 2026-10-01: the
 * model floated it behind the number row). Any other part is returned as it is. Pure.
 */
function restBeside(p: ObjectPart, keys: ObjectPart[], x0: number, x1: number, z1: number, floor: number): ObjectPart {
  if (!/wrist|palm|rest/i.test(p.name)) return p;
  const unit = Math.min(...keys.map((k) => Math.min(k.size[0], k.size[2])));
  // Lower than the keytops: a rest taller than the keys was a wall hiding the board from the spawn (round 12).
  const keyTop = Math.max(...keys.map((k) => k.at[1] + k.size[1] / 2));
  const width = Math.min(p.size[0], (x1 - x0) * 0.7), height = Math.min(p.size[1], unit * 0.6, Math.max(0.3, (keyTop - floor) * 0.6)), depth = Math.min(Math.max(p.size[2], unit), unit * 2);
  // A block: a long cylinder lies along X as a pipe one stud thick (the owner's screenshot, 2026-10-01).
  return { ...p, shape: 'block', rot: undefined, size: [width, height, depth], at: [(x0 + x1) / 2, floor + height / 2, z1 + unit * 0.6 + depth / 2] };
}

/**
 * A keyboard the model placed key by key is laid out again by code (owner, 2026-10-01: the model ignored `rows` and
 * hand-placed the keys again, with an 18-stud "CounterScreen" wall behind them). When 8 or more parts are labelled
 * with keyboard keys, their labels are read row by row (front to back by z, left to right by x) and laid out with
 * unrollRows at the model's own key size; the plates under them and any screen, monitor, desk or wall go (a counter
 * screen is already on the player's screen). Each key keeps the motion and sound it was given. Pure.
 */
export function relayKeyboard(all: ObjectPart[], laidOut = false, theme: KeyboardTheme = 'pastel'): ObjectPart[] {
  // A keycap's skirt rides its top and is part of the key, never a plate under the keyboard.
  const riders = all.filter((p) => p.rides);
  const parts = all.filter((p) => !p.rides);
  const labelOf = (p: ObjectPart) => (p.text?.value && keyCodeName(p.text.value.trim()) ? p.text.value.trim() : p.key && p.move ? p.key : undefined);
  const isKey = (p: ObjectPart) => labelOf(p) !== undefined;
  const keys = parts.filter(isKey);
  if (keys.length < 8) return all;
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 1;
  const single = keys.filter((k) => labelOf(k)!.length === 1);
  const unit = median((single.length ? single : keys).map((k) => Math.min(k.size[0], k.size[2])));
  const height = median(keys.map((k) => k.size[1]));
  // Rows: keys whose centres are within half a key of each other front to back.
  const byZ = [...keys].sort((a, b) => a.at[2] - b.at[2]);
  const rows: ObjectPart[][] = [];
  for (const k of byZ) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(k.at[2] - row[0]!.at[2]) < unit * 0.5) row.push(k); else rows.push([k]);
  }
  for (const row of rows) row.sort((a, b) => a.at[0] - b.at[0]);
  const x0 = Math.min(...keys.map((k) => k.at[0] - k.size[0] / 2)), x1 = Math.max(...keys.map((k) => k.at[0] + k.size[0] / 2));
  const z0 = Math.min(...keys.map((k) => k.at[2] - k.size[2] / 2)), z1 = Math.max(...keys.map((k) => k.at[2] + k.size[2] / 2));
  const keyBottom = Math.min(...keys.map((k) => k.at[1] - k.size[1] / 2));
  const floor = Math.min(keyBottom, ...parts.filter((p) => p.own).map((p) => p.at[1] - p.size[1] / 2));
  const under = (p: ObjectPart) => !isKey(p) && p.at[1] + p.size[1] / 2 <= keyBottom + 0.05 &&
    p.at[0] - p.size[0] / 2 < x1 && p.at[0] + p.size[0] / 2 > x0 && p.at[2] - p.size[2] / 2 < z1 && p.at[2] + p.size[2] / 2 > z0;
  // Anything else lying over the keys hides them (live 2026-10-01: a lilac "DeckPlate" above the keycaps read as one
  // big plane, and LED strips floated over the space bar), so only what is beside the keys stays.
  const overKeys = (p: ObjectPart) => !isKey(p) && !p.own &&
    p.at[0] - p.size[0] / 2 < x1 && p.at[0] + p.size[0] / 2 > x0 && p.at[2] - p.size[2] / 2 < z1 && p.at[2] + p.size[2] / 2 > z0;
  // Only what a keyboard has besides its keys stays: a wrist rest, a knob, a cable (live 2026-10-01: a cyan "LED" ball
  // floated on the stage and a pink bar lay along the keys).
  // A rest is put beside the keys first, then judged: judged where the model put it, a rest under the front row went as a plate.
  const kept = parts.filter((p) => !isKey(p) && !NOT_A_KEYBOARD_PART.test(p.name) && KEYBOARD_EXTRA.test(p.name))
    .map((p) => restBeside(p, keys, x0, x1, z1, floor)).filter((p) => !under(p) && !overKeys(p));
  // Laid out by rows already: keep the tool's keys and case, and only drop the model's own plates and screens.
  // A part bound to a key a labelled keycap already answers is a second key: live 2026-10-01 a 36-stud unlabelled pink
  // "Spacebar" bounced in front of the board beside the real SPACE key.
  const labelled = new Set(keys.filter((k) => k.text).map((k) => keyCodeName(k.key ?? '') ?? k.key));
  // Laid out by rows, the keys are the layout's own (each top rides on its skirt); a key the model placed besides them is a
  // second copy (round 11: a cyan studded "CTRL" block beside the real Ctrl).
  const skirted = new Set(riders.map((r) => r.rides));
  const realKeys = laidOut ? keys.filter((k) => skirted.has(k.name)) : keys.filter((k) => k.text || !labelled.has(keyCodeName(k.key ?? '') ?? k.key));
  // Only the layout's own case: a model's part merely NAMED "Case" (round 12: 90x3x36, its top above the keytops) swallowed
  // every key on the hub.
  if (laidOut) return [...realKeys, ...riders, ...parts.filter((p) => p.own && !isKey(p)), ...kept.filter((p) => !p.own && !/Case$/.test(p.name))];
  const moveOf = new Map(keys.map((k) => [labelOf(k)!.toLowerCase(), k.move]));
  const colours = [...new Set(keys.map((k) => k.color))].slice(0, 6);
  const laid = unrollRows({
    name: 'Key', rows: rows.map((r) => r.map((k) => labelOf(k)!)), unit, gap: unit * 0.12, height: Math.min(height, unit * 0.35),
    colors: colours.length > 1 ? colours : undefined, case: '#eef0f6', at: [(x0 + x1) / 2, 0, (z0 + z1) / 2], move: keys.find((k) => k.move)?.move, theme,
  }, 0);
  const made: ObjectPart[] = laid.map((r) => {
    const label = (r.text as { value: string } | undefined)?.value;
    const given = label ? moveOf.get(label.trim().toLowerCase()) ?? moveOf.get(String(r.key ?? '').toLowerCase()) ?? keys.find((k) => k.move)?.move : undefined;
    const move = given && label && keyCodeName(label) ? { ...given, on: 'key' } : given;
    const key = label ? keyCodeName(label) : undefined;
    return {
      name: String(r.name), shape: 'block', size: r.size as V3, at: r.at as V3, color: String(r.color),
      ...(r.text ? { text: r.text as ObjectPart['text'] } : {}), ...(move ? { move } : {}), ...(key ? { key } : {}),
      ...(typeof r.rides === 'string' ? { rides: r.rides } : {}), ...(r.surface === 'smooth' ? { surface: 'smooth' as const } : {}), ...(r.material === 'Neon' ? { material: 'Neon' as const } : {}), ...(r.own === true ? { own: true } : {}),
    };
  });
  return [...made, ...kept];
}

/**
 * The spec, checked and expanded: repeats unrolled, the scale applied, every part sitting on y = 0 or above. Pure.
 * `at` is the part's centre relative to the object's origin; y = 0 is the stage's top.
 */
export function expandObject(a: Record<string, unknown>): ObjectPlan | { error: string } {
  // A name is cleaned, not refused ("ASMR Keyboard" -> AsmrKeyboard): the re-test lost a build to a space.
  const words = String(a.name ?? '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const name = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('').replace(/^[0-9]+/, '').slice(0, 40) || 'MyObject';
  if (!NAME.test(name)) return { error: 'name must be a plain name (letters, digits, _), e.g. AsmrKeyboard' };
  const scale = a.scale === undefined ? 1 : Number(a.scale);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 50) return { error: 'scale must be between 0 and 50' };
  // Every `rows` entry is one keyboard: a model that gives one entry per row gets them merged, front to back.
  const given = Array.isArray(a.parts) ? a.parts : [];
  const isRows = (r: unknown) => Boolean(r && typeof r === 'object' && Array.isArray((r as Record<string, unknown>).rows));
  const rowEntries = given.filter(isRows) as Record<string, unknown>[];
  const merged = rowEntries.length > 1 ? [{ ...rowEntries[0], at: undefined, rows: [...rowEntries].sort((x, y) => (v3(x.at)?.[2] ?? 0) - (v3(y.at)?.[2] ?? 0)).flatMap((e) => e.rows as unknown[]) }] : rowEntries;
  // Keys about 4 studs across once scaled, bigger than a player's feet like the owner's reference, unless the model
  // gave a unit (the re-test's keyboard came out with 2-stud keys).
  const raw = [...given.filter((r) => !isRows(r)), ...merged.flatMap((r, i) => unrollRows({ unit: 4 / scale, ...r, theme: a.theme ?? 'pastel' }, i))];
  if (raw.length === 0) return { error: 'parts is empty: list what the object is made of' };
  const parts: ObjectPart[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const [i, r] of raw.entries()) {
    const p = (r ?? {}) as Record<string, unknown>;
    // Forgiving on purpose: a slip in a name, shape, colour or key costs a fixed-up part, never the whole build.
    const cleaned = String(p.name ?? p.id ?? p.label ?? p.kind ?? p.part ?? '').replace(/[^A-Za-z0-9_]/g, '');
    // A part with no name is named for how it looks, so the answer can say "two cyan wedges" and not "ten parts"
    // (test 3 round 5, 2026-10-01: an upgrade's ten new parts came without names and were said as "ten parts").
    const base = NAME.test(cleaned) ? cleaned : lookName(colourHex(p.color ?? p.colour), String(p.shape ?? 'block'));
    const rawShape = String(p.shape ?? 'block').toLowerCase();
    const shape = SHAPES.has(rawShape) ? rawShape : rawShape === 'sphere' ? 'ball' : rawShape === 'cube' || rawShape === 'box' ? 'block' : rawShape === 'cyl' ? 'cylinder' : 'block';
    const sizeRaw = v3(p.size ?? p.dimensions);
    // One unreadable part is skipped and reported, never the whole object; a flat side is made 0.2 thick.
    if (!sizeRaw) { skipped.push(`parts[${i}] (${String(p.name ?? '?')}): no size [x, y, z]`); continue; }
    const size = sizeRaw.map((n) => Math.max(0.2, Math.abs(n))) as V3;
    // Where it goes: `at`, or the names models also use; missing means standing on the ground at the middle.
    const at = v3(p.at ?? p.position ?? p.pos ?? p.offset ?? p.center ?? p.centre) ?? [0, size[1] / 2, 0] as V3;
    const rot = v3(p.rot ?? p.rotation ?? p.orientation) ?? undefined;
    const color = colourHex(p.color ?? p.colour) ?? '#d7dde2';
    let move: Move | undefined;
    if (p.move !== undefined) {
      const m = (p.move ?? {}) as Record<string, unknown>;
      const as = String(m.as ?? '').toLowerCase(), onRaw = String(m.on ?? 'click').toLowerCase();
      if (!MOTIONS.has(as)) return { error: `parts[${i}].move.as must be press, spin, bob, open, wobble or pop` };
      const on = TRIGGERS.has(onRaw) ? onRaw : onRaw === 'keypress' || onRaw === 'keyboard' ? 'key' : 'click';
      const hingeRaw = m.hinge === undefined ? undefined : String(m.hinge).toLowerCase();
      const hinge = hingeRaw !== undefined && HINGES.has(hingeRaw) ? hingeRaw : undefined;
      const amount = m.amount === undefined ? undefined : Number(m.amount);
      if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > 1000)) return { error: `parts[${i}].move.amount must be a positive number` };
      move = { as, on, ...(hinge ? { hinge } : {}), ...(amount ? { amount } : {}), ...(typeof m.sound === 'string' ? { sound: m.sound.slice(0, 80) } : {}), ...(typeof m.prompt === 'string' ? { prompt: m.prompt.slice(0, 30) } : {}) };
    }
    const textIn = p.text;
    const textOf = (value: unknown) => value === undefined || value === '' ? undefined : {
      // No face given: the side the part is thinnest on, the one the player sees from the spawn (+Z is Roblox's Back):
      // a label standing on a butter's side reads from the spawn, not from the sky.
      value: String(value).slice(0, 24), face: typeof (textIn as Record<string, unknown>)?.face === 'string' ? String((textIn as Record<string, unknown>).face) : thinFace(size),
      color: HEX.test(String((textIn as Record<string, unknown>)?.color ?? '')) ? String((textIn as Record<string, unknown>).color) : '#ffffff',
      ...(HEX.test(String((textIn as Record<string, unknown>)?.color ?? '')) ? { inked: true } : {}),
      ...(/^[A-Za-z]{3,30}$/.test(String((textIn as Record<string, unknown>)?.font ?? '')) ? { font: String((textIn as Record<string, unknown>).font) } : {}),
      ...((textIn as Record<string, unknown>)?.glow === true ? { glow: true } : {}),
    };
    const rep = (p.repeat ?? null) as Record<string, unknown> | null;
    const grid = rep ? v3(rep.grid) : [1, 1, 1] as V3;
    const step = rep ? v3(rep.step) : [0, 0, 0] as V3;
    if (!grid || grid.some((n) => n < 1 || !Number.isInteger(n))) return { error: `parts[${i}].repeat.grid must be whole counts [nx, ny, nz]` };
    if (!step) return { error: `parts[${i}].repeat.step must be [dx, dy, dz]` };
    const count = grid[0] * grid[1] * grid[2];
    if (parts.length + count > MAX_PARTS) return { error: `more than ${MAX_PARTS} parts; use fewer or bigger pieces` };
    const names = Array.isArray(rep?.names) ? rep!.names as unknown[] : [];
    const texts = Array.isArray(rep?.texts) ? rep!.texts as unknown[] : [];
    const keys = Array.isArray(rep?.keys) ? rep!.keys as unknown[] : [];
    let k = 0;
    for (let iy = 0; iy < grid[1]; iy++) for (let iz = 0; iz < grid[2]; iz++) for (let ix = 0; ix < grid[0]; ix++, k++) {
      const partName = count === 1 ? base : (typeof names[k] === 'string' && NAME.test(names[k] as string) ? names[k] as string : `${base}${k + 1}`);
      // A repeated name is renamed, never fatal (owner, 2026-10-01: "two parts are named Key_0_11" sank a build).
      let unique = partName;
      for (let n = 2; seen.has(unique); n++) unique = `${partName}_${n}`;
      seen.add(unique);
      // The key a part answers to: given, or read from its label ("Q" on a key is the Q key).
      const label = count === 1 ? (typeof textIn === 'string' ? textIn : (textIn as Record<string, unknown>)?.value) : texts[k];
      const key = keyCodeName(count === 1 ? p.key : keys[k]) ?? (move?.on === 'key' ? keyCodeName(label) : undefined);
      const text = count === 1 ? textOf((textIn as Record<string, unknown>)?.value ?? (typeof textIn === 'string' ? textIn : undefined)) : textOf(texts[k]);
      parts.push({
        name: unique, shape, color,
        size: size.map((n) => n * scale) as V3,
        at: [(at[0] + ix * step[0]) * scale, (at[1] + iy * step[1]) * scale, (at[2] + iz * step[2]) * scale],
        ...(rot ? { rot } : {}),
        ...(typeof p.transparency === 'number' && p.transparency >= 0 && p.transparency < 1 ? { transparency: p.transparency } : {}),
        ...(text ? { text } : {}),
        ...(move ? { move: { ...move, ...(move.amount ? { amount: move.amount * (move.as === 'spin' || move.as === 'open' || move.as === 'wobble' ? 1 : scale) } : {}) } } : {}),
        ...(key ? { key } : {}),
        ...(count === 1 && typeof p.rides === 'string' && NAME.test(p.rides) ? { rides: p.rides } : {}),
        ...(p.surface === 'smooth' ? { surface: 'smooth' as const } : {}),
        // A part named for a glow glows (test 3 round 7: a "GlowStripe" and two "Flame"s came out as plain plastic).
        ...(p.material === 'Neon' || (p.material === undefined && GLOW_NAME.test(base)) ? { material: 'Neon' as const } : {}),
        ...(p.own === true ? { own: true } : {}),
      });
    }
  }
  // A keyboard placed key by key is laid out by code (relayKeyboard), unless the model already used rows.
  const usedRows = (Array.isArray(a.parts) ? a.parts : []).some((r) => r && typeof r === 'object' && Array.isArray((r as Record<string, unknown>).rows));
  const extrasAsked = parts.filter((p) => !p.text && !p.key && !p.rides).map((p) => p.name);
  // Only a keyboard-like thing is laid out as a keyboard: rows given, or its name or the request says so (test 3 round 6:
  // a butter's labelled crown, wings and flames became nine keycaps on a case).
  const keyboardish = usedRows || parts.filter((p) => p.move?.on === 'key').length >= 8
    || /key|piano|synth|typewriter|calculator|numpad|organ|accordion/i.test(`${String(a.name ?? '')} ${String(a.request ?? '')}`);
  if (keyboardish) parts.splice(0, parts.length, ...relayKeyboard(parts, usedRows, (['rgb', 'candy', 'pastel', 'given'] as const).find((t) => t === a.theme) ?? 'pastel'));
  const kept = new Set(parts.map((p) => p.name));
  const dropped = extrasAsked.filter((n) => !kept.has(n));
  // A keyboard's own extras wear its theme (round 11: a hot-pink studded wrist rest and a cyan block on a dark gamer
  // board): dark smooth plastic and a silver knob on rgb, chocolate on candy.
  const boardTheme = (['rgb', 'candy'] as const).find((t) => t === a.theme);
  if (boardTheme && parts.some((p) => p.text && p.key)) {
    for (const p of parts) {
      if (p.text || p.rides || p.key || p.own) continue;
      p.color = /knob|dial/i.test(p.name) ? (boardTheme === 'rgb' ? '#c9cdd6' : '#f0c48a') : boardTheme === 'rgb' ? '#22242a' : '#5a341d';
      p.surface = 'smooth';
    }
  }
  // Anything that is not a keyboard: nothing hidden inside another part, something to do with it, and big enough.
  const board = parts.some((p) => p.key || p.rides);
  // An upgrade is measured by the object it had, so new details do not stretch, turn or grow it again (test 3 round 3,
  // 2026-10-01: a crown, wings and a jetpack made the butter's shape rules stretch it into an 84-stud plank).
  const basisNames = Array.isArray(a.basis) ? new Set((a.basis as unknown[]).map((n) => String(n).replace(/[^A-Za-z0-9_]/g, ''))) : null;
  const basisOf = () => { const b = basisNames ? parts.filter((p) => basisNames.has(p.name)) : parts; return b.length ? b : parts; };
  if (!board) shapeTo(parts, shapeWord(`${String(a.request ?? '')} ${String(a.name ?? '')}`), basisOf());
  if (!board) faceAcross(parts, basisOf());
  const unburied = board ? [] : unbury(parts);
  if (!board) { wrapAround(parts); toEnds(parts); settle(parts); }
  if (!board) readableText(parts);
  // Words with no colour of their own stand out from what they are printed on (round 9: white "BUTTER" on pale yellow):
  // dark ink on a light part. A keyboard's legends keep their theme's colours.
  if (!board) for (const p of parts) if (p.text && !p.text.inked && !isDark(p.color)) p.text = { ...p.text, color: '#2b2118' };
  const moves = board ? undefined : giveMotion(parts);
  // Ground it: the lowest point of the object sits on the stage.
  const bottom = Math.min(...parts.map((p) => p.at[1] - p.size[1] / 2));
  for (const p of parts) p.at[1] -= bottom;
  // Grown from the ground's centre, never shrunk; a scale the model chose is kept when it is big enough (round 5: the
  // model passed its own scale and the butter came out 10 x 2 x 2.5, smaller than a player).
  const fit = board ? 1 : fitFactor(basisOf());
  if (fit !== 1) for (const p of parts) {
    p.size = p.size.map((n) => n * fit) as V3;
    p.at = p.at.map((n) => n * fit) as V3;
    if (p.move?.amount && !['spin', 'open', 'wobble'].includes(p.move.as)) p.move.amount *= fit;
  }
  const footprint = {
    x0: Math.min(...parts.map((p) => p.at[0] - p.size[0] / 2)), x1: Math.max(...parts.map((p) => p.at[0] + p.size[0] / 2)),
    z0: Math.min(...parts.map((p) => p.at[2] - p.size[2] / 2)), z1: Math.max(...parts.map((p) => p.at[2] + p.size[2] / 2)),
    top: Math.max(...parts.map((p) => p.at[1] + p.size[1] / 2)),
  };
  if (parts.length === 0) return { error: `no part could be read: ${skipped.slice(0, 3).join('; ')}` };
  const theme = (['rgb', 'candy', 'pastel', 'given'] as const).find((t) => t === a.theme);
  return { name, parts, footprint, ...(skipped.length ? { skipped } : {}), ...(dropped.length ? { dropped } : {}), ...(theme ? { theme } : {}),
    ...(unburied.length ? { unburied } : {}), ...(moves ? { gaveMotion: moves } : {}), ...(fit !== 1 ? { grown: Math.round(fit * 100) / 100 } : {}) };
}

/**
 * A label on a part's top reads upright from the spawn. Roblox draws a Top-face SurfaceGui with its top toward the
 * part's -X (measured in Studio, 2026-10-01: the owner's keys read sideways), and the player looks along -Z; so a
 * labelled block with no rotation of its own is turned -90 degrees about Y with its width and depth swapped: the same
 * box in the world, its text upright. Not for open, which swings on the part's own axes; a rigged part that turned has
 * its joint turned back (buildObject), so its clip moves it as if it had not. Pure.
 */
export function uprightLabel(p: ObjectPart): { Size: V3; Orientation?: V3 } {
  // Not for a door (open swings on the part's own axes); a wobble or a spin reads upright too (round 3: the wobbling
  // wrapper's "BUTTER" read sideways), its joint turned back to the world's axes in buildObject.
  const turns = p.text?.face === 'Top' && !p.rot && p.shape === 'block' && (!p.move || p.move.as !== 'open');
  if (!turns) return { Size: p.size, ...(p.rot ? { Orientation: p.rot } : {}) };
  return { Size: [p.size[2], p.size[1], p.size[0]], Orientation: [0, -90, 0] };
}

/**
 * Real keystrokes for keyboard keys (owner, 2026-10-01: "sounds like tiny bombs" — the words "mechanical keyboard"
 * matched an explosion recording, "Air Blast Mechanical Bursts"). Short single-key recordings from the typing
 * category, never anything else. Pure.
 */
export function keySoundPool(): string[] {
  return findSounds('apple keyboard', { category: 'typing', limit: 8, maxSeconds: 1 }).map((h) => h.soundId).filter((id): id is string => Boolean(id));
}
/** Whether a moving part is a key that should sound like one: pressed by a real key, or asked to sound like typing. */
export function isKeystroke(p: ObjectPart, words: string | undefined): boolean {
  return p.move?.on === 'key' || /\b(key|keys|keyboard|typing|type|thock|clack|keycap|asmr)\b/i.test(words ?? '');
}

/** What was built, in the words the answer may use. Pure. */
export function builtSummary(plan: ObjectPlan, moving: number, keysBound: number, studs: boolean): string {
  // Keycaps are the skirts riding a key; an object riding its own wobbling body (giveMotion) has none.
  const caps = plan.parts.filter((p) => p.rides && plan.parts.some((q) => q.name === p.rides && q.key)).length;
  const smooth = plan.parts.some((p) => p.surface === 'smooth');
  const how = [
    caps ? `${caps} keycaps (${plan.theme === 'rgb' ? 'dark chunky caps with small glowing rainbow legends, on a dark case with a purple underglow' : plan.theme === 'candy' ? 'caramel keycaps with black letters on a chocolate case' : 'smooth plastic, a lighter top with its letter on a darker skirt'})` : `${plan.parts.length} parts`,
    studs ? (smooth ? 'on a studded stage' : 'studded') : '',
    moving ? `${moving} of them move${keysBound ? `, ${keysBound} answer the real keyboard keys, and they are also pressed by clicking or walking on them` : ''}` : '',
    moving ? `each move has its sound${keysBound ? '; a "+1" pops up over every key the player presses or steps on' : ''}; a counter and a hint are on the player's screen (not in the world)` : '',
    // What else is there, by name, and what is not (live 2026-10-01: the answer promised "two spinning knobs and a
    // glowing light bar" for a keyboard with one knob and no light bar).
    caps ? (() => {
      const extras = plan.parts.filter((p) => !p.text && !p.rides && !p.own).map((p) => p.name);
      return extras.length ? `besides the keys only: ${extras.join(', ')}` : 'nothing besides the keys and their case';
    })() : '',
    plan.dropped?.length ? `left out, because a keyboard has no such part: ${plan.dropped.join(', ')} (do not mention them)` : '',
    // Anything else, by name, with the words it really carries (test 2 round 2: the reply promised "a printed label"
    // on a Label part with no words, buried inside the butter).
    caps ? '' : (() => {
      const worded = plan.parts.filter((p) => p.text).map((p) => `${p.name} reads "${p.text!.value}"`);
      return `made of: ${plan.parts.map((p) => p.name).join(', ')}; ${worded.length ? worded.join(', ') : 'no words are printed on it'}`;
    })(),
    caps ? '' : placesOf(plan.parts).join(', '),
    plan.gaveMotion ? (plan.parts.find((p) => p.name === plan.gaveMotion)?.move?.as === 'wobble' && plan.parts.some((p) => p.rides === plan.gaveMotion)
      ? 'clicking it makes the whole thing wobble with a squish' : `${plan.gaveMotion} moves when clicked`) : '',
    plan.grown ? `grown ${plan.grown}x so it stands bigger than a player` : '',
  ].filter(Boolean);
  return how.join('; ');
}

/** Whether a colour is dark enough to print without an outline. Pure. */
/**
 * The answer to the user for a built object, said from the plan itself (round 8 of test 2: the model's own reply
 * promised a "SALTED" wrapper "on top" that the tool had put under the butter and whose words it had removed). Only
 * what was built: its size against a player, the words printed on it, where its details sit, and what a click, a
 * touch or a key does. Not for keyboards, whose builtSummary the model retells. Pure.
 */
/**
 * Part names said as a person would: "WingLeft", "WingRight" -> "two wings"; "Flame1".."Flame3" -> "three flames";
 * "GoldenCrown" -> "a golden crown". At most `max` kinds, then "and more" (test 3 round 3: a 15-item list with "a eye
 * left" and "wrapper fold2"). Pure.
 */
export function sayParts(names: string[], max = 5): string[] {
  const COUNT = ['', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const base = (n: string) => n.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
    .replace(/\b(left|right|front|back|top|bottom|upper|lower|inner|outer)\b/g, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim() || 'part';
  const kinds = new Map<string, number>();
  for (const n of names) kinds.set(base(n), (kinds.get(base(n)) ?? 0) + 1);
  const plural = (w: string) => /(s|x|ch|sh)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`;
  const said = [...kinds.entries()].map(([w, k]) => k === 1 ? `${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w}` : `${COUNT[k] ?? k} ${plural(w)}`);
  return said.length > max ? [...said.slice(0, max), 'more'] : said;
}

export function objectForUser(plan: ObjectPlan): string {
  const what = plan.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const f = plan.footprint, longest = Math.max(f.x1 - f.x0, f.z1 - f.z0, f.top);
  const big = longest >= 2.5 * PLAYER_HEIGHT ? `about ${Math.round(longest)} studs, ${Math.round(longest / PLAYER_HEIGHT)} times as long as you are tall`
    : `about ${Math.round(longest)} studs`;
  // Back is the side the spawn sees (+Z); Right and Left are its ends (round 10 said "front" for an end).
  const side: Record<string, string> = { Top: 'top', Back: 'front', Front: 'back', Right: 'end', Left: 'end', Bottom: 'bottom' };
  const texts = plan.parts.filter((p) => p.text);
  // At most two printings are named; more read as clutter.
  const words = texts.slice(0, 2).map((p) => `"${p.text!.value}" printed on its ${side[p.text!.face] ?? 'side'}`);
  const body = [...plan.parts].filter((p) => !p.own).sort((a, b) => vol(b) - vol(a))[0];
  const humanName = (n: string) => n.replace(/_\d+$/, '').replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const decor = plan.parts.filter((p) => p !== body && !p.own && !/^Cool(Halo|Orb\d)$/.test(p.name));
  const places = new Map(placesOf(plan.parts).map((line) => { const m = /^(\w+) is (on top of|under|on the front of|on) \w+$/.exec(line); return [m?.[1] ?? '', m?.[2] ?? 'on'] as const; }));
  const where = (w: string) => w === 'on top of' ? 'on top' : w === 'under' ? 'underneath' : w === 'on the front of' ? 'on the front' : 'on its sides';
  const details: string[] = [];
  // Many details are said as one short list, with no places (test 3 round 7: "a flame ... on the front and a flame ...
  // on its sides" for one pair of flames).
  if (decor.length > 4) {
    const said = sayParts(decor.map((p) => p.name), 6);
    const rest = said[said.length - 1] === 'more' ? said.slice(0, -1) : said;
    details.push(`${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}${said.length > rest.length ? ' among other details' : ''}`);
  }
  for (const w of decor.length > 4 ? [] : ['on top of', 'under', 'on the front of', 'on']) {
    const group = decor.filter((p) => (places.get(p.name) ?? 'on') === w).map((p) => p.name);
    if (!group.length) continue;
    const said = sayParts(group, 4);
    details.push(`${said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}` : said[0]}${where(w) ? ` ${where(w)}` : ''}`);
  }
  const moving = plan.parts.filter((p) => p.move && p.name !== 'CoolHalo');
  const verb: Record<string, string> = { press: 'presses down', spin: 'spins', bob: 'bobs', open: 'swings open', wobble: 'wobbles', pop: 'pops' };
  const as = (p: ObjectPart) => verb[p.move!.as] ?? 'moves';
  const by = (on: string) => moving.filter((p) => p.move!.on === on);
  const acts: string[] = [];
  const whole = plan.gaveMotion && plan.parts.some((p) => p.rides === plan.gaveMotion);
  const who = (ps: ObjectPart[]) => ps.length === 1 ? `the ${humanName(ps[0]!.name)}` : (() => { const s = sayParts(ps.map((p) => p.name), 4).map((x) => x.replace(/^an? /, '')); return `its ${s.length > 1 ? `${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}` : s[0]}`; })();
  if (by('click').length) acts.push(`Click it and ${whole ? 'the whole thing' : who(by('click'))} ${by('click').length === 1 ? as(by('click')[0]!) : 'move'}${by('click').some((p) => p.move!.sound) ? ' with a sound' : ''}`);
  if (by('touch').length) acts.push(`walk into it and ${who(by('touch'))} ${by('touch').length === 1 ? as(by('touch')[0]!) : 'move'}`);
  if (by('prompt').length) acts.push(`walk up and press E to use it`);
  // Many looping details are summed up, not listed again.
  if (by('loop').length > 3) acts.push('its other details move all the time');
  else if (by('loop').length) acts.push(`${who(by('loop'))} ${by('loop').length === 1 ? as(by('loop')[0]!) : 'move'} all the time`);
  // Many details get their own sentence, so the printed words and the details do not run together (test 3 round 8).
  const many = decor.length > 4;
  const bits = many ? words : [...words, ...details];
  const look = bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}` : bits[0] ?? '';
  const has = many && details[0] ? `It has ${details[0]}.` : '';
  const kit = plan.cool ? 'Now it sparkles and glows, four neon orbs circle above it, and the rim of its stage lights up.' : '';
  const lines = [
    `Your ${what} is in front of the spawn: ${big}${look ? `, with ${look}` : ''}.${has ? ` ${has}` : ''}`,
    kit,
    acts.length ? `${acts.join('; ').replace(/^./, (c) => c.toUpperCase())}. A counter on your screen counts every press.` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * What the model is told on a "make it cooler" run: the object that is there, part by part as it was sent, and that it
 * sends only what to add (test 3, 2026-10-01). Short on purpose: names, sizes and centres only. Pure.
 */
export function objectUpgradeLine(spec: Record<string, unknown>): string {
  const parts = (Array.isArray(spec.parts) ? spec.parts : []) as Record<string, unknown>[];
  // Names the model wrote in an earlier run go into this run's instructions, so only a plain identifier passes and
  // numbers only as numbers: nothing the model typed can become an instruction here.
  const id = (v: unknown) => String(v ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'Part';
  const r = (v: unknown) => Array.isArray(v) ? `[${v.slice(0, 3).map((n) => Number.isFinite(Number(n)) ? Math.round(Number(n) * 10) / 10 : 0).join(', ')}]` : '?';
  const list = parts.slice(0, 30).map((p) => `${id(p.name)} size ${r(p.size)} at ${r(p.at)}`).join('; ');
  return `THIS PLACE ALREADY HAS ${id(spec.name)}, made by build_object: ${list}. The user wants it made cooler. Call build_object ONCE ` +
    `with name "${id(spec.name)}" and ONLY the new parts to add (3 to 6 cool details on its OUTSIDE, placed from the sizes and centres ` +
    `above: a crown, flames, glowing stripes, eyes, wings, a jetpack...), each with a name saying what it is (Crown, FlameLeft). Every part it has stays. Glow, sparkles, orbiting neon orbs and a ` +
    `lit stage rim are added for you, so do not add effects, sounds or scripts. Then play_check once.`;
}

/** The parts the model sent for an upgrade, added to the object as it was (same name replaces). Pure. */
export function mergeUpgrade(prev: Record<string, unknown>, add: Record<string, unknown>): Record<string, unknown> {
  const old = (Array.isArray(prev.parts) ? prev.parts : []) as Record<string, unknown>[];
  const fresh = (Array.isArray(add.parts) ? add.parts : []) as Record<string, unknown>[];
  const names = new Set(fresh.map((p) => String(p.name ?? '')));
  return { ...prev, ...(add.screen !== undefined ? { screen: add.screen } : {}), name: prev.name, parts: [...old.filter((p) => !names.has(String(p.name ?? ''))), ...fresh] };
}

export const COOL_ORB_COLOURS = ['#ff4fd8', '#4fd8ff', '#ffe14d', '#7dff6a'];
/**
 * The "100x cooler" kit, added to a plan in place: a hub over the object that spins on a loop with four neon orbs
 * riding it, so they circle above it. The sparkles, the light and the lit rim are added at build time. Pure.
 */
export function coolKit(plan: ObjectPlan): void {
  const f = plan.footprint;
  const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
  const r = Math.max(4, Math.min(12, Math.max(f.x1 - f.x0, f.z1 - f.z0) / 2));
  const y = f.top + 3;
  for (const n of ['CoolHalo', 'CoolOrb1', 'CoolOrb2', 'CoolOrb3', 'CoolOrb4']) {
    const at = plan.parts.findIndex((p) => p.name === n);
    if (at >= 0) plan.parts.splice(at, 1);
  }
  plan.parts.push({ name: 'CoolHalo', shape: 'block', size: [1, 1, 1], at: [cx, y, cz], color: '#ffffff', transparency: 0.99, move: { as: 'spin', on: 'loop' } });
  const around: [number, number][] = [[r, 0], [0, r], [-r, 0], [0, -r]];
  around.forEach(([dx, dz], i) => plan.parts.push({ name: `CoolOrb${i + 1}`, shape: 'ball', size: [1.8, 1.8, 1.8], at: [cx + dx, y, cz + dz], color: COOL_ORB_COLOURS[i]!, material: 'Neon', rides: 'CoolHalo' }));
  plan.footprint = { ...f, top: Math.max(f.top, y + 0.9) };
  plan.cool = true;
}

export function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 110;
}

/** A clip that also moves the parts riding this one (a keycap's skirt), pose for pose. Pure. */
export function withRiders(clip: Record<string, unknown>, joint: string, riders: string[]): Record<string, unknown> {
  if (!riders.length) return clip;
  const keys = (clip.keys as Record<string, unknown>[]).map((k) => {
    const pose = k[joint];
    if (pose === undefined) return k;
    return { ...k, ...Object.fromEntries(riders.map((r) => [r, pose])) };
  });
  return { ...clip, keys };
}

/** The keyframe clip for a preset motion of one part (AppleAnimate's format). Pure. */
export function motionClip(part: ObjectPart): Record<string, unknown> {
  const m = part.move!;
  const j = part.name;
  const pose = (rot?: V3, move?: V3) => ({ [j]: { ...(rot ? { rot } : {}), ...(move ? { move } : {}) } });
  const k = (t: number, body: Record<string, unknown>, ease?: string) => ({ t, ...(ease ? { ease } : {}), ...body });
  const a = m.amount;
  const hinge = m.hinge ?? defaultHinge(m.as);
  let keys: unknown[];
  let length: number;
  if (m.as === 'press') {
    const d = a ?? Math.min(part.size[1] * 0.6, 1.2);
    length = 0.24;
    keys = [k(0, pose(undefined, [0, 0, 0])), k(0.06, pose(undefined, [0, -d, 0]), 'Quad'), k(0.24, pose(undefined, [0, 0, 0]), 'Back')];
  } else if (m.as === 'spin') {
    length = a ?? 3;
    keys = [k(0, pose([0, 0, 0])), k(length, pose([0, 360, 0]))];
  } else if (m.as === 'bob') {
    const d = a ?? Math.max(0.5, part.size[1] * 0.15);
    length = 2;
    keys = [k(0, pose(undefined, [0, 0, 0])), k(1, pose(undefined, [0, d, 0]), 'Sine'), k(2, pose(undefined, [0, 0, 0]), 'Sine')];
  } else if (m.as === 'open') {
    const deg = a ?? 100;
    const r: V3 = hinge === 'left' ? [0, deg, 0] : hinge === 'right' ? [0, -deg, 0] : hinge === 'front' ? [deg, 0, 0] : [-deg, 0, 0];
    length = 1.8;
    keys = [k(0, pose([0, 0, 0])), k(0.5, pose(r), 'Sine'), k(1.3, pose(r)), k(1.8, pose([0, 0, 0]), 'Sine')];
  } else if (m.as === 'wobble') {
    const deg = a ?? 10;
    length = 0.7;
    keys = [k(0, pose([0, 0, 0])), k(0.15, pose([0, 0, deg]), 'Sine'), k(0.35, pose([0, 0, -deg * 0.7]), 'Sine'), k(0.55, pose([0, 0, deg * 0.3]), 'Sine'), k(0.7, pose([0, 0, 0]), 'Sine')];
  } else {
    const d = a ?? Math.max(0.5, part.size[1] * 0.3);
    length = 0.45;
    keys = [k(0, pose(undefined, [0, 0, 0])), k(0.12, pose(undefined, [0, d, 0]), 'Quad'), k(0.45, pose(undefined, [0, 0, 0]), 'Bounce')];
  }
  const play = m.on === 'key' ? (part.key ? 'key' : 'click') : m.on;
  return { play, length, keys, ...(play === 'key' ? { key: part.key } : {}), ...(m.prompt ? { prompt: m.prompt } : {}) };
}

function defaultHinge(as: string): string {
  return as === 'press' || as === 'pop' || as === 'wobble' ? 'bottom' : as === 'open' ? 'back' : 'center';
}

/** The world point of a part's hinge (its face centre, or its centre). Pure; ignores rot for the offset direction. */
export function hingePoint(p: ObjectPart, origin: V3): V3 {
  const [x, y, z] = [origin[0] + p.at[0], origin[1] + p.at[1], origin[2] + p.at[2]];
  const [hx, hy, hz] = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
  switch (p.move?.hinge ?? defaultHinge(p.move?.as ?? '')) {
    case 'bottom': return [x, y - hy, z];
    case 'top': return [x, y + hy, z];
    case 'back': return [x, y, z + hz];
    case 'front': return [x, y, z - hz];
    case 'left': return [x - hx, y, z];
    case 'right': return [x + hx, y, z];
    default: return [x, y, z];
  }
}

const clipText = (s: unknown) => String(s ?? '').slice(0, 300);

/**
 * The ground and the spawn every object stands with: a bright green Baseplate, the spawn 8 studs in front of the
 * stage facing it, and studs on what is listed plus the Baseplate and spawn (null: the user wants their own surface).
 * Shared by build_object and a library object (library-object.ts).
 */
export async function groundAndSpawn(ctx: AgentCtx, studs: string[] | null): Promise<void> {
  await ctx.execStudioOp({ op: 'set_props', path: 'game.Workspace.Baseplate', props: { Color: { t: 'Color3', v: [0.38, 0.79, 0.29] }, Material: { t: 'EnumItem', v: 'Enum.Material.Plastic' } } }, 20_000).catch(() => undefined);
  const spawnAt: V3 = [0, 0.5, 8];
  const spawn = await ctx.execStudioOp({ op: 'set_props', path: 'game.Workspace.SpawnLocation', props: { Position: { t: 'Vector3', v: spawnAt }, Orientation: { t: 'Vector3', v: [0, 0, 0] } } }, 20_000).catch(() => ({ ok: false }));
  if (!('ok' in spawn) || !spawn.ok) {
    await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'SpawnLocation', name: 'SpawnLocation', props: { Size: [8, 1, 8], Position: spawnAt, Anchored: true, Color: '#4fc3ff' } }), parent: 'game.Workspace' }] }, 20_000).catch(() => undefined);
  }
  if (studs) await ctx.execStudioOp(applySurfaceOp([...studs, 'game.Workspace.Baseplate', 'game.Workspace.SpawnLocation']), 60_000).catch(() => undefined);
}

/**
 * An object's studded screen: one counter pill (the number with its caption) and a hint bar, and the LocalScript that
 * counts every move a player set off on the model named `name` (AppleAnimatePlayed). Merged into the screen, never
 * redrawn. Returns what went wrong, or null. Shared by build_object and a library object.
 */
export async function writeObjectHud(ctx: AgentCtx, name: string, hud: { counter?: unknown; hint?: unknown; icon?: unknown }): Promise<string | null> {
  const screen = studdedScreen({ name: `${name}HUD`, pieces: [
    // One pill: the number with its caption inside (owner, 2026-10-01: a separate "Keys pressed" pill looked like a
    // button that did nothing).
    ...(hud.counter ? [{ kind: 'counter' as const, name: 'Counter', text: '0', icon: String(hud.icon ?? '#').slice(0, 2), colour: 'purple' as const, plus: false, at: 'top-left' as const, caption: String(hud.counter).slice(0, 24) }] : []),
    ...(hud.hint ? [{ kind: 'bar' as const, name: 'Hint', text: String(hud.hint).slice(0, 60), colour: 'yellow' as const, at: 'bottom' as const }] : []),
  ] });
  // Merged, never redrawn: a rebuilt object keeps whatever was added to its screen since (the upgrades, a shop).
  const failedUi = await writeScreen(ctx, screen);
  if (failedUi) return `hud: ${clipText(failedUi)}`;
  const src = `-- ${name}'s screen: counts every move (AppleAnimatePlayed) and pops the counter. Written by Apple; edit freely.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local gui = Players.LocalPlayer:WaitForChild("PlayerGui"):WaitForChild("${name}HUD")
local counter = gui:FindFirstChild("Counter", true)
local value = counter and counter:FindFirstChild("Value")
local n = 0
local played = game:GetService("ReplicatedStorage"):WaitForChild("AppleAnimatePlayed")
-- Only what a player set off counts: a loop that starts by itself is not a press.
played.OnClientEvent:Connect(function(model, _clip, player)
	if (model and model.Name ~= "${name}") or player == nil then return end
	n += 1
	if value then value.Text = tostring(n) end
	if counter then
		local s = counter:FindFirstChild("Pop") or Instance.new("UIScale")
		s.Name = "Pop"
		s.Parent = counter
		s.Scale = 1.15
		TweenService:Create(s, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	end
end)
`;
  const path = `game.StarterPlayer.StarterPlayerScripts.${name}HUDScript`;
  await ctx.execStudioOp({ op: 'delete_instances', paths: [path] }, 20_000).catch(() => undefined);
  const sc = await ctx.execStudioOp({ op: 'edit_script', path, source: src, create: { className: 'LocalScript', parent: 'game.StarterPlayer.StarterPlayerScripts' } }, 60_000);
  return sc.ok ? null : `hud script: ${clipText(sc.error)}`;
}

export async function buildObject(ctx: AgentCtx, sent: Record<string, unknown>) {
  // A "make it cooler" run adds to the object that is there; every other build stands alone (test 3, 2026-10-01).
  const memory = ctx.objectMemory;
  const prev = memory?.upgrading ? await memory.load().catch(() => undefined) as Record<string, unknown> | undefined : undefined;
  const a = prev && Array.isArray(prev.parts) ? mergeUpgrade(prev, sent) : sent;
  // The board's look comes from the user's words, not the model's palette (owner's references, 2026-10-01). An upgrade
  // keeps the shape words of the request that made the object.
  // The object as first made is the measure for every later upgrade, not the last upgrade.
  const basis = prev && Array.isArray(prev.parts)
    ? (Array.isArray(prev.basis) ? (prev.basis as unknown[]).map(String) : (prev.parts as Record<string, unknown>[]).map((p) => String(p.name ?? ''))) : undefined;
  const plan = expandObject({ ...a, theme: keyboardTheme(ctx.userRequest?.()), request: prev ? String(prev.request ?? '') : ctx.userRequest?.() ?? '', ...(basis ? { basis } : {}) });
  if ('error' in plan) return { error: plan.error };
  if (prev) coolKit(plan);
  const wantsStuds = !userWantsOwnSurface(ctx.userRequest?.());
  const { footprint: f } = plan;
  const width = f.x1 - f.x0, depth = f.z1 - f.z0;
  const stageOn = a.stage !== 'none';
  const stageH = stageOn ? 2 : 0;
  // The object stands a short walk from the spawn, its stage's front edge about 12 studs past the spawn's, the spawn
  // facing it (test 2 round 2: a small object 42 studs out was a speck the camera did not even show).
  const origin: V3 = [-(f.x0 + f.x1) / 2, stageH, -(depth / 2 + 18) - (f.z0 + f.z1) / 2];
  const center: V3 = [0, stageH, origin[2] + (f.z0 + f.z1) / 2];
  const model = `game.Workspace.${plan.name}`;

  const textGui = (t: NonNullable<ObjectPart['text']>, p: ObjectPart): InstanceSpecLite => ({
    className: 'SurfaceGui', name: 'Label',
    props: { Face: { t: 'EnumItem', v: `Enum.NormalId.${t.face}` }, SizingMode: { t: 'EnumItem', v: 'Enum.SurfaceGuiSizingMode.PixelsPerStud' }, PixelsPerStud: Math.max(10, Math.min(80, 120 / Math.max(1, Math.min(p.size[0], p.size[2])))), LightInfluence: 0,
      // A gamer board's legends glow (the owner's reference): brighter than lit plastic.
      ...(t.glow ? { Brightness: 2.5 } : {}) },
    children: [{ className: 'TextLabel', name: 'Text', props: { Size: { t: 'UDim2', v: [0.9, 0, 0.9, 0] }, Position: { t: 'UDim2', v: [0.05, 0, 0.05, 0] }, BackgroundTransparency: 1, Text: t.value, TextScaled: true, Font: { t: 'EnumItem', v: `Enum.Font.${t.font ?? 'FredokaOne'}` }, TextColor3: t.color },
      // Dark ink (a keycap's letter) is printed, not outlined; light text keeps its black outline. A legend is at most
      // about half the cap (owner, 2026-10-01: SHIFT and CAPS filled their caps and dwarfed the letters); the canvas's
      // short side is about 120 px at any PixelsPerStud above.
      // A keycap's legend is printed (a gamer board's glows), never outlined.
      children: [{ className: 'UIStroke', name: 'Outline', props: { Color: '#111111', Thickness: isDark(t.color) || p.key ? 0 : 2 } },
        ...(p.key ? [{ className: 'UITextSizeConstraint', name: 'Legend', props: { MaxTextSize: t.glow ? 66 : 56 } }] : [])] }],
  });
  const moving = plan.parts.filter((p) => p.move);
  const partSpec = (p: ObjectPart): InstanceSpecLite => ({
    className: p.shape === 'wedge' ? 'WedgePart' : 'Part', name: p.name,
    props: {
      ...uprightLabel(p),
      Position: [origin[0] + p.at[0], origin[1] + p.at[1], origin[2] + p.at[2]],
      Anchored: !p.move && !p.rides, Color: p.color, Material: p.material ?? 'Plastic', TopSurface: 'Smooth', BottomSurface: 'Smooth',
      ...(p.shape === 'ball' ? { Shape: { t: 'EnumItem', v: 'Enum.PartType.Ball' } } : p.shape === 'cylinder' ? { Shape: { t: 'EnumItem', v: 'Enum.PartType.Cylinder' } } : {}),
      ...(p.transparency ? { Transparency: p.transparency } : {}),
    },
    ...(p.text ? { children: [textGui(p.text, p)] } : {}),
  });
  const items: InstanceSpecLite[] = [];
  const root: InstanceSpecLite = { className: 'Part', name: 'Root', props: { Size: [1, 1, 1], Position: center, Anchored: true, Transparency: 1, CanCollide: false, CanQuery: false } };
  // The plugin takes at most 40 children per created instance (Commands.luau MAX_CHILDREN_PER_SPEC): the model is made
  // with its first parts and the rest are added to it in batches (a full keyboard has 60+ keys).
  const specs = plan.parts.map(partSpec);
  const FIRST = 39, BATCH = 100;
  items.push({ className: 'Model', name: plan.name, children: [root, ...specs.slice(0, FIRST)] });
  if (stageOn) {
    const pad = 6;
    // The stage wears the board's theme: a bright yellow slab under a dark gamer keyboard clashed (round 10).
    // A keyboard's stage wears its theme; anything else gets a stage that stands apart from its own main colour (test 2:
    // a yellow stick of butter sat on the gamer keyboard's dark slate, and a yellow stage would have hidden it).
    const isBoard = plan.parts.some((p) => p.text && p.key && p.rides === undefined && plan.parts.some((q) => q.rides === p.name));
    const stageColor = HEX.test(String(a.stageColor ?? '')) ? String(a.stageColor)
      : isBoard && plan.theme === 'rgb' ? '#3a3d46' : isBoard && plan.theme === 'candy' ? '#6b3f22' : contrastStage(mainColour(plan.parts));
    items.push({ className: 'Model', name: `${plan.name}Stage`, children: [
      { className: 'Part', name: 'Stage', props: { Size: [width + pad * 2, stageH, depth + pad * 2], Position: [center[0], stageH / 2, center[2]], Anchored: true, Color: stageColor, Material: 'Plastic' } },
      // A cooler object's rim lights up (coolKit).
      { className: 'Part', name: 'Rim', props: { Size: [width + pad * 2 + 2, stageH * 0.5, depth + pad * 2 + 2], Position: [center[0], stageH * 0.25, center[2]], Anchored: true, Color: plan.cool ? '#b44dff' : '#8e5b32', Material: plan.cool ? 'Neon' : 'Plastic' } },
    ] });
  }
  for (const it of items) await ctx.execStudioOp({ op: 'delete_instances', paths: [`game.Workspace.${it.name}`] }, 20_000).catch(() => undefined);
  const made = await ctx.execStudioOp({ op: 'create_instances', items: items.map((i) => ({ ...typed(i), parent: 'game.Workspace' })) }, 120_000);
  if (!made.ok) return { error: `The object was not made: ${clipText(made.error)}` };
  for (let i = FIRST; i < specs.length; i += BATCH) {
    const more = await ctx.execStudioOp({ op: 'create_instances', items: specs.slice(i, i + BATCH).map((sp) => ({ ...typed(sp), parent: `game.Workspace.${plan.name}` })) }, 120_000);
    if (!more.ok) return { error: `The object was only partly made: ${clipText(more.error)}`, changed: true, projectMutated: true };
  }

  // The ground and the spawn: a bright studded field and a spawn that faces the object.
  await groundAndSpawn(ctx, wantsStuds ? [model, `game.Workspace.${plan.name}Stage`] : null);
  // Studding an object turns every part under it to studded Plastic, Neon too (the plugin's explicit apply_surface;
  // test 3 round 4, 2026-10-01: the cool orbs and the lit rim came out Plastic, and so did the keyboard's glow case).
  // What is meant to glow glows again.
  if (wantsStuds) {
    const glow = [...plan.parts.filter((p) => p.material === 'Neon').map((p) => `${model}.${p.name}`), ...(plan.cool && stageOn ? [`game.Workspace.${plan.name}Stage.Rim`] : [])];
    for (const path of glow) await ctx.execStudioOp({ op: 'set_props', path, props: { Material: { t: 'EnumItem', v: 'Enum.Material.Neon' } } }, 20_000).catch(() => undefined);
  }
  // Keycaps are smooth plastic like a real keyboard (the owner's reference); the case and the stage keep their studs.
  const smooth = plan.parts.filter((p) => p.surface === 'smooth').map((p) => `${model}.${p.name}`);
  for (let i = 0; i < smooth.length; i += 50) {
    await ctx.execStudioOp({ op: 'apply_surface', paths: smooth.slice(i, i + 50), surface: 'smooth_no_outlines' }, 60_000).catch(() => undefined);
  }

  // Motion: rig every moving part to the root with its pivot on its hinge, then one clip per part.
  const problems: string[] = [];
  if (moving.length) {
    const movingNames = new Set(moving.map((p) => p.name));
    const riders = plan.parts.filter((p) => p.rides && movingNames.has(p.rides));
    const rigged = await ctx.execStudioOp({ op: 'rig_model', root: `${model}.Root`, parts: [...moving, ...riders].map((p) => `${model}.${p.name}`), joint: 'motor' }, 60_000);
    if (!rigged.ok) problems.push(`rig: ${clipText(rigged.error)}`);
    else {
      // Each joint hinges where its part's motion does; a rider of a part that turns hinges where that part does, so the
      // two turn as one (round 3: the butter wobbled and its wrapper and top stayed flat). A part turned to read upright
      // (uprightLabel) has its joint turned back to the world's axes.
      const byName = new Map(plan.parts.map((p) => [p.name, p]));
      const ROTATES = new Set(['spin', 'open', 'wobble']);
      for (const p of [...moving, ...riders]) {
        const leader = p.move ? p : byName.get(p.rides!)!;
        if (!p.move && !ROTATES.has(leader.move!.as)) continue; // a keycap's skirt only slides with its cap
        const at = hingePoint(leader, origin);
        const turn = uprightLabel(p).Orientation ? [0, 90, 0] as V3 : undefined;
        if (!turn && at.every((n, i) => Math.abs(n - (origin[i]! + p.at[i]!)) < 1e-6)) continue;
        const pv = await ctx.execStudioOp({ op: 'set_joint_pivot', joint: `${model}.Root.${p.name}`, at, ...(turn ? { turn } : {}) }, 20_000);
        if (!pv.ok) problems.push(`hinge ${p.name}: ${clipText(pv.error)}`);
      }
      const clips: Record<string, unknown> = {};
      const soundCache = new Map<string, string | undefined>();
      const keystrokes = keySoundPool();
      let keyIndex = 0;
      for (const p of moving) {
        const c = withRiders(motionClip(p), p.name, riders.filter((r) => r.rides === p.name).map((r) => r.name));
        // A decoration that moves by itself is quiet when the player has something to set off (test 3 round 3: nine
        // looping parts would all have sounded at once when the game started).
        const quiet = (p.move!.on === 'loop' || p.move!.on === 'once') && moving.some((m) => m.move!.on !== 'loop' && m.move!.on !== 'once');
        const q = quiet ? undefined : p.move!.sound;
        const direct = q ? soundAssetId(q) : null;
        if (!direct && isKeystroke(p, q) && keystrokes.length) {
          // A keyboard key sounds like a real key, a different recording on each neighbour (ASMR wants variety).
          Object.assign(c, { sound: keystrokes[keyIndex++ % keystrokes.length], volume: 0.55 });
        } else if (q) {
          if (!soundCache.has(q)) soundCache.set(q, direct ? `rbxassetid://${direct}` : findSounds(q, { limit: 1, maxSeconds: 4 })[0]?.soundId);
          const s = soundCache.get(q);
          if (s) Object.assign(c, { sound: s, volume: 0.7 });
        }
        clips[`${p.name}.${p.move!.as}`] = c;
      }
      const source = `-- What ${plan.name} does, played by AppleAnimate. Written by Apple's build_object; edit freely.\nreturn ${luau(clips)}\n`;
      const wrote = await ctx.execStudioOp({ op: 'edit_script', path: `${model}.AppleAnimations`, source, create: { className: 'ModuleScript', parent: model } }, 60_000);
      if (!wrote.ok) problems.push(`animations: ${clipText(wrote.error)}`);
      const player = await installAnimationPlayer(ctx);
      if (player) problems.push(`player: ${player}`);
    }
  }

  // The cooler object sparkles and glows: the library's sparkle shimmer and a warm light on its biggest part (coolKit).
  if (plan.cool) {
    const body = [...plan.parts].filter((p) => !p.own && !p.name.startsWith('Cool')).sort((x, y) => y.size[0] * y.size[1] * y.size[2] - x.size[0] * x.size[1] * x.size[2])[0];
    if (body) {
      const path = `${model}.${body.name}`;
      await ctx.execStudioOp({ op: 'delete_instances', paths: [`${path}.SparkleShimmerFX`, `${path}.CoolLight`] }, 20_000).catch(() => undefined);
      const fx = vfxPlan('sparkle_shimmer', { path, className: 'Part' }, { scale: Math.max(1, Math.min(4, Math.max(...body.size) / 6)), rate: 2 });
      const items = 'error' in fx ? [] : fx.items;
      const light = { className: 'PointLight', name: 'CoolLight', parent: path, props: { Brightness: { t: 'number' as const, v: 2 }, Range: { t: 'number' as const, v: 20 }, Color: { t: 'Color3' as const, v: [1, 0.85, 0.5] as [number, number, number] } } };
      const made = await ctx.execStudioOp({ op: 'create_instances', items: [...items, light] }, 60_000).catch(() => ({ ok: false, error: 'not made' }));
      if (!made.ok) problems.push(`sparkles: ${clipText((made as { error?: string }).error)}`);
    }
  }

  // Studio's view turns to what was made (test 2 round 2: the butter was built off-screen and the view showed grass).
  await ctx.execStudioOp({ op: 'camera_focus', path: model }, 10_000).catch(() => undefined);

  // Lighting: the studded mood from the owner's lighting tutorial.
  const { TOOLS } = await import('./tools');
  const mood = await TOOLS.set_mood!.run(ctx, { mood: 'studded' }).catch((e: unknown) => ({ error: String(e) }));
  if (mood && typeof mood === 'object' && 'error' in mood) problems.push(`lighting: ${clipText((mood as { error: unknown }).error)}`);

  // A studded HUD: a live counter of everything that moves, and a hint on join.
  // A thing that moves always gets its studded screen (a live counter and a hint), unless screen is false: the agent
  // left it out on the live keyboard test (2026-10-01) and the game had no UI at all.
  const given = a.screen ?? a.hud;
  const keyed = moving.some((p) => p.move!.on === 'key');
  const defaults = moving.length ? {
    counter: keyed ? 'Keys pressed' : 'Presses',
    // What the player can DO comes first (round 3: a clickable butter whose top bobbed on a loop said "Watch it go!").
    hint: keyed ? 'Type on your keyboard or click the keys!' : moving.some((p) => p.move!.on === 'click') ? 'Click it!'
      : moving.some((p) => p.move!.on === 'touch') ? 'Walk into it!' : moving.some((p) => p.move!.on === 'prompt') ? 'Walk up and press E!' : 'Watch it go!',
  } : null;
  // A screen object without a counter or hint (the re-test passed one) still gets them: the screen is never lost.
  const asked = given && typeof given === 'object' ? given as Record<string, unknown> : null;
  const hud = (given === false ? null : asked && (asked.counter || asked.hint) ? asked : defaults ? { ...defaults, ...(asked ?? {}) } : asked) as Record<string, unknown> | null;
  if (hud && (hud.counter || hud.hint)) {
    const failed = await writeObjectHud(ctx, plan.name, hud);
    if (failed) problems.push(failed);
  }
  const keys = moving.filter((p) => p.move!.on === 'key' && p.key).length;
  // Kept for a later "make it cooler", with the words that made it (its shape words).
  await memory?.save({ ...a, request: prev ? prev.request : ctx.userRequest?.() ?? '', ...(basis ? { basis } : {}) }).catch(() => undefined);
  // Rigging is what makes it move: if that failed, the object stands but does nothing, which is not done.
  if (moving.length && problems.some((p) => p.startsWith('rig') || p.startsWith('animations') || p.startsWith('player'))) {
    return { changed: true, projectMutated: true, object: model, error: `Built, but it cannot move yet: ${problems.join('; ')}. If Studio says an operation is unknown, the Apple plugin in Studio is older than this tool: tell the user to restart Studio.` };
  }
  return {
    changed: true,
    object: model,
    parts: plan.parts.length,
    moving: moving.length,
    ...(keys ? { keysBound: keys } : {}),
    size: [Math.round(width), Math.round(f.top), Math.round(depth)],
    ...(problems.length ? { problems } : {}),
    ...(plan.skipped ? { skipped: plan.skipped } : {}),
    // Said as it is, so the answer does not invent (owner's re-test, 2026-10-01: the reply called smooth keycaps
    // "studded" and promised a "counter screen" that is a counter on the player's screen).
    built: builtSummary(plan, moving.length, keys, wantsStuds),
    // The run's answer once the play check passes (session.ts composedObject), so it says only what was built.
    ...(plan.parts.some((p) => p.key) ? {} : { forUser: objectForUser(plan) }),
    note: 'Done: add nothing else. Check it once in play (play_check); if something is wrong, call build_object again with the whole fixed spec; otherwise tell the user in one or two friendly sentences what they can do with it, saying only what `built` says.',
  };
}
