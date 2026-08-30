/**
 * Dev/QA mock mode.
 *
 * The app is behind Supabase auth, so design review of the signed-in surfaces
 * would otherwise be impossible without a real account. With
 * `VITE_GOLEM_MOCK=1` (or `?mock=1` in a dev server) every network read is
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
  QuotaState,
  StudioEventLog,
  StudioEventState,
} from '@golem/shared';
import type { MeResponse, UsageDay } from './api';
import type { ProfileRow, ProjectRow } from './supabase';

const FLAG = import.meta.env.VITE_GOLEM_MOCK === '1';

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
    breakdown: [
      { day: days[0]?.day ?? '', model: 'workers-ai/glm-5.3-flash', kind: 'agent', neurons: 4120, calls: 18, usd: 0 },
      { day: days[0]?.day ?? '', model: 'workers-ai/glm-5.3-flash', kind: 'critique', neurons: 1810, calls: 6, usd: 0 },
      { day: days[0]?.day ?? '', model: 'workers-ai/bge-m3', kind: 'embedding', neurons: 90, calls: 41, usd: 0 },
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
  { kind: 'log', level: 'info', message: 'Golem plugin attached — Ember Halls', clock: 1 },
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

/** The live (streaming) assistant turn, with a render + critique attached. */
export function mockLiveTools(): MockToolDetail[] {
  return [
    { tool: 'get_project_tree', summary: 'Read 410 instances across 6 services', ok: true, durationMs: 580 },
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
