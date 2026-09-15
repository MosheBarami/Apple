// Naming one of the project's own files from the message box.
//
// Apple has been writing files into the project workspace since the web tools shipped — notes,
// plans, generated CSVs, design briefs — and `workspace_read` lets the agent open any of them by
// path. The person typing had no way to say WHICH. They could open the Files drawer, read a path
// off it, close the drawer and type it out from memory into a box that had by then lost their
// place; or they could describe the file and hope the agent went looking.
//
// The shape is the Studio-selection chip's, which has inserted a backticked instance path at the
// caret since it shipped: a reference the person chooses, rendered as something the agent can act
// on. The same `insertAtCursor` does the insertion, so spacing and caret behave identically.
//
// Pure and DOM-free so `tests/mentions.test.mjs` can drive every rule below under `node --test`.
// The rules:
//
//   AN EMAIL ADDRESS IS NOT A MENTION. The `@` opens a picker only at a word boundary, or everyone
//   who types their own address gets one over the middle of it.
//
//   A MENTION IS READ AT THE CARET. Somebody who typed a mention, moved back, and is now editing
//   the first word of the sentence is not mentioning anything — and a picker over their caret
//   swallows the next Enter.
//
//   NOTHING IS OFFERED THAT DOES NOT EXIST. The candidates are the project's own file listing. A
//   picker that accepted free text would insert a path `workspace_read` then fails to open, and
//   the agent would report a missing file the person believes they chose.
import { insertAtCursor, type Insertion } from './selection-reference.ts';

/**
 * How long a mention query may get before it stops being one.
 *
 * Past a filename's length the person is writing prose with an `@` in it, and a picker that stays
 * open across a paragraph is a picker that eats the send key.
 */
export const MENTION_MAX_QUERY = 64;

/** How many files the picker shows at once. Past this it stops being a list and becomes a wall. */
export const MENTION_MAX_RESULTS = 8;

export interface MentionToken {
  /** Index of the `@` itself. */
  at: number;
  /** What has been typed after it, which may be empty for a bare `@`. */
  query: string;
}

/** Whitespace, or the start of the box. The boundary that separates a mention from an address. */
function boundaryBefore(text: string, at: number): boolean {
  if (at === 0) return true;
  return /\s/.test(text.charAt(at - 1));
}

/**
 * The mention being typed at `caret`, or null.
 *
 * Scans BACKWARDS from the caret, which is the only way to get this right: the token being typed
 * is the one the caret is inside, and reading forwards from the first `@` in the box answers a
 * question about some earlier sentence.
 */
export function mentionQuery(text: string, caret: number): MentionToken | null {
  const to = Math.max(0, Math.min(caret, text.length));
  let i = to;
  while (i > 0) {
    const ch = text.charAt(i - 1);
    if (/\s/.test(ch)) return null; // the token ended before we found an @
    if (ch === '@') {
      const at = i - 1;
      if (!boundaryBefore(text, at)) return null;
      const query = text.slice(i, to);
      // A second @ inside the token means this is not a filename being typed.
      if (query.includes('@') || query.includes('`')) return null;
      if (query.length > MENTION_MAX_QUERY) return null;
      return { at, query };
    }
    i -= 1;
    if (to - i > MENTION_MAX_QUERY + 1) return null;
  }
  return null;
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * The files worth offering for `query`, best first.
 *
 * Three tiers, and the order is the whole point: somebody typing "plan" means the file CALLED
 * plan, not the first file that happens to sit in a folder with those letters in it.
 *
 * A query that matches nothing returns nothing. Falling back to the whole list is how a picker
 * comes to insert a file the person never looked at.
 */
export function matchMentions(paths: readonly string[], query: string, limit = MENTION_MAX_RESULTS): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return paths.slice(0, limit);

  const tiered: { path: string; tier: number }[] = [];
  for (const path of paths) {
    const base = basename(path).toLowerCase();
    const full = path.toLowerCase();
    const tier = base.startsWith(q) ? 0 : base.includes(q) ? 1 : full.includes(q) ? 2 : -1;
    if (tier >= 0) tiered.push({ path, tier });
  }
  // Stable within a tier: `sort` is stable in every engine this ships to, so equal tiers keep the
  // listing's own order rather than an arbitrary one that changes between renders.
  tiered.sort((a, b) => a.tier - b.tier);
  return tiered.slice(0, limit).map((t) => t.path);
}

/**
 * Replace the typed token with the chosen path, backticked.
 *
 * The backticks are what let the path survive markdown rendering in the transcript with its dots
 * and slashes intact — the same reason `selectionReference` uses them for instance paths.
 *
 * REPLACING the token rather than appending after it is the half that is easy to get wrong and
 * invisible until somebody reads the message they sent: `look at @pla `notes/plan.md`` reads as a
 * bug in the product rather than a typo.
 */
export function applyMention(text: string, token: MentionToken | null, path: string): Insertion {
  if (!token || !path) return { text, caret: text.length };
  const stripped = text.slice(0, token.at) + text.slice(token.at + 1 + token.query.length);
  return insertAtCursor(stripped, '`' + path + '`', token.at, token.at);
}
