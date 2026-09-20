import type { StatusName } from '../status-icon-model.ts';

/**
 * WHAT THIS PROJECT OWES, AND WHETHER IT CAN SHIP.
 *
 * The data half, so the decisions are testable under `node --test` without a DOM. It
 * mirrors the worker's `provenance.ts` response shape; nothing here computes an
 * obligation, because the worker already did and two implementations of a licence rule
 * would eventually disagree about somebody's real project.
 *
 * The one judgement this module makes is about EMPTINESS, and it is the whole reason
 * the file exists. A project with no recorded assets and a project that is genuinely
 * compliant both produce an empty report. Before the ledger had a producer at all,
 * every project looked like the second. So `readiness` never says "clear to publish"
 * on the strength of an empty list — it says nothing has been recorded yet, which is
 * the true statement.
 */

export type { StatusName };

export interface CreditEntry {
  assetId: string;
  name: string;
  author: string;
  /** Verbatim, as recorded. Never rewritten into a prettier form for display. */
  licence: string;
  licenceUrl: string;
  sourceUrl: string;
  modifications: string[];
}

export interface SourceCredit {
  text: string;
  url: string;
  when: 'always' | 'live_api';
  why: string;
}

export interface AttributionReport {
  projectId: string;
  generatedAt: string;
  original: CreditEntry[];
  userGenerated: CreditEntry[];
  required: CreditEntry[];
  courtesy: CreditEntry[];
  sourceCredits: SourceCredit[];
  unaccounted: string[];
}

export interface ComplianceFinding {
  assetId: string;
  name: string;
  code: string;
  severity: 'blocker' | 'warning';
  why: string;
  remediation: string;
}

export interface CommercialUseReport {
  projectId: string;
  ok: boolean;
  checked: number;
  counts: Record<string, number>;
  findings: ComplianceFinding[];
}

export interface AttributionResponse {
  attribution: AttributionReport;
  commercialUse: CommercialUseReport;
  /**
   * The credits document, rendered by the WORKER.
   *
   * Shipped rather than reassembled here. The first version of this panel built its own
   * version of the same block, which is how the tool table came to exist three times —
   * and this one has a harder job than a label: `renderAttribution` prints a loud
   * INCOMPLETE section for unaccounted assets, and a client-side copy that forgot it
   * would hand someone a credits file that quietly claims to be complete.
   */
  // OPTIONAL, and the compiler now enforces what a comment used to only describe: a
  // worker one version behind sends no such field, and a bare `res.credits.trim()`
  // type-checked cleanly and took the whole workspace down once already. Read it
  // through copyableCredits.
  credits?: string;
}

/**
 * Whether the panel can offer to hand over the credits document.
 *
 * Two separate questions, and both have to be yes:
 *
 *  - is anything actually owed? `renderAttribution` always writes a "Credits" header,
 *    so a non-empty string is not evidence of an obligation;
 *  - did the worker send the document at all? The browser and the worker deploy
 *    separately, so a worker one version behind returns no `credits` field. The panel
 *    reached for it and crashed the whole workspace, which is a bad trade for a copy
 *    button. It now shows everything else and simply does not offer the copy, because
 *    it cannot hand over a document it does not have.
 */
export function copyableCredits(res: AttributionResponse): string | null {
  const owed = res.attribution.required.length > 0 || res.attribution.sourceCredits.length > 0;
  if (!owed) return null;
  return typeof res.credits === 'string' && res.credits.trim() !== '' ? res.credits : null;
}

/**
 * The four things this panel can honestly say.
 *
 * `nothing_recorded` is deliberately NOT `clear`. Apple records an asset when it places
 * one, so an empty ledger means either "no third-party asset has been used" or "the
 * recording did not happen" — and from the browser those are the same bytes. Saying
 * "clear to publish" would be a claim about the second case that nothing supports.
 */
/**
 * Named for what it is. `roadmap/model.ts` already exports a `Readiness` — 'landed' |
 * 'in-progress' | 'ready' | 'waiting', about a milestone — and this one is about whether
 * a project can be published. Two different facts under one name in one app is a
 * collision I introduced; a reader seeing `Readiness` imported should not have to check
 * which module it came from.
 */
export type PublishReadiness = 'nothing_recorded' | 'blocked' | 'unaccounted' | 'obligations' | 'clear';

export interface PublishVerdict {
  state: PublishReadiness;
  /** The heading. A statement, never a score. */
  title: string;
  /** One sentence of what it means, including what it does NOT mean. */
  body: string;
}

