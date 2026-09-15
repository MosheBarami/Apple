// /projects/:id — a conversation with a capable collaborator.
//
// One lane, not three. The work surface and the context rail are gone as
// permanent columns: what the agent produces now appears inline in the
// conversation where it happened, and the two things that genuinely persist
// between turns — checkpoints and project memory — are one click away in a
// drawer rather than occupying a third of the screen forever.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PRODUCT_MODES, PRODUCT_MODE_TO_SPECIALIST, type ProductMode } from '@golem/shared';
import { MOCK_MODE, mockProjects } from '../lib/mock';
import { shortRelative } from '../lib/format';
import { exportDoneLine, exportProgressLine, exportStartLine, exportToastKey } from '../lib/export-progress';
import { useProvideCheckpoints } from '../lib/shell';
import { CreditsPanel } from '../components/ws/credits-panel';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useProjectSocket } from '../lib/use-project-socket';
import { studioConnection } from '../lib/studio-connection';
import { StudioLinkNote } from '../components/ws/studio-link-note';
import { useToast } from '../components/toast';
import { EditableProjectTitle } from '../components/editable-title';
import { PresenceBar } from '../components/presence-bar';
import { useAuth } from '../lib/auth';
import { useCommands } from '../lib/commands';
import { SHORTCUTS, shortcutLabel } from '../lib/shortcuts';
import { useGlobalShortcut } from '../components/shortcuts-dialog';
import { SearchPanel } from '../components/ws/search-panel';
import { EditMessageDialog } from '../components/ws/edit-message-dialog';
import { RevisionsDialog } from '../components/ws/revisions-dialog';
import { MemoryPanel } from '../components/ws/memory-panel';
import { AutomationsPanel } from '../components/ws/automations-panel';
import { MembersPanel } from '../components/ws/members-panel';
import { InstructionsPanel } from '../components/ws/instructions-panel';
import {
  ApiError,
  downloadExport,
  fetchMembers,
  fetchPersonalisation,
  fetchProjectAccess,
  // Renamed at the import rather than in the module: `rebindPlace` is already the name of the
  // handler below, and shadowing the client with the callback that calls it is how a later edit
  // ends up calling itself.
  rebindPlace as rebindPlaceRequest,
  savePreferences,
  type SearchHit,
} from '../lib/api';
import { FilesPanel } from '../components/ws/files-panel';
import { ACCESS_LOADING, allows, normaliseAccess, type AccessState } from '../lib/capabilities';
import type { AssetSourcePolicy, ChatAttachment } from '@golem/shared';
import { owesAnswer } from '../lib/asset-sources';
import { AssetSourceDialog } from '../components/asset-source-dialog';
import { isNearBottom, jumpLabel, unseenCount } from '../lib/follow-latest';
import { replyAnnouncement } from '../lib/announce';
import { readViewChoice, writeViewChoice } from '../lib/view-state';
import { fidelityLine, restoreInFlight, restoreSentence, restoreTone } from '../lib/restore-status';
import { checkpointAuthorView, rosterNames } from '../lib/checkpoint-author';
import { PairingDialog } from '../components/pairing-dialog';
import { Composer } from '../components/ws/composer';
import { Drawer, Icon, PATH } from '../components/ws/primitives';
import { Turn } from '../components/ws/turn';
import { StudioView } from '../components/ws/studio-view';
import { StudioActivity } from '../components/ws/studio-activity';
import { PlaytestCard } from '../components/ws/playtest-card';
import { ConnectStudio, StudioLink } from '../components/ws/connect-studio';
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

/**
 * Every drawer this build can show, plus the name 'none' for "closed".
 *
 * `null` cannot be stored, and storing the empty string for it would make "closed" and "a value
 * this build no longer recognises" the same state — which is precisely the distinction the
 * validation exists to keep.
 */
// Four agents added a drawer each, from four checklist sections, and all four belong. The union
// and the literal list are kept in step deliberately: search-panel.test.mjs asserts every name the
// union can hold is a name DRAWERS accepts, because a drawer missing from the list restores as
// closed for ever and looks like a user who simply never opened it.
type Drawer = null | 'checkpoints' | 'memory' | 'credits' | 'search' | 'members' | 'files' | 'history' | 'automations';
type DrawerName = 'none' | 'checkpoints' | 'memory' | 'credits' | 'search' | 'members' | 'files' | 'history' | 'automations';
const DRAWERS = ['none', 'checkpoints', 'memory', 'credits', 'search', 'members', 'files', 'history', 'automations'] as const;

