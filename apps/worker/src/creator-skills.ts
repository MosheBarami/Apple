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
  'game_design',
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
  inputKeyboard: official('docs-input-mouse-and-keyboard', 'g-41fb41b3-1', 'Mouse and key input', 'https://create.roblox.com/docs/input/mouse-and-keyboard'),
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
  // BEGIN researched-refs
  gdEconomy: official('docs-production-game-design-balance-virtual-economies', 'g-957e1af6-1', "Balance virtual economies", 'https://create.roblox.com/docs/production/game-design/balance-virtual-economies'),
  prodPaidRandom: official('docs-production-monetization-paid-random-items', 'g-40408841-1', "Paid random items policy guidelines", 'https://create.roblox.com/docs/production/monetization/paid-random-items'),
  gdCoreLoops: official('docs-production-game-design-core-loops', 'g-20202ddd-1', "Core loops", 'https://create.roblox.com/docs/production/game-design/core-loops'),
  gdContextualPurchases: official('docs-production-game-design-contextual-purchases', 'g-e7b0cae4-1', "Contextual purchases", 'https://create.roblox.com/docs/production/game-design/contextual-purchases'),
  gdDesignForRoblox: official('docs-production-game-design-design-for-roblox', 'g-8eabb8db-1', "Design for Roblox", 'https://create.roblox.com/docs/production/game-design/design-for-roblox'),
  textService: official('api-textservice', 'api-textservice-1', "TextService", 'https://create.roblox.com/docs/reference/engine/classes/TextService'),
  gdPrototyping: official('docs-production-game-design-prototyping', 'g-c8508c6e-1', "Prototyping", 'https://create.roblox.com/docs/production/game-design/prototyping'),
  gdOnboardingTechniques: official('docs-production-game-design-onboarding-techniques', 'g-c6c5e08b-1', "Onboarding techniques", 'https://create.roblox.com/docs/production/game-design/onboarding-techniques'),
  anRetention: official('docs-production-analytics-retention', 'g-aad835b7-1', "Retention", 'https://create.roblox.com/docs/production/analytics/retention'),
  gdOnboarding: official('docs-production-game-design-onboarding', 'g-2a2f9eea-1', "Onboarding", 'https://create.roblox.com/docs/production/game-design/onboarding'),
  pubThumbnails: official('docs-production-publishing-thumbnails', 'g-0e2f8630-1', "Thumbnails", 'https://create.roblox.com/docs/production/publishing/thumbnails'),
  invitePrompts: official('docs-production-promotion-invite-prompts', 'g-105bb5c7-1', "Player invite prompts", 'https://create.roblox.com/docs/production/promotion/invite-prompts'),
  experienceNotifications: official('docs-production-promotion-experience-notifications', 'g-c284a401-1', "Experience notifications", 'https://create.roblox.com/docs/production/promotion/experience-notifications'),
  anFunnelEvents: official('docs-production-analytics-funnel-events', 'g-a1743b03-1', "Funnel events", 'https://create.roblox.com/docs/production/analytics/funnel-events'),
  teleportService: official('api-teleportservice', 'api-teleportservice-1', "TeleportService", 'https://create.roblox.com/docs/reference/engine/classes/TeleportService'),
  shareLinks: official('docs-production-promotion-share-links', 'g-de8e9c07-1', "Share links", 'https://create.roblox.com/docs/production/promotion/share-links'),
  experienceEvents: official('docs-production-promotion-experience-events', 'g-dbcf0739-1', "Experience events and updates", 'https://create.roblox.com/docs/production/promotion/experience-events'),
  gdLiveOps: official('docs-production-game-design-liveops-essentials', 'g-15a6c15e-1', "LiveOps essentials", 'https://create.roblox.com/docs/production/game-design/liveops-essentials'),
  scriptLocations: official('docs-scripting-locations', 'g-6f167d3f-1', "Script types and locations", 'https://create.roblox.com/docs/scripting/locations'),
  testingModes: official('docs-studio-testing-modes', 'g-72d1e2ef-1', "Studio testing modes", 'https://create.roblox.com/docs/studio/testing-modes', 'verification'),
  pubPublish: official('docs-production-publishing-publish-games-and-places', 'g-b3ddb56d-1', "Create and publish games and places", 'https://create.roblox.com/docs/production/publishing/publish-games-and-places'),
  gdContentUpdates: official('docs-production-game-design-content-updates', 'g-1ae2a4a4-1', "Content updates", 'https://create.roblox.com/docs/production/game-design/content-updates'),
  prodPasses: official('docs-production-monetization-passes', 'g-01afedae-1', "Passes", 'https://create.roblox.com/docs/production/monetization/passes'),
  prodDeveloperProducts: official('docs-production-monetization-developer-products', 'g-d65dde5c-1', "Developer Products", 'https://create.roblox.com/docs/production/monetization/developer-products'),
  subscriptions: official('docs-production-monetization-subscriptions', 'g-e55b2614-1', "Subscriptions", 'https://create.roblox.com/docs/production/monetization/subscriptions'),
  rewardedVideo: official('docs-production-promotion-rewarded-video-ads', 'g-80736fc8-1', "Rewarded video ads", 'https://create.roblox.com/docs/production/promotion/rewarded-video-ads'),
  regionalPricing: official('docs-production-monetization-regional-pricing', 'g-281fe40b-1', "Regional pricing", 'https://create.roblox.com/docs/production/monetization/regional-pricing'),
  prodPrivateServers: official('docs-production-monetization-private-servers', 'g-11d82b24-1', "Private servers", 'https://create.roblox.com/docs/production/monetization/private-servers'),
  contentMaturity: official('docs-production-promotion-content-maturity', 'g-dc2a14b4-1', "Content maturity and compliance", 'https://create.roblox.com/docs/production/promotion/content-maturity'),
  immersiveAds: official('docs-production-monetization-immersive-ads', 'g-ef95fb5d-1', "Immersive ads", 'https://create.roblox.com/docs/production/monetization/immersive-ads'),
  toolbox: official('docs-projects-assets-toolbox', 'g-4340e559-1', "Toolbox", 'https://create.roblox.com/docs/projects/assets/toolbox'),
  memoryQueue: official('api-memorystorequeue', 'api-memorystorequeue-1', "MemoryStoreQueue", 'https://create.roblox.com/docs/reference/engine/classes/MemoryStoreQueue'),
  teleportDoc: official('docs-projects-teleport', 'g-226073cc-1', "Teleport between places", 'https://create.roblox.com/docs/projects/teleport'),
  moduleScripts: official('docs-scripting-module', 'g-6fa4ce91-1', "Reuse code", 'https://create.roblox.com/docs/scripting/module'),
  inputActionClass: official('api-inputaction', 'api-inputaction-1', "InputAction", 'https://create.roblox.com/docs/reference/engine/classes/InputAction'),
  serverAuthority: official('docs-projects-server-authority', 'g-9002161b-1', "Server authority model", 'https://create.roblox.com/docs/projects/server-authority'),
  scriptProfiler: official('docs-studio-optimization-scriptprofiler', 'g-916678b5-1', "Script Profiler", 'https://create.roblox.com/docs/studio/optimization/scriptprofiler', 'verification'),
  versionHistory: official('docs-projects-version-history', 'g-bbff4702-1', "Version History", 'https://create.roblox.com/docs/projects/version-history'),
  microprofilerWalkthrough: official('docs-performance-optimization-microprofiler-use-microprofiler', 'g-ed0f4f25-1', "MicroProfiler walkthrough", 'https://create.roblox.com/docs/performance-optimization/microprofiler/use-microprofiler', 'verification'),
  lightingClass: official('api-lighting', 'api-lighting-1', "Lighting", 'https://create.roblox.com/docs/reference/engine/classes/Lighting'),
  clouds: official('docs-environment-clouds', 'g-b4bcf125-1', "Dynamic clouds", 'https://create.roblox.com/docs/environment/clouds'),
  terrainClass: official('api-terrain', 'api-terrain-1', "Terrain", 'https://create.roblox.com/docs/reference/engine/classes/Terrain'),
  terrainEditor: official('docs-studio-terrain-editor', 'g-fc228fb1-1', "Terrain Editor", 'https://create.roblox.com/docs/studio/terrain-editor'),
  materialVariant: official('api-materialvariant', 'api-materialvariant-1', "MaterialVariant", 'https://create.roblox.com/docs/reference/engine/classes/MaterialVariant'),
  surfaceAppearance: official('api-surfaceappearance', 'api-surfaceappearance-1', "SurfaceAppearance", 'https://create.roblox.com/docs/reference/engine/classes/SurfaceAppearance'),
  units: official('docs-physics-units', 'g-94b44356-1', "Roblox units", 'https://create.roblox.com/docs/physics/units'),
  guiService: official('api-guiservice', 'api-guiservice-1', "GuiService", 'https://create.roblox.com/docs/reference/engine/classes/GuiService'),
  uiScrolling: official('docs-ui-scrolling-frames', 'g-5339790e-1', "Scrolling frames", 'https://create.roblox.com/docs/ui/scrolling-frames'),
  starterGui: official('api-startergui', 'api-startergui-1', "StarterGui", 'https://create.roblox.com/docs/reference/engine/classes/StarterGui'),
  uiProximity: official('docs-ui-proximity-prompts', 'g-5a160569-1', "Proximity prompts", 'https://create.roblox.com/docs/ui/proximity-prompts'),
  pubAccessibility: official('docs-production-publishing-accessibility', 'g-8b5f3ee4-1', "Accessibility guidelines", 'https://create.roblox.com/docs/production/publishing/accessibility'),
  uiStyling: official('docs-ui-styling', 'g-a9cfa404-1', "UI styling", 'https://create.roblox.com/docs/ui/styling'),
  gdUiUx: official('docs-production-game-design-ui-ux-design', 'g-6b324881-1', "UI and UX design", 'https://create.roblox.com/docs/production/game-design/ui-ux-design'),
  gdMonetization: official('docs-production-game-design-monetization-foundations', 'g-6d2e067e-1', "Monetization foundations", 'https://create.roblox.com/docs/production/game-design/monetization-foundations'),
  animationTrack: official('api-animationtrack', 'api-animationtrack-1', "AnimationTrack", 'https://create.roblox.com/docs/reference/engine/classes/AnimationTrack'),
  animatorClass: official('api-animator', 'api-animator-1', "Animator", 'https://create.roblox.com/docs/reference/engine/classes/Animator'),
  audioEmitterClass: official('api-audioemitter', 'api-audioemitter-1', "AudioEmitter", 'https://create.roblox.com/docs/reference/engine/classes/AudioEmitter'),
  audioEffects: official('docs-audio-effects', 'g-d8da148d-1', "Audio effects", 'https://create.roblox.com/docs/audio/effects'),
  effParticles: official('docs-effects-particle-emitters', 'g-d5187756-1', "Particle emitters", 'https://create.roblox.com/docs/effects/particle-emitters'),
  explosionClass: official('api-explosion', 'api-explosion-1', "Explosion", 'https://create.roblox.com/docs/reference/engine/classes/Explosion'),
  effTrails: official('docs-effects-trails', 'g-a10a4481-1', "Trails", 'https://create.roblox.com/docs/effects/trails'),
  effBeams: official('docs-effects-beams', 'g-8dd806f0-1', "Beams", 'https://create.roblox.com/docs/effects/beams'),
  effHighlight: official('docs-effects-highlighting', 'g-03cedd7e-1', "Highlighting objects", 'https://create.roblox.com/docs/effects/highlighting'),
  robloxPlus: official('docs-production-monetization-roblox-plus', 'g-974fad7b-1', "Roblox Plus", 'https://create.roblox.com/docs/production/monetization/roblox-plus'),
  workspaceClass: official('api-workspace', 'api-workspace-1', "Workspace", 'https://create.roblox.com/docs/reference/engine/classes/Workspace'),
  randomDatatype: official('api-data-random', 'api-data-random-1', "Random", 'https://create.roblox.com/docs/reference/engine/datatypes/Random'),
  physicsService: official('api-physicsservice', 'api-physicsservice-1', "PhysicsService", 'https://create.roblox.com/docs/reference/engine/classes/PhysicsService'),
  pathfindingService: official('api-pathfindingservice', 'api-pathfindingservice-1', "PathfindingService", 'https://create.roblox.com/docs/reference/engine/classes/PathfindingService'),
  raycastParams: official('api-data-raycastparams', 'api-data-raycastparams-1', "RaycastParams", 'https://create.roblox.com/docs/reference/engine/datatypes/RaycastParams'),
  prismaticConstraint: official('api-prismaticconstraint', 'api-prismaticconstraint-1', "PrismaticConstraint", 'https://create.roblox.com/docs/reference/engine/classes/PrismaticConstraint'),
  ropeConstraint: official('api-ropeconstraint', 'api-ropeconstraint-1', "RopeConstraint", 'https://create.roblox.com/docs/reference/engine/classes/RopeConstraint'),
  vectorForce: official('api-vectorforce', 'api-vectorforce-1', "VectorForce", 'https://create.roblox.com/docs/reference/engine/classes/VectorForce'),
  orderedDataStore: official('api-ordereddatastore', 'api-ordereddatastore-1', "OrderedDataStore", 'https://create.roblox.com/docs/reference/engine/classes/OrderedDataStore'),
  spawnLocation: official('api-spawnlocation', 'api-spawnlocation-1', "SpawnLocation", 'https://create.roblox.com/docs/reference/engine/classes/SpawnLocation'),
  linearVelocity: official('api-linearvelocity', 'api-linearvelocity-1', "LinearVelocity", 'https://create.roblox.com/docs/reference/engine/classes/LinearVelocity'),
  vehicleSeat: official('api-vehicleseat', 'api-vehicleseat-1', "VehicleSeat", 'https://create.roblox.com/docs/reference/engine/classes/VehicleSeat'),
  unreliableRemote: official('api-unreliableremoteevent', 'api-unreliableremoteevent-1', "UnreliableRemoteEvent", 'https://create.roblox.com/docs/reference/engine/classes/UnreliableRemoteEvent'),
  overlapParams: official('api-data-overlapparams', 'api-data-overlapparams-1', "OverlapParams", 'https://create.roblox.com/docs/reference/engine/datatypes/OverlapParams'),
  bufferLib: official('api-lib-buffer', 'api-lib-buffer-1', "buffer", 'https://create.roblox.com/docs/reference/engine/libraries/buffer'),
  animationController: official('api-animationcontroller', 'api-animationcontroller-1', "AnimationController", 'https://create.roblox.com/docs/reference/engine/classes/AnimationController'),
  forceField: official('api-forcefield', 'api-forcefield-1', "ForceField", 'https://create.roblox.com/docs/reference/engine/classes/ForceField'),
  humanoidDescription: official('api-humanoiddescription', 'api-humanoiddescription-1', "HumanoidDescription", 'https://create.roblox.com/docs/reference/engine/classes/HumanoidDescription'),
  socialService: official('api-socialservice', 'api-socialservice-1', "SocialService", 'https://create.roblox.com/docs/reference/engine/classes/SocialService'),
  textChatService: official('api-textchatservice', 'api-textchatservice-1', "TextChatService", 'https://create.roblox.com/docs/reference/engine/classes/TextChatService'),
  colorGradingEffect: official('api-colorgradingeffect', 'api-colorgradingeffect-1', "ColorGradingEffect", 'https://create.roblox.com/docs/reference/engine/classes/ColorGradingEffect'),
  uiGradient: official('api-uigradient', 'api-uigradient-1', "UIGradient", 'https://create.roblox.com/docs/reference/engine/classes/UIGradient'),
  uiStroke: official('api-uistroke', 'api-uistroke-1', "UIStroke", 'https://create.roblox.com/docs/reference/engine/classes/UIStroke'),
  tool: official('api-tool', 'api-tool-1', "Tool", 'https://create.roblox.com/docs/reference/engine/classes/Tool'),
  teams: official('api-teams', 'api-teams-1', "Teams", 'https://create.roblox.com/docs/reference/engine/classes/Teams'),
  playersClass: official('api-players', 'api-players-1', "Players", 'https://create.roblox.com/docs/reference/engine/classes/Players'),
  alignPosition: official('api-alignposition', 'api-alignposition-1', "AlignPosition", 'https://create.roblox.com/docs/reference/engine/classes/AlignPosition'),
  hingeConstraint: official('api-hingeconstraint', 'api-hingeconstraint-1', "HingeConstraint", 'https://create.roblox.com/docs/reference/engine/classes/HingeConstraint'),
  greyboxTutorial: official('docs-tutorials-curriculums-core-building-greybox-a-playable-area', 'g-7231e66c-1', "Greybox a playable area", 'https://create.roblox.com/docs/tutorials/curriculums/core/building/greybox-a-playable-area'),
  packagesDoc: official('docs-projects-assets-packages', 'g-d002ca16-1', "Packages", 'https://create.roblox.com/docs/projects/assets/packages'),
  wedgePart: official('api-wedgepart', 'api-wedgepart-1', "WedgePart", 'https://create.roblox.com/docs/reference/engine/classes/WedgePart'),
  // END researched-refs
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
  input: ['The action, allowed game states and owning client controller are named.', 'At least desktop, touch and gamepad behavior is decided.'],
  client_server: ['The server authority and client request are separated.', 'Payload shape, frequency and refusal behavior are known.'],
  data: ['The authoritative profile fields and mutation owner are named.', 'Failure, retry and shutdown behavior are part of the task.'],
  gameplay: ['The mechanic owner and lifecycle are named.', 'Server authority is explicit for any competitive or economic result.'],
  worldbuilding: ['Gameplay distance, traversal route and art direction are known.', 'The build has a measurable part, light or effect budget.'],
  performance: ['A repeatable test scene and target device class are available.', 'A baseline is captured before optimization.'],
  security: ['The protected resource and attacker-controlled inputs are named.', 'Refusal and logging behavior are defined before punitive action.'],
  genre_pattern: ['The selected genre kit and its core loop are fixed.', 'The task is tied to a playable player action, not decoration alone.'],
  game_design: ['The one-sentence core loop, target player and platform (phone first) are written down.', 'Every number the task touches lives in one server-owned config, so it can be tuned without editing logic.'],
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
  game_design: ['A design decision is stated with its number and the check that would prove it wrong.', 'Starting values are labelled as starting points to test, not as facts.'],
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
  // The owner's reference: "How To Make Stud GUI In Roblox Studio" (YouTube), measured frame by frame 2026-10-01.
  { id: 'ui-studded-gui', title: 'Build a studded GUI like popular Roblox games', domain: 'ui', summary: 'The studded look of Grow a Garden / Steal a Brainrot style screens: every surface is a stud tile tinted by a gradient, rounded, with a thick black outline and chunky outlined text, and every piece works.', refs: ['uiAppearance', 'uiButtons'], keywords: ['studded', 'stud', 'studs', 'gui', 'cartoony', 'shop', 'gradient', 'outline'], implementation: { kind: 'existing_tool', id: 'build_studded_ui', executableVerified: true, note: 'build_studded_ui writes the studded screen; the composer writes the same pieces for its games (proven in Studio play 2026-10-01).' }, steps: [
    'Decide what the screen must hold for this game: the currency counter (icon, number, green "+"), one button per core action, bars for health or progress, and a panel per shop or upgrade list with an item card per item.',
    'Keep the centre of the screen empty: counters top-left, the round or wave banner top-centre, action buttons down the left or right edge, panels centred and hidden until opened.',
    'Each surface is an ImageLabel/ImageButton: white background, Image rbxassetid://6927295847 (the public stud tile), ScaleType Tile, TileSize 30-100 px offset (smaller studs on smaller buttons), a UIGradient for the colour (light at the top, saturated below), UICorner 8-14 px, UIStroke black 3 px.',
    'Text is a TextLabel over it: transparent background, Font FredokaOne, white, TextScaled, with its own black UIStroke (2-4 px); uppercase for titles and buttons.',
    'A panel is a coloured header bar with its title over a stud body of another colour, a big red square X at its top-right corner, cards in a grid each carrying its own Buy button with the real price.',
    'Use build_studded_ui {screen, pieces: [{kind counter|button|bar|panel, name, text, at top-left|top|top-right|left|right|bottom-left|bottom|bottom-right, colour green|yellow|orange|pink|blue|purple|red|brown|cream|grey, cards [{name,label,price}] for a panel}]} to write it, then one LocalScript: set every number from the game (leaderstats or attributes), open/close each panel (X and Escape), press feedback on every button (a UIScale tween), a click sound, and a short message when a buy succeeds or is refused.',
  ], verification: [
    'Play: every number on screen is the game\'s real value and changes when it changes; nothing reads 0 forever or a made-up number.',
    'Play: press every button and every card Buy; each one does something visible; each panel closes with its X.',
    'Check at phone size that no piece covers another or the centre of the screen.',
  ], failureModes: [
    'A panel from another game left with its placeholder numbers ("299,999") or a button that does nothing.',
    'Grey default frames or thin text: they read as unfinished next to studded surfaces.',
    'Text with no outline on a bright stud surface becomes unreadable.',
  ] },
  // From the owner's tutorial "How to Animate Models in Roblox Studio!" (RigEdit Lite on a cannon, read frame by frame 2026-10-01).
  { id: 'props-rig-animate', title: 'Rig and animate a prop: doors, machines, levers, creatures, collectibles', domain: 'gameplay', summary: 'Make any model move the way builders do with RigEdit: a still root, Motor6Ds from the root outwards with each pivot on its hinge, then short keyframe clips started by a click, a prompt, a touch or a loop, with a sound. Played from code, so nothing is uploaded.', refs: ['uiAnimation'], keywords: ['animate', 'animation', 'rig', 'rigedit', 'motor6d', 'joint', 'hinge', 'door', 'lever', 'press', 'spin', 'bob', 'machine', 'cannon', 'move', 'moving'], implementation: { kind: 'existing_tool', id: 'animate_model', executableVerified: false, note: 'animate_model rigs (plugin Joints family, after RigEdit Lite) and writes clips played by the animate component; Studio-proven pieces: Motor6D rigging and C0 keyframes.' }, steps: [
    'Choose the root: the part that never moves (a base, a frame, a body). It stays anchored and becomes the PrimaryPart.',
    'Join the moving parts from the root outwards: rig.parts lists each part, with {part, to} when it hangs from another moving part (base -> barrel -> cap, body -> arm -> hand, lever -> handle). Each joint is named after its part. Parts that must never move join with joint "weld".',
    'Put every pivot on its hinge with rig.pivots [{joint, at = world point}]: a door at its hinge edge, a key at the middle of its bottom face, a lid at its back edge, a wheel at its centre. turn [x, y, z] degrees turns the pivot when the hinge axis is not the part\'s own.',
    'Write short clips with a rest pose at both ends so nothing pops: a press 0.2-0.3 s (down in 0.08 with Quad, back with Back), a door 0.6 s with Sine, a recoil 0.25 s, a spin as a loop from rot 0 to 360, a bob as a loop up and back. Name a clip Part.name (Key_A.press) so 60 keys share one rig and each plays from its own key.',
    'Give interactive clips a trigger (click for small things, prompt with an action text for doors and machines, touch for pads) and a sound from find_sound (a click for keys, a creak for doors); a little pitch variety is added for you.',
    'Play-check it: the parts must move and come back to rest, and nothing may fall (only the root is anchored, the rest hang on joints).',
  ], verification: [
    'Play: trigger every clip; the part moves about its hinge (not its centre) and returns exactly to rest.',
    'Play: nothing falls or drifts when the game starts (every unanchored part is joined).',
    'Repeated clicks restart the clip cleanly; a looping clip never jumps at its seam.',
  ], failureModes: [
    'A pivot left at the part centre: a door spins in place instead of swinging.',
    'A moving part left anchored, or never joined, so it falls or never moves.',
    'Joints built in the wrong order (child first): the parent ends up hanging from the child.',
    'Tweening the part CFrame while a joint drives it: the two fight and the part jitters.',
  ] },
  // M4 (docs/autonomy/PHASE-3-4-PLAN.md): library and Creator Store models arrive with every script and sound stripped. Verbs on parts, not subjects.
  { id: 'props-add-behaviour', title: 'Give a placed model behaviour: open, spin, bob, glow, make a sound, bounce', domain: 'gameplay', summary: 'A library or Creator Store model arrives with its scripts and sounds stripped. Read it (model_anatomy), then attach reviewed verbs to its parts by path (add_behaviour): swing, slide, spin, bob, fade, light, sound, emit, bounce, started by a click, a prompt, a touch, a player coming near or on their own. You choose the parameters. Nothing is written as code and nothing is rebuilt.', refs: ['proximity'], keywords: ['behaviour', 'behavior', 'open', 'close', 'toggle', 'click', 'press', 'touch', 'proximity', 'prompt', 'spin', 'bob', 'bounce', 'launch', 'glow', 'sound on click', 'music', 'stripped', 'library model', 'creator store', 'hinge', 'swing', 'slide', 'fade', 'appear', 'disappear', 'interactive', 'make it work'], implementation: { kind: 'existing_tool', id: 'add_behaviour', executableVerified: false, note: 'add_behaviour writes data (a ModuleScript AppleBehaviours) that the AppleBehave component plays; verified by tests in the luau CLI and against a mock of the Roblox API, not yet run in Studio.' }, steps: [
    'If the idea needs a placed model to DO something, do not write a script for it and do not rebuild the model from parts: read it, then attach verbs. model_anatomy {model} lists its parts (size, position, material, colour), its joints, which parts rest against which and what is already clickable or playing. The names are the author\'s and often say nothing (Part001, one name used four times), so decide what each part is from its geometry and a look at it, not from its name. model_anatomy {model, part} adds hinge candidates.',
    'Pick the verb for what was asked: turns about an edge or axis is swing (copy a hinge candidate\'s pivot and axis; positiveCarries says where a positive angle takes the part, so choose the sign that takes it where it should go; put everything that must move with it in `with`: what is joined to it and what rests on it); moves along a line is slide; turns without end is spin; rises and falls is bob (shape "hop" for a bouncing look); appears or vanishes is fade; lights up is light (glow for a lit surface); makes a noise is sound; throws sparks is emit; launches a player is bounce.',
    'Pick the trigger from how a player would meet it: click for what they point at, prompt (with text) for what they walk up to and use, touch for floors and pads, near for what reacts as they approach, auto for what should simply be going. Pick the mode: toggle for on and off, pulse for a moment, hold for while touching or near, once for one way. Behaviours can share one trigger (one click can swing a part, play a sound and light it); give each an id so it can be changed later (the same id replaces, remove: [id] removes).',
    'Sounds come from find_sound / insert_sound (library ids only): `sound` is the path of the inserted Sound (it is cloned) or `soundId` the id the search returned; loop true makes music that starts and stops with the trigger. The other numbers are yours: seconds 0.4-0.8 reads snappy and 1-2 heavy, ease Back overshoots a little, power and cooldown shape a launcher. The ranges are listed by add_behaviour {model} with no behaviours.',
    'Read the notes in the result: a joint between a moving part and one that stays still is switched off when the game runs (put that part in `with` if it should move too); a click on a part with CanQuery off never registers; a Motor6D rig fights a moving behaviour.',
    'It runs when the game runs. The call reads its own files back and says whether they match, which is not the same as the behaviour working: check it in play (play_check or run_and_check) and look before saying it works.',
  ], verification: [
    'Play: trigger each behaviour; a swing turns about its hinge edge (not its centre) and returns exactly to rest.',
    'A sound plays once per trigger, and a looped one stops on the next.',
    'Nothing falls or drifts when the game starts (moving parts are anchored; welds to still parts are switched off).',
    'model_anatomy again lists the behaviours the model holds.',
  ], failureModes: [
    'A hinge taken from the wrong candidate: the part turns about the wrong edge.',
    'The angle\'s sign not chosen from positiveCarries: the part swings into what it sits on.',
    'A part that should move with the target left out of `with`: it stays behind or falls.',
    'Writing a Script by hand for what a verb already does: it carries the risks the reviewed runtime removes.',
    'Rebuilding a library model from parts to make it move: refused, and unnecessary.',
  ] },
  // From the owner's tutorial "Make Your Roblox Game Look 10x Better With Lighting" (values read frame by frame 2026-10-01).
  { id: 'lighting-10x-better', title: 'Make a game look 10x better with lighting', domain: 'worldbuilding', summary: 'The lighting pass that turns a flat default place into a finished-looking one: sky-tinted ambient, bright key with soft shadows, Atmosphere haze that melts the horizon, a little bloom and sun rays, a cool colour grade, and surface detail on big flat areas.', refs: ['perfDesign'], keywords: ['lighting', 'light', 'atmosphere', 'bloom', 'sky', 'better', 'cooler', 'pretty', 'beautiful', 'look', 'graphics', '10x', '100x'], implementation: { kind: 'existing_tool', id: 'set_mood', executableVerified: true, note: 'set_mood "studded" applies the video\'s recipe (worldbuilding.ts MOODS.studded).' }, steps: [
    'Apply set_mood "studded" for a bright cartoony or studded game (blue-tinted Ambient 84,107,156 and OutdoorAmbient 117,120,145, Brightness 3, ShadowSoftness 0.2, Atmosphere Density 0.34 Offset 0 Haze 1.27, Bloom 1/56/2, SunRays 0.01, a cool tint); pick another mood only when the idea asks for one (night, horror, golden).',
    'Choose the sun with ClockTime and GeographicLatitude together: a lower sun gives long shadows and a warm glow; keep the play area readable.',
    'Keep bloom and sun rays subtle: the tutorial turns Glare back to 0 and warns "not that much". Judge on the picture, change one thing at a time.',
    'Never leave big flat areas blank: studs on every surface (the default) and slight colour variation between neighbouring blocks so repeats do not look copied.',
    'Tell the user the two settings Apple cannot script, once: Lighting.LightingStyle Realistic and PrioritizeLightingQuality (Properties pane).',
  ], verification: [
    'A screenshot before and after: shadows tinted, horizon hazy, no blown-out white surfaces.',
    'The play area stays readable: the player and the important objects are not lost in haze or glare.',
  ], failureModes: [
    'Bloom or glare so strong that bright parts turn into white blobs.',
    'Haze so dense the far side of the map disappears.',
    'Neutral grey ambient: shadows look dead and the scene looks unfinished.',
  ] },
  { id: 'make-it-cooler', title: 'Make it look 10x / 100x cooler', domain: 'worldbuilding', summary: 'What "make it cooler", "make it pretty", "make it pop" means in a Roblox place: lighting, surfaces, a landmark, clustered detail, motion and feedback, all in the place\'s own style, never by deleting what the user built.', refs: ['perfDesign'], keywords: ['cooler', 'cool', '10x', '100x', 'better', 'pretty', 'awesome', 'epic', 'pop', 'polish', 'juice', 'improve', 'upgrade'], steps: [
    'Inspect first (what the place is, what the player does, what already looks good) and keep everything the user made; then set_mood (studded for a bright game), the biggest change for the least work (lighting-10x-better).',
    'Surfaces: everything Apple adds is studded by default; flat blank floors get height variation (terraces, steps, borders) and colour variation.',
    'One landmark: the tallest, most colourful thing, visible from the spawn (a tree, a tower, a statue from find_library_model), at least 1.25x the next tallest.',
    'Detail in clusters, not sprinkles: 3-6 library props around each area (bushes, flowers, rocks, crates, lamps), scaled to the 5-stud player, turned a little each.',
    'Motion: make 2-4 things move (animate_model): a spinning sign, a bobbing coin, a swinging door, a windmill; effects from insert_vfx (sparkles on the reward, dust on the path).',
    'Feedback: every action the player takes gets a sound (find_sound) and a visible reaction, the UI gets the studded look (build_studded_ui) if it is plain; then look at it in play from the player\'s eyes before saying it is done.',
  ], verification: [
    'Before and after screenshots from the spawn: the after has a landmark, lighting, motion and no empty flat areas.',
    'Nothing the user built was removed or broken.',
  ], failureModes: [
    'Replacing the user\'s build with a template.',
    'Props scattered evenly like confetti, all the same size and facing.',
    'Effects and bloom piled on until the game is unreadable.',
  ] },
  { id: 'map-improve', title: 'Improve a map: paths, height, landmarks, life', domain: 'worldbuilding', summary: 'Turn a flat or broken map into a finished one: clean paths, raised areas and borders, a landmark, props from the library in clusters, moving things and ambient effects, in one consistent style.', refs: ['perfDesign'], keywords: ['map', 'world', 'terrain', 'island', 'level', 'environment', 'improve', 'better', 'broken', 'ugly', 'empty'], steps: [
    'Read the map (get_tree, render_view) and list what is wrong: overlapping or z-fighting parts, paths that cross themselves, floating props, empty stretches, props at the wrong scale.',
    'Fix structure first with plain parts: paths as non-overlapping pieces (one square per corner, straight runs between), curbs only on closed sides, borders around play areas, 2-3 height levels (terraces, cliffs in bands, ramps).',
    'Place library models for everything that is not a plain shape (find_library_model / insert_library_model): trees, bushes, rocks, fences, lamps, buildings. Cluster them by area, scale them to the player, vary rotation.',
    'Add one landmark and signposting: big signs with real words, painted arrows on the ground toward the first goal.',
    'Bring it to life: animate_model for windmills, gates, fans, signs; insert_vfx for sparkles, leaves, dust; ambient sound (find_sound) for the place.',
    'Finish with lighting (set_mood) and check from the spawn at player height.',
  ], verification: [
    'No two path pieces overlap and no curb crosses a path (look at the corners).',
    'From the spawn: a landmark, a clear route, nothing floating, nothing flickering.',
  ], failureModes: [
    'Overlapping bricks: flickering colours and doubled studs.',
    'Hand-built props from parts (trees, rocks, lamps): they read as a blockout. Use the library.',
    'A flat map with props sprinkled on it.',
  ] },
  { id: 'any-idea-done-right', title: 'Do any request completely, however small or silly', domain: 'genre_pattern', summary: 'People ask for anything, in any language. Every request gets a complete, good-looking, working result in the studded style: never a refusal, never a bare part, never extras nobody asked for. You choose how: a ready-made library model when one really is the thing, build_object when none is, compose_game for a whole game.', refs: ['perfDesign'], keywords: ['object', 'thing', 'make me', 'build me', 'silly', 'random', 'item', 'prop', 'toy', 'build_object', 'library model'], implementation: { kind: 'existing_tool', id: 'build_object', executableVerified: false, note: 'build_object builds exactly the spec and reports measured checks; dress_object adds a stage, a click response or a counter only on request.' }, steps: [
    'Decide what THIS thing is and what would delight the person: the thing itself, big enough to enjoy, doing something if that suits it, and only what was asked. When a ready-made model might be it, look first: find_library_model or browse_owner_library with your own words (as many queries as you need), then preview_library_models to read size, colour and parts. Place one (insert_library_model, with size if it needs one) only if it really is the thing; if none is, build it.',
    'build_object takes {name, scale?, at?, parts:[{name, shape block|ball|cylinder|wedge, size [x,y,z], at [x,y,z] centre (y up, 0 = ground), rot?, color "#rrggbb", text?, repeat?, rows?, move? {as, on, hinge?, amount?, sound?}}], stage?, screen?, focus?}. Real proportions, bright saturated colours, details ON the outside of the body. It adds nothing you did not ask for and returns measured checks (hidden parts, parts with nothing under them, covered or low-contrast words, proportions): act on them or not.',
    'dress_object adds a stage, a click response, a counter or an attached piece ONLY when THIS object calls for it: a thing that opens needs a part that moves, a still thing needs nothing. Say what you added and nothing you did not.',
    'Look at it (play_check, a capture), fix what you judge wrong with build_object again (replace: true), then say in one or two friendly sentences what the person can do with it.',
  ], verification: [
    'Play: the object is visible from the spawn and looks like the thing asked for (proportions, colours, studs).',
    'Play: every interaction works, moves and makes its sound; nothing upside down, floating or sunk.',
  ], failureModes: [
    'Answering a small request with "I can only build games".',
    'A single grey part named after the object, or a flat slab where keys should be.',
    'Adding a room, a desk or a monitor nobody asked for, or inserting library furniture without checking it stands upright.',
  ] },
  { id: 'ui-responsive-hud-anchors', title: 'Anchor a responsive gameplay HUD', domain: 'ui', summary: 'Place persistent HUD regions with scale-first sizing, bounded offsets and no overlap at phone aspect ratios.', refs: ['uiPosition', 'uiSize'], keywords: ['hud', 'responsive', 'anchor'], steps: ['List the always-visible HUD regions and their priority.', 'Use anchors and scale for placement; reserve offsets for minimum padding and icon sizes.', 'Add constraints only where distortion would break meaning.', 'Collapse or move secondary regions at the narrow breakpoint.'], verification: ['Capture the smallest phone, a tall phone and 16:9 desktop.', 'Confirm no region covers the thumb input area or another required control.'], failureModes: ['Pixel-only placement drifts off-screen on tall or narrow devices.', 'Every region keeps desktop size and leaves no gameplay viewport.'] },
  { id: 'ui-safe-area-and-topbar', title: 'Keep UI out of device and Core UI insets', domain: 'ui', summary: 'Respect screen insets so controls are not hidden by notches, the top bar or device corners.', refs: ['uiScreen', 'uiPosition'], keywords: ['safe area', 'inset', 'topbar'], steps: ['Identify which containers should respect versus intentionally ignore insets.', 'Apply the inset policy at the root container instead of compensating every child.', 'Keep critical actions inside an additional touch-safe margin.'], verification: ['Inspect a notched phone and desktop with Core UI visible.', 'Confirm dismiss, purchase and pause actions remain reachable.'], failureModes: ['Manual offsets double-apply an inset on some devices.', 'Fullscreen art is treated like interactive content and shrinks unnecessarily.'] },
  { id: 'ui-text-hierarchy-scaling', title: 'Build a scalable text hierarchy', domain: 'ui', summary: 'Define title, body, label and numeric emphasis that remain legible without uncontrolled TextScaled distortion.', refs: ['uiSize', 'uiAppearance'], keywords: ['text', 'typography', 'legibility'], steps: ['Assign each text role a size range and line limit.', 'Use constraints to bound scaling and keep body copy from becoming headline-sized.', 'Reserve stroke or shadow for contrast, not decoration on every label.'], verification: ['Check longest supported localized string and smallest viewport.', 'Read the hierarchy at gameplay distance without opening Studio properties.'], failureModes: ['Unlimited TextScaled produces inconsistent hierarchy.', 'Rich effects reduce contrast on moving backgrounds.'] },
  { id: 'ui-inventory-grid-layout', title: 'Lay out an inventory grid that survives resizing', domain: 'ui', summary: 'Create a grid with stable cell aspect, bounded columns and scrolling rather than clipped slots.', refs: ['uiPosition', 'uiSize'], keywords: ['inventory', 'grid', 'slots'], steps: ['Choose minimum cell size from touch and icon readability.', 'Derive columns from available width and gap, then cap them for wide screens.', 'Put overflow in one scrolling container and keep selection outside the cell geometry.'], verification: ['Resize through each column breakpoint and inspect the last row.', 'Verify the selected item stays visible after filtering or sorting.'], failureModes: ['A fixed column count makes phone cells too small.', 'Canvas size does not follow content and hides the last row.'] },
  { id: 'ui-scrolling-list-window', title: 'Bound a long scrolling list', domain: 'ui', summary: 'Keep large catalog, quest or server lists responsive by limiting visible row work and preserving scroll state.', refs: ['uiPosition', 'perfDesign'], keywords: ['scrolling', 'list', 'virtualization'], steps: ['Define stable row height and identity.', 'Render or update only rows intersecting the viewport plus a small buffer.', 'Preserve selection and scroll position when data refreshes.'], verification: ['Profile a list at its maximum expected row count.', 'Refresh the backing data while scrolled near the end.'], failureModes: ['Rebuilding every row on each scroll event causes frame spikes.', 'Index-based identity moves selection to a different item after sorting.'] },
  { id: 'ui-modal-focus-and-dismiss', title: 'Give a modal one clear focus and exit path', domain: 'ui', summary: 'Open a modal with one primary action, controller focus capture and consistent close behavior.', refs: ['uiButtons', 'inputGamepad'], keywords: ['modal', 'focus', 'dismiss'], steps: ['Pause or gate the underlying interaction state.', 'Set initial selection to the safest meaningful action.', 'Map close, back and outside-click behavior deliberately.', 'Restore prior focus when the modal closes.'], verification: ['Complete the modal using only gamepad, only keys and only touch.', 'Attempt to activate controls behind the modal.'], failureModes: ['Focus remains behind the overlay and triggers hidden actions.', 'Back closes a purchase confirmation without restoring gameplay input.'] },
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
  { id: 'input-semantic-action-map', title: 'Map device inputs to semantic actions', domain: 'input', summary: 'Define actions such as Interact or Ability1 once, then bind device-specific inputs without branching gameplay logic.', refs: ['inputActions', 'inputOverview', 'contextActions'], keywords: ['action map', 'binding', 'cross platform'], steps: ['List actions and the game states that accept them.', 'Bind key, gamepad and touch inputs to each action.', 'Keep gameplay code subscribed to action state, not raw keys.', 'Expose current binding glyphs to UI.'], verification: ['Perform the same loop on all supported input devices.', 'Switch input device mid-session and inspect prompts.'], failureModes: ['Raw key checks spread through several scripts.', 'Two contexts consume the same action simultaneously.'] },
  { id: 'input-mouse-aim-and-fire', title: 'Separate mouse aim sampling from fire requests', domain: 'input', summary: 'Sample client aim smoothly while sending bounded fire intent that the server can validate.', refs: ['inputKeyboard', 'clientBoundary'], keywords: ['mouse', 'aim', 'fire'], steps: ['Sample pointer or camera aim on the client.', 'Send fire intent only on the weapon cadence.', 'Include origin/direction evidence rather than a claimed victim or damage.', 'Let the server reconstruct range and line of sight.'], verification: ['Test low and high frame rates with identical weapon cadence.', 'Send impossible directions and rates through a harness.'], failureModes: ['A frame event sends aim remotes every render step.', 'The payload names the victim and damage as facts.'] },
  { id: 'input-gamepad-prompt-glyphs', title: 'Update prompts for active gamepad controls', domain: 'input', summary: 'Show the current action binding rather than hard-coded key text.', refs: ['inputGamepad', 'inputActions'], keywords: ['gamepad', 'glyph', 'prompt'], steps: ['Read the active action binding.', 'Map supported codes to a consistent glyph or short label.', 'Fall back to a textual action name for unknown devices.', 'Update only when the active input family changes.'], verification: ['Connect and disconnect a controller while a prompt is visible.', 'Verify fallback text for an unmapped input.'], failureModes: ['A prompt always says E on console.', 'Glyph refresh runs every frame.'] },
  { id: 'input-touch-action-layout', title: 'Lay out custom touch actions without covering movement', domain: 'input', summary: 'Place touch-only actions around existing movement and camera gestures with clear priority.', refs: ['inputMobile', 'inputActions'], keywords: ['touch', 'mobile', 'action button'], steps: ['Inventory existing default and custom touch regions.', 'Place frequent actions in reachable non-overlapping zones.', 'Hide actions outside their valid gameplay state.', 'Keep camera swipe space free.'], verification: ['Complete the loop with both thumbs on a small phone.', 'Rotate orientation if the experience supports it.'], failureModes: ['A custom action overlays the jump button.', 'Invisible controls continue consuming touch.'] },
  { id: 'input-device-family-switch', title: 'Switch prompts and focus when the active device changes', domain: 'input', summary: 'Respond to key, touch and gamepad transitions without rebuilding the whole interface.', refs: ['inputOverview', 'inputGamepad'], keywords: ['device switch', 'last input'], steps: ['Track the last meaningful input family, ignoring noise.', 'Swap prompt glyphs and selection mode on change.', 'Preserve the current game state and selected action.', 'Rate-limit cosmetic refresh.'], verification: ['Alternate mouse and gamepad rapidly.', 'Touch the screen while a controller-selected modal is open.'], failureModes: ['Mouse movement jitter constantly steals gamepad focus.', 'Changing glyphs resets the player flow.'] },
  { id: 'input-tap-hold-release', title: 'Distinguish tap, hold and release semantics', domain: 'input', summary: 'Use explicit action phases so charging, aiming and quick activation do not conflict.', refs: ['inputActions', 'userInput'], keywords: ['tap', 'hold', 'release'], steps: ['Define time and cancellation rules for each phase.', 'Start only local preview work on begin.', 'Commit one request at the accepted phase.', 'Cancel on state change, death or focus loss.'], verification: ['Test just below, at and above the hold threshold.', 'Lose focus during a hold and confirm no late commit.'], failureModes: ['Both tap and hold handlers fire for one press.', 'A cancelled hold remains armed.'] },
  { id: 'input-action-cooldown-gate', title: 'Gate repeated input by authoritative cooldown', domain: 'input', summary: 'Keep local feedback responsive while the server owns whether the action is ready.', refs: ['inputActions', 'securityTactics'], keywords: ['cooldown', 'spam', 'debounce'], steps: ['Track cosmetic local readiness for immediate feedback.', 'Send one bounded request when local readiness permits.', 'Validate server cooldown from server time.', 'Reconcile UI from accepted or refused result.'], verification: ['Spam faster than the cooldown through normal and crafted input.', 'Simulate latency around the exact boundary.'], failureModes: ['A client debounce is treated as security.', 'Refusal leaves the UI permanently disabled.'] },
  { id: 'input-proximity-interaction', title: 'Make proximity interaction state-aware', domain: 'input', summary: 'Use proximity prompts for discovery while rechecking distance, state and permission on the server.', refs: ['proximity', 'clientBoundary'], keywords: ['proximityprompt', 'interact', 'distance'], steps: ['Configure action text and hold behavior for the object.', 'Enable the prompt only in broadly eligible states.', 'On trigger, recheck player distance, object state and permission.', 'Return a clear refusal when the object changed.'], verification: ['Trigger while moving out of range and while another player changes the object.', 'Test controller, key and touch activation.'], failureModes: ['Prompt visibility is treated as authorization.', 'Two players consume the same one-use object.'] },
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

  // BEGIN researched-seeds

  // Researched 2026-10-04 (research/roblox/01-viral-hits.md, 03-genre-design.md): genre loop patterns.
  // Values the notes call "derived", "kit" or "heuristic" are starting points to test, never facts. Each skill lists two genre
  // kits on purpose so the per-genre profile (exactly 8 genre tasks) is untouched.
  { id: 'pattern-contested-base-collection', title: 'Build a contested base that earns while players raid it', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'Delivered collectibles earn income in a personal base; rivals can carry them off, and the victim always has a counter.', refs: ['proximity'], keywords: ['steal', 'raid', 'base', 'conveyor', 'rarity', 'passive income', 'small server'],
    steps: [
      'Make Workspace/Bases with one identical Model per slot (6 to 8 players); each has Floor, Spawn, about 10 slots, a Lock part and attribute OwnerUserId.',
      'A server conveyor spawns an item every 3 to 5 s from a weighted rarity table; attributes Price, IncomePerSecond, Rarity; remove after about 60 s.',
      'Buy by ProximityPrompt (HoldDuration 0); the server checks cash, deducts, fills a free slot. One server loop pays the summed income each second.',
      'Raid prompt (HoldDuration about 2, MaxActivationDistance about 8): recheck not owner, not locked, in range; slow the carrier; transfer only at their base.',
      'Counters: hitting the carrier returns the item; a lock timestamp (os.time + 30 to 60 s, a starting point; a third-party report gives 60 + 10 s per rebirth) disables raids with a visible countdown; slow the thief (WalkSpeed x 0.7) and keep carrying server-side. Keep one free counter.',
    ],
    verification: ['Fire the raid from out of range, as owner, during a lock and twice in a frame: nothing may change.', 'Kill a carrier mid-carry: the item returns and no weld or prompt is left.'],
    failureModes: ['A client-sent steal or price is trusted.', 'Rich bases farm new players with no protected start or counterplay.'] },
  { id: 'pattern-offline-growth-timestamps', title: 'Grow things while the player is offline using timestamps', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'Store start time and duration, compute progress on demand from server time, so offline growth is free and clock edits do nothing.', refs: ['saveData'], keywords: ['idle', 'incremental', 'offline', 'timer', 'plot', 'harvest', 'os.time'],
    steps: [
      'Per growing item persist plantedAt (os.time), growSeconds, typeId and modifier; never an elapsed counter. A 4 player server fits the loop.',
      'progress = clamp((os.time() - plantedAt) / growSeconds, 0, 1), computed only on display or harvest; never tick growth per frame.',
      'Harvest through a server-checked prompt when progress is 1; roll a random size so rare outliers feel special; price rare types far above common.',
      'Cap anything accumulated while away and show a "while you were away" summary on join.',
      'Weather or event bonuses come from a server timer setting an attribute, announced by one message.',
    ],
    verification: ['Save, shift stored timestamps by a known interval, rejoin: progress matches the elapsed time.', 'Rejoin with a timestamp in the future or far past: values clamp.'],
    failureModes: ['Elapsed counters are saved, so offline time is lost or doubled.', 'Uncapped offline accumulation gives unbounded value.'] },
  { id: 'pattern-global-stock-rotation', title: 'Rotate a shared store stock on a server clock', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'Every server shows the same limited stock because the restock slot is derived from time; staples stay, rare entries appear rarely.', refs: ['gdEconomy'], keywords: ['restock', 'stock', 'rotation', 'timer', 'scarcity', 'event currency', 'prestige'],
    steps: [
      'slot = floor(os.time() / intervalSeconds); seed a Random with a server-only secret plus the slot so servers agree and clients cannot predict future stock (use one clock source everywhere). A farming hit reportedly used 5 min (seeds, gear) and 30 min (collectibles): test those.',
      'Per entry store stockChance (1 for staples, far below 0.01 for the rarest) and quantity; roll once per slot on the server and replicate it.',
      'Show a countdown from the same clock; the server refuses items not in the current slot.',
      'Run events with their own currency and store so event income cannot flood the main economy.',
      'Add a prestige reset converting currency into permanent upgrades at a rising fee; keep the first boost reachable in minutes.',
    ],
    verification: ['In a Server and Clients test two servers return the same stock for one slot.', 'Buy at the last and first second around a restock: only current stock sells.'],
    failureModes: ['Each server rolls its own stock.', 'A tiny-chance entry never shows in testing, so its purchase path is untested.'] },
  { id: 'pattern-weighted-roll-luck-odds', title: 'Roll rare outcomes with weights, luck and a matching odds display', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'Pick from a weight table with a capped luck multiplier and build the shown odds from the same function.', refs: ['prodPaidRandom'], keywords: ['gacha', 'hatch', 'luck', 'rarity', 'weighted', 'odds', 'random reward', 'collection'],
    steps: [
      'Keep tables in a server-only module: 5 to 7 tiers, weights summing to 100 (illustrative 60, 25, 10, 4, 1).',
      'Pick with a cumulative-weight function on a Random object. Luck multiplies only the rare weights, is capped, then weights renormalise to 100.',
      'Generate the odds list in the UI by calling the same function with current luck, so a boost changes the numbers shown.',
      'The client only requests a roll by table id. Reveal in 2 to 3 s, skippable; save item ids, never instances.',
      'Make the first luck boost quick, add an index whose completion gives a permanent bonus, add merge as a long goal and sink.',
    ],
    verification: ['Roll many times in a test script; observed frequencies match the shown percentages.', 'At the luck cap the shown odds still sum to 100 and every tier is reachable.'],
    failureModes: ['Luck changes a copy of the weights the odds screen never sees.', 'The client rolls, or a free path makes the paid roll pointless.'] },
  { id: 'pattern-speed-incremental-runner', title: 'Build a short-session speed incremental runner', domain: 'genre_pattern', genres: ['simulator', 'obby'], summary: 'Each step adds speed, speed clears gated stages, wins buy multipliers, a rebirth trades speed for a permanent multiplier.', refs: ['humanoid'], keywords: ['speed', 'treadmill', 'runner', 'incremental', 'wins', 'multiplier', 'rebirth', 'afk'],
    steps: [
      'Touching a marked path part adds +1 to a Speed leaderstat on the server, debounced per part and player.',
      'The server sets Humanoid.WalkSpeed = base + Speed * step, capped; WalkSpeed far above about 100 breaks collision and streaming.',
      'Build 10 to 15 stages gated by required speed; finishing awards Wins on the server.',
      'Wins buy cosmetic multipliers (trails, auras); rebirth resets Speed for a permanent multiplier. A free AFK treadmill must earn less than active play.',
      'Give every step a short satisfying sound and a number pop so progress reads in a 5 s clip.',
    ],
    verification: ['Run the path at the speed cap: no part skipped, no collision tunnelling.', 'Compare 10 min AFK with 10 min active: active earns more.'],
    failureModes: ['WalkSpeed comes from a client value or is uncapped.', 'AFK earns more than play, which empties the stages.'] },
  { id: 'pattern-obby-checkpoint-run', title: 'Build a checkpoint obby with a fair difficulty curve', domain: 'genre_pattern', genres: ['obby', 'adventure'], summary: 'Stages with tagged checkpoints, saved progress, jump-safe gaps and one new mechanic at a time.', refs: ['humanoid'], keywords: ['obby', 'checkpoint', 'stage', 'kill brick', 'jump gap', 'difficulty', 'respawn'],
    steps: [
      'Stages folder of Stage1..StageN (start with 30 to 50), each with a Spawn tagged Checkpoint and an Exit trigger; stage 1 at spawn; theme change every 10 to 20.',
      'Server sets a Stage attribute only upward and player.RespawnLocation to that spawn; save Stage. Lower Players.RespawnTime from its 5 s default.',
      'Characters default to JumpPower 50 (UseJumpPower true, about 7.2 studs of apex), WalkSpeed 16, gravity 196.2: a flat running jump is near 8.7 studs (derived; one test measured 9.6). Start gaps: 2 to 4 tutorial, 4 to 5 easy, 5 to 6.5 medium, 7 to 8 hard, never over 8.5 for a general audience; an expert tier stays at or below 12 and is tested with a real run; steps up at most 6; gap_max is about WalkSpeed * 0.54.',
      'Introduce one mechanic per group (mover, spinner, vanishing part), alone then combined; first 20 percent easy for anyone, last 30 percent combos.',
      'Kill parts zero Humanoid.Health on touch with a per-player debounce; add checkpoint sound, particles, a tweened stage number.',
    ],
    verification: ['Script a default-speed run of every gap: each clears with margin.', 'Die and rejoin at several stages: you resume at the saved checkpoint.'],
    failureModes: ['Checkpoints far apart or gaps that need perfect timing on touch.', 'Spawn far from stage 1 wastes the first seconds.'] },
  { id: 'pattern-timed-round-obstacle-sections', title: 'Assemble timed rounds from rated obstacle sections', domain: 'genre_pattern', genres: ['obby', 'adventure'], summary: 'Random runs from difficulty-rated sections with a shared timer; a fall resets only the current section.', refs: ['gdCoreLoops'], keywords: ['round', 'timer', 'sections', 'random assembly', 'mutator', 'gear', 'no checkpoint'],
    steps: [
      'Author sections as models with a rating, length and entry and exit points on one grid; check the gap maths of every seam.',
      'Server round loop: intermission, assemble N sections ordered by rating, countdown, shared timer, finish at the top; a fall resets only the section.',
      'Offer one-round gear and mutators bought with round currency, cost scaled to run length; sell Robux ones only in intermission.',
      'Reward a win with currency and a badge; cap consecutive hard sections.',
    ],
    verification: ['Assemble 50 random runs: no seam needs an impossible jump, no run exceeds the hard-section cap.', 'Disconnect a player mid-run: the round continues and state is cleaned.'],
    failureModes: ['Seams hide gaps beyond the jump envelope.', 'Gear persists past the round and decides every later run.'] },
  { id: 'pattern-tycoon-plot-production', title: 'Build a tycoon plot with producers, collector and buttons', domain: 'genre_pattern', genres: ['tycoon', 'simulator'], summary: 'Per-player plot with a producer to conveyor to collector chain, unlock buttons, rebirth and capped offline income.', refs: ['gdEconomy'], keywords: ['tycoon', 'plot', 'producer', 'conveyor', 'collector', 'buttons', 'rebirth', 'offline income'],
    steps: [
      'Assign a plot Model on PlayerAdded, tag the owner, claim it automatically on spawn.',
      'Producer spawns a part with attribute Value; conveyor is an anchored part with AssemblyLinearVelocity; collector Touched adds Value to cash and destroys the part. Cap live parts per plot (for example 100) and use Debris.',
      'Each upgrade is a ProximityPrompt or pad hidden until the previous one is bought; the server deducts cash and spawns the model.',
      'Kit starting points to test: 5 per 2 s drop, buttons 50, 250, 1,000, each purchase 1 to 3 minutes of income, first purchase within 6 to 10 s, rebirth cost 100,000 * 2.5^r with income x (1 + 0.5r), first rebirth at 15 to 25 min.',
      'Offline income at 25 percent of rate for time away, capped at 8 hours (kit values); money packs and a 2x pass as products.',
    ],
    verification: ['Leave a plot running for several minutes and confirm part count stays under the cap.', 'Buy every button in order and out of order from a script: only legal orders succeed.'],
    failureModes: ['Cash lives on the client or parts are never capped.', 'Rebirth cost outgrows income so cycles stretch without limit.'] },
  { id: 'pattern-simulator-collect-sell-rebirth', title: 'Build a collect, sell, zone and rebirth simulator loop', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'Server-validated gain action, backpack capacity that forces a sell trip, gated zones, and a rebirth with a growth curve that stays finite.', refs: ['gdCoreLoops'], keywords: ['simulator', 'clicker', 'backpack', 'sell pad', 'zones', 'rebirth', 'multiplier', 'capacity'],
    steps: [
      'Gain action on a server-validated remote with a cooldown (kit 0.08 s) and a server-computed multiplier; the client sends only intent.',
      'Backpack capacity per tier; a sell pad converts the load into currency so the player makes a trip.',
      'Upgrades (capacity, gain, speed) with geometric costs; zones unlock by currency or rebirth, each worth about 3 to 8 times the last (kit costs 5,000, 50,000, 500,000).',
      'Rebirth cost C(r) = S * R^r with R about 1.4 to 2.5; if cost grows faster than income, halve R at breakpoints (100, 200, 400 rebirths) and let rebirth unlock stronger earners.',
      'Refresh UI numbers on a 0.1 s interval, abbreviate big numbers (K, M, B, T), and offer boosts such as 2x for 15 minutes as products.',
    ],
    verification: ['Simulate 10 minutes with a script and print currency over time; the first upgrade lands within about a minute.', 'Compute cycle length cost(r) / income(r) for r = 1 to 20; it must not diverge.'],
    failureModes: ['The first boost or upgrade takes too long to reach.', 'Exponential costs with only a linear multiplier make later rebirths impossible.'] },
  { id: 'pattern-wave-defense-lanes', title: 'Build a lane wave defense with a match economy', domain: 'genre_pattern', genres: ['tower_defense', 'survival'], summary: 'Waypoint path, server-owned enemies, placement validated on the server, and a cash economy separate from meta progression.', refs: ['pathfinding'], keywords: ['wave', 'defense', 'path', 'waypoint', 'placement', 'upgrade', 'boss', 'match cash'],
    steps: [
      'Path is a folder of numbered parts Waypoint1..N; the server moves enemies along it by tween or Humanoid:MoveTo and owns all of them.',
      'Match cash: starting cash, per-kill reward and wave bonus; economy units trade early cash for income. Define your own numbers and playtest, none are given.',
      'Placement is validated on the server (grid or raycast onto a placement surface); upgrade paths of 3 to 5 levels; target modes first, last, strongest.',
      'Waves are a data table of enemyType, count, interval; a boss every 10 waves is a heuristic; difficulty modes are separate tables.',
      'Keep meta currency (unlocks, levels) apart from match cash; co-op by lobby that reserves a server with TeleportService.',
    ],
    verification: ['Place from out of range, on the path and over another unit; all must be refused.', 'Run a full wave table headless and confirm no enemy gets stuck and cash totals match the table.'],
    failureModes: ['Economy units with no risk make one build the only meta.', 'Client-sent placement coordinates are trusted.'] },
  { id: 'pattern-horror-entity-director', title: 'Direct fair horror entities with tells and counters', domain: 'genre_pattern', genres: ['horror', 'survival'], summary: 'A room pool with an entity director where every threat has a tell, a reaction window and a counter, so deaths are fair.', refs: ['gdContextualPurchases'], keywords: ['horror', 'entity', 'jump scare', 'tell', 'rooms', 'fairness', 'chapters', 'flashlight'],
    steps: [
      'Keep a pool of room models; spawn the next when the player nears the exit and delete old rooms to cap part count.',
      'Each entity has a tell (light flicker, sound, shake), a reaction window and a counter (hide, stay still, item); a timer picks entities by room number.',
      'Fairness rule: correct play always survives; no random deaths and no scare on an invisible touch.',
      'Audio first: silence then a sudden sound; limit visibility with low Brightness, night ClockTime and a flashlight, but stay readable on phones.',
      'Sell consumables in a pre-run store, and release in floors or chapters, each with a new entity set.',
    ],
    verification: ['For each entity script the counter and confirm survival; script the wrong response and confirm death.', 'Play on a phone-size viewport at low brightness: routes stay readable.'],
    failureModes: ['A threat has no audible or visible tell.', 'Darkness is so total that mobile players cannot see the route.'] },
  { id: 'pattern-anomaly-shift-horror', title: 'Build shift-based anomaly spotting horror', domain: 'genre_pattern', genres: ['horror', 'adventure'], summary: 'Repeated short shifts: detect hidden anomalies, do work tasks, manage a sanity meter, earn a persistent streak.', refs: ['gdCoreLoops'], keywords: ['anomaly', 'shift', 'sanity', 'detect', 'patients', 'imposter', 'streak', 'classes'],
    steps: [
      'Shift structure: early shifts teach, a pressure event near shift 4, a milestone near shift 5, then open-ended (third-party observation, test it).',
      'Detect verb: arrivals carry a hidden anomaly flag chosen on the server, with tells such as a wrong silhouette, wrong count or wrong sound.',
      'Work verb: a matching or treatment task per arrival; a mistake or missed anomaly costs a life; three losses end the shift.',
      'A sanity meter drops on anomaly contact and distorts the screen with ColorCorrection and a vignette; reward per shift plus a permanent streak counter.',
      'Meta: soft currency, classes or perks with levels, consumables; keep pace with shared tasks on 25 to 30 player servers.',
    ],
    verification: ['Run 20 shifts from a script and confirm the anomaly share, tells and life loss follow the config.', 'Confirm the sanity effect resets on respawn and shift end.'],
    failureModes: ['Anomalies without a tell feel unfair.', 'Horror decays fast without a steady content cadence.'] },
  { id: 'pattern-roleplay-hangout-systems', title: 'Build roleplay hangout systems with no progression walls', domain: 'genre_pattern', genres: ['roleplay', 'adventure'], summary: 'Free base content, claimable homes, ride spawner, job outfits, optional expression sales and a camera that hides the UI.', refs: ['gdDesignForRoblox'], keywords: ['roleplay', 'hangout', 'home', 'ride spawner', 'jobs', 'emotes', 'creator camera', 'social'],
    steps: [
      'No levels, quests or currency walls; give a base set of homes, rides and jobs for free.',
      'Build three spawner systems first: homes (claim, lock, key), rides (one per player, removed on leave) and props (place, move, cap per player); then job outfits and tool swaps so players self-assign roles, and emotes.',
      'Sell only optional expression (premium properties or rides) as passes and keep free alternatives; read prices from product info at runtime.',
      'Plan a weekly content drop on a fixed weekday and a server size of 20 to 30; chat and voice are the social layer.',
      'Add a creator-camera toggle that hides the interface for recording; stream and cap props for performance.',
    ],
    verification: ['Claim, lock and release every home with two clients; ownership never doubles.', 'Spawn rides repeatedly: one per player and old ones cleaned.'],
    failureModes: ['A prop-heavy map without streaming or caps drops frame rate.', 'Premium rides become a pay gate to basic play.'] },
  { id: 'pattern-battlegrounds-combat-ranked', title: 'Build battlegrounds combat with a meter and ranked ladder', domain: 'genre_pattern', genres: ['anime_battle', 'fps_arena'], summary: 'Server-authoritative strikes with block, dash and a damage-filled ultimate meter, plus casual and ranked queues.', refs: ['worldRoot'], keywords: ['battlegrounds', 'combat', 'm1', 'block', 'dash', 'ultimate', 'ranked', 'elo'],
    steps: [
      'Hit detection on the server by raycast or region query with a client-predicted animation; per-attack cooldown and server-owned hitboxes.',
      'Moves: an M1 combo string, block, dash and a recovery cancel; each character has about 4 skills.',
      'Damage dealt fills an awakening meter; at full it grants a timed powered form.',
      'Queues: casual free-for-all plus ranked 1v1 or 2v2 with ELO tiers (one hit used nine tiers in 200-point steps, with inactivity decay).',
      'Cosmetics through capsules or ranked rewards; avoid power for Robux; validate every hit server side because exploiters are the main threat.',
    ],
    verification: ['Send hits out of range, through walls and at impossible cadence: all refused.', 'Play two clients at 200 ms simulated latency: hits feel fair and meter fills once per hit.'],
    failureModes: ['Damage is computed on the client.', 'No skill ceiling or ranked decay, so the top of the ladder stagnates.'] },
  { id: 'pattern-cast-reel-catch-loop', title: 'Build a cast, reel and catch collecting loop', domain: 'genre_pattern', genres: ['adventure', 'simulator'], summary: 'A timing meter, a reel minigame shaped by gear stats, catch tables with expected value, and an index.', refs: ['gdEconomy'], keywords: ['fishing', 'cast', 'reel', 'catch table', 'bait', 'index', 'expected value', 'rarity'],
    steps: [
      'Cast: a power meter sets distance; the bite waits a random time scaled by a gear bite-speed stat.',
      'Reel minigame: hold to move a bar over the target; a control stat widens the safe zone and a resilience stat calms the target; support tap on touch.',
      'Catch table per location: entries with rarity weight and value; compute expected value per action (the docs example gives 14 per cast for 10 at 70 percent, 20 at 20, 30 at 10) and per hour.',
      'Bait and weather modify luck, mutations multiply value; each species is logged in an index with completion rewards.',
      'Gate zones by gear tier; model any limited event catch before launch and isolate it with event currency.',
    ],
    verification: ['Simulate 1,000 casts per location and compare mean value with the computed expected value.', 'Reel with touch only and confirm it can be completed.'],
    failureModes: ['A rare entry floods currency and depresses later spending.', 'Reel difficulty ignores gear, so upgrades feel pointless.'] },
  { id: 'pattern-cooperative-night-survival', title: 'Build a co-op day and night survival loop', domain: 'genre_pattern', genres: ['survival', 'horror'], summary: 'Gather by day, defend a fuel-driven base at night, track a visible goal counter, and unlock classes with persistent currency.', refs: ['gdCoreLoops'], keywords: ['survival', 'co-op', 'night', 'campfire', 'fuel', 'waves', 'classes', 'day night'],
    steps: [
      'Day: resource nodes respawn on a server timer; night: return to a fire whose fuel is the failure clock.',
      'Spawn enemies in waves scaled by night number and player count; telegraph them so clips feel fair; cap alive enemies for server cost.',
      'A visible counter (night N of a target, or distance) gives the goal; rescue or station objectives can shorten the run.',
      'Classes are bought with a persistent currency earned from runs; sessions of 4 players or a 20 to 25 player camp.',
      'Keep swings and movement responsive on the client and verify combat on the server; fix weak zones before adding new ones.',
    ],
    verification: ['Run a night with 1 and with 8 players: enemy count and server frame time stay within budget.', 'Let the fire run out: the failure state triggers once and cleans up.'],
    failureModes: ['Night difficulty spikes feel unfair.', 'Per-enemy AI on the server grows without a cap.'] },
  { id: 'pattern-round-loop-state-machine', title: 'Run a lobby round loop as a server state machine', domain: 'genre_pattern', genres: ['adventure', 'fps_arena'], summary: 'Intermission, vote, prepare, round, results, reward in one server owner, with roles, comebacks and something for the eliminated.', refs: ['gdContextualPurchases'], keywords: ['round', 'lobby', 'state machine', 'intermission', 'vote', 'roles', 'results', 'spectate'],
    steps: [
      'Server states: Intermission, Vote (map or theme), Prepare, Round, Results, Reward; one replicated value for state and one for the timer.',
      'Keep the full cycle under about 8 to 10 minutes; a dress-up round hit used 360 s of play.',
      'Assign roles randomly on the server with a comeback rule (a dropped item can be picked up by an innocent).',
      'Pay currency for taking part plus a win bonus; give eliminated players spectating or a minigame; use the intermission for contextual offers.',
    ],
    verification: ['Run the loop 20 times with players leaving at every state; it never stagnates.', 'Join mid-round: the player spectates and is included next round.'],
    failureModes: ['Lobby waits are long with few players.', 'Role imbalance or no activity for eliminated players.'] },
  { id: 'pattern-theme-vote-showcase-round', title: 'Run a themed showcase round with player voting', domain: 'genre_pattern', genres: ['roleplay', 'adventure'], summary: 'Players build a look for a theme, walk a runway, others rate 1 to 5 stars, the server tallies and awards the top three.', refs: ['textService'], keywords: ['dress up', 'theme', 'runway', 'voting', 'stars', 'awards', 'outfit', 'humanoid description'],
    steps: [
      'Round states: lobby, theme reveal, a timed make phase (360 s was used by a hit), runway, voting, awards.',
      'A wardrobe by category (clothes, hair, accessories) applied with HumanoidDescription and ApplyDescription from server-validated ids.',
      'Runway: each entrant walks a path while others vote 1 to 5; the server accumulates, excludes self-votes and one vote per voter.',
      'Award by placement, and plan monthly collaborations and seasonal items as the update rhythm.',
      'Filter any player-typed text and make votes robust against alt-account collusion.',
    ],
    verification: ['Cast votes from one client twice and for self: only the first valid vote counts.', 'Apply a description with an unowned id: refused.'],
    failureModes: ['Votes are tallied on the client.', 'Unfiltered player names or text reach the runway.'] },

  // Researched 2026-10-04 (research/roblox/10-from-scratch-playbook.md, 01-viral-hits.md): from idea to publish-ready game.
  // Gate numbers labelled "Synthesis" in the notes are starting points to calibrate, not Roblox rules.
  { id: 'design-one-line-idea-to-brief', title: 'Turn a one-line idea into a game brief before building', domain: 'game_design', summary: 'Never place parts until a brief names the loop, hook, platform, scope tier and kill criteria.', refs: ['gdCoreLoops'], keywords: ['brief', 'idea', 'core loop', 'hook', 'scope', 'concept', 'pitch', 'plan'],
    steps: [
      'Restate the idea as one sentence with a player verb and a goal; name the nearest proven genre and two reference games whose mechanics are borrowed.',
      'Write the core loop in three parts: minute-to-minute action, most repeated action set, progression engine. Reject a loop with no progression engine.',
      'Write the hook: one visual or mechanical twist a viewer grasps in 10 seconds and that is not a re-skin of the references.',
      'Add the social mechanic, fixed scope tier, content maturity target (aim for Minimal or Mild), 2 to 3 monetisation hypotheses and 3 success metrics (D1 band, average session, onboarding completion).',
      'Keep a cut list longer than the build list; the first four post-launch updates come from it.',
    ],
    verification: ['The pitch makes sense to a 10 year old and contains a verb the player performs.', 'The loop has all three parts, one differentiator and a policy pre-check with no playable gambling.'],
    failureModes: ['A hook that needs bespoke animation or meshes the tooling cannot deliver.', 'It is unclear whether the game is solo or multiplayer.'] },
  { id: 'design-concept-scorecard', title: 'Score a concept 0 to 2 on ten hit-game criteria', domain: 'game_design', summary: 'Decide whether a concept is worth building by scoring ten criteria and building only high scorers.', refs: ['gdDesignForRoblox'], keywords: ['scorecard', 'concept', 'validation', 'viral', 'checklist', 'go no go', 'idea'],
    steps: [
      'Score 0 to 2 each: one-sentence loop, shareable 5-second clip, social conflict (raid, vote, co-op), offline or passive progress, a status item others can see.',
      'Score also: weekly event hook, servers of 4 to 8 (20 to 30 only for co-op, horror, roleplay), trend relevance, legal clarity of any IP, retention beyond day 1.',
      'Build only concepts scoring 14 or more of 20; below that, change the hook and rescore.',
      'Deliver a playable vertical slice in 3 to 7 days; one hit v1 took about three days.',
    ],
    verification: ['Each criterion has a written one-line justification, not only a number.', 'The decision (build, rework, kill) is recorded with the total.'],
    failureModes: ['Scoring after building, so the score justifies sunk cost.', 'Using a trend or IP the owner has not licensed.'] },
  { id: 'design-scope-tiers-and-cut-list', title: 'Set a scope tier and a cut list that is tall before fat', domain: 'game_design', summary: 'Fix what version 1 contains: loop, save and progression first, extras on a dated update list.', refs: ['gdPrototyping'], keywords: ['scope', 'tier', 'cut list', 'mvp', 'feature creep', 'backlog', 'updates'],
    steps: [
      'List every feature the idea implies and tag each tall (loop, save, progression, controls) or fat (extra models, cosmetics, extra zones).',
      'Choose the tier: S is one map, one loop, 3 upgrades (1 to 3 days); M is 3 zones, a store and a daily reward (1 to 2 weeks); default to S for the first publish.',
      'Build tall first; cap fat items so total work fits the tier.',
      'Move everything else to a dated update list with each item under three weeks of effort.',
      'If a phase runs 50 percent over, cut a fat feature instead of moving the date.',
    ],
    verification: ['Every item is tagged and the list shows build, cut and later.', 'No unfinished feature is visible to players as coming-soon clutter.'],
    failureModes: ['Adding a feature because another game has it.', 'Systems added before the loop proves fun.'] },
  { id: 'design-greybox-prototype-keep-or-kill', title: 'Prove the core loop in a greybox with a keep or kill gate', domain: 'game_design', summary: 'Plain parts, no progression, art or store; test one question, then keep, change once, or kill.', refs: ['gdPrototyping'], keywords: ['prototype', 'greybox', 'playtest', 'kill', 'gate', 'core loop', 'fun'],
    steps: [
      'State the question to answer (for example whether dragging items to a delivery pad is fun for 5 minutes).',
      'Build with default parts and one script driving the loop; expose timing and rates as config values so they can change live.',
      'Playtest yourself, then with 2 to 4 simulated clients, then 3 fresh testers with no instructions; watch, do not explain.',
      'Write a 10 to 20 line report with keep, change or kill. Core-loop gate: 3 of 5 fresh testers reach the second loop iteration unaided and would play again (synthesis).',
      'On change allow one more round only; on keep freeze the loop and move on.',
    ],
    verification: ['The report names what was tested and the decision.', 'A fresh tester completes a loop without help, or the concept is reworked.'],
    failureModes: ['Polishing before the gate, or iterating without limit.', 'Mistaking novelty for fun; retest the same player after 24 hours.'] },
  { id: 'design-vertical-slice-first-minute', title: 'Build a vertical slice with a scripted first 60 seconds', domain: 'game_design', summary: 'One zone at final quality whose first minute guides a stranger from spawn to first reward and a visible next goal.', refs: ['gdOnboardingTechniques'], keywords: ['vertical slice', 'first minute', 'onboarding', 'timed hint', 'funnel', 'thumbnail', 'final quality'],
    steps: [
      'Pick the most representative zone or round and build it at final lighting, palette, materials, UI, audio and effects.',
      'Spawn near the first interaction, lead with a glowing trail or arrow, give the first reward inside about 30 s and show the next goal.',
      'Log 4 to 6 funnel steps (Spawned, First Interaction, First Reward, First Upgrade, Second Loop) from the server.',
      'Add a timed hint just after the median completion time observed, shown once per task; allow at most two tutorial popups.',
      'Capture an icon-quality screenshot and 3 thumbnail candidates from the slice.',
    ],
    verification: ['A stranger understands what to do without text in under 30 s (watch, do not explain).', 'The slice holds 60 FPS on the phone profile with 8 simulated clients.'],
    failureModes: ['Long text tutorials or all mechanics taught at once.', 'Hints that appear before most players finished.'] },
  { id: 'design-economy-tuning-pass', title: 'Tune sources, sinks and event rewards from one config', domain: 'game_design', summary: 'List every currency source and sink, compute expected values, and prove no free-currency loop exists.', refs: ['gdEconomy'], keywords: ['economy', 'tuning', 'sources', 'sinks', 'expected value', 'event currency', 'faucet', 'config'],
    steps: [
      'Table each currency: sources per minute at each stage, sinks (store, upgrades, rebirth, event store) and target time to the next unlock (shorter early).',
      'Compute expected value for any random drop (sum of value times probability) and compare event with baseline.',
      'Put every number in one config module and add a debug command that simulates 10 minutes of play and prints currency over time.',
      'Give events their own currency and store with sources and sinks of equal size.',
      'After launch log economy events and A/B test price points with Experiments or separate product ids.',
    ],
    verification: ['The simulation shows a sink for every faucet and no infinite free-currency cycle.', 'Event expected value stays within the planned multiple of the baseline.'],
    failureModes: ['Unbounded faucets, or event rewards flooding the main currency.', 'Prices copied from another game without testing.'] },
  { id: 'design-economy-balance-and-event-model', title: 'Check rebirth cycles and model events before shipping', domain: 'game_design', summary: 'Use cycle length cost over income to catch runaway curves, then model event surplus.', refs: ['gdEconomy'], keywords: ['rebirth', 'prestige', 'cost curve', 'cycle length', 'inflation', 'event model', 'balance'],
    steps: [
      'Write income(t) and cost(r) per stage; cycle length is T(r) = cost(r) / income(r); plot it (Desmos or a script).',
      'Targets (guide heuristics): first rebirth 15 to 30 min, later cycles up to 30 to 60 min.',
      'If cost grows by R per step and income grows slower, cycles stretch without bound (derived: at r = 10 a 2.5x cost is 9,537x the base but a +0.5 multiplier only 6x). Lower R to 1.4 to 1.5, halve R at breakpoints, or let rebirth unlock stronger earners.',
      'For random rewards compute expected value per action; the docs fishing example gives 14 per cast.',
      'Model a limited event before launch: a rare reward with a tiny chance can flood currency and depress spending afterwards.',
    ],
    verification: ['T(r) is finite and gently rising for r = 1 to the planned maximum.', 'Event surplus after the window stays inside the planned range.'],
    failureModes: ['Tuning from feel instead of numbers.', 'A multiplier that grows linearly against geometric costs.'] },
  { id: 'design-retention-ladder-d1-d7-d28', title: 'Design reasons to return for day 1, days 2 to 7 and days 8 to 28', domain: 'game_design', summary: 'Plan content for the three windows the recommendation system now scores separately.', refs: ['anRetention'], keywords: ['retention', 'day 1', 'day 7', 'day 28', 'daily reward', 'quest', 'return', 'discovery'],
    steps: [
      'Day 1: finish onboarding and set a visible come-back-tomorrow reward (a daily gift at the next UTC day).',
      'Days 2 to 7: an escalating daily streak, one 3-day quest chain, a timer reward that completes offline, and a friend goal.',
      'Days 8 to 28: two unlockable zones or tiers (about day 3, 7, 14, 21 as a starting rhythm), a collection index, a weekly event, a rebirth loop and weekly-reset boards.',
      'Add a weekly content drop or limited item so lapsed players have a reason to return.',
      'Playtime counts only up to 60 minutes a day for ranking, so design repeat days, not one marathon.',
    ],
    verification: ['Each window lists at least two distinct reasons to return in the build.', 'D1, D7 and D30 are read in the Retention page by weekly cohort.'],
    failureModes: ['All rewards front-loaded on day 1.', 'Streak punishments that cause churn, or no content past hour 3.'] },
  { id: 'design-first-minutes-onboarding-timeline', title: 'Script the first five minutes of any genre', domain: 'game_design', summary: 'A timeline from spawn to a minute-5 milestone that lowers first-play bounce.', refs: ['gdOnboarding'], keywords: ['onboarding', 'ftue', 'first five minutes', 'bounce', 'tutorial', 'starter currency', 'goals'],
    steps: [
      'Place the SpawnLocation within 20 studs of the first interactable so the player acts inside 10 s; controls must work without tutorial text.',
      'Give starter currency so the first upgrade is affordable within 30 to 60 s; expose it as a tunable value.',
      'Teach with visuals: a highlighted button or arrow and a caption of about 6 words, plus one timed hint about 10 to 11 s idle, shown once per task.',
      'Show three goals (this session, days, months) and a second loop with a bigger reward by 60 to 180 s; make early level thresholds tiny.',
      'Close at minute 3 to 5 with a celebration (new area, first rebirth preview) and log each step as a funnel event.',
    ],
    verification: ['Time a fresh run: first action under 10 s, first purchase under 60 s.', 'Funnel logging shows each step firing once in order.'],
    failureModes: ['Walls of tutorial text, forced walking before the first reward, or a sale prompt on the first load.', 'Hints that fire before players try on their own.'] },

  // Researched 2026-10-04 (research/roblox/02-discovery-growth.md): discovery, retention and live-ops hooks.
  // Dashboard and Ads Manager steps belong to the owner; these skills build the in-game side and say what to tell the owner.
  { id: 'growth-discovery-ready-game-page', title: 'Prepare a discovery-ready game page: title, icon, thumbnails, video', domain: 'game_design', summary: 'Honest metadata and real-gameplay assets that match the game; the owner uploads them in Creator Hub.', refs: ['pubThumbnails'], keywords: ['thumbnail', 'icon', 'title', 'description', 'video', 'metadata', 'publish', 'discovery'],
    steps: [
      'Title of 2 to 4 words naming the genre plus a hook, no reward or free wording; first description sentence says what the player does, then 2 to 3 genre keywords.',
      'Capture 5 real gameplay frames at 1920x1080 (hero action, reward moment, social shot, new content, alternate angle); bold subject, readable at 25 percent size, at most 3 words of text.',
      'Icon: author at 1024x1024, deliver 512x512 minimum, one subject, check it at 150x150.',
      'Tell the owner to upload 2 to 5 thumbnails (16:9, under 3 MB for home-page use) and mark at least 2 active so personalisation runs; keep the best performer active.',
      'Video: a 15 to 30 s real gameplay clip showing the loop in the first seconds, no narration, lyrics or overlay text; 3 uploads a month, about 24 h review.',
    ],
    verification: ['Every asset shows gameplay the build really delivers; none is stock art or a copied key art.', 'Title, description and thumbnails contain no giveaway or money bait.'],
    failureModes: ['Misleading or text-heavy thumbnails, or deleting the winning one.', 'A cinematic trailer instead of real gameplay.'] },
  { id: 'growth-invite-prompt-referral-reward', title: 'Add a friend invite prompt with a one-time referral reward', domain: 'client_server', summary: 'Invite button on the client, join handling on the server, and a reward that pays each invitee once.', refs: ['invitePrompts'], keywords: ['invite', 'referral', 'friends', 'social', 'GetJoinData', 'ReferredByPlayerId', 'LaunchData', 'co-play'],
    steps: [
      'A client button calls SocialService:CanSendGameInviteAsync in a pcall, then PromptGameInvite with ExperienceInviteOptions (PromptMessage, optional LaunchData up to 200 characters).',
      'On PlayerAdded read player:GetJoinData().ReferredByPlayerId (0 when not referred). Retry once after a short delay for invite LaunchData.',
      'Grant the invitee a welcome bonus and the inviter a reward, and record the grant keyed by invitee UserId in a DataStore so each invitee pays once. Store a pending grant if the inviter is offline.',
      'Cap rewards per inviter (for example 3 to 5) with a cooldown; paid items cannot be referral rewards.',
      'Tell the owner to create the Referral Rewards entry in Creator Hub (icon, name, dates, limit); co-play sessions ran about 1.9x longer than solo ones.',
    ],
    verification: ['Join with a second account via the invite link: both grants appear once.', 'Rejoin the invitee: no second payout.'],
    failureModes: ['The reward is granted on every join, or uses a purchasable item.', 'The invite call is made without CanSendGameInviteAsync or not in a pcall.'] },
  { id: 'growth-notification-opt-in', title: 'Ask for notification opt-in at a good moment and send sparingly', domain: 'client_server', summary: 'Prompt after a positive moment, never gate play, and send at most one useful message a day.', refs: ['experienceNotifications'], keywords: ['notifications', 'opt in', 're-engagement', 'push', 'timer', 'ExperienceNotificationService', 'createUserNotification'],
    steps: [
      'After a positive moment (first reward claimed, milestone) call ExperienceNotificationService:CanPromptOptInAsync in a pcall, then PromptOptIn from a LocalScript.',
      'The prompt is not shown to under-13s, opted-in users or within 30 days of the last prompt; the experience needs 100+ visits.',
      'Create notification strings (up to 99 characters) in Creator Dashboard; the owner creates an Open Cloud key for createUserNotification and it stays out of game scripts.',
      'Send from a trusted backend when a timer completes or a friend acts, at most one per user per day, with LaunchData that lands the player in the right place.',
    ],
    verification: ['Decline the prompt: gameplay is unaffected and it is not shown again too soon.', 'A second message the same day is not sent.'],
    failureModes: ['Prompting at first join or blocking play until opt-in.', 'False urgency, or sending to users who did not opt in.'] },
  { id: 'growth-analytics-funnel-logging', title: 'Log onboarding, economy and progression events from the server', domain: 'data', summary: 'Server-side AnalyticsService calls that show where players drop off; they fire only in published games.', refs: ['anFunnelEvents'], keywords: ['analytics', 'funnel', 'AnalyticsService', 'LogOnboardingFunnelStepEvent', 'LogEconomyEvent', 'drop-off', 'events'],
    steps: [
      'From a server script call AnalyticsService:LogOnboardingFunnelStepEvent(player, step, name) with sequential steps (1 Spawned, 2 First Reward, ...); skipped steps auto-complete earlier ones and repeats count once.',
      'Wrap a small Analytics module so every call site is one line and the player is always validated first.',
      'Add LogEconomyEvent for sources and sinks, LogProgressionStartEvent and LogProgressionCompleteEvent for levels and zones, LogCustomEvent(player, name, value) for the rest. The Fire* methods are deprecated.',
      'Never let the client trigger a log call directly; validate on the server so junk steps cannot be injected.',
      'Events do not fire in Studio or from the client, so verify after publishing to a private place.',
    ],
    verification: ['Run the first minute in a published test place and read the funnel in Creator Analytics.', 'Confirm no client script references AnalyticsService.'],
    failureModes: ['Logging from the client, or expecting events in a Studio test.', 'Out-of-order step numbers that hide the real drop-off.'] },
  { id: 'growth-teleport-source-tracking', title: 'Cross-promote between places and validate where players came from', domain: 'client_server', summary: 'A menu or portal between your games that teleports with data and trusts arrival data only after checking its source.', refs: ['teleportService'], keywords: ['teleport', 'cross promotion', 'TeleportAsync', 'SetTeleportData', 'SourcePlaceId', 'portal', 'hub'],
    steps: [
      'From a server script call TeleportService:TeleportAsync(placeId, {player}, options) with a TeleportOptions whose SetTeleportData carries non-secret data such as { from = "hub" }.',
      'On arrival read player:GetJoinData() and check SourcePlaceId against your own place ids before trusting TeleportData.',
      'Grant a small welcome bonus keyed by source, once per player.',
      'Treat teleport data as client-visible and spoofable: never carry currency or permissions in it.',
      'Handle TeleportInitFailed with retry and backoff and do not teleport a player mid-purchase; track Teleport as an acquisition source and compare its retention.',
    ],
    verification: ['Arrive from an unknown place id: no bonus is granted.', 'Force a failed teleport: the player is returned to a usable state.'],
    failureModes: ['Trusting teleport data from any source.', 'Teleporting while a purchase is pending.'] },
  { id: 'growth-clip-worthy-moments', title: 'Design two or three moments worth recording and sharing', domain: 'game_design', summary: 'Build rare drops, near misses or dramatic results that read in a short vertical clip, with a share path.', refs: ['shareLinks'], keywords: ['share', 'clip', 'video', 'social', 'moment', 'capture', 'streamer', 'viral'],
    steps: [
      'Pick 2 to 3 moments: a rare drop with a jackpot reveal, a dramatic near miss, a visible raid or boss result; each must be understandable in a 15 to 20 s vertical clip.',
      'Make the moment visible to other players too (rarity shown on the item, announcement to the server), not only to the winner.',
      'Offer a capture prompt at the moment through the Captures API (CaptureService) and show the game name clearly in frame without clutter.',
      'Put a share or invite button right after the moment.',
      'Tell the owner to track traffic in Share Links and the Other source, and to avoid clips that promise things the game lacks.',
    ],
    verification: ['Record the moment once on a phone-size viewport: the subject is readable and the game name visible.', 'The share button works without interrupting the next loop.'],
    failureModes: ['Moments only the player can see.', 'Clutter in the frame or claims the game cannot keep.'] },
  { id: 'liveops-events-and-updates-calendar', title: 'Plan the event and update calendar with Creator Hub events', domain: 'game_design', summary: 'One visible beat every 1 to 2 weeks, a themed event every 4 to 6, and in-game handling of the event join context.', refs: ['experienceEvents'], keywords: ['events', 'updates', 'calendar', 'GameJoinContext', 'RSVP', 'featuring', 'announcement', 'cadence'],
    steps: [
      'Schedule one visible beat per 1 to 2 weeks (a small update) and a themed event with a limited item every 4 to 6 weeks.',
      'Tell the owner to create the event in Creator Dashboard (title, subtitle, description, category, start and end, spawn place, 1 to 5 distinct thumbnails, public); up to 10 ongoing or upcoming events per experience.',
      'Keep update announcements to one per 3 days and 60 characters, about the feature itself; submit for featuring at least 7 days before an important event.',
      'In code read player:GetJoinData().GameJoinContext guarded for a table with EventId and show an event welcome panel or bonus.',
      'Post a short clip and community message 24 to 72 hours ahead; no event may require a purchase.',
    ],
    verification: ['Join with and without an event id: the panel shows only with one and nothing errors.', 'Each event has its own thumbnail and a dated entry on the calendar.'],
    failureModes: ['Events with no unique thumbnail or vague text.', 'Updates that break progression and spike bounce.'] },
  { id: 'liveops-season-and-cadence-plan', title: 'Plan a season with a pass, event currency and a content cadence', domain: 'game_design', summary: 'A one-month season of ten tiers with free daily missions, plus art-first content drops every two to four weeks.', refs: ['gdLiveOps'], keywords: ['season', 'battle pass', 'cadence', 'live ops', 'content update', 'collab', 'event currency', 'update party'],
    steps: [
      'Season: about one month, ten tiers to start, a one-week rest, a manual claim button, a final reward retired afterwards, daily missions that never need hard currency and a catch-up bonus in the last week.',
      'Cadence: a content drop every 2 to 4 weeks, each under 3 weeks of effort and mostly art variants of existing systems (colours, rides, maps); extend systems rather than build new ones.',
      'Events: limited time with their own currency and store, a themed map or mode and a prestige item; show a countdown in the interface.',
      'Run a short live session with players before a big update, and show a visible last-updated signal.',
    ],
    verification: ['Every mission can be done without Robux and every tier shows its reward before claiming.', 'The calendar shows the next three drops with effort estimates under three weeks.'],
    failureModes: ['One giant event with no calendar behind it.', 'Seasonal items that can never be obtained again without a trade market.'] },
  { id: 'liveops-scheduled-event-broadcast', title: 'Schedule live events and start them on every server together', domain: 'client_server', summary: 'A UTC event table checked on a timer, attributes for clients, and MessagingService for cross-server moments.', refs: ['messaging'], keywords: ['event', 'scheduler', 'live event', 'MessagingService', 'cross server', 'attribute', 'boss', 'drop'],
    steps: [
      'Keep an Events ModuleScript with name, startsAt (UTC), duration, rewards and flags. A server loop checks os.time() about every 10 s and sets a Workspace attribute ActiveEvent; clients react through GetAttributeChangedSignal.',
      'For a moment that must fire everywhere, publish an id and startsAt with MessagingService in a pcall; subscribe once at server start and store the connection.',
      'De-duplicate by event id, validate message shape, and keep messages under 1 KB (topic up to 80 characters; budgets are per minute and per server).',
      'Delivery is best effort: re-derive state from the schedule, never from a message. Keep events cosmetic-first so they cannot break the economy, and load-test the expected peak.',
    ],
    verification: ['Start two servers: both flip ActiveEvent within a few seconds of startsAt.', 'Deliver the same message twice: the event starts once.'],
    failureModes: ['Treating a message as the source of truth.', 'Subscribing per player or ignoring rate limits.'] },
  { id: 'liveops-synchronised-live-spectacle', title: 'Run a synchronised live spectacle on a server clock', domain: 'game_design', summary: 'A stage, a pre-recorded or scripted show timed to a shared clock, and a limited collectible for attendees.', refs: ['gdLiveOps'], keywords: ['concert', 'spectacle', 'live event', 'cutscene', 'collab', 'stage', 'synchronised', 'collectible'],
    steps: [
      'Build a light stage model and a timed cutscene or show script driven by one server start time so everyone sees the same moment together.',
      'Keep the show short (a record-setting concert ran under 8 minutes) and the stage light enough for phones.',
      'Give attendees a limited collectible once, recorded in data; rehearse at the expected capacity and plan a livestream or clip alongside.',
      'Tell the owner that licensed artists or brands need a Roblox partnership and registration where the advertising policy applies.',
    ],
    verification: ['Join late: the show state matches the server clock, not zero.', 'Claim the collectible twice: one grant only.'],
    failureModes: ['Per-client timers drift so the moment is not shared.', 'A heavy stage drops frame rate on phones.'] },
  { id: 'gameplay-daily-streak-and-codes', title: 'Add a daily reward streak and redeemable codes safely', domain: 'gameplay', summary: 'A UTC day streak with a 7 day ladder, short daily quests and server-checked one-time codes.', refs: ['saveData'], keywords: ['daily reward', 'streak', 'codes', 'redeem', 'daily quest', 'retention', 'utc'],
    steps: [
      'Store lastClaimDay (floor(os.time() / 86400)) and streak with the player data. On join: same day is already claimed, next day adds 1, anything later resets to 1 (or softens to a lower tier); write lastClaimDay before granting, and an optional shields counter can forgive one missed day.',
      'A 7 day ladder is a heuristic: small soft currency on days 1 to 6, a rare roll, luck potion or cosmetic on day 7. Show a claim badge on the main button.',
      'Daily quests: 3 per day tagged easy, medium, hard, short, soft-currency rewards that never need Robux, reset at UTC midnight.',
      'Codes: a server table of { reward, expiresAt }, one redemption per player recorded in a DataStore, rotated with updates.',
      'Use server time only; never trust a client-provided time or code result.',
    ],
    verification: ['Claim twice in a day, on consecutive days and after a gap: streak is 1, +1 and 1.', 'Redeem a code twice and an expired code: refused.'],
    failureModes: ['Client time or local midnight decides the reset.', 'Reward inflation with no sink behind it.'] },
  { id: 'architecture-project-scaffold-config-data-analytics', title: 'Scaffold a project with config, data, analytics and remotes', domain: 'client_server', summary: 'A folder layout and four services every later system plugs into, tested in one clean session.', refs: ['scriptLocations'], keywords: ['scaffold', 'project structure', 'config', 'service', 'module script', 'folder layout', 'setup'],
    steps: [
      'Layout: ReplicatedStorage/Shared (config, types), ReplicatedStorage/Remotes, ServerScriptService/Services (one ModuleScript per concern), StarterPlayerScripts/Controllers, Workspace/Map with tagged zones.',
      'One Config module returns every balance number (prices, rates, multipliers, timers); no tunable is hard-coded in a service. Keep secret numbers in ServerStorage.',
      'Data service: GetDataStore, load on PlayerAdded with pcall and retries, version field and defaults, autosave about every 180 s, save on PlayerRemoving, game:BindToClose saves the rest.',
      'Analytics module wrapping the server-only funnel calls; Remotes folder created by the server with every OnServerEvent validating types and ranges.',
      'Spawn, camera and a placeholder map, then run Test and Server and Clients (F7) with an empty Output.',
    ],
    verification: ['A 10 minute session leaves Output free of errors and warnings.', 'Search the scripts: no tunable literal outside Config and no currency written by a LocalScript.'],
    failureModes: ['Game logic in LocalScripts the client can falsify.', 'Analytics checked in Studio, where events do not fire.'] },
  { id: 'playtest-studio-modes-and-simulators', title: 'Test with Studio modes and simulators in a fixed order', domain: 'game_design', summary: 'F5 for logic, Server and Clients for replication, Device and Network simulators, then the profiler.', refs: ['testingModes'], keywords: ['playtest', 'test mode', 'server and clients', 'device simulator', 'network simulator', 'controller emulator', 'multiplayer'],
    steps: [
      'Test (F5) solo and walk the first-minute flow; Output is colour-coded (blue client, green server) and the viewport border toggles between Client and Server views.',
      'Server and Clients (F7) with 2 to 3 clients (up to 8): check replication, boards, and that a second client sees the first client actions; find objects that exist on one side only.',
      'Network Simulator: add latency, jitter and packet loss; input must stay responsive and no remote spam appears.',
      'Device Simulator on a phone profile (layout and touch only, not CPU or GPU speed), Controller Emulator for gamepad, Player Emulator for a non-English locale and regional policy.',
      'Stop with Shift+F5 to restore the pre-test state; Team Test allows one session at a time.',
    ],
    verification: ['Every error in Output is read as client or server and fixed before the next mode.', 'A second client sees every effect the first one caused.'],
    failureModes: ['Only testing as a single player.', 'Treating the Device Simulator as proof of phone performance.'] },
  { id: 'playtest-qa-failure-injection', title: 'Run a QA pass with failure injection before every update', domain: 'game_design', summary: 'Break the game on purpose: rejoin during a save, leave mid-purchase, spam remotes, shut a server down mid-save.', refs: ['gdPrototyping'], keywords: ['qa', 'failure injection', 'break it', 'bug bash', 'hardening', 'save', 'rejoin', 'checklist'],
    steps: [
      'Test solo, then Server and Clients with 8 clients; toggle client and server views to see authority bugs.',
      'Failure injection: stop the server mid-save, rejoin quickly, make a DataStore call fail (pcall plus a simulated error), leave during a purchase, spam remotes.',
      'Device Simulator on a small phone, a large phone and a tablet; Controller Emulator; Network Simulator with latency and packet loss.',
      'Publish gate: Output clean for 10 minutes; new, returning and failed-load players handled; each product grants once and survives rejoin; no exploit path to free currency in the first 5 minutes.',
      'Keep a QA log of tests run and fixes made.',
    ],
    verification: ['The log lists each injected failure with its observed result.', 'Memory is stable after 10 minutes with no leak growth.'],
    failureModes: ['Ignoring the 60 FPS phone target.', 'Trusting analytics that only fire in published games.'] },
  { id: 'playtest-agent-self-run-loop', title: 'Let the agent playtest each phase against the written brief', domain: 'game_design', summary: 'Start play, follow the first-minute script with real input, read the console, stop, repeat from a fresh state.', refs: ['testingModes'], keywords: ['self playtest', 'play check', 'screenshot', 'console', 'automation', 'agent loop', 'verify'],
    steps: [
      'Start play and capture a screenshot of the first frame.',
      'Drive input to follow the first-minute script and record whether the first reward and next goal appear within the time budget.',
      'Read the console output after the run and fix errors before anything else.',
      'Stop play and repeat from a fresh state to check save and load.',
      'Ask the owner (or Trusted Friends) for a human run at each gate; scripted runs do not replace watching new players.',
    ],
    verification: ['The report states times to first reward and goal and the console result.', 'A second run from a fresh state reproduces them.'],
    failureModes: ['Treating a passing scripted run as proof the game is fun.', 'Moving navigation shortcuts into the test so real controls are never exercised.'] },
  { id: 'publish-package-settings-copy-art-audience', title: 'Assemble the publish package and tell the owner the human steps', domain: 'game_design', summary: 'Settings, copy, art and a maturity record, with the owner doing age check, verification and visibility changes.', refs: ['pubPublish'], keywords: ['publish', 'launch', 'settings', 'questionnaire', 'audience', 'visibility', 'private', 'limited'],
    steps: [
      'File > Publish to Roblox keeps a new experience Private; set name, description, genre, devices, max players per server (match the design) and start place.',
      'Name is genre-obvious without money bait or copied titles; description is a premise sentence, 3 features, controls and an update note.',
      'Icon 512x512 minimum, legible at 150x150; 3 to 10 thumbnails at 1920x1080 of real gameplay, key content away from the bottom edge.',
      'Answer the maturity questionnaire from the real content; retake it whenever an update changes an answer.',
      'Tell the owner: age check, two-step verification, Plus for 2 months or the 1,000 Robux per-game fee (refunded after eligibility), then the evaluation; new games start with 16+ and Trusted Friends only (live Audience Reach page has current numbers).',
      'Use Limited visibility for the beta, Public after the beta gate; note Version History for rollback.',
    ],
    verification: ['Title, thumbnails and description show the real game and contain no giveaway wording.', 'The owner checklist lists each human step with where to do it.'],
    failureModes: ['Assuming an approved questionnaire means all-ages reach.', 'Forgetting to retake the questionnaire after content changes.'] },
  { id: 'publish-beta-and-metrics-review', title: 'Run a closed and open beta and review first-session metrics', domain: 'game_design', summary: 'Structured early tests, a funnel read, and a proceed, iterate or pivot decision based on behaviour.', refs: ['anRetention'], keywords: ['beta', 'metrics', 'retention', 'funnel', 'drop-off', 'like ratio', 'open test', 'review'],
    steps: [
      'Closed beta through Trusted Friends or a group role: 5 to 20 players, one structured session each, an in-game feedback prompt and a community channel; observe without coaching.',
      'Then a weekend open test once clean; capture D1, average session, onboarding completion and qualified play-through.',
      'Plot the onboarding funnel and fix the largest drop-off first; sort the fix list by drop-off size, not opinion.',
      'Gate (synthesis, calibrate): no data-loss bug, no unvalidated remote, no error loop, like ratio at least 80 percent, onboarding completion about 70 percent or more.',
      'Benchmarks: a 2026 third-party study of 500+ large games gives median D1 10.3 percent (p75 12.9, p90 15.9), D7 1.6, D30 0.5; compare with the Creator Dashboard genre benchmark and treat all as directional.',
    ],
    verification: ['A one-page review lists D1 and D7 by cohort, average session, completion and top 3 drop-offs.', 'The decision (public, iterate a week, pivot the hook) is written down.'],
    failureModes: ['Judging after fewer than 50 new users or reading D7 before seven days.', 'Reacting to opinion instead of behaviour.'] },
  { id: 'liveops-weekly-update-cycle', title: 'Release a weekly update that moves one metric', domain: 'game_design', summary: 'Pick one metric and one theme, release art-first content, release on a fixed day, then read the cohort.', refs: ['gdContentUpdates'], keywords: ['update', 'weekly', 'cadence', 'release', 'hypothesis', 'migration', 'rollback'],
    steps: [
      'Pick one metric (D1, D7, D30, ARPPU, conversion) and one content theme for the update.',
      'Prefer art-based content (items, variants, a zone reskin) so effort stays under three weeks.',
      'Test in Server and Clients and a Limited copy of the place; check whether any questionnaire answer changed and review Version History for rollback.',
      'A schema change needs a data migration with a version bump so saves are not broken.',
      'Release on a fixed day; next week read the cohort (the explore phase) and decide to expand or revert.',
    ],
    verification: ['The update note states the metric and the hypothesis.', 'Old saves load under the new schema in a test.'],
    failureModes: ['Unannounced big changes, or quality falling because cadence is too aggressive.', 'Breaking saves with an unversioned schema change.'] },
  { id: 'monetize-game-pass-server-perks', title: 'Grant game pass perks on the server and show live prices', domain: 'game_design', summary: 'Pass ids in config, ownership checked in a pcall and cached per player, perks applied on the server, price read from product info.', refs: ['prodPasses'], keywords: ['game pass', 'perk', 'vip', 'UserOwnsGamePassAsync', 'PromptGamePassPurchase', 'monetization', 'price'],
    steps: [
      'The owner creates the pass in Creator Hub (icon at most 512x512, price 1 to 1 billion Robux); keep ids in a MonetizationConfig module.',
      'On PlayerAdded call UserOwnsGamePassAsync in a pcall, cache by UserId and apply the perk on the server; perks are not granted automatically.',
      'The client calls PromptGamePassPurchase; in PromptGamePassPurchaseFinished(player, passId, wasPurchased) apply the perk if wasPurchased, then re-verify with UserOwnsGamePassAsync.',
      'Show the price from GetProductInfo(passId, Enum.InfoType.GamePass).PriceInRobux, never a typed number; promoted passes must cost 50 to 800 Robux.',
      'Creators earn 70 percent of in-experience sales; cross-experience pass sales ended in May 2026.',
    ],
    verification: ['Buy in a test account, rejoin: the perk is applied once on both joins.', 'A client claim of ownership without a purchase is ignored.'],
    failureModes: ['Trusting a client claim of ownership.', 'A hard-coded price label that regional pricing makes wrong.'] },
  { id: 'monetize-developer-product-catalogue', title: 'Sell developer products from a server catalogue', domain: 'game_design', summary: 'Product ids and grants in one server table, prompted from the client, priced from live product info.', refs: ['prodDeveloperProducts'], keywords: ['developer product', 'consumable', 'receipt', 'PromptProductPurchase', 'ProcessReceipt', 'currency pack', 'boost'],
    steps: [
      'The owner creates each product in Creator Hub; keep ids and a grant function per id in one server module.',
      'Prompt with PromptProductPurchase(player, productId); read the label from GetProductInfo(id, Enum.InfoType.Product).',
      'Set MarketplaceService.ProcessReceipt exactly once in one server script; see the idempotent receipt skill for the handler. Do not grant from PromptProductPurchaseFinished.',
      'Roblox does not store purchase history, so record your own; paid random or limited-quantity products cannot be sold outside the experience.',
    ],
    verification: ['Buy each product once: exactly one grant, even after a quick rejoin.', 'Prompt from the client with a fake product id: nothing is granted.'],
    failureModes: ['Assigning ProcessReceipt twice or yielding without bound.', 'Treating a finished prompt as proof of payment.'] },
  { id: 'monetize-subscription-and-plus-prompt', title: 'Offer a monthly subscription and the Roblox Plus prompt', domain: 'game_design', summary: 'A recurring perk checked on join and on status change, plus the official Plus prompt used sparingly.', refs: ['subscriptions'], keywords: ['subscription', 'vip', 'recurring', 'GetUserSubscriptionStatusAsync', 'roblox plus', 'PromptSubscriptionPurchase', 'monthly'],
    steps: [
      'The owner creates a Robux subscription (from 49 Robux, up to 50 per experience) or a local-currency tier (2.99 to 14.99 USD, needs ID or phone verification).',
      'On the server call GetUserSubscriptionStatusAsync(player, subscriptionId) in a pcall; grant while IsSubscribed and revoke otherwise; re-check on Players.UserSubscriptionStatusChanged.',
      'The client calls PromptSubscriptionPurchase(player, subscriptionId); keep benefits identical across devices for the whole term.',
      'Player.HasRobloxSubscription is a read-only boolean for a small perk; the official prompt is MarketplaceService:PromptRobloxSubscriptionPurchase(player) from a client action, once per session; a new Plus subscriber pays the creator 250 Robux a month for 3 months.',
    ],
    verification: ['Subscribe, rejoin, then cancel in a test: the perk follows the status each time.', 'The Plus prompt appears at most once per session.'],
    failureModes: ['No revoke path, or perks that differ between devices.', 'Spamming the Plus prompt.'] },
  { id: 'monetize-rewarded-video-placement', title: 'Place a rewarded video at a natural break', domain: 'game_design', summary: 'An opt-in video for a modest developer-product reward, offered only when an ad is available and allowed.', refs: ['rewardedVideo'], keywords: ['rewarded video', 'ads', 'AdService', 'ShowRewardedVideoAdAsync', 'placement', 'reward', 'double reward'],
    steps: [
      'Tell the owner the eligibility: public unrestricted experience, 2,000+ unique monthly visitors, creator 13+ with ID and two-step verification, questionnaire done, no free-form creation or AI interaction.',
      'Create a developer product as the reward (not Robux, not random, worth about 3 to 10 Robux) and handle it in ProcessReceipt.',
      'Server: AdService:CreateAdRewardFromDevProductId(productId), then ShowRewardedVideoAdAsync(player, reward, placementId); a placementId gives per-placement reports.',
      'From a LocalScript call AdService:GetAdAvailabilityNowAsync(Enum.AdFormat.RewardedVideo) (it yields; hide the button when none) and check PolicyService AreAdsAllowed; place the button at a natural break and never gate core progression behind an ad.',
      'Only Enum.ShowAdResult.ShowCompleted counts as a finished view; ShowInterrupted gives no reward.',
    ],
    verification: ['With no ad available the button is hidden.', 'The reward arrives immediately after a completed view and only once.'],
    failureModes: ['Robux or random rewards, which are banned.', 'Showing the button to players where ads are not allowed.'] },
  { id: 'monetize-paid-random-odds-compliance', title: 'Gate paid random items with odds disclosure and region checks', domain: 'game_design', summary: 'Show every outcome as a percentage before purchase and route restricted players to an alternative.', refs: ['prodPaidRandom'], keywords: ['paid random items', 'loot box', 'odds', 'PolicyService', 'ArePaidRandomItemsRestricted', 'gacha', 'compliance', 'trading'],
    steps: [
      'Compute displayed percentages from the weights so they sum to 100 and recompute them live when a luck modifier is active.',
      'Show the odds before the buy button, including indirect purchases (keys, tickets); a long list needs a Details button, a bare info icon is not enough.',
      'On join call PolicyService:GetPolicyInfoForPlayerAsync(player) in a pcall; if ArePaidRandomItemsRestricted is true replace the button with a free path, a fixed-price purchase or hide it; if IsPaidItemTradingAllowed is false block trading of results.',
      'Every outcome must give some benefit; promoted passes cannot grant paid random items; declare it in the questionnaire.',
      'Affected regions listed in May 2026 include Australia, Belgium, the Netherlands, the United Kingdom and Brazil; read the live policy.',
    ],
    verification: ['Test with the Player Emulator set to a restricted region: the paid roll is replaced.', 'The shown odds equal the table used to roll.'],
    failureModes: ['Indirect currency used to hide the odds.', 'No deadline is published, which does not mean no enforcement.'] },
  { id: 'monetize-regional-price-safe-store', title: 'Keep a store safe under regional prices and gifting', domain: 'game_design', summary: 'Read every label live and compare price levels before allowing gifts or trades.', refs: ['regionalPricing'], keywords: ['regional pricing', 'price level', 'GetUsersPriceLevelsAsync', 'gifting', 'trading', 'managed pricing', 'labels'],
    steps: [
      'Read all labels from GetProductInfo or GetDeveloperProductsAsync; never hard-code Robux numbers in the interface.',
      'At join call GetUsersPriceLevelsAsync({player.UserId}) and do not cache it between sessions (level 1 to 1000, 1000 is full price).',
      'Allow gifting only from a higher level to a lower or equal one and require equal levels for trades.',
      'Regional prices are never below 30 percent of the default; tell the owner to opt items into Managed Pricing in Creator Hub and run its dynamic price check to find hard-coded prices.',
    ],
    verification: ['Change the emulated region: labels and gifting rules change without a code edit.', 'Search the interface scripts for numeric Robux literals: none.'],
    failureModes: ['Cached price levels carried across sessions.', 'Gifts from a lower level to a higher one used to farm discounts.'] },
  { id: 'monetize-private-server-product', title: 'Make a private server product worth buying', domain: 'game_design', summary: 'Owner tools and persistence that justify the price now that subscribers get one free server per game.', refs: ['prodPrivateServers'], keywords: ['private server', 'vip server', 'owner tools', 'admin commands', 'social', 'sandbox', 'persistence'],
    steps: [
      'The experience must be public; the owner sets a Robux price or free under Audience > Access Settings; it cannot coexist with paid access.',
      'Price changes are allowed every 60 days (30 days notice for increases); regional pricing applies automatically.',
      'Value is in persistent builds, custom rules and admin commands for the server owner, because from 2026-09-24 each Plus member gets one free private server per game and can buy extra ones at your price.',
      'Detect a reserved or private server by game.PrivateServerId and PrivateServerOwnerId and gate owner commands on the server by that owner id.',
    ],
    verification: ['Start a private server: only its owner sees and can run the owner tools.', 'Persistent data written there is restored on the next start.'],
    failureModes: ['Owner commands gated by a client flag.', 'Nothing in the private server differs from the public one.'] },
  { id: 'publish-maturity-safe-preflight', title: 'Run a maturity and policy preflight before every publish', domain: 'game_design', summary: 'Scan features against the questionnaire list, aim for the widest audience, and retake it after content changes.', refs: ['contentMaturity'], keywords: ['maturity', 'questionnaire', 'content rating', 'compliance', 'policy', 'age', 'moderation', 'preflight'],
    steps: [
      'List features against the questionnaire categories: violence, blood, fear, crude humour, unplayable gambling, strong language, romance, alcohol, social hangouts, free-form creation, sensitive issues, paid random items, trading, media, AI interaction.',
      'Aim for Minimal or Mild (unrealistic blood only, no chat-first hangout, no drawing boards); Moderate reaches Select and 16+; Restricted is 18+ only and its label cannot be lowered.',
      'No playable gambling, no Robux or items staked on chance, no off-platform links in chat, UI or descriptions.',
      'Tell the owner to complete the questionnaire in the Creator Dashboard, finish ID or age check and two-step verification, and appeal wrong decisions at roblox.com/report-appeals.',
      'Check that title, thumbnails and description match the label, and retake the questionnaire after any content change.',
    ],
    verification: ['Each feature has a recorded answer and the target label is stated.', 'No banned mechanic remains in scripts or interface text.'],
    failureModes: ['Unrated or wrongly rated experiences can be restricted.', 'Social hangout or free-form creation silently raising the minimum age.'] },
  { id: 'monetize-immersive-ad-billboard', title: 'Place an immersive ad billboard that stays eligible', domain: 'game_design', summary: 'An AdGui on an unobstructed part of the right size, hidden for players where ads are not allowed.', refs: ['immersiveAds'], keywords: ['ads', 'billboard', 'AdGui', 'immersive ad', 'portal ad', 'passive income', 'AreAdsAllowed'],
    steps: [
      'Same eligibility as rewarded video; tell the owner to confirm it in Creator Hub.',
      'Place a part 8 to 32 studs wide and 4.5 to 18 studs tall, unobstructed and facing the player route, and add an AdGui to it.',
      'For portal ads use the BasePortal package from the Creator Store; only scale, position and rotation may change.',
      'Hide ad units where PolicyService reports AreAdsAllowed is false; ineligible users see a fallback image.',
      'Payouts arrive on the 25th of the following month; never manipulate impressions.',
    ],
    verification: ['Walk the route in a test: the unit is visible and unobstructed.', 'With ads disallowed in the emulator the unit is hidden or shows the fallback.'],
    failureModes: ['Obstructed or wrongly sized units earn nothing.', 'Impression manipulation can cost Robux or suspend the account.'] },
  { id: 'publish-audio-and-ip-checklist', title: 'Check audio licensing and IP before using any asset', domain: 'game_design', summary: 'Use rights-cleared audio and original content, and record where every asset came from.', refs: ['toolbox'], keywords: ['audio', 'music', 'copyright', 'ip', 'licence', 'sound library', 'creator store', 'dmca'],
    steps: [
      'Use Creator Store audio or the Roblox Sound Library; avoid raw audio ids from unknown sources, and do not hard-code ids from memory.',
      'Never upload copyrighted tracks; uploads begin private and a private id from another creator stops working in your experience.',
      'Do not build the whole experience as a music player; an in-game boombox is fine.',
      'Do not copy brand IP, logos or characters without permission; crediting the owner is not a licence.',
      'Keep a record of every asset source in the project notes; Creator Store music is licensed for Roblox use only.',
    ],
    verification: ['Every audio and image id in the build is in the source record.', 'Test with the experience owner account that all private audio plays.'],
    failureModes: ['Assuming credit equals licence.', 'Relying on audio the owner does not have rights to.'] },

  // Researched 2026-10-04 (research/roblox/04-luau-architecture.md, 09-tools-ecosystem.md): engineering, data, security.
  // Limits and budgets are the documented numbers of that date; the skills tell the agent to read live budgets when it batches.
  { id: 'security-token-bucket-remote-handler', title: 'Harden a remote handler with validation and a token bucket', domain: 'security', summary: 'Rate-limit first, then type-check, clamp, look up server data, check context, mutate, and only then answer the client.', refs: ['clientBoundary'], keywords: ['remote', 'rate limit', 'token bucket', 'nan', 'validation', 'exploit', 'RemoteEvent', 'OnServerEvent'],
    steps: [
      'The server creates ReplicatedStorage/Remotes at boot, one RemoteEvent per action; item definitions live in ServerStorage/Config; the client sends only an item id string.',
      'Per player and per remote keep a token bucket: for example 10 per second burst 20 for action remotes, 2 per second for purchases or trades; clear it on PlayerRemoving.',
      'Type-check (string id of at most about 40 characters), require finite numbers (NaN passes every range check as type number), integer quantities from 1 to a cap, then look up the id in a server table.',
      'Check context (alive, near the store, funds) against server data, mutate server data, then FireClient the result. Never let a remote carry a price, damage, reward or another player data key.',
      'Do not use RemoteFunction from server to client, fire recurring remotes per frame (about 20 per second at most) or relay unvalidated data with FireAllClients.',
    ],
    verification: ['Fuzz nil, tables, NaN, infinity, huge strings and extreme quantities: every refusal leaves state unchanged.', 'Fire 1,000 calls in a second: only the bucket allowance is processed.'],
    failureModes: ['Validation happens after a partial mutation, or only on the client.', 'Bucket tables for departed players are never cleared.'] },
  { id: 'security-suspicion-score-ladder', title: 'Escalate abuse with a decaying suspicion score', domain: 'security', summary: 'Failed validations add weighted points that decay; thresholds climb from silent logging to enforcement.', refs: ['serverDetection'], keywords: ['anti cheat', 'suspicion', 'honeypot', 'detection', 'kick', 'ban', 'exploiter', 'false positive'],
    steps: [
      'Each failed validation or impossible rate adds weighted points per player, with a reason, in a server table cleared on leave.',
      'Decay the score on a timer (a sample subtracts 5 every 30 s) so honest lag spikes fade.',
      'Escalate in steps: silent log, drop or clamp the action, temporary restriction, then a kick (a sample kicks at 100); use the Ban API only for persistent offenders.',
      'Add honeypot remotes that no real client ever fires, and delay visible consequences so thresholds are not taught to exploiters.',
      'Heuristics: fastest possible completion time, maximum legitimate gain rate, suspiciously constant action cadence.',
    ],
    verification: ['A scripted client firing invalid calls reaches each step in order; a lagging honest client never does.', 'Scores are removed on PlayerRemoving.'],
    failureModes: ['Kicking on a single heuristic, causing false positives.', 'Immediate visible punishment that reveals the thresholds.'] },
  { id: 'data-profilestore-session-lock', title: 'Save player data with a session-locked profile store', domain: 'data', summary: 'One profile per player, a session lock so two servers never write at once, and data never exposed to the client.', refs: ['saveData'], keywords: ['profilestore', 'session lock', 'player data', 'save', 'profile', 'reconcile', 'datastore', 'load'],
    steps: [
      'Use the reviewed profile_store module (install_module) or a vetted ProfileStore ModuleScript under ServerScriptService; do not start on ProfileService or DataStore2.',
      'Define a TEMPLATE table (include ProcessedPurchases) and create the store once with ProfileStore.New("PlayerData", TEMPLATE).',
      'On PlayerAdded call StartSessionAsync with key Player_{UserId} and a Cancel callback that returns true when the player left; kick with a retry message when it returns nil.',
      'Then AddUserId, Reconcile, keep profiles[player], and on OnSessionEnd clear it and kick; EndSession on PlayerRemoving; loop Players:GetPlayers() at startup.',
      'Expose a get(player) function; never replicate Profile.Data itself, send copies. ProfileStore saves every profile on game close itself, so write no BindToClose loop for profiles; keep boards out of them.',
    ],
    verification: ['Join the same account from two test servers: the second waits or takes over and never writes concurrently.', 'Leave mid-load: the session ends and no profile leaks.'],
    failureModes: ['Players already in the server at script start are skipped.', 'Mock data or a changed key format reaches production.'] },
  { id: 'data-datastore-retry-updateasync', title: 'Use raw DataStores with retries and UpdateAsync', domain: 'data', summary: 'For small data without a library: retry transient errors with backoff, never write read-modify-write with SetAsync.', refs: ['dataStore'], keywords: ['datastore', 'retry', 'backoff', 'UpdateAsync', 'budget', 'throttle', 'BindToClose', 'error codes'],
    steps: [
      'Wrap every call in a retry helper: pcall, up to 5 attempts, wait 1 s plus jitter doubling to a 30 s cap; retry 301 to 306 and 502, 404, 501, 503 to 505; do not retry 101 to 107, 403 or 509.',
      'Read with GetAsync and change with UpdateAsync (the callback must not yield; returning nil cancels the write). One key per player such as User_{UserId}; static key names, at most 50 characters.',
      'Keep an in-memory copy, mutate it freely and autosave about every 180 s with random offsets; do not write on every collection event.',
      'game:BindToClose gets 30 s and bound functions run in parallel: save every cached player there.',
      'Budgets per minute are roughly 300 + 40 x players to read and 300 + 20 x players to write; read the live value with GetRequestBudgetForRequestType when batching. Studio needs API access enabled.',
    ],
    verification: ['Inject throttling errors: the helper retries then gives up cleanly and keeps the cache.', 'Shut the server down during a queued write: BindToClose still saves.'],
    failureModes: ['Yielding inside UpdateAsync or retrying validation errors.', 'Several writes per few seconds to one key from one server.'] },
  { id: 'data-idempotent-process-receipt', title: 'Grant developer products exactly once from ProcessReceipt', domain: 'data', summary: 'One handler, idempotent by PurchaseId stored in the saved profile, returning granted only after the grant is saved.', refs: ['marketplace'], keywords: ['ProcessReceipt', 'receipt', 'purchase', 'idempotent', 'PurchaseId', 'developer product', 'NotProcessedYet'],
    steps: [
      'Assign MarketplaceService.ProcessReceipt once, in one server script, covering every product.',
      'Find the player from receipt.PlayerId; if absent or the profile is not loaded return NotProcessedYet.',
      'If PurchaseId is already in the saved ProcessedPurchases list return PurchaseGranted.',
      'Grant inside a pcall, record the PurchaseId (keep the last about 50), force a save, and return PurchaseGranted only if the save succeeded; any error returns NotProcessedYet.',
      'The same receipt can run on two servers if the player rejoins fast, and Roblox retries only on the next purchase or rejoin, so never yield without bound.',
    ],
    verification: ['Process the same receipt twice, concurrently if possible: one grant.', 'Fail the save: the result is NotProcessedYet and the next attempt succeeds once.'],
    failureModes: ['Granting before recording the id, or granting in PromptProductPurchaseFinished.', 'Two assignments of ProcessReceipt.'] },
  { id: 'data-live-leaderboard-memorystore-flush', title: 'Run a live leaderboard in MemoryStore and flush it to an ordered store', domain: 'data', summary: 'Fast-changing scores in a SortedMap with expiry, flushed on a slow cadence to a durable OrderedDataStore.', refs: ['memoryStore'], keywords: ['leaderboard', 'memorystore', 'sorted map', 'ordered datastore', 'ranking', 'cache', 'top 10'],
    steps: [
      'Live scores: a MemoryStore SortedMap with SetAsync(key, value, expiration, sortKey) and GetRangeAsync(direction, count up to 200); keys up to 128 characters, values 32 KB, expiry up to 45 days.',
      'Shard a hot map by userId % #maps + 1; it stays ephemeral, so never keep progress only there.',
      'Flush integer scores (math.floor) to an OrderedDataStore at most about every 60 s per player and on leave; it holds integers only and has no versioning.',
      'Refresh the shown top list every 60 to 120 s with one GetSortedAsync(false, 10) page per server, cache it and replicate it by remote or attributes.',
      'Budgets: list requests are about 300 + 2 x players per minute and MemoryStore request units about 1,000 + 120 x players, so no per-player calls on each refresh.',
    ],
    verification: ['Profile request counts with a full server: refreshes stay within budget.', 'Fail a page read: the board keeps showing the last good page.'],
    failureModes: ['Per-player lookups on each refresh exhaust the budget.', 'Floats or negative ordering assumptions in the ordered store.'] },
  { id: 'network-queue-matchmaking-reserved-server', title: 'Queue players in MemoryStore and teleport a full group to a reserved server', domain: 'client_server', summary: 'Lobby queue with visibility timeout, group read, reserved-server teleport and removal only after success.', refs: ['memoryQueue'], keywords: ['matchmaking', 'queue', 'memorystore', 'reserved server', 'teleport', 'lobby', 'party', 'TeleportAsync'],
    steps: [
      'Lobby: GetQueue(name, 30) and AddAsync(userId, 300) with an expiry in seconds when a player queues.',
      'A loop per lobby server calls ReadAsync(count, true, 5) (count up to 100) for a full match; a read item is invisible for the timeout.',
      'Teleport the group (at most 50 players per call) with TeleportOptions.ShouldReserveServer = true and non-secret SetTeleportData; only after the call succeeds RemoveAsync(readId).',
      'Handle TeleportInitFailed; items not removed reappear after the 30 s timeout. A queue lives on one partition (about 30,000 units per minute).',
      'Teleports cannot be tested in Studio; publish and test in the client.',
    ],
    verification: ['Queue exactly the group size from test accounts: one reserved server starts with all of them.', 'Kill the teleport call: the entries reappear and no player is stranded.'],
    failureModes: ['Removing queue items before the teleport succeeds.', 'Secrets or currency placed in teleport data.'] },
  { id: 'network-teleport-init-failed-retry', title: 'Retry failed teleports with backoff', domain: 'client_server', summary: 'A teleport can fail after the call returns; handle TeleportInitFailed with bounded retries.', refs: ['teleportDoc'], keywords: ['teleport', 'TeleportInitFailed', 'retry', 'backoff', 'flooded', 'reserved server', 'ReserveServerAsync'],
    steps: [
      'Use TeleportService:TeleportAsync from the server only; the old client Teleport and TeleportPartyAsync are deprecated, and ReserveServerAsync replaces ReserveServer.',
      'Connect TeleportService.TeleportInitFailed(player, teleportResult, errorMessage, placeId, teleportOptions) once.',
      'Retry with backoff: the documented sample waits 15 s on a Flooded result and 1 s otherwise, at most 5 attempts, then returns the player to a usable menu.',
      'TeleportOptions has ReservedServerAccessCode, ServerInstanceId and ShouldReserveServer, which are mutually exclusive; teleport data and settings are client-visible and spoofable.',
    ],
    verification: ['Simulate a failure result: the retry fires with the right delay and stops after 5.', 'The player is never left on a frozen loading screen.'],
    failureModes: ['Assuming the call result is the final result.', 'Carrying permissions in teleport data.'] },
  { id: 'architecture-two-entry-point-service-loader', title: 'Load services from two entry scripts and ModuleScripts', domain: 'client_server', summary: 'One server Script, one client Script, everything else in ModuleScripts started in a fixed order.', refs: ['moduleScripts'], keywords: ['architecture', 'module script', 'service', 'runcontext', 'require', 'init', 'start', 'entry point'],
    steps: [
      'Create ServerScriptService/Server as a Script with RunContext Server and ReplicatedStorage/Client/ClientMain as a Script with RunContext Client; no other loose scripts in Workspace.',
      'The server entry requires every ModuleScript in ServerScriptService/Services inside a pcall, calls Init() on all, then Start() on each in task.spawn.',
      'ReplicatedStorage/Shared holds types, constants and pure functions; secret numbers stay in ServerStorage because anything replicated can be read by exploiters.',
      'Use CollectionService tags plus one script per behaviour instead of dozens of independent Scripts.',
      'Avoid cyclic requires (error: required recursively) and yielding at module top level; module state is separate per side and per Actor.',
    ],
    verification: ['Add a deliberate error in one service: the rest still load and the warning names it.', 'Search ReplicatedStorage for reward math or secrets: none.'],
    failureModes: ['A module yields at top level and blocks every requirer.', 'Assuming module state is shared between client and server.'] },
  { id: 'input-action-system-contexts-bindings', title: 'Set up the Input Action System with contexts and bindings', domain: 'input', summary: 'Semantic actions with key, gamepad and touch bindings, enabled for the default player scripts.', refs: ['inputActionClass'], keywords: ['input action', 'InputContext', 'InputBinding', 'cross platform', 'gamepad', 'touch', 'PlayerScriptsUseInputActionSystem'],
    steps: [
      'These classes are creatable (Instance.new works) but not on the plugin create allowlist: build them in Studio or from a script (edit_script). Make ReplicatedStorage/Inputs with an InputContext named Gameplay (Priority 2000, Sink on).',
      'Add InputAction children by purpose, Type one of the five InputActionType names (Bool, Direction1D, Direction2D, Direction3D, ViewportPosition): Bool for Sprint, Direction2D for Move; then InputBinding children: KeyCode per device (LeftShift, ButtonL3) and a UIButton for touch. Give every action all three device families.',
      'Set Workspace.PlayerScriptsUseInputActionSystem to Enum.RolloutState.Enabled (a RolloutState, not a boolean) so default player scripts use it.',
      'Read Pressed and Released for Bool actions only; poll GetState() for analog actions; show glyphs with InputActionLabel.',
      'Keep any speed change from an action as client feel only and make the server authoritative for speed-sensitive games.',
    ],
    verification: ['Perform each action with key presses, a gamepad and touch emulation: the same behaviour.', 'Nested contexts are not relied on, since they have no effect.'],
    failureModes: ['Expecting Pressed on analog actions.', 'An action with no touch binding.'] },
  { id: 'gameplay-server-authority-simulation', title: 'Use the Server Authority model for competitive movement', domain: 'gameplay', summary: 'Deterministic simulation in a shared module bound to BindToSimulation, with state in attributes and effects rendered from state.', refs: ['serverAuthority'], keywords: ['server authority', 'BindToSimulation', 'prediction', 'rollback', 'AuthorityMode', 'competitive', 'netcode'],
    steps: [
      'Only for competitive or physics-sensitive games (shooters, racing, sports). Set Workspace.AuthorityMode = Server, which also enables NextGenerationReplication, PlayerScriptsUseInputActionSystem, Deferred signals, UseFixedSimulation and StreamingEnabled.',
      'Create ReplicatedStorage/Simulation (ModuleScript) with ServerLoader (Script) and ClientLoader (LocalScript) both calling Simulation.Initialize(), which binds logic with RunService:BindToSimulation.',
      'Write state through attributes (at most 64 per instance, names 50 characters); read input from the Input Action System; use time(), not tick, os.clock or os.time.',
      'Render effects from state changes in a separate render step; do not cache AnimationTrack objects (8 playing tracks per Animator maximum).',
      'Remote events are not time-synchronised with property updates (about 40 to 50 ms offset); watch misprediction with Ctrl+Shift+F6.',
    ],
    verification: ['Run Server and Clients with latency: mispredictions resolve without visible snapping.', 'No simulation code calls tick or os.time.'],
    failureModes: ['Adopting it for a casual game that does not need it.', 'Instances created in the callback not parented before the frame ends.'] },
  { id: 'performance-hot-path-luau-pass', title: 'Run a hot-path Luau pass when script time exceeds the budget', domain: 'performance', summary: 'Profile first, replace polling with events, remove allocation in loops and native-compile only pure math.', refs: ['scriptProfiler'], keywords: ['luau performance', 'native', 'table.create', 'polling', 'raycast params', 'script profiler', 'hot path'],
    steps: [
      'Open the MicroProfiler and Script Profiler and find the top scripts when script time passes about 4 ms of the 16.67 ms frame.',
      'Replace polling loops with events and throttle per-frame work to every N frames; use task.wait, never wait.',
      'Use table.create and table.clear, build RaycastParams once, avoid temporary tables in hot loops; getfenv, setfenv and loadstring de-optimise a whole script.',
      'Mark pure-math functions with @native and annotate Vector3 parameters; docs cover server scripts, client support is unconfirmed, so keep code fast without it; never --!native everything (compile time, memory, a code cap).',
      'Disconnect leaks (watch memory in the Developer Console); set CanTouch, CanQuery and CanCollide false on scenery, anchor statics, use Box or Hull collision.',
    ],
    verification: ['Compare script time before and after on the same scene and action.', 'Memory does not grow across repeated lifecycle loops.'],
    failureModes: ['Optimising by guess without a profile.', 'Native-compiling code that touches Instances.'] },
  { id: 'security-vet-creator-store-model', title: 'Vet a Creator Store model before it enters a place', domain: 'security', summary: 'Prefer script-free assets, inspect anything with scripts in a scratch place, and keep only code you understand.', refs: ['toolbox'], keywords: ['creator store', 'toolbox', 'backdoor', 'malware', 'model', 'plugin', 'require', 'loadstring', 'vet'],
    steps: [
      'Prefer assets with no scripts (meshes, decals, audio cannot carry code). Check the creator: a copy of a popular asset by a different creator is a red flag; verification and ratings are not safety.',
      'Insert into a scratch place, never the production place; keep the Studio sandbox default and tick no SandboxedInstanceMode override; right-click the root and choose Disable Scripts.',
      'Count what arrived: a prop that is mostly scripts, or any instance with hundreds of children or very long non-ASCII names, is hostile.',
      'Block and review on: require with a number or arithmetic, getfenv, setfenv, loadstring, InsertService or LoadAsset, HttpService calls, string.reverse, long decimal-escape strings, lines over about 500 characters, huge whitespace runs, scripts under a weld, part or sky object.',
      'Search the whole model for require(, getfenv, loadstring, Http; repeat after deleting since there is usually more than one. Copy useful logic into your own ModuleScript and drop the container; test with HttpService off.',
    ],
    verification: ['Every flagged script was read in full and its purpose recorded.', 'Output shows no warning you did not write after a test run.'],
    failureModes: ['Keyword scans miss new obfuscation and package-linked backdoors; judge behaviour.', 'Keeping a require(id) module whose source cannot be read.'] },
  { id: 'security-audit-place-for-backdoors', title: 'Audit an existing place for injected scripts', domain: 'security', summary: 'Compare versions, scan every container, check plugins, and rebuild into a fresh place when infected.', refs: ['versionHistory'], keywords: ['backdoor', 'audit', 'injected script', 'malware', 'plugin', 'version history', 'haxed', 'scan'],
    steps: [
      'Roll through Version History to find when it appeared and compare versions.',
      'Scan game and each of ServerScriptService, ServerStorage, ReplicatedStorage, Workspace, StarterGui, StarterPack, StarterPlayer, Lighting and Teams by IsA("LuaSourceContainer") over descendants, not by name.',
      'Check installed plugins and remove any not recognised; a malicious plugin can inject scripts you cannot see in the Explorer.',
      'Turn Allow HTTP Requests off and keep LoadStringEnabled false; if one script is found assume more and repeat the scans.',
      'For a heavily infected place copy known-good content into a fresh place; if a backdoor was live lock the server, remove it and only then reopen.',
    ],
    verification: ['A final scan lists only scripts you can name and explain.', 'The Output shows no unexpected warnings in a test session.'],
    failureModes: ['Scripts parented to nil or deep objects hide from browsing.', 'Fixing one script and stopping.'] },
  { id: 'security-sandbox-third-party-capabilities', title: 'Sandbox third-party code with script capabilities', domain: 'security', summary: 'Mark an asset sandboxed and grant only the capabilities it demonstrably needs, one at a time.', refs: ['capabilities'], keywords: ['sandbox', 'capabilities', 'SandboxedInstanceMode', 'third party', 'admin system', 'LoadUnownedAsset', 'LoadString'],
    steps: [
      'Put the third-party model in a Folder or Model and set its Sandboxed property to true.',
      'Set Workspace SandboxedInstanceMode to Experimental (a beta property; its value list is not fully documented).',
      'Run it and read the Output error, which names the missing capability; add one capability at a time.',
      'Never grant LoadUnownedAsset, LoadString or CapabilityControl to code from an unknown author.',
      'Sandboxing covers Studio workflows; it does not change LoadAssetAsync in live games, so it is not a runtime guarantee.',
    ],
    verification: ['The asset works with only the listed capabilities and each grant is recorded.', 'Remove a capability: the Output error names it.'],
    failureModes: ['Granting everything to make an error disappear.', 'Treating Studio sandboxing as a live-game safeguard.'] },
  { id: 'performance-frame-spike-microprofiler-reading', title: 'Read a MicroProfiler frame spike to its owning label', domain: 'performance', summary: 'Pause on the tallest frame, read its colour, expand to the widest child and name your own code.', refs: ['microprofilerWalkthrough'], keywords: ['microprofiler', 'frame spike', 'profiler', 'debug.profilebegin', 'cpu bound', 'gpu bound', 'lag'],
    steps: [
      'Open the MicroProfiler (Ctrl+F6, Cmd+F6 on Mac, in Studio and on the desktop client), pause the capture (Ctrl+P) and click the tallest frame bar.',
      'Read the bar colour: orange CPU-bound, blue GPU-bound, red heavy GPU wait over about 2.5 ms; the 60 FPS budget is 16.67 ms.',
      'Expand parent labels in the timeline and fix the widest child first.',
      'Wrap your own code with debug.profilebegin("Name") and debug.profileend() so it appears by name.',
      'For server lag use the Developer Console (Ctrl+F9), MicroProfiler tab, and profile in a real client as well as Studio.',
    ],
    verification: ['The spike is attributed to a named label and a fix is chosen from it.', 'A second capture of the same action shows the reduced frame time.'],
    failureModes: ['Profiling only in Studio, which adds overhead.', 'Changing several things before recapturing.'] },
  { id: 'architecture-library-stack-decision', title: 'Choose a library stack for a new project', domain: 'client_server', summary: 'Prefer maintained, small choices and pin versions; avoid archived frameworks.', refs: ['scriptLocations'], keywords: ['libraries', 'stack', 'profilestore', 'trove', 'signal', 'blink', 'zap', 'react-lua', 'knit'],
    steps: [
      'Data: ProfileStore (not ProfileService or DataStore2). Events: native signals plus a vetted Signal module for custom ones. Cleanup: Trove or Janitor.',
      'Networking: plain validated RemoteEvents for small games; Blink or Zap only for heavy typed traffic.',
      'UI: plain Instances for small interfaces; react-lua, Fusion or Vide for large ones, picking one (Roact is archived).',
      'Async: the task library with pcall; Promise only for existing code. Architecture: ModuleScript services, not Knit (archived).',
      'Pin versions: Fusion is 0.x beta, Blink 1.0 is a prerelease and Wally 0.4 is alpha. Every inserted module must pass the third-party vetting skill; external toolchains (Rojo, Rokit, Wally) are an owner decision.',
    ],
    verification: ['Each dependency has a recorded source, version and reason.', 'No archived framework appears in the project.'],
    failureModes: ['Starting new work on an archived framework.', 'Unpinned dependencies that change under the project.'] },
  { id: 'world-generate-mesh-budget-and-moderation', title: 'Generate meshes and models within the documented limits', domain: 'worldbuilding', summary: 'Cap triangles, parts and counts, keep prompts neutral, and treat generated scripts and assets as unverified.', refs: ['meshes'], keywords: ['generate mesh', 'procedural model', 'segment mesh', 'triangles', 'ai generation', 'cube', 'budget', 'moderation'],
    steps: [
      'Set a triangle cap on generated meshes: the default is 10,000, and 2,000 to 5,000 is a sensible range for props when budget matters.',
      'Limits: generated multi-part models up to 8 parts, segment_mesh at most 5 parts per command (run again for more), and 50 procedural models per rolling 24 hours.',
      'Keep prompts to neutral props and avoid realistic people; prompts are moderated and one ban report was tied to a character prompt.',
      'Generated runtime meshes do not replicate to other clients; do not build on features announced as coming (analytics agent, scene generation).',
      'Inspect each result for scale, pivot and silhouette before keeping it, and read generated scripts before running them.',
    ],
    verification: ['Check triangle count and part count of every generated asset against the caps.', 'Inspect the result from the gameplay camera at normal distance.'],
    failureModes: ['Default 10,000 triangles on every small prop.', 'Using the open-source model weights in a product without reading their research-only licence.'] },

  // Researched 2026-10-04 (research/roblox/05-world-visuals.md): lighting looks, terrain, materials, scale, budgets.
  // Look values are the note's derived starting points (docs demo values where it says so): set them, screenshot, then tune.
  // Lighting.Technology is deprecated; the migration is LightingStyle plus PrioritizeLightingQuality (neither is scriptable).
  { id: 'world-lighting-foundation-look-switcher', title: 'Set up a lighting foundation that can switch between looks', domain: 'worldbuilding', summary: 'Pick the lighting style first, add the standard children, and drive looks from one tweened table.', refs: ['lightingClass'], keywords: ['lighting', 'LightingStyle', 'PrioritizeLightingQuality', 'technology', 'look', 'mood', 'atmosphere', 'post processing'],
    steps: [
      'Lighting.Technology is deprecated: Future became Realistic plus PrioritizeLightingQuality on, ShadowMap Soft plus on, Voxel Soft plus off. Game scripts cannot write either property; a Studio plugin op or the Properties panel can.',
      'Cartoon, obby or tycoon looks use Soft (PrioritizeLightingQuality off for phone view distance); horror, realistic or neon use Realistic with it on. The old Compatibility look is Voxel plus ColorGradingEffect Retro.',
      'Give Lighting one Sky, one Atmosphere, a Bloom, a ColorCorrection and optionally SunRays and DepthOfField; Clouds (under Terrain, not on the create allowlist) only if wanted, via script.',
      'Keep each look as a table of Lighting, Atmosphere, effect and Terrain values; tween between looks over 1 to 3 s; change one control at a time.',
      'Test at maximum Editor Quality (effects may hide otherwise) and a low phone level. Defaults: Atmosphere Density 0.395, Haze 0; Bloom 0.4, 24, 0.95; SunRays 0.25, 1. An Atmosphere hides fog properties; keep a Sky beside it.',
    ],
    verification: ['Switch between two looks at runtime: no flash, and both clients see the change (whether a server ClockTime write replicates is unconfirmed; test it).', 'No game script writes LightingStyle or PrioritizeLightingQuality.'],
    failureModes: ['Stacking extremes (high Brightness, ExposureCompensation and Bloom) at once.', 'Judging effects at low Editor Quality.'] },
  { id: 'world-look-sunny-cartoon', title: 'Light a sunny cartoon world for phones', domain: 'worldbuilding', summary: 'Soft lighting with saturated colours, light haze, restrained bloom and cheap shadows (derived starting values).', refs: ['atmosphere'], keywords: ['sunny', 'cartoon', 'daylight', 'bright', 'obby', 'tycoon', 'simulator', 'kid friendly'],
    steps: [
      'LightingStyle Soft with PrioritizeLightingQuality off. Lighting: ClockTime 14, Brightness 2.5, Ambient (100,100,115), OutdoorAmbient (150,150,160), ColorShift_Top (255,244,214), EnvironmentDiffuseScale 0, EnvironmentSpecularScale 0, ShadowSoftness 0.2.',
      'Atmosphere: Density 0.2, Offset 0.3, Haze 0.4, Glare 0, Color (205,225,255), Decay (160,190,230).',
      'Bloom Intensity 0.25, Size 24, Threshold 0.95; ColorCorrection Saturation 0.2, Contrast 0.08; SunRays Intensity 0.06, Spread 0.8; Clouds (under Terrain) Cover 0.5, Density 0.15.',
      'Terrain: Decoration true, GrassLength 0.5, Grass colour (110,180,60) via SetMaterialColor; water colour (40,170,200), WaterTransparency 0.4, WaterReflectance 0.4, WaterWaveSize 0.15, WaterWaveSpeed 10.',
      'Parts: Plastic or SmoothPlastic in saturated mid-value colours; no PBR textures needed.',
    ],
    verification: ['Screenshot at phone size: light colours are not blown out.', 'Shadows from parts under 4 studs are not expected (voxel shadows need larger parts).'],
    failureModes: ['Brightness plus Bloom blows out light colours; keep the Threshold high.', 'A flat all-ambient recipe shows ambient occlusion artefacts at high quality.'] },
  { id: 'world-look-night-horror', title: 'Light a night horror scene that stays readable', domain: 'worldbuilding', summary: 'Realistic lighting, near-black ambient, one visibility route (fog or Atmosphere) and small guiding lights (derived values).', refs: ['lightingClass'], keywords: ['night', 'horror', 'dark', 'fog', 'flashlight', 'spooky', 'liminal', 'survival'],
    steps: [
      'Realistic with PrioritizeLightingQuality on. ClockTime 0, Brightness 0 (0.3 for faint moonlight), EnvironmentDiffuseScale 0, Ambient (8,8,12), OutdoorAmbient (6,6,10); never pure-black ambient on low-end phones without a player light.',
      'Visibility route A, no Atmosphere: FogColor (5,5,8), FogStart 0, FogEnd 25 to 60 (40 is a safe middle). Route B, Atmosphere: Density 0.5, Offset 0, Haze 2, Glare 0, Color (20,22,30), Decay (10,10,20). Use one route, not both.',
      'Post: ColorCorrection Saturation -0.3, Contrast 0.15, TintColor (210,220,255); Bloom Intensity 0.3, Size 20, Threshold 1; SunRays Intensity 0.02, Spread 0.',
      'Lights: flashlight SpotLight Range 40 to 60, Angle 60, Brightness 2, Shadows on; candles PointLight Brightness 0.5 to 0.8, Range 10 to 15; ceiling fixtures Range 20 to 30 (maximum Range is 120). Few shadow-casting lights.',
      'Darkness plus small guiding lights beats total darkness: lead the player toward objectives with small lights.',
    ],
    verification: ['Walk the route at phone brightness without editor outlines: the next objective is visible.', 'Count shadow-casting lights in view and keep it small.'],
    failureModes: ['Fog and Atmosphere both applied is unverified; pick one.', 'Brightness 0 hides the moon unless EnvironmentDiffuseScale is used.'] },
  { id: 'world-look-foggy-forest', title: 'Light a foggy forest with depth and drifting mist', domain: 'worldbuilding', summary: 'Early-morning Atmosphere haze, drifting clouds and wind, with fog used as a performance tool (derived values).', refs: ['clouds'], keywords: ['forest', 'fog', 'mist', 'woodland', 'survival', 'exploration', 'haze', 'trees'],
    steps: [
      'Realistic with PrioritizeLightingQuality on (or Soft for a stylised mist). ClockTime 7, Brightness 1.5, Ambient (40,50,45), OutdoorAmbient (95,110,100), ColorShift_Top (255,235,200).',
      'Atmosphere: Density 0.35, Offset 0, Haze 2.5, Glare 0.2, Color (170,190,180), Decay (110,130,120). Clouds under Terrain Cover 0.8, Density 0.3; Workspace.GlobalWind about (3,0,1) so grass and clouds drift.',
      'Post: ColorCorrection Saturation -0.15, Contrast 0.05, TintColor (225,240,230); SunRays Intensity 0.15, Spread 0.9; Bloom 0.2, 24, 1.',
      'Terrain materials LeafyGrass, Ground, Mud, Rock with Decoration on and GrassLength 0.8; reuse 2 to 4 tree meshes, CastShadow off on small leaf meshes, leaf cards as opaque cutouts (AlphaMode Transparency with MeshPart.Transparency 0).',
      'Dense haze hides draw-distance pop-in so StreamingTargetRadius can stay near its 1024 default.',
    ],
    verification: ['Look along the longest path: distant terrain fades but gameplay targets stay visible.', 'Leaves show no semi-transparent overdraw.'],
    failureModes: ['Low Offset dissolves distant terrain into the sky.', 'Density high enough to hide gameplay targets.'] },
  { id: 'world-look-neon-city-night', title: 'Light a neon city night with controlled bloom', domain: 'worldbuilding', summary: 'Violet ambient, wet reflective streets and emissive signs where only emitters bloom (derived values).', refs: ['postProcessing'], keywords: ['neon', 'cyberpunk', 'city', 'night', 'glow', 'emissive', 'racing', 'club'],
    steps: [
      'Realistic with PrioritizeLightingQuality on. ClockTime 0, Brightness 0.5, Ambient (30,15,70), OutdoorAmbient (40,30,90), ColorShift_Top (0,255,190), ColorShift_Bottom (255,0,220) (mix toward grey if loud), EnvironmentSpecularScale 1, EnvironmentDiffuseScale 0.',
      'Atmosphere: Density 0.3, Offset 0.1, Haze 1.8, Glare 0, Color (90,40,160), Decay (255,60,200).',
      'Post: Bloom Intensity 0.7, Size 28, Threshold 0.85 (tune so only emitters bloom); ColorCorrection Saturation 0.3, Contrast 0.2, TintColor (235,225,255).',
      'Emitters: Neon material for all-or-nothing glow; for textured signs an emissive mask on SurfaceAppearance with EmissiveStrength 2 to 10 for gentle glow (suggested range 0 to 40) and EmissiveTint for colour.',
      'Wet street: Asphalt or SmoothPlastic with a roughness map about 0.2 to 0.35 and metalness 0. Coloured PointLights Range 20 to 30 with shadows off except hero lights; one 120-range light can cover a plaza.',
    ],
    verification: ['Only signs and lights bloom; walls and sky do not turn to haze.', 'Frame time with all lights on is acceptable on the phone profile.'],
    failureModes: ['Many shadowed lights wreck phone frame time.', 'High Haze washes out neon colours.'] },
  { id: 'world-look-underwater', title: 'Build an underwater scene with terrain water and a submerged camera look', domain: 'worldbuilding', summary: 'Terrain water properties for the volume, plus a camera-parented colour and blur look while submerged.', refs: ['terrainClass'], keywords: ['underwater', 'ocean', 'water', 'swimming', 'fishing', 'submerged', 'terrain water', 'blur'],
    steps: [
      'Fill water with the Sea Level tool or Terrain:FillBlock(cf, size, Enum.Material.Water). Defaults: WaterColor (0.05,0.33,0.36), WaterTransparency 0.3. Murk: WaterTransparency 0.05 to 0.3 (1 is about 2000 studs of visibility since 2021); WaterReflectance 0.3 to 1; WaterWaveSize 0.1 to 0.3; WaterWaveSpeed 5 to 15.',
      'Underwater brightness follows ClockTime and Ambient, so raise Ambient if night scenes become unplayable; normal Lighting fog does not render underwater.',
      'When the camera is submerged enable a look parented to the Camera: ColorCorrection TintColor (11,143,213), Contrast 0.5, Brightness 0.4, Saturation 0.6 (2021 community values; consider halving Contrast and Brightness) plus BlurEffect Size about 10 tweened over 0.3 s.',
      'Detect submersion with the voxel at the camera (Terrain:ReadVoxels) or the Humanoid swimming state; swap ambience for an underwater loop.',
      'SunRays low (about 0.05) near the surface; avoid many semi-transparent bubble particles.',
    ],
    verification: ['Enter and leave the water: the look fades in and out once without flicker.', 'Check the scene at night and at midday.'],
    failureModes: ['WaterTransparency also changes the surface look.', 'Bubbles add transparent overdraw on phones.'] },
  { id: 'world-look-golden-hour', title: 'Light a golden hour sunset scene', domain: 'worldbuilding', summary: 'Low warm sun, purple ambient, strong haze and glare without muddy colours (derived; docs demo values noted).', refs: ['lightingClass'], keywords: ['sunset', 'golden hour', 'evening', 'warm', 'cinematic', 'lobby', 'dusk'],
    steps: [
      'Realistic with PrioritizeLightingQuality on. ClockTime about 17.6 (the docs show 17 as an afternoon example), Brightness 2.5, ExposureCompensation 0.25, Ambient (60,40,70), OutdoorAmbient (200,150,240), ColorShift_Top (255,140,60), ColorShift_Bottom (90,60,140), EnvironmentDiffuseScale 0.2.',
      'Atmosphere: Density 0.33, Offset 0.2, Haze 2.5, Glare 1, Color (255,200,255), Decay (255,90,80); Glare and Decay need Haze above 0.',
      'Post: Bloom Intensity 0.5, Size 28, Threshold 0.9; ColorCorrection Saturation 0.15, Contrast 0.1, TintColor (255,235,220); SunRays Intensity 0.2, Spread 1.',
      'Clouds Cover 0.5, Density 0.15; colour clouds through Lighting and Atmosphere, not Clouds.Color. Water reflectance 1 so the sky colours reflect.',
    ],
    verification: ['Skin tones and UI colours are not muddy under the warm shift.', 'Shadows are visible but not too dark.'],
    failureModes: ['Warm ColorShift on everything with high Contrast.', 'Clouds.Color used to paint the sunset.'] },
  { id: 'world-terrain-blockout-to-dressed', title: 'Work terrain from blockout to a dressed outdoor map', domain: 'worldbuilding', summary: 'Greybox first, generate or import terrain, sculpt, colour by material, then dress and check the budget.', refs: ['terrainEditor'], keywords: ['terrain', 'heightmap', 'biome', 'grass', 'water', 'sculpt', 'outdoor map', 'blockout'],
    steps: [
      'Greybox with parts at 5-stud snapping and mark landmarks and paths; then Terrain Editor Generate (Arctic, Dunes, Canyons, Lavascape, Water, Mountains, Hills, Plains, Marsh) over a region, or Import a heightmap.',
      'Heightmap import: 1 pixel is 4 studs, at most 4096x4096 px (about 16,384 studs per side); the region Y size maps darkest to lightest pixel; a colormap needs exact key colours (Grass 106,127,63; Water 12,84,92; Snow 195,199,218; Sand 143,126,95; Mud 58,46,36; Rock 102,108,111).',
      'Edit with Select, Transform, Fill, Sea Level and brushes Draw, Sculpt, Smooth, Flatten, Paint (size 1 to 64). Palette via Terrain:SetMaterialColor; Decoration true with GrassLength 0.1 to 1 and Workspace.GlobalWind for moving grass.',
      'Keep terrain filled rather than hollow, minimise materials in view, and fill gaps from scripts (FillBlock, FillBall) when needed.',
      'Dress with reused meshes and check draw calls with Shift+F2; do not script against the mid-2027 terrain features (scattering, splines).',
    ],
    verification: ['Walk the critical path: slopes match the character limits and no collision traps exist.', 'Terrain plus props stay within the draw-call budget.'],
    failureModes: ['Hollow terrain shells and many materials per view.', 'Terrain materials are global per place, so per-area overrides surprise.'] },
  { id: 'world-material-variant-pack', title: 'Make a consistent custom material pack with MaterialVariant', domain: 'worldbuilding', summary: 'Tileable PBR sets named by base material so they apply, swap and override cleanly.', refs: ['materialVariant'], keywords: ['materialvariant', 'material pack', 'texture', 'pbr', 'tileable', 'StudsPerTile', 'stylized material'],
    steps: [
      'Textures: square, tileable, seamless albedo without baked lighting, OpenGL tangent-space normal map, greyscale roughness and metalness, 512 to 1024 (1024 on 8x8 studs matches built-ins).',
      'MaterialVariant is not on the plugin create allowlist: make it in the Material Manager or from a script under MaterialService; choose the base material (it inherits physics), set maps, StudsPerTile (try 8 for a 1024 map, derived) and MaterialPattern.',
      'Apply with Part.MaterialVariant (referenced by name, so renaming later breaks the link) or as an override for a base material; terrain can only take it as a global per-place override.',
      'Name BaseMaterial plus descriptor (GrassWet, GrassDry) and keep all in MaterialService so same-named sets restyle a place; set CustomPhysicalProperties only when behaviour must change (slippery ice).',
    ],
    verification: ['Apply the set to a part and to terrain and compare tiling with a built-in material.', 'Rename-safe: every use still resolves after a restyle swap.'],
    failureModes: ['Custom textures cost more memory than built-ins.', 'Glass refraction is missing on mobile.'] },
  { id: 'world-pbr-hero-prop-surface-appearance', title: 'Give a hero prop PBR with SurfaceAppearance', domain: 'worldbuilding', summary: 'A watertight low-triangle mesh with sized maps, reuse-friendly tinting and optional emissive glow.', refs: ['surfaceAppearance'], keywords: ['surfaceappearance', 'pbr', 'normal map', 'roughness', 'metalness', 'emissive', 'hero prop', 'mesh'],
    steps: [
      'Model under 20,000 triangles (aim far lower; props 500 to 3000 is a derived range), watertight, a single UV set inside 0 to 1.',
      'Insert SurfaceAppearance under the MeshPart: ColorMap, NormalMap (OpenGL), RoughnessMap, MetalnessMap (mostly 0 or 100 percent), optional emissive mask with EmissiveStrength (suggested 0 to 40) and EmissiveTint.',
      'Map sizes: 256 per 2x2x2 studs, 512 for 4x4x4, 1024 for 8x8x8; do not use 4K on small objects.',
      'Leaf cards and lace: AlphaMode Transparency with MeshPart.Transparency 0; soft decals at least 0.02. Use near-white albedo plus SurfaceAppearance.Color for cheap variants.',
      'Reuse the same MeshId and SurfaceAppearance on every copy so they instance; SurfaceAppearance properties generally cannot be changed by scripts at runtime.',
    ],
    verification: ['Compare under two lighting looks: the prop reads correctly in both.', 'Copies batch (draw calls do not grow per copy).'],
    failureModes: ['Tuning roughness for one lighting setup.', 'Importing a whole scene as one asset, which defeats instancing.'] },
  { id: 'world-avatar-scale-greybox-metrics', title: 'Greybox a level with avatar-correct scale and travel distances', domain: 'worldbuilding', summary: 'Clearances, gaps and distances derived from the documented movement numbers (starting values to test).', refs: ['units'], keywords: ['scale', 'greybox', 'blockout', 'doorway', 'level design', 'studs', 'clearance', 'distance'],
    steps: [
      'One stud is 28 cm; default WalkSpeed 16, JumpPower 50 (about 7.2 studs of jump height), gravity 196.2; the default pathfinding agent is radius 2, height 5. Snap the greybox to 5 studs and 90 degrees.',
      'Starting clearances: doorways and halls at least 10 wide where two players pass and walls at least 10 tall; single gates 6 to 8 wide by 9 to 10 tall (derived); absolute minimum about 4 wide by 5 high.',
      'Gaps at most 6 studs for normal difficulty and 7 to 8 for expert (derived from a 7.2-stud jump); ledges to jump up at most 5 to 6; stair rise about 1 stud with a 3-stud run.',
      'Distances: points of interest about 40 s apart is roughly 640 studs at 16 studs per second (derived); PvP main routes 32 studs wide, walls 3 to 4 times player height, at most three exits per combat pocket.',
      'Layers (derived): foreground 0 to 50 studs interactables, midground 50 to 250 playable architecture, background 250 plus cheap silhouettes; third-person rooms often feel better at 1.5 to 2 times real proportions (old community advice).',
    ],
    verification: ['Place a reference rig and run every doorway, gap and ledge with it.', 'Run a pathfinding check across required links.'],
    failureModes: ['Real-world 1:1 rooms feel cramped to a third-person camera.', 'Relying on a quoted 5-stud jump when the default apex is about 7.2.'] },
  { id: 'world-visual-performance-audit', title: 'Audit a build against visual budgets', domain: 'worldbuilding', summary: 'Measure triangles and draw calls on the phone baseline and remove the biggest costs first.', refs: ['perfDesign'], keywords: ['budget', 'draw calls', 'triangles', 'overdraw', 'instancing', 'shadows', 'streaming', 'render stats'],
    steps: [
      'Playtest, open render stats (Shift+F2) and the MicroProfiler; note the baseline phone.',
      'Starting targets (third-party mobile budget): about 500k triangles and 500 draw calls in view, under 1.3 GB memory, UI under about 150 draw calls, about 40k triangles per zone; the docs 1,000 draw calls and 1,000,000 triangles is only an upper illustration.',
      'Find duplicate mesh ids and re-upload once; identical MeshParts batch only when mesh and SurfaceAppearance or material match. Set CollisionFidelity Box and CanCollide, CanTouch off on scenery; RenderFidelity Automatic switches at 250 and 500 studs.',
      'Turn CastShadow off on tiny or distant parts, Shadows off on non-hero lights, prefer one 120-range light to many small ones, and use only opaque or fully transparent parts.',
      'Enable StreamingEnabled and consider SLIM and Mesh Streaming for big worlds; check how much terrain contributes.',
    ],
    verification: ['Before and after numbers for triangles, draw calls and memory are recorded.', 'Test on hardware, since Studio runs server and client together.'],
    failureModes: ['Importing a whole scene as one file, so no instancing.', 'Overlapping semi-transparent parts.'] },
  { id: 'world-day-night-cycle-blending', title: 'Run a day and night cycle that blends between lighting anchors', domain: 'worldbuilding', summary: 'Four anchor looks, a server-driven clock and interpolated values instead of snapping.', refs: ['lighting'], keywords: ['day night', 'cycle', 'clocktime', 'time of day', 'dawn', 'dusk', 'survival', 'open world'],
    steps: [
      'Define four anchors (dawn 6, noon 13, dusk 18, midnight 0), each with Lighting, Atmosphere and ColorCorrection values reusing the look skills.',
      'Advance Lighting.ClockTime on the server on a timer; 24 hours in 20 to 40 minutes is a design choice (derived).',
      'Interpolate Color3 and numbers between the neighbouring anchors; smooth Brightness and Ambient, since ColorShift and OutdoorAmbient carry the mood.',
      'Update every 0.1 to 0.25 s, not per frame, and confirm clients see the time: whether a server ClockTime write replicates is unconfirmed, so a safe fallback is each client computing the clock from workspace:GetServerTimeNow().',
    ],
    verification: ['Fast-forward a full cycle: no snaps at anchor boundaries.', 'A joining client shows the current time of day, not the default.'],
    failureModes: ['Heavy per-frame work in the cycle loop.', 'A server-side ClockTime write assumed to replicate.'] },

  // Researched 2026-10-04 (research/roblox/06-ui-ux.md): phone-first interface recipes. Numbers marked "judgement" in the note
  // are starting points; classes missing from the plugin create allowlist (CanvasGroup, UIFlexItem, StyleSheet) go through a script.
  { id: 'ui-responsive-screengui-skeleton', title: 'Start every screen from a responsive ScreenGui skeleton', domain: 'ui', summary: 'A safe-inset root, scale-first panels with constraints, and a separate background layer, tested from phone to TV.', refs: ['uiScreen'], keywords: ['screengui', 'responsive', 'skeleton', 'safe area', 'ScreenInsets', 'layout', 'phone', 'tv'],
    steps: [
      'Create ScreenGui Overlay in StarterGui: ResetOnSpawn false, ScreenInsets CoreUISafeInsets (set it explicitly), IgnoreGuiInset false, ZIndexBehavior Sibling, DisplayOrder 1 (modals 10).',
      'Add a Frame Safe (Size 1,0,1,0, transparent) with UIPadding about 0.01 scale or 8 px; every widget lives inside it.',
      'Build panels with AnchorPoint plus Scale position and give each a UIAspectRatioConstraint and a UISizeConstraint (for example Min 350 wide, Max 800 wide).',
      'Full-bleed non-interactive art goes in a second ScreenGui with ScreenInsets None and Active false.',
      'Test in the Device Simulator on a small phone, a notched phone, a tablet, 1080p and a TV profile.',
    ],
    verification: ['Nothing sits under the notch or the top bar on any profile.', 'Respawn: the interface keeps its state.'],
    failureModes: ['ScreenInsets None on an interactive screen hides buttons under notches.', 'ResetOnSpawn true wipes interface state on every respawn.'] },
  { id: 'ui-mobile-first-overlay-currency-actions', title: 'Build a phone-first gameplay overlay with currency and menu buttons', domain: 'ui', summary: 'Three zones, two or three essential stats, and bottom corners left free for the thumbstick and jump button.', refs: ['uiPosition'], keywords: ['overlay', 'heads-up display', 'currency', 'menu buttons', 'mobile', 'thumbstick', 'core gui', 'stats'],
    steps: [
      'Inside the safe frame make TopLeft (currency stack), right-middle (menu buttons) and BottomCenter (ability row if needed); keep both bottom corners empty on touch.',
      'Currency pill: Size (0.2,0,0.06,0), UISizeConstraint Min (140,36) Max (260,56), an icon ImageLabel with UIAspectRatioConstraint 1, a TextLabel with AutomaticSize X, UIListLayout horizontal padding (0,6), UICorner 0.5 scale, UIStroke 2 px.',
      'Menu buttons: ImageButton 56x56 (Min 48, Max 72) in a vertical UIListLayout padding (0,8), AnchorPoint (1,0.5) at Position (1,-16,0.5,0); connect Activated, play a click sound and a UIScale press tween.',
      'Hide default CoreGui you replace with StarterGui:SetCoreGuiEnabled (Health, Backpack) from a client script; show only 2 to 3 essentials and put the rest behind a menu.',
    ],
    verification: ['On a phone profile the thumbstick and jump zones are clear.', 'The pill does not jitter when the number grows (fixed-width label).'],
    failureModes: ['Anything at (0,0) collides with the Roblox top-left controls.', 'Every stat shown at once.'] },
  { id: 'ui-topbar-safe-widget', title: 'Place a compact widget in the top bar strip safely', domain: 'ui', summary: 'A TopbarSafeInsets row that follows the changing controls, with a fallback when the strip is empty.', refs: ['guiService'], keywords: ['topbar', 'TopbarSafeInsets', 'TopbarInset', 'top bar', 'widget', 'currency', 'timer', 'insets'],
    steps: [
      'Create ScreenGui TopRow with ScreenInsets TopbarSafeInsets; its area is the free strip right of the experience controls and its width changes by itself.',
      'Child Frame (1,0,1,0) with a horizontal UIListLayout, HorizontalAlignment Right, padding (0,6); items 36 to 44 px high using AutomaticSize X.',
      'Manual alternative: read GuiService.TopbarInset (a Rect in full-screen pixels, so use it in an IgnoreGuiInset ScreenGui) and update on GetPropertyChangedSignal("TopbarInset"); never hard-code the top bar height.',
      'Console fallback: if the strip reports under 1 px height (an open December 2025 report), move the widget into the CoreUISafeInsets overlay with a fixed margin.',
      'Hide the least important item on small viewports (a StyleQuery on ViewportDisplaySize Small, or a script).',
    ],
    verification: ['On a portrait phone profile the widget still fits or hides gracefully.', 'Open the Roblox menu: the widget does not overlap the controls.'],
    failureModes: ['On portrait phones the controls can fill the width, leaving the strip nearly empty.', 'A hard-coded 36 px top bar height.'] },
  { id: 'ui-modal-panel-tabs-close', title: 'Build a modal panel with tabs and a standard close button', domain: 'ui', summary: 'Dimmer, centred constrained panel, tab row, page layout, gamepad focus and reduced-motion-aware open and close.', refs: ['uiPages'], keywords: ['modal', 'panel', 'tabs', 'close button', 'dimmer', 'UIPageLayout', 'canvasgroup', 'settings menu'],
    steps: [
      'ScreenGui Modals (DisplayOrder 10, CoreUISafeInsets) with a dimmer Frame (black, BackgroundTransparency 0.5, Active true, InputSink All) that blocks clicks behind it.',
      'Panel: AnchorPoint (0.5,0.5), Position (0.5,0,0.5,0), Size (0.8,0,0.8,0), UIAspectRatioConstraint 1.6 to 2.5, UISizeConstraint Max (800,520) Min (350,250), UICorner, UIStroke.',
      'Close button: square, red with a white X at the top right (AnchorPoint (1,0), Position (1,-10,0,10)), at least 44 px. Tabs: horizontal UIListLayout with HorizontalFlex Fill; pages in a UIPageLayout (Animated, TweenTime 0.2) or toggled Visible.',
      'Open with UIScale 0.9 to 1 and a CanvasGroup GroupTransparency 1 to 0 over 0.25 s (CanvasGroup is not on the create allowlist, use a script); skip motion when ReducedMotionEnabled.',
      'On open set GuiService.SelectedObject to the first button; B closes; hide with ScreenGui.Enabled, not by tweening 100 children.',
    ],
    verification: ['Open, switch tabs and close with touch, mouse and gamepad only.', 'Clicks never reach controls behind the dimmer.'],
    failureModes: ['CanvasGroup needs Sibling ZIndexBehavior and uses texture memory.', 'Focus stays behind the overlay.'] },
  { id: 'ui-store-item-grid-scrolling', title: 'Lay out a scrolling store grid with price states', domain: 'ui', summary: 'A ScrollingFrame with automatic canvas, uniform cards, a larger featured card and clear affordable, unaffordable and owned states.', refs: ['uiScrolling'], keywords: ['store', 'grid', 'scrollingframe', 'UIGridLayout', 'cards', 'price', 'catalog', 'items'],
    steps: [
      'ScrollingFrame Size (1,0,1,0), transparent, AutomaticCanvasSize Y, CanvasSize (0,0,0,0), ScrollingDirection Y, ScrollBarThickness 8, plus UIPadding so card shadows are not clipped.',
      'UIGridLayout CellSize {0,140},{0,180}, CellPadding {0,10},{0,10}, HorizontalAlignment Center, SortOrder LayoutOrder; or a UIListLayout with Wraps true and fixed-size cards for adaptive columns.',
      'Card: UICorner, UIStroke, image on top, name label (AutomaticSize Y, TextWrapped), a price button at the bottom at least 44 px high; place the featured card in its own larger row.',
      'Price states: affordable green, unaffordable red text, owned grey with a check icon; give every card a LayoutOrder for a deterministic order.',
      'For large catalogues build rows lazily or recycle them.',
    ],
    verification: ['Resize through phone and desktop widths: the last row is reachable and unclipped.', 'Sorting keeps the selected card visible.'],
    failureModes: ['UIGridLayout fixes cell size and overrides child Size; an aspect constraint on a card is ignored.', 'CanvasSize left non-zero with AutomaticCanvasSize on.'] },
  { id: 'ui-hotbar-inventory-slots', title: 'Build a bottom-centre hotbar that avoids the jump zone', domain: 'ui', summary: 'A custom tool row with the default backpack disabled, touch-safe slot count and gamepad neighbours.', refs: ['starterGui'], keywords: ['hotbar', 'inventory', 'backpack', 'slots', 'tools', 'equip', 'EquipTool', 'toolbar'],
    steps: [
      'Disable the default backpack with StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false) from a client script (it reappears if you forget).',
      'Row Frame at AnchorPoint (0.5,1), Position (0.5,0,1,-12) with a horizontal UIListLayout padding (0,6); slots are 56x56 ImageButtons with UIAspectRatioConstraint 1 and a number label for keys 1 to 9.',
      'On touch show only about 5 to 6 slots and scroll or page the rest; the bottom right is the jump zone.',
      'Equip with Humanoid:EquipTool; mark the equipped slot with a UIStroke colour change and a 1.1 UIScale; set Selectable and NextSelectionLeft and Right for gamepads.',
    ],
    verification: ['Equip each slot by touch, key and gamepad.', 'The row never overlaps the jump button on a phone profile.'],
    failureModes: ['Row anchored into the bottom right jump zone.', 'The default backpack still shown.'] },
  { id: 'ui-animated-currency-counter-popups', title: 'Animate a currency counter with plus-N popups', domain: 'ui', summary: 'A tweened shown value, floating gain text from the source, and an icon pulse that respects reduced motion.', refs: ['tween'], keywords: ['counter', 'currency', 'popup', 'floating text', 'tween', 'reward feedback', 'WorldToViewportPoint', 'number format'],
    steps: [
      'Keep a NumberValue Shown under the interface; tween Shown.Value toward the real value with TweenInfo.new(0.5, Quad, Out) and set the label text from Shown.Changed through a short formatter (1.2K, 3.4M, 5.6B).',
      'On a gain create a TextLabel "+N" at the source (screen point from WorldToViewportPoint), tween Position up 40 px and TextTransparency to 1 in 0.8 s, then Destroy.',
      'Pulse the currency icon with UIScale 1 to 1.15 and back in 0.15 s.',
      'If GuiService.ReducedMotionEnabled, set the value instantly and skip the popup movement.',
    ],
    verification: ['Ten rapid gains end on the exact correct number.', 'With reduced motion on, nothing moves.'],
    failureModes: ['Two tweens on one property cancel the first; retarget deliberately.', 'Raw long numbers make the label jitter.'] },
  { id: 'ui-toast-notification-stack', title: 'Show reward and error toasts in a capped stack', domain: 'ui', summary: 'CanvasGroup toasts in a safe corner that fade in, hold about 3 s and fade out, capped at four.', refs: ['uiAnimation'], keywords: ['toast', 'notification', 'message', 'stack', 'popup', 'canvasgroup', 'rich text', 'alerts'],
    steps: [
      'ScreenGui Toasts (CoreUISafeInsets, DisplayOrder 20) with a container Frame at top-centre or bottom-left and a vertical UIListLayout, padding (0,6), SortOrder LayoutOrder.',
      'Toast: a CanvasGroup (script-created) with AutomaticSize Y, width 0.3 scale with UISizeConstraint Max 360, UICorner, UIStroke, UIPadding 10 and a RichText label for highlights.',
      'Show: GroupTransparency 1 to 0 in 0.3 s, hold 3 s, fade out 0.3 s, Destroy; cap at 4 live toasts and drop the oldest.',
      'Keep Roblox SendNotification only for system-like messages; filter any player-provided text before showing it.',
    ],
    verification: ['Trigger 10 toasts in a second: at most 4 show and none leak.', 'Toasts do not cover the top bar controls.'],
    failureModes: ['Many CanvasGroups cost memory; reuse or cap them.', 'Unfiltered player text in a toast.'] },
  { id: 'ui-button-press-feedback-uiscale', title: 'Give buttons hover, press and disabled feedback', domain: 'ui', summary: 'A UIScale press tween, desktop-only hover, an explicit disabled state and optional haptics.', refs: ['uiButtons'], keywords: ['button', 'press', 'hover', 'feedback', 'UIScale', 'disabled', 'haptic', 'SecondaryActivated'],
    steps: [
      'Set AutoButtonColor false when animating yourself and add a UIScale to the button.',
      'Hover (desktop only): MouseEnter and MouseLeave tween BackgroundColor3 slightly lighter; never hide information behind hover.',
      'Press: UIScale to 0.95 in 0.08 s and back on release; the action runs from Activated, which covers touch and gamepad; SecondaryActivated is right-click or long-press.',
      'Disabled: Interactable false, desaturate and show a lock icon; optionally play a HapticEffect (Type UIClick) on mobile and gamepad.',
    ],
    verification: ['Every state is distinguishable without colour alone.', 'The button works with touch, mouse and gamepad.'],
    failureModes: ['Relying on hover for touch players.', 'Using MouseButton1Click, which misses touch and gamepad paths.'] },
  { id: 'ui-gamepad-focus-ring-and-defaults', title: 'Make every screen navigable with a gamepad', domain: 'ui', summary: 'Selectable controls, a default selection on open, a visible focus ring and standard A and B meanings.', refs: ['uiProximity'], keywords: ['gamepad', 'controller', 'console', 'SelectedObject', 'SelectionImageObject', 'focus', 'navigation', 'InputActionLabel'],
    steps: [
      'Set Selectable true on every control; wire NextSelectionUp, Down, Left and Right for irregular layouts.',
      'On opening a screen set GuiService.SelectedObject (or GuiService:Select) to the default button; on close set it to nil.',
      'Show a clear focus ring with SelectionImageObject set to a UIStroke-ed frame; keep A as confirm and B as back.',
      'Show key and button glyphs with InputActionLabel bound to the InputAction, not hard-coded names.',
      'Test with the Studio Controller Emulator; AutoSelectGuiEnabled changes how the Select button picks the first object.',
    ],
    verification: ['Reach and activate every control without a mouse.', 'Hidden or destroyed controls are never selected.'],
    failureModes: ['Selection jumps to an unrelated overlay.', 'B does not close the current screen.'] },
  { id: 'ui-accessibility-pack-text-motion', title: 'Add the accessibility pack: text size, transparency and reduced motion', domain: 'ui', summary: 'Text that grows with the player setting, glass panels that honour preferred transparency, and motion that can be turned off.', refs: ['pubAccessibility'], keywords: ['accessibility', 'PreferredTextSize', 'PreferredTransparency', 'ReducedMotionEnabled', 'contrast', 'colour blind', 'text size', 'volume sliders'],
    steps: [
      'Build text with AutomaticSize Y and TextWrapped and avoid TextScaled (the player Text Size setting does not scale it); use UITextSizeConstraint MaxTextSize as a ceiling for headers (there is no per-object opt-out). GuiService.PreferredTextSize is Medium 1, Large 2, Larger 3, Largest 4.',
      'Tag glass panels with a CollectionService tag (TransparentBack) and set BackgroundTransparency = base * GuiService.PreferredTransparency on start and on change.',
      'Route all tween durations through a helper that returns 0 when GuiService.ReducedMotionEnabled.',
      'Pair status colours with icons or shapes, aim for about 4.5:1 text contrast (judgement), give separate music, effects and voice sliders, and never convey a critical event by sound alone.',
    ],
    verification: ['Set Largest text: no label clips and no action is pushed off screen.', 'With reduced motion on, panels fade or snap instead of moving.'],
    failureModes: ['RichText plus the text size setting is a known complaint; test it.', 'Fixed-size labels that cannot grow.'] },
  { id: 'ui-theme-stylesheet-tokens-queries', title: 'Theme many screens with StyleSheet tokens and queries', domain: 'ui', summary: 'One sheet of tokens and tag-based rules, linked to each ScreenGui, with built-in queries for phone and reduced motion.', refs: ['uiStyling'], keywords: ['stylesheet', 'style rule', 'tokens', 'theme', 'StyleLink', 'StyleQuery', 'ViewportDisplaySize', 'design system'],
    steps: [
      'StyleSheet, StyleRule and StyleLink are not on the plugin create allowlist; use the Studio Style Editor or a script. Define tokens as attributes (PrimaryColor, Radius, Pad).',
      'Add rules: selector .ButtonPrimary sets BackgroundColor3 = $PrimaryColor; a pattern like Frame.RoundedCorner20::UICorner creates a UICorner; tag objects with CollectionService tags.',
      'Attach the sheet with a StyleLink under each ScreenGui; only one StyleSheet applies per tree, use StyleDerive to layer.',
      'Use built-in queries @ViewportDisplaySizeSmall for phone overrides and @ReducedMotionEnabledTrue for motion; :Hover and :Press selectors for states.',
    ],
    verification: ['Change one token: every tagged control updates.', 'Resize to a phone profile: the small-viewport overrides apply.'],
    failureModes: ['The class and property list is not complete; verify each styled property.', 'A second sheet on the same tree is ignored.'] },
  { id: 'ui-custom-proximity-prompt-style', title: 'Style a proximity prompt for touch and gamepad', domain: 'ui', summary: 'Configure the prompt, then optionally replace its look with a custom style, keeping touch-sized buttons.', refs: ['uiProximity'], keywords: ['proximityprompt', 'interact', 'prompt', 'ClickablePrompt', 'custom style', 'ProximityPromptService', 'hold'],
    steps: [
      'Add a ProximityPrompt to the part: ActionText, ObjectText, HoldDuration (0 for instant, 0.5 to 1.5 s for deliberate), MaxActivationDistance, RequiresLineOfSight, ClickablePrompt true for touch.',
      'Keep the defaults KeyboardKeyCode E and GamepadKeyCode ButtonX unless they clash.',
      'For a custom look set Style to Custom and build the UI from ProximityPromptService PromptShown and PromptHidden.',
      'Recheck distance and state on the server when it triggers; prompts are for discovery, not for continuous actions.',
    ],
    verification: ['Trigger it by tap, E and ButtonX.', 'The custom button is at least 44 px with ClickablePrompt on.'],
    failureModes: ['Prompt visibility treated as authorisation.', 'Using prompts for continuous actions.'] },
  { id: 'ui-world-billboard-surface-bars', title: 'Build in-world bars and screens with BillboardGui and SurfaceGui', domain: 'ui', summary: 'Camera-facing nameplates and health bars with a distance cap, and surface screens that actually receive input.', refs: ['uiSurface'], keywords: ['billboardgui', 'surfacegui', 'health bar', 'nameplate', 'world ui', 'MaxDistance', 'adornee', 'diegetic'],
    steps: [
      'BillboardGui on a head Attachment: Size scale (4,0,0.6,0) studs, StudsOffset (0,2.5,0), MaxDistance 60 to 100, AlwaysOnTop false.',
      'Bar: a Frame with UICorner 0.5 and a fill Frame whose Size is the health fraction, tweened.',
      'SurfaceGui screens: set Face, size by scale, add a UIAspectRatioConstraint; buttons only work when the SurfaceGui is under PlayerGui with Adornee set.',
      'Many always-on-top billboards hurt readability and performance; cap them by MaxDistance.',
    ],
    verification: ['Read each bar from the minimum and maximum interaction distance.', 'Click a SurfaceGui button in a test: it activates.'],
    failureModes: ['A SurfaceGui left in the world cannot take clicks.', 'Always-on-top reveals objects through walls.'] },
  { id: 'ui-ftue-objective-and-hints', title: 'Add first-minutes objective and hint interface', domain: 'ui', summary: 'One objective line, one pointer at the target, a short goals checklist and funnel logging.', refs: ['gdOnboardingTechniques'], keywords: ['ftue', 'objective', 'tutorial', 'hint', 'arrow', 'highlight', 'goals', 'onboarding ui'],
    steps: [
      'One objective line at the top (a Frame with UICorner, 18 to 22 px text) updated per step, plus one arrow or Highlight pointing at the target; no walls of text.',
      'Low first thresholds and starter currency so the first purchase lands within about a minute (judgement).',
      'A small checklist of short, mid and long goals.',
      'Log each step as a server-side funnel event so drop-off can be found.',
    ],
    verification: ['A stranger follows the line to the first reward without help.', 'The objective updates exactly once per step.'],
    failureModes: ['Long tutorials are abandoned.', 'The pointer stays after the step is done.'] },
  { id: 'ui-device-test-checklist', title: 'Run a device checklist before shipping any UI change', domain: 'ui', summary: 'Six checks across phone, notched phone, tablet and TV profiles.', refs: ['gdUiUx'], keywords: ['device simulator', 'checklist', 'qa', 'touch target', 'safe area', 'gamepad', 'text size', 'reduced motion'],
    steps: [
      'Run the Device Simulator on a small phone, a notched phone, a tablet and a console or TV profile.',
      'Check: (1) nothing under the top bar or notch, (2) every target at least 44 px rendered, (3) no interface in the thumbstick or jump zones.',
      'Check: (4) text fits at the Largest preferred size (emulate by adding about 30 percent to font sizes), (5) the gamepad reaches and activates every control, (6) the reduced-motion path works.',
    ],
    verification: ['Each of the six checks has a recorded pass per profile.', 'Pixel sizes are measured on the small phone, not the 1080p editor view.'],
    failureModes: ['Trusting scale sizing without measuring rendered pixels.', 'Skipping the console profile.'] },

  // Researched 2026-10-04 (research/roblox/03-genre-design.md, recipes 20 to 24): racing, judged rounds, rotation, life-sim.
  // Prices, payouts and bands are third-party or derived starting points to tune from the Creator Dashboard.
  { id: 'pattern-lobby-circuit-race-checkpoints', title: 'Run a lobby circuit race with validated checkpoints', domain: 'genre_pattern', genres: ['racing', 'obby'], summary: 'A queue-grid-race-finish state machine, server-owned checkpoint order and live position scoring on a checkpoint track.', refs: ['physicsOwnership'], keywords: ['racing', 'race', 'checkpoint', 'laps', 'ride seat', 'network owner', 'position', 'lobby'],
    steps: [
      'Start from the Studio Racing template (a working racer plus modular track) or copy a Race folder per track; checkpoints are parts Checkpoint1..N in order with min and max players and lap count per race.',
      'Server states Queue, Grid (held at the start, 3-2-1), Race, Finish (results, payout), Reset; replicate state and timer through Values and time with os.clock().',
      'On sitting in the VehicleSeat call seat:SetNetworkOwner(player) on the server and SetNetworkOwnershipAuto() on exit; give loose parts to the same owner.',
      'Accept checkpoint k only if k-1 was passed; raycast from the last position to the new one against noclip or teleport; add checkpoints at hairpins. Score = checkpointsPassed + fraction to the next one; ties by arrival time.',
      'Pay by place with a base that grows with track length (define your own numbers); add a time trial with a ghost for solo play and a 3-step first-race chain.',
    ],
    verification: ['Skip a checkpoint or teleport past one from a test client: the lap does not count.', 'Run 10 racers with several parts each and watch for rubber-banding.'],
    failureModes: ['Checkpoint touches owned by the client, or wrong network ownership causing jitter.', 'Thin checkpoints missed at speed; use a larger region plus a raycast.'] },
  { id: 'pattern-judged-round-ranks-and-payouts', title: 'Add voting rules, payouts and a rank ladder to a judged round', domain: 'genre_pattern', genres: ['roleplay', 'adventure'], summary: 'Server-summed 1 to 5 star votes, a payout by place, and a career-star rank ladder that unlocks a cosmetic.', refs: ['gdMonetization'], keywords: ['judged round', 'voting', 'stars', 'rank', 'payout', 'awards', 'party', 'ladder'],
    steps: [
      'States: Lobby, Theme (announce or vote), Create (5 to 6 minutes is a known length), Show (each player in turn), Vote (each other player gives 1 to 5 stars), top three, Payout.',
      'The server sums the stars and blocks self-rating; stars are saved as a career total separate from spendable cash and cannot be bought.',
      'Payout from a table by place (a third-party guide shows first 65, minus 5 per place to seventh 35: a starting point) plus participation rewards; the lobby may hold a small repeatable activity.',
      'Rank ladder of about 14 tiers on career stars with widening bands (0 to 49, 50 to 199, 200 to 499, 500 to 999, then wider); an early tier unlocks a higher-tier server and a visible cosmetic.',
      'Modes later: duos, a 10 player elimination variant, freeplay with no timer, a VIP room; sell props and consumables during intermissions.',
    ],
    verification: ['Vote for yourself and twice for another entrant: only valid votes count.', 'The first rank reward is reachable within a few rounds.'],
    failureModes: ['Rank gaps needing hundreds of rounds before the first reward.', 'Content that skews to one audience.'] },
  { id: 'pattern-elimination-minigame-rotation', title: 'Rotate short elimination rounds with spectators and capped rewards', domain: 'genre_pattern', genres: ['adventure', 'survival'], summary: 'A round table that never repeats back to back, server-assigned roles, spectators with something to do, and a per-round currency cap.', refs: ['gdCoreLoops'], keywords: ['minigames', 'elimination', 'rotation', 'spectator', 'roles', 'survival rounds', 'intermission', 'round cap'],
    steps: [
      'Keep a round table of minigames or disasters; choose one by vote or random, never the same twice in a row.',
      'Heuristic timing from small samples: short games 20 to 30 s with 10 to 20 s intermission; long games 20 to 35 s intermission, then results, then vote.',
      'Assign roles on the server at round start; dead players become spectators with a free camera and a next-round vote; late joiners wait for the next round.',
      'Cap currency per round (one hit used 40, 50 with its pass) so income is bounded and store prices follow from the cap; pay a flat participation reward plus a win bonus and log earnings per round.',
    ],
    verification: ['Run 30 rounds: no repeat in a row and every player ends in a defined state.', 'Join mid-round: the player spectates.'],
    failureModes: ['Waiting for too many players before starting.', 'Unbalanced role odds.'] },
  { id: 'pattern-life-sim-economy-bills', title: 'Balance a life-sim economy with jobs, building and bills', domain: 'genre_pattern', genres: ['roleplay', 'tycoon'], summary: 'Job income scaled by experience, sinks from furniture and a percent-of-value bill, and a saved plot with an object budget.', refs: ['gdEconomy'], keywords: ['life sim', 'jobs', 'bills', 'building', 'plot', 'economy', 'furniture', 'roleplay economy'],
    steps: [
      'Income: jobs and small tasks pay currency that scales with a work-experience level and a mood or efficiency modifier; job pay numbers conflict between sources, so define your own.',
      'Sinks: furniture and building costs plus a recurring bill that is a percent of home value per in-game week (a third-party source shows 0.6 percent, 0.3 with the paid tier, on a 2 h 48 min week); cap relief items (solar savings at most 20 percent in total).',
      'Building tool: one plot per player with an object budget, saved to a DataStore.',
      'Monetise with currency packs in tiers and passes that add building capacity or exclusive furniture; keep most of the game free and make the first home reachable in a few sessions (a recommendation).',
      'Log bills paid versus overdue to tune; an entry fee is a known option for a paid-entry life-sim.',
    ],
    verification: ['Simulate a week at low and high home value: bills never exceed income at the intended play rate.', 'Reload a saved plot: the object budget and contents match.'],
    failureModes: ['Fixed-number bills that outrun income at high home value.', 'Uncapped relief items that zero the bill.'] },

  // Researched 2026-10-04 (research/roblox/07-anim-audio-vfx.md): animation, audio, effects and game feel. Numbers tagged [OWN] in
  // the note are starting values never rendered or heard by the researcher: screenshot and listen, then tune. The plugin create
  // allowlist omits Animator, IKControl, Explosion and the new audio classes (AudioPlayer, AudioEmitter, AudioListener,
  // AudioDeviceOutput, Wire, effects): those skills say a script (edit_script) creates them. Humanoid:LoadAnimation and
  // AudioPlayer.AssetId are deprecated and not used here.
  { id: 'anim-play-cache-chain-tracks', title: 'Play, cache and chain animations through the Animator', domain: 'gameplay', summary: 'Load each animation once per Animator, set priority, play with a fade and react to named markers.', refs: ['animationTrack'], keywords: ['animation', 'animator', 'animationtrack', 'priority', 'markers', 'play', 'cache', 'emote'],
    steps: [
      'Find the Animator with humanoid:FindFirstChildOfClass("Animator") (create one under a server-side creature Humanoid if missing; a non-humanoid rig uses an AnimationController). The Animator must be in Workspace. It is not on the create allowlist, so a script creates it.',
      'Make an Animation with AnimationId "rbxassetid://<id>" (catalog ids or the owner uploads; never invent ids); track = animator:GetTrackByAnimationId(id) or animator:LoadAnimation(anim); never Humanoid:LoadAnimation.',
      'Set track.Priority explicitly (Idle, Movement, Action; Action2 to Action4 only to override), Looped false for actions; track:Play(0.1, 1, 1); chain with track.Ended:Once.',
      'React to markers with track:GetMarkerReachedSignal("Hit"):Connect(...) and disconnect on Stopped; check track.Length > 0 before using lengths.',
      'Cancel with track:Stop(0.15); to adjust a fading track call Play() before AdjustWeight(). Play creature tracks on the server and player tracks from the owning client.',
    ],
    verification: ['Fire the action ten times: LoadAnimation ran once and no stale handler fires.', 'Another client sees the animation.'],
    failureModes: ['An animation not owned by the experience owner may not play for others.', 'Stop then AdjustWeight does nothing until Play.'] },
  { id: 'anim-default-locomotion-pack-override', title: 'Replace default locomotion with a catalog animation pack', domain: 'gameplay', summary: 'Edit the Animate script values from the server after the character appearance loads.', refs: ['animation'], keywords: ['walk animation', 'run animation', 'animate script', 'animation pack', 'idle', 'jump', 'locomotion', 'catalog'],
    steps: [
      'In a server Script on player.CharacterAppearanceLoaded get character:WaitForChild("Animate") and stop all playing tracks with track:Stop(0).',
      'Assign animateScript.run.RunAnim.AnimationId, walk.WalkAnim, jump.JumpAnim, fall.FallAnim and climb.ClimbAnim (and idle.Animation1 and Animation2) from one pack row; a documented Ninja row is run 656118852, walk 656121766, jump 656117878, fall 656115606, climb 656114359.',
      'Idle variants are picked by Weight values: Animation1.Weight 5 and Animation2.Weight 10 give 1/3 and 2/3.',
      'A custom replacement animation must end on a keyframe named End (case-sensitive) and be owned by the experience owner or shared with it.',
    ],
    verification: ['Spawn, respawn and join as a second client: everyone sees the new walk and run.', 'Check the rig type (R6 or R15) matches the pack.'],
    failureModes: ['Changing values on the client only, so others do not see it.', 'A pack for a different rig type.'] },
  { id: 'anim-creature-animation-controller-rig', title: 'Animate a rig without a Humanoid using AnimationController', domain: 'gameplay', summary: 'An AnimationController with a server-created Animator, level-of-detail throttling and hero exceptions.', refs: ['animatorClass'], keywords: ['creature animation', 'animationcontroller', 'creature', 'prop animation', 'PreferLodEnabled', 'rig'],
    steps: [
      'Under the rig add an AnimationController and an Animator on the server (neither is on the create allowlist; use a script).',
      'Load and play on the server so tracks replicate; an Animator created on a client does not replicate.',
      'Leave Animator.PreferLodEnabled true for crowds so distant rigs are throttled; set it false only for hero creatures.',
      'Use Animator.EvaluationThrottled to skip procedural offsets on frames where the pose was reused.',
    ],
    verification: ['Walk away from a crowd: distant rigs still animate acceptably.', 'A second client sees the playing track.'],
    failureModes: ['Using AnimationController:LoadAnimation, which is deprecated.', 'Disabling throttling for every creature.'] },
  { id: 'anim-marker-footsteps-and-impacts', title: 'Drive footsteps and impacts from animation markers', domain: 'gameplay', summary: 'Named markers on touch-down frames trigger pooled sounds and dust that stay in sync at any speed.', refs: ['animationEvents'], keywords: ['footsteps', 'animation marker', 'sound sync', 'impact', 'dust', 'FloorMaterial', 'event track'],
    steps: [
      'In the Animation Editor event track add FootstepL and FootstepR on the touch-down frames; connect track:GetMarkerReachedSignal per track.',
      'In the handler play a pooled 3D one-shot at the foot with PlaybackSpeed = 0.95 + math.random() * 0.1 and Emit(3) on a dust emitter [OWN].',
      'Vary the sound by humanoid.FloorMaterial.',
      'Markers fire on every client that plays the track: give your own character full volume and others a quieter emitter.',
    ],
    verification: ['Walk and sprint: sound stays on the foot contact at both speeds.', 'Missing markers fail safe with no error.'],
    failureModes: ['A marker handler that creates new sounds without pooling.', 'Every client playing every footstep at full volume.'] },
  { id: 'feel-tween-spring-procedural-motion', title: 'Add procedural motion with tweens and a small spring', domain: 'gameplay', summary: 'Bobbing, spinning and squash-pop with TweenService, and a spring for motion that retargets every frame.', refs: ['tween'], keywords: ['tween', 'spring', 'bob', 'spin', 'squash', 'collectible motion', 'easing', 'juice'],
    steps: [
      'Bob: tween Position by about 1 stud with TweenInfo.new(1.2, Sine, InOut, -1, true) [OWN]. Spin: in Heartbeat multiply the CFrame by CFrame.Angles(0, dt * math.rad(120), 0).',
      'Pop: tween Size to 1.2x and 0.8x in 0.08 s Quad Out, then to 1x in 0.25 s with Back Out [OWN].',
      'A Tween goal cannot change after creation and a second tween on the same property cancels the first; for interruptible motion write a small damped spring (damping below 1 overshoots) with dt clamped.',
      'Prefer one controller loop over tweening many parts every frame.',
    ],
    verification: ['Interrupt a pop mid-way: the part ends at the correct final size.', 'Frame time stays flat with many bobbing parts.'],
    failureModes: ['Recreating tweens every frame.', 'An unclamped dt that explodes the spring after a hitch.'] },
  { id: 'audio-2d-ui-and-music-playback', title: 'Play 2D interface and music sounds with AudioPlayer and Wire', domain: 'worldbuilding', summary: 'AudioPlayer to Wire to AudioDeviceOutput, one-shots destroyed on Ended and a pitch ladder for combos (script-built).', refs: ['audioObjects'], keywords: ['audio', 'AudioPlayer', 'Wire', 'AudioDeviceOutput', 'music', 'ui sound', 'one shot', 'pitch'],
    steps: [
      'These classes are not on the plugin create allowlist: a script (edit_script) creates them. Set SoundService.DefaultListenerLocation to Camera or Character so an output device exists.',
      'Per play create an AudioPlayer (Asset, never the deprecated AssetId; Volume), a Wire (SourceInstance = player, TargetInstance = AudioDeviceOutput), Parent under SoundService, Play(), and Destroy on Ended (Ended does not fire for looping or stopped players).',
      'Route through a bus AudioFader (Volume 0 to 3) when you have volume sliders; starting mix [OWN]: music 0.3 to 0.5, UI 0.4 to 0.6, effects 0.6 to 1.',
      'Combo pitch ladder: PlaybackSpeed = 1.0595 ^ comboIndex, capped at 12 steps; preload with a hidden player and wait for IsReady when latency matters.',
    ],
    verification: ['Play 50 one-shots: no leftover players or wires.', 'Check the mix on a phone speaker and headphones.'],
    failureModes: ['A Wire with a missing end stays disconnected (check Wire.Connected).', 'No listener or output, so nothing is heard.'] },
  { id: 'audio-3d-positional-emitter', title: 'Make a 3D positional sound with AudioEmitter', domain: 'worldbuilding', summary: 'Player, emitter and wire under a part, an explicit rolloff mode and a listener that exists (script-built).', refs: ['audioEmitterClass'], keywords: ['3d audio', 'positional sound', 'AudioEmitter', 'rolloff', 'attenuation', 'campfire', 'AudioListener', 'spatial'],
    steps: [
      'Script-create AudioPlayer (Asset, Looping for loops), AudioEmitter and a Wire from player to emitter under a part or Attachment; a Folder or Script parent is silent.',
      'Set DistanceAttenuationMode explicitly (InverseTapered or Linear) with DistanceAttenuationBounds, for example NumberRange.new(6, 60) for a fire [OWN]; the default Custom mode has no curve.',
      'Make sure a listener exists: DefaultListenerLocation Camera or Character creates listener, output and wire; None means build your own.',
      'Directional sources: SetAngleAttenuation({[0]=1,[90]=0.6,[180]=0.25}); AudioInteractionGroup limits who hears it.',
      'Create one-shots on the client for sub-100 ms feedback and destroy them on Ended.',
    ],
    verification: ['Walk toward and away: the volume curve matches the bounds.', 'Move behind an object with acoustic simulation off: nothing unexpected changes.'],
    failureModes: ['Relying on the default Custom curve that stays audible far away.', 'Server-created one-shots arriving late.'] },
  { id: 'audio-ambient-layers-music-ducking', title: 'Layer ambience and music with ducking and a limiter', domain: 'worldbuilding', summary: 'Looping layers plus random one-shots, three bus faders, crossfades and sidechain ducking (script-built, starting values).', refs: ['audioEffects'], keywords: ['ambience', 'music', 'ducking', 'sidechain', 'compressor', 'crossfade', 'limiter', 'mix'],
    steps: [
      'Layers: a 30 to 48 s base loop, a tonal loop and 10 to 30 short random clips (under about 10 s) at random intervals around the player; never repeat the same clip twice in a row.',
      'Buses [OWN]: Ambience AudioFader 0.3, Music 0.4, effects 0.9 into one AudioDeviceOutput; crossfade music by tweening two faders over 2 to 4 s.',
      'Ducking: music into an AudioCompressor Input and the voice or stinger player into its Sidechain pin (confirm with GetInputPins); Threshold -30, Ratio 6, Attack 0.05, Release 0.4 [OWN].',
      'Put an AudioLimiter last (MaxLevel -3 dB, Release 0.05 [OWN]) to protect ears on loud games.',
    ],
    verification: ['Trigger a stinger over music: the music dips and recovers smoothly.', 'Loudest moment stays under the limiter ceiling.'],
    failureModes: ['Very short loops are obvious.', 'Wrong sidechain pin name so ducking never happens.'] },
  { id: 'audio-zone-reverb-and-underwater-filter', title: 'Colour all sound by zone with reverb and a low-pass filter', domain: 'worldbuilding', summary: 'A post-listener chain whose filter and reverb values change by zone with short tweens (script-built).', refs: ['audioObjects'], keywords: ['reverb', 'underwater audio', 'cave echo', 'lowpass', 'AudioFilter', 'AudioReverb', 'zone audio', 'acoustic'],
    steps: [
      'Script-build AudioListener -> AudioFilter (FilterType Lowpass12dB, Frequency 20000, Q 0.707) -> AudioReverb -> AudioDeviceOutput, wired after the listener so it colours everything heard.',
      'Underwater: tween the filter Frequency from 20000 to about 900 over 0.3 s on entry and back on exit [OWN].',
      'Rooms [OWN]: small room DecayTime 1.2, WetLevel -10, DryLevel 0, HighCutFrequency 9000; hall DecayTime 3.5, WetLevel -8; cave DecayTime 8, WetLevel -6, LowShelfGain -6; tween between zones.',
      'Set Bypass true to switch an effect off cheaply; Acoustic Simulation (SoundService.AcousticSimulationEnabled) is off by default and unreliable on weak devices, so use it for atmosphere only.',
    ],
    verification: ['Cross each zone boundary: no click or jump in the sound.', 'Legacy Sound objects are unaffected by this chain (they need their own approach).'],
    failureModes: ['Competitive cues depending on acoustic simulation.', 'Reverb on legacy SoundService.AmbientReverb expected to affect new audio objects.'] },
  { id: 'vfx-fire-with-flicker-light', title: 'Build a looping fire with embers and a flickering light', domain: 'worldbuilding', summary: 'Two ParticleEmitters and a PointLight at one Attachment (starting values to screenshot and tune).', refs: ['effParticles'], keywords: ['fire', 'campfire', 'flames', 'embers', 'particle emitter', 'flicker', 'brazier light', 'brazier'],
    steps: [
      'Attachment at the flame base aimed up. Emitter Flames: Texture rbxasset://textures/particles/explosion01_core_main.dds, Color 255,200,90 to 255,110,20 to 120,30,10, Size 0.8 to 1.6 to 0.2, Transparency 0.35 to 0.55 to 1, Lifetime 0.5 to 0.9, Speed 2 to 4, SpreadAngle 12, Acceleration (0,5,0), Drag 1.5, Rate 30, Rotation 0 to 360, LightEmission 1, LightInfluence 0.',
      'Emitter Embers: sparkles_main.dds, Size 0.3 to 0, Lifetime 1 to 2, Speed 2 to 5, SpreadAngle 30, Acceleration (0.5,3,0), Rate 6, LightEmission 1.',
      'PointLight on the same attachment: Color 255,150,60, Brightness 1.8, Range 14, Shadows off; flicker each Heartbeat with Brightness = 1.8 + math.noise(os.clock() * 6) * 0.8.',
      'Add a 3D crackle loop with emitter bounds about 4 to 40; set Transparency to end at 1 on every sequence.',
    ],
    verification: ['Screenshot at night and at noon: flames glow at night and do not pop.', 'Live particles stay near Rate times Lifetime (about 20 per emitter here).'],
    failureModes: ['Default Transparency never fades particles.', 'Many shadowed lights.'] },
  { id: 'vfx-smoke-loop', title: 'Build a looping smoke plume that stays cheap', domain: 'worldbuilding', summary: 'One emitter with grey puffs that fade in and out and respect overdraw (starting values).', refs: ['effParticles'], keywords: ['smoke', 'flue', 'plume', 'particles', 'overdraw', 'wreck', 'steam'],
    steps: [
      'ParticleEmitter with Texture smoke_main.dds, Color 110,110,115 to 60,60,65, Size 1.5 to 6, Transparency 1 to 0.5 at 0.15 to 1.',
      'Lifetime 3 to 5, Speed 2 to 3, SpreadAngle 15, Acceleration (0.5,1,0) for wind, Drag 0.8, Rate 7, Rotation 0 to 360, RotSpeed -20 to 20.',
      'LightEmission 0 and LightInfluence 0.8 so it darkens in shadow; ZOffset -0.5 to sit behind fire.',
      'Live count is Rate times Lifetime (about 28 here); do not exceed that by an order of magnitude on phones.',
    ],
    verification: ['Stack three plumes: frame time stays acceptable on the phone profile.', 'The puff fades fully before it disappears.'],
    failureModes: ['Large overlapping translucent puffs are the main overdraw cost.', 'LightEmission above 0 making smoke glow.'] },
  { id: 'vfx-sparkle-rare-shimmer', title: 'Add a twinkling shimmer to rare or special objects', domain: 'worldbuilding', summary: 'A sphere-volume sparkle emitter that twinkles in and out, with an optional slow Highlight pulse (starting values).', refs: ['effParticles'], keywords: ['sparkle', 'shimmer', 'rare item', 'glint', 'checkpoint effect', 'magic glow', 'highlight pulse'],
    steps: [
      'ParticleEmitter under the object part with Shape Sphere and ShapeStyle Volume (these shapes need a BasePart parent, not an Attachment).',
      'Texture sparkles_main.dds, Color white to 255,240,170 to 180,220,255, Size 0 to 0.5 to 0.4 to 0 (twinkle in and out), Transparency 0.1 to 1.',
      'Lifetime 0.8 to 1.6, Speed 0.2 to 0.8, SpreadAngle 180, Rate 9, Rotation 0 to 360, RotSpeed -60 to 60, LightEmission 1, LightInfluence 0.',
      'For key items pair it with a slow Highlight outline pulse (OutlineTransparency 0.3 to 0.8).',
    ],
    verification: ['View from 30 studs: the object reads as special but not noisy.', 'No sparkle remains after the object is destroyed.'],
    failureModes: ['Sphere shape under an Attachment renders wrongly.', 'Rate high enough to hide the object.'] },
  { id: 'vfx-magic-burst-one-shot', title: 'Build a one-shot magic burst with flash, ring and shards', domain: 'worldbuilding', summary: 'Three disabled emitters fired with Emit, a fading light and a paired sound (starting values).', refs: ['effParticles'], keywords: ['burst', 'one shot', 'spell', 'level up', 'impact', 'Emit', 'shockwave', 'magic'],
    steps: [
      'Three emitters with Enabled false and Rate 0. Flash: sparkles_main, Color 210,150,255, Size 2 to 6 to 7, Lifetime 0.3, Speed 0, LightEmission 1, Emit 1. Ring: explosion01_shockwave_main.dds, Size 1 to 10, Lifetime 0.5, Orientation VelocityPerpendicular, Emit 1 (check it lies flat).',
      'Shards: sparkles_main, Size 0.8 to 0, Lifetime 0.4 to 0.8, Speed 14 to 24, SpreadAngle 180, Drag 5, RotSpeed -200 to 200, LightEmission 1, Emit 20.',
      'PointLight Color 200,140,255, Brightness 4, Range 18, tweened to 0 over 0.3 s then destroyed.',
      'Trigger by looping the container emitters with Emit(e:GetAttribute("EmitCount") or 16); pair a rising whoosh and an impact chime; clean up with task.delay(1.5, ...).',
    ],
    verification: ['Fire 20 bursts quickly: no leftover emitters or lights.', 'The burst reads on the phone profile.'],
    failureModes: ['Parenting the burst to something destroyed before the particles die.', 'Emit on a disabled emitter still spawns, so counts must be capped.'] },
  { id: 'vfx-collectible-grab-feedback', title: 'Combine glints, sound and a counter pulse for a collectible', domain: 'worldbuilding', summary: 'Server grants once; the client plays glints, a rising ding, a shrink and a UI pulse (starting values).', refs: ['effParticles'], keywords: ['collectible grab', 'collect', 'reward feedback', 'glint', 'currency', 'sound pitch', 'juice', 'counter'],
    steps: [
      'Collectible part Anchored, CanCollide false, CanTouch true, bobbing and spinning; the server validates and grants once (debounce), then fires clients with the position.',
      'Client: glint emitter sparkles_main, Color 255,236,140 to 255,190,40, Size 0.9 to 0, Lifetime 0.6 to 1.1, Speed 10 to 18, SpreadAngle 55, Acceleration (0,-30,0), LightEmission 1, Emit(16).',
      'Sound: a 0.2 to 0.5 s bright ding with PlaybackSpeed rising 1.0595 per consecutive grab within 1.5 s; shrink the collectible to 0 in 0.12 s with Back In, then Destroy.',
      'UI counter: UIScale 1 to 1.2 to 1 in 0.15 s and the number tweening up over 0.25 s.',
    ],
    verification: ['Collect 30 in a second: one grant each, a capped number of sounds and emits per frame.', 'Spectators see the collectible vanish.'],
    failureModes: ['Granting on the client.', 'Unpooled sounds for every collectible.'] },
  { id: 'vfx-explosion-visual-sound-shake', title: 'Build an explosion with no physics side effects', domain: 'worldbuilding', summary: 'Particle fireball, shockwave, sparks and smoke, a light, a sound and shake, with damage handled yourself (starting values).', refs: ['explosionClass'], keywords: ['explosion', 'bomb', 'rocket', 'blast', 'shockwave', 'camera shake', 'BlastPressure', 'destruction'],
    steps: [
      'Do not use the default Explosion for looks (it kills Humanoids, breaks joints and carves terrain). Emitters disabled, Rate 0: Fireball explosion01_core_main (Size 3 to 9 to 11, Lifetime 0.5 to 0.8, emit 14), Shockwave ring (Size 2 to 26, Lifetime 0.45, emit 1), Sparks (Speed 35 to 60, Acceleration (0,-40,0), emit 40), Smoke (Size 4 to 14, Lifetime 2 to 3.5, emit 12).',
      'PointLight Brightness 6, Range 40 tweened to 0 in 0.25 s; placeholder sound rbxasset://sounds/impact_explosion_03.mp3 through a 3D emitter (bounds 10 to 300).',
      'Camera shake trauma +0.6 scaled by 1 - distance / 80.',
      'Damage and force on the server from your own radius query; if an Explosion object is used set BlastPressure 0, DestroyJointRadiusPercent 0, ExplosionType NoCraters and Visible false (it is created by script, not on the allowlist).',
    ],
    verification: ['Stand inside the blast: no unintended joint breaks or terrain craters.', 'Cap simultaneous explosions and watch frame time.'],
    failureModes: ['Default Explosion physics on a visual effect.', 'Shockwave ring orientation not checked in Studio.'] },
  { id: 'vfx-rain-follow-emitter', title: 'Make rain that follows the player within platform caps', domain: 'worldbuilding', summary: 'A transparent emitter part kept above the camera, lower rates on touch devices and a cover check (starting values).', refs: ['effParticles'], keywords: ['rain', 'weather', 'storm', 'particles', 'follow camera', 'mobile cap', 'streaks'],
    steps: [
      'Anchored part (Transparency 1, CanCollide false, CanQuery false, about 90 x 1 x 90) kept about 45 studs above the camera by a per-frame update.',
      'ParticleEmitter: Texture SquareParticle.png, Shape Box, EmissionDirection Bottom, Orientation VelocityParallel, Color 190,210,235, Size 0.25, Squash -2 (verify vertical streaks), Lifetime 0.9 to 1.1, Speed 70 to 80, SpreadAngle 2, LightEmission 0.2, LightInfluence 0.',
      'Rate 300 on desktop and 90 on touch devices; the documented caps are 400 per second (100 on mobile) per emitter.',
      'Looping rain sound on the 2D bus at about 0.3, behind a low-pass indoors; under cover use a raycast check or a cover-zone Enabled toggle. Fog and Atmosphere add more mood than extra particles.',
    ],
    verification: ['Walk under cover: rain stops there.', 'Rate on a phone profile stays within the cap.'],
    failureModes: ['A rate over the cap is clamped silently.', 'Ground splash emitters on mobile.'] },
  { id: 'vfx-dust-puffs-movement', title: 'Add dust puffs to landings, footsteps and rides', domain: 'worldbuilding', summary: 'A small low-count emitter fired on events and coloured from the floor (starting values).', refs: ['effParticles'], keywords: ['dust', 'landing', 'footsteps', 'puff', 'movement feedback', 'smoke_main', 'speed'],
    steps: [
      'ParticleEmitter on an Attachment at the feet: Texture smoke_main.dds, Color 190,165,130 to 150,130,100, Size 0.8 to 2.5, Transparency 0.5 to 1, Lifetime 0.5 to 0.9, Speed 2 to 4, SpreadAngle 70, Drag 3, LightInfluence 0.8, Enabled false.',
      'On Humanoid.StateChanged to Landed (or a footstep marker) call Emit(5); Emit 8 to 10 for hard landings above a fall-speed threshold.',
      'For rides: Enabled with Rate about 22 while speed is above 10, VelocityInheritance 0.3.',
      'Pick the colour from the floor material or terrain colour; keep counts small and always fade to 1.',
    ],
    verification: ['Land from three heights: puff size follows the height.', 'No emitters accumulate after respawn.'],
    failureModes: ['Same tan dust on grass and snow.', 'Large Emit counts on every footstep.'] },
  { id: 'vfx-melee-dash-trails', title: 'Add a trail to melee swings and dashes', domain: 'worldbuilding', summary: 'A short additive Trail between two attachments, enabled only during the action (starting values).', refs: ['effTrails'], keywords: ['trail', 'swing', 'slash', 'dash', 'speed trail', 'melee', 'attachment'],
    steps: [
      'Two Attachments about 3 studs apart on the blade (tip and guard), or on the back for a dash.',
      'Trail Attachment0 and Attachment1, Lifetime 0.3, MinLength 0.1, Color white to 120,200,255, Transparency 0.2 to 1, WidthScale 1 to 0, LightEmission 1, FaceCamera true, no texture.',
      'Enable at swing start (marker or event), disable at the end, and Clear() when unequipped or after a teleport.',
      'Add a 0.06 s hit-stop and 0.25 trauma shake on hit (see the game feel kit).',
    ],
    verification: ['Swing repeatedly: the trail appears only during the swing.', 'Teleport the owner: no streak is drawn.'],
    failureModes: ['Changing attachments while drawing erases segments.', 'A trail left enabled draws constantly.'] },
  { id: 'vfx-beams-lasers-tethers-lightning', title: 'Build beams for lasers, tethers and lightning', domain: 'worldbuilding', summary: 'Two attachments, a camera-facing additive Beam, and per-tick curve changes for lightning (starting values).', refs: ['effBeams'], keywords: ['beam', 'laser', 'tether', 'lightning', 'energy', 'healing link', 'attachments'],
    steps: [
      'Two different Attachments; Beam Attachment0 and Attachment1, Width0 0.3, Width1 0.3, LightEmission 1, FaceCamera true (a beam is a flat ribbon), Transparency 0 to 0.2 to 1, Segments 10 straight or 20 curved.',
      'Lightning: every 0.05 s set CurveSize0 and CurveSize1 to math.random(-6, 6) and flash Width between 0.2 and 0.5.',
      'Textured energy: TextureMode Wrap, TextureLength 4, TextureSpeed 2.',
      'A beam does not render unless both attachments exist; hide by disabling, not by removing one end.',
    ],
    verification: ['Orbit the camera: the beam stays visible from every angle.', 'Destroy one end: the beam is cleaned up.'],
    failureModes: ['Flat beam seen edge-on without FaceCamera.', 'Per-frame random curves with no cap on active beams.'] },
  { id: 'vfx-interactive-highlight', title: 'Use one reusable Highlight for hover, selection and teams', domain: 'worldbuilding', summary: 'A single Highlight whose Adornee moves, with explicit fill and outline values and well under the 255 cap (starting values).', refs: ['effHighlight'], keywords: ['highlight', 'outline', 'hover', 'selection', 'team colour', 'adornee', 'interactable'],
    steps: [
      'Create one Highlight; on hover set Adornee = target, FillTransparency 1, OutlineColor 255,235,90, OutlineTransparency 0, DepthMode Occluded.',
      'Teammates through walls: DepthMode AlwaysOnTop, FillTransparency 0.8, team colour.',
      'Remove by Adornee = nil or Enabled false; delete permanent ones you no longer use. Always set the transparencies explicitly (the guide and engine defaults disagree).',
      'Up to 255 display at once and disabled ones still count; creating and destroying per hover causes spikes, and the first visible highlight costs most on phones.',
    ],
    verification: ['Hover across 100 objects quickly: no frame spikes.', 'Highlights never exceed a small budget in a busy scene.'],
    failureModes: ['One new Highlight per hover.', 'Nested highlighted objects drawing wrongly.'] },
  { id: 'feel-game-feel-kit', title: 'Add a game feel kit: shake, FOV kick, hit-stop and squash', domain: 'gameplay', summary: 'Short, subtle feedback on every important action with a comfort toggle (starting values).', refs: ['camera'], keywords: ['game feel', 'juice', 'camera shake', 'fov kick', 'hit stop', 'squash', 'trauma', 'feedback'],
    steps: [
      'Camera shake by trauma: add 0.2 to 0.3 for hits and 0.5 to 0.7 for explosions, decay about 1.5 per second, strength = trauma squared; bind at Enum.RenderPriority.Camera.Value + 1 [OWN].',
      'FOV kick: tween Camera.FieldOfView from 70 to about 78 over 0.15 s Quad Out on sprint or dash, back over 0.3 s.',
      'Hit-stop 0.04 to 0.10 s by AdjustSpeed(0) on attacker and target tracks, then restore the exact previous speed.',
      'Squash and stretch cosmetic parts to (1.2, 0.8, 1.2) then back with Back or Elastic easing in 0.2 to 0.35 s; put sound and flash on the same frame as the hit.',
      'Offer a settings toggle to reduce shake; shake and bob can cause motion sickness.',
    ],
    verification: ['Hit repeatedly: speeds always return to their previous values.', 'With reduced shake on, the camera stays steady.'],
    failureModes: ['Over-shaking or heavy hit-stop that looks choppy.', 'Freezing animations on the authoritative character without matching physics.'] },
  { id: 'vfx-replicate-one-shot-effects-safely', title: 'Replicate one-shot effects without trusting the client', domain: 'client_server', summary: 'The client requests, the server validates and broadcasts, and each client plays a pooled local copy.', refs: ['remotes'], keywords: ['effects replication', 'FireAllClients', 'vfx', 'ability effect', 'hit effect', 'client side effects', 'cleanup'],
    steps: [
      'The acting client sends a RemoteEvent request; the server validates cooldown, range and hit and applies damage.',
      'The server then calls FireAllClients(effectName, cframe) (or FireClient for personal effects).',
      'Each client clones the effect from ReplicatedStorage, parents it to Workspace, Emits and cleans up with task.delay.',
      'The acting client may play its own copy at once and ignore the echo; never replicate hitboxes from clients.',
    ],
    verification: ['Two clients see the effect once each; the actor sees it immediately.', 'Spam the request: the server limits broadcasts.'],
    failureModes: ['Server-side effects that raise load and ping.', 'Accepting client-supplied effect positions as hit proof.'] },
  { id: 'monetize-tip-jar-robux-transfer', title: 'Add an optional tip jar with the Robux transfer prompt', domain: 'game_design', summary: 'A small, no-reward tip option using the transfer API, with receipts handled once and the Plus and cap limits explained to the player.', refs: ['robloxPlus'], keywords: ['tip jar', 'donation', 'robux transfer', 'PromptRobuxTransferAsync', 'BindReceiptHandler', 'support creator'],
    steps: [
      'Only as a side feature: the sender needs Roblox Plus, the creator receives 10 percent (the recipient 90 percent), so it is not a core income source; tips must give the tipper nothing in return and an experience must never be only a donation app.',
      'After a client request the server calls MarketplaceService:PromptRobuxTransferAsync(sender, receiverUserId, amount) with amounts in the documented 10 to 500 per transaction range.',
      'Handle receipts with MarketplaceService:BindReceiptHandler(Enum.ReceiptType.RobuxTransferSender or RobuxTransferReceiver, handler); the receipt carries PlayerId and TransferRequestId, and the handler returns Enum.ReceiptDecision.Processed or NotProcessedYet; record the id so it runs once.',
      'Tell the player about the Plus requirement and the caps (5,000 a day and 10,000 a month with two-step verification); under-18 senders need parental approval.',
    ],
    verification: ['A failed prompt leaves no state change and shows a clear message.', 'Replaying the same receipt records one thank-you only.'],
    failureModes: ['Granting items for tips, which turns it into a sale or a banned donation scheme.', 'Treating the tip as meaningful income.'] },

  // Researched round 2, 2026-10-04 (research/roblox/12-23)
  // Round-2 rule: numbers the notes call derived, heuristic, kit, third-party, [OWN] or tune-me are starting points to test,
  // never facts; anything a note marks unverified is left out. Genre patterns list two kits on purpose so the per-genre
  // profile (exactly 8 genre tasks) is untouched.

  // --- note 12: simulators, incremental/idle and collecting/roll games ---
  { id: 'pattern-sim-project-skeleton-config-services', title: 'Lay out a data-driven simulator: config modules, services, one stats function', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'Numbers live in Config modules, services run on the server, one getStats(player) computes derived stats and the UI reads Attributes.', refs: ['saveData'], keywords: ['skeleton', 'config', 'services', 'getstats', 'attributes', 'architecture', 'vertical slice', 'data driven'],
    steps: [
      'ReplicatedStorage/Shared/Config holds ModuleScripts (Currencies, Zones, Eggs, Upgrades, Potions, Ranks, Rebirths, Passes); ReplicatedStorage/Remotes the remotes; ServerScriptService/Services one service per system; StarterPlayerScripts/Controllers the UI, pets and effects. No tunable number lives in a service.',
      'Player data is plain tables: coins, gems, rebirths, zone, pets = {[uid] = {id, variant, level}}, equipped, upgrades, potions, lastSeen, index. Persist one profile, never one key per stat.',
      'One getStats(player) on the server computes the coins multiplier, luck, damage, hatch count and slots and publishes them as Attributes on the Player; the UI reads Attributes and buttons only call remotes.',
      'One Heartbeat accumulator (not a loop per pet) pays income once a second; the server re-validates cost, zone and slots on every remote. Stub every system, then fill one slice: gain loop, a zone, two eggs, three tracks.',
    ],
    verification: ['Change one Config number: UI, cost check and payout follow with no code edit.', 'Search every LocalScript: none computes a price, luck or payout.'],
    failureModes: ['Logic in LocalScripts, or one number copied into the UI and the server.', 'A DataStore key per stat burns the 60 + 40 x players per minute budget.'] },
  { id: 'pattern-sim-breakable-nodes-respawn-cap', title: 'Spawn breakable nodes with server validation, respawn and a live cap', domain: 'genre_pattern', genres: ['simulator', 'adventure'], summary: 'Tagged breakables with Value and Health, a validated hit, a backpack-limited gain, a sell pad and a bounded respawn.', refs: ['collection'], keywords: ['breakable', 'mining', 'nodes', 'respawn', 'backpack', 'sell pad', 'collectionservice', 'gain loop'],
    steps: [
      'Tag each node Part Breakable with CollectionService and give it Attributes Value and Health; bind a ProximityPrompt (HoldDuration 0) or auto-target the nearest node from the equipped helpers.',
      'The server handler checks distance (about 15 studs) and a cooldown (0.08 s is the kit value, a heuristic), then adds value x getStats().gain to the backpack up to backpackCap.',
      'A sell pad (Touched or ProximityPrompt) converts the backpack to coins; auto-sell is a pass. Capacity, gain and speed are upgrade tracks.',
      'Zones are gated by coins or the previous rebirth and each raises node value roughly 3x to 8x (kit heuristic).',
      'Respawn on a timer with a cap on live nodes per zone; a shipped example reports 0.05 s respawn and 25 to 50 live per zone, so treat those as numbers to test.',
    ],
    verification: ['Fire the hit remote from far away and faster than the cooldown: nothing is added.', 'Sell more than the backpack holds, then count live nodes after ten minutes: both stay within their caps.'],
    failureModes: ['Hit counts or positions are taken from the client.', 'Unbounded part counts from respawns with no live cap.'] },
  { id: 'pattern-sim-upgrade-tracks-bulk-buy', title: 'Build upgrade tracks with shrinking bonuses and closed-form bulk buy', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'Fixed tiers with rising cost and falling gain, or generators with cost = base x growth^owned and an O(1) Buy Max.', refs: ['gdEconomy'], keywords: ['upgrades', 'tiers', 'bulk buy', 'buy max', 'growth', 'cost curve', 'payback', 'generator'],
    steps: [
      'Per track Config: costs = {700, 2500, 7500, 75000, 750000, 5e6, 15e6} and gains = {10, 10, 10, 10, 5, 5, 5} (7 to 9 tiers, cost ratio about 4x to 5.5x per tier, total +25% to +55%, the shipped shape).',
      'For repeatable generators use cost = base x growth^owned with growth 1.07 to 1.15; derive growth from the wait you want. Use math.pow, never repeated multiplication.',
      'Server buyUpgrade(player, track): check tier < max, deduct, increment, recompute stats. Bulk cost of n more is b x r^k x (r^n - 1) / (r - 1) and the most affordable is floor(log_r(c(r-1)/(b r^k) + 1)), so Buy Max is O(1).',
      'Set income so next-tier cost / income stays about 100 to 300 s (a payback of 2 to 5 minutes, derived).',
      'Show next cost, next gain and cost per percent so the decay is visible; mastery perks may discount (-15%, -30%, -50% at levels 30, 80, 99 in one shipped game).',
    ],
    verification: ['Run a script that buys every tier: the payback column stays in the 100 to 300 s band.', 'Buy Max matches buying one at a time for n = 1, 10 and 100.'],
    failureModes: ['Every tier gives the same gain (no reason to stop) or an explosive gain (income runs away).', 'Floating-point drift from repeated multiplication.'] },
  { id: 'pattern-sim-hatch-variants-expected-attempts', title: 'Add independent variants, skip and expected-attempt maths to egg hatching', domain: 'genre_pattern', genres: ['simulator', 'adventure'], summary: 'Hatch with a server Random, roll variants as separate chances, cap the hatch count and tell players the expected tries.', refs: ['randomDatatype'], keywords: ['hatch', 'egg', 'variants', 'shiny', 'expected attempts', 'rarity', 'skip animation', 'auto hatch'],
    steps: [
      'Eggs[id] = {price, currency, pets = {{id, weight, rare}...}} with 3 to 6 entries and raw weights (a shipped example uses 70, 29, 1, 0.1, 0.002). Rarest standard entry 0.1% (1 in 1,000) in mid-game eggs, 0.002% (1 in 50,000) for a chase pet, below 0.0001% only for event or endgame eggs.',
      'Server hatch(player, eggId, count): validate currency, zone unlock and count <= hatchSlots, roll with a server Random object, then roll each variant (gold, rainbow, shiny) as its own independent chance after the pet roll.',
      'Expected attempts: P(hit within k tries of 1 in N) = 1 - (1 - 1/N)^k; 50% needs 0.693 N tries, 90% needs 2.303 N, 99% needs 4.605 N. Show the odds, not the tries, in the UI.',
      'Let players skip the animation; auto-hatch and faster hatch are perks unlocked by rebirth or mastery (+20%, +35% speed in one shipped game).',
      'Pity or guarantees are optional; if sold they are probability modifiers under the paid random items rules.',
    ],
    verification: ['Run 100,000 server rolls: variant and pet frequencies match the configured chances.', 'Hatch count above the slot limit and an unlocked-zone egg are both refused.'],
    failureModes: ['The odds display is built separately from the roller.', 'Client-side rolls, or luck that pushes the shown total past 100%.'] },
  { id: 'pattern-sim-pet-equip-multiplier-stacking', title: 'Stack pet bonuses with equip slots and client-side followers', domain: 'genre_pattern', genres: ['simulator', 'adventure'], summary: 'The server owns pets and equipped ids, bonuses add inside a category and multiply across categories, and pets are drawn on clients only.', refs: ['workspaceClass'], keywords: ['pets', 'equip', 'multiplier', 'stacking', 'index', 'fuse', 'followers', 'slots'],
    steps: [
      'The server owns pets and equipped; equip checks #equipped < equipSlots (ranks raise slots, passes add more). Cap equipped pets, hatch count and enchant slots by rank and sell extra slots as passes.',
      'Combined multiplier on the server: add pet bonuses inside one category, then multiply categories, for example (1 + sum(pets)) x (1 + rebirthBonus) x (1 + potionBonus); write down which parts are additive and which multiplicative.',
      'Replicate equipped ids as Attributes; each client spawns visuals for nearby players only, positions them with a frame-rate independent lerp each Heartbeat and turns cast shadows off. Community advice is not to exceed about 300 loaded pets (third-party).',
      'Variants multiply stats; combining N copies into one higher tier needs a capped supply for the top tier.',
      'An index records first-seen pets and pays a permanent bonus per completed page.',
    ],
    verification: ['Equip one more pet than slots allow from a script: refused.', 'Ten players with full loadouts in view keep a steady frame rate.'],
    failureModes: ['Server-side tweening of pets looks laggy.', 'Additive and multiplicative bonuses mixed by accident make balance unpredictable.'] },
  { id: 'pattern-sim-zone-egg-ladder', title: 'Order zones and eggs so the next egg is always a short walk', domain: 'genre_pattern', genres: ['simulator', 'adventure'], summary: 'Each zone has its own coin, a gate and its best egg at the front door, with one signature thing to break repetition.', refs: ['gdCoreLoops'], keywords: ['zones', 'worlds', 'egg ladder', 'gate', 'progression map', 'currency per world'],
    steps: [
      'Zones[n] = {name, currency, gate, maxEgg, breakables}; maxEgg rises about linearly with zone (2, 14, 28, 63, 112 at zones 1, 10, 20, 50, 99 in one shipped game, a number to test, not copy).',
      'Give each world its own coin so old money cannot trivialise new worlds; a rebirth can drop the player at a world spawn.',
      'Unlock by paying the zone gate once or by reaching the previous zone stat, and show the next zone as a visible goal.',
      'Put each zone best egg at the front door of that zone.',
      'Add one signature thing per zone (a boss, a mini-event, a chest).',
    ],
    verification: ['A new player can name the next goal and walk to its egg in under a minute.', 'Zone payouts differ and no zone is skipped by buying the last gate.'],
    failureModes: ['All zones pay the same.', 'Eggs unlocked far from where players farm.'] },
  { id: 'pattern-sim-timed-boosts-potions', title: 'Add timed boosts that store an expiry timestamp', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'Linear tiers, an expiresAt Unix timestamp per kind, server-set Attributes and a client countdown from server time.', refs: ['workspaceClass', 'gdEconomy'], keywords: ['boost', 'potion', 'buff', 'timer', 'expiresat', 'luck', 'getservertimenow'],
    steps: [
      'Config per family with linear tiers: power = tier x step and duration = 600 + 600 x (tier - 1) seconds (a shipped luck potion: +25% and +600 s per tier; coins +20% per tier).',
      'Store expiresAt as a Unix timestamp per kind; refreshing adds time or keeps the stronger tier. Never store "seconds left".',
      'The server sets player:SetAttribute("LuckUntil", expiresAt) and LuckPower; the client counts down with workspace:GetServerTimeNow().',
      'Combine buffs by category (additive inside, multiplicative across) and cap them.',
      'If luck is sold for Robux, the paid random items rules apply: show the luck-adjusted odds.',
    ],
    verification: ['Rejoin after the expiry: the buff is gone. Rejoin before it: it resumes with the right time left.', 'Two potions of one kind never stack past the cap.'],
    failureModes: ['A timer that pauses offline when you meant it to run (decide and state it).', 'A buff that survives a server shutdown with no stored expiry.'] },
  { id: 'pattern-sim-rebirth-archetypes-cycle-check', title: 'Choose a rebirth archetype and check its cycle time first', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'Three archetypes (feature gate, +1x money step, capacity currency) and a secondsToAfford check before shipping.', refs: ['gdEconomy'], keywords: ['rebirth', 'prestige', 'archetype', 'cycle time', 'reset', 'permanent bonus'],
    steps: [
      'Pick one: (A) feature gate, +75% linear per rebirth, nine rebirths, each unlocking systems, gated by zone number; (B) +1x money and +1 slot, cost x50 per step, requires a named hatched pet; (C) capacity currency, 1T then +2T more each time, pays for slots, keeps most money. These are numbers from shipped games to test, not to copy.',
      'Server rebirth(player): verify the requirement, reset coins, zone and purchased luck, keep pets, index, passes and the upgrades you declare permanent, increment rebirths, grant the unlock.',
      'Cycle check: secondsToAfford(cost, balance, perSecond); tune the first rebirth to 15 to 25 minutes (heuristic) and keep later cycles from growing faster than content delivery.',
      'For a lifetime-based gain use floor((E / E0)^k): k = 1/2 needs 4x earnings to double, 1/3 needs 8x.',
      'A confirmation dialog lists what resets and what stays and previews the next unlock list.',
    ],
    verification: ['Print cycle time for rebirths 1 to 20: finite and gently rising.', 'After a rebirth, paid items and the index are still owned.'],
    failureModes: ['Multiplier smaller than the cost step with no new income source: the cycle diverges.', 'Purchased items reset without warning.'] },
  { id: 'pattern-sim-offline-away-payout', title: 'Pay offline progress on join with a cap, a rate and an away screen', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'A saved lastSeen and saved per-second rate give a clamped payout, shown once with an optional rewarded doubler.', refs: ['rewardedVideo'], keywords: ['offline', 'away', 'lastseen', 'idle', 'welcome back', 'double it', 'rewarded video'],
    steps: [
      'Save lastSeen = DateTime.now().UnixTimestamp on autosave (every 60 s) and on PlayerRemoving; bind a save in BindToClose.',
      'On join: away = clamp(now - lastSeen, 0, cap) and gain = perSecond x away x rate, cap 8 to 24 h and rate 25% to 100% (heuristic kit values; one idle game claims 100%). Compute perSecond from the saved loadout on the server only.',
      'Show an away screen once with time, amount and a Claim button; ignore negative or implausible away values (clock skew).',
      'Optional doubler: a developer product reward (not random, worth about 3 to 10 Robux) shown only after AdService:GetAdAvailabilityNowAsync returns IsAvailable; grant the doubled payout in ProcessReceipt when receipt.ProductPurchaseChannel == Enum.ProductPurchaseChannel.AdReward, never from the call return.',
    ],
    verification: ['Move lastSeen back by a known interval and rejoin: the payout matches the capped formula once.', 'No ad available: the doubler button is hidden.'],
    failureModes: ['Client-supplied time, or paying for items bought seconds before leaving.', 'No cap, which removes the reason to return.'] },
  { id: 'pattern-sim-roll-game-luck-biomes', title: 'Build a roll game: rare-first resolution, capped luck and timed biomes', domain: 'genre_pattern', genres: ['simulator', 'adventure'], summary: 'One button rolls a rarity; luck and roll speed are the progression, with a capped probability, skippable reveals and rarities that can be spent.', refs: ['prodPaidRandom'], keywords: ['roll', 'rng', 'aura', 'luck', 'biome', 'auto roll', 'crafting', 'rarity table'],
    steps: [
      'A module table of 100+ entries from 1 in 2 to 1 in 1e9 with name, odds N and tier colour; a hard cap on effective probability per entry (a third-party guide cites 50%).',
      'Roll on the server every rollCooldown (3.0 to 3.2 s base, 1.2 s with a 100 Robux quick-roll pass, 1.5 s in a speed biome: third-party). Chance for entry i = min(0.5, luck / N_i), resolved from the rarest entry downward; the reveal is tier-sized and skippable.',
      'Luck sources (gear and potions additive, biome 5x to 10x on native entries, a pass) are combined in one documented module.',
      'A server timer swaps the active biome every N minutes with weighted selection (rare ones about 1 in 30,000 per change, third-party); off-biome rolls of native entries are announced as breakthroughs.',
      'Add auto-roll, a roll counter, a personal best, server announcements for rare finds, and crafting recipes that consume entries so rarities are spendable. Disclose odds if any luck is sold.',
    ],
    verification: ['Roll a million times in a script: frequencies match 1/N within tolerance and no entry exceeds the cap.', 'Skip the reveal on a rare result: the item is still granted once.'],
    failureModes: ['Luck so strong top tiers arrive in hours (derived: 1 in 1M at luck 36 is still about 25 hours).', 'Long unskippable animations and client-side rolling.'] },
  { id: 'pattern-sim-passive-income-constant-payback', title: 'Price a passive-income ladder so every rarity pays back in 100 to 300 seconds', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'Eight to ten rarities with cost/income held in a band, weighted spawns, mutations as multipliers and small servers.', refs: ['gdEconomy'], keywords: ['passive income', 'payback', 'rarity ladder', 'mutations', 'conveyor', 'plot slots', 'hatch and earn'],
    steps: [
      'Define 8 to 10 rarities; for each set cost and income so cost / income falls between 100 and 300 s (derived from one shipped ladder: 111 to 300 s from common to top).',
      'A conveyor or egg source spawns by weighted rarity; rarer tiers use slower timers (reported: a fifth tier about every 5 minutes, the top about every 15).',
      'A plot has N slots; one server loop sums income x mutationMultiplier per player each second.',
      'Mutations multiply income (1.25x to 3x in one third-party list; weather x2 to x100 in another) and are weighted by rarity.',
      'A stat gate (speed trained on a treadmill) can control map access; keep servers small (4 to 10 players) so events feel personal.',
    ],
    verification: ['Print cost / income for every rarity: all inside the band, or the outlier is chosen on purpose.', 'The income loop is one server loop, not one per unit.'],
    failureModes: ['Payback that drifts to hours on the top tier.', 'Unbounded luck on the spawn table.'] },
  { id: 'pattern-sim-rank-goal-ladder-capacity', title: 'Unlock capacity through a rank and goal ladder', domain: 'genre_pattern', genres: ['simulator', 'adventure'], summary: 'Ranks need stars earned from measurable goals and reward pet, egg and enchant slots.', refs: ['gdCoreLoops'], keywords: ['rank', 'goals', 'stars', 'capacity', 'slots', 'mid-term goals', 'quests'],
    steps: [
      'Config of ranks: starsRequired (4 at rank 1 up to 26) and a goal pool with star weights 1 to 4; keep 2 to 4 goals active (one shipped game).',
      'Goals are measurable counters (break X, hatch Y, collect Z) progressed only by the server.',
      'Rank-up grants petSlots, eggSlots and enchantSlots (one game totals 80 pet and 83 egg slots over 40 ranks, derived) plus small item rewards per star threshold.',
      'Show a progress ring in the interface.',
    ],
    verification: ['Complete a goal from a script that fakes the client event: no progress.', 'Rank-up raises exactly the configured slots once.'],
    failureModes: ['Goals that need Robux.', 'Ranks with no capacity reward, so nothing to want.'] },
  { id: 'pattern-sim-event-layer-currency-scarcity-ladder', title: 'Layer an event with its own currency, a capped item and a wide reward ladder', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'A separate event currency and shop, a temporary luck source, one scarce capped item, a timed contest with deep tiers and a social bonus.', refs: ['gdLiveOps'], keywords: ['event', 'event currency', 'scarce item', 'leaderboard rewards', 'social bonus', 'limited', 'live ops'],
    steps: [
      'Create a new event currency and shop (one shipped game has 59 currencies, mostly per event); event income must never be the main currency.',
      'Add a temporary luck or boost source (stacking win-streak luck, banked boosts up to 6 h).',
      'Add one scarce limited item with a hard cap (examples: 3,000 of the top pet, under 100 of a rarer one).',
      'Run a timed competition with a wide ladder: top 3, 4 to 10, 11 to 25, 26 to 100, then deep tiers to 5,000 or 10,000.',
      'Add a social bonus (+2% per friend up to +10%, clans of 3 or more). Model Value x Probability before launch and announce a week early on short video.',
    ],
    verification: ['Simulate the event: main-currency balance is unchanged and event currency sinks match its sources.', 'Server-side supply of the capped item stops at the cap.'],
    failureModes: ['Events that inject the main currency.', 'Ladders only the top 10 can win, or no cap on the scarce item.'] },
  { id: 'pattern-sim-big-number-format-exploit-basics', title: 'Format huge currencies and rate-limit every gain remote', domain: 'genre_pattern', genres: ['simulator', 'tycoon'], summary: 'Plain numbers below about 1e15, suffix formatting, a big-number module and string storage beyond that, plus per-player rate limits and outlier logs.', refs: ['clientBoundary'], keywords: ['large numbers', 'suffix', 'big number', 'rate limit', 'exploit', 'autoclicker', 'formatting'],
    steps: [
      'Keep currency a plain number below about 1e15 for exact integers and format for display with K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc, then scientific notation.',
      'For endless prestige or values past 1e300 adopt a big-number module and store it as a string; never save mantissa and exponent as separate unbounded numbers.',
      'Rate-limit every remote with a per-player os.clock() check, require sane arguments and clamp quantities (hatch count <= slots).',
      'Log earnings per player per minute and flag outliers in a daily server check. Client autoclicker detection is only a deterrent.',
    ],
    verification: ['Format 999, 1e3, 1e6 and 1e18 and compare with the expected suffixes.', 'Spam a gain remote from a script: only the cooldown rate is paid.'],
    failureModes: ['NaN or inf written into a save.', 'Trusting Humanoid events for gains.'] },
  { id: 'monetize-sim-pass-price-shape', title: 'Shape simulator passes and consumables around sourced price bands', domain: 'game_design', summary: 'Starting price bands for multiplier, luck, automation, capacity and VIP passes, consumables as developer products, seasonal passes that retire.', refs: ['prodPasses'], keywords: ['pricing', 'pass price', 'x2 cash', 'luck pass', 'auto collect', 'capacity pass', 'vip', 'anchor price'],
    steps: [
      'Start from bands read off first-party pass lists (derived): x2 currency 199 to 399 Robux, luck 199 to 800, automation 99 to 350, extra capacity 149 to 650, VIP 249 to 729, plus a few high anchors (2,400 and 3,250 in one game, 7,999 for admin commands in another). Treat all as starting points to test.',
      'Sell capacity and convenience (extra pet slots +15 for 375, +15 egg for 625 in one game) with a free path to the same thing.',
      'Consumables (potions, packs) are developer products; the pass endpoint does not list them.',
      'Retire seasonal passes (unlist them) and never show a sale prompt on first load.',
    ],
    verification: ['Every priced item shows the live price from GetProductInfo, not a typed number.', 'First join shows no purchase prompt before the first reward.'],
    failureModes: ['Copying bands without testing in your own audience.', 'A pass that is the only way to progress.'] },

  // --- note 13: tycoons, base building, life-sim building and placement ---
  { id: 'pattern-tycoon-plot-allocation-ownership', title: 'Allocate one tagged plot per player and release it on leave', domain: 'genre_pattern', genres: ['tycoon', 'roleplay'], summary: 'A Plots folder with one Model per server slot, claimed automatically on PlayerAdded and found by every system through the OwnerId attribute.', refs: ['collection'], keywords: ['plot', 'claim', 'ownerid', 'spawn', 'gridorigin', 'plots folder', 'maxplayers'],
    steps: [
      'In Workspace make a Plots folder with one Model per slot, as many as Players.MaxPlayers (6 to 12). Each plot has a Part Spawn, a Part GridOrigin (min corner of the buildable area, top surface) and a Folder Content; tag each plot Model "Plot" with CollectionService.',
      'Claim on the server in PlayerAdded (also loop Players:GetPlayers() for players who joined first) and put the UserId in the attribute OwnerId; a free plot has no attribute. Claim automatically, never with a claim pad.',
      'On every CharacterAdded teleport the character to Spawn; on PlayerRemoving clear Content and the attribute.',
      'Buttons, collectors and placement all find their plot by walking up to the tagged Model and comparing OwnerId to the acting player.',
    ],
    verification: ['Join with more clients than slots is impossible: plot count equals MaxPlayers and each player lands on a different plot.', 'Leave and rejoin: the plot is released and cleared, then claimed again.'],
    failureModes: ['Claim pads lose players who do not understand them.', 'math.random plot choice scatters friends; sort the list if you support co-op.'] },
  { id: 'pattern-tycoon-button-graph-validated-purchase', title: 'Build a data-driven tycoon button graph with server-validated purchases', domain: 'genre_pattern', genres: ['tycoon', 'simulator'], summary: 'One definitions module (id, cost, requires, income, effect), hidden buttons until their dependencies are owned, and a server check on every trigger.', refs: ['proximity'], keywords: ['buttons', 'purchase', 'dependencies', 'requires', 'definitions', 'unlock', 'proximityprompt', 'effect model'],
    steps: [
      'Definitions live in one ModuleScript in ServerScriptService (id, cost, requires, income, effect model name); ServerStorage/PurchaseModels holds one Model per effect; each plot Folder Buttons holds one Part per button with attribute DefId.',
      'Each button has a ProximityPrompt (ActionText "Buy", HoldDuration 0.25, MaxActivationDistance 10, RequiresLineOfSight false: set them explicitly). A button stays hidden (Transparency 1, prompt disabled) until every id in requires is owned; the price shows on a SurfaceGui from attribute Cost.',
      'On Triggered the server checks owner, distance, definition, dependencies and cash, deducts, marks owned before cloning, adds income, clones the effect into Content at a stored local pivot and refreshes button visibility.',
      'Validate the dependency graph at startup so a loop cannot lock the game.',
    ],
    verification: ['Fire Triggered for a hidden button, from far away, and twice in one frame: nothing or exactly one purchase.', 'Every plot places effects at the same relative positions.'],
    failureModes: ['Price checks on the client, or Touched pads that exploiters fire from anywhere.', 'Marking owned after cloning allows a double trigger on lag.'] },
  { id: 'pattern-tycoon-rate-income-collector-pad', title: 'Pay tycoon income as a rate and collect it at a pad', domain: 'genre_pattern', genres: ['tycoon', 'simulator'], summary: 'One server loop accumulates pending = rate x multiplier x dt with a cap, a Collect pad moves it to cash and drops are only visuals.', refs: ['workspaceClass'], keywords: ['rate', 'income', 'collector', 'pending', 'auto collect', 'attributes', 'cash'],
    steps: [
      'One server loop for all players: every second pending += rate x multiplier x dt, using the elapsed time task.wait returns; cap pending at rate x 3,600 so a forgotten plot does not store days.',
      'A Collect pad (ProximityPrompt) moves pending to cash; an auto-collect pass does it every tick.',
      'Replicate Cash and Rate as player Attributes, updated at most 4 times a second and only on change; format big numbers on the client with suffixes.',
      'Visual drops or a client-only particle stream show income; the amount on screen is cosmetic. Save by autosave, never every second.',
    ],
    verification: ['Leave a plot idle: pending stops at the cap.', 'Attribute updates stay at or under 4 a second with 12 players.'],
    failureModes: ['Attributes are doubles, exact only to about 9e15; use a mantissa-exponent pair or scientific display before 1e15.', 'A DataStore write of Cash every second.'] },
  { id: 'pattern-tycoon-physical-dropper-conveyor-cap', title: 'Run a physical dropper, conveyor and collector with caps', domain: 'genre_pattern', genres: ['tycoon', 'simulator'], summary: 'Server-owned drops in a non-colliding group, a conveyor with a set belt velocity, a collector and hard caps on live parts.', refs: ['physicsService'], keywords: ['dropper', 'conveyor', 'collector', 'collision group', 'debris', 'drops', 'assemblylinearvelocity'],
    steps: [
      'Register a collision group "Drops" that does not collide with itself.',
      'One server loop for the whole server (not per dropper) spawns one drop per interval while the plot DropCount is under 60; each drop is unanchored, CanQuery false, CollisionGroup "Drops", has attribute Value, Debris:AddItem(part, 30) and SetNetworkOwner(nil).',
      'Conveyor: an anchored Part with AssemblyLinearVelocity = belt.CFrame.LookVector * 8 (studs per second) set once.',
      'Collector: Touched ignores non-drops and drops already marked Spent and adds the Value to the owner pending.',
    ],
    verification: ['Run 12 plots for ten minutes: live drops stay under the cap.', 'A drop resting on the belt edge is removed by its lifetime.'],
    failureModes: ['More than 1,000 live debris items server-wide silently deletes the oldest (12 plots x 100 drops breaks).', 'Drops left owned by a client are exploitable, and a client-sent value is trusted.'] },
  { id: 'pattern-tycoon-client-visual-belt-market', title: 'Show a shared random belt from one epoch, with server-checked buys', domain: 'genre_pattern', genres: ['tycoon', 'simulator'], summary: 'The server publishes an epoch and a seed; clients compute where each item is, and a purchase is validated against the same formula.', refs: ['workspaceClass'], keywords: ['belt', 'conveyor market', 'epoch', 'seed', 'getservertimenow', 'client visual', 'steal'],
    steps: [
      'The server stores epoch = workspace:GetServerTimeNow() and a seed at start and publishes both as Attributes on a Folder in ReplicatedStorage.',
      'Item i spawns at epoch + i x interval and its rarity is a pure function of (seed, i) in a shared module, so nobody replicates item data; fixed guaranteed spawns are index % n == 0 overrides.',
      'Clients create a visual per index in Belt.indexRange(now) and place it at start + direction x Belt.distance(now, epoch, i) every RenderStepped (defaults: interval 4 s, travel 15 s, so about four items on the belt).',
      'Buy(index): the server checks Belt.distance(workspace:GetServerTimeNow() - 1, epoch, index) (a 1-second grace for latency), that taken[index] is empty, the price, cash and a free base slot, then marks the index taken.',
    ],
    verification: ['Two clients buy the same index in one frame: exactly one succeeds.', 'Buying an index not yet on the belt is refused.'],
    failureModes: ['Using each client os.time() (clocks differ) or replicating items as server Parts (never smooth).', 'Changing speed or interval mid-session without a new epoch makes items jump.'] },
  { id: 'pattern-tycoon-save-purchases-as-ids', title: 'Save tycoon state as purchased ids and replay them on load', domain: 'genre_pattern', genres: ['tycoon', 'simulator'], summary: 'A profile of cash, owned ids, rebirths, lastSeen and a version; load by replaying purchases without charging, migrate renamed ids.', refs: ['saveData'], keywords: ['save', 'load', 'owned', 'profile', 'version', 'migration', 'replay purchases', 'profilestore'],
    steps: [
      'Template { cash = 0, owned = {}, rebirths = 0, lastSeen = 0, version = 1 } where owned maps id to true; use a session-locked profile library with Reconcile, not hand-written SetAsync.',
      'Save only purchased ids (missing means not bought). On load claim the plot, then replay the purchase logic without charging: clone each owned effect model and add its income.',
      'Keep a version integer; when a button is renamed or removed, migrate it in a function that runs on load.',
      'Write on milestones such as a rebirth, not on every collect; keep a plot with placed items in a second key.',
    ],
    verification: ['Buy items, leave, rejoin: the same effects and income return and nothing is charged twice.', 'Rename an id and load an old save: it migrates.'],
    failureModes: ['Saving instances, or clearing the plot before the save finished loses a purchase.', 'Cash duplicated at rebirth; reset and grant inside one function that updates the profile once.'] },
  { id: 'pattern-tycoon-rebirth-pacing-simulator', title: 'Simulate pacing and rebirth cycles before shipping a tycoon economy', domain: 'genre_pattern', genres: ['tycoon', 'simulator'], summary: 'wait = payback x (g - 1) picks button growth, and a script prints cycle times for rebirths 0 to 15 so a runaway curve shows before launch.', refs: ['gdEconomy'], keywords: ['pacing', 'rebirth', 'growth', 'payback', 'cycle', 'simulation', 'cost curve'],
    steps: [
      'Pick growth g from the wait you want: wait = payback x (g - 1); g 1.25 to 1.5 for early buttons (30 to 60 s waits at 120 s payback), up to 2 late; avoid g above 2.5 unless income grows by that factor per tier (derived).',
      'First purchase within 20 s, automation within 3 minutes, first rebirth at 15 to 25 minutes; reject waits above 3 minutes before the first automation unlock.',
      'First rebirth cost = full-ladder income per second x target seconds (20 minutes = 1,200 s). Make the multiplier grow as fast as cost, G_inc between 0.8 G and G, or unlock a stronger ladder tier per rebirth.',
      'Derived check at base 100,000, cost x2.5, full income 2,800/s: a linear 1 + 0.5r multiplier gives cycles of 36 s, 60 s, 112 s, 3.7 min, 16.6 min, 3.0 h, 15.8 h, 45 days at r = 0, 1, 2, 3, 5, 8, 10, 15; a 1.9^r multiplier stays under 37 minutes.',
      'Reset cash, buttons and plot content; keep passes, rebirth count, cosmetics. For endless rebirths halve the growth at breakpoints 100, 200 and 400.',
    ],
    verification: ['Run the pacing script for r = 0 to 15: cycle times rise gently, no step above the target band.', 'The simulated wait between buttons converges to payback x (g - 1).'],
    failureModes: ['A small linear multiplier against an x2.5 cost: players quit at the wall.', 'A rebirth that deletes paid unlocks, or no preview of the next one.'] },
  { id: 'build-grid-placement-client-preview-server-authority', title: 'Place items on a snapped grid with a client ghost and a server verdict', domain: 'genre_pattern', genres: ['tycoon', 'roleplay'], summary: 'The client raycasts and previews; the server validates owner, item, range, rate, budget, cost and an occupancy grid.', refs: ['raycastParams'], keywords: ['grid', 'placement', 'snap', 'ghost', 'occupancy', 'rotation', 'footprint', 'build mode'],
    steps: [
      'The plot has GridOrigin (min corner). CELL = 4 studs (common snap value) and a buildable size such as 30x30 cells up to 50x50 for a paid large plot. Catalog item: numeric id, footprint cells (x, z), template, price, rotation 0 to 3 (90-degree steps), category.',
      'Client: raycast against the plot floor only (RaycastParams Include with the floor), convert the hit to plot-local cells with PointToObjectSpace, snap, show a ghost (Highlight green or red; CanCollide false), rotate with R or a button, confirm with click or a Place button. Never let the client decide validity.',
      'Server Place(itemId, cx, cz, rot): owner, item exists, integers in range, rate limit (4 per second), object budget, cost, then canPlace on the occupancy grid; place with PivotTo. Remove and move repeat the same checks.',
      'Rotate the footprint on odd rotations and do the maths in object space; stacking needs a level index with per-level occupancy.',
    ],
    verification: ['Pure checks pass: 5.9 snaps to 4 and 6.1 to 8; a 2x3 rotated once is 3x2; overlap, out of bounds and fractional cells return false.', 'On a phone the Place and Rotate buttons work without right-click.'],
    failureModes: ['World-axis rotation maths makes rotated blocks clip; a client CFrame is trusted.', 'Model pivot not at the base centre, or the ghost collides with the character.'] },
  { id: 'build-plot-serialize-budget-save', title: 'Serialize a built plot into integers, budget it and save it apart from the profile', domain: 'data', genres: ['tycoon', 'roleplay'], summary: 'Pack (id, cx, cz, rot) into one integer, cap items with a visible budget, save under its own key and rebuild in batches.', refs: ['dataStore'], keywords: ['serialize', 'plot save', 'object budget', 'pack', 'chunk', 'large plot', 'rebuild batches'],
    steps: [
      'Pack an item to one integer: ((id x 256 + cx) x 256 + cz) x 4 + rot (id below 65,536, grid up to 256x256, rot 0 to 3); extra data goes in a parallel array. Save { v = 1, items = { n1, n2 } } (10,000 items is about 120,000 characters against the 4,194,304-character key limit; chunk by 20,000 items into Plot_{uid}_1, _2 and store the chunk count).',
      'Object budget as a monetisation lever: default 400 items, a Large Plot pass for +100% (one life-sim sells that for 250 Robux and +20% for 59), with a visible bar "Plot data 63%".',
      'Load: validate every record against the catalog and grid (skip invalid, log them), then rebuild in batches of 50 per frame with task.wait() between.',
      'Save on leave, every 5 minutes if dirty and in BindToClose; version catalog ids and never reuse them.',
    ],
    verification: ['Place 10,000 items, save, load: identical layout and a frame rate that never freezes.', 'Remove an item from the catalog and load an old save: invalid records are skipped and logged.'],
    failureModes: ['Saving instances or CFrames, or JSON-encoding before the DataStore (double encoding wastes space).', 'One giant key near 4 MB (writes are 4 MB per minute per key).'] },
  { id: 'pattern-tycoon-npc-customer-business-sim', title: 'Run an NPC customer business with ratings, patience and cheap rigs', domain: 'genre_pattern', genres: ['tycoon', 'roleplay'], summary: 'Customers spawn by rating, walk between fixed slots, pay or leave, and income follows expected value rather than NPC count.', refs: ['pathfindingService'], keywords: ['npc', 'customers', 'business sim', 'rating', 'patience', 'restaurant', 'retail', 'staff'],
    steps: [
      'Entities: Seat or Shelf parts with attributes (Capacity, Price), Counter, Door and a plot Rating (0 to 5). Spawn one customer every 1 / lambda seconds while below the cap, lambda = base x (0.5 + rating / 5), cap = 20 + 5 x floors (my design, tune; one 2022 poster reports a 150-NPC PathfindingService ceiling).',
      'Server state machine on attributes: Enter, ChooseTarget (free seat or shelf), Walk (Humanoid:MoveTo between fixed waypoints; PathfindingService only for long routes), Wait (patience 30 to 60 s), Pay, Leave; impatient customers leave and lower the rating.',
      'Rating = five categories worth one star each (service, food, atmosphere, expansions, hygiene), each a ratio of owned to target counts; stars unlock special customers, not spawn rate. Sell price = base cost x markup with demand falling as markup rises (tune a curve).',
      'Staff cost money per minute so automation is a decision. Make NPCs cheap: one skinned mesh, CanCollide, CanQuery, CanTouch and CastShadow false, pooled and reused.',
    ],
    verification: ['With 20 customers on screen the server frame stays steady and no path request runs per frame.', 'A lag spike does not cut income: income follows rating, NPCs are visuals.'],
    failureModes: ['One script per NPC, or every NPC replicating Humanoid physics.', 'No automation without Robux, so players leave.'] },
  { id: 'pattern-tycoon-visitors-coop-filtered-signs', title: 'Let visitors and builders share a plot with filtered signs', domain: 'genre_pattern', genres: ['tycoon', 'roleplay'], summary: 'OwnerId plus a Builders set, a Public toggle that moves a barrier, and text stored raw and filtered on display.', refs: ['uiTextFilter'], keywords: ['coop', 'builders', 'visitors', 'public plot', 'signs', 'filtering', 'barrier'],
    steps: [
      'Plot attribute OwnerId plus an attribute-backed Builders set (UserIds, up to 4). The owner invites and removes builders.',
      'Builders can place and remove but not sell or rebirth; visitors enter only when the plot is Public (a transparent barrier Part toggled by the attribute).',
      'Signs, plot names and shop names store raw text and are filtered on display for each audience, after submit, never per keystroke.',
      'Give the owner a report and clear button for signs.',
    ],
    verification: ['A builder tries to sell or rebirth from a script: refused. A visitor on a private plot cannot enter.', 'A flagged string never shows unfiltered, not even for one frame.'],
    failureModes: ['Saving the filtered string as the source of truth.', 'Builders given the same powers as the owner.'] },
  { id: 'pattern-tycoon-first-five-minutes-timeline', title: 'Pace a tycoon first five minutes with a guiding arrow and a next-goal label', domain: 'genre_pattern', genres: ['tycoon', 'simulator'], summary: 'First buy near 10 to 30 s, three buys under two minutes, automation under three, one visible expansion by five.', refs: ['gdOnboarding'], keywords: ['first five minutes', 'ftue', 'onboarding', 'arrow', 'next goal', 'tycoon'],
    steps: [
      '0 to 10 s: spawn on the plot, a Beam arrow from the character to the first button, a 12-character label "Buy: Dropper". 10 to 30 s: first purchase affordable (50 cash at 2.5/s takes 20 s, or grant 25 starting cash so it lands near 10 s).',
      '30 to 90 s: second and third buttons, 20 to 35 s apart (g 1.25). 90 s to 3 min: the auto-collect button is visible and affordable with a "Next goal" label showing the price.',
      '3 to 5 min: the first expansion that visibly changes the plot, then a preview of rebirth and a daily reward. 5 to 10 min: a first event or limited item in the shop (no sale prompt before minute 5).',
      'Success (derived): first purchase under 30 s, three purchases under 2 minutes, automation under 3 minutes.',
    ],
    verification: ['A stranger on a fresh account hits all three timing marks without reading text.', 'The arrow disappears once the player has bought the first item.'],
    failureModes: ['A wall of tutorial text, or an arrow that stays after the player learned.', 'A rebirth teaser the player cannot reach in the first session.'] },
  { id: 'monetize-capacity-convenience-passes-price-bands', title: 'Price capacity and convenience passes from observed bands with a free path', domain: 'game_design', summary: 'Sell more slots, plot size and automation, never the only way to progress; start from sourced bands and test them.', refs: ['gdMonetization'], keywords: ['capacity pass', 'convenience', 'plot size', 'extra floors', 'auto collect', 'price bands', 'free path'],
    steps: [
      'Sell capacity and convenience (2x cash, auto-collect, extra plots, floors, height) and keep a free path to the same thing.',
      'Starting bands observed in third-party price lists (test, do not copy): 74 to 374 Robux for capacity in one theme-park builder, 100 to 360 for capacity and 180 to 600 for convenience in one life-sim.',
      'Give events their own currency and shop, compute every random reward as EV = sum of value x probability and show odds for any paid random item.',
      'Do not embed a media feed, autoplay or reward for watching: it removes the game from Kids and Select.',
    ],
    verification: ['Every item can be reached for free given enough play time.', 'Displayed prices come from the live product info.'],
    failureModes: ['Copying another game price ladder untested.', 'Selling only power, so free players churn at the first wall.'] },

  // --- note 14: obby, tower, speed-escape, parkour and racing ---
  { id: 'pattern-obby-difficulty-chart-skips', title: 'Build a difficulty-chart obby with named tiers, skips and a practice area', domain: 'genre_pattern', genres: ['obby', 'adventure'], summary: 'Ten named tiers of 10 to 30 stages folded into a small footprint, a paid and a free skip, a rebirth and a fixed update day.', refs: ['spawnLocation'], keywords: ['difficulty chart', 'tiers', 'skip stage', 'spiral', 'streaming', 'practice area', 'rebirth', 'obby'],
    steps: [
      'Plan 10 named tiers and 10 to 30 stages per tier; the first three tiers are easy. Each stage Model has one SpawnLocation named Checkpoint with attribute StageIndex, Neutral = true, Duration = 0 and AllowTeamChangeOnTouch = false; the server accepts stage k only when k equals current + 1 or a paid skip.',
      'Fold the chart into a spiral or zig-zag so 200 to 300 stages fit a small footprint, and set tier models to ModelStreamingMode Atomic. Colour each tier and show a tier banner.',
      'Skip: a developer product for a 20 to 99 R$ skip of the current stage (2026 live games price small utilities 49 to 139) plus a free skip every 12 hours using os.time() stored with the data.',
      'A rebirth at the end gives points or a permanent trail; add a leaderboard, a practice area with one copy of each mechanic next to spawn, and a fixed update day with a new stage batch.',
    ],
    verification: ['Complete every stage once from a script or play: all are possible, including seams between stages.', 'Teleporting to stage 20 from a test client is refused.'],
    failureModes: ['An impossible jump at a seam, or a claim that all stages are possible that nobody tested.', 'Skip prices that outrun the early game, or pay prompts on first load.'] },
  { id: 'pattern-obby-troll-slap-tower', title: 'Build a social troll tower with server-owned gear effects', domain: 'genre_pattern', genres: ['obby', 'adventure'], summary: 'An easy 20 to 40 stage climb where the challenge is other players, with gear granted by level, server-validated hits and a safe zone.', refs: ['physicsOwnership'], keywords: ['troll tower', 'slap', 'gear', 'knockback', 'applyimpulse', 'safe zone', 'social tower', 'admin pass'],
    steps: [
      'Build an easy 20 to 40 stage tower with wide platforms; the challenge is other players, not the climb.',
      'Gears are Tools granted by tag and level; the server owns every effect: validate the hit (target within a range, cooldown) and apply knockback with ApplyImpulse on the victim root part from the server, never the client.',
      'Free gears unlock at play milestones; paid gears are passes (observed 78 to 799 R$); sell an admin panel only if you can moderate it (live games price it 499 to 1,499 R$).',
      'Add a safe zone at spawn and respawn without penalty; arenas that are large run 20 to 32 players per server (live range).',
    ],
    verification: ['A hit remote fired with a far target or faster than the cooldown does nothing.', 'A new player standing in the safe zone cannot be hit.'],
    failureModes: ['Griefing that drives off new players.', 'Client-trusted hit detection, or an admin pass that lets buyers wreck the server.'] },
  { id: 'pattern-obby-moving-platform-mover-kit', title: 'Build moving platforms and spinners from physical movers', domain: 'genre_pattern', genres: ['obby', 'adventure'], summary: 'A PrismaticConstraint motor, an AngularVelocity spinner and a welded top, so players are carried; tweened anchored parts are only visuals.', refs: ['prismaticConstraint'], keywords: ['moving platform', 'prismatic', 'spinner', 'hinge', 'conveyor', 'tween', 'carry player', 'mover'],
    steps: [
      'Linear mover: an anchored Rail part and an unanchored Platform, each with an Attachment with X axes along the travel; PrismaticConstraint ActuatorType Motor, MotorMaxForce 50,000, Velocity 8 to 20 studs/s for obby (the docs log example is 40), LimitsEnabled true, LowerLimit 0, UpperLimit the travel distance; flip the velocity at the limits.',
      'Spinner: an AngularVelocity constraint or HingeConstraint motor at 2 to 6 rad/s; torque 1,000 for a 4x1x2 block and much more for large blocks (one doc case needs 300,000).',
      'Conveyor: AssemblyLinearVelocity on an anchored part (a community technique, not in the docs; confirm in Studio) or a LinearVelocity on an unanchored belt.',
      'Parts moved by CFrame or Tween do not carry players: keep them as visuals, or weld an unanchored top to them. Offset phases with a start-delay attribute, set ModelStreamingMode Atomic and SetNetworkOwner(nil) where all players must see one position.',
    ],
    verification: ['Stand on each mover for 30 s: the character is carried without stutter.', 'Three players on one platform: ownership does not flip.'],
    failureModes: ['Platforms too light for the motor force.', 'A tweened anchored part players stand on: it moves under them.'] },
  { id: 'pattern-obby-jump-speed-pads-kill-volumes', title: 'Add jump pads, speed pads and kill volumes that fire once', domain: 'genre_pattern', genres: ['obby', 'adventure'], summary: 'An impulse pad scaled by mass, a timed speed pad on the server and an invisible kill plane with a per-player debounce.', refs: ['linearVelocity'], keywords: ['jump pad', 'speed pad', 'kill brick', 'kill volume', 'applyimpulse', 'cantouch', 'debounce'],
    steps: [
      'Jump pad: on Touched by a foot call ApplyImpulse(Vector3.new(0, impulse, 0)); the docs sample uses 2,500 on the foot part, so scale by AssemblyMass instead so every avatar size launches alike (heuristic).',
      'Speed pad: a LinearVelocity or a temporary WalkSpeed change on the server for 1 to 3 seconds.',
      'Kill volume: a large invisible part under the course that sets Health = 0 on touch with a per-player debounce.',
      'Set CanTouch false on parts that should never raise Touched; an event fires only when both parts have CanTouch true.',
    ],
    verification: ['Walk onto each pad with different avatar scales: same launch height.', 'One landing triggers each pad once, not once per body part.'],
    failureModes: ['Firing from any body part gives double triggers.', 'Client-side pads can be spoofed.'] },
  { id: 'pattern-speed-escape-economy-ladders', title: 'Price a speed-escape economy: saturating speed, teleport ladder and trail tiers', domain: 'genre_pattern', genres: ['simulator', 'obby'], summary: 'A server-clamped saturating speed curve, a stage-teleport ladder near 2.3x per step, trail and treadmill multipliers with a free 1x path.', refs: ['humanoid'], keywords: ['speed escape', 'treadmill', 'trail tiers', 'teleport ladder', 'wins', 'saturating curve', 'rebirth', 'popups'],
    steps: [
      'Map speed to WalkSpeed with a saturating server-clamped curve (heuristic): ws = 16 + (maxWs - 16) * (1 - math.exp(-speed / k)); scale the course with it (a section at 16 studs/s lasts 6.25 s per 100 studs, at 200 it lasts 0.5 s).',
      'Keys are tagged Key parts; the server awards speed on a foot touch with a 0.2 s per-key debounce: speedGain = baseGain x treadmillMult x trailMult x rebirthMult. Treadmills give passive speed on a timer (a snippet gives +1 WalkSpeed every 5 s with a debounce table).',
      'Stage teleports cost 2, 6, 20, 40, 100, 200, 300, 600, 1,000, 2,000, 5,000, 20,000 wins (about 2.3x geometric, derived from one 12-step table, third-party); trail tiers cost about 3.8x win cost per tier; treadmill multipliers x1 (free), x3, x9, x25, x100 sold as passes.',
      'Trails (1.5x to 5x for the lower tiers, 10x and 20x Robux only) and auras stack and survive rebirth; rebirth needs gems or a speed threshold, resets speed and gives a permanent multiplier. Add a free gift for like, group join and a code.',
      'Add a rewarded revive for a failed stage run and a 79 to 99 R$ disable-popups pass; do not let the client set speed.',
    ],
    verification: ['Run the course at the speed cap: no collision tunnelling and streaming keeps up.', 'A free player can still reach every stage.'],
    failureModes: ['WalkSpeed far above about 100 breaks collision and streaming.', 'Stat inflation with no cap and no second hook.'] },
  { id: 'pattern-tsunami-run-and-bank', title: 'Build a tsunami run-and-bank round with provably reachable pits', domain: 'genre_pattern', genres: ['simulator', 'obby'], summary: 'Zones with safe pits, a weighted wave scheduler, a plane-crossing kill rule and a safety inequality that proves every pit is reachable.', refs: ['collection'], keywords: ['tsunami', 'wave', 'safe pit', 'bank', 'deposit', 'wave scheduler', 'run and bank', 'zones'],
    steps: [
      'A long straight map divided into zones; SafePit boxes (tagged) at intervals that grow with zone length. Pickups are carried and deposited at base for income per second by rarity from a table.',
      'Wave scheduler: every N seconds pick a type from a weighted table (Super Slow, Slow, Medium, Fast, Lightning); wave speed in studs per second is data; start behind the start line and move it with a server loop. Make waves deterministic from a timetable (spawn time, speed, lane).',
      'Safety rule (my derivation): distance(wave start, pit) / waveSpeed must exceed distance(player, pit) / requiredSpeed(zone) plus a 1 to 2 s margin.',
      'Kill rule each Heartbeat: if a player root is behind the wave front and not inside a SafePit box, kill; a plane check is robust at any speed, unlike Touched.',
      'Upgrades (speed, carry capacity, base slots, income) and rebirth; limit servers to 8 players; paid layer: a paid extra wave, shields and coils.',
    ],
    verification: ['Check the inequality for every pit and wave type in a script: all hold.', 'A player standing in a pit survives, one outside dies at lightning speed.'],
    failureModes: ['A wave faster than the speed a zone requires, or an unreachable pit.', 'An unbounded income table (one live game spans about five orders of magnitude).'] },
  { id: 'pattern-vehicle-obby-world-stages', title: 'Build a vehicle obby: one assembly per player, ownership and flip reset', domain: 'genre_pattern', genres: ['obby', 'racing'], summary: 'A single-assembly vehicle cloned on spawn, driver network ownership, numbered worlds of 10 to 100 stages and a flip detector.', refs: ['vehicleSeat'], keywords: ['vehicle obby', 'vehicleseat', 'worlds', 'flip detector', 'reset vehicle', 'network owner', 'collision group'],
    steps: [
      'Build the vehicle as one assembly (seat, body, constraints) cloned per player on spawn; the player sits in a VehicleSeat; SetNetworkOwner(player) when seated and back to automatic on exit.',
      'Create 10 to 100 stages per world with a numbered world in the title; add worlds on a live-ops rhythm.',
      'Optionally a Racer collision group stops vehicles pushing each other.',
      'Provide a reset-vehicle key and a flip detector: if the up vector Y is below 0.2 for 2 s, reset to the last checkpoint.',
      'Paid layer observed: world unlock passes 199 to 599 R$, a permanent double jump 79 R$, a gravity coil, VIP and a disable-popups pass 69 R$ (starting points).',
    ],
    verification: ['Flip the vehicle on purpose: it resets to the last checkpoint within about 2 s.', 'Ten vehicles in one area keep the server frame steady.'],
    failureModes: ['Vehicles wedge on geometry, or checkpoints are unreachable at vehicle speed.', 'Physics cost at 10 or more vehicles.'] },
  { id: 'pattern-coop-tethered-obby', title: 'Build a tethered two-player obby that advances as a pair', domain: 'genre_pattern', genres: ['obby', 'adventure'], summary: 'Pairs in private zones joined by a rope, pair checkpoints, revive products and a duo-time leaderboard.', refs: ['ropeConstraint'], keywords: ['co-op', 'duo', 'tether', 'rope', 'pair', 'carry', 'revive'],
    steps: [
      'Matchmake pairs into private mini-servers or private zones.',
      'Tether the two characters with a RopeConstraint or RodConstraint between their attachments; Length 8 to 14 studs (heuristic).',
      'Checkpoints advance the pair: both must reach it.',
      'Sell revive and rewind items as developer products (observed 139 and 599 R$, starting points).',
      'Keep a duo-time leaderboard in an OrderedDataStore with a pair key.',
    ],
    verification: ['One partner disconnects: the other is released or re-paired, the run does not stall.', 'A checkpoint counts only when both players are inside.'],
    failureModes: ['A disconnecting player stalls the pair.', 'Rope physics jitter; use server ownership of the rope assembly sparingly.'] },
  { id: 'pattern-race-time-trial-ghost-leaderboard', title: 'Add a time trial with a recorded ghost and a millisecond leaderboard', domain: 'genre_pattern', genres: ['racing', 'obby'], summary: 'Record pose samples at 15 to 20 Hz into a buffer, store only the best run, replay it client-side and rank integer milliseconds.', refs: ['orderedDataStore', 'bufferLib'], keywords: ['time trial', 'ghost', 'buffer', 'leaderboard', 'ordereddatastore', 'milliseconds', 'replay'],
    steps: [
      'Record the car position and yaw at 15 to 20 Hz into a buffer (16 bytes a sample) and keep the best run only.',
      'Encode to a DataStore-safe string (Base64 or Base85); keep each key under the 4 MB limit (about 100 KB per 40 to 50 s in one community format).',
      'Playback is a client-only anchored non-collidable ghost lerped between samples in RunService.PreRender.',
      'Best times: an OrderedDataStore of integer milliseconds per track, UpdateAsync keeping the minimum, GetSortedAsync(true, 10) for the top ten. Compute times on the server from os.clock() deltas.',
    ],
    verification: ['Race twice: the ghost of the faster run replays and the slower run does not overwrite it.', 'A client-reported time is ignored.'],
    failureModes: ['Floating times in an OrderedDataStore (integers only).', 'Recording at display rate makes huge keys.'] },
  { id: 'pattern-race-raycast-suspension-car', title: 'Script a raycast-suspension car with one VectorForce per wheel', domain: 'genre_pattern', genres: ['racing', 'adventure'], summary: 'Per-wheel raycast springs, lateral friction capped by load, drive force at the wheel point and driver ownership; edit_script only.', refs: ['vectorForce'], keywords: ['suspension', 'raycast car', 'vectorforce', 'wheel', 'spring', 'damping', 'traction', 'custom vehicle'],
    steps: [
      'A body with four wheel attachments and one VectorForce per wheel (RelativeTo World); a script creates them.',
      'Each Heartbeat per wheel raycast down rest + radius; compression = rest - (dist - radius); force = k x compression - c x velAlongSpring (the tutorial demo: stiffness 2,500, damping 250, rest 2, radius 1.5; stiffness is force per stud).',
      'Traction: a lateral force opposing sideways velocity at the wheel point, capped at mu x normalLoad. Drive and brake: forward force at the wheel point from throttle input.',
      'The driver owns the assembly. Do not combine with Server Authority without rewriting for BindToSimulation.',
    ],
    verification: ['Drop the car from 5 studs: it settles without oscillation.', 'Corner at speed: the car slides instead of flipping, and wheel visuals follow the ray hit.'],
    failureModes: ['Oscillation from low damping.', 'Unit confusion in stiffness, or visuals not following the ray hit.'] },
  { id: 'design-obby-gap-seam-validator', title: 'Validate every gap and seam between platforms before publishing', domain: 'game_design', summary: 'Compute the horizontal edge gap and vertical delta of each consecutive platform pair and fail what a character cannot clear.', refs: ['humanoid'], keywords: ['validator', 'gap', 'seam', 'jump reach', 'walkspeed', 'platform pair', 'completability'],
    steps: [
      'Tag every standing platform with its stage in order.',
      'For each consecutive pair compute the horizontal edge gap and the vertical delta; moving platforms count at their extremes.',
      'Fail the stage if the gap is above 0.54 x WalkSpeed (8.5 at default for the main path, 12 for an expert tier) or the climb is above 6 studs (derived: airtime 0.542 s with JumpHeight 7.2 and Gravity 196.2).',
      'Run a bot or play-test pass in Studio with mobile emulation for the first five stages.',
    ],
    verification: ['A deliberately 9-stud gap on the main path is reported.', 'Rotated parts are checked with bounding boxes, not axis-aligned guesses.'],
    failureModes: ['Rotated parts break an axis-aligned check.', 'Moving platforms whose extremes are the real gap are skipped.'] },
  { id: 'security-obby-speed-displacement-check', title: 'Detect speed and teleport cheats with a server displacement check', domain: 'security', summary: 'Every 0.25 s compare root displacement with the allowed distance, return to the last good position and kick only after strikes.', refs: ['serverDetection'], keywords: ['speed hack', 'teleport', 'displacement', 'walkspeed', 'strikes', 'obby', 'anti cheat'],
    steps: [
      'Accept stage progress only as current + 1; set WalkSpeed only from server scripts and log client changes.',
      'Every 0.25 s compare the root displacement with currentWalkSpeed x dt x 1.5 (a grace for lag); on a breach teleport back to the last good position; after three strikes kick (starting values).',
      'Flag long airtime without a Humanoid FloorMaterial (flying) and fast vertical changes.',
      'Store only server-computed times for leaderboards and review top runs by hand; optionally opt in to Server Authority for competitive games.',
    ],
    verification: ['A test client that sets WalkSpeed to 100 is pulled back and struck.', 'A real lag spike does not cause a kick.'],
    failureModes: ['Permanent bans from lag.', 'Trusting Humanoid.WalkSpeed read from the client.'] },
  { id: 'pattern-movement-tech-dash-walljump-bhop', title: 'Add movement tech: dash, wall-hop and air-strafe with starting values', domain: 'genre_pattern', genres: ['obby', 'fps_arena'], summary: 'Choose the controller first, then tune a timed dash, wall-hop attributes or an air-strafe controller behind a feature flag.', refs: ['inputActions'], keywords: ['dash', 'wall hop', 'bhop', 'parkour', 'movement', 'character controller', 'air strafe', 'double jump'],
    steps: [
      'Decide the controller: the default Humanoid with attribute tuning (wall-hop, long jump), the Character Controller Library (beta) for a dash, or a custom air-strafe controller.',
      'Dash via the library: ability Dash with StartsWhen = All(Sensor.Ground, Not("DashCooldown")), timed labels DashWindow 0.2 s and DashCooldown 1.0 s, ApplyImpulse of RootLookVector x 80 x AssemblyMass, registered on the server with AvatarAbilities.addAbilityForCharacter.',
      'Air-strafe starting values from a community module: ground acceleration 14, air acceleration 12, max air wish speed 30, landing grace 0.15 s. The platformer template covers double jump, roll and long jump.',
      'Ship the movement behind a flag and test with 100 ms simulated latency; with Server Authority, scripted abilities must run on both sides.',
    ],
    verification: ['Dash twice in a row: the second is refused until DashCooldown ends.', 'Play with 100 ms simulated latency: movement stays predictable.'],
    failureModes: ['The library is beta; callbacks that yield break its frames.', 'Air-strafe with a Humanoid fights the default friction.'] },

  // --- note 15: tower defense, wave survival and RTS-lite (third-party game numbers are snapshots; test them) ---
  { id: 'pattern-td-match-skeleton-state-machine', title: 'Lay out a server-authoritative wave-defense match with one loop', domain: 'genre_pattern', genres: ['tower_defense', 'survival'], summary: 'Path, build zones, base and folders in Workspace; a Config module for every number; a state machine; one Heartbeat loop steps all enemies and towers.', refs: ['collection'], keywords: ['match', 'state machine', 'intermission', 'wave', 'base health', 'build zone', 'config', 'skeleton'],
    steps: [
      'Workspace: Map/Path (Parts named "1", "2", ... in walking order, anchored, CanCollide false, Transparency 1), Map/BuildZones (Parts tagged "BuildZone"), Map/Base (a Part "Base" with attribute MaxHealth), empty server-only Towers and Enemies folders, and ReplicatedStorage/Remotes.',
      'ServerScriptService modules: Config (start cash, wave, tower and enemy tables: no number elsewhere), Match, Enemies, Towers, Economy.',
      'States: Lobby, Intermission (10 to 20 s, a heuristic), Wave until every enemy is spawned and dead or leaked, pay the wave bonus, then the next wave; Defeat when BaseHealth <= 0, Victory after the last wave. Replicate state with Attributes on a Match folder, not polling; grant meta rewards once, guarded by a boolean.',
      'One RunService.Heartbeat loop steps all enemies and tower timers; never a script per enemy or tower. Send a late joiner a full snapshot of state and enemies.',
    ],
    verification: ['Kill every enemy and also let some leak: the next wave starts only after all resolve.', 'Join mid-wave: the new client sees the current state and every live enemy.'],
    failureModes: ['One script per enemy, or yielding inside the Heartbeat handler.', 'A client ready signal trusted to start waves.'] },
  { id: 'pattern-td-enemy-path-data-simulation', title: 'Simulate enemies as data along waypoints at a constant speed', domain: 'genre_pattern', genres: ['tower_defense', 'survival'], summary: 'Plain tables carry distance along the path; leftover movement carries across corners and slows are multipliers with an expiry.', refs: ['animationController'], keywords: ['path following', 'waypoints', 'enemy data', 'leak', 'slow', 'stun', 'dist', 'segments'],
    steps: [
      'Precompute waypoints, segment lengths and cumulative distance once. An enemy is a table {id, typeId, hp, maxHp, speed, seg, t, dist, effects}; no Instance on the server.',
      'In the Heartbeat loop advance by speed x dt and carry leftover movement across waypoints so speed is constant at any frame rate. dist is the single number for targeting, "first" sorting, replication and leak detection.',
      'When seg passes the last segment the enemy leaks: subtract leakDamage (heuristic: 1 normal, 10 boss) from base health and remove it.',
      'Slow and stun are multipliers on speed with an expiry; always remember the base speed. Move model rigs (AnimationController) with PivotTo, not Humanoid, once more than about 40 can be alive.',
    ],
    verification: ['Run at 30 and 144 fps: an enemy takes the same time to cross the path.', 'A slow that expires restores the exact base speed.'],
    failureModes: ['Humanoid:MoveTo times out after 8 seconds and lags above about 40 to 60 enemies.', 'Position sinks into terrain; raycast once at spawn or bake the path height.'] },
  { id: 'pattern-td-enemy-snapshot-replication', title: 'Replicate hundreds of enemies as packed distance snapshots', domain: 'genre_pattern', genres: ['tower_defense', 'survival'], summary: 'Reliable spawn and despawn events, self-contained snapshots at 10 Hz on an unreliable remote and client-side visuals.', refs: ['unreliableRemote'], keywords: ['replication', 'snapshot', 'unreliableremoteevent', 'buffer', 'enemies', 'client visuals', '10 hz', 'bandwidth'],
    steps: [
      'A reliable RemoteEvent carries rare Spawn(id, typeId, serverTime), Despawn(id, reason) and Speed(id, newSpeed, serverTime).',
      'Option A, cheapest: clients simulate the path from spawn time and speed and only get slow and stun corrections. Option B: a snapshot every 0.1 s on an UnreliableRemoteEvent, better when slows are common.',
      'Snapshot: 4 bytes per enemy, u16 id plus u16 dist in 1/16-stud units (paths up to 4,095 studs, derived), so 250 enemies fit under 1,000 bytes; split beyond that. Each snapshot is self-contained (absolute dist) because unreliable events can drop.',
      'Clients keep id -> model, convert dist to a CFrame along the same waypoints and Lerp each frame; no physics. Test a one-line buffer send in Studio first; the fallback is packed numbers.',
    ],
    verification: ['Drop 20% of snapshots in a test: enemies stay smooth, never teleport.', 'Bytes per second stay flat from 50 to 250 enemies.'],
    failureModes: ['CFrames or tables in payloads, or one remote per enemy per frame.', 'Server Parts for positions (one project saw about 600 KB/s per 100 units).'] },
  { id: 'pattern-td-tower-placement-validation', title: 'Validate tower placement on the server with zones, limits and refunds', domain: 'genre_pattern', genres: ['tower_defense', 'survival'], summary: 'A client ghost with range circle and a server check of loadout, cash, limits, build zone, overlap, distance and rate.', refs: ['overlapParams'], keywords: ['tower placement', 'build zone', 'ghost', 'range circle', 'placement limit', 'refund', 'overlapparams'],
    steps: [
      'Client: a local ghost (CanCollide false, Transparency 0.5), raycast each frame with ViewportPointToRay excluding the ghost, snap to a 1 or 2 stud grid, tint green or red and draw a range circle (a flat cylinder sized range x 2); fire PlaceTower(towerId, cframe) once on confirm. Slot-based maps skip the raycast and use pre-placed Slot parts.',
      'Server validates: the player owns the tower in the loadout; cash >= cost; per-type and total limits (sample repo: 5 per type, 15 total); the point lies in a BuildZone (GetPartBoundsInBox with an OverlapParams Include filter); no overlap with the path or other towers; distance from the character under a sanity limit; one placement per 0.1 s per player.',
      'Create the anchored model on the server with the owner UserId as an Attribute, store {def, level, lastShot, targetMode}, tell clients with a reliable event. Sell refunds 70% of total invested (a shipped pattern).',
      'When a player leaves, refund cash to the team or remove their towers by your rule.',
    ],
    verification: ['Place on the path, outside a zone and over the limit from a test client: all refused.', 'Sell then rebuy: the refund is 70% and the limit count drops.'],
    failureModes: ['Trusting the client position, or towers that overlap the path.', 'Large towers on tiny parts.'] },
  { id: 'pattern-td-targeting-attack-loop', title: 'Run tower targeting from path progress in one central loop', domain: 'genre_pattern', genres: ['tower_defense', 'fps_arena'], summary: 'nextShot timers in one loop, targets chosen by dist, a single damage pipeline and an optional uniform grid only when profiling asks for it.', refs: ['worldRoot'], keywords: ['targeting', 'first last strongest', 'attack loop', 'splash', 'damage pipeline', 'cooldown', 'nextshot'],
    steps: [
      'One loop: each tower has nextShot (os.clock based); each Heartbeat, for towers with now >= nextShot, pick a target, apply damage and set nextShot = now + cooldown. No task.wait per tower.',
      'Targets by path progress among enemies in range: First = largest dist, Last = smallest, Strongest = largest hp, Weakest = smallest, Closest = nearest; retarget only when the target dies or leaves range, or every 1 to 2 s. Compare squared distance first.',
      'Damage pipeline in one function: raw -> defense percentage -> immunities (a hidden enemy needs detection) -> shield -> health. Splash finds enemies within a radius of the target; slows store slowUntil and a multiplier.',
      'If real Part enemies are unavoidable use GetPartBoundsInRadius with OverlapParams including only the Enemies folder and a MaxParts; with data enemies a plain loop suffices until the MicroProfiler says otherwise, then bucket enemies into a uniform grid rebuilt once per frame.',
    ],
    verification: ['Place First and Last towers: each shoots the enemy with the expected dist.', 'Profile 300 enemies and 30 towers: the loop stays inside the frame budget.'],
    failureModes: ['A magnitude loop per tower per enemy per frame; targeting by distance to the tower.', 'Damage applied from a client message, or one server-Instance HP-bar update per hit.'] },
  { id: 'pattern-td-waves-as-data-budgeted', title: 'Author waves as data, then budget the late waves', domain: 'genre_pattern', genres: ['tower_defense', 'survival'], summary: 'Hand-written waves 1 to 10 teach one trait at a time; later waves spend a budget on weighted enemies; a late-game rule caps the ceiling.', refs: ['gdCoreLoops'], keywords: ['waves', 'wave table', 'budget', 'enemy roles', 'boss wave', 'endless', 'wave bonus', 'rest wave'],
    steps: [
      'Config.Enemies: {name, hp, speed, defense, flying, hidden, immunities, onDeath, killCash, leakDamage, unlockWave, cost, weight}. Start with five roles: Normal, Fast (about 1.8x speed, half HP), Tank (about 5x HP, 25% to 50% defense), Hidden (needs detection), Boss (about 75x to 100x Normal HP early).',
      'Hand-author waves 1 to 10 as {{enemy="Normal", count=8, interval=0.9}}; one new trait every 3 to 5 waves, a boss every 5 or 10.',
      'Later waves: budget = 90 + 15 x wave; pick random affordable enemies by weight among unlockWave <= wave, subtract cost; boss waves override.',
      'Wave bonus linear (for example 100 + 40 x wave) and kill cash smaller; a next-wave button that pays per second skipped. After a threshold wave freeze the enemy count and slow health growth so Endless has a finite ceiling. Add rest waves.',
    ],
    verification: ['Print waves 1 to 30: no wave repeats another and each new trait has a counter tower.', 'Budgeted waves never exceed the budget.'],
    failureModes: ['Enemies that cost nothing in the budget, or identical waves.', 'A second boss type that needs a tower the player cannot own yet.'] },
  { id: 'design-td-economy-balance-script', title: 'Check wave-defense economy with a required-versus-affordable DPS script', domain: 'game_design', summary: 'Upgrade ladders, an economy tower repaying in 2 to 4 waves and a ratio table that falls from about 15 to under 1 at the last boss.', refs: ['gdEconomy'], keywords: ['td economy', 'dps ratio', 'economy tower', 'payback', 'upgrade cost', 'sell refund', 'tower cap', 'balance script'],
    steps: [
      'Towers as {cost, upgrades, dps per level}; each upgrade costs 1.5x to 2.5x the previous for a smaller relative DPS gain. Cap towers per type and in total (slot scarcity is strategy).',
      'Economy tower: placement about 40% to 60% of a basic DPS tower, income per wave doubling or tripling over 2 or 3 upgrades, payback 2 to 4 waves; no damage, so it costs a slot.',
      'Script: per wave totalHP = sum(count x hp), requiredDPS = totalHP / exposureSeconds, affordableDPS = spendShare x cumCash / costPerDps (cumCash = start cash + bonuses + kill cash); print the ratio. Own model, heuristic: 5 to 15 on waves 1 to 5, about 1.4 to 2.5 by wave 20 to 25 of 30, under 1 only at the last boss (one run: 15.3, 10.0, 6.4, 3.9, 2.4, 1.4, 0.8 at waves 1, 5, 10, 15, 20, 25, 30).',
      'Late sinks: evolved upgrades at 10x to 100x the base tower. Kill cash stays below the wave bonus; sell for 70%, never 100%.',
    ],
    verification: ['The ratio table keeps its shape after every price change.', 'A kills-only run earns less than an economy-tower run.'],
    failureModes: ['Kill cash above the wave bonus: players farm kills.', 'Income unlimited by the slot cap.'] },
  { id: 'pattern-td-enemy-trait-system', title: 'Give enemies traits that need different towers', domain: 'genre_pattern', genres: ['tower_defense', 'survival'], summary: 'Flags for defense, immunity, hidden, flying, on-death spawn, summons and tower attacks, processed in the central loop with a counter for each.', refs: ['pathfindingService'], keywords: ['enemy traits', 'immunity', 'summon', 'on death', 'tower stun', 'hidden', 'flying', 'counter'],
    steps: [
      'Def flags: defense (0 to 1), immune = {Stun, Freeze, Burn}, hidden, flying, onDeath = {spawn, count}, summon = {every, type, count}, towerAttack = {range, cooldown, stun}, laneSwitch.',
      'Process in the central loop: on death spawn children at the parent seg and t so they continue from there; run summoner timers with a cap; tower attackers pick a tower in range and set tower.disabledUntil.',
      'Counters: at least one tower per role answers each trait (single target for bosses, splash for swarms, slow for fast, detection for hidden, anti-air for flying).',
      'Telegraph boss abilities with an animation and a UI warning; a tower stun of 3 to 5 s is a starting value (a shipped 8 s feels long, heuristic).',
    ],
    verification: ['Every enemy trait in Config has at least one tower that answers it.', 'A child spawned from a death does not leak instantly.'],
    failureModes: ['Immunity to every control effect on every boss leaves no counterplay.', 'Summons without a cap, or children that inherit dist incorrectly.'] },
  { id: 'pattern-td-coop-lobby-scaled-match', title: 'Send a party from a lobby to a reserved match and scale it by party size', domain: 'genre_pattern', genres: ['tower_defense', 'adventure'], summary: 'Reserved server per party, loadout reloaded from the datastore, enemy health scaled by player count and match cash kept in the session.', refs: ['teleportService'], keywords: ['lobby', 'reserved server', 'party', 'teleportdata', 'player scaling', 'late join', 'match cash'],
    steps: [
      'Lobby elevators or portals per map and difficulty form a party; the server creates TeleportOptions with ShouldReserveServer = true and SetTeleportData({map, mode}) and calls TeleportAsync in a pcall with retry; handle TeleportInitFailed. Server calls only.',
      'The match place reads Player:GetJoinData().TeleportData for map and difficulty. Never trust loadouts or currency in TeleportData (the client can see it); reload them from the DataStore.',
      'Scale enemy HP by party size (x1.0, 1.15, 1.25, 1.4 for 1 to 4 players, third-party) and shrink the shared wave bonus by 10% per extra player on easy modes, or split kill cash by damage dealt.',
      'Late joiners only in the first 3 waves (heuristic) with a full snapshot; keep a leaver towers for a grace period or sell and redistribute. Grant rewards before the return teleport. Match cash is session-only; only meta currency is saved.',
    ],
    verification: ['Run a party of four: each player sees the same map and difficulty and a fresh loadout from the datastore.', 'A forged TeleportData currency is ignored.'],
    failureModes: ['Teleporting a stale party, or storing match cash in a DataStore.', 'Trusting TeleportData for currency.'] },
  { id: 'pattern-td-meta-progression-disclosed-gacha', title: 'Add meta progression with a disclosed, pity-bounded unit banner', domain: 'genre_pattern', genres: ['tower_defense', 'simulator'], summary: 'Coins and gems unlock a 5 to 6 slot loadout, a banner with exact rates and saved pity, evolution with a convenience skip and a policy gate.', refs: ['prodPaidRandom'], keywords: ['meta progression', 'loadout', 'banner', 'pity', 'evolution', 'traits', 'policyservice', 'gems'],
    steps: [
      'Meta currencies: Coins from regular modes, Gems from the hardest mode, per-run EXP; towers unlock by coins or level and a loadout of 5 to 6 slots is chosen in the lobby.',
      'Banner (if used): Config.Banners = {name, cost, rates = {Rare = 0.75, Epic = 0.2, Legendary = 0.04, Mythic = 0.01}, pity = {Legendary = 50, Mythic = 400}} (illustrative); rates sum to exactly 1.0 and are shown as percentages in a details pop-up; roll on the server with Random and keep the pity counter in saved data.',
      'Gate by PolicyService: restricted players get a direct purchase or a free path. Evolution needs a level, coins and gems; a Robux skip is priced as convenience (499 in one game) and never the only route.',
      'Optional traits: a random modifier layer with reroll tokens from events and codes, bounded (+50% damage at the top trait in one game). Grant gems and evolutions on the server only.',
    ],
    verification: ['Sum the rates: exactly 1.0 and equal to the displayed percentages.', 'Rejoin after 30 rolls: the pity counter is unchanged.'],
    failureModes: ['A client-side roll, or pity reset on rejoin.', 'A gacha-only path to every strong unit (pay-to-win backlash); do not sell pure damage multipliers.'] },
  { id: 'pattern-td-difficulty-ladder-reward-table', title: 'Ship a difficulty ladder with its own caps and rewards', domain: 'genre_pattern', genres: ['tower_defense', 'survival'], summary: 'Easy to Endless with per-mode HP multipliers, tighter cash, level gates, a time challenge and a weekly rotating mode.', refs: ['gdLiveOps'], keywords: ['difficulty ladder', 'modes', 'level gate', 'reward table', 'hardcore', 'endless', 'challenge mode'],
    steps: [
      'Table: Easy 20 waves, Normal 30, Hard 40 (level gate), Hardcore 45 (consumables off, 1 to 3 players, gems), Endless; a boss every 5 or 10 waves and a mini-boss about two-thirds through.',
      'Each mode has its own enemy HP multiplier (roughly x2 to x4 per step, heuristic), tighter starting cash on harder modes, its own wave table and reward currency.',
      'Gate by account level (one game: 5, 15, 30, 50) and by a completion flag from the previous mode; add a secret time challenge for the best players and a Challenge mode that rotates weekly with fixed loadouts and modifiers.',
      'Budget a match at 20 to 30 waves in 10 to 20 minutes.',
    ],
    verification: ['A new player can start the second match without a level gate.', 'Each mode reaches its reward currency and a coin fallback exists.'],
    failureModes: ['Hard modes that pay only gems with no coin fallback.', 'No way to retry quickly.'] },
  { id: 'pattern-base-building-wave-defense', title: 'Build a build-phase and wave-phase base defense with the player on the field', domain: 'genre_pattern', genres: ['survival', 'tower_defense'], summary: 'A 30 to 60 s build phase, server-side weapon hits, lives per wave, enemies that attack structures and a cash reserve rule.', refs: ['pathfinding'], keywords: ['base defense', 'build phase', 'structures', 'walls', 'turrets', 'player weapon', 'lives', 'zombie'],
    steps: [
      'Rounds: a build phase (30 to 60 s, heuristic) where players place walls, spikes and turrets with cash, then a wave phase where enemies path to the core or nearest structure; bosses at 25, 50, 75 and 100 in one shipped game.',
      'Player weapons: a Tool whose hit is raycast on the server from the reported aim, validated by distance and rate; upgrades come from a shop with prices that rise per purchase.',
      'Lives: two per wave and one on respawn, or revive by teammates. Structures have health; enemies target ClosestStructure or Core; repair costs cash and keeping 20% to 30% unspent is a guide advice.',
      'Up to about 40 enemies can use Humanoid with PathfindingService (SetNetworkOwner(nil) on each NPC); for hundreds use the data-only approach. Servers of 6 to 40 with parties up to 6.',
    ],
    verification: ['A script-fired hit from beyond range does no damage.', 'Walls cannot seal the path completely: enemies attack them instead.'],
    failureModes: ['Client-owned NPCs are an exploit risk.', 'Repetition after 15 to 20 minutes with no boss variety or objectives.'] },
  { id: 'pattern-rts-lite-economy-army-cap', title: 'Build an RTS-lite with income buildings, a population cap and one command remote', domain: 'genre_pattern', genres: ['tower_defense', 'adventure'], summary: 'Server data units rendered by clients, drag-box selection, a Command(unitIds, target) remote and flow-field movement for groups.', refs: ['pathfinding'], keywords: ['rts', 'units', 'population cap', 'barracks', 'selection', 'flow field', 'fog of war', 'command'],
    steps: [
      'Economy buildings pay per second or per minute and show an income-per-minute stat. Barracks produce units with a population cap (30 to 40; heavy units take 3) and a build queue; units are server data rendered by clients as in the snapshot pattern.',
      'Selection is a client drag box (GetPartBoundsInBox or screen-space tests); commands go to the server as one RemoteEvent Command(unitIds, targetPosition) and the server validates ownership and the cap.',
      'Groups moving to a shared target use a flow field from one goal (or a grid BFS); per-unit PathfindingService only for a few units, recomputed at most every 5 frames. Target acquisition uses a spatial grid; separation is a simple repulsion in the data loop.',
      'Win by destroying the enemy core; keep matches under 20 to 25 minutes. Optional fog of war: an 8x8 stud grid with team visibility counts, not a PointLight per cell.',
    ],
    verification: ['A forged Command for another team units is refused.', 'Two hundred units move without server Parts replicating: bandwidth stays flat.'],
    failureModes: ['Default replication of hundreds of moving unit Parts (one team measured about 600 KB per second per 100 units).', 'Per-unit pathfinding every frame.'] },
  { id: 'pattern-td-pvp-lane-send', title: 'Add a competitive lane-send mode where sent enemies pay income', domain: 'genre_pattern', genres: ['tower_defense', 'fps_arena'], summary: 'Two mirrored lanes, a send menu with costs, repeating waves, lower tower caps than co-op and a visible warning before a send lands.', refs: ['gdCoreLoops'], keywords: ['pvp', 'lane send', 'send menu', '1v1', 'income', 'rating', 'tower cap'],
    steps: [
      'Two lanes (or one mirrored path) with separate bases; each team has cash and a send menu such as Send Fast (100) and Send Tank (400); sent enemies pay the sender income that rises with the cost sent (heuristic) and walk the other path.',
      'Waves repeat (one shipped PvP mode runs 31 that repeat); the match ends when a base reaches 0 or a timer expires.',
      '1v1 or 2v2 up to 6 players; match by a simple rating and give the weaker side a team cash bonus; tower caps lower than co-op (12 for one tower versus unlimited in co-op).',
      'Show the next send cost and a cooldown to stop spam; give sent enemies a visible 3 to 5 s warning.',
    ],
    verification: ['Spam-send from a script: the cooldown holds.', 'A single send cannot win the match against a prepared defense.'],
    failureModes: ['A single send that wins the game, or no defense against sends.', 'Rating exploits with alternate accounts.'] },
  { id: 'pattern-plant-lane-idle-hybrid', title: 'Build a plant-lane idle defense with a timed seed shop and rarity-priced damage', domain: 'genre_pattern', genres: ['tower_defense', 'simulator'], summary: 'A 5-player garden of lanes with a plant cap, a seed shop on a timer with rare rotation, kill income, rebirth and one new mechanic.', refs: ['gdEconomy'], keywords: ['plant lane', 'garden', 'seed shop', 'restock', 'plants', 'idle defense', 'rarity price'],
    steps: [
      'A 5-player server; each player has a garden of 5 lanes or a grid with a cap of 35 plants; enemies walk the lanes toward it.',
      'Seed shop on a 5-minute timer with stock chances by rarity (common guaranteed, rare rotating) and a separate gear shop; price tiers so cost per damage rises with rarity but damage per slot rises too, so players buy up only when slot-limited (third-party: $20 per damage at the first seed to $25,000 at the last).',
      'Illustrative starts to test: 10 damage for $200, 25 for $1,250, 55 for $5,000; money from kills; rebirth gives +50% money and luck per tier (third-party).',
      'Weekly update with a fixed-day event. Add one new mechanic for novelty (a lane switch, a card deck or a day-night cycle). If a Robux restock gives random stock, the paid random items rules apply.',
    ],
    verification: ['Plot cost per damage by tier: it rises while damage per slot rises.', 'The shop timer is visible and the same on all servers.'],
    failureModes: ['Price curves that make mid plants pointless.', 'No visible shop timer, or progress lost offline.'] },
  { id: 'design-td-telemetry-live-tuning', title: 'Log a wave histogram and tune only Config numbers weekly', domain: 'game_design', summary: 'Per-match logs and a wave-at-defeat histogram turn a spike at one wave into a balance fix, one change at a time.', refs: ['anFunnelEvents'], keywords: ['telemetry', 'wave histogram', 'leaks', 'live tuning', 'config version', 'clear rate', 'balance'],
    steps: [
      'Per match log mode, wave reached, leaks per wave, time per wave, cash at wave end, towers placed by type and party size; per player D1, D7 and D30 from Creator Analytics and session length.',
      'Compare with the benchmark of the Creator Dashboard (a note-03 anchor is a D1 median about 10% and p75 13% across large games); a spike at one wave in the histogram is a balance bug.',
      'Read the histogram weekly and change only Config numbers, one at a time; version the Config and record each change with its date.',
      'Log suspicious placement rates, cash jumps and impossible tower positions, and rate-limit every remote.',
    ],
    verification: ['The histogram reproduces after a Config change in the expected direction.', 'Each Config version has a dated change note.'],
    failureModes: ['Tuning from three anecdotes.', 'Changing several numbers at once.'] },

  // --- note 16: horror, story and survival (heuristic values are starting points; maturity and flashing rules are first-party or conservative) ---
  { id: 'pattern-horror-room-chain-generator', title: 'Generate a numbered chain of rooms from entrance and exit anchors', domain: 'genre_pattern', genres: ['horror', 'adventure'], summary: 'A room pool with Entrance and Exit parts, a track kept three or four rooms ahead, overlap checks, forced milestone rooms and a seeded Random.', refs: ['overlapParams'], keywords: ['room generator', 'procedural rooms', 'entrance', 'exit', 'room pool', 'milestone room', 'seed', 'track'],
    steps: [
      'ServerStorage/RoomPool holds one Model per room with anchored CanCollide false Transparency 1 Parts Entrance and Exit facing the direction of travel (PrimaryPart = Entrance), attributes MinRoom, MaxRoom, Weight and HideSpots; sizes on an 8-stud grid (one poster convention).',
      'Workspace/Track keeps the generated rooms: build 3 or 4 at start; when the door of room N opens generate N+3; delete room N-2 only after every living player has index >= N. Place with room:PivotTo(prevExit.CFrame).',
      'Check overlap with GetPartBoundsInBox (box a little smaller than the room, OverlapParams excluding the candidate); on a hit discard and re-roll up to 5 times; ban a third consecutive turn in one direction.',
      'Before rolling, force a special room when #rooms + 1 hits a milestone (50, 100, a shop every 20 to 30: heuristic). Use a seeded Random.new(seed) per run so a failed run can be replayed; room attributes decide which entities may spawn.',
    ],
    verification: ['Generate 200 rooms with one seed twice: identical layouts and no overlaps.', 'Delete behind the slowest player only: nobody falls into a missing room.'],
    failureModes: ['Overlap false positives from touching walls (shrink the box), or stray lights left in deleted rooms (destroy the model).', 'More than 4 rooms ahead hurts memory.'] },
  { id: 'pattern-horror-telegraphed-corridor-entity', title: 'Script a telegraphed sweep entity that hiding beats', domain: 'genre_pattern', genres: ['horror', 'adventure'], summary: 'A tell long enough to reach cover, a timed pass along a path and a Hidden-attribute kill rule instead of hitbox overlap.', refs: ['overlapParams'], keywords: ['entity', 'telegraph', 'tell', 'sweep', 'pass', 'hide rule', 'light flicker', 'death hint'],
    steps: [
      'Per entity define tell time, passes, speed, hide rule and damage. Starting examples (heuristic): a fast single pass after 3.5 s of rapid flicker and rising rumble at 60 studs/s; a multi-pass entity with a 4 s tell, 2 to 4 passes and 3 to 5 s gaps; a sweep that leaves for about 10 s and returns; a double flicker, silence, then a pass in a 6 to 9 s window.',
      'Tell length >= distanceToNearestHide / 16 + 1 seconds (derived from WalkSpeed 16): flicker the PointLights ahead with a server tween and a looping client sound.',
      'Move an anchored model along a CFrame path; each Heartbeat, for every player whose character attribute Hidden is not true and within 8 studs (GetPartBoundsInRadius), kill and fire a death-hint event naming the entity.',
      'Schedule it only if the current and next rooms have HideSpots >= 1 and never within 15 s of another sweep entity (heuristic); break corridor lights after a pass.',
    ],
    verification: ['A script that hides at the last second survives; one that stays out dies with the hint.', 'A player inside a hide spot is never killed by an overlapping hitbox.'],
    failureModes: ['Killing hidden players through hitbox overlap instead of the Hidden attribute.', 'An entity faster than the tell lets a mobile player react too late.'] },
  { id: 'pattern-horror-perception-stalker-nodes', title: 'Drive a stalker with node paths, senses and a menace pull-back', domain: 'genre_pattern', genres: ['horror', 'survival'], summary: 'Patrol, investigate, chase and search states, sight and hearing checks, throttled pathfinding with the server as network owner.', refs: ['pathfindingService'], keywords: ['stalker', 'monster ai', 'nodes', 'patrol', 'chase', 'hearing', 'sight cone', 'repath'],
    steps: [
      'Build a node graph per room (Parts tagged Node with neighbour attributes); the monster walks node to node and real vision is for one or two special threats.',
      'States: Patrol (visit nodes), Investigate (noise or last-seen point for 6 to 10 s), Chase (re-path every 0.5 to 1 s), Search (3 to 5 nearby nodes, then give up). Never re-path every frame; MoveTo the second waypoint and handle Path.Blocked.',
      'Senses (heuristic): sight = raycast head to head within 60 to 80 studs and a 100-degree cone, blocked by walls; hearing = noise radius set by the server as an Attribute (sprinting 40, walking 12, crouching 0).',
      'CreatePath({AgentRadius = 3, AgentHeight = 6, AgentCanJump = false, WaypointSpacing = 4}); SetNetworkOwner(nil) on HumanoidRootPart. A menace value sends the monster to a far node when pressure stays high. Never teleport except a scripted entrance, spawn out of sight.',
    ],
    verification: ['The monster loses a player who breaks line of sight and stays quiet.', 'Frame time stays flat with the monster chasing for 60 s.'],
    failureModes: ['Re-pathing every frame (jitter); the 8 s MoveTo timeout; a 3,000-stud direct distance cap.', 'Perfect knowledge of the player position.'] },
  { id: 'pattern-horror-hide-locker-system', title: 'Build a hide spot with a shrinking hide time and server-set Hidden', domain: 'genre_pattern', genres: ['horror', 'survival'], summary: 'A prompt that moves an anchored character inside, a hide timer that falls with progress, a cooldown and a counter for detecting threats.', refs: ['proximity'], keywords: ['hide', 'locker', 'closet', 'hidden attribute', 'peek', 'hide time', 'cooldown'],
    steps: [
      'Model with a Part Inside (anchor point) and a ProximityPrompt: ActionText "Hide", HoldDuration 0 to 0.3, MaxActivationDistance 7, RequiresLineOfSight true (heuristic values).',
      'On Triggered (server): no occupant, set Occupant, set character attribute Hidden = true, anchor HumanoidRootPart, PivotTo(Inside.CFrame), tell the client to show a first-person slit view with a peek control.',
      'Max hide time starts about 27 s and falls to 10 s by the last room: 27 - 17 * min(room / 100, 1) (a linear fit to two observed numbers). A pulsing screen and a heartbeat that speeds up warn; at zero eject the player.',
      'Cooldown about 5 s before re-entering; a rare threat that detects hiders needs a counter (a teammate with an item, a hold-the-cursor mini-game, crouch-hiding).',
    ],
    verification: ['A client that sets Hidden itself is ignored.', 'On a phone the peek works through an on-screen control and the exit is never blocked.'],
    failureModes: ['The client sets Hidden (exploit); it must be server-set.', 'Anchoring the character while a threat kills by Touched.'] },
  { id: 'pattern-horror-flashlight-audio-readable-kit', title: 'Add a flashlight, layered audio and phone-safe tells to a dark map', domain: 'genre_pattern', genres: ['horror', 'survival'], summary: 'A shadowed SpotLight, a quiet ambience plus sparse stings from emitters, tells audible on phone speakers and a flash warning; audio objects are made by script.', refs: ['audioEmitterClass'], keywords: ['flashlight', 'spotlight', 'ambient audio', 'stings', 'audioemitter', 'tells', 'subtitles', 'photosensitivity'],
    steps: [
      'Flashlight: a SpotLight on the head or a held Tool, Angle 55 to 70, Range 40 to 60, Brightness 2 to 3, Shadows true (heuristic), toggled on the client with a server attribute for replication. Cap shadowed lights per room for phones; PointLights Range 12 to 20, Brightness 0.8 to 1.5 at landmarks. Lighting itself comes from the night-horror look skill.',
      'Audio is made by a script (the create tools lack AudioPlayer, AudioEmitter, AudioReverb, AudioDeviceOutput and Wire): a quiet looping AudioPlayer into an AudioDeviceOutput, stings played from the AudioEmitter at the source, an AudioReverb per room type; silence before a scare. SoundService.AmbientReverb affects legacy Sound objects only.',
      'Every tell must be audible on a phone speaker: a low rumble alone is not enough, add a mid-frequency sting and a visual subtitle option (heuristic).',
      'Warn for flashing and loud audio on the game page, keep strobing off by default and under 2 flashes per second (a conservative heuristic, no Roblox policy text found).',
    ],
    verification: ['At the lowest device brightness and on a phone speaker the next door and each tell are still found.', 'Strobe effects are off by default and a setting exists.'],
    failureModes: ['A monster tell that depends on a low frequency.', 'Fog or darkness that hides the exit sign.'] },
  { id: 'pattern-horror-anomaly-arrival-hidden-table', title: 'Run anomaly arrivals from a server-only table with sanity and shift scaling', domain: 'genre_pattern', genres: ['horror', 'adventure'], summary: 'The server picks each arrival and its tell set, the client sees only visuals, sanity drains and restores and the anomaly share rises per shift.', refs: ['gdCoreLoops'], keywords: ['anomaly', 'arrivals', 'tell set', 'sanity', 'shift', 'hidden flag', 'scanner', 'work and detect'],
    steps: [
      'Shift = a timed state machine: Intermission (30 s, buy items), Shift (8 to 12 minutes, heuristic), Results (reward and streak); shifts 1 to 5 scripted as teaching, then endless with a scaling table.',
      'The server picks {kind, isAnomaly, anomalyType, tellSet} from a table in ServerStorage; the client receives only the visual state. Never replicate isAnomaly as an Attribute: Attributes replicate to every client.',
      'Ship about 8 anomaly types at launch (the reference has 22), each with a tell on a different tool (window, camera, photo, scanner); a scanner with a 120 s cooldown and green, red, yellow readouts is one.',
      'Decisions: admit, reject or call security; a wrong admit costs sanity or a patient and three deaths fail the shift. Sanity 0 to 100 drains on anomalies, restored by an item, hallucinations at 0. Anomaly share (heuristic): 20% on shift 1, +4 points per shift, capped at 55%, at least one genuine arrival per group of 3; scale arrivals by player count.',
    ],
    verification: ['Inspect every replicated Attribute and remote payload: no anomaly flag is readable on a client.', 'A solo player can still pass shift 1 with correct play.'],
    failureModes: ['Client-readable anomaly flags, or tells that need a high-resolution screen.', 'No clear feedback on why a decision was wrong.'] },
  { id: 'pattern-coop-extraction-skill-checks', title: 'Run co-op machines with server-timed skill checks and a greed governor', domain: 'genre_pattern', genres: ['horror', 'adventure'], summary: 'Floor-scaled machines, a skill check whose press time the server measures, failure that alerts enemies and a hoarding bonus enemy.', refs: ['workspaceClass'], keywords: ['skill check', 'machines', 'extraction', 'co-op', 'floor', 'greed meter', 'alert', 'characters'],
    steps: [
      'Floor generator (heuristic curves): machines = clamp(2 + floor(floor/2), 2, 20), a special floor every 25, enemies = min(8, 1 + floor(floor/3)) (6 cap solo).',
      'Machine progress 0 to 100%; players hold a prompt; every 1.5 to 3 s a check starts: the server sends {startTime = workspace:GetServerTimeNow(), duration = 1.0, centre = random 0.25 to 0.85, width = 0.12}; the client sweeps a needle and sends only "press"; the server computes the press position from its receive time and accepts within the width plus a 0.05 latency allowance.',
      'Hit adds progress (gold zone more); a miss pauses progress for 3 s and alerts nearby enemies. Odd floors give an elevator card, even floors a shop; 0 to 5 currency per machine by contribution.',
      'Tension governor: hoarding over 50 currency or skipping the shop 3 times spawns a bonus enemy. Characters have 5 stats (skill check, speed, stamina, stealth, extraction), 2 abilities and 3 hearts. Enemies use a tell, a detection radius and an alert target.',
    ],
    verification: ['A client that sends "press" at the perfect time every frame is capped by the server window.', 'Test the check with 60 ms simulated touch latency: still playable on a phone.'],
    failureModes: ['Trusting the client press time.', 'A window so small on mobile that it is unplayable.'] },
  { id: 'pattern-asymmetric-generator-round', title: 'Build a 1 versus 4 generator round with stamina constants and a terror radius', domain: 'genre_pattern', genres: ['horror', 'fps_arena'], summary: 'A lobby-vote-round-results machine, server-owned stamina and speed constants, five generators and per-killer terror radius audio.', refs: ['gdCoreLoops'], keywords: ['asymmetric', 'killer', 'survivors', 'generators', 'stamina', 'terror radius', 'role queue', 'round clock'],
    steps: [
      'State machine: Lobby, map vote (10 s), spawn, round (clock starts at 4:00), results; 1 killer versus 4 survivors (observed numbers; match sizes conflict between sources).',
      'Constants from one reference: survivor walk 12, sprint 26; killer walk 8, sprint 27.5; stamina 100 and 110, drain 10 and 9.5 per second, regen 20 and 21 per second, 0.5 s regen delay, a 2 s sprint lock at zero; server-owned Attributes with client prediction. Keep killer speed within 2 studs/s of survivors.',
      'Objectives: 5 generators, each a 3-layer puzzle (each layer shortens the clock by 3 s, a finished generator by 12 s); the exit opens after all five.',
      'Terror radius: an AudioPlayer heard within a per-killer radius of 30 to 120 studs, layered at 3 distances; 2 to 4 abilities per character with cooldowns 14 to 50 s and one 200 s ultimate; points 100 to 500 per match spend on characters.',
    ],
    verification: ['Play five rounds: the clock logic runs on the server and ends the round once.', 'Sprinting to zero stamina locks sprint for 2 s on both roles.'],
    failureModes: ['Clock logic on the client, or killers much faster than survivors.', 'No counterplay to the terror radius; party play ruining role balance.'] },
  { id: 'pattern-horror-episodic-chapters-saves', title: 'Ship story horror as 15 to 25 minute chapters with checkpoints and replay hooks', domain: 'genre_pattern', genres: ['horror', 'adventure'], summary: 'Chapters in a hub, a max-chapter save, checkpoints every 3 to 5 minutes, collectible lore and skippable cutscenes.', refs: ['dataStore'], keywords: ['chapters', 'episodic', 'story', 'checkpoint', 'journal pages', 'cutscene', 'replay', 'save'],
    steps: [
      'Each chapter is its own place or a ModuleScript level loaded into a hub; store HorrorProgress_v1 with UpdateAsync taking the max chapter; validate the chapter against the DataStore, never teleport data.',
      'Chapter length 15 to 25 minutes, a checkpoint every 3 to 5 minutes, death returns to the last checkpoint with a short fade.',
      'Collectibles: 10 to 24 journal pages or notes carry lore and unlock a replay mode. Cutscenes: CurrentCamera.CameraType = Enum.CameraType.Scriptable, tween the CFrame, always skippable, restore Custom after; keep UI minimal in chases.',
      'Replay hooks: modifiers, difficulty, an alternate ending, skins or a round-based side mode. Cadence: a chapter every 1 to 3 months or a seasonal mode every 1 to 2 months between chapters.',
    ],
    verification: ['Quit mid-chapter and rejoin: you resume at the last checkpoint with the max chapter intact.', 'Every cutscene can be skipped on replay.'],
    failureModes: ['Saves overwritten by older data.', 'A blocking cutscene longer than about 30 seconds with no skip (heuristic).'] },
  { id: 'pattern-survival-camp-clock-fire-enemies', title: 'Run a night-counter survival camp from a shared clock, a fuel fire and enemy tables', domain: 'genre_pattern', genres: ['survival', 'horror'], summary: 'A server cycle timestamp, a fire with fuel and radius, enemies gated by night and fire level, rescue objectives and a day multiplier.', refs: ['workspaceClass'], keywords: ['survival camp', 'campfire', 'fuel', 'night counter', 'day cycle', 'enemy table', 'rescue', 'multiplier'],
    steps: [
      'The server owns a CycleStart timestamp; each client computes the phase from workspace:GetServerTimeNow(): day 180 s, night 90 s (one reference, which conflicts with other pages), mapped to Lighting.ClockTime (day 6 to 18, night 18 to 6). The day counter rises per night survived by a dayMultiplier (1 up to 9 with beds and rescued helpers); end at 99.',
      'Campfire attributes Fuel (seconds) and Level (1 to 6); drain 1/s x a weather factor (1, 2 in rain, 3 in a blizzard: heuristic); logs add +60 s (heuristic); safe within radius 60 studs and Fuel > 0.',
      'Enemies by night and fire level: a watcher on night 1 that does not attack, wolves from night 2, alpha wolves at fire level 3 to 5, bears at 5, a raid every 4 nights; starting numbers wolf 75 HP, 20 damage, speed 23; bear 300 HP, 40 damage, speed 28 (third-party).',
      'Rescue objectives: 4 gated caves, each guarded by 2 to 6 enemies and opened with a coloured key; a rescued helper raises the multiplier. A first-night grace and first-day goals (3 to 10 wood) teach the loop. A repeatable chest on a 20 minute timer pays currency.',
    ],
    verification: ['Let the fire go out: the failure state triggers once and cleans up.', 'Two clients show the same phase from the same timestamp.'],
    failureModes: ['A fire radius so large nothing threatens the camp, or a multiplier that skips all danger.', 'No failure state for an empty fire.'] },
  { id: 'pattern-survival-server-needs-attributes', title: 'Keep hunger, thirst and warmth on the server with one drain loop', domain: 'genre_pattern', genres: ['survival', 'simulator'], summary: 'Three Attributes per player, one accumulator loop, named states with rate-based penalties and a client that only requests actions.', refs: ['remotes'], keywords: ['hunger', 'thirst', 'warmth', 'needs', 'attributes', 'drain', 'eat', 'food buff'],
    steps: [
      'Per player Attributes Hunger, Thirst, Warmth, each 0 to 100, set only by the server.',
      'One Heartbeat accumulator subtracts per-second rates; heuristic start: Hunger 100 over 12 minutes, Thirst 100 over 8 minutes, sprinting x2.',
      'States: Full 70+, Hungry 30 to 70, Starving 1 to 29, Empty 0 (deal 1 health per second); below 30 slow stamina regen. Penalties follow rates, not instant death.',
      'The client sends only "eat item X"; the server validates ownership, cooldown and effect, updates Attributes, and the client listens with GetAttributeChangedSignal. Make cooked food a buff (more restore plus a timed bonus) so eating is a choice.',
    ],
    verification: ['Send eat with an item you do not own, or 100 times a second: refused or rate limited.', 'Leave a character idle for 12 minutes: Hunger reaches 0 once.'],
    failureModes: ['Client-side drains.', 'RemoteEvent spam without sanity checks on amounts.'] },
  { id: 'pattern-survival-crafting-bench-tiers', title: 'Gate crafting by bench level with rare drops and server-checked recipes', domain: 'genre_pattern', genres: ['survival', 'adventure'], summary: 'Items and recipes as data, resource nodes that respawn, a Craft remote the server checks and tiers that need danger to unlock.', refs: ['collection'], keywords: ['crafting', 'recipes', 'bench', 'resource nodes', 'rare drops', 'inventory', 'tiers'],
    steps: [
      'An Items ModuleScript (id, stack size, recipe, bench level) with Recipes as separate data; bench level costs grow from about 5 wood plus 1 scrap to 50 wood, 50 scrap and 1 rare gem (one reference table).',
      'Resource nodes: trees take 3 to 5 hits, rocks similar; respawn 60 to 180 s (heuristic) on a server timer; drops go to the nearest player backpack by the server.',
      'Craft(recipeId): the server checks bench level, ingredients and inventory space, then deducts and grants.',
      'Gate levels 4 and 5 by rare drops from dangerous places so exploration is required. Cap a first release at 26 to 50 recipes (the reference has 49).',
    ],
    verification: ['Craft with a missing ingredient or the wrong bench level from a script: refused.', 'No stack grows past its stack size.'],
    failureModes: ['A client-trusted craft or unlimited stacking.', 'A recipe tree where level 2 is already lethal to reach.'] },
  { id: 'pattern-moving-base-distance-run', title: 'Build a moving-base run with a fuel clock, stops and a night loot rule', domain: 'genre_pattern', genres: ['survival', 'adventure'], summary: 'A server-owned train model with fuel, distance milestones, day-only loot, a final timed event and a recycled track.', refs: ['streaming'], keywords: ['train', 'moving base', 'fuel', 'distance', 'stops', 'night loot', 'recycle track', 'revive'],
    steps: [
      'A train model with a driver seat; a fuel Attribute drains per second; stops: towns every 10,000 m, forts every 10,000 m, end at 80,000 m (reference numbers, test your own).',
      'Loot spawns during the day only; at night the area is hostile and loot stops. The server updates the distance counter from the train position along a spline or straight rail; coal pickups refill fuel.',
      'Final event: a bridge lowered by a player who leaves the train, with a countdown of 4 minutes.',
      'Recycle long tracks by moving the train to a parallel start so the world stays far under 1 million studs from the origin. Move the anchored train model by tween or AlignPosition, not free physics. Classes are bought with a run currency; revive about 45 Robux (observed).',
    ],
    verification: ['Run 80,000 m in a script: positions stay far under 1 million studs and the train never desyncs.', 'Content ahead of the train is streamed in before it arrives.'],
    failureModes: ['A physics-driven train that desyncs between clients.', 'Content popping in with streaming.'] },
  { id: 'pattern-horror-menace-intensity-director', title: 'Pace scares with a menace value and relax and build phases', domain: 'genre_pattern', genres: ['horror', 'survival'], summary: 'A per-player menace number moves with line of sight, proximity and noise; sustained high menace calls a relax phase, sustained low calls a build phase.', refs: ['gdCoreLoops'], keywords: ['menace', 'intensity', 'director', 'pacing', 'relax phase', 'build phase', 'jump scare cap'],
    steps: [
      'menace 0 to 100 per player (heuristic values): +8/s when a monster has line of sight, +3/s within 30 studs, +10 on a loud event, -4/s otherwise.',
      'If the team average stays above 80 for 10 s call a relax phase: disable roaming monsters for 30 to 45 s, spawn a resource, play calm audio. If it stays under 20 for 60 s call a build phase: spawn the tell for the next entity.',
      'Cap scares per mechanic at 2 and vary the type (time pressure, scarce resources, sound).',
      'Log menace over time in tests and tune until the median run has 3 to 5 peaks.',
    ],
    verification: ['Plot menace for ten runs: each has 3 to 5 peaks.', 'A relax phase never lets a monster hit a player.'],
    failureModes: ['A director that punishes good players with more monsters.', 'Rubber-banding that feels fake.'] },
  { id: 'monetize-coop-run-currency-revive-ladder', title: 'Build a co-op run monetisation ladder: free currency, revive, classes, cosmetics', domain: 'game_design', summary: 'Free run currency, a currency pack ladder, a cheap revive, classes bought with soft currency and shop prompts only between runs.', refs: ['prodDeveloperProducts'], keywords: ['run currency', 'revive', 'classes', 'currency packs', 'cosmetics', 'x2 pass', 'lobby shop'],
    steps: [
      'Free currency for every run plus a pack ladder (observed: 250 for 49 Robux up to 16,000 for 1,799 in one game, 20 for 99 up to 700 for 2,500 in another); treat them as starting points.',
      'A revive consumable at about 45 Robux (observed), also earnable by codes; classes or characters bought with soft currency priced 10 to 600, the first within 2 runs; give 2 to 5 currency for a 50 or 99 night milestone and 5 for a dungeon chest.',
      'Cosmetics and emotes as the long tail (one game has 805 skins and 97 emotes); a x2 currency pass at 150 to 300 Robux (observed).',
      'Prompts only in the lobby or an intermission, never mid-chase; show odds for random items and apply PolicyService.',
    ],
    verification: ['A free player can buy the cheapest class within 2 runs.', 'No purchase prompt appears during a chase.'],
    failureModes: ['Selling a survival-critical edge.', 'Paywalling the first class.'] },

  // --- note 17: PvP and combat (frame counts, windows and ladder numbers are heuristics or third-party snapshots: tune with play and artificial latency) ---
  { id: 'combat-server-state-machine-melee', title: 'Run melee combat as a server state machine with timestamp stuns', domain: 'gameplay', summary: 'One active state per character, state and cooldowns as server-written Attributes, stun as a timestamp and a guard at the top of every combat remote.', refs: ['humanoid'], keywords: ['combat', 'state machine', 'stun', 'cooldown', 'attributes', 'melee', 'battlegrounds', 'remote guard'],
    steps: [
      'A CombatState ModuleScript holds states and priorities (Idle 1, Blocking 2, Attacking 2, Dashing 2, Stunned 3, Dead 4); TrySet(character, newState) returns false on illegal transitions (Attacking to Blocking only inside a cancel window).',
      'State lives in character Attributes (State, StunUntil, CD_<Move>) written on the server with workspace:GetServerTimeNow() timestamps so clients read them without remotes.',
      'Stun(character, seconds) sets StunUntil = max(existing, now + seconds) and State = "Stunned"; overlapping stuns extend, they do not stack; a max duration clears it even if an animation errors. During hit-stun set WalkSpeed and JumpHeight to 0 and restore the stored prior values.',
      'Every combat remote starts with: the player owns the character, Health > 0, State allows the action, the cooldown elapsed and a per-player rate limit (for example 20 per second).',
    ],
    verification: ['Attack while Stunned from a script: refused. Fire 200 attacks a second: rate limited.', 'Kill the animation mid-stun: the character still recovers.'],
    failureModes: ['A stun that changes a value but is not checked in the attack handler.', 'BoolValues for state (use Attributes).'] },
  { id: 'combat-m1-combo-input-buffer-hit-windows', title: 'Build an M1 combo chain with a buffer and animation-driven hit windows', domain: 'gameplay', summary: 'A combo table, a client-predicted animation, a server-held combo index, marker-gated hit windows with timer fallback and bounded end lag.', refs: ['animationEvents'], keywords: ['m1', 'combo', 'input buffer', 'hit window', 'markers', 'end lag', 'cancel window', 'sword'],
    steps: [
      'Combo table Hit1..Hit4: animation id, damage (a reference uses 3, 3, 4, 5 percent of max health; or flat 8, 8, 10, 14 for 100 HP), hit window (marker names or fractions), cooldown, final-hit knockback, hitbox size and offset (heuristic 5x5x8, 5x5x8, 4x6x6, 6x4x10 studs).',
      'Client: play the animation at once (prediction) and fire an Attack remote carrying only the combo index, never damage.',
      'Server: validate, advance the index when the last attack was within the reset window (heuristic 1.0 s), set State Attacking, connect GetMarkerReachedSignal("HitStart") and "HitEnd" and add a task.delay fallback of the window length in case the track is cancelled.',
      'Input buffer: one click during recovery is stored for up to about 0.2 s and consumed when recovery ends. End the chain with 0.5 to 1.0 s end lag; cancels only inside the defined window (for example frames 12 to 18 of 24).',
    ],
    verification: ['Send combo index 4 first from a script: the server ignores it and uses its own index.', 'Cancel the animation: the hit window still closes on the fallback timer.'],
    failureModes: ['Animation priority conflicts (attacks Action4, hit reactions Action3) and R15 versus R6 mismatches.', 'M1 spam that is free because end lag is missing.'] },
  { id: 'combat-server-swing-hit-detection', title: 'Detect swing hits on the server with a deduped bounds query', domain: 'gameplay', summary: 'GetPartBoundsInBox with an Exclude filter and a MaxParts cap, one hit per character per swing, a reach check and no Touched.', refs: ['overlapParams'], keywords: ['hitbox', 'swing', 'getpartboundsinbox', 'overlapparams', 'dedupe', 'reach check', 'aoe'],
    steps: [
      'Build OverlapParams once: FilterType Exclude, MaxParts 32; refresh FilterDescendantsInstances = {attackerCharacter} per swing.',
      'During the active window call workspace:GetPartBoundsInBox(root.CFrame * offset, size, params) two to six times across the window or once at the hit marker; make the box 1 to 2 studs more generous than the visual for latency.',
      'For each part find the character with FindFirstAncestorOfClass("Model"), get its Humanoid, skip Health <= 0 and anything already in this swing hit set, add it, then run the hit.',
      'Sanity check: the victim root is within reach + 3 studs of the attacker root. Tag characters "Combatant" in a big arena. Use Raycast, Blockcast or Spherecast for projectiles and thin thrusts, never the Touched event for damage.',
    ],
    verification: ['A target with six parts inside the box takes exactly one hit per swing.', 'A hit through a wall from a script beyond reach is refused.'],
    failureModes: ['Counting several parts of one character as separate hits.', 'Forgetting the MaxParts cap, or hitting through walls on ranged moves.'] },
  { id: 'combat-block-parry-guard-break', title: 'Make defense a skill: block, timed parry and guard break', domain: 'gameplay', summary: 'Server-timed block start, a narrow perfect window, a guard meter and a clear sound and flash for each outcome.', refs: ['humanoid'], keywords: ['block', 'parry', 'perfect block', 'guard break', 'guard meter', 'window'],
    steps: [
      'Hold-to-block sets State Blocking on the server on input down and clears on release; record BlockStart in server time.',
      'Perfect block: a hit within the first PerfectWindow of BlockStart (start at 0.15 to 0.25 s for a beginner-friendly game, heuristic; one reference reports 3 frames, another about 0.5 s) negates damage, stuns the attacker 0.6 to 1.0 s (a full parry stun of about 3 s is the reported upper bound) and fills the ultimate meter.',
      'Normal block reduces damage 70% to 100% but drains Guard (for example 100 Guard, heavy hits drain 25) with small pushback; at 0 Guard the blocker is Stunned for 1.5 s; grabs and unblockables ignore Blocking; Guard regenerates after 1.5 s without hits.',
      'Give a clear sound and flash for a perfect block and a broken guard so the player sees why they lost. Allow an input-timestamp allowance of the measured ping clamped to 0.1 s.',
    ],
    verification: ['Block at 0.1 s versus 0.5 s after input: only the first is perfect.', 'Press block during Attacking: refused unless the move has a cancel window.'],
    failureModes: ['Parry windows tied to client time.', 'Allowing block while attacking.'] },
  { id: 'combat-four-move-kit-awakening-meter', title: 'Define a four-move character kit with cooldowns and an awakening meter', domain: 'gameplay', summary: 'Data-driven characters, a server cooldown module, damage as a percent of max health and a meter filled by damage and parries.', refs: ['gdCoreLoops'], keywords: ['character kit', 'moves', 'cooldown', 'awakening', 'ultimate', 'archetypes', 'roster'],
    steps: [
      'Characters[ID] = {Name, Health 100, WalkSpeed 16, M1 = combo, Moves = {[1..4] = {key, cooldown, cost, startup, duration, damage, hitbox, effect}}, Awakening = {duration 12, healAmount 30, moveset swap}, Ultimate}.',
      'A cooldown module keeps per-player ready times in server time; the server rejects a move before it is ready and clients mirror cooldowns from Attributes for the UI.',
      'Starting values (third-party references): special cooldowns 5 to 25 s, big ones 60 to 120 s; damage as percent of max HP: 3% to 5% M1, 12% to 25% specials, 40% to 70% ultimates.',
      'Meter fills by damage dealt (for example 1 point per 1% of enemy HP, 100 to awaken) and parries; on trigger set State Awakened for 10 to 15 s, heal 15 to 60 HP, swap the moveset and add speed.',
      'Start with archetypes (Brawler, Tank, Speedster, Ranged, Support) with clear counters rather than mirrored kits; track win rate per character from day one.',
    ],
    verification: ['Spam a move from a script: only cooldown-spaced uses land.', 'A full awakening lasts 10 to 15 s and cannot be re-triggered while active.'],
    failureModes: ['A move with no cooldown commitment.', 'Too many characters before balance data exists.'] },
  { id: 'combat-hit-feedback-stop-knockback-ragdoll', title: 'Add hit-stop, knockback, ragdoll and camera shake to confirmed hits', domain: 'gameplay', summary: 'A small cosmetic unreliable event, brief animation speed dips and a Highlight flash on clients, and server-side knockback.', refs: ['effHighlight'], keywords: ['hit stop', 'hit feedback', 'knockback', 'ragdoll', 'camera shake', 'impact', 'juice'],
    steps: [
      'On a confirmed hit the server fires a cosmetic UnreliableRemoteEvent to nearby clients with {attackerId, victimId, strength 1..3}, under 1,000 bytes.',
      'Client strength 1: a 2-frame animation speed dip (AdjustSpeed(0) for 0.03 s on both tracks, then restore), a Highlight flash on the victim for 0.1 s and a layered impact sound; strength 3: up to about 8 frames (0.13 s), a camera shake with fast exponential decay toward the hit and an FOV kick (heuristic; light hits 2 to 4 frames).',
      'Knockback on the server: victim root AssemblyLinearVelocity or a LinearVelocity with MaxForce and a 0.2 to 0.4 s lifetime away from the attacker; the final hit of a chain launches; SetNetworkOwner(nil) on the victim during the launch.',
      'Ragdoll: Humanoid:ChangeState(Enum.HumanoidStateType.Physics) or a ragdoll module (a community module has reports of weld and ownership conflicts: a starting point); gate ragdoll cancel behind a 30 s cooldown (reference).',
    ],
    verification: ['Hit stop pauses only animation and camera, never server time.', 'Ten rapid hits do not stack ragdolls or leave a victim frozen.'],
    failureModes: ['Cumulative ragdoll exploits and large payloads on the unreliable remote.', 'Pausing server time instead of just the visuals.'] },
  { id: 'shooter-hitscan-predict-validate', title: 'Fire a hitscan gun with client tracers and server validation', domain: 'gameplay', summary: 'Weapon attributes, an immediate local tracer, and a server check of rate, ammo, origin, direction, range and a fresh raycast.', refs: ['worldRoot'], keywords: ['hitscan', 'gun', 'raycast', 'tracer', 'fire rate', 'ammo', 'headshot', 'validation'],
    steps: [
      'A Tool with attributes Damage, FireDelay, MagSize, ReloadTime, Range, Spread, Recoil, FalloffStart and FalloffEnd.',
      'Client on fire: check local cooldown and ammo, build the ray from the camera with spread, raycast locally to place a tracer and hit effect at once, then fire a RemoteEvent with {origin, direction, clientTimestamp = workspace:GetServerTimeNow()}; other players tracers go through an UnreliableRemoteEvent.',
      'Server: rate gate (now - lastShot >= FireDelay - 0.02 s), ammo > 0, shooter alive and weapon equipped, origin within 10 to 12 studs of the shooter head, direction unit length and a range cap; raycast with RaycastParams excluding the shooter; find the Humanoid; compute damage with falloff and a headshot multiplier (a reference crit is 1.25); apply TakeDamage.',
      'Never accept a client-reported hit instance; accept the direction and clamp it against the server camera vector tolerance.',
    ],
    verification: ['Fire from 50 studs off the claimed origin or with no ammo: refused.', 'The tracer shows at once for the shooter and the damage lands only after the server raycast.'],
    failureModes: ['The client says "I hit player X": the standard exploit.', 'No ammo or cooldown checks.'] },
  { id: 'shooter-rewind-lag-compensation', title: 'Rewind targets for hitscan fairness with a clamped timestamp', domain: 'gameplay', summary: 'A one-second pose ring buffer, a client timestamp clamped to 0.5 s, an interpolation allowance and a static-geometry raycast.', refs: ['workspaceClass'], keywords: ['lag compensation', 'rewind', 'ring buffer', 'timestamp', 'ping', 'hitbox history', 'favour the shooter'],
    steps: [
      'Every Heartbeat record each character root CFrame (or limb hitbox CFrames) with workspace:GetServerTimeNow() into a ring buffer sized for 1 second (about 60 entries; references use 60 Hz with a 0.5 s limit, or 30 Hz).',
      'When a shot arrives clamp the client timestamp to [now - 0.5, now], subtract an interpolation allowance of about 0.1 s and fetch each candidate pose by binary search and lerp between the bracketing snapshots.',
      'Test the ray against the rewound hitboxes (head and torso boxes) and require the shot origin within 12 studs of the shooter rewound position; add a server raycast against static geometry because rewind tests only characters.',
      'Log rewind distance, hit rate per player and ping; flag abnormal hit rates. Prefer client timestamps over Player:GetNetworkPing, and do not run rewind and Server Authority prediction as competing systems.',
    ],
    verification: ['A timestamp 5 s in the past is clamped, not honoured.', 'At 150 ms simulated latency a stationary target is hit where the shooter saw it.'],
    failureModes: ['Letting players choose arbitrary timestamps.', 'Favour-the-shooter side effects (defenders hit after reaching cover).'] },
  { id: 'shooter-projectile-bullet-drop-simulation', title: 'Simulate projectiles with drop and swept raycasts', domain: 'gameplay', summary: 'Position and velocity stepped in a module, a ray per step against tunnelling, authoritative server damage and a cosmetic client copy.', refs: ['raycastParams'], keywords: ['projectile', 'bullet drop', 'rocket', 'arrow', 'grenade', 'fastcast', 'spherecast', 'gravity'],
    steps: [
      'Step in a module: position += velocity x dt; velocity += Vector3.new(0, -gravity x dropScale, 0) x dt (gravity 196.2 is a reference value for bullet drop); cast a ray from the last to the new position each step so fast projectiles do not tunnel; Raycast for bullets and Spherecast for fat projectiles.',
      'The server runs the authoritative simulation for damage; the client simulates a cosmetic copy at once (a visual-only part with no collisions).',
      'Or use a parallel caster module (FastCast2: Blockcast and Spherecast, Hit and Pierced events), capped at around 100 concurrent serial projectiles.',
      'Pool visuals and cap concurrent projectiles per player; delete all projectiles on round end; set RaycastParams RespectCanCollide and CanQuery so decoration is ignored.',
    ],
    verification: ['A fast projectile fired at a thin wall hits it instead of passing through.', 'After a round ends the projectile count is zero.'],
    failureModes: ['Relying on physics replication for fast projectiles.', 'Not deleting projectiles at round end.'] },
  { id: 'shooter-weapon-table-ttk-calculator', title: 'Balance weapons from one table and a time-to-kill printout', domain: 'game_design', summary: 'One module of weapon stats, a command-bar script that prints shots-to-kill and TTK per band, one number changed per patch.', refs: ['gdEconomy'], keywords: ['ttk', 'weapon table', 'balance', 'falloff', 'headshot', 'weapon roles', 'patch notes'],
    steps: [
      'One ModuleScript table: {Name, Damage, FalloffStart, FalloffEnd, MinDamage, HeadshotMult, FireDelay, MagSize, Reload, MoveSpeedMult, Pellets, Spread, Role}. TTK = (ceil(HP / damage) - 1) x FireDelay.',
      'A Studio command-bar script prints shots to kill, TTK with a headshot and at falloff end for each weapon and flags any whose close-range TTK is outside its band: about 0.6 to 0.8 s for a duel shooter, about 1 to 2 s for a team shooter. Reference bands from one game: AR 12 damage at 0.10 s gives 0.80 s; shotgun 0.70 s; minigun 0.60 s.',
      'Give each weapon one role and one cost: speed (minigun -25%, sniper -20%), ammo or reload (sniper 4 rounds, 1.8 s reload) or range falloff (AR 13 down to 3 over 50 to 200 studs); control range by falloff, not spread alone.',
      'Adjust one number per patch, keep the table in the version string and publish patch notes.',
    ],
    verification: ['Every weapon sits inside its TTK band after each change.', 'The printout is rerun after every patch and the diff is in the notes.'],
    failureModes: ['Balancing by feel without math.', 'Changing a crit multiplier after players learned the weapon without saying so.'] },
  { id: 'pattern-duel-match-flow-queue-best-of', title: 'Run a duel from a MemoryStore queue to a best-of-five reserved match', domain: 'genre_pattern', genres: ['fps_arena', 'anime_battle'], summary: 'Rating-sorted tickets, a widening match window, a reserved server, a 90 s round and a single rating write.', refs: ['memoryStore'], keywords: ['duel', 'queue', 'tickets', 'best of five', 'reserved server', 'match window', 'pick ban'],
    steps: [
      'Lobby with duel pads and a shooting range; the server writes a ticket (with an expiration) to a MemoryStoreSortedMap keyed by player or party leader with the rating in the sort key or value.',
      'A coordinator (elected through UpdateAsync on a MemoryStoreHashMap) reads up to 200 tickets, groups the closest ratings (window starts at 100 and widens 25 points per 5 s waited: heuristic), writes assignments and calls TeleportService:ReserveServer(matchPlaceId); each lobby server teleports its players with TeleportAsync and options.ReservedServerAccessCode; TeleportData carries mode, team, map and loadouts.',
      'Match server: team spawn, 5 s countdown, 90 s rounds won by elimination, first to 5 round wins, a pick and ban phase before round 1 in ranked, loadout lock and a weapon-switch cap in ranked.',
      'On finish write the rating change once with UpdateAsync, show the delta and teleport both back.',
    ],
    verification: ['Two servers report the same result: the rating changes once.', 'An expired ticket is gone and a party never ends up in two servers.'],
    failureModes: ['Tickets that never expire leak memory.', 'A rating written twice because both servers report.'] },
  { id: 'pattern-ranked-ladder-elo-placements-season', title: 'Add a ranked ladder with placements, a daily shield, decay and a season', domain: 'genre_pattern', genres: ['fps_arena', 'anime_battle'], summary: 'Elo with a decreasing K factor, 200-point tiers, 10 placement games, a loss shield, top-only decay and a soft reset.', refs: ['dataStore'], keywords: ['ranked', 'elo', 'placements', 'shield', 'decay', 'season', 'tiers', 'party limit'],
    steps: [
      'Store {Elo, PlacementsPlayed, Shield, LastPlayed, Season} per player with UpdateAsync after each match. Expected E = 1 / (1 + 10^((Ropp - Rself) / 400)); new rating = R + K x (S - E) with K = 64 for the 10 placement games, 32 until 30 games, 24 afterwards (heuristic).',
      'Tiers: 200-point bands from 0, three sub-tiers each, a special top tier at 3,600 in one reference (compress to 100-point bands for a small game). Placement: 10 games, a maximum starting rank below the top two tiers.',
      'Shield: one per day below the second-highest tier, spent whether or not a loss comes. Decay: top tiers only, 100 points per day after 7 idle days, floored at the tier entry.',
      'Party limit: refuse the queue when the rating spread is above 800 (one wiki) or 600 (another); pick one and show it. Scale gains by opponent rating so beating a much lower player gives nothing.',
      'Season of 3 to 4 months with a soft reset toward the median and exclusive cosmetics per tier; never sell rank. Gate ranked on games played (for example 10 casual matches).',
    ],
    verification: ['Simulate 1,000 matches: ratings stay bounded and placement outcomes differ by results.', 'A shield consumed on a loss still shows as spent.'],
    failureModes: ['Smurf farming below the placement cap.', 'Paying for rank, or long queues when a region lock is on.'] },
  { id: 'pattern-pvp-arena-blockout-spawn-logic', title: 'Block out an arena at Roblox scale with safe spawn logic', domain: 'genre_pattern', genres: ['fps_arena', 'anime_battle'], summary: 'Three mirrored lanes, chokepoints, half and full cover heights, spawn rooms out of sight and spawn protection.', refs: ['forceField'], keywords: ['arena', 'map blockout', 'lanes', 'chokepoints', 'cover', 'spawn', 'sightlines', 'spawn protection'],
    steps: [
      'Blockout with parts only: three lanes, three or four chokepoints (one per lane), a mirrored layout and a mid-height route per lane. Character is about 5 studs tall: cover 3 to 4 studs high is half cover, 6 or more full; doorways 6 wide by 8 high; most engagements under 120 studs with one 200-stud lane for snipers.',
      'Two team spawn rooms out of sight of each other and of the main lane; spawn protection 2 to 3 s (ForceField via SpawnLocation.Duration, heuristic; a ForceField only blocks TakeDamage); in free-for-all pick the spawn farthest from the nearest enemy and out of line of sight, re-evaluated at respawn.',
      'Add a few asymmetric props for readability only (landmarks, not cover); a Big variant only for 4v4 and 5v5.',
      'Playtest with 6 to 10 testers, log death locations and move cover where more than a quarter of deaths cluster.',
    ],
    verification: ['Respawn 100 times in a script: never in line of sight of an enemy spawn.', 'A death-location heat map shows no hotspot above 25%.'],
    failureModes: ['Too many paths, so defense is impossible; long sightlines from spawn.', 'Unreadable geometry for mobile players.'] },
  { id: 'security-combat-payload-and-hit-rate-checks', title: 'Validate combat payloads and flag impossible hit rates', domain: 'security', summary: 'Type, range and NaN checks on every combat remote, a speed tolerance check, server-side tables and log review before bans.', refs: ['securityTactics'], keywords: ['anti exploit', 'combat remotes', 'payload validation', 'nan', 'headshot rate', 'speed check', 'strikes'],
    steps: [
      'Validate every remote payload: type, numeric range, reject NaN and infinity, vector magnitude within limits; never accept damage or targets from the client and never trust it for cooldowns.',
      'Every 0.25 to 0.5 s compare distance moved with WalkSpeed x time x 1.3 plus a dash allowance; on a breach snap back, add strikes and kick after repeated strikes.',
      'Keep tuning and weapon tables in ServerScriptService; do not replicate hitbox sizes unless the UI needs them; put anti-cheat where an exploiter cannot read or delete it.',
      'Log and review: more than 95% headshots over 30 shots, impossible reaction times, shots through walls (after a server line-of-sight check). Tie bans to your own system, since platform anti-cheat covers injection, not logic abuse.',
    ],
    verification: ['A payload with NaN damage or a 1e9 vector is dropped and counted.', 'A high-ping player is not banned: tolerance and strikes apply first.'],
    failureModes: ['False positives on high-ping players (use tolerance, strikes and review).', 'Anti-cheat scripts placed where they can be read or removed.'] },
  { id: 'pattern-gun-game-weapon-ladder-ffa', title: 'Build a weapon-ladder free-for-all match of 5 to 8 minutes', domain: 'genre_pattern', genres: ['fps_arena', 'adventure'], summary: 'A 20 to 32 weapon ladder ending in a knife, server-tracked levels, a demotion rule and automatic map rotation.', refs: ['gdCoreLoops'], keywords: ['gun game', 'weapon ladder', 'ffa', 'knife', 'demotion', 'leader marker', 'arcade shooter'],
    steps: [
      'A ladder of 20 to 32 weapons ending with a knife (one reference uses 32 levels with golden weapons at 31 and 32 and demotes a player one level when knifed or on suicide).',
      'The server tracks level per player; on a kill promote, grant the next weapon and refill ammo; the first kill with the last weapon wins, ends the match and awards currency.',
      'Spawn protection 2 s and the farthest safe spawn; demote at most one level.',
      'Rotate map and mode automatically without immediate repeats; aim for 5 to 8 minute matches with a daily-wins leaderboard instead of Elo.',
    ],
    verification: ['Play to the last weapon: the match ends once and rewards once.', 'A knife kill demotes the victim by exactly one level.'],
    failureModes: ['A runaway leader snowball: show a leader marker and demote on knife kills.', 'Ladder imbalance: put the best weapons in the middle.'] },
  { id: 'pattern-reflex-duel-deflect-loop', title: 'Build a one-button reflex duel around a server-driven ball', domain: 'genre_pattern', genres: ['fps_arena', 'anime_battle'], summary: 'A server ball with a target and rising speed, a deflect checked in server time inside a shrinking window, a shield cooldown and clashes.', refs: ['workspaceClass'], keywords: ['reflex', 'deflect', 'parry ball', 'one button', 'mobile pvp', 'clash', 'lock on'],
    steps: [
      'The server owns an anchored ball moved each Heartbeat with a target player and a speed that rises per deflection (start 40 studs/s and multiply by 1.08, heuristic; the steepest part of one reference curve is between deflections 4 and 6).',
      'The client sends a deflect with its time; the server checks the ball distance to the target at the matching server time within a window (start 0.35 s total, shrinking to about 0.1 s at high speed); success picks the next living target and bounces, failure eliminates.',
      'A shield cooldown of about 0.5 s stops click spam; when two players deflect at once, knock back both, reset the ball to the centre and add a small speed boost.',
      'Show a clear lock-on indicator and a glow as the ball approaches; eliminated players get a spectator camera and a re-queue button.',
    ],
    verification: ['A deflect fired 0.5 s early or late fails; one inside the window succeeds.', 'The ball path is smooth for clients with 150 ms latency (interpolated rendering).'],
    failureModes: ['A client-trusted deflection.', 'A physics-driven ball with replication jitter: drive it on the server and interpolate.'] },

  // --- note 18: social, roleplay, party and minigame games (age and policy facts are first-party; observed prices and counts are third-party snapshots) ---
  { id: 'pattern-town-roleplay-starter-blueprint', title: 'Blueprint a town roleplay map with the five systems in build order', domain: 'genre_pattern', genres: ['roleplay', 'adventure'], summary: 'Six to ten landmark zones on a loop road, a first claim inside 30 seconds, one menu hub and free base content with sold packs.', refs: ['gdDesignForRoblox'], keywords: ['town', 'city', 'roleplay', 'landmarks', 'hub menu', 'house claim', 'vehicle spawner', 'blueprint'],
    steps: [
      'Greybox 6 to 10 landmark zones (plaza, diner, school, hospital, police, bank, houses) on a loop road; put one SpawnLocation next to the first claimable house and the vehicle spawner so the first claim happens inside 30 seconds. Size the map to the server cap; under about 28 players keep walking time between landmarks under 30 s (heuristic).',
      'Set Players.RespawnTime to 2 to 3 and keep StarterPlayer defaults (CharacterWalkSpeed 16, CharacterJumpHeight 7.2).',
      'Build the systems in this order: house claim, vehicle spawner, prop placement, roles, avatar identity. Every role must work or be cut.',
      'One phone or menu button is the hub (Jobs, Avatar, House, Vehicle, Party, Shop) and a UI-hide button helps recording; run the compliance checklist.',
      'Ship free base content and sell packs: observed ladders 99 to 199 cheap utility, 299 to 499 packs, 700 to 800 flagship; a first ladder of VIP 399, vehicle pack 799, themes 299 (third-party).',
    ],
    verification: ['A fresh player claims a house and spawns a vehicle within 30 s without reading text.', 'No purchase prompt shows on first load.'],
    failureModes: ['Roles that do nothing, a custom chat, or a map bigger than the server can fill.', 'Selling passes at first load.'] },
  { id: 'pattern-roleplay-role-job-uniform-loop', title: 'Add roles with a uniform, a tool and one working task loop', domain: 'genre_pattern', genres: ['roleplay', 'tycoon'], summary: 'A Roles module, uniforms applied by overriding a cloned HumanoidDescription, a prompt-driven loop per role and optional level-curve pay.', refs: ['humanoidDescription'], keywords: ['roles', 'jobs', 'uniform', 'humanoiddescription', 'cashier', 'delivery', 'doctor', 'pay curve'],
    steps: [
      'A Roles ModuleScript: {name, uniformDescriptionOverrides, tools, spawnPoint, requiresPass?}.',
      'On selecting a role the server clones the player HumanoidDescription, overrides only shirt, pants and hat, and calls humanoid:ApplyDescriptionAsync(desc, Enum.AssetTypeVerification.Default); tools go to the Backpack; cache the description instead of reapplying every respawn.',
      'Each role needs one working loop with a ProximityPrompt: cashier (order, ring up), delivery (pick up, drive, hand off), doctor (check in, scan, treat).',
      'If paying, store workXp and pay per task as a curve of level (heuristic from a life sim: steep to level 10, flat to 40) with a server cap on tasks per minute; roles with no pay switch instantly with no application.',
    ],
    verification: ['Every role completes its loop end to end in play.', 'Tool damage from a client remote is refused.'],
    failureModes: ['A role that does not work breaks trust.', 'Client-side tool damage.'] },
  { id: 'pattern-vehicle-spawner-network-ownership', title: 'Spawn one vehicle per player and hand physics to the driver', domain: 'genre_pattern', genres: ['roleplay', 'racing'], summary: 'Vehicle models in ServerStorage, one per owner, seat occupancy driving SetNetworkOwner and a server vehicle cap.', refs: ['vehicleSeat'], keywords: ['vehicle spawner', 'car', 'network owner', 'seat', 'occupant', 'rubber banding', 'vehicle cap'],
    steps: [
      'Store vehicle Models in ServerStorage with a VehicleSeat (or Seat) as PrimaryPart; one spawned vehicle per player and destroy the old one on respawn and on leave.',
      'Spawn on a ProximityPrompt or UI button at a spawn pad; set attribute OwnerUserId and optionally lock the seat to the owner.',
      'When seat.Occupant changes call seat:SetNetworkOwner(player) for the occupant and seat:SetNetworkOwnershipAuto() when empty.',
      'Cap vehicles per server (heuristic 15 to 25); bug reports show rubber-banding with 10 or more multi-assembly vehicles on a busy server. Persist the last vehicle id and colour like a plot item.',
    ],
    verification: ['Sit, drive and stand repeatedly: ownership never flickers and the driver feels no lag.', 'Leaving the game removes the vehicle.'],
    failureModes: ['Anchored parts are always server-owned and lag the driver.', 'Leftover vehicles after leave.'] },
  { id: 'pattern-avatar-identity-outfits-emotes', title: 'Give players identity: name tag, outfits, catalogue import and emotes', domain: 'genre_pattern', genres: ['roleplay', 'adventure'], summary: 'A filtered name and bio, current HumanoidDescription calls, a validated catalogue-id import and custom emotes with save slots.', refs: ['humanoidDescription'], keywords: ['avatar', 'outfit', 'catalogue import', 'emotes', 'name tag', 'bio', 'wardrobe', 'humanoiddescription'],
    steps: [
      'Name and bio on a BillboardGui over the head; filter text through the TextChatService filtering path or TextService:FilterStringAsync, after submit.',
      'Outfits: Players:GetHumanoidDescriptionFromUserIdAsync for "wear my avatar", GetHumanoidDescriptionFromOutfitIdAsync for saved outfits, applied with humanoid:ApplyDescriptionAsync; the non-Async names are deprecated.',
      'Catalogue import: the player pastes an item id; validate with AvatarEditorService:GetItemDetailsAsync (client) or MarketplaceService:GetProductInfoAsync (server), check the asset type and set the matching HumanoidDescription field; throttle to the documented 100 requests per second per experience. Never let the client choose any asset type.',
      'Emotes: humanoid:PlayEmoteAsync(name) returns a boolean; add custom ones with HumanoidDescription:AddEmote(name, assetId) and SetEquippedEmotes; 8 to 10 emotes on day one; 3 to 5 outfit save slots in a DataStore.',
    ],
    verification: ['An item id of the wrong asset type is refused.', 'The outfit applies the same on R6 and R15 rigs.'],
    failureModes: ['Applying descriptions on the wrong rig type or without yielding.', 'Letting the client choose any asset type.'] },
  { id: 'pattern-private-space-single-occupancy-claim', title: 'Claim enclosed rooms with single occupancy as one safety layer', domain: 'genre_pattern', genres: ['roleplay', 'adventure'], summary: 'Tagged zones, one owner at a time, others moved to an exit point and periodic checks; a mitigation, not an exemption from age rules.', refs: ['collection'], keywords: ['private space', 'privacy zone', 'single occupancy', 'bedroom', 'claim zone', 'compliance'],
    steps: [
      'Prefer zero enclosed private spaces (bedrooms, bathrooms, changing rooms, small tents): the cut-off is documented as 17 in one place and 18 in another, so design the question away. If a house needs rooms, make the whole house a single-owner claimed plot.',
      'If you must have them, tag each trigger volume Part Privacy_Zone and keep claimed[zone] = Player.',
      'A server loop every 0.25 s lists characters with workspace:GetPartsInPart(zone, overlapParams); the first becomes the owner and others are moved to an ExitPoint attribute position.',
      'Release when the owner leaves the volume or the game; re-check periodically for exploit teleports. Still answer the questionnaire; this is one safety layer, not an exemption.',
    ],
    verification: ['Two players enter one zone: the second is moved out within a quarter second.', 'An exploiter teleporting in is caught by the periodic check.'],
    failureModes: ['Treating this as an exemption from the age rules.', 'Bathroom assets left in the game.'] },
  { id: 'pattern-minigame-plugin-framework', title: 'Plug 20 or more minigames into one round module', domain: 'genre_pattern', genres: ['adventure', 'roleplay'], summary: 'Each minigame is a module with setup, isFinished, scores and cleanup; the round module votes on three random candidates and polls to the end.', refs: ['moduleScripts'], keywords: ['minigame', 'plugin framework', 'vote', 'cleanup', 'scores', 'pro server', 'play reward'],
    steps: [
      'Each minigame ModuleScript returns {name, minPlayers, duration, setup(players, map), isFinished() -> boolean, scores() -> {[Player]: number}, cleanup()}.',
      'The round module picks 3 candidates at random for the vote, calls setup, polls isFinished every 0.25 s until done or duration (30 to 90 s), then calls scores and cleanup.',
      'Reward the winner with points (a reference: 10, or 15 on a pro server) plus a small participation reward; daily play-reward timers every 5 minutes up to 60 minutes (heuristic from one pattern).',
      'Add a Pro server for skilled players as a separate place or reserved server; allow the same minigame twice in a row only rarely.',
    ],
    verification: ['Run every minigame 5 times: cleanup leaves no parts, connections or leftover state.', 'A minigame that never finishes ends at duration.'],
    failureModes: ['Reskinned repeats feel cheap.', 'A minigame without a cleanup path poisons the next round.'] },
  { id: 'pattern-party-host-friend-invite-flow', title: 'Let a host throw a party with invites, a roommate list and a friend bonus', domain: 'genre_pattern', genres: ['roleplay', 'adventure'], summary: 'A host panel, accept or decline invites, outside invites through SocialService with LaunchData and a small capped friend bonus.', refs: ['socialService'], keywords: ['party', 'host', 'invite', 'roommates', 'launchdata', 'friend bonus', 'canSendGameInviteAsync'],
    steps: [
      'The host presses Party in the house panel, picks a theme and guests from a list; the server validates ownership and creates the party record in memory.',
      'Guests get an on-screen invite with Decline or Teleport; accepting adds them to the house allowed list (roommates) for the party duration.',
      'For invites from outside the server call SocialService:CanSendGameInviteAsync first, then PromptGameInvite with ExperienceInviteOptions (PromptMessage, InviteUser, LaunchData up to 200 characters).',
      'On join read Player:GetJoinData().LaunchData with retry (it can take seconds) and teleport to the host. Reward friend play with a small capped bonus per friend present (heuristic: +2% per friend capped at +10%); sell cosmetic themes as optional extras.',
    ],
    verification: ['Decline an invite: the guest is not added to the roommate list.', 'With the prompt unavailable the Invite button is hidden.'],
    failureModes: ['The invite prompt works client-side only and may be unavailable on some platforms.', 'Auto-teleporting minors into strangers private houses.'] },
  { id: 'pattern-trading-two-step-licence-locks', title: 'Build trading with a two-step confirm, locks, a licence and logs', domain: 'genre_pattern', genres: ['roleplay', 'simulator'], summary: 'A server-owned session where any change resets both confirmations, offered items are locked, trading is gated and every trade is logged.', refs: ['dataStore'], keywords: ['trading', 'trade session', 'confirm', 'licence', 'scam', 'listing fee', 'item lock', 'log'],
    steps: [
      'A server-owned session {a, b, offerA, offerB, confirmedA, confirmedB}; any change to an offer resets both confirmations; both press Confirm twice (preview, then final).',
      'Lock offered items in the inventory during the session and on listings; commit both inventories atomically with UpdateAsync and revalidate ownership at commit to prevent duplication on shutdown.',
      'Gate trading by a short licence quiz of three scam scenarios and a playtime threshold (a reference uses 2 hours).',
      'Cross-server board: a listing costs soft currency (100 in one game) with two free active listings and an extra slot for Robux (49); block very imbalanced listings.',
      'Log every trade (UserIds, items, timestamp) for reports; do not show player "value" lists that drive scams. Trading outcomes of paid random items follow the policy flag.',
    ],
    verification: ['Change an offer after one side confirmed: both confirmations reset.', 'Shut the server mid-trade: no item is duplicated or lost.'],
    failureModes: ['Item duplication on shutdown.', 'Value lists that drive scams.'] },
  { id: 'publish-social-hangout-age-gate-checklist', title: 'Check the 2026 age rules for social and free-form games before publishing', domain: 'game_design', summary: 'What makes a game 16+ or 18+ and the trial that decides reach.', refs: ['contentMaturity'], keywords: ['social hangout', '16+', 'age verified', 'free-form drawing', 'private spaces', 'questionnaire', 'age gate', 'kids select'],
    steps: [
      'Run the questionnaire. Since 2026-05-19 Social Hangout, Free-form User Creation and Sensitive Issues experiences are limited to age-verified players 16 and over (before: 13). Roleplay qualifies only when roles and items are central, not talking.',
      'Remove freehand drawing, spray paint, visible writing and pixel canvases (use stamps, shapes, props; your own moderation does not remove the label); remove or single-occupy private spaces; no bars or clubs unless you accept 18+; implied sexual content is prohibited.',
      'Route all text through TextChatService, add reporting and filter names and bios; chat is age-banded, so give non-chat ways to coordinate. Do not move Robux between players outside the Transfers API.',
      'Under-16 reach needs ID or age verification, 2FA and 250 unique plays from highly engaged players in 60 days; until then only age-checked 16+ players see it. Re-run the questionnaire after adding the Upload API, voice or a new mode.',
    ],
    verification: ['The questionnaire label is recorded and matches the target audience.', 'No custom chat or player-to-player Robux path remains.'],
    failureModes: ['Relying on your own moderation to drop an age label.', 'Assuming a roleplay label protects a chat-first game.'] },
  { id: 'pattern-chat-proximity-commands-age-aware', title: 'Add proximity chat, slash commands and age-aware features with TextChatService', domain: 'genre_pattern', genres: ['roleplay', 'adventure'], summary: 'Default channels with a server delivery filter, TextChatCommand children, styled bubbles and a CanUsersChatAsync check.', refs: ['textChatService'], keywords: ['chat', 'proximity chat', 'textchatservice', 'commands', 'bubble chat', 'canuserschatasync', 'voice'],
    steps: [
      'Keep the default channels (CreateDefaultTextChannels); on the server set ShouldDeliverCallback on RBXGeneral to deliver only to players within about 60 studs (heuristic); the callback must not yield.',
      'Add commands as TextChatCommand children of TextChatService (/party, /me); style bubbles with BubbleChatConfiguration and OnBubbleAdded.',
      'Before showing a DM or party-chat UI call TextChatService:CanUsersChatAsync(a, b); chat is age-banded.',
      'Voice: stay at or below 100 players per place and gate on VoiceChatService:IsVoiceEnabledForUserIdAsync. Do not log or transmit raw chat.',
    ],
    verification: ['A message from 100 studs away is not delivered; one from 20 studs is.', 'A pair that cannot chat sees no DM button.'],
    failureModes: ['A yielding delivery callback breaks chat.', 'Logging or sending raw chat text off-platform.'] },

  // --- note 19: visual study of top games ([O] values are one-day thumbnail measurements and (inf) values are design choices: check in Studio; no game publishes its own settings) ---
  { id: 'design-pick-one-visual-family', title: 'Pick one visual family before placing a part and keep a 3 to 5 hue budget', domain: 'game_design', summary: 'Five looks that read as professional, one per game, with the vibe written in one line to drive radius, palette, font and density.', refs: ['gdDesignForRoblox'], keywords: ['art direction', 'visual family', 'palette', 'vibe', 'style', 'look', 'hues', 'consistency'],
    steps: [
      'Choose one family and write it down: (1) bright stud or cartoon simulator, (2) painted low-poly cozy, (3) clean competitive pastel with one accent colour, (4) warm light in cold dark for horror, (5) toon characters with outlines. Mixing two families in one scene is what makes a game read as assembled (inference).',
      'Name the vibe in one line and derive corner radius, palette, font and density from it; limit a scene to 3 to 5 hues plus neutrals and give each biome its own palette.',
      'Observed saturation and brightness (own measurement of about 25 thumbnails, one day): simulators about 0.55 to 0.75 and 0.8 to 0.9; horror brightness 0.15 to 0.3 with one warm accent; competitive pairs a desaturated cool environment with one pure-primary accent; premise-first hits can ship at saturation 0.12 to 0.25.',
      'Do not chase photorealism unless the premise needs it: the platform asks for novelty, not a copy.',
    ],
    verification: ['The look is written in one line and every new asset is checked against it.', 'A screenshot has no more than 5 hues plus neutrals.'],
    failureModes: ['Two families mixed in one scene.', 'Clashing stock models in a styled map.'] },
  { id: 'world-look-retro-classic-roblox', title: 'Recreate the retro classic look with Soft lighting and a Retro tonemapper', domain: 'worldbuilding', summary: 'Soft style, a ColorGradingEffect Retro preset and flat grey ambient (accepted forum values, no 1:1 replica exists).', refs: ['colorGradingEffect'], keywords: ['retro', 'classic roblox', 'nostalgia', 'studs', 'tonemapper', 'soft lighting', 'old roblox'],
    steps: [
      'LightingStyle Soft and PrioritizeLightingQuality false (set in the Properties panel or a plugin, not from game scripts).',
      'Add a ColorGradingEffect with TonemapperPreset Retro.',
      'Lighting: Ambient (128,128,128), OutdoorAmbient (128,128,128), Brightness 1.981, ColorShift_Top and ColorShift_Bottom (0,0,0), EnvironmentDiffuseScale 0, EnvironmentSpecularScale 0, GlobalShadows on, ClockTime 14; optional ShadowSoftness 0.2.',
      'Bloom with Intensity 0, Size 24, Threshold 0.95 (present but inactive). Materials: Plastic, SmoothPlastic, Studs; keep light brightness at most 1 for the full look.',
    ],
    verification: ['Side by side with an old screenshot the flat grey ambient and the studs read as the same era.', 'No bloom or haze shows.'],
    failureModes: ['Expecting a 1:1 replica of the old compatibility mode.', 'Setting the lighting style from a game script, where it does not apply.'] },
  { id: 'world-look-competitive-clean-palette', title: 'Colour a competitive map with a cool neutral family and one primary accent', domain: 'worldbuilding', summary: 'Smooth plastic in a tight cool palette, grid seams for scale, readable unit markers and Roblox map-readability sizes.', refs: ['effHighlight'], keywords: ['competitive', 'arena', 'palette', 'highlight', 'markers', 'shooter map', 'readability', 'duel'],
    steps: [
      'Parts SmoothPlastic in a tight family measured from one thumbnail: walls (197,202,218) and (124,130,203), floor (237,222,245) [O]; sky (49,143,255), fog toward (94,100,137), ClockTime 13 to 14, Soft or Realistic.',
      'Draw a thin grid or panel seam on floors and walls (UV or decal) so players read scale.',
      'Enemy and teammate marker: Highlight FillColor (255,0,26), FillTransparency 0.2, OutlineColor white, DepthMode AlwaysOnTop; Highlight is capped at 255 simultaneous instances, so do not tint everything red.',
      'First-person weapons are Workspace models that follow the camera so they inherit scene light. Roblox sample-map numbers: 10-stud minimum doorways and walls, three lanes, at most three exits per pocket.',
    ],
    verification: ['Units stand out against the map at phone size and a squint test.', 'No more than 255 highlights are active.'],
    failureModes: ['Tinting the whole scene red, so alerts lose meaning.', 'Weapon models that stay unlit by the scene.'] },
  { id: 'world-look-painted-lowpoly-cozy', title: 'Build a painted low-poly cozy world with one atmosphere per island', domain: 'worldbuilding', summary: 'A mood board, curved multi-direction paths, faceted props with small glowing accents and per-zone lighting swaps.', refs: ['terrain'], keywords: ['cozy', 'painted', 'low poly', 'fantasy', 'mood board', 'island', 'zone lighting', 'stylised'],
    steps: [
      'Collect a mood board first (the Roblox environment curriculum calls it the source of truth), then greybox with curved multi-direction paths.',
      'Terrain for landforms; props modelled externally and textured with a stylised fantasy palette; faceted flat-shaded models with glowing accents using an emissive mask strength 2 to 10.',
      'One atmosphere per island: change sky, Atmosphere Color and ambient per zone (tween the swap); natural sun, no heavy post.',
      'Flowers and small colour accents every few metres; warm interiors (red walls, amber lamps) against the cool outdoors.',
    ],
    verification: ['Each zone is recognisable from its colours alone.', 'The zone lighting swap tweens without a pop, and a phone holds its frame rate.'],
    failureModes: ['Zone lighting swaps with no tween.', 'A scene that looks good on PC but is slow on phones.'] },
  { id: 'world-cartoon-building-material-rules', title: 'Apply material and shading rules that make low-poly buildings read as pro', domain: 'worldbuilding', summary: 'Mostly smooth plastic, a few divider materials, lighter tops and darker undersides and pieces on a 5-stud grid.', refs: ['materials'], keywords: ['materials', 'smooth plastic', 'divider materials', 'palette', 'grid', 'buildings', 'colour harmony'],
    steps: [
      'Make SmoothPlastic at least 70% of surfaces and use 1 to 3 divider materials (brick for foundations, wood for counters).',
      'Shade lighter on top surfaces and darker underneath; keep palettes analogous with one complementary accent; colour harmony matters more than textures.',
      'Build recognisable real-world shapes but brighter than real; add interior lighting at the end of the build.',
      'Pieces on a 5-stud grid and doorways at least 10 studs; reuse identical mesh and texture ids and turn repeated kits into packages; CastShadow off on small foliage.',
    ],
    verification: ['Count surfaces by material: SmoothPlastic is 70% or more.', 'Doorways measure 10 studs or more and pieces snap on the 5-stud grid.'],
    failureModes: ['PBR props mixed into a flat plastic scene break the look.', 'Re-uploading duplicate meshes instead of reusing ids.'] },
  { id: 'world-toon-character-outline-kit', title: 'Make toon characters that read at a distance with outlines and local lights', domain: 'worldbuilding', summary: 'One base shape with variations, big eye ovals, painted flat textures, an outline method that scales to a cast and hand-placed light.', refs: ['effHighlight'], keywords: ['toon', 'character', 'outline', 'mascot', 'highlight cap', 'cast', 'stylised character'],
    steps: [
      'Sketch first: one base shape, variations by adding traits.',
      'Model with large black eye ovals and a white highlight, painted flat textures and a thin dark outline mesh; use a Highlight outline only for a few characters (it costs per instance and is capped).',
      'Accent glow on special or corrupted variants (inference); light scenes with hand-placed point lights, not global brightness.',
      'Marketing art uses a white sticker outline around the cast.',
    ],
    verification: ['The silhouette is recognisable at 150 px.', 'A full cast on screen stays under the highlight cap and holds frame rate.'],
    failureModes: ['Highlight outlines on large casts hit the cap.', 'Global brightness lifted instead of local lights, which flattens the mood.'] },
  { id: 'ui-chunky-depth-button-lip-face', title: 'Build a chunky depth button from a lip and a face with a physical press', domain: 'ui', summary: 'A darker lip under a gradient face, two strokes with different modes, a 3 px press travel and touch-sized heights.', refs: ['uiStroke'], keywords: ['chunky button', 'depth', 'lip', 'face', 'gradient', 'uistroke', 'press', 'buy button'],
    steps: [
      'A transparent holder Frame of height H; child Lip Frame darker and lower (Position (0,0,0,4), Size (1,0,1,-4)) with UICorner and a 3 px dark outside stroke; sibling Face TextButton (Size (1,0,1,-4)) with a UIGradient from light top to saturated bottom, UICorner radius about 12 and a 3 px dark border; Face is above Lip; AutoButtonColor off.',
      'Text: a UIStroke with ApplyStrokeMode Contextual, thickness 2.5 to 3 black, bold rounded font. The text stroke and the border stroke need different ApplyStrokeMode on the same TextButton; never tween a text stroke Thickness.',
      'Press: the Face moves down 3 px and the Lip shrinks 3 px in 0.06 to 0.1 s and returns on release; fire Activated.',
      'Sizes: at least 44 px high (touch minimum), primary actions 56 px; optional shine sweep.',
    ],
    verification: ['Press, hold and release on touch and with a mouse: the face returns and the action fires once.', 'Both strokes show: border and text outline.'],
    failureModes: ['Two UIStrokes in the same ApplyStrokeMode collide.', 'Buttons under 44 px on a phone.'] },
  { id: 'ui-display-text-outline-rarity-ladder', title: 'Outline display text and give rarity names a colour, name and icon ladder', domain: 'ui', summary: 'Heavy rounded white text with a stroke near 7% of cap height and a rarity ladder that never relies on colour alone.', refs: ['uiStroke'], keywords: ['display text', 'outline', 'rarity colours', 'rarity ladder', 'currency counter', 'damage numbers', 'gradient text'],
    steps: [
      'A TextLabel in a heavy rounded font, white fill (or gradient), a UIStroke Contextual in black with Thickness about 7% of the font cap height (3 to 5 px at TextSize 48 to 60, own measurement); use 6 to 15 px strokes on a 2300x1400 panel canvas.',
      'Rarity ladder (my own design, no game published its palette): Common (170,170,170), Uncommon (80,220,90), Rare (60,140,255), Epic (170,80,255), Legendary (255,200,40), Mythic (255,80,60), top tier a rainbow from an animated UIGradient on the text.',
      'Pair every colour with a name and an icon so colour-blind players are covered; money is green and alerts red by convention.',
      'To give the outline a gradient, put a UIGradient under the UIStroke; a UIGradient on the text fill colours only the fill.',
    ],
    verification: ['Every rarity is distinguishable in greyscale by its name and icon.', 'Text stays readable on bright and dark backgrounds.'],
    failureModes: ['Animating the stroke Thickness (docs warn against it).', 'Colour as the only rarity cue.'] },
  { id: 'ui-shine-sweep-gradient-offset', title: 'Add a shine sweep to premium buttons that respects reduced motion', domain: 'ui', summary: 'A white overlay with a narrow transparency band whose gradient Offset is tweened across, repeated at random delays.', refs: ['uiGradient'], keywords: ['shine', 'sweep', 'gradient offset', 'premium', 'claim button', 'glint', 'reduced motion'],
    steps: [
      'Parent a transparent white Frame with a UIGradient (Rotation about 20, a Transparency sequence with a narrow opaque band) over the button, clipped to its corners.',
      'Tween the gradient Offset from (-1,0) to (1,0) in 0.8 to 1 s (Quint InOut) and repeat at random 2 to 5 s intervals; documented module patterns use an Offset sweep of 1 s Quint InOut, or width 0.15 and angle 10.',
      'Respect GuiService.ReducedMotionEnabled: skip the sweep when it is true.',
    ],
    verification: ['With reduced motion on, no sweep plays.', 'The sweep does not change the button parent transparency.'],
    failureModes: ['Gradient transparency interacts badly with parent transparency.', 'A sweep on every button, which dilutes the premium signal.'] },
  { id: 'ui-dark-translucent-overlay-sample-values', title: 'Style an in-game overlay with Roblox sample values: dark panels and two tiers', domain: 'ui', summary: 'Black panels at 0.3 transparency, selected and unselected at 0.1 and 0.65, one font and a two-colour team pair.', refs: ['uiAppearance'], keywords: ['overlay', 'translucent panel', 'sample values', 'team colours', 'selected state', 'montserrat', 'preferred transparency'],
    steps: [
      'Header strip ImageTransparency 0.15; body panels black at BackgroundTransparency 0.3 with UICorner scale 0.05 to 0.075; selected item 0.1 and unselected 0.65; small nav buttons CornerRadius 0.1, select button 0.2.',
      'White Montserrat Medium text; team colours mint (88,218,171) and carnation (255,170,255) as the pair (Roblox sample values).',
      'Multiply transparencies by GuiService.PreferredTransparency; the sample used TextScaled, which breaks with the player text-size setting, so size text deliberately.',
      'Keep main overlays neutral black or white and never use pure white on pure black (off-white and off-black).',
    ],
    verification: ['Selected and unselected items differ without colour alone.', 'With PreferredTransparency raised the panels stay readable.'],
    failureModes: ['TextScaled text that ignores the text-size setting.', 'Pure white on pure black.'] },
  { id: 'gameplay-procedural-colour-variants-seed', title: 'Derive colour variants from a stored seed instead of new meshes', domain: 'gameplay', summary: 'A seed per item, a hue shift per part with Color3 HSV helpers and about 25 variants per base, rare ones marked with sparkle.', refs: ['materialVariant'], keywords: ['variants', 'mutation', 'hue shift', 'seed', 'colour variants', 'shiny', 'procedural colour'],
    steps: [
      'Store a seed per item and document it so variants are reproducible.',
      'Derive a hue shift per part with Color3:ToHSV and Color3.fromHSV; apply to BasePart.Color or a SurfaceAppearance Color tint.',
      'Use about 25 distinct variants per base item (one fishing game does) and mark rare variants with sparkle particles or Neon.',
      'Keep shifts large enough to read on phones.',
    ],
    verification: ['The same seed rebuilds the same colours on two servers.', 'Twenty-five variants are told apart at phone size.'],
    failureModes: ['Shifts too small to read on a phone.', 'Undocumented seeds that cannot be reproduced.'] },
  { id: 'publish-thumbnail-icon-kit-four-variants', title: 'Make an icon and four distinct thumbnails and test them for a week', domain: 'game_design', summary: 'A hero-subject icon readable at 150 px and four thumbnails that differ in gameplay, character, environment and motivation.', refs: ['pubThumbnails'], keywords: ['thumbnail', 'icon', 'key art', 'a/b test', 'personalisation', '150px', 'event art', 'capture'],
    steps: [
      'Icon 512x512 (design at 1024): one hero subject filling 70% to 90%, a headline of cap height about 9% to 10% (about 48 px) in white with a 3 to 5 px black outline, a bright sky and ground pair or a dark field with one warm accent (own observation).',
      'Four 1920x1080 thumbnails: A an in-engine gameplay hero shot; B an exaggerated-scale shot (giant item, tiny avatar); C the update or event name at the top in 1 to 3 words; D a social or co-op shot of two to four characters. Keep key elements out of the bottom strip and each file under 3 MB.',
      'Activate 2 to 5 thumbnails (personalisation needs at least 2), wait at least 7 days or until the next update, keep the best performer in every test, and re-theme key art per event.',
      'Check at 150x150 and 128x128. Show nothing the first minute does not contain; icon A/B testing does not exist yet.',
    ],
    verification: ['The icon is legible at 128x128 and shows the real game.', 'Four thumbnails differ in gameplay, character, environment and motivation.'],
    failureModes: ['Promising features absent from the first minute.', 'Text over a blurred background that hides what the game is.'] },
  { id: 'design-visual-qa-pass-pro-vs-free-model', title: 'Run a visual QA pass: material, palette, scale, lighting, UI tokens and thumbnail', domain: 'game_design', summary: 'A checklist that separates a styled build from a pile of free models, ending with a fix of the biggest inconsistency.', refs: ['gdUiUx'], keywords: ['visual qa', 'checklist', 'consistency', 'free model', 'draw calls', 'contrast', 'style review'],
    steps: [
      'Check: the same material rules across the map (smooth plastic majority, a few divider materials); one palette per area with no clashing stock models; consistent scale (5-stud grid, 10-stud doors).',
      'Check: lighting and Sky set on purpose (Atmosphere plus Sky plus one or two effects); UI built from one token set with no default grey buttons; duplicated, not re-uploaded, meshes; thumbnail matches the game.',
      'Compute text contrast ratios, open the render stats for draw calls (the note budgets about 150 UI draw calls) and test the icon at 150x150.',
      'Compare side by side with two top games of the same family and fix the single biggest inconsistency first; judge on a phone, not only a PC at maximum quality.',
    ],
    verification: ['Each checklist item has a pass or fail and a screenshot.', 'The next build fixes the largest failing item.'],
    failureModes: ['Judging only on a PC at max quality.', 'Fixing small details while a palette clash remains.'] },

  // --- note 20: systems cookbook (design and server/client split in steps only; the note's code is a reviewed sketch that was never run in Studio, so no code is pasted here; invented tolerances are starting points) ---
  { id: 'system-net-kit-validators-reward-grant', title: 'Build the shared kit first: Net, NaN-safe validators and one reward function', domain: 'client_server', summary: 'One module makes every remote with a token bucket and pcall, validators reject NaN and bad ids, and rewards use one grant.', refs: ['clientBoundary'], keywords: ['net module', 'validators', 'token bucket', 'reward grant', 'remotes', 'nan', 'profile data shape', 'shared kit'],
    steps: [
      'Layout: ServerScriptService/Server (a Script, RunContext Server) requires the Services, Net and V modules first; ServerStorage/Config holds secret tables; ReplicatedStorage/Shared holds display data; ReplicatedStorage/Remotes is made only by Net.',
      'One profile per player: Coins, Gems, Inventory (itemId to count), Equipped, Quests, Daily, Codes, Plot, Pets.',
      'Net.listen(name, ratePerSec, burst, handler) applies a per-player per-remote token bucket (os.clock), pcalls the handler (warn on error) and clears buckets on PlayerRemoving; handlers validate every raw argument.',
      'Validators: int (finite, whole, in range), str (length cap), id (at most 40 characters of letters, digits, underscore), vec (finite, magnitude cap); NaN fails every comparison, so test math.isfinite.',
      'Rewards.give(player, {Coins?, Gems?, Items?}) is the only grant for quests, dailies, codes and rounds; leaderstats only mirrors. Write first, then yield.',
    ],
    verification: ['Fire each remote from a client with nil, 0/0, math.huge, -1, {}, a 10,000-character string and 100 calls in a loop: no change, throttled.', 'No remote carries a price or reward.'],
    failureModes: ['A handler yields before it writes, so a double fire passes twice.', 'A boot error leaves clients waiting on missing remotes.'] },
  { id: 'system-inventory-hotbar-server-authority', title: 'Split inventory into server data, tool templates and a client snapshot', domain: 'gameplay', summary: 'Stackables as counts, unique items by GUID, tools cloned from ServerStorage on every respawn and a client that only requests Equip.', refs: ['tool'], keywords: ['inventory', 'hotbar', 'backpack', 'tools', 'equip', 'stack', 'pickups', 'guid'],
    steps: [
      'Stackables are Inventory[itemId] = count with a per-item maxStack and a distinct-slot cap (suggest 200); items with rolls are Instances[uid] = {id, level} with uid from HttpService:GenerateGUID(false); never store Instances.',
      'Definitions live in ServerStorage/Config/ItemDefs (name, maxStack, tool template, tradeable, sell price); a display-only copy of name and icon sits in ReplicatedStorage/Shared. Tool templates in ServerStorage/Tools are named by item id, with a Handle (or RequiresHandle false) and no anchored part.',
      'The server owns Inventory and Equipped, grants Tools by lookup in ServerStorage only and re-grants them on every CharacterAdded (the Backpack is recreated on death); equip at most 3 tool ids.',
      'The client listens to an InventorySync snapshot and fires Equip(itemId, slot); tool use stays LocalScript Activated, RemoteEvent, server action. A custom hotbar is for stacks or more than ten slots. Pickups: a server ProximityPrompt.Triggered that re-checks distance.',
    ],
    verification: ['Add 100 of a maxStack 99 item (refused), equip an id you do not own (refused), die and respawn (tools return).', 'Rejoin: the inventory persists.'],
    failureModes: ['A Tool granted from a client-supplied name hands out admin tools.', 'A RemoteFunction for "give me my inventory" can be spammed; use event plus push.'] },
  { id: 'system-quests-dailies-event-reported', title: 'Run quests and dailies from server-reported events with a claim remote', domain: 'gameplay', summary: 'Definitions on the server, progress reported only by gameplay code, a claim that re-checks and a UTC day for dailies.', refs: ['badges'], keywords: ['quests', 'dailies', 'achievements', 'progress', 'claim', 'missions package', 'badges', 'utc day'],
    steps: [
      'Definitions in ServerStorage/Config/QuestDefs (objective, quantity, reward, repeatable); the profile keeps Quests.active[id] = {progress, day} and Quests.claimed[id] = day claimed (or 1 if one-time). Evaluate Roblox Missions and Season Passes packages before writing your own.',
      'Progress is reported only by server code (Quests.report(player, event, target, n), for example in an enemy death handler), clamped to the goal; never by a remote.',
      'The client sees a QuestSync snapshot (send goals too) and fires AcceptQuest(id) and ClaimQuest(id); the claim re-checks progress, writes claimed, then grants through the reward function.',
      'Dailies derive the day from os.time() // 86400 (UTC) and are short tasks that act as a currency drip; long-term goals award a badge with BadgeService:AwardBadgeAsync inside a pcall, at most once (limit 50 + 35 x users per minute).',
    ],
    verification: ['Claim at 4 of 5 progress (nothing) and twice quickly (one grant); a daily rotates after the clock moves a day.', 'A client-reported "I killed 5" remote does not exist.'],
    failureModes: ['A client-reported progress remote lets exploiters finish every quest.', 'Dailies reset by a client clock, or a prerequisite loop in a chain.'] },
  { id: 'system-redeem-codes-normalise-global-cap', title: 'Redeem promo codes with normalisation, one use per player and a global cap', domain: 'data', summary: 'Trim, upper-case and whitelist input, one redeem per player stored forever, a cooldown, one reply for unknown and expired and an UpdateAsync counter.', refs: ['dataStore'], keywords: ['codes', 'promo', 'redeem', 'normalise', 'global limit', 'cooldown', 'updateasync', 'marketing'],
    steps: [
      'The client sends raw text; the server trims, upper-cases, caps at 32 characters and allows only [A-Z0-9_-], then looks it up in a table that never leaves ServerStorage. To change codes without a republish load the table from a DataStore or MemoryStore at boot and every 5 minutes.',
      'One redeem per code per player, stored in the profile forever so retired codes cannot return; a 3-second cooldown per player (forum advice, a starting point); the same reply text for unknown and expired codes.',
      'A global cap uses UpdateAsync on a counter key (the callback must not yield); grant through the reward function and reply with a status string.',
    ],
    verification: ['Redeem "release", " RELEASE " and "RELEASE": the second and third say used; also an expired code, a 5,000-character string, nil and a table.', 'With maxUses 1 redeem from two clients: one wins.'],
    failureModes: ['Removing a redeemed code from a server-local table (other servers still accept it).', 'Case or whitespace variants redeeming twice, or brute-force guessing without the rate limit and identical reply.'] },
  { id: 'system-leaderboards-session-global-seasonal', title: 'Layer leaderboards: leaderstats, an ordered store and a store name per season', domain: 'data', summary: 'Throttled writes only when improved, one batched top-50 read per server on a timer and a renamed store to reset a season.', refs: ['leaderboardData'], keywords: ['leaderboard', 'leaderstats', 'ordered datastore', 'seasonal', 'top 50', 'priority', 'isprimary', 'name lookup'],
    steps: [
      'Tier 1: a leaderstats Folder (that exact name, created on the server) with IntValue or NumberValue children; the first column comes from creation order, a child BoolValue IsPrimary or a NumberValue Priority (higher first). It mirrors profile data and is not the truth.',
      'Tier 2: an OrderedDataStore (integers only) for the global top 50; submit at most every 120 s per player and only if improved, on milestones and on PlayerRemoving as budget allows; store user ids, not names.',
      'Refresh the top 50 every 90 s per server with one GetSortedAsync call, resolve names in one batched UserService:GetUserInfosByUserIdsAsync (250 per minute), cache and push to clients.',
      'Tier 3: a new store name per season (for example Kills_2026w41) resets the board; never delete keys. Very hot boards use a MemoryStore sorted map flushed occasionally.',
    ],
    verification: ['Submit 10 scores in a loop: only the first writes.', 'A season rename shows an empty board and leaves the old store untouched.'],
    failureModes: ['Writing on every kill exhausts the budget; GetNameFromUserIdAsync per row costs 50 web calls a refresh.', 'Floats or negatives in the ordered store.'] },
  { id: 'system-trade-version-lock-and-ledger', title: 'Make player trades safe with a version-echo lock, a countdown and a write-ahead ledger', domain: 'data', summary: 'A server trade object, a version bumped by any change, a 5 s countdown and a saga ledger for high-value or cross-server swaps.', refs: ['dataStore'], keywords: ['trade', 'version', 'lock', 'countdown', 'ledger', 'saga', 'duplication', 'anti scam'],
    steps: [
      'The server holds the trade object and both offers; clients send intents (TradeInvite, TradeRespond, TradeOffer, TradeLock, TradeCancel) and get TradeState snapshots; every count passes the integer validator (a NaN offer is the docs vulnerable example).',
      'Any change resets both locks and bumps version; TradeLock must echo it; a 5-second countdown after both lock aborts on any change; revalidate ownership at commit, swap in one non-yielding block, save both profiles together and log each trade with ids and a timestamp.',
      'Restrict new accounts and rare items (account age, level); offered items cannot be equipped or listed.',
      'High-value or cross-server trades need a ledger: (1) UpdateAsync a durable Trade_{id} record with state committed and add the id to Pending_{userId} for both users; (2) apply the swap and add the id to each AppliedTrades (keep 50); (3) on each profile load replay pending ids missing from AppliedTrades.',
    ],
    verification: ['Lock both then change an offer within 5 s (aborts); lock with an old version (refused); offer 1e308 and NaN (refused).', 'Stop the server between the two saves in a test: recovery leaves no duplicate.'],
    failureModes: ['A crash between two profile saves duplicates or deletes items without a ledger.', 'Currency traded without caps.'] },
  { id: 'system-round-teams-neutral-spawn-points', title: 'Add teams to a round loop with neutral spawns and team points on the Team', domain: 'client_server', summary: 'Teams objects, a lobby spawn that goes non-neutral during rounds, team points as an attribute and clients that render timers from attributes.', refs: ['teams'], keywords: ['teams', 'round', 'neutral spawn', 'team points', 'roundstate', 'roundendsat', 'attributes', 'winner'],
    steps: [
      'One server module owns the loop and publishes RoundState and RoundEndsAt (and RoundWinner at the end) as Attributes on Workspace; clients render timers from RoundEndsAt - workspace:GetServerTimeNow() with no remotes.',
      'Create Team objects in Teams and set Player.Team; set the lobby SpawnLocation.Neutral to false during rounds so only team spawns work; Teams auto-balances and tints names.',
      'Keep team points as an attribute on the Team so a leaver does not lower the total; wait for the winning score on a BindableEvent, never on a client.',
      'Per-round data lives in a local table; a late joiner joins the next round (the loop only snapshots players at the start); grant rewards once and clean the map and connections.',
    ],
    verification: ['Leave during intermission (the countdown aborts), die while playing, leave as the winner: the round still ends once.', 'Three rounds back to back leave no map or connection leftovers.'],
    failureModes: ['A round loop that hangs waiting on a client script error.', 'CharacterAutoLoads false with no respawn call leaves players stuck.'] },
  { id: 'system-npc-single-scheduler-pathfinding', title: 'Run every NPC from one scheduler with throttled paths and server ownership', domain: 'gameplay', summary: 'One loop steps all enemies, paths are recomputed at most every 0.75 s while chasing, sleeping NPCs cost nothing and roots are server-owned.', refs: ['pathfindingService'], keywords: ['npc', 'ai scheduler', 'pathfinding', 'blocked', 'aggro', 'network owner', 'enemy', 'humanoid npc'],
    steps: [
      'Build the rig (Humanoid and HumanoidRootPart) with animations from the standard Animate script, tag it Enemy and set attributes NpcType and optional tuning (patrol radius, attack damage, radius); add PathfindingModifier parts (labels like Water with matching Costs) or PathfindingLink attachments for ladders and doors; keep static geometry anchored.',
      'One scheduler steps all NPCs every 0.25 s: recompute the path no more than about every 0.75 s and only while chasing and the target moved; do no work when no player is within twice the aggro range; SetNetworkOwner(nil) on every NPC root.',
      'Handle Path.Blocked with the forward-index check (compare with the next waypoint index before recomputing); on FailStartNotEmpty move straight toward the goal; renew Humanoid:MoveTo (it times out after 8 s).',
      'Scale: tens of pathfinding attackers is normal, a forum claim of 1,500 needed custom replication; disconnect Died handlers and Debris the model.',
    ],
    verification: ['Spawn 20 copies and watch the MicroProfiler: one scheduler cost, no per-NPC loops.', 'Block the route at run time: the NPC reroutes; stand behind a wall: no aggro until line of sight.'],
    failureModes: ['Computing a path every step is the single biggest NPC cost.', 'Leaving ownership automatic lets a nearby exploiter fling or steer NPCs.'] },
  { id: 'system-drivable-vehicle-constraints-sampler', title: 'Assemble a drivable vehicle from hinge motors with driver-owned physics', domain: 'gameplay', summary: 'A VehicleSeat chassis, driven and steered hinges, spring suspension, occupant ownership and a four-times-a-second sanity check.', refs: ['hingeConstraint'], keywords: ['vehicle', 'car', 'hinge motor', 'servo', 'suspension', 'throttlefloat', 'driver ownership', 'sampler'],
    steps: [
      'Model in ServerStorage/Vehicles with PrimaryPart = Chassis: a VehicleSeat DriverSeat welded to it, four cylinder wheels each with a HingeConstraint (driven: ActuatorType Motor with high MotorMaxTorque and MotorMaxAcceleration; steering: Servo with LimitsEnabled, ServoMaxTorque, AngularSpeed), a SpringConstraint per wheel, attributes MaxSpeed and WheelRadius; all unanchored. For racing prefer a maintained chassis kit or Server Authority.',
      'The server spawns one vehicle per player with a spawn cooldown and despawn timer; the driver client owns the physics (SetNetworkOwner(driver)) and writes constraint targets from ThrottleFloat and SteerFloat (integer Throttle and Steer are deprecated); on Occupant change the server hands ownership over and uses SetNetworkOwner(nil) when empty.',
      'A server sampler checks speed and teleport distance four times a second from observed positions and resets after strikes. Flip a sign if it steers inverted.',
    ],
    verification: ['Two clients: the driver sees a smooth car; a non-owner hop-in is ejected.', 'Teleport the car 500 studs from the client: reset after three strikes; leaving destroys it.'],
    failureModes: ['Any anchored wheel or chassis part makes CanSetNetworkOwnership false.', 'Ownership set before the model is in Workspace or left on the last driver.'] },
  { id: 'system-companions-client-rendered-attributes', title: 'Render companions on clients from equipped-id attributes', domain: 'gameplay', summary: 'The server validates owned and equipped pets and publishes ids as Player attributes; every client draws anchored, non-colliding followers.', refs: ['alignPosition'], keywords: ['companions', 'pets', 'followers', 'attributes', 'client render', 'collision group', 'equip'],
    steps: [
      'Data: Pets.owned[petId] = count (or {uid: {id, level, rolls}}), Pets.equipped a dense array of ids; definitions in ServerStorage/Config/PetDefs (rarity, multiplier); display models in ReplicatedStorage/PetModels named by pet id.',
      'The server validates equips and publishes the ids as Player attributes Pet1 to Pet3; the attribute names are a public contract, so never put rolls or mutation chances in them. Multipliers and auto-collect come from server data, not the visual pet.',
      'Every client renders every player pets as anchored non-colliding instances moved each frame (no replication cost, no ownership, no exploit surface); snap them after about 60 studs of teleport and reattach on respawn.',
      'Physical followers are the alternative: a Humanoid model with MoveTo and the owner as network owner, or an unanchored part tracked by AlignPosition (Mode OneAttachment); put them in their own collision group (at most 32 groups) so they never shove players.',
    ],
    verification: ['Two clients see each other pets; equipping an unowned id is refused; a character reset reattaches them.', '30 players of fake attributes keep frame rate.'],
    failureModes: ['Replicating pet positions from the server (cost and jitter).', 'Pets with CanCollide true shoving the owner.'] },
  { id: 'security-admin-tools-roles-bans-audit', title: 'Build minimal admin tools: roles, server chat commands, BanAsync and an audit log', domain: 'security', summary: 'Roles from the creator and group ranks, TextChatCommand handlers on the server, lower-level targets only and Roblox ban rules.', refs: ['playersClass'], keywords: ['admin', 'moderator', 'ban', 'kick', 'textchatcommand', 'roles', 'audit log', 'banasync'],
    steps: [
      'Roles come from game.CreatorId plus GroupService:GetRolesInGroupAsync(userId, groupId) in a pcall (it returns {IsMember, Roles}; the older rank calls are deprecated); a failed lookup is never cached as "not admin".',
      'Commands are TextChatCommand children of TextChatService whose Triggered handler runs on the server (aliases players will not type in normal chat); a command may only target a lower level; log every use (a DataStore log plus a print) and never give admins /give or /execute in production.',
      'Use Players:BanAsync{UserIds (max 50), Duration (seconds, -1 permanent), DisplayReason (max 400 characters), PrivateReason (max 1000), ApplyToUniverse (default true), ExcludeAltAccounts (default false), ApplyDeviceBlock (default false)} server-only; UnbanAsync and GetBanHistoryAsync exist. Rules must be visible, enforced consistently, appealable, and a ban message carries no personal data or direct links.',
      'Filter announce text; state the minimal set: kick, ban, unban, announce.',
    ],
    verification: ['A non-admin typing /ban does nothing; an admin cannot kick an equal level; /ban on a throwaway alt for 36 seconds then /unban works.', 'The audit line appears for each use.'],
    failureModes: ['Authority decided on the client, or admin lists in ReplicatedStorage.', 'A stolen admin account becoming a dupe machine through give commands.'] },
  { id: 'system-ingame-notifications-toast-queue', title: 'Show server-authored notifications through one remote and a capped client queue', domain: 'client_server', summary: 'The server sends a kind plus its own text, the client owns the queue and tween, user text is filtered and out-of-experience pushes stay separate.', refs: ['starterGui'], keywords: ['notifications', 'toast', 'system message', 'queue', 'setcore', 'displaysystemmessage', 'notify remote'],
    steps: [
      'The server decides what to show and fires a Notify remote with a kind and server-authored text; the client queues toasts (cap the queue, fall back to an info style for unknown kinds) and owns presentation (tween, safe layout).',
      'StarterGui:SetCore("SendNotification", {Title, Text, Icon?, Duration? (default 5), Button1?, Button2?, Callback?}) is a client-only quick fallback: wrap in a pcall and retry because the core script may not have registered it yet.',
      'TextChannel:DisplaySystemMessage is client-only and shows to that user alone (chat-log lines); ShouldDeliverCallback is server-only. Anything containing user input goes through TextService:FilterStringAsync first.',
      'Out-of-experience notifications are separate (see the opt-in skill): ask for opt-in only after a moment of value, never at join.',
    ],
    verification: ['Fire 30 Notify events in a second: the queue caps and keeps order; an unknown kind shows as info.', 'DisplaySystemMessage is only called from client code.'],
    failureModes: ['Letting a client choose the text or kind (spoofed system messages).', 'An unbounded toast queue, or unfiltered user text.'] },

  // --- note 21: building craft (numbers tagged derived or community are starting points to check in Studio; the create tools make Part, WedgePart, CornerWedgePart, TrussPart, Model and Folder but no UnionOperation or MeshPart, so solid shapes come from separate Parts and meshes from the library) ---
  { id: 'build-metrics-card-world-attributes', title: 'Write one metrics card of grid, character and architecture numbers before building', domain: 'worldbuilding', summary: 'Fix the grid, the character numbers, the architecture dimensions and the part budgets once and store them where every later step reads them.', refs: ['units'], keywords: ['metrics card', 'grid', 'scale numbers', 'door size', 'wall height', 'budgets', 'world attributes', 'dimensions'],
    steps: [
      'Grid: 5 studs for blockout (kit grids 5, 7.5 or 16; one grid per project, chosen at the start); finish detail on 1, 0.5, 0.25 and below. Character: height 5, WalkSpeed 16, jump about 7.2, gravity 196.2.',
      'Architecture (derived unless tagged): slab 1; exterior wall 1 (community 0.7); interior partition 0.5 to 0.7; clear ceiling 12 to 14; storey wall height 14 to 15; single door 6 x 9; double door 10 x 10; corridor 10; window 4 x 4 with sill 3.5; stair rise 0.6 to 0.8, run 1.0 to 1.5; roof overhang 1 to 2 plus 1 for shingles; railing 3.5 to 4.',
      'Budgets: 100 to 600 parts per building and 15,000 to 30,000 per map (2021 and 2022 community numbers); triangles and draw calls from the phone budget.',
      'Store all of it as Attributes on a World folder so every later operation reads one source.',
    ],
    verification: ['A reference rig passes every door and corridor and clears every step from the card.', 'Every later build step quotes a card number, not a fresh guess.'],
    failureModes: ['Mixing grids, or letting scale drift between zones.', 'Doors 7 studs high because they look right on a baseplate.'] },
  { id: 'build-gated-blockout-to-final', title: 'Move a map from text layout through a walked blockout to final art in gates', domain: 'worldbuilding', summary: 'A text layout, colour-coded cheap Parts, a rig walk, zone-by-zone replacement and a final delete of the greybox and Baseplate.', refs: ['greyboxTutorial'], keywords: ['blockout', 'greybox', 'stage gates', 'world folder', 'scale check', 'pipeline', 'colour coded', 'delete baseplate'],
    steps: [
      'Write the 2D layout as text: zones with sizes, spawn, goal, routes, a landmark per zone. Make World/Blockout_Parts of SmoothPlastic anchored Parts colour-coded by role (the Roblox curriculum uses 255,176,0 walls, 255,89,89 and 16,42,220 team floors, 75,151,75 exterior elevation).',
      'Gate 1: walk the route with a 5-stud reference rig in Test mode: nothing exceeds the metrics card and combat pockets have three or fewer exits.',
      'Replace the blockout zone by zone with kit pieces or finished props, hiding it (Transparency 1, CanCollide off) only until the replacement is checked; then terrain, lighting and set dressing.',
      'Gate 2 is the optimisation pass before lighting polish; Gate 3 deletes greybox geometry and the Baseplate and retests. Keep Workspace organised: Blockout_Parts, Terrain, Buildings, Props, Decor.',
    ],
    verification: ['A rig completes the whole route and every gap and step matches the card.', 'After gate 3 no invisible blockout Part or Baseplate remains.'],
    failureModes: ['Art built on an unplayed layout.', 'Invisible blockout left in the place: it still costs.'] },
  { id: 'build-open-world-poi-blockout', title: 'Block out an open world from points of interest about 40 seconds apart', domain: 'worldbuilding', summary: 'Plan points of interest and landmarks, join them with curved paths about 640 studs apart and fill the overlaps with in-between sites.', refs: ['greyboxTutorial'], keywords: ['open world', 'points of interest', 'poi', 'landmarks', 'biomes', 'paths', 'travel time', 'loot spots'],
    steps: [
      'Pre-plan the story, a list of points of interest, landmarks and the spawn; block the points of interest out as basic blocks in a triangle layout and mark biome borders.',
      'Draw main paths between them with each pair about 40 s of walking apart (about 640 studs at 16 studs/s, derived).',
      'Draw circles of interest around each point so they overlap and put in-between sites (camps, cabins) in the overlaps.',
      'Playtest travel time, add shortcuts and place resource and loot spots within 15 to 20 s of paths; give each biome its own palette and material set and keep paths curved.',
    ],
    verification: ['A timed walk between neighbours is 35 to 45 s.', 'No straight shot connects spawn to goal.'],
    failureModes: ['A straight line from spawn to the goal, or empty distances with no terrain variation.', 'Loot far from any path.'] },
  { id: 'build-house-walls-openings-no-union', title: 'Build a house from separate wall pieces around openings, with no unions', domain: 'worldbuilding', summary: 'A grid-aligned footprint, wall pieces on each side of a door or window, thin trim parts and flags set while building.', refs: ['parts'], keywords: ['house', 'walls', 'door opening', 'window opening', 'no csg', 'footprint', 'baseboard', 'z-fighting'],
    steps: [
      'Pick a grid-aligned footprint (for example 32 x 24) and mark rooms as 2D boxes first; floor slab Size (L, 1, W) anchored.',
      'Each wall is separate Parts: a door is left column plus right column plus lintel; a window adds a sill piece. Thickness 1 (0.7 for finer builds), height 12 to 14; door opening 6 x 9 at y 0 on the 5-stud grid; windows 4 x 4 at y 3.5. Overlap wall ends at corners by one thickness. The create tools make no UnionOperation, so never cut with Negate.',
      'Interior partitions 0.5 to 0.7 with 6 x 9 doors and corridors 10 wide where two players pass; baseboards and window frames as thin parts 0.3 to 0.5 deep in a different colour; ceiling slab 1 thick; a second floor uses the same grid so walls stack.',
      'Flags: Anchored, CanCollide on walls, CastShadow on walls only; a one-storey house is about 60 to 250 parts (derived). Roof, steps and a sign come from the roof and stairs skills.',
    ],
    verification: ['A rig walks through every door and the camera clears the ceiling.', 'No two coplanar faces flicker; part count is inside the range.'],
    failureModes: ['Z-fighting where coplanar faces overlap (offset by 0.01 to 0.05).', 'Door frames taller than the camera, or hollow interiors nobody enters.'] },
  { id: 'build-interior-room-layout-furniture-scale', title: 'Lay out an interior from a floor plan with scaled furniture and few lights', domain: 'worldbuilding', summary: 'A 2D plan first, a 10-stud walkway, anchor pieces then layered decoration at 1.3x real sizes and a sealed opaque shell.', refs: ['units'], keywords: ['interior', 'room', 'furniture', 'floor plan', 'walkway', 'ceiling height', 'set dressing', 'lights'],
    steps: [
      'Draw a 2D floor plan (zones, entrances, windows, a furniture list per room) before any 3D; keep a 10-stud main walkway and ceilings at 12 or higher so the camera clears (derived).',
      'Place anchors first (bed, table, counter, stove on walls or centred), then layers: floor items, wall items, ceiling items, then things on surfaces.',
      'Furniture heights (real sizes x about 1.3, derived): table top 3.0 to 3.5, chair seat 1.8 to 2.0, bed 2 to 2.5, counter 3.5, door handle 3.5; do not use 1:1 furniture in an 8-stud room.',
      'A few ceiling lamps (PointLight Range 20 to 30, shadows off) plus one hero light; close the shell with opaque walls and a ceiling so occlusion culling can hide what is behind (beta, verify).',
    ],
    verification: ['Doorways are never blocked and two avatars pass in the walkway.', 'Light count in a room stays low.'],
    failureModes: ['Oversized real-scale furniture in a narrow room.', 'Too many tiny props, each of them a Part.'] },
  { id: 'build-gable-hip-roof-slabs', title: 'Build gable and hip roofs from tilted slabs and a stepped gable end', domain: 'worldbuilding', summary: 'Pitch from rise over half-span, two slabs rotated about Z, closed gable ends and no unions at hips.', refs: ['wedgePart'], keywords: ['roof', 'gable', 'hip roof', 'pitch', 'wedgepart', 'cornerwedgepart', 'overhang', 'eave'],
    steps: [
      'Choose the pitch as rise over half-span: a 24-stud span with rise 6 is about 26.6 degrees (6:12), rise 8 about 33.7 (derived).',
      'Orientation-safe method: two tilted slabs of length sqrt(halfSpan^2 + rise^2) + overhang (1 to 2 studs), thickness 0.7 to 1, rotated about Z by plus and minus atan2(rise, halfSpan) and centred over each side.',
      'Close gable ends with a stepped stack of blocks narrowing by 2 studs per 1 stud of height, or two WedgeParts after testing the wedge slope direction on a spare part (the note does not state which axis rises).',
      'Hip roof: four slabs meeting at a ridge, CornerWedgeParts at hips; accept small clipping or fill gaps by overlap, never by union. Add a 1-stud fascia strip, a darker ridge cap and a shingle slab layer 1 stud beyond the eave.',
    ],
    verification: ['Slab ends meet at the ridge with no light gap from the walkway.', 'Eave overhang clears the walls on all four sides.'],
    failureModes: ['Corner wedges clip and unions of roofs cannot be edited later.', 'Wedge slope direction assumed instead of tested.'] },
  { id: 'build-stairs-ramps-ledges-rise-run', title: 'Build stairs with solid steps, an invisible ramp and checked ledge heights', domain: 'worldbuilding', summary: 'Step count from total rise, run 1.0 to 1.5, solid undersides, a hidden ramp over long flights and landings with rails.', refs: ['parts'], keywords: ['stairs', 'ramp', 'ledge', 'rise', 'run', 'landing', 'handrail', 'step height'],
    steps: [
      'Total rise R and a chosen step rise r of 0.6 to 0.8 (a step above about 0.8 makes animations hop); n = ceil(R / r) and recompute r = R / n.',
      'Run per step 1.0 to 1.5 (1:1 is common), width at least 6 for one avatar and 10 for two; step i is a Block of height r x i so the underside is solid.',
      'For long climbs add an invisible ramp Part (Transparency 1, CanCollide true) rotated to the stair slope so avatars glide; landings every 8 to 10 steps; handrails 3.5 high on open sides.',
      'Ledges the player jumps up to stay at 5 to 6 studs at most; blocking walls at least 10; slopes steeper than 1:1 feel like ladders.',
    ],
    verification: ['A rig runs up and down the flight without hopping.', 'Every ledge on the route is 6 studs or less.'],
    failureModes: ['Step height over 0.8 triggers the hopping animation.', 'Hollow stair undersides or railings missing on open sides.'] },
  { id: 'build-lowpoly-tree-from-primitives', title: 'Build a low-poly tree from four to six Parts and reuse the model', domain: 'worldbuilding', summary: 'A trunk block and three stacked canopy tiers yawed apart, grouped as one Model and varied by scale and yaw.', refs: ['parts'], keywords: ['tree', 'low poly', 'canopy', 'trunk', 'vegetation', 'forest', 'primitives', 'variants'],
    steps: [
      'Trunk: a Block 1.5 x 8 x 1.5 in brown SmoothPlastic, buried 0.5 in the ground (derived dimensions).',
      'Canopy: three Blocks 10 x 4 x 10, 7 x 4 x 7, 4 x 4 x 4 stacked with a 3-stud overlap, yawed 0, 30 and 60 degrees, in two greens (lighter on top); optional darker 6 x 1.5 x 6 block under the lowest tier; no spheres (a sphere is about 36 times a block in triangles, a single 2021 count).',
      'Group as a Model with the trunk as PrimaryPart, Anchored; CastShadow off on the top tiers only if distant. Trees stand 15 to 40 studs tall, 3 to 8 times avatar height.',
      'Make 3 to 4 variants by scaling the model 0.8 to 1.4x and varying yaw; reuse the model, never new parts. Mesh trees come from the library, since the create tools cannot make MeshParts.',
    ],
    verification: ['A grove of 50 shows varied heights and yaws, not a grid of copies.', 'Each tree is 4 to 6 parts.'],
    failureModes: ['Identical trees in a grid.', 'Semi-transparent leaves overlapping (overdraw).'] },
  { id: 'build-lowpoly-rock-clusters', title: 'Build rock clusters from rotated blocks sunk into the ground', domain: 'worldbuilding', summary: 'Three to five overlapping blocks rotated on all axes, two to three greys, a wedge cap and terrain balls for realism.', refs: ['terrainClass'], keywords: ['rocks', 'boulders', 'cluster', 'cliff', 'terrain fillball', 'scatter', 'dressing'],
    steps: [
      'Cluster 3 to 5 Blocks sized 4 to 10 studs, each rotated randomly up to about 25 to 35 degrees on all axes, overlapping, sunk 30% to 40% into the ground; scale the parts differently.',
      'Colour two to three greys or one tinted grey; SmoothPlastic for cartoon, Slate for realism; add one WedgePart cap for a sloped top and optional moss as a thin green block on top faces only.',
      'For realism use Terrain:FillBall with Rock, radius 6 to 14, then Sculpt or Smooth; terrain rocks avoid part-count cost (one terrain edit is capped at 65,536 voxels).',
      'Scatter with random yaw and 0.8 to 1.3x scale; sink rocks on slopes so none float.',
    ],
    verification: ['No rock is perfectly axis-aligned or floating.', 'A cluster is 3 to 5 parts.'],
    failureModes: ['Axis-aligned blocks read as crates.', 'Floating rocks on slopes.'] },
  { id: 'build-small-props-from-primitives', title: 'Build street and yard props from a few primitives: post light, fence, crate, sign', domain: 'worldbuilding', summary: 'Dimensions for four small props with a pivot at the bottom, texture only on faces that matter and reuse as packages.', refs: ['packagesDoc'], keywords: ['props', 'lamp post', 'fence', 'crate', 'sign', 'primitives', 'neon', 'dressing'],
    steps: [
      'Lamp post (about 4 parts, derived dimensions): pole Block 0.6 x 10 x 0.6 in dark metal, arm 0.5 x 0.5 x 3, head Block 1.6 x 1 x 1.6 in Neon with a PointLight Range 20, Brightness 1, Shadows false.',
      'Fence section 6 long (4 parts): two posts 0.8 x 4 x 0.8 and two rails 0.4 x 0.6 x 6 at heights 1.2 and 2.8; repeat every 6 studs; vary post height by 0.2; on curves use segment angles of 7.5, 15 or 22.5 degrees that sum to a full turn.',
      'Crate: Block 3 x 3 x 3 with 0.3-thick darker frame strips (6 to 8 parts or one textured Part). Sign: post 0.5 x 7 x 0.5, board 5 x 3 x 0.3, text on a SurfaceGui or a Decal on one face only.',
      'Group each as a Model with the pivot at the bottom, convert reused props to packages, and prefer library props where one fits (asset order first).',
    ],
    verification: ['Each prop reads as its object from 30 studs.', 'No decal sits on all faces and no large Neon area exists.'],
    failureModes: ['Decals on every face cost about 7x.', 'Neon on large areas (high cost).'] },
  { id: 'build-paths-roads-bridges-curves', title: 'Lay paths, roads and bridges as equal-angle segments with no long straights', domain: 'worldbuilding', summary: 'A bending centre line, straight segments rotated by 7.5, 15 or 22.5 degrees, road and bridge widths and painted terrain paths.', refs: ['terrainEditor'], keywords: ['paths', 'roads', 'bridge', 'curves', 'segments', 'kerb', 'terrain paint', 'river'],
    steps: [
      'Lay a centre line of points with gentle bends; no straight run over about 60 to 80 studs (derived).',
      'Build straight segments rotated by equal angle increments (7.5, 15 or 22.5 degrees) that sum to the planned bend, by repeated rotation or a script CFrame loop; do not union curves.',
      'Road width 20 to 24 for two lanes, path 8 to 12, kerb 0.5 high (derived); material Asphalt or Cobblestone terrain, or thin Parts raised 0.05 to 0.1 to avoid z-fighting.',
      'Bridge: deck Block 12 x 1 x length, supports every 16 to 24 studs, railing 3.5 high; arches from wedges. For terrain-hugging paths paint Mud, Ground or Sand with a brush of 3 to 8 instead of laying parts.',
    ],
    verification: ['Segment angles sum to 90, 180 or 360 degrees and no gap shows on the outside of a bend.', 'No straight run exceeds 80 studs.'],
    failureModes: ['Gaps at the outside of bends.', 'Z-fighting between road and terrain.'] },
  { id: 'build-terrain-sculpt-order-macro-to-micro', title: 'Sculpt terrain in order: macro, meso, smooth, flatten, water, paint, micro', domain: 'worldbuilding', summary: 'Brush sizes and a fixed order from big hills to 1 to 8 stud details, tiled to fit the plugin edit cap.', refs: ['terrainEditor'], keywords: ['terrain', 'sculpt', 'brush', 'smooth', 'flatten', 'sea level', 'paint', 'voxel cap'],
    steps: [
      'Block scale out with Parts or the Generate tool; macro with Draw (brush 32 to 64, sphere) to add hills and subtract valleys; meso with Sculpt (strength 0.3 to 0.6, derived) for ridges and eroded edges, V-shaped valleys with branching patterns.',
      'Smooth with the Smooth tool or Shift while using Draw or Sculpt; Flatten at a Fixed Y plane for building pads and the spawn; water with Sea Level or Fill and Replace Air to Water (the core tutorial region is 1800 x 5 x 1800 at Y -15).',
      'Paint Leafy Grass in the middle, Grass edges (brush 3), Sand at the waterline, Rock on slopes, Mud near water; recolour ground or mud toward green for moss; finish with brush 1 to 8 for path indents, shorelines and cliff faces.',
      'A terrain edit in the Apple plugin is capped at 65,536 voxels (about 256 x 64 x 256 studs, voxels are 4 studs): tile large areas. Keep terrain filled, never hollow, and walk the route to adjust the spawn.',
    ],
    verification: ['The route is walkable with slopes the character can climb and no hollow shells.', 'No single edit exceeded the voxel cap.'],
    failureModes: ['Huge flat green areas with no elevation or material variation.', 'Terrain edits beyond the cap that silently fail.'] },
  { id: 'build-parts-to-terrain-conversion', title: 'Convert a Part blockout to terrain for cliffs, arches and bowls', domain: 'worldbuilding', summary: 'Build the silhouette from blocks and wedges on the grid, fill it as terrain, smooth the edges and paint by slope.', refs: ['terrainClass'], keywords: ['part to terrain', 'cliffs', 'fillwedge', 'fillblock', 'fillball', 'silhouette', 'slope paint', 'voxel'],
    steps: [
      'Build the shape from Blocks and WedgeParts on the 5-stud grid.',
      'Convert with a Part to Terrain tool (wedges use Terrain:FillWedge) or script Terrain:FillBlock, FillBall, FillCylinder, FillWedge; the Apple terrain edit offers fill_block, fill_ball, fill_region and replace_material within the 65,536-voxel cap. Each voxel is 4 studs, so shapes thinner than 4 studs round off.',
      'Hide or delete the source parts, smooth edges with Smooth and paint by slope (rock on steep, grass on flat); a converter can assign materials by slope and altitude.',
      'Check for floating islands and holes from thin parts; convert in chunks, not one huge call.',
    ],
    verification: ['No floating islands or holes remain after conversion.', 'Steep faces are Rock and flat tops are Grass.'],
    failureModes: ['Converting mesh parts with no thickness.', 'One very large conversion in a single go.'] },
  { id: 'build-modular-kit-grid-pieces-packages', title: 'Build a modular architecture kit on one grid and update it through packages', domain: 'worldbuilding', summary: 'One grid, 8 to 15 pieces each at least 5 studs, consistent pivots, one trim sheet per set and packages that propagate edits.', refs: ['packagesDoc'], keywords: ['modular kit', 'trim sheet', 'pivot', 'packages', 'grid', 'wall pieces', 'surfaceappearance', 'asset library'],
    steps: [
      'Choose and write down one grid (5, 7.5 or 16 studs); define 8 to 15 pieces (floor, wall large, mid and small, inner and outer corner, door frame plus plug, window, ceiling, trims, stair, skylight), each at least one grid cell and divisible by the smallest.',
      'Pivot at the forward-most lower corner (props at their attach face). Model at 1 unit per stud, UV all pieces to one trim sheet with quads and one SurfaceAppearance per set (modelling is done outside Studio; the create tools cannot make MeshParts, so import or use library pieces).',
      'Set flags (Anchored, CollisionFidelity Box or Hull, RenderFidelity), convert every piece to a package with AutoUpdate, and assemble with grid snapping and numeric coordinates (one reference arena took 15 to 30 modular assets per room and about 90 minutes).',
      'Swap colours or MaterialVariants per zone; edit the package, never instances in place, so changes propagate.',
    ],
    verification: ['Pieces snap with no gap at 5-stud steps and the whole kit shares one grid.', 'Editing one wall package updates every instance.'],
    failureModes: ['A one-off piece that breaks the grid, or baked-in grime that makes repeats obvious.', 'Editing instances in place so packages drift.'] },
  { id: 'build-flags-while-building-optimisation', title: 'Set decoration flags and cull cost while you build, not at the end', domain: 'worldbuilding', summary: 'A stats pass per stage gate that sets collision, touch, query, shadow and fidelity flags and removes hidden geometry.', refs: ['perfImprove'], keywords: ['optimisation', 'canquery', 'cancollide', 'castshadow', 'collisionfidelity', 'renderfidelity', 'part count', 'baseplate'],
    steps: [
      'Run a stats pass at each gate: part count by class, unique MeshIds, semi-transparent parts, parts with CanCollide false but CanQuery true.',
      'Static decoration: CanCollide, CanTouch and CanQuery false (unless raycasts must hit), CastShadow false on small parts, Anchored true everywhere except doors and movers; meshes CollisionFidelity Box for plain walls, Hull for trims and rocks, Default only where shape matters; RenderFidelity Automatic or Performance for foliage.',
      'Replace unions with meshes or plain parts, unify MeshIds, remove hidden geometry, the Baseplate, invisible blockout and unseen faces; transparency 0 or 1 only.',
      'Convert repeated pieces to packages, enable StreamingEnabled, and check Scene Analysis triangle composition and Shift+F2 stats against the phone baseline.',
    ],
    verification: ['The stats snapshot is recorded per gate and part count stays inside the budget.', 'Weapons still hit the walls that need CanQuery.'],
    failureModes: ['Hiding parts with Transparency 1 still costs.', 'CanCollide off on floors, or CanQuery off on walls that raycasts must hit.'] },
  { id: 'build-set-dressing-detail-layering', title: 'Dress a zone in layers with focal points, scatter rules and a clear route', domain: 'worldbuilding', summary: 'Hero props at decision points, foreground to background layers, two or three vegetation sizes and scatter with yaw, scale, spacing and exclusion masks.', refs: ['parts'], keywords: ['set dressing', 'scatter', 'detail layering', 'focal point', 'vegetation', 'repetition', 'palette', 'clearance'],
    steps: [
      'Place a hero prop or landmark at each decision point first; layer by distance: interactables and clutter near the path, buildings in the midground, silhouettes behind.',
      'Vegetation in two or three size layers (large trees, small trees, bushes, ferns, flowers); scatter with random yaw, 0.8 to 1.3x scale, minimum spacing, slope and height masks and exclusion zones for paths and water.',
      'Break repetition by varying colour, size and angle and tinting; keep a palette of mostly neutrals with rare accents (flowers, mushrooms); keep a 10-stud clearance on the critical path.',
      'Add small guiding lights and particles last, then rerun the optimisation pass and a Test-mode walk at avatar height.',
    ],
    verification: ['No prop floats, sinks deeply or blocks the 10-stud route clearance.', 'Two screenshots from the path show no obvious repeats.'],
    failureModes: ['Uniform spacing and identical props.', 'Clutter on the critical path.'] },
  // END researched-seeds
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
  enemies: ['horror', 'tower_defense', 'anime_battle', 'survival', 'adventure'],
  waves: ['horror', 'tower_defense', 'anime_battle', 'survival'],
  towers: ['tower_defense'],
  path_waypoints: ['horror', 'tower_defense', 'anime_battle', 'survival'],
  rebirth: ['tycoon', 'simulator'],
  dropper: ['tycoon'],
  plots: ['tycoon', 'roleplay'],
  dialogue: ['horror', 'simulator', 'roleplay', 'adventure'],
  vehicles: ['racing', 'roleplay'],
  racing_track: ['racing'],
  teams: ['racing', 'fps_arena', 'anime_battle'],
  customization: ['simulator', 'roleplay', 'anime_battle'],
  ragdoll: ['fps_arena', 'anime_battle', 'survival'],
  placement: ['tycoon', 'roleplay', 'tower_defense'],
  zones: ['horror', 'simulator', 'roleplay', 'survival', 'adventure'],
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
  genreTask('horror', 'layered-ambience-cues', 'Layer horror ambience beneath actionable audio cues', 'Build a restrained ambience bed while footsteps, pursuit and objective cues stay locatable.', ['audio3d', 'audioObjects'], ['Assign ambience, threat and interaction to separate priority bands.', 'Set spatial rolloff from actual corridor and room dimensions.', 'Lower the ambience during the cue that demands action.'], ['A player locates the threat direction with eyes closed.', 'Crossing room boundaries does not stack duplicate loops.'], ['A loud ambience loop masks the warning cue.', 'Every room starts another full-volume track.'], ['audio', 'tension']),
  genreTask('horror', 'pursuit-state-recovery', 'Run and recover a horror pursuit state', 'Start pursuit from one server-owned trigger, repath the threat, then return to search or idle without stranded loops.', ['pathfinding', 'humanoid'], ['Define idle, investigate, chase and recovery transitions.', 'Repath on blockage or meaningful target movement at a bounded cadence.', 'End pursuit on escape, death, target loss or timeout and clean its tasks.'], ['Lose line of sight, leave the zone and die during pursuit.', 'A second pursuit starts with exactly one active path loop.'], ['The threat chases a departed player forever.', 'ComputeAsync runs every frame during chase.'], ['chase', 'monster']),
  genreTask('horror', 'jumpscare-cooldown', 'Gate a jumpscare by state, distance and cooldown', 'Treat a jumpscare as a bounded presentation event that cannot fire repeatedly from limb touches or remote spam.', ['worldRoot', 'securityTactics'], ['Resolve trigger eligibility on the server.', 'Record per-player event state and cooldown before presentation begins.', 'Play client camera, UI and audio as one cancellable presentation.'], ['Stand in the trigger, re-enter quickly and trigger with several limbs.', 'Respawn or leave during presentation and confirm camera and input restore.'], ['Touched fires the sequence many times.', 'The scare camera remains active after death.'], ['jumpscare', 'cooldown']),
  genreTask('horror', 'key-door-objective-chain', 'Build an ordered key-and-door objective chain', 'Represent keys and doors by stable ids so discovery, unlock and save state cannot be skipped or duplicated.', ['saveData', 'proximity'], ['Define required item ids and door state on the server.', 'Let the prompt request an unlock without sending ownership claims.', 'Consume or retain the key according to the explicit objective rule.'], ['Attempt the door without, with and after using the key.', 'Reconnect after each state and confirm the intended persistence.'], ['The client sets the door unlocked locally.', 'A duplicate request consumes two keys.'], ['key', 'door', 'objective']),
  genreTask('horror', 'death-retry-reset', 'Reset horror state for a fair retry', 'Return the player to a known checkpoint while clearing pursuit, temporary cues and one-run objective state deliberately.', ['humanoid', 'saveData'], ['Classify state as persistent, checkpointed or run-local.', 'Stop threat loops and transient effects before respawn.', 'Restore the checkpoint snapshot, then re-enable input and prompts.'], ['Die during every objective phase and during a scare.', 'No prior threat, sound loop or prompt remains active after retry.'], ['All progress is wiped because state classes were never named.', 'Old chase tasks continue against the new character.'], ['death', 'retry']),
  genreTask('horror', 'escape-landmark-readability', 'Use low-poly landmarks to make escape learnable', 'Give each route branch a distinct silhouette and limited material cue so players can build a mental map under pressure.', ['parts', 'materials'], ['Assign one silhouette landmark to each important junction.', 'Keep the landmark visible from the approach at chase speed.', 'Repeat its material cue only on destinations that share meaning.'], ['A tester can describe the return route after one pass.', 'Landmarks remain readable with textures disabled or low quality.'], ['Repeated corridors are indistinguishable.', 'Tiny texture detail carries the only navigation cue.'], ['landmark', 'low poly']),

  // Obby.
  genreTask('obby', 'ordered-checkpoint-chain', 'Advance obby checkpoints only in order', 'Keep one authoritative stage and accept only the immediately next checkpoint unless the design explicitly allows branches.', ['saveData', 'humanoid'], ['Number checkpoints by authored id rather than Workspace order.', 'Debounce contact per character and reject earlier or skipped stages.', 'Resolve respawn from the accepted stage.'], ['Touch with several limbs, walk backward and attempt a skipped pad.', 'Rejoin and respawn at the last accepted stage.'], ['A single touch awards the same stage repeatedly.', 'Workspace child order becomes progression order.'], ['checkpoint', 'stage']),
  genreTask('obby', 'hazard-telegraph', 'Telegraph an obby hazard before it becomes lethal', 'Pair every timed or moving hazard with a readable pre-state and consistent safe window.', ['tween', 'humanoid'], ['Define safe, warning and active states on one server-owned cycle.', 'Use color, motion or sound redundantly during warning.', 'Apply damage only in the active state with per-character debounce.'], ['Cross at each boundary time and under latency.', 'The warning remains legible without relying on color alone.'], ['Visual animation and damage timing disagree.', 'Touched applies damage many times per contact.'], ['hazard', 'telegraph']),
  genreTask('obby', 'moving-platform-cycle', 'Run a deterministic moving-platform cycle', 'Move a platform on a repeatable path with explicit dwell times and safe character interaction.', ['tween', 'physicsAssemblies'], ['Author endpoints and dwell durations as data.', 'Move one assembly root rather than fighting welded children.', 'Reset to a known phase on round restart.'], ['Ride from every edge and jump during motion.', 'Restart repeatedly and compare the phase and endpoint.'], ['Client and server animate different platform positions.', 'Several loops start on the same platform.'], ['moving platform', 'cycle']),
  genreTask('obby', 'respawn-camera-framing', 'Frame an obby respawn toward the next challenge', 'Restore the character and camera so the next route is visible without disorienting spin or hidden hazards.', ['camera', 'humanoid'], ['Choose spawn orientation from checkpoint metadata.', 'Wait for the new character and camera subject.', 'Blend or cut to a view that reveals the next safe landing.'], ['Respawn at each stage with keys, touch and gamepad.', 'Repeated deaths leave one active camera controller.'], ['Camera points back at the completed route.', 'A stale character remains the camera subject.'], ['respawn', 'camera']),
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
  genreTask('roleplay', 'state-aware-world-prompts', 'Use state-aware prompts for roleplay interactions', 'Show concise actions on doors, furniture and NPCs while rechecking distance, ownership and state on the server.', ['proximity', 'clientBoundary'], ['Name one action and eligibility rule per prompt.', 'Enable broad visibility locally but validate consequence on the server.', 'Update text and enabled state when ownership or role changes.'], ['Trigger while moving away, changing role and losing ownership.', 'Test keys, gamepad and touch.'], ['Visible prompt is treated as permission.', 'Several prompts overlap with the same key and unclear outcome.'], ['prompt', 'interaction']),
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
  genreTask('anime_battle', 'semantic-ability-actions', 'Map anime battle abilities to semantic actions', 'Bind a small action set across keys, touch and gamepad while gating it by combat state.', ['inputActions', 'inputMobile'], ['Define Light, Ability1-4, Dash and Ultimate as actions.', 'Bind device-specific controls and current glyphs.', 'Disable or queue actions according to server combat state.'], ['Complete one combo and cancel on every device.', 'Switch device during cooldown and retain action identity.'], ['Raw key checks diverge between controllers.', 'Disabled actions still fire hidden remotes.'], ['ability', 'controls']),
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

  // Adventure: the world is the reward, so every system serves a player walking toward a landmark.
  genreTask('adventure', 'landmark-route-blockout', 'Block out an adventure route toward a visible landmark', 'Place one large landmark per zone first and bend the walkable path toward it so the next goal is always in view.', ['parts', 'worldRoot'], ['Place the zone landmark before any other geometry.', 'Walk the route from the entrance and bend it so the landmark stays in view.', 'Mark the zone exit with a chokepoint such as a bridge, gate or cave mouth.'], ['From every zone entrance the landmark is visible without turning the camera around.', 'A first-time tester reaches the landmark without a waypoint arrow.'], ['The landmark is hidden behind props placed later.', 'Straight corridors make every zone read the same.'], ['landmark', 'route', 'exploration']),
  genreTask('adventure', 'quest-step-state', 'Advance adventure quest steps from server-owned state', 'Store each quest as an ordered list of step ids on the server so completion cannot be skipped, repeated or claimed by the client.', ['saveData', 'clientBoundary'], ['Define quest ids and ordered step ids in a server module.', 'Accept a step only when it is the current step and its condition is true on the server.', 'Persist the current step and send the objective text to the client.'], ['Firing the completion remote for a later step changes nothing.', 'Rejoining restores the same current step and objective text.'], ['The client decides a step is done and the server trusts it.', 'Two quests share a step id and complete each other.'], ['quest', 'objective']),
  genreTask('adventure', 'treasure-chest-loot', 'Open an adventure treasure chest exactly once per player', 'Open a chest through a named prompt, roll loot on the server and record the chest as opened so it cannot pay twice.', ['proximity', 'securityTactics'], ['Give each chest a stable id and a ProximityPrompt with action and object text.', 'Validate distance and opened state on the server before rolling loot.', 'Record the opened chest in player data and play the lid tween for everyone.'], ['Triggering the prompt twice quickly grants one reward.', 'An opened chest stays opened after rejoining.'], ['Loot is rolled on the client.', 'The opened flag is saved only after the reward, so a crash duplicates loot.'], ['treasure', 'chest', 'loot']),
  genreTask('adventure', 'npc-dialogue-branch', 'Run adventure NPC dialogue that can start a quest', 'Show a short branching conversation from a server-owned script and start quests only from a server-validated choice.', ['uiScreen', 'remotes'], ['Author dialogue nodes with stable ids and at most three choices each.', 'Send the current node to the client and accept only choices listed for that node.', 'Start or advance the quest on the server when the chosen node says so.'], ['A choice id not offered by the current node is rejected.', 'Walking away closes the dialogue and leaves quest state unchanged.'], ['The client sends a quest id directly.', 'Dialogue text is built from player-supplied strings.'], ['npc', 'dialogue']),
  genreTask('adventure', 'zone-gate-progression', 'Gate adventure zones behind earned progress', 'Open the next zone only when the server confirms the required quest step, key or level, and explain the lock in plain words.', ['worldRoot', 'accessControl'], ['Give each gate a requirement read from server data.', 'Check the requirement on the server when the player approaches or interacts.', 'Show what is missing in one short sentence when the gate stays closed.'], ['A player without the key cannot pass by jumping or clipping around the gate.', 'The lock message names the missing requirement.'], ['The gate is only a visual door with no server check.', 'A locked gate gives no reason, so players think the game is broken.'], ['gate', 'progression', 'zone']),
  genreTask('adventure', 'collectible-glint-cue', 'Signal adventure collectibles with a glint instead of a marker', 'Draw the eye to hidden collectibles with a small sparkle and colour cue so exploration is rewarded without a waypoint arrow.', ['particles', 'lighting'], ['Attach a small looping sparkle emitter to each collectible.', 'Use the kit highlight colour on collectibles and nowhere else in the zone.', 'Stop the emitter and hide the item on the server when it is collected.'], ['From ten studs away a tester spots the collectible without being told.', 'A collected item stops sparkling for that player after rejoining.'], ['Every prop sparkles, so the cue means nothing.', 'The sparkle keeps playing on an item that is already collected.'], ['collectible', 'sparkle']),
  genreTask('adventure', 'light-combat-encounter', 'Place a light adventure combat encounter on the route', 'Put small enemy groups at route turns, resolve hits on the server and reset the encounter when the player leaves.', ['humanoid', 'pathfinding'], ['Spawn a small enemy group at a route turn, not on the path itself.', 'Resolve damage on the server with range and cooldown checks.', 'Despawn and reset the group when no player is nearby.'], ['An enemy group never blocks the only path permanently.', 'Leaving and returning resets the encounter to its start state.'], ['Enemies chase forever and pile up at spawn.', 'Client-reported hits deal damage without validation.'], ['combat', 'enemy', 'encounter']),
  genreTask('adventure', 'zone-streaming-budget', 'Stream adventure zones within a phone budget', 'Keep each zone inside a measured part and memory budget and let streaming load the next zone as the player approaches the chokepoint.', ['streaming', 'perfDesign'], ['Enable streaming and set a target radius that covers one zone.', 'Keep the landmark as a persistent model so it stays visible at distance.', 'Measure memory and frame time at the busiest point of each zone.'], ['The next landmark is visible before its zone streams in.', 'The busiest zone holds frame rate on a phone-class device.'], ['The landmark streams out and the player loses the goal.', 'Dense foliage in one zone blows the memory budget.'], ['streaming', 'performance']),
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
  adventure: ['dialogue', 'zones'],
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
  adventure: ['The next landmark is visible from every zone entrance and the route bends toward it.', 'Quest steps, chest loot and zone gates are server-owned and cannot pay or open twice.'],
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
// returns the top hit in 711 characters. 800 left headroom for a longer title or genre list, and
// the eleventh genre (adventure) used it up: a hit that applies to every genre lists all of them,
// and the top hit for this query then needed ~810. 900 restores the headroom.
export const MIN_SEARCH_CHARS = 900;
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
