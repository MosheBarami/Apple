// THE CHAT SPECIMEN — DEV ONLY.
//
// Every state the workspace chat can be in, rendered by the REAL components (Turn, Thinking,
// ChatWelcome, Composer, CreditsPanel, the AI Elements Conversation) from fixture data, one state
// per screen, so the chat can be looked at and screenshotted without a worker, a socket or Studio.
//
// NOT A PRODUCT SURFACE. app.tsx registers /studio-preview only under `import.meta.env.DEV`, and
// its lazy import is replaced with `() => null` otherwise, so a production build emits no chunk for
// it. Every screen carries the word SPECIMEN in its top bar, and every playtest frame here is drawn
// by this file with "SPECIMEN FRAME" painted into its pixels, so a screenshot of it cannot be
// mistaken for a picture of somebody's place.
//
// WHAT THE FIXTURES MAY NOT DO is the same list the product obeys: no model reasoning text (there
// is none on the wire), no invented sources (the doc pages ride on a `search_docs` result, the
// credit source on the attribution report, exactly as the worker sends them), no tool payload drawn
// as text (Tool rows read name, target, summary and duration only), and a retried failure that is
// not drawn as a failure.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { modelListing, type PlaytestRun, type ProductMode, type ProductModel, type StudioFrame } from '@golem/shared';
import { Turn } from '../components/ws/turn';
import { ChatWelcome } from '../components/ws/chat-welcome';
import { Composer } from '../components/ws/composer';
import { CreditsPanel } from '../components/ws/credits-panel';
import { Drawer } from '../components/ws/primitives';
import { Conversation, ConversationContent } from '../components/ai-elements/conversation';
import type { AgentStatus, ChatItem, ToolEvent } from '../lib/use-project-socket';
import type { StagedAttachment } from '../lib/attachments';
import { mockAttribution, mockBuildPlanDetail, mockDiffDetail } from '../lib/mock';
import { useTheme } from '../lib/theme';
import './studio-preview.css';

/* ------------------------------------------------------------ scenarios --- */

const SCENARIOS = [
  { id: 'empty', label: 'Empty conversation' },
  { id: 'messages', label: 'User messages' },
  { id: 'streaming', label: 'Streaming run' },
  { id: 'completed', label: 'Completed run' },
  { id: 'history', label: 'Execution history' },
  { id: 'playtest', label: 'Playtest, fresh frame' },
  { id: 'playtest-stale', label: 'Playtest, stale frame' },
  { id: 'playtest-done', label: 'Playtest, finished + results' },
  { id: 'markdown', label: 'Long markdown' },
  { id: 'diff', label: 'Generated diff' },
  { id: 'credits', label: 'Sources in Credits' },
  { id: 'failure', label: 'Final failure' },
  { id: 'plan', label: 'Composer · Plan + files' },
] as const;
type ScenarioId = typeof SCENARIOS[number]['id'];

const SEEDS = [
  { label: 'A portal hub', prompt: 'Build a lobby with a spinning portal that teleports players to a floating arena.' },
  { label: 'A floating obby', prompt: 'Build a colorful floating obby with checkpoints, jumps, and a finish platform.' },
  { label: 'A coin simulator', prompt: 'Build a coin simulator with an upgrade shop and a leaderboard.' },
];

/* ------------------------------------------------------------- fixtures --- */

const SPECIMEN_PROJECT = 'specimen';

/**
 * The model picker, for looking at: the registry marked for a Builder (Pro) account, so the list
 * shows Apple and Apple MAX open and the outside models locked with the plan that includes them.
 */
const SPECIMEN_MODELS = modelListing('builder');

function user(id: string, content: string, at: number, revisions?: number): ChatItem {
  return { id, role: 'user', mode: 'agent', content, tools: [], streaming: false, createdAt: at, revisions };
}

function tool(
  id: string,
  name: string,
  summary: string,
  at: number,
  opts: { done?: boolean; ok?: boolean; ms?: number; target?: string; detail?: unknown } = {},
): ToolEvent {
  const done = opts.done ?? true;
  return {
    toolId: id,
    tool: name,
    summary,
    target: opts.target,
    startedAt: at,
    done,
    ok: done ? (opts.ok ?? true) : undefined,
    durationMs: done ? (opts.ms ?? 900) : undefined,
    startObserved: true,
    detail: opts.detail,
  };
}

