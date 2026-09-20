// What a Roblox interface is SHAPED like, served to the model at generation time.
//
// THE DEFECT THIS ANSWERS. `packages/corpus/data/ui-references/` is the only thing in this
// repository that records what a shipped Roblox UI actually looks like — stroke weights, how a
// banner overhangs its panel, how many tiles a grid runs, what replaces a price when an item is
// owned. Commit 7ba141e found that NOTHING READ IT: ui-kit.ts mentioned it twice, in comments.
//
// That was answered with a test contract, which holds the hand-written kit honest for the genres
// somebody hand-wrote. It does nothing for a genre nobody has hand-written, and it never reaches
// the model — so when a customer asks for a tower-defense shop, the model still invents one.
//
// This module is the other half: the same corpus, bundled into the Worker and reachable as a tool.
// The model asks "how is a shop built" and gets construction it can apply, instead of proceeding as
// though it knew.
//
// SAFETY, AND IT IS THE SAME BOUNDARY genre-reference-guide.ts KEEPS. The bundle is imported
// statically so esbuild embeds it: no runtime filesystem read, no network fetch, no execution of
// external page content. Nothing here is anybody's image, asset or Luau source — the library
// stores what was learned, and the `sources` strings say where it was seen so a claim stays
// checkable. See packages/corpus/data/ui-references/README.md.
import bundle from '../../../packages/corpus/data/ui-construction.json';

export interface UIConstructionEntry {
  genre: string;
  label: string;
  kind: 'genre' | 'screen';
  incomplete: boolean;
  referenceCount: number;
  demonstrates: string[];
  sources: string[];
  rules: Record<string, unknown>;
}

interface Bundle {
  schemaVersion: number;
  note: string;
  genres: UIConstructionEntry[];
  screens: UIConstructionEntry[];
}

const DATA = bundle as unknown as Bundle;

export const UI_CONSTRUCTION_GENRE_IDS: readonly string[] = DATA.genres.map((g) => g.genre);
export const UI_CONSTRUCTION_SCREEN_IDS: readonly string[] = DATA.screens.map((s) => s.genre);

/** Budgeted like the genre guide: enough to be usable, small enough not to crowd the step. */
export const UI_CONSTRUCTION_DEFAULT_CHARS = 2600;

const all = (): UIConstructionEntry[] => [...DATA.genres, ...DATA.screens];

/**
 * ONE CANONICAL SPELLING, APPLIED TO BOTH SIDES.
 *
 * THE DEFECT THIS REPLACES, measured against the Worker's own bundle on 2026-09-20. The previous
 * version normalised the CALLER's underscores into hyphens and left the STORED ids alone:
 *
 *   const want = id.trim().toLowerCase().replace(/[\s_]+/g, '-');   // caller only
 *
 * Four of the thirteen stored genre ids contain an underscore — `anime_battle`, `fps_arena`,
 * `pet_simulator`, `tower_defense`. For `tower_defense` the caller's string became "tower-defense",
 * the exact match against "tower_defense" failed, `screen-tower-defense` failed, and
 * `"tower_defense".includes("tower-defense")` failed. THE ROW'S OWN ID, PASSED VERBATIM, DID NOT
 * FIND THE ROW — and tools.ts builds this tool's description by interpolating that very list, so
 * the model was told the id and handed back the id and refused. `get_genre_kit` goes further and
 * constrains the same vocabulary with a JSON-schema enum, so a correctly-behaving model does
 * `get_genre_kit({genre:"tower_defense"})` → hit, `get_ui_construction({id:"tower_defense"})` →
 * "Nobody has inspected shipped Roblox UI for it". Three of the ten enum values failed that way.
 *
 * Normalising both sides is the whole fix. `_`, `-` and a space are the same character here.
 */
const canon = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');

/**
 * Spelling variants that are the same word. Deliberately three entries: the British `defence` was
 * measured missing after the underscore fix, and a list that grows past a handful becomes the
 * "confident wrong answer" this module exists to refuse.
 */
const VARIANTS: [RegExp, string][] = [
  [/defence/g, 'defense'],
  [/colour/g, 'color'],
  [/armour/g, 'armor'],
];
const canonVariant = (s: string) => VARIANTS.reduce((acc, [re, to]) => acc.replace(re, to), canon(s));

/** Every row under its canonical id, built once. */
const BY_CANON = (() => {
  const map = new Map<string, UIConstructionEntry>();
  for (const r of all()) map.set(canonVariant(r.genre), r);
  return map;
})();

export type UIConstructionMatch = 'exact' | 'screen' | 'token';

