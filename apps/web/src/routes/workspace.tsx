// /projects/:id — a conversation with a capable collaborator.
//
// One lane, not three. The work surface and the context rail are gone as
// permanent columns: what the agent produces now appears inline in the
// conversation where it happened, and the two things that genuinely persist
// between turns — checkpoints and project memory — are one click away in a
// drawer rather than occupying a third of the screen forever.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { GolemMode } from '@golem/shared';
import { MOCK_MODE, mockProjects } from '../lib/mock';
import { shortRelative } from '../lib/format';
import { useShell, useProvideCheckpoints } from '../lib/shell';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useProjectSocket } from '../lib/use-project-socket';
import { fetchProviders } from '../lib/api';
import { useToast } from '../components/toast';
import { PairingDialog } from '../components/pairing-dialog';
import { Composer } from '../components/ws/composer';
import { Drawer, Icon, PATH } from '../components/ws/primitives';
import { Turn } from '../components/ws/turn';
import { StudioView } from '../components/ws/studio-view';

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

export function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id ?? '';
  const { toast } = useToast();
  const { openRail } = useShell();

  const [showPairing, setShowPairing] = useState(false);
  const [drawer, setDrawer] = useState<null | 'checkpoints' | 'memory'>(null);
  const [mode, setMode] = useState<GolemMode>('stone');
  const [providerId, setProviderId] = useState<string | 'auto'>('auto');
  const [seed, setSeed] = useState<string | undefined>(undefined);
  const [label, setLabel] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // The rail's Checkpoints card opens this route's drawer.
  const showCheckpoints = useCallback(() => setDrawer('checkpoints'), []);
  useProvideCheckpoints(showCheckpoints);

  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId),
    enabled: projectId.length > 0,
  });

  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: fetchProviders,
    staleTime: 300_000,
    retry: 1,
  });

  const onServerError = useCallback(
    (code: string, message: string) => toast(message || `Something went wrong (${code})`, 'error'),
    [toast],
  );

  const {
    conn,
    messages,
    historyState,
    studio,
    agentStatus,
    running,
    checkpoints,
    checkpointsState,
    frames,
    sendChat,
    stop,
    createCheckpoint,
    restoreCheckpoint,
    reloadHistory,
  } = useProjectSocket(projectId, onServerError);

  // Toast when Studio comes online, once per transition.
  const wasConnected = useRef(false);
  useEffect(() => {
    if (studio.connected && !wasConnected.current) {
      toast(`Studio connected${studio.state?.placeName ? ` · ${studio.state.placeName}` : ''}`, 'success');
    }
    wasConnected.current = studio.connected;
  }, [studio.connected, studio.state, toast]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  const send = (text: string) => {
    stick.current = true;
    setSeed(undefined);
    if (!sendChat(text, mode)) toast('Not connected yet — hang on a moment.', 'error');
  };

  const lastAssistantId = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant')?.id,
    [messages],
  );

  const connNote =
    conn === 'open'
      ? null
      : conn === 'connecting'
        ? 'Connecting…'
        : conn === 'offline'
          ? 'Offline — check your connection'
          : 'Reconnecting…';

  if (project.isSuccess && project.data === null) {
    return (
      <div className="gx-plain">
        <div className="gx-empty">
          <p>That project isn&rsquo;t here — it may have been removed.</p>
          <Link to="/" className="gx-btn gx-btn--outline">
            Back to your builds
          </Link>
        </div>
      </div>
    );
  }

  const activityAt = project.data?.last_activity_at ?? project.data?.updated_at ?? null;
  const when = shortRelative(activityAt);

  return (
    <div className="gx-ws">
      {/* ------------------------------------------------------- topbar -- */}
      <header className="gx-top">
        <button
          type="button"
          className="gx-icon-btn gx-rail-toggle"
          onClick={openRail}
          aria-label="Open navigation"
        >
          <Icon d={PATH.menu} />
        </button>

        <h1 className="gx-top__title">{project.data?.name ?? 'Build'}</h1>
        {when && (
          <span className="gx-top__when" title={activityAt ? new Date(activityAt).toLocaleString() : undefined}>
            {when}
          </span>
        )}

        <div className="gx-top__actions">
          {studio.connected ? (
            <span className="gx-pill is-live" title={studio.state?.placeName ?? 'Connected to Studio'}>
              <span className="gx-dot" aria-hidden="true" />
              {studio.state?.placeName ?? 'Studio'}
            </span>
          ) : (
            <button type="button" className="gx-pill" onClick={() => setShowPairing(true)}>
              <span className="gx-dot" aria-hidden="true" />
              Connect Studio
            </button>
          )}

          <button
            type="button"
            className="gx-icon-btn"
            onClick={() => setDrawer('memory')}
            aria-label="What Golem remembers about this project"
            title="Project memory"
          >
            <Icon d={PATH.brain} />
          </button>

          <button type="button" className="gx-btn gx-btn--outline gx-top__cp" onClick={showCheckpoints}>
            <Icon d={PATH.layers} size={15} />
            <span className="gx-top__cp-label">Checkpoints</span>
            <Icon d={PATH.chevronRight} size={13} />
          </button>
        </div>
      </header>

      {/* --------------------------------------------------- conversation */}
      <div className="gx-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="gx-thread">
          {historyState === 'error' && (
            <div className="gx-empty">
              <p>Couldn&rsquo;t load this conversation.</p>
              <button type="button" className="gx-btn gx-btn--outline" onClick={reloadHistory}>
                Try again
              </button>
            </div>
          )}

          {historyState === 'ready' && messages.length === 0 && (
            <div className="gx-empty">
              <p style={{ fontSize: '1rem', color: 'var(--gx-ink-2)' }}>
                Tell me what you want to build and I&rsquo;ll make it in your place.
              </p>
              <div style={{ display: 'grid', gap: '0.4rem', marginTop: '1.1rem', textAlign: 'left' }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="gx-row" onClick={() => setSeed(s)} style={{ cursor: 'pointer' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((item) => (
            <Turn key={item.id} item={item} status={agentStatus} isLast={item.id === lastAssistantId} />
          ))}

          {/* Renders forwarded from Studio during this session. Pinned below
              the conversation so a long build does not push them out of sight. */}
          <StudioView frames={frames} running={running} />
        </div>
      </div>

      {/* ------------------------------------------------------ composer -- */}
      <div>
        {connNote && (
          <p className="gx-conn-note" role="status">
            {connNote}
          </p>
        )}
        <Composer
          onSend={send}
          onStop={stop}
          running={running}
          disabled={conn !== 'open'}
          mode={mode}
          onModeChange={setMode}
          providers={providers.data?.models ?? []}
          providerId={providerId}
          onProviderChange={setProviderId}
          autoReasoning={providers.data?.auto.reasoning}
          seed={seed}
        />
      </div>

      {/* ------------------------------------------------------- drawers -- */}
      <Drawer open={drawer === 'checkpoints'} onClose={() => setDrawer(null)} title="Checkpoints">
        <form
          style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.9rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!studio.connected) return;
            createCheckpoint(label.trim() || 'manual checkpoint');
            setLabel('');
          }}
        >
          <input
            className="gx-row"
            style={{ flex: 1, margin: 0, background: 'transparent', color: 'inherit' }}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name this checkpoint"
            aria-label="Checkpoint name"
            disabled={!studio.connected}
          />
          <button type="submit" className="gx-btn gx-btn--outline" disabled={!studio.connected}>
            Save
          </button>
        </form>

        {!studio.connected && (
          <p className="gx-pop__note" style={{ padding: 0 }}>
            Connect Studio to save or restore a checkpoint.
          </p>
        )}
        {checkpointsState === 'loading' && <p className="gx-empty">Loading…</p>}
        {checkpointsState === 'ready' && checkpoints.length === 0 && (
          <p className="gx-empty">
            No checkpoints yet. Golem takes one automatically before it changes anything.
          </p>
        )}

        {checkpoints.map((c) => (
          <div key={c.id} className="gx-row">
            <span className="gx-row__main">
              {c.label}
              <span className="gx-row__meta">
                {new Date(c.createdAt).toLocaleString()} · {c.instanceCount} objects · {c.scriptCount} scripts
              </span>
            </span>
            <button
              type="button"
              className="gx-btn gx-btn--outline"
              disabled={!studio.connected}
              onClick={() => {
                if (!window.confirm(`Restore "${c.label}"? This replaces what is in your place now.`)) return;
                restoreCheckpoint(c.id);
                setDrawer(null);
              }}
            >
              Restore
            </button>
          </div>
        ))}
      </Drawer>

      <Drawer open={drawer === 'memory'} onClose={() => setDrawer(null)} title="What Golem remembers">
        {project.data?.memory_summary ? (
          <p className="gx-memory">{project.data.memory_summary}</p>
        ) : (
          <p className="gx-empty">
            Nothing yet. As you build, Golem keeps a short note about how your project is put
            together and uses it on later turns.
          </p>
        )}
      </Drawer>

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
