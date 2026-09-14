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
  /**
   * The run that queued this op, so ops belonging to a run that has since ended can be
   * discarded instead of executed. Optional because an op persisted by an older deploy has
   * no runId, and an op with no runId is delivered — silently dropping work from a version
   * that predates the field would be a worse failure than the one this prevents. See A5.
   */
  runId?: string;
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
  /**
   * Correct an earlier prompt and run again from there.
   *
   * Everything from `messageId` onward is DISCARDED — the edited message replaces it and the
   * conversation continues from that point, which is what makes this a correction rather than a
   * new question. That discard is permanent and is the reason the client confirms first.
   *
   * It does NOT undo anything already built in the Roblox place. The conversation is rewound; the
   * work is not. Checkpoints are the tool for that, and the two are deliberately separate — a
   * wording fix should not silently revert a working door.
   */
  | { type: 'edit_resend'; messageId: string; text: string; mode: GolemMode }
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
 *
 * The `default` is for a name this build has never heard of — a plugin or worker
 * one version ahead. It is NOT a resting place for a registered tool: every key of
 * the worker's TOOLS registry must appear in a `case` above, and
 * `apps/worker/tests/phase-coverage.test.mjs` fails the build if one does not.
 * `generate_image` had been sitting on the default and reporting "Building",
 * which happened to be the phase it wanted — a right answer nobody had chosen.
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
    // The read-only Studio tools. Each one ASKS the place something and changes nothing, so
    // announcing "building" while they run tells the user work is happening that is not.
    case 'get_instance':
    case 'get_selection':
    case 'viewport_info':
      return 'inspecting';
    case 'edit_script':
      return 'writing_luau';
    case 'create_instances':
    case 'set_properties':
    case 'delete_instances':
    case 'insert_asset':
    case 'generate_model':
    case 'generate_image':
    case 'run_luau':
    // These DO change the place: lighting, ambient effects, and writing a vetted module into it.
    // They are building even though none of them creates geometry.
    case 'set_mood':
    case 'add_effect':
    case 'remove_effect':
    case 'install_module':
    // Moving the user's camera and selection changes what they SEE rather than what is there,
    // but it happens as part of building and there is no truer phase for it.
    case 'focus_camera':
    case 'select_instances':
      return 'building';
    case 'render_view':
      return 'rendering';
    case 'check_composition':
    case 'inspect_visually':
    // audit_build and run_spec are judgement, not construction: they measure what is already
    // there and report defects. They belong beside the other critics.
    case 'audit_build':
    case 'run_spec':
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
  /**
   * The pixels, base64. The byte stream underneath depends on `encoding`:
   * packed 24-bit RGB rows by default, run-length records when the worker
   * found that smaller. Decoded to a canvas in the browser.
   */
  rgbBase64: string;
  /**
   * How `rgbBase64` is packed. ABSENT MEANS 'rgb24' — every frame emitted
   * before this field existed is raw RGB, and a decoder that defaults to rgb24
   * reads them correctly without knowing the field exists.
   *
   * 'rle24' is chosen PER FRAME and only when it actually wins. Measured on
   * synthetic frames matching the rasteriser's output structure (flat sky and
   * ground fills, flat-shaded quads): 10-22x smaller on that content, but
   * 1.33x LARGER on high-entropy content, so the encoder compares and keeps
   * the smaller of the two. See frame-bus.ts.
   */
  encoding?: FrameEncoding;
  width: number;
  height: number;
  /** Which camera preset produced it. */
  view: string;
  /** What was framed. */
  subject: string;
  capturedAt: number;
  /** The run this belongs to, so late frames cannot attach to a new turn. */
  msgId?: string;
  /**
   * The playtest this frame was captured during, when it was captured during
   * one. Absent on the ordinary critique renders, which is how the UI tells a
   * playtest frame from a build render without guessing.
   */
  playtestRunId?: string;
  /** Monotonic per-playtest counter, so a reordered frame cannot appear newer. */
  seq?: number;
}

