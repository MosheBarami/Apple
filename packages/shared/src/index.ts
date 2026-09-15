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
  /**
   * Every script's path, class AND source in one round trip.
   *
   * `list_scripts` + N × `read_script` returns the same bytes, but a place-wide analysis — the
   * require graph, a scope-correct symbol index, which LocalScript sits in a server container —
   * needs every source at once, and doing that one op at a time is N Studio round trips for one
   * answer. `maxChars` is a BUDGET over the whole dump, not a per-file cap: the plugin stops
   * adding files when it is spent and says so, rather than silently returning half a place.
   */
  | { op: 'dump_scripts'; root?: string; maxScripts?: number; maxChars?: number }
  | {
      op: 'edit_script';
      path: string;
      // exactly one of:
      source?: string; // full replace
      edits?: { find: string; replace: string; all?: boolean }[];
      create?: { className: 'Script' | 'LocalScript' | 'ModuleScript'; parent: string };
      /**
       * FNV-1a/32 hex of the source this edit was computed against, checked INSIDE the write
       * transaction. A Studio-side edit between the read and the write changes the hash, and the
       * write is refused instead of destroying it. Absent means "no base was observed", which is
       * only true when creating.
       */
      baseHash?: string;
    }
  | { op: 'search_scripts'; query: string; root?: string; maxResults?: number }
  | { op: 'create_instances'; items: InstanceSpec[] }
  | { op: 'set_props'; path: string; props?: Record<string, PropValue>; attributes?: Record<string, PropValue> }
  | { op: 'delete_instances'; paths: string[] }
  | { op: 'move_instances'; moves: { path: string; newParent: string }[] }
  | { op: 'run_code'; code: string; timeoutMs?: number } // plugin-context Luau via ModuleScript require
  | { op: 'get_logs'; sinceClock?: number; maxEntries?: number }
  /**
   * The Studio test controls, which are exactly `RunService:Run()`, `:Pause()` and `:Stop()`.
   * That is the whole simulation surface a plugin has: there is no plugin API for Play Solo,
   * for Run Client, or for starting extra clients, so this union does not pretend to offer them.
   * `start` is a kept alias for `run` — the playtest tool has sent it since before the companion
   * panel existed. An unknown action is REFUSED by the plugin, never silently treated as stop.
   */
  | { op: 'run_mode'; action: 'start' | 'run' | 'pause' | 'resume' | 'stop' | 'restart' }
  // Companion direct manipulation: what a person clicks in the panel, with no model in the loop.
  // `move` is a stud offset, `rotate` is degrees about the target's own centre, `scale` is a
  // positive multiplier. Non-finite and out-of-range values are refused rather than clamped.
  | { op: 'transform_instances'; paths: string[]; move?: [number, number, number]; rotate?: [number, number, number]; scale?: number }
  | { op: 'clone_instances'; paths: string[]; parent?: string }
  | { op: 'group_instances'; paths: string[]; name?: string }
  | { op: 'ungroup_instances'; paths: string[] }
  | { op: 'rename_instance'; path: string; name: string }
  | { op: 'set_locked'; paths: string[]; locked: boolean }
  | { op: 'set_visible'; paths: string[]; visible: boolean }
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

/**
 * WHY A FAILED OP CARRIES A KIND AND NOT ONLY A SENTENCE.
 *
 * `error` is English written for a human. It has been the ONLY thing distinguishing a path that
 * no longer exists from a plugin that never had the op from a request that timed out in flight —
 * so anything deciding whether to try again had to pattern-match prose, which changes whenever
 * somebody improves the wording. That is the same defect as asserting on a variable name.
 *
 * The kinds are chosen so that retry eligibility follows from the kind ALONE (see the worker's
 * op-failure.ts), and so that a kind this build has never heard of is treated as not-retryable
 * rather than guessed at.
 *
 *   not_found  the thing addressed is not there (a path, an instance, an asset)
 *   conflict   the place is not in the state the op required
 *   refused    the plugin declined on purpose (unknown op, a guard, a policy)
 *   invalid    the arguments could not be accepted
 *   timeout    nobody answered in time; whether it ran is UNKNOWN
 *   transport  it never reached Studio (not connected, run ended, queue dropped)
 *   internal   it broke in a way nothing above describes
 */
export type OpFailureKind = 'not_found' | 'conflict' | 'refused' | 'invalid' | 'timeout' | 'transport' | 'internal';

export interface OpResult {
  id: string;
  ok: boolean;
  // JSON payload; large payloads (snapshots, trees) may be chunked via resultChunk
  data?: unknown;
  error?: string;
  durationMs?: number;
  /**
   * What KIND of failure this was, when the side that produced it knows. Absent on success, and
   * absent on a failure from a plugin build that predates the field — which reads as "unknown",
   * never as "retryable".
   */
  failure?: OpFailureKind;
}

