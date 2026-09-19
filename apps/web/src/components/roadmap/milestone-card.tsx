// One milestone, as a card: what it is, where it sits, what the scan actually
// saw, and the two things you can do with it.
//
// Every row inside the detail panel is conditional. A milestone whose record
// carries no evidence shows no evidence row rather than a hopeful placeholder —
// the same rule the Thinking card follows, for the same reason: this surface is
// where an invented sentence would be most believable.
import { useEffect, useId, useState } from 'react';
import { Icon, PATH } from '../ws/primitives';
import { COMPLEXITY, ComplexityMark, READINESS_LABEL, ReadinessNode } from './marks';
import { creditRangeLabel, effortLabel, type MilestoneRef, type PlacedMilestone } from './model';
import './milestone-card.css';

/** Which run the user is asking for. Both fetch the same brief. */
export type BriefIntent = 'plan' | 'build';

interface Props {
  placed: PlacedMilestone;
  /** Move focus to another card — how a dependency chip is followed. */
  onJumpTo: (milestoneId: string) => void;
  onBrief: (milestoneId: string, intent: BriefIntent) => void;
  /** The intent currently being fetched, for this card only. */
  busy: BriefIntent | null;
}

/**
 * What the scan concluded, in the user's terms. `unknown` is stated as not
 * knowing rather than smoothed into either of the confident answers.
 */
const DETECTED_COPY = {
  present: 'Apple found this already in your place.',
  absent: 'Apple did not find this in your place.',
  unknown: 'Apple could not tell from the scan whether this exists yet.',
} as const;

function RefChips({ refs, onJumpTo }: { refs: MilestoneRef[]; onJumpTo: (id: string) => void }) {
  return (
    <span className="rm-refs">
      {refs.map((r) => (
        <button key={r.id} type="button" className={`rm-ref is-${r.status}`} onClick={() => onJumpTo(r.id)}>
          <span className="rm-ref__dot" aria-hidden="true" />
          {r.title}
          <span className="gx-sr">{r.status === 'done' ? ' — landed' : ' — not landed yet'}</span>
        </button>
      ))}
    </span>
  );
}

export function MilestoneCard({ placed, onJumpTo, onBrief, busy }: Props) {
  const { milestone: m, readiness, dependencies, waitingOn, unlocks } = placed;
  const detailId = useId();
  // The milestone actually being worked on opens with its reasoning visible:
  // it is the one card whose "why" the user is most likely to want right now.
  const [open, setOpen] = useState(readiness === 'in-progress');

  // A card can change state under a refetch — a run finishing turns the current
  // milestone into a landed one. Follow that rather than stranding the panel.
  useEffect(() => {
    if (readiness === 'in-progress') setOpen(true);
  }, [readiness]);

  const evidence = m.evidence ?? [];
  const hasDetail =
    Boolean(m.impact) || dependencies.length > 0 || unlocks.length > 0 || evidence.length > 0 || Boolean(m.verify);

  return (
    <article
      id={`milestone-${m.id}`}
      tabIndex={-1}
      className={`rm-card is-${readiness}`}
      style={{ ['--rm-weight' as string]: COMPLEXITY[m.complexity]?.accent ?? 'var(--accent)' }}
      aria-label={`${m.title} — ${READINESS_LABEL[readiness]}`}
    >
      <div className="rm-card__head">
        <div className="rm-card__heading">
          <h3 className="rm-card__title">{m.title}</h3>
          {/* `why` is the worker's player-facing rationale, so it is the line
              the card leads with rather than something hidden behind a toggle. */}
          <p className="rm-card__summary">{m.why}</p>
        </div>
        <span className={`rm-status is-${readiness}`}>
          <ReadinessNode readiness={readiness} size={15} />
          {READINESS_LABEL[readiness]}
        </span>
      </div>

      <div className="rm-card__facts">
        {COMPLEXITY[m.complexity] && (
          <span className="rm-fact">
            <ComplexityMark complexity={m.complexity} />
            {COMPLEXITY[m.complexity].label}
          </span>
        )}
        {m.effort && <span className="chip">{effortLabel(m.effort)}</span>}
        {/* The effort chip beside it is in runs, which is not a unit anybody is billed in. This
            is the same size expressed in the unit the account is actually charged, derived by
            the worker from the same `runs`. `creditRangeLabel` returns '' rather than a zero
            when the worker could not derive a figure, so no chip appears at all. */}
        {creditRangeLabel(m.creditsLow, m.creditsHigh) && (
          <span className="chip">{creditRangeLabel(m.creditsLow, m.creditsHigh)}</span>
        )}
        {m.detected === 'present' && readiness !== 'landed' && (
          <span className="rm-card__note">Parts of this may already exist</span>
        )}
      </div>

      {waitingOn.length > 0 && (
        <p className="rm-card__waiting">
          <span className="rm-card__waiting-label">Waits for</span>
          <RefChips refs={waitingOn} onJumpTo={onJumpTo} />
        </p>
      )}

      <div className="rm-card__actions">
        {hasDetail && (
          <button
            type="button"
            className="rm-disclose"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={`rm-disclose__chev${open ? ' is-open' : ''}`} aria-hidden="true">
              <Icon d={PATH.chevronRight} size={13} />
            </span>
            {open ? 'Hide detail' : 'Detail'}
          </button>
        )}

        <span className="rm-card__spacer" />

        {/* Both actions fetch the same brief; they differ in the run the brief
            would be handed to. A landed milestone offers planning only —
            "build" on something that already exists has no agreed meaning. */}
        <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => onBrief(m.id, 'plan')}>
          {busy === 'plan' ? 'Reading…' : readiness === 'landed' ? 'Plan changes' : 'Plan'}
        </button>
        {readiness !== 'landed' && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={busy !== null}
            onClick={() => onBrief(m.id, 'build')}
          >
            {busy === 'build' ? 'Reading…' : 'Build'}
          </button>
        )}
      </div>

      {hasDetail && (
        <div id={detailId} className="rm-detail" hidden={!open}>
          {m.impact && (
            <div className="rm-detail__row">
              <span className="rm-detail__key">For the player</span>
              <p className="rm-detail__val">{m.impact}</p>
            </div>
          )}
          <div className="rm-detail__row">
            <span className="rm-detail__key">The scan</span>
            <div>
              <p className="rm-detail__val">{DETECTED_COPY[m.detected] ?? DETECTED_COPY.unknown}</p>
              {evidence.length > 0 && (
                <ul className="rm-detail__list">
                  {evidence.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              {m.verify && <p className="rm-detail__verify">{m.verify}</p>}
            </div>
          </div>
          {dependencies.length > 0 && (
            <div className="rm-detail__row">
              <span className="rm-detail__key">Needs first</span>
              <RefChips refs={dependencies} onJumpTo={onJumpTo} />
            </div>
          )}
          {unlocks.length > 0 && (
            <div className="rm-detail__row">
              <span className="rm-detail__key">Unlocks</span>
              <RefChips refs={unlocks} onJumpTo={onJumpTo} />
            </div>
          )}
        </div>
      )}
    </article>
  );
}