/** A settled run's tools: six observed steps, one second apart. */
function settledTools(t0: number): ToolEvent[] {
  return [
    tool('t1', 'get_project_tree', 'Read 386 instances across 6 services', t0, { ms: 640, target: 'game' }),
    tool('t2', 'create_checkpoint', 'Snapshot "before lobby rebuild"', t0 + 1_000, { ms: 1_180 }),
    tool('t3', 'create_instances', 'Placed 24 parts under Workspace.Lobby', t0 + 2_400, { ms: 890, target: 'Workspace.Lobby' }),
    tool('t4', 'set_properties', 'Concrete floor in three tones', t0 + 3_400, { ms: 210, target: 'Workspace.Lobby.Floor' }),
    tool('t5', 'edit_script', 'Wrote PortalService (68 lines)', t0 + 3_800, { ms: 430, target: 'ServerScriptService.PortalService' }),
    tool('t6', 'run_and_check', 'Play-tested 6s with no errors in Output', t0 + 4_400, { ms: 7_420 }),
  ];
}

const DOC_HITS = [
  { citation: 1, title: 'TeleportService', url: 'https://create.roblox.com/docs/reference/engine/classes/TeleportService', excerpt: 'not shown' },
  { citation: 2, title: 'Teleporting between places', url: 'https://create.roblox.com/docs/projects/teleport', excerpt: 'not shown' },
];

const SHORT_REPLY = 'Done. The lobby has a raised stone plinth, a spinning portal ring and a teleport pad wired to the arena. Walk into the ring to try it.';

const LONG_MARKDOWN = `Here is what changed, and how to point the portal somewhere else.

**What I changed**

- \`Workspace.Lobby\` — a new plinth, four pillars and warm \`PointLight\`s
- \`Workspace.Lobby.Portal\` — a ring of \`Neon\` parts turning at 45° per second
- \`ServerScriptService.PortalService\` — teleports on touch, with a two second pause per player

**How to change the destination**

1. Select \`Workspace.Lobby.Portal\` in the Explorer.
2. Set its \`TargetPlace\` attribute to the place id you want.
3. Press Play and walk into the ring.

The script reads the attribute every time, so you never need to edit it:

\`\`\`luau
local Players = game:GetService("Players")
local portal = workspace.Lobby.Portal

portal.Touched:Connect(function(hit)
	local player = Players:GetPlayerFromCharacter(hit.Parent)
	if player then
		-- two second pause per player, then teleport
		teleport(player, portal:GetAttribute("TargetPlace"))
	end
end)
\`\`\`

Next I am writing the arena's spawn handler:

\`\`\`luau
local Arena = {}

function Arena.spawn(player: Player)
	local spawnPoint = workspace.Arena:FindFirstChild("Spawn")
	if spawnPoint then`;

const LONG_USER = 'I want the lobby to feel like the entrance to something bigger. Make the floor out of worn stone tiles with a little moss in the cracks, put four tall pillars around a raised circular platform, and in the middle a portal ring that slowly spins and glows gold. When a player walks into it they should be teleported to the arena place, but only once every couple of seconds so nobody gets bounced twice. Add some warm lights on the pillars so the portal is the brightest thing in the room, and keep the whole thing readable from the spawn point without the player having to turn the camera.';

const HEBREW_USER = 'תבנה לובי עם פורטל זהוב שמסתובב לאט, ותוסיף ארבעה עמודים סביב הבמה. חשוב שהשחקנים יראו את הפורטל מנקודת ההתחלה.';

function staged(): StagedAttachment[] {
  return [
    { id: 'sa1', name: 'lobby-notes.md', size: 18_400, phase: 'uploading', sent: 7_200, attachment: null, error: null, retryable: true },
    { id: 'sa2', name: 'Output-log-2026-09-22.txt', size: 412_000, phase: 'failed', sent: 0, attachment: null, error: 'Upload failed. Check your connection.', retryable: true },
    { id: 'sa3', name: 'palette.json', size: 1_200, phase: 'ready', sent: 1_200, attachment: { kind: 'file', name: 'palette.json', attachmentId: 'specimen-palette', mime: 'application/json', size: 1_200 }, error: null, retryable: false },
  ];
}

