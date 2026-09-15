// What Apple believes about a project — and the two questions that decides.
//
// Memory is written by a model, from the conversation, and then steers every later run. That makes
// it the one part of the product that can be confidently wrong about the user's own project and
// keep acting on it: a fact like "the doors use a custom DoorService" survives long after the user
// tore that out.
//
// Three properties are kept here, apart from the DO so they can be tested without one:
//
//   1. SHAPE. Both writers — a model and a person — can post twenty facts or a novel, so one
//      normaliser runs over both and the viewer never meets a shape the editor cannot produce.
//   2. CREDENTIALS NEVER BECOME MEMORY. A transcript that contained an API key would otherwise put
//      that key into the system prompt of every later run, forever, where nobody looks. The
//      scanner in redaction.ts already knows what a credential looks like; memory is a write path
//      it was never wired to.
//   3. WHO SAID IT. A fact the person wrote and a fact the model inferred are different things, and
//      a list that renders them identically is asking the user to audit their own words. Origin is
//      recorded per fact — and where it is NOT recorded, the answer is "not recorded" rather than a
//      guess, because a guessed attribution is worse than a missing one.
//
// The review mode is the fourth thing: with it on, the model may PROPOSE but not change what is
// already remembered. See MEMORY_MODES.
import { redactSecrets } from './redaction';

/** Matches what `updateMemory` writes: a short prose summary and a handful of discrete facts. */
export interface Memory {
  summary: string | null;
  facts: string[];
  /**
   * What the model would like to remember, and has not been allowed to yet.
   *
   * Populated only under `review`. Nothing in here reaches a prompt: a suggestion is a question put
   * to the user, and a question that acts on the answer it has not received is not a question.
   */
  suggested: { summary: string | null; facts: string[] };
  /**
   * Who each ACTIVE fact came from, keyed by the fact's fingerprint.
   *
   * A map rather than a parallel array: an array has to be kept aligned with `facts` by every
   * writer, and the first one that forgets renders the model's fact as the user's. A fingerprint is
   * derived from the text itself, so it cannot drift out of alignment — and an entry with no
   * fingerprint in the map is UNATTRIBUTED, which the viewer says out loud.
   */
  origins: Record<string, FactOrigin>;
}

export const FACT_ORIGINS = ['user', 'model', 'import'] as const;
export type FactOrigin = (typeof FACT_ORIGINS)[number];
export const isFactOrigin = (v: unknown): v is FactOrigin => typeof v === 'string' && (FACT_ORIGINS as readonly string[]).includes(v);

/**
 * How much the model may do to memory without being asked.
 *
 *   auto   — today's behaviour: what it distils becomes memory.
 *   review — it may propose; the person accepts or discards. Active memory changes only by hand.
 *   off    — nothing is written and nothing is read. See `memoryReadable`.
 *
 * The vocabulary lives here rather than in preferences.ts because these three words are what the
 * memory functions branch on; preferences.ts imports it, so the setting and the behaviour cannot
 * come to disagree about what "review" means.
 */
export const MEMORY_MODES = ['auto', 'review', 'off'] as const;
export type MemoryMode = (typeof MEMORY_MODES)[number];
export const isMemoryMode = (v: unknown): v is MemoryMode => typeof v === 'string' && (MEMORY_MODES as readonly string[]).includes(v);
export const MEMORY_MODE_DEFAULT: MemoryMode = 'auto';

/** May anything be written to memory in this mode? */
export const memoryWritable = (mode: MemoryMode): boolean => mode !== 'off';
/** May what is stored reach the prompt in this mode? `off` means off, not "stop adding to it". */
export const memoryReadable = (mode: MemoryMode): boolean => mode !== 'off';

export const SUMMARY_MAX = 3000;
export const FACT_MAX = 300;
/** The cap `updateMemory` already applies when the model proposes facts. */
export const FACTS_MAX = 12;
/** Pending proposals. Bounded for the same reason facts are: this list is rendered and reviewed. */
export const SUGGESTED_MAX = 12;

/**
 * One fact's storable text, or null if there is none.
 *
 * Whitespace is collapsed BEFORE the length cap and before the fingerprint, so a reflowed fact is
 * the same fact — otherwise the model restating something with a line break added would look new.
 */
export function normaliseFact(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const collapsed = input.trim().replace(/\s+/g, ' ');
  if (!collapsed) return null;
  // Redacted BEFORE the cap: truncating first can leave half a credential behind, which is still
  // enough to identify the account it belongs to and is no longer recognisable as a secret.
  const safe = redactSecrets(collapsed).text.slice(0, FACT_MAX);
  return safe.trim() || null;
}

/**
 * The identity of a fact, for deduplication and for attribution.
 *
 * Case-insensitive because the model restates the same fact in different words across turns, and a
 * list holding the same thing three times reads as broken rather than as thorough.
 */
