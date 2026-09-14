/**
 * Dev/QA mock mode.
 *
 * The app is behind Supabase auth, so design review of the signed-in surfaces
 * would otherwise be impossible without a real account. With
 * `VITE_APPLE_MOCK=1` (or `?mock=1` in a dev server) every network read is
 * replaced by realistic fixtures and the WebSocket is replaced by a scripted
 * session. Nothing here runs in a normal production build: the flag folds to a
 * constant `false` and the fixtures are tree-shaken out.
 *
 * Numbers used here are illustrative fixtures for layout review only. Anything
 * shown to a real user comes from the API.
 */
import type {
  CheckpointMeta,
  MessageDto,
  PlaytestRun,
  QuotaState,
  RunIntent,
  StudioEventLog,
  StudioEventState,
  StudioFrame,
} from '@golem/shared';
import type { MeResponse, UsageDay } from './api';
import type { AttributionResponse } from '../components/ws/credits-model';
import type { ProfileRow, ProjectRow } from './supabase';

const FLAG = import.meta.env.VITE_APPLE_MOCK === '1';

function queryFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('mock') === '1';
  } catch {
    return false;
  }
}

/** True when the app should serve fixtures instead of talking to the network. */
export const MOCK_MODE: boolean = FLAG || (import.meta.env.DEV && queryFlag());

// ---------------------------------------------------------------------------
// Operator fixtures
// ---------------------------------------------------------------------------

export function mockSpend() {
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const neurons = Math.round(1800 + 5200 * Math.abs(Math.sin(i * 1.1)));
    return { day, neurons, calls: Math.round(neurons / 260), billableNeurons: 0, billableUsd: 0 };
  });
  return {
    state: {
      day: days[0]?.day ?? '',
      month: new Date().toISOString().slice(0, 7),
      dayNeurons: days[0]?.neurons ?? 0,
      dayPending: 0,
      monthBillableNeurons: 0,
      killed: false,
      killedReason: null,
      dayRemainingFraction: 0.62,
      estimatedMonthUsd: 0,
      freeRemainingToday: 6_820,
    },
    limits: {
      freeNeuronsPerDay: 10_000,
      billableNeuronsPerDay: 40_000,
      billableNeuronsPerMonth: 600_000,
      maxNeuronsPerRequest: 4_000,
    },
    maxMonthlyUsd: 6.6,
    days,
    // The `model` field carries a placeholder, not a real model id. §1 of the
    // access manifest keeps provider and model identity out of normal product
    // UX; /usage renders modes and sparks and never reads this field. Seeding a
    // real id here would mean the day someone does render the breakdown, the
    // product starts naming its engine by accident. Admin diagnostics is where
    // real model ids belong.
    breakdown: [
      { day: days[0]?.day ?? '', model: 'engine', kind: 'agent', neurons: 4120, calls: 18, usd: 0 },
      { day: days[0]?.day ?? '', model: 'engine', kind: 'critique', neurons: 1810, calls: 6, usd: 0 },
      { day: days[0]?.day ?? '', model: 'embedding', kind: 'embedding', neurons: 90, calls: 41, usd: 0 },
    ],
  };
}

export function mockCounters() {
  const day = new Date().toISOString().slice(0, 10);
  return [
    { day, key: 'ws.connect', value: 41 },
    { day, key: 'agent.run', value: 18 },
    { day, key: 'studio.op', value: 264 },
    { day, key: 'render.view', value: 22 },
    { day, key: 'checkpoint.create', value: 7 },
  ];
}

// ---------------------------------------------------------------------------
// Synthetic renders — a crude but plausible rasterised Roblox scene, so the
// render viewer can be reviewed without Studio attached.
// ---------------------------------------------------------------------------

const renderCache = new Map<string, string>();

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  shade: number;
  hue: [number, number, number];
}

const PALETTE: [number, number, number][] = [
  [168, 122, 86],
  [124, 132, 140],
  [92, 108, 84],
  [196, 158, 96],
  [140, 96, 88],
  [210, 190, 160],
];