export function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id ?? '';
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [showPairing, setShowPairing] = useState(false);
  //[[ THE DRAWER YOU LEFT OPEN IS STILL OPEN.
  //
  //   This was plain `useState(null)`, so every navigation closed whatever you were reading and
  //   coming back was a fresh start. Restored per project, because the drawer you want open in
  //   one project is not evidence about another.
  //
  //   The stored value is CHECKED against the drawers this build actually has. A name left by an
  //   older version would otherwise set the state open with nothing to render, and an interface
  //   claiming to show something it is not is worse than one that forgot. ]]
  const [drawer, setDrawerState] = useState<Drawer>(() => {
    const stored = readViewChoice<DrawerName>(`drawer.${projectId}`, DRAWERS, 'none');
    return stored === 'none' ? null : stored;
  });
  const setDrawer = useCallback(
    (next: Drawer) => {
      setDrawerState(next);
      writeViewChoice(`drawer.${projectId}`, next ?? 'none');
    },
    [projectId],
  );
  const [mode, setMode] = useState<ProductMode>('agent');
  const [seed, setSeed] = useState<string | undefined>(undefined);
  const [label, setLabel] = useState('');
  // Kept beside the label rather than inside the form element so clearing both after a save is one
  // statement — a description left behind after a save reappears on the NEXT checkpoint and
  // describes the wrong snapshot.
  const [note, setNote] = useState('');

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

  //[[ WHAT THIS PERSON MAY DO HERE — asked, rather than assumed.
  //
  //   `GET /api/shared/:id` resolves the role from `projects.owner_id` and the membership rows and
  //   answers with the capability set. The owner is a member of their own project through that
  //   column, so there is no separate owner path: one query serves both.
  //
  //   ONE ACCESS QUERY, NOT ONE PER DRAWER. Two drawers need this same answer — Files, to decide
  //   whether Rename/Delete are offered, and Members, to decide whether the roster's controls are
  //   live — and each arrived with its own copy. Two `useQuery` calls on one key is not twice the
  //   cost, but it is two places for `enabled` and the error mapping to drift, and they already
  //   had. Declared once, here, and gated on either drawer being open, so the check is still not
  //   bought for a user who opens neither.
  //
  //   `retry: false`: a 403 here is the correct answer to a question we asked, not a flake, and
  //   three silent retries would only delay the panel telling the user what it found out. ]]
  const accessQuery = useQuery({
    queryKey: ['access', projectId],
    queryFn: () => fetchProjectAccess(projectId),
    enabled: projectId.length > 0 && (drawer === 'files' || drawer === 'members'),
    retry: false,
    staleTime: 5 * 60_000,
  });

  //[[ THE THIRD STATE IS THE POINT. `useQuery` is pending before the first answer and errors on a
  //   refusal, and NEITHER of those is a role. Rendering either as one would hand a stranger a live
  //   Remove button on an authority nothing established — the failure-to-observe pattern exactly.
  //   `unavailable` is not `viewer`: a check that did not come back is not a verdict about the
  //   person. `normaliseAccess` owns the mapping, so a role this build does not know lands as
  //   `unavailable` rather than as an empty permission set; nothing here reads the payload field by
  //   field. ]]
  const access: AccessState = useMemo(() => {
    if (accessQuery.isError) {
      const e = accessQuery.error;
      return { status: 'unavailable', detail: e instanceof ApiError ? e.message : 'the access check failed' };
    }
    if (!accessQuery.isSuccess) return ACCESS_LOADING;
    return normaliseAccess(accessQuery.data);
  }, [accessQuery.isSuccess, accessQuery.isError, accessQuery.error, accessQuery.data]);

  const onServerError = useCallback(
    (code: string, message: string) => toast(message || `Something went wrong (${code})`, 'error'),
    [toast],
  );

  /**
   * Something the server noticed that did not stop anything.
   *
   * Today there is exactly one: a credential spotted in the message that was just sent. It is an
   * `info` rather than an `error` because the run is still going and nothing failed — but it
   * carries the action, because "rotate that key" is only useful next to the place keys live. The
   * detection existed for months and was discarded at the call site; a toast nobody wired would
   * have discarded it again one layer higher.
   */
  const onNotice = useCallback(
    (code: string, message: string) => {
      toast(message || `Heads up (${code})`, 'info', {
        key: `notice:${code}`,
        ...(code === 'secret_in_prompt'
          ? { action: { label: 'Open Settings', run: () => navigate('/app/settings') } }
          : {}),
      });
    },
    [toast, navigate],
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
    presence,
    sendChat,
    signalPresence,
    editAndResend,
    stop,
    createCheckpoint,
    restoreCheckpoint,
    restoreStatus,
    reloadHistory,
  } = useProjectSocket(projectId, onServerError, onNotice);

  // A second Restore while the first is still clearing the place would race the plugin against
  // itself. The worker's own phases decide this, not a flag set by the click: a click that never
  // reached the worker must not leave every button dead.
  const restoreBusy = restoreInFlight(restoreStatus);

  /**
   * The one place Studio's state is named. Four values, each backed by a real
   * signal on the wire (see lib/studio-connection.ts); "installed" is not one
   * of them, and cannot be, because nothing in the browser can observe it.
   * Derived on every render from live socket state, so the connect prompt
   * below cannot linger after Studio attaches or reappear while it is attached.
   */
  const studioStatus = studioConnection(conn, studio.connected, studio.everConnected);

  /**
   * Bind this project to whatever place Studio has open now.
   *
   * Offered ONLY from the mismatch sentence, which is the one state where it is the right answer:
   * the link is healthy, the pill is green, and every op is being withheld because Studio is
   * holding a different place. The worker clears the binding and re-binds on the next identifiable
   * state event — the same path a first pairing takes — so the poll parked in the long hold is
   * released and the queued work goes through within a round trip. No local state is updated here:
   * the confirmation is the `studio_status` broadcast that follows, which is the only source this
   * screen trusts about the link.
   */
  const rebindPlace = useCallback(() => {
    rebindPlaceRequest(projectId)
      .then(() => toast('Bound to the place Studio has open. Your queued changes will go through now.', 'success'))
      .catch((e) => toast(e instanceof Error ? e.message : 'Could not rebind this project.', 'error'));
  }, [projectId, toast]);

  // Your own id, so the presence row shows the OTHER people. Null until the session loads, and
  // presenceView is explicit about showing everyone rather than guessing which face is yours.
  const { session } = useAuth();
  const qc = useQueryClient();

  // The resolved policy — org, user and project already layered by the server. Re-deriving the
  // precedence here would be a second implementation of it, and the two would diverge.
  const userId = session?.user.id ?? '';
  const personal = useQuery({
    queryKey: ['personalisation', projectId],
    queryFn: () => fetchPersonalisation(projectId),
    enabled: projectId.length > 0,
  });
  const sourcePolicy = personal.data?.preferences.asset_sources ?? null;

  //[[ NAMES FOR THE PEOPLE WHO TOOK THE CHECKPOINTS.
  //
  //   Asked only while the checkpoints drawer is open. The roster rather than presence: a
  //   checkpoint taken last week by someone who is not connected right now is exactly the row
  //   whose author a user wants, and presence only knows who is here at this moment.
  //
  //   When it has not loaded, or a member has since left, the row says "Another member" — an
  //   honest gap. It must never fall back to the reader.
  //
  //   The ACCESS check this route also needs is declared once, above, and gated on the drawers
  //   that need it — see its comment for why two copies of it drifted apart the first time. ]]
  const roster = useQuery({
    queryKey: ['members', projectId, 'active', ''],
    queryFn: () => fetchMembers(projectId, new URLSearchParams({ status: 'active' })),
    enabled: projectId.length > 0 && drawer === 'checkpoints',
  });
  const memberNames = roster.data ? rosterNames(roster.data.members) : {};

  const saveSources = async (policy: AssetSourcePolicy) => {
    if (!userId) throw new Error('not signed in');
    await savePreferences('user', userId, { asset_sources: policy });
    await qc.invalidateQueries({ queryKey: ['personalisation', projectId] });
  };
  const selfUserId = session?.user?.id ?? null;

  const projectNameRef = useRef('this project');
  projectNameRef.current = project.data?.name ?? 'this project';

  // Shared by both export commands so the toast copy and the failure handling cannot diverge.
  const exportConversation = useCallback(
    async (format: 'md' | 'json') => {
      // ONE ROW FOR THE WHOLE EXPORT. The key makes the progress line replace itself and the
      // outcome replace the progress line — before this, the only signal was "Preparing…", which
      // never changed and never ended, so a finished export and a dead one looked identical.
      const name = projectNameRef.current;
      const key = exportToastKey(projectId, format);
      toast(exportStartLine(name, format), 'info', { key });
      try {
        const saved = await downloadExport(projectId, format, (p) => toast(exportProgressLine(name, format, p), 'info', { key }));
        toast(exportDoneLine(saved.filename), 'success', { key });
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Export failed', 'error', { key });
      }
    },
    [projectId, toast],
  );

  /**
   * Run the last prompt again.
   *
   * Reuses `edit_resend` with the text unchanged rather than adding a second "re-run" path: the
   * server behaviour a retry needs — drop the failed turn, run the prompt again — is exactly what
   * an edit does, and a second endpoint would be a second definition of what re-running means.
   *
   * No confirmation, because it is only ever offered on the LAST turn: the only thing discarded is
   * the failed attempt itself. Retrying something older WOULD throw away everything after it, and
   * that is the edit path, which asks first.
   */
  const retryLast = useCallback(() => {
    if (running) return;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    editAndResend(lastUser.id, lastUser.content, PRODUCT_MODE_TO_SPECIALIST[mode]);
  }, [messages, running, editAndResend, mode]);

  // Which of my own messages is being edited, if any.
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);

  // Which message's earlier versions are open, if any. Held as an id rather than as the row: the
  // dialog reads the text from the live list, so a message that changes underneath it shows what it
  // says now rather than what it said when the control was clicked.
  const [showingRevisions, setShowingRevisions] = useState<string | null>(null);
  const revisionsFor = showingRevisions ? messages.find((m) => m.id === showingRevisions) : undefined;

  // How much the edit throws away, counted from what is actually on screen rather than described.
  // "Later messages" reads as two or three; forty-seven does not.
  const discardCount = editing
    ? Math.max(0, messages.length - messages.findIndex((m) => m.id === editing.id) - 1)
    : 0;

  /**
   * Scroll to a message found by search.
   *
   * The message may not be mounted: the workspace pages backwards from the newest hundred, and a
   * hit from six months ago is not in the DOM. Loading the surrounding history first would be the
   * complete answer; until that exists, saying so plainly beats scrolling to nothing and looking
   * broken.
   */
  //[[ A MESSAGE IS A PLACE, SO IT GETS AN ADDRESS.
  //
  //   The scroll used to be the whole of it: the URL was /projects/:id before the jump and
  //   /projects/:id after, so the found message could not be sent to anybody and a reload put you
  //   back at the bottom of the thread. The hash is the id the turn already renders — one naming
  //   scheme, not two — and it is written with `replace` because a jump is not a page anyone
  //   should have to press Back through, and search produces them in bursts.
  //
  //   `anchored` is what stops the loop: this writes the hash, and the effect below reads the
  //   hash and calls this. It records the anchor it has satisfied, so the second pass is a no-op. ]]
  const anchored = useRef<string | null>(null);
  const jumpToMessage = useCallback(
    (messageId: string, origin: 'search' | 'link' = 'search') => {
      anchored.current = messageId;
      const el = document.getElementById(`msg-${messageId}`);
      if (!el) {
        // The two callers need different advice. "Search again" is right beside an open search
        // panel and nonsense to someone who followed a link and has no search open.
        toast(
          origin === 'link'
            ? 'That message is further back than the loaded history — open the project and load more to reach it.'
            : 'That message is further back than the loaded history — load more and search again.',
          'info',
        );
        return;
      }
      setDrawer(null);
      navigate({ hash: `#msg-${messageId}` }, { replace: true });
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // A flash rather than a persistent highlight: it answers "which one?" and then gets out of
      // the way, so the next jump is just as legible as the first.
      el.classList.add('is-found');
      setTimeout(() => el.classList.remove('is-found'), 1600);
    },
    [navigate, toast],
  );

  //[[ AND AN ADDRESS THAT IS PASTED BACK IN IS HONOURED.
  //
  //   Deliberately gated on `historyState === 'ready'`. The workspace pages backwards from the
  //   newest hundred, so at first paint the message a link names is usually not in the DOM yet;
  //   jumping straight away would tell someone their message is "further back than the loaded
  //   history" while it is still on its way — a wrong explanation, which sends them looking for
  //   history that was never missing. ]]
  useEffect(() => {
    if (historyState !== 'ready') return;
    const id = location.hash.startsWith('#msg-') ? location.hash.slice('#msg-'.length) : '';
    if (!id || anchored.current === id) return;
    jumpToMessage(id, 'link');
  }, [historyState, location.hash, jumpToMessage]);

  //[[ A RESULT OPENS THE THING IT FOUND.
  //
  //   Search now returns five kinds of record, and four of them are not messages. Sending every
  //   hit through `jumpToMessage` would have looked for a `msg-` element that never existed and
  //   toasted "further back than the loaded history" about a checkpoint — a wrong explanation,
  //   which is worse than none, because the user goes looking for the history that is not missing.
  //
  //   Activity USED to be the kind with nowhere to go — the oplog row carried no anchor to a
  //   message. It carries one now (session.ts writes the op's `run_id`), so an activity hit from a
  //   run opens that run through the `messageId` branch above like any other record.
  //
  //   The branch below survives for the ops that genuinely belong to NO run: a manual checkpoint,
  //   a snapshot taken between builds. Those must keep saying so rather than scrolling nowhere —
  //   and the wording no longer claims that ALL activity is anchorless, which would be a wrong
  //   explanation for the common case now that most of it is not. ]]
  const openHit = useCallback(
    (hit: SearchHit) => {
      if (hit.messageId) {
        jumpToMessage(hit.messageId);
        return;
      }
      if (hit.type === 'checkpoint') {
        setDrawer('checkpoints');
        return;
      }
      if (hit.type === 'memory') {
        setDrawer('memory');
        return;
      }
      toast('That happened outside a run, so there is no conversation to open — the result line is the whole of it.', 'info');
    },
    [jumpToMessage, setDrawer, toast],
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
      id: 'ws-history',
      title: 'What Apple did in Studio',
      section: 'Run',
      keywords: ['history', 'activity', 'log', 'ops', 'timeline', 'changes'],
      run: () => setDrawer('history'),
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
      // Listed for everybody, including a viewer who cannot manage anyone. The panel shows the
      // roster to any member and says in a sentence why the controls are off; hiding the command
      // would teach a viewer the product has no sharing at all.
      id: 'ws-members',
      title: 'Who can build here',
      section: 'Project',
      keywords: ['members', 'share', 'collaborators', 'invite', 'permissions', 'role', 'roles'],
      run: () => setDrawer('members'),
    },
    {
      // ONE ENTRY, NOT TWO. Both sides gave Files a command and the ids collided, which
      // command-palette.test.mjs fails on by name. The keywords are the union of both: the panel
      // really does own the download and the trash AND the per-version "Put back", so a user who
      // searches for either word has to land here.
      id: 'ws-files',
      title: 'Project files',
      section: 'Project',
      keywords: ['files', 'workspace', 'notes', 'download', 'trash', 'versions', 'revert', 'put back', 'history'],
      run: () => setDrawer('files'),
    },
    {
      id: 'ws-credits',
      title: 'Credits and clearance',
      section: 'Project',
      keywords: ['licence', 'license', 'attribution', 'assets'],
      run: () => setDrawer('credits'),
    },
    {
      id: 'ws-automations',
      title: 'Saved instructions',
      section: 'Project',
      keywords: ['automation', 'automations', 'repeat', 'run again', 'scheduled', 'recurring'],
      run: () => setDrawer('automations'),
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

  //[[ FOLLOWING THE LIVE EDGE IS A STATE THE USER CAN SEE AND LEAVE.
  //
  //   This was a `useRef` written from the scroll handler. As a heuristic it was right and it is
  //   kept — `isNearBottom` is that same expression, named — but as the whole mechanism it had two
  //   failures on a long build. It was INVISIBLE: scrolling up to re-read step 3 silently left the
  //   live edge, and nothing said so or offered a way back. And a ref does not re-render, so no
  //   control COULD have been offered from it.
  //
  //   `seen` is a WATERMARK, not a counter. The transcript can shrink — an edit-and-resend
  //   truncates it, and `history_truncated` drops rows the server deleted — and an accumulating
  //   counter would go on announcing turns that no longer exist. ]]
  const [following, setFollowing] = useState(true);
  const seen = useRef(0);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setFollowing(true);
    seen.current = 0;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
    // While following, there is nothing unseen by definition — the watermark tracks the total so
    // the count starts from zero the moment the reader leaves.
    if (stick.current) seen.current = messages.length;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    stick.current = near;
    if (near) seen.current = messages.length;
    setFollowing(near);
  };

  const unseen = following ? 0 : unseenCount(messages.length, seen.current);

  //[[ THE SETTLED REPLY, SAID ONCE.
  //
  //   The Thinking card already announces the phase while a run is in flight; nothing announced the
  //   ANSWER, because the reply arrives as text mutated into an existing node and no live region
  //   reports that. Wrapping the transcript in aria-live with the default `additions text` would
  //   put every streaming delta into the polite queue — see lib/announce.ts for why that is worse
  //   than silence. This announces the outcome of the last assistant turn, once it has settled. ]]
  const lastTurn = messages[messages.length - 1];
  const announcement = replyAnnouncement(lastTurn);

  // RETURNS WHETHER THE MESSAGE LEFT, and the composer keeps the user's text when it did not.
  // The toast said the send had been refused while the box had already been emptied, so the one
  // thing the user needed to recover — what they had typed — was gone by the time they read why.
  //[[ WHERE MAY APPLE GET ASSETS FROM? Asked before the first build, not during it.
  //
  //   The question has to be answered BEFORE the message leaves, because a build that has already
  //   started has already decided. So a send that owes an answer is held: the text is kept, the
  //   dialog opens, and the message goes on its own the moment the policy is stored.
  //
  //   `send` still returns false in that case, and that is deliberate rather than a compromise —
  //   false means "not sent", the composer keeps the words, and nothing is lost if the person
  //   closes the dialog. A true here would clear the box for a message that never left. ]]
  const [heldMessage, setHeldMessage] = useState<string | null>(null);

  const askFirst = (text: string): boolean => {
    if (!owesAnswer(sourcePolicy)) return false;
    setHeldMessage(text);
    return true;
  };

  const send = (text: string, attachments: ChatAttachment[] = []): boolean => {
    if (askFirst(text)) return false;
    // Sending re-arms following: you have just added to the conversation, so you want to watch it.
    stick.current = true;
    setFollowing(true);
    setSeed(undefined);
    // The product mode the user picked becomes the internal specialist here,
    // at the one point a message is built. Everything downstream — the wire
    // protocol, stored sessions, budget accounting — still speaks GolemMode.
    if (!sendChat(text, PRODUCT_MODE_TO_SPECIALIST[mode], attachments)) {
      toast('Not connected yet — hang on a moment. Your message is still in the box.', 'error');
      return false;
    }
    return true;
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
        {/* The rail opener used to be here. It is now drawn by the shell (components/layout.tsx)
            so that it exists on every route rather than only inside a conversation; at narrow
            width it lands in this bar's reserved leading space, so the topbar is unchanged to
            look at. Do not add a second one here — two buttons at the same coordinates is a
            stacking-order question, not a cosmetic one. */}

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
          {/* Who else is in this project. Draws nothing at all when you are alone — see
              components/presence-model.ts. */}
          <PresenceBar present={presence} selfUserId={selfUserId} />
          {studioStatus === 'connected' ? (
            <span className="gx-pill is-live" title={studio.state?.placeName ?? studio.link.place?.placeName ?? 'Connected to Studio'}>
              <span className="gx-dot" aria-hidden="true" />
              {/* The PLACE name, which is worth showing: it says which place is paired,
                  and that is not always the project you are looking at. Below 860px it
                  is hidden in favour of the word "Studio" — at that width it sat beside
                  a project title of the same name and BOTH truncated, so the topbar
                  showed the same name twice and neither legibly. The full name stays in
                  the title attribute at every width. */}
              {/* `studio.state` only arrives on the studio_status the worker sends when a plugin
                  goes from absent to present. A tab opened or refreshed while Studio was ALREADY
                  attached never gets one — and fell back to the literal word "Studio" while the
                  bound place sat unread on `hello`. Reported place first (it is what Studio has
                  open this second), then the binding, then the generic word. */}
              <span className="gx-pill__place">{studio.state?.placeName ?? studio.link.place?.placeName ?? 'Studio'}</span>
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

          {/* Who else is in this project. An icon button beside memory rather than a named
              control: it is opened when someone wants to add or remove a collaborator, which is
              rarer than the thing this screen is for. The label says what the drawer answers,
              because "Members" alone does not tell a viewer they will find their own role there.

              It is NOT hidden from a viewer. The panel answers "who can see this" for anybody who
              can see the project at all, and turns its own controls off with the reason attached —
              a control that disappears teaches people the feature does not exist, which is how the
              roster stayed invisible for as long as it did. */}
          <button
            type="button"
            className="gx-icon-btn"
            onClick={() => setDrawer('members')}
            aria-label="Who can build here"
            title="Who can build here"
          >
            <Icon d={PATH.people} />
          </button>
          {/* The way into the files Apple keeps for this project — notes, plans and generated
              data, which are Golem's own storage and not the Roblox place. Beside memory because
              it is the same kind of thing: something that persists between turns and is read
              occasionally rather than worked in. */}
          <button
            type="button"
            className="gx-icon-btn"
            onClick={() => setDrawer('files')}
            aria-label="Files Apple keeps for this project"
            title="Project files"
          >
            <Icon d={PATH.docs} />
          </button>

          <button
            type="button"
            className="gx-icon-btn"
            onClick={() => setDrawer('memory')}
            aria-label="What Apple remembers about this project"
            title="Project memory"
          >
            <Icon d={PATH.brain} />
          </button>

          {/* Saved instructions. An icon button beside memory rather than a named control: it is
              the same kind of thing — a standing fact about this project rather than a step in
              the work — and the command palette carries the word for anyone searching for it. */}
          <button
            type="button"
            className="gx-icon-btn"
            onClick={() => setDrawer('automations')}
            aria-label="Saved instructions you can run again"
            title="Saved instructions"
          >
            <Icon d={PATH.automation} />
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

      {/* The one sentence under the Studio pill — when it last polled, how much work is waiting,
          how slow the round trip is, or the fact that Studio is holding the wrong place open. Draws
          nothing when there is nothing worth saying, so a healthy link adds no chrome. The rebind
          button is passed only while a mismatch is actually on the wire; see components/ws/
          studio-link-note.tsx. */}
      <StudioLinkNote
        status={studioStatus}
        facts={studio.link}
        onRebind={studio.link.placeMismatch ? rebindPlace : undefined}
      />

      {/* --------------------------------------------------- conversation */}
      <div className="gx-scroll" ref={scrollRef} onScroll={onScroll}>
        {/* role="log" with `aria-relevant="additions"` — NOT the default "additions text".
            A whole turn appearing is an addition worth reporting; the characters streaming into a
            turn already on screen are a text mutation, and reporting those floods the polite queue
            with fragments of a sentence that is still being written. The settled reply is
            announced once, by the region at the foot of this view. */}
        <div
          className="gx-thread"
          role="log"
          aria-label="Conversation"
          aria-live="polite"
          aria-relevant="additions"
        >
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
              // Offered only while nothing is running: the server refuses an edit mid-run, and a
              // control that is always there but sometimes refuses is worse than one that is only
              // there when it works.
              editable={item.role === 'user' && !running}
              onEdit={(id, content) => setEditing({ id, content })}
              // Only the last turn, and only while idle. An offer that is present but inert is a
              // worse answer than no offer.
              onRetry={item.id === lastAssistantId && !running ? retryLast : undefined}
              // Drawn only when the transcript says this message HAS earlier versions — Turn makes
              // that call, because it is the thing holding the count.
              onShowRevisions={setShowingRevisions}
            />
            </div>
          ))}

          {/* The connect prompt sits at the foot of the conversation — where
              the eye already is before typing — and vanishes the instant
              Studio attaches. It is a pure function of studioStatus, so there
              is no dismissal state to get stuck. */}
          <ConnectStudio status={studioStatus} onPair={() => setShowPairing(true)} />

          {/* The measured detail under the connection: when the plugin last polled, how much work
              is queued, the round trip, and — loudest — a place mismatch, which is the only state
              where the pill is green and nothing will ever build. Rendered for EVERY state,
              including connected, which is why it is not inside the card above. It draws nothing
              when there is nothing measured to say. */}
          <StudioLink status={studioStatus} facts={studio.link} />

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
        {/* BACK TO THE LIVE EDGE.
            Shown only while the reader has actually left it, so it is never a control sitting
            there doing nothing, and it names how much arrived while they were away — counted from
            a watermark, so a rewound conversation reports zero rather than a stale total. */}
        {!following && (
          <button type="button" className="gx-jump" onClick={jumpToLatest}>
            <Icon d={PATH.chevronDown} size={13} />
            {jumpLabel(unseen)}
          </button>
        )}

        {/* The settled reply, said once. Empty while a run is in flight, which is silence rather
            than an announcement of silence. */}
        <span className="gx-sr" aria-live="polite" aria-atomic="true">
          {announcement}
        </span>

        {connNote && (
          <p className="gx-conn-note" role="status">
            {connNote}
          </p>
        )}
        {heldMessage !== null && (
          <AssetSourceDialog
            policy={sourcePolicy}
            onSave={saveSources}
            onDone={() => {
              // The answer is stored, so the held message goes now — on its own, with no second
              // click. Making somebody press send twice for a question they just answered is the
              // kind of small rudeness that reads as the product not listening.
              const text = heldMessage;
              setHeldMessage(null);
              if (text) send(text);
            }}
            onCancel={() => setHeldMessage(null)}
          />
        )}

        <Composer
          onSend={send}
          onStop={stop}
          draftKey={projectId}
          // The upload target. Same value as the draft key here and a different KIND of thing —
          // see the prop's own comment: one is a storage namespace, the other is authorisation.
          projectId={projectId}
          // A refused file says so where every other refusal in this workspace says so.
          onNotice={(m) => toast(m, 'error')}
          running={running}
          disabled={conn !== 'open'}
          mode={mode}
          onModeChange={setMode}
          seed={seed}
          selection={studio.selection}
          // The other faces in this project read "is typing" off this. The frame has been in the
          // protocol and handled by the worker since presence shipped, and nothing ever sent one.
          onPresence={signalPresence}
        />
      </div>

      {/* ------------------------------------------------------- drawers -- */}
      <Drawer open={drawer === 'checkpoints'} onClose={() => setDrawer(null)} title="Checkpoints">
        {/* A NAME IS NOT A DESCRIPTION.

            The label is capped at 60 characters and everything else the row showed — the time, the
            object count, the script count — is derived metadata. Nothing said what was IN the
            snapshot or why it was taken, which is the only thing that makes a list of twenty of
            them choosable. Optional on purpose: a required field on a save people take
            mid-thought would be a tax on the habit the whole feature depends on. */}
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.9rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!studio.connected) return;
            createCheckpoint(label.trim() || 'manual checkpoint', note.trim() || undefined);
            setLabel('');
            setNote('');
          }}
        >
          <div style={{ display: 'flex', gap: '0.4rem' }}>
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
          </div>
          <textarea
            className="gx-row gx-cp__note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder="What is in it, or why you are taking it (optional)"
            aria-label="What this checkpoint contains"
            rows={2}
            disabled={!studio.connected}
          />
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
                {/* WHO, first. The row carried a timestamp and two counts and never said whose
                    work it was — and the one surface that claimed an author guessed it from the
                    kind, so on a shared project a teammate's checkpoint read as yours. This says
                    "Another member" or "Author not recorded" rather than picking the reader, which
                    is the wrong guess in exactly the argument the field exists for. */}
                {checkpointAuthorView(c, userId || null, memberNames).label} · {new Date(c.createdAt).toLocaleString()} ·{' '}
                {c.instanceCount} objects · {c.scriptCount} scripts
              </span>
              {/* The authored sentence, under the derived numbers. Shown verbatim and never
                  truncated in the markup: the worker already caps it at 500 characters, and a
                  second cap here would hide the end of somebody's own words for no reason. */}
              {c.description && <span className="gx-cp__desc">{c.description}</span>}
              {/* THE RESTORE, WHILE IT IS HAPPENING AND WHEN IT IS OVER.

                  This drawer used to close on the click, and the worker used to broadcast nothing
                  until something went wrong — so the user watched the panel shut and then had no
                  signal at all, for up to two minutes, about the operation that was at that moment
                  clearing and rebuilding their place. On success they were told nothing ever.

                  Anchored under the checkpoint it belongs to rather than floating at the top of the
                  drawer: a list of twenty rows and one status line elsewhere makes the reader
                  work out which one it is about. */}
              {restoreStatus?.checkpointId === c.id && (
                <span className={`gx-restore is-${restoreTone(restoreStatus)}`} role="status">
                  {restoreSentence(restoreStatus)}
                  {fidelityLine(restoreStatus.fidelity) && (
                    <span className="gx-restore__counts">{fidelityLine(restoreStatus.fidelity)}</span>
                  )}
                </span>
              )}
            </span>
            <button
              type="button"
              className="gx-btn gx-btn--outline"
              disabled={!studio.connected || restoreBusy}
              onClick={() => {
                if (!window.confirm(`Restore "${c.label}"? This replaces what is in your place now.`)) return;
                restoreCheckpoint(c.id);
                // The drawer STAYS OPEN. It is the only surface that shows what the restore is
                // doing and what came back, and closing it is what made both invisible.
              }}
            >
              {restoreBusy && restoreStatus?.checkpointId === c.id ? 'Restoring…' : 'Restore'}
            </button>
          </div>
        ))}
      </Drawer>

      {revisionsFor && (
        <RevisionsDialog
          projectId={projectId}
          messageId={revisionsFor.id}
          current={revisionsFor.content}
          onClose={() => setShowingRevisions(null)}
        />
      )}

      {editing && (
        <EditMessageDialog
          current={editing.content}
          discards={discardCount}
          busy={running}
          onCancel={() => setEditing(null)}
          onConfirm={(text) => {
            // Same translation the composer does: `mode` is the PRODUCT mode the user picked,
            // and the wire carries the specialist it maps to.
            editAndResend(editing.id, text, PRODUCT_MODE_TO_SPECIALIST[mode]);
            setEditing(null);
          }}
        />
      )}

      <Drawer open={drawer === 'search'} onClose={() => setDrawer(null)} title="Search this conversation">
        <SearchPanel projectId={projectId} onOpen={openHit} />
      </Drawer>

      {/* THE OP LOG, WHICH HAD NO ENTRY POINT.

          Every Studio op has been recorded and served at /studio/diagnostics since the oplog
          existed, and no part of this app had ever called that route. Mounted only while open, like
          the panels above: a project's whole history is not worth a request on every workspace load
          for everyone who never opens it. */}
      <Drawer open={drawer === 'history'} onClose={() => setDrawer(null)} title="What Apple did in Studio">
        {drawer === 'history' && <StudioActivity projectId={projectId} onOpenRun={jumpToMessage} />}
      </Drawer>

      <Drawer open={drawer === 'members'} onClose={() => setDrawer(null)} title="Who can build here">
        {/* Mounted only while open, like the others: the panel holds a half-typed invitation in
            local state and runs a live roster query, and neither should outlive the drawer the
            user closed. */}
        {drawer === 'members' && <MembersPanel projectId={projectId} access={access} />}
      </Drawer>

      <Drawer open={drawer === 'files'} onClose={() => setDrawer(null)} title="Files">
        {/* Mounted only while open, for the same reason: the listing, the file body and the
            version history are three requests, and none of them is worth making for a user who
            never opens this. `canEdit` is the server's answer about this person, not a guess —
            see the access query above. */}
        {drawer === 'files' && <FilesPanel projectId={projectId} canEdit={allows(access, 'build')} />}
      </Drawer>

      <Drawer open={drawer === 'credits'} onClose={() => setDrawer(null)} title="Credits and clearance">
        {/* Mounted only while open so the request is made when a user asks the
            question, not on every workspace load for everyone who never will. */}
        {drawer === 'credits' && <CreditsPanel projectId={projectId} />}
      </Drawer>

      <Drawer open={drawer === 'automations'} onClose={() => setDrawer(null)} title="Saved instructions">
        {/* Mounted only while open, for the reason the memory drawer gives: the panel holds an
            unsaved draft, and closing the drawer is the gesture people use to abandon one. */}
        {drawer === 'automations' && <AutomationsPanel projectId={projectId} />}
      </Drawer>

      <Drawer open={drawer === 'memory'} onClose={() => setDrawer(null)} title="What Apple remembers">
        {/* Mounted only while open: the panel holds unsaved edits, and closing the drawer is the
            gesture people use to abandon them. Keeping it mounted would silently preserve a
            half-finished edit and re-present it later as if it had been saved. */}
        {drawer === 'memory' && <MemoryPanel projectId={projectId} />}
        {/* The other half of memory: settings, profile, and project/team instructions, which live
            in the scoped store rather than in this project's Durable Object. Mounted on the same
            condition and for the same reason — closing the drawer abandons an unsaved edit. */}
        {drawer === 'memory' && <InstructionsPanel projectId={projectId} />}
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
