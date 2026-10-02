/**
 * THE SELF-CHECK BEFORE ANSWERING — its switch and its bounds (M1 of docs/autonomy/PHASE-3-4-PLAN.md).
 *
 * WHY IT EXISTS. The owner's benchmark of 2026-10-02 found an agent that claimed things it never
 * checked: text it had made invisible was called visible, white paint was called red. Nothing in the
 * run loop compared the final reply with what the run had actually observed. The self-check is three
 * parts that share one run-scoped evidence ledger (evidence-ledger.ts):
 *
 *   1. `look` — frames what was changed from several angles, player eye level included, and asks the
 *      vision role for OBSERVATIONS (seen / not seen / cannot tell), never a score (studio-look.ts).
 *   2. the completion gate — a run that changed the place does not answer before one look at it
 *      (look-gate.ts). Structural: no keyword decides whether a request "is visual".
 *   3. the claim audit — the reply's concrete claims (colours, visible text, counts, behaviours) are
 *      checked against the ledger; claims it cannot support go back to the agent, and what is still
 *      unchecked at the end is said plainly in one line. The agent's own words are never rewritten
 *      (claim-audit.ts).
 *
 * THE SWITCH: `SELF_CHECK` (a Worker var; `wrangler secret put` is not needed, it is not a secret).
 *
 *   off   no ledger, no gate, no audit. The `look` tool is still offered, so the agent may use it.
 *   on    ledger + completion gate + deterministic claim audit. No extra model call except `look`'s
 *         one vision call (and a look only ever happens once something was changed).
 *   full  `on` plus the cheap text judge over the final reply (claim-audit-judge.ts).
 *
 * DEFAULT WITH NO VALUE: `on` everywhere except `ENVIRONMENT=production`, where it is `off`. The
 * deployed worker therefore behaves exactly as before until the owner decides. The decision he owes is
 * the Q21 line: Q21 (2026-09-28) said no automatic self-critic loop; the 2026-10-02 directive says the
 * opposite and does not mention Q21. Tests and local development run with the check on, which is what
 * "default on in tests" means.
 */

export type SelfCheckMode = 'off' | 'on' | 'full';

const OFF = new Set(['off', '0', 'false', 'no']);
const ON = new Set(['on', '1', 'true', 'yes']);

/** Read the switch. An explicit, recognised value wins; anything else falls to the environment default. */
export function selfCheckMode(env: { SELF_CHECK?: unknown; ENVIRONMENT?: unknown }): SelfCheckMode {
  const raw = typeof env.SELF_CHECK === 'string' ? env.SELF_CHECK.trim().toLowerCase() : '';
  if (OFF.has(raw)) return 'off';
  if (ON.has(raw)) return 'on';
  if (raw === 'full') return 'full';
  return env.ENVIRONMENT === 'production' ? 'off' : 'on';
}

/**
 * The bounds of the check. Every one is a cost and honesty decision, so they are frozen here in one
 * place and a test pins them as a tripwire.
 *
 *   forcedLooks   the gate itself runs a look once, when the run changed things and never looked.
 *   repairRounds  after a look, how many times the agent is sent back to look again after repairing.
 *   looksPerRun   every look, whoever asked for it.
 *   auditRounds   how many times unsupported claims are sent back before the plain note is the answer.
 */
export const SELF_CHECK_LIMITS = Object.freeze({
  forcedLooks: 1,
  repairRounds: 2,
  looksPerRun: 6,
  auditRounds: 2,
});
