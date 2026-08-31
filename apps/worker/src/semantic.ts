// Did the agent build the thing that was ASKED FOR?
//
// THE FAILURE THIS EXISTS FOR, measured. Asked for "a cosy tavern interior ... walls with a doorway
// and windows, a wooden floor, a bar counter with stools, tables and chairs, a fireplace", the agent
// produced a competent small cottage EXTERIOR. 351 parts, 11 materials, 9 lights — none of it wrong
// as craft, all of it the wrong object. The visual critic caught it in prose ("not the requested
// cosy tavern interior. No view shows the bar, stools, tables or fireplace") but only AFTER a
// 377-second build, and the correction round then returned a byte-identical scene.
//
// No composition metric can catch this and none should try: a cottage with a roof has a perfectly
// good landmark and a real vertical hierarchy. It is not badly composed. It is the wrong building.
// That is a separate axis and it needs its own gate, before any detail is paid for.
//
// WHAT IS DETERMINISTIC HERE, AND WHAT IS NOT. Interior versus exterior is decidable from geometry:
// an interior is roofed over its own floor, an object on open ground is not. Measured on real Studio
// builds of both readings of the same brief:
//
//   tavern interior   coveredFloorRatio 1.000   ceiling 12 studs   footprint 41x31
//   cottage exterior  coveredFloorRatio 0.063   ceiling 11 studs   footprint 90x90
//
// Sixteen times apart — and note that ceiling HEIGHT does not separate them at all. The coverage
// carries the signal.
//
// What is NOT deterministic is guessing intent that was never stated. "Build a tavern" is genuinely
// ambiguous and a gate that guessed would reject correct work. So this only gates a request that
// SAYS which it wants; otherwise it measures, reports, and lets the build proceed.

/** A Roblox character is about 5 studs; anything whose underside clears that is overhead. */
const HEAD_STUDS = 5;
const GRID = 32;
const GROUND_PLANE_STUDS = 600;

export interface Enclosure {
  /** fraction of the build's own footprint with something solid above head height */
  coveredFloorRatio: number;
  /** height of the lowest overhead surface above the floor; 0 when there is none */
  ceilingHeight: number;
  footprintStuds: [number, number];
}

/**
 * How enclosed the geometry is. Grid the build's own footprint; a cell counts as covered when some
 * part's underside sits above head height over it. A room is covered over nearly all of its floor;
 * a cottage standing on open ground covers only the patch it occupies.
 */
export function enclosure(parts: number[][]): Enclosure {
  const live = parts.filter((p) => p[3]! <= GROUND_PLANE_STUDS && p[5]! <= GROUND_PLANE_STUDS);
  if (!live.length) return { coveredFloorRatio: 0, ceilingHeight: 0, footprintStuds: [0, 0] };

  const floorY = Math.min(...live.map((p) => p[1]! - p[4]! / 2));
  let lox = Infinity;
  let hix = -Infinity;
  let loz = Infinity;
  let hiz = -Infinity;
  for (const p of live) {
    lox = Math.min(lox, p[0]! - p[3]! / 2);
    hix = Math.max(hix, p[0]! + p[3]! / 2);
    loz = Math.min(loz, p[2]! - p[5]! / 2);
    hiz = Math.max(hiz, p[2]! + p[5]! / 2);
  }
  const spanX = Math.max(1e-6, hix - lox);
  const spanZ = Math.max(1e-6, hiz - loz);

  const overhead = live.filter((p) => p[1]! - p[4]! / 2 - floorY >= HEAD_STUDS);
  const grid = new Uint8Array(GRID * GRID);
  for (const p of overhead) {
    const x0 = Math.max(0, Math.min(GRID - 1, Math.floor(((p[0]! - p[3]! / 2 - lox) / spanX) * GRID)));
    const x1 = Math.max(0, Math.min(GRID - 1, Math.floor(((p[0]! + p[3]! / 2 - lox) / spanX) * GRID)));
    const z0 = Math.max(0, Math.min(GRID - 1, Math.floor(((p[2]! - p[5]! / 2 - loz) / spanZ) * GRID)));
    const z1 = Math.max(0, Math.min(GRID - 1, Math.floor(((p[2]! + p[5]! / 2 - loz) / spanZ) * GRID)));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid[z * GRID + x] = 1;
  }
  let covered = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]) covered++;

  return {
    coveredFloorRatio: Math.round((covered / (GRID * GRID)) * 1000) / 1000,
    ceilingHeight: overhead.length
      ? Math.round(Math.min(...overhead.map((p) => p[1]! - p[4]! / 2 - floorY)) * 10) / 10
      : 0,
    footprintStuds: [Math.round(spanX), Math.round(spanZ)],
  };
}

export type Enclosed = 'interior' | 'exterior' | 'unstated';

/**
 * What the request explicitly asked for. Only an EXPLICIT statement counts — "tavern" alone is
 * genuinely ambiguous and guessing would reject correct work. Unstated is the common case and means
 * "measure but do not gate".
 */
export function requestedEnclosure(request: string): Enclosed {
  const t = ` ${request.toLowerCase()} `;
  const interior =
    /\b(interiors?|indoors?|inside|rooms?|halls?|corridors?|hallways?|lobby|basement|cellar|attic|kitchen|bedroom|bathroom|office|cave|tunnel|dungeon|vault|inn)\b/;
  const exterior =
    /\b(exteriors?|outdoors?|outside|facade|fa[cç]ade|plaza|courtyard|square|park|garden|street|rooftop|skyline|island|landscape|terrain|forest|beach)\b/;
  const wantsIn = interior.test(t);
  const wantsOut = exterior.test(t);
  // Both named ("a shop interior opening onto a garden") is not a mismatch anyone can adjudicate.
  if (wantsIn && wantsOut) return 'unstated';
  if (wantsIn) return 'interior';
  if (wantsOut) return 'exterior';
  return 'unstated';
}

/**
 * Calibrated on the two real Studio builds above (1.000 vs 0.063). The band between them is wide, so
 * these sit well clear of both: a request for an interior covering under a third of its own floor is
 * an exterior, and a request for an exterior covering over four fifths of it is a room. Anything in
 * between is not called either way.
 */
export const ENCLOSURE_GATES = { interiorMin: 0.35, exteriorMax: 0.8 };

export interface SemanticCheck {
  requested: Enclosed;
  enclosure: Enclosure;
  failures: string[];
}