function boxesFor(view: string, variant: 'before' | 'after'): Box[] {
  const rich = variant === 'after';
  const base: Box[] = [
    { x: 0.08, y: 0.52, w: 0.3, h: 0.3, shade: 1, hue: PALETTE[0]! },
    { x: 0.36, y: 0.4, w: 0.24, h: 0.42, shade: 0.86, hue: PALETTE[1]! },
    { x: 0.58, y: 0.55, w: 0.3, h: 0.27, shade: 0.72, hue: PALETTE[2]! },
  ];
  if (rich) {
    base.push({ x: 0.2, y: 0.3, w: 0.14, h: 0.22, shade: 1.1, hue: PALETTE[3]! });
    base.push({ x: 0.66, y: 0.34, w: 0.12, h: 0.22, shade: 0.94, hue: PALETTE[4]! });
    base.push({ x: 0.44, y: 0.24, w: 0.1, h: 0.16, shade: 1.2, hue: PALETTE[5]! });
  }
  if (view === 'top') return base.map((b) => ({ ...b, y: b.y - 0.12, h: b.h * 0.7 }));
  if (view === 'eye') return base.map((b) => ({ ...b, h: b.h * 1.25, y: b.y - 0.08 }));
  if (view === 'front') return base.map((b) => ({ ...b, x: b.x * 0.92 + 0.04 }));
  if (view === 'side') return base.map((b) => ({ ...b, x: 1 - b.x - b.w }));
  return base;
}

/**
 * Paint a fake render to a PNG data URL. Deliberately low resolution and
 * flat-shaded, like the plugin's own software rasteriser.
 */
