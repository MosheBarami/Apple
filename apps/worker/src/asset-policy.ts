// Which asset sources a build may actually use.
//
// The dialog in the web app collects an answer and stores it. This is the half that makes the
// answer matter: until something READS it, the preference is a row in a table and the build does
// whatever it would have done anyway — a control that appears to work and governs nothing.
//
// PURE ON PURPOSE. No env, no D1, no DO. The policy is resolved once where the user is known and
// handed here as a value, which is what lets the decision be tested without standing up a Durable
// Object — and what stops a per-call lookup appearing in the hot path of every tool.
import { ASSET_SOURCE_CHOICES, type AssetSourceChoice, type AssetSourcePolicy } from '@golem/shared';
import type { AssetSource } from './assets';

/**
 * What each choice in the dialog authorises, in the engine's own vocabulary.
 *
 * `from_scratch` covers four engine sources rather than one, and the reason is worth stating:
 * building out of parts, generating geometry in the customer's own Studio session, sculpting
 * terrain and using Studio's built-ins are all "nothing came from anywhere else" to the person who
 * ticked that box. Splitting them in the dialog would ask somebody to have an opinion about an
 * implementation detail.
 */
export const POLICY_TO_SOURCE: Readonly<Record<AssetSourceChoice, readonly AssetSource[]>> = {
  apple_library: ['library'],
  creator_store: ['creator_store'],
  from_scratch: ['procedural', 'generation_service', 'terrain', 'builtin'],
};

/** Human wording, matched to the dialog so a refusal and the control read as the same thing. */
const CHOICE_NAME: Readonly<Record<AssetSourceChoice, string>> = {
  apple_library: 'the Apple library',
  creator_store: 'the Roblox Creator Store',
  from_scratch: 'building from scratch out of parts',
};

/** The choice an engine source belongs to, or null when nothing governs it. */
export function choiceFor(source: AssetSource): AssetSourceChoice | null {
  for (const choice of ASSET_SOURCE_CHOICES) {
    if ((POLICY_TO_SOURCE[choice] as readonly string[]).includes(source)) return choice;
  }
  return null;
}

/**
 * The engine sources this policy permits.
 *
 * AN ABSENT POLICY ALLOWS NOTHING. Answering for somebody by allowing everything is how half a
 * million third-party assets end up in a game whose owner was never asked — and the owner of this
 * product was, in fact, not asked before 299 assets went into his Roblox account.
 */
export function allowedSources(policy: AssetSourcePolicy | null | undefined): AssetSource[] {
  if (!policy || !Array.isArray(policy.allow)) return [];
  const out: AssetSource[] = [];
  for (const choice of policy.allow) {
    for (const source of POLICY_TO_SOURCE[choice] ?? []) if (!out.includes(source)) out.push(source);
  }
  return out;
}

/**
 * Why this source may not be used, or null when it may.
 *
 * The sentence names the switch AND what is still available, because the reader is an agent: told
 * only "not allowed", it reports a capability gap that is really a preference, and the person
 * reading the transcript concludes the product cannot do something it can.
 */
export function sourceRefusal(
  policy: AssetSourcePolicy | null | undefined,
  source: AssetSource,
): string | null {
  const allowed = allowedSources(policy);
  if (allowed.includes(source)) return null;

  const choice = choiceFor(source);
  const name = choice ? CHOICE_NAME[choice] : source;

  // NEVER ANSWERED and DELIBERATELY TURNED OFF are different facts with different fixes: one
  // person needs to answer a dialog, the other needs to change their mind.
  if (!policy || policy.allow.length === 0) {
    return `this project has not been asked which asset sources it may use, so ${name} is not `
      + 'available yet. Apple asks before the first build, and the answer is kept in Settings under '
      + 'Connections. Build from parts for now, or ask the person to pick their sources.';
  }

  const rest = allowed.length
    ? `What IS allowed here: ${[...new Set(allowed.map((s) => CHOICE_NAME[choiceFor(s) ?? 'from_scratch']))].join(', ')}.`
    : 'Nothing else is allowed either.';
  return `${name} is switched off for this project, so it cannot be used. It can be turned back `
    + `on in Settings under Connections. ${rest}`;
}
