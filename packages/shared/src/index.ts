// @golem/shared — wire protocol + domain types shared by worker, web app, evals.
// The Studio plugin (Luau) mirrors these shapes; apps/plugin/src/Protocol.luau documents the mapping.

// ---------------------------------------------------------------------------
// Studio op protocol: commands the agent sends to the Studio plugin.
// Instance paths are game-tree paths like "game.Workspace.Lobby.Door" (names
// escaped with ["..."] when they contain dots/spaces).
// ---------------------------------------------------------------------------

export type PropValue =
  | { t: 'string'; v: string }
  | { t: 'number'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'Vector3'; v: [number, number, number] }
  | { t: 'Vector2'; v: [number, number] }
  | { t: 'NumberRange'; v: [number, number] }
  | { t: 'Rect'; v: [number, number, number, number] }
  | { t: 'CFrame'; v: number[] } // 12 components
  | { t: 'Color3'; v: [number, number, number] } // 0..1
  | { t: 'UDim2'; v: [number, number, number, number] }
  | { t: 'UDim'; v: [number, number] }
  | { t: 'EnumItem'; v: string } // "Enum.Material.Neon"
  | { t: 'BrickColor'; v: string }
  | { t: 'Content'; v: string } // rbxassetid://...
  | { t: 'Instance'; v: string } // path reference
  | { t: 'nil' };

export interface InstanceSpec {
  className: string;
  name: string;
  parent: string; // path
  props?: Record<string, PropValue>;
  attributes?: Record<string, PropValue>;
  children?: Omit<InstanceSpec, 'parent'>[];
}

export type StudioOp =
  | { op: 'ping' }
  | { op: 'get_tree'; root?: string; maxDepth?: number; maxNodes?: number }
  | { op: 'get_instance'; path: string } // full props + attributes
  | { op: 'list_scripts'; root?: string }
  | { op: 'read_script'; path: string }
  | {
      op: 'edit_script';
      path: string;
      // exactly one of:
      source?: string; // full replace
      edits?: { find: string; replace: string; all?: boolean }[];
      create?: { className: 'Script' | 'LocalScript' | 'ModuleScript'; parent: string };
    }
  | { op: 'search_scripts'; query: string; root?: string; maxResults?: number }
  | { op: 'create_instances'; items: InstanceSpec[] }
  | { op: 'set_props'; path: string; props?: Record<string, PropValue>; attributes?: Record<string, PropValue> }
  | { op: 'delete_instances'; paths: string[] }
  | { op: 'move_instances'; moves: { path: string; newParent: string }[] }
  | { op: 'run_code'; code: string; timeoutMs?: number } // plugin-context Luau via ModuleScript require
  | { op: 'get_logs'; sinceClock?: number; maxEntries?: number }
  | { op: 'run_mode'; action: 'start' | 'stop' } // RunService:Run()/Stop() server simulation
  | { op: 'get_selection' }
  | { op: 'select'; paths: string[] }
  | { op: 'camera_focus'; path: string }
  | { op: 'viewport_info' } // camera cframe, viewport size, spatial summary
  // Studio gives plugins no viewport readback, so the plugin rasterises the scene itself and
  // returns real pixels. `view` picks a camera preset; `target` frames one instance's subtree.
  | { op: 'render_view'; target?: string; view?: RenderViewName | 'all'; width?: number; height?: number }
  | { op: 'screenshot'; target?: string } // hero view at default size; kept for compatibility
  | { op: 'snapshot'; root: string; includeScripts?: boolean } // serialize subtree
  | { op: 'restore'; root: string; snapshot: unknown } // apply a snapshot payload
  | { op: 'insert_asset'; assetId: number; parent: string }
  // Roblox-native text-to-3D. Free, ~20s, 10 req/min. Output is SESSION-SCOPED: it does not
  // survive save/publish. The result always carries a QC verdict — generation succeeding is not
  // evidence the model is good.
  | { op: 'generate_model'; prompt: string; intent?: string; maxTriangles?: number; predefinedSchema?: string; parent: string }
  | { op: 'inspect_model'; path: string; intent?: string } // QC gate over an existing model
  | { op: 'undo_waypoint'; name: string }; // explicit ChangeHistoryService waypoint

/**
 * Camera presets the plugin's software renderer can produce. Multi-view exists because a single
 * angle hides most composition problems: `top` reads layout and negative space, `eye` reads what a
 * player standing in the scene actually sees, `hero` is the establishing three-quarter shot.
 */
