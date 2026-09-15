/**
 * Reading `GET /api/shared/:id/members/:userId/impact` into the sentences that go in front of a
 * Remove button.
 *
 * The route is a read — it writes nothing — and it answers two different kinds of thing: COUNTS of
 * what the departing member holds, taken in SQL from the project's collaboration store, and the
 * EFFECTS of the removal, stated explicitly because a list of numbers invites the reader to assume
 * the numbers are about to be destroyed. They are not: comments, versions and approvals are
 * history, and history is kept.
 *
 * THE FIELD THIS MODULE EXISTS FOR IS `footprintAvailable`.
 *
 * The counts come from a Durable Object that can be unreachable. The obvious rendering —
 * `impact.footprint?.comments ?? 0` — turns "we could not count" into "they have none", in front of
 * the one decision in this panel that cannot be taken back. Unknown is never zero here, and never
 * silence either: an unreadable preview produces `counts: null` AND a warning, because a reading
 * with nothing in it renders as "removing them does nothing", which is the most reassuring possible
 * way to be wrong.
 */

export interface ImpactCount {
  label: string;
  value: number;
}

export interface ImpactReading {
  /** Null means WE DO NOT KNOW. It never means zero — see the header. */
  counts: ImpactCount[] | null;
  /** What the removal does and does not do. Only the flags that are true. */
  effects: string[];
  /** The things the reader must not miss. Rendered above the button, not below it. */
  warnings: string[];
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function readImpact(raw: unknown): ImpactReading {
  if (!raw || typeof raw !== 'object') {
    return { counts: null, effects: [], warnings: ['We could not read what removing them would do.'] };
  }
  const impact = raw as {
    member?: unknown;
    footprint?: Record<string, unknown> | null;
    footprintAvailable?: unknown;
    effects?: Record<string, unknown>;
    partial?: unknown;
  };

  const warnings: string[] = [];
  const effects: string[] = [];

  if (impact.member === null) {
    warnings.push('There is no membership for this person in this project, so there is nothing to remove.');
  }

  // Only a literal true counts as "we counted it". An absent flag from a worker that does not send
  // one is not a promise that the numbers are real.
  const counted = impact.footprintAvailable === true && impact.footprint !== null && typeof impact.footprint === 'object';
  let counts: ImpactCount[] | null = null;

  if (!counted) {
    warnings.push('We could not count the work they hold in this project, so the numbers below are missing rather than zero.');
  } else {
    const f = impact.footprint as Record<string, unknown>;
    counts = [
      { label: 'Comments', value: num(f.comments) },
      { label: 'Of those, still open', value: num(f.openComments) },
      { label: 'Checkpoints they authored', value: num(f.versions) },
      { label: 'Open reviews waiting on them', value: num(f.reviewsAwaiting) },
      { label: 'Reviews they asked for, still open', value: num(f.reviewsRequested) },
      { label: 'Approvals they gave', value: num(f.approvals) },
    ];

    const sole = num(f.reviewsSoleReviewer);
    if (sole > 0) {
      warnings.push(
        `They are the only reviewer on ${sole} open ${sole === 1 ? 'review' : 'reviews'}. Once they are gone ${sole === 1 ? 'it' : 'they'} can never be approved — reassign the reviewer first.`,
      );
    }
    if (f.authorsCurrentHead === true) {
      warnings.push('They wrote the checkpoint this project is currently sitting on. It stays, and it stays theirs.');
    }
  }

  if (impact.partial === true) {
    warnings.push('Part of this project’s member list could not be read, so their standing here may be incomplete.');
  }

  const e = (impact.effects ?? {}) as Record<string, unknown>;
  if (e.accessEndsImmediately === true) effects.push('Their access ends immediately — any open session stops working.');
  if (e.linkGrantRevoked === true) effects.push('The share link they joined with stops working for them.');
  if (e.reRedemptionBarred === true) effects.push('Pressing that link again will not let them back in.');
  if (e.ownershipUnchanged === true) effects.push('Nothing about who owns this project changes.');
  if (e.historyRetained === true) effects.push('Their comments, checkpoints and approvals are kept, still in their name.');

  return { counts, effects, warnings };
}