/**
 * THE PLACE A PROJECT IS BOUND TO.
 *
 * A Studio session is a plugin-wide setting, not a per-place one: opening a different place in the
 * same Studio keeps the session. Without a recorded place, this project's ops execute in whatever
 * the user happens to have open. So the place identity is captured at pairing and compared on every
 * poll — see the worker's studio-place.ts for the admission rules and for why an UNIDENTIFIABLE
 * place is never a mismatch.
 *
 * `placeId` is 0 for a place that has never been saved to Roblox, and `gameId` is 0 with it. Both
 * zero means "we cannot tell", which is a different answer from "a different place".
 */
export interface StudioPlace {
  placeId: number;
  gameId: number;
  placeName: string;
  /** When this binding was recorded. */
  boundAt: number;
}

/**
 * The state of a project's link to Studio, as the owner may see it.
 *
 * `paired` and `connected` are two facts and not one: a project keeps its pairing across a Studio
 * restart, a laptop lid, and a flight. Collapsing them would report "not paired" for a plugin that
 * is simply not polling this second, and send the user to mint a code they do not need.
 */
export interface StudioLinkSummary {
  paired: boolean;
  connected: boolean;
  /** When the plugin last polled, or null if it never has. */
  lastSeenAt: number | null;
  queuedOps: number;
  pluginVersion: string | null;
  pluginProtocol: number | null;
  place: StudioPlace | null;
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
/** One instance in the Studio selection, as the companion mirrors it. */
export interface SelectionItem {
  path: string;
  class: string;
}
/**
 * WHAT IS SELECTED IN STUDIO RIGHT NOW.
 *
 * Pushed by the plugin when `Selection.SelectionChanged` fires, not polled, so the web app sees
 * the user's own click rather than a snapshot taken up to a poll interval later.
 *
 * `count` and `items` are two numbers ON PURPOSE. A Studio user can select ten thousand parts
 * with one drag; `items` is capped at what a poll body can carry, `count` is how many were
 * actually selected, and `truncated` says which of the two the reader is looking at. Rendering
 * `items.length` as "N selected" when the cap bit would report a failure to observe as an
 * observation.
 */
export interface StudioEventSelection {
  kind: 'selection';
  items: SelectionItem[];
  count: number;
  truncated: boolean;
  clock: number;
}
export type StudioEvent = StudioEventLog | StudioEventState | StudioEventSelection;

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
  /**
   * Set only when the poll was refused because the open place is not the one this project is
   * bound to. The plugin shows `message` and keeps polling — the user may simply switch back —
   * and NO ops are served while this is present.
   */
  placeMismatch?: { expected: StudioPlace; openPlaceId: number; openPlaceName: string; message: string };
}

// ---------------------------------------------------------------------------
// Agent + chat protocol (web <-> DO over WebSocket)
// ---------------------------------------------------------------------------

export type GolemMode = 'clay' | 'stone' | 'rune';

/**
 * THE LONGEST MESSAGE A USER CAN SEND, AND THE ONE PLACE IT IS WRITTEN DOWN.
 *
 * The server has always enforced this — `text.slice(0, 8000)` at every chat ingress in
 * do/session.ts — and the browser has always stored drafts against the same number in
 * lib/draft.ts. Neither told the user. Silently truncating the end of a long prompt is the
 * worst of the three possible behaviours: the request is accepted, the answer is to a
 * question that was cut in half, and nothing anywhere says which half ran.
 *
 * So the number lives here, imported by the composer that displays the remaining characters,
 * by the draft store that caps what it persists, and by the session that enforces it. A
 * counter reading from a second copy of the figure would eventually disagree with the server,
 * and a limit the UI states wrongly is worse than one it does not state at all.
 */
export const MESSAGE_MAX_CHARS = 8000;

/**
 * When the composer starts showing the counter: the last tenth of the budget.
 *
 * Drawn earlier it is noise on every message; drawn only at the limit it arrives after the
 * sentence that will not fit has already been typed.
 */
