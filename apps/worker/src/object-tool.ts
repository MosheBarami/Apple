/**
 * build_object: build ONE object from parts, in one call (owner, 2026-10-01: dumb questions, perfect results, fast and
 * token-cheap; and, after the 2026-10-02 benchmark: the harness informs and checks, the agent decides).
 *
 * The agent writes a compact spec: the parts in real proportions (a repeat grid turns one entry into many, a rows grid
 * lays out labelled cells), words on parts, and what moves and how. The tool builds exactly that:
 *   - one Model, named as the agent named it, standing where the agent said or beside what is already there;
 *   - studs on its surfaces, unless the user asked for another surface (the run-wide surface default);
 *   - every moving part rigged to a still root with its pivot on its hinge, one clip per part, a library sound when the
 *     agent names one (an id, or words for the sound library);
 *   - and, ONLY when the spec asks: a stage under it (`stage`), a counter and hint on the player's screen (`screen`),
 *     the camera turned to it (`focus`).
 * Nothing else is added or changed: no kit, no ground or spawn rewrite, no lighting, no growth or reshaping, no part
 * moved or recoloured because of its NAME. What it measures it reports (`checks`): parts hidden inside others, parts with
 * nothing under them, words covered or hard to read, the proportions, nothing moving. The agent reads that and decides.
 * Pure parts (expandObject, measureObject) are exported for tests (tests/object.test.mjs).
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
import { PLAYER_HEIGHT, allocateName, freeLaneX, safeObjectName } from './library-object';
import { extendSpec } from './build-ledger';

export { PLAYER_HEIGHT };

type V3 = [number, number, number];
const SHAPES = new Set(['block', 'ball', 'cylinder', 'wedge']);
const MOTIONS = new Set(['press', 'spin', 'bob', 'open', 'wobble', 'pop']);
const TRIGGERS = new Set(['click', 'touch', 'prompt', 'loop', 'once', 'key']);
const HINGES = new Set(['bottom', 'top', 'back', 'front', 'left', 'right', 'center']);
const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_PARTS = 400;

/** What people and models write for a key, as Roblox's Enum.KeyCode name. Unknown keys return undefined (click only). */
const DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const KEY_WORDS: Record<string, string> = {
  ' ': 'Space', space: 'Space', spacebar: 'Space', enter: 'Return', return: 'Return', backspace: 'Backspace', tab: 'Tab',
  shift: 'LeftShift', ctrl: 'LeftControl', control: 'LeftControl', alt: 'LeftAlt', esc: 'Escape', escape: 'Escape',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right',
};
const KEYCODE_NAMES = new Set([
  ...DIGITS, ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  'Space', 'Return', 'Backspace', 'Tab', 'Escape', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'CapsLock',
  'LeftShift', 'RightShift', 'LeftControl', 'RightControl', 'LeftAlt', 'RightAlt', 'Comma', 'Period', 'Semicolon', 'Slash', 'BackSlash',
  'Minus', 'Equals', 'LeftBracket', 'RightBracket', 'Quote', 'Backquote', 'Up', 'Down', 'Left', 'Right',
  ...['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Period', 'Divide', 'Multiply', 'Minus', 'Plus', 'Enter', 'Equals'].map((k) => `Keypad${k}`),
]);
/** The Enum.KeyCode name a label or key word stands for, or undefined (the part is then pressed by click or touch only). Pure. */
export function keyCodeName(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  const t = raw.trim();
  if (/^[0-9]$/.test(t)) return DIGITS[Number(t)];
  if (/^[a-zA-Z]$/.test(t)) return t.toUpperCase();
  if (KEY_WORDS[t.toLowerCase()]) return KEY_WORDS[t.toLowerCase()];
  if (/^F([1-9]|1[0-2])$/i.test(t)) return t.toUpperCase();
  // An Enum.KeyCode name as written, a real one only: any capitalised word used to pass.
  return KEYCODE_NAMES.has(t) ? t : undefined;
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

/** A colour as "#rrggbb": hex as given, a few plain names, or an [r, g, b] / {r, g, b}. */
const COLOUR_NAMES: Record<string, string> = {
  white: '#ffffff', black: '#1b1b1b', red: '#ff4b4b', orange: '#ff9f1a', yellow: '#ffe14d', green: '#5dd94a', blue: '#4fa3ff',
  purple: '#a46bff', pink: '#ff6fd8', brown: '#8e5b32', grey: '#9aa3ab', gray: '#9aa3ab', cyan: '#4fe0ff', gold: '#ffc83d',
  silver: '#c9d1d9', cream: '#fff3c4', beige: '#eedcb3',
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
  text?: { value: string; face: string; color: string; font?: string; glow?: boolean };
  move?: Move; key?: string;
  /** Neon, only when the spec says Neon. Everything else is Plastic. */
  material?: 'Neon';
  /** Made by the rows layout itself (its case), not listed by the agent. */
  own?: boolean;
  /** Moves with this other part: rigged with it, posed with it in its clip. */
  rides?: string;
  /** Smooth plastic instead of studs. */
  surface?: 'smooth';
}
export interface ObjectPlan {
  name: string; parts: ObjectPart[]; footprint: { x0: number; x1: number; z0: number; z1: number; top: number; bottom: number }; skipped?: string[];
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

const vol = (p: ObjectPart) => p.size[0] * p.size[1] * p.size[2];
const holds = (q: ObjectPart, at: V3, margin = 0.05) => [0, 1, 2].every((i) => Math.abs(at[i]! - q.at[i]!) < q.size[i]! / 2 - margin);

/** A face name in any case ("front", "TOP") as the Enum.NormalId item it means, or null. Benchmark s07 (2026-10-04): "front" failed the build. */
export function normalFace(face: unknown): string | null {
  const name = String(face ?? '').trim().replace(/^Enum\.NormalId\./i, '').toLowerCase();
  return ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom'].find((f) => f.toLowerCase() === name) ?? null;
}

/** The face a part's words go on when none is given: Top for a flat part, else the thin side the default view sees. Pure. */
export function thinFace(size: V3): string {
  const thin = size.indexOf(Math.min(...size));
  return thin === 2 && size[2] < size[1] ? 'Back' : thin === 0 && size[0] < size[1] ? 'Right' : 'Top';
}

/** The colour covering the most of an object (by part volume). Pure. */
export function mainColour(parts: ObjectPart[]): string {
  const by = new Map<string, number>();
  for (const p of parts) by.set(p.color, (by.get(p.color) ?? 0) + p.size[0] * p.size[1] * p.size[2]);
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#ffffff';
}

/** A stage colour that stands apart from an object's main colour, for a stage the agent asked for without a colour. Pure. */
export function contrastStage(hex: string): string {
  const n = parseInt(hex.slice(1), 16), [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 30) return '#4f8cff';            // grey, white or black: a clear blue
  const h = max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  return h < 2.2 || h > 5.2 ? '#4f8cff' : '#ffd23f'; // warm colours stand on blue; cool ones on gold
}

/** WCAG relative luminance of a #rrggbb. Pure. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
/** The contrast ratio of two colours, 1 (none) to 21. Pure. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
export function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 110;
}

/**
 * A `rows` entry: rows of labelled cells laid out on a grid by code, so cells never overlap however many there are. A
 * generic primitive: the agent supplies every label, the widths (in cells: `widths: { Wide: 3 }`), the colours, the text
 * colour, the case and the keys. Cells are `unit` wide by `unit` deep and `height` tall, `gap` apart, rows front to back,
 * left-aligned (or `align: 'center'`) on an optional case. A cell is pressed by the key named for it in `keys` (rows
 * parallel to `rows`, Enum.KeyCode names) when its move is on "key", else by click or touch. Pure.
 */
export function unrollRows(p: Record<string, unknown>, index: number): Record<string, unknown>[] {
  const rows = (p.rows as unknown[]).filter(Array.isArray).map((r) => (r as unknown[]).map((l) => String(l ?? '').slice(0, 24)).filter((l) => l.length > 0)).filter((r) => r.length > 0);
  const keyRows = Array.isArray(p.keys) ? (p.keys as unknown[]).map((r) => Array.isArray(r) ? r as unknown[] : []) : [];
  const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const unit = num(p.unit, 2, 0.5, 20), gap = num(p.gap, unit * 0.1, 0, unit), height = num(p.height, unit * 0.36, 0.2, 20);
  const margin = num(p.margin, unit * 0.3, 0, 50);
  const colours = (Array.isArray(p.colors ?? p.colours) ? (p.colors ?? p.colours) as unknown[] : []).map(colourHex).filter(Boolean) as string[];
  const baseColour = colourHex(p.color ?? p.colour) ?? '#d7dde2';
  const textColour = colourHex(p.textColor ?? p.textColour);
  const widthOf = (label: string) => num((p.widths as Record<string, unknown> | undefined)?.[label], 1, 0.25, 40);
  const rowWidth = (r: string[]) => r.reduce((w, l) => w + widthOf(l) * unit, 0) + gap * (r.length - 1);
  const width = Math.max(...rows.map(rowWidth)), depth = rows.length * unit + gap * (rows.length - 1);
  const origin = v3(p.at ?? p.position) ?? [0, 0, 0];
  const caseColour = p.case === false ? undefined : colourHex(p.case) ?? '#8a8f98';
  const caseTop = caseColour ? num(p.caseHeight, unit * 0.1, 0.2, 20) : 0;
  const base = safeObjectName(p.name) || `Cell${index + 1}`;
  const out: Record<string, unknown>[] = [];
  if (caseColour) out.push({ name: `${base}Case`, size: [width + 2 * margin, caseTop, depth + 2 * margin], at: [origin[0], origin[1] + caseTop / 2, origin[2]], color: caseColour, surface: 'smooth', own: true });
  const used = new Set<string>();
  const centred = p.align === 'center';
  rows.forEach((row, ri) => {
    let x = origin[0] - (centred ? rowWidth(row) / 2 : width / 2);
    const z = origin[2] - depth / 2 + ri * (unit + gap) + unit / 2;
    row.forEach((label, ci) => {
      const w = widthOf(label) * unit;
      let name = `${base}_${safeObjectName(label).replace(/ /g, '_') || `${ri}_${ci}`}`;
      while (used.has(name)) name += '_';
      used.add(name);
      const key = keyCodeName(String(keyRows[ri]?.[ci] ?? ''));
      const move = p.move && typeof p.move === 'object' ? { ...(p.move as Record<string, unknown>), ...((p.move as Record<string, unknown>).on === 'key' && !key ? { on: 'click' } : {}) } : undefined;
      out.push({
        name, size: [Math.max(0.4, w - gap), height, unit * 0.9], at: [x + w / 2, origin[1] + caseTop + height / 2, z],
        color: colours.length ? colours[(ri + ci) % colours.length]! : baseColour,
        text: { value: label, face: 'Top', ...(textColour ? { color: textColour } : {}) }, ...(key ? { key } : {}), ...(move ? { move } : {}),
        ...(p.surface === 'smooth' ? { surface: 'smooth' } : {}),
      });
      x += w + gap;
    });
  });
  return out;
}

/** The part name the agent gave, any language, made safe for a path; empty when none. Pure. */
const partNameOf = (raw: unknown) => safeObjectName(raw).replace(/ /g, '_');

/**
 * The spec, checked and expanded: repeats unrolled, the scale applied, positions read however they are written. Nothing is
 * rewritten by what a part is CALLED. `at` is the part's centre relative to the object's origin: y = 0 is the ground (or
 * the stage's top). Pure.
 */
export function expandObject(a: Record<string, unknown>): ObjectPlan | { error: string } {
  const name = safeObjectName(a.name);
  if (!name) return { error: 'name the object: a short name in any language (letters, digits, spaces, "_", "-")' };
  const scale = a.scale === undefined ? 1 : Number(a.scale);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 50) return { error: 'scale must be between 0 and 50' };
  const given = Array.isArray(a.parts) ? a.parts : [];
  const isRows = (r: unknown) => Boolean(r && typeof r === 'object' && Array.isArray((r as Record<string, unknown>).rows));
  const raw = [...given.filter((r) => !isRows(r)), ...given.filter(isRows).flatMap((r, i) => unrollRows(r as Record<string, unknown>, i))];
  if (raw.length === 0) return { error: 'parts is empty: list what the object is made of' };
  const parts: ObjectPart[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const [i, r] of raw.entries()) {
    const p = (r ?? {}) as Record<string, unknown>;
    // Forgiving on purpose: a slip in a shape, colour or key costs a fixed-up part, never the whole build.
    const cleaned = partNameOf(p.name ?? p.id ?? p.label ?? p.kind ?? p.part);
    // A part with no name is named for how it looks, so the answer can say "two cyan wedges" and not "ten parts".
    const base = cleaned || lookName(colourHex(p.color ?? p.colour), String(p.shape ?? 'block'));
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
      const on = TRIGGERS.has(onRaw) ? onRaw : onRaw === 'keypress' ? 'key' : 'click';
      const hingeRaw = m.hinge === undefined ? undefined : String(m.hinge).toLowerCase();
      const hinge = hingeRaw !== undefined && HINGES.has(hingeRaw) ? hingeRaw : undefined;
      const amount = m.amount === undefined ? undefined : Number(m.amount);
      if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > 1000)) return { error: `parts[${i}].move.amount must be a positive number` };
      move = { as, on, ...(hinge ? { hinge } : {}), ...(amount ? { amount } : {}), ...(typeof m.sound === 'string' || typeof m.sound === 'number' ? { sound: String(m.sound).slice(0, 80) } : {}), ...(typeof m.prompt === 'string' ? { prompt: m.prompt.slice(0, 30) } : {}) };
    }
    const textIn = p.text;
    const textObj = (textIn && typeof textIn === 'object' ? textIn : {}) as Record<string, unknown>;
    const textOf = (value: unknown) => value === undefined || value === '' ? undefined : {
      // No face given: the side the part is thinnest on.
      value: String(value).slice(0, 24), face: typeof textObj.face === 'string' ? (normalFace(textObj.face) ?? String(textObj.face)) : thinFace(size),
      // The ink is the spec's own colour; white when it gave none. Low contrast is reported (checks), never repaired.
      color: HEX.test(String(textObj.color ?? '')) ? String(textObj.color) : '#ffffff',
      ...(/^[A-Za-z]{3,30}$/.test(String(textObj.font ?? '')) ? { font: String(textObj.font) } : {}),
      ...(textObj.glow === true ? { glow: true } : {}),
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
      const partName = count === 1 ? base : (partNameOf(names[k]) || `${base}${k + 1}`);
      // A repeated name is renamed, never fatal.
      let unique = partName;
      for (let n = 2; seen.has(unique); n++) unique = `${partName}_${n}`;
      seen.add(unique);
      const label = count === 1 ? (typeof textIn === 'string' ? textIn : textObj.value) : texts[k];
      // The key a part answers to: the one the agent gave. The words printed on it are not read as keys.
      const key = keyCodeName(count === 1 ? p.key : keys[k]);
      const text = textOf(label);
      parts.push({
        name: unique, shape, color,
        size: size.map((n) => n * scale) as V3,
        at: [(at[0] + ix * step[0]) * scale, (at[1] + iy * step[1]) * scale, (at[2] + iz * step[2]) * scale],
        ...(rot ? { rot } : {}),
        ...(typeof p.transparency === 'number' && p.transparency >= 0 && p.transparency < 1 ? { transparency: p.transparency } : {}),
        ...(text ? { text } : {}),
        ...(move ? { move: { ...move, ...(move.amount ? { amount: move.amount * (move.as === 'spin' || move.as === 'open' || move.as === 'wobble' ? 1 : scale) } : {}) } } : {}),
        ...(key ? { key } : {}),
        ...(count === 1 && typeof p.rides === 'string' && partNameOf(p.rides) ? { rides: partNameOf(p.rides) } : {}),
        ...(p.surface === 'smooth' ? { surface: 'smooth' as const } : {}),
        // Neon only when the spec says so (a part's NAME never makes it glow).
        ...(p.material === 'Neon' ? { material: 'Neon' as const } : {}),
        ...(p.own === true ? { own: true } : {}),
      });
    }
  }
  if (parts.length === 0) return { error: `no part could be read: ${skipped.slice(0, 3).join('; ')}` };
  const footprint = {
    x0: Math.min(...parts.map((p) => p.at[0] - p.size[0] / 2)), x1: Math.max(...parts.map((p) => p.at[0] + p.size[0] / 2)),
    z0: Math.min(...parts.map((p) => p.at[2] - p.size[2] / 2)), z1: Math.max(...parts.map((p) => p.at[2] + p.size[2] / 2)),
    top: Math.max(...parts.map((p) => p.at[1] + p.size[1] / 2)), bottom: Math.min(...parts.map((p) => p.at[1] - p.size[1] / 2)),
  };
  return { name, parts, footprint, ...(skipped.length ? { skipped } : {}) };
}

