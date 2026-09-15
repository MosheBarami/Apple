/**
 * THE INTENT AND PLAN ROWS OF THE THINKING CARD.
 *
 * The card has four stages. Actions and Validation were already backed by real events — a tool
 * start/end pair, and the composition/semantic gate's actual verdict. Intent and Plan were not
 * backed by anything, so the frontend rendered nothing rather than inventing them.
 *
 * This closes that gap AT ZERO MODEL COST. `intentCheck` in semantic.ts is regex and lexicons:
 * the file has no imports at all and no reference to fetch, the gateway or env, so there is no
 * path from here to a paid provider. It runs in well under a millisecond on an 8,000-character
 * request, which is why it can be on the critical path of every single run.
 *
 * It lives in its own file rather than inside session.ts because it is pure — a request in, a
 * RunIntent out, no storage, no sockets, no env — and a pure function buried in a Durable Object
 * is a pure function nothing tests. run-intent.test.mjs imports it directly.
 *
 * THE HONESTY RULES, which are the whole point:
 *
 *   summary     The user's OWN OPENING SENTENCE, whitespace-normalised and truncated. Not a
 *               paraphrase — paraphrasing needs a model, and this must stay free. Not a synthesised
 *               sentence either: without a model, any synthesis is a fill-in-the-blanks template
 *               ("Build a <noun> with <n> features"), which reads like understanding while proving
 *               none. Echoing the request verbatim is the only restatement that cannot be wrong,
 *               and it is exactly what the reference card shows.
 *   checklist   EXACTLY what the extractor found the user asked for by name, and nothing else. An
 *               empty checklist is the correct answer for "what does this script do?" — there is
 *               no list of things to build, so no list is shown.
 *   questions   ONLY the places the extractor could see the request genuinely did not settle
 *               (a hedged clause, a building noun that reads as either a room or a facade). Never
 *               padded to look thorough.
 *   assumptions ONLY the soft constraints the extractor actually INFERRED — a mood read off
 *               "cozy", a focal point nobody named outright. See `runIntentFor` for why this is a
 *               different list from `questions` and why both are needed.
 *
 * Every list is capped. A cap TRUNCATES a real list to bound the socket payload; nothing here
 * ever pads a short one.
 */
import { intentCheck } from './semantic';
import type { RunIntent } from '@golem/shared';

const MAX_INTENT_CHECKLIST = 16;
const MAX_INTENT_QUESTIONS = 6;
const MAX_INTENT_ASSUMPTIONS = 6;
const MAX_INTENT_SUMMARY = 160;

/** Split on sentence punctuation without lookbehind, keeping the terminator. */
function sentences(flat: string): string[] {
  const out: string[] = [];
  const re = /[.!?]+(?:\s|$)/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) {
    out.push(flat.slice(start, m.index + m[0].trimEnd().length).trim());
    start = re.lastIndex;
  }
  if (start < flat.length) out.push(flat.slice(start).trim());
  return out.filter(Boolean);
}

/**
 * The one-line restatement: the user's own words, normalised and cut at a word boundary.
 *
 * Prefers the first sentence that carries at least three words, so an opening "Hey!" or "Ok."
 * does not become the whole Intent row. Returns '' when the request has no words at all, and the
 * caller then emits nothing rather than an empty row.
 */
export function restate(request: string): string {
  const flat = request.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const parts = sentences(flat);
  const pick = parts.find((s) => s.split(' ').length >= 3) ?? parts[0] ?? flat;
  if (pick.length <= MAX_INTENT_SUMMARY) return pick;
  const cut = pick.slice(0, MAX_INTENT_SUMMARY);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

/**
 * What the agent understood, derived from the request alone. Null only when there is genuinely
 * nothing to say — an empty request produces no Intent row rather than a blank one.
 */
export function runIntentFor(request: string): RunIntent | null {
  const report = intentCheck(request);
  const summary = restate(request);
  const checklist = report.checklist.slice(0, MAX_INTENT_CHECKLIST);
  const questions = report.questions.slice(0, MAX_INTENT_QUESTIONS);
  //[[ WHAT APPLE DECIDED FOR ITSELF, which is not the same list as what it left open.
  //
  //   `report.notes` is the extractor's record of every SOFT constraint — a mood read off
  //   "cozy", a focal point nobody named outright, an exclusion it chose to read as "restrained"
  //   rather than "absent". Those inferences steer the build, and this function used to compute
  //   them and drop them on the floor: `questions` reached the user, `notes` did not.
  //
  //   The result was a run surface that told the user about the choices Apple DECLINED to make
  //   while hiding the ones it made — the same product whose roadmap surface prints its own
  //   honesty notes under "Reads as <genre>". Passed through verbatim rather than re-worded,
  //   because a second copy of semantic.ts's vocabulary is a second copy free to drift from it.
  //
  //   Not merged into `questions`. The two say opposite things and the labels above them say so:
  //   a question is still open, an assumption has already been acted on. ]]
  const assumptions = report.notes.slice(0, MAX_INTENT_ASSUMPTIONS);
  if (!summary && !checklist.length && !questions.length && !assumptions.length) return null;
  return { summary, checklist, questions, assumptions };
}