export const RENDER_VIEWS = ['hero', 'front', 'side', 'top', 'eye'] as const;
export type RenderViewName = (typeof RENDER_VIEWS)[number];

/** One rasterised viewpoint: base64 packed RGB rows plus what was measurably in frame. */
export interface RenderedView {
  name: RenderViewName;
  rgbBase64: string;
  meta: {
    width: number;
    height: number;
    partsConsidered: number;
    partsVisible: number;
    partsOffCamera: number;
    /** fraction of the frame covered by geometry — a direct signal for bad framing */
    subjectCoverage: number;
    distinctColours: number;
    materials: { material: string; parts: number }[];
  };
}

/**
 * The scene's lighting configuration, reported alongside the render.
 *
 * This exists because the rasteriser CANNOT draw lighting — it has one fixed sun direction and no
 * shadows, PointLights or post-effects. A critic asked to judge lighting from those pixels marks
 * every scene down identically no matter what the builder did, which is a systematic bias, not a
 * finding. So lighting is judged from this configuration instead of from the image.
 */
export interface SceneLighting {
  brightness: number;
  clockTime: number;
  ambient: [number, number, number];
  outdoorAmbient?: [number, number, number];
  exposureCompensation?: number;
  geographicLatitude?: number;
  fogEnd?: number;
  /** how many Light instances (PointLight/SpotLight/SurfaceLight) exist in the scene */
  lightInstances: number;
  /** Atmosphere / Sky / PostEffect class names present under Lighting */
  effects: string[];
}

/**
 * Compact geometry for layout analysis. Composition is a question about PLACEMENT, and placement is
 * invisible in a rendered image once objects overlap — a plaza can look identical in pixels whether
 * its props were designed or stamped out on a grid. Flat tuples rather than named fields: 1,500
 * parts is ~60 KB this way and roughly triple that with names, for no gain on the worker side.
 */
export interface SceneLayout {
  /** always "x,y,z,sx,sy,sz,yawDeg" */
  format: string;
  parts: number[][];
  /** parts omitted because the cap was reached */
  skipped: number;
}

/**
 * Heights of the distinct vertical elements in a captured layout, tallest first, measured from the
 * scene floor and clustered in plan so a monument built from eight stacked parts counts once.
 *
 * Lives in shared because both the worker (which gates on it) and the web app (which displays it)
 * need the same number, and a second implementation would drift. `parts` is SceneLayout.parts:
 * [x, y, z, sx, sy, sz, yawDeg].
 *
 * The ratio of the first two entries is `verticalDominance`, the one metric that separated good
 * composition from bad across the whole calibration ladder — see docs/COMPOSITION.md. Below about
 * 1.25 nothing dominates and the scene has no landmark, however many parts it contains.
 */
export function verticalElementHeights(parts: number[][], minHeight = 2, planGap = 3): number[] {
  const live = parts.filter((p) => p[3]! <= 600 && p[5]! <= 600);
  if (!live.length) return [];
  const floor = Math.min(...live.map((p) => p[1]! - p[4]! / 2));
  const tall = live.filter((p) => p[4]! >= minHeight);
  if (!tall.length) return [];

  const parent = tall.map((_, i) => i);
  const find = (a: number): number => {
    let x = a;
    while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; }
    return x;
  };
  for (let i = 0; i < tall.length; i++) {
    for (let j = i + 1; j < tall.length; j++) {
      const a = tall[i]!;
      const b = tall[j]!;
      const dx = Math.abs(a[0]! - b[0]!) - (a[3]! + b[3]!) / 2;
      const dz = Math.abs(a[2]! - b[2]!) - (a[5]! + b[5]!) / 2;
      if (dx <= planGap && dz <= planGap) {
        const ra = find(i);
        const rb = find(j);
        if (ra !== rb) parent[ra] = rb;
      }
    }
  }
  const top = new Map<number, number>();
  for (let i = 0; i < tall.length; i++) {
    const r = find(i);
    top.set(r, Math.max(top.get(r) ?? 0, tall[i]![1]! + tall[i]![4]! / 2 - floor));
  }
  return [...top.values()].sort((a, b) => b - a);
}

/** Landmark dominance: tallest vertical element over the next tallest. 1 means nothing dominates. */
export function verticalDominance(parts: number[][] | undefined): number | null {
  if (!parts?.length) return null;
  const h = verticalElementHeights(parts);
  if (h.length < 2) return h.length === 1 ? 1 : null;
  return Math.round((h[0]! / Math.max(1e-6, h[1]!)) * 1000) / 1000;
}