export type FrameEncoding = 'rgb24' | 'rle24';

/**
 * A playtest, as the browser is entitled to describe it.
 *
 * Every field is a fact the worker has actually observed. `elapsedMs` is
 * derived from timestamps the worker wrote, `consoleErrors` is a count of real
 * LogService entries, and `action` names the step the worker is genuinely
 * executing right now. Nothing here is predicted or interpolated: when the
 * worker does not know, the field is absent rather than filled with a
 * plausible value.
 */
export type PlaytestPhase =
  /** Protective checkpoint / census, before RunService:Run() is called. */
  | 'preparing'
  /** Run mode is live in Studio and frames are being captured. */
  | 'running'
  /** RunService:Stop() issued; the post-run census has not returned yet. */
  | 'stopping'
  /** Finished cleanly. Terminal. */
  | 'finished'
  /** Refused or aborted — `error` says why. Terminal. */
  | 'failed';

export interface PlaytestRun {
  id: string;
  phase: PlaytestPhase;
  /** Wall-clock ms since the playtest was started, as the worker measured it. */
  startedAt: number;
  /** Set once the run reaches a terminal phase. Absent while live. */
  endedAt?: number;
  /** How many seconds of run mode were requested. */
  requestedSeconds: number;
  /** What the worker is doing at this instant, in the user's language. */
  action: string;
  /** Real counts from the Studio console, not estimates. */
  consoleErrors: number;
  consoleWarnings: number;
  /** Frames actually delivered to the browser for this playtest. */
  framesDelivered: number;
  /**
   * Frames the capture loop asked for and did not get — a rasterise that timed
   * out, a frame refused by the size cap, a plugin that went away. Surfaced so
   * a stuttering stream reads as a stuttering stream rather than as a slow one.
   */
  framesDropped: number;
  /** capturedAt of the newest delivered frame, for staleness. Absent until one lands. */
  lastFrameAt?: number;
  /** Present only in the 'failed' phase. */
  error?: string;
  /** The agent turn this playtest belongs to. */
  msgId?: string;
}

/**
 * A frame older than this is STALE: still shown, but the UI must say it is not
 * current. Set above the capture floor (1500ms) plus a rasterise and a
 * long-poll round trip, so an ordinary healthy stream never trips it.
 */
export const PLAYTEST_STALE_MS = 6000;

/**
 * A frame older than this is DEAD: the stream has stopped in a way the user
 * needs told. The card keeps showing the last real frame — throwing it away
 * would destroy information — but labels it as the last frame received and
 * when, never as the current state of the game.
 */
