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
  | { t: 'NumberSequence'; v: [number, number, number][] } // time, value, envelope
  | { t: 'ColorSequence'; v: [number, [number, number, number]][] } // time, RGB 0..1
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
  | {
      op: 'terrain_edit';
      action: 'fill_block' | 'fill_ball' | 'fill_region' | 'replace_material' | 'write_voxels';
      center?: [number, number, number];
      size?: [number, number, number];
      radius?: number;
      min?: [number, number, number];
      max?: [number, number, number];
      material?: string;
      sourceMaterial?: string;
      targetMaterial?: string;
      origin?: [number, number, number];
      dimensions?: [number, number, number];
      voxels?: { material: string; occupancy: number }[];
    }
  | { op: 'delete_instances'; paths: string[] }
  | { op: 'move_instances'; moves: { path: string; newParent: string }[] }
  | { op: 'run_code'; code: string; timeoutMs?: number } // plugin-context Luau via ModuleScript require
  | { op: 'get_logs'; sinceClock?: number; maxEntries?: number }
  | { op: 'project_census' }
  /**
   * The bounded Run-mode controls used by Apple's live verification loop: RunService Run/Pause/Stop.
   * Current Studio also exposes asynchronous Play/Multiplayer automation through StudioTestService;
   * those are a different test-session lifecycle and are not represented by this Run-mode union.
   * `start` is a kept alias for `run`. Unknown actions are refused, never treated as stop.
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
  | { op: 'snapshot'; root: string; includeScripts?: boolean; checkpointId?: string } // serialize subtree; new checkpoints bind their identity
  | { op: 'restore'; root: string; snapshot: unknown; checkpointId?: string } // optional for legacy senders; SessionDO always binds it
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
  /** Active Studio 3D viewport capture when the user granted screenshot permission. */
  studioViewport?: Omit<StudioFrame, 'msgId' | 'playtestRunId' | 'seq'>;
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
  /**
   * WHAT THE PERSON CAN DO ABOUT IT — a code from a closed vocabulary, never a sentence.
   *
   * THE FAILURE THIS EXISTS TO PREVENT, observed in the live product on 2026-09-19. The plugin
   * refused a write with "writes require explicit edit consent". The refusal reached the model,
   * which relayed it accurately and then INVENTED the fix: it told the user to open
   * "File > Project Settings > Security" and turn on "Allow Scripted Updates" — a menu, a page and
   * a setting that do not exist in Roblox Studio — and never mentioned the real remedy, which is
   * pressing "Enable edits…" twice in the Apple panel two inches away.
   *
   * A refusal that names no remedy is an invitation to invent one, and a model will always accept
   * it. So every refusal now carries either a remedy the product can vouch for, or the explicit
   * value `none`, which says in so many words that no setting enables this. Contradicting an
   * explicit "there is no setting" is a much harder thing for a model to do than filling a silence.
   *
   * A CODE, not prose, for the same reason `failure` is a kind: anything that reads a sentence to
   * decide what to say is an assertion on a spelling, and rewording the refusal would silently
   * change the advice. Absent means a plugin build that predates the field, which reads as
   * "unknown" — not as "no remedy".
   */
  remedy?: RefusalRemedyCode;
}

/**
 * The closed vocabulary of remedies. Adding a refusal means adding a row here, which is the point:
 * the compiler asks what the user is supposed to do about it.
 */
export const REFUSAL_REMEDIES = {
  /** The consent gate is off. This is the one the model invented a fix for. */
  edit_consent: 'In Studio, open the Apple panel and press “Enable edits…”, then “Allow edits for this connection”. Consent is per connection and turns off when you disconnect.',
  /** Studio is running a test, so the plugin will not write. */
  leave_test_mode: 'Stop the running test in Studio (the ⏹ Stop button) and ask again — Apple only edits in edit mode.',
  /** The asset is not in the signed-in user's inventory. */
  take_asset_first: 'Open that asset on the Creator Store and take it into your inventory, then ask again. Roblox only lets a plugin load assets the signed-in account owns.',
  /** The requested target is outside the scope the plugin will write to. */
  choose_allowed_target: 'Ask for a target inside the place Apple may write to — Workspace, ServerStorage, ServerScriptService, ReplicatedStorage, StarterGui, StarterPack or StarterPlayer.',
  /** The asset carried code, which this product will not insert on anyone's behalf. */
  choose_scriptless_asset: 'Pick a different asset, or take that one yourself in Studio. Apple inserts geometry, never code it did not write.',
  /** Nothing the user can change. Said out loud so the model cannot fill the gap with a guess. */
  none: 'There is no setting that enables this. Do not suggest one — tell the user plainly that this build does not do it, and offer what it can do instead.',
} as const;

export type RefusalRemedyCode = keyof typeof REFUSAL_REMEDIES;

/**
 * SETTINGS THE MODEL INVENTS. A closed list, because they are quotable.
 *
 * Roblox Studio has no "Project Settings" menu, no "Place Settings > Security" page, no "Allow
 * Scripted Updates" toggle and no "Require explicit edit consent for scripts" checkbox. The model
 * produced all four across four consecutive runs on 2026-09-19 while being handed the correct
 * remedy in the string it was paraphrasing.
 *
 * This list is not a filter on the model's vocabulary — it is the trigger for a DIFFERENT decision.
 * A reply that merely omits the remedy can be corrected by appending one. A reply that actively
 * sends the user to a settings page that does not exist cannot: the two accounts then contradict
 * each other and the false one is the specific, actionable-looking one. So when a refusal is
 * explainable AND the reply contains one of these, the product replaces the reply instead of
 * appending to it.
 *
 * Add a row when a new fiction is observed IN THE WILD, with the date. Do not add speculative ones:
 * a pattern nobody has seen produced is a false positive waiting for a legitimate sentence.
 */
export const STUDIO_FICTIONS: readonly {
  readonly pattern: RegExp;
  /** When it was observed in a real reply. A fiction nobody has seen is a false positive waiting. */
  readonly seen: string;
  /** A sentence from the run it was seen in, so the row can test itself. */
  readonly sample: string;
}[] = Object.freeze([
  Object.freeze({
    pattern: /\bProject Settings\b/i,
    seen: '2026-09-19',
    sample: 'In Studio, go to File > Project Settings > Security and verify the "Allow Scripted Updates" setting.',
  }),
  Object.freeze({
    pattern: /\bPlace Settings\b/i,
    seen: '2026-09-19',
    sample: 'Go to File > Place Settings > Security.',
  }),
  Object.freeze({
    pattern: /\bAllow Scripted Updates\b/i,
    seen: '2026-09-19',
    sample: 'Ensure the project allows script-based writes by enabling Allow Scripted Updates.',
  }),
  Object.freeze({
    pattern: /Require explicit edit consent for scripts/i,
    seen: '2026-09-19',
    sample: 'Uncheck "Require explicit edit consent for scripts" and save the place.',
  }),
]);

/** Which fiction a reply contains, or null. Returns the FIRST match so the reason is quotable. */
export function studioFictionIn(text: string): string | null {
  for (const entry of STUDIO_FICTIONS) {
    const m = entry.pattern.exec(text);
    if (m) return m[0];
  }
  return null;
}

