// A bounded, retrievable creation-skills catalogue.
//
// This file deliberately contains GUIDANCE, not a second code generator and not training data.
// The agent searches a compact index, reads one skill by id, then uses the existing reviewed
// prefabs, mechanic patterns, docs search and Studio tools to do the work. Nothing in this file is
// executable external text, and no entry claims that a Studio visual pass happened merely because
// the guidance exists.
import { GENRE_KIT_IDS, type GenreKitId } from './genre-kits';
import { MECHANIC_PATTERNS, type MechanicPattern } from './mechanics';

export const CREATOR_SKILL_DOMAINS = [
  'ui',
  'input',
  'client_server',
  'data',
  'gameplay',
  'worldbuilding',
  'performance',
  'security',
  'genre_pattern',
] as const;

export type CreatorSkillDomain = (typeof CREATOR_SKILL_DOMAINS)[number];

export interface CreatorSkillReference {
  /** Stable local identifier. Official references use the corpus docSlug verbatim. */
  id: string;
  title: string;
  url: string;
  origin: {
    publisher: 'Roblox Creator Hub';
    publicationDate: null;
    dateStatus: 'not_available_in_local_corpus';
  };
  referenceUse: 'implementation' | 'engine_constraint' | 'verification';
  /** The exact retrieval-corpus address; this is reference-only and forbidden as training data. */
  corpus: {
    path: 'packages/corpus/data/chunks.jsonl';
    docSlug: string;
    chunkIds: readonly string[];
  };
  licence: {
    status: 'reference_only';
    copyPermission: false;
  };
}

export interface CreatorSkillImplementation {
  kind: 'mechanic_pattern' | 'reviewed_prefab' | 'existing_tool';
  id: string;
  executableVerified: boolean;
  note: string;
}

/**
 * WHETHER ANYTHING EXECUTABLE STANDS BEHIND A SKILL — said out loud, including when nothing does.
 *
 * Every retrieval surface in this file used to spell it `...(skill.implementation ? {…} : {})`, so
 * a skill with no backing came back with the key simply ABSENT. Measured today: that is all 217 of
 * them. A reader — and the model is the reader — cannot tell "this is guidance nobody has executed"
 * from "that field was left out of this payload", and those are different facts about the same
 * skill. The catalogue-level disclosure says `content: 'authored_guidance'`, but a disclosure one
 * level up is not what a caller holding one skill is looking at.
 *
 * So the key is always present. `status: 'none'` is a claim the catalogue makes and can be wrong
 * about; an omission is not a claim at all, and cannot be checked.
 */
export type CreatorSkillBacking =
  | { status: 'none'; note: string }
  | { status: 'declared'; kind: CreatorSkillImplementation['kind']; id: string; executableVerified: boolean; note: string };

// SHORT ON PURPOSE. The first draft of this sentence was three lines, and the read-budget guard
// caught it immediately: one skill's minimum-budget payload no longer fitted. The long form belongs
// in the catalogue disclosure, which is sent once; this is the per-skill fact, which is sent 217
// times. A statement that does not fit gets dropped, and a dropped statement is the omission this
// whole change exists to remove.
const NO_BACKING_NOTE = 'No tool or prefab is declared to implement this; follow the steps yourself.';

export function skillBacking(skill: Pick<CreatorSkill, 'implementation'>): CreatorSkillBacking {
  const impl = skill.implementation;
  if (!impl) return { status: 'none', note: NO_BACKING_NOTE };
  return {
    status: 'declared',
    kind: impl.kind,
    id: impl.id,
    executableVerified: impl.executableVerified,
    note: impl.note,
  };
}

/**
 * The compact form, for payloads that are already fighting a character budget.
 *
 * WHY `install` IS HERE AND NOT LEFT TO THE NOTE. `note` is the first thing `fitReadPayload` drops
 * under pressure, and measured against the deployed worker it is dropped EVERY time for a
 * prefab-backed skill: the live `read_creation_skill` payload for mechanic-persistence-architecture
 * comes back 2,428 characters with `truncated: true` and the brief in place. So the one sentence
 * that named the tool — install_module("profile_store") — reached the model never, and the skill
 * said "reviewed source exists for this" while withholding how to obtain it. `install_module`'s own
 * description carries the catalogue, but that description is only offered with Studio connected and
 * is withheld from Plan mode entirely, whereas search_creation_skills and read_creation_skill are
 * offered in EVERY mode, connected or not. Fourteen characters of tool name is what makes the
 * declaration actionable rather than a fact about a door with no handle.
 */
export function skillBackingBrief(skill: Pick<CreatorSkill, 'implementation'>): { status: 'none' } | { status: 'declared'; kind: string; id: string; executableVerified: boolean; install?: string } {
  const impl = skill.implementation;
  if (!impl) return { status: 'none' };
  return {
    status: 'declared',
    kind: impl.kind,
    id: impl.id,
    executableVerified: impl.executableVerified,
    ...(impl.kind === 'reviewed_prefab' ? { install: PREFAB_INSTALL_TOOL } : {}),
  };
}

/** Named once, so the payload and the note cannot come to disagree about which tool installs it. */
export const PREFAB_INSTALL_TOOL = 'install_module';

export interface CreatorSkill {
  id: string;
  title: string;
  domain: CreatorSkillDomain;
  genreApplicability: readonly GenreKitId[];
  summary: string;
  preconditions: readonly string[];
  steps: readonly string[];
  verification: readonly string[];
  failureModes: readonly string[];
  qualityCriteria: readonly string[];
  references: readonly CreatorSkillReference[];
  keywords: readonly string[];
  guidanceStatus: 'authored_guidance';
  containsExecutableCode: false;
  studioVisualPass: 'required_after_build';
  implementation?: CreatorSkillImplementation;
}

export const CREATOR_SKILL_CATALOG_DISCLOSURE = Object.freeze({
  content: 'authored_guidance' as const,
  /**
   * SHORT, BECAUSE THIS DISCLOSURE RIDES ON EVERY SEARCH PAYLOAD.
   *
   * The first draft of this line was 312 characters of careful explanation, and it consumed the
   * entire 700-character minimum search budget: `totalMatches: 73, returned: 0`. A search that
   * finds seventy-three skills and returns none of them, in order to explain itself at length, is
   * a worse answer than the omission this whole change was fixing. The same mistake the per-skill
   * note made, one level up, half an hour later.
   *
   * The long form lives in the doc comment on CreatorSkillBacking, which costs nothing to send.
   * What ships is the fact a caller needs: the status is always there, and "none" is a claim rather
   * than a gap. Measured: 78 characters, and search returns results again.
   */
  implementationBacking: 'Each skill states its backing; status "none" means nothing implements it.' as const,
  containsExecutableCode: false as const,
  trainingData: false as const,
  officialDocsAreReferenceOnly: true as const,
  studioVisualPass: 'required_after_build' as const,
});

const official = (
  docSlug: string,
  vecId: string,
  title: string,
  url: string,
  referenceUse: CreatorSkillReference['referenceUse'] = 'implementation',
): CreatorSkillReference => Object.freeze({
  id: docSlug,
  title,
  url,
  origin: Object.freeze({
    publisher: 'Roblox Creator Hub' as const,
    publicationDate: null,
    dateStatus: 'not_available_in_local_corpus' as const,
  }),
  referenceUse,
  corpus: Object.freeze({
    path: 'packages/corpus/data/chunks.jsonl' as const,
    docSlug,
    chunkIds: Object.freeze([vecId]),
  }),
  licence: Object.freeze({ status: 'reference_only' as const, copyPermission: false as const }),
});

/**
 * Every row below is present in packages/corpus/data/chunks.jsonl. Tests resolve both docSlug and
 * vecId back to that corpus, so a renamed or removed document breaks loudly instead of leaving a
 * plausible-looking dead link in hundreds of skills.
 */
export const CREATOR_SKILL_REFERENCES = Object.freeze({
  uiPosition: official('docs-ui-position-and-size', 'g-caac7ebb-8', 'Position and size UI objects', 'https://create.roblox.com/docs/ui/position-and-size'),
  uiAppearance: official('docs-ui-appearance-modifiers', 'g-5cb7c70a-1', 'UI appearance modifiers', 'https://create.roblox.com/docs/ui/appearance-modifiers'),
  uiButtons: official('docs-ui-buttons', 'g-c899c8ec-2', 'Text and image buttons', 'https://create.roblox.com/docs/ui/buttons'),
  uiPages: official('docs-ui-page-layouts', 'g-cf22a913-1', 'Page layouts', 'https://create.roblox.com/docs/ui/page-layouts'),
  uiScreen: official('docs-ui-on-screen-containers', 'g-d9d2371c-2', 'On-screen UI containers', 'https://create.roblox.com/docs/ui/on-screen-containers'),
  uiSurface: official('docs-ui-in-experience-containers', 'g-e6b115af-2', 'In-experience UI containers', 'https://create.roblox.com/docs/ui/in-experience-containers'),
  uiAnimation: official('docs-ui-animation', 'g-fbf7a5f6-1', 'UI animation and tweens', 'https://create.roblox.com/docs/ui/animation'),
  uiSize: official('docs-ui-size-modifiers', 'g-5f78a250-1', 'Size modifiers and constraints', 'https://create.roblox.com/docs/ui/size-modifiers'),
  uiTextFilter: official('docs-ui-text-filtering', 'g-dc922655-2', 'Text filtering', 'https://create.roblox.com/docs/ui/text-filtering', 'engine_constraint'),
  uiViewport: official('docs-ui-viewport-frames', 'g-72411089-4', 'Viewport frames', 'https://create.roblox.com/docs/ui/viewport-frames'),
  uiDrag: official('docs-ui-ui-drag-detectors', 'g-03df7c30-1', 'UI drag detectors', 'https://create.roblox.com/docs/ui/ui-drag-detectors'),
  inputOverview: official('docs-input', 'g-31e77fc9-1', 'Input', 'https://create.roblox.com/docs/input'),
  inputActions: official('docs-input-input-action-system', 'g-811acfc1-1', 'Input Action System', 'https://create.roblox.com/docs/input/input-action-system'),
  inputMobile: official('docs-input-mobile', 'g-18d9949a-1', 'Mobile input', 'https://create.roblox.com/docs/input/mobile'),
  inputGamepad: official('docs-input-gamepad', 'g-9819fa1c-1', 'Gamepad input', 'https://create.roblox.com/docs/input/gamepad'),
  inputKeyboard: official('docs-input-mouse-and-keyboard', 'g-41fb41b3-1', 'Mouse and keyboard input', 'https://create.roblox.com/docs/input/mouse-and-keyboard'),
  contextActions: official('api-contextactionservice', 'api-contextactionservice-1', 'ContextActionService', 'https://create.roblox.com/docs/reference/engine/classes/ContextActionService'),
  userInput: official('api-userinputservice', 'api-userinputservice-1', 'UserInputService', 'https://create.roblox.com/docs/reference/engine/classes/UserInputService'),
  remotes: official('docs-scripting-events-remote', 'g-cc1c16be-1', 'Remote events and callbacks', 'https://create.roblox.com/docs/scripting/events/remote'),
  clientBoundary: official('docs-scripting-security-client-server-boundary', 'g-192d0501-1', 'Securing the client-server boundary', 'https://create.roblox.com/docs/scripting/security/client-server-boundary', 'engine_constraint'),
  securityTactics: official('docs-scripting-security-security-tactics', 'g-447f4559-1', 'Security and cheat mitigation tactics', 'https://create.roblox.com/docs/scripting/security/security-tactics', 'engine_constraint'),
  serverDetection: official('docs-scripting-security-server-side-detection', 'g-10893dde-1', 'Server-side detection and consequencing', 'https://create.roblox.com/docs/scripting/security/server-side-detection', 'verification'),
  accessControl: official('docs-scripting-security-access-control', 'g-36429007-1', 'Access control and confidentiality', 'https://create.roblox.com/docs/scripting/security/access-control', 'engine_constraint'),
  networkSecurity: official('docs-scripting-security-network-ownership', 'g-1fb8ce4c-1', 'Network ownership and movement validation', 'https://create.roblox.com/docs/scripting/security/network-ownership', 'engine_constraint'),
  thirdPartySecurity: official('docs-scripting-security-third-party-vulnerabilities', 'g-85a2eb32-1', 'Vulnerabilities from third-party assets', 'https://create.roblox.com/docs/scripting/security/third-party-vulnerabilities', 'verification'),
  capabilities: official('docs-scripting-capabilities', 'g-b6a11aa8-1', 'Script capabilities', 'https://create.roblox.com/docs/scripting/capabilities', 'engine_constraint'),
  saveData: official('docs-tutorials-use-case-tutorials-data-storage-save-player-data', 'g-4655fc81-1', 'Save player data with standard data stores', 'https://create.roblox.com/docs/tutorials/use-case-tutorials/data-storage/save-player-data'),
  leaderboardData: official('docs-tutorials-use-case-tutorials-data-storage-create-leaderboard', 'g-4f412073-1', 'Create a custom leaderboard with ordered data stores', 'https://create.roblox.com/docs/tutorials/use-case-tutorials/data-storage/create-leaderboard'),
  dataStore: official('api-datastoreservice', 'api-datastoreservice-1', 'DataStoreService', 'https://create.roblox.com/docs/reference/engine/classes/DataStoreService'),
  memoryStore: official('api-memorystoreservice', 'api-memorystoreservice-1', 'MemoryStoreService', 'https://create.roblox.com/docs/reference/engine/classes/MemoryStoreService'),
  messaging: official('api-messagingservice', 'api-messagingservice-1', 'MessagingService', 'https://create.roblox.com/docs/reference/engine/classes/MessagingService'),
  marketplace: official('api-marketplaceservice', 'api-marketplaceservice-1', 'MarketplaceService', 'https://create.roblox.com/docs/reference/engine/classes/MarketplaceService'),
  badges: official('api-badgeservice', 'api-badgeservice-1', 'BadgeService', 'https://create.roblox.com/docs/reference/engine/classes/BadgeService'),
  collection: official('api-collectionservice', 'api-collectionservice-1', 'CollectionService', 'https://create.roblox.com/docs/reference/engine/classes/CollectionService'),
  proximity: official('api-proximityprompt', 'api-proximityprompt-1', 'ProximityPrompt', 'https://create.roblox.com/docs/reference/engine/classes/ProximityPrompt'),
  pathfinding: official('docs-characters-pathfinding', 'g-3c467923-1', 'Pathfinding', 'https://create.roblox.com/docs/characters/pathfinding'),
  worldRoot: official('api-worldroot', 'api-worldroot-1', 'WorldRoot spatial queries', 'https://create.roblox.com/docs/reference/engine/classes/WorldRoot'),
  humanoid: official('api-humanoid', 'api-humanoid-1', 'Humanoid', 'https://create.roblox.com/docs/reference/engine/classes/Humanoid'),
  animation: official('docs-animation-using', 'g-b5ffada5-1', 'Use animations', 'https://create.roblox.com/docs/animation/using'),
  animationEvents: official('docs-animation-events', 'g-6f54c948-1', 'Animation events', 'https://create.roblox.com/docs/animation/events'),
  physicsAssemblies: official('docs-physics-assemblies', 'g-9f4638ba-1', 'Assemblies', 'https://create.roblox.com/docs/physics/assemblies'),
  physicsMovers: official('docs-physics-mover-constraints', 'g-2fb1c40a-1', 'Mover constraints', 'https://create.roblox.com/docs/physics/mover-constraints'),
  physicsOwnership: official('docs-physics-network-ownership', 'g-ac43f437-1', 'Network ownership', 'https://create.roblox.com/docs/physics/network-ownership'),
  camera: official('api-camera', 'api-camera-1', 'Camera', 'https://create.roblox.com/docs/reference/engine/classes/Camera'),
  tween: official('api-tweenservice', 'api-tweenservice-1', 'TweenService', 'https://create.roblox.com/docs/reference/engine/classes/TweenService'),
  debris: official('api-debris', 'api-debris-1', 'Debris', 'https://create.roblox.com/docs/reference/engine/classes/Debris'),
  parts: official('docs-parts', 'g-aa75ccbc-1', 'Parts', 'https://create.roblox.com/docs/parts'),
  materials: official('docs-parts-materials', 'g-6e148555-1', 'Materials', 'https://create.roblox.com/docs/parts/materials'),
  meshes: official('docs-parts-meshes', 'g-ce3a9b5f-1', 'Meshes', 'https://create.roblox.com/docs/parts/meshes'),
  proceduralModels: official('docs-parts-procedural-models', 'g-5f11f654-1', 'Procedural models', 'https://create.roblox.com/docs/parts/procedural-models'),
  terrain: official('docs-parts-terrain', 'g-eb535b9a-1', 'Environmental terrain', 'https://create.roblox.com/docs/parts/terrain'),
  lighting: official('docs-environment-lighting', 'g-a09ac1a9-1', 'Global lighting', 'https://create.roblox.com/docs/environment/lighting'),
  atmosphere: official('docs-environment-atmosphere', 'g-4685c508-1', 'Atmospheric effects', 'https://create.roblox.com/docs/environment/atmosphere'),
  postProcessing: official('docs-environment-post-processing-effects', 'g-828f1364-1', 'Post-processing effects', 'https://create.roblox.com/docs/environment/post-processing-effects'),
  audio: official('docs-audio', 'g-591c8e83-1', 'Audio', 'https://create.roblox.com/docs/audio'),
  audioObjects: official('docs-audio-objects', 'g-612f62ca-1', 'Audio objects', 'https://create.roblox.com/docs/audio/objects'),
  audio3d: official('docs-tutorials-use-case-tutorials-audio-add-3d-audio', 'g-f1728ab4-1', 'Add 3D audio', 'https://create.roblox.com/docs/tutorials/use-case-tutorials/audio/add-3D-audio'),
  particles: official('docs-tutorials-curriculums-artist-work-with-particle-emitters', 'g-98a1bb28-7', 'Work with particle emitters', 'https://create.roblox.com/docs/tutorials/curriculums/artist/work-with-particle-emitters'),
  perfDesign: official('docs-performance-optimization-design', 'g-ecd0fa40-1', 'Design for performance', 'https://create.roblox.com/docs/performance-optimization/design', 'engine_constraint'),
  perfIdentify: official('docs-performance-optimization-identify', 'g-92b3c571-1', 'Identify performance issues', 'https://create.roblox.com/docs/performance-optimization/identify', 'verification'),
  perfImprove: official('docs-performance-optimization-improve', 'g-5ca913a7-1', 'Improve performance', 'https://create.roblox.com/docs/performance-optimization/improve', 'implementation'),
  microprofiler: official('docs-performance-optimization-microprofiler', 'g-0faeb36e-1', 'MicroProfiler', 'https://create.roblox.com/docs/performance-optimization/microprofiler', 'verification'),
  networkProfiler: official('docs-performance-optimization-microprofiler-network', 'g-9dd7bdfd-1', 'Network usage profiling', 'https://create.roblox.com/docs/performance-optimization/microprofiler/network', 'verification'),
  perfMonitor: official('docs-performance-optimization-monitor', 'g-6709f79c-1', 'Monitor performance', 'https://create.roblox.com/docs/performance-optimization/monitor', 'verification'),
  hardwareTest: official('docs-performance-optimization-test-on-hardware', 'g-be282f7d-1', 'Test on hardware', 'https://create.roblox.com/docs/performance-optimization/test-on-hardware', 'verification'),
  sceneAnalysis: official('docs-performance-optimization-scene-analysis', 'g-9169dc06-1', 'Scene Analysis', 'https://create.roblox.com/docs/performance-optimization/scene-analysis', 'verification'),
  streaming: official('docs-workspace-streaming', 'g-b9bbe63a-1', 'Instance streaming', 'https://create.roblox.com/docs/workspace/streaming', 'engine_constraint'),
  streamingTechniques: official('docs-workspace-streaming-techniques', 'g-1161b08e-1', 'Streaming techniques and conversion', 'https://create.roblox.com/docs/workspace/streaming/techniques', 'implementation'),
  parallelLuau: official('docs-scripting-multithreading', 'g-51f9cffb-1', 'Parallel Luau', 'https://create.roblox.com/docs/scripting/multithreading', 'engine_constraint'),
} as const);