export const PLAYTEST_DEAD_MS = 20_000;

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
  /**
   * The conversation was rewound to just before `fromMessageId`.
   *
   * Broadcast to EVERY client, not just the one that asked: a second tab showing messages the
   * server has deleted will keep showing them forever, and the user cannot tell that stale view
   * apart from a live one.
   */
  | { type: 'history_truncated'; fromMessageId: string; removed: number }
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
  | {
      type: 'msg_end';
      msgId: string;
      stopReason: 'done' | 'stopped' | 'error' | 'quota' | 'incomplete';
      error?: string;
      /**
       * WHAT THE RUN ACTUALLY COST, AND THE ONLY MESSAGE THAT CAN CARRY IT.
       *
       * `agent_status.sparksSpent` is a running total broadcast at the TOP of each step, and each
       * step settles its real neuron cost AFTER that broadcast
       * (`sparksForNeurons(agent.neuronsUsed) - agent.sparksSpent`). So the last figure the user
       * ever saw was always one settlement behind, and the final step's settlement — frequently
       * the largest, since it is the one that finishes the build — was never broadcast at all.
       *
       * The client also clears `agentStatus` on this very message, so the in-flight display
       * vanished at exactly the moment the number became correct. Between those two facts a user
       * could not see what a run cost them: not during, because it was stale, and not after,
       * because it was gone.
       *
       * This is the settled figure, read after the last settlement. It rides on `msg_end` because
       * that is the one message guaranteed to be sent once the charging is finished.
       */
      sparksSpent?: number;
    }
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
      /**
       * What THIS run has cost so far, in the user-facing unit.
       *
       * Distinct from the `quota` message, which carries whole-account state: a user watching a
       * build wants to know what the build is costing, not what their day looks like. Both were
       * tracked on the server and only the account-wide figure was ever sent, so the number the
       * user could actually act on — "this run has spent 6 Sparks and is on step 9 of 16" — was
       * the one they could not see.
       */
      sparksSpent?: number;
    }
  | { type: 'quota'; quota: QuotaState }
  | { type: 'checkpoint'; checkpoint: CheckpointMeta }
  | { type: 'studio_log'; entries: StudioEventLog[] }
  // Sent in reply to `resume`, and unprompted on connect when a run is live.
  | { type: 'run_state'; run: RunSnapshot | null }
  // A real frame rasterised inside Studio and forwarded to the browser.
  // See StudioFrame — this is a diagnostic render, NOT a viewport capture.
  | { type: 'studio_frame'; frame: StudioFrame }
  // The live playtest, or null once there is none. Emitted on every phase
  // change and on every capture tick, so the card's elapsed time and console
  // counts come from the worker rather than from a timer in the browser
  // guessing what the worker is doing.
  | { type: 'playtest_state'; run: PlaytestRun | null }
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
  plan: 'free' | 'builder' | 'studio' | 'enterprise';
  /**
   * The renewable part of `sparksRemaining`, reported separately because "you have 0 left today"
   * and "you have 0 left at all" are different sentences and the UI must be able to tell them apart.
   */
  allowanceRemaining: number;
  /** Purchased, non-expiring balance. Spent only after the allowance for the period is gone. */
  credits: number;
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
/**
 * `sparksPerRequest` is GONE, deliberately.
 *
 * It used to be the upfront charge — `quotaSpend(owner, MODE_INFO[mode].sparksPerRequest)`
 * — and the site's published "Clay 1 · Stone 4 · Rune 10" came from exactly those
 * numbers. The charging model then changed: session.ts now takes ONE spark upfront
 * whatever the mode, and settles the difference from measured neurons
 * (`sparksForNeurons(agent.neuronsUsed) - agent.sparksSpent`). Nothing has read
 * `sparksPerRequest` since, while the comment below PRODUCT_MODE_INFO still called it
 * "the balance a client must hold before it may send" and told the reader to "change a
 * price in MODE_INFO or nowhere". Someone following that instruction would have changed
 * a number that charges nobody.
 *
 * `typicalSparks` is different: the composer renders it, as "Typically N Sparks". It is
 * derived from docs/COST-MODEL.md through `ceil(neurons / 30)`, the same arithmetic the
 * worker bills with, and `scripts/check-spark-figures.mjs` checks it against those
 * measurements.
 */
export const MODE_INFO: Record<GolemMode, { name: string; blurb: string; typicalSparks: string }> = {
  clay: { name: 'Clay', blurb: 'Fast answers and small edits', typicalSparks: '2' },
  stone: { name: 'Stone', blurb: 'Builds features across your project', typicalSparks: '4-18' },
  rune: { name: 'Rune', blurb: 'Plans, builds, tests and fixes autonomously', typicalSparks: '10-30' },
};

// ---------------------------------------------------------------------------
// Product modes — the only mode concept the product surfaces
//
// Users pick Plan / Agent / Super Agent. They never pick a specialist, and they
// never pick a provider or a foundation model: which engine answers is an
// implementation detail of the routing layer, visible only in admin and
// diagnostics surfaces.
//
// The internal specialist axis (GolemMode: clay/stone/rune) is deliberately
// preserved exactly as it is, on the wire and in storage. `ClientMsg.chat`
// still carries `mode: AppleMode`, the session DO still persists it, and the
// Sparks ledger still accounts against it — so sessions written before this
// mapping existed keep replaying correctly and no budget record changes meaning.
// Clay, Stone and Rune are internal specialist identities, not user-facing
// brands: nothing in normal product UI should name them.
//
// Translate at the edge (product mode in, specialist out) and nothing below the
// edge has to know the product ever gained a new vocabulary.
// ---------------------------------------------------------------------------

