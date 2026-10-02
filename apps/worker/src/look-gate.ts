/**
 * THE COMPLETION GATE — a run that changed the place does not answer before one look at it.
 *
 * STRUCTURAL. The gate reads two things and nothing else: the evidence ledger (did the work change,
 * in a way the viewport can show, since the last look) and what this run was offered (is Studio
 * connected, is `look` available). It never reads the request, never classifies it, never asks
 * whether the work "is visual": whether a thing looks right and fits is the agent's decision, and
 * the harness's job here is only to make sure the agent has SEEN the place before it says anything
 * about it. "In a way the viewport can show" is about WHERE the change landed (the workspace and the
 * lighting, or somewhere unknown), never about what it was for: a screen or a script is not in the
 * picture, so a look at the viewport would not be a look at it, and the gate does not ask for one.
 * Claims about what a player's screen shows are the audit's, and they need a player check.
 *
 * BOUNDED (self-check.ts SELF_CHECK_LIMITS):
 *   - one forced look: when the run changed things and never looked, the harness runs the look itself;
 *   - two repair rounds: after a look, if the agent changed things again, it is ASKED to look again,
 *     at most twice;
 *   - a per-run look cap that no path can exceed;
 *   - a look that just could not run is not demanded again: the gate steps aside and the final line
 *     says plainly that the work was not looked at.
 *
 * Pure: a decision from a ledger. `noteGate` is the only mutation, and it is the caller's to make.
 */
import { lookNeeded, type EvidenceLedger } from './evidence-ledger.ts';
import { SELF_CHECK_LIMITS } from './self-check.ts';

export type GateDecision =
  | { action: 'pass'; why: string }
  | { action: 'force_look'; why: string }
  | { action: 'ask_look'; why: string };

export interface GateInput {
  ledger: EvidenceLedger;
  /** `look` is in the set this run was offered, after mode, permission and plugin narrowing. */
  lookAvailable: boolean;
  studioConnected: boolean;
  /** Accepted and ignored on purpose: the decision must be the same whatever was asked. */
  request?: unknown;
}

export function decideLookGate(i: GateInput): GateDecision {
  const l = i.ledger;
  if (!i.studioConnected) return { action: 'pass', why: 'Studio is not connected, so nothing can be looked at' };
  if (!i.lookAvailable) return { action: 'pass', why: 'the connected Studio does not offer a look' };
  if (!lookNeeded(l)) return { action: 'pass', why: 'nothing has changed since the last look' };
  if (l.lookCount >= SELF_CHECK_LIMITS.looksPerRun) return { action: 'pass', why: 'the look limit for this run is used' };
  if (l.lastLookFailedAt !== null && l.lastLookFailedAt >= l.viewChangedSeq) return { action: 'pass', why: 'a look could not run on this work' };
  if (l.forcedLooks < SELF_CHECK_LIMITS.forcedLooks && l.lookCount === 0) {
    return { action: 'force_look', why: 'the run changed the place and has not looked at it' };
  }
  if (l.repairRounds < SELF_CHECK_LIMITS.repairRounds) {
    return { action: 'ask_look', why: 'the run changed the place again after its last look' };
  }
  return { action: 'pass', why: 'the repair rounds for this run are used' };
}

/** Count a decision against the run's bounds. The caller does this when it ACTS on the decision. */
export function noteGate(l: EvidenceLedger, d: GateDecision): void {
  if (d.action === 'force_look') l.forcedLooks += 1;
  else if (d.action === 'ask_look') l.repairRounds += 1;
}

/**
 * What the final line must admit when the work was not looked at after its last change. Null when it was,
 * or when nothing changed. Plain words: this is read by the user.
 */
export function lookExtra(l: EvidenceLedger, o: { lookAvailable: boolean }): string | null {
  if (!lookNeeded(l)) return null;
  return o.lookAvailable
    ? 'how it looks after my last changes'
    : 'how it looks in Studio (I could not look at it this time)';
}
