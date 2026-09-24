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
import { ASSET_SOURCES, type AssetSource, type AssetProvenanceSource } from './assets';

// Re-exported so a test in this module's own suite can walk the real engine-source list rather
// than keeping a second, hand-typed copy of it that could drift from `./assets`.
export { ASSET_SOURCES };

/**
 * Which dialog choice governs this engine source, or `null` when none does.
 *
 * Exhaustive by construction, the same discipline `ASSET_ORIGINALITY` (asset-provenance.ts) and
 * `SOURCE_CREDITS` (provenance.ts) already use one file away: `Record<AssetSource, …>` means
 * adding a member to `ASSET_SOURCES` fails the typecheck until someone decides, in writing, which
 * choice authorises it — or writes `null` to say none does. Without this, a new engine source
 * would fall through every case in a hand-rolled search function and read as "not governed by
 * anything", which is indistinguishable from "forgotten".
 *
 * `null` is a real answer, not a placeholder for one: it says a source is reachable by every
 * policy because no dialog choice claims it, and it must be written rather than defaulted into.
 * Every current source is claimed by some choice, so no entry uses it today — but the type keeps
 * the option available on purpose, the same way `SOURCE_CREDITS` keeps `null` for "no credit
 * owed" rather than omitting sources that need none.
 */
export const SOURCE_CHOICE: Readonly<Record<AssetSource, AssetSourceChoice | null>> = {
  creator_store: 'creator_store',
  procedural: 'from_scratch',
  generation_service: 'from_scratch',
  terrain: 'from_scratch',
  builtin: 'from_scratch',
};

/** The choice an engine source belongs to, or null when nothing governs it. */
export function choiceFor(source: AssetSource): AssetSourceChoice | null {
  return SOURCE_CHOICE[source];
}

/**
 * What each choice in the dialog authorises, in the engine's own vocabulary.
 *
 * MECHANICALLY DERIVED from `SOURCE_CHOICE`, not hand-written a second time: two tables that
 * could disagree about the same fact are worse than the silent-fallthrough problem this file
 * exists to fix. `SOURCE_CHOICE` is the one place a person writes down "this engine source
 * belongs to that dialog choice"; this is just that same information grouped the other way round
 * for the callers — `allowedSources` below — that need "given a choice, which sources does it
 * unlock" rather than "given a source, which choice unlocks it".
 *
 * `from_scratch` covers four engine sources rather than one, and the reason is worth stating:
 * building out of parts, generating geometry in the customer's own Studio session, sculpting
 * terrain and using Studio's built-ins are all "nothing came from anywhere else" to the person who
 * ticked that box. Splitting them in the dialog would ask somebody to have an opinion about an
 * implementation detail.
 */
export const POLICY_TO_SOURCE: Readonly<Record<AssetSourceChoice, readonly AssetSource[]>> = {
  creator_store: ASSET_SOURCES.filter((source) => SOURCE_CHOICE[source] === 'creator_store'),
  from_scratch: ASSET_SOURCES.filter((source) => SOURCE_CHOICE[source] === 'from_scratch'),
};

/** Human wording, matched to the dialog so a refusal and the control read as the same thing. */
const CHOICE_NAME: Readonly<Record<AssetSourceChoice, string>> = {
  creator_store: 'the Roblox Creator Store',
  from_scratch: 'building from scratch out of parts',
};

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
 * Does this project still owe the answer? No policy, or one that allows nothing — the same two
 * states the web dialog treats as unanswered (`owesAnswer`, apps/web/src/lib/asset-sources.ts).
 * Owing the answer allows NOTHING; this only decides whether somebody should be asked.
 */
export function answerOwed(policy: AssetSourcePolicy | null | undefined): boolean {
  return !policy || !Array.isArray(policy.allow) || policy.allow.length === 0;
}

/**
 * Why this source may not be used, or null when it may.
 *
 * The sentence names the switch AND what is still available, because the reader is an agent: told
 * only "not allowed", it reports a capability gap that is really a preference, and the person
 * reading the transcript concludes the product cannot do something it can.
 *
 * `ask` puts the question to whoever is here (F-059) and says whether anybody was. It is called
 * only when the answer is OWED — a person who switched a source off has answered — and asking
 * changes nothing about what is allowed.
 */