/** What the user picks. This is the only mode concept the product surfaces. */
export type ProductMode = 'plan' | 'agent' | 'super';

/** The three product modes in the order they are offered. */
export const PRODUCT_MODES: readonly ProductMode[] = ['plan', 'agent', 'super'];

/**
 * Product mode -> internal specialist. Plan is inspection and design, and is
 * the cheapest work we do, so it maps to Clay. Agent is the normal bounded
 * builder, which is Stone. Super Agent is long-horizon autonomy, which is Rune.
 *
 * Do not "improve" this mapping: it is what keeps a stored session's
 * `mode: AppleMode` meaning the same thing it meant when it was written.
 */
export const PRODUCT_MODE_TO_SPECIALIST: Record<ProductMode, GolemMode> = {
  plan: 'clay',
  agent: 'stone',
  super: 'rune',
};

/** Internal specialist -> the product mode that selects it. The exact inverse. */
export const SPECIALIST_TO_PRODUCT_MODE: Record<GolemMode, ProductMode> = {
  clay: 'plan',
  stone: 'agent',
  rune: 'super',
};

/**
 * User-facing copy and cost for each product mode.
 *
 * The Spark figure is NOT restated here — it is read out of MODE_INFO through the
 * mapping above, so a product-mode number cannot drift from its specialist's. What it
 * is has changed: it is `typicalSparks`, a range measured in docs/COST-MODEL.md, and
 * not a price the client enforces. The worker takes one spark upfront whatever the mode
 * and settles the rest from the neurons actually used.
 */
export const PRODUCT_MODE_INFO: Record<
  ProductMode,
  { name: string; blurb: string; typicalSparks: string }
> = {
  plan: {
    name: 'Plan',
    blurb: 'Inspects your project and designs the work. Proposes; does not change anything.',
    typicalSparks: MODE_INFO[PRODUCT_MODE_TO_SPECIALIST.plan].typicalSparks,
  },
  agent: {
    name: 'Agent',
    blurb: 'Builds, tests and repairs. The normal way to work.',
    typicalSparks: MODE_INFO[PRODUCT_MODE_TO_SPECIALIST.agent].typicalSparks,
  },
  super: {
    name: 'Super Agent',
    blurb:
      'Long-horizon autonomous creation. Decomposes, builds, playtests, critiques and iterates through many stages without asking routine questions.',
    typicalSparks: MODE_INFO[PRODUCT_MODE_TO_SPECIALIST.super].typicalSparks,
  },
};

export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// Studio plugin distribution
//
// THE SINGLE SOURCE OF TRUTH FOR THE PLUGIN ASSET. The id below is the only
// place this number appears as a literal in the repository; every URL that
// needs it is derived here and imported from here. apps/site cannot depend on
// this package through pnpm, so it re-exports these two constants through
// apps/site/src/lib/studio-plugin.ts rather than restating the id.
//
// Measured against the live Roblox APIs on 2026-08-31:
//   economy.roblox.com/v2/assets/<id>/details       -> 200 (AssetTypeId 38, "Apple")
//   roblox.com/library/<id>                         -> 307 -> create.roblox.com/store/asset/<id>
//   apis.roblox.com/toolbox-service/.../<id>        -> 404
// The 307 is why STUDIO_PLUGIN_URL uses create.roblox.com/store/asset: Roblox
// itself redirects the old library URL there.
//
// The 404 is the important one. Measured against two known-public plugins
// (Rojo 6415005344, Moon Animator 4725618216) toolbox-service returns 200; for
// this asset it returns 404, which means the asset is NOT yet distributable on
// the Creator Store. Nothing in this repo may state or imply that a user can
// install it today. Uploading a plugin makes it private to its owner; making it
// public is a separate human step in the Creator Dashboard
// (Development Items -> Configure -> Distribution -> Distribute on Creator Store).
// ---------------------------------------------------------------------------