/** What expandObject and the build MEASURED about an object: facts for the agent, never repairs. */
export interface ObjectChecks {
  /** Size in studs [x, y, z] and against a player. */
  size: V3; playerHeights: number;
  /** Longest side over the shortest, so "a long thin thing" and "a flat thing" can be read off the numbers. */
  proportions: { longest: number; shortest: number; ratio: number };
  /** Nothing moves: no part has a move. */
  nothingMoves: boolean;
  /** Parts whose centre is inside a bigger visible part: probably not seen. */
  hiddenParts: string[];
  /** Parts with nothing under them (the ground or another part): floating on purpose or by slip. */
  floatingParts: string[];
  /** Words printed on a part where another part covers that face's outside, or on the bottom. */
  coveredText: string[];
  /** Words whose colour is close to the part's own colour (contrast ratio under 3). */
  lowContrastText: { part: string; ratio: number }[];
  /** The lowest point is not at the ground (y = 0): the object floats, or sinks below it. */
  bottomY: number;
}

/** Measures a plan. Pure; never changes it. */
export function measureObject(plan: ObjectPlan): ObjectChecks {
  const f = plan.footprint;
  const size: V3 = [f.x1 - f.x0, f.top - f.bottom, f.z1 - f.z0].map((n) => Math.round(n * 10) / 10) as V3;
  const sorted = [...size].sort((a, b) => a - b);
  const longest = sorted[2]!, shortest = Math.max(sorted[0]!, 0.01);
  const visible = plan.parts.filter((p) => (p.transparency ?? 0) <= 0.5);
  const hiddenParts = visible.filter((p) => !p.own && visible.some((q) => q !== p && !q.own && vol(q) > vol(p) && holds(q, p.at))).map((p) => p.name);
  const overlaps = (a: ObjectPart, b: ObjectPart) => [0, 2].every((i) => Math.abs(a.at[i]! - b.at[i]!) < (a.size[i]! + b.size[i]!) / 2 - 0.05);
  const floatingParts = visible.filter((p) => {
    const bottom = p.at[1] - p.size[1] / 2;
    if (bottom < 0.3 || hiddenParts.includes(p.name)) return false; // a part inside another is reported as hidden, not floating
    return !visible.some((q) => q !== p && overlaps(p, q) && Math.abs(q.at[1] + q.size[1] / 2 - bottom) < 0.3);
  }).map((p) => p.name);
  const FACE_DIR: Record<string, V3> = { Top: [0, 1, 0], Bottom: [0, -1, 0], Back: [0, 0, 1], Front: [0, 0, -1], Right: [1, 0, 0], Left: [-1, 0, 0] };
  const coveredText = plan.parts.filter((p) => {
    if (!p.text) return false;
    if (p.text.face === 'Bottom') return true;
    const d = FACE_DIR[p.text.face];
    if (!d) return false;
    const out: V3 = [p.at[0] + d[0] * (p.size[0] / 2 + 0.1), p.at[1] + d[1] * (p.size[1] / 2 + 0.1), p.at[2] + d[2] * (p.size[2] / 2 + 0.1)];
    return plan.parts.some((q) => q !== p && holds(q, out, 0));
  }).map((p) => p.name);
  const lowContrastText = plan.parts.filter((p) => p.text && contrastRatio(p.text.color, p.color) < 3)
    .map((p) => ({ part: p.name, ratio: Math.round(contrastRatio(p.text!.color, p.color) * 10) / 10 }));
  return {
    size, playerHeights: Math.round(longest / PLAYER_HEIGHT * 10) / 10,
    proportions: { longest, shortest: Math.round(shortest * 10) / 10, ratio: Math.round(longest / shortest * 10) / 10 },
    nothingMoves: !plan.parts.some((p) => p.move), hiddenParts, floatingParts, coveredText, lowContrastText,
    bottomY: Math.round(f.bottom * 10) / 10,
  };
}

