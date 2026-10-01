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
};
export function keyCodeName(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  const t = raw.trim();
  if (/^[0-9]$/.test(t)) return DIGITS[Number(t)];
  if (/^[a-zA-Z]$/.test(t)) return t.toUpperCase();
  if (KEY_WORDS[t.toLowerCase()] ?? KEY_WORDS[t]) return KEY_WORDS[t.toLowerCase()] ?? KEY_WORDS[t];
  if (/^F([1-9]|1[0-2])$/i.test(t)) return t.toUpperCase();
  if (/^[A-Z][A-Za-z]{1,19}$/.test(t)) return t; // already an Enum.KeyCode name (One, LeftShift, Space...)
  return undefined;
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
  text?: { value: string; face: string; color: string }; move?: Move; key?: string;
  /** Moves with this other part (a keycap's skirt rides its cap): rigged with it, posed with it in its clip. */
  rides?: string;
  /** Smooth plastic instead of studs (a keycap, like the owner's reference keyboard). */
  surface?: 'smooth';
}
export interface ObjectPlan { name: string; parts: ObjectPart[]; footprint: { x0: number; x1: number; z0: number; z1: number; top: number }; skipped?: string[] }

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

/** A colour made lighter (amount > 0, toward white) or darker (toward black). Pure. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)));
  return `#${c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A `rows` entry (a keyboard, a keypad, a piano, a calculator): rows of labels laid out by code, so keys never overlap
 * however many there are (owner, 2026-10-01: the hand-placed keyboard put ENTER on BACK). Keys are a `unit` wide (2
 * studs) times their real width, `gap` apart, rows left-aligned front to back, on a case; each key is pressed by its
 * real keyboard key when the move is on "key". Pure: returns plain part entries for expandObject.
 */
