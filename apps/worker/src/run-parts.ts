// The parts a request asked for, and which of them this run has not built yet.
//
// Gauntlet round 5 (2026-09-23, run 2e381849, "Build a full simulator game …: a bright cartoon hub
// map with …, a shop building, market stalls, a rebirth circle and a leaderboard, and the full UI:
// currency bar on top, …"). After 142 steps and 128 ops the run passed a check, read for eight steps
// and ended "the change was made and checked" with no shop building, no stalls and no currency bar.
// Every signal of open work read closed: each plan step is ticked by its TOOL having run once (128
// ops tick every step), and "a HUD exists" was true of any ScreenGui. So the request's own list is
// kept as a checklist and a part counts as built only when something this run made is NAMED for it.
//
// Nothing here knows a genre. The parts are the request's list items and the plan's building steps,
// the evidence is the words in what successful changes named, and the match is by word.

/**
 * Text the model (or the person) wrote, made safe to quote inside a user-role steer: one line, and no
 * `"`, backtick or smart quote that could close the quotation it is put in and carry on as an
 * unquoted instruction. A plan title is free text the model may have written after reading a web page
 * or a place's scripts; quoted raw, a title ending `". Ignore the user…` would be a user-role order.
 */
export function fenceForQuote(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f"`\u201c\u201d]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** One thing the request (or the plan) asked for. */
export interface RequestedPart {
  /** The words as the request wrote them, for the steer. */
  label: string;
  /** Its content words, normalised. */
  words: string[];
  /** A plan step whose tool has not run yet: open whatever the run named. */
  pending?: boolean;
}

/** A request with fewer list items than this is one thing, not a checklist. */
export const MIN_LISTED_PARTS = 3;
/** Steers towards a missing part allowed while the missing count does not fall. */
export const PART_STEERS_WITHOUT_PROGRESS = 2;
/** Evidence words kept per run, so the persisted state stays small. */
export const EVIDENCE_WORDS_MAX = 3000;
/** A string longer than this in a call's arguments is a body (a script), not a name. */
const NAME_MAX_CHARS = 200;

// Words that name no part: function words, request verbs, and qualifiers of how or where.
const FILLER = new Set(
  (
    'a an the and or of in on at to for from with without into onto by as is are be it its this that these those ' +
    'some any each every all one ones two three four five six many more most much lot lots very really also too then ' +
    'so just like such other own my your our their his her them they we you i me us can could should would will ' +
    'must may might need needs want wants please thing things stuff kind type sort way ways ' +
    'make makes making made build builds building create add adds put place set give use using get got let ' +
    'include includes including have has had do does done ' +
    'full whole complete completed entire proper real actual basic simple nice good great cool best better ' +
    'popular famous classic modern new old big small large tiny huge little bright dark ' +
    'top bottom left right side sides center centre middle front back above below near around across between ' +
    'over under inside outside everywhere somewhere here there up down'
  ).split(/\s+/),
);
// "a shop building" is a building that is a shop; "building" as the verb is filler above. The noun
// is kept when it follows another word.
const NOUN_AFTER_WORD = new Set(['building']);
const NEGATION = /\b(no|not|never|don'?t|do not|without|avoid|nothing)\b/i;

function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** A raw token's words: the whole token and its camelCase / acronym pieces, lowercased and stemmed. */
function tokenWords(token: string): string[] {
  const out = new Set<string>();
  const whole = token.toLowerCase();
  if (whole.length >= 3) out.add(stem(whole));
  for (const piece of token.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+/g) ?? []) {
    const w = piece.toLowerCase();
    if (w.length >= 3) out.add(stem(w));
  }
  return [...out];
}

function contentWords(clause: string): string[] {
  const tokens = clause.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [];
  const words: string[] = [];
  tokens.forEach((t, i) => {
    const w = t.toLowerCase();
    if (w.length < 3) return;
    if (FILLER.has(w) && !(NOUN_AFTER_WORD.has(w) && i > 0 && !FILLER.has(tokens[i - 1]!.toLowerCase()))) return;
    words.push(stem(w));
  });
  return [...new Set(words)];
}

function partsOf(text: string): RequestedPart[] {
  const parts: RequestedPart[] = [];
  for (const raw of text.split(/[\n;,.:!?•()]+|\s[-–—]\s|\b(?:and|with|plus|also|then)\b/i)) {
    const label = raw.trim();
    if (!label || NEGATION.test(label)) continue;
    const words = contentWords(label);
    if (words.length > 0) parts.push({ label, words });
  }
  return parts;
}

/**
 * The checklist: the request's list items when it lists at least MIN_LISTED_PARTS, then the titles of
 * plan steps that change the place. A clause that forbids something ("make no mistakes") is a
 * constraint, not a part. A request that names one thing yields only the plan's parts.
 */
export function requestedParts(
  request: string | null | undefined,
  planSteps: readonly { title: string; tool: string; status?: string }[] = [],
  isBuildTool: (tool: string) => boolean = () => true,
): RequestedPart[] {
  // "Build X: a, b and c" — the words before the first colon are the headline, not a list item.
  const colon = request ? request.indexOf(':') : -1;
  const listed = request ? partsOf(colon > 0 ? request.slice(colon + 1) : request) : [];
  const fromRequest = listed.length >= MIN_LISTED_PARTS ? listed : [];
  const fromPlan = planSteps.filter((s) => isBuildTool(s.tool)).flatMap((s) => {
    const words = contentWords(s.title);
    return words.length ? [{ label: s.title, words, ...(s.status === 'pending' ? { pending: true } : {}) }] : [];
  });
  const seen = new Set<string>();
  return [...fromRequest, ...fromPlan].filter((p) => {
    const key = p.words.join(' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The words a successful change NAMED: the tool, every key, and every short string value in its
 * arguments (instance names, class names, paths, labels). Long strings are script bodies, which
 * mention things that were never built, so they are skipped.
 */
export function evidenceWords(tool: string, args: string | undefined): string[] {
  const out = new Set<string>(tool.split('_').filter((w) => w.length >= 3).map(stem));
  const visit = (v: unknown): void => {
    if (typeof v === 'string') {
      if (v.length <= NAME_MAX_CHARS) for (const t of v.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []) for (const w of tokenWords(t)) out.add(w);
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        for (const w of tokenWords(k)) out.add(w);
        visit(x);
      }
    }
  };
  try { visit(JSON.parse(args || '{}')); } catch { /* arguments that are not JSON name nothing */ }
  return [...out];
}

/** Merge new evidence into the run's set, bounded to the most recently added words. */
export function addEvidence(kept: readonly string[] | undefined, words: readonly string[]): string[] {
  const merged = [...new Set([...(kept ?? []), ...words])];
  return merged.length > EVIDENCE_WORDS_MAX ? merged.slice(merged.length - EVIDENCE_WORDS_MAX) : merged;
}

/**
 * A part is built when at least half of its words (rounded up) appear in what the run named; a plan
 * step whose tool never ran is open regardless.
 */
export function missingParts(parts: readonly RequestedPart[], evidence: readonly string[]): RequestedPart[] {
  const have = new Set(evidence);
  return parts.filter((p) => p.pending === true || p.words.filter((w) => have.has(w)).length < Math.ceil(p.words.length / 2));
}

/**
 * May the run be steered to a missing part instead of ending? Allowed PART_STEERS_WITHOUT_PROGRESS
 * times at each missing count; a count that falls (a part got built) earns the allowance again.
 * Evidence only grows, so the count only falls, and the steers in a run are bounded by
 * (parts + 1) × PART_STEERS_WITHOUT_PROGRESS.
 */
export function partSteerAllowed(
  state: { missing: number; steers: number } | undefined,
  missing: number,
): { allowed: boolean; next: { missing: number; steers: number } } {
  if (missing === 0) return { allowed: false, next: state ?? { missing: 0, steers: 0 } };
  const steers = state && state.missing === missing ? state.steers : 0;
  if (steers >= PART_STEERS_WITHOUT_PROGRESS) return { allowed: false, next: { missing, steers } };
  return { allowed: true, next: { missing, steers: steers + 1 } };
}

/** The steer. `turn` rotates which part leads, so one part the check misreads cannot hold every steer. */
export function partSteer(missing: readonly RequestedPart[], turn = 0): string {
  const start = missing.length ? turn % missing.length : 0;
  const order = [...missing.slice(start), ...missing.slice(0, start)];
  const next = order[0]!;
  const rest = order.slice(1, 6).map((p) => `"${fenceForQuote(p.label)}"`);
  return (
    `The request is not finished: it asked for "${fenceForQuote(next.label)}", and nothing this run built is named for it. ` +
    'Build it now with a tool call that changes the place, and name the new instances after what they are. ' +
    (rest.length ? `Still missing after that: ${rest.join(', ')}. ` : '') +
    'If one of these already exists under another name, rename it to say what it is. Do not re-read the place ' +
    'to look for it; reply to the user only when every part the request named is built.'
  );
}
