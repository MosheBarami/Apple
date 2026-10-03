/**
 * THE CLAIM AUDIT — a reply's concrete claims, checked against what the run observed.
 *
 * WHAT HAPPENED. In the owner's benchmark of 2026-10-02 the agent called hidden joke text visible and
 * called white paint red. Both were claims about something it had not checked, and one of them was
 * contradicted by evidence the run itself held. Nothing compared the reply with that evidence.
 *
 * WHAT THIS DOES. It reads the final reply, picks out the CONCRETE claims in it — a colour, text the
 * player reads, a count, a behaviour — and checks each against the evidence ledger (evidence-ledger.ts).
 * Every claim ends in one of three verdicts and they are never blurred:
 *
 *   supported     something this run set, read back, looked at or played says so
 *   contradicted  something this run observed says otherwise. The strongest finding there is.
 *   unsupported   nothing this run observed says either way. NOT the same as wrong, and never reported
 *                 as wrong: it is reported as "not checked".
 *
 * WHAT IT DOES NOT DO. It never rewrites the agent's words and never decides what looks good. A claim the
 * agent could settle with a tool it was offered goes back to the agent (`steerForFindings`); what is still
 * unsettled when the run ends is said to the user in one plain line (`notCheckedLine`) appended after the
 * agent's own reply.
 *
 * NOTHING HERE KNOWS A SUBJECT. The vocabulary is about colours, quotation, counting and verbs of
 * behaviour — never about doors or chests or any thing a request could be about. A claim is tied to the
 * evidence by the words it shares with an instance's name and path, so the audit works on anything.
 *
 * LIMITS, SAID PLAINLY. Extraction is deterministic and conservative: it will miss claims phrased in ways
 * it does not read (the optional judge, claim-audit-judge.ts, reads those), and a behaviour can only be
 * supported by a player check that exercised an interaction — until play_check can click things in the
 * world (M2), a behaviour claim about the world stays "not checked", which is true.
 */
import { colourWordsIn, familiesOfWord, sameColour } from './colour-family.ts';
import type { EvidenceLedger, ColourFact } from './evidence-ledger.ts';

export type ClaimKind = 'colour' | 'text' | 'count' | 'behaviour' | 'other';
export type Verdict = 'supported' | 'contradicted' | 'unsupported';
export type Need = 'read' | 'play' | 'look' | 'none';

export interface Claim {
  kind: ClaimKind;
  /** The clause the claim was made in, trimmed. Shown to the agent; never rewritten. */
  sentence: string;
  subject?: string;
  colour?: string;
  text?: string;
  count?: number;
  noun?: string;
  /** For text: the claim is that the PLAYER SEES it, not merely that a label holds it. */
  visible?: boolean;
  /** For behaviour: what kind of thing was claimed. */
  trigger?: 'click' | 'touch' | 'none';
}

export interface Finding {
  claim: Claim;
  verdict: Verdict;
  /** Plain statement of the evidence, for the agent. */
  because: string;
  /** What would settle an unsupported claim. `none`: nothing the agent can still do. */
  needs: Need;
}

export interface AuditResult {
  claims: Claim[];
  findings: Finding[];
  supported: Finding[];
  contradicted: Finding[];
  unsupported: Finding[];
}

export interface Offered { read: boolean; play: boolean; look: boolean }

// ------------------------------------------------------------------------------ reading words ---

const STOP = new Set([
  'the', 'a', 'an', 'its', 'your', 'their', 'our', 'his', 'her', 'my', 'this', 'that', 'these', 'those', 'it', 'they', 'them', 'there', 'here',
  'and', 'or', 'but', 'with', 'without', 'on', 'in', 'at', 'by', 'for', 'to', 'of', 'from', 'into', 'onto', 'over', 'under', 'near', 'next',
  'is', 'are', 'was', 'were', 'be', 'been', 'now', 'also', 'still', 'then', 'so', 'too', 'very', 'all', 'every', 'each', 'some', 'any',
  'everything', 'something', 'anything', 'nothing', 'everyone', 'someone', 'whatever', 'i', 'you', 'we', 'one', 'new', 'more', 'extra', 'little', 'small', 'big', 'large', 'tiny', 'huge', 'few', 'many', 'other', 'same',
]);