export function unrollRows(p: Record<string, unknown>, index: number): Record<string, unknown>[] {
  const rows = (p.rows as unknown[]).filter(Array.isArray).map((r) => (r as unknown[]).map((l) => String(l ?? '').slice(0, 12)).filter(Boolean)).filter((r) => r.length > 0);
  const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  // Low enough to walk onto (owner's play test, 2026-10-01: he had to jump onto the keyboard): case and key together are
  // under half a key, so a player steps up onto it and runs across the keys.
  const unit = num(p.unit, 2, 0.5, 20), gap = num(p.gap, unit * 0.12, 0, unit), height = num(p.height ?? p.keyHeight, unit * 0.3, 0.2, 20);
  // A slim keyboard body just around the keys, not a wide plane (owner, 2026-10-01: "a giant plane with cubes").
  const margin = num(p.margin, unit * 0.3, 0, 50);
  const colours = (Array.isArray(p.colors ?? p.colours) ? (p.colors ?? p.colours) as unknown[] : PASTEL).map(colourHex).filter(Boolean) as string[];
  const widthOf = (label: string) => KEY_WIDTH.find(([re]) => re.test(label))?.[1] ?? num((p.widths as Record<string, unknown> | undefined)?.[label], 1, 0.5, 12);
  const rowWidth = (r: string[]) => r.reduce((w, l) => w + widthOf(l) * unit, 0) + gap * (r.length - 1);
  const width = Math.max(...rows.map(rowWidth)), depth = rows.length * unit + gap * (rows.length - 1);
  const origin = v3(p.at ?? p.position) ?? [0, 0, 0];
  const caseTop = p.case === false ? 0 : num(p.caseHeight, unit * 0.15, 0.2, 20);
  const base = String(p.name ?? 'Key').replace(/[^A-Za-z0-9_]/g, '') || `Key${index + 1}`;
  const out: Record<string, unknown>[] = [];
  if (p.case !== false) {
    out.push({ name: `${base}Case`, size: [width + 2 * margin, caseTop, depth + 2 * margin], at: [origin[0], origin[1] + caseTop / 2, origin[2]], color: colourHex(p.case) ?? '#eef0f6', surface: 'smooth' });
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
      const colour = colours[(ri + ci) % colours.length] ?? '#d7dde2';
      const skirtH = height * 0.55, capH = height * 0.45, y0 = origin[1] + caseTop;
      out.push({
        name: `${name}Skirt`, size: [w, skirtH, unit], at: [x + w / 2, y0 + skirtH / 2, z], color: shade(colour, -0.12), rides: name, surface: 'smooth',
      });
      out.push({
        name, size: [Math.max(0.4, w - unit * 0.16), capH, unit * 0.84], at: [x + w / 2, y0 + skirtH + capH / 2, z], color: shade(colour, 0.22),
        text: { value: label.length > 1 ? label.toUpperCase() : label.toLowerCase(), face: 'Top', color: '#3a3a4a' }, key: label, surface: 'smooth',
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

/**
 * A keyboard the model placed key by key is laid out again by code (owner, 2026-10-01: the model ignored `rows` and
 * hand-placed the keys again, with an 18-stud "CounterScreen" wall behind them). When 8 or more parts are labelled
 * with keyboard keys, their labels are read row by row (front to back by z, left to right by x) and laid out with
 * unrollRows at the model's own key size; the plates under them and any screen, monitor, desk or wall go (a counter
 * screen is already on the player's screen). Each key keeps the motion and sound it was given. Pure.
 */
export function relayKeyboard(all: ObjectPart[], laidOut = false): ObjectPart[] {
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
  const under = (p: ObjectPart) => !isKey(p) && p.at[1] + p.size[1] / 2 <= keyBottom + 0.05 &&
    p.at[0] - p.size[0] / 2 < x1 && p.at[0] + p.size[0] / 2 > x0 && p.at[2] - p.size[2] / 2 < z1 && p.at[2] + p.size[2] / 2 > z0;
  const kept = parts.filter((p) => !isKey(p) && !under(p) && !NOT_A_KEYBOARD_PART.test(p.name));
  // Laid out by rows already: keep the tool's keys and case, and only drop the model's own plates and screens.
  if (laidOut) return [...keys, ...riders, ...parts.filter((p) => /Case$/.test(p.name) && !isKey(p)), ...kept.filter((p) => !/Case$/.test(p.name))];
  const moveOf = new Map(keys.map((k) => [labelOf(k)!.toLowerCase(), k.move]));
  const colours = [...new Set(keys.map((k) => k.color))].slice(0, 6);
  const laid = unrollRows({
    name: 'Key', rows: rows.map((r) => r.map((k) => labelOf(k)!)), unit, gap: unit * 0.12, height: Math.min(height, unit * 0.35),
    colors: colours.length > 1 ? colours : undefined, case: '#eef0f6', at: [(x0 + x1) / 2, 0, (z0 + z1) / 2], move: keys.find((k) => k.move)?.move,
  }, 0);
  const made: ObjectPart[] = laid.map((r) => {
    const label = (r.text as { value: string } | undefined)?.value;
    const given = label ? moveOf.get(label.trim().toLowerCase()) ?? moveOf.get(String(r.key ?? '').toLowerCase()) ?? keys.find((k) => k.move)?.move : undefined;
    const move = given && label && keyCodeName(label) ? { ...given, on: 'key' } : given;
    const key = label ? keyCodeName(label) : undefined;
    return {
      name: String(r.name), shape: 'block', size: r.size as V3, at: r.at as V3, color: String(r.color),
      ...(r.text ? { text: r.text as ObjectPart['text'] } : {}), ...(move ? { move } : {}), ...(key ? { key } : {}),
      ...(typeof r.rides === 'string' ? { rides: r.rides } : {}), ...(r.surface === 'smooth' ? { surface: 'smooth' as const } : {}),
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
  const raw = [...given.filter((r) => !isRows(r)), ...merged.flatMap((r, i) => unrollRows({ unit: 4 / scale, ...r }, i))];
  if (raw.length === 0) return { error: 'parts is empty: list what the object is made of' };
  const parts: ObjectPart[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const [i, r] of raw.entries()) {
    const p = (r ?? {}) as Record<string, unknown>;
    // Forgiving on purpose: a slip in a name, shape, colour or key costs a fixed-up part, never the whole build.
    const cleaned = String(p.name ?? '').replace(/[^A-Za-z0-9_]/g, '');
    const base = NAME.test(cleaned) ? cleaned : `Part${i + 1}`;
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
      value: String(value).slice(0, 24), face: typeof (textIn as Record<string, unknown>)?.face === 'string' ? String((textIn as Record<string, unknown>).face) : 'Top',
      color: HEX.test(String((textIn as Record<string, unknown>)?.color ?? '')) ? String((textIn as Record<string, unknown>).color) : '#ffffff',
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
      });
    }
  }
  // A keyboard placed key by key is laid out by code (relayKeyboard), unless the model already used rows.
  const usedRows = (Array.isArray(a.parts) ? a.parts : []).some((r) => r && typeof r === 'object' && Array.isArray((r as Record<string, unknown>).rows));
  parts.splice(0, parts.length, ...relayKeyboard(parts, usedRows));
  // Ground it: the lowest point of the object sits on the stage.
  const bottom = Math.min(...parts.map((p) => p.at[1] - p.size[1] / 2));
  for (const p of parts) p.at[1] -= bottom;
  const footprint = {
    x0: Math.min(...parts.map((p) => p.at[0] - p.size[0] / 2)), x1: Math.max(...parts.map((p) => p.at[0] + p.size[0] / 2)),
    z0: Math.min(...parts.map((p) => p.at[2] - p.size[2] / 2)), z1: Math.max(...parts.map((p) => p.at[2] + p.size[2] / 2)),
    top: Math.max(...parts.map((p) => p.at[1] + p.size[1] / 2)),
  };
  if (parts.length === 0) return { error: `no part could be read: ${skipped.slice(0, 3).join('; ')}` };
  return { name, parts, footprint, ...(skipped.length ? { skipped } : {}) };
}

/**
 * A label on a part's top reads upright from the spawn. Roblox draws a Top-face SurfaceGui with its top toward the
 * part's -X (measured in Studio, 2026-10-01: the owner's keys read sideways), and the player looks along -Z; so a
 * labelled block with no rotation of its own is turned -90 degrees about Y with its width and depth swapped: the same
 * box in the world, its text upright. Only for motions along Y (press, bob, pop), whose clips do not care. Pure.
 */
export function uprightLabel(p: ObjectPart): { Size: V3; Orientation?: V3 } {
  const turns = p.text?.face === 'Top' && !p.rot && p.shape === 'block' && (!p.move || ['press', 'bob', 'pop'].includes(p.move.as));
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
  const caps = plan.parts.filter((p) => p.rides).length;
  const smooth = plan.parts.some((p) => p.surface === 'smooth');
  const how = [
    caps ? `${caps} keycaps (smooth plastic, a lighter top with its letter on a darker skirt)` : `${plan.parts.length} parts`,
    studs ? (smooth ? 'on a studded stage' : 'studded') : '',
    moving ? `${moving} of them move${keysBound ? `, ${keysBound} answer the real keyboard keys, and they are also pressed by clicking or walking on them` : ''}` : '',
    moving ? 'each move has its sound; a counter and a hint are on the player\'s screen (not in the world)' : '',
  ].filter(Boolean);
  return how.join('; ');
}

/** Whether a colour is dark enough to print without an outline. Pure. */
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

export async function buildObject(ctx: AgentCtx, a: Record<string, unknown>) {
  const plan = expandObject(a);
  if ('error' in plan) return { error: plan.error };
  const wantsStuds = !userWantsOwnSurface(ctx.userRequest?.());
  const { footprint: f } = plan;
  const width = f.x1 - f.x0, depth = f.z1 - f.z0;
  const stageOn = a.stage !== 'none';
  const stageH = stageOn ? 2 : 0;
  // The object stands a little away from the spawn; the spawn faces it.
  const origin: V3 = [-(f.x0 + f.x1) / 2, stageH, -(Math.max(18, depth) + 16) - (f.z0 + f.z1) / 2];
  const center: V3 = [0, stageH, origin[2] + (f.z0 + f.z1) / 2];
  const model = `game.Workspace.${plan.name}`;

  const textGui = (t: NonNullable<ObjectPart['text']>, p: ObjectPart): InstanceSpecLite => ({
    className: 'SurfaceGui', name: 'Label',
    props: { Face: { t: 'EnumItem', v: `Enum.NormalId.${t.face}` }, SizingMode: { t: 'EnumItem', v: 'Enum.SurfaceGuiSizingMode.PixelsPerStud' }, PixelsPerStud: Math.max(10, Math.min(80, 120 / Math.max(1, Math.min(p.size[0], p.size[2])))), LightInfluence: 0 },
    children: [{ className: 'TextLabel', name: 'Text', props: { Size: { t: 'UDim2', v: [0.9, 0, 0.9, 0] }, Position: { t: 'UDim2', v: [0.05, 0, 0.05, 0] }, BackgroundTransparency: 1, Text: t.value, TextScaled: true, Font: { t: 'EnumItem', v: 'Enum.Font.FredokaOne' }, TextColor3: t.color },
      // Dark ink (a keycap's letter) is printed, not outlined; light text keeps its black outline.
      children: [{ className: 'UIStroke', name: 'Outline', props: { Color: '#111111', Thickness: isDark(t.color) ? 0 : 2 } }] }],
  });
  const moving = plan.parts.filter((p) => p.move);
  const partSpec = (p: ObjectPart): InstanceSpecLite => ({
    className: p.shape === 'wedge' ? 'WedgePart' : 'Part', name: p.name,
    props: {
      ...uprightLabel(p),
      Position: [origin[0] + p.at[0], origin[1] + p.at[1], origin[2] + p.at[2]],
      Anchored: !p.move && !p.rides, Color: p.color, Material: 'Plastic', TopSurface: 'Smooth', BottomSurface: 'Smooth',
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
    const stageColor = HEX.test(String(a.stageColor ?? '')) ? String(a.stageColor) : '#ffd23f';
    items.push({ className: 'Model', name: `${plan.name}Stage`, children: [
      { className: 'Part', name: 'Stage', props: { Size: [width + pad * 2, stageH, depth + pad * 2], Position: [center[0], stageH / 2, center[2]], Anchored: true, Color: stageColor, Material: 'Plastic' } },
      { className: 'Part', name: 'Rim', props: { Size: [width + pad * 2 + 2, stageH * 0.5, depth + pad * 2 + 2], Position: [center[0], stageH * 0.25, center[2]], Anchored: true, Color: '#8e5b32', Material: 'Plastic' } },
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
  await ctx.execStudioOp({ op: 'set_props', path: 'game.Workspace.Baseplate', props: { Color: { t: 'Color3', v: [0.38, 0.79, 0.29] }, Material: { t: 'EnumItem', v: 'Enum.Material.Plastic' } } }, 20_000).catch(() => undefined);
  const spawnAt: V3 = [0, 0.5, 8];
  const spawn = await ctx.execStudioOp({ op: 'set_props', path: 'game.Workspace.SpawnLocation', props: { Position: { t: 'Vector3', v: spawnAt }, Orientation: { t: 'Vector3', v: [0, 0, 0] } } }, 20_000).catch(() => ({ ok: false }));
  if (!('ok' in spawn) || !spawn.ok) {
    await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'SpawnLocation', name: 'SpawnLocation', props: { Size: [8, 1, 8], Position: spawnAt, Anchored: true, Color: '#4fc3ff' } }), parent: 'game.Workspace' }] }, 20_000).catch(() => undefined);
  }
  if (wantsStuds) await ctx.execStudioOp(applySurfaceOp([model, `game.Workspace.${plan.name}Stage`, 'game.Workspace.Baseplate', 'game.Workspace.SpawnLocation']), 60_000).catch(() => undefined);
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
      for (const p of moving) {
        const at = hingePoint(p, origin);
        if (at.every((n, i) => Math.abs(n - (origin[i]! + p.at[i]!)) < 1e-6)) continue;
        const pv = await ctx.execStudioOp({ op: 'set_joint_pivot', joint: `${model}.Root.${p.name}`, at }, 20_000);
        if (!pv.ok) problems.push(`hinge ${p.name}: ${clipText(pv.error)}`);
      }
      const clips: Record<string, unknown> = {};
      const soundCache = new Map<string, string | undefined>();
      const keystrokes = keySoundPool();
      let keyIndex = 0;
      for (const p of moving) {
        const c = withRiders(motionClip(p), p.name, riders.filter((r) => r.rides === p.name).map((r) => r.name));
        const q = p.move!.sound;
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
    hint: keyed ? 'Type on your keyboard or click the keys!' : moving.some((p) => p.move!.on === 'loop') ? 'Watch it go!' : 'Click it!',
  } : null;
  // A screen object without a counter or hint (the re-test passed one) still gets them: the screen is never lost.
  const asked = given && typeof given === 'object' ? given as Record<string, unknown> : null;
  const hud = (given === false ? null : asked && (asked.counter || asked.hint) ? asked : defaults ? { ...defaults, ...(asked ?? {}) } : asked) as Record<string, unknown> | null;
  if (hud && (hud.counter || hud.hint)) {
    const screen = studdedScreen({ name: `${plan.name}HUD`, pieces: [
      // One pill: the number with its caption inside (owner, 2026-10-01: a separate "Keys pressed" pill looked like a
      // button that did nothing).
      ...(hud.counter ? [{ kind: 'counter' as const, name: 'Counter', text: '0', icon: String(hud.icon ?? '#').slice(0, 2), colour: 'purple' as const, plus: false, at: 'top-left' as const, caption: String(hud.counter).slice(0, 24) }] : []),
      ...(hud.hint ? [{ kind: 'bar' as const, name: 'Hint', text: String(hud.hint).slice(0, 60), colour: 'yellow' as const, at: 'bottom' as const }] : []),
    ] });
    // Merged, never redrawn: a rebuilt object keeps whatever was added to its screen since (the upgrades, a shop).
    const failedUi = await writeScreen(ctx, screen);
    const ui = failedUi ? { ok: false, error: failedUi } : { ok: true };
    if (!ui.ok) problems.push(`hud: ${clipText(ui.error)}`);
    else {
      const src = `-- ${plan.name}'s screen: counts every move (AppleAnimatePlayed) and pops the counter. Written by Apple; edit freely.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local gui = Players.LocalPlayer:WaitForChild("PlayerGui"):WaitForChild("${plan.name}HUD")
local counter = gui:FindFirstChild("Counter", true)
local value = counter and counter:FindFirstChild("Value")
local n = 0
local played = game:GetService("ReplicatedStorage"):WaitForChild("AppleAnimatePlayed")
played.OnClientEvent:Connect(function(model)
	if model and model.Name ~= "${plan.name}" then return end
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
      const path = `game.StarterPlayer.StarterPlayerScripts.${plan.name}HUDScript`;
      await ctx.execStudioOp({ op: 'delete_instances', paths: [path] }, 20_000).catch(() => undefined);
      const sc = await ctx.execStudioOp({ op: 'edit_script', path, source: src, create: { className: 'LocalScript', parent: 'game.StarterPlayer.StarterPlayerScripts' } }, 60_000);
      if (!sc.ok) problems.push(`hud script: ${clipText(sc.error)}`);
    }
  }
  const keys = moving.filter((p) => p.move!.on === 'key' && p.key).length;
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
    note: 'Done: add nothing else. Check it once in play (play_check); if something is wrong, call build_object again with the whole fixed spec; otherwise tell the user in one or two friendly sentences what they can do with it, saying only what `built` says.',
  };
}
