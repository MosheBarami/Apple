// @studpilot/shared — wire protocol + domain types shared by worker, web app, evals.
// The Studio plugin (Luau) mirrors these shapes; apps/plugin/src/Protocol.luau documents the mapping.

import { MODEL_IDS, MODEL_REGISTRY, type ModelId } from './models.ts';
import type { UiTheme } from './ui-theme.ts';

// ---------------------------------------------------------------------------
// Studio op protocol: commands the agent sends to the Studio plugin.
// Instance paths are game-tree paths like "game.Workspace.Lobby.Door" (names
// escaped with ["..."] when they contain dots/spaces).
// ---------------------------------------------------------------------------

export type PropValue =
  | { t: 'string'; v: string }
  | { t: 'bytes'; v: string } // hex, a string that is not UTF-8 (binary attributes)
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

/** Device frames ui_layout_check lays a screen out in (phones and tablets also get the touch-target check). */
export type UiLayoutDevice = 'phone_portrait' | 'phone_landscape' | 'tablet' | 'desktop' | 'console_tv';
/** How set_props_bulk adjusts a number or Vector3 property. Named, not inlined, because an inline `op: '…'` would read as a StudioOp. */
export type BulkAdjustOp = 'add' | 'mul';

export interface SurfaceMaps { colorMap: string; normalMap: string; studsPerTile: number }

/** One source a run used, shown with AI Elements' Sources and cited inline as [n]. */
export interface RunSource { title: string; url: string; kind: 'docs' | 'creator_store' | 'library' | 'web'; note?: string }

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
      action: 'clear' | 'fill_block' | 'fill_ball' | 'fill_region' | 'replace_material' | 'write_voxels';
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
   * The bounded Run-mode controls used by StudPilot's live verification loop: RunService Run/Pause/Stop.
   * Current Studio also exposes asynchronous Play/Multiplayer automation through StudioTestService;
   * those are a different test-session lifecycle and are not represented by this Run-mode union.
   * `start` is a kept alias for `run`. Unknown actions are refused, never treated as stop.
   */
  | { op: 'run_mode'; action: 'start' | 'run' | 'pause' | 'resume' | 'stop' | 'restart' }
  /**
   * The PLAYER-SIDE check (F-046): a solo Test session through StudioTestService:ExecutePlayModeAsync
   * with a temporary harness that waits for the player, stays `seconds` (3-15), walks the character
   * onto each `touch` path (at most 5, inside game.Workspace), and reports the player's ScreenGuis,
   * visible text, leaderstats and the server AND client errors. Edit mode + edit consent, like a write.
   */
  | { op: 'play_check'; seconds?: number; touch?: string[] }
  // Companion direct manipulation: what a person clicks in the panel, with no model in the loop.
  // `move` is a stud offset, `rotate` is degrees about the target's own centre, `scale` is a
  // positive multiplier. Non-finite and out-of-range values are refused rather than clamped.
  | { op: 'transform_instances'; paths: string[]; move?: [number, number, number]; rotate?: [number, number, number]; scale?: number }
  | { op: 'clone_instances'; paths: string[]; parent?: string }
  /** The composer (apps/worker/src/compose.ts): copies of imported library pieces placed on a new map. */
  | { op: 'place_copies'; items: { from: string; parent: string; name: string; at: [number, number, number]; yaw?: number; height?: number; length?: number; along?: 'x' | 'z' }[] }
  /** The composer: a UI kit's own scripts and sounds taken out (only those classes). */
  | { op: 'strip_descendants'; root: string; classes: ('LocalScript' | 'Script' | 'ModuleScript' | 'Sound' | 'BillboardGui' | 'ProximityPrompt' | 'ClickDetector')[] }
  /** Classic surfaces after Resurface (cxmeel): a MaterialVariant per surface on every face. Maps are image ids. */
  | { op: 'apply_surface'; paths: string[]; surface: 'studs' | 'inlet' | 'universal' | 'weld' | 'glue' | 'smooth' | 'smooth_no_outlines'; maps?: SurfaceMaps }
  /** Every part a StudPilot write adds gets studs ('studs', the default) or keeps what it was given ('keep'). */
  | { op: 'set_surface_default'; surface: 'studs' | 'keep'; maps?: SurfaceMaps }
  /** Joints after RigEdit Lite: join parts to an anchored root (Motor6D or Weld, keeping them in place), move a joint's
   *  pivot (hinge) without moving its part, and reset Motor6Ds to rest. */
  | { op: 'rig_model'; root: string; parts?: string[]; joint?: 'motor' | 'weld' }
  | { op: 'set_joint_pivot'; joint: string; at?: [number, number, number]; turn?: [number, number, number] }
  | { op: 'reset_joints'; paths: string[] }
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
  | { op: 'capture_studio_viewport' }
  | { op: 'screenshot'; target?: string } // hero view at default size; kept for compatibility
  | { op: 'snapshot'; root: string; includeScripts?: boolean; checkpointId?: string } // serialize subtree; new checkpoints bind their identity
  | { op: 'restore'; root: string; snapshot: unknown; checkpointId?: string } // optional for legacy senders; SessionDO always binds it
  | { op: 'insert_asset'; assetId: number; parent: string }
  | { op: 'query_owner_local'; action: 'health' | 'sources' | 'search' | 'describe' | 'record' | 'children' | 'relations' | 'plan' | 'materialize' | 'job' | 'native-map' | 'native-readiness';
      id?: string; query?: string; sourceSHA?: string; jobId?: string; className?: string; kind?: string; scope?: string; limit?: number;
      offset?: number; after?: string | number; afterOrdinal?: number; afterId?: string }
  | { op: 'query_owner_assembly'; action: 'recipes' | 'code' | 'record'; sourceSHA?: string; mechanic?: string; codeSHA?: string; after?: string | number; offset?: number; limit?: number }
  | { op: 'query_owner_media'; id: string; property: string; offset?: number; limit?: number; inspect?: boolean }
  | { op: 'query_owner_exact'; action: 'sources' | 'strings' | 'string'; sourceSHA?: string; identity?: string;
      seq?: number; offset?: number; limit?: number; after?: string | number }
  | { op: 'import_owner_local'; nodeId: string; jobId: string; nativeSha256: string; byteLength: number;
      nativeInstances: number; parent: string }
  | { op: 'query_owner_library'; action: 'list' | 'game' | 'deps' | 'route'; q?: string; niche?: string; kind?: string; game?: string; after?: number; limit?: number; id?: string; gameId?: string; path?: string;
      route?: 'deps' | 'install' | 'systems' | 'blueprint' | 'family' | 'report' | 'media' | 'design' | 'find'; params?: Record<string, string | number> }
  | { op: 'import_owner_library'; gameId: string; path: string; mode: 'self' | 'children'; parent: string; applyServiceProperties?: boolean; replace?: boolean; onlyMissing?: boolean; studioData?: boolean }
  | { op: 'import_owner_component'; componentId: string; componentSha256: string; byteLength: number;
      contentToken: string; parent: string; name: string }
  // Roblox-native text-to-3D. Free, ~20s, 10 req/min. Output is SESSION-SCOPED: it does not
  // survive save/publish. The result always carries a QC verdict — generation succeeding is not
  // evidence the model is good.
  | { op: 'generate_model'; prompt: string; intent?: string; maxTriangles?: number; predefinedSchema?: string; parent: string }
  | { op: 'inspect_model'; path: string; intent?: string } // QC gate over an existing model
  | { op: 'undo_waypoint'; name: string } // explicit ChangeHistoryService waypoint
  // --- op families (apps/studpilot-plugin/src/ops, D-VISION-1 Phase A). Every one is OPT-IN: the worker
  // offers a tool that needs one only when the paired plugin reports it supported.
  | {
      op: 'query_instances';
      root?: string;
      name?: string; // substring, or a `*` glob
      className?: string;
      isA?: string;
      tag?: string;
      attribute?: { name: string; equals?: string | number | boolean };
      property?: { name: string; op?: 'eq' | 'lt' | 'gt' | 'contains'; value: string | number | boolean };
      limit?: number;
    }
  | {
      op: 'set_props_bulk';
      targets?: string[];
      query?: Record<string, unknown>;
      props?: Record<string, PropValue>;
      attributes?: Record<string, PropValue>;
      adjust?: { property: string; op: BulkAdjustOp; value: number | [number, number, number] }[];
    }
  | {
      op: 'spatial_query';
      action: 'raycast' | 'find_ground' | 'bounds' | 'check_placement' | 'overlap' | 'find_flat';
      origin?: [number, number, number];
      direction?: [number, number, number];
      position?: [number, number, number];
      path?: string;
      center?: [number, number, number];
      size?: [number, number, number];
      region?: { min: [number, number, number]; max: [number, number, number] };
      samples?: number;
      maxSlopeDeg?: number;
      exclude?: string[];
    }
  | {
      op: 'scatter';
      template: string;
      count?: number;
      region: { min: [number, number, number]; max: [number, number, number] };
      onMaterial?: string[];
      minSpacing?: number;
      scale?: [number, number];
      randomYaw?: boolean;
      seed?: number;
      parent?: string;
    }
  | { op: 'collision_groups'; action: 'register' | 'set_collidable' | 'assign'; group: string; other?: string; collidable?: boolean; paths?: string[] }
  | { op: 'collision_groups_list' }
  | {
      op: 'terrain_shape';
      action: 'fill_cylinder' | 'fill_wedge' | 'clear_region' | 'smooth' | 'heightmap' | 'appearance';
      center?: [number, number, number];
      size?: [number, number, number];
      height?: number;
      radius?: number;
      rotationY?: number;
      min?: [number, number, number];
      max?: [number, number, number];
      material?: string;
      subMaterial?: string;
      strength?: number;
      octaves?: number;
      seed?: number;
      amplitude?: number;
      scale?: number;
      water?: { color?: [number, number, number]; transparency?: number; reflectance?: number; waveSize?: number; waveSpeed?: number };
      decoration?: boolean;
      materialColors?: Record<string, [number, number, number]>;
    }
  | { op: 'terrain_read'; min: [number, number, number]; max: [number, number, number] }
  | {
      op: 'create_rig';
      rigType?: 'R15' | 'R6';
      name?: string;
      position?: [number, number, number];
      parent?: string;
      bodyColors?: Partial<Record<'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg', [number, number, number]>>;
      scale?: Partial<Record<'height' | 'width' | 'depth' | 'head' | 'proportion' | 'bodyType', number>>;
      npc?: boolean;
      displayName?: string;
    }
  | { op: 'ui_layout_check'; screen: string; devices?: UiLayoutDevice[] }
  /** play_check plus presses (F-050): each `press` path is a GuiButton inside a ScreenGui in StarterGui. */
  | { op: 'play_check_ui'; seconds?: number; touch?: string[]; press: string[] }
  | { op: 'preview_sound'; soundId: string; volume?: number } // D-FXLIB-1: plays a library sound in Studio only
  // Read-only: asks Studio whether asset ids load (ContentProvider:PreloadAsync), inserts nothing. Data: { results: { [id]: 'Success' | 'Failure' | 'TimedOut' }, elapsedMs }
  | { op: 'preload_content'; items: { id: string; type?: 'image' | 'mesh' | 'sound' | 'animation' | 'texture' | 'other' }[]; timeoutMs?: number };

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
    /** Terrain surface cells drawn. Absent from renderers older than 2026-09-23, which drew no Terrain. */
    terrainCells?: number;
  };
}

