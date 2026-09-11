// The dependency spine: stages down a single line, cards to the right of it.
//
// Deliberately not a graph renderer. A force-directed layout of a dozen
// milestones is a picture of a plan rather than a plan you can read, and it
// cannot be tabbed through. A spine has one axis — "this has to happen before
// that" — which is the only relation the data actually carries. Everything else
// (which milestone needs which) is written on the cards as named, focusable
// chips, so a keyboard or a screen reader follows the same edges the eye does.
import { useState } from 'react';
import { Icon, PATH } from '../ws/primitives';
import { ReadinessNode } from './marks';
import { MilestoneCard, type BriefIntent } from './milestone-card';
import type { PlacedMilestone, Readiness, RoadmapStage } from './model';

interface Props {
  stages: RoadmapStage[];
  onJumpTo: (milestoneId: string) => void;
  onBrief: (milestoneId: string, intent: BriefIntent) => void;
  busy: { id: string; intent: BriefIntent } | null;
}

/** A stage is as far along as its least-finished milestone. */
function stageReadiness(milestones: PlacedMilestone[]): Readiness {
  if (milestones.length === 0) return 'waiting';
  if (milestones.every((p) => p.readiness === 'landed')) return 'landed';
  if (milestones.some((p) => p.readiness === 'in-progress')) return 'in-progress';
  if (milestones.some((p) => p.readiness === 'ready')) return 'ready';
  return 'waiting';
}

function Stage({ stage, onJumpTo, onBrief, busy }: { stage: RoadmapStage } & Omit<Props, 'stages'>) {
  const readiness = stageReadiness(stage.milestones);
  // A finished stage folds away: it is a receipt, and the plan is about what
  // is left. Nothing else ever starts collapsed — hiding outstanding work
  // would be a lie of omission.
  const [open, setOpen] = useState(!stage.landed);
  const bodyId = `stage-${stage.depth}`;
  const done = stage.milestones.filter((p) => p.readiness === 'landed').length;

  return (
    <li className={`rm-stage is-${readiness}${open ? ' is-open' : ''}`}>
      <div className="rm-stage__rail" aria-hidden="true">
        <span className="rm-stage__node">
          <ReadinessNode readiness={readiness} />
        </span>
        <span className="rm-stage__line" />
      </div>

      <div className="rm-stage__body">
        {stage.landed ? (
          <button
            type="button"
            className="rm-stage__label rm-stage__label--toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={`rm-stage__chev${open ? ' is-open' : ''}`} aria-hidden="true">
              <Icon d={PATH.chevronRight} size={12} />
            </span>
            {stage.label}
            {/* A separator the screen reader can hear: without it the label and
                the count run together into "Stage 11 landed". */}
            <span className="rm-stage__count">
              {stage.milestones.length === 1 ? '· 1 landed' : `· ${stage.milestones.length} landed`}
            </span>
          </button>
        ) : (
          <h2 className="rm-stage__label">
            {stage.label}
            <span className="rm-stage__count">
              · {done}/{stage.milestones.length} landed
            </span>
            {/* Same depth means nothing orders these against each other. */}
            {stage.parallel && <span className="rm-stage__parallel">any order</span>}
          </h2>
        )}

        <div id={bodyId} className="rm-stage__cards" hidden={!open}>
          {stage.milestones.map((p) => (
            <MilestoneCard
              key={p.milestone.id}
              placed={p}
              onJumpTo={onJumpTo}
              onBrief={onBrief}
              busy={busy?.id === p.milestone.id ? busy.intent : null}
            />
          ))}
        </div>
      </div>
    </li>
  );
}

export function RoadmapSpine({ stages, onJumpTo, onBrief, busy }: Props) {
  return (
    <ol className="rm-spine">
      {stages.map((stage) => (
        <Stage key={stage.depth} stage={stage} onJumpTo={onJumpTo} onBrief={onBrief} busy={busy} />
      ))}
    </ol>
  );
}
