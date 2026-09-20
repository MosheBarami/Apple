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

/** Exact id first, then a contains-match, so "shop" finds "screen-shop" without guessing wildly. */
function find(id: string): UIConstructionEntry | null {
  const want = id.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!want) return null;
  const rows = all();
  return rows.find((r) => r.genre.toLowerCase() === want)
    ?? rows.find((r) => r.genre.toLowerCase() === `screen-${want}`)
    ?? rows.find((r) => r.genre.toLowerCase().includes(want))
    ?? null;
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
  const entry = id ? find(id) : null;
  if (!entry) {
    return {
      found: false,
      notCovered: id
        ? `No construction has been recorded for "${id}". Nobody has inspected shipped Roblox UI for it, so anything you build is your own judgement — say that to the customer rather than implying it came from a real game.`
        : 'Name a genre or a screen type.',
      available: { genres: UI_CONSTRUCTION_GENRE_IDS, screens: UI_CONSTRUCTION_SCREEN_IDS },
    };
  }
  return {
    found: true,
    id: entry.genre,
    kind: entry.kind,
    incomplete: entry.incomplete,
    guide: render(entry, maxChars),
    sources: entry.sources,
  };
}