/**
 * Whether these images can show Roblox Terrain. Plugins before 2026-09-23 rendered BaseParts only, so
 * a terrain island was invisible to every critique of it ("a flat slab with no underside", 2/10 on an
 * island that had one) — and every store customer runs such a plugin until the next publish.
 */
export function renderShowsTerrain(result: { views: { meta: { terrainCells?: number } }[] }): boolean {
  return result.views.some((v) => typeof v.meta.terrainCells === 'number');
}

/** Told to every critic when the images cannot show Terrain. */
export const TERRAIN_BLIND_NOTE =
  'THESE IMAGES CANNOT SHOW ROBLOX TERRAIN. Landforms, islands, ground, rock, grass and water made of Terrain are ' +
  'absent from them even when they exist in the place. Never report a missing, flat or floating landform, underside, ' +
  'ground or water as a defect; judge only the parts you can see.';

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
  /** Native active viewport may exist without any software-renderable geometry. */
  softwareRenderError?: string;
  targetFramed?: boolean;
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
   * pressing "Enable edits…" twice in the StudPilot panel two inches away.
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
  edit_consent: 'In Studio, open the StudPilot panel and press “Enable edits…”, then “Allow edits for this connection”. Consent is per connection and turns off when you disconnect.',
  /** Studio is running a test, so the plugin will not write. */
  leave_test_mode: 'Stop the running test in Studio (the ⏹ Stop button) and ask again — StudPilot only edits in edit mode.',
  /** The asset is not in the signed-in user's inventory. */
  take_asset_first: 'StudPilot could not load this model. Choose another one, or add it to your Roblox inventory and try again.',
  /** The requested target is outside the scope the plugin will write to. */
  choose_allowed_target: 'Ask for a target inside the place StudPilot may write to — Workspace, ServerStorage, ServerScriptService, ReplicatedStorage, StarterGui, StarterPack or StarterPlayer.',
  /** The asset carried code, which this product will not insert on anyone's behalf. */
  choose_scriptless_asset: 'Pick a different asset, or take that one yourself in Studio. StudPilot inserts geometry, never code it did not write.',
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
  schema: 'studpilot.studio-ops.v1';
  operations: PluginOperationCapability[];
}
export interface PluginPollRequest {
  results?: OpResult[];
  events?: StudioEvent[];
  state?: StudioEventState;
  /** Optional so legacy plugins keep the exact poll contract they already use. */
  capabilities?: PluginCapabilityReportV1;
  /** The dock's answer to the asset-source question (F-059): the choices the person picked. */
  assetSourcesAnswer?: { allow: string[] };
  /** Present only when this Studio build can display and answer that question. */
  assetSourcesPrompt?: true;
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
  /**
   * Present while a build is waiting on the asset-source answer, and once after the dock answers
   * (F-059). `owed` shows or hides the question; `message` says why an answer did not take.
   * Only a transient save failure asks the dock to resend the same answer.
   */
  assetSources?: { owed: boolean; message?: string; retryable?: boolean };
}

// ---------------------------------------------------------------------------
// Agent + chat protocol (web <-> DO over WebSocket)
// ---------------------------------------------------------------------------

/**
 * There are no customer modes (V3 gate G01: no Plan/Agent/Autonomous selector): every request runs
 * the one StudPilot behaviour. `mode: 'agent'` stays on the wire only as a compatibility bridge for
 * clients and workers that still send or require it; the server ignores the value it receives
 * (legacy `plan`, `autonomous` included) and stored `plan` rows are read back as `agent`.
 */
export type ProductMode = 'agent';

/**
 * The engine a request ran on, deliberately separate from `ProductMode` (the legacy wire field).
 * There is one, StudPilot (./models.ts, V3 gate G01); the name is kept because `productModel` is a wire
 * field. Values from older clients and stored rows are normalized
 * to StudPilot by `normalizeModelId`, never refused.
 */
export type ProductModel = ModelId;

/** The customer engines, in display order: StudPilot alone. */
export const PRODUCT_MODELS: readonly ProductModel[] = MODEL_IDS;