type ReferenceKey = keyof typeof CREATOR_SKILL_REFERENCES;

interface SkillSeed {
  id: string;
  title: string;
  domain: CreatorSkillDomain;
  genres?: readonly GenreKitId[];
  summary: string;
  preconditions?: readonly string[];
  steps: readonly string[];
  verification: readonly string[];
  failureModes: readonly string[];
  qualityCriteria?: readonly string[];
  refs: readonly ReferenceKey[];
  keywords?: readonly string[];
  implementation?: CreatorSkillImplementation;
}

const DOMAIN_PRECONDITIONS: Readonly<Record<CreatorSkillDomain, readonly string[]>> = Object.freeze({
  ui: ['The player task and source of displayed state are named.', 'Target phone, desktop and gamepad layouts are in scope.'],
  input: ['The action, allowed game states and owning client controller are named.', 'At least keyboard, touch and gamepad behavior is decided.'],
  client_server: ['The server authority and client request are separated.', 'Payload shape, frequency and refusal behavior are known.'],
  data: ['The authoritative profile fields and mutation owner are named.', 'Failure, retry and shutdown behavior are part of the task.'],
  gameplay: ['The mechanic owner and lifecycle are named.', 'Server authority is explicit for any competitive or economic result.'],
  worldbuilding: ['Gameplay distance, traversal route and art direction are known.', 'The build has a measurable part, light or effect budget.'],
  performance: ['A repeatable test scene and target device class are available.', 'A baseline is captured before optimization.'],
  security: ['The protected resource and attacker-controlled inputs are named.', 'Refusal and logging behavior are defined before punitive action.'],
  genre_pattern: ['The selected genre kit and its core loop are fixed.', 'The task is tied to a playable player action, not decoration alone.'],
});

const DOMAIN_QUALITY: Readonly<Record<CreatorSkillDomain, readonly string[]>> = Object.freeze({
  ui: ['Readable at the smallest supported viewport.', 'State changes are visible without relying on color alone.'],
  input: ['One action has one semantic meaning across devices.', 'Input is ignored outside the states where it is valid.'],
  client_server: ['The client requests; the server validates and decides.', 'Payload and rate are bounded.'],
  data: ['No failed load can overwrite valid data.', 'Each economic mutation is atomic and idempotent where retries are possible.'],
  gameplay: ['The loop can start, stop and clean up without duplicate owners.', 'Failure paths are observable and recoverable.'],
  worldbuilding: ['Readable low-poly silhouettes carry the scene before texture detail.', 'No 4K texture is required for ordinary props or traversal surfaces.'],
  performance: ['A measured bottleneck is reduced without changing the mechanic.', 'Phone-class behavior is checked, not inferred from desktop.'],
  security: ['Invalid actions are refused on the server.', 'Detection evidence is separated from automatic punishment.'],
  genre_pattern: ['The genre promise is visible in the first playable minute.', 'The result still requires a live Studio playtest and visual inspection.'],
});

const allGenres = GENRE_KIT_IDS as readonly GenreKitId[];

function materialise(seed: SkillSeed): CreatorSkill {
  return Object.freeze({
    id: seed.id,
    title: seed.title,
    domain: seed.domain,
    genreApplicability: Object.freeze([...(seed.genres ?? allGenres)]),
    summary: seed.summary,
    preconditions: Object.freeze([...(DOMAIN_PRECONDITIONS[seed.domain] ?? []), ...(seed.preconditions ?? [])]),
    steps: Object.freeze([...seed.steps]),
    verification: Object.freeze([...seed.verification]),
    failureModes: Object.freeze([...seed.failureModes]),
    qualityCriteria: Object.freeze([...(DOMAIN_QUALITY[seed.domain] ?? []), ...(seed.qualityCriteria ?? [])]),
    references: Object.freeze(seed.refs.map((key) => CREATOR_SKILL_REFERENCES[key])),
    keywords: Object.freeze([seed.id, seed.title, seed.domain, ...(seed.genres ?? []), ...(seed.keywords ?? [])]),
    guidanceStatus: 'authored_guidance',
    containsExecutableCode: false,
    studioVisualPass: 'required_after_build',
    ...(seed.implementation ? { implementation: Object.freeze({ ...seed.implementation }) } : {}),
  });
}

