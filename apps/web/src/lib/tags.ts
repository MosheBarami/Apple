// What counts as a tag. No imports, on purpose — same reason as rename-rules.ts: this is the part
// worth testing directly, and a module that reaches for React Query or the Supabase client cannot
// be loaded by `node --test`.
//
// THE WHOLE PROBLEM IS SPELLING. "Client", "client " and "CLIENT" are one tag to the person typing
// them and three rows to Postgres, and a filter chip row rendered from three spellings of one tag
// is worse than having no chips: every chip finds a third of what the user meant, and nothing on
// screen explains why. So every write goes through `normaliseTag`, and every comparison — adding,
// removing, membership — compares normalised forms rather than raw ones.

/** Longest a single tag may be. Short enough that a chip never wraps a card. */
export const TAG_MAX_LEN = 24;

/** How many tags one project may carry. */
export const TAGS_MAX = 6;

/**
 * The canonical form of a tag, or '' if the input cannot be one.
 *
 * Lowercased and whitespace-collapsed so one tag has one spelling. Commas become spaces rather
 * than being refused: a comma is what people type BETWEEN tags, and a tag containing one renders
 * as two everywhere it is drawn while behaving as one everywhere it is compared.
 *
 * Over-long is REFUSED, not truncated. Truncation stores a tag the user never typed, and two
 * different long tags can truncate to the same one — quietly merging two groups of projects.
 */
export function normaliseTag(raw: string): string {
  const cleaned = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!cleaned) return '';
  if (cleaned.length > TAG_MAX_LEN) return '';
  return cleaned;
}

/**
 * The list with `raw` added, or the list unchanged.
 *
 * Unchanged covers three cases that all have the same right answer — an unusable tag, one already
 * present in any spelling, and a full list. In particular the cap REFUSES rather than evicting the
 * oldest: silently dropping a tag the user set earlier is a worse surprise than a tag that did not
 * appear, because nothing on screen marks the loss.
 *
 * Insertion order is preserved. Sorting here would move a chip out from under the cursor between
 * one render and the next.
 */
export function addTag(tags: string[], raw: string): string[] {
  const tag = normaliseTag(raw);
  if (!tag) return tags;
  if (tags.some((t) => normaliseTag(t) === tag)) return tags;
  if (tags.length >= TAGS_MAX) return tags;
  return [...tags, tag];
}

/** The list without `raw`, compared in canonical form so a differently-typed spelling still hits. */
export function removeTag(tags: string[], raw: string): string[] {
  const tag = normaliseTag(raw);
  if (!tag) return tags;
  return tags.filter((t) => normaliseTag(t) !== tag);
}

/**
 * Every tag in use across a set of projects, once each, sorted.
 *
 * Sorted HERE and not in `addTag`: this list is chrome the user scans, and alphabetical is the
 * only order that makes a chip findable. The per-project list is the user's own arrangement.
 *
 * Defensive about the shape because it has to be: the column is `not null default '{}'`, but a row
 * fetched before the migration lands, or by an older build whose PROJECT_COLUMNS did not name it,
 * arrives with the field absent. A chip row that throws takes the whole dashboard down with it.
 */
export function tagUniverse(rows: { tags?: unknown }[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!Array.isArray(row.tags)) continue;
    for (const t of row.tags) {
      if (typeof t !== 'string') continue;
      const tag = normaliseTag(t);
      if (tag) seen.add(tag);
    }
  }
  return [...seen].sort();
}