export interface RenderViewResult {
  subject: string;
  boundsSize: [number, number, number];
  views: RenderedView[];
  lighting?: SceneLighting;
  layout?: SceneLayout;
}

export interface PendingOp {
  id: string; // opaque, unique per op
  seq: number;
  studioOp: StudioOp;
}

export interface OpResult {
  id: string;
  ok: boolean;
  // JSON payload; large payloads (snapshots, trees) may be chunked via resultChunk
  data?: unknown;
  error?: string;
  durationMs?: number;
}

export interface StudioEventLog {
  kind: 'log';
  message: string;
  level: 'info' | 'warn' | 'error' | 'output';
  clock: number;
}
export interface StudioEventState {
  kind: 'state';
  placeName: string;
  placeId: number;
  gameId: number;
  isRunMode: boolean;
  selectionCount: number;
  pluginVersion: string;
}
export type StudioEvent = StudioEventLog | StudioEventState;

// Plugin <-> worker HTTP (plugin long-polls; no WebSocket in Studio)
export interface PluginPollRequest {
  results?: OpResult[];
  events?: StudioEvent[];
  state?: StudioEventState;
}
export interface PluginPollResponse {
  ops: PendingOp[];
  waitMs: number; // suggested next poll delay
  detach?: boolean; // session ended
}

// ---------------------------------------------------------------------------
// Agent + chat protocol (web <-> DO over WebSocket)
// ---------------------------------------------------------------------------

export type GolemMode = 'clay' | 'stone' | 'rune';

export interface ChatAttachment {
  kind: 'image' | 'file';
  name: string;
  r2Key: string;
  mime: string;
  size: number;
}

export type ClientMsg =
  | { type: 'chat'; text: string; mode: GolemMode; attachments?: ChatAttachment[] }
  | { type: 'stop' } // interrupt agent
  | { type: 'resume' }
  | { type: 'checkpoint_create'; label: string }
  | { type: 'checkpoint_restore'; checkpointId: string }
  | { type: 'ping' };

/**
 * The build lifecycle, as the UI shows it.
 *
 * Every value here corresponds to a real, observable point in the agent's
 * execution — either an explicit stage in `runStep` or the tool that is
 * actually running at that moment. Nothing here is inferred, predicted or
 * interpolated: if the worker has not reached a stage, it does not announce it.
 * Adding a phase means adding the code point that emits it.
 */
export type AgentPhase =
  | 'understanding' // the request has arrived, before the first model call
  | 'planning' // first step of a multi-step mode
  | 'inspecting' // reading the project: tree, scripts, docs, assets
  | 'building' // creating or configuring instances
  | 'writing_luau' // editing script source
  | 'rendering' // the plugin is rasterising the scene
  | 'critiquing' // composition / semantic / vision gate is judging it
  | 'rebuilding' // a gate rejected the work and the agent is starting over
  | 'playtesting' // run mode is active in Studio
  | 'debugging' // reading logs after a failure
  | 'verifying' // confirming the change actually landed
  | 'checkpointing' // snapshotting the place
  | 'remembering' // writing project memory
  | 'done';

/**
 * Which phase a tool represents. Used by the worker to announce the stage and
 * by the web app to group activity. Kept here so both sides cannot drift.
 */
export function phaseForTool(tool: string): AgentPhase {
  switch (tool) {
    case 'get_project_tree':
    case 'list_scripts':
    case 'read_script':
    case 'search_scripts':
    case 'search_docs':
    case 'choose_asset_source':
    case 'search_asset_library':
    case 'find_verified_asset':
    case 'inspect_model':
      return 'inspecting';
    case 'edit_script':
      return 'writing_luau';
    case 'create_instances':
    case 'set_properties':
    case 'delete_instances':
    case 'insert_asset':
    case 'generate_model':
    case 'run_luau':
      return 'building';
    case 'render_view':
      return 'rendering';
    case 'check_composition':
    case 'inspect_visually':
      return 'critiquing';
    case 'run_and_check':
      return 'playtesting';
    case 'get_output_logs':
      return 'debugging';
    case 'create_checkpoint':
      return 'checkpointing';
    case 'remember':
      return 'remembering';
    default:
      return 'building';
  }
}

/**
 * What the agent understood the request to be, and what it therefore has to
 * produce. Shown as the Intent and Plan rows of the Thinking card.
 *
 * Every field here is DERIVED DETERMINISTICALLY by the intent extractor in
 * `semantic.ts` from the user's own words — no model call, no inference, no
 * cost. That matters for honesty as much as for money: these rows are a
 * restatement of what the user asked for, not a claim about what the model is
 * privately thinking. Nothing here is chain-of-thought, and none of it is
 * guessed when the request did not say.
 */