/** The Apple Studio plugin's Roblox asset id. The one literal; derive, never retype. */
export const STUDIO_PLUGIN_ASSET_ID = '132128477945417';

/**
 * The plugin's canonical Creator Store page. This page loads; whether it offers
 * a working "Get Plugin" button depends on the distribution toggle above, so
 * link to it without promising the install will succeed.
 */
export const STUDIO_PLUGIN_URL = `https://create.roblox.com/store/asset/${STUDIO_PLUGIN_ASSET_ID}`;

/**
 * The ONLY reliable liveness probe for "is this plugin actually distributable".
 * HTTP 200 means listed, 404 means not listed. Do not substitute
 * `economy.roblox.com` or `develop.roblox.com/v1/plugins` (both return 200 for
 * an unlisted asset) or `assetdelivery` (Moon Animator is fully listed and
 * still returns 401 unauthenticated).
 */
export const STUDIO_PLUGIN_LIVENESS_PROBE_URL = `https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=${STUDIO_PLUGIN_ASSET_ID}`;

/**
 * Whether the asset is actually DISTRIBUTABLE on the Creator Store — the one
 * definition of that fact in the repository.
 *
 * This is a separate fact from "the asset exists", and it is the one every
 * user-facing install affordance has to obey. Uploading a plugin only places it
 * in its owner's own Inventory; a human toggles Creator Dashboard -> Development
 * Items -> Configure -> Distribution -> "Distribute on Creator Store" before
 * anyone else can get it.
 *
 * Re-probe, then flip this one constant — nothing else needs to change:
 *   curl -s -o /dev/null -w '%{http_code}\n' "$STUDIO_PLUGIN_LIVENESS_PROBE_URL"
 * 200 = listed, 404 = not. Last checked 2026-08-31: 404 for this asset, against
 * 200 for a known-listed control (Rojo, 6415005344).
 *
 * Typed `boolean` rather than the literal `false` on purpose: consumers branch
 * on it, and a literal type would make the live branch look unreachable.
 */
export const STUDIO_PLUGIN_STORE_LIVE: boolean = false;

/**
 * Where an "install" affordance may actually send someone TODAY.
 *
 * ADR-017 decision 3 says copy degrades honestly rather than "shipping a link
 * that 404s". A button pointing straight at the store while the asset is not
 * distributable does exactly that: the reader arrives at a page with nothing to
 * get and no explanation. So until the probe returns 200, every install
 * affordance goes to `/docs/plugin`, which states plainly that the plugin is not
 * published yet and becomes a working install guide the moment it is.
 *
 * When STUDIO_PLUGIN_STORE_LIVE flips, this becomes the store URL everywhere at
 * once. Use STUDIO_PLUGIN_STORE_LIVE to decide whether the link is external
 * (target=_blank + rel=noopener noreferrer); while it is false the destination
 * is same-origin and must not open a new tab.
 */
export const STUDIO_PLUGIN_INSTALL_HREF: string = STUDIO_PLUGIN_STORE_LIVE
  ? STUDIO_PLUGIN_URL
  : '/docs/plugin';

// ---------------------------------------------------------------------------
// The plan ladder, as the product presents it.
// ---------------------------------------------------------------------------
//
// Shared rather than worker-only because the limits are BOTH a server rule and a page of copy, and
// the two were about to be written down twice. A plan page that disagrees with the ledger enforcing
// it is a page that lies to the user, and nothing would have caught the drift.
//
// Sparks are the RENEWABLE allowance: they reset and do not accumulate, so a plan is a rate, not a
// balance. Purchased credits are the separate non-expiring balance, spent only once the renewable
// allowance for the period is gone. Keeping them apart is what makes "your plan includes this, buy
// more if you need it" expressible without either one quietly subsidising the other.