export function readiness(res: AttributionResponse): PublishVerdict {
  const { attribution: a, commercialUse: c } = res;

  if (c.checked === 0) {
    return {
      state: 'nothing_recorded',
      title: 'Nothing recorded yet',
      body:
        'Apple notes an asset here when it places one in your project. Nothing has been '
        + 'noted, which means either that no third-party asset has been used or that none '
        + 'reached this list — so this is not a clearance to publish.',
    };
  }

  const blockers = c.findings.filter((f) => f.severity === 'blocker');

  // MISSING PROVENANCE IS NOT A FINDING AGAINST THE ASSET. It is the absence of one,
  // and the two must not be drawn the same way.
  //
  // The worker grades `missing_provenance` as a blocker, which is right for the export
  // gate it was written for: you cannot certify what you cannot account for. But the
  // first version of this panel rendered that as red, "N assets cannot ship
  // commercially", with "each of these has to be replaced or cleared first" — and since
  // there is no catalogue to look an id up in, EVERY asset Apple inserts lands
  // unaccounted, so every user with a placed asset was told their game was not
  // shippable. Apple never determined that. It checked the asset was free, publicly
  // visible, script-free and from a trusted creator, and then did not know its licence.
  //
  // Saying so is the honest verdict, and it is a different verdict.
  const determined = blockers.filter((f) => f.code !== 'missing_provenance');
  const unknown = blockers.filter((f) => f.code === 'missing_provenance');

  if (determined.length > 0) {
    return {
      state: 'blocked',
      title: determined.length === 1 ? '1 asset cannot ship commercially' : `${determined.length} assets cannot ship commercially`,
      body:
        'A Roblox experience with monetisation on — or merely eligible for the engagement '
        + 'payout — is a commercial use. Each of these has to be replaced or cleared first.',
    };
  }

  if (unknown.length > 0) {
    return {
      state: 'unaccounted',
      title: unknown.length === 1 ? "1 asset Apple cannot account for" : `${unknown.length} assets Apple cannot account for`,
      body:
        'Apple placed these by Roblox asset id and has no licence record for them. That is '
        + 'not a finding that they cannot be used — it is the absence of one, so nothing here '
        + 'clears them either. Check them yourself before you publish.',
    };
  }

  const owed = a.required.length + a.sourceCredits.length;
  if (owed > 0) {
    return {
      state: 'obligations',
      title: owed === 1 ? '1 credit has to ship with this game' : `${owed} credits have to ship with this game`,
      body: 'Nothing here blocks publishing. These are obligations the licences attach, not defects.',
    };
  }

  // "Nothing owed" would be a claim about the PROJECT; this is a claim about the
  // ledger, and the title has to say which. A place can hold assets the ledger never
  // saw — anything placed before this ledger had a producer, and anything whose write
  // was lost (see the note on recordPlacedAsset in the worker).
  return {
    state: 'clear',
    title: `${c.checked === 1 ? '1 recorded asset' : `${c.checked} recorded assets`}, nothing owed on them`,
    body: 'Every asset in this ledger is accounted for and none of their licences require a credit.',
  };
}

/** The tone each verdict is drawn in. §16.2: green is proven, red is failure, amber is an open obligation. */
export const PUBLISH_TONE: Record<PublishReadiness, 'good' | 'bad' | 'warn' | 'muted'> = {
  clear: 'good',
  blocked: 'bad',
  // Amber, not red. An unknown is an open question, and red would state the answer.
  unaccounted: 'warn',
  obligations: 'warn',
  nothing_recorded: 'muted',
};

/**
 * One credit line, ready to paste into a game description.
 *
 * Modifications are named because most permissive licences require saying that a work
 * was changed, and "as published" is stated rather than left blank so a reader can tell
 * an unmodified asset from one whose modifications were never recorded.
 */
export function creditLine(e: CreditEntry): string {
  const mods = e.modifications.length > 0 ? ` (modified: ${e.modifications.join(', ')})` : ' (as published)';
  return `${e.name} by ${e.author} — ${e.licence}${mods}`;
}

/**
 * The canonical mark for a tone, so the icon and the border cannot disagree.
 *
 * The panel used to choose the icon with its own nested ternary over `PublishReadiness`, which
 * is a second mapping of the same fact — and the fact it maps is the one thing on that
 * screen where being wrong matters most. A fifth verdict would have been added to
 * PUBLISH_TONE and missed here, leaving the border amber and the mark on `info`.
 * Deriving both from the tone means there is only one place to add it.
 */
export const TONE_MARK: Record<'good' | 'bad' | 'warn' | 'muted', StatusName> = {
  good: 'success',
  bad: 'error',
  warn: 'warning',
  muted: 'info',
};
