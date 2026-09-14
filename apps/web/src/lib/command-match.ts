// Ranking commands against what someone typed.
//
// No imports on purpose: this is the part that decides whether the palette feels good, so it is
// the part that has to be testable without a browser.
//
// The rule behind every weight below: what the user typed is almost always a PREFIX of what they
// mean. Someone typing "co" wants "Connect Studio", not "Export conversation" — even though
// "conversation" contains "co" earlier in the word and is the longer, more "relevant-looking"
// match. Scoring that gets this backwards produces a palette where the right answer is third, and
// a palette where the right answer is third is a palette nobody uses twice.

export interface Command {
  id: string;
  title: string;
  /** Where it appears when nothing is typed. */
  section: string;
  /** Words worth matching that are not in the title — synonyms, the thing users actually call it. */
  keywords?: string[];
  /** Shown on the right. Display only; the real binding lives with the shortcut map. */
  hint?: string;
  /** Absent means available. Present and false means listed but not runnable, with `why` shown. */
  enabled?: boolean;
  why?: string;
  run: () => void;
}

export interface Scored {
  command: Command;
  score: number;
  /** Indices into `title` that matched, for highlighting. Empty when the match came from keywords. */
  hits: number[];
}

/**
 * Score one command against a query.
 *
 * Returns -1 for no match. Higher is better. The tiers are deliberately far apart so that a weak
 * match in a strong tier always beats a strong match in a weak one — the alternative is a palette
 * whose ordering shifts unpredictably as you type one more character.
 */
export function scoreCommand(command: Command, query: string): Scored | null {
  const q = query.trim().toLowerCase();
  if (!q) return { command, score: 0, hits: [] };

  const title = command.title.toLowerCase();

  // 1. Whole-title prefix. "conn" -> "Connect Studio". Nothing should outrank this.
  if (title.startsWith(q)) {
    return { command, score: 10_000 - title.length, hits: range(0, q.length) };
  }

  // 2. Prefix of any word in the title. "stu" -> "Connect Studio". This is what makes multi-word
  //    commands findable by their distinctive word rather than their first one.
  const wordHit = wordPrefix(title, q);
  if (wordHit >= 0) {
    return { command, score: 8_000 - wordHit - title.length, hits: range(wordHit, wordHit + q.length) };
  }

  // 3. Initials. "cs" -> "Connect Studio", "np" -> "New project". Cheap to type and unambiguous
  //    often enough to be worth supporting.
  const initials = initialsHit(title, q);
  if (initials) {
    return { command, score: 6_000 - title.length, hits: initials };
  }

  // 4. Keyword prefix. The synonym the user actually reached for — "rename" finding "Project
  //    settings", "logout" finding "Sign out". Below title matches because the word is not on
  //    screen: a result whose match is invisible looks like a mistake.
  for (const [i, keyword] of (command.keywords ?? []).entries()) {
    const k = keyword.toLowerCase();
    if (k.startsWith(q)) return { command, score: 4_000 - i - k.length, hits: [] };
  }

  // 5. Substring anywhere in the title. The fallback, and the reason it is last: "co" matching the
  //    middle of "conversation" is a real match but never what someone meant by two letters.
  const at = title.indexOf(q);
  if (at >= 0) return { command, score: 2_000 - at - title.length, hits: range(at, at + q.length) };

  // 6. Substring in a keyword. Last because both the word and the position are invisible.
  if ((command.keywords ?? []).some((k) => k.toLowerCase().includes(q))) {
    return { command, score: 1_000, hits: [] };
  }

  return null;
}

/** What separates one word from the next: "Sign-out" and "Export (JSON)" both have a second
 *  word someone will type. */
const SEPARATOR = /[\s\-/_(]/;

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

/** Index of the start of a word in `title` that begins with `q`, or -1. */
function wordPrefix(title: string, q: string): number {
  let i = 0;
  while (i < title.length) {
    // A word starts at 0 or after a separator. Hyphens and slashes count: "Sign-out" and
    // "Studio/place" both have a second word people will type.
    if (i === 0 || SEPARATOR.test(title.charAt(i - 1))) {
      if (title.startsWith(q, i)) return i;
    }
    i += 1;
  }
  return -1;
}

/** Indices of the matched initials, or null. "cs" over "connect studio" -> [0, 8]. */
function initialsHit(title: string, q: string): number[] | null {
  if (q.length < 2) return null;
  const starts: number[] = [];
  for (let i = 0; i < title.length; i += 1) {
    if ((i === 0 || SEPARATOR.test(title.charAt(i - 1))) && /[a-z0-9]/.test(title.charAt(i))) starts.push(i);
  }
  if (starts.length < q.length) return null;
  // Initials must match from the FIRST word. "ps" should not find "Connect Project Studio" by
  // skipping the start — that is a substring match wearing a disguise.
  for (let i = 0; i < q.length; i += 1) {
    if (title.charAt(starts[i] ?? -1) !== q.charAt(i)) return null;
  }
  return starts.slice(0, q.length);
}

/**
 * Rank the whole set.
 *
 * Unavailable commands are kept rather than hidden, but sorted below everything runnable: a
 * command that vanishes when it cannot run teaches the user it does not exist, while one that is
 * visible and says why teaches them what to do. With no query they keep their registration order
 * so the palette opens as a stable menu rather than a reshuffled list.
 */
export function rankCommands(commands: Command[], query: string): Scored[] {
  const scored: Scored[] = [];
  for (const command of commands) {
    const hit = scoreCommand(command, query);
    if (hit) scored.push(hit);
  }
  const runnable = (s: Scored) => s.command.enabled !== false;
  return scored.sort((a, b) => {
    if (runnable(a) !== runnable(b)) return runnable(a) ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return 0;
  });
}

/** Group into sections, preserving rank order within each and first-appearance order between. */
export function groupBySection(scored: Scored[]): { section: string; items: Scored[] }[] {
  const out: { section: string; items: Scored[] }[] = [];
  for (const s of scored) {
    const existing = out.find((g) => g.section === s.command.section);
    if (existing) existing.items.push(s);
    else out.push({ section: s.command.section, items: [s] });
  }
  return out;
}

/**
 * One title, one row.
 *
 * The shell contributes "New project" on every route — it navigates to the dashboard, where you can
 * make one — and the dashboard contributes its own, which opens the create form directly. On the
 * dashboard both are live, and the palette listed the same words twice: the user has to guess which
 * one they want, and whichever they pick teaches them nothing about the other.
 *
 * The LAST registration wins. Contributors register in mount order and a route mounts inside the
 * shell, so the later one is the more specific: the command that does the thing rather than taking
 * you somewhere you can do it. The winner keeps the loser's POSITION, so the list does not reorder
 * itself as the user moves between routes.
 */
export function dedupeByTitle(commands: Command[]): Command[] {
  const at = new Map<string, number>();
  const out: Command[] = [];
  for (const c of commands) {
    const seen = at.get(c.title);
    if (seen === undefined) {
      at.set(c.title, out.length);
      out.push(c);
    } else {
      out[seen] = c;
    }
  }
  return out;
}
