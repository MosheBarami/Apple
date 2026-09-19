/**
 * The bounded Studio companion for a conversation.
 *
 * A conversation is where a builder asks for a change and reads Apple's answer;
 * this is where the evidence from that change belongs. The stage owns only the
 * layout around the existing, data-backed Studio surfaces. It does not invent a
 * connection state, render, or playtest result: those components continue to
 * receive the exact socket values the workspace already had.
 */
import type { PlaytestRun, StudioFrame } from '@golem/shared';
import { useEffect, useState } from 'react';
import type { StudioConnection } from '../../lib/studio-connection';
import { playtestView } from '../../lib/playtest-view';
import { ConnectStudio } from './connect-studio';
import { PlaytestCard } from './playtest-card';
import { StudioView } from './studio-view';
import { Icon, PATH } from './primitives';

interface ProjectStageProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  status: StudioConnection;
  onPair: () => void;
  frames: StudioFrame[];
  running: boolean;
  playtest: PlaytestRun | null;
  studioConnected: boolean;
}

function stageSummary({
  status,
  frames,
  playtest,
}: Pick<ProjectStageProps, 'status' | 'frames' | 'playtest'>): string {
  if (playtest) return playtestView(playtest, frames, Date.now()).label;
  if (frames.length > 0) return `${frames.length} diagnostic render${frames.length === 1 ? '' : 's'}`;
  if (status === 'connected') return 'Waiting for a Studio render';
  if (status === 'connecting') return 'Checking Studio';
  return 'Studio not connected';
}

/** A visual pause that says "nothing has arrived yet" without pretending it has. */
function BlueprintEmpty({ studioConnected }: { studioConnected: boolean }) {
  return (
    <div className="gx-project-stage__blueprint" role="status" aria-live="polite">
      <div className="gx-project-stage__blueprint-art" aria-hidden="true">
        <span className="gx-project-stage__blueprint-shape gx-project-stage__blueprint-shape--main" />
        <span className="gx-project-stage__blueprint-shape gx-project-stage__blueprint-shape--side" />
        <span className="gx-project-stage__blueprint-cross gx-project-stage__blueprint-cross--one" />
        <span className="gx-project-stage__blueprint-cross gx-project-stage__blueprint-cross--two" />
      </div>
      <p className="gx-project-stage__blueprint-title">
        {studioConnected ? 'Blueprint ready' : 'Your project stage'}
      </p>
      <p className="gx-project-stage__blueprint-copy">
        {studioConnected
          ? 'Diagnostic renders will appear here when Apple reads or changes your place.'
          : 'Connect Studio to see the evidence Apple receives from your place.'}
      </p>
    </div>
  );
}

export function ProjectStage({
  collapsed,
  onCollapsedChange,
  status,
  onPair,
  frames,
  running,
  playtest,
  studioConnected,
}: ProjectStageProps) {
  const [surface, setSurface] = useState<'render' | 'playtest'>(playtest ? 'playtest' : 'render');
  const summary = stageSummary({ status, frames, playtest });
  const showBlueprint = frames.length === 0 && playtest === null;

  useEffect(() => {
    if (playtest) setSurface('playtest');
  }, [playtest?.id]);

  return (
    <section
      id="workspace-project-stage"
      className={`gx-project-stage${collapsed ? ' is-collapsed' : ''}`}
      aria-label="Project stage"
    >
      <header className="gx-project-stage__head">
        <button
          type="button"
          className="gx-project-stage__toggle"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-expanded={!collapsed}
          aria-controls="project-stage-content"
          aria-label={collapsed ? 'Open project stage' : 'Collapse project stage'}
          title={collapsed ? 'Open project stage' : 'Collapse project stage'}
        >
          <span className="gx-project-stage__mark" aria-hidden="true">
            <Icon d={PATH.layers} size={16} />
          </span>
          <span className="gx-project-stage__heading">
            <span className="gx-project-stage__title">Project stage</span>
            <span className="gx-project-stage__summary">{summary}</span>
          </span>
          <span className="gx-project-stage__chevron" aria-hidden="true">
            <Icon d={PATH.chevronDown} size={15} />
          </span>
        </button>
      </header>

      <div className="gx-project-stage__body" id="project-stage-content" hidden={collapsed}>
        <ConnectStudio status={status} onPair={onPair} />

        {!showBlueprint && playtest && frames.length > 0 && (
          <div className="gx-project-stage__surfaces" role="tablist" aria-label="Project stage view">
            <button
              type="button"
              role="tab"
              aria-selected={surface === 'render'}
              className={surface === 'render' ? 'is-active' : ''}
              onClick={() => setSurface('render')}
            >
              <span aria-hidden="true" /> Render
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={surface === 'playtest'}
              className={surface === 'playtest' ? 'is-active' : ''}
              onClick={() => setSurface('playtest')}
            >
              <span aria-hidden="true" /> Playtest
            </button>
          </div>
        )}

        <div className="gx-project-stage__cinema">
          <div className="gx-project-stage__cinema-glow" aria-hidden="true" />
          {showBlueprint && <BlueprintEmpty studioConnected={studioConnected} />}
          {!showBlueprint && surface === 'render' && <StudioView frames={frames} running={running} />}
          {!showBlueprint && surface === 'playtest' && playtest && (
            <PlaytestCard run={playtest} frames={frames} studioConnected={studioConnected} />
          )}
        </div>
      </div>
    </section>
  );
}