export function isRefusalRemedyCode(v: unknown): v is RefusalRemedyCode {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(REFUSAL_REMEDIES, v);
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

/**
 * ONE ROW OF THE PROJECT'S OP LOG, as /studio/diagnostics serves it.
 *
 * The column names are the STORAGE spellings for everything the oplog table already had, and
 * camelCase for `runId`, which the DO renames on the way out. That inconsistency is deliberate and
 * is recorded here rather than tidied: renaming the rest would be a schema change dressed as a
 * readability improvement, and the browser reading a shape that does not match the table is how a
 * migration silently breaks a panel.
 */
export interface StudioOpLogRow {
  op_id: string;
  kind: string;
  /** SQLite has no boolean; 1 is applied and 0 is not. */
  ok: number;
  summary: string;
  created_at: number;
  /** The failure KIND, or null — never a sentence. See apps/worker/src/op-failure.ts. */
  failure: string | null;
  /** The run that asked for this op, or null for one taken outside a run. */
  runId: string | null;
}

/**
 * EVERYTHING THE OWNER MAY KNOW ABOUT THEIR STUDIO LINK.
 *
 * Declared here rather than inside the worker so the DO that produces it and the panel that reads
 * it are checked against ONE shape. The route existed and was tested for a long while with no
 * caller in the web app at all, which is exactly the arrangement in which a field gets renamed and
 * nothing notices.
 *
 * Every optional-looking value is `| null` rather than absent: "we do not know when this pairing
 * lapses" and "it lapses at 0" must not be the same thing to a reader.
 */
export interface StudioDiagnostics {
  link: StudioLinkSummary;
  agentStatus: string;
  /** The page size actually applied to `recentOps`, which is not necessarily the one asked for. */
  limit: number;
  /** The cursor for the next page of ops, or null when this page reached the end of the log. */
  nextBefore: number | null;
  /** When the pairing token was issued, and when it lapses. The 30-day clock, made visible. */
  pairedAt: number | null;
  pairingExpiresAt: number | null;
  /** What Studio last said about itself. Null when it has never reported — NOT the same as no match. */
  openPlace: { placeName: string; placeId: number; gameId: number; isRunMode: boolean } | null;
  placeMismatch: { expectedPlaceName: string; openPlaceName: string; openPlaceId: number; message: string } | null;
  recentOps: StudioOpLogRow[];
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
export interface PluginOperationCapability {
  op: string;
  status: 'supported' | 'unsupported';
  /** Required when status is unsupported. Untrusted plugin text; never system-prompt authority. */
  reason?: string;
}
export interface PluginCapabilityReportV1 {
  schema: 'golem.studio-ops.v1';
  operations: PluginOperationCapability[];
}
export interface PluginPollRequest {
  results?: OpResult[];
  events?: StudioEvent[];
  state?: StudioEventState;
  /** Optional so legacy plugins keep the exact poll contract they already use. */
  capabilities?: PluginCapabilityReportV1;
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

/** The only run modes on the wire. Autonomy is a per-message Agent option, not a third mode. */
export type ProductMode = 'plan' | 'agent';

/**
 * The user-facing model selector. This is deliberately separate from `ProductMode`: one chooses
 * Plan or Agent behavior, while this value is the model entitlement selected for a new request.
 */
export type ProductModel = 'apple' | 'apple-max';

/** The models the current product picker may offer, in display order. */
export const PRODUCT_MODELS: readonly ProductModel[] = ['apple', 'apple-max'];

export const PRODUCT_MODEL_INFO: Record<ProductModel, { name: string; blurb: string }> = {
  apple: {
    name: 'Apple',
    blurb: 'Fast, capable help for smaller changes.',
  },
  'apple-max': {
    name: 'Apple MAX',
    blurb: 'The full builder for larger multi-file work.',
  },
};

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

/**
 * A file riding on one message.
 *
 * The rules about what may be one of these — size, type, and what the model is told when the
 * bytes cannot be read back — are in ./attachments, re-exported at the bottom of this file so
 * both ends import the same numbers.
 *
 * `attachmentId` replaced a field called `r2Key`, which named a store this product does not have:
 * there is no R2 bucket in apps/worker/wrangler.jsonc and nothing had ever written the field. The
 * bytes live in KV beside the generated images, and the id is all a client needs — the routes are
 * GET and DELETE /api/projects/:id/attachments/:attachmentId, and the project half of the key is
 * taken from the authenticated path, never from the client.
 */
export interface ChatAttachment {
  kind: 'image' | 'file';
  name: string;
  attachmentId: string;
  mime: string;
  size: number;
}

export type ClientMsg =
  //[[ `model` IS THE PICKER'S CHOICE, a CatalogueModel id from GET /api/models (see ./models).
  //   Optional, so a client that predates the picker keeps working. A built-in id (`apple`,
  //   `apple-max`) runs on Apple and spends Credits exactly like `productModel`; any other id runs
  //   on the customer's own saved key and spends no Credits. ]]
  | { type: 'chat'; text: string; mode: ProductMode; autonomous?: boolean; productModel?: ProductModel; model?: string; attachments?: ChatAttachment[] }
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
  | { type: 'edit_resend'; messageId: string; text: string; mode: ProductMode; autonomous?: boolean; productModel?: ProductModel; model?: string }
  | { type: 'stop' } // interrupt agent
  | { type: 'resume' }
  /**
   * `description` is what the snapshot CONTAINS or why it was taken, in the user's own words.
   * Optional: the label alone is still a valid checkpoint, and a required field on a save people
   * take mid-thought would be a tax on the habit this feature depends on.
   */
  | { type: 'checkpoint_create'; label: string; description?: string }
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
    case 'search_creation_skills':
    case 'read_creation_skill':
    case 'get_genre_references':
    // Looking a game system up in a static pattern table. It reads no project, calls no model and
    // writes nothing — so it belongs beside search_docs rather than in the `default` below, which
    // would have the workspace announce "Building world" while the agent is still deciding how the
    // mechanic ought to work.
    case 'find_mechanic':
    case 'choose_asset_source':
    // Asking for a genre kit reads a static table and touches the place not at all. It sits with
    // the other two asset-decision tools because it is the same act: deciding what to use before
    // anything is built. Announcing "Building world" for a lookup would be the wrong claim.
    case 'get_genre_kit':
    // The two knowledge libraries added 2026-09-20. Both read a statically bundled corpus and
    // touch nothing: get_ui_construction answers how an interface is SHAPED, get_verified_module
    // hands over Luau that was run against its own checks. They sit here for the same reason
    // get_genre_kit does — looking something up before building is not building, and announcing
    // "Building world" for a lookup is a claim about work that is not happening.
    case 'get_ui_construction':
    case 'get_verified_module':
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
    // Writing a file into Apple's own store, which is what `remembering` already covers: it is
    // the phase for durable state that belongs to Apple rather than to the place. `building`
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
    case 'edit_terrain':
    case 'delete_instances':
    // Direct bounded authoring ops. These all mutate the open place through typed plugin commands;
    // they are distinct tools so Agent can express the edit without arbitrary Luau.
    case 'move_instances':
    case 'transform_instances':
    case 'clone_instances':
    case 'group_instances':
    case 'ungroup_instances':
    case 'rename_instance':
    case 'set_locked':
    case 'set_visible':
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
    // Framing a store-page image IS a rasterise of the place — the same five camera angles, at the
    // aspect ratio Roblox requires — so it announces the same phase. It changes nothing in the
    // place, which is why it must not fall through to the `building` default below.
    case 'compose_thumbnail':
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
  mode: ProductMode;
  /** True only for an Agent request whose per-message Autonomous toggle was enabled. */
  autonomous?: boolean;
  /** The selected model, when the run came from a model-aware client. */
  productModel?: ProductModel;
  phase: AgentPhase;
  step: number;
  /** Hard work-step ceiling for this message. */
  totalSteps?: number;
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
  /**
   * Tools this run was NOT given, because a tool permission removed them.
   *
   * Replayed for the same reason `intent` is: the narrowing is announced once, at the first step,
   * and a refresh at step nine would otherwise leave the run looking as though nothing had been
   * withheld. Absent when nothing was — which is a different fact from an empty list arriving.
   */
  deniedTools?: string[];
}

/** One real or software-rendered Studio frame forwarded to the browser. */
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
  /** Capture source. Absent means a legacy software-render frame. */
  source?: 'studio_viewport' | 'software_render';
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

export type FrameEncoding = 'rgb24' | 'rle24' | 'png';

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
  //[[ `userMsgId` NAMES THE ROW THE USER'S OWN MESSAGE WAS STORED UNDER.
  //
  //   The client appends its own message optimistically under a locally minted id — the send is
  //   fire-and-forget over this socket and the message has to appear at once — while the server
  //   inserts its row under a uuid it never reported. So Edit, Try again and Regenerate, all of
  //   which resolve that id server-side, failed on every message sent in the current session and
  //   worked after a reload, because history comes back from /messages with real ids.
  //
  //   Carried here rather than on a new variant because msg_start is broadcast exactly once per
  //   run, after the user row is inserted, and already carries the run's other id. OPTIONAL
  //   because the worker and the web app deploy separately: a client that required it would be
  //   describing a worker that may not be live yet. See web/src/lib/message-identity.ts. ]]
  // `model` is present only when the run is on a customer-key model: the OpenRouter id it runs on.
  | { type: 'msg_start'; msgId: string; role: 'assistant'; mode: ProductMode; autonomous?: boolean; productModel?: ProductModel; model?: string; userMsgId?: string }
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
  // `effortReason` is the reasoning POLICY's own summary (e.g. "Agent baseline;
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
  /**
   * A RESTORE, WHILE IT IS HAPPENING AND WHEN IT IS OVER.
   *
   * There was no restore counterpart to `checkpoint` above. The worker issued one opaque op with a
   * 120s ceiling, broadcast nothing while it ran, and broadcast only on failure when it ended — so
   * the person who pressed Restore watched the drawer close and then had no signal at all, for up
   * to two minutes, about the operation that was at that moment deleting and rebuilding their
   * place. Modelled on `playtest_state`, which already streams its phases for the same reason.
   *
   * `fidelity` is the plugin's own count of what it put back, and it travels on the DONE frame as
   * well as the FAILED one: a restore that recreated every instance but could not set 40
   * properties is a success the user has to be told about, and that report reached the HTTP caller
   * and the SDK while the browser — the only caller with a human attached — got nothing.
   *
   * `note` is a caveat on a SUCCEEDED restore (properties failed, or the plugin is too old to
   * report and the result is therefore unverified); `error` is why a restore did not succeed. They
   * are separate fields because "it worked, with a caveat" and "it did not work" must never render
   * as the same sentence.
   */
  | {
      type: 'restore_status';
      checkpointId: string;
      phase: 'reading' | 'applying' | 'verifying' | 'done' | 'failed';
      fidelity?: RestoreFidelity;
      note?: string;
      error?: string;
    }
  | { type: 'studio_log'; entries: StudioEventLog[] }
  // Sent in reply to `resume`, and unprompted on connect when a run is live.
  | { type: 'run_state'; run: RunSnapshot | null }
  // A bounded frame captured or rendered inside Studio and forwarded to the browser.
  | { type: 'studio_frame'; frame: StudioFrame }
  // The live playtest, or null once there is none. Emitted on every phase
  // change and on every capture tick, so the card's elapsed time and console
  // counts come from the worker rather than from a timer in the browser
  // guessing what the worker is doing.
  | { type: 'playtest_state'; run: PlaytestRun | null }
  // Emitted once, at run start, after the request has been classified.
  | { type: 'run_intent'; msgId: string; intent: RunIntent }
  /**
   * WHAT THIS RUN WAS NOT ALLOWED TO DO, emitted once, at the first step.
   *
   * A tool permission REMOVES a tool from the set the model is offered, and until now nothing said
   * so: the agent simply never used it, and "why did Apple not run that script" had no answer in
   * the product. Tools that the mode never had are not listed — denying delete_instances in Plan
   * mode withholds nothing, and reporting it would invent a restriction.
   *
   * Only sent when something WAS removed. No message means nothing was withheld, which is a
   * different claim from an empty list and is the reason this is not folded into agent_status.
   */
  | { type: 'tools_denied'; msgId: string; tools: string[] }
  | {
      type: 'error';
      code: string;
      message: string;
      /**
       * Whether THIS REQUEST is over because of this error.
       *
       * Older workers omitted the field, so clients must keep their legacy behaviour for
       * undefined. New refusal paths set true; informational errors such as role_changed set
       * false. This is request terminality, not a claim that no other run exists in the room.
       */
      terminal?: boolean;
    }
  /**
   * SOMETHING WORTH KNOWING THAT IS NOT A FAILURE. The run proceeds; the client shows the line.
   *
   * It exists for one case and is deliberately not a general channel: a credential detected in the
   * user's own prompt. That is always allowed — blocking the message would leave the key pasted
   * and the person unhelped — so there is no error to raise, and before this the detection was
   * simply discarded. An `error` carrying it would be a lie about a run that is still going.
   */
  | { type: 'notice'; code: string; message: string }
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
  /** Authoritative owner/operator bypass. When true, user Credits do not gate or decrement runs. */
  unmetered?: boolean;
}

export interface CheckpointMeta {
  id: string;
  label: string;
  createdAt: number;
  kind: 'auto' | 'manual' | 'pre_agent';
  scriptCount: number;
  instanceCount: number;
  sizeBytes: number;
  /** Reported capture scope; absent for legacy snapshots whose coverage was not recorded. */
  coverage?: 'exact' | 'supported-subset';
  /** Engine-owned objects intentionally preserved instead of serialized for rollback. */
  preservedObjects?: number;
  /**
   * What this snapshot contains or why it was taken, or null when nobody wrote one.
   *
   * The only authored text on a checkpoint was a 60-character label. Everything else the drawer
   * showed — the timestamp, the object count, the script count — is derived metadata that says
   * nothing about what is inside. And every automatic checkpoint carries the same label, so a list
   * of them was a column of identical rows that a person restoring had to choose between by time.
   */
  description?: string | null;
  /**
   * The person who asked for it, or null.
   *
   * Null means two different true things and neither of them is "you": Apple took this one itself
   * (`auto`, `pre_agent`), or the row predates the column. It was inferred from `kind` before this
   * field existed, which told every member of a shared project that a teammate's checkpoint was
   * theirs — on exactly the row a restore is about to be argued over.
   */
  authorId?: string | null;
}

/**
 * What the plugin reports it ACTUALLY put back, counted inside Studio.
 *
 * Absent — not zeroed — when the op never reached Studio at all: zeros would say "it restored
 * nothing", which is a claim about the place, and we would not have looked.
 */
export interface RestoreFidelity {
  instancesCreated: number;
  scriptsRestored: number;
  scriptsExpected: number;
  failedInstances: number;
  failedScripts: number;
  failedProperties: number;
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
  mode: ProductMode | null;
  /** Whether this Agent turn ran with the Autonomous capability policy. */
  autonomous?: boolean;
  /** The selected model, when this message was created by a model-aware client. */
  productModel?: ProductModel;
  /**
   * The catalogue id of the model a run on the customer's own key ran on (the same field
   * `msg_start` carries). Present instead of `productModel`, never beside it.
   */
  model?: string;
  content: string;
  toolTrace: ToolTraceEntry[] | null;
  createdAt: string;
  /**
   * The terminal outcome that was actually emitted for this assistant run.
   *
   * Optional rather than defaulting to `done`: rows written before terminal metadata existed were
   * never observed at this boundary, so absence means unknown. Inventing success for them would
   * make a reload contradict the live run that originally ended.
   */
  stopReason?: 'done' | 'stopped' | 'error' | 'quota' | 'incomplete';
  /** A declared worker failure code only. Provider prose is never persisted here. */
  error?: RunFailure;
  /** The settled whole-run cost that `msg_end` carried, when this row came from a run. */
  creditsSpent?: number;
  /** The last measured prompt size, plus the cumulative turn loss reported during the run. */
  context?: {
    usedChars: number;
    maxChars: number;
    dropped?: { groups: number; chars: number };
  };
  /** Worker-owned tool names that permissions withheld from this run. */
  deniedTools?: string[];
  /**
   * How many earlier versions of this message the user wrote before editing it.
   *
   * Counted by the DO and sent with the list so the conversation can decide whether to draw an
   * "edited" mark without one request per turn. The TEXT is fetched only when someone asks to read
   * it. Optional: a worker that predates message_revisions sends no field, and the absence means
   * "none known", never "none".
   */
  revisions?: number;
}

/** One earlier version of a user's message, as served by .../messages/:messageId/revisions. */
export interface MessageRevisionDto {
  /** Position in the chain, oldest first. */
  seq: number;
  content: string;
  createdAt: string;
}

export interface ToolTraceEntry {
  tool: string;
  summary: string;
  ok: boolean;
  durationMs: number;
  /** Capped structured tool output, when the tool emitted a generative-UI panel. */
  detail?: unknown;
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
  /**
   * The run record the transcript trim writes in place of the turns it drops (see `trimTranscriptReport`
   * in apps/worker/src/transcript.ts). Always also `pinned`. Never serialised, like `pinned`.
   */
  ledger?: boolean;
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

/** Credits are billed from measured neuron usage, so these are typical costs rather than fixed prices. */
/**
 * `creditsPerRequest` is GONE, deliberately.
 *
 * It used to be the upfront charge — `quotaSpend(owner, MODE_INFO[mode].creditsPerRequest)`
 * — and old published fixed figures came from exactly those numbers. The charging model then changed:
 * session.ts now takes ONE credit upfront
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
/*
 * AND `entryUnit`, WHICH IS THE PIECE OF WORK THE LOW END OF `typicalCredits` WAS MEASURED ON.
 *
 * The pricing page published `Apple Max · 4 credits · "Builds features across your project" ·
 * ~57 requests a free day` about a hundred lines under `One build costs about 77 Credits`, which
 * the plan cards turn into three builds a free day. Both numbers are right and they are not about
 * the same work: the 4 is `ceil(111 / 30)` from COST-MODEL's targeted edit + read-back
 * verify in Studio*, and the 77 is `ceil(2300 / 30)` from BUILD_NEURONS.qualityGated. A reader who
 * takes the blurb at face value divides and finds the page 19x apart with itself on the one
 * question the owner actually asked — what will this cost me in a month.
 *
 * `blurb` is what the MODE does; it is rendered by the composer's model picker and is right there.
 * `entryUnit` is what the ENTRY PRICE bought, and the pricing table needs that one, because a cost
 * column and a per-day column mean nothing without the unit between them.
 *
 * The words come from the COST-MODEL row each figure is derived from, so there is one measurement
 * and one sentence about it. `check-credit-figures.mjs` fails when an offered mode's entryUnit
 * claims a build at a price that is not CREDITS_PER_BUILD — which is the drift above, stated as an
 * assertion. The guard firing when the published cost drifts is the point of writing it this way.
 */
export const MODE_INFO: Record<
  ProductMode,
  { name: string; blurb: string; typicalCredits: string; entryUnit: string }
> = {
  plan: {
    name: 'Plan',
    blurb: 'Inspects the project and designs the work without changing it',
    typicalCredits: '2',
    entryUnit: 'one question, with Studio attached',
  },
  agent: {
    name: 'Agent',
    blurb: 'Builds features across your project',
    typicalCredits: '4-18',
    entryUnit: 'one targeted edit, read back and verified',
  },
};

/**
 * WHAT A PIECE OF WORK COSTS, WHEN IT TAKES MORE THAN ONE RUN.
 *
 * `typicalCredits` above is per RUN. A roadmap milestone is sized in runs — "about two Agent
 * runs" — so the card said how much work it was in a unit nobody is billed in, while the number
 * that would answer "what will this cost me" sat two clicks away in the composer, unmultiplied.
 *
 * The multiplication is the whole value. With `runs` varying across the catalogue, reprinting one
 * run's range on a multi-run card would understate the work by that factor.
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
export function creditRangeForRuns(mode: ProductMode, runs: number): { low: number; high: number } | null {
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
// Product modes — the only mode concept the product uses. Autonomous is an Agent run flag.
// ---------------------------------------------------------------------------
export const PRODUCT_MODES: readonly ProductMode[] = ['plan', 'agent'];

/**
 * User-facing copy and cost for each product mode.
 *
 * The Credit figure is NOT restated here — it is read directly from MODE_INFO, so the
 * product-mode number cannot drift. It is `typicalCredits`, a range measured in
 * docs/COST-MODEL.md, not a price the client enforces. The worker takes one credit upfront
 * whatever the mode and settles the rest from the neurons actually used.
 */
export const PRODUCT_MODE_INFO: Record<
  ProductMode,
  { name: string; blurb: string; typicalCredits: string }
> = {
  plan: {
    name: 'Plan',
    blurb: 'Inspects your project and designs the work. Proposes; does not change anything.',
    typicalCredits: MODE_INFO.plan.typicalCredits,
  },
  agent: {
    name: 'Agent',
    blurb: 'Builds, tests and repairs. The normal way to work.',
    typicalCredits: MODE_INFO.agent.typicalCredits,
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

/**
 * The Apple Studio plugin's Roblox asset id. The one literal; derive, never retype.
 *
 * Republished 2026-09-19 as a NEW asset on a different account. The previous id,
 * 132128477945417, is `Golem` on Herobrine583522 and its Creator Dashboard carries a standing
 * refusal — "Not distributed on Creator Store. This asset may be in violation of Roblox Community
 * Standards... you can appeal" — with the distribution toggle already ON. That is a content
 * decision, not a missing click, and no id change argues with it; see
 * docs/evidence/plugin-store-blocked-2026-09-19.md. Three publish attempts from that account also
 * returned a bare "Submission failed".
 *
 * The current id is `Apple Studio`, AssetTypeId 38, creator Shahar474 (5541122967), confirmed
 * through economy.roblox.com rather than from the publish dialog that reported success.
 *
 * AND IT WAS REMOVED TOO, the same day, about seven hours after it was created. Roblox's appeals
 * page names the decision where the dashboard only hints at it: "Plugin removed · ID 107230158271368
 * · Reason: Misusing Roblox Systems · Sep 19, 2026 9:26 PM". The dashboard's "Distribute on Creator
 * Store" checkbox reads `checked: true, disabled: true` — already on AND taken away, so there is no
 * toggle left for anyone to flip. An appeal was sent (3JYeMPD1jVZIh8wYJV521ooFrHw, 2026-09-19
 * 22:04, decision estimated within five business days).
 *
 * RESTORED by 2026-09-22. The same asset now resolves through toolbox-service exactly as a listed
 * plugin does (see STUDIO_PLUGIN_STORE_LIVE below for the measurement and its controls), the store
 * page renders a "Get Plugin" button signed out, and the owner reports the plugin approved. So this
 * constant names the CURRENT, DISTRIBUTED listing. Nothing may describe it as "the previous
 * listing", and the 09-19 removal above is history, not the state of the asset.
 */
/**
 * WHERE THIS PRODUCT LIVES. One definition.
 *
 * It was a module-local const in asset-library.ts and a literal in Bridge.luau, prompts.ts, the
 * site and three tests. That was survivable while there was one host. There are two: the worker is
 * still deployed under its old name at golem.moshe-barami111.workers.dev, and until tonight that
 * host served a complete, crawlable copy of the product — same bytes, same bundle, no redirect. The
 * legacy host now 308s its page routes here, and the destination is read from this constant rather
 * than typed beside the redirect, because a redirect pointing somewhere slightly different from the
 * canonical origin is a loop waiting to happen.
 */
export const PRODUCT_ORIGIN = 'https://apple.moshe-barami111.workers.dev';

/**
 * The hostname the product used to answer on. Named so a guard can assert it is not serving pages,
 * rather than everyone agreeing to remember it.
 */
export const LEGACY_PRODUCT_HOST = 'golem.moshe-barami111.workers.dev';

export const STUDIO_PLUGIN_ASSET_ID = '107230158271368';

/**
 * The plugin's canonical Creator Store page, and the install path while
 * STUDIO_PLUGIN_STORE_LIVE is true. The page shell loads for every id, so the
 * probe below — not this URL answering 200 — is what says the listing is live.
 */
export const STUDIO_PLUGIN_URL = `https://create.roblox.com/store/asset/${STUDIO_PLUGIN_ASSET_ID}`;

/**
 * A liveness probe that DOES discriminate — 200 means listed, 404 means not.
 *
 * This comment previously said the opposite, on this evidence: "Rojo 6430081415 -> 404 <- fully
 * listed, installed by thousands", concluding that a probe answering 404 for everything answers
 * nothing. The control was wrong. `6430081415` is not Rojo:
 *
 *   economy.roblox.com/v2/assets/6430081415/details
 *     -> Name "POGCHAMP-hoodie", AssetTypeId 1, creator AhbaNorTh
 *
 * An image asset. toolbox-service serves Creator Store items, so 404 is the correct answer for it.
 * Re-measured 2026-09-19 against two controls that really are listed plugins:
 *
 *   Rojo 7           6415005344       -> 200    <- control
 *   Moon Animator 2  4725618216       -> 200    <- control
 *   Apple Studio     107230158271368  -> 404
 *   Golem            132128477945417  -> 404
 *
 * Retiring a working instrument on a mistyped control is the same error as trusting a broken one:
 * both put a belief where a measurement was. Two controls, not one, from here on.
 *
 * Still true from the earlier pass: the store PAGE does not discriminate — every id returns 200 and
 * an identical client-rendered shell — and `catalog.roblox.com/v1/catalog/items/{id}/details`
 * returns 404 for all of them. Neither is a substitute for this probe.
 *
 * What the 404 here does NOT tell you is WHY. For our asset the reason is a moderation decision —
 * roblox.com/report-appeals names it "Plugin removed … Misusing Roblox Systems" — and only the
 * authenticated Creator Dashboard or the appeals page says so. A probe reports distribution, not
 * cause. See docs/evidence/plugin-store-blocked-2026-09-19.md.
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
 * 200 = listed, 404 = not, and ALWAYS beside a control (see the probe above).
 *
 * Last checked 2026-09-19: 404 for this asset, against 200 for two known-listed
 * plugins (Rojo 7 6415005344, Moon Animator 2 4725618216). The 404 was a removal
 * under "Misusing Roblox Systems", not a pending listing, so flipping this waits on
 * the appeal succeeding rather than on a probe changing its mind.
 *
 * RE-PROBED 2026-09-22 AND IT NOW ANSWERS 200, so the sentence above is a record of
 * 2026-09-19 and not of today. The controls held still in the same run — Rojo 7 and
 * Moon Animator 2 both 200, an id that cannot exist 404 — so the endpoint still
 * discriminates and the change is in the asset, not the instrument. The constant is
 * deliberately NOT flipped on that measurement alone — "a probe reports distribution,
 * not cause" cuts both ways. The measurement, with its controls, is in
 * docs/evidence/2026-09-22-plugin-store-listing-flipped.md.
 *
 * FLIPPED 2026-09-22 ~21:03 IDT, on three facts rather than the probe alone:
 *   1. re-probed at 18:02:59Z — ours 200 with the same shape as Rojo 7 (visibilityStatus 1,
 *      isAssetHashApproved, fiatProduct published + free), Moon Animator 2 200, the retired
 *      Golem id 404, an id that cannot exist 404;
 *   2. the store page, rendered signed out, shows "Apple Studio - Creator Store" with a
 *      "Get Plugin" button, and Creator Store search for "Apple Studio" returns exactly this id;
 *   3. the owner reports the new plugin approved.
 * If the probe returns 404 again, flip this back — every install affordance follows it.
 *
 * FLIPPED BACK 2026-09-23 ~01:30 IDT. The 01:23 overwrite (version 2) was refused: the Configure
 * page reads "Not distributed on Creator Store — may be in violation of Roblox Community
 * Standards", and toolbox details answer 404 for this id while Rojo (6415005344) and Moon
 * Animator (4725618216) answer 200 and an impossible id 404; store search returns nothing.
 * The owner's decision (docs/autonomy/DECISIONS.md D-STORE-2) is to publish once more only with
 * the final build and appeal it; flip this to true when the probe answers 200 again.
 *
 * Typed `boolean` rather than the literal `false` on purpose: consumers branch
 * on it, and a literal type would make the live branch look unreachable.
 */
export const STUDIO_PLUGIN_STORE_LIVE: boolean = false;

/**
 * Can a customer buy Credits today? No, and three surfaces used to say otherwise.
 *
 * `buildCheckoutRequest` hardcodes `mode: 'subscription'`; there is no `mode: 'payment'` anywhere
 * in the worker or in this package, so no code path exists that could take money for Credits. The
 * pricing table advertised the feature as included on every plan, and the in-app meter offered
 * "Add credits" at the exact moment a customer's allowance ran out — the worst possible moment to
 * be sent somewhere that does not exist.
 *
 * ONE FLAG, NOT THREE. The first fix declared it locally in pricing.astro, which corrected the page
 * and left the constant here saying `true` for every other reader — including the meter. A fact
 * with one true answer and three copies is the shape this repository keeps finding at the bottom of
 * its own defects, so it lives here and every surface derives from it.
 *
 * Flipping it to true is not enough on its own: a payment-mode checkout has to exist first, and
 * `credit-purchase-claim.test.mjs` fails if this says true while the worker still has no way to
 * charge for them.
 */
export const CREDIT_PURCHASE_LIVE: boolean = false;


/**
 * WHY the store is not live — the fact every "unavailable" surface was missing.
 *
 * `STUDIO_PLUGIN_STORE_LIVE = false` says the install path does not work. It does not say whether
 * that is a step nobody has taken, a queue, or a decision, and for a year of copy the product let
 * readers assume the first. It is the third. A reader deciding whether to wait deserves the
 * difference, and so does the next agent, who would otherwise go looking for a checkbox.
 *
 * `null` would mean "not refused". A non-null value is a recorded moderation decision, sourced from
 * roblox.com/report-appeals for this asset id — not from the dashboard banner, which names no rule.
 *
 * It is `null` from 2026-09-22 because the listing is distributed again (STUDIO_PLUGIN_STORE_LIVE).
 * It is set again from 2026-09-23 — version 2 was removed for the same rule (see below).
 * The decision it used to carry is kept here as history, not as state: 'Misusing Roblox Systems',
 * decided 2026-09-19T21:26+03:00, appeal 3JYeMPD1jVZIh8wYJV521ooFrHw sent 2026-09-19T22:04+03:00.
 */
export interface StudioPluginStoreRefusal {
  /** Roblox's own words for the rule, verbatim. */
  readonly reason: string;
  /** When Roblox says it reviewed the asset. */
  readonly decidedAt: string;
  /** The last day an appeal may be sent for this decision. */
  readonly appealableUntil: string;
  /** Roblox's case id for the appeal already sent, or null if none has been. */
  readonly appealId: string | null;
  readonly appealedAt: string | null;
}

// 2026-09-23: version 2 (the 01:23 overwrite) was removed — roblox.com/report-appeals, violation
// 3JhaXRZAqvmSw5iIhea5QZgT67R. Per the owner (docs/autonomy/DECISIONS.md D-STORE-2) the appeal is sent
// with the product's final plugin build, before appealableUntil.
export const STUDIO_PLUGIN_STORE_REFUSAL: StudioPluginStoreRefusal | null = {
  reason: 'Misusing Roblox Systems',
  decidedAt: '2026-09-23T01:23+03:00',
  appealableUntil: '2026-10-23T01:23+03:00',
  appealId: null,
  appealedAt: null,
};

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
  // The binding number is DAILY_NEURON_CEILING. It was 25,000 neurons a day — 833 Credits a day,
  // about 11 quality-gated builds a day for EVERY user combined — and the rows below were sized
  // against exactly that. On 2026-09-20 it became 100,000 (10,000 free + 90,000 billable), because
  // at the old figure the live product refused every build it was asked for. So the rows are now
  // roughly 4x under the ceiling rather than pressed against it. Nothing below is unsafe as a
  // result; what changed is that the headroom argument is no longer tight, and the next person to
  // raise a plan row should re-derive it from the CURRENT ceiling, not from 833. Three of the four old rows were
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

/**
 * Whether an account may select a product model right now.
 *
 * Apple is the free lane and therefore does not require a subscription record to be present.
 * Apple MAX is paid-only: an absent, malformed or unknown plan is refused just like Free. The
 * helper intentionally has no owner/admin exception; those identities are not documented model
 * entitlements, while an explicit paid `PlanId` remains authoritative for every caller.
 */
export function canUseProductModel(model: unknown, plan?: string): boolean {
  if (model === 'apple') return true;
  if (model !== 'apple-max') return false;
  return isPlanId(plan) && plan !== 'free';
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
    highlights: ['Every build mode', STUDIO_PLUGIN_STORE_LIVE ? 'Studio plugin' : 'Studio integration · public installation unavailable', 'Checkpoints and restore'],
  },
  builder: {
    id: 'builder',
    name: 'Builder',
    blurb: 'For building most days.',
    priceUsdMonthly: 12,
    //[[ 'Priority during busy periods' IS GONE, and it was the third reason to pay $12.
    //
    //   No plan buys a place in the queue — docs/credits-and-limits says so in the product's own
    //   documentation, two clicks from the pricing card that was selling it. Paying changes your
    //   allowance, not your turn. A buyer comparing the card to the docs finds the contradiction;
    //   a buyer who does not compare pays for it and never gets it.
    //
    //   Owner's decision, 2026-09-20: remove the claim rather than build the feature. Selling a
    //   thing that does not exist is the defect; a shorter honest card is not. ]]
    highlights: ['About 5× the Free allowance', 'Buy credits when you need more', 'Everything in Free'],
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    blurb: 'For sustained building with a larger allowance.',
    priceUsdMonthly: 40,
    highlights: ['About 9× the Free allowance', 'Everything in Builder'],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    blurb: 'For studios with their own limits, terms and support needs.',
    priceUsdMonthly: null,
    highlights: ['Negotiated limits', 'Invoicing', 'Direct support'],
  },
};

/**
 * The one address support reaches a human at.
 *
 * IT WAS TWO. The marketing site, the docs footer, the status page and the FAQ all used
 * apple.labs.app@gmail.com; the plan ladder in the signed-in app — the only support-ish link
 * anywhere behind the login — used hello@apple.build. A customer cannot tell which of those is
 * read, and writing to the wrong one looks, from their side, exactly like being ignored.
 *
 * Declared here so the two halves of the product cannot drift again, and asserted across both
 * trees by tests/support-expectations.test.mjs.
 */
export const SUPPORT_EMAIL = 'apple.labs.app@gmail.com';

/** What a plan can expect when it writes in. */
export interface PlanSupport {
  /** How you reach us on this plan. */
  channel: string;
  /**
   * What is promised about a reply.
   *
   * NO RESPONSE TIME IS STATED, and that is the honest answer rather than an omission: nobody has
   * committed to one, and a published SLA that is missed is worse than a published "best effort"
   * that is met. What is NOT acceptable is the previous state, where three of four plans said
   * nothing at all and a buyer could not tell whether anyone would answer.
   */
  promise: string;
}

export const PLAN_SUPPORT: Record<PlanId, PlanSupport> = {
  free: {
    channel: `Email ${SUPPORT_EMAIL}`,
    promise: 'A human reads it. While Apple is in beta no reply time is promised, and busy weeks are slower.',
  },
  builder: {
    channel: `Email ${SUPPORT_EMAIL}`,
    promise: 'A human reads it, and paid accounts are answered first. No reply time is promised while Apple is in beta.',
  },
  studio: {
    channel: `Email ${SUPPORT_EMAIL}`,
    promise: 'A human reads it, and paid accounts are answered first. No reply time is promised while Apple is in beta.',
  },
  enterprise: {
    channel: `Email ${SUPPORT_EMAIL} to start`,
    promise: 'A named contact and whatever response terms are agreed in your contract — these are negotiated, not published.',
  },
};

/**
 * What a Credit is worth in the engine's own unit.
 *
 * Defined here rather than in the worker because the pricing page explains it to buyers and the
 * worker charges with it, and those two had no shared definition — `apps/worker/src/pricing.ts`
 * held the number and re-exports it from here now, the same way PLAN_LIMITS and CREDITS_PER_BUILD
 * already do.
 */
export const NEURONS_PER_CREDIT = 30;

/**
 * The two measured build costs, kept APART, because a page that quotes one while pricing the other
 * contradicts itself in public.
 *
 * `/pricing` said "A full Agent build — read the tree, edit scripts, create instances, verify —
 * measured 511 neurons" three lines under an allowance priced at 77 Credits, which is 2,310
 * neurons. Both figures are real and both are in docs/COST-MODEL.md; they are not the same build.
 * 511 is the BUILD-BLIND path, the one that never looked at what it made. 2,300 is the same build
 * with the visual critique in it — about sixteen steps at ~145 neurons plus one or two critiques —
 * and it is the one the allowance is denominated in. Quoting the cheap one beside the expensive
 * one's price reads as a 4.5x arithmetic error to anyone who divides.
 */
export const BUILD_NEURONS = {
  /** A build including the visual quality gate. This is what a Credit allowance buys. */
  qualityGated: 2_300,
  /** The same build with no critique step. Kept for comparison, never for pricing. */
  buildBlind: 511,
} as const;

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

/**
 * How many days a plan can actually spend its DAILY allowance before the MONTHLY one stops it.
 *
 * `quotaState` spends `Math.min(dailyLeft, monthlyLeft)` (apps/worker/src/quota-math.ts), so a plan
 * has two limits and the smaller one is the one the user has. For three of the four plans the
 * monthly figure is about thirty times the daily figure and the distinction never shows. On **free**
 * it is ten: 231 a day against 2,310 a month. A free user who spends their full daily allowance
 * reaches the monthly ceiling on the tenth and gets nothing for the rest of the month.
 *
 * That is a legitimate way to shape a free tier. It is not a legitimate thing to leave out of the
 * sentence "Credits reset to your full daily amount every day", which the pricing page ran for as
 * long as these numbers have been live, and which is false for two thirds of every month for the
 * only plan anyone can currently have.
 *
 * Exported so the claim is DERIVED wherever it is made. A page that wants to say "every day" has to
 * ask this function whether that is true for the plan it is describing.
 */
export function fullRateDays(plan: PlanId): number {
  return Math.floor(PLAN_LIMITS[plan].creditsPerMonth / PLAN_LIMITS[plan].creditsPerDay);
}

/**
 * Whether the monthly ceiling bites before the month ends.
 *
 * 28 is the shortest month, so a plan clearing 28 full days can honestly be described by its daily
 * rate alone in every month of the year. Anything below that cannot.
 */
export function monthlyCeilingBitesFirst(plan: PlanId): boolean {
  return fullRateDays(plan) < 28;
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
    id: 'apple-max',
    label: PRODUCT_MODEL_INFO['apple-max'].name,
    note: 'Model access is separate from the work mode.',
    values: everyPlan((p) => canUseProductModel('apple-max', p)),
  },
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
    /*
     * COUNTED AND NAMED FROM PRODUCT_MODES, not typed here.
     *
     * This sentence is derived from PRODUCT_MODES so the pricing page and runtime cannot
     * drift to different mode counts.
     */
    id: 'modes',
    label: `All ${PRODUCT_MODES.length === 2 ? 'two' : String(PRODUCT_MODES.length)} build modes`,
    note: `${PRODUCT_MODES.map((m) => PRODUCT_MODE_INFO[m].name).join(' and ')}. Neither is held back for a paid tier.`,
    values: everyPlan(() => true),
  },
  { id: 'projects', label: 'Unlimited projects', values: everyPlan(() => true) },
  { id: 'checkpoints', label: 'Checkpoints and rollback', values: everyPlan(() => true) },
  { id: 'plugin', label: 'Roblox Studio plugin', values: everyPlan(() => STUDIO_PLUGIN_STORE_LIVE ? true : 'Public installation unavailable') },
  {
    id: 'sharing',
    label: 'Shared projects and collaborators',
    values: everyPlan(() => true),
  },
  {
    id: 'credits',
    label: 'Buy extra credits',
    note: CREDIT_PURCHASE_LIVE
      ? 'Purchased credits never expire and are spent only after the daily allowance.'
      : 'Apple cannot sell Credits in this preview — there is no checkout for them on any plan.',
    values: everyPlan(() => (CREDIT_PURCHASE_LIVE ? true : 'Unavailable')),
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
// Apple's own public-API keys
// ---------------------------------------------------------------------------------------------

/**
 * Every scope a public-API key can carry, and the two modes one can be minted in.
 *
 * MOVED HERE FROM apps/worker/src/api-keys.ts, for the reason written under the Roblox scopes
 * below: both ends need the same list and they need it to be the SAME list. The settings panel
 * offers these as tickboxes and the mint route validates what comes back, and a vocabulary living
 * in two places lets the panel offer a scope the worker refuses — a control that cannot work,
 * discovered by the person who ticked it, as a 400 with no field attached.
 *
 * The worker still owns everything ABOUT a key — the prefixes, the hashing, the authorizer. This
 * is only the vocabulary.
 */
export const API_SCOPES = [
  'chat:write',
  'projects:read',
  'messages:read',
  'runs:read',
  'runs:write',
  'events:read',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(v: unknown): v is ApiScope {
  return typeof v === 'string' && (API_SCOPES as readonly string[]).includes(v);
}

/**
 * `live` and `test` are different credentials with different behaviour, and the difference is
 * legible in the key string itself (`gk_live_…` / `gk_test_…`) rather than hidden in a column — a
 * key that leaks into a log or a screenshot should announce whether it can spend money.
 */
export const API_KEY_MODES = ['live', 'test'] as const;
export type ApiKeyMode = (typeof API_KEY_MODES)[number];

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
  // The Creator Dashboard set. Spelled exactly as Roblox's own published Cloud spec spells them
  // (github.com/Roblox/creator-docs, content/en-us/reference/cloud/openapi.json, read 2026-09-15),
  // because these strings are what a person has to recognise on Roblox's API-key page — a scope we
  // named ourselves would be a tick-box nobody could match to a permission.
  'universe:read',
  'user.inventory-item:read',
  'game-pass:read',
  'game-pass:write',
  'asset-permissions:write',
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
 *
 * `apple_library` WAS THE FIRST MEMBER AND WAS REMOVED ON 2026-09-20, with the catalogue it
 * authorised. Leaving it would be that exact failure in reverse: a box in the dialog that unlocks
 * no engine source, so ticking it changes nothing and the person who ticked it finds out later.
 *
 * A STORED POLICY THAT STILL NAMES IT IS NOW INVALID, and that is the intended degradation rather
 * than an oversight. `isAssetSourcePolicy` (worker preferences.ts) rejects a policy containing an
 * unknown choice outright, so such a row falls back to `ASSET_SOURCE_DEFAULT` — `ask`, allowing
 * nothing — and the person is asked again. Silently dropping the dead member instead would leave
 * `remember` set on an answer they never gave.
 */
export const ASSET_SOURCE_CHOICES = ['creator_store', 'from_scratch'] as const;
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
 * The worker validates every tool permission against the real registry (preferences.ts), so a
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
  /**
   * Why someone would withhold it — the consequence, not the category. A permission control
   * whose effect is invisible is one people either ignore or misuse, so this sentence is rendered
   * beside the control rather than hidden behind a tooltip.
   */
  why: string;
  /** Whether withholding it protects the project or the wallet. The panel groups by this. */
  group: 'changes' | 'spends';
}

/**
 * The write tools a person may govern, in the order the panel lists them.
 *
 * NOT every tool in the registry. The read-only ones — read_script, get_project_tree, search_docs —
 * have nothing to deny, and a switch beside each of them would be forty controls of which fourteen
 * matter, with the fourteen being the ones nobody finds. Blocking a read-only tool buys no safety
 * and breaks the agent, and apps/web/tests/tool-permissions.test.mjs holds that line against Plan
 * mode's toolset.
 *
 * Every tool that DECLARES ITSELF A WRITER in the registry — `TOOLS[name].mutatesProject` in
 * apps/worker/src/tools.ts — appears here, plus the tools that spend Credits without writing
 * (generate_image, generate_sound, speak_line, run_and_check, workspace_write). Measured
 * 2026-09-22: 23 writers declared, 28 governed, and the writers are a strict subset. A safety
 * control with a hole in it is worse than none, because it reads as complete.
 *
 * This used to say "every member of the run loop's own MUTATING_TOOLS set appears here". That set
 * was deleted when mutation truth moved onto the tool entries, and a comment naming a constant
 * that no longer exists is worse than no comment: it reads as a checked invariant.
 */
export const GOVERNED_TOOLS: readonly GovernedTool[] = [
  // --- changes the project ---------------------------------------------------------------
  {
    name: 'run_luau',
    label: 'Run code in your place',
    why: 'Arbitrary code against your game. It can do anything the other tools can, and more.',
    group: 'changes',
  },
  {
    name: 'delete_instances',
    label: 'Delete parts and objects',
    why: 'The only tool that removes things. A checkpoint can undo it, but only if one was taken.',
    group: 'changes',
  },
  {
    name: 'edit_script',
    label: 'Change existing scripts',
    why: 'Rewrites Luau you may have written by hand.',
    group: 'changes',
  },
  {
    name: 'format_script',
    label: 'Reformat scripts',
    why: 'Reindents and restyles a script you wrote, without changing what it does.',
    group: 'changes',
  },
  {
    name: 'create_instances',
    label: 'Add parts and objects',
    why: 'Adds parts, models and services to your place.',
    group: 'changes',
  },
  {
    name: 'set_properties',
    label: 'Change parts that already exist',
    why: 'Alters existing instances in place — position, size, material, anything.',
    group: 'changes',
  },
  {
    name: 'edit_terrain',
    label: 'Edit terrain',
    why: 'Changes Roblox Terrain voxels and materials in the open place.',
    group: 'changes',
  },
  {
    name: 'move_instances',
    label: 'Reparent objects',
    why: 'Moves existing objects to different parents in the project hierarchy.',
    group: 'changes',
  },
  {
    name: 'transform_instances',
    label: 'Transform objects',
    why: 'Moves, rotates, or scales existing spatial objects in the place.',
    group: 'changes',
  },
  {
    name: 'clone_instances',
    label: 'Clone objects',
    why: 'Duplicates existing project objects and may place the copies under another parent.',
    group: 'changes',
  },
  {
    name: 'group_instances',
    label: 'Group objects',
    why: 'Creates a Model and reparents selected project objects into it.',
    group: 'changes',
  },
  {
    name: 'ungroup_instances',
    label: 'Ungroup objects',
    why: 'Moves children out of a Model or Folder and removes the emptied container.',
    group: 'changes',
  },
  {
    name: 'rename_instance',
    label: 'Rename objects',
    why: 'Changes the name and therefore the project path of an existing object.',
    group: 'changes',
  },
  {
    name: 'set_locked',
    label: 'Lock or unlock objects',
    why: 'Changes Studio lock state on BaseParts under the selected objects.',
    group: 'changes',
  },
  {
    name: 'set_visible',
    label: 'Show or hide objects',
    why: 'Changes visibility on spatial instances or GUI objects in the project.',
    group: 'changes',
  },
  {
    name: 'set_mood',
    label: 'Change scene lighting',
    why: 'Rewrites Lighting properties and Apple-owned atmosphere and post-processing effects.',
    group: 'changes',
  },
  {
    name: 'add_effect',
    label: 'Add scene effects',
    why: 'Adds particle, light, or related presentation instances to project objects.',
    group: 'changes',
  },
  {
    name: 'remove_effect',
    label: 'Remove Apple effects',
    why: 'Deletes presentation effects that Apple previously attached to project objects.',
    group: 'changes',
  },
  {
    name: 'insert_asset',
    label: 'Insert assets from the Creator Store',
    why: 'Brings third-party models into your place.',
    group: 'changes',
  },
  {
    name: 'install_module',
    label: 'Install Luau modules',
    why: 'Adds third-party code to your project, which then runs as if you had written it.',
    group: 'changes',
  },
  {
    name: 'run_and_check',
    label: 'Playtest the game',
    why: 'Starts a playtest. Withhold it and Apple can no longer check its own work by running it.',
    group: 'changes',
  },
  {
    name: 'workspace_write',
    label: 'Write files in the workspace',
    why: 'Writes to the file workspace beside your project. It cannot reach the place itself.',
    group: 'changes',
  },
  {
    name: 'design_sound',
    label: 'Design project sound',
    why: 'Creates or updates Sound instances and related project configuration while designing audio.',
    group: 'changes',
  },
  {
    name: 'assign_sounds',
    label: 'Assign sounds to objects',
    why: 'Writes Sound configuration onto project objects using generated or selected audio.',
    group: 'changes',
  },

  // --- spends beyond the run's own thinking ----------------------------------------------
  // These call something other than the language model, so they cost on top of the run itself.
  {
    name: 'generate_image',
    label: 'Generate images',
    why: 'Calls an image model. Costs Credits on top of the run.',
    group: 'spends',
  },
  {
    name: 'generate_model',
    label: 'Generate 3D models',
    why: 'Calls a 3D model service. The slowest and most expensive thing Apple can do.',
    group: 'spends',
  },
  {
    name: 'generate_sound',
    label: 'Generate sound effects',
    why: 'Calls an audio model. Costs Credits on top of the run.',
    group: 'spends',
  },
  {
    name: 'speak_line',
    label: 'Generate speech',
    why: 'Calls a text-to-speech model. Costs Credits on top of the run.',
    group: 'spends',
  },
];

export const GOVERNED_TOOL_NAMES: readonly string[] = GOVERNED_TOOLS.map((t) => t.name);

/* --------------------------------------------------------------- message revisions --- */

/**
 * Does replacing `previous` with `next` produce an earlier version worth keeping?
 *
 * Shared because BOTH sides answer it and they must answer it the same way: the DO decides whether
 * to write a `message_revisions` row, and the web app decides whether to increment the count it is
 * showing optimistically before the server has said anything. If they disagreed, the conversation
 * would offer to show earlier versions that do not exist, or hide ones that do.
 *
 * NO for an unchanged resend, which is not a hypothetical: "Try again" and "Regenerate" both go
 * through `edit_resend` with the text untouched, on purpose, so that running again has exactly one
 * definition. Recording those would tell a user who regenerated four times that their message has
 * four earlier versions, every one of them identical to the one on screen.
 *
 * Compared trimmed, because the client trims before sending and the DO trims on arrival — a rule
 * that counted whitespace would record a revision nobody can see a difference in.
 *
 * NO for an empty previous message: there is no version of nothing.
 */
export function recordsRevision(previous: string, next: string): boolean {
  const before = previous.trim();
  if (!before) return false;
  return before !== next.trim();
}

/* ---------------------------------------------------------------- run failures --- */

/**
 * Why a run ended badly, as a closed set the worker and the app both read.
 *
 * WHAT THIS REPLACES. `finishRun`'s `error` argument is broadcast to the browser on the `msg_end`
 * frame, and the workspace rendered it as the outcome sentence. The values being passed were
 * 'run interrupted', 'rate_limited', and — on two paths — whatever the inference provider had
 * thrown, unredacted. A person whose build died read a note one server wrote to another, which is
 * exactly the failure apps/web/src/lib/error-taxonomy.ts exists to prevent, one process upstream
 * of where it can act.
 *
 * SO THE WIRE CARRIES A CODE AND THE APP OWNS THE SENTENCE. The provider's words stay on the
 * server, logged, where support can read them; they never reach a screen. An app that meets a code
 * it does not know falls back to the generic sentence rather than printing the code — a worker
 * deployed ahead of the app must degrade, not leak.
 *
 * The values below are descriptions for whoever reads this file. Nothing renders them.
 */
export const RUN_FAILURES = {
  /** The model was rate-limited upstream. Everything finished before that step is saved. */
  busy: 'upstream rate limit',
  /** No step completed inside the stale window — usually an instance evicted mid-run. */
  interrupted: 'run went stale between steps',
  /** Inference failed after the run had already done real work. */
  dropped_step: 'inference failed past step 1',
  /** Anything else thrown out of a step. The provider's message is logged, never sent. */
  model_failed: 'unclassified step failure',
} as const;

export type RunFailure = keyof typeof RUN_FAILURES;

export function isRunFailure(v: unknown): v is RunFailure {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(RUN_FAILURES, v);
}

// ---------------------------------------------------------------------------
// Attachment policy.
//
// Re-exported rather than defined here so the rules sit in one file with their reasons, and so
// `import { MAX_ATTACHMENT_BYTES } from '@golem/shared'` reads the same in the browser, in the
// worker and in the Durable Object. A second copy of a ceiling is how a picker comes to accept a
// file the server refuses.
// ---------------------------------------------------------------------------
export * from './attachments.ts';
export * from './models.ts';