const FOUNDATION_SEEDS: readonly SkillSeed[] = [
  // UI — concrete surfaces, not a generic "make UI" row.
  { id: 'ui-responsive-hud-anchors', title: 'Anchor a responsive gameplay HUD', domain: 'ui', summary: 'Place persistent HUD regions with scale-first sizing, bounded offsets and no overlap at phone aspect ratios.', refs: ['uiPosition', 'uiSize'], keywords: ['hud', 'responsive', 'anchor'], steps: ['List the always-visible HUD regions and their priority.', 'Use anchors and scale for placement; reserve offsets for minimum padding and icon sizes.', 'Add constraints only where distortion would break meaning.', 'Collapse or move secondary regions at the narrow breakpoint.'], verification: ['Capture the smallest phone, a tall phone and 16:9 desktop.', 'Confirm no region covers the thumb input area or another required control.'], failureModes: ['Pixel-only placement drifts off-screen on tall or narrow devices.', 'Every region keeps desktop size and leaves no gameplay viewport.'] },
  { id: 'ui-safe-area-and-topbar', title: 'Keep UI out of device and Core UI insets', domain: 'ui', summary: 'Respect screen insets so controls are not hidden by notches, the top bar or device corners.', refs: ['uiScreen', 'uiPosition'], keywords: ['safe area', 'inset', 'topbar'], steps: ['Identify which containers should respect versus intentionally ignore insets.', 'Apply the inset policy at the root container instead of compensating every child.', 'Keep critical actions inside an additional touch-safe margin.'], verification: ['Inspect a notched phone and desktop with Core UI visible.', 'Confirm dismiss, purchase and pause actions remain reachable.'], failureModes: ['Manual offsets double-apply an inset on some devices.', 'Fullscreen art is treated like interactive content and shrinks unnecessarily.'] },
  { id: 'ui-text-hierarchy-scaling', title: 'Build a scalable text hierarchy', domain: 'ui', summary: 'Define title, body, label and numeric emphasis that remain legible without uncontrolled TextScaled distortion.', refs: ['uiSize', 'uiAppearance'], keywords: ['text', 'typography', 'legibility'], steps: ['Assign each text role a size range and line limit.', 'Use constraints to bound scaling and keep body copy from becoming headline-sized.', 'Reserve stroke or shadow for contrast, not decoration on every label.'], verification: ['Check longest supported localized string and smallest viewport.', 'Read the hierarchy at gameplay distance without opening Studio properties.'], failureModes: ['Unlimited TextScaled produces inconsistent hierarchy.', 'Rich effects reduce contrast on moving backgrounds.'] },
  { id: 'ui-inventory-grid-layout', title: 'Lay out an inventory grid that survives resizing', domain: 'ui', summary: 'Create a grid with stable cell aspect, bounded columns and scrolling rather than clipped slots.', refs: ['uiPosition', 'uiSize'], keywords: ['inventory', 'grid', 'slots'], steps: ['Choose minimum cell size from touch and icon readability.', 'Derive columns from available width and gap, then cap them for wide screens.', 'Put overflow in one scrolling container and keep selection outside the cell geometry.'], verification: ['Resize through each column breakpoint and inspect the last row.', 'Verify the selected item stays visible after filtering or sorting.'], failureModes: ['A fixed column count makes phone cells too small.', 'Canvas size does not follow content and hides the last row.'] },
  { id: 'ui-scrolling-list-window', title: 'Bound a long scrolling list', domain: 'ui', summary: 'Keep large catalog, quest or server lists responsive by limiting visible row work and preserving scroll state.', refs: ['uiPosition', 'perfDesign'], keywords: ['scrolling', 'list', 'virtualization'], steps: ['Define stable row height and identity.', 'Render or update only rows intersecting the viewport plus a small buffer.', 'Preserve selection and scroll position when data refreshes.'], verification: ['Profile a list at its maximum expected row count.', 'Refresh the backing data while scrolled near the end.'], failureModes: ['Rebuilding every row on each scroll event causes frame spikes.', 'Index-based identity moves selection to a different item after sorting.'] },
  { id: 'ui-modal-focus-and-dismiss', title: 'Give a modal one clear focus and exit path', domain: 'ui', summary: 'Open a modal with one primary action, controller focus capture and consistent close behavior.', refs: ['uiButtons', 'inputGamepad'], keywords: ['modal', 'focus', 'dismiss'], steps: ['Pause or gate the underlying interaction state.', 'Set initial selection to the safest meaningful action.', 'Map close, back and outside-click behavior deliberately.', 'Restore prior focus when the modal closes.'], verification: ['Complete the modal using only gamepad, only keyboard and only touch.', 'Attempt to activate controls behind the modal.'], failureModes: ['Focus remains behind the overlay and triggers hidden actions.', 'Back closes a purchase confirmation without restoring gameplay input.'] },
  { id: 'ui-button-state-system', title: 'Expose button idle, hover, pressed, disabled and busy states', domain: 'ui', summary: 'Make buttons communicate availability and request progress without accepting duplicate activation.', refs: ['uiButtons', 'uiAppearance'], keywords: ['button', 'state', 'busy'], steps: ['Define visual and semantic state names once.', 'Disable activation while a server request is unresolved.', 'Keep label width stable between idle and busy states.', 'Return to a deterministic state on success, refusal or timeout.'], verification: ['Trigger the action repeatedly under artificial latency.', 'Verify disabled state remains distinguishable without color alone.'], failureModes: ['Pressed styling is mistaken for disabled styling.', 'The button re-enables before the server result and sends duplicates.'] },
  { id: 'ui-controller-selection-graph', title: 'Build deterministic gamepad selection paths', domain: 'ui', summary: 'Connect selectable controls so directional navigation follows the visual layout and never traps focus.', refs: ['inputGamepad', 'uiPages'], keywords: ['gamepad', 'selection', 'navigation'], steps: ['List every selectable control per page.', 'Define directional neighbors for non-grid layouts.', 'Choose a safe default when a page opens.', 'Remove hidden controls from the selection graph before transition.'], verification: ['Traverse every control without moving a mouse.', 'Hide, disable and re-show controls while focus is nearby.'], failureModes: ['Automatic selection jumps to an unrelated overlay.', 'Focus points to a destroyed or invisible control.'] },
  { id: 'ui-mobile-touch-targets', title: 'Size and separate mobile touch targets', domain: 'ui', summary: 'Give primary actions enough physical area and spacing to avoid accidental activation during play.', refs: ['inputMobile', 'uiPosition'], keywords: ['mobile', 'touch', 'thumb'], steps: ['Rank actions by frequency and urgency.', 'Place frequent controls inside comfortable thumb zones.', 'Increase hit area without inflating the visual icon.', 'Keep destructive actions away from movement controls.'], verification: ['Play one full loop while holding the device with two thumbs.', 'Record missed and accidental presses on the smallest supported screen.'], failureModes: ['Visual icon size is used as the entire hit target.', 'Buttons overlap the default movement or jump controls.'] },
  { id: 'ui-localization-expansion', title: 'Make layouts survive translated text expansion', domain: 'ui', summary: 'Allow labels, buttons and panels to grow or wrap without hiding adjacent actions.', refs: ['uiPosition', 'uiSize'], keywords: ['localization', 'translation', 'expansion'], steps: ['Identify every fixed-width text container.', 'Choose wrap, grow or alternate compact copy per role.', 'Keep icons and critical numbers aligned when text expands.', 'Test right-to-left ordering separately from width growth.'], verification: ['Inject strings at least twice the English length.', 'Inspect all button rows and modal titles at phone width.'], failureModes: ['Text clips because the parent has a fixed offset width.', 'A growing label pushes the close action off-screen.'] },
  { id: 'ui-player-text-filtering', title: 'Filter player-authored text before display', domain: 'ui', summary: 'Route player-authored names, signs or messages through the correct filtering path before other players see them.', refs: ['uiTextFilter', 'clientBoundary'], keywords: ['filter', 'ugc', 'text'], steps: ['Mark every string that originated from a player.', 'Filter on the server for the intended recipient context.', 'Store the authoritative raw or filtered form only where policy permits.', 'Use a safe placeholder when filtering fails.'], verification: ['Exercise public, private and failure paths with test accounts.', 'Confirm no unfiltered fallback reaches another client.'], failureModes: ['Filtering only on the sender client is bypassable.', 'A failed filter request displays the original text.'] },
  { id: 'ui-viewport-item-preview', title: 'Render a stable 3D item preview', domain: 'ui', summary: 'Frame an item in a ViewportFrame with deterministic camera, lighting and rotation independent of Workspace.', refs: ['uiViewport', 'camera'], keywords: ['viewportframe', 'preview', 'item'], steps: ['Clone only the display model into the viewport world.', 'Compute a framing distance from model bounds.', 'Use a dedicated camera and neutral readable light.', 'Rotate the model or camera at a bounded update rate.'], verification: ['Preview the smallest and largest supported models.', 'Open and close the panel repeatedly and check instance cleanup.'], failureModes: ['The preview camera references Workspace and changes with gameplay.', 'Per-frame clones or connections leak after closing the panel.'] },
  { id: 'ui-page-stack-navigation', title: 'Manage multi-page UI as a stack', domain: 'ui', summary: 'Keep forward, back and deep-link behavior predictable across inventory, shop and settings pages.', refs: ['uiPages', 'uiButtons'], keywords: ['pages', 'navigation', 'back stack'], steps: ['Name the allowed pages and transitions.', 'Store page identity rather than visibility booleans on every panel.', 'Push only meaningful navigation states.', 'Restore focus and scroll state when returning.'], verification: ['Walk every forward and back route, including direct opening.', 'Close the root and confirm gameplay input returns exactly once.'], failureModes: ['Several pages remain visible because state is distributed.', 'Back recreates a page and loses selection state.'] },
  { id: 'ui-drag-drop-validation', title: 'Separate drag preview from accepted drop', domain: 'ui', summary: 'Let the client preview a drag while the authoritative inventory or placement owner validates the drop.', refs: ['uiDrag', 'clientBoundary'], keywords: ['drag', 'drop', 'inventory'], steps: ['Represent the dragged item by stable id, not a mutable UI object.', 'Preview hover targets locally.', 'Send only the requested source and destination to the authority.', 'Animate success or snap-back from the result.'], verification: ['Drop onto valid, invalid, full and disappearing targets.', 'Replay or duplicate the request and confirm one mutation.'], failureModes: ['The client edits inventory state before acceptance.', 'A destroyed target leaves the item visually or logically missing.'] },
  { id: 'ui-motion-with-state', title: 'Tie UI animation to state instead of timers', domain: 'ui', summary: 'Animate transitions while keeping final visibility and interactivity determined by state.', refs: ['uiAnimation', 'tween'], keywords: ['tween', 'motion', 'transition'], steps: ['Name entering, visible and exiting states.', 'Cancel or supersede an in-flight tween on a new state.', 'Set final properties explicitly after completion or cancellation.', 'Disable hit testing during non-interactive phases.'], verification: ['Open and close rapidly, then inspect final state.', 'Interrupt every transition at least once.'], failureModes: ['Two tweens fight and leave a panel half-visible.', 'An invisible panel still receives input.'] },
  { id: 'ui-surface-gui-distance', title: 'Keep in-world UI readable at gameplay distance', domain: 'ui', summary: 'Size and simplify SurfaceGui or BillboardGui content for the actual camera distance and angle.', refs: ['uiSurface', 'camera'], keywords: ['surfacegui', 'billboard', 'world ui'], steps: ['Measure the expected viewing distance and angle.', 'Limit the surface to one primary message and action.', 'Use contrast and depth behavior that keeps it attached to its object.', 'Provide a closer interaction state for dense information.'], verification: ['Read the surface from minimum and maximum interaction distance.', 'Walk behind and beside it to inspect occlusion and orientation.'], failureModes: ['Desktop pixel sizing becomes unreadable in 3D space.', 'Always-on-top content reveals objects through walls.'] },

  // Input.
  { id: 'input-semantic-action-map', title: 'Map device inputs to semantic actions', domain: 'input', summary: 'Define actions such as Interact or Ability1 once, then bind device-specific inputs without branching gameplay logic.', refs: ['inputActions', 'inputOverview', 'contextActions'], keywords: ['action map', 'binding', 'cross platform'], steps: ['List actions and the game states that accept them.', 'Bind keyboard, gamepad and touch inputs to each action.', 'Keep gameplay code subscribed to action state, not raw keys.', 'Expose current binding glyphs to UI.'], verification: ['Perform the same loop on all supported input devices.', 'Switch input device mid-session and inspect prompts.'], failureModes: ['Raw key checks spread through several scripts.', 'Two contexts consume the same action simultaneously.'] },
  { id: 'input-mouse-aim-and-fire', title: 'Separate mouse aim sampling from fire requests', domain: 'input', summary: 'Sample client aim smoothly while sending bounded fire intent that the server can validate.', refs: ['inputKeyboard', 'clientBoundary'], keywords: ['mouse', 'aim', 'fire'], steps: ['Sample pointer or camera aim on the client.', 'Send fire intent only on the weapon cadence.', 'Include origin/direction evidence rather than a claimed victim or damage.', 'Let the server reconstruct range and line of sight.'], verification: ['Test low and high frame rates with identical weapon cadence.', 'Send impossible directions and rates through a harness.'], failureModes: ['A frame event sends aim remotes every render step.', 'The payload names the victim and damage as facts.'] },
  { id: 'input-gamepad-prompt-glyphs', title: 'Update prompts for active gamepad controls', domain: 'input', summary: 'Show the current action binding rather than hard-coded keyboard text.', refs: ['inputGamepad', 'inputActions'], keywords: ['gamepad', 'glyph', 'prompt'], steps: ['Read the active action binding.', 'Map supported codes to a consistent glyph or short label.', 'Fall back to a textual action name for unknown devices.', 'Update only when the active input family changes.'], verification: ['Connect and disconnect a controller while a prompt is visible.', 'Verify fallback text for an unmapped input.'], failureModes: ['A prompt always says E on console.', 'Glyph refresh runs every frame.'] },
  { id: 'input-touch-action-layout', title: 'Lay out custom touch actions without covering movement', domain: 'input', summary: 'Place touch-only actions around existing movement and camera gestures with clear priority.', refs: ['inputMobile', 'inputActions'], keywords: ['touch', 'mobile', 'action button'], steps: ['Inventory existing default and custom touch regions.', 'Place frequent actions in reachable non-overlapping zones.', 'Hide actions outside their valid gameplay state.', 'Keep camera swipe space free.'], verification: ['Complete the loop with both thumbs on a small phone.', 'Rotate orientation if the experience supports it.'], failureModes: ['A custom action overlays the jump button.', 'Invisible controls continue consuming touch.'] },
  { id: 'input-device-family-switch', title: 'Switch prompts and focus when the active device changes', domain: 'input', summary: 'Respond to keyboard, touch and gamepad transitions without rebuilding the whole interface.', refs: ['inputOverview', 'inputGamepad'], keywords: ['device switch', 'last input'], steps: ['Track the last meaningful input family, ignoring noise.', 'Swap prompt glyphs and selection mode on change.', 'Preserve the current game state and selected action.', 'Rate-limit cosmetic refresh.'], verification: ['Alternate mouse and gamepad rapidly.', 'Touch the screen while a controller-selected modal is open.'], failureModes: ['Mouse movement jitter constantly steals gamepad focus.', 'Changing glyphs resets the player flow.'] },
  { id: 'input-tap-hold-release', title: 'Distinguish tap, hold and release semantics', domain: 'input', summary: 'Use explicit action phases so charging, aiming and quick activation do not conflict.', refs: ['inputActions', 'userInput'], keywords: ['tap', 'hold', 'release'], steps: ['Define time and cancellation rules for each phase.', 'Start only local preview work on begin.', 'Commit one request at the accepted phase.', 'Cancel on state change, death or focus loss.'], verification: ['Test just below, at and above the hold threshold.', 'Lose focus during a hold and confirm no late commit.'], failureModes: ['Both tap and hold handlers fire for one press.', 'A cancelled hold remains armed.'] },
  { id: 'input-action-cooldown-gate', title: 'Gate repeated input by authoritative cooldown', domain: 'input', summary: 'Keep local feedback responsive while the server owns whether the action is ready.', refs: ['inputActions', 'securityTactics'], keywords: ['cooldown', 'spam', 'debounce'], steps: ['Track cosmetic local readiness for immediate feedback.', 'Send one bounded request when local readiness permits.', 'Validate server cooldown from server time.', 'Reconcile UI from accepted or refused result.'], verification: ['Spam faster than the cooldown through normal and crafted input.', 'Simulate latency around the exact boundary.'], failureModes: ['A client debounce is treated as security.', 'Refusal leaves the UI permanently disabled.'] },
  { id: 'input-proximity-interaction', title: 'Make proximity interaction state-aware', domain: 'input', summary: 'Use proximity prompts for discovery while rechecking distance, state and permission on the server.', refs: ['proximity', 'clientBoundary'], keywords: ['proximityprompt', 'interact', 'distance'], steps: ['Configure action text and hold behavior for the object.', 'Enable the prompt only in broadly eligible states.', 'On trigger, recheck player distance, object state and permission.', 'Return a clear refusal when the object changed.'], verification: ['Trigger while moving out of range and while another player changes the object.', 'Test controller, keyboard and touch activation.'], failureModes: ['Prompt visibility is treated as authorization.', 'Two players consume the same one-use object.'] },
  { id: 'input-camera-capture-release', title: 'Capture and release camera input cleanly', domain: 'input', summary: 'Own camera drag or lock only while the relevant mode is active and restore prior behavior on exit.', refs: ['camera', 'inputKeyboard'], keywords: ['camera', 'mouse lock', 'capture'], steps: ['Record the prior camera and cursor state.', 'Bind look input only for the active mode.', 'Clamp or smooth movement without changing gameplay authority.', 'Restore state on close, death and respawn.'], verification: ['Enter and exit the mode through every path.', 'Respawn while the camera mode is active.'], failureModes: ['Cursor remains locked after closing UI.', 'Several camera controllers write CFrame in the same frame.'] },
  { id: 'input-remappable-actions', title: 'Support remappable actions without invalid conflicts', domain: 'input', summary: 'Store semantic bindings, detect conflicts and always preserve a usable escape path.', refs: ['inputActions', 'inputGamepad'], keywords: ['remap', 'binding', 'accessibility'], steps: ['Define which actions may be rebound and reserved inputs.', 'Capture one new binding in an isolated listening state.', 'Detect conflicts and ask for an explicit resolution.', 'Persist the action map, not gameplay code branches.'], verification: ['Attempt duplicate, reserved and unsupported bindings.', 'Reset to defaults using only the remapped controls.'], failureModes: ['The close/back action can be unbound completely.', 'A conflict silently disables another action.'] },

  // Client/server and data boundaries.
  { id: 'network-remote-schema', title: 'Give a remote a bounded request schema', domain: 'client_server', summary: 'Define exact argument types, lengths, ranges and server-derived fields for one remote action.', refs: ['remotes', 'clientBoundary'], keywords: ['remoteevent', 'schema', 'validation'], steps: ['Name the player intent in one verb.', 'List allowed fields and strict bounds.', 'Remove price, damage, ownership and permission claims the server can derive.', 'Validate before touching game state.'], verification: ['Fuzz wrong types, missing fields, extra depth and extreme values.', 'Confirm every refusal leaves state unchanged.'], failureModes: ['A flexible table accepts attacker-controlled nested data.', 'Validation happens after a partial mutation.'] },
  { id: 'network-request-timeout', title: 'Bound a client request and timeout recovery', domain: 'client_server', summary: 'Keep UI and gameplay from hanging when a request is lost, refused or delayed.', refs: ['remotes', 'uiButtons'], keywords: ['timeout', 'request', 'remote function'], steps: ['Choose event or callback semantics deliberately.', 'Put the client surface in a visible pending state.', 'Expire the local wait without assuming server failure means rollback.', 'Fetch authoritative state before allowing a risky retry.'], verification: ['Drop, delay and duplicate the response.', 'Leave the game state while a request is pending.'], failureModes: ['An unbounded RemoteFunction wait freezes the flow.', 'Timeout blindly retries a non-idempotent purchase.'] },
  { id: 'network-unreliable-cosmetics', title: 'Reserve unreliable transport for replaceable cosmetics', domain: 'client_server', summary: 'Use lossy updates only when a newer sample fully replaces an older one and no authority depends on delivery.', refs: ['remotes', 'clientBoundary'], keywords: ['unreliable', 'cosmetic', 'high frequency'], steps: ['Classify the update as state, transaction or replaceable sample.', 'Keep authoritative state on reliable server paths.', 'Cap sample rate and payload size.', 'Render gracefully when samples drop.'], verification: ['Drop and reorder samples in a test harness.', 'Confirm no reward, hit or inventory result depends on the channel.'], failureModes: ['A transaction is sent unreliably and disappears.', 'Each sample is a delta, so packet loss permanently desynchronizes.'] },
  { id: 'network-authoritative-state-snapshot', title: 'Replicate authoritative state as a coherent snapshot', domain: 'client_server', summary: 'Expose one consistent state view so UI cannot combine fields from different server transitions.', refs: ['remotes', 'collection'], keywords: ['snapshot', 'replication', 'state'], steps: ['Define the minimal client-visible state shape.', 'Version or sequence state transitions.', 'Apply the snapshot atomically on the client.', 'Ignore older snapshots after a newer one.'], verification: ['Reorder two updates and confirm the newest state wins.', 'Join midway through a transition and inspect initial state.'], failureModes: ['Independent remotes make phase and timer disagree.', 'A late packet rolls the client back.'] },
  { id: 'network-attribute-contract', title: 'Use attributes as a small replicated contract', domain: 'client_server', summary: 'Store bounded observable state in attributes without turning them into a client-owned database.', refs: ['collection', 'clientBoundary'], keywords: ['attributes', 'replication', 'contract'], steps: ['Choose only small scalar state needed by observers.', 'Write authoritative attributes from the server.', 'Subscribe to changes and handle the current value first.', 'Keep complex/private data in server structures.'], verification: ['Attach an observer after the attribute already exists.', 'Attempt a client-side attribute change and confirm it grants nothing.'], failureModes: ['A client-written attribute is treated as permission.', 'Listeners miss the initial value and wait forever.'] },
  { id: 'network-tagged-lifecycle', title: 'Own tagged instance setup and teardown', domain: 'client_server', summary: 'Initialize CollectionService-tagged instances exactly once and disconnect work when they leave scope.', refs: ['collection', 'debris'], keywords: ['collectionservice', 'tags', 'lifecycle'], steps: ['Process existing tagged instances before listening for additions.', 'Mark or table-track initialized instances.', 'Connect only the events the instance needs.', 'Disconnect and release references on removal or destruction.'], verification: ['Add, remove and re-add the same tagged object.', 'Stream tagged objects in and out if streaming is enabled.'], failureModes: ['Existing instances are skipped because only additions are observed.', 'Re-adding creates duplicate connections.'] },
  { id: 'network-event-connection-cleanup', title: 'Clean up event connections with their owner', domain: 'client_server', summary: 'Tie every connection and task to a lifecycle owner so respawn and page changes do not multiply work.', refs: ['remotes', 'perfIdentify'], keywords: ['connection', 'cleanup', 'lifecycle'], steps: ['Name the object or state that owns each connection.', 'Store disconnect handles in that owner.', 'Cancel delayed work on teardown.', 'Make teardown idempotent.'], verification: ['Enter and leave the state repeatedly while counting callbacks.', 'Destroy the owner during a delayed operation.'], failureModes: ['CharacterAdded stacks another input handler each respawn.', 'A delayed callback writes to destroyed UI.'] },
  { id: 'network-cross-server-message', title: 'Treat cross-server messages as hints, not transactions', domain: 'client_server', summary: 'Use MessagingService to announce invalidatable state and fetch the source of truth separately.', refs: ['messaging', 'dataStore'], keywords: ['messagingservice', 'cross server', 'publish'], steps: ['Define a compact message with stable identity and version.', 'Publish only after the source-of-truth write succeeds.', 'On receipt, validate shape and fetch or recompute authoritative state.', 'Handle duplicate and missing messages.'], verification: ['Deliver the same message twice and out of order.', 'Skip a message and confirm eventual state can still recover.'], failureModes: ['The message itself is treated as durable storage.', 'Subscribers apply an older version over a newer one.'] },
  { id: 'data-profile-schema-migration', title: 'Migrate saved profiles without destructive defaults', domain: 'data', summary: 'Add or transform profile fields while preserving unknown valid progress and recording schema version.', refs: ['saveData', 'dataStore'], keywords: ['migration', 'schema', 'profile'], steps: ['Define old and new schema versions with invariants.', 'Migrate a copy after a successful load.', 'Validate the migrated result before accepting it.', 'Save only after the session owns a valid profile.'], verification: ['Run fixtures from every supported version and a partially corrupt profile.', 'Confirm a failed migration cannot overwrite the original.'], failureModes: ['Missing fields trigger a whole-profile default.', 'A migration runs repeatedly because version is never advanced.'] },
  { id: 'data-write-budget-queue', title: 'Queue and coalesce persistent writes', domain: 'data', summary: 'Reduce redundant DataStore traffic while ensuring critical final state is not silently dropped.', refs: ['dataStore', 'saveData'], keywords: ['budget', 'autosave', 'queue'], steps: ['Classify mutations by durability urgency.', 'Coalesce ordinary changes into one profile write.', 'Back off on throttling without overlapping writes for one key.', 'Flush bounded critical work on leave and shutdown.'], verification: ['Burst many mutations and count actual writes.', 'Inject throttles and shutdown during a queued write.'], failureModes: ['Every coin change writes immediately.', 'Concurrent writes to one key complete out of order.'] },
  { id: 'data-ordered-leaderboard-cache', title: 'Refresh a global leaderboard on a bounded cadence', domain: 'data', summary: 'Write sortable values sparingly and cache names/results between board refreshes.', refs: ['leaderboardData', 'dataStore'], keywords: ['ordered datastore', 'leaderboard', 'cache'], steps: ['Choose one integer ranking value and stable key.', 'Update it on a bounded cadence or meaningful milestone.', 'Read a fixed page size on a timer.', 'Cache user display lookup separately from scores.'], verification: ['Profile request counts with a full server.', 'Handle a failed page or name lookup without clearing the board.'], failureModes: ['The board refreshes on every score change.', 'One failed lookup aborts every row.'] },
  { id: 'data-memory-store-ephemeral', title: 'Use MemoryStore only for expiring coordination', domain: 'data', summary: 'Keep queues, matchmaking and locks time-bounded and reconstructable after eviction.', refs: ['memoryStore', 'dataStore'], keywords: ['memorystore', 'queue', 'ttl'], steps: ['Choose a TTL and maximum stale window.', 'Store only coordination data that can be rebuilt.', 'Use stable request identity for retries.', 'Persist durable outcomes separately after they commit.'], verification: ['Expire or evict entries during the flow.', 'Retry the same request and confirm no duplicate durable reward.'], failureModes: ['Player progress exists only in MemoryStore.', 'A lock has no expiry and strands the resource.'] },

  // Gameplay primitives that are broader than one genre.
  { id: 'gameplay-raycast-hit-evidence', title: 'Validate a raycast hit from evidence', domain: 'gameplay', summary: 'Let the client supply aim intent while the server checks cadence, origin, range, obstruction and target state.', refs: ['worldRoot', 'clientBoundary'], keywords: ['raycast', 'hit', 'line of sight'], steps: ['Capture client origin/direction and weapon sequence.', 'Reject impossible cadence and origin displacement.', 'Raycast on the server with explicit filters.', 'Apply damage only to an eligible resolved target.'], verification: ['Test through-wall, out-of-range, stale and duplicate shots.', 'Compare high-latency legitimate shots against validation tolerance.'], failureModes: ['The client sends target and damage as the result.', 'Raycast filters include the shooter or exclude the map.'] },
  { id: 'gameplay-path-recovery', title: 'Recover an NPC path when the world changes', domain: 'gameplay', summary: 'Compute paths on a cadence, consume waypoints and repath on blockage or target movement without per-frame requests.', refs: ['pathfinding', 'humanoid'], keywords: ['npc', 'pathfinding', 'repath'], steps: ['Set agent dimensions from the actual NPC.', 'Check path status before consuming waypoints.', 'Handle jump actions and blocked segments.', 'Repath after a bounded interval or meaningful invalidation.'], verification: ['Block the next waypoint and move the target across navigation regions.', 'Destroy the target or NPC during a path.'], failureModes: ['ComputeAsync runs every frame.', 'A failed path falls back to walking through walls.'] },
  { id: 'gameplay-physics-ownership', title: 'Assign physics ownership deliberately', domain: 'gameplay', summary: 'Choose ownership for vehicles or movable assemblies while validating competitive outcomes on the server.', refs: ['physicsOwnership', 'networkSecurity'], keywords: ['network owner', 'physics', 'vehicle'], steps: ['Identify the assembly root and driver or controller.', 'Set or reset ownership at controlled lifecycle points.', 'Keep client simulation smooth but validate impossible movement server-side.', 'Recover ownership when the player leaves or seat changes.'], verification: ['Transfer ownership between players and server.', 'Inject extreme movement and observe refusal without false positives on lag.'], failureModes: ['The server fights the client every frame.', 'Client-owned physics is accepted as proof of a hit or reward.'] },
  { id: 'gameplay-animation-marker-event', title: 'Drive gameplay cues from named animation markers', domain: 'gameplay', summary: 'Use animation events for audiovisual timing while the server still owns damage and rewards.', refs: ['animation', 'animationEvents'], keywords: ['animation marker', 'event', 'timing'], steps: ['Name markers for contact, sound or effect cues.', 'Connect marker handlers for the active track only.', 'Keep authoritative hit windows in server state.', 'Disconnect handlers when the track stops or is replaced.'], verification: ['Interrupt, blend and replay the animation.', 'Run with missing markers and confirm safe fallback.'], failureModes: ['A client marker directly grants damage.', 'Old track handlers fire during a new action.'] },

  // Worldbuilding.
  { id: 'world-low-poly-silhouette-kit', title: 'Build a low-poly silhouette kit before surface detail', domain: 'worldbuilding', summary: 'Create a small family of reusable shapes whose proportions and color blocking communicate the world at gameplay distance.', refs: ['parts', 'meshes', 'perfDesign'], keywords: ['low poly', 'silhouette', 'modular kit'], steps: ['List the scene roles: boundary, landmark, cover, prop and path marker.', 'Block each role with a distinct silhouette and shared scale language.', 'Reuse materials and color groups before adding texture assets.', 'Check collisions and pivots for repeated placement.'], verification: ['Read every role from the normal gameplay camera.', 'Count unique meshes/materials and inspect phone-class rendering.'], failureModes: ['Texture detail carries identity that disappears at distance.', 'Every prop is unique and prevents batching or reuse.'] },
  { id: 'world-material-palette', title: 'Limit a scene to a readable material palette', domain: 'worldbuilding', summary: 'Assign a small material and color vocabulary by gameplay role instead of decorating every surface independently.', refs: ['materials', 'perfDesign'], keywords: ['materials', 'palette', 'color'], steps: ['Name base, path, hazard, interactable and accent roles.', 'Choose one or two materials per role.', 'Reserve strongest contrast for player decisions.', 'Apply consistently across modular pieces.'], verification: ['Desaturate or squint-test the scene for role separation.', 'Inspect material count and accidental one-off variants.'], failureModes: ['Every surface uses a different high-detail texture.', 'Hazards share the same value and color as safe paths.'] },
  { id: 'world-lighting-gameplay-pass', title: 'Light the route before adding post effects', domain: 'worldbuilding', summary: 'Use global and local light to reveal traversal, threats and goals before cinematic polish.', refs: ['lighting', 'postProcessing'], keywords: ['lighting', 'route', 'readability'], steps: ['Set global time, exposure and ambient balance for the genre.', 'Light the primary route and interaction points.', 'Use darkness deliberately outside playable decisions.', 'Add restrained post effects after route readability passes.'], verification: ['Traverse without editor selection outlines at target brightness.', 'Disable post effects and confirm core readability remains.'], failureModes: ['Bloom or color correction hides an unlit route.', 'Every light casts expensive overlapping influence.'] },
  { id: 'world-atmospheric-depth-layers', title: 'Create atmospheric depth without hiding navigation', domain: 'worldbuilding', summary: 'Separate foreground, route and distant backdrop through atmosphere while preserving silhouettes.', refs: ['atmosphere', 'lighting'], keywords: ['fog', 'atmosphere', 'depth'], steps: ['Measure normal visibility distance for gameplay.', 'Set density and haze around that requirement.', 'Keep interactive silhouettes above the background contrast floor.', 'Use landmarks that survive the atmosphere.'], verification: ['Check the longest required sightline and nearest hazard.', 'Test lower graphics quality and phone display brightness.'], failureModes: ['Fog conceals required jumps or enemies.', 'A distant backdrop has the same contrast as interactables.'] },
  { id: 'world-terrain-traversal', title: 'Shape terrain around traversal metrics', domain: 'worldbuilding', summary: 'Build slopes, ledges and routes from character movement limits, then dress them with low-cost forms.', refs: ['terrain', 'humanoid'], keywords: ['terrain', 'traversal', 'slope'], steps: ['Record character jump, step and slope limits.', 'Block the critical path with generous readable margins.', 'Add alternate routes without creating accidental traps.', 'Dress edges while preserving collision and pathfinding.'], verification: ['Traverse with default and supported custom movement.', 'Run NPC path checks across required terrain links.'], failureModes: ['Visual terrain shape differs from collision expectation.', 'Decorative clutter narrows the path below character clearance.'] },
  { id: 'world-vfx-readability-budget', title: 'Budget VFX by gameplay importance', domain: 'worldbuilding', summary: 'Use particles, beams and trails to explain actions while capping overlap, lifetime and emission.', refs: ['particles', 'perfDesign'], keywords: ['vfx', 'particles', 'budget'], steps: ['Classify effects as telegraph, impact, reward or ambience.', 'Give telegraphs priority over decorative ambience.', 'Bound emission, lifetime and simultaneous instances.', 'Pool or clean up repeated transient effects.'], verification: ['Trigger the maximum expected overlap and profile it.', 'Confirm hazard telegraphs remain visible under every reward effect.'], failureModes: ['Ambient particles obscure combat decisions.', 'Long lifetime multiplies particles long after the action ends.'] },
  { id: 'world-spatial-audio-zones', title: 'Build spatial audio zones with clear priority', domain: 'worldbuilding', summary: 'Place ambience and cues in 3D space while preventing stacked loops and inaudible gameplay signals.', refs: ['audio', 'audio3d', 'audioObjects'], keywords: ['spatial audio', 'ambience', 'sound zone'], steps: ['Separate global music, local ambience and gameplay cues.', 'Set rolloff distances from actual room or arena scale.', 'Crossfade zone ambience rather than stacking every loop.', 'Reserve headroom for warnings and impacts.'], verification: ['Walk every zone boundary and listen for jumps or doubled loops.', 'Trigger critical cues at the loudest ambience point.'], failureModes: ['Several full-volume loops occupy the same space.', 'A gameplay cue has the same spectrum and level as ambience.'] },
  { id: 'world-procedural-prop-variation', title: 'Vary repeated props from bounded components', domain: 'worldbuilding', summary: 'Create controlled variation in scale, orientation and attachments without unique heavy assets for every prop.', refs: ['proceduralModels', 'parts'], keywords: ['procedural', 'props', 'variation'], steps: ['Define a small authored component set.', 'Choose bounded variation ranges that preserve collision role.', 'Seed generation for reproducible rebuilds.', 'Keep pivots, naming and tags consistent.'], verification: ['Regenerate twice with the same seed and compare.', 'Inspect extreme combinations for overlap and silhouette failure.'], failureModes: ['Random scale breaks traversal or interaction height.', 'Unseeded generation makes bug reproduction impossible.'] },

  // Performance.
  { id: 'perf-budget-baseline', title: 'Set measurable scene and script budgets', domain: 'performance', summary: 'Record device, frame, memory, instance, network and effect limits before optimization work starts.', refs: ['perfDesign', 'perfMonitor'], keywords: ['budget', 'baseline', 'metrics'], steps: ['Choose representative phone and desktop test paths.', 'Record frame time, memory and network baseline.', 'Count high-cost scene categories and active loops.', 'Set release thresholds tied to player experience.'], verification: ['Repeat the path twice and compare variance.', 'Store evidence with device and place version.'], failureModes: ['A budget is copied from another game without measurement.', 'Average FPS hides long frame spikes.'] },
  { id: 'perf-microprofiler-capture', title: 'Capture a repeatable MicroProfiler trace', domain: 'performance', summary: 'Measure one reproducible hitch and identify the responsible task before changing code.', refs: ['microprofiler', 'perfIdentify'], keywords: ['microprofiler', 'trace', 'hitch'], steps: ['Define the exact action that causes the hitch.', 'Capture before, during and after that action.', 'Locate the longest relevant frame and owning label.', 'Change one suspected cause and capture again.'], verification: ['The before/after traces use the same scene and action.', 'The measured frame-time reduction matches the claimed fix.'], failureModes: ['Optimization starts from a guess instead of a trace.', 'Several changes land before any comparison.'] },
  { id: 'perf-streaming-safe-script', title: 'Make gameplay scripts safe under instance streaming', domain: 'performance', summary: 'Handle required objects appearing late, disappearing and reappearing without infinite waits or duplicate setup.', refs: ['streaming', 'streamingTechniques'], keywords: ['streaming', 'waitforchild', 'stream in'], steps: ['Classify objects as persistent, streamed or server-only.', 'Resolve streamed objects through observable lifecycle, not one permanent reference.', 'Bound waits and provide a recovery state.', 'Tear down work when the object streams out.'], verification: ['Move across streaming boundaries repeatedly.', 'Test slow arrival and absence of an optional object.'], failureModes: ['An infinite WaitForChild blocks the controller.', 'A streamed-out instance remains referenced and used.'] },
  { id: 'perf-network-payload-audit', title: 'Audit network frequency and payload size', domain: 'performance', summary: 'Measure remote traffic, remove redundant fields and lower rates before it becomes a server or client bottleneck.', refs: ['networkProfiler', 'remotes'], keywords: ['network', 'payload', 'rate'], steps: ['Record calls per second and bytes per action family.', 'Separate transactional from replaceable cosmetic traffic.', 'Remove server-derivable and repeated fields.', 'Batch or reduce sample rate only where semantics allow.'], verification: ['Compare network capture before and after under the same player count.', 'Confirm no authoritative event is dropped or reordered by the change.'], failureModes: ['A per-frame table is sent for every player.', 'Compression work costs more CPU than the saved payload.'] },
  { id: 'perf-connection-leak-check', title: 'Detect connection and task leaks across lifecycle loops', domain: 'performance', summary: 'Measure callback growth after repeated respawn, round and UI transitions.', refs: ['perfIdentify', 'perfMonitor'], keywords: ['leak', 'connections', 'respawn'], steps: ['Choose a lifecycle that can repeat quickly.', 'Instrument active owners, connections and tasks.', 'Repeat the lifecycle many times.', 'Fix teardown ownership and rerun the same count.'], verification: ['Counts return to baseline after each teardown.', 'No callback fires more than once per event after the stress loop.'], failureModes: ['A new heartbeat loop starts every round.', 'Destroyed UI remains captured by a closure.'] },
  { id: 'perf-batched-npc-updates', title: 'Batch NPC sensing and decisions', domain: 'performance', summary: 'Move expensive NPC queries off per-NPC per-frame loops while preserving responsive local movement.', refs: ['pathfinding', 'perfImprove'], keywords: ['npc', 'batch', 'scheduler'], steps: ['Separate cheap movement from expensive sensing and path requests.', 'Stagger NPC decisions across a bounded cadence.', 'Share spatial candidate queries where possible.', 'Cap work when no eligible target exists.'], verification: ['Profile at minimum, expected and stress NPC counts.', 'Measure decision latency as well as frame time.'], failureModes: ['Every NPC pathfinds on Heartbeat.', 'Batching all NPCs on one frame creates a periodic spike.'] },
  { id: 'perf-parallel-luau-isolated-work', title: 'Move measured isolated CPU work to Parallel Luau', domain: 'performance', summary: 'Use parallel execution only for a measured CPU-heavy region with bounded inputs and outputs, while returning to serial execution before unsupported or authoritative mutations.', refs: ['parallelLuau', 'microprofiler'], keywords: ['parallel luau', 'actors', 'cpu'], steps: ['Capture a trace that identifies one CPU-bound region worth parallelizing.', 'Partition the work by independent data ownership and bound each message or shared-data payload.', 'Run only the isolated computation in parallel and return to serial execution before mutating authoritative experience state.', 'Preserve a serial implementation so the same workload and result can be compared.'], verification: ['Compare serial and parallel traces under the same workload and device class.', 'Run the workload repeatedly and confirm deterministic results, bounded messages and clean Actor teardown.'], failureModes: ['Parallelizing waits or tiny tasks adds scheduling cost without reducing the measured frame.', 'Shared mutable state or unsupported engine calls create races or runtime failures.'] },
  { id: 'perf-particle-overdraw', title: 'Reduce particle overlap and lifetime', domain: 'performance', summary: 'Preserve visual cues while lowering simultaneous transparent pixels and emitter work.', refs: ['particles', 'perfImprove'], keywords: ['particles', 'overdraw', 'lifetime'], steps: ['Capture the maximum simultaneous effect case.', 'Remove unseen, duplicate and overlong emitters first.', 'Reduce screen coverage before texture resolution.', 'Keep telegraph timing and color identity intact.'], verification: ['Compare frame time and effect readability at stress overlap.', 'Inspect low graphics quality and phone hardware.'], failureModes: ['Only texture size changes while overdraw remains.', 'Optimization removes the gameplay telegraph.'] },
  { id: 'perf-phone-hardware-pass', title: 'Run a phone-class release pass', domain: 'performance', summary: 'Test the actual player loop on constrained hardware and record thermal, memory and frame behavior.', refs: ['hardwareTest', 'perfMonitor'], keywords: ['mobile', 'hardware', 'release'], steps: ['Use a representative lower-end supported device.', 'Run onboarding, core loop and worst-case scene long enough to warm up.', 'Record frame time, memory and visible degradation.', 'Recheck after fixes using the same route.'], verification: ['Evidence names device, build and route.', 'The full loop remains playable after sustained load.'], failureModes: ['Desktop emulation is treated as phone evidence.', 'A five-second test misses thermal and memory growth.'] },

  // Security.
  { id: 'security-remote-type-range', title: 'Validate remote type, range and ownership', domain: 'security', summary: 'Reject malformed or impossible remote input before resolving any referenced object or mutating state.', refs: ['clientBoundary', 'securityTactics'], keywords: ['remote', 'validation', 'ownership'], steps: ['Validate primitive types and bounded lengths first.', 'Resolve ids only inside server-owned allowed sets.', 'Check distance, state and ownership.', 'Mutate once after all checks pass.'], verification: ['Fuzz nil, tables, NaN, infinity, huge strings and other players’ ids.', 'Assert rejected calls leave every protected value unchanged.'], failureModes: ['Indexing attacker data throws before validation.', 'Ownership is inferred from a client-provided path.'] },
  { id: 'security-per-player-rate-limit', title: 'Rate-limit one server action per player', domain: 'security', summary: 'Bound abusive frequency while allowing legitimate burst shape and cleaning state when the player leaves.', refs: ['securityTactics', 'serverDetection'], keywords: ['rate limit', 'cooldown', 'abuse'], steps: ['Measure legitimate cadence and burst.', 'Store server-time tokens or timestamps by player and action.', 'Refuse excess work before expensive queries.', 'Expire limiter state on leave and after inactivity.'], verification: ['Test boundary, burst and sustained abuse patterns.', 'Confirm one player cannot consume another player’s allowance.'], failureModes: ['One global debounce blocks everyone.', 'Limiter tables retain departed players forever.'] },
  { id: 'security-server-owned-price', title: 'Keep prices and rewards server-owned', domain: 'security', summary: 'Accept an item or action id from the client, then derive cost, eligibility and grant from server tables.', refs: ['clientBoundary', 'marketplace'], keywords: ['price', 'purchase', 'reward'], steps: ['Define the server catalogue keyed by stable id.', 'Accept only the requested id and bounded context.', 'Read price and reward from the catalogue.', 'Commit debit and grant atomically.'], verification: ['Send negative, zero, altered and unknown prices or ids.', 'Retry the same transaction and confirm idempotent outcome.'], failureModes: ['The client sends the price it wants to pay.', 'Debit and grant occur in separate failure-prone steps.'] },
  { id: 'security-third-party-asset-scan', title: 'Inspect third-party assets before use', domain: 'security', summary: 'Treat inserted models and packages as untrusted until scripts, remotes, requires and hierarchy are reviewed.', refs: ['thirdPartySecurity', 'capabilities'], keywords: ['asset', 'backdoor', 'third party'], steps: ['Record source and intended asset type.', 'Inspect all descendants and script-bearing instances.', 'Reject unexpected executable content, remote loaders or privileged behavior.', 'Rebuild simple geometry locally when provenance or safety is unclear.'], verification: ['Run the existing hierarchy scanner and review every blocker.', 'Confirm the inserted result contains only the intended classes.'], failureModes: ['A popular asset is assumed safe from reputation.', 'Hidden descendants or disabled scripts are ignored.'] },
  { id: 'security-filtered-player-text', title: 'Enforce server-mediated text filtering', domain: 'security', summary: 'Prevent unfiltered user content from reaching signs, names, chat-like UI or other players.', refs: ['uiTextFilter', 'clientBoundary'], keywords: ['text', 'filter', 'moderation'], steps: ['Trace each player-authored string from input to every display.', 'Filter for the correct public or recipient context.', 'Refuse or substitute safely when filtering fails.', 'Keep display clients unable to bypass the filtered value.'], verification: ['Test filter failure and multiple recipient contexts.', 'Search the client path for any use of the raw value.'], failureModes: ['Raw text is replicated before filtering.', 'A cached filtered value is reused for the wrong audience.'] },
  { id: 'security-role-access-check', title: 'Check privileged access on the server', domain: 'security', summary: 'Gate admin, moderation or owner actions by server-resolved identity and explicit allowed operations.', refs: ['accessControl', 'clientBoundary'], keywords: ['admin', 'role', 'permission'], steps: ['Define roles and exact allowed commands.', 'Resolve role from server-controlled membership or configuration.', 'Validate command arguments through the same public boundaries.', 'Audit accepted and refused privileged actions.'], verification: ['Invoke every command as authorized and unauthorized roles.', 'Attempt to spoof role fields and target protected users.'], failureModes: ['A client UI flag is treated as admin proof.', 'One broad role grants unrelated destructive actions.'] },
];