/* ---------------------------------------------------- specimen frames --- */

/**
 * A playtest frame drawn here, never received. "SPECIMEN FRAME" is painted INTO the pixels, so the
 * picture says what it is even when it is cropped out of this page.
 */
function specimenFrame(runId: string, seq: number, capturedAt: number): StudioFrame {
  const width = 320;
  const height = 180;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  let rgbBase64 = '';
  if (g) {
    const sky = g.createLinearGradient(0, 0, 0, height * 0.6);
    sky.addColorStop(0, 'rgb(30,34,44)');
    sky.addColorStop(1, 'rgb(58,64,78)');
    g.fillStyle = sky;
    g.fillRect(0, 0, width, height);
    g.fillStyle = 'rgb(48,46,44)';
    g.fillRect(0, height * 0.6, width, height * 0.4);
    // The platform, and a portal that moves one step per frame so consecutive stills differ.
    g.fillStyle = 'rgb(96,92,86)';
    g.fillRect(70, height * 0.6 - 8, 180, 8);
    const x = 120 + (seq % 5) * 8;
    g.strokeStyle = 'rgb(214,178,96)';
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(x + 20, height * 0.6 - 44, 18, 32, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, width, 24);
    g.fillStyle = 'rgb(240,240,240)';
    g.font = '600 11px system-ui, sans-serif';
    g.fillText(`SPECIMEN FRAME ${seq} · fixture, not from Studio`, 10, 16);
    const data = g.getImageData(0, 0, width, height).data;
    let binary = '';
    for (let i = 0; i < data.length; i += 4) {
      binary += String.fromCharCode(data[i]!, data[i + 1]!, data[i + 2]!);
    }
    rgbBase64 = btoa(binary);
  }
  return {
    rgbBase64,
    width,
    height,
    view: 'eye',
    subject: 'game.Workspace',
    capturedAt,
    encoding: 'rgb24',
    source: 'software_render',
    playtestRunId: runId,
    seq,
  };
}

