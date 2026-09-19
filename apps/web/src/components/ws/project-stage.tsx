/**
 * The bounded Studio companion for a conversation.
 *
 * A conversation is where a builder asks for a change and reads Apple's answer;
 * this is where the evidence from that change belongs. The stage owns only the
 * layout around the existing, data-backed Studio surfaces. It does not invent a
 * connection state, render, or playtest result: those components continue to
 * receive the exact socket values the workspace already had.
 *
 * THE ONE THING THIS PANEL SPENDS COLOUR ON is the connection pip in its header.
 * docs/DESIGN-LOCK.md allows the accent once per screen — one primary action, the
 * current nav item, a focus ring, or a live indicator. While Studio is attached the
 * pip is that live indicator and nothing else here is tinted; while it is not,
 * ConnectStudio below owns the accent on its single primary action and the pip goes
 * hollow. The two can never both be lit, because ConnectStudio renders nothing at
 * all once `status === 'connected'`.
 */
import type { PlaytestRun, StudioFrame } from '@golem/shared';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { StudioConnection } from '../../lib/studio-connection';
import { playtestView } from '../../lib/playtest-view';
import { ConnectStudio } from './connect-studio';
import { PlaytestCard } from './playtest-card';
import { StudioView } from './studio-view';
import { Icon, PATH } from './primitives';
import './project-stage.css';

interface ProjectStageProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  status: StudioConnection;
  onPair: () => void;
  frames: StudioFrame[];
  running: boolean;
  playtest: PlaytestRun | null;
  studioConnected: boolean;
  /** The bound place's name, for the sentence ConnectStudio shows when Studio has gone quiet. */
  boundPlaceName?: string | null;
}

const SURFACES = ['render', 'playtest'] as const;
type Surface = (typeof SURFACES)[number];
const SURFACE_LABEL: Record<Surface, string> = { render: 'Render', playtest: 'Playtest' };

/**
 * The header's second line: what is in the panel right now, in one phrase.
 *
 * The pip beside it carries the CONNECTION, so this sentence is free to be about the
 * contents. Before the pip existed both jobs fell on this string and "Studio not
 * connected" had to be printed even when three renders were sitting underneath it.
 */
function stageSummary({
  status,
  frames,
  playtest,
  running,
}: Pick<ProjectStageProps, 'status' | 'frames' | 'playtest' | 'running'>): string {
  if (playtest) return playtestView(playtest, frames, Date.now()).label;
  if (frames.length > 0) return `${frames.length} diagnostic render${frames.length === 1 ? '' : 's'}`;
  if (running) return 'Apple is working in your place';
  if (status === 'connected') return 'Waiting for the first render';
  if (status === 'connecting') return 'Checking for Studio';
  if (status === 'disconnected') return 'Studio went quiet';
  return 'Studio not connected';
}

/** live | checking | off — the three things the pip is allowed to say. */
function pipState(status: StudioConnection): 'live' | 'checking' | 'off' {
  if (status === 'connected') return 'live';
  if (status === 'connecting') return 'checking';
  return 'off';
}

/**
 * NOTHING HAS ARRIVED, AND WHICH KIND OF NOTHING IT IS.
 *
 * Three states, not one, because "no renders" has three different answers: pair
 * Studio, ask for a change, or wait — and an empty state that does not say which is a
 * grey rectangle with a caption. `running` is the loading state proper: work is under
 * way and the first frame is a few seconds out.
 */
