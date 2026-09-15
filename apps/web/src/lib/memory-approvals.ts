// What Apple has ASKED to remember, waiting on an answer.
//
// Under the `review` memory setting the distiller stops writing facts into memory and starts
// proposing them. The worker has held that queue, and the accept/discard decision, for a while;
// nothing in the product could see it, and tools.ts was meanwhile telling the model each fact was
// "Queued for the user to approve in the memory panel" — a panel with no such queue.
//
// The decisions in this file, none of which belong in JSX:
//
//   A MISSING QUEUE IS "NOTHING PENDING". Everything off the network is parsed state, and this is
//   read on every open of the panel someone needs in order to correct a memory that is wrong about
//   their project. A throw here takes away the fix.
//
//   A 404 IS AN ANSWER, NOT A FAILURE. The worker returns it deliberately when the proposal is no
//   longer pending, so that a panel left open in a second tab cannot report a decision the user
//   never made. It has to read as "someone already answered this" and refetch — rendering it as an
//   error describes the wrong event and leaves the gone proposal on screen.
//
//   A DECISION NAMES ITS SUBJECT. The worker matches on the fact's TEXT. A request without it is a
//   decision about whatever happens to be first in the queue by the time it lands.

export interface PendingMemory {
  summary: string | null;
  facts: string[];
}

const cleanFact = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const text = v.trim();
  return text ? text : null;
};

/** The queue inside a memory response, however malformed the response turns out to be. */
export function pendingFrom(memory: unknown): PendingMemory {
  const raw = (memory && typeof memory === 'object' ? (memory as { suggested?: unknown }).suggested : null) as
    | { summary?: unknown; facts?: unknown }
    | null
    | undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { summary: null, facts: [] };
  const facts = Array.isArray(raw.facts) ? raw.facts.map(cleanFact).filter((f): f is string => f !== null) : [];
  return { summary: cleanFact(raw.summary), facts };
}

/** A summary alone is still a queue — it is one proposal, and it is still waiting on a person. */
export function hasPending(memory: unknown): boolean {
  const p = pendingFrom(memory);
  return p.summary !== null || p.facts.length > 0;
}

/**
 * Was this refusal the worker saying "that is not waiting for a decision"?
 *
 * Narrow on purpose: only a 404 from the API. A network failure, a 403 or a 500 are all things
 * that went wrong, and treating them as "already answered" would quietly drop the proposal from
 * the screen while it is still pending on the server.
 */
export function isAlreadyAnswered(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'ApiError' && (err as { status?: unknown }).status === 404;
}

export type SuggestionDecision = 'accept' | 'discard';

/**
 * The body for one decision.
 *
 * `fact: null` means the proposed SUMMARY, which is the one proposal with no text to match on and
 * is addressed by `target` instead — the shape the worker's handler already branches on.
 */
export function decisionBody(decision: SuggestionDecision, fact: string | null): { decision: SuggestionDecision; fact?: string; target?: 'summary' } {
  return fact === null ? { decision, target: 'summary' } : { decision, fact };
}
