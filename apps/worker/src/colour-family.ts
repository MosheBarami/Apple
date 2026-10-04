/**
 * COLOUR FAMILIES — where "this value is red" and "this word means red" meet.
 *
 * The claim audit (claim-audit.ts) has to compare two different kinds of thing: a measured value
 * (a Color3 read back from the place, a BrickColor name) and a word in the agent's reply ("red",
 * "golden"). Both are reduced to a small set of families a person would call the same colour. The
 * table is vocabulary about colour, not about any subject: it knows what "gold" can mean and nothing
 * about what is being painted.
 *
 * Two rules keep it honest:
 *   - a word that is not in the table has NO verdict (null), never "not equal";
 *   - the families a word may mean are deliberately a little generous ("gold" may be yellow or orange),
 *     so a true claim is not flagged, while "red" is never allowed to match a measured white.
 *
 * Pure: no imports, no I/O.
 */

export type ColourFamily =
  | 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'pink'
  | 'white' | 'black' | 'grey' | 'brown';

const WORDS: Readonly<Record<string, readonly ColourFamily[]>> = {
  red: ['red'], crimson: ['red'], scarlet: ['red'], maroon: ['red', 'brown'],
  orange: ['orange'],
  yellow: ['yellow'], gold: ['yellow', 'orange'], golden: ['yellow', 'orange'],
  green: ['green'], lime: ['green'],
  cyan: ['cyan', 'blue', 'green'], teal: ['cyan', 'green', 'blue'], turquoise: ['cyan', 'green', 'blue'], aqua: ['cyan', 'blue'],
  blue: ['blue'], navy: ['blue'],
  purple: ['purple'], violet: ['purple'], lavender: ['purple', 'pink'], magenta: ['pink', 'purple'],
  pink: ['pink'],
  white: ['white'], ivory: ['white'], cream: ['white', 'yellow'],
  black: ['black'],
  grey: ['grey'], gray: ['grey'], silver: ['grey', 'white'], charcoal: ['grey', 'black'], gunmetal: ['grey', 'black'],
  brown: ['brown'], tan: ['brown', 'orange', 'yellow'], beige: ['brown', 'white', 'yellow'],
  bronze: ['brown', 'orange'], copper: ['brown', 'orange'],
};

const MODIFIER = '(?:(?:light|dark|bright|pale|deep|vivid|neon|pastel|soft|hot|rich|dull|warm|cool)\\s+)?';
const WORD_ALTERNATION = Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|');

/** A fresh global regex each call (a shared /g regex keeps `lastIndex` between users). */
function colourWordRegex(): RegExp {
  return new RegExp(`\\b${MODIFIER}(?:${WORD_ALTERNATION})\\b`, 'gi');
}

/** Every colour word in `text`, modifier included, in reading order. */
export function colourWordsIn(text: string): { word: string; base: string; index: number }[] {
  const out: { word: string; base: string; index: number }[] = [];
  for (const m of text.matchAll(colourWordRegex())) {
    const word = m[0].toLowerCase();
    out.push({ word, base: word.split(/\s+/).pop()!, index: m.index ?? 0 });
  }
  return out;
}

/** The families a colour word may honestly mean, or null when the word is not a colour this table knows. */
export function familiesOfWord(word: string): ReadonlySet<ColourFamily> | null {
  const base = word.trim().toLowerCase().split(/\s+/).pop() ?? '';
  const row = Object.hasOwn(WORDS, base) ? WORDS[base] : undefined;
  return row ? new Set(row) : null;
}

/** Whether a claimed colour word names the measured family. Null when the word has no verdict. */
export function sameColour(word: string, family: ColourFamily): boolean | null {
  const families = familiesOfWord(word);
  return families ? families.has(family) : null;
}

/**
 * The family of a measured colour. Accepts 0..1 or 0..255 triples (Roblox's `Color3.v` is 0..1; a model
 * quoting a value back may write either). Null for anything that is not three finite numbers.
 */
export function familyOfRgb(rgb: unknown): ColourFamily | null {
  if (!Array.isArray(rgb) || rgb.length !== 3 || !rgb.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const scale = Math.max(...(rgb as number[])) > 1.0001 ? 255 : 1;
  const [r, g, b] = (rgb as number[]).map((n) => Math.min(1, Math.max(0, n / scale))) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max;
  const delta = max - min;
  const s = max === 0 ? 0 : delta / max;
  if (v < 0.15) return 'black';
  if (s < 0.12) return v >= 0.85 ? 'white' : 'grey';
  let h: number;
  if (delta === 0) h = 0;
  else if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);
  if (h < 0) h += 360;
  // Dark orange/yellow reads as brown, not as a darker orange.
  if (h >= 12 && h < 50 && v < 0.6) return 'brown';
  if (h < 12 || h >= 345) return s < 0.55 && v > 0.7 ? 'pink' : 'red';
  if (h < 40) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 200) return 'cyan';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

/** The family of a Roblox BrickColor name ("Bright red", "Medium stone grey"): its last colour word. */
export function familyOfLabel(label: string): ColourFamily | null {
  const words = colourWordsIn(label);
  const last = words[words.length - 1];
  if (!last) return null;
  const families = familiesOfWord(last.base);
  return families ? [...families][0]! : null;
}