/** Does the built geometry match what the request explicitly asked for? */
export function semanticCheck(request: string, parts: number[][] | undefined): SemanticCheck | null {
  if (!parts?.length) return null;
  const requested = requestedEnclosure(request);
  const e = enclosure(parts);
  const failures: string[] = [];

  if (requested === 'interior' && e.coveredFloorRatio < ENCLOSURE_GATES.interiorMin) {
    failures.push(
      `the request asked for an INTERIOR but this is built as an exterior: only ${Math.round(e.coveredFloorRatio * 100)}% of ` +
        `the floor has anything above head height (want at least ${Math.round(ENCLOSURE_GATES.interiorMin * 100)}%). ` +
        'An interior is a space the player stands INSIDE — walls enclosing a floor with a ceiling over it, and the room ' +
        'itself should be most of the scene rather than a building sitting on open ground.',
    );
  }
  if (requested === 'exterior' && e.coveredFloorRatio > ENCLOSURE_GATES.exteriorMax) {
    failures.push(
      `the request asked for an EXTERIOR but this is built as an enclosed room: ${Math.round(e.coveredFloorRatio * 100)}% of ` +
        'the floor is roofed over. Remove the ceiling and open the space out.',
    );
  }
  return { requested, enclosure: e, failures };
}

export function semanticLine(c: SemanticCheck): string {
  return (
    `requested ${c.requested}; ${Math.round(c.enclosure.coveredFloorRatio * 100)}% of the floor is covered at ` +
    `${c.enclosure.ceilingHeight} studs, footprint ${c.enclosure.footprintStuds.join('x')} studs`
  );
}

// ---------------------------------------------------------------------------------------------
// The rebuild trigger.
// ---------------------------------------------------------------------------------------------

export interface PassRecord {
  /** cheap structural signature of the scene after this pass */
  signature: string;
  score: number | null;
  parts: number;
}

/**
 * Signature of a build, used to tell "corrected" from "did nothing". Deliberately coarse: exact part
 * positions churn constantly, but part count, total mass and height do not move unless the scene
 * actually changed.
 */
export function sceneSignature(parts: number[][] | undefined): string {
  if (!parts?.length) return 'empty';
  const live = parts.filter((p) => p[3]! <= GROUND_PLANE_STUDS && p[5]! <= GROUND_PLANE_STUDS);
  if (!live.length) return 'empty';
  let vol = 0;
  let maxY = -Infinity;
  for (const p of live) {
    vol += p[3]! * p[4]! * p[5]!;
    maxY = Math.max(maxY, p[1]! + p[4]! / 2);
  }
  return `${live.length}:${Math.round(vol / 10)}:${Math.round(maxY)}`;
}

export interface RebuildVerdict {
  rebuild: boolean;
  reason: string;
}

/**
 * Should the agent stop patching and rebuild the layout instead?
 *
 * The case this was written for: b4-interior round 2 returned a scene with the same part count, the
 * same material count, the same light count, and a critique identical defect for defect. Two hundred
 * and nine seconds of work that changed nothing, and the loop had no way to notice.
 */
export function shouldRebuild(passes: PassRecord[], semanticFailures = 0): RebuildVerdict {
  if (semanticFailures > 0 && passes.length >= 1) {
    return { rebuild: true, reason: 'the scene is not the thing that was asked for, and no amount of detail fixes that' };
  }
  if (passes.length < 2) return { rebuild: false, reason: '' };
  const last = passes[passes.length - 1]!;
  const prev = passes[passes.length - 2]!;

  if (last.signature === prev.signature) {
    return { rebuild: true, reason: 'the last correction pass changed nothing at all — the scene is identical' };
  }
  // grew but did not improve: the "add more parts" reflex the composition work already falsified
  if (last.parts > prev.parts * 1.15 && last.score !== null && prev.score !== null && last.score <= prev.score) {
    return {
      rebuild: true,
      reason: `the last pass added ${last.parts - prev.parts} parts and the score did not improve (${prev.score} -> ${last.score})`,
    };
  }
  if (passes.length >= 3) {
    const scores = passes.slice(-3).map((p) => p.score);
    if (scores.every((s) => s !== null)) {
      const nums = scores as number[];
      if (Math.max(...nums) - Math.min(...nums) <= 1) {
        return { rebuild: true, reason: 'three passes have not moved the score — patching has stopped paying' };
      }
    }
  }
  return { rebuild: false, reason: '' };
}

// ===============================================================================================
// INTENT EXPANSION
//
// Interior/exterior is one axis and it earned its gate: geometry decides it, the separation was
// measured at 16x on real captures, and a wrong answer is unambiguously wrong. Nothing else below
// has that property. A genre, a style word, a list of props — none of them are decidable from a
// list of bounding boxes, and a gate that guessed at them would reject correct work for a living.
//
// So the expansion is deliberately lopsided. It extracts twelve more axes and gates on NONE of
// them. What it produces instead is a checklist and a set of warnings the builder and the critic
// can both read, plus questions where the request genuinely did not say. That is worth having:
// the b4 failure was caught in critic prose ("no view shows the bar, stools, tables or fireplace")
// AFTER a 377-second build. The same list, extracted in microseconds from the request text, can be
// in front of the model BEFORE it builds.
//
// STRENGTH LADDER, and why each axis sits where it does:
//
//   axis          default     justification
//   ------------- ----------- --------------------------------------------------------------------
//   enclosure     hard        Proven. Geometry decides it; 1.000 vs 0.063 on real builds; only
//                             gates when the request SAYS which it wants. Unchanged from above.
//   exclusion     strong      A user who said "no zombies" meant it, so the signal is high-quality
//                             — but we cannot see a zombie in a bounding box, so a gate would be
//                             blind. Warn loudly, never block. Hedged forms ("nothing too modern")
//                             drop to soft: a degree limiter is not a prohibition.
//   object        strong      Explicitly enumerated nouns ("a bar counter with stools"). Highest-
//                             value list in the whole schema and completely unverifiable from
//                             geometry — part boxes have no identity. Checklist, not gate.
//   structure     strong      Same reasoning as object; "walls, a doorway, windows" was asked for
//                             literally. Two of these (roof/ceiling) DO touch geometry, and get a
//                             geometry-backed warning — still a warning, not a gate, because a
//                             pitched roof over a partial floor is a legitimate build.
//   feature       strong      The user reached for emphasis ("make sure there's...", "must have").
//                             Emphasis is evidence of intent, not of verifiability.
//   focal         strong/soft strong when explicitly named ("the fireplace is the centrepiece"),
//                             soft when inferred from enumeration order. Inference is a guess.
//   environment   soft        Keyword-derived, one word can flip it ("street" in "street lamp"),
//                             and a wrong call costs nothing if it is only a note.
//   genre         soft        Style vocabulary is fuzzy and frequently mixed on purpose.
//   purpose       soft        "players will fight here" is real but rarely stated; absence is the
//                             norm, so absence must not read as failure.
//   zone          soft        Multi-valued and inferential: a tavern implies a bar and seating
//                             whether or not the request lists them.
//   layout        soft        "in a circle", "two floors" — some are measurable in principle, none
//                             are measured here, so none may gate.
//   flow          soft        Gameplay flow is a runtime property; static geometry cannot show it.
//   style         soft        Adjectives. Never a gate, by construction.
//   (any)         ambiguous   Anything inside a hedged clause ("maybe a fireplace") is downgraded
//                             to ambiguous and surfaced as a question instead of a constraint.
//
// EVERYTHING HERE IS DETERMINISTIC and costs zero model tokens: regex, lexicons and arithmetic,
// exactly like enclosureRatio. `mergeModelConstraints` is the seam for a model-assisted refinement
// pass, and it caps whatever a model returns at `soft` so a hallucinated constraint can never
// become a gate. Nothing in this file calls a model, and nothing wires one in.
// ===============================================================================================