function BlueprintEmpty({ studioConnected, running }: { studioConnected: boolean; running: boolean }) {
  const kind = !studioConnected ? 'unpaired' : running ? 'working' : 'idle';
  return (
    <div
      className={`gx-project-stage__blueprint gx-project-stage__blueprint--${kind}`}
      role="status"
      aria-live="polite"
    >
      <div className="gx-project-stage__blueprint-art" aria-hidden="true">
        <span className="gx-project-stage__blueprint-shape gx-project-stage__blueprint-shape--main" />
        <span className="gx-project-stage__blueprint-shape gx-project-stage__blueprint-shape--side" />
        <span className="gx-project-stage__blueprint-cross gx-project-stage__blueprint-cross--one" />
        <span className="gx-project-stage__blueprint-cross gx-project-stage__blueprint-cross--two" />
      </div>
      <p className="gx-project-stage__blueprint-title">
        {kind === 'unpaired' ? 'Nothing to show yet' : kind === 'working' ? 'Apple is working' : 'Waiting for a render'}
      </p>
      <p className="gx-project-stage__blueprint-copy">
        {kind === 'unpaired'
          ? 'Pair Studio above. Apple then sends back a render of your place each time it reads or changes one.'
          : kind === 'working'
            ? 'The first render arrives once Apple has read the place. This takes a few seconds.'
            : 'Ask for a change and the render Apple works from appears here.'}
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
  boundPlaceName = null,
}: ProjectStageProps) {
  const [surface, setSurface] = useState<Surface>(playtest ? 'playtest' : 'render');
  const summary = stageSummary({ status, frames, playtest, running });
  const showBlueprint = frames.length === 0 && playtest === null;
  const tabbed = !showBlueprint && playtest !== null && frames.length > 0;
  // THE SURFACE THAT IS ACTUALLY DRAWN, which is not always the one last clicked. A playtest that
  // ends takes its card with it, and a stage still holding `'playtest'` from the run before drew
  // nothing at all: both branches below were false and the panel went blank with frames in hand.
  // With no tab strip there is no choice to honour, so the content decides.
  const active: Surface = tabbed ? surface : playtest ? 'playtest' : 'render';
  const tabRefs = useRef<Partial<Record<Surface, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (playtest) setSurface('playtest');
  }, [playtest?.id]);

  /**
   * A tablist owes the keyboard arrow keys, Home and End — the roving-tabindex pattern.
   * Without it the two tabs are two more Tab stops between the reader and the evidence,
   * and the strip announces itself as a tablist while behaving like a pair of buttons,
   * which is worse than not claiming the role at all.
   */
  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const at = SURFACES.indexOf(active);
    const next =
      e.key === 'ArrowRight' ? (at + 1) % SURFACES.length
      : e.key === 'ArrowLeft' ? (at + SURFACES.length - 1) % SURFACES.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? SURFACES.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    const target = SURFACES[next]!;
    setSurface(target);
    tabRefs.current[target]?.focus();
  };

  return (
    <section
      id="workspace-project-stage"
      className={`gx-project-stage${collapsed ? ' is-collapsed' : ''}`}
      aria-label="Project stage"
      data-connection={pipState(status)}
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
            <span className="gx-project-stage__summary">
              {/* Decorative: every state it can be in is already written out beside it. */}
              <span className="gx-project-stage__pip" aria-hidden="true" />
              <span className="gx-project-stage__summary-text">{summary}</span>
            </span>
          </span>
          <span className="gx-project-stage__chevron" aria-hidden="true">
            <Icon d={PATH.chevronDown} size={15} />
          </span>
        </button>
      </header>

      <div className="gx-project-stage__body" id="project-stage-content" hidden={collapsed}>
        <ConnectStudio status={status} onPair={onPair} placeName={boundPlaceName} />

        {tabbed && (
          <div className="gx-project-stage__surfaces" role="tablist" aria-label="Project stage view">
            {SURFACES.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                id={`project-stage-tab-${name}`}
                ref={(node) => {
                  tabRefs.current[name] = node;
                }}
                aria-selected={active === name}
                aria-controls="project-stage-surface"
                // Roving: only the selected tab is in the Tab order, and the arrows move within.
                tabIndex={active === name ? 0 : -1}
                onKeyDown={onTabKey}
                onClick={() => setSurface(name)}
              >
                {SURFACE_LABEL[name]}
              </button>
            ))}
          </div>
        )}

        <div
          className="gx-project-stage__cinema"
          id="project-stage-surface"
          // A tabpanel only exists while there are tabs to label it. With one surface the
          // role would name a panel no control points at.
          role={tabbed ? 'tabpanel' : undefined}
          aria-labelledby={tabbed ? `project-stage-tab-${active}` : undefined}
          tabIndex={tabbed ? 0 : undefined}
        >
          <div className="gx-project-stage__cinema-glow" aria-hidden="true" />
          {showBlueprint && <BlueprintEmpty studioConnected={studioConnected} running={running} />}
          {!showBlueprint && active === 'render' && <StudioView frames={frames} running={running} />}
          {!showBlueprint && active === 'playtest' && playtest && (
            <PlaytestCard run={playtest} frames={frames} studioConnected={studioConnected} />
          )}
        </div>
      </div>
    </section>
  );
}