const MECHANIC_REFS: Readonly<Record<string, readonly ReferenceKey[]>> = Object.freeze({
  persistence: ['dataStore', 'saveData'],
  currency: ['dataStore', 'clientBoundary'],
  shop: ['marketplace', 'clientBoundary'],
  monetization: ['marketplace', 'dataStore'],
  inventory: ['saveData', 'clientBoundary'],
  pets: ['physicsMovers', 'clientBoundary'],
  leaderboard_global: ['leaderboardData', 'dataStore'],
  round_system: ['remotes', 'perfDesign'],
  checkpoints: ['saveData', 'humanoid'],
  killbricks: ['humanoid', 'collection'],
  weapons: ['worldRoot', 'clientBoundary'],
  enemies: ['pathfinding', 'humanoid'],
  waves: ['collection', 'perfDesign'],
  towers: ['worldRoot', 'collection'],
  path_waypoints: ['pathfinding', 'humanoid'],
  upgrades: ['dataStore', 'clientBoundary'],
  rebirth: ['dataStore', 'clientBoundary'],
  dropper: ['debris', 'physicsAssemblies'],
  plots: ['collection', 'clientBoundary'],
  quests: ['dataStore', 'proximity'],
  dialogue: ['proximity', 'uiTextFilter'],
  daily_reward: ['dataStore', 'saveData'],
  badges: ['badges', 'clientBoundary'],
  anticheat: ['clientBoundary', 'securityTactics'],
  vehicles: ['physicsOwnership', 'physicsMovers'],
  racing_track: ['collection', 'dataStore'],
  teams: ['humanoid', 'clientBoundary'],
  customization: ['humanoid', 'saveData'],
  tutorial: ['uiPages', 'saveData'],
  remotes: ['remotes', 'clientBoundary'],
  ragdoll: ['physicsAssemblies', 'humanoid'],
  placement: ['worldRoot', 'clientBoundary'],
  zones: ['worldRoot', 'collection'],
  camera: ['camera', 'inputOverview'],
  admin_commands: ['accessControl', 'clientBoundary'],
  procedural_terrain: ['terrain', 'perfDesign'],
});