export const PRODUCT_MODEL_INFO: Record<ProductModel, { name: string; blurb: string }> = Object.fromEntries(
  MODEL_REGISTRY.map((m) => [m.id, { name: m.displayName, blurb: m.blurb }]),
) as Record<ProductModel, { name: string; blurb: string }>;

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
  | { type: 'chat'; text: string; mode: ProductMode; productModel?: ProductModel; uiTheme?: UiTheme; attachments?: ChatAttachment[] }
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
  | { type: 'edit_resend'; messageId: string; text: string; mode: ProductMode; productModel?: ProductModel; uiTheme?: UiTheme }
  | { type: 'stop' } // interrupt agent
  /** Resume a run paused because Studio disconnected (G03). Only this resumes it; a reconnect never does. */
  | { type: 'continue' }
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
  | 'composing' // the model is writing its next step (after a tool, before the next one)
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
    // Lifting the run's focused toolset reads nothing and changes nothing: it is planning.
    case 'more_tools':
      return 'planning';
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
    // A search over the bundled UI/icon library index; reads nothing of the project.
    case 'find_ui_asset':
    // D-FXLIB-1: searches over the bundled sound and effect library, and a local audition of one
    // sound that is never put in the place.
    case 'find_sound':
    case 'find_vfx':
    case 'play_library_sound':
    // D-MODELLIB-1: a search over the bundled 3D model library index; touches nothing.
    case 'find_library_model':
    // Looking at candidates off the place (staged in ServerStorage, measured, taken away again): a read, the agent's own look.
    case 'preview_library_models':
    case 'find_verified_asset':
    case 'inspect_model':
    // model_anatomy asks the place about one model's parts, joints and hinges and changes nothing.
    case 'model_anatomy':
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
    case 'docs_lookup':
    case 'github_lookup':
    case 'git_history':
    case 'ocr_image':
    case 'workspace_list':
    case 'workspace_read':
    // Capturing a page is looking at it. NOT `rendering`, which in this product means the plugin
    // is rasterising the Roblox scene — a different machine doing a different thing.
    case 'screenshot_page':
    // Phase A readers (D-VISION-1): each asks the place a question — what matches, what is below
    // this point, what Terrain holds here, does this screen fit a phone — and changes nothing.
    case 'search_instances':
    case 'spatial_query':
    case 'read_terrain':
    case 'check_ui_layout':
    // Reading the owner's private library and a project's own attached image: each looks something
    // up and changes nothing in the place.
    case 'inspect_attachment_image':
    case 'query_owner_catalog':
    case 'query_owner_assembly':
    case 'read_owner_media':
    case 'list_owner_original_strings':
    case 'read_owner_original_string':
    case 'read_owner_component':
    case 'browse_owner_library':
      return 'inspecting';
    // Working out the design of a game reads the owner's library and moves nothing: it is the planning step of a build.
    case 'plan_game':
      return 'planning';
    // Announcing the plan is not doing the work. This tool runs before anything in the project
    // moves, so the one phase it must never fall through to is the `default` below — 'building'
    // would have the workspace claim the place is being changed at the exact moment it is not.
    case 'propose_plan':
      return 'planning';
    // Writing a file into StudPilot's own store, which is what `remembering` already covers: it is
    // the phase for durable state that belongs to StudPilot rather than to the place. `building`
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
    case 'build_scene':
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
    // D-MODELLIB-1: puts a library model into the place, the same act as insert_asset.
    case 'insert_owner_component':
    case 'import_owner_library':
    case 'recreate_owner_game':
    case 'install_owner_system':
    case 'build_game':
    case 'compose_game':
    case 'insert_library_model':
    case 'generate_model':
    case 'generate_model_external':
    case 'generate_image':
    case 'generate_ui_image_hf':
    // Puts a library PNG into the user's Roblox account and nothing into the place, the same act
    // as the generators beside it: an asset is produced for the build to use.
    case 'upload_ui_asset':
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
    // Phase A writers (D-VISION-1): bulk property changes, scattered copies, collision groups,
    // terrain shapes, character rigs and whole UI screens all change the open place.
    case 'set_properties_bulk':
    case 'scatter_instances':
    case 'collision_groups':
    case 'shape_terrain':
    case 'create_rig':
    case 'build_ui':
    case 'insert_ui_component':
    case 'build_studded_ui':
    case 'add_upgrades':
    case 'animate_model':
    // add_behaviour writes a behaviours script into the model and installs the one script that plays it.
    case 'add_behaviour':
    case 'build_object':
    // Opt-in presentation of an object already in the place (stage, click response, counter, attached piece).
    case 'dress_object':
    case 'insert_sound':
    case 'insert_vfx':
      return 'building';
    case 'render_view':
    // Framing a store-page image IS a rasterise of the place — the same five camera angles, at the
    // aspect ratio Roblox requires — so it announces the same phase. It changes nothing in the
    // place, which is why it must not fall through to the `building` default below.
    case 'compose_thumbnail':
    // The plugin rasterises the live Studio viewport; nothing in the place changes.
    case 'capture_studio_viewport':
    // The self-check's look aims the viewport camera at what was changed, captures it from several angles and
    // puts the camera back. Nothing in the place changes, so it announces the same phase as the capture.
    case 'look':
      return 'rendering';
    case 'check_composition':
    case 'inspect_visually':
    // audit_build and run_spec are judgement, not construction: they measure what is already
    // there and report defects. They belong beside the other critics.
    case 'audit_build':
    case 'run_spec':
      return 'critiquing';
    case 'run_and_check':
    case 'play_check':
    case 'play_check_ui':
    // Judging the finished game plays it (up to three short Test sessions), so it announces the phase that says so.
    case 'judge_game':
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
   * Where the request did not say and StudPilot DECIDED ANYWAY — a mood read off "cozy", a focal
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
  /**
   * Present while the run is paused because the paired Studio place is not connected (G03). Nothing
   * runs until the place is back AND the user sends `continue`.
   */
  paused?: { reason: StudioPauseReason; at: number };
}

export type StudioPauseReason = 'unpaired' | 'disconnected' | 'place_mismatch';

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
  /** Actual engine resolution before bounded transport resampling. */
  nativeWidth?: number;
  nativeHeight?: number;
  resampled?: boolean;
  captureMethod?: 'capture_service';
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
  /** What the worker is doing at this instant, in English. */
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
  /**
   * A build needs the asset-source answer and nobody has given it (F-059): `owed` true shows the
   * question on every surface, false says it has been answered — here or in Studio.
   */
  | { type: 'asset_sources_owed'; owed: boolean }
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
  | { type: 'msg_start'; msgId: string; role: 'assistant'; mode: ProductMode; productModel?: ProductModel; userMsgId?: string }
  | { type: 'delta'; msgId: string; text: string }
  /**
   * The model's own reasoning as the provider returns it (D-REASONING-2: plain text, never the prompt), streamed while
   * a step runs. `step` groups it: a new step starts a new reasoning block. The web app shows it in AI Elements'
   * Reasoning (open while it streams, collapsed with its duration when the step ends).
   */
  | { type: 'reasoning_delta'; msgId: string; step: number; text: string }
  /** Where an answer's facts came from: Roblox Creator Docs pages, Creator Store / library items, other links. */
  | { type: 'sources'; msgId: string; sources: RunSource[] }
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
      /**
       * THE REPLY AS STORED — the exact text a reload of this conversation shows (F-045,
       * 2026-09-23). The live deltas show every step's text; the stored reply is the last step's,
       * or the closing the product wrote in its place. A client that settles on this field reads
       * the reply once, and reads the same reply live and after a reload. Optional: an older
       * worker omits it and the streamed text stands.
       *
       * THE CLOSING CONTRACT. On `incomplete` this text always ends with the product's own closing
       * sentence (finishRun never stores an incomplete reply without one), so a client must not add
       * a second sentence saying the same thing.
       */
      content?: string;
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
  /**
   * A RUN'S COST, SETTLED AFTER ITS `msg_end` WENT OUT.
   *
   * Stop ends a run at once while its model step is still in flight, so `msg_end` carries the cost known at
   * that instant (the admission). The abandoned step is paid for when the provider call resolves (`settleAbandonedStep`
   * in do/session.ts), and this tells the message what the run cost in the end, in
   * ledger units like `msg_end.creditsSpent`, so the live turn footer and the stored row agree. Sent only when
   * the settlement took something; a client that does not know it keeps the `msg_end` figure.
   */
  | { type: 'run_cost'; msgId: string; creditsSpent: number }
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
   * so: the agent simply never used it, and "why did StudPilot not run that script" had no answer in
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
   * A message sent while a run is working (G10). `queued`: held for the next safe point between
   * tool steps. `applied`: handed to the run there. `dropped`: the run ended first, so it was not applied.
   */
  | { type: 'steer'; id: string; state: 'queued' | 'applied' | 'dropped' }
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