export type Strength = 'hard' | 'strong' | 'soft' | 'ambiguous';

export type IntentAxisName =
  | 'enclosure'
  | 'environment'
  | 'genre'
  | 'focal'
  | 'purpose'
  | 'structure'
  | 'zone'
  | 'object'
  | 'layout'
  | 'flow'
  | 'style'
  | 'feature'
  | 'exclusion';

export type ConstraintSource = 'text' | 'geometry' | 'model';

export interface IntentConstraint {
  axis: IntentAxisName;
  value: string;
  strength: Strength;
  /** 0..1. How sure the extractor is that this was actually asked for. */
  confidence: number;
  /** the span of the request that produced it, so a human can audit any call */
  evidence: string;
  /** index of that span in the normalised request; used to test clause membership */
  at: number;
  source: ConstraintSource;
}

export interface Intent {
  /** the proven axis, unchanged */
  enclosure: Enclosed;
  constraints: IntentConstraint[];
  /** things the request did not settle. Never gated on — asked about. */
  questions: string[];
}

// -----------------------------------------------------------------------------------------------
// Text preparation
// -----------------------------------------------------------------------------------------------

/** Lowercase, straighten quotes and dashes, collapse space, and pad so \b works at both ends. */
function prepare(request: string): string {
  return ` ${request
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function esc(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/** Word-boundary term counter with a crude plural. Returns hits and the first position. */
function countTerms(text: string, terms: readonly string[]): { count: number; hits: string[]; at: number } {
  let count = 0;
  let at = -1;
  const hits: string[] = [];
  for (const t of terms) {
    const re = new RegExp(`\\b${esc(t)}(?:e?s)?\\b`, 'g');
    const found = text.match(re);
    if (!found) continue;
    count += found.length;
    hits.push(t);
    const i = text.search(new RegExp(`\\b${esc(t)}(?:e?s)?\\b`));
    if (at < 0 || (i >= 0 && i < at)) at = i;
  }
  return { count, hits, at: at < 0 ? 0 : at };
}

// -----------------------------------------------------------------------------------------------
// NEGATION. The single easiest thing in this file to get wrong, so it is the most defended.
//
// "no zombies" and "without water" are exclusions. "not just a plain room" is NOT an exclusion of
// "room" — it is the opposite, a demand for more than a room. "no more than three floors" is a
// quantity bound. "not without water" is a double negative asking FOR water. "there is no fireplace
// yet" describes the scene, it does not forbid one. Each of those is handled below and tested.
// -----------------------------------------------------------------------------------------------

/** After a bare "no", these make it a comparison or an idiom rather than a prohibition. */
const NO_TRAPS =
  /^(?:more|less|fewer|bigger|smaller|larger|taller|shorter|higher|lower|longer|wider|deeper|thicker|thinner|matter|doubt|way|one|idea|problem|worries|clue|point|sense|use|good|better|worse|later|sooner|means|such|need)\b/;

/** After "without", these are idioms. "without a doubt" forbids nothing. */
const WITHOUT_TRAPS = /^(?:a |any )?(?:doubt|question|fail|exception|hesitation|warning|delay|further ado)\b/;

/** "not just a plain room" asks for MORE than a room. Recorded as emphasis, never as exclusion. */
const MORE_THAN = /\b(?:not (?:just|only|merely|simply)|more than (?:just )?)\s+(?:a |an |the |some )?/g;

/** Cues that genuinely introduce something the user does not want. */
const EXCLUSION_CUES: readonly { re: RegExp; strength: Strength; confidence: number }[] = [
  {
    re: /\b(?:don't|do not|doesn't|does not|didn't|won't|will not)\s+(?:want|need|add|include|use|put|build|make|place|give|have|feature)\s+(?:me\s+)?(?:any\s+)?/g,
    strength: 'strong',
    confidence: 0.9,
  },
  { re: /\b(?:please\s+)?(?:avoid|exclude|omit|skip)\s+(?:any\s+|using\s+|adding\s+)?/g, strength: 'strong', confidence: 0.85 },
  { re: /\bleave out\s+(?:the\s+|any\s+)?/g, strength: 'strong', confidence: 0.85 },
  { re: /\b(?:free of|devoid of|with no)\s+(?:any\s+)?/g, strength: 'strong', confidence: 0.85 },
  { re: /\bnever\s+(?:add|include|use|put|build)\s+(?:any\s+)?/g, strength: 'strong', confidence: 0.85 },
  { re: /\bwithout\s+/g, strength: 'strong', confidence: 0.85 },
  { re: /\bno\s+/g, strength: 'strong', confidence: 0.8 },
  // Degree limiters, not prohibitions: "nothing too modern" still allows some modernity.
  { re: /\b(?:not|nothing)\s+too\s+/g, strength: 'soft', confidence: 0.6 },
  { re: /\bno need (?:for|to (?:add|include|build|have|make))\s+(?:any\s+)?/g, strength: 'soft', confidence: 0.6 },
];

const CLAUSE_END = /[.;:!?]|\s-\s|\bbut\b|\bbecause\b|\bso that\b|\bwhile\b|\bwhich\b|\bunless\b|\bif\b|\binstead\b|\bhowever\b/;
// Continuation fragments repeat the cue ("no zombies and without water") and adverbs are not
// things ("definitely a locked gate"). Both have to come off before the noun is readable.
const LEAD_STRIP =
  /^(?:no|without|avoid|any|a|an|the|some|other|of|for|too|much|many|lots of|kind of|sort of|type of|to|definitely|really|maybe|perhaps|possibly|ideally|probably|obviously|preferably|also|even|just)\s+/;
const TRAIL_STRIP =
  /\s+(?:in|on|at|as|by|from|around|near|next to|beside|under|over|behind|between|inside|outside|anywhere|please|though|either|at all|whatsoever|of any kind)\b.*$/;
const NOT_A_THING =
  /^(?:build|make|makes|made|add|adds|put|place|include|create|creates|give|use|uses|set|do|does|keep|leave|let|have|has|want|wants|need|needs|try|start|then|just|i|we|you|they|it|there|please|its|it's|really|very|too|more|sure|ok|okay|yes)\b/;
const FILLER_TERMS = new Set([
  'thing',
  'things',
  'stuff',
  'anything',
  'everything',
  'one',
  'ones',
  'else',
  'etc',
  'so on',
  'that kind of thing',
  'that sort of thing',
  'more',
  'that',
  'this',
]);

/** Normalise one enumerated fragment into a thing, or null if it is not one. */
function cleanTerm(raw: string): string | null {
  let s = raw.trim().replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9%'\s]+$/, '').trim();
  if (!s) return null;
  for (let i = 0; i < 4 && LEAD_STRIP.test(s); i++) s = s.replace(LEAD_STRIP, '');
  s = s.replace(TRAIL_STRIP, '').trim();
  if (!s) return null;
  if (NOT_A_THING.test(s)) return null;
  if (FILLER_TERMS.has(s)) return null;
  if (s.split(/\s+/).length > 4) return null;
  return s;
}

/**
 * Read a list of things off the text following a cue, and report how far it got so the caller can
 * blank exactly that span. Stops at the first fragment that is not a thing, which is what keeps
 * "no zombies and build a tower" from excluding the tower.
 */
function scanTerms(tail: string): { terms: string[]; consumed: number } {
  let span = tail;
  const cut = span.search(CLAUSE_END);
  if (cut >= 0) span = span.slice(0, cut);
  span = span.split(/\s+/).slice(0, 14).join(' ');

  const pieces: { text: string; end: number }[] = [];
  const sep = /\s*(?:,|\bor\b|\band\b|\bnor\b|\bplus\b)\s*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = sep.exec(span))) {
    pieces.push({ text: span.slice(last, m.index), end: m.index });
    last = sep.lastIndex;
  }
  pieces.push({ text: span.slice(last), end: span.length });

  const terms: string[] = [];
  let consumed = 0;
  for (const p of pieces) {
    const t = cleanTerm(p.text);
    if (t === null) break;
    if (!terms.includes(t)) terms.push(t);
    consumed = p.end;
    if (terms.length >= 4) break;
  }
  return { terms, consumed };
}

/** "not without water" asks FOR water. Blank it before any cue can read the "without". */
function blankDoubleNegatives(t: string): string {
  return t.replace(/\bnot\s+without\s+(?:any\s+)?[a-z0-9'\s-]{0,24}/g, (m) => ' '.repeat(m.length));
}

/**
 * Exclusions, plus a copy of the request with every exclusion blanked out. The blanking matters:
 * "no zombies" would otherwise make the purpose lexicon read the scene as a survival map.
 */
export function extractExclusions(normalised: string): { constraints: IntentConstraint[]; masked: string } {
  let masked = blankDoubleNegatives(normalised);
  const out: IntentConstraint[] = [];

  for (const cue of EXCLUSION_CUES) {
    const re = new RegExp(cue.re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked))) {
      const cueText = m[0];
      const start = m.index;
      const tail = masked.slice(start + cueText.length);
      // Bare "no"/"without" carry idioms that forbid nothing.
      if (/\bno\s+$/.test(cueText) && NO_TRAPS.test(tail)) continue;
      if (/\bwithout\s+$/.test(cueText) && WITHOUT_TRAPS.test(tail)) continue;
      // "there is no fireplace yet" reports the scene; it does not forbid a fireplace. Only treat
      // it as descriptive when it is not itself an instruction ("make sure there is no lava").
      const before = masked.slice(Math.max(0, start - 40), start);
      const descriptive = /(?:there|it|which|that|this)\s+(?:is|are|'s|was|were|has|have|had)\s+$/.test(before);
      const instructed = /(?:make sure|makes sure|ensure|ensuring|check|verify)\s+(?:that\s+)?[a-z\s']{0,12}$/.test(before);
      if (descriptive && !instructed) continue;
      if (/\b(?:yet|so far|currently|at the moment|right now)\b/.test(tail.slice(0, 40))) continue;

      const { terms, consumed } = scanTerms(tail);
      if (!terms.length) continue;
      for (const value of terms) {
        out.push({
          axis: 'exclusion',
          value,
          strength: cue.strength,
          confidence: cue.confidence,
          evidence: `${cueText.trim()} ${value}`.trim(),
          at: start,
          source: 'text',
        });
      }
      const end = start + cueText.length + consumed;
      masked = masked.slice(0, start) + ' '.repeat(end - start) + masked.slice(end);
      re.lastIndex = start + cueText.length;
    }
  }
  return { constraints: out, masked };
}

// -----------------------------------------------------------------------------------------------
// Lexicons. Single-valued axes pick a winner (ties are ambiguous); multi-valued axes report all.
// -----------------------------------------------------------------------------------------------

const ENVIRONMENT_LEX: Record<string, readonly string[]> = {
  urban: ['city', 'downtown', 'street', 'sidewalk', 'pavement', 'alley', 'skyline', 'metropolis', 'district', 'city block', 'skyscraper', 'suburb'],
  rural: ['village', 'farm', 'countryside', 'field', 'meadow', 'barn', 'orchard', 'hamlet', 'pasture'],
  wilderness: ['forest', 'woods', 'jungle', 'mountain', 'canyon', 'desert', 'swamp', 'wilderness', 'tundra', 'cliff', 'valley'],
  coastal: ['beach', 'shore', 'harbour', 'harbor', 'dock', 'pier', 'port', 'seaside', 'lagoon', 'island'],
  underground: ['cave', 'cavern', 'tunnel', 'mine', 'dungeon', 'crypt', 'catacomb', 'basement', 'cellar', 'sewer', 'bunker'],
  industrial: ['factory', 'warehouse', 'refinery', 'plant', 'foundry', 'workshop', 'depot', 'rig'],
  domestic: ['bedroom', 'kitchen', 'living room', 'bathroom', 'house interior', 'apartment', 'home', 'cottage', 'flat'],
  commercial: ['shop', 'store', 'market', 'mall', 'cafe', 'restaurant', 'tavern', 'inn', 'bar interior', 'boutique', 'stall'],
  institutional: ['school', 'hospital', 'library', 'museum', 'church', 'temple', 'courthouse', 'station', 'office'],
  aquatic: ['underwater', 'reef', 'seabed', 'submarine', 'aquarium', 'lake bed'],
  space: ['space station', 'spaceship', 'orbit', 'moon base', 'starship', 'asteroid', 'hangar bay'],
};

const GENRE_LEX: Record<string, readonly string[]> = {
  medieval: ['medieval', 'castle', 'knight', 'blacksmith', 'tavern', 'peasant', 'keep', 'drawbridge', 'thatched'],
  fantasy: ['fantasy', 'wizard', 'magic', 'elf', 'elven', 'dwarven', 'dragon', 'enchanted', 'rune', 'mystical'],
  scifi: ['sci-fi', 'scifi', 'science fiction', 'futuristic', 'spaceship', 'laser', 'hologram', 'android', 'starship', 'space station'],
  cyberpunk: ['cyberpunk', 'neon-lit', 'dystopian', 'megacorp', 'chrome', 'hacker', 'cybernetic'],
  modern: ['modern', 'contemporary', 'present-day', 'suburban', 'urban modern', 'glass and steel'],
  horror: ['horror', 'creepy', 'haunted', 'spooky', 'eerie', 'nightmare', 'zombie', 'blood', 'sinister'],
  western: ['western', 'wild west', 'saloon', 'cowboy', 'frontier', 'sheriff'],
  apocalyptic: ['post-apocalyptic', 'apocalypse', 'wasteland', 'ruined', 'derelict', 'abandoned city', 'fallout'],
  cartoon: ['cartoon', 'cartoony', 'stylised', 'stylized', 'whimsical', 'toon', 'chibi'],
  military: ['military', 'army', 'barracks', 'war', 'bunker', 'trench', 'checkpoint'],
  nautical: ['pirate', 'nautical', 'ship deck', 'galleon', 'sailor', 'lighthouse'],
};

const PURPOSE_LEX: Record<string, readonly string[]> = {
  combat: ['fight', 'fighting', 'battle', 'combat', 'pvp', 'shooting', 'arena', 'boss', 'enemy', 'weapon'],
  exploration: ['explore', 'exploring', 'discover', 'adventure', 'secret', 'hidden', 'wander', 'quest'],
  social: ['hang out', 'hangout', 'chat', 'social', 'party', 'gather', 'roleplay', 'friends', 'meet up'],
  commerce: ['buy', 'sell', 'trade', 'vendor', 'shopkeeper', 'checkout', 'till', 'cash register'],
  racing: ['race', 'racing', 'lap', 'kart', 'drift', 'finish line', 'racetrack'],
  obby: ['obby', 'parkour', 'platforming', 'obstacle course', 'jump across', 'climb up'],
  survival: ['survive', 'survival', 'loot', 'crafting', 'horde', 'shelter'],
  tycoon: ['tycoon', 'conveyor', 'dropper', 'simulator', 'upgrade button'],
  spawn: ['spawn', 'respawn', 'lobby', 'starting area', 'start point'],
  showcase: ['showcase', 'portfolio', 'render', 'thumbnail', 'show off', 'display piece'],
};

const ZONE_LEX: Record<string, readonly string[]> = {
  entrance: ['entrance', 'entry', 'foyer', 'lobby', 'porch', 'vestibule'],
  seating: ['seating', 'seat', 'bench', 'booth', 'dining area', 'chair'],
  bar: ['bar', 'bar counter', 'tap', 'keg', 'bartender', 'beer'],
  kitchen: ['kitchen', 'stove', 'oven', 'hearth', 'cooking'],
  sleeping: ['bedroom', 'bed', 'bunk', 'sleeping area'],
  storage: ['storage', 'crate', 'barrel', 'shelf', 'shelves', 'pantry', 'cupboard'],
  workshop: ['workshop', 'forge', 'anvil', 'workbench', 'smithy'],
  market: ['market', 'stall', 'shopfront'],
  stage: ['stage', 'podium', 'dance floor', 'performance area'],
  training: ['arena', 'training area', 'dojo', 'ring'],
  spawnzone: ['spawn point', 'spawn area', 'starting area'],
};

/** Architecture only. Furniture belongs to `object`, which is extracted from the enumeration. */
const STRUCTURE_TERMS: readonly string[] = [
  'wall', 'roof', 'ceiling', 'floor', 'doorway', 'door', 'window', 'staircase', 'stairs', 'ramp',
  'bridge', 'tower', 'fence', 'gate', 'path', 'road', 'pillar', 'column', 'balcony', 'railing',
  'arch', 'archway', 'chimney', 'platform', 'porch', 'courtyard', 'tunnel', 'foundation', 'beam', 'rafter',
];

const LAYOUT_LEX: Record<string, readonly string[]> = {
  symmetrical: ['symmetrical', 'symmetric', 'mirrored', 'even on both sides'],
  circular: ['in a circle', 'circular', 'ring of', 'around a central', 'radial'],
  linear: ['in a row', 'in a line', 'lined up', 'along the', 'linear'],
  grid: ['grid', 'gridded', 'blocks laid out'],
  multistorey: ['two floors', 'two storeys', 'two stories', 'second floor', 'upper floor', 'multi-storey', 'multi-story', 'upstairs', 'mezzanine', 'loft'],
  openplan: ['open plan', 'open-plan', 'open space', 'no dividing walls'],
  tiered: ['tiered', 'terraced', 'stepped', 'on a hill', 'raised platform'],
  enclosedyard: ['walled', 'enclosed by', 'courtyard layout'],
  facing: ['facing the', 'faces the', 'looking out onto', 'overlooking'],
};

const FLOW_LEX: Record<string, readonly string[]> = {
  entryToGoal: ['walk from', 'leads to', 'leading to', 'path to', 'ends at', 'through to'],
  loop: ['loop', 'circuit', 'comes back around'],
  maze: ['maze', 'labyrinth', 'winding'],
  vertical: ['climb', 'ascend', 'go up', 'descend', 'go down'],
  spawnFirst: ['players spawn', 'spawn here', 'start here', 'players start'],
  gated: ['locked', 'key', 'unlock', 'checkpoint', 'gated behind'],
};

const STYLE_LEX: Record<string, readonly string[]> = {
  cosy: ['cosy', 'cozy', 'warm', 'homely', 'snug', 'inviting'],
  grimy: ['grimy', 'gritty', 'dirty', 'grungy', 'run-down', 'rundown', 'decrepit', 'shabby'],
  clean: ['clean', 'pristine', 'polished', 'tidy', 'crisp'],
  minimalist: ['minimalist', 'minimal', 'simple', 'sparse', 'understated'],
  ornate: ['ornate', 'decorative', 'elaborate', 'baroque', 'intricate', 'fancy'],
  rustic: ['rustic', 'weathered', 'worn', 'handmade', 'old-fashioned'],
  sleek: ['sleek', 'smooth', 'streamlined', 'glossy'],
  neon: ['neon', 'glowing', 'luminous', 'backlit'],
  dark: ['dark', 'moody', 'dim', 'shadowy', 'gloomy'],
  bright: ['bright', 'sunny', 'airy', 'light-filled', 'vibrant'],
  luxurious: ['luxurious', 'luxury', 'opulent', 'lavish', 'expensive-looking', 'grand'],
  lowpoly: ['low-poly', 'lowpoly', 'blocky', 'voxel'],
  realistic: ['realistic', 'photoreal', 'lifelike', 'believable'],
};

/** Emphasis markers: the user reached for extra words, which is itself evidence of intent. */
const FEATURE_CUES: readonly RegExp[] = [
  /\b(?:must|has to|have to|needs to|need to)\s+(?:have|include|contain|feature|be)\s+(?:a |an |the |some )?/g,
  /\bmake sure (?:that )?(?:there(?:'s| is| are)\s+)?(?:a |an |the |some )?/g,
  /\b(?:don't forget|do not forget|remember)\s+(?:to add |to include |the |a |an )?/g,
  /\b(?:definitely|absolutely|essential(?:ly)?|required|important(?:ly)?|crucially|above all)\s+(?:needs? |wants? |a |an |the )?/g,
  /\bit needs\s+(?:a |an |the |some )?/g,
];

const FOCAL_CUES =
  /\b(?:centrepiece|centerpiece|focal point|focus on|focused on|main attraction|main feature|the star|hero (?:object|piece|prop)|standout|dominated by|built around|centred on|centered on|showpiece)\b/g;

/** Non-committal language. Anything in the same clause is downgraded to ambiguous and asked about. */
const HEDGE =
  /\b(?:maybe|perhaps|possibly|might|not sure|unsure|i guess|or something|something like|up to you|your call|if you (?:want|like|think)|whatever|optional(?:ly)?|ideally|could be|open to|either)\b/;

/** Building nouns that read equally well as a room or as a building seen from outside. */
const BUILDING_NOUNS =
  /\b(?:tavern|shop|store|castle|house|home|cottage|cabin|tower|temple|church|school|hospital|station|bank|museum|library|restaurant|cafe|club|barn|warehouse|factory|mansion|hut|fort|keep|base|lab|laboratory|garage|hotel|diner|bakery|saloon)\b/;

/** Crude singular, only good enough to tell "wall" from "walls" for de-duplication. */
function singular(s: string): string {
  return s.endsWith('ies') ? `${s.slice(0, -3)}y` : s.endsWith('es') && /(?:ch|sh|s|x|z)es$/.test(s) ? s.slice(0, -2) : s.endsWith('s') && !s.endsWith('ss') ? s.slice(0, -1) : s;
}

/**
 * Structural nouns are poor focal candidates: nobody's eye lands on "walls", and "a wooden floor"
 * is as structural as "floor" — the head noun is what decides it.
 */
const NOT_FOCAL = new Set(['wall', 'floor', 'ceiling', 'roof', 'door', 'doorway', 'window', 'lighting', 'light', 'room', 'interior', 'exterior']);

function structural(value: string): boolean {
  const head = singular(value.split(/\s+/).pop() ?? '');
  return NOT_FOCAL.has(head) || STRUCTURE_TERMS.includes(head);
}

// -----------------------------------------------------------------------------------------------
// Extraction
// -----------------------------------------------------------------------------------------------

function con(
  axis: IntentAxisName,
  value: string,
  strength: Strength,
  confidence: number,
  evidence: string,
  at: number,
  source: ConstraintSource = 'text',
): IntentConstraint {
  return { axis, value, strength, confidence, evidence, at, source };
}

/** Single-winner categorisation. A tie between two categories is ambiguous, not a coin flip. */
function categorise(
  text: string,
  lex: Record<string, readonly string[]>,
): { value: string; confidence: number; ambiguous: boolean; evidence: string; at: number } | null {
  const scored = Object.entries(lex)
    .map(([value, terms]) => ({ value, ...countTerms(text, terms) }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  if (!scored.length) return null;
  const best = scored[0]!;
  const second = scored[1];
  if (second && second.count === best.count) {
    return {
      value: `${best.value} or ${second.value}`,
      confidence: 0.3,
      ambiguous: true,
      evidence: `${best.hits[0]} / ${second.hits[0]}`,
      at: Math.min(best.at, second.at),
    };
  }
  const confidence = best.count >= 2 ? 0.8 : 0.55;
  return { value: best.value, confidence, ambiguous: false, evidence: best.hits.join(', '), at: best.at };
}

/** All categories with any hit. Used where an axis is naturally plural (zones, style, layout). */
function categoriseAll(
  text: string,
  lex: Record<string, readonly string[]>,
): { value: string; confidence: number; evidence: string; at: number }[] {
  const out: { value: string; confidence: number; evidence: string; at: number }[] = [];
  for (const [value, terms] of Object.entries(lex)) {
    const { count, hits, at } = countTerms(text, terms);
    if (count > 0) out.push({ value, confidence: count >= 2 ? 0.7 : 0.5, evidence: hits.join(', '), at });
  }
  return out;
}

/**
 * The nouns the user actually listed. Split the request on every enumeration separator and keep the
 * fragments that name a thing. On the b4 brief this yields exactly the list the visual critic had to
 * spend a 377-second build and a full critique to produce.
 */
function extractObjects(masked: string): IntentConstraint[] {
  // Drop the leading instruction clause when the request marks one off with a colon or a dash.
  const lead = masked.indexOf(':');
  const body = lead >= 0 ? masked.slice(lead + 1) : masked;
  const offset = lead >= 0 ? lead + 1 : 0;

  const out: IntentConstraint[] = [];
  const sep = /\s*(?:,|\.|\s-\s|\band\b|\bwith\b|\bincluding\b|\bsuch as\b|\bplus\b|\bfeaturing\b)\s*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pieces: { text: string; at: number }[] = [];
  while ((m = sep.exec(body))) {
    pieces.push({ text: body.slice(last, m.index), at: offset + last });
    last = sep.lastIndex;
  }
  pieces.push({ text: body.slice(last), at: offset + last });
  // A single fragment is not an enumeration; the subject fallback handles that shape instead.
  if (pieces.length < 3) return out;

  for (const p of pieces) {
    const t = cleanTerm(p.text);
    if (!t) continue;
    if (out.some((o) => o.value === t)) continue;
    out.push(con('object', t, 'strong', 0.8, t, p.at));
    if (out.length >= 16) break;
  }
  return out;
}

/** The head noun of the request: "make me a nice old-fashioned street lamp I can copy" -> the lamp. */
function extractSubject(masked: string): IntentConstraint | null {
  const re =
    /\b(?:build|make(?!\s+sure)|create|design|give me|i want|i need|i'd like|can you (?:build|make))\s+(?:me\s+)?(?:a|an|the|some)?\s*([a-z][a-z0-9' -]{2,44}?)(?=\s+(?:for|in|that|which|with|but|and|i|so|to|you|please)\b|[.,:]|\s-\s|$)/;
  const m = re.exec(masked);
  if (!m || !m[1]) return null;
  const value = m[1].trim();
  if (!value || NOT_A_THING.test(value)) return null;
  return con('object', value, 'soft', 0.5, m[0].trim(), m.index);
}

/** Clause ranges containing non-committal language. */
function hedgedRanges(t: string): [number, number][] {
  const bounds: [number, number][] = [];
  const sep = /[.;!?,]|\s-\s/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = sep.exec(t))) {
    bounds.push([start, m.index]);
    start = sep.lastIndex;
  }
  bounds.push([start, t.length]);
  return bounds.filter(([a, b]) => HEDGE.test(t.slice(a, b)));
}

/**
 * The whole intent, from text alone. Pure, deterministic, zero model tokens.
 */
export function extractIntent(request: string): Intent {
  const t = prepare(request);
  const questions: string[] = [];
  const constraints: IntentConstraint[] = [];

  // Exclusions run first so nothing downstream reads a forbidden noun as a request.
  const { constraints: exclusions, masked } = extractExclusions(t);
  constraints.push(...exclusions);

  // "not just a plain room" is a demand for more, not a ban on rooms.
  const more = new RegExp(MORE_THAN.source, 'g');
  let mm: RegExpExecArray | null;
  while ((mm = more.exec(t))) {
    const { terms } = scanTerms(t.slice(mm.index + mm[0].length));
    if (terms[0]) constraints.push(con('feature', `more than "${terms[0]}"`, 'soft', 0.6, `${mm[0].trim()} ${terms[0]}`, mm.index));
  }

  // Enclosure — the one proven axis, delegated verbatim so its behaviour cannot drift.
  const enc = requestedEnclosure(request);
  if (enc !== 'unstated') {
    constraints.push(con('enclosure', enc, 'hard', 0.9, enc, 0, 'text'));
  } else if (BUILDING_NOUNS.test(masked)) {
    const noun = BUILDING_NOUNS.exec(masked)?.[0] ?? 'this';
    constraints.push(con('enclosure', 'interior or exterior', 'ambiguous', 0.3, noun, 0));
    questions.push(`"${noun}" reads as either a room you stand inside or a building seen from outside — which is wanted?`);
  }

  const env = categorise(masked, ENVIRONMENT_LEX);
  if (env) constraints.push(con('environment', env.value, env.ambiguous ? 'ambiguous' : 'soft', env.confidence, env.evidence, env.at));
  const genre = categorise(masked, GENRE_LEX);
  if (genre) constraints.push(con('genre', genre.value, genre.ambiguous ? 'ambiguous' : 'soft', genre.confidence, genre.evidence, genre.at));
  const purpose = categorise(masked, PURPOSE_LEX);
  if (purpose) constraints.push(con('purpose', purpose.value, purpose.ambiguous ? 'ambiguous' : 'soft', purpose.confidence, purpose.evidence, purpose.at));

  for (const z of categoriseAll(masked, ZONE_LEX)) constraints.push(con('zone', z.value, 'soft', z.confidence, z.evidence, z.at));
  for (const l of categoriseAll(masked, LAYOUT_LEX)) constraints.push(con('layout', l.value, 'soft', l.confidence, l.evidence, l.at));
  for (const f of categoriseAll(masked, FLOW_LEX)) constraints.push(con('flow', f.value, 'soft', f.confidence, f.evidence, f.at));
  for (const s of categoriseAll(masked, STYLE_LEX)) constraints.push(con('style', s.value, 'soft', s.confidence, s.evidence, s.at));

  for (const term of STRUCTURE_TERMS) {
    const re = new RegExp(`\\b${esc(term)}(?:e?s)?\\b`);
    const m = re.exec(masked);
    if (m) constraints.push(con('structure', term, 'strong', 0.8, m[0], m.index));
  }

  const objects = extractObjects(masked);
  constraints.push(...objects);
  const subject = extractSubject(masked);
  if (subject && !objects.some((o) => o.value === subject.value)) constraints.push(subject);

  for (const cue of FEATURE_CUES) {
    const re = new RegExp(cue.source, 'g');
    let fm: RegExpExecArray | null;
    while ((fm = re.exec(masked))) {
      const { terms } = scanTerms(masked.slice(fm.index + fm[0].length));
      for (const v of terms) constraints.push(con('feature', v, 'strong', 0.85, `${fm[0].trim()} ${v}`, fm.index));
    }
  }

  // Focal: explicit marker beats inference, and inference never claims more than soft.
  const focal = new RegExp(FOCAL_CUES.source, 'g');
  let fc: RegExpExecArray | null;
  let namedFocal = false;
  while ((fc = focal.exec(masked))) {
    const after = scanTerms(masked.slice(fc.index + fc[0].length).replace(/^\s*(?:is|should be|will be|:)\s*/, ''));
    let value = after.terms[0];
    if (!value) {
      // "a fireplace as the centrepiece" — the noun sits before the marker.
      const before = masked.slice(0, fc.index).replace(/\s+as\s+(?:the|a|an)?\s*$/, '');
      const frag = before.split(/[,.]|\band\b|\bwith\b|\bincluding\b/).pop() ?? '';
      value = cleanTerm(frag) ?? undefined;
    }
    if (value) {
      constraints.push(con('focal', value, 'strong', 0.85, `${fc[0]} -> ${value}`, fc.index));
      namedFocal = true;
    }
  }
  if (!namedFocal) {
    const candidate = objects.find((o) => !structural(o.value)) ?? subject;
    if (candidate) constraints.push(con('focal', candidate.value, 'soft', 0.4, `inferred from "${candidate.value}"`, candidate.at));
  }

  // Hedged clauses downgrade whatever they contain. "maybe a fireplace" is a question, not a spec.
  const hedges = hedgedRanges(t);
  for (const c of constraints) {
    if (c.strength === 'hard') continue;
    if (!hedges.some(([a, b]) => c.at >= a && c.at <= b)) continue;
    c.strength = 'ambiguous';
    c.confidence = Math.min(c.confidence, 0.35);
  }
  for (const [a, b] of hedges) {
    const clause = t.slice(a, b).trim();
    if (clause) questions.push(`the request is non-committal here — "${clause}". Ask rather than assume.`);
  }

  return { enclosure: enc, constraints, questions };
}

/**
 * The seam for a model-assisted refinement pass. Nothing calls it today and nothing in this file
 * calls a model — the extractor above is pure arithmetic and costs zero tokens. If a refinement
 * pass is ever wired in, its output comes through here, where it is capped at `soft` and tagged
 * `model`, so a hallucinated constraint can never become a gate or outrank the text extractor.
 */
export function mergeModelConstraints(
  intent: Intent,
  extra: readonly { axis: IntentAxisName; value: string; confidence?: number; evidence?: string }[],
): Intent {
  const seen = new Set(intent.constraints.map((c) => `${c.axis}:${c.value}`));
  const merged = [...intent.constraints];
  for (const e of extra) {
    const key = `${e.axis}:${e.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      axis: e.axis,
      value: e.value,
      strength: 'soft',
      confidence: Math.min(0.5, e.confidence ?? 0.5),
      evidence: e.evidence ?? 'model-suggested',
      at: 0,
      source: 'model',
    });
  }
  return { ...intent, constraints: merged, questions: intent.questions };
}

