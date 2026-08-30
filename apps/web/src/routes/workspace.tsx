// /projects/:id — the creation environment.
//
// Three lanes: the conversation you drive, the work surface that shows what
// Golem is producing, and the context rail holding the facts that persist
// between turns. Below 1024px the three become tabs of one lane, because a
// three-column tool on a phone is three unusable columns.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { GolemMode } from '@golem/shared';
import { MOCK_MODE, mockProjects } from '../lib/mock';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useProjectSocket, type ToolEvent } from '../lib/use-project-socket';
import { panelFromTool, type SurfacePanel } from '../lib/panels';
import { runPhase } from '../lib/tool-meta';
import { useToast } from '../components/toast';
import { ChatMessage } from '../components/chat-message';
import { Composer } from '../components/composer';
import { PairingDialog } from '../components/pairing-dialog';
import { ContextRail } from '../components/context-rail';
import { WorkSurface, type SurfaceTab } from '../components/work-surface';
import { Forge } from '../components/loading';
import { ICONS, NavIcon, RunePulse } from '../components/glyphs';

async function fetchProject(id: string): Promise<ProjectRow | null> {
  if (MOCK_MODE) return mockProjects.find((p) => p.id === id) ?? mockProjects[0] ?? null;
  const { data, error } = await supabase
    .from('projects')
    .select('id, owner_id, name, description, place_name, place_id, memory_summary, created_at, updated_at, last_activity_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProjectRow | null) ?? null;
}

const SUGGESTIONS = [
  'Build a lobby with a spinning golden portal that teleports players to the arena.',
  'Add a coin pickup that awards 5 points and plays a chime.',
  'Look at the scene and tell me what reads as unfinished.',
];

type MobileLane = 'chat' | 'surface' | 'rail';

export function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id ?? '';
  const { toast } = useToast();

  const [showPairing, setShowPairing] = useState(false);
  const [surfaceOpen, setSurfaceOpen] = useState(() => window.innerWidth >= 1024);
  const [railOpen, setRailOpen] = useState(() => window.innerWidth >= 1280);
  const [mobileLane, setMobileLane] = useState<MobileLane>('chat');
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 1024);
  const [surfaceTab, setSurfaceTab] = useState<SurfaceTab>('activity');
  const [pinned, setPinned] = useState<SurfacePanel | null>(null);
  const [mode, setMode] = useState<GolemMode>('stone');
  const [seed, setSeed] = useState<string | undefined>(undefined);
  const [restoring, setRestoring] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId),
    enabled: projectId.length > 0,
  });

  const onServerError = useCallback(
    (code: string, message: string) => {
      setRestoring(false);
      toast(message || `Something went wrong (${code})`, 'error');
    },
    [toast],
  );

  const socket = useProjectSocket(projectId, onServerError);
  const {
    conn,
    messages,
    historyState,
    studio,
    quota,
    agentStatus,
    running,
    logs,
    checkpoints,
    checkpointsState,
    sendChat,
    stop,
    createCheckpoint,
    restoreCheckpoint,
    reloadHistory,
    reloadCheckpoints,
    reconnectNow,
  } = socket;

  // Toast when Studio comes online, once per transition.
  const prevConnected = useRef(false);
  useEffect(() => {
    if (studio.connected && !prevConnected.current) {
      toast(`Studio connected${studio.state?.placeName ? ` · ${studio.state.placeName}` : ''}`, 'success');
    }
    prevConnected.current = studio.connected;
  }, [studio.connected, studio.state, toast]);

  // A restore is done when a fresh checkpoint list arrives or the run stops.
  useEffect(() => {
    if (!restoring) return;
    const id = window.setTimeout(() => setRestoring(false), 12_000);
    return () => window.clearTimeout(id);
  }, [restoring]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  const composerDisabledReason =
    conn === 'open' ? null : conn === 'connecting' ? 'Connecting…' : conn === 'offline' ? 'Offline' : 'Reconnecting…';

  const send = (text: string, chosen: GolemMode) => {
    stickToBottom.current = true;
    setSeed(undefined);
    if (!sendChat(text, chosen)) toast('Not connected yet — hang on a moment.', 'error');
  };

  const openToolResult = useCallback((tool: ToolEvent) => {
    const panel = panelFromTool('pinned', tool, Date.now());
    if (!panel) return;
    setPinned(panel);
    setSurfaceTab('panels');
    setSurfaceOpen(true);
    setMobileLane('surface');
  }, []);

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant'),
    [messages],
  );
  const livePhase = running ? runPhase(lastAssistant?.tools ?? [], agentStatus?.phase ?? null) : null;

  if (project.isSuccess && project.data === null) {
    return (
      <div className="page">
        <div className="empty-state">
          <h2>Project not found</h2>
          <p>It may have been deleted, or the link is wrong.</p>
          <Link to="/" className="btn btn-primary">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const showChat = !isNarrow || mobileLane === 'chat';
  const showSurface = isNarrow ? mobileLane === 'surface' : surfaceOpen;
  const showRail = isNarrow ? mobileLane === 'rail' : railOpen;

  return (
    <div className={`workspace is-${mode}`}>
      {(conn === 'reconnecting' || conn === 'offline') && (
        <div className="conn-banner" role="status">
          <span className="pulse-dot" aria-hidden="true" />
          {conn === 'offline' ? 'Connection lost.' : 'Reconnecting to Golem…'}
          <button type="button" className="btn btn-ghost btn-sm" onClick={reconnectNow}>
            Retry now
          </button>
        </div>
      )}

      <header className="ws-head">
        <div className="ws-title">
          <Link to="/" className="back-link" aria-label="Back to projects">
            <span aria-hidden="true">←</span>
          </Link>
          <h1>{project.data?.name ?? (project.isPending ? 'Loading…' : 'Project')}</h1>
          {livePhase && (
            <span className="chip chip--accent">
              <span className="pill-dot" aria-hidden="true" /> {livePhase}
            </span>
          )}
        </div>

        <div className="ws-head-actions">
          {studio.connected ? (
            <span className="pill pill-live" title={`Linked to ${studio.state?.placeName ?? 'your open place'}`}>
              <span className="pill-dot" aria-hidden="true" />
              <span className="pill-truncate">{studio.state?.placeName ?? 'Studio'}</span>
            </span>
          ) : (
            <span className="pill pill-off">
              <span className="pill-dot" aria-hidden="true" />
              Studio offline
              <button type="button" className="pill-action" onClick={() => setShowPairing(true)}>
                Connect
              </button>
            </span>
          )}

          {quota && (
            <span className={`ws-sparks${quota.sparksRemaining <= 5 ? ' is-low' : ''}`} title="Sparks left today">
              <strong>{quota.sparksRemaining}</strong> Sparks
            </span>
          )}

          {!isNarrow && (
            <>
              <button
                type="button"
                className="icon-btn"
                aria-label={surfaceOpen ? 'Hide work surface' : 'Show work surface'}
                aria-pressed={surfaceOpen}
                title="Work surface"
                onClick={() => setSurfaceOpen((v) => !v)}
              >
                <NavIcon d={ICONS.surface} size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={railOpen ? 'Hide project context' : 'Show project context'}
                aria-pressed={railOpen}
                title="Project context"
                onClick={() => setRailOpen((v) => !v)}
              >
                <NavIcon d={ICONS.rail} size={18} />
              </button>
            </>
          )}
        </div>
      </header>

      {isNarrow && (
        <div className="ws-mobile-tabs" role="tablist" aria-label="Workspace lanes">
          {(
            [
              ['chat', 'Chat'],
              ['surface', 'Work'],
              ['rail', 'Context'],
            ] as [MobileLane, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mobileLane === id}
              className="ws-mobile-tab"
              onClick={() => setMobileLane(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div
        className={`ws-body${showSurface && !isNarrow ? ' has-surface' : ''}${showRail && !isNarrow ? ' has-rail' : ''}`}
      >
        <div className="ws-lane" hidden={!showChat}>
          <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
            <div className="chat-inner">
              {historyState === 'loading' && <Forge kind="recalling" />}

              {historyState === 'error' && (
                <div className="chat-loading" role="alert">
                  <p className="form-error">Couldn&rsquo;t load chat history.</p>
                  <button type="button" className="btn btn-sm" onClick={reloadHistory}>
                    Retry
                  </button>
                </div>
              )}

              {historyState === 'ready' && messages.length === 0 && (
                <div className="chat-empty">
                  <RunePulse size={26} />
                  <h2>The golem awaits your words</h2>
                  <p>Describe what your game should do. Golem writes the scripts and places the parts in Studio.</p>
                  <div className="chat-suggestions">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" className="suggestion" onClick={() => setSeed(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                  {!studio.connected && (
                    <button type="button" className="btn btn-primary" onClick={() => setShowPairing(true)}>
                      Connect Studio first
                    </button>
                  )}
                </div>
              )}

              {messages.map((m) => (
                <ChatMessage
                  key={m.id}
                  item={m}
                  agentPhase={agentStatus?.phase ?? null}
                  onOpenTool={openToolResult}
                />
              ))}

              {agentStatus && running && (
                <div className="agent-status" role="status">
                  <span className="agent-status-rune" aria-hidden="true">
                    <RunePulse size={15} />
                  </span>
                  Golem is {livePhase?.toLowerCase() ?? agentStatus.phase}
                  {agentStatus.step !== undefined && agentStatus.totalSteps !== undefined && (
                    <span className="muted">
                      {' '}
                      · step {agentStatus.step}/{agentStatus.totalSteps}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <Composer
            disabledReason={composerDisabledReason}
            running={running}
            quota={quota}
            onSend={send}
            onStop={stop}
            onModeChange={setMode}
            seed={seed}
          />
        </div>

        {showSurface && (
          <WorkSurface
            messages={messages}
            running={running}
            agentPhase={agentStatus?.phase ?? null}
            pinned={pinned}
            onClearPinned={() => setPinned(null)}
            tab={surfaceTab}
            onTabChange={setSurfaceTab}
          />
        )}

        {showRail && (
          <ContextRail
            studioConnected={studio.connected}
            studioState={studio.state}
            onConnectStudio={() => setShowPairing(true)}
            quota={quota}
            checkpoints={checkpoints}
            checkpointsState={checkpointsState}
            onReloadCheckpoints={reloadCheckpoints}
            onCreateCheckpoint={createCheckpoint}
            onRestoreCheckpoint={(id) => {
              setRestoring(true);
              restoreCheckpoint(id);
            }}
            restoring={restoring}
            logs={logs}
            memorySummary={project.data?.memory_summary ?? null}
            wsOpen={conn === 'open'}
          />
        )}
      </div>

      {showPairing && (
        <PairingDialog
          projectId={projectId}
          studioConnected={studio.connected}
          onClose={() => setShowPairing(false)}
        />
      )}
    </div>
  );
}
