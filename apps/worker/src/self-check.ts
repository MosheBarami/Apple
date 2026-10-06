/**
 * THE SELF-CHECK BEFORE ANSWERING — its switch and its bounds (M1 of docs/autonomy/PHASE-3-4-PLAN.md, cut down in M4).
 *
 * WHY IT EXISTS. The owner's benchmark of 2026-10-02 found an agent that claimed things it never
 * checked: text it had made invisible was called visible, white paint was called red. Nothing in the
 * run loop compared the final reply with what the run had actually observed. The self-check is two
 * parts that share one run-scoped evidence ledger (evidence-ledger.ts):
 *
 *   1. the claim audit — the reply's concrete claims (colours, visible text, counts, behaviours) are
 *      checked against the ledger; claims it cannot support go back to the agent, and what is still
 *      unchecked at the end is said plainly in one line. The agent's own words are never rewritten
 *      (claim-audit.ts).
 *   2. the layout flags — measured from the typed tree, no render (scene-flags.ts), sent to the agent once.
 *
 * There is NO look in it. Until M4 a third part (the `look` tool, a completion gate and a blind critique)
 * sent screenshots to a vision model; the product has no vision any more, so the check says nothing about
 * how a thing looks, and the reply may not either (the audit leaves such claims unsupported).
 *
 * THE SWITCH: `SELF_CHECK` (a Worker var; `wrangler secret put` is not needed, it is not a secret).
 *
 *   off   the run as it was before the check existed: no ledger, no audit.
 *   on    ledger + deterministic claim audit. No model call.
 *   full  `on` plus the cheap text judge over the final reply (claim-audit-judge.ts), at most once per
 *         answer that could be the last.
 *
 * DEFAULT WITH NO VALUE: `on` everywhere except `ENVIRONMENT=production`, where it is `off`. The deployed
 * worker sets `SELF_CHECK=on` in wrangler.studpilot.jsonc. Tests and local development run with the check on.
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
 *   auditRounds   how many times unsupported claims are sent back before the plain note is the answer.
 */
export const SELF_CHECK_LIMITS = Object.freeze({
  auditRounds: 2,
});