/** Where each detail sits on the biggest part, said plainly. Pure geometry. */
export function placesOf(parts: ObjectPart[]): string[] {
  const body = [...parts].filter((p) => !p.own).sort((a, b) => vol(b) - vol(a))[0];
  if (!body) return [];
  const top = body.at[1] + body.size[1] / 2, bottom = body.at[1] - body.size[1] / 2;
  return parts.filter((p) => p !== body && !p.own).map((p) => {
    const lo = p.at[1] - p.size[1] / 2, hi = p.at[1] + p.size[1] / 2;
    const where = lo >= top - 0.05 ? 'on top of' : hi <= bottom + 0.05 ? 'under' : p.at[2] > body.at[2] + body.size[2] / 2 - 0.05 ? 'on the +Z side of' : 'on';
    return `${p.name} is ${where} ${body.name}`;
  });
}

/**
 * A label on a part's top reads upright from the +Z side. Roblox draws a Top-face SurfaceGui with its top toward the part's
 * -X, so a labelled block with no rotation of its own is turned -90 degrees about Y with its width and depth swapped: the
 * same box in the world, its text upright. Not for open, which swings on the part's own axes. Pure.
 */
export function uprightLabel(p: ObjectPart): { Size: V3; Orientation?: V3 } {
  const turns = p.text?.face === 'Top' && !p.rot && p.shape === 'block' && (!p.move || p.move.as !== 'open');
  if (!turns) return { Size: p.size, ...(p.rot ? { Orientation: p.rot } : {}) };
  return { Size: [p.size[2], p.size[1], p.size[0]], Orientation: [0, -90, 0] };
}