const MECHANIC_GENRES: Readonly<Record<string, readonly GenreKitId[]>> = Object.freeze({
  pets: ['simulator', 'roleplay'],
  round_system: ['horror', 'obby', 'racing', 'tower_defense', 'fps_arena', 'anime_battle', 'survival'],
  checkpoints: ['obby', 'racing'],
  killbricks: ['obby', 'survival'],
  weapons: ['fps_arena', 'anime_battle', 'survival'],
  enemies: ['horror', 'tower_defense', 'anime_battle', 'survival'],
  waves: ['horror', 'tower_defense', 'anime_battle', 'survival'],
  towers: ['tower_defense'],
  path_waypoints: ['horror', 'tower_defense', 'anime_battle', 'survival'],
  rebirth: ['tycoon', 'simulator'],
  dropper: ['tycoon'],
  plots: ['tycoon', 'roleplay'],
  dialogue: ['horror', 'simulator', 'roleplay'],
  vehicles: ['racing', 'roleplay'],
  racing_track: ['racing'],
  teams: ['racing', 'fps_arena', 'anime_battle'],
  customization: ['simulator', 'roleplay', 'anime_battle'],
  ragdoll: ['fps_arena', 'anime_battle', 'survival'],
  placement: ['tycoon', 'roleplay', 'tower_defense'],
  zones: ['horror', 'simulator', 'roleplay', 'survival'],
  procedural_terrain: ['horror', 'racing', 'roleplay', 'survival'],
});

const DATA_MECHANICS = new Set(['persistence', 'currency', 'inventory', 'leaderboard_global', 'upgrades', 'rebirth', 'daily_reward']);
const SECURITY_MECHANICS = new Set(['anticheat', 'admin_commands']);
const NETWORK_MECHANICS = new Set(['shop', 'monetization', 'badges', 'remotes']);

function mechanicDomain(pattern: MechanicPattern): CreatorSkillDomain {
  if (DATA_MECHANICS.has(pattern.id)) return 'data';
  if (SECURITY_MECHANICS.has(pattern.id)) return 'security';
  if (NETWORK_MECHANICS.has(pattern.id)) return 'client_server';
  return 'gameplay';
}

function mechanicImplementation(pattern: MechanicPattern): CreatorSkillImplementation {
  return pattern.prefab
    ? {
        kind: 'reviewed_prefab',
        id: pattern.prefab,
        executableVerified: true,
        note: `The repository ships reviewed source under install_module("${pattern.prefab}"). Read and wire its API rather than re-deriving the protected core.`,
      }
    : {
        kind: 'mechanic_pattern',
        id: pattern.id,
        executableVerified: false,
        note: 'The existing mechanic entry is reference guidance with current API names and failure modes; it is not executable code.',
      };
}

function mechanicSeeds(pattern: MechanicPattern): readonly SkillSeed[] {
  const domain = mechanicDomain(pattern);
  const refs = MECHANIC_REFS[pattern.id] ?? ['clientBoundary'];
  const genres = MECHANIC_GENRES[pattern.id] ?? allGenres;
  const implementation = mechanicImplementation(pattern);
  const firstApi = pattern.api.slice(0, 3).join('; ');
  const hardeningFailures = [...pattern.pitfalls.slice(2, 4)];
  while (hardeningFailures.length < 2) hardeningFailures.push(pattern.pitfalls[hardeningFailures.length] ?? `The ${pattern.label} owner is not cleaned up.`);
  return [
    {
      id: `mechanic-${pattern.id.replace(/_/g, '-')}-architecture`,
      title: `Architect ${pattern.label}`,
      domain,
      genres,
      summary: pattern.what,
      preconditions: [`The experience has named the state owned by ${pattern.label}.`],
      steps: [
        `Write the state contract for ${pattern.label} before its UI or effects.`,
        `Place authority where the existing pattern requires it: ${pattern.authority}`,
        `Use current engine surfaces from the reviewed pattern: ${firstApi}`,
        pattern.prefab ? `Install and wire the reviewed ${pattern.prefab} prefab for the protected core.` : 'Build one lifecycle owner with explicit start, stop and cleanup paths.',
      ],
      verification: [
        `Exercise the normal ${pattern.label} loop from start through cleanup.`,
        `Attempt to advance ${pattern.label} using only a client-authored result and confirm the server refuses it.`,
      ],
      failureModes: pattern.pitfalls.slice(0, 2),
      qualityCriteria: [`The implementation follows the existing ${pattern.id} mechanic contract instead of inventing a parallel system.`],
      refs,
      keywords: [pattern.label, ...(pattern.aliases ?? []), ...pattern.api.slice(0, 2)],
      implementation,
    },
    {
      id: `mechanic-${pattern.id.replace(/_/g, '-')}-failure-hardening`,
      title: `Harden ${pattern.label} against its known failures`,
      domain: domain === 'gameplay' ? 'security' : domain,
      genres,
      summary: `Turn the documented failure cases for ${pattern.label} into server refusals, bounded recovery and regression checks.`,
      preconditions: [`The base ${pattern.label} lifecycle already works in one normal case.`],
      steps: [
        `Convert this known failure into a reproducible case: ${pattern.pitfalls[0]}`,
        `Add a refusal or recovery path for this second failure: ${pattern.pitfalls[1] ?? pattern.pitfalls[0]}`,
        'Bound retries, loops, spawned instances and per-player state for the stress case.',
        'Keep rejection side-effect free, then clean every connection, task and temporary instance on teardown.',
      ],
      verification: [
        `Run the first two documented ${pattern.label} failures and assert protected state is unchanged.`,
        'Repeat the lifecycle and confirm no duplicate reward, handler, object or write remains.',
      ],
      failureModes: hardeningFailures,
      qualityCriteria: ['A failed request is distinguishable from a successful mutation.', 'The stress result is measured rather than inferred from one playthrough.'],
      refs,
      keywords: [pattern.label, 'hardening', 'failure', ...(pattern.aliases ?? [])],
      implementation,
    },
  ];
}

const MECHANIC_SEEDS = MECHANIC_PATTERNS.flatMap((pattern) => mechanicSeeds(pattern));

function genreTask(
  genre: GenreKitId,
  slug: string,
  title: string,
  summary: string,
  refs: readonly ReferenceKey[],
  steps: readonly string[],
  verification: readonly string[],
  failureModes: readonly string[],
  keywords: readonly string[] = [],
  qualityCriteria: readonly string[] = [],
): SkillSeed {
  return {
    id: `genre-${genre.replace(/_/g, '-')}-${slug}`,
    title,
    domain: 'genre_pattern',
    genres: [genre],
    summary,
    refs,
    steps,
    verification,
    failureModes,
    keywords: [genre, ...keywords],
    qualityCriteria,
  };
}

const GENRE_SEEDS: SkillSeed[] = [];

GENRE_SEEDS.push(
  // Horror: tension comes from controlled information and pursuit, not from hiding every decision.
  genreTask('horror', 'safe-room-onboarding', 'Teach horror interaction inside a safe room', 'Introduce movement, interaction and the first objective before exposing the player to lethal pursuit.', ['proximity', 'uiSurface'], ['Place one readable interactable beside the spawn route.', 'Require the player to perform the core interaction once.', 'Open the danger route only after the interaction state is confirmed.'], ['A first-time player reaches the danger route without outside instructions.', 'Skipping or repeating the prompt cannot duplicate the objective reward.'], ['The first threat arrives before controls are understood.', 'A tutorial overlay blocks escape input.'], ['onboarding', 'safe room']),
  genreTask('horror', 'tension-lighting-route', 'Light a horror route without concealing required choices', 'Use pockets of visibility, silhouette and contrast to guide progress while preserving uncertainty outside the route.', ['lighting', 'atmosphere'], ['Mark the next safe decision with the clearest value contrast.', 'Keep optional spaces dimmer without making collision unreadable.', 'Reserve abrupt light change for a named event or threat.'], ['Walk the route at target brightness without Studio outlines.', 'Each required doorway and hazard remains readable on phone-class display.'], ['Uniform darkness turns navigation into guessing.', 'Bloom and fog erase threat silhouettes.'], ['lighting', 'route']),
  genreTask('horror', 'layered-ambience-cues', 'Layer horror ambience beneath actionable audio cues', 'Build a restrained ambience bed while footsteps, pursuit and objective cues stay locatable.', ['audio3d', 'audioObjects'], ['Assign ambience, threat and interaction to separate priority bands.', 'Set spatial rolloff from actual corridor and room dimensions.', 'Duck ambience during the cue that demands action.'], ['A player locates the threat direction with eyes closed.', 'Crossing room boundaries does not stack duplicate loops.'], ['A loud ambience loop masks the warning cue.', 'Every room starts another full-volume track.'], ['audio', 'tension']),
  genreTask('horror', 'pursuit-state-recovery', 'Run and recover a horror pursuit state', 'Start pursuit from one server-owned trigger, repath the threat, then return to search or idle without stranded loops.', ['pathfinding', 'humanoid'], ['Define idle, investigate, chase and recovery transitions.', 'Repath on blockage or meaningful target movement at a bounded cadence.', 'End pursuit on escape, death, target loss or timeout and clean its tasks.'], ['Lose line of sight, leave the zone and die during pursuit.', 'A second pursuit starts with exactly one active path loop.'], ['The threat chases a departed player forever.', 'ComputeAsync runs every frame during chase.'], ['chase', 'monster']),
  genreTask('horror', 'jumpscare-cooldown', 'Gate a jumpscare by state, distance and cooldown', 'Treat a jumpscare as a bounded presentation event that cannot fire repeatedly from limb touches or remote spam.', ['worldRoot', 'securityTactics'], ['Resolve trigger eligibility on the server.', 'Record per-player event state and cooldown before presentation begins.', 'Play client camera, UI and audio as one cancellable presentation.'], ['Stand in the trigger, re-enter quickly and trigger with several limbs.', 'Respawn or leave during presentation and confirm camera and input restore.'], ['Touched fires the sequence many times.', 'The scare camera remains active after death.'], ['jumpscare', 'cooldown']),
  genreTask('horror', 'key-door-objective-chain', 'Build an ordered key-and-door objective chain', 'Represent keys and doors by stable ids so discovery, unlock and save state cannot be skipped or duplicated.', ['saveData', 'proximity'], ['Define required item ids and door state on the server.', 'Let the prompt request an unlock without sending ownership claims.', 'Consume or retain the key according to the explicit objective rule.'], ['Attempt the door without, with and after using the key.', 'Reconnect after each state and confirm the intended persistence.'], ['The client sets the door unlocked locally.', 'A duplicate request consumes two keys.'], ['key', 'door', 'objective']),
  genreTask('horror', 'death-retry-reset', 'Reset horror state for a fair retry', 'Return the player to a known checkpoint while clearing pursuit, temporary cues and one-run objective state deliberately.', ['humanoid', 'saveData'], ['Classify state as persistent, checkpointed or run-local.', 'Stop threat loops and transient effects before respawn.', 'Restore the checkpoint snapshot, then re-enable input and prompts.'], ['Die during every objective phase and during a scare.', 'No prior threat, sound loop or prompt remains active after retry.'], ['All progress is wiped because state classes were never named.', 'Old chase tasks continue against the new character.'], ['death', 'retry']),
  genreTask('horror', 'escape-landmark-readability', 'Use low-poly landmarks to make escape learnable', 'Give each route branch a distinct silhouette and limited material cue so players can build a mental map under pressure.', ['parts', 'materials'], ['Assign one silhouette landmark to each important junction.', 'Keep the landmark visible from the approach at chase speed.', 'Repeat its material cue only on destinations that share meaning.'], ['A tester can describe the return route after one pass.', 'Landmarks remain readable with textures disabled or low quality.'], ['Repeated corridors are indistinguishable.', 'Tiny texture detail carries the only navigation cue.'], ['landmark', 'low poly']),

  // Obby.
  genreTask('obby', 'ordered-checkpoint-chain', 'Advance obby checkpoints only in order', 'Keep one authoritative stage and accept only the immediately next checkpoint unless the design explicitly allows branches.', ['saveData', 'humanoid'], ['Number checkpoints by authored id rather than Workspace order.', 'Debounce contact per character and reject earlier or skipped stages.', 'Resolve respawn from the accepted stage.'], ['Touch with several limbs, walk backward and attempt a skipped pad.', 'Rejoin and respawn at the last accepted stage.'], ['A single touch awards the same stage repeatedly.', 'Workspace child order becomes progression order.'], ['checkpoint', 'stage']),
  genreTask('obby', 'hazard-telegraph', 'Telegraph an obby hazard before it becomes lethal', 'Pair every timed or moving hazard with a readable pre-state and consistent safe window.', ['tween', 'humanoid'], ['Define safe, warning and active states on one server-owned cycle.', 'Use color, motion or sound redundantly during warning.', 'Apply damage only in the active state with per-character debounce.'], ['Cross at each boundary time and under latency.', 'The warning remains legible without relying on color alone.'], ['Visual animation and damage timing disagree.', 'Touched applies damage many times per contact.'], ['hazard', 'telegraph']),
  genreTask('obby', 'moving-platform-cycle', 'Run a deterministic moving-platform cycle', 'Move a platform on a repeatable path with explicit dwell times and safe character interaction.', ['tween', 'physicsAssemblies'], ['Author endpoints and dwell durations as data.', 'Move one assembly root rather than fighting welded children.', 'Reset to a known phase on round restart.'], ['Ride from every edge and jump during motion.', 'Restart repeatedly and compare the phase and endpoint.'], ['Client and server animate different platform positions.', 'Several loops start on the same platform.'], ['moving platform', 'cycle']),
  genreTask('obby', 'respawn-camera-framing', 'Frame an obby respawn toward the next challenge', 'Restore the character and camera so the next route is visible without disorienting spin or hidden hazards.', ['camera', 'humanoid'], ['Choose spawn orientation from checkpoint metadata.', 'Wait for the new character and camera subject.', 'Blend or cut to a view that reveals the next safe landing.'], ['Respawn at each stage on keyboard, touch and gamepad.', 'Repeated deaths leave one active camera controller.'], ['Camera points back at the completed route.', 'A stale character remains the camera subject.'], ['respawn', 'camera']),
  genreTask('obby', 'difficulty-ramp', 'Ramp obby difficulty one variable at a time', 'Increase timing, precision or information demand in measured steps so failure teaches the next attempt.', ['parts', 'perfDesign'], ['Classify each obstacle by timing, precision and memory demand.', 'Change one dominant demand between adjacent stages.', 'Place a recovery or checkpoint after a new mechanic is learned.'], ['Record completion and failure location for first-time testers.', 'A failed attempt makes the intended lesson visible.'], ['Several new mechanics arrive on one stage.', 'Difficulty rises only by making jumps arbitrarily smaller.'], ['difficulty', 'level design']),
  genreTask('obby', 'mobile-jump-controls', 'Protect the obby route from mobile control overlap', 'Keep jump, camera and any custom action reachable without covering landing information.', ['inputMobile', 'uiPosition'], ['Map the thumb zones over the gameplay camera.', 'Move optional actions away from jump and camera swipe space.', 'Hide controls that are invalid for the current obstacle.'], ['Complete representative precision and timing stages on a small phone.', 'Measure accidental presses and obscured landing zones.'], ['A custom button covers the next platform.', 'Invisible controls consume camera gestures.'], ['mobile', 'touch']),
  genreTask('obby', 'server-time-trial', 'Record an obby time trial from server time', 'Start and finish a run only through ordered authoritative gates and save the best valid duration.', ['leaderboardData', 'clientBoundary'], ['Start the clock after the player crosses the start gate.', 'Require all mandatory checkpoints before accepting finish.', 'Compare and save one bounded integer duration.'], ['Skip a checkpoint, cross finish backward and resend finish.', 'Reconnect and read the same accepted best time.'], ['The client reports its own completion time.', 'Finish alone counts a lap or run.'], ['time trial', 'leaderboard']),
  genreTask('obby', 'anti-skip-spatial-check', 'Reject impossible obby progression without punishing recovery', 'Validate stage order and broad spatial plausibility while allowing authored teleports, launchers and respawns.', ['clientBoundary', 'worldRoot'], ['List every legitimate non-walking transition.', 'Check stage order first and spatial plausibility second.', 'Refuse impossible advancement and log evidence before any punishment.'], ['Use every launcher and teleport under high latency.', 'Attempt direct remote and impossible position advancement.'], ['A distance rule rejects legitimate launch pads.', 'The first anomaly immediately kicks the player.'], ['anti skip', 'validation']),
);