export interface RunIntent {
  /** One line restating the request in the agent's own terms. */
  summary: string;
  /**
   * The concrete things the request named by hand — "bar counter", "stools",
   * "warm interior lighting". The build is checked against this list, so it is
   * the honest content of a "Plan" row: not a predicted sequence of steps, but
   * the set of things that must exist when the run is done.
   */
  checklist: string[];
  /** Where the request genuinely did not say. Surfaced rather than assumed. */
  questions: string[];
}

/**
 * A live snapshot of an in-flight run, replayed to a client that connects or
 * reconnects while the agent is working.
 *
 * This exists because the run itself is durable — it is driven by a Durable
 * Object alarm and continues with zero sockets attached — but the events
 * announcing it were not: `broadcast` drops anything sent while nobody is
 * listening. Before this, refreshing the browser mid-build left the user
 * staring at their own message with no sign that work was still happening.
 */
export interface RunSnapshot {
  msgId: string;
  mode: GolemMode;
  phase: AgentPhase;
  step: number;
  totalSteps: number;
  /** Text the assistant has produced so far this run. */
  text: string;
  /** Tools already executed this run, oldest first. */
  tools: RunSnapshotTool[];
  startedAt: number;
  /** The reasoning policy's own explanation of the effort it chose. */
  effort?: 'low' | 'medium' | 'high';
  effortReason?: string;
  /** What the agent understood, replayed so a refresh does not lose it. */
  intent?: RunIntent;
}

/**
 * One frame rasterised by the Studio plugin and forwarded to the browser.
 *
 * WHAT THIS IS, EXACTLY. Roblox gives plugins no viewport readback, so there
 * is no screenshot of what the user is looking at and no video to stream. The
 * plugin instead runs its own depth-buffered triangle rasteriser in Luau and
 * returns pixels it computed itself: flat Lambert shading, one fixed sun, no
 * shadows, no PointLights, no post-effects, no characters and no particles.
 *
 * It is therefore a DIAGNOSTIC RENDER of scene geometry, and the UI is
 * required to say so. Presenting it as a live view of the game would be a
 * lie, and a convincing one.
 *
 * Cost is why these are occasional rather than continuous: rasterising runs
 * synchronously on Studio's main thread, so every frame briefly freezes the
 * user's editor, and each one crosses the wire as uncompressed base64 RGB
 * (~207KB at the default 288x180).
 */
export interface StudioFrame {
  /** Packed 24-bit RGB rows, base64. Decoded to a canvas in the browser. */
  rgbBase64: string;
  width: number;
  height: number;
  /** Which camera preset produced it. */
  view: string;
  /** What was framed. */
  subject: string;
  capturedAt: number;
  /** The run this belongs to, so late frames cannot attach to a new turn. */
  msgId?: string;
}

export interface RunSnapshotTool {
  toolId: string;
  tool: string;
  ok: boolean;
  summary: string;
  durationMs: number;
  detail?: unknown;
}

export type ServerMsg =
  | { type: 'hello'; sessionId: string; studioConnected: boolean; quota: QuotaState }
  | { type: 'studio_status'; connected: boolean; state?: StudioEventState }
  | { type: 'msg_start'; msgId: string; role: 'assistant'; mode: GolemMode }
  | { type: 'delta'; msgId: string; text: string }
  | { type: 'tool_start'; msgId: string; toolId: string; tool: string; summary: string }
  // `detail` carries the tool's STRUCTURED result, which the web app offers to
  // the typed generative-UI validator. Anything that validates becomes a real
  // component; anything that does not is simply not rendered. It is capped in
  // do/session.ts so a large result cannot wedge the socket.
  | { type: 'tool_end'; msgId: string; toolId: string; ok: boolean; summary: string; detail?: unknown }
  // 'incomplete' means the run ended having changed nothing. It is deliberately distinct from
  // 'error': nothing failed loudly, the agent simply never did the work and would otherwise have
  // reported success. See finishRun in do/session.ts.
  | { type: 'msg_end'; msgId: string; stopReason: 'done' | 'stopped' | 'error' | 'quota' | 'incomplete'; error?: string }
  // `effortReason` is the reasoning POLICY's own summary (e.g. "stone baseline;
  // visual design task"). It is a classification of the request, not the
  // model's hidden reasoning, and never contains prompt or transcript content.
  | {
      type: 'agent_status';
      phase: AgentPhase;
      step?: number;
      totalSteps?: number;
      tool?: string;
      effort?: 'low' | 'medium' | 'high';
      effortReason?: string;
    }
  | { type: 'quota'; quota: QuotaState }
  | { type: 'checkpoint'; checkpoint: CheckpointMeta }
  | { type: 'studio_log'; entries: StudioEventLog[] }
  // Sent in reply to `resume`, and unprompted on connect when a run is live.
  | { type: 'run_state'; run: RunSnapshot | null }
  // A real frame rasterised inside Studio and forwarded to the browser.
  // See StudioFrame — this is a diagnostic render, NOT a viewport capture.
  | { type: 'studio_frame'; frame: StudioFrame }
  // Emitted once, at run start, after the request has been classified.
  | { type: 'run_intent'; msgId: string; intent: RunIntent }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