/** The first instant of the next UTC month: when a monthly limit lifts. */
export function nextMonthResetIso(now: number): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Which limit is the one a person is held by, and when THAT one lifts. */
export interface QuotaLimit {
  period: 'day' | 'month';
  /** 'Daily' | 'Monthly' */
  label: string;
  /** 'today' | 'this month' */
  window: string;
  /** The instant it lifts: the next UTC midnight, or the first instant of the next UTC month. */
  resetsAtIso: string;
  /** 'at midnight UTC' | 'on 1 November at 00:00 UTC', for "They refill ...". */
  refillWhen: string;
}

/**
 * WHICH LIMIT STOPPED A PERSON, AND WHEN IT REALLY LIFTS.
 *
 * The ledger spends min(dayLeft, monthLeft). Free's 30 a month is used up in six full days, and from then on the
 * day is not what stops anybody: "Daily Credits are used up. They refill at midnight UTC" promised the allowance
 * back in hours when it is weeks away. Every sentence that names a limit or a refill reads it here. A tie names
 * the month (tomorrow's midnight would refill nothing), as the usage meter always did. A state without the
 * figures reads as the day, the wire's own `resetsAtIso`.
 */
export function quotaLimit(
  q: Partial<Pick<QuotaState, 'creditsDaily' | 'creditsUsedToday' | 'creditsMonthly' | 'creditsUsedThisMonth' | 'resetsAtIso'>> | null | undefined,
  now: number = Date.now(),
): QuotaLimit {
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  const dayLeft = finite(q?.creditsDaily) && finite(q?.creditsUsedToday) ? Math.max(0, q.creditsDaily - q.creditsUsedToday) : null;
  const monthLeft = finite(q?.creditsMonthly) && finite(q?.creditsUsedThisMonth) ? Math.max(0, q.creditsMonthly - q.creditsUsedThisMonth) : null;
  if (dayLeft !== null && monthLeft !== null && monthLeft <= dayLeft) {
    const resetsAtIso = nextMonthResetIso(now);
    const first = new Date(resetsAtIso);
    return {
      period: 'month',
      label: 'Monthly',
      window: 'this month',
      resetsAtIso,
      refillWhen: `on 1 ${MONTH_NAMES[first.getUTCMonth()]} at 00:00 UTC`,
    };
  }
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return {
    period: 'day',
    label: 'Daily',
    window: 'today',
    resetsAtIso: typeof q?.resetsAtIso === 'string' && Number.isFinite(Date.parse(q.resetsAtIso)) ? q.resetsAtIso : midnight.toISOString(),
    refillWhen: 'at midnight UTC',
  };
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
   * Null means two different true things and neither of them is "you": StudPilot took this one itself
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
  /** The selected model, when this message was created by a model-aware client. */
  productModel?: ProductModel;
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
  /** Why a failed step failed, as the tool said it (capped). Kept so a reported run can be diagnosed; not drawn. */
  error?: string;
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
  /** Named native tool choice; must already be present in tools. */
  requiredTool?: string;
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
  /** The provider's own reasoning text (GLM reasoning_content), shown as-is (D-REASONING-2); never fed back to the model. */
  reasoning?: string;
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
 * measurements. IT IS IN LEDGER UNITS (INTERNAL_PER_CREDIT of them to a credit), so a surface that
 * shows it to a person converts it with `internalToCredits` first.
 */
/*
 * AND `entryUnit`, WHICH IS THE PIECE OF WORK THE LOW END OF `typicalCredits` WAS MEASURED ON.
 *
 * `typicalCredits` is what one REQUEST costs, and a request is a single targeted edit that is read
 * back and verified, not a build. A whole build is several of them and costs about
 * TYPICAL_BUILD_CREDITS (BUILD_COSTS). A surface that prints the per-request figure without saying
 * what a request is reads as a price for a build, and a reader divides and finds the product 19x
 * apart from itself on the one question that matters: what will this cost me. The words come from
 * the COST-MODEL row the low figure is derived from, so there is one measurement and one sentence
 * about it. The usage page prints it beside the figure.
 */
export const MODE_INFO: Record<
  ProductMode,
  { name: string; blurb: string; typicalCredits: string; entryUnit: string }
> = {
  agent: {
    name: 'Agent',
    blurb: 'Builds features across your project',
    typicalCredits: '4-18',
    entryUnit: 'one targeted edit, read back and verified',
  },
};

/** The BUILD_COSTS row a roadmap milestone of each size is priced as. */
const BUILD_ROW_OF_SIZE = { small: 'small', medium: 'typical', large: 'big' } as const;

/**
 * WHAT A PIECE OF WORK COSTS, WHEN IT TAKES MORE THAN ONE RUN.
 *
 * A roadmap milestone is sized in runs ("about two Agent runs") and in size (small, medium, large). Nobody is billed
 * in runs, so the card also prints what the work costs: `runs x` the published cost of ONE BUILD OF THAT SIZE. The
 * multiplication is the whole value: reprinting one build's cost on a multi-run card would understate the work by
 * that factor.
 *
 * THE PRICE OF A RUN IS A BUILD'S, NOT AN EDIT'S. This read `MODE_INFO.agent.typicalCredits`, which is what a targeted
 * edit costs (4-18 ledger units, 0.03-0.12 credits), so a milestone chip printed a figure below the cheapest build on
 * the pricing page (0.52 credits) and a fortieth of a typical one (1.40). A milestone is building work. Its size is
 * priced as the build table prices it: small, medium and large are the `small`, `typical` and `big` rows of
 * BUILD_COSTS, and the big row stays flagged as an estimate because the table says it is one.
 *
 * It READS BUILD_COSTS rather than keeping its own table, so there is exactly one place a price is written down. A
 * second copy of a price is a second copy free to drift, which is the defect scripts/check-credit-figures.mjs exists
 * because of. BUILD_COSTS is in credits; the result is in LEDGER UNITS (INTERNAL_PER_CREDIT to a credit), the unit
 * the worker sends and the web converts back to credits for a person (creditsText).
 *
 * Returns a RANGE even when the published figure is a single number. It never collapses a spread to one number.
 * `null` for a run count that is not a positive whole number, and for a size nobody published: an unreadable input
 * produces no figure rather than a wrong one, because a wrong price is worse than a missing one.
 */
export function creditRangeForRuns(
  complexity: keyof typeof BUILD_ROW_OF_SIZE,
  runs: number,
): { low: number; high: number; estimated: boolean } | null {
  if (!Number.isInteger(runs) || runs < 1) return null;
  const rowId = Object.hasOwn(BUILD_ROW_OF_SIZE, complexity) ? BUILD_ROW_OF_SIZE[complexity] : undefined;
  const build = rowId === undefined ? undefined : BUILD_COSTS.find((b) => b.id === rowId);
  if (!build) return null;
  const low = Math.round(build.creditsLow * INTERNAL_PER_CREDIT);
  const high = Math.round(build.creditsHigh * INTERNAL_PER_CREDIT);
  if (!(low > 0) || high < low) return null;
  return { low: low * runs, high: high * runs, estimated: build.estimated };
}

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
//   economy.roblox.com/v2/assets/<id>/details       -> 200 (AssetTypeId 38, "StudPilot")
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
 * The StudPilot Studio plugin's Roblox asset id. The one literal; derive, never retype.
 *
 * Republished 2026-09-19 as a NEW asset on a different account. The previous id,
 * 132128477945417, is `Golem` on Herobrine583522 and its Creator Dashboard carries a standing
 * refusal — "Not distributed on Creator Store. This asset may be in violation of Roblox Community
 * Standards... you can appeal" — with the distribution toggle already ON. That is a content
 * decision, not a missing click, and no id change argues with it; see
 * docs/evidence/plugin-store-blocked-2026-09-19.md. Three publish attempts from that account also
 * returned a bare "Submission failed".
 *
 * The current id is `StudPilot Studio`, AssetTypeId 38, creator Shahar474 (5541122967), confirmed
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
 * site and three tests. That was survivable while there was one host. It is now https://studpilot.app
 * (the Worker named studpilot, custom domain). The two former workers.dev hosts are stand-ins
 * until 2027-01-02 (infra/legacy-proxy): API paths pass through to the product unchanged, a page
 * load is a 301 here. Nothing the product ships may name them as the product; the one exception
 * is the Studio plugin's fallback for ONE release (Bridge.luau), because a published plugin has
 * to keep working while the person grants Studio's network permission for the new host.
 *
 * The legacy-host redirect in apps/worker/src/index.ts reads this constant rather than typing the
 * destination beside the redirect, because a redirect pointing somewhere slightly different from
 * the canonical origin is a loop waiting to happen.
 */
export const PRODUCT_ORIGIN = 'https://studpilot.app';

/**
 * The hostname the product used to answer on (the golem host; the apple host went the same way).
 * Named so a guard can assert it is not serving pages, rather than everyone agreeing to remember
 * it. Both are stand-ins that vanish on 2027-01-02, so nothing may be written to depend on them.
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
 *   StudPilot Studio     107230158271368  -> 404
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
 *      StudPilot id 404, an id that cannot exist 404;
 *   2. the store page, rendered signed out, shows "StudPilot Studio - Creator Store" with a
 *      "Get Plugin" button, and Creator Store search for "StudPilot Studio" returns exactly this id;
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
 * FLIPPED AGAIN 2026-09-24 ~02:35 IDT: the appeal on the final build (3Jj4h4hPWRTA3QPDRlNRmejqPrP,
 * sent 2026-09-23 14:02 IDT) was upheld. Re-probed 2026-09-23T23:34:48Z: ours 200 (visibilityStatus 1,
 * isAssetHashApproved, published + free, updatedUtc 2026-09-23T11:00:54Z, 7 scripts — the final
 * build), Rojo 7 and Moon Animator 2 both 200, the impossible id and the retired StudPilot id 404. The
 * signed-out store page renders "StudPilot Studio - Creator Store" with a "Get Plugin" button, and the
 * Configure page no longer shows the violation notice. Evidence:
 * docs/autonomy/evidence/20260924T0000Z-store-listed-again/README.md.
 *
 * FLIPPED BACK 2026-09-25: the 1.4.0 overwrite was accepted in Studio, but a separate
 * Herobrine583522 browser still renders the asset page as 404. The toolbox details probe
 * returns 404 for this id and the retired id, while Rojo 7 and Moon Animator 2 both return
 * 200 in the same check. This proves the public install path is unavailable; it does not
 * establish whether moderation or a distribution setting caused it (Q-020).
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
 * readers assume the first. Roblox made a moderation decision in September, and the public
 * installation path is again unavailable on 2026-09-25. The current cause is unknown (Q-020),
 * so a reader deciding whether to wait deserves that distinction.
 *
 * `null` would mean "not refused". A non-null value is a recorded moderation decision, sourced from
 * roblox.com/report-appeals for this asset id — not from the dashboard banner, which names no rule.
 *
 * It was `null` from 2026-09-22 while the listing resolved publicly. It was set again on
 * 2026-09-23 when version 2 was removed for the same rule (see below). It remains `null` now
 * because the 2026-09-25 public 404 does not establish a new moderation decision.
 * The earlier decision is kept here as history, not as state: 'Misusing Roblox Systems',
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
// 3JhaXRZAqvmSw5iIhea5QZgT67R. Per the owner (docs/autonomy/DECISIONS.md D-STORE-2) the appeal was sent
// with the product's final plugin build: removal 3Jj4h4hPWRTA3QPDRlNRmejqPrP (2026-09-23 14:00 IDT,
// 'Misusing Roblox Systems'), appealed 14:02 IDT.
// null again from 2026-09-24: that appeal was upheld and the final build resolved publicly then.
// The 2026-09-25 public 404 does not establish a new refusal (Q-020).
export const STUDIO_PLUGIN_STORE_REFUSAL: StudioPluginStoreRefusal | null = null;

/**
 * Where an "install" affordance may actually send someone TODAY.
 *
 * ADR-017 decision 3 says copy degrades honestly rather than "shipping a link
 * that 404s". A button pointing straight at the store while the asset is not
 * distributable does exactly that: the reader arrives at a page with nothing to
 * get and no explanation. So until the probe returns 200, every install
 * affordance goes to `/docs/plugin`, which states plainly that public installation is
 * unavailable and becomes a working install guide the moment distribution is verified.
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

// ---------------------------------------------------------------------------
// THE PRICING CONFIG. One table; the site, the app and QuotaDO all read it.
// ---------------------------------------------------------------------------
//
// Owner decisions of 2026-10-04 (planning/pricing-2026-10-04.md). Everything a person is quoted
// (price, credits, how many builds that is) and everything the ledger enforces (PLAN_LIMITS, in
// ledger units) is DERIVED from `PLAN_TABLE` below, so a page disagreeing with the thing enforcing
// it has no second number to disagree with. The tests in apps/worker/tests/plan-economics.test.mjs
// recompute the profit of every plan from these numbers and fail below $0.

/** One credit, as a person is shown it, is this many US dollars of AI compute (Workers AI cost). */
export const CREDIT_USD = 0.05;

/**
 * Ledger units in one credit. The ledger (QuotaDO, the run charge, `QuotaState`) counts in units of
 * NEURONS_PER_CREDIT neurons; a credit is 150 of them. 150 x 30 neurons x $0.011 per 1,000 neurons
 * is $0.0495, the decided $0.05 less 1%: the exact quotient is 151.5 and the owner's round figure
 * is the multiple of ten below it. apps/worker/tests/plan-economics.test.mjs derives the quotient
 * from NEURONS_PER_CREDIT and the neuron price in apps/worker/src/pricing.ts and fails if this
 * number stops being that figure, so it is a pinned decision and not a second source of truth.
 */
export const INTERNAL_PER_CREDIT = 150;

/** The card fee the plan-profit test charges against every payment: 2.9% plus $0.30. */
export const CARD_FEE = { rate: 0.029, fixedUsd: 0.3 } as const;

/**
 * What a typical build costs, in credits (pricing doc: about $0.07). The cards turn an allowance
 * into "about N builds" with it, and `approxBuilds` below may never promise more than this allows.
 */
export const TYPICAL_BUILD_CREDITS = 1.4;

/**
 * The plans. Credits here are the credits people see (see CREDIT_USD), not ledger units.
 *
 * THE KEYS ARE STORED IDENTIFIERS (QuotaDO, the profiles.plan constraint, Stripe price mapping) and
 * do not change: `builder` is shown as Pro, `studio` as Max. `enterprise` stays a valid stored id
 * so a row holding it still resolves, but it is `listed: false` and never displayed; it carries
 * Max's allowance because no number was ever decided for it.
 *
 * `approxBuilds` is the pricing doc's "about how many builds" column, typed from the doc and bounded
 * by TYPICAL_BUILD_CREDITS in the test. The paid plans' `creditsPerDay` are NOT in the pricing doc
 * (it decides only the monthly pools); they were set so a paid plan never grants less per day
 * than Free, affords a 12-credit big build, and stays under the whole-service daily ceiling that
 * scripts/check-offer.mjs holds every plan to. The owner confirms or replaces them.
 */
export const PLAN_TABLE = {
  free: { name: 'Free', priceUsdMonthly: 0, creditsPerDay: 5, creditsPerMonth: 30, approxBuilds: 20, listed: true },
  builder: { name: 'Pro', priceUsdMonthly: 9.99, creditsPerDay: 20, creditsPerMonth: 100, approxBuilds: 70, listed: true },
  studio: { name: 'Max', priceUsdMonthly: 24.99, creditsPerDay: 30, creditsPerMonth: 300, approxBuilds: 200, listed: true },
  enterprise: { name: 'Enterprise', priceUsdMonthly: null, creditsPerDay: 30, creditsPerMonth: 300, approxBuilds: 200, listed: false },
} as const;

/** The top-up pack: credits that do not expire, bought once. Checkout for it is off (CREDIT_PURCHASE_LIVE). */
export const TOPUP_PACK = { priceUsd: 4.99, credits: 50, approxBuilds: 35 } as const;

/**
 * What builds cost, from the pricing doc. `estimated` rows are not measured yet. The dollar figure
 * of a row is its credits x CREDIT_USD and is never stored.
 */
export const BUILD_COSTS = [
  { id: 'small', label: 'Small', creditsLow: 0.52, creditsHigh: 1.4, estimated: false },
  { id: 'typical', label: 'Typical', creditsLow: TYPICAL_BUILD_CREDITS, creditsHigh: TYPICAL_BUILD_CREDITS, estimated: false },
  { id: 'big', label: 'Big (systems, zones; up to 10 minutes)', creditsLow: 4, creditsHigh: 12, estimated: true },
] as const;

export type PlanId = keyof typeof PLAN_TABLE;

export const PLAN_IDS = Object.keys(PLAN_TABLE) as PlanId[];

/** The ids PLAN_TABLE marks `listed`, as a type, so a displayed plan's price is a number and never null. */
export type ListedPlanId = { [K in PlanId]: (typeof PLAN_TABLE)[K]['listed'] extends true ? K : never }[PlanId];

/** The plans a page or the app may show. Enterprise is a stored id only. */
export const LISTED_PLAN_IDS: readonly ListedPlanId[] = PLAN_IDS.filter((id): id is ListedPlanId => PLAN_TABLE[id].listed);

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === 'string' && (PLAN_IDS as string[]).includes(v);
}