function useClock(ms = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * A playtest in progress. FRESH: a new still every 1.5s, the capture rate the product states.
 * STALE: one still pinned 11 seconds old — past PLAYTEST_STALE_MS (6s), short of dead (20s) — so
 * the card shows it dimmed with its honest age for as long as the specimen is open.
 */
function usePlaytestFixture(kind: 'fresh' | 'stale', startedAt: number) {
  const now = useClock(kind === 'fresh' ? 1_500 : 1_000);
  const seq = kind === 'fresh' ? Math.max(1, Math.floor((now - startedAt) / 1_500)) : 3;
  const capturedAt = kind === 'fresh' ? now : now - 11_000;
  const frame = useMemo(() => specimenFrame(`specimen-${kind}`, seq, capturedAt), [kind, seq, capturedAt]);
  const run: PlaytestRun = {
    id: `specimen-${kind}`,
    phase: 'running',
    startedAt,
    requestedSeconds: 8,
    action: 'Walking a test character into the portal',
    consoleErrors: 0,
    consoleWarnings: kind === 'stale' ? 1 : 0,
    framesDelivered: seq,
    framesDropped: kind === 'stale' ? 2 : 0,
    lastFrameAt: capturedAt,
  };
  return { run, frames: [frame] };
}

/**
 * A playtest that has ENDED: five stills 1.5s apart, one lost, one error in Output — so the card's
 * picture stepper has something to step through and its "Playtest results" has a failed check.
 */
function useFinishedPlaytestFixture(endedAt: number) {
  const frames = useMemo(
    () => [1, 2, 3, 4, 5].map((seq) => specimenFrame('specimen-done', seq, endedAt - (5 - seq) * 1_500)),
    [endedAt],
  );
  const run: PlaytestRun = {
    id: 'specimen-done',
    phase: 'finished',
    startedAt: endedAt - 8_000,
    endedAt,
    requestedSeconds: 8,
    action: 'Finished',
    consoleErrors: 1,
    consoleWarnings: 0,
    framesDelivered: 5,
    framesDropped: 1,
    lastFrameAt: endedAt,
  };
  return { run, frames };
}

/* ------------------------------------------------------------ the screen --- */

interface ScreenProps {
  items: ChatItem[];
  status?: AgentStatus | null;
  running?: boolean;
  mode?: ProductMode;
  autonomous?: boolean;
  initialStaged?: StagedAttachment[];
  playtest?: { run: PlaytestRun; frames: StudioFrame[] } | null;
  empty?: boolean;
  after?: ReactNode;
}

/**
 * The workspace's own frame, minus its top bar: the same Conversation, the same thread classes and
 * the same compose region, in the same grid, so what is on screen is laid out by the workspace's
 * CSS rather than by a lookalike.
 */
function Screen({ items, status = null, running = false, mode: initialMode = 'agent', autonomous: initialAuto = false, initialStaged, playtest = null, empty = false, after }: ScreenProps) {
  const [mode, setMode] = useState<ProductMode>(initialMode);
  const [autonomous, setAutonomous] = useState(initialAuto);
  const [model, setModel] = useState<ProductModel>('apple');
  const [seed, setSeed] = useState<string | undefined>();
  const lastAssistant = [...items].reverse().find((item) => item.role === 'assistant')?.id;
  return (
    <>
      <div className="gx-workbench-shell">
        <div className="gx-workbench">
          <section className="gx-conversation" aria-label="Conversation">
            <Conversation role={undefined}>
              <ConversationContent scrollClassName="gx-scroll" className="gx-thread" role="log" aria-label="Conversation" aria-relevant="additions">
                {empty && <ChatWelcome seeds={SEEDS} onSeed={setSeed} />}
                {items.map((item) => (
                  <div key={item.id} id={`msg-${item.id}`} data-message-id={item.id}>
                    <Turn
                      item={item}
                      status={status}
                      isLast={item.id === lastAssistant}
                      editable={item.role === 'user' && !running}
                      onEdit={() => undefined}
                      onRetry={item.id === lastAssistant && !running ? () => undefined : undefined}
                      onShowRevisions={() => undefined}
                      frames={item.id === lastAssistant ? playtest?.frames : undefined}
                      playtest={item.id === lastAssistant ? playtest?.run ?? null : null}
                      studioConnected
                    />
                  </div>
                ))}
              </ConversationContent>
            </Conversation>
          </section>
        </div>
      </div>
      <div className="gx-compose-region">
        <Composer
          onSend={() => false}
          onStop={() => undefined}
          running={running}
          studioConnected
          productModel={model}
          onModelChange={setModel}
          modelPlan="builder"
          models={SPECIMEN_MODELS}
          mode={mode}
          onModeChange={(next) => {
            setMode(next);
            if (next === 'plan') setAutonomous(false);
          }}
          autonomous={autonomous}
          onAutonomousChange={setAutonomous}
          seed={seed}
          projectId={SPECIMEN_PROJECT}
          initialStaged={initialStaged}
        />
      </div>
      {after}
    </>
  );
}

/* ------------------------------------------------------------- per state --- */

function Scenario({ id }: { id: ScenarioId }) {
  const t0 = useRef(Date.now()).current;
  const fresh = usePlaytestFixture('fresh', t0 - 4_200);
  const stale = usePlaytestFixture('stale', t0 - 16_000);
  const done = useFinishedPlaytestFixture(t0 - 30_000);
  const queryClient = useQueryClient();
  const [creditsOpen, setCreditsOpen] = useState(true);
  const [creditsSeeded, setCreditsSeeded] = useState(false);

  // The Credits drawer reads through react-query. The specimen answers that query itself, from the
  // same fixture mock mode uses, BEFORE the drawer mounts — mounted first, CreditsPanel would ask the
  // dev server, get a 404 and draw its error state — so it renders its real Sources with no request.
  useEffect(() => {
    if (id !== 'credits') return;
    let live = true;
    queryClient.setQueryDefaults(['attribution', SPECIMEN_PROJECT], { staleTime: Infinity, gcTime: Infinity });
    void mockAttribution().then((data) => {
      queryClient.setQueryData(['attribution', SPECIMEN_PROJECT], data);
      if (live) setCreditsSeeded(true);
    });
    return () => { live = false; };
  }, [id, queryClient]);

  // A settled Reasoning starts closed, so the history state opens it the way a person would: by
  // pressing the trigger, then the "earlier steps" header.
  useEffect(() => {
    if (id !== 'history' && id !== 'playtest-done') return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>('.apple-reasoning__trigger[aria-expanded="false"]')?.click();
      window.setTimeout(() => {
        document.querySelector<HTMLButtonElement>('.apple-reasoning__history[aria-expanded="false"]')?.click();
      }, 60);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [id]);

  const settled = (extra: Partial<ChatItem> = {}): ChatItem => ({
    id: 'a1', role: 'assistant', mode: 'agent', content: SHORT_REPLY, tools: settledTools(t0 - 60_000),
    streaming: false, stopReason: 'done', createdAt: t0 - 60_000, endedAt: t0 - 60_000 + 11_900, creditsSpent: 4, ...extra,
  });
  const ask = user('u1', 'Build a lobby with a spinning golden portal that teleports players to the arena.', t0 - 62_000);

  switch (id) {
    case 'empty':
      return <Screen items={[]} empty />;

    case 'messages':
      return <Screen items={[
        user('u1', 'Make the portal spin faster.', t0 - 300_000),
        { ...settled({ id: 'a0', content: 'Done. The portal now turns at 90° per second.', tools: settledTools(t0 - 298_000).slice(2, 4), creditsSpent: 1 }) },
        user('u2', LONG_USER, t0 - 200_000, 1),
        { ...settled({ id: 'a2', createdAt: t0 - 198_000, content: SHORT_REPLY }) },
        user('u3', HEBREW_USER, t0 - 90_000),
        { ...settled({ id: 'a3', createdAt: t0 - 88_000, content: 'בוצע. הוספתי ארבעה עמודים סביב הבמה, והפורטל נראה מנקודת ההתחלה.', tools: settledTools(t0 - 88_000).slice(3, 5), creditsSpent: 2 }) },
      ]} />;

    case 'streaming': {
      const tools = settledTools(t0 - 9_000).slice(0, 4);
      tools.push(tool('t5', 'edit_script', 'Writing PortalService', t0 - 1_200, { done: false, target: 'ServerScriptService.PortalService' }));
      return <Screen
        running
        autonomous
        status={{ phase: 'writing_luau', creditsSpent: 2 }}
        items={[ask, { id: 'a1', role: 'assistant', mode: 'agent', autonomous: true, content: '', tools, streaming: true, createdAt: t0 - 9_500 }]}
      />;
    }

    case 'completed':
      return <Screen items={[ask, settled()]} />;

    case 'history': {
      const tools = settledTools(t0 - 60_000);
      // A retried failure: the first write was refused and the second one landed. The run
      // RECOVERED, so the card must not draw that first attempt as a red failure.
      tools.splice(4, 0, tool('t4b', 'edit_script', 'Script edit was refused', t0 - 56_400, { ok: false, ms: 200, target: 'ServerScriptService.PortalService' }));
      tools.push(tool('t7', 'check_composition', 'Published the remaining work', t0 - 48_000, { ms: 140, detail: mockBuildPlanDetail() }));
      return <Screen items={[ask, settled({ tools, endedAt: t0 - 47_800 })]} />;
    }

    case 'playtest':
    case 'playtest-stale': {
      const pt = id === 'playtest' ? fresh : stale;
      const tools = settledTools(t0 - 20_000).slice(0, 5);
      tools.push(tool('t6', 'run_and_check', 'Playtesting the portal', pt.run.startedAt, { done: false }));
      return <Screen
        running
        status={{ phase: 'playtesting', creditsSpent: 3 }}
        playtest={pt}
        items={[ask, { id: 'a1', role: 'assistant', mode: 'agent', content: '', tools, streaming: true, createdAt: t0 - 20_500 }]}
      />;
    }

    case 'playtest-done': {
      const tools = settledTools(t0 - 60_000).slice(0, 5);
      tools.push(tool('t6', 'run_and_check', 'Playtested the portal', done.run.startedAt, { ms: 8_000 }));
      return <Screen playtest={done} items={[ask, settled({ tools })]} />;
    }

    case 'markdown': {
      const tools = [
        tool('t1', 'search_docs', 'Searched the Roblox docs for teleporting', t0 - 30_000, { ms: 820, detail: DOC_HITS }),
        ...settledTools(t0 - 28_000).slice(2, 5),
        tool('t9', 'edit_script', 'Writing Arena', t0 - 2_000, { done: false, target: 'ServerScriptService.Arena' }),
      ];
      return <Screen
        running
        status={{ phase: 'writing_luau', creditsSpent: 3 }}
        items={[user('u1', 'How do I point the portal at another place? And add an arena spawn.', t0 - 31_000), {
          id: 'a1', role: 'assistant', mode: 'agent', content: LONG_MARKDOWN, tools, streaming: true, createdAt: t0 - 30_500,
        }]}
      />;
    }

    case 'diff': {
      const tools = settledTools(t0 - 40_000).slice(0, 4);
      tools.push(tool('t5', 'edit_script', 'Warmed the lobby lighting', t0 - 36_000, { ms: 420, target: 'ServerScriptService.LobbyLighting', detail: mockDiffDetail() }));
      return <Screen items={[user('u1', 'The lobby is too grey. Warm the lighting up.', t0 - 41_000), settled({
        content: 'I warmed the key light and dropped the flat grey ambient. The change is below.', tools, endedAt: t0 - 35_000, creditsSpent: 2,
      })]} />;
    }

    case 'credits':
      return <Screen
        items={[ask, settled()]}
        after={creditsSeeded && <Drawer open={creditsOpen} onClose={() => setCreditsOpen(false)} title="Credits">
          <CreditsPanel projectId={SPECIMEN_PROJECT} />
        </Drawer>}
      />;

    case 'failure': {
      const tools = settledTools(t0 - 30_000).slice(0, 3);
      // An earlier attempt that failed and was retried (not a failure), then the real final one.
      tools.push(tool('t4a', 'set_properties', 'Could not set the floor material', t0 - 27_000, { ok: false, ms: 300, target: 'Workspace.Lobby.Floor' }));
      tools.push(tool('t4b', 'set_properties', 'Concrete floor in three tones', t0 - 26_500, { ms: 240, target: 'Workspace.Lobby.Floor' }));
      tools.push(tool('t5', 'insert_asset', 'Could not insert the asset', t0 - 25_000, { ok: false, ms: 1_600, target: 'Workspace.Lobby' }));
      return <Screen items={[ask, settled({
        content: '', tools, stopReason: 'error', error: 'model_failed', endedAt: t0 - 23_000, creditsSpent: 1,
      })]} />;
    }

    case 'plan':
      return <Screen mode="plan" initialStaged={staged()} items={[ask, settled()]} />;
  }
}

/* ------------------------------------------------------------------ page --- */

function readScenario(): ScenarioId {
  const s = new URLSearchParams(window.location.search).get('s');
  return (SCENARIOS.find((x) => x.id === s)?.id ?? 'empty') as ScenarioId;
}

export function StudioPreviewPage() {
  const [scenario, setScenario] = useState<ScenarioId>(readScenario);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('theme');
    if (wanted === 'light' || wanted === 'dark') setTheme(wanted);
    // Once, on arrival: the query string picks the starting theme; the button owns it after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (next: ScenarioId) => {
    setScenario(next);
    const url = new URL(window.location.href);
    url.searchParams.set('s', next);
    window.history.replaceState(null, '', url);
  };

  return (
    <div className="gx">
      <div className="gx-ws apple-workspace spec-ws">
        <header className="spec-bar">
          <span className="spec-bar__tag">Specimen</span>
          <span className="spec-bar__note">Fixture data · no project, worker or Studio</span>
          <label className="spec-bar__pick">
            <span className="gx-sr">State</span>
            <select value={scenario} onChange={(e) => choose(e.target.value as ScenarioId)}>
              {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <button type="button" className="gx-btn gx-btn--outline spec-bar__theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </header>
        <Scenario key={scenario} id={scenario} />
      </div>
    </div>
  );
}