export function factFingerprint(fact: string): string {
  return fact.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normaliseSummary(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const safe = redactSecrets(input.trim()).text.slice(0, SUMMARY_MAX);
  return safe.trim() || null;
}

function normaliseFactList(input: unknown, max: number, exclude?: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of Array.isArray(input) ? input : []) {
    const text = normaliseFact(raw);
    if (!text) continue;
    const fp = factFingerprint(text);
    if (seen.has(fp) || exclude?.has(fp)) continue;
    seen.add(fp);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Clean a memory that came from outside — a model, or a user's edit, or storage written by an
 * older deploy that had neither `suggested` nor `origins`.
 *
 * Both live sources are untrusted in the same way, so normalising in one place means the stored
 * shape is the same whichever wrote it. Origins are PRUNED to the facts that exist and are never
 * invented: a fingerprint with no entry means nobody recorded who said it.
 */
export function normaliseMemory(input: unknown): Memory {
  const raw = (input ?? {}) as { summary?: unknown; facts?: unknown; suggested?: unknown; origins?: unknown };

  const summary = normaliseSummary(raw.summary);
  const facts = normaliseFactList(raw.facts, FACTS_MAX);
  const active = new Set(facts.map(factFingerprint));

  const suggestedRaw = (raw.suggested ?? {}) as { summary?: unknown; facts?: unknown };
  // A suggestion for something already remembered is not a decision anyone needs to make, so it is
  // dropped rather than shown — `exclude` is what keeps the review list from filling with noise.
  const suggested = {
    summary: normaliseSummary(suggestedRaw.summary),
    facts: normaliseFactList(suggestedRaw.facts, SUGGESTED_MAX, active),
  };

  const origins: Record<string, FactOrigin> = {};
  const originsRaw = raw.origins;
  if (originsRaw && typeof originsRaw === 'object' && !Array.isArray(originsRaw)) {
    for (const [fp, who] of Object.entries(originsRaw as Record<string, unknown>)) {
      // Own keys only, values checked against the list: a stored blob is a request body with extra
      // steps, and `origins.__proto__` would be a property assignment rather than a fact.
      if (!active.has(fp) || !isFactOrigin(who)) continue;
      origins[fp] = who;
    }
  }
  return { summary, facts, suggested, origins };
}

/** Is there anything here worth showing? A pending proposal counts — it is waiting on the user. */
export function isMemoryEmpty(m: Partial<Memory>): boolean {
  return !m.summary && !(m.facts ?? []).length && !m.suggested?.summary && !(m.suggested?.facts ?? []).length;
}

/** Who said this fact, or null when nothing recorded it. Never a default — see `Memory.origins`. */
export function originOf(m: Memory, fact: string): FactOrigin | null {
  return m.origins[factFingerprint(fact)] ?? null;
}

function withOrigins(memory: Memory, assign: (fp: string) => FactOrigin | null): Memory {
  const origins: Record<string, FactOrigin> = {};
  for (const fact of memory.facts) {
    const fp = factFingerprint(fact);
    const who = memory.origins[fp] ?? assign(fp);
    if (who) origins[fp] = who;
  }
  return { ...memory, origins };
}

/**
 * A person's own edit of the whole memory.
 *
 * A fact that was already there KEEPS its origin — a user who corrects a typo in one line has not
 * claimed authorship of the other eleven — and a fact that is new in this submission is theirs,
 * because they are the one who wrote it. Pending suggestions survive: the editor does not answer
 * the review list, and silently discarding proposals because someone fixed a typo would be a
 * decision the product made on their behalf.
 */
export function applyUserEdit(prev: unknown, incoming: unknown): Memory {
  const before = normaliseMemory(prev);
  const next = normaliseMemory(incoming);
  const merged: Memory = {
    summary: next.summary,
    facts: next.facts,
    // The submitted body is the FACT list, not the suggestion list: an editor that could write
    // `suggested` would let a client approve a proposal without a decision being recorded.
    suggested: {
      summary: before.suggested.summary,
      facts: before.suggested.facts.filter((f) => !next.facts.some((a) => factFingerprint(a) === factFingerprint(f))),
    },
    origins: before.origins,
  };
  return withOrigins(merged, () => 'user');
}

/**
 * What the distiller produced, met with what is already stored.
 *
 * `auto` replaces the fact list, which is what makes memory stay current — the model drops what is
 * no longer true. `review` may not touch the active list at all: it proposes, and the difference
 * between proposing and doing is the entire content of the setting.
 */
export function applyModelUpdate(
  prev: unknown,
  proposed: { summary?: unknown; facts?: unknown },
  mode: MemoryMode,
): Memory {
  const before = normaliseMemory(prev);
  if (!memoryWritable(mode)) return before;

  const summary = normaliseSummary(proposed.summary);
  const facts = normaliseFactList(proposed.facts, FACTS_MAX);

  if (mode === 'auto') {
    const next: Memory = {
      // A model that returned no summary has not proposed erasing the one that is stored.
      summary: summary ?? before.summary,
      facts: facts.length ? facts : before.facts,
      suggested: before.suggested,
      origins: before.origins,
    };
    return normaliseMemory(withOrigins(next, () => 'model'));
  }

  const active = new Set(before.facts.map(factFingerprint));
  const pending = new Set(before.suggested.facts.map(factFingerprint));
  const additions = facts.filter((f) => !active.has(factFingerprint(f)) && !pending.has(factFingerprint(f)));
  return normaliseMemory({
    ...before,
    suggested: {
      // A proposed summary identical to the stored one is not a proposal.
      summary: summary && summary !== before.summary ? summary : before.suggested.summary,
      facts: [...before.suggested.facts, ...additions].slice(0, SUGGESTED_MAX),
    },
  });
}

/**
 * The `remember` tool, which writes ONE fact rather than a distilled set.
 *
 * Same rule as the distiller: under review it joins the queue, under auto it lands, under off
 * nothing happens at all. The caller is told which, because a tool that reports `saved: true` for a
 * write that did not happen is teaching the model something false about the world.
 */
export function addModelFact(
  prev: unknown,
  fact: unknown,
  mode: MemoryMode,
): { memory: Memory; outcome: 'saved' | 'suggested' | 'refused' } {
  const before = normaliseMemory(prev);
  const text = normaliseFact(fact);
  if (!text || !memoryWritable(mode)) return { memory: before, outcome: 'refused' };
  const fp = factFingerprint(text);
  if (before.facts.some((f) => factFingerprint(f) === fp)) return { memory: before, outcome: 'saved' };

  if (mode === 'review') {
    if (before.suggested.facts.some((f) => factFingerprint(f) === fp)) return { memory: before, outcome: 'suggested' };
    return {
      memory: normaliseMemory({ ...before, suggested: { ...before.suggested, facts: [...before.suggested.facts, text].slice(0, SUGGESTED_MAX) } }),
      outcome: 'suggested',
    };
  }
  // Newest last, oldest evicted: the cap is on the list the prompt carries, and the fact a step
  // just learned is the one the next step is about.
  const facts = [...before.facts.filter((f) => factFingerprint(f) !== fp), text].slice(-FACTS_MAX);
  return {
    memory: normaliseMemory(withOrigins({ ...before, facts }, (candidate) => (candidate === fp ? 'model' : null))),
    outcome: 'saved',
  };
}

export type SuggestionDecision = 'accept' | 'discard';
export const isSuggestionDecision = (v: unknown): v is SuggestionDecision => v === 'accept' || v === 'discard';

/**
 * Answer one proposal.
 *
 * `matched` is reported separately from the resulting memory because "there was nothing by that
 * name" and "it was discarded" are different outcomes, and a route that returned the same 200 for
 * both would let a stale panel report a decision that was never recorded.
 */
export function decideSuggestedFact(
  prev: unknown,
  fact: unknown,
  decision: SuggestionDecision,
): { memory: Memory; matched: boolean } {
  const before = normaliseMemory(prev);
  const text = normaliseFact(fact);
  if (!text) return { memory: before, matched: false };
  const fp = factFingerprint(text);
  const found = before.suggested.facts.find((f) => factFingerprint(f) === fp);
  if (!found) return { memory: before, matched: false };

  const suggested = { ...before.suggested, facts: before.suggested.facts.filter((f) => factFingerprint(f) !== fp) };
  if (decision === 'discard') return { memory: normaliseMemory({ ...before, suggested }), matched: true };

  // Accepted: it becomes an active fact, and it is recorded as the MODEL's — the person approved it,
  // they did not write it, and an accept that re-attributed it would erase the only trace that a
  // model proposed it in the first place.
  const facts = [...before.facts, found].slice(0, FACTS_MAX);
  const origins = { ...before.origins, [fp]: 'model' as FactOrigin };
  return { memory: normaliseMemory({ ...before, facts, suggested, origins }), matched: true };
}

export function decideSuggestedSummary(
  prev: unknown,
  decision: SuggestionDecision,
): { memory: Memory; matched: boolean } {
  const before = normaliseMemory(prev);
  if (!before.suggested.summary) return { memory: before, matched: false };
  const summary = decision === 'accept' ? before.suggested.summary : before.summary;
  return { memory: normaliseMemory({ ...before, summary, suggested: { ...before.suggested, summary: null } }), matched: true };
}

/**
 * What this run's prompt may carry.
 *
 * One function, so "memory is off" cannot be true of the write path and false of the read path —
 * which is the version of this setting that would leave a user watching Apple act on memory it
 * promised to stop keeping.
 */
export function memoryForPrompt(m: unknown, mode: MemoryMode): { summary: string | null; facts: string[] } {
  if (!memoryReadable(mode)) return { summary: null, facts: [] };
  const memory = normaliseMemory(m);
  return { summary: memory.summary, facts: memory.facts };
}