/**
 * Exact id first, then `screen-<id>`, then a match on a WHOLE hyphen-delimited token of a stored id.
 *
 * THE SECOND DEFECT, AND IT POINTED THE OTHER WAY. The previous fallback was
 * `rows.find(r => r.genre.toLowerCase().includes(want))` — unranked, and returning the FIRST row in
 * readdir order containing the string anywhere. Measured: `"sim"` returned `pet_simulator` rather
 * than `simulator`, `"er"` returned `tower_defense`, `"a"` returned `anime_battle`, `"in"` returned
 * `racing`. Every one of those answered `found: true` with sourced rules for a genre nobody asked
 * about, which breaks this module's stated contract — *a miss must SAY it is a miss* — in the
 * direction that does more damage, because the model cannot tell a confident wrong answer from a
 * right one.
 *
 * So the fallback now requires the caller's whole string to BE a token of the id ("tower",
 * "defense", "arena" reach their rows; "sim", "er" and "a" reach nothing), and where several rows
 * qualify it takes the shortest id and then alphabetical order, so the answer is deterministic
 * rather than a function of directory listing order. A multi-word id that is nobody's token — the
 * suite's `battle-royale-sushi-tycoon` — still misses, which is the behaviour the miss path exists
 * to produce.
 */
function find(id: string): { entry: UIConstructionEntry; how: UIConstructionMatch } | null {
  const want = canonVariant(id);
  if (!want) return null;

  const exact = BY_CANON.get(want);
  if (exact) return { entry: exact, how: 'exact' };

  const screen = BY_CANON.get(`screen-${want}`);
  if (screen) return { entry: screen, how: 'screen' };

  const byToken = all()
    .filter((r) => canonVariant(r.genre).split('-').includes(want))
    .sort((a, b) => a.genre.length - b.genre.length || a.genre.localeCompare(b.genre));
  const first = byToken[0];
  return first ? { entry: first, how: 'token' } : null;
}

function render(entry: UIConstructionEntry, maxChars: number): string {
  const lines: string[] = [];
  lines.push(`${entry.label} (${entry.kind}) — construction read off ${entry.referenceCount} shipped references.`);
  if (entry.incomplete) {
    lines.push('INCOMPLETE: fewer than five references were found for this one. Treat the rules as a starting point and say so if the customer asks where the look came from.');
  }
  lines.push('');
  lines.push('RULES (apply these literally):');
  for (const [k, v] of Object.entries(entry.rules)) {
    lines.push(`- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  if (entry.demonstrates.length) {
    lines.push('');
    lines.push('OBSERVED IN SHIPPED GAMES:');
    for (const d of entry.demonstrates) lines.push(`- ${d}`);
  }
  let text = lines.join('\n');
  if (text.length > maxChars) text = text.slice(0, maxChars - 1).replace(/\n[^\n]*$/, '') + '\n…';
  return text;
}

export interface UIConstructionAnswer {
  found: boolean;
  /** Present when found. */
  id?: string;
  kind?: 'genre' | 'screen';
  incomplete?: boolean;
  guide?: string;
  sources?: string[];
  /**
   * How the id was resolved, present only when it was NOT verbatim. A hit reached through a token
   * ("tower" -> tower_defense) is a real hit and a different thing from asking for the row by name,
   * and the model is entitled to know which it got.
   */
  resolvedFrom?: UIConstructionMatch;
  /** Present when NOT found — and it is a sentence, not an empty result. */
  notCovered?: string;
  available?: { genres: readonly string[]; screens: readonly string[] };
}

/**
 * A miss must SAY it is a miss.
 *
 * The genre guide's own comment records what the alternative costs: a lookup that answers nothing
 * for an unknown genre gives the model no signal that nobody ever looked at that kind of game, and
 * "what a model does with no signal is proceed as though it knew". So an unknown id comes back with
 * the fact that it is unknown and the list of what does exist.
 */
export function getUIConstruction(input: { id?: string; maxChars?: number }): UIConstructionAnswer {
  const maxChars = Number.isFinite(input.maxChars) ? Math.max(600, Math.min(3200, Number(input.maxChars))) : UI_CONSTRUCTION_DEFAULT_CHARS;
  const id = typeof input.id === 'string' ? input.id : '';
  const hit = id ? find(id) : null;
  if (!hit) {
    return {
      found: false,
      notCovered: id
        ? `No construction has been recorded for "${id}". Nobody has inspected shipped Roblox UI for it, so anything you build is your own judgement — say that to the customer rather than implying it came from a real game.`
        : 'Name a genre or a screen type.',
      available: { genres: UI_CONSTRUCTION_GENRE_IDS, screens: UI_CONSTRUCTION_SCREEN_IDS },
    };
  }
  const entry = hit.entry;
  return {
    found: true,
    id: entry.genre,
    kind: entry.kind,
    incomplete: entry.incomplete,
    guide: render(entry, maxChars),
    sources: entry.sources,
    ...(hit.how === 'exact' ? {} : { resolvedFrom: hit.how }),
  };
}
