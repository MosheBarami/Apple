// What Apple believes about a project.
//
// Memory is written by a model, from the conversation, without anyone reading it first. That makes
// it the one part of the product that can be confidently wrong about the user's own project and
// keep acting on it — a fact like "the doors use a custom DoorService" survives long after the
// user tore that out, and steers every later run.
//
// So it has to be readable, and it has to be correctable. These are the shape rules both the
// viewer and the editor go through, kept apart from the DO so they can be tested without one.

/** Matches what `updateMemory` writes: a short prose summary and a handful of discrete facts. */
export interface Memory {
  summary: string | null;
  facts: string[];
}

export const SUMMARY_MAX = 3000;
export const FACT_MAX = 300;
/** The cap `updateMemory` already applies when the model proposes facts. */
export const FACTS_MAX = 12;

/**
 * Clean a memory that came from outside — a model, or a user's edit.
 *
 * Both sources are untrusted in the same way: the model can propose twenty facts or a novel, and a
 * client can post anything at all. Normalising in one place means the stored shape is the same
 * whichever wrote it, so the viewer never has to render a case the editor cannot produce.
 */
export function normaliseMemory(input: unknown): Memory {
  const raw = (input ?? {}) as { summary?: unknown; facts?: unknown };

  const summary =
    typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim().slice(0, SUMMARY_MAX) : null;

  const seen = new Set<string>();
  const facts: string[] = [];
  for (const f of Array.isArray(raw.facts) ? raw.facts : []) {
    if (typeof f !== 'string') continue;
    const text = f.trim().replace(/\s+/g, ' ').slice(0, FACT_MAX);
    if (!text) continue;
    // Deduplicated case-insensitively: the model restates the same fact in slightly different
    // words across turns, and a list with the same thing three times reads as broken rather than
    // as thorough.
    const fingerprint = text.toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    facts.push(text);
    if (facts.length >= FACTS_MAX) break;
  }

  return { summary, facts };
}

/** Is there anything here worth showing? */
export function isMemoryEmpty(m: Memory): boolean {
  return !m.summary && m.facts.length === 0;
}