export function mockRender(view: string, variant: 'before' | 'after' = 'after', width = 320, height = 200): string {
  const key = `${view}:${variant}:${width}x${height}`;
  const cached = renderCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // sky + ground
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, variant === 'after' ? '#5d7fa4' : '#7b8a96');
  sky.addColorStop(1, variant === 'after' ? '#c8b393' : '#a9a79f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = variant === 'after' ? '#6b6a4e' : '#8d8b82';
  ctx.fillRect(0, height * 0.72, width, height * 0.28);

  for (const box of boxesFor(view, variant)) {
    const x = box.x * width;
    const y = box.y * height;
    const w = box.w * width;
    const h = box.h * height;
    const [r, g, b] = box.hue;
    const s = box.shade;
    ctx.fillStyle = `rgb(${Math.min(255, r * s)}, ${Math.min(255, g * s)}, ${Math.min(255, b * s)})`;
    ctx.fillRect(x, y, w, h);
    // lit top face
    ctx.fillStyle = `rgb(${Math.min(255, r * s * 1.28)}, ${Math.min(255, g * s * 1.28)}, ${Math.min(255, b * s * 1.28)})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w * 0.16, y - h * 0.14);
    ctx.lineTo(x + w + w * 0.16, y - h * 0.14);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();
    // shaded right face
    ctx.fillStyle = `rgb(${r * s * 0.66}, ${g * s * 0.66}, ${b * s * 0.66})`;
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w + w * 0.16, y - h * 0.14);
    ctx.lineTo(x + w + w * 0.16, y + h - h * 0.14);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
  }

  const url = canvas.toDataURL('image/png');
  renderCache.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------
// Account fixtures
// ---------------------------------------------------------------------------

export const mockQuota: QuotaState = {
  sparksRemaining: 41,
  sparksDaily: 60,
  sparksMonthly: 900,
  sparksUsedToday: 19,
  sparksUsedThisMonth: 214,
  resetsAtIso: new Date(Date.now() + 5.5 * 3600_000).toISOString(),
  plan: 'free',
  // A free account with no purchased balance: the allowance IS the whole of sparksRemaining.
  // Kept consistent on purpose — a fixture whose parts do not add up teaches the UI to render a
  // state the server can never produce.
  allowanceRemaining: 41,
  credits: 0,
};

export const mockProfile: ProfileRow = {
  id: 'mock-user',
  display_name: 'Quarry',
  plan: 'free',
  is_admin: true,
  training_opt_in: false,
};

export const mockMe: MeResponse = {
  userId: 'mock-user',
  email: 'builder@example.com',
  profile: { id: 'mock-user', plan: 'free', is_admin: true, display_name: 'Quarry' },
  quota: mockQuota,
};

export function mockUsageDays(): UsageDay[] {
  const days: UsageDay[] = [];
  for (let i = 0; i < 30; i++) {
    const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const sparks = i % 7 === 0 ? 0 : Math.round(4 + 22 * Math.abs(Math.sin(i * 1.7)));
    days.push({ day, sparks, events: Math.ceil(sparks / 3) });
  }
  return days;
}

const now = Date.now();

export const mockProjects: ProjectRow[] = [
  {
    id: 'p-lobby',
    owner_id: 'mock-user',
    name: 'Ember Halls',
    description: 'A lava-parkour obby with checkpoints, coins and a shop.',
    place_name: 'Ember Halls',
    place_id: 1849204711,
    memory_summary:
      'A three-stage lava obby. Stage 1 is built with checkpoint pads wired to a leaderstats module. The shop UI exists but is not yet wired to the coin store.',
    created_at: new Date(now - 12 * 864e5).toISOString(),
    updated_at: new Date(now - 2 * 3600_000).toISOString(),
    last_activity_at: new Date(now - 2 * 3600_000).toISOString(),
  },
  {
    id: 'p-tycoon',
    owner_id: 'mock-user',
    name: 'Foundry Tycoon',
    description: 'Dropper tycoon with a smelting upgrade tree.',
    place_name: 'Foundry Tycoon',
    place_id: 1849204712,
    memory_summary: null,
    created_at: new Date(now - 30 * 864e5).toISOString(),
    updated_at: new Date(now - 3 * 864e5).toISOString(),
    last_activity_at: new Date(now - 3 * 864e5).toISOString(),
  },
  {
    id: 'p-story',
    owner_id: 'mock-user',
    name: 'The Long Quarry',
    description: null,
    place_name: null,
    place_id: null,
    memory_summary: null,
    created_at: new Date(now - 40 * 864e5).toISOString(),
    updated_at: new Date(now - 9 * 864e5).toISOString(),
    last_activity_at: null,
  },
];

export const mockStudioState: StudioEventState = {
  kind: 'state',
  placeName: 'Ember Halls',
  placeId: 1849204711,
  gameId: 5512240193,
  isRunMode: false,
  selectionCount: 2,
  pluginVersion: '0.4.1',
};

export const mockCheckpoints: CheckpointMeta[] = [
  {
    id: 'cp-3',
    label: 'before lobby rebuild',
    createdAt: now - 26 * 60_000,
    kind: 'pre_agent',
    scriptCount: 14,
    instanceCount: 386,
    sizeBytes: 284_112,
  },
  {
    id: 'cp-2',
    label: 'coins working',
    createdAt: now - 3 * 3600_000,
    kind: 'manual',
    scriptCount: 13,
    instanceCount: 341,
    sizeBytes: 251_004,
  },
  {
    id: 'cp-1',
    label: 'auto',
    createdAt: now - 26 * 3600_000,
    kind: 'auto',
    scriptCount: 11,
    instanceCount: 290,
    sizeBytes: 203_880,
  },
];

export const mockLogs: StudioEventLog[] = [
  { kind: 'log', level: 'info', message: 'Apple plugin attached — Ember Halls', clock: 1 },
  { kind: 'log', level: 'output', message: 'LobbyService loaded 3 checkpoint pads', clock: 2 },
  { kind: 'log', level: 'output', message: 'CoinService: 42 coins registered', clock: 3 },
  { kind: 'log', level: 'warn', message: 'Infinite yield possible on Workspace:WaitForChild("Shop")', clock: 4 },
  { kind: 'log', level: 'info', message: 'Rendering hero, front, side, top, eye (176x112)', clock: 5 },
  { kind: 'log', level: 'output', message: 'Render complete in 61ms', clock: 6 },
  { kind: 'log', level: 'error', message: 'CheckpointPad.Touched: attempt to index nil with "leaderstats"', clock: 7 },
  { kind: 'log', level: 'info', message: 'Applied 3 property changes to game.Workspace.Lobby', clock: 8 },
];

// ---------------------------------------------------------------------------
// A scripted conversation with a real tool trace
// ---------------------------------------------------------------------------

export const mockMessages: MessageDto[] = [
  {
    id: 'm1',
    role: 'user',
    mode: 'stone',
    content: 'Build a lobby with a spinning golden portal that teleports players to the arena.',
    toolTrace: null,
    createdAt: new Date(now - 32 * 60_000).toISOString(),
  },
  {
    id: 'm2',
    role: 'assistant',
    mode: 'stone',
    content:
      "Done. The lobby now has a raised stone plinth, a spinning golden portal ring, and a teleport pad wired to the arena.\n\n**What I changed**\n\n- `Workspace.Lobby` — new plinth, four pillars and warm PointLights\n- `Workspace.Lobby.Portal` — a torus of `Neon` parts rotating at 45°/s\n- `ServerScriptService.PortalService` — teleports on touch, with a 2s debounce per player\n\nThe portal reads a `TargetPlace` attribute so you can point it somewhere else without editing the script.",
    toolTrace: [
      { tool: 'get_project_tree', summary: 'Read 386 instances across 6 services', ok: true, durationMs: 640 },
      { tool: 'create_checkpoint', summary: 'Snapshot "before lobby rebuild" (14 scripts)', ok: true, durationMs: 1180 },
      { tool: 'create_instances', summary: 'Placed 24 parts under Workspace.Lobby', ok: true, durationMs: 890 },
      { tool: 'set_properties', summary: 'Material Concrete, 3 BrickColors across the floor', ok: true, durationMs: 210 },
      { tool: 'edit_script', summary: 'Wrote ServerScriptService.PortalService (68 lines)', ok: true, durationMs: 430 },
      { tool: 'run_and_check', summary: 'Play-tested 6s — no errors in Output', ok: true, durationMs: 7420 },
      { tool: 'inspect_visually', summary: 'Scored 7.5/10 — 2 defects, none blocking', ok: true, durationMs: 5210 },
    ],
    createdAt: new Date(now - 30 * 60_000).toISOString(),
  },
  {
    id: 'm3',
    role: 'user',
    mode: 'stone',
    content: 'The floor still looks flat. Can you check it visually and fix whatever the critique finds?',
    toolTrace: null,
    createdAt: new Date(now - 6 * 60_000).toISOString(),
  },
];

export interface MockToolDetail {
  tool: string;
  summary: string;
  ok: boolean;
  durationMs: number;
  detail?: unknown;
}

/**
 * What a `run_intent` message carries: a deterministic restatement of the
 * user's own words, the things the request named by hand, and the places it
 * genuinely did not say. This is the ONLY source the Thinking card's Intent and
 * Plan rows read from — without it those rows do not render at all.
 */
export const mockIntent: RunIntent = {
  summary: 'Check the lobby floor visually and fix whatever the critique finds.',
  checklist: ['lobby floor', 'visual critique pass', 'material variation'],
  questions: ['Which tile size to use for the floor', 'Whether the seating cluster is wanted now or later'],
};

/**
 * A plan the worker published mid-run with two steps still to come. Steps the
 * worker marks `pending` are the only legitimate source of a hollow bullet in
 * the Actions checklist.
 */
export function mockBuildPlanDetail() {
  return {
    v: 1,
    blocks: [
      {
        type: 'build_plan',
        title: 'Remaining work',
        steps: [
          { title: 'Retexture the floor into alternating tiles', status: 'done', tool: 'set_properties' },
          { title: 'Lay out a seating cluster between the pillars', status: 'pending' },
          { title: 'Re-render and re-run the visual gate', status: 'pending' },
        ],
      },
    ],
  };
}

/**
 * A script edit, as `edit_script` reports it. Feeds the activity timeline's diff
 * evidence card — the counts on that card are derived from these lines, never
 * written by hand.
 */
export function mockDiffDetail() {
  return {
    v: 1,
    blocks: [
      {
        type: 'code_diff',
        path: 'ServerScriptService/LobbyLighting',
        language: 'luau',
        summary: 'Warmed the key light and dropped the ambient floor bounce.',
        hunks: [
          {
            header: '@@ -12,7 +12,9 @@',
            lines: [
              { kind: 'ctx', text: 'local Lighting = game:GetService("Lighting")', n: 12 },
              { kind: 'del', text: 'Lighting.Ambient = Color3.fromRGB(90, 90, 90)', n: 13 },
              { kind: 'add', text: 'Lighting.Ambient = Color3.fromRGB(58, 52, 44)', n: 13 },
              { kind: 'add', text: 'Lighting.OutdoorAmbient = Color3.fromRGB(70, 62, 52)', n: 14 },
              { kind: 'ctx', text: 'Lighting.Brightness = 2', n: 15 },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * A playtest, as `run_and_check` reports it. Feeds the test-result evidence card.
 * One case fails on purpose: the failing path is the one worth being able to see.
 */
export function mockPlaytestDetail() {
  return {
    v: 1,
    blocks: [
      {
        type: 'test_report',
        title: 'Playtest · 8s server simulation',
        passed: 4,
        failed: 1,
        skipped: 1,
        durationMs: 8120,
        cases: [
          { name: 'Place loads with no errors', status: 'pass', durationMs: 1900 },
          { name: 'Spawn point is inside the lobby', status: 'pass', durationMs: 240 },
          { name: 'Portal teleport fires', status: 'pass', durationMs: 1100 },
          { name: 'Floor has no gaps underfoot', status: 'pass', durationMs: 380 },
          {
            name: 'Seating is reachable from spawn',
            status: 'fail',
            durationMs: 2400,
            message: 'Pathfinding could not reach the seating cluster: it has not been laid out yet.',
          },
          { name: 'Ambient audio loops', status: 'skip' },
        ],
      },
    ],
  };
}

/** The live (streaming) assistant turn, with a render + critique attached. */
export function mockLiveTools(): MockToolDetail[] {
  return [
    { tool: 'get_project_tree', summary: 'Read 410 instances across 6 services', ok: true, durationMs: 580 },
    {
      tool: 'edit_script',
      summary: 'Rewrote the lighting setup',
      ok: true,
      durationMs: 420,
      detail: mockDiffDetail(),
    },
    {
      tool: 'render_view',
      summary: 'Rendered 5 views of game.Workspace.Lobby',
      ok: true,
      durationMs: 1360,
      detail: mockRenderDocumentInput('after'),
    },
    {
      tool: 'inspect_visually',
      summary: 'Scored 6.5/10 — 3 defects, 1 major',
      ok: true,
      durationMs: 4980,
      detail: mockInspectDetail(),
    },
    { tool: 'set_properties', summary: 'Floor → Concrete, 3 tones of grey', ok: true, durationMs: 260 },
    {
      tool: 'run_and_check',
      summary: '4 passed, 1 failed',
      ok: true,
      durationMs: 8120,
      detail: mockPlaytestDetail(),
    },
    {
      tool: 'check_composition',
      summary: 'Published the remaining work',
      ok: true,
      durationMs: 140,
      detail: mockBuildPlanDetail(),
    },
  ];
}

const VIEWS = ['hero', 'front', 'side', 'top', 'eye'] as const;

export const mockCritique = {
  score: 6.5,
  passed: false,
  summary:
    'The portal reads clearly from the hero angle and the lighting has real warmth. The floor is still a single flat plate, and the top-down view shows most of the space is empty.',
  hardFails: [] as string[],
  defects: [
    {
      view: 'top',
      dimension: 'composition',
      severity: 'major',
      observed: 'Two thirds of the lobby footprint is bare floor with nothing on it.',
      fix: 'Add a seating cluster and two planters between the pillars so the negative space reads as designed, not unfinished.',
    },
    {
      view: 'hero',
      dimension: 'materials',
      severity: 'minor',
      observed: 'The floor plate is one uniform Concrete slab.',
      fix: 'Split the floor into 4×4 tiles and alternate two BrickColors with a Slate inlay along the walk line.',
    },
    {
      view: 'eye',
      dimension: 'proportion',
      severity: 'minor',
      observed: 'The pillars are 3 studs wide against a 24-stud ceiling, which reads spindly at eye level.',
      fix: 'Take the pillars to 5 studs and add a base plinth 1 stud proud of the shaft.',
    },
  ],
};

/**
 * What `inspect_visually` puts on `tool_end.detail`: a generative-UI document.
 * It still goes through the validator before anything is drawn.
 */
export function mockInspectDetail() {
  const render = mockRenderDocumentInput('before');
  return { v: 1, blocks: [...render.blocks, { type: 'visual_critique', ...mockCritique }] };
}

/** A representative Studio-facing render, used by the render tab and ui-lab. */
export function mockRenderDocumentInput(variant: 'before' | 'after' = 'after') {
  return {
    v: 1,
    blocks: [
      {
        type: 'render_review',
        subject: 'game.Workspace.Lobby',
        summary: 'Bounds 86 × 24 × 74 studs · 5 views',
        score: variant === 'after' ? 8.1 : 6.5,
        passed: variant === 'after',
        views: VIEWS.map((name) => ({
          name,
          image: {
            src: mockRender(name, variant),
            alt: `${name} view of the lobby`,
            width: 320,
            height: 200,
          },
          coverage: name === 'top' ? 0.44 : name === 'eye' ? 0.19 : 0.31,
          partsVisible: name === 'top' ? 118 : 96,
          partsOffCamera: name === 'eye' ? 22 : 4,
          distinctColours: variant === 'after' ? 14 : 9,
        })),
        lighting: [
          { key: 'Brightness', value: '2.4' },
          { key: 'ClockTime', value: '17.2' },
          { key: 'Light instances', value: '6' },
          { key: 'Effects', value: 'Atmosphere, Sky, BloomEffect' },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Studio frames
// ---------------------------------------------------------------------------

/**
 * Two synthetic frames in the plugin's real wire format: packed 24-bit RGB
 * rows, base64, at the rasteriser's default 288x180.
 *
 * These exist so the render stage can be exercised without a Studio session.
 * They are deliberately crude — a horizon, a ground plane and a couple of
 * blocks — because their job is to prove the decode path, not to look like a
 * game. Mock mode only; never reachable in a production build.
 */
export function mockFrames(): StudioFrame[] {
  const W = 288;
  const H = 180;

  const build = (seed: number): string => {
    const bytes = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 3;
        let r: number;
        let g: number;
        let b: number;
        if (y < H * 0.52) {
          // sky, darkening with height
          const t = y / (H * 0.52);
          r = 26 + t * 30;
          g = 24 + t * 26;
          b = 22 + t * 22;
        } else {
          // ground
          r = 58;
          g = 54;
          b = 47;
        }
        // two blocks, offset by seed so consecutive frames differ visibly
        const bx = 70 + seed * 26;
        if (x > bx && x < bx + 54 && y > H * 0.30 && y < H * 0.62) {
          r = 150;
          g = 132;
          b = 104;
        }
        if (x > bx + 78 && x < bx + 112 && y > H * 0.42 && y < H * 0.62) {
          r = 96;
          g = 90;
          b = 80;
        }
        bytes[i] = r;
        bytes[i + 1] = g;
        bytes[i + 2] = b;
      }
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  };

  const now = Date.now();
  return [
    { rgbBase64: build(0), width: W, height: H, view: 'hero', subject: 'Workspace.Lobby', capturedAt: now - 42_000 },
    { rgbBase64: build(1), width: W, height: H, view: 'eye', subject: 'Workspace.Lobby', capturedAt: now - 6_000 },
  ];
}

/** The playtest a mock session is pretending to be in the middle of. */
export const MOCK_PLAYTEST_ID = 'pt_mock';

/**
 * A live playtest and the frames belonging to it, so the Playtest card can be
 * looked at without a Studio session.
 *
 * The frames are stamped RELATIVE TO NOW and tagged with the playtest's id,
 * which matters for what this fixture actually demonstrates: the card's
 * staleness logic is driven by wall-clock age, so leaving mock mode open shows
 * the real fresh -> stale -> dead progression rather than a frozen "live"
 * badge. That transition is the whole point of the card and it should be
 * observable, not just asserted in a test.
 *
 * Mock mode only; never reachable in a production build.
 */
export function mockPlaytest(): { run: PlaytestRun; frames: StudioFrame[] } {
  const W = 160;
  const H = 100;
  const now = Date.now();

  const build = (t: number): string => {
    const bytes = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 3;
        let r: number;
        let g: number;
        let b: number;
        if (y < H * 0.5) {
          const k = y / (H * 0.5);
          r = 28 + k * 26;
          g = 26 + k * 24;
          b = 24 + k * 20;
        } else {
          r = 56;
          g = 53;
          b = 46;
        }
        // A platform, and a block that moves between frames — the thing a
        // playtest viewport exists to let you see.
        if (y > H * 0.62 && y < H * 0.68 && x > 30 && x < 130) {
          r = 120;
          g = 108;
          b = 86;
        }
        const bx = 44 + t * 22;
        if (x > bx && x < bx + 20 && y > H * 0.44 && y < H * 0.62) {
          r = 168;
          g = 128;
          b = 72;
        }
        bytes[i] = r;
        bytes[i + 1] = g;
        bytes[i + 2] = b;
      }
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  };

  const frames: StudioFrame[] = [0, 1, 2].map((t) => ({
    rgbBase64: build(t),
    width: W,
    height: H,
    view: 'eye',
    subject: 'game.Workspace',
    capturedAt: now - (2 - t) * 1500,
    playtestRunId: MOCK_PLAYTEST_ID,
    seq: t + 1,
  }));

  return {
    run: {
      id: MOCK_PLAYTEST_ID,
      phase: 'running',
      startedAt: now - 4600,
      requestedSeconds: 8,
      action: 'Run mode is live — capturing frames',
      consoleErrors: 1,
      consoleWarnings: 2,
      framesDelivered: 3,
      framesDropped: 1,
      lastFrameAt: now,
    },
    frames,
  };
}

/**
 * A project mid-flight: one asset that cannot ship, one that owes a credit, one CC0,
 * and one Apple placed by Roblox id that the library cannot account for.
 *
 * Deliberately NOT the happy path. The empty and the clean cases are one line each and
 * are exercised by `tests/credits-model.test.mjs`; what a fixture is for is the state
 * that is hard to reach by hand and easy to draw wrong.
 */
export async function mockAttribution(): Promise<AttributionResponse> {
  return {
    attribution: {
      projectId: 'p-tycoon',
      generatedAt: new Date().toISOString(),
      original: [],
      userGenerated: [],
      required: [
        {
          assetId: 'ambientcg/rock-cliff-04',
          name: 'Rock Cliff 04',
          author: 'ambientCG',
          licence: 'CC-BY-4.0',
          licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
          sourceUrl: 'https://ambientcg.com/view?id=Rock044',
          modifications: ['rescaled to 6 studs', 'tinted to the canyon palette'],
        },
      ],
      courtesy: [
        {
          assetId: 'kenney/nature-kit/tree-pine-01',
          name: 'Tree Pine 01',
          author: 'Kenney',
          licence: 'CC0-1.0',
          licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
          sourceUrl: 'https://kenney.nl/assets/nature-kit',
          modifications: [],
        },
      ],
      sourceCredits: [
        {
          text: 'Powered by Poly Haven',
          url: 'https://polyhaven.com',
          when: 'live_api',
          why: 'CC0 requires no attribution, but Poly Haven asks for this credit wherever its live API is used',
        },
      ],
      unaccounted: ['unaccounted:roblox:7042118891'],
    },
    // As the worker's renderAttribution writes it, INCOMPLETE section and all.
    credits: [
      'Credits',
      '=======',
      '',
      'Third-party assets — attribution required by their licence',
      '  - Rock Cliff 04 by ambientCG — CC-BY-4.0 (modified: rescaled to 6 studs, tinted to the canyon palette)',
      '',
      'Credits required by the sources themselves',
      '  - Powered by Poly Haven — https://polyhaven.com',
      '',
      'Third-party assets — no attribution required, credited anyway with thanks',
      '  - Tree Pine 01 by Kenney — CC0-1.0',
      '',
      'INCOMPLETE — these assets have no provenance record and could not be credited:',
      '  - unaccounted:roblox:7042118891',
    ].join('\n'),
    commercialUse: {
      projectId: 'p-tycoon',
      ok: false,
      checked: 4,
      counts: { third_party: 2, original: 0, user_generated: 0, unknown: 1 },
      findings: [
        {
          assetId: 'unaccounted:roblox:7042118891',
          name: 'Roblox asset 7042118891',
          code: 'missing_provenance',
          severity: 'blocker',
          why: 'This asset has no provenance record, so its licence is unknown and cannot be assumed permissive.',
          remediation: 'Replace it with a library asset, or record where it came from and under what licence.',
        },
        {
          assetId: 'ambientcg/rock-cliff-04',
          name: 'Rock Cliff 04',
          code: 'attribution_required',
          severity: 'warning',
          why: 'CC-BY-4.0 requires the author to be credited wherever the work appears.',
          remediation: 'Ship the credit line below in your game description.',
        },
      ],
    },
  };
}