GENRE_SEEDS.push(
  // Tycoon.
  genreTask('tycoon', 'atomic-plot-claim', 'Claim and release one tycoon plot atomically', 'Assign at most one server-owned plot per player and make every plot action recheck that owner.', ['collection', 'clientBoundary'], ['Reserve a free plot in one server-owned assignment step.', 'Write owner identity to observable state after reservation succeeds.', 'Release and clear plot-scoped tasks when the player leaves.'], ['Join several players simultaneously and churn leaves and joins.', 'Attempt a purchase or collect action on another player’s plot.'], ['Two join handlers assign the same plot.', 'Departed owners leave plots permanently occupied.'], ['plot', 'claim']),
  genreTask('tycoon', 'bounded-dropper-chain', 'Bound a tycoon dropper and collector chain', 'Spawn income parts at a capped rate, credit the plot owner once and destroy each part.', ['debris', 'physicsAssemblies'], ['Set a minimum period and maximum live drops per dropper.', 'Tag each drop with its owning plot and value.', 'Consume the drop atomically when the collector credits the owner.'], ['Block the collector and run longer than the live-part cap.', 'Rest one drop on the collector and confirm one credit.'], ['Drops accumulate until the server degrades.', 'The touching visitor receives another plot’s income.'], ['dropper', 'collector']),
  genreTask('tycoon', 'purchase-pad-dependency', 'Unlock tycoon purchase pads by dependency', 'Drive visible purchase pads from a server-owned unlock graph and commit debit plus build once.', ['clientBoundary', 'dataStore'], ['Describe each purchase id, price and prerequisites in server data.', 'Expose only currently eligible pads to the owner.', 'Commit currency and unlocked id together before revealing dependents.'], ['Double-trigger a pad and attempt locked or foreign pads.', 'Reload the plot and rebuild exactly the unlocked set.'], ['The client sends a chosen price.', 'Two touches buy the same upgrade twice.'], ['purchase pad', 'unlock']),
  genreTask('tycoon', 'collector-owner-credit', 'Credit a tycoon collector to its plot owner', 'Resolve income from the plot assignment instead of whoever touched the collector.', ['collection', 'clientBoundary'], ['Read the collector’s plot identity.', 'Resolve its current server-owned owner.', 'Consume a valid drop and award that owner in one guarded path.'], ['Stand a visitor on the collector while drops arrive.', 'Unclaim the plot during an in-flight drop.'], ['The toucher receives the money.', 'An unowned plot keeps paying a departed player.'], ['collector', 'ownership']),
  genreTask('tycoon', 'offline-income-cap', 'Cap and validate tycoon offline income', 'Derive elapsed offline time from server timestamps, cap it and apply the reward once after a successful load.', ['dataStore', 'saveData'], ['Store the last authoritative server timestamp with the profile.', 'Clamp negative or excessive elapsed time.', 'Commit the new timestamp and reward in one profile mutation.'], ['Move the client clock, rejoin twice and simulate a long absence.', 'A failed load grants and saves nothing.'], ['Client time creates unlimited income.', 'Reward grants twice because the timestamp saves later.'], ['offline income', 'idle']),
  genreTask('tycoon', 'atomic-prestige-reset', 'Prestige a tycoon in one profile transaction', 'Validate the requirement, wipe the named progress subset and grant the bounded multiplier together.', ['dataStore', 'clientBoundary'], ['List fields preserved and fields reset.', 'Check requirement and current prestige on the server.', 'Commit reset, prestige increment and plot rebuild marker atomically.'], ['Double-click, retry after timeout and fail the write.', 'Reload immediately after prestige.'], ['Progress wipes before the bonus commits.', 'An uncapped multiplier reaches non-finite values.'], ['prestige', 'rebirth']),
  genreTask('tycoon', 'factory-route-readability', 'Make a tycoon factory route readable with low-poly modules', 'Use repeated silhouettes and color roles so players understand source, transport, processing and collection at a glance.', ['parts', 'materials'], ['Assign one shape and color role to each factory stage.', 'Keep conveyor direction visible from the plot entrance.', 'Reserve detailed props for landmarks, not every machine.'], ['A new tester points out the production flow before buying.', 'The route reads with textures disabled or low quality.'], ['Decorative machines hide the actual collector.', 'Each upgrade uses unrelated shapes and colors.'], ['factory', 'low poly']),
  genreTask('tycoon', 'factory-performance-budget', 'Hold a tycoon factory to a live-object budget', 'Measure droppers, conveyors, effects and UI together under a full-server stress state.', ['perfMonitor', 'sceneAnalysis'], ['Set per-plot and server-wide live drop caps.', 'Count active loops, moving assemblies and transparent effects.', 'Degrade cosmetic frequency before gameplay timing.'], ['Run the maximum plots and droppers for a sustained interval.', 'Compare frame, memory and instance counts to baseline.'], ['One coroutine runs forever per purchased machine.', 'Cosmetic drops remain after their economic value is consumed.'], ['performance', 'factory']),

  // Simulator.
  genreTask('simulator', 'authoritative-action-reward', 'Validate a simulator action before awarding progress', 'Treat tapping, training or collecting as a request whose rate, location and state the server can plausibly verify.', ['clientBoundary', 'securityTactics'], ['Define the legal action cadence and context.', 'Send action intent without a client-chosen reward amount.', 'Calculate and cap the reward from server-owned upgrades.'], ['Spam, batch and call outside the required zone.', 'Compare legitimate mobile burst behavior against the limiter.'], ['Every click remote directly adds a client number.', 'A global debounce blocks all players.'], ['clicker', 'training']),
  genreTask('simulator', 'pet-equip-cap', 'Own simulator pet inventory and equip limits', 'Roll pets on the server, store stable ids and enforce a small equipped set before spawning followers.', ['saveData', 'physicsMovers'], ['Define rarity weights and equip cap in server data.', 'Commit currency spend and rolled pet id together.', 'Spawn non-colliding followers only for accepted equipped ids.'], ['Attempt client-chosen rarity and over-cap equip.', 'Respawn and rejoin with a full equipped set.'], ['The client rolls its preferred pet.', 'Unlimited followers overload replication.'], ['pets', 'egg']),
  genreTask('simulator', 'bounded-upgrade-curve', 'Evaluate a bounded simulator upgrade curve', 'Derive effect and next cost from one saved level while preventing overflow and free out-of-range tiers.', ['dataStore', 'clientBoundary'], ['Choose a maximum level and finite cost formula.', 'Resolve requested track and current level on the server.', 'Debit and increment together, then derive effect from the new level.'], ['Buy at zero balance, cap level and numeric boundary.', 'Retry the same request after a delayed response.'], ['The client sends a tier index that costs nothing.', 'Stored effect and stored level drift apart.'], ['upgrade', 'curve']),
  genreTask('simulator', 'rebirth-loop', 'Make simulator rebirth an explicit bounded reset', 'Show the exact reset and bonus, then commit it once when the server requirement passes.', ['dataStore', 'uiButtons'], ['Present preserved and reset fields before confirmation.', 'Validate currency or level requirement on the server.', 'Commit reset and bounded multiplier in one mutation.'], ['Confirm twice and cancel during latency.', 'Reload after a successful and failed rebirth.'], ['The confirmation hides what will be lost.', 'A failure wipes progress without granting bonus.'], ['rebirth', 'prestige']),
  genreTask('simulator', 'zone-progression-gate', 'Gate simulator zones by saved progression', 'Use a server-owned requirement and a readable boundary rather than client visibility as access control.', ['worldRoot', 'saveData'], ['Define each zone id and requirement in server data.', 'Render locked state and next requirement to the client.', 'Recheck requirement before teleporting or granting zone rewards.'], ['Cross the boundary physically and invoke the request remotely.', 'Unlock, rejoin and confirm access.'], ['A hidden wall is the only gate.', 'Zone rewards trust a client-owned current-zone value.'], ['zone', 'progression']),
  genreTask('simulator', 'weighted-egg-roll', 'Roll simulator eggs with an auditable weight table', 'Select one result from finite nonnegative server weights after payment commits, then present that fixed result.', ['clientBoundary', 'saveData'], ['Validate egg id, capacity and server-owned price.', 'Commit payment and one server random roll.', 'Send the accepted result to a cancellable hatch presentation.'], ['Test zero, rare-boundary and malformed weight tables in logic tests.', 'Skip the hatch animation and confirm the same inventory result.'], ['The client chooses the random ticket.', 'Animation completion grants a second pet.'], ['egg', 'weighted random']),
  genreTask('simulator', 'large-number-hud', 'Format simulator progress without losing numeric truth', 'Keep authoritative numbers numeric while presenting compact labels, progress ratios and exact values on demand.', ['uiSize', 'uiPosition'], ['Choose one compact notation with deterministic rounding.', 'Clamp progress bars from finite server values.', 'Expose the exact value in a secondary detail surface.'], ['Test zero, thresholds, caps and the largest supported value.', 'Resize HUD on a small phone with several currencies.'], ['Formatted strings become the saved numeric value.', 'NaN or infinity reaches UI layout code.'], ['numbers', 'hud']),
  genreTask('simulator', 'session-loop-pacing', 'Pace the simulator earn-spend-unlock loop', 'Measure the time from first action to first upgrade, first zone and first meaningful choice.', ['perfMonitor', 'uiButtons'], ['Name the first three progression milestones.', 'Instrument time and attempts to each milestone.', 'Adjust one cost or reward source at a time from playtest evidence.'], ['Run new-profile sessions without developer shortcuts.', 'A player encounters a decision before repetitive input becomes the only activity.'], ['Several currencies arrive before their use is explained.', 'Progression tuning is inferred from endgame accounts.'], ['pacing', 'progression']),
);

GENRE_SEEDS.push(
  // Racing.
  genreTask('racing', 'ordered-lap-checkpoints', 'Count racing laps through ordered checkpoints', 'Advance a lap only after the server observes every required checkpoint in sequence.', ['collection', 'clientBoundary'], ['Give checkpoints stable authored indices.', 'Debounce crossings per vehicle or character.', 'Accept finish only when the expected sequence is complete.'], ['Cross finish backward, skip a gate and cross with several parts.', 'Reset or respawn midway and inspect sequence state.'], ['Finish line alone increments the lap.', 'Workspace child order changes checkpoint order.'], ['lap', 'checkpoint']),
  genreTask('racing', 'vehicle-network-owner', 'Transfer racing vehicle network ownership safely', 'Let the driver simulate the chassis while the server monitors race state and impossible movement.', ['physicsOwnership', 'networkSecurity'], ['Resolve the seated driver and assembly root.', 'Set ownership on seat changes and return it on exit.', 'Validate checkpoint order and broad movement plausibility server-side.'], ['Change drivers, leave the server and reset the vehicle.', 'Introduce latency and extreme displacement.'], ['The server drives every frame and feels delayed.', 'Client-owned physics becomes proof of a completed lap.'], ['vehicle', 'network ownership']),
  genreTask('racing', 'countdown-start-grid', 'Lock and release a racing start grid', 'Place racers, freeze race advancement and release all eligible drivers from one server countdown state.', ['remotes', 'physicsAssemblies'], ['Assign grid slots before countdown.', 'Prevent lap timing and movement rewards before the release state.', 'Start one server clock and broadcast its state.'], ['Join, leave and reset during countdown.', 'Attempt to cross checkpoint zero before release.'], ['Each client starts its own clock.', 'A departed racer leaves a grid slot or lock behind.'], ['countdown', 'grid']),
  genreTask('racing', 'race-position-ranking', 'Rank live race position by progress and route distance', 'Order racers by lap, expected checkpoint and distance along the current segment without trusting client position claims.', ['worldRoot', 'collection'], ['Represent progress as lap plus next checkpoint.', 'Measure server-observed distance to the next route marker.', 'Use stable tie-breaking and update on a bounded cadence.'], ['Test ties, shortcuts, reset and racers on different laps.', 'Ranking remains stable without per-frame all-pairs work.'], ['Raw world distance ranks a shortcut ahead.', 'Position updates every render frame for every racer.'], ['position', 'ranking']),
  genreTask('racing', 'track-recovery', 'Recover a racing vehicle to the last valid track point', 'Reset overturned or lost vehicles without advancing race progress or trapping the driver.', ['physicsAssemblies', 'collection'], ['Store the last accepted checkpoint transform.', 'Validate recovery cooldown and current race state.', 'Zero unsafe velocities and place the whole assembly with clearance.'], ['Recover upside down, out of bounds and near another vehicle.', 'Spam recovery and verify checkpoint state does not advance.'], ['Recovery places only one part of the assembly.', 'A client chooses an arbitrary recovery CFrame.'], ['reset', 'track']),
  genreTask('racing', 'mobile-steering-layout', 'Tune racing touch steering and camera space', 'Give steering, throttle, brake and recovery distinct reachable zones without hiding the next corner.', ['inputMobile', 'camera'], ['Choose buttons or virtual stick from vehicle cadence.', 'Keep camera swipe and road apex visible.', 'Scale hit targets independently of icon art.'], ['Complete a lap on the smallest supported phone.', 'Measure missed brake and accidental recovery presses.'], ['Controls cover the racing line.', 'Visual icons are the only touch hit area.'], ['mobile', 'steering']),
  genreTask('racing', 'server-best-times', 'Save racing best times from authoritative runs', 'Record a finite server duration only after a valid ordered lap and update the leaderboard sparingly.', ['leaderboardData', 'dataStore'], ['Start and finish from the same server clock.', 'Reject incomplete or impossible checkpoint sequences.', 'Write only when the valid result improves the stored integer time.'], ['Retry finish, reconnect and run slower than the best.', 'Throttle leaderboard services without losing the local result.'], ['The client submits its own time.', 'Every progress tick writes OrderedDataStore.'], ['time', 'leaderboard']),
  genreTask('racing', 'low-poly-streamed-track', 'Build a streamed low-poly racing track', 'Use modular road, barrier and landmark silhouettes that stream predictably and remain readable at speed.', ['streaming', 'parts'], ['Set segment length from sightline and vehicle speed.', 'Reuse road and barrier modules with stable pivots.', 'Place large silhouette landmarks before small trackside props.'], ['Drive at maximum speed across streaming boundaries.', 'The next turn, barrier and checkpoint remain visible on phone hardware.'], ['Small props are the only turn cue.', 'Scripts hold permanent references to streamed-out segments.'], ['track', 'low poly', 'streaming']),

  // Roleplay.
  genreTask('roleplay', 'state-aware-world-prompts', 'Use state-aware prompts for roleplay interactions', 'Show concise actions on doors, furniture and NPCs while rechecking distance, ownership and state on the server.', ['proximity', 'clientBoundary'], ['Name one action and eligibility rule per prompt.', 'Enable broad visibility locally but validate consequence on the server.', 'Update text and enabled state when ownership or role changes.'], ['Trigger while moving away, changing role and losing ownership.', 'Test keyboard, gamepad and touch.'], ['Visible prompt is treated as permission.', 'Several prompts overlap with the same key and unclear outcome.'], ['prompt', 'interaction']),
  genreTask('roleplay', 'job-role-permissions', 'Grant roleplay job abilities by server role', 'Resolve job, rank and allowed actions on the server rather than trusting a uniform, tool or client flag.', ['accessControl', 'clientBoundary'], ['Define each job and exact allowed actions.', 'Set the active role through one validated transition.', 'Check permission inside every privileged action handler.'], ['Spoof role fields and retain old tools after changing job.', 'Rejoin and verify intended persistence.'], ['Client UI role grants authority.', 'Old-role connections remain active after switching.'], ['job', 'role']),
  genreTask('roleplay', 'housing-plot-ownership', 'Own and restore a roleplay housing plot', 'Assign one plot, validate placement inside its bounds and save layout by stable item description.', ['worldRoot', 'saveData'], ['Reserve a plot and expose its owner.', 'Snap and collision-check placement again on the server.', 'Save item ids and local transforms with a part-count cap.'], ['Place outside bounds, overlap, exceed cap and move the plot.', 'Reload the same layout on a different physical plot.'], ['World positions break when plots move.', 'Client CFrame places furniture into another house.'], ['housing', 'placement']),
  genreTask('roleplay', 'owned-customization', 'Apply only owned roleplay customization', 'Store cosmetic ids, verify ownership and apply them after character appearance loads.', ['humanoid', 'saveData'], ['Define slots and compatible cosmetic ids.', 'Validate the requested id against server-owned inventory.', 'Apply or remove the slot after the character is ready.'], ['Respawn, switch rapidly and request an unowned id.', 'Old accessories do not stack after repeated changes.'], ['Client selection makes every cosmetic free.', 'Description applies before default appearance and is overwritten.'], ['customization', 'outfit']),
  genreTask('roleplay', 'branching-npc-dialogue', 'Drive roleplay dialogue from stable node ids', 'Render dialogue locally while the server validates any branch that grants, spends or changes world state.', ['proximity', 'uiTextFilter'], ['Author node ids, options and conditions as data.', 'Let cosmetic branches advance locally.', 'Send consequence requests by node id and recheck context server-side.'], ['Jump directly to a reward node and leave interaction range.', 'Resume or restart after closing midway.'], ['The client grants the node reward.', 'Player-authored text bypasses filtering.'], ['dialogue', 'npc']),
  genreTask('roleplay', 'emote-state-cleanup', 'Play roleplay emotes without trapping movement state', 'Start one animation state, cancel it on movement or damage and clean every marker and camera effect.', ['animation', 'animationEvents'], ['Define which states allow the emote.', 'Stop or blend the previous emote before starting another.', 'Disconnect markers and restore movement on every exit.'], ['Move, jump, take damage and respawn during the emote.', 'Repeated use leaves one active track and handler set.'], ['Several emotes blend into a broken pose.', 'A cancelled emote leaves controls disabled.'], ['emote', 'animation']),
  genreTask('roleplay', 'player-text-safety', 'Filter roleplay signs, names and notes per audience', 'Keep expressive player-authored text while ensuring every shared display uses the correct filtered result.', ['uiTextFilter', 'clientBoundary'], ['Mark raw input as server-private.', 'Filter for public or recipient-specific display.', 'Store and replicate only the allowed form for that surface.'], ['Filter failure, reconnect and different recipients.', 'No client path can request the raw value from another player.'], ['Raw text is replicated before filtering.', 'One filtered form is reused for an incompatible audience.'], ['text', 'sign']),
  genreTask('roleplay', 'streamed-landmark-districts', 'Organize roleplay districts around streamed landmarks', 'Give each district a large low-poly landmark and material identity that appears before dense props.', ['streaming', 'parts'], ['Define district bounds and one primary silhouette.', 'Place navigation and spawn-critical objects in persistent or safe streaming scope.', 'Add modular secondary props after landmark readability passes.'], ['Travel quickly between districts and respawn at their edges.', 'Scripts recover when optional props stream out.'], ['Tiny signs are the only district cue.', 'Permanent references target streamed-out decoration.'], ['district', 'landmark', 'low poly']),
);

