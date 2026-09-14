// /projects/:id — a conversation with a capable collaborator.
//
// One lane, not three. The work surface and the context rail are gone as
// permanent columns: what the agent produces now appears inline in the
// conversation where it happened, and the two things that genuinely persist
// between turns — checkpoints and project memory — are one click away in a
// drawer rather than occupying a third of the screen forever.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PRODUCT_MODES, PRODUCT_MODE_TO_SPECIALIST, type ProductMode } from '@golem/shared';
import { MOCK_MODE, mockProjects } from '../lib/mock';
import { shortRelative } from '../lib/format';
import { useShell, useProvideCheckpoints } from '../lib/shell';
import { CreditsPanel } from '../components/ws/credits-panel';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useProjectSocket } from '../lib/use-project-socket';
import { studioConnection } from '../lib/studio-connection';
import { useToast } from '../components/toast';
import { EditableProjectTitle } from '../components/editable-title';
import { useCommands } from '../lib/commands';
import { SHORTCUTS, shortcutLabel } from '../lib/shortcuts';
import { useGlobalShortcut } from '../components/shortcuts-dialog';
import { SearchPanel } from '../components/ws/search-panel';
import { ApiError, downloadExport } from '../lib/api';
import { PairingDialog } from '../components/pairing-dialog';
import { Composer } from '../components/ws/composer';
import { Drawer, Icon, PATH } from '../components/ws/primitives';
import { Turn } from '../components/ws/turn';
import { StudioView } from '../components/ws/studio-view';
import { PlaytestCard } from '../components/ws/playtest-card';
import { ConnectStudio } from '../components/ws/connect-studio';
import { EmptyState } from '../components/empty-state';
import { Spinner } from '../components/loading';

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
  const location = useLocation();
  const navigate = useNavigate();

  const [showPairing, setShowPairing] = useState(false);
  const [drawer, setDrawer] = useState<null | 'checkpoints' | 'memory' | 'credits' | 'search'>(null);
  const [mode, setMode] = useState<ProductMode>('agent');
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
    phaseMarks,
    running,
    checkpoints,
    checkpointsState,
    frames,
    playtest,
    sendChat,
    stop,
    createCheckpoint,
    restoreCheckpoint,
    reloadHistory,
  } = useProjectSocket(projectId, onServerError);

  /**
   * The one place Studio's state is named. Four values, each backed by a real
   * signal on the wire (see lib/studio-connection.ts); "installed" is not one
   * of them, and cannot be, because nothing in the browser can observe it.
   * Derived on every render from live socket state, so the connect prompt
   * below cannot linger after Studio attaches or reappear while it is attached.
   */
  const studioStatus = studioConnection(conn, studio.connected, studio.everConnected);

  const projectNameRef = useRef('this project');
  projectNameRef.current = project.data?.name ?? 'this project';

  // Shared by both export commands so the toast copy and the failure handling cannot diverge.
  const exportConversation = useCallback(
    async (format: 'md' | 'json') => {
      toast(`Preparing ${projectNameRef.current} as ${format === 'md' ? 'Markdown' : 'JSON'}…`, 'info');
      try {
        await downloadExport(projectId, format);
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Export failed', 'error');
      }
    },
    [projectId, toast],
  );

  /**
   * Scroll to a message found by search.
   *
   * The message may not be mounted: the workspace pages backwards from the newest hundred, and a
   * hit from six months ago is not in the DOM. Loading the surrounding history first would be the
   * complete answer; until that exists, saying so plainly beats scrolling to nothing and looking
   * broken.
   */
  const jumpToMessage = useCallback(
    (messageId: string) => {
      const el = document.getElementById(`msg-${messageId}`);
      if (!el) {
        toast('That message is further back than the loaded history — load more and search again.', 'info');
        return;
      }
      setDrawer(null);
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // A flash rather than a persistent highlight: it answers "which one?" and then gets out of
      // the way, so the next jump is just as legible as the first.
      el.classList.add('is-found');
      setTimeout(() => el.classList.remove('is-found'), 1600);
    },
    [toast],
  );

  useGlobalShortcut(SHORTCUTS.search, () => setDrawer('search'));

  // What this route contributes to the command palette. These exist ONLY while a workspace is
  // mounted, because every one of them needs something this route owns — the socket, the drawer
  // state, or a project id. A command that is listed but cannot run says why rather than
  // disappearing: vanishing teaches the user it does not exist.
  useCommands([
    {
      id: 'ws-stop',
      title: 'Stop the run',
      section: 'Run',
      keywords: ['cancel', 'halt', 'abort'],
      hint: shortcutLabel(SHORTCUTS.stop),
      enabled: running,
      why: 'Nothing is running',
      run: stop,
    },
    {
      id: 'ws-checkpoint',
      title: 'New checkpoint',
      section: 'Run',
      keywords: ['save', 'snapshot', 'restore point'],
      enabled: studioStatus === 'connected',
      why: 'Studio is not connected',
      run: () => createCheckpoint('manual checkpoint'),
    },
    {
      id: 'ws-checkpoints',
      title: 'Checkpoints',
      section: 'Run',
      keywords: ['history', 'restore', 'undo'],
      hint: shortcutLabel(SHORTCUTS.checkpoints),
      run: () => setDrawer('checkpoints'),
    },
    {
      id: 'ws-search',
      title: 'Search this conversation',
      section: 'Project',
      keywords: ['find', 'lookup', 'grep'],
      hint: shortcutLabel(SHORTCUTS.search),
      run: () => setDrawer('search'),
    },
    {
      id: 'ws-memory',
      title: 'What Apple remembers',
      section: 'Project',
      keywords: ['memory', 'context', 'knows'],
      run: () => setDrawer('memory'),
    },
    {
      id: 'ws-credits',
      title: 'Credits and clearance',
      section: 'Project',
      keywords: ['licence', 'license', 'attribution', 'assets'],
      run: () => setDrawer('credits'),
    },
    {
      id: 'ws-connect',
      title: studioStatus === 'connected' ? 'Studio pairing' : 'Connect Studio',
      section: 'Project',
      keywords: ['pair', 'plugin', 'roblox'],
      run: () => setShowPairing(true),
    },
    {
      id: 'ws-roadmap',
      title: 'Roadmap',
      section: 'Project',
      keywords: ['plan', 'milestones', 'next'],
      run: () => navigate(`/projects/${projectId}/roadmap`),
    },
    {
      id: 'ws-export-md',
      title: 'Export conversation (Markdown)',
      section: 'Project',
      keywords: ['download', 'save', 'transcript'],
      run: () => void exportConversation('md'),
    },
    {
      id: 'ws-export-json',
      title: 'Export conversation (JSON)',
      section: 'Project',
      keywords: ['download', 'save', 'transcript', 'data'],
      run: () => void exportConversation('json'),
    },
  ]);


  /**
   * The roadmap hands a milestone over as router state rather than in the URL,
   * because the brief is prose: a query string would put a whole instruction in
   * the address bar and leave it in browser history.
   *
   * It is consumed once and then cleared. Router state outlives a reload and is
   * restored by a Back that lands here again, so leaving it in place would keep
   * refilling the composer with a request the user may have deliberately
   * abandoned — and would pin the mode chip to a choice they could not undo by
   * navigating. Replacing the history entry is what makes this a handoff rather
   * than a state the route can never leave.
   */
  useEffect(() => {
    const handoff = location.state as { seed?: unknown; mode?: unknown } | null;
    if (!handoff) return;
    if (typeof handoff.seed === 'string' && handoff.seed.trim() !== '') setSeed(handoff.seed);
    // Anything at all can be pushed into router state, so the mode is checked
    // against the shared vocabulary instead of being trusted into a typed setter.
    if (PRODUCT_MODES.includes(handoff.mode as ProductMode)) setMode(handoff.mode as ProductMode);
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

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
    // The product mode the user picked becomes the internal specialist here,
    // at the one point a message is built. Everything downstream — the wire
    // protocol, stored sessions, budget accounting — still speaks GolemMode.
    if (!sendChat(text, PRODUCT_MODE_TO_SPECIALIST[mode])) {
      toast('Not connected yet — hang on a moment.', 'error');
    }
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

  // LOADING AND FAILURE BOTH HAVE TO SAY SO.
  //
  // Only the "project is gone" case was handled. While the fetch was in flight, and — worse —
  // after it FAILED, this fell straight through to the full workspace render: a header titled
  // "Build", every panel empty, and nothing anywhere saying the data never arrived. A screen that
  // looks like an empty project is indistinguishable from an empty project, which is the same
  // defect as a green check over a failed build, wearing different clothes.
  if (project.isPending) {
    return (
      <div className="gx-plain" aria-busy="true">
        <Spinner label="Opening your project…" />
      </div>
    );
  }

  if (project.isError) {
    return (
      <div className="gx-plain">
        <EmptyState
          state="connectionFailed"
          detail={project.error instanceof Error ? project.error.message : undefined}
          action={
            <button type="button" className="gx-btn" onClick={() => void project.refetch()}>
              Try again
            </button>
          }
        />
        <Link to="/" className="gx-btn gx-btn--outline">
          Back to your builds
        </Link>
      </div>
    );
  }

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

        {/* Renamable in place: this is where you notice a bad name, so this is where fixing it
            belongs. Falls back to a plain heading until the project has loaded — an editable
            control over a placeholder would offer to rename something that is not there yet. */}
        {project.data ? (
          <EditableProjectTitle projectId={projectId} name={project.data.name} className="gx-top__title" />
        ) : (
          <h1 className="gx-top__title">Build</h1>
        )}
        {when && (
          <span className="gx-top__when" title={activityAt ? new Date(activityAt).toLocaleString() : undefined}>
            {when}
          </span>
        )}

        <div className="gx-top__actions">
          {studioStatus === 'connected' ? (
            <span className="gx-pill is-live" title={studio.state?.placeName ?? 'Connected to Studio'}>
              <span className="gx-dot" aria-hidden="true" />
              {/* The PLACE name, which is worth showing: it says which place is paired,
                  and that is not always the project you are looking at. Below 860px it
                  is hidden in favour of the word "Studio" — at that width it sat beside
                  a project title of the same name and BOTH truncated, so the topbar
                  showed the same name twice and neither legibly. The full name stays in
                  the title attribute at every width. */}
              <span className="gx-pill__place">{studio.state?.placeName ?? 'Studio'}</span>
              <span className="gx-pill__short">Studio</span>
            </span>
          ) : studioStatus === 'connecting' ? (
            // No answer from the worker yet. Not a claim either way.
            <span className="gx-pill" title="Waiting for the workspace connection">
              <span className="gx-dot" aria-hidden="true" />
              Checking Studio…
            </span>
          ) : (
            <button type="button" className="gx-pill" onClick={() => setShowPairing(true)}>
              <span className="gx-dot" aria-hidden="true" />
              {studioStatus === 'disconnected' ? 'Studio disconnected' : 'Connect Studio'}
            </button>
          )}

          <button
            type="button"
            className="gx-icon-btn"
            onClick={() => setDrawer('memory')}
            aria-label="What Apple remembers about this project"
            title="Project memory"
          >
            <Icon d={PATH.brain} />
          </button>

          {/* What the project owes before it can be published. An icon button
              rather than a fourth named control: it is read once, near the end,
              and giving it the weight of Roadmap would put a rare pre-publish
              check in front of the thing people are here to do. */}
          <button
            type="button"
            className="gx-icon-btn"
            onClick={() => setDrawer('credits')}
            aria-label="Credits and clearance to publish"
            title="What this project owes"
          >
            <Icon d={PATH.licence} />
          </button>

          {/* The way into the plan. The conversation says what is happening
              now; the roadmap says what is worth doing next, so it sits beside
              Checkpoints — forward and back from the same row.

              It borrows the Checkpoints button's own classes rather than
              introducing a control style: gx-top__cp is what gives a topbar
              button its height and a thumb-sized target, and gx-top__cp-label
              is what drops the word below 860px so a narrow topbar collapses
              to icons instead of overflowing. No trailing chevron — that glyph
              means "opens a drawer here" on the button next to it, and this
              leaves the page.

              Both controls carry an aria-label rather than relying on the text:
              it is that same collapse that takes the name away, because a
              display:none span contributes nothing to the accessible name. Below
              860px Checkpoints was announcing as an unnamed button, and this
              link would have been announced by its description. */}
          <Link
            to={`/projects/${projectId}/roadmap`}
            className="gx-btn gx-btn--outline gx-top__cp"
            aria-label="Roadmap"
            title="What Apple would build next in this place"
          >
            <Icon d={PATH.listAll} size={15} />
            <span className="gx-top__cp-label">Roadmap</span>
          </Link>

          <button
            type="button"
            className="gx-btn gx-btn--outline gx-top__cp"
            aria-label="Checkpoints"
            onClick={showCheckpoints}
          >
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
            <EmptyState
              state="connectionFailed"
              detail={<p className="es__body">Couldn&rsquo;t load this conversation. Nothing in your project was changed.</p>}
              action={
                <button type="button" className="gx-btn gx-btn--outline" onClick={reloadHistory}>
                  Try again
                </button>
              }
            />
          )}

          {historyState === 'ready' && messages.length === 0 && (
            <EmptyState
              state="noConversation"
              detail={
                <p className="es__body">Tell me what you want to build and I&rsquo;ll make it in your place.</p>
              }
              action={
                <div className="gx-seeds">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="gx-row" onClick={() => setSeed(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              }
            />
          )}

          {messages.map((item) => (
            // The id is on a wrapper rather than passed into Turn: search jumps to a message by
            // scrolling to it, and that only needs an element to aim at.
            <div key={item.id} id={`msg-${item.id}`} data-message-id={item.id}>
            <Turn
              item={item}
              status={agentStatus}
              // `agent_status` carries no msgId, so the phase marks can only be
              // attributed to the run in flight — the last assistant turn.
              phaseMarks={item.id === lastAssistantId ? phaseMarks : undefined}
              isLast={item.id === lastAssistantId}
            />
            </div>
          ))}

          {/* The connect prompt sits at the foot of the conversation — where
              the eye already is before typing — and vanishes the instant
              Studio attaches. It is a pure function of studioStatus, so there
              is no dismissal state to get stuck. */}
          <ConnectStudio status={studioStatus} onPair={() => setShowPairing(true)} />

          {/* The playtest viewport. Renders only while the worker says a
              playtest exists — it is a pure function of `playtest`, so it
              cannot linger after one ends or appear before one starts. Placed
              above the build renders because a live run is the thing the user
              is waiting on. */}
          <PlaytestCard run={playtest} frames={frames} studioConnected={studio.connected} />

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
        {checkpointsState === 'loading' && (
          <p className="gx-empty">Reading the checkpoints Apple has taken…</p>
        )}
        {checkpointsState === 'ready' && checkpoints.length === 0 && (
          <p className="gx-empty">
            No checkpoints yet. Apple takes one automatically before it changes anything.
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

      <Drawer open={drawer === 'search'} onClose={() => setDrawer(null)} title="Search this conversation">
        <SearchPanel projectId={projectId} onJump={jumpToMessage} />
      </Drawer>

      <Drawer open={drawer === 'credits'} onClose={() => setDrawer(null)} title="Credits and clearance">
        {/* Mounted only while open so the request is made when a user asks the
            question, not on every workspace load for everyone who never will. */}
        {drawer === 'credits' && <CreditsPanel projectId={projectId} />}
      </Drawer>

      <Drawer open={drawer === 'memory'} onClose={() => setDrawer(null)} title="What Apple remembers">
        {project.data?.memory_summary ? (
          <p className="gx-memory">{project.data.memory_summary}</p>
        ) : (
          <p className="gx-empty">
            Nothing yet. As you build, Apple keeps a short note about how your project is put
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