/** What was built, in the words the answer may use. Pure geometry and names; the agent's own words are not rewritten. */
export function builtSummary(plan: ObjectPlan, moving: number, studs: boolean): string {
  const worded = plan.parts.filter((p) => p.text).map((p) => `${p.name} reads "${p.text!.value}"`);
  return [
    `${plan.parts.length} parts${studs ? ', studded' : ''}`,
    moving ? `${moving} of them move` : 'nothing moves',
    `made of: ${plan.parts.slice(0, 40).map((p) => p.name).join(', ')}${plan.parts.length > 40 ? ', ...' : ''}`,
    worded.length ? worded.slice(0, 12).join(', ') : 'no words are printed on it',
    placesOf(plan.parts).slice(0, 12).join(', '),
  ].filter(Boolean).join('; ');
}

/** A clip that also moves the parts riding this one, pose for pose. Pure. */
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

/** Where an object's counter pill sits: the first object's top left, the next ones along the top. */
export const COUNTER_SPOTS = ['top-left', 'top', 'top-right', 'left', 'right'] as const;

/** The names of the object screens in StarterGui (a ScreenGui named …HUD holding a Counter), in order. Pure. */
export function objectScreens(root: unknown): string[] {
  const kids = (root && typeof root === 'object' ? (root as { children?: unknown[] }).children : null) ?? [];
  const holds = (n: unknown, want: string): boolean => {
    const node = n as { name?: unknown; children?: unknown[] } | null;
    return !!node && (node.name === want || (node.children ?? []).some((c) => holds(c, want)));
  };
  return kids.flatMap((k) => {
    const node = k as { name?: unknown; class?: unknown; children?: unknown[] };
    return typeof node.name === 'string' && /HUD$/.test(node.name) && node.class === 'ScreenGui' && (node.children ?? []).some((c) => holds(c, 'Counter')) ? [node.name] : [];
  });
}