function singular(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && /(ches|shes|xes|sses|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}

/** The words a phrase is about: no determiners, pronouns or colours, singular, at least three letters. */
function subjectTokens(phrase: string | undefined): string[] {
  if (!phrase) return [];
  const colours = new Set(colourWordsIn(phrase).flatMap((m) => m.word.split(/\s+/)));
  return (phrase.toLowerCase().match(/[a-z]+/g) ?? [])
    .filter((w) => !STOP.has(w) && !colours.has(w))
    .map(singular)
    .filter((w) => w.length >= 3);
}

/** The words an instance path or name is made of, split on camelCase and separators, singular, lower case. */
function pathTokens(...parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) for (const m of part.matchAll(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+/g)) out.push(singular(m[0].toLowerCase()));
  return out.filter((w) => w.length >= 3);
}

function tokensMatch(subject: string[], fact: string[]): boolean {
  return subject.some((a) => fact.some((b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)))));
}

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50,
};
/** Measurements and durations: numbers followed by these are not counts of things in the place. */
const UNIT_NOUNS = new Set([
  'second', 'minute', 'hour', 'day', 'week', 'stud', 'point', 'credit', 'step', 'time', 'level', 'percent', 'degree', 'way', 'thing',
  'line', 'word', 'letter', 'option', 'idea', 'reason', 'tip', 'frame', 'tick', 'round', 'turn', 'try', 'attempt',
]);

// ------------------------------------------------------------------------------ extraction ---

