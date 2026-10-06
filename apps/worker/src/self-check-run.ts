/**
 * THE DECISION AT THE MOMENT OF ANSWERING — the claim audit, then the plain line.
 *
 * The run loop (do/session.ts) reaches a point where the agent has stopped calling tools and has written
 * its answer. This is the whole self-check policy for that point, as one pure function over the ledger,
 * so that every bound and every ordering is testable without a Durable Object:
 *
 *   1. THE AUDIT (claim-audit.ts). Claims the evidence contradicts, or cannot support but a tool the
 *      agent was offered could settle, go back to the agent, at most `auditRounds` times.
 *   2. THE LINE. What is still unsettled is said to the user in one plain line AFTER the agent's own
 *      words. The agent's words are never rewritten.
 *
 * Nothing here looks at the place: the product has no vision (M4), so there is no look to force and no
 * "how it looks" to admit. A claim about appearance is simply never supported, and the audit says so.
 *
 * Every path terminates: the counter lives on the ledger and only ever goes up.
 */
import type { EvidenceLedger } from './evidence-ledger.ts';
import { actionable, auditReply, notCheckedLine, resultOf, steerForFindings, type Finding, type Offered } from './claim-audit.ts';
import { SELF_CHECK_LIMITS } from './self-check.ts';

export type AnswerCheck =
  | { action: 'steer'; kind: 'audit'; message: string }
  | { action: 'finish'; note?: string };

export interface AnswerInput {
  ledger: EvidenceLedger;
  /** The agent's reply, exactly as written. */
  reply: string;
  /** Which kinds of check the agent could still run, for deciding what is worth sending back. */
  can: Offered;
  /** Findings from the optional judge. They are added to the audit's; they never remove one. */
  extra?: Finding[];
}

export function checkAtAnswer(i: AnswerInput): AnswerCheck {
  const l = i.ledger;
  // A run that never touched Studio has nothing a claim could be checked against.
  if (l.seq === 0) return { action: 'finish' };

  const base = auditReply(i.reply, l);
  const result = i.extra?.length ? resultOf(base.claims, [...base.findings, ...i.extra]) : base;
  if (actionable(result, i.can) && l.auditRounds < SELF_CHECK_LIMITS.auditRounds) {
    const message = steerForFindings(result, i.can);
    if (message) {
      l.auditRounds += 1;
      return { action: 'steer', kind: 'audit', message };
    }
  }
  const note = notCheckedLine(result);
  return note ? { action: 'finish', note } : { action: 'finish' };
}

/**
 * Whether the optional judge is worth a model call right now: the run did something in Studio, and an audit round is left to
 * send a finding back in. The judge is only ever asked about a reply that could be the last.
 */
export function judgeWorthIt(i: Omit<AnswerInput, 'extra'>): boolean {
  const l = i.ledger;
  return l.seq !== 0 && l.auditRounds < SELF_CHECK_LIMITS.auditRounds;
}