/**
 * What QuotaDO enforces, in LEDGER units (see INTERNAL_PER_CREDIT): the table above x 150.
 * Free is 5 credits a day and 30 a month, which is 750 and 4,500 here; it was 231 and 2,310.
 */
export const PLAN_LIMITS = Object.fromEntries(
  PLAN_IDS.map((id) => [
    id,
    {
      creditsPerDay: PLAN_TABLE[id].creditsPerDay * INTERNAL_PER_CREDIT,
      creditsPerMonth: PLAN_TABLE[id].creditsPerMonth * INTERNAL_PER_CREDIT,
    },
  ]),
) as Record<PlanId, { readonly creditsPerDay: number; readonly creditsPerMonth: number }>;

/** Ledger units to the credits a person is shown. Nothing is rounded here; the formatter does that. */
export function internalToCredits(internal: number): number {
  return internal / INTERNAL_PER_CREDIT;
}

/** Credits for a reader: two decimals, always ("3.54", "5.00"), en-US because product text is English. */
export function formatCredits(credits: number): string {
  if (typeof credits !== 'number' || !Number.isFinite(credits)) return '';
  return credits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * A LEDGER-UNIT figure as the credits a person reads: two decimals ("3.54"). Everything a person
 * reads that names an amount of Credits (the app, a notification, a Discord reply, a refund
 * sentence) is written through this, because the figures QuotaDO and the run charge carry are
 * ledger units, INTERNAL_PER_CREDIT to a credit, and a raw one printed beside the word "Credits" is
 * 150 times too big.
 */
export function creditsText(ledgerUnits: number): string {
  return formatCredits(internalToCredits(ledgerUnits));
}

/**
 * What a branding generation charges, in ledger units. One model pass, taken from the same ledger
 * as a run. The worker spends it and the app prints it through creditsText, so the copy cannot say
 * a different amount than the charge.
 */
export const BRANDING_COST_UNITS = 1;

export interface PlanCopy {
  id: PlanId;
  name: string;
  /** One line: who the plan is for, not what it costs. */
  blurb: string;
  /**
   * Monthly price in USD, or null for a plan that is not self-serve. Read from PLAN_TABLE, never
   * typed here: the owner's numbers are in one place.
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
  // en-US unless told otherwise, never the browser's own: a price is product text, and product text
  // is English (V3 handoff §1) — a Hebrew or Arabic browser would otherwise reorder or re-digit it.
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '';
  const currency = opts.currency ?? PRICE_CURRENCY;
  const fractionless = Number.isInteger(amount) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {};
  try {
    return new Intl.NumberFormat(opts.locale ?? 'en-US', { style: 'currency', currency, ...fractionless }).format(amount);
  } catch {
    // A malformed or unknown code. The amount still has to reach the page.
    return new Intl.NumberFormat(opts.locale ?? 'en-US', { style: 'currency', currency: PRICE_CURRENCY, ...fractionless }).format(amount);
  }
}

/** How many times the Free monthly allowance a plan's monthly pool is, to the nearest whole number. */
function allowanceMultiple(id: PlanId): number {
  return Math.round(PLAN_TABLE[id].creditsPerMonth / PLAN_TABLE.free.creditsPerMonth);
}

/** Name and price come from PLAN_TABLE; only the prose is written here. */
function planCopy(id: PlanId, blurb: string, highlights: string[]): PlanCopy {
  return { id, name: PLAN_TABLE[id].name, blurb, priceUsdMonthly: PLAN_TABLE[id].priceUsdMonthly, highlights };
}

export const PLAN_COPY: Record<PlanId, PlanCopy> = {
  free: planCopy('free', 'Enough to build something real and see whether StudPilot suits you.', [
    'The same StudPilot engine as every plan',
    STUDIO_PLUGIN_STORE_LIVE ? 'Studio plugin' : 'Studio integration · public installation unavailable',
    'Checkpoints and restore',
  ]),
  // THE ID STAYS `builder`; ONLY THE NAME IS "Pro" (D-VISION-1). The id is stored in QuotaDO and
  // mapped to a Stripe price, so renaming it would orphan every existing subscription.
  //[[ 'Priority during busy periods' IS GONE, and it was the third reason to pay.
  //
  //   No plan buys a place in the queue — docs/credits-and-limits says so in the product's own
  //   documentation, two clicks from the pricing card that was selling it. Paying changes your
  //   allowance, not your turn. Owner's decision, 2026-09-20: remove the claim rather than build
  //   the feature. Selling a thing that does not exist is the defect; a shorter honest card is not. ]]
  builder: planCopy('builder', 'For building most days.', [
    `About ${allowanceMultiple('builder')}× the Free monthly allowance`,
    'Buy credits when you need more',
    'Everything in Free',
  ]),
  // Likewise `studio` is shown as "Max".
  studio: planCopy('studio', 'For sustained building with a larger allowance.', [
    `About ${allowanceMultiple('studio')}× the Free monthly allowance`,
    'Everything in Pro',
  ]),
  // Not displayed (PLAN_TABLE.enterprise.listed is false); kept so the stored id still resolves.
  enterprise: planCopy('enterprise', 'For studios with their own limits, terms and support needs.', [
    'Negotiated limits',
    'Invoicing',
    'Direct support',
  ]),
};

/**
 * The one address support reaches a human at.
 *
 * IT WAS TWO. The marketing site, the docs footer, the status page and the FAQ all used the
 * owner's personal Gmail inbox; the plan ladder in the signed-in app — the only support-ish link
 * anywhere behind the login — used hello@studpilot.build. A customer cannot tell which of those is
 * read, and writing to the wrong one looks, from their side, exactly like being ignored.
 *
 * Declared here so the two halves of the product cannot drift again, and asserted across both
 * trees by tests/support-expectations.test.mjs.
 *
 * support@studpilot.app is the owner's decision of 2026-10-05 (planning/proof/OWNER-DECISIONS.md D-13): Cloudflare
 * Email Routing forwards it to the owner's own inbox, so a person still reads it.
 */
export const SUPPORT_EMAIL = 'support@studpilot.app';

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
    promise: 'A human reads it. While StudPilot is in beta no reply time is promised, and busy weeks are slower.',
  },
  builder: {
    channel: `Email ${SUPPORT_EMAIL}`,
    promise: 'A human reads it, and paid accounts are answered first. No reply time is promised while StudPilot is in beta.',
  },
  studio: {
    channel: `Email ${SUPPORT_EMAIL}`,
    promise: 'A human reads it, and paid accounts are answered first. No reply time is promised while StudPilot is in beta.',
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
 *
 * This is the LEDGER unit's size. What a person is shown as one credit is INTERNAL_PER_CREDIT of
 * these (CREDIT_USD of compute); no page quotes this number as a credit.
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

/**
 * Ledger units in one quality-gated build, from the measured neuron cost: about half a credit
 * (77 / INTERNAL_PER_CREDIT), the floor of the pricing doc's "small" build. A plan is not quoted in
 * these; they remain the engine's own accounting unit (the free-tier affordability rule in
 * scripts/check-offer.mjs and the worker's cost checks).
 */
export const CREDITS_PER_BUILD = 77;

/**
 * A plan's allowance in the unit people actually think in: the pricing doc's "about how many
 * builds" figure, read from PLAN_TABLE (bounded by TYPICAL_BUILD_CREDITS in the plan-economics
 * test, so it can only understate).
 */
export function buildsPerMonth(plan: PlanId): number {
  return PLAN_TABLE[plan].approxBuilds;
}

/** Typical builds one day's allowance affords. Floored, because a rounded-up figure is a promise the allowance cannot keep. */
export function buildsPerDay(plan: PlanId): number {
  return Math.floor(PLAN_TABLE[plan].creditsPerDay / TYPICAL_BUILD_CREDITS);
}

/**
 * How many days a plan can actually spend its DAILY allowance before the MONTHLY one stops it.
 *
 * `quotaState` spends `Math.min(dailyLeft, monthlyLeft)` (apps/worker/src/quota-math.ts), so a plan
 * has two limits and the smaller one is the one the user has. On every plan the monthly figure is
 * only a few times the daily one: Free is 5 a day against 30 a month, six full days. A user who
 * spends the whole daily allowance reaches the monthly ceiling on the sixth day and gets nothing
 * for the rest of the month.
 *
 * That is a legitimate way to shape a plan. It is not a legitimate thing to leave out of the
 * sentence "Credits reset to your full daily amount every day", which the pricing page once ran.
 *
 * Exported so the claim is DERIVED wherever it is made. A page that wants to say "every day" has to
 * ask this function whether that is true for the plan it is describing.
 */
export function fullRateDays(plan: PlanId): number {
  return Math.floor(PLAN_TABLE[plan].creditsPerMonth / PLAN_TABLE[plan].creditsPerDay);
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

// PLACED AFTER `PLAN_TABLE` AND `buildsPerMonth` ON PURPOSE. The table below is built at
// module-evaluation time and calls `buildsPerMonth`, which reads `PLAN_TABLE`. Declared above
// them, that read happens inside the temporal dead zone and the whole module throws on import —
// every page in three apps, blank. `tsc --noEmit` does NOT catch it; importing the module does.
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

/** Built from PLAN_TABLE and PLAN_COPY so a number can never be typed twice. */
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
          ? 'Free while in beta'
          : `${formatMoney(PLAN_COPY[p].priceUsdMonthly ?? 0)} a month`,
    ),
  },
  {
    id: 'credits-per-day',
    label: 'Credits a day',
    note: 'The hard daily ceiling. It resets at midnight UTC for everyone.',
    values: everyPlan((p) => PLAN_TABLE[p].creditsPerDay.toLocaleString('en-US')),
  },
  {
    id: 'credits-per-month',
    label: 'Credits a month',
    values: everyPlan((p) => PLAN_TABLE[p].creditsPerMonth.toLocaleString('en-US')),
  },
  {
    id: 'builds-per-month',
    label: 'Typical builds a month',
    note: 'The same allowance in the unit people think in.',
    values: everyPlan((p) => `About ${buildsPerMonth(p)}`),
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
      : 'StudPilot cannot sell Credits in this preview — there is no checkout for them on any plan.',
    values: everyPlan(() => (CREDIT_PURCHASE_LIVE ? true : 'Unavailable')),
  },
  // The `self-serve` and `invoicing` rows are gone with Enterprise from the display: they differed
  // only for the one plan that is no longer shown, so on the listed plans they were a tick row and
  // an all-dashes row.
];