export function sourceRefusal(
  policy: AssetSourcePolicy | null | undefined,
  source: AssetSource,
  ask?: () => boolean,
): string | null {
  const allowed = allowedSources(policy);
  if (allowed.includes(source)) return null;

  const choice = choiceFor(source);
  const name = choice ? CHOICE_NAME[choice] : source;

  // NEVER ANSWERED and DELIBERATELY TURNED OFF are different facts with different fixes: one
  // person needs to answer a dialog, the other needs to change their mind.
  if (answerOwed(policy)) {
    // F-059: the old fallback told the agent to build from parts while the library had every prop.
    // Asking is not permission to substitute another source, even if the person never answers.
    if (ask?.() === true) {
      return `this project has not said yet which asset sources Apple may use, so ${name} is not `
        + 'available yet. Apple has just asked the person (the question is showing in the Apple web app '
        + 'and in the Studio dock), and their answer applies to this run as soon as they give it. Do not '
        + 'hand-build a replacement for this. Continue with work that needs no assets (scripts, '
        + 'library UI, terrain, layout), and try this again after the person answers. If no answer '
        + 'arrives by the end of the run, leave it unbuilt and explain which choice is missing.';
    }
    return `this project has not been asked which asset sources it may use, so ${name} is not `
      + 'available yet. Nobody connected can answer the source question right now. The answer can '
      + 'be set in Settings under Connections. Do not substitute parts or another source; continue '
      + 'with work that needs no assets, leave it unbuilt and explain which choice is missing.';
  }

  const rest = allowed.length
    ? `What IS allowed here: ${[...new Set(allowed.map((s) => CHOICE_NAME[choiceFor(s) ?? 'from_scratch']))].join(', ')}.`
    : 'Nothing else is allowed either.';
  return `${name} is switched off for this project, so it cannot be used. It can be turned back `
    + `on in Settings under Connections. ${rest}`;
}

/**
 * The policy a Studio dock answer stands for, or null when it is not an answer.
 *
 * The same thing the web dialog saves when "Remember this and stop asking" is ticked: the picked
 * choices, remembered. Anything outside the live vocabulary is dropped, and nothing picked is not
 * an answer — storing it would leave the project still owing one.
 */
export function policyFromStudioAnswer(value: unknown): AssetSourcePolicy | null {
  const allow = (value as { allow?: unknown } | null)?.allow;
  if (!Array.isArray(allow)) return null;
  const out: AssetSourceChoice[] = [];
  for (const c of allow) {
    if ((ASSET_SOURCE_CHOICES as readonly unknown[]).includes(c) && !out.includes(c as AssetSourceChoice)) out.push(c as AssetSourceChoice);
  }
  return out.length ? { mode: 'remember', allow: out } : null;
}

/**
 * Which engine source a tool-recorded PROVENANCE stands for, when the asset-source policy has an
 * opinion about it at all.
 *
 * `Record<AssetProvenanceSource, AssetSource | null>`, exhaustive by construction for the same
 * reason `SOURCE_CHOICE` above is: adding a new provenance kind to `./assets` fails the typecheck
 * here until someone writes down, in this file, whether the asset-source policy governs it.
 *
 * `search_result` is a real choice APPLE made on the customer's behalf — a Creator Store search
 * result — so it maps onto the engine source the dialog can restrict. (`library` was the other
 * one, and it went with the catalogue on 2026-09-20.)
 *
 * `user_supplied` is `null` DELIBERATELY, and this is a different fact from "not governed yet": the
 * asset-source policy is about where APPLE may go looking. An id the person pasted into their own
 * place is that person choosing, not Apple choosing, and refusing it would mean a customer cannot
 * use an asset they already own. It still faces the full security gate exactly as it does today —
 * this table changes nothing about verification, only about which SOURCE decision applies.
 *
 * `model_output` and `unknown` are `null` for a third reason, not the same as `user_supplied`'s:
 * `verifyCreatorStoreAsset`'s own provenance gate (`assets.ts`) refuses both unconditionally,
 * before any source-policy question would matter — an id that only ever appeared in generated
 * text, or whose origin was never recorded, was never a source Apple picked, so there is nothing
 * here for this policy to say yes or no to.
 */
export const PROVENANCE_SOURCE: Readonly<Record<AssetProvenanceSource, AssetSource | null>> = {
  search_result: 'creator_store',
  user_supplied: null,
  model_output: null,
  unknown: null,
};

/**
 * Why an id with this provenance may not be inserted, or null when it may — including when this
 * provenance is not a source-policy decision at all (see `PROVENANCE_SOURCE`).
 */
export function provenanceRefusal(
  policy: AssetSourcePolicy | null | undefined,
  provenance: AssetProvenanceSource,
  ask?: () => boolean,
): string | null {
  const source = PROVENANCE_SOURCE[provenance];
  if (source === null) return null;
  return sourceRefusal(policy, source, ask);
}
