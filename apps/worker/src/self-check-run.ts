/**
 * THE DECISION AT THE MOMENT OF ANSWERING — gate first, then the claim audit, then the plain line.
 *
 * The run loop (do/session.ts) reaches a point where the agent has stopped calling tools and has written
 * its answer. This is the whole self-check policy for that point, as one pure function over the ledger,
 * so that every bound and every ordering is testable without a Durable Object:
 *
 *   1. THE GATE (look-gate.ts). The run changed the place and has not looked at it: force one look. The
 *      gate comes first because the audit may lean on what the look saw, and because a reply is not worth
 *      auditing before the agent has seen the place it is describing.
 *   2. THE AUDIT (claim-audit.ts). Claims the evidence contradicts, or cannot support but a tool the
 *      agent was offered could settle, go back to the agent, at most `auditRounds` times.
 *   3. THE LINE. What is still unsettled is said to the user in one plain line AFTER the agent's own
 *      words. The agent's words are never rewritten.
 *
 * Two things the run OWES come before all three, and are decided by the caller from the run's own state (world-pass.ts: a
 * composer built a base and nothing was built on it; judge-gate.ts: its latest judge said "not ready"): `owed` is the steer
 * to send, `admit` are the plain lines that say what is still not done once those bounds are used. They are inputs, so the
 * order and the bounds stay testable here and no new place pushes into the transcript.
 *
 * Every path terminates: the three counters live on the ledger and only ever go up.
 */
import type { EvidenceLedger } from './evidence-ledger.ts';
import { decideLookGate, lookExtra, noteGate } from './look-gate.ts';
import { actionable, ALREADY_SHOWN, auditReply, notCheckedLine, resultOf, steerForFindings, type Finding, type Offered } from './claim-audit.ts';
import { SELF_CHECK_LIMITS } from './self-check.ts';

export type AnswerCheck =
  | { action: 'force_look' }
  | { action: 'steer'; kind: 'look' | 'audit' | 'world' | 'judge'; message: string }
  | { action: 'finish'; note?: string };

export interface AnswerInput {
  ledger: EvidenceLedger;
  /** The agent's reply, exactly as written. */
  reply: string;
  lookAvailable: boolean;
  studioConnected: boolean;
  /** Which kinds of check the agent could still run, for deciding what is worth sending back. */
  can: Offered;
  /** Findings from the optional judge. They are added to the audit's; they never remove one. */
  extra?: Finding[];
  /** Work the run still owes (the base of a composed game not built on; a "not ready" verdict not answered): sent back before anything else. */
  owed?: { kind: 'world' | 'judge'; message: string };
  /** What is still not done after the bounds on `owed` were used, as plain lines for the final note. */
  admit?: string[];
}

export function checkAtAnswer(i: AnswerInput): AnswerCheck {
  const l = i.ledger;
  if (i.owed) return { action: 'steer', kind: i.owed.kind, message: i.owed.message };
  const admit = (i.admit ?? []).filter(Boolean);
  const finish = (note: string | null): AnswerCheck => {
    const text = [note, ...admit].filter((s): s is string => !!s).join('\n\n');
    return text ? { action: 'finish', note: text } : { action: 'finish' };
  };
  const gate = decideLookGate({ ledger: l, lookAvailable: i.lookAvailable, studioConnected: i.studioConnected });
  if (gate.action === 'force_look') {
    noteGate(l, gate);
    return { action: 'force_look' };
  }
  if (gate.action === 'ask_look') {
    noteGate(l, gate);
    return { action: 'steer', kind: 'look', message: askLookMessage() };
  }

  // A run that never touched Studio has nothing a claim could be checked against.
  if (l.seq === 0) return finish(null);

  const base = auditReply(i.reply, l);
  const result = i.extra?.length ? resultOf(base.claims, [...base.findings, ...i.extra]) : base;
  if (actionable(result, i.can) && l.auditRounds < SELF_CHECK_LIMITS.auditRounds) {
    const message = steerForFindings(result, i.can);
    if (message) {
      l.auditRounds += 1;
      return { action: 'steer', kind: 'audit', message };
    }
  }
  const extras = [lookExtra(l, { lookAvailable: i.lookAvailable })].filter((s): s is string => !!s);
  return finish(notCheckedLine(result, extras));
}

/**
 * Whether the optional judge is worth a model call right now: the gate would let the answer through (a reply the agent
 * is about to be sent back to look for is not final), the run did something in Studio, and an audit round is left to
 * send a finding back in. The judge is only ever asked about a reply that could be the last.
 */
export function judgeWorthIt(i: Omit<AnswerInput, 'extra'>): boolean {
  const l = i.ledger;
  if (l.seq === 0 || l.auditRounds >= SELF_CHECK_LIMITS.auditRounds) return false;
  return decideLookGate({ ledger: l, lookAvailable: i.lookAvailable, studioConnected: i.studioConnected }).action === 'pass';
}

/** After a forced look: the observations, handed to the agent as data it must act on. `body` is already fenced. */
export function forcedLookMessage(body: string): string {
  return (
    "Before you answer, StudPilot looked at what you changed in the user's Studio viewport, from several angles including a player's eye level. " +
    'These are observations, not a score; you decide what they mean.\n' +
    `${body}\n` +
    'If something you were asked for is not seen, or something looks wrong, fix it now with a tool call. ' +
    'Then answer again, briefly: say only what the observations and your own checks support, and say plainly what you could not check. ' +
    ALREADY_SHOWN
  );
}

export function askLookMessage(): string {
  return (
    'You changed the place after your last look, so what you are about to say has not been looked at. ' +
    'Call look now (with `expect` naming what the request should show), fix anything it reports, then answer again. ' +
    ALREADY_SHOWN
  );
}