export const PLAN_LIMITS = {
  // SET AGAINST WHAT THE SERVICE CAN ACTUALLY SERVE, not against what the prices could afford.
  //
  // The binding number is DAILY_NEURON_CEILING: 25,000 neurons a day is 833 Sparks a day, which is
  // about 11 quality-gated builds a day for EVERY user combined. Three of the four old rows were
  // promises against that: team granted 1,500/day and enterprise 6,000/day, so a single customer
  // on either could exhaust the day for everyone, and free granted 60/day against a 77-Spark
  // build, so the trial could not finish one job. Those are not pricing mistakes, they are
  // arithmetic that was never done.
  //
  // Every row below is now under the ceiling, and free clears one build with room. The monthly
  // figure never exceeds what the daily figure can reach in a month, or it is an allowance nobody
  // can spend. What these numbers are NOT is what the $12 and $40 price points could support —
  // $12 at a 1.4x margin would buy 25,974 Sparks a month, and the whole service only makes 25,323.
  // Closing that gap is a spending decision, not a code change: see docs/DECISIONS.md.
  free: { sparksPerDay: 231, sparksPerMonth: 2_310 },
  builder: { sparksPerDay: 416, sparksPerMonth: 12_600 },
  studio: { sparksPerDay: 700, sparksPerMonth: 21_000 },
  enterprise: { sparksPerDay: 833, sparksPerMonth: 25_000 },
} as const;

export type PlanId = keyof typeof PLAN_LIMITS;

export const PLAN_IDS = Object.keys(PLAN_LIMITS) as PlanId[];

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === 'string' && (PLAN_IDS as string[]).includes(v);
}

export interface PlanCopy {
  id: PlanId;
  name: string;
  /** One line: who the plan is for, not what it costs. */
  blurb: string;
  /**
   * Monthly price in USD, or null for a plan that is not self-serve.
   *
   * THESE ARE THE OWNER'S NUMBERS TO SET. They are seeded from the measured unit economics rather
   * than invented: a quality-gated build is ~2,300 neurons (docs/COST-MODEL.md) at $0.011/1,000
   * neurons, so Pro's 6,000 Sparks/month is ~$1.98 of inference and Team's 30,000 is ~$9.90.
   * Enterprise is deliberately null — a plan whose limits are negotiated cannot carry a price tag.
   */
  priceUsdMonthly: number | null;
  /** What this tier adds over the one below it. The bullets a person actually compares. */
  highlights: string[];
}

export const PLAN_COPY: Record<PlanId, PlanCopy> = {
  free: {
    id: 'free',
    name: 'Free',
    blurb: 'Enough to build something real and see whether Apple suits you.',
    priceUsdMonthly: 0,
    highlights: ['Every build mode', 'Studio plugin', 'Checkpoints and restore'],
  },
  builder: {
    id: 'builder',
    name: 'Builder',
    blurb: 'For building most days.',
    priceUsdMonthly: 12,
    highlights: ['About 5× the Free allowance', 'Buy credits when you need more', 'Priority during busy periods'],
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    blurb: 'For a few people building together on the same places.',
    priceUsdMonthly: 40,
    highlights: ['About 9× the Free allowance', 'Shared projects', 'Everything in Builder'],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    blurb: 'For studios with their own limits, terms and support needs.',
    priceUsdMonthly: null,
    highlights: ['Negotiated limits', 'Invoicing', 'Direct support'],
  },
};

/** Sparks in one quality-gated build, from the measured neuron cost. */
export const SPARKS_PER_BUILD = 77;

/**
 * A plan's allowance in the unit people actually think in.
 *
 * "6,000 Sparks" means nothing on first read; "about 78 builds a month" does. Floored, because a
 * rounded-up figure is a promise the allowance cannot keep.
 */
export function buildsPerMonth(plan: PlanId): number {
  return Math.floor(PLAN_LIMITS[plan].sparksPerMonth / SPARKS_PER_BUILD);
}

export function buildsPerDay(plan: PlanId): number {
  return Math.floor(PLAN_LIMITS[plan].sparksPerDay / SPARKS_PER_BUILD);
}