// ---------------------------------------------------------------------------------------------
// StudPilot's own public-API keys
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
 * unknown choice outright, so such a row falls back to the current product default. An explicit
 * organisation or project restriction still narrows that default.
 */
export const ASSET_SOURCE_CHOICES = ['creator_store', 'from_scratch'] as const;
export type AssetSourceChoice = (typeof ASSET_SOURCE_CHOICES)[number];

/**
 * `ask` shows the dialog before a build. `remember` uses `allow` without asking.
 *
 * The product now chooses its verified library and plain structural work internally. This is the
 * starting policy for a new project, not permission to upload a permanent asset to an account.
 * Explicit organisation, account and project policies remain narrowing restrictions.
 */
export interface AssetSourcePolicy {
  mode: 'ask' | 'remember';
  allow: AssetSourceChoice[];
}

export const ASSET_SOURCE_DEFAULT: AssetSourcePolicy = { mode: 'remember', allow: ['creator_store', 'from_scratch'] };

// ---------------------------------------------------------------------------------------------
// What StudPilot is ALLOWED TO DO
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
 * 2026-09-23: 30 writers declared, 37 governed, and the writers are a strict subset. A safety
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
    name: 'build_scene',
    label: 'Build a ready-made scene',
    why: 'Builds a whole environment — terrain, trees, crystals, water and lighting — in the open place.',
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
    why: 'Rewrites Lighting properties and StudPilot-owned atmosphere and post-processing effects.',
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
    label: 'Remove StudPilot effects',
    why: 'Deletes presentation effects that StudPilot previously attached to project objects.',
    group: 'changes',
  },
  {
    name: 'insert_asset',
    label: 'Insert assets from the Creator Store',
    why: 'Brings third-party models into your place.',
    group: 'changes',
  },
  {
    name: 'insert_owner_component',
    label: 'Import owner-supplied components',
    why: 'Inserts private native components, preserving downloaded source as inert data.',
    group: 'changes',
  },
  {
    name: 'import_owner_library',
    label: 'Import parts of your uploaded games',
    why: 'Copies objects and their original scripts from your own game library into your place.',
    group: 'changes',
  },
  {
    name: 'recreate_owner_game',
    label: 'Recreate your uploaded games',
    why: 'Copies a whole game from your own library, scripts included, into your place.',
    group: 'changes',
  },
  {
    name: 'install_owner_system',
    label: 'Add a ready-made feature from your uploaded games',
    why: 'Copies one feature with its scripts from your own game library into your place.',
    group: 'changes',
  },
  {
    name: 'compose_game',
    label: 'Build a new game for your idea',
    why: 'Builds a new game for your idea from ready-made parts and pieces of your game library, with its own map, in your place.',
    group: 'changes',
  },
  {
    name: 'build_game',
    label: 'Build a new game from your uploaded games',
    why: 'Builds an original game from a plan made out of your uploaded games, scripts included, in your place.',
    group: 'changes',
  },
  {
    name: 'preview_library_models',
    label: 'Look at ready-made models',
    why: 'Measures candidate models off your place (size, colour, parts) so the right one can be chosen. It briefly stages them in the place and takes them away again; nothing stays.',
    group: 'changes',
  },
  {
    name: 'insert_library_model',
    label: 'Insert models from StudPilot\'s model library',
    why: 'Brings ready-made 3D models (props, buildings, trees, vehicles) into your place.',
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
    why: 'Starts a playtest. Withhold it and StudPilot can no longer check its own work by running it.',
    group: 'changes',
  },
  {
    name: 'play_check',
    label: 'Playtest as a player',
    why: 'Starts a short Test session with one player in your Studio. Withhold it and StudPilot cannot check what a player sees on screen.',
    group: 'changes',
  },
  {
    name: 'play_check_ui',
    label: 'Playtest and press buttons',
    why: 'Starts a short Test session and clicks on-screen buttons as a player would. Withhold it and StudPilot cannot prove a menu or shop works.',
    group: 'changes',
  },
  {
    name: 'judge_game',
    label: 'Judge the finished game like a client',
    why: 'Reads your whole place and starts up to three short Test sessions in your Studio that click buttons as a player would. Withhold it and StudPilot cannot check the finished game against what you asked for.',
    group: 'changes',
  },
  {
    name: 'set_properties_bulk',
    label: 'Change many objects at once',
    why: 'One step can change up to 500 parts or objects, chosen by list or by search.',
    group: 'changes',
  },
  {
    name: 'scatter_instances',
    label: 'Scatter copies across the map',
    why: 'Places up to 200 copies of an object (trees, rocks, coins) on the ground in an area.',
    group: 'changes',
  },
  {
    name: 'collision_groups',
    label: 'Change what collides',
    why: 'Creates collision groups and decides which of them pass through each other.',
    group: 'changes',
  },
  {
    name: 'shape_terrain',
    label: 'Shape terrain and water',
    why: 'Adds hills, ramps and pillars, clears or smooths terrain, and changes water and grass.',
    group: 'changes',
  },
  {
    name: 'create_rig',
    label: 'Add characters',
    why: 'Adds a Roblox character model, for NPCs and mannequins.',
    group: 'changes',
  },
  {
    name: 'build_ui',
    label: 'Build UI screens',
    why: 'Adds a whole on-screen menu, shop or HUD to StarterGui.',
    group: 'changes',
  },
  {
    name: 'build_object',
    label: 'Build objects',
    why: 'Adds a whole object to Workspace: its parts, studs, a stage, motions, sounds and lighting.',
    group: 'changes',
  },
  {
    name: 'dress_object',
    label: 'Dress objects',
    why: 'Adds what you ask for to an object already in the place: a stage under it, a click response, a counter, an attached piece, a light or an effect. Nothing is added unless asked.',
    group: 'changes',
  },
  {
    name: 'animate_model',
    label: 'Make models move',
    why: 'Joins a model\'s parts with joints and adds animations that play from a script.',
    group: 'changes',
  },
  {
    name: 'add_behaviour',
    label: 'Give models behaviour',
    why: 'Adds a behaviours script to a model, and the script that plays it, so parts can open, spin, bob, glow, play a sound or launch a player when clicked, touched or approached.',
    group: 'changes',
  },
  {
    name: 'build_studded_ui',
    label: 'Draw studded game screens',
    why: 'Adds the game\'s own studded HUD, buttons and shop panels to StarterGui.',
    group: 'changes',
  },
  {
    name: 'add_upgrades',
    label: 'Add working upgrades',
    why: 'Adds money, an Upgrades button and a panel of upgrades the server checks, without changing the screen already there.',
    group: 'changes',
  },
  {
    name: 'insert_ui_component',
    label: 'Add UI from the library',
    why: 'Adds a ready-made menu, shop, button or HUD piece from StudPilot\'s UI library to StarterGui or a part.',
    group: 'changes',
  },
  {
    name: 'insert_sound',
    label: 'Add sounds from the library',
    why: 'Adds a Sound from StudPilot\'s library of Roblox audio to a part or SoundService.',
    group: 'changes',
  },
  {
    name: 'insert_vfx',
    label: 'Add effects from the library',
    why: 'Adds a ready-made particle, beam or glow effect from StudPilot\'s effect library to a part.',
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
    why: 'Calls a 3D model service. The slowest and most expensive thing StudPilot can do.',
    group: 'spends',
  },
  {
    name: 'generate_model_external',
    label: 'Generate 3D models on Hugging Face',
    why: 'Calls an outside 3D model service, uploads the result into your own Roblox account with your connected key, then inserts it.',
    group: 'spends',
  },
  {
    name: 'upload_ui_asset',
    label: 'Upload library images to Roblox',
    why: 'Uploads a picked image from the free UI library into your own Roblox account with your connected key, so a button or icon can show it. Roblox keeps uploaded images for good.',
    group: 'spends',
  },
  {
    name: 'generate_ui_image_hf',
    label: 'Generate images with the second model',
    why: 'Calls an outside image model on Hugging Face when the usual one fails. Limited to a few a day.',
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
// `import { MAX_ATTACHMENT_BYTES } from '@studpilot/shared'` reads the same in the browser, in the
// worker and in the Durable Object. A second copy of a ceiling is how a picker comes to accept a
// file the server refuses.
// ---------------------------------------------------------------------------
export * from './attachments.ts';
export * from './legacy-wire.ts';
export * from './models.ts';
export * from './spilled-payload.ts';
export * from './ui-theme.ts';

/**
 * Talk, not work — a greeting, thanks, an acknowledgement, or a question about StudPilot itself.
 * One definition for both sides (moved from apps/worker/src/reasoning.ts on 2026-09-23): the worker
 * uses it to price such a turn like talk (F-019), and the web app uses it so a greeting does not open
 * the "where should StudPilot get assets from?" question before a word of conversation (F-048).
 * Anchored to the whole message, so "hi, build me a tower" is work.
 */
export const CONVERSATIONAL_RE =
  /^(?:\s*(?:hi|hey|hello|yo|sup|hiya|howdy|thanks?|thank you|thx|ty|ok|okay|k|cool|nice|great|awesome|got it|sure|yes|yeah|no|nope|bye|goodbye|see ya|good (?:morning|afternoon|evening|night)|שלום|היי|הי|תודה|תודה רבה|אהלן|בוקר טוב|ערב טוב)(?![\p{L}\p{N}])[\s!.,?]*)+$/iu;

/** Questions ABOUT the assistant rather than about the project — also talk, not work. */
export const META_QUESTION_RE =
  /\b(?:who are you|what are you|what can you do|what do you do|how do you work|which model|what model|are you (?:an? )?(?:ai|bot|human)|help me understand you|what is studpilot|what's studpilot)\b/i;

export function isSmallTalk(text: string): boolean {
  const trimmed = text.trim();
  return CONVERSATIONAL_RE.test(trimmed) || META_QUESTION_RE.test(trimmed);
}