export const MESSAGE_WARN_CHARS = MESSAGE_MAX_CHARS - 800;

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
  /**
   * "I am still here, and this is what I am doing."
   *
   * Sent alongside the keepalive so the other people in a shared project see `typing` before the
   * message arrives rather than after. The server never takes the client's word for WHO is
   * sending this — identity comes from the socket — only for what they are up to.
   */
  | { type: 'presence'; activity: 'viewing' | 'typing' | 'building' }
  /**
   * The keepalive, and the only round trip the browser can time.
   *
   * `t` is the CLIENT's own clock at send, echoed back untouched by `pong`. It is never compared
   * with a server timestamp — the two clocks are unrelated and the difference between them is not
   * latency — so the whole measurement happens in one clock domain, which is the only way it means
   * anything. Optional, because a tab from an older build sends none and must still be ponged.
   */
  | { type: 'ping'; t?: number };

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
    // Static review and symbol lookup: both parse the project's own scripts and write nothing.
    // `inspecting` rather than `writing_luau` — the agent is reading code, and announcing that it
    // is writing Luau while it reviews would be the same wrong claim the default makes.
    case 'review_scripts':
    case 'find_symbol':
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
    // The web-facing tools. Every one of these READS something outside the place — a page, a
    // search, a repository, an image, the project's own scratch files — and changes nothing in
    // the user's game. `inspecting` is the honest phase for all of them; the `default` they would
    // otherwise land on announces "Building world", which is a claim about the user's project
    // that none of these tools has any right to make.
    case 'web_fetch':
    case 'browse_page':
    case 'web_search':
    case 'github_lookup':
    case 'git_history':
    case 'ocr_image':
    case 'workspace_list':
    case 'workspace_read':
    // Capturing a page is looking at it. NOT `rendering`, which in this product means the plugin
    // is rasterising the Roblox scene — a different machine doing a different thing.
    case 'screenshot_page':
      return 'inspecting';
    // Announcing the plan is not doing the work. This tool runs before anything in the project
    // moves, so the one phase it must never fall through to is the `default` below — 'building'
    // would have the workspace claim the place is being changed at the exact moment it is not.
    case 'propose_plan':
      return 'planning';
    // Writing a file into Golem's own store, which is what `remembering` already covers: it is
    // the phase for durable state that belongs to Golem rather than to the place. `building`
    // would say the agent changed the game, and it did not touch it.
    case 'workspace_write':
      return 'remembering';
    case 'edit_script':
    // Re-indenting a script is still a write into a Luau file, and the user sees the same
    // ChangeHistory entry for it as for any other edit.
    case 'format_script':
      return 'writing_luau';
    case 'create_instances':
    case 'set_properties':
    case 'delete_instances':
    case 'insert_asset':
    case 'generate_model':
    case 'generate_image':
    // generate_sound and speak_line, beside generate_image and for the same reason and with the
    // same imprecision, named here rather than left to be discovered: all three PRODUCE an asset
    // and none of them puts it in the place, so "building" overstates what the user's project just
    // received. It is nevertheless the phase this union offers for making something, and the three
    // are treated alike rather than one of them being quietly special. A `generating` phase would
    // be the honest fix; it is a change to AgentPhase and to two exhaustive `Record<AgentPhase, …>`
    // tables in the web app, which is a different cluster's surface — so it is written down here
    // instead of half-done.
    case 'generate_sound':
    case 'speak_line':
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
    // The two audio tools that change the place. Neither creates geometry — `design_sound` sets
    // SoundService's reverb and the SoundGroup mixer, `assign_sounds` routes Sounds that already
    // exist onto those groups — but both write to the user's place, which is what `building`
    // claims and is therefore the only phase they may honestly announce.
    case 'design_sound':
    case 'assign_sounds':
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
   * "warm interior lighting". It is the honest content of a "Plan" row: not a
   * predicted sequence of steps, but the set of things the user asked for by
   * name, extracted from their own words at zero model cost.
   *
   * THIS LIST IS DISPLAYED. IT IS NOT VERIFIED. This comment used to assert
   * the opposite, and nothing backed it: grep the worker and the checklist is
   * built (semantic.ts), trimmed (run-intent.ts) and broadcast
   * (do/session.ts), and never read back after the run. The only
   * post-build check in the loop is `semanticCheck`, which measures geometry
   * and never looks at this list. It is not even handed to the model.
   *
   * Corrected rather than left, because a comment describing a verification
   * that does not happen is the same failure as a UI string describing one —
   * it just misleads the next engineer instead of the user.
   * `apps/worker/tests/intent-checklist-claim.test.mjs` holds the sentence to
   * the code: implement a consumer that reads the checklist back, and the
   * guard lets the stronger claim return.
   */
  checklist: string[];
  /** Where the request genuinely did not say. Surfaced rather than assumed. */
  questions: string[];
  /**
   * Where the request did not say and Apple DECIDED ANYWAY — a mood read off "cozy", a focal
   * point nobody named outright.
   *
   * The opposite of `questions`, and kept apart from it for that reason: a question is still
   * open, an assumption has already been acted on and is steering the build right now. A product
   * that shows only the questions is reporting the choices it declined to make and hiding the
   * ones it made.
   *
   * Optional on the wire because a client can be replaying a `run_intent` frame recorded by an
   * older worker, and an absent list is not an empty one.
   */
  assumptions?: string[];
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
  | {
      type: 'hello';
      sessionId: string;
      studioConnected: boolean;
      quota: QuotaState;
      /**
       * When the plugin last polled, in server time, or null if it never has.
       *
       * A boolean alone cannot answer "is it coming back?" — "not connected" reads identically
       * for a Studio that closed ten seconds ago and one that closed in March.
       */
      studioLastSeenAt?: number | null;
      /** How many ops are waiting for the plugin to collect them. */
      queuedOps?: number;
      /** The place this project is bound to, or null while nothing has been observed. */
      studioPlace?: StudioPlace | null;
    }
  /**
   * The conversation was rewound to just before `fromMessageId`.
   *
   * Broadcast to EVERY client, not just the one that asked: a second tab showing messages the
   * server has deleted will keep showing them forever, and the user cannot tell that stale view
   * apart from a live one.
   */
  | { type: 'history_truncated'; fromMessageId: string; removed: number }
  | {
      type: 'studio_status';
      connected: boolean;
      state?: StudioEventState;
      /** As on `hello`: when the plugin last polled, so a disconnection can be dated. */
      lastSeenAt?: number | null;
      queuedOps?: number;
      place?: StudioPlace | null;
      /**
       * Present while the paired Studio has a DIFFERENT place open. The link is alive and the
       * plugin is polling; it is simply being served nothing, and the user is the only one who
       * can resolve it — by reopening the bound place or by rebinding the project to this one.
       */
      placeMismatch?: { expectedPlaceName: string; openPlaceName: string; openPlaceId: number } | null;
    }
  /**
   * The Studio selection changed. Broadcast only when it ACTUALLY changed — the plugin drops a
   * repeat of the selection it last reported, so this is an event rather than a heartbeat.
   */
  | { type: 'studio_selection'; selection: StudioEventSelection }
  | { type: 'msg_start'; msgId: string; role: 'assistant'; mode: GolemMode }
  | { type: 'delta'; msgId: string; text: string }
  //[[ `target` is WHICH THING this step is about — the script path, the instance paths, the URL —
  //   read from the call's arguments BEFORE it runs. `summary` at this point is only the tool's
  //   name; the sentence that names the resource used to arrive with `tool_end`, after the write.
  //   Optional because a tool with no resource worth naming gets none: a guessed target is worse
  //   than a missing one, since this is what a person reads to tell whether the step about to run
  //   is the one they meant. ]]
  | { type: 'tool_start'; msgId: string; toolId: string; tool: string; summary: string; target?: string }
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
       * `agent_status.creditsSpent` is a running total broadcast at the TOP of each step, and each
       * step settles its real neuron cost AFTER that broadcast
       * (`creditsForNeurons(agent.neuronsUsed) - agent.creditsSpent`). So the last figure the user
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
      creditsSpent?: number;
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
       * user could actually act on — "this run has spent 6 Credits and is on step 9 of 16" — was
       * the one they could not see.
       */
      creditsSpent?: number;
    }
  /**
   * WHAT THIS STEP'S PROMPT COSTS, AND WHAT WAS DROPPED TO MAKE IT FIT.
   *
   * `MAX_PROMPT_CHARS` was a private constant in do/session.ts and `transcriptChars` was never
   * reported over the wire, so the one number that explains why a long conversation starts
   * behaving differently was invisible to the person having it. Worse, `trimTranscript` drops
   * whole turn groups from the oldest end SILENTLY: the user asks a follow-up about something
   * still visible on their screen, the agent has no record of it, and the only symptom is an
   * answer that reads as forgetfulness. Nothing distinguishes that from a bad model.
   *
   * Emitted once per step, after the trim, so `usedChars` is the size of the prompt that is
   * actually about to be sent — not an estimate and not the pre-trim figure.
   *
   * `dropped` is present ONLY on a step that actually removed turns. An absent field means
   * nothing was dropped; a `{ groups: 0 }` would make "nothing was trimmed" and "we did not
   * check" the same message, which is the distinction the whole record exists to keep.
   */
  | {
      type: 'context_budget';
      msgId: string;
      usedChars: number;
      maxChars: number;
      dropped?: { groups: number; chars: number };
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
  /**
   * WHO ELSE IS IN THIS PROJECT RIGHT NOW.
   *
   * Sent on connect, on every heartbeat and when a socket closes. `role` rides along because the
   * UI has to say WHAT someone is — a viewer watching a build and an editor about to change it
   * are the same avatar otherwise — and the worker only ever sends a role from its own allowlist.
   * `connections` is how many tabs one person has open, so two tabs read as one person.
   */
  | {
      type: 'presence';
      present: {
        userId: string;
        role: 'viewer' | 'commenter' | 'editor' | 'admin' | 'owner';
        displayName: string | null;
        activity: 'viewing' | 'typing' | 'building';
        connections: number;
        lastSeenMs: number;
      }[];
    }
  /** Echoes the client's own `t` from `ping`, so the browser can compute a round trip. */
  | { type: 'pong'; t?: number };

export interface QuotaState {
  creditsRemaining: number;
  creditsDaily: number;
  creditsMonthly: number;
  creditsUsedToday: number;
  creditsUsedThisMonth: number;
  resetsAtIso: string;
  plan: 'free' | 'builder' | 'studio' | 'enterprise';
  /**
   * The renewable part of `creditsRemaining`, reported separately because "you have 0 left today"
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
  /**
   * What this project is ALREADY linked to, at the moment the code was minted, or null.
   *
   * A second pairing supersedes the first: the session holds one plugin token, and the Studio that
   * loses it finds out on its next poll. That is a fine mechanism and a terrible surprise, so the
   * dialog says it up front rather than letting the user discover it by watching another window
   * go grey. Null means nothing is paired and there is nothing to warn about.
   */
  existingLink?: StudioLinkSummary | null;
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
 * Credits are billed from the neurons a run actually consumes (1 Credit = 90 neurons), so these
 * are *typical measured* costs shown in the UI, not fixed prices. Measured 2026-08-30:
 * Clay ~29 neurons, Stone answer-only ~139, Stone full build+verify in Studio ~1,266.
 */
/**
 * `creditsPerRequest` is GONE, deliberately.
 *
 * It used to be the upfront charge — `quotaSpend(owner, MODE_INFO[mode].creditsPerRequest)`
 * — and the site's published "Clay 1 · Stone 4 · Rune 10" came from exactly those
 * numbers. The charging model then changed: session.ts now takes ONE credit upfront
 * whatever the mode, and settles the difference from measured neurons
 * (`creditsForNeurons(agent.neuronsUsed) - agent.creditsSpent`). Nothing has read
 * `creditsPerRequest` since, while the comment below PRODUCT_MODE_INFO still called it
 * "the balance a client must hold before it may send" and told the reader to "change a
 * price in MODE_INFO or nowhere". Someone following that instruction would have changed
 * a number that charges nobody.
 *
 * `typicalCredits` is different: the composer renders it, as "Typically N Credits". It is
 * derived from docs/COST-MODEL.md through `ceil(neurons / 30)`, the same arithmetic the
 * worker bills with, and `scripts/check-credit-figures.mjs` checks it against those
 * measurements.
 */
export const MODE_INFO: Record<GolemMode, { name: string; blurb: string; typicalCredits: string }> = {
  clay: { name: 'Clay', blurb: 'Fast answers and small edits', typicalCredits: '2' },
  stone: { name: 'Stone', blurb: 'Builds features across your project', typicalCredits: '4-18' },
  rune: { name: 'Rune', blurb: 'Plans, builds, tests and fixes autonomously', typicalCredits: '10-30' },
};

/**
 * WHAT A PIECE OF WORK COSTS, WHEN IT TAKES MORE THAN ONE RUN.
 *
 * `typicalCredits` above is per RUN. A roadmap milestone is sized in runs — "about two Agent
 * runs" — so the card said how much work it was in a unit nobody is billed in, while the number
 * that would answer "what will this cost me" sat two clicks away in the composer, unmultiplied.
 *
 * The multiplication is the whole value. With `runs` varying across the catalogue, a two-run
 * Super Agent milestone is 20-60 Credits where the mode's own line reads 10-30; reprinting the
 * mode range on the card would have understated half the catalogue by a factor of two.
 *
 * It PARSES `typicalCredits` rather than keeping its own table, so there is exactly one place a
 * price is written down. A second copy of a price is a second copy free to drift, which is the
 * defect scripts/check-credit-figures.mjs exists because of — that number had drifted in three
 * places inside one component.
 *
 * Returns a RANGE even when the published figure is a single number ("2" -> 2-2). It never
 * collapses a spread to one number: the measurements behind docs/COST-MODEL.md do not support
 * that precision, and a single figure would read as a quote.
 *
 * `null` for a run count that is not a positive whole number — an unreadable input produces no
 * figure rather than a wrong one, because a wrong price is worse than a missing one.
 */
export function creditRangeForRuns(mode: GolemMode, runs: number): { low: number; high: number } | null {
  if (!Number.isInteger(runs) || runs < 1) return null;
  const published = MODE_INFO[mode]?.typicalCredits;
  if (!published) return null;
  const parts = published.split('-').map((p) => Number(p.trim()));
  if (parts.length < 1 || parts.length > 2 || parts.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  const low = parts[0]!;
  const high = parts.length === 2 ? parts[1]! : low;
  if (high < low) return null;
  return { low: low * runs, high: high * runs };
}

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
// Credits ledger still accounts against it — so sessions written before this
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
 * The Credit figure is NOT restated here — it is read out of MODE_INFO through the
 * mapping above, so a product-mode number cannot drift from its specialist's. What it
 * is has changed: it is `typicalCredits`, a range measured in docs/COST-MODEL.md, and
 * not a price the client enforces. The worker takes one credit upfront whatever the mode
 * and settles the rest from the neurons actually used.
 */
export const PRODUCT_MODE_INFO: Record<
  ProductMode,
  { name: string; blurb: string; typicalCredits: string }
> = {
  plan: {
    name: 'Plan',
    blurb: 'Inspects your project and designs the work. Proposes; does not change anything.',
    typicalCredits: MODE_INFO[PRODUCT_MODE_TO_SPECIALIST.plan].typicalCredits,
  },
  agent: {
    name: 'Agent',
    blurb: 'Builds, tests and repairs. The normal way to work.',
    typicalCredits: MODE_INFO[PRODUCT_MODE_TO_SPECIALIST.agent].typicalCredits,
  },
  super: {
    name: 'Super Agent',
    blurb:
      'Long-horizon autonomous creation. Decomposes, builds, playtests, critiques and iterates through many stages without asking routine questions.',
    typicalCredits: MODE_INFO[PRODUCT_MODE_TO_SPECIALIST.super].typicalCredits,
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
// Credits are the RENEWABLE allowance: they reset and do not accumulate, so a plan is a rate, not a
// balance. Purchased credits are the separate non-expiring balance, spent only once the renewable
// allowance for the period is gone. Keeping them apart is what makes "your plan includes this, buy
// more if you need it" expressible without either one quietly subsidising the other.

export const PLAN_LIMITS = {
  // SET AGAINST WHAT THE SERVICE CAN ACTUALLY SERVE, not against what the prices could afford.
  //
  // The binding number is DAILY_NEURON_CEILING: 25,000 neurons a day is 833 Credits a day, which is
  // about 11 quality-gated builds a day for EVERY user combined. Three of the four old rows were
  // promises against that: team granted 1,500/day and enterprise 6,000/day, so a single customer
  // on either could exhaust the day for everyone, and free granted 60/day against a 77-Credit
  // build, so the trial could not finish one job. Those are not pricing mistakes, they are
  // arithmetic that was never done.
  //
  // Every row below is now under the ceiling, and free clears one build with room. The monthly
  // figure never exceeds what the daily figure can reach in a month, or it is an allowance nobody
  // can spend. What these numbers are NOT is what the $12 and $40 price points could support —
  // $12 at a 1.4x margin would buy 25,974 Credits a month, and the whole service only makes 25,323.
  // Closing that gap is a spending decision, not a code change: see docs/DECISIONS.md.
  free: { creditsPerDay: 231, creditsPerMonth: 2_310 },
  builder: { creditsPerDay: 416, creditsPerMonth: 12_600 },
  studio: { creditsPerDay: 700, creditsPerMonth: 21_000 },
  enterprise: { creditsPerDay: 833, creditsPerMonth: 25_000 },
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
   * neurons, so Pro's 6,000 Credits/month is ~$1.98 of inference and Team's 30,000 is ~$9.90.
   * Enterprise is deliberately null — a plan whose limits are negotiated cannot carry a price tag.
   */
  priceUsdMonthly: number | null;
  /** What this tier adds over the one below it. The bullets a person actually compares. */
  highlights: string[];
}

/**
 * The currency every price in `PLAN_COPY` is quoted in, as an ISO 4217 code.
 *
 * It is a code and not a symbol on purpose. '$' is not a currency — it reads as the local dollar in
 * en-CA and en-AU — and the figure a customer is actually charged is decided by the Stripe price
 * object, so the two have to be able to name the same thing. `/api/billing/config` reports this so
 * a page never has to guess what it is quoting.
 */
export const PRICE_CURRENCY = 'USD';

/**
 * A price, formatted for a reader rather than concatenated.
 *
 * Every price in this product used to be a literal '$' glued to a raw number, in three files. The
 * symbol's POSITION is a property of the locale — German puts it after the amount — and this app
 * renders right-to-left, where a bare symbol beside a number is a direction-neutral run the bidi
 * algorithm may reorder. Intl emits what the locale specifies, including the number of minor units
 * the currency actually has.
 *
 * Whole amounts drop the minor units: '$12.00/month' on a pricing page is precision that means
 * nothing. An amount that is not a finite number returns the EMPTY STRING rather than '$NaN' —
 * printing NaN beside a buy button is worse than printing nothing — and a currency code Intl
 * rejects falls back to the declared one rather than throwing a price cell off the page.
 */
export function formatMoney(
  amount: number,
  opts: { currency?: string; locale?: string } = {},
): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '';
  const currency = opts.currency ?? PRICE_CURRENCY;
  const fractionless = Number.isInteger(amount) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {};
  try {
    return new Intl.NumberFormat(opts.locale, { style: 'currency', currency, ...fractionless }).format(amount);
  } catch {
    // A malformed or unknown code. The amount still has to reach the page.
    return new Intl.NumberFormat(opts.locale, { style: 'currency', currency: PRICE_CURRENCY, ...fractionless }).format(amount);
  }
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

/** Credits in one quality-gated build, from the measured neuron cost. */
export const CREDITS_PER_BUILD = 77;

/**
 * A plan's allowance in the unit people actually think in.
 *
 * "6,000 Credits" means nothing on first read; "about 78 builds a month" does. Floored, because a
 * rounded-up figure is a promise the allowance cannot keep.
 */
export function buildsPerMonth(plan: PlanId): number {
  return Math.floor(PLAN_LIMITS[plan].creditsPerMonth / CREDITS_PER_BUILD);
}

export function buildsPerDay(plan: PlanId): number {
  return Math.floor(PLAN_LIMITS[plan].creditsPerDay / CREDITS_PER_BUILD);
}

// PLACED AFTER `CREDITS_PER_BUILD` AND `buildsPerMonth` ON PURPOSE. The table below is built at
// module-evaluation time and calls `buildsPerMonth`, which reads the `const CREDITS_PER_BUILD`.
// Declared above them, that read happens inside the temporal dead zone and the whole module
// throws `Cannot access 'CREDITS_PER_BUILD' before initialization` on import — every page in
// three apps, blank. `tsc --noEmit` does NOT catch it; importing the module does.
/**
 * The plan comparison, as a matrix rather than as four lists of bullets.
 *
 * WHY THIS EXISTS. `highlights` above is what each tier ADDS over the one below it, which is the
 * right shape for a card and the wrong shape for a decision. Four cards of three bullets cannot
 * answer "does Free include checkpoints?", because a capability that is absent from a list is
 * indistinguishable from one nobody bothered to mention — and a reader who assumes the worst is
 * reading a pricing page that is, for them, wrong. A matrix answers it for every pair: every plan
 * has a cell for every capability, and a `false` is printed as plainly as a `true`.
 *
 * WHAT MAY GO IN IT. Only what the product actually does. Every boolean here was checked against
 * the code that would enforce it, and the result is worth stating plainly because it is not what a
 * pricing page usually says: apart from the allowance and the commercial terms, NOTHING is gated by
 * plan. `apps/worker/src` conditions on the plan in exactly two places — `quota-math.ts`, which
 * reads the allowance, and `billing.ts`, which refuses a self-serve checkout for a plan that has no
 * price. There is no gate on modes, on projects, on checkpoints, on the plugin, or on sharing. So
 * those rows are `true` everywhere, and saying so out loud is more useful to a reader than
 * implying a restriction that does not exist.
 *
 * The consequence is the point: if someone later gates a capability, they must change this table,
 * and the pricing page follows. A feature matrix maintained beside the enforcement is a matrix that
 * can be wrong in only one place.
 */
export interface PlanFeature {
  /** Stable id, so a test can name a row without matching its prose. */
  id: string;
  label: string;
  /** One line of "what this means", shown under the label. Optional. */
  note?: string;
  /**
   * The value per plan. `true` / `false` are printed as included / not included; a string is
   * printed as it stands (an allowance, a price, "Negotiated").
   *
   * Required for EVERY plan, by the type. That is the whole mechanism behind "visibly absent": a
   * missing entry could render as an empty cell, which reads as "no" to a pessimist and as "not
   * applicable" to an optimist, and the two of them are looking at the same page.
   */
  values: Record<PlanId, boolean | string>;
}

/** Built from PLAN_LIMITS and PLAN_COPY so a number can never be typed twice. */
function everyPlan<T>(f: (plan: PlanId) => T): Record<PlanId, T> {
  return Object.fromEntries(PLAN_IDS.map((id) => [id, f(id)])) as Record<PlanId, T>;
}

export const PLAN_FEATURES: readonly PlanFeature[] = [
  {
    id: 'price',
    label: 'Price',
    values: everyPlan((p) =>
      PLAN_COPY[p].priceUsdMonthly === null
        ? 'Negotiated'
        : PLAN_COPY[p].priceUsdMonthly === 0
          ? 'Free forever'
          : `${formatMoney(PLAN_COPY[p].priceUsdMonthly ?? 0)} a month`,
    ),
  },
  {
    id: 'credits-per-day',
    label: 'Credits a day',
    note: 'The hard daily ceiling. It resets at midnight UTC for everyone.',
    values: everyPlan((p) => PLAN_LIMITS[p].creditsPerDay.toLocaleString('en-US')),
  },
  {
    id: 'credits-per-month',
    label: 'Credits a month',
    values: everyPlan((p) => PLAN_LIMITS[p].creditsPerMonth.toLocaleString('en-US')),
  },
  {
    id: 'builds-per-month',
    label: 'Quality-gated builds a month',
    note: 'The same allowance in the unit people think in.',
    values: everyPlan((p) => `About ${buildsPerMonth(p)}`),
  },
  {
    id: 'modes',
    label: 'All three build modes',
    note: 'Plan, Agent and Super Agent. Not one of them is held back for a paid tier.',
    values: everyPlan(() => true),
  },
  { id: 'projects', label: 'Unlimited projects', values: everyPlan(() => true) },
  { id: 'checkpoints', label: 'Checkpoints and rollback', values: everyPlan(() => true) },
  { id: 'plugin', label: 'Roblox Studio plugin', values: everyPlan(() => true) },
  {
    id: 'sharing',
    label: 'Shared projects and collaborators',
    values: everyPlan(() => true),
  },
  {
    id: 'credits',
    label: 'Buy extra credits',
    note: 'Purchased credits never expire and are spent only after the daily allowance.',
    values: everyPlan(() => true),
  },
  {
    id: 'self-serve',
    label: 'Sign up without talking to anyone',
    // The one genuine capability difference, and it is enforced: `buildCheckoutRequest` refuses a
    // plan with no price id.
    values: everyPlan((p) => PLAN_COPY[p].priceUsdMonthly !== null),
  },
  {
    id: 'invoicing',
    label: 'Invoicing and negotiated terms',
    values: everyPlan((p) => PLAN_COPY[p].priceUsdMonthly === null),
  },
];

// ---------------------------------------------------------------------------------------------
// Roblox Open Cloud scopes
// ---------------------------------------------------------------------------------------------

/**
 * The Open Cloud scopes a customer's own key can carry, as Roblox names them.
 *
 * SHARED because both ends need the same list and they need it to be the SAME list: the settings
 * panel offers the choices, the worker validates what comes back, and a vocabulary that existed in
 * two places would let the panel offer a scope the worker refuses — a control that cannot work,
 * discovered only by the person who ticked it.
 */
export const ROBLOX_SCOPES = [
  'asset:read',
  'asset:write',
  'universe-messaging-service:publish',
  'universe.place:write',
  'user.social:read',
  'creator-store-product:read',
] as const;
export type RobloxScope = (typeof ROBLOX_SCOPES)[number];

export function isRobloxScope(v: unknown): v is RobloxScope {
  return typeof v === 'string' && (ROBLOX_SCOPES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------------------------
// Where a build may take assets from
// ---------------------------------------------------------------------------------------------

/**
 * SHARED for the same reason the Roblox scopes are: the dialog offers these choices and the worker
 * validates what comes back, and a vocabulary in two places lets the dialog offer an option the
 * worker refuses — a control that cannot work, discovered by the person who ticked it.
 */
export const ASSET_SOURCE_CHOICES = ['apple_library', 'creator_store', 'from_scratch'] as const;
export type AssetSourceChoice = (typeof ASSET_SOURCE_CHOICES)[number];

/**
 * `ask` shows the dialog before a build. `remember` uses `allow` without asking.
 *
 * The default is `ask` with an EMPTY allow list, and the two together are deliberate: a person who
 * has never answered must be asked, and until they answer nothing is permitted. An empty list that
 * defaulted to "everything" would mean the dialog existed only to be dismissed.
 */
export interface AssetSourcePolicy {
  mode: 'ask' | 'remember';
  allow: AssetSourceChoice[];
}

export const ASSET_SOURCE_DEFAULT: AssetSourcePolicy = { mode: 'ask', allow: [] };

// ---------------------------------------------------------------------------------------------
// What Apple is ALLOWED TO DO
// ---------------------------------------------------------------------------------------------

/**
 * SHARED for the same reason the asset-source choices are, and with more at stake.
 *
 * The worker validates every tool permission against the real registry (preferences.ts:293), so a
 * settings panel offering a name the registry does not have would render a switch that is silently
 * refused on save — and the person who flicked it would go away believing they had denied
 * something. The vocabulary and the governed list therefore live here, where both halves read one
 * literal, and tool-permissions.test.mjs in apps/worker holds every name below to a real tool.
 */
export const TOOL_PERMISSIONS = ['allow', 'ask', 'deny'] as const;
export type ToolPermission = (typeof TOOL_PERMISSIONS)[number];

export const isToolPermission = (v: unknown): v is ToolPermission =>
  typeof v === 'string' && (TOOL_PERMISSIONS as readonly string[]).includes(v);

/**
 * How strict each answer is. THE ORDER OF THE LITERAL IS THE ORDER OF STRICTNESS — deriving the
 * rank from the array rather than writing a second table is what stops the browser and the worker
 * holding two different opinions about whether `ask` outranks `allow`.
 */
export const toolPermissionRank = (p: ToolPermission): number => TOOL_PERMISSIONS.indexOf(p);

export interface GovernedTool {
  name: string;
  /** What a person calls it. Never the tool name — "run_luau" is not a sentence. */
  label: string;
  /** What denying it actually stops. The consequence, not the category. */
  stops: string;
}

/**
 * The write tools a person may govern, in the order the panel lists them.
 *
 * NOT every tool in the registry. The read-only ones — read_script, get_project_tree, search_docs —
 * have nothing to deny, and a switch beside each of them would be forty controls of which twelve
 * matter, with the twelve being the ones nobody finds. Each entry says what denying it STOPS,
 * because "set_properties: deny" is a label and "Apple can no longer recolour, move or resize
 * anything already in your place" is a decision someone can actually make.
 */
export const GOVERNED_TOOLS: readonly GovernedTool[] = [
  { name: 'edit_script', label: 'Change existing scripts', stops: 'Apple can still read your code, but cannot rewrite a line of it.' },
  { name: 'format_script', label: 'Reformat scripts', stops: 'Apple cannot reindent or restyle a script you wrote.' },
  { name: 'create_instances', label: 'Add parts and objects', stops: 'Apple cannot put anything new into your place.' },
  { name: 'set_properties', label: 'Change parts that already exist', stops: 'Apple cannot recolour, move or resize anything already in your place.' },
  { name: 'delete_instances', label: 'Delete parts and objects', stops: 'Apple cannot remove anything from your place.' },
  { name: 'run_luau', label: 'Run code in your place', stops: 'Apple cannot execute a script against your open project.' },
  { name: 'run_and_check', label: 'Playtest the game', stops: 'Apple cannot start a playtest, so it can no longer check its own work by running it.' },
  { name: 'insert_asset', label: 'Insert assets from the Creator Store', stops: 'Apple cannot pull other creators’ models into your place.' },
  { name: 'install_module', label: 'Install Luau modules', stops: 'Apple cannot add third-party code to your project.' },
  { name: 'generate_model', label: 'Generate 3D models', stops: 'Apple cannot spend Credits building geometry from scratch.' },
  { name: 'generate_image', label: 'Generate images', stops: 'Apple cannot spend Credits making textures, decals or thumbnails.' },
  { name: 'workspace_write', label: 'Write files in the workspace', stops: 'Apple cannot write to the file workspace beside your project.' },
];

export const GOVERNED_TOOL_NAMES: readonly string[] = GOVERNED_TOOLS.map((t) => t.name);
