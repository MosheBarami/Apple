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
  credits: string;
}

/**
 * The four things this panel can honestly say.
 *
 * `nothing_recorded` is deliberately NOT `clear`. Golem records an asset when it places
 * one, so an empty ledger means either "no third-party asset has been used" or "the
 * recording did not happen" — and from the browser those are the same bytes. Saying
 * "clear to publish" would be a claim about the second case that nothing supports.
 */
export type Readiness = 'nothing_recorded' | 'blocked' | 'obligations' | 'clear';

export interface ReadinessVerdict {
  state: Readiness;
  /** The heading. A statement, never a score. */
  title: string;
  /** One sentence of what it means, including what it does NOT mean. */
  body: string;
}

export function readiness(res: AttributionResponse): ReadinessVerdict {
  const { attribution: a, commercialUse: c } = res;

  if (c.checked === 0) {
    return {
      state: 'nothing_recorded',
      title: 'Nothing recorded yet',
      body:
        'Golem notes an asset here when it places one in your project. Nothing has been '
        + 'noted, which means either that no third-party asset has been used or that none '
        + 'reached this list — so this is not a clearance to publish.',
    };
  }

  const blockers = c.findings.filter((f) => f.severity === 'blocker');
  if (blockers.length > 0) {
    return {
      state: 'blocked',
      title: blockers.length === 1 ? '1 asset cannot ship commercially' : `${blockers.length} assets cannot ship commercially`,
      body:
        'A Roblox experience with monetisation on — or merely eligible for the engagement '
        + 'payout — is a commercial use. Each of these has to be replaced or cleared first.',
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

  return {
    state: 'clear',
    title: `${c.checked === 1 ? '1 asset' : `${c.checked} assets`} checked, nothing owed`,
    body: 'Every recorded asset is accounted for and none of their licences require a credit.',
  };
}

/** The tone each verdict is drawn in. §16.2: green is proven, red is failure, amber is an open obligation. */
export const READINESS_TONE: Record<Readiness, 'good' | 'bad' | 'warn' | 'muted'> = {
  clear: 'good',
  blocked: 'bad',
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