const QUOTE = /["“”„]([^"“”„\n]{1,80})["“”]/g;
const MASK = ['.', '!', '?', ',', ';'];
const MASKED = ['\u0001', '\u0002', '\u0003', '\u0004', '\u0005'];

/** Punctuation inside a quotation must not end a sentence or a clause. */
function maskQuotes(text: string): string {
  return text.replace(/["“”„][^"“”„\n]{0,200}["“”]/g, (q) => q.replace(/[.!?,;]/g, (c) => MASKED[MASK.indexOf(c)]!));
}
function unmask(text: string): string {
  return text.replace(/[\u0001-\u0005]/g, (c) => MASK[MASKED.indexOf(c)]!);
}

const CLAUSE_MAX_CHARS = 600;
/** More colour words than this in one clause is a list, not claims about things. */
const COLOURS_PER_CLAUSE = 8;

const NEGATION = /\b(?:not|never|no longer|cannot|can't|couldn't|could not|didn't|did not|isn't|aren't|wasn't|weren't|won't|unable|failed|without|yet to|hasn't|haven't)\b|n't\b/i;
const OFFER = /^(?:and |so |but |then )?(?:want me to|would you like|should i|do you want|if you(?:'d| would)? (?:like|want)|i can |i could |i'd |let me know|next,? i|you can ask|shall i|say the word)/i;

function clausesOf(reply: string): string[] {
  const out: string[] = [];
  for (const line of maskQuotes(reply).split(/\n+/)) {
    const plain = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
    if (!plain) continue;
    for (const sentence of plain.split(/(?<=[.!?])\s+/)) {
      if (/\?\s*$/.test(sentence)) continue;
      for (const clause of sentence.split(/\s*(?:[,;—]|\bbut\b)\s*/i)) {
        // A clause longer than this is not a claim, it is a wall of words; what matters is in its first lines.
        const c = unmask(clause).trim().replace(/^(?:and|so|yes|ok|okay|also)\s+/i, '').slice(0, CLAUSE_MAX_CHARS);
        if (c.length >= 3) out.push(c);
      }
    }
  }
  return out;
}

/** A clause with its quotations blanked out, for the readers that must not see inside them. */
const blankQuotes = (clause: string): string => clause.replace(QUOTE, ' ');

const SUBJECT_STOP = new Set([...STOP, 'painted', 'made', 'turned', 'changed', 'set', 'colored', 'coloured', 'dyed', 'looks', 'look', 'appears', 'stays', 'remains', 'became', 'glows', 'shines']);

/**
 * The thing a colour word is about, read from the words around it:
 *   "a bright red door"          the word right after the colour
 *   "the door is red"            the phrase before a linking verb
 *   "painted the door red"       the phrase between a determiner and the colour
 */
function subjectOfColour(clause: string, at: number, wordLen: number): string | undefined {
  // Only the words around the colour can name its subject: a bounded window keeps a long clause from costing quadratic time.
  const right = clause.slice(at + wordLen, at + wordLen + 80);
  const next = /^\s+([a-z][a-z-]*)(?:\s+([a-z][a-z-]*))?/i.exec(right);
  if (next && !SUBJECT_STOP.has(next[1]!.toLowerCase()) && !colourWordsIn(next[1]!).length) {
    const second = next[2] && !SUBJECT_STOP.has(next[2].toLowerCase()) && !colourWordsIn(next[2]).length ? ` ${next[2]}` : '';
    return `${next[1]}${second}`;
  }
  const left = clause.slice(Math.max(0, at - 120), at);
  const linking = /([a-z][a-z' -]{0,40}?)\s+(?:is|are|was|were|looks?|appears?|stays?|remains?|became|glows?|shines?|now looks?)\s+(?:now\s+|also\s+|still\s+)?(?:a\s+|an\s+)?$/i.exec(left);
  if (linking) {
    const tokens = subjectTokens(linking[1]);
    if (tokens.length) return linking[1]!.trim();
  }
  const direct = /(?:the|a|an|its|your|their|all the|every)\s+([a-z][a-z-]*(?:\s+[a-z][a-z-]*)?)\s+(?:to\s+|into\s+)?$/i.exec(left);
  if (direct && subjectTokens(direct[1]).length) return direct[1];
  return undefined;
}

function colourClaims(clause: string): Claim[] {
  if (NEGATION.test(clause) || OFFER.test(clause)) return [];
  const plain = blankQuotes(clause);
  const claims: Claim[] = [];
  for (const m of colourWordsIn(plain).slice(0, COLOURS_PER_CLAUSE)) {
    const subject = subjectOfColour(plain, m.index, m.word.length);
    // A colour with no thing attached ("it stays white", "everything is red") cannot be tied to any
    // evidence, and auditing it against "any colour anywhere in the run" would flag true replies. It is not a claim here.
    if (!subject || !subjectTokens(subject).length) continue;
    claims.push({ kind: 'colour', sentence: clause.slice(0, 160), colour: m.word, subject });
  }
  return claims;
}

const DISPLAY = /\b(?:says?|said|reads?|reading|shows?|showing|displays?|displayed|labell?ed|label|text|title|caption|banner|message|appears?|visible|on[- ]screen|screen|hud|button|sign|written|writes?)\b/i;
const NAME_ONLY = /\b(?:named|called|renamed|folder|script|module|model|attribute|tag|group)\b/i;
const VISIBLE = /\b(?:visible|on[- ]screen|on the screen|(?:players?|you|user|they|everyone) (?:will )?(?:see|sees|read|reads)|you'll see|appears?|displays?|shows?|showing|pops? up|hud)\b/i;

function textClaims(clause: string): Claim[] {
  if (NEGATION.test(clause) || OFFER.test(clause)) return [];
  const quotes = [...clause.matchAll(QUOTE)].map((m) => m[1]!.trim()).filter((t) => t.length >= 2);
  if (!quotes.length || !DISPLAY.test(blankQuotes(clause)) || NAME_ONLY.test(blankQuotes(clause))) return [];
  const visible = VISIBLE.test(blankQuotes(clause));
  return quotes.slice(0, 3).map((text) => ({ kind: 'text', sentence: clause.slice(0, 160), text: text.slice(0, 120), visible }));
}

const COUNT_CONTEXT = /\b(?:has|have|add(?:ed)?|plac(?:e|ed|ing)|built|build|made|make|creat(?:e|ed)|put|scatter(?:ed)?|plant(?:ed)?|spawn(?:ed)?|there are|there's|now (?:has|have)|includes?|contains?|with|set up|lined|dotted|around|across)\b/i;

function countClaims(clause: string): Claim[] {
  if (NEGATION.test(clause) || OFFER.test(clause) || !COUNT_CONTEXT.test(clause)) return [];
  const plain = blankQuotes(clause).toLowerCase();
  const claims: Claim[] = [];
  for (const m of plain.matchAll(/\b(\d{1,3}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+(?:(?:new|little|small|big|large|tiny|different|more|extra|separate|bright|colou?rful|shiny|glowing|floating)\s+)*([a-z][a-z-]{2,})/g)) {
    const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : NUMBER_WORDS[m[1]!];
    const noun = singular(m[2]!);
    if (!n || n < 2 || n > 99 || UNIT_NOUNS.has(noun) || STOP.has(noun)) continue;
    claims.push({ kind: 'count', sentence: clause.slice(0, 160), count: n, noun });
  }
  return claims;
}

const TRIGGER_CLICK = /\b(?:when|if|once|as soon as|every time|each time|after)\b[^.]{0,40}\b(?:click(?:s|ed)?|press(?:es|ed)?|tap(?:s|ped)?|interact(?:s|ed)?|select(?:s|ed)?)\b|\bon click\b|\bwhen clicked\b|\bclickable\b/i;
const TRIGGER_TOUCH = /\b(?:when|if|once|as soon as|every time|each time|after)\b[^.]{0,40}\b(?:touch(?:es|ed)?|step(?:s|ped)?|walk(?:s|ed)?|approach(?:es|ed)?|enter(?:s|ed)?|jump(?:s|ed)?|collect(?:s|ed)?|pick(?:s|ed)? up|stand(?:s)?)\b/i;
const EFFECT = /\b(?:opens?|closes?|spins?|rotates?|bounces?|slides?|swings?|moves?|flies|floats?|jumps?|glows?|flashes|lights? up|explodes?|teleports?|disappears?|appears?|plays?|gives?|awards?|grants?|unlocks?|respawns?|heals?|damages?|speeds?|shows?|changes?|starts?|stops?|spawns?|rewards?|adds?)\b/i;
const SOUND = /\b(?:plays? (?:a |an |the |some )?(?:sound|song|music|noise|jingle|tune|chime|effect)|makes? (?:a |some )?(?:sound|noise)|has (?:background )?music|music (?:plays|loops))\b/i;
// Motion only: how something glows or sparkles is something a look can see, motion is not.
const AMBIENT = /\b(?:spins|rotates|bounces|floats|pulses|swings|slides)\b/i;

function behaviourClaims(clause: string): Claim[] {
  if (NEGATION.test(clause) || OFFER.test(clause)) return [];
  const plain = blankQuotes(clause);
  const click = TRIGGER_CLICK.test(plain);
  const touch = !click && TRIGGER_TOUCH.test(plain);
  const trigger: Claim['trigger'] = click ? 'click' : touch ? 'touch' : 'none';
  if (!((click || touch) && EFFECT.test(plain)) && !SOUND.test(plain) && !AMBIENT.test(plain)) return [];
  const before = /^(?:i (?:made|set|added|built)\s+)?(?:the|a|an|your)?\s*([a-z][a-z-]*(?:\s+[a-z][a-z-]*)?)\s+(?:will\s+)?(?:opens?|closes?|spins?|rotates?|bounces?|slides?|swings?|moves?|floats?|glows?|flashes|explodes?|teleports?|disappears?|plays?|gives?|awards?|unlocks?|shows?|changes?|starts?|stops?|spins|rotates|bounces|floats|pulses|swings|slides|sparkles)\b/i.exec(plain);
  const subject = before && subjectTokens(before[1]).length ? before[1] : undefined;
  return [{ kind: 'behaviour', sentence: clause.slice(0, 160), trigger, ...(subject ? { subject } : {}) }];
}

/** Every concrete claim in a reply, in reading order, one per distinct claim. */
export function extractClaims(reply: string): Claim[] {
  const out: Claim[] = [];
  const seen = new Set<string>();
  for (const clause of clausesOf(reply)) {
    for (const claim of [...textClaims(clause), ...colourClaims(clause), ...countClaims(clause), ...behaviourClaims(clause)]) {
      const key = [
        claim.kind, claim.text?.toLowerCase(), claim.colour ? [...(familiesOfWord(claim.colour) ?? [claim.colour])].join('/') : '',
        subjectTokens(claim.subject).join(' '), claim.count, claim.noun, claim.kind === 'behaviour' ? claim.sentence.toLowerCase() : '',
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(claim);
    }
  }
  return out.slice(0, 20);
}

// ------------------------------------------------------------------------------ evaluation ---

const found = (claim: Claim, verdict: Verdict, because: string, needs: Need = 'none'): Finding => ({ claim, verdict, because, needs });

function latestPer<T extends { seq: number }>(facts: T[], key: (f: T) => string): T[] {
  const best = new Map<string, T>();
  for (const f of facts) {
    const k = key(f);
    const had = best.get(k);
    if (!had || f.seq >= had.seq) best.set(k, f);
  }
  return [...best.values()];
}

/**
 * A measured colour in words. The FAMILY only, never the BrickColor name it was read as: the name is a string that came out of the
 * place, and everything `because` says can reach the agent in a user-role message (see steerForFindings).
 */
function colourWhat(f: ColourFact): string {
  return f.family ?? 'an unknown colour';
}

function lookSaysColour(claim: Claim, l: EvidenceLedger): Finding | null {
  const subject = subjectTokens(claim.subject);
  // Whether a colour word in a look's text names the colour the agent claimed. A word is judged by its own first family.
  const agrees = (word: string): boolean => sameColour(claim.colour!, [...(familiesOfWord(word) ?? [])][0] ?? 'grey') === true;
  for (const o of [...l.looks].reverse()) {
    if (o.mutationSeq !== l.mutationSeq) continue; // a look at an older state is not evidence about this one
    const text = `${o.about} ${o.note}`;
    if (subject.length && !tokensMatch(subject, pathTokens(text.replace(/[^A-Za-z ]/g, ' ')))) continue;
    const words = colourWordsIn(text);
    if (o.verdict === 'seen') {
      if (words.some((w) => agrees(w.base))) return found(claim, 'supported', 'a look at the place saw it that way');
      if (words.length) return found(claim, 'contradicted', `a look at the place saw it as ${words[0]!.word}, not ${claim.colour}`);
    }
    if (o.verdict === 'not_seen' && words.some((w) => agrees(w.base))) {
      return found(claim, 'contradicted', 'a look at the place did not see it as claimed');
    }
  }
  return null;
}

function evalColour(claim: Claim, l: EvidenceLedger): Finding {
  const subject = subjectTokens(claim.subject);
  const colour = claim.colour!;
  const about = subject.length ? l.colours.filter((f) => tokensMatch(subject, pathTokens(f.path, f.name))) : [];
  const known = latestPer(about, (f) => `${f.path}|${f.prop}`).filter((f) => f.family);
  if (known.length) {
    const agree = known.filter((f) => sameColour(colour, f.family!) === true);
    if (agree.length) {
      const f = agree[agree.length - 1]!;
      return found(claim, 'supported', f.via === 'read' ? `it was read back from the place as ${colourWhat(f)}` : `this run set it to ${colourWhat(f)}`);
    }
    const f = known.sort((a, b) => b.seq - a.seq)[0]!;
    return found(claim, 'contradicted', f.via === 'read'
      ? `it was read back from the place as ${colourWhat(f)}, not ${colour}`
      : `the last change this run made set it to ${colourWhat(f)}, not ${colour}`);
  }
  const look = lookSaysColour(claim, l);
  if (look) return look;
  return found(claim, 'unsupported', `nothing this run set, read back or looked at says what colour the ${claim.subject} is`, 'read');
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
const sameText = (a: string, b: string): boolean => {
  const x = norm(a);
  const y = norm(b);
  return x === y || (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x)));
};

function evalText(claim: Claim, l: EvidenceLedger): Finding {
  const text = claim.text!;
  const facts = l.texts.filter((t) => sameText(t.text, text));
  const played = facts.filter((t) => t.via === 'play');
  if (claim.visible) {
    if (played.some((t) => t.visible === true)) return found(claim, 'supported', 'a player check saw that text on screen');
    if (played.length) return found(claim, 'contradicted', 'a player check found that text hidden: the player would not see it');
    if (facts.some((t) => t.visible === false)) return found(claim, 'contradicted', 'the text\'s own Visible property is false, so a player would not see it');
    const screenRead = l.plays.some((p) => p.mutationSeq === l.mutationSeq && p.observed && p.screens > 0);
    if (screenRead) return found(claim, 'unsupported', 'a player check read the screen and did not see that text', 'none');
    return found(claim, 'unsupported', 'no player check has seen that text on screen', 'play');
  }
  if (played.some((t) => t.visible === true) || facts.some((t) => t.via === 'read')) return found(claim, 'supported', 'the text was read back from the place');
  if (played.length) return found(claim, 'supported', 'a player check found that text in the game');
  return found(claim, 'unsupported', facts.length ? 'the text was set by this run but never read back' : 'no text like that was set or read this run', 'read');
}

function evalCount(claim: Claim, l: EvidenceLedger): Finding {
  const noun = [claim.noun!];
  const matched = l.names.filter((n) => tokensMatch(noun, pathTokens(n.path, n.name)));
  const n = matched.length;
  if (n === claim.count) return found(claim, 'supported', `the run recorded ${n} of them`);
  const freshReads = matched.length > 0 && matched.every((m) => m.via === 'read' && m.mutationSeq === l.mutationSeq);
  if (freshReads) return found(claim, 'contradicted', `a read after the last change shows ${n}, not ${claim.count}`);
  return found(claim, 'unsupported', n ? `this run only recorded ${n} of them` : 'this run recorded none of them', 'read');
}

function evalBehaviour(claim: Claim, l: EvidenceLedger): Finding {
  const fresh = l.plays.filter((p) => p.mutationSeq === l.mutationSeq && p.observed);
  const erred = fresh.find((p) => p.errors > 0);
  if (erred) return found(claim, 'contradicted', `the player check after the last change reported ${erred.errors} error(s) while it ran`);
  const subject = subjectTokens(claim.subject);
  const exercised = (paths: string[]) => paths.some((p) => !subject.length || tokensMatch(subject, pathTokens(p)));
  const worked = fresh.some((p) => (claim.trigger === 'touch' ? exercised(p.touched) : exercised(p.pressedChanged)));
  if (worked) return found(claim, 'supported', 'a player check exercised it and saw something change');
  const idle = fresh.find((p) => exercised(p.pressedNoChange));
  if (idle) return found(claim, 'contradicted', 'a player check pressed it and nothing changed');
  return fresh.length
    ? found(claim, 'unsupported', 'the game was played after the last change, but nothing in that check exercised this', 'none')
    : found(claim, 'unsupported', 'nothing has played the game since the last change', 'play');
}

function evaluate(claim: Claim, l: EvidenceLedger): Finding {
  switch (claim.kind) {
    case 'colour': return evalColour(claim, l);
    case 'text': return evalText(claim, l);
    case 'count': return evalCount(claim, l);
    case 'behaviour': return evalBehaviour(claim, l);
    default: return found(claim, 'unsupported', 'nothing this run observed says either way', 'none');
  }
}

export function auditClaims(claims: Claim[], l: EvidenceLedger): Finding[] {
  return claims.map((c) => evaluate(c, l));
}

/** Longest reply the audit reads. A reply is a few sentences; this only bounds a pathological one. */
const REPLY_MAX_CHARS = 20_000;

export function auditReply(reply: string, l: EvidenceLedger): AuditResult {
  const claims = extractClaims(typeof reply === 'string' ? reply.slice(0, REPLY_MAX_CHARS) : '');
  return resultOf(claims, auditClaims(claims, l));
}

export function resultOf(claims: Claim[], findings: Finding[]): AuditResult {
  return {
    claims, findings,
    supported: findings.filter((f) => f.verdict === 'supported'),
    contradicted: findings.filter((f) => f.verdict === 'contradicted'),
    unsupported: findings.filter((f) => f.verdict === 'unsupported'),
  };
}

// ------------------------------------------------------------------------ what is said, to whom ---

/** Worth sending back to the agent: contradicted, or unsupported with a tool the agent was actually offered. */
export function actionable(result: AuditResult, can: Offered): boolean {
  if (result.contradicted.length) return true;
  return result.unsupported.some((f) => (f.needs === 'read' && can.read) || (f.needs === 'play' && can.play) || (f.needs === 'look' && can.look));
}

/** The message that sends unsupported claims back. For the agent, so it may name its own tools. Null when there is nothing to send. */
export function steerForFindings(result: AuditResult, can: Offered): string | null {
  const send = [
    ...result.contradicted,
    ...result.unsupported.filter((f) => (f.needs === 'read' && can.read) || (f.needs === 'play' && can.play) || (f.needs === 'look' && can.look)),
  ];
  if (!send.length) return null;
  const how = [
    can.read ? 'get_instance reads one thing back' : '',
    can.play ? 'play_check plays as a real player' : '',
    can.look ? 'look looks at the place' : '',
  ].filter(Boolean).join('; ');
  // A user-role message: it carries the agent's own clause, words from closed vocabularies, numbers and fixed sentences — and
  // nothing a place wrote or a model wrote ABOUT the place. A judge's finding (kind "other") is therefore sent back by its claim
  // alone; its reason is model output derived from untrusted place text and stays out. See security.test.mjs A5.
  const lines = send.slice(0, 6).map((f) => (
    f.claim.kind === 'other'
      ? `- "${f.claim.sentence}" — not supported by anything this run observed.`
      : `- "${f.claim.sentence}" — ${f.verdict === 'contradicted' ? 'CONTRADICTED' : 'not supported'}: ${f.because}.`
  ));
  return (
    'Before you answer: your reply makes claims that what this run observed does not support.\n' +
    `${lines.join('\n')}\n` +
    `Settle each one now${how ? ` (${how})` : ''} and correct what is wrong. If you cannot check a claim, take it out of your answer or say that you did not check it. ` +
    'Do not repeat a claim you have not seen. Then answer again, briefly.'
  );
}

const trimTo = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** One claim, as a short phrase in plain words (no tool names, no paths) for the line the user reads. */
function plainPhrase(f: Finding): string {
  const c = f.claim;
  const clue = f.verdict === 'contradicted' ? ` (${trimTo(f.because.replace(/^(?:it was |the last change this run made )/, '').replace(/^(?:read back from the place|set it) /, ''), 70)})` : '';
  switch (c.kind) {
    case 'colour': return `that ${c.subject ? `the ${c.subject.replace(/^(?:the|a|an)\s+/i, '')}` : 'it'} is ${c.colour}${f.verdict === 'contradicted' ? ` (${trimTo(f.because, 80)})` : ''}`;
    case 'text': return c.visible ? `that "${c.text}" really shows on the screen${f.verdict === 'contradicted' ? ' (it was hidden when I checked)' : ''}` : `that the text really says "${c.text}"`;
    case 'count': return `that there are ${c.count} ${c.noun}s${f.verdict === 'contradicted' ? ` (${trimTo(f.because, 60)})` : ''}`;
    case 'other': return `that this is true: "${trimTo(c.sentence, 90)}"`;
    default: return `that it works as I said: "${trimTo(c.sentence, 90)}"${clue}`;
  }
}

/**
 * The one line appended after the agent's own reply, in plain words, naming what is still unchecked.
 * `extras` are things the completion gate adds ("how it looks after my last changes"). Null when there is
 * nothing to say. Never rewrites anything: it is a separate line.
 */
export function notCheckedLine(result: AuditResult, extras: string[] = []): string | null {
  const phrases = [
    ...result.contradicted.map(plainPhrase),
    ...result.unsupported.map(plainPhrase),
    ...extras,
  ];
  if (!phrases.length) return null;
  const shown = phrases.slice(0, 5);
  const more = phrases.length - shown.length;
  return `What I did not check: ${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}.`;
}