/**
 * An object's studded screen: a counter pill (the number with its caption) and/or a hint bar the agent asked for, and the
 * LocalScript that counts every move a player set off on the model named `name` (AppleAnimatePlayed). Merged into the
 * screen, never redrawn. Returns what went wrong, or null. Shared by build_object (`screen`) and dress_object (`counter`).
 */
export async function writeObjectHud(ctx: AgentCtx, name: string, hud: { counter?: unknown; hint?: unknown; icon?: unknown }): Promise<string | null> {
  // A second object's counter goes beside the first one's, never on it: its own place among the object screens already there.
  const gui = await ctx.execStudioOp({ op: 'get_tree', root: 'game.StarterGui', maxDepth: 4, maxNodes: 400 }, 20_000).catch(() => null);
  const screens = gui?.ok ? objectScreens((gui.data as { root?: unknown }).root) : [];
  const at = COUNTER_SPOTS[(screens.includes(`${name}HUD`) ? screens.indexOf(`${name}HUD`) : screens.length) % COUNTER_SPOTS.length]!;
  const screen = studdedScreen({ name: `${name}HUD`, pieces: [
    ...(hud.counter ? [{ kind: 'counter' as const, name: 'Counter', text: '0', icon: String(hud.icon ?? '#').slice(0, 2), colour: 'purple' as const, plus: false, at, caption: String(hud.counter).slice(0, 24) }] : []),
    ...(hud.hint ? [{ kind: 'bar' as const, name: 'Hint', text: String(hud.hint).slice(0, 60), colour: 'yellow' as const, at: 'bottom' as const }] : []),
  ] });
  // Merged, never redrawn: a rebuilt object keeps whatever was added to its screen since.
  const failedUi = await writeScreen(ctx, screen);
  if (failedUi) return `hud: ${clipText(failedUi)}`;
  const s = (v: string) => luau(v); // a Luau string literal, any language
  const src = `-- ${name.replace(/[\r\n]/g, ' ')}'s screen: counts every move (AppleAnimatePlayed) and pops the counter. Written by Apple; edit freely.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local gui = Players.LocalPlayer:WaitForChild("PlayerGui"):WaitForChild(${s(`${name}HUD`)})
local counter = gui:FindFirstChild("Counter", true)
local value = counter and counter:FindFirstChild("Value")
local n = 0
local played = game:GetService("ReplicatedStorage"):WaitForChild("AppleAnimatePlayed")
-- Only what a player set off counts: a loop that starts by itself is not a press.
played.OnClientEvent:Connect(function(model, _clip, player)
	if (model and model.Name ~= ${s(name)}) or player == nil then return end
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
  // `extend: <id>` (an id from "Earlier in this project"): the earlier object's spec with these parts added, a part of the same
  // name replaced, built again in its place. The agent decides that this message is about that object; nothing infers it.
  let a = sent;
  if (typeof sent.extend === 'string' && sent.extend) {
    const prev = await ctx.buildLedger?.find(sent.extend);
    if (!prev?.spec || prev.tool !== 'build_object') return { error: `extend: ${sent.extend} is not a build_object build in this project's ledger (it may have been removed, or be older than the ledger keeps a spec for). Build the whole object, with a new name or replace: true.` };
    a = { ...extendSpec(prev.spec, sent), replace: true };
    delete a.extend;
  }
  const plan = expandObject(a);
  if ('error' in plan) return { error: plan.error };
  const wantsStuds = !userWantsOwnSurface(ctx.userRequest?.());
  const { footprint: f } = plan;
  const width = f.x1 - f.x0, depth = f.z1 - f.z0;
  // Everything opt-in is read up front, so a bad option fails before anything is built.
  const stageIn = a.stage && a.stage !== 'none' ? (typeof a.stage === 'object' ? a.stage : {}) as Record<string, unknown> : null;
  const stageH = stageIn ? Math.min(10, Math.max(0.2, Number(stageIn.height) || 2)) : 0;
  const pad = stageIn ? Math.min(60, Math.max(0, Number.isFinite(Number(stageIn.pad)) ? Number(stageIn.pad) : 6)) : 0;
  if (stageIn && stageIn.color !== undefined && !HEX.test(String(stageIn.color))) return { error: 'stage.color must be #rrggbb' };
  const screenIn = a.screen && a.screen !== 'none' && a.screen !== false && typeof a.screen === 'object' ? a.screen as Record<string, unknown> : null;
  const named = await allocateName(ctx, plan.name, undefined, a.replace === true);
  if ('error' in named) return named;
  const model = named.path;
  const stagePath = `game.Workspace.${named.name}Stage`;
  if (stageIn) {
    const taken = await ctx.execStudioOp({ op: 'get_instance', path: stagePath }, 10_000).catch(() => null);
    if (taken?.ok) {
      if (a.replace !== true) return { error: `${stagePath} already exists; choose another name, or pass replace: true` };
      await ctx.execStudioOp({ op: 'delete_instances', paths: [stagePath] }, 20_000).catch(() => undefined);
    }
  }
  // Where it stands: where the agent said (`at`, the centre of its footprint on the ground), else beside what is already there.
  const given = v3(a.at);
  const lane = given ? 0 : await freeLaneX(ctx, width + 2 * pad + 12, depth + 2 * pad + 12, -26, [model, stagePath]);
  const base: V3 = given ?? [lane, 0, -26];
  const origin: V3 = [base[0] - (f.x0 + f.x1) / 2, base[1] + stageH, base[2] - (f.z0 + f.z1) / 2];
  const center: V3 = [base[0], base[1] + stageH, base[2]];

  const textGui = (t: NonNullable<ObjectPart['text']>, p: ObjectPart): InstanceSpecLite => ({
    className: 'SurfaceGui', name: 'Label',
    props: { Face: { t: 'EnumItem', v: `Enum.NormalId.${t.face}` }, SizingMode: { t: 'EnumItem', v: 'Enum.SurfaceGuiSizingMode.PixelsPerStud' }, PixelsPerStud: Math.max(10, Math.min(80, 120 / Math.max(1, Math.min(p.size[0], p.size[2])))), LightInfluence: 0,
      ...(t.glow ? { Brightness: 2.5 } : {}) },
    children: [{ className: 'TextLabel', name: 'Text', props: { Size: { t: 'UDim2', v: [0.9, 0, 0.9, 0] }, Position: { t: 'UDim2', v: [0.05, 0, 0.05, 0] }, BackgroundTransparency: 1, Text: t.value, TextScaled: true, Font: { t: 'EnumItem', v: `Enum.Font.${t.font ?? 'FredokaOne'}` }, TextColor3: t.color },
      // Dark ink is printed; light ink keeps a dark outline so it reads on any colour.
      children: [{ className: 'UIStroke', name: 'Outline', props: { Color: '#111111', Thickness: isDark(t.color) ? 0 : 2 } }] }],
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
  // with its first parts and the rest are added to it in batches.
  const specs = plan.parts.map(partSpec);
  const FIRST = 39, BATCH = 100;
  items.push({ className: 'Model', name: named.name, children: [root, ...specs.slice(0, FIRST)] });
  if (stageIn) {
    const color = stageIn.color ? String(stageIn.color) : contrastStage(mainColour(plan.parts));
    items.push({ className: 'Model', name: `${named.name}Stage`, children: [
      { className: 'Part', name: 'Stage', props: { Size: [width + pad * 2, stageH, depth + pad * 2], Position: [center[0], base[1] + stageH / 2, center[2]], Anchored: true, Color: color, Material: 'Plastic' } },
    ] });
  }
  const made = await ctx.execStudioOp({ op: 'create_instances', items: items.map((i) => ({ ...typed(i), parent: 'game.Workspace' })) }, 120_000);
  if (!made.ok) return { error: `The object was not made: ${clipText(made.error)}` };
  for (let i = FIRST; i < specs.length; i += BATCH) {
    const more = await ctx.execStudioOp({ op: 'create_instances', items: specs.slice(i, i + BATCH).map((sp) => ({ ...typed(sp), parent: model })) }, 120_000);
    if (!more.ok) return { error: `The object was only partly made: ${clipText(more.error)}`, changed: true, projectMutated: true };
  }

  // Studs on the object and its stage (never the ground or the spawn), unless the user asked for another surface.
  // Studding turns every part under it to studded Plastic, Neon too: what the spec made Neon glows again.
  if (wantsStuds) {
    await ctx.execStudioOp(applySurfaceOp([model, ...(stageIn ? [stagePath] : [])]), 60_000).catch(() => undefined);
    for (const p of plan.parts.filter((x) => x.material === 'Neon')) await ctx.execStudioOp({ op: 'set_props', path: `${model}.${p.name}`, props: { Material: { t: 'EnumItem', v: 'Enum.Material.Neon' } } }, 20_000).catch(() => undefined);
  }
  // Smooth plastic where the spec says so.
  const smooth = plan.parts.filter((p) => p.surface === 'smooth').map((p) => `${model}.${p.name}`);
  for (let i = 0; i < smooth.length; i += 50) {
    await ctx.execStudioOp({ op: 'apply_surface', paths: smooth.slice(i, i + 50), surface: 'smooth_no_outlines' }, 60_000).catch(() => undefined);
  }

  // Motion: rig every moving part to the root with its pivot on its hinge, then one clip per part.
  const problems: string[] = [];
  const sounds: string[] = [];
  if (moving.length) {
    const movingNames = new Set(moving.map((p) => p.name));
    const riders = plan.parts.filter((p) => p.rides && movingNames.has(p.rides));
    const rigged = await ctx.execStudioOp({ op: 'rig_model', root: `${model}.Root`, parts: [...moving, ...riders].map((p) => `${model}.${p.name}`), joint: 'motor' }, 60_000);
    if (!rigged.ok) problems.push(`rig: ${clipText(rigged.error)}`);
    else {
      // Each joint hinges where its part's motion does; a rider of a part that turns hinges where that part does, so the
      // two turn as one. A part turned to read upright (uprightLabel) has its joint turned back to the world's axes.
      const byName = new Map(plan.parts.map((p) => [p.name, p]));
      const ROTATES = new Set(['spin', 'open', 'wobble']);
      for (const p of [...moving, ...riders]) {
        const leader = p.move ? p : byName.get(p.rides!)!;
        if (!p.move && !ROTATES.has(leader.move!.as)) continue; // a rider only slides with its leader
        const at = hingePoint(leader, origin);
        const turn = uprightLabel(p).Orientation ? [0, 90, 0] as V3 : undefined;
        if (!turn && at.every((n, i) => Math.abs(n - (origin[i]! + p.at[i]!)) < 1e-6)) continue;
        const pv = await ctx.execStudioOp({ op: 'set_joint_pivot', joint: `${model}.Root.${p.name}`, at, ...(turn ? { turn } : {}) }, 20_000);
        if (!pv.ok) problems.push(`hinge ${p.name}: ${clipText(pv.error)}`);
      }
      const clips: Record<string, unknown> = {};
      const soundCache = new Map<string, { id?: string; said: string }>();
      for (const p of moving) {
        const c = withRiders(motionClip(p), p.name, riders.filter((r) => r.rides === p.name).map((r) => r.name));
        // The sound is the agent's: an asset id, or words for the sound library (its first hit, said in `sounds`).
        const q = p.move!.sound;
        if (q) {
          if (!soundCache.has(q)) {
            const direct = soundAssetId(q);
            const hit = direct ? undefined : findSounds(q, { limit: 1, maxSeconds: 4 })[0];
            const id = direct ? `rbxassetid://${direct}` : hit?.soundId;
            soundCache.set(q, { ...(id ? { id } : {}), said: id ? `"${q}" -> ${direct ? `id ${direct}` : hit?.name ?? 'a library sound'}` : `"${q}" -> no match in the sound library, so it is silent` });
            sounds.push(soundCache.get(q)!.said);
          }
          const s = soundCache.get(q)!.id;
          if (s) Object.assign(c, { sound: s, volume: 0.7 });
        }
        clips[`${p.name}.${p.move!.as}`] = c;
      }
      const source = `-- What ${named.name.replace(/[\r\n]/g, ' ')} does, played by AppleAnimate. Written by Apple's build_object; edit freely.\nreturn ${luau(clips)}\n`;
      const wrote = await ctx.execStudioOp({ op: 'edit_script', path: `${model}.AppleAnimations`, source, create: { className: 'ModuleScript', parent: model } }, 60_000);
      if (!wrote.ok) problems.push(`animations: ${clipText(wrote.error)}`);
      const player = await installAnimationPlayer(ctx);
      if (player) problems.push(`player: ${player}`);
    }
  }

  // The agent's own screen: a counter and/or a hint, only when it asked.
  if (screenIn && (screenIn.counter || screenIn.hint)) {
    const failed = await writeObjectHud(ctx, named.name, screenIn);
    if (failed) problems.push(failed);
  }
  // The view turns to it only when asked.
  if (a.focus === true) await ctx.execStudioOp({ op: 'camera_focus', path: model }, 10_000).catch(() => undefined);

  // Rigging is what makes it move: if that failed, the object stands but does nothing, which is not done.
  if (moving.length && problems.some((p) => p.startsWith('rig') || p.startsWith('animations') || p.startsWith('player'))) {
    return { changed: true, projectMutated: true, object: model, error: `Built, but it cannot move yet: ${problems.join('; ')}. If Studio says an operation is unknown, the Apple plugin in Studio is older than this tool: tell the user to restart Studio.` };
  }
  const checks = measureObject(plan);
  return {
    changed: true,
    object: model,
    parts: plan.parts.length,
    moving: moving.length,
    size: checks.size,
    checks,
    ...(stageIn ? { stage: stagePath } : {}),
    ...(sounds.length ? { sounds } : {}),
    ...(problems.length ? { problems } : {}),
    ...(plan.skipped ? { skipped: plan.skipped } : {}),
    built: builtSummary(plan, moving.length, wantsStuds),
    note: 'Information, not a verdict: `checks` are measured facts about what was built (parts hidden inside others, parts with nothing under them, covered or low-contrast words, proportions, whether anything moves). Nothing was added that the spec did not ask for. Look at it (play_check, a viewport capture), fix what you judge worth fixing with build_object again (replace: true, the whole fixed spec), add a stage, click response or counter with dress_object if THIS object calls for it, and tell the user only what is really there.',
  };
}