GENRE_SEEDS.push(
  // Tower defense.
  genreTask('tower_defense', 'authored-enemy-lane', 'Author a tower-defense enemy lane with stable waypoints', 'Give waves one explicit ordered route whose widths, turns and endpoint remain compatible with every enemy body.', ['pathfinding', 'parts'], ['Name and order lane waypoints explicitly.', 'Check clearance for the widest supported enemy.', 'Keep spawn and endpoint outside tower placement zones.'], ['Run smallest, widest and fastest enemies through the route.', 'Moving or inserting decoration does not change waypoint order.'], ['Workspace order silently changes the lane.', 'Wide enemies clip a corner and stall the wave.'], ['lane', 'waypoint']),
  genreTask('tower_defense', 'server-tower-placement', 'Validate tower placement on the server', 'Use a responsive client ghost while the server snaps, checks bounds, overlap, zone, cap and cost before creating a tower.', ['worldRoot', 'clientBoundary'], ['Preview grid and range locally with no authority.', 'Send tower id, plot or zone id and candidate transform.', 'Re-derive snap and overlap server-side, then debit and place atomically.'], ['Place on the lane, inside another tower, outside the map and beyond cap.', 'Duplicate the same request under latency.'], ['Client CFrame is accepted as final.', 'Tower appears before payment commits.'], ['placement', 'tower']),
  genreTask('tower_defense', 'bounded-target-selection', 'Select tower targets on a bounded cadence', 'Choose first, last, near or strong from a maintained enemy set without scanning every enemy every frame per tower.', ['collection', 'perfImprove'], ['Keep one living-enemy registry with route progress.', 'Evaluate eligible targets on each tower cooldown or shared scheduler.', 'Apply one documented tie-breaker for deterministic behavior.'], ['Stress maximum towers and enemies while measuring decision latency.', 'Remove a target during selection.'], ['Every tower scans all enemies on Heartbeat.', 'A destroyed target remains cached and attacked.'], ['targeting', 'tower']),
  genreTask('tower_defense', 'wave-lifecycle', 'End a tower-defense wave from living enemy state', 'Spawn from wave data, stagger replication and finish only when every spawned enemy is dead or removed.', ['collection', 'perfDesign'], ['Define count, spacing and enemy ids per wave.', 'Increment the living set on accepted spawn.', 'Decrement on death and removal, then transition once at zero.'], ['Drop an enemy off-map, destroy it externally and end early.', 'The next wave begins with an empty prior-wave set.'], ['Kill count stalls when an enemy disappears.', 'The whole wave spawns in one frame.'], ['wave', 'spawn']),
  genreTask('tower_defense', 'atomic-tower-upgrade', 'Upgrade a tower atomically', 'Resolve tower ownership, path, maximum tier and server price before committing currency and stats once.', ['clientBoundary', 'dataStore'], ['Store tier data by tower type on the server.', 'Validate tower owner and current tier.', 'Debit and apply the next tier in one guarded transaction.'], ['Upgrade another player’s tower, max tier and double activation.', 'Selling or destroying during the request leaves no partial state.'], ['The client sends its chosen price or stats.', 'Currency debits before the tower still exists check.'], ['upgrade', 'tower']),
  genreTask('tower_defense', 'telegraph-vfx-priority', 'Prioritize tower-defense telegraphs over cosmetic VFX', 'Keep enemy abilities, tower ranges and impacts readable when many effects overlap.', ['particles', 'perfDesign'], ['Classify effects as decision cue, impact or ambience.', 'Reserve contrast and screen space for decision cues.', 'Cap impact lifetime and simultaneous emitters per tower.'], ['Trigger maximum wave and tower overlap.', 'Enemy warning and selected range remain visible on phone hardware.'], ['Reward and impact particles hide the lane.', 'Every projectile leaves a long-lived trail.'], ['vfx', 'readability']),
  genreTask('tower_defense', 'economy-transaction', 'Keep tower-defense spend and reward server-owned', 'Apply placement cost, upgrade cost, kill reward and wave reward from one bounded economy owner.', ['clientBoundary', 'dataStore'], ['Define each mutation by reason and stable id.', 'Derive all amounts on the server.', 'Commit one mutation and emit one resulting balance update.'], ['Duplicate kill, placement and wave-complete events.', 'Balance never goes negative or above its supported cap.'], ['Several scripts write currency independently.', 'A client-reported kill amount becomes the reward.'], ['economy', 'reward']),
  genreTask('tower_defense', 'batched-enemy-simulation', 'Batch tower-defense enemy sensing and updates', 'Stagger path, target and effect work while preserving deterministic route progress and hit timing.', ['perfImprove', 'pathfinding'], ['Separate route movement from expensive path or target queries.', 'Distribute enemy decision work across frames.', 'Pool or clean transient projectiles and effects.'], ['Profile expected and stress enemy counts.', 'Batching does not create a periodic all-enemy spike.'], ['Each enemy owns several permanent frame loops.', 'All batched work lands on one frame.'], ['performance', 'enemy']),

  // FPS arena.
  genreTask('fps_arena', 'server-hit-validation', 'Validate FPS hits on the server', 'Accept shot intent and reconstruct cadence, origin, range, obstruction and target eligibility before damage.', ['worldRoot', 'clientBoundary'], ['Assign each shot a sequence and server-owned weapon state.', 'Validate cadence and plausible origin.', 'Raycast with explicit filters and apply server damage.'], ['Shoot through walls, beyond range and with duplicate sequence.', 'Legitimate high-latency shots stay within documented tolerance.'], ['The client sends victim and damage as facts.', 'Camera origin is read on the server where it does not exist.'], ['weapon', 'raycast']),
  genreTask('fps_arena', 'ammo-reload-state', 'Own FPS ammo and reload state on the server', 'Track magazine, reserve and reload phase so fire, cancel and weapon switch cannot duplicate rounds.', ['remotes', 'clientBoundary'], ['Define fire and reload transitions.', 'Reserve or transfer ammo at one explicit phase.', 'Cancel or finish reload deterministically on switch, death and respawn.'], ['Fire on the reload boundary and switch weapons rapidly.', 'Duplicate reload requests cannot increase reserve ammo.'], ['Client ammo is trusted.', 'Animation completion grants ammo twice.'], ['ammo', 'reload']),
  genreTask('fps_arena', 'recoil-camera-recovery', 'Apply and recover FPS recoil on the client camera', 'Layer bounded visual recoil over player look input and return smoothly without creating a second camera owner.', ['camera', 'inputKeyboard'], ['Represent recoil as a decaying offset.', 'Apply it in the existing render camera owner.', 'Clear the offset on weapon switch, death and mode exit.'], ['Fire at several frame rates and interrupt recovery.', 'Camera returns exactly to player-controlled behavior.'], ['Several scripts set Camera.CFrame in one frame.', 'Recoil accumulates permanently after switching.'], ['recoil', 'camera']),
  genreTask('fps_arena', 'team-respawn-cycle', 'Respawn FPS teams into valid protected spawns', 'Balance teams on the server and choose a spawn that avoids immediate overlap or line-of-sight death.', ['humanoid', 'clientBoundary'], ['Assign team before selecting spawn.', 'Filter candidate spawns by team and occupancy.', 'Apply bounded protection without disabling all combat rules.'], ['Players leave during balancing and respawn repeatedly.', 'Every spawn belongs to the assigned team and releases protection.'], ['Neutral spawn settings ignore teams.', 'Protection never expires or is bypassed by direct health writes.'], ['team', 'respawn']),
  genreTask('fps_arena', 'cover-lane-silhouettes', 'Build readable low-poly FPS cover lanes', 'Use cover height, opening width and landmark silhouettes to define combat choices before surface detail.', ['parts', 'materials'], ['Block primary lanes and sightlines at player eye height.', 'Give full, half and soft cover distinct silhouettes.', 'Place landmarks that orient respawns without exposing them.'], ['Play from every spawn and inspect dominant sightlines.', 'Cover roles remain readable without detailed textures.'], ['Decorative clutter creates accidental head glitches.', 'Every lane sees every spawn.'], ['cover', 'arena', 'low poly']),
  genreTask('fps_arena', 'kill-feed-snapshot', 'Render an FPS kill feed from server events', 'Send a compact accepted elimination event and keep the client list bounded, ordered and non-authoritative.', ['remotes', 'uiPosition'], ['Create the event only after server damage resolves elimination.', 'Send stable attacker, victim and weapon display ids.', 'Append, expire and cap rows locally.'], ['Generate simultaneous and repeated eliminations.', 'Leaving or missing player names does not break the list.'], ['Client reports its own kills.', 'Rows accumulate for the whole session.'], ['kill feed', 'ui']),
  genreTask('fps_arena', 'lossy-cosmetic-tracers', 'Send FPS tracers as replaceable cosmetics', 'Keep damage on reliable server paths while tracer or aim samples tolerate drop and reordering.', ['remotes', 'networkProfiler'], ['Classify tracer data as cosmetic only.', 'Cap sample rate and payload.', 'Render late or missing samples without changing hit state.'], ['Drop and reorder tracer packets.', 'A missing tracer never removes or adds damage.'], ['Damage depends on unreliable delivery.', 'Each cosmetic sample contains a growing history.'], ['tracer', 'unreliable']),
  genreTask('fps_arena', 'combat-network-budget', 'Measure FPS combat network and frame budgets', 'Profile the worst sustained firefight with full players, effects and UI before tuning rates.', ['networkProfiler', 'microprofiler'], ['Record shot, state and cosmetic calls per second.', 'Capture frame spikes during maximum effect overlap.', 'Reduce cosmetic rate or lifetime before weakening authority checks.'], ['Repeat the same firefight before and after changes.', 'Phone-class clients keep actionable input and telegraphs.'], ['Security validation is removed as an optimization.', 'Average rates hide burst spikes.'], ['network', 'performance']),
);

GENRE_SEEDS.push(
  // Anime battle.
  genreTask('anime_battle', 'semantic-ability-actions', 'Map anime battle abilities to semantic actions', 'Bind a small action set across keyboard, touch and gamepad while gating it by combat state.', ['inputActions', 'inputMobile'], ['Define Light, Ability1-4, Dash and Ultimate as actions.', 'Bind device-specific controls and current glyphs.', 'Disable or queue actions according to server combat state.'], ['Complete one combo and cancel on every device.', 'Switch device during cooldown and retain action identity.'], ['Raw key checks diverge between controllers.', 'Disabled actions still fire hidden remotes.'], ['ability', 'controls']),
  genreTask('anime_battle', 'server-combo-state', 'Own anime battle combo progression on the server', 'Advance one bounded combo state from accepted timing and hit evidence instead of a client-reported combo count.', ['clientBoundary', 'animationEvents'], ['Define combo steps, timing windows and reset causes.', 'Accept attack intent and validate current server step.', 'Advance or reset once, then broadcast presentation state.'], ['Spam future step ids and cross every timing boundary.', 'Miss, get stunned and switch target mid-combo.'], ['Client combo number chooses damage.', 'A stale animation marker advances a new combo.'], ['combo', 'combat']),
  genreTask('anime_battle', 'bounded-melee-hitbox', 'Validate an anime melee hitbox on the server', 'Use a bounded spatial query tied to accepted attack state and damage each eligible target at most once.', ['worldRoot', 'clientBoundary'], ['Derive hitbox transform from server-observed character state.', 'Query with explicit size, filter and target cap.', 'Track targets hit by this attack instance.'], ['Overlap many parts of one character and several targets.', 'Move or die during the active window.'], ['Every limb causes another damage event.', 'Client supplies arbitrary hitbox size or position.'], ['hitbox', 'melee']),
  genreTask('anime_battle', 'cooldown-hud-reconcile', 'Reconcile anime ability cooldown HUD with server state', 'Animate local readiness smoothly while server timestamps decide whether an ability can activate.', ['uiAnimation', 'clientBoundary'], ['Receive accepted cooldown start and duration.', 'Render progress from a monotonic local estimate.', 'Correct from server refusal or state snapshot without duplicate activation.'], ['Trigger at the exact boundary under latency.', 'Respawn and reconnect with cooldown active.'], ['Client countdown is treated as authority.', 'Refusal leaves the icon permanently locked.'], ['cooldown', 'hud']),
  genreTask('anime_battle', 'ultimate-meter-transaction', 'Fill and spend an anime ultimate meter atomically', 'Cap server-owned meter gains and consume the full requirement once when the ultimate starts.', ['clientBoundary', 'uiPosition'], ['Define allowed gain events and cap.', 'Apply gains only from server-confirmed outcomes.', 'Validate full meter and consume it before starting the ultimate state.'], ['Duplicate gain events and ultimate activation.', 'Meter UI handles cap and post-spend snapshot.'], ['Client reports its own meter gain.', 'Ultimate begins before meter consumption commits.'], ['ultimate', 'meter']),
  genreTask('anime_battle', 'ability-vfx-budget', 'Budget anime ability VFX around combat telegraphs', 'Keep wind-up, danger area and recovery readable while capping screen coverage and effect lifetime.', ['particles', 'perfDesign'], ['Classify each effect frame as telegraph, impact or flourish.', 'Reserve contrast for hostile telegraphs.', 'Cap simultaneous emitters and clean on interruption.'], ['Trigger team-wide ultimates at once on phone hardware.', 'Players can still identify danger and target silhouettes.'], ['Flourish hides the actionable hit area.', 'Interrupted abilities leave long-lived effects.'], ['vfx', 'telegraph']),
  genreTask('anime_battle', 'ragdoll-recovery', 'Recover an anime battle ragdoll exactly once', 'Disable joints into bounded physics, then restore every joint, humanoid state and collision rule.', ['physicsAssemblies', 'humanoid'], ['Record original joint and collision state.', 'Enter ragdoll from one server owner.', 'Restore or destroy the state on timeout, death and respawn.'], ['Ragdoll twice, interrupt recovery and collide near walls.', 'Every joint and state returns once.'], ['Motor6Ds are destroyed and cannot recover.', 'Several recovery tasks fight each other.'], ['ragdoll', 'knockback']),
  genreTask('anime_battle', 'round-team-state', 'Run anime battle teams through one round state machine', 'Balance teams, spawn fighters, end early when a win condition is met and clean all combat state.', ['remotes', 'humanoid'], ['Define lobby, countdown, fighting and results transitions.', 'Snapshot eligible participants at start and remove leavers.', 'End from server win state, then clear abilities, targets and temporary effects.'], ['Players leave, die and join during every phase.', 'One transition and one reward occur per round.'], ['Two loops end and reward the same match.', 'A departed fighter keeps the round alive.'], ['round', 'teams']),

  // Survival.
  genreTask('survival', 'resource-node-harvest', 'Harvest a survival resource node once per cycle', 'Validate tool, distance and node state on the server, award bounded resources and schedule one respawn.', ['proximity', 'clientBoundary'], ['Give each node a server state and respawn token.', 'Validate player, tool and distance before decrement.', 'Award only on the transition to depleted and schedule one reset.'], ['Several players finish the same node simultaneously.', 'Leave and stream the node during respawn.'], ['Each hit can award the final resource.', 'Multiple respawn tasks duplicate the node.'], ['resource', 'harvest']),
  genreTask('survival', 'crafting-transaction', 'Craft survival items as one inventory transaction', 'Calculate maximum craftable batches from server recipes, remove ingredients and add outputs without partial mutation.', ['saveData', 'clientBoundary'], ['Resolve recipe id and requested count.', 'Validate inventory, capacity and finite batch count.', 'Commit ingredient removal and outputs together.'], ['Request zero, excessive, duplicate and unknown recipes.', 'A failed save or full inventory leaves ingredients unchanged.'], ['Client sends ingredient counts.', 'Removal commits before output capacity check.'], ['crafting', 'inventory']),
  genreTask('survival', 'needs-decay-clock', 'Advance survival needs from bounded server time', 'Update hunger, thirst or temperature at controlled intervals with finite clamps and explicit offline behavior.', ['dataStore', 'perfDesign'], ['Choose rates, caps and pause states.', 'Advance from monotonic server elapsed time at a bounded cadence.', 'Clamp values and derive damage or effects from accepted state.'], ['Pause, lag and cross long elapsed intervals.', 'No value becomes negative, non-finite or updated per frame.'], ['Client clock controls decay.', 'One loop per stat per player accumulates.'], ['hunger', 'thirst']),
  genreTask('survival', 'day-night-readability', 'Cycle survival day and night without losing route readability', 'Change global light and ambience over server time while preserving safe-path and threat cues.', ['lighting', 'atmosphere'], ['Define keyframes for day, dusk, night and dawn.', 'Interpolate global settings on a bounded cadence.', 'Keep interactables and required paths above a minimum contrast.'], ['Traverse at every phase on phone-class display.', 'Joining mid-cycle produces the correct current state.'], ['Night makes required objects indistinguishable.', 'Every client runs a different clock.'], ['day night', 'lighting']),
  genreTask('survival', 'spawn-safety-window', 'Protect a survival spawn without creating permanent immunity', 'Choose a valid spawn, apply a bounded protection state and end it on time or hostile action.', ['humanoid', 'worldRoot'], ['Select a spawn outside immediate occupied threat volume.', 'Record protection start and expiry on the server.', 'Remove protection on expiry or disallowed action.'], ['Attack, leave the area and respawn repeatedly.', 'Direct damage paths all respect the same protection rule.'], ['Health is set directly and bypasses protection.', 'Protection never expires after a state change.'], ['spawn', 'safe zone']),
  genreTask('survival', 'inventory-persistence-cap', 'Persist survival inventory with stack and capacity caps', 'Store compact item ids and counts while validating every add, remove, drop and use on the server.', ['saveData', 'clientBoundary'], ['Define stack and total capacity by item type.', 'Validate source action before inventory mutation.', 'Commit world drop and inventory removal as one guarded transition.'], ['Over-cap, negative index, duplicate drop and failed load.', 'Rejoin with the same bounded inventory.'], ['Full item instances bloat the save.', 'World item clones before inventory removal.'], ['inventory', 'capacity']),
  genreTask('survival', 'enemy-wave-pressure', 'Scale survival enemy pressure with bounded waves', 'Spawn enemies over time, cap living count and end or ease pressure when players are eliminated.', ['collection', 'pathfinding'], ['Define bounded count, health and spacing curves.', 'Track the living set by death and removal.', 'Pause or end spawning from current player and round state.'], ['Enemies fall out of world, players leave and caps are reached.', 'Wave state cleans before the next phase.'], ['Exponential health becomes unkillable or non-finite.', 'Missing enemies stall the wave forever.'], ['wave', 'enemy']),
  genreTask('survival', 'streamed-world-chunks', 'Stream survival world chunks from a stable seed', 'Generate or reveal bounded low-poly chunks near players and release distant optional state without losing durable progress.', ['streaming', 'terrain'], ['Derive chunk identity from a stable seed and coordinates.', 'Generate with a work budget and yield between chunks.', 'Persist durable discoveries separately from chunk instances.'], ['Move quickly across boundaries with several players.', 'Unload and regenerate the same chunk deterministically.'], ['Unseeded chunks disagree across sessions.', 'Chunks never release and memory grows indefinitely.'], ['world generation', 'streaming', 'low poly']),
);

