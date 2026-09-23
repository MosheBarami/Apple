/**
 * WHICH ROBLOX STUDIO OBJECT ICON A ROW WEARS.
 *
 * The icons are Studio's own Explorer icons (assets/studio-icons/PROVENANCE.md): object and class
 * icons only, never the Roblox logo. They are packed into one sprite strip per theme, one 32px cell
 * per class, in the order of STUDIO_ICON_CLASSES — scripts/build-studio-icons.py reads that order
 * from this file, so the strip and the index below cannot disagree.
 *
 * A tool or an op gets a class icon only when it acts on that kind of object: `edit_script` is a
 * Script, `set_mood` is Lighting. A step that touches no object in the place (searching the docs,
 * reading the web, noting a fact) has NO class, and keeps its plain line icon — a Roblox object
 * beside "Searched the web" would be a claim about the place that is not true.
 */
import type { ToolName } from './ws/tool-vocabulary.ts';

/** Sprite order. Index 0 is the neutral icon an unknown class falls back to. */
export const STUDIO_ICON_CLASSES = [
  'Class',
  'Workspace', 'Part', 'Model', 'MeshPart', 'UnionOperation', 'WedgePart', 'TrussPart', 'SpawnLocation', 'Seat',
  'Script', 'LocalScript', 'ModuleScript', 'Folder', 'Configuration',
  'Sound', 'SoundService', 'SoundGroup', 'AudioTextToSpeech',
  'Lighting', 'Atmosphere', 'Sky', 'PointLight', 'SpotLight', 'ParticleEmitter', 'Fire', 'Smoke', 'Beam', 'Trail',
  'Camera', 'Terrain', 'Decal', 'Texture',
  'ScreenGui', 'SurfaceGui', 'BillboardGui', 'Frame', 'ScrollingFrame', 'TextLabel', 'TextButton', 'TextBox',
  'ImageLabel', 'ImageButton', 'UIListLayout', 'UICorner', 'UIStroke',
  'Humanoid', 'Players', 'Player', 'Tool', 'Team',
  'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPlayer', 'StarterPack',
  'RemoteEvent', 'RemoteFunction', 'BindableEvent',
  'Attachment', 'WeldConstraint', 'NoCollisionConstraint', 'ProximityPrompt', 'ClickDetector',
  'Place', 'Property', 'SelectionBox', 'TestService',
] as const;

export type StudioIconClass = (typeof STUDIO_ICON_CLASSES)[number];

/** The icon an unknown or missing class draws: Studio's own generic "a class" glyph. */
export const STUDIO_ICON_FALLBACK: StudioIconClass = 'Class';

const INDEX = new Map<string, number>(STUDIO_ICON_CLASSES.map((name, i) => [name, i]));

/** The sprite cell for a ClassName. Unknown, empty or missing -> 0, the neutral icon. */
export function studioIconIndex(className: string | null | undefined): number {
  return (className && INDEX.get(className)) || 0;
}

/** Tool -> the kind of object it acts on. Absent = the step touches no object in the place. */
export const TOOL_CLASS: Partial<Record<ToolName, StudioIconClass>> = {
  get_project_tree: 'Workspace',
  search_instances: 'Workspace',
  spatial_query: 'Workspace',
  audit_build: 'Workspace',
  build_scene: 'Workspace',
  inspect_model: 'Model',
  insert_asset: 'Model',
  find_verified_asset: 'Model',
  generate_model: 'Model',
  group_instances: 'Model',
  ungroup_instances: 'Model',
  scatter_instances: 'Model',
  generate_model_external: 'MeshPart',
  create_instances: 'Part',
  get_instance: 'Part',
  delete_instances: 'Part',
  transform_instances: 'Part',
  clone_instances: 'Part',
  rename_instance: 'Part',
  set_locked: 'Part',
  set_visible: 'Part',
  move_instances: 'Folder',
  set_properties: 'Property',
  set_properties_bulk: 'Property',
  get_selection: 'SelectionBox',
  select_instances: 'SelectionBox',
  list_scripts: 'Script',
  read_script: 'Script',
  search_scripts: 'Script',
  review_scripts: 'Script',
  find_symbol: 'Script',
  format_script: 'Script',
  edit_script: 'Script',
  run_luau: 'Script',
  install_module: 'ModuleScript',
  get_verified_module: 'ModuleScript',
  generate_sound: 'Sound',
  speak_line: 'AudioTextToSpeech',
  design_sound: 'SoundService',
  assign_sounds: 'SoundGroup',
  set_mood: 'Lighting',
  add_effect: 'Atmosphere',
  remove_effect: 'Atmosphere',
  render_view: 'Camera',
  compose_thumbnail: 'Camera',
  focus_camera: 'Camera',
  viewport_info: 'Camera',
  inspect_visually: 'Camera',
  check_composition: 'Camera',
  edit_terrain: 'Terrain',
  shape_terrain: 'Terrain',
  read_terrain: 'Terrain',
  generate_image: 'ImageLabel',
  generate_ui_image_hf: 'ImageLabel',
  build_ui: 'ScreenGui',
  check_ui_layout: 'ScreenGui',
  get_ui_construction: 'ScreenGui',
  play_check_ui: 'TextButton',
  create_rig: 'Humanoid',
  run_and_check: 'Player',
  play_check: 'Player',
  collision_groups: 'NoCollisionConstraint',
  run_spec: 'TestService',
  create_checkpoint: 'Place',
};

/** Studio op (the oplog's `kind`) -> the kind of object it acts on. Absent = no object. */
export const OP_CLASS: Record<string, StudioIconClass> = {
  get_tree: 'Workspace',
  project_census: 'Workspace',
  get_instance: 'Part',
  inspect_model: 'Model',
  list_scripts: 'Script',
  read_script: 'Script',
  dump_scripts: 'Script',
  search_scripts: 'Script',
  edit_script: 'Script',
  run_code: 'Script',
  get_selection: 'SelectionBox',
  select: 'SelectionBox',
  viewport_info: 'Camera',
  camera_focus: 'Camera',
  render_view: 'Camera',
  screenshot: 'Camera',
  create_instances: 'Part',
  delete_instances: 'Part',
  transform_instances: 'Part',
  clone_instances: 'Part',
  rename_instance: 'Part',
  set_locked: 'Part',
  set_visible: 'Part',
  set_props: 'Property',
  move_instances: 'Folder',
  group_instances: 'Model',
  ungroup_instances: 'Model',
  insert_asset: 'Model',
  generate_model: 'Model',
  terrain_edit: 'Terrain',
  snapshot: 'Place',
  restore: 'Place',
  run_mode: 'Player',
  play_check: 'Player',
};

export function classForTool(tool: string | null | undefined): StudioIconClass | null {
  if (!tool) return null;
  return (TOOL_CLASS as Record<string, StudioIconClass | undefined>)[tool] ?? null;
}

export function classForOp(kind: string | null | undefined): StudioIconClass | null {
  if (!kind) return null;
  return OP_CLASS[kind] ?? null;
}