// -----------------------------------------------------------------------------------------------
// The report. One hard gate, everything else advisory.
// -----------------------------------------------------------------------------------------------

export interface IntentReport {
  intent: Intent;
  /** the proven geometry check; null when there is no geometry yet */
  semantic: SemanticCheck | null;
  /** blocks the build. Only ever the enclosure gate. */
  hardFailures: string[];
  /** loud, but the build may proceed with a justification */
  warnings: string[];
  notes: string[];
  questions: string[];
  /** what the user literally asked to see, for the builder and the critic to check against */
  checklist: string[];
}

/**
 * Intent plus whatever geometry can say about it. The hard failures are exactly `semanticCheck`'s,
 * unchanged: nothing new in this file can block a build.
 */
export function intentCheck(request: string, parts?: number[][]): IntentReport {
  const intent = extractIntent(request);
  const semantic = semanticCheck(request, parts);
  const hardFailures = [...(semantic?.failures ?? [])];
  const warnings: string[] = [];
  const notes: string[] = [];

  const by = (axis: IntentAxisName) => intent.constraints.filter((c) => c.axis === axis);
  const excluded = by('exclusion');

  for (const c of excluded) {
    if (c.strength === 'strong') warnings.push(`the request EXCLUDED "${c.value}" — make sure nothing in the scene reads as that`);
    else if (c.strength === 'soft') notes.push(`the request limited "${c.value}" ("${c.evidence}") — keep it restrained rather than absent`);
  }
  for (const c of by('feature')) {
    if (c.strength === 'strong') warnings.push(`the request emphasised "${c.value}" — it will be looked for specifically`);
  }
  for (const c of by('focal')) {
    if (c.strength === 'strong') warnings.push(`"${c.value}" was named as the focal point — the eye must land on it first`);
    else if (c.strength === 'soft') notes.push(`likely focal point: "${c.value}" (inferred, not stated)`);
  }

  // Geometry can speak to exactly one of the new axes: a roof is a covered floor.
  if (semantic) {
    const covered = semantic.enclosure.coveredFloorRatio;
    const wantsRoof = by('structure').some((c) => c.value === 'roof' || c.value === 'ceiling');
    const bansRoof = excluded.some((c) => /\b(?:roof|ceiling|lid)\b/.test(c.value));
    if (wantsRoof && covered < 0.15) {
      warnings.push(
        `a roof or ceiling was asked for but only ${Math.round(covered * 100)}% of the floor has anything above head height — ` +
          'either it was not built or it does not cover the space',
      );
    }
    if (bansRoof && covered > ENCLOSURE_GATES.exteriorMax) {
      warnings.push(`the request excluded a roof but ${Math.round(covered * 100)}% of the floor is covered over`);
    }
  }

  for (const c of intent.constraints) {
    if (c.strength !== 'soft') continue;
    if (c.axis === 'exclusion' || c.axis === 'focal' || c.axis === 'object') continue;
    notes.push(`${c.axis}: ${c.value} (from "${c.evidence}")`);
  }

  // The object axis carries the richer phrasing ("a wooden floor" beats the bare "floor" the
  // structure lexicon found), so objects claim a head noun first and structures only fill gaps.
  const checklist: string[] = [];
  const claimed = new Set<string>();
  const claim = (v: string) => {
    const key = singular(v.split(/\s+/).pop() ?? v);
    if (claimed.has(key) || checklist.includes(v)) return;
    claimed.add(key);
    checklist.push(v);
  };
  for (const c of by('object')) if (c.strength === 'strong') claim(c.value);
  for (const c of by('feature')) if (c.strength === 'strong') claim(c.value);
  for (const c of by('structure')) if (c.strength === 'strong') claim(c.value);

  return { intent, semantic, hardFailures, warnings, notes, questions: intent.questions, checklist };
}

/** One-line summary for a tool result, in the same register as semanticLine. */
export function intentLine(r: IntentReport): string {
  const pick = (axis: IntentAxisName) =>
    r.intent.constraints.filter((c) => c.axis === axis && c.strength !== 'ambiguous').map((c) => c.value);
  const bits: string[] = [];
  const env = pick('environment')[0];
  const genre = pick('genre')[0];
  const focal = pick('focal')[0];
  if (r.intent.enclosure !== 'unstated') bits.push(r.intent.enclosure);
  if (env) bits.push(env);
  if (genre) bits.push(genre);
  if (focal) bits.push(`focal: ${focal}`);
  const ex = pick('exclusion');
  if (ex.length) bits.push(`excludes ${ex.join(', ')}`);
  bits.push(`${r.checklist.length} requested element${r.checklist.length === 1 ? '' : 's'}`);
  return bits.join('; ');
}