const rawSkills = [...FOUNDATION_SEEDS, ...MECHANIC_SEEDS, ...GENRE_SEEDS].map(materialise);

/** The complete catalogue. Counts are tasks, never genre combinations or aliases. */
export const CREATOR_SKILLS: readonly CreatorSkill[] = Object.freeze(rawSkills);
export const CREATOR_SKILL_COUNT = CREATOR_SKILLS.length;

const CREATOR_SKILL_BY_ID = new Map(CREATOR_SKILLS.map((skill) => [skill.id, skill]));

const GENRE_PROFILE_MECHANICS: Readonly<Record<GenreKitId, readonly string[]>> = Object.freeze({
  horror: ['enemies', 'zones'],
  obby: ['checkpoints', 'killbricks'],
  tycoon: ['plots', 'dropper'],
  simulator: ['pets', 'rebirth'],
  racing: ['vehicles', 'racing_track'],
  roleplay: ['dialogue', 'customization'],
  tower_defense: ['towers', 'waves'],
  fps_arena: ['weapons', 'teams'],
  anime_battle: ['weapons', 'ragdoll'],
  survival: ['inventory', 'procedural_terrain'],
});

const GENRE_QUALITY: Readonly<Record<GenreKitId, readonly string[]>> = Object.freeze({
  horror: ['The route remains readable while information outside it stays uncertain.', 'Threat audio and silhouette arrive before unavoidable damage.'],
  obby: ['Each failure teaches the next attempt.', 'Checkpoint, hazard and landing cues remain readable on touch devices.'],
  tycoon: ['The production route reads from source to collection.', 'Every spend, income and prestige mutation is server-owned and bounded.'],
  simulator: ['The first upgrade and first meaningful choice arrive in a measured session window.', 'Rates, rolls and multipliers stay finite and server-owned.'],
  racing: ['Track direction and next checkpoint read at maximum speed.', 'Lap, time and recovery state come from one server race owner.'],
  roleplay: ['World interactions expose one clear action and recheck permission.', 'Districts and owned spaces read from landmarks before small props.'],
  tower_defense: ['Enemy lane, tower range and danger telegraphs remain legible at stress load.', 'Placement, targeting and economy use bounded shared schedulers.'],
  fps_arena: ['Cover, spawn and combat lanes read from player eye height.', 'Hits and ammo remain server-authoritative under latency.'],
  anime_battle: ['Telegraphs survive effect overlap and camera motion.', 'Combos, hitboxes, meter and cooldown state are server-owned.'],
  survival: ['Resources and safe routes remain readable through time and weather changes.', 'World, inventory and enemy pressure stay bounded over long sessions.'],
});

export interface GenreSkillProfile {
  genreId: GenreKitId;
  skillIds: readonly string[];
  qualityCriteria: readonly string[];
  assetDirection: {
    geometry: 'low_poly_readable_silhouettes';
    textureStrategy: string;
    detailStrategy: string;
  };
  guidanceStatus: 'authored_guidance';
  studioVisualPass: 'required_after_build';
}

const GENRE_SKILL_PROFILES: Readonly<Record<GenreKitId, GenreSkillProfile>> = Object.freeze(
  Object.fromEntries(GENRE_KIT_IDS.map((genreId) => {
    const genreIds = CREATOR_SKILLS
      .filter((skill) => skill.genreApplicability.length === 1 && skill.genreApplicability[0] === genreId && skill.domain === 'genre_pattern')
      .map((skill) => skill.id);
    const mechanicIds = GENRE_PROFILE_MECHANICS[genreId].flatMap((id) => [
      `mechanic-${id.replace(/_/g, '-')}-architecture`,
      `mechanic-${id.replace(/_/g, '-')}-failure-hardening`,
    ]);
    const profile: GenreSkillProfile = Object.freeze({
      genreId,
      skillIds: Object.freeze([...genreIds, ...mechanicIds]),
      qualityCriteria: Object.freeze([
        ...GENRE_QUALITY[genreId],
        'Prefer readable low-poly silhouettes, reusable materials and color blocking over texture resolution.',
        'The catalogue does not prove visual quality; inspect the result in live Studio and run the visual gate after building.',
      ]),
      assetDirection: Object.freeze({
        geometry: 'low_poly_readable_silhouettes' as const,
        textureStrategy: 'Do not require 4K textures for ordinary props, terrain or traversal surfaces; use materials, color blocking and small justified decals.',
        detailStrategy: 'Spend detail on landmarks and gameplay cues after blockout, collision, route readability and phone-class performance pass.',
      }),
      guidanceStatus: 'authored_guidance',
      studioVisualPass: 'required_after_build',
    });
    return [genreId, profile];
  })) as Record<GenreKitId, GenreSkillProfile>,
);

export function getGenreSkillProfile(id: string): GenreSkillProfile | null {
  return Object.prototype.hasOwnProperty.call(GENRE_SKILL_PROFILES, id)
    ? GENRE_SKILL_PROFILES[id as GenreKitId]
    : null;
}

const VALID_SKILL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_QUERY_CHARS = 240;
const MAX_QUERY_TOKENS = 16;
const DEFAULT_SEARCH_CHARS = 2200;
// RAISED FROM 700 WITH THE READ FLOOR, AND FOR THE SAME REASON. Every hit now carries its backing
// status, and the payload's disclosure says what that status means, so the smallest payload that
// still returns ONE result costs more than it did. Measured: at 700 this query reports
// `totalMatches: 73, returned: 0` — seventy-three matches and nothing to show for them. At 740 it
// returns the top hit in 711 characters. 800 leaves headroom for a longer title or genre list
// without another round of this.
export const MIN_SEARCH_CHARS = 800;
const MAX_SEARCH_CHARS = 2600;
const DEFAULT_READ_CHARS = 2700;
// RAISED FROM 1400 WHEN `implementation` BECAME MANDATORY. The floor is the size of the smallest
// payload that still says everything a skill must say, and a fact that used to be OMITTED for 145
// of 217 skills now has to fit. The alternative was to let the shrink drop the key under pressure,
// which would reinstate the omission silently and only for the longest skills — the worst possible
// distribution for a fact a caller is relying on. Exported so the budget test asserts the invariant
// "at the minimum budget, nothing is lost" rather than a literal that has to be edited in two
// places whenever the payload changes shape.
export const MIN_READ_CHARS = 1500;
const MAX_READ_CHARS = 2800;

export const CREATOR_SKILL_TRUNCATION_REASONS = [
  'result_limit',
  'character_budget',
  'result_limit_and_character_budget',
] as const;

export type CreatorSkillTruncationReason = (typeof CREATOR_SKILL_TRUNCATION_REASONS)[number];

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizedTokens(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .slice(0, MAX_QUERY_CHARS)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]+/g, ' ')
    .split(/[\s_\-]+/)
    .filter((token) => token.length > 1)
    .slice(0, MAX_QUERY_TOKENS);
}

function searchable(skill: CreatorSkill): { id: string; title: string; keywords: string; summary: string; detail: string } {
  return {
    id: skill.id.toLowerCase(),
    title: skill.title.toLowerCase(),
    keywords: skill.keywords.join(' ').toLowerCase(),
    summary: skill.summary.toLowerCase(),
    detail: [...skill.steps, ...skill.failureModes].join(' ').toLowerCase(),
  };
}

function rankSkill(skill: CreatorSkill, tokens: readonly string[], normalizedQuery: string): number {
  if (!tokens.length) return 1;
  const hay = searchable(skill);
  const normalizedIdQuery = normalizedQuery.replace(/ /g, '-');
  let score = 0;
  if (hay.id === normalizedIdQuery) score += 1000;
  if (hay.title === normalizedQuery) score += 900;
  if (normalizedIdQuery && hay.id.includes(normalizedIdQuery)) score += 180;
  if (normalizedQuery && hay.title.includes(normalizedQuery)) score += 150;
  for (const token of tokens) {
    if (hay.id.split('-').includes(token)) score += 60;
    if (hay.title.split(/\s+/).includes(token)) score += 50;
    else if (hay.title.includes(token)) score += 28;
    if (hay.keywords.includes(token)) score += 22;
    if (hay.summary.includes(token)) score += 10;
    if (hay.detail.includes(token)) score += 3;
  }
  return score;
}

export interface CreatorSkillSearchInput {
  query?: string;
  domain?: CreatorSkillDomain;
  genre?: GenreKitId;
  limit?: number;
  maxChars?: number;
}

function searchHit(skill: CreatorSkill, score: number) {
  return {
    id: skill.id,
    title: skill.title,
    domain: skill.domain,
    genres: skill.genreApplicability,
    summary: skill.summary,
    score,
    implementation: skillBackingBrief(skill),
  };
}

function searchTruncationReason(
  totalMatches: number,
  requestedCount: number,
  returnedCount: number,
): CreatorSkillTruncationReason | null {
  const hitResultLimit = totalMatches > requestedCount;
  const hitCharacterBudget = returnedCount < requestedCount;
  if (hitResultLimit && hitCharacterBudget) return 'result_limit_and_character_budget';
  if (hitResultLimit) return 'result_limit';
  if (hitCharacterBudget) return 'character_budget';
  return null;
}

function searchPayload(
  totalMatches: number,
  requestedCount: number,
  results: ReturnType<typeof searchHit>[],
  includeDisclosure = true,
): Record<string, unknown> {
  const returned = results.length;
  const truncationReason = searchTruncationReason(totalMatches, requestedCount, returned);
  return {
    totalMatches,
    returned,
    omitted: totalMatches - returned,
    results,
    truncated: truncationReason !== null,
    ...(truncationReason ? { truncationReason } : {}),
    ...(includeDisclosure ? { disclosure: CREATOR_SKILL_CATALOG_DISCLOSURE } : {}),
  };
}

function fitSearchPayload(
  totalMatches: number,
  requested: ReturnType<typeof searchHit>[],
  budget: number,
): Record<string, unknown> {
  const results = [...requested];
  let fitted = searchPayload(totalMatches, requested.length, results);
  while (results.length > 0 && JSON.stringify(fitted).length > budget) {
    results.pop();
    fitted = searchPayload(totalMatches, requested.length, results);
  }
  if (JSON.stringify(fitted).length <= budget) return fitted;

  const minimal = searchPayload(totalMatches, requested.length, [], false);
  const withNote = {
    ...minimal,
    note: 'Matches exist, but the requested character budget is too small for a result. Raise max_chars.',
  };
  return JSON.stringify(withNote).length <= budget ? withNote : minimal;
}

/** Search treats query text only as tokens. It is never executed, interpolated into code, or echoed. */
export function searchCreatorSkills(input: CreatorSkillSearchInput = {}): Record<string, unknown> {
  const domain = input.domain;
  if (domain !== undefined && !(CREATOR_SKILL_DOMAINS as readonly string[]).includes(domain)) {
    return { noMatch: true, reason: 'unknown_domain', knownDomains: CREATOR_SKILL_DOMAINS };
  }
  const genre = input.genre;
  if (genre !== undefined && !(GENRE_KIT_IDS as readonly string[]).includes(genre)) {
    return { noMatch: true, reason: 'unknown_genre', knownGenres: GENRE_KIT_IDS };
  }
  const tokens = normalizedTokens(input.query);
  const normalizedQuery = tokens.join(' ');
  if (!tokens.length && domain === undefined && genre === undefined) {
    return {
      noMatch: true,
      reason: 'query_or_filter_required',
      knownDomains: CREATOR_SKILL_DOMAINS,
      knownGenres: GENRE_KIT_IDS,
      catalogueSize: CREATOR_SKILL_COUNT,
    };
  }
  const limit = boundedInteger(input.limit, 5, 1, 5);
  const budget = boundedInteger(input.maxChars, DEFAULT_SEARCH_CHARS, MIN_SEARCH_CHARS, MAX_SEARCH_CHARS);
  const ranked = CREATOR_SKILLS
    .filter((skill) => domain === undefined || skill.domain === domain)
    .filter((skill) => genre === undefined || skill.genreApplicability.includes(genre))
    .map((skill) => ({ skill, score: rankSkill(skill, tokens, normalizedQuery) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id));
  if (!ranked.length) {
    return {
      noMatch: true,
      reason: 'no_catalogue_match',
      knownDomains: CREATOR_SKILL_DOMAINS,
      knownGenres: GENRE_KIT_IDS,
      catalogueSize: CREATOR_SKILL_COUNT,
    };
  }
  const requested = ranked.slice(0, limit).map((row) => searchHit(row.skill, row.score));
  return fitSearchPayload(ranked.length, requested, budget);
}

function clipped(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

function publicSkill(skill: CreatorSkill) {
  return {
    id: skill.id,
    title: skill.title,
    domain: skill.domain,
    genreApplicability: [...skill.genreApplicability],
    summary: skill.summary,
    preconditions: [...skill.preconditions],
    steps: [...skill.steps],
    verification: [...skill.verification],
    failureModes: [...skill.failureModes],
    qualityCriteria: [...skill.qualityCriteria],
    references: skill.references.map((reference) => ({
      id: reference.id,
      title: reference.title,
      url: reference.url,
      origin: reference.origin,
      referenceUse: reference.referenceUse,
      corpus: reference.corpus,
      licence: reference.licence,
    })),
    guidanceStatus: skill.guidanceStatus,
    containsExecutableCode: skill.containsExecutableCode,
    studioVisualPass: skill.studioVisualPass,
    implementation: skillBacking(skill),
  };
}

function readPayload(skill: unknown, truncated: boolean): Record<string, unknown> {
  return {
    skill,
    truncated,
    ...(truncated ? { truncationReason: 'character_budget' as const } : {}),
  };
}

function fitReadPayload(skill: CreatorSkill, budget: number): Record<string, unknown> {
  const value = publicSkill(skill);
  let truncated = false;
  // THE NOTE MAY GO; THE STATUS MAY NOT. Under pressure this drops the sentence explaining the
  // backing and keeps the machine-readable status, because a shrink that removed the key entirely
  // would put back exactly the omission this field was added to end — silently, and only for the
  // skills whose payloads are longest. Tried first, before any content is cut, since one sentence
  // of prose is cheaper to lose than a verification step.
  if (JSON.stringify(readPayload(value, truncated)).length > budget) {
    value.implementation = skillBackingBrief(skill) as typeof value.implementation;
    truncated = true;
  }
  const removable: { list: unknown[]; minimum: number }[] = [
    { list: value.qualityCriteria, minimum: 2 },
    { list: value.preconditions, minimum: 2 },
    { list: value.steps, minimum: 2 },
    { list: value.failureModes, minimum: 2 },
    { list: value.verification, minimum: 2 },
    { list: value.references, minimum: 1 },
  ];
  while (JSON.stringify(readPayload(value, truncated)).length > budget) {
    let changed = false;
    for (const item of removable) {
      if (item.list.length > item.minimum) {
        item.list.pop();
        changed = true;
        truncated = true;
        if (JSON.stringify(readPayload(value, truncated)).length <= budget) break;
      }
    }
    if (!changed) break;
  }
  if (JSON.stringify(readPayload(value, truncated)).length > budget) {
    value.summary = clipped(value.summary, 180);
    value.preconditions = value.preconditions.map((entry) => clipped(entry, 150));
    value.steps = value.steps.map((entry) => clipped(entry, 190));
    value.verification = value.verification.map((entry) => clipped(entry, 160));
    value.failureModes = value.failureModes.map((entry) => clipped(entry, 160));
    value.qualityCriteria = value.qualityCriteria.map((entry) => clipped(entry, 150));
    truncated = true;
  }
  const payload = readPayload(value, truncated);
  if (JSON.stringify(payload).length <= budget) return payload;
  return readPayload({
      id: skill.id,
      title: skill.title,
      domain: skill.domain,
      // A comma-free sentinel is smaller than repeating all ten ids and remains unambiguous. Skills
      // with a narrower applicability keep their exact id list.
      genreApplicability: skill.genreApplicability.length === allGenres.length
        ? 'all_genre_kits'
        : skill.genreApplicability,
      summary: clipped(skill.summary, 55),
      preconditions: skill.preconditions.slice(0, 2).map((entry) => clipped(entry, 55)),
      steps: skill.steps.slice(0, 2).map((entry) => clipped(entry, 70)),
      verification: skill.verification.slice(0, 2).map((entry) => clipped(entry, 55)),
      failureModes: skill.failureModes.slice(0, 2).map((entry) => clipped(entry, 55)),
      qualityCriteria: skill.qualityCriteria.slice(0, 2).map((entry) => clipped(entry, 55)),
      // The exact corpus address is the load-bearing reference under the minimum budget. The normal
      // payload above also returns the human-facing URL; omitting it here keeps every task section
      // present instead of cutting verification or failure modes to fit.
      references: skill.references.slice(0, 1).map((reference) => ({
        id: reference.id,
        corpus: { docSlug: reference.corpus.docSlug, chunkIds: reference.corpus.chunkIds },
      })),
      guidanceStatus: skill.guidanceStatus,
      containsExecutableCode: false,
      studioVisualPass: skill.studioVisualPass,
      implementation: skillBackingBrief(skill),
    }, true);
}

/** Strict id lookup. Malformed text is rejected without being reflected into the tool result. */
export function readCreatorSkill(id: unknown, maxChars: unknown = DEFAULT_READ_CHARS): Record<string, unknown> {
  const budget = boundedInteger(maxChars, DEFAULT_READ_CHARS, MIN_READ_CHARS, MAX_READ_CHARS);
  if (typeof id !== 'string' || id.length > 96 || !VALID_SKILL_ID.test(id)) {
    return { noMatch: true, reason: 'invalid_skill_id', examples: CREATOR_SKILLS.slice(0, 5).map((skill) => skill.id) };
  }
  const skill = CREATOR_SKILL_BY_ID.get(id);
  if (!skill) {
    const suggestions = searchCreatorSkills({ query: id, limit: 3, maxChars: 1400 });
    return {
      noMatch: true,
      reason: 'unknown_skill_id',
      suggestions: Array.isArray(suggestions.results)
        ? suggestions.results.map((row) => (row as { id: string }).id)
        : CREATOR_SKILLS.slice(0, 3).map((entry) => entry.id),
    };
  }
  return fitReadPayload(skill, budget);
}
