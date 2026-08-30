// /projects/:id — the workspace: chat with Golem, Studio status, checkpoints.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useProjectSocket } from '../lib/use-project-socket';
import { useToast } from '../components/toast';
import { ChatMessage } from '../components/chat-message';
import { Composer } from '../components/composer';
import { PairingDialog } from '../components/pairing-dialog';
import { RightRail } from '../components/right-rail';
import { RunePulse } from '../components/glyphs';

async function fetchProject(id: string): Promise<ProjectRow | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, owner_id, name, description, place_name, place_id, memory_summary, created_at, updated_at, last_activity_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProjectRow | null) ?? null;
}

export function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id ?? '';
  const { toast } = useToast();
  const [showPairing, setShowPairing] = useState(false);
  const [railOpen, setRailOpen] = useState(() => window.innerWidth >= 1100);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId),
    enabled: projectId.length > 0,
  });

  const onServerError = useCallback(
    (code: string, message: string) => {
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

  // Auto-close the pairing dialog celebration is handled inside it; toast on connect.
  const prevConnected = useRef(false);
  useEffect(() => {
    if (studio.connected && !prevConnected.current) {
      toast(`Studio connected${studio.state?.placeName ? ` · ${studio.state.placeName}` : ''}`, 'success');
    }
    prevConnected.current = studio.connected;
  }, [studio.connected, studio.state, toast]);

  // Autoscroll: stick to bottom unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const composerDisabledReason =
    conn === 'open' ? null : conn === 'connecting' ? 'Connecting…' : 'Reconnecting to Golem…';

  const send = (text: string, mode: Parameters<typeof sendChat>[1]) => {
    stickToBottom.current = true;
    if (!sendChat(text, mode)) toast('Not connected yet — hang on a moment.', 'error');
  };

  if (project.isSuccess && project.data === null) {
    return (
      <div className="page">
        <div className="empty-state">
          <h2>Project not found</h2>
          <p className="muted">It may have been deleted, or the link is wrong.</p>
          <Link to="/" className="btn">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace">
      {(conn === 'reconnecting' || conn === 'offline') && (
        <div className="conn-banner" role="status">
          <span className="pulse-dot pulse-dot-warn" aria-hidden="true" />
          {conn === 'offline' ? 'Connection lost.' : 'Reconnecting…'}
          <button type="button" className="btn btn-ghost btn-sm" onClick={reconnectNow}>
            Retry now
          </button>
        </div>
      )}

      <header className="workspace-head">
        <div className="workspace-title">
          <Link to="/" className="back-link" aria-label="Back to projects">
            ←
          </Link>
          <h1>{project.data?.name ?? (project.isPending ? '…' : 'Project')}</h1>
        </div>
        <div className="workspace-head-actions">
          {studio.connected ? (
            <span className="pill pill-live" title="Golem is linked to your open Studio place">
              <span className="pill-dot" aria-hidden="true" />
              Studio connected{studio.state?.placeName ? ` · ${studio.state.placeName}` : ''}
            </span>
          ) : (
            <span className="pill pill-off">
              <span className="pill-dot" aria-hidden="true" />
              Studio not connected
              <button type="button" className="pill-action" onClick={() => setShowPairing(true)}>
                Connect
              </button>
            </span>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label={railOpen ? 'Hide project tools' : 'Show project tools'}
            aria-pressed={railOpen}
            onClick={() => setRailOpen((v) => !v)}
            title="Checkpoints, logs and memory"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M15 4v16" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
      </header>

      <div className={`workspace-body${railOpen ? ' rail-visible' : ''}`}>
        <div className="chat-col">
          <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
            {historyState === 'loading' && (
              <div className="chat-loading" aria-busy="true">
                <span className="rune-spinner" aria-hidden="true" />
                <p className="muted">Recalling your conversation…</p>
              </div>
            )}
            {historyState === 'error' && (
              <div className="chat-loading" role="alert">
                <p className="form-error">Couldn't load chat history.</p>
                <button type="button" className="btn btn-sm" onClick={reloadHistory}>
                  Retry
                </button>
              </div>
            )}
            {historyState === 'ready' && messages.length === 0 && (
              <div className="chat-empty">
                <RunePulse size={28} />
                <h2>The golem awaits your words</h2>
                <p className="muted">
                  Try: <em>"Build a lobby with a spinning golden portal that teleports players to the arena."</em>
                </p>
                {!studio.connected && (
                  <button type="button" className="btn" onClick={() => setShowPairing(true)}>
                    Connect Studio first
                  </button>
                )}
              </div>
            )}
            {messages.map((m) => (
              <ChatMessage key={m.id} item={m} />
            ))}
            {agentStatus && (
              <div className="agent-status" role="status">
                <span className="agent-status-rune">
                  <RunePulse size={16} />
                </span>
                Golem is {agentStatus.phase}
                {agentStatus.step !== undefined && agentStatus.totalSteps !== undefined && (
                  <span className="muted"> · step {agentStatus.step}/{agentStatus.totalSteps}</span>
                )}
              </div>
            )}
          </div>
          <Composer
            disabledReason={composerDisabledReason}
            running={running}
            quota={quota}
            onSend={send}
            onStop={stop}
          />
        </div>

        {railOpen && (
          <RightRail
            checkpoints={checkpoints}
            checkpointsState={checkpointsState}
            onReloadCheckpoints={reloadCheckpoints}
            onCreateCheckpoint={createCheckpoint}
            onRestoreCheckpoint={restoreCheckpoint}
            logs={logs}
            memorySummary={project.data?.memory_summary ?? null}
            studioConnected={studio.connected}
            wsOpen={conn === 'open'}
          />
        )}
      </div>

      {showPairing && (
        <PairingDialog projectId={projectId} studioConnected={studio.connected} onClose={() => setShowPairing(false)} />
      )}
    </div>
  );
}