export interface QuotaState {
  sparksRemaining: number;
  sparksDaily: number;
  sparksMonthly: number;
  sparksUsedToday: number;
  sparksUsedThisMonth: number;
  resetsAtIso: string;
  plan: 'free' | 'pro';
}

export interface CheckpointMeta {
  id: string;
  label: string;
  createdAt: number;
  kind: 'auto' | 'manual' | 'pre_agent';
  scriptCount: number;
  instanceCount: number;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// REST DTOs
// ---------------------------------------------------------------------------

export interface ProjectDto {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  placeName: string | null;
  placeId: number | null;
  lastActivityAt: string | null;
  memorySummary: string | null;
}

export interface MessageDto {
  id: string;
  role: 'user' | 'assistant' | 'system';
  mode: GolemMode | null;
  content: string;
  toolTrace: ToolTraceEntry[] | null;
  createdAt: string;
}

export interface ToolTraceEntry {
  tool: string;
  summary: string;
  ok: boolean;
  durationMs: number;
}

export interface PairingCodeDto {
  code: string; // e.g. "GLM-7F3K2Q"
  expiresAtIso: string;
}

// Model gateway internals (worker-side only, exported for evals)
/**
 * Multimodal message content. A plain string stays a plain string on the wire; the array form is
 * only used where an image is actually attached, so ordinary text calls are unaffected.
 */
export type GatewayContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }; // data: URL, base64 PNG

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | GatewayContentPart[];
  toolCallId?: string;
  name?: string;
  /** structured tool calls made by the assistant on this turn (never serialised as text) */
  toolCalls?: GatewayToolCall[];
  /**
   * The transcript trim may never evict this message. Set on the user's original request, which a
   * character-budget trim would otherwise delete out from under a long run — see trimTranscript in
   * do/session.ts. Never serialised: the gateway builds the wire payload by explicit field pick.
   */
  pinned?: boolean;
}

export interface GatewayRequest {
  model: string; // internal model key, not provider id
  messages: GatewayMessage[];
  tools?: GatewayToolDef[];
  maxTokens?: number;
  temperature?: number;
  jsonSchema?: unknown;
  stream?: boolean;
  /**
   * Per-call override of the model's configured reasoning effort. The adaptive reasoning policy
   * uses this to spend thinking where it changes the outcome (visual design, recovery from a
   * failure) and stay cheap everywhere else.
   */
  reasoningEffort?: 'low' | 'medium' | 'high';
}
export interface GatewayToolDef {
  name: string;
  description: string;
  parameters: unknown; // JSON schema
}
export interface GatewayToolCall {
  id: string;
  name: string;
  arguments: string; // raw JSON string
}
export interface GatewayResponse {
  text: string;
  toolCalls: GatewayToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  /** what this call actually cost, in Cloudflare neurons */
  neurons: number;
  provider: string;
  model: string;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

/**
 * Sparks are billed from the neurons a run actually consumes (1 Spark = 90 neurons), so these
 * are *typical measured* costs shown in the UI, not fixed prices. Measured 2026-08-30:
 * Clay ~29 neurons, Stone answer-only ~139, Stone full build+verify in Studio ~1,266.
 */
export const MODE_INFO: Record<GolemMode, { name: string; blurb: string; sparksPerRequest: number; typicalSparks: string }> = {
  clay: { name: 'Clay', blurb: 'Fast answers and small edits', sparksPerRequest: 1, typicalSparks: '~1' },
  stone: { name: 'Stone', blurb: 'Builds features across your project', sparksPerRequest: 2, typicalSparks: '2-15' },
  rune: { name: 'Rune', blurb: 'Plans, builds, tests and fixes autonomously', sparksPerRequest: 3, typicalSparks: '10-30' },
};

export const PROTOCOL_VERSION = 1;
