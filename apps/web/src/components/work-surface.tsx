// The work surface: the large adaptive lane between the conversation and the
// context rail. It holds whatever the run is producing right now — the activity
// trace, the renders and their critiques, and any AI-authored panel.
//
// It is *adaptive* rather than static: the tab that has new material becomes the
// active one when a run finishes, and panels animate in rather than appearing
// fully formed, so a change of state is legible as a change.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GenerativeUI } from '../lib/generative-ui/render';
import type { UIDocument } from '../lib/generative-ui/schema';
import { buildComparison, extractPanels, type SurfacePanel } from '../lib/panels';
import { relativeTime } from '../lib/format';
import { runPhase, toolMeta, type OperationKind } from '../lib/tool-meta';
import type { ChatItem } from '../lib/use-project-socket';
import { ToolTimeline } from './tool-timeline';
import { CameraMark, RunePulse } from './glyphs';
import { Forge } from './loading';

export type SurfaceTab = 'activity' | 'renders' | 'panels';

interface WorkSurfaceProps {
  messages: ChatItem[];
  running: boolean;
  agentPhase: string | null;
  /** A panel the user explicitly opened from a timeline row. */
  pinned: SurfacePanel | null;
  onClearPinned: () => void;
  tab: SurfaceTab;
  onTabChange: (tab: SurfaceTab) => void;
}

/** Which branded loading sequence fits what the run is currently doing. */
function operationFor(tools: { tool: string; done: boolean }[]): OperationKind {
  const live = tools.find((t) => !t.done);
  if (!live) return 'building';
  const stage = toolMeta(live.tool).stage;
  if (stage === 'verify') return live.tool === 'render_view' ? 'rendering' : 'verifying';
  if (stage === 'run') return 'verifying';
  return 'building';
}

function Artifact({ panel, children }: { panel: SurfacePanel; children?: ReactNode }) {
  return (
    <article className="artifact">
      <header className="artifact-head">
        <span className="gu-chip gu-chip--accent">{panel.tool}</span>
        <h2 className="artifact-title">{panel.title}</h2>
        <span className="artifact-when">{relativeTime(panel.at)}</span>
        {children}
      </header>
      <div className="artifact-body">
        <GenerativeUI doc={panel.doc} />
      </div>
    </article>
  );
}

export function WorkSurface({
  messages,
  running,
  agentPhase,
  pinned,
  onClearPinned,
  tab,
  onTabChange,
}: WorkSurfaceProps) {
  const panels = useMemo(() => extractPanels(messages), [messages]);
  const renders = useMemo(() => panels.filter((p) => p.hasRender), [panels]);
  const others = useMemo(() => panels.filter((p) => !p.hasRender), [panels]);

  const [compareOn, setCompareOn] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // When a run produces its first render, bring the user to it. Only on the
  // transition, so it never fights a deliberate tab choice.
  const prevRenderCount = useRef(renders.length);
  useEffect(() => {
    if (renders.length > prevRenderCount.current) onTabChange('renders');
    prevRenderCount.current = renders.length;
  }, [renders.length, onTabChange]);

  const comparison: UIDocument | null = useMemo(() => {
    if (!compareOn || renders.length < 2) return null;
    const newest = renders[0];
    const previous = renders[1];
    if (!newest || !previous) return null;
    return buildComparison(previous, newest);
  }, [compareOn, renders]);

  const activeMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const turns = useMemo(() => messages.filter((m) => m.role === 'assistant' && m.tools.length > 0).reverse(), [messages]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const tabs: { id: SurfaceTab; label: string; count?: number }[] = [
    { id: 'activity', label: 'Activity' },
    { id: 'renders', label: 'Renders', count: renders.length },
    { id: 'panels', label: 'Panels', count: others.length + (pinned ? 1 : 0) },
  ];

  return (
    <section className="ws-lane surface" aria-label="Work surface">
      <header className="surface-head">
        <div className="surface-tabs" role="tablist" aria-label="Work surface views">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className="surface-tab"
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && <span className="surface-tab-badge">{t.count}</span>}
            </button>
          ))}
        </div>
        <div className="surface-actions">
          {tab === 'renders' && renders.length >= 2 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-pressed={compareOn}
              onClick={() => setCompareOn((v) => !v)}
            >
              {compareOn ? 'Hide compare' : 'Compare last two'}
            </button>
          )}
          {tab === 'panels' && pinned && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClearPinned}>
              Unpin
            </button>
          )}
        </div>
      </header>

      <div className="surface-body" ref={bodyRef}>
        {tab === 'activity' && (
          <>
            {running && (
              <Forge
                kind={operationFor(activeMessage?.tools ?? [])}
                label={`Golem is ${runPhase(activeMessage?.tools ?? [], agentPhase).toLowerCase()}`}
              />
            )}
            {turns.length === 0 && !running ? (
              <div className="surface-empty">
                <RunePulse size={26} />
                <h2>Nothing built yet</h2>
                <p>
                  When Golem works, every step it takes in Studio appears here — the tool it used, what it observed,
                  and how long it took.
                </p>
              </div>
            ) : (
              <div className="activity-groups">
                {turns.map((turn, i) => (
                  <div key={turn.id} className={`activity-group${turn.streaming ? ' is-live' : ''}`}>
                    <div className="activity-group-head">
                      <h2 className="activity-group-title">
                        {turn.streaming ? 'This run' : i === 0 ? 'Latest run' : 'Earlier run'}
                      </h2>
                      <span className="activity-group-when">{relativeTime(turn.createdAt)}</span>
                    </div>
                    <ToolTimeline
                      tools={turn.tools}
                      agentPhase={agentPhase}
                      running={turn.streaming}
                      defaultOpen
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'renders' && (
          <div className="surface-stack">
            {comparison && (
              <article className="artifact">
                <header className="artifact-head">
                  <span className="gu-chip gu-chip--accent">compare</span>
                  <h2 className="artifact-title">Latest two renders</h2>
                </header>
                <div className="artifact-body">
                  <GenerativeUI doc={comparison} />
                </div>
              </article>
            )}
            {renders.length === 0 ? (
              <div className="surface-empty">
                <CameraMark />
                <h2>No renders yet</h2>
                <p>
                  Ask Golem to check its work visually. It rasterises your scene from five angles and grades the
                  composition, materials and lighting.
                </p>
              </div>
            ) : (
              renders.map((panel) => <Artifact key={panel.id} panel={panel} />)
            )}
          </div>
        )}

        {tab === 'panels' && (
          <div className="surface-stack">
            {pinned && <Artifact panel={pinned} />}
            {others.length === 0 && !pinned ? (
              <div className="surface-empty">
                <RunePulse size={26} />
                <h2>No panels yet</h2>
                <p>
                  Diffs, test reports, property inspectors and error diagnoses appear here as Golem produces them.
                </p>
              </div>
            ) : (
              others.map((panel) => <Artifact key={panel.id} panel={panel} />)
            )}
          </div>
        )}
      </div>
    </section>
  );
}
