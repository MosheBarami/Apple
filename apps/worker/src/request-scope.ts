/**
 * A REQUEST ABOUT THE LIGHT CHANGES THE LIGHT (2026-09-23, F-036).
 *
 * "make the lighting warmer, like the sun is going down" — asked twice on the sky island — cost 132 and
 * then 206 Credits and 7-8 minutes each, because the run also resized trees and added logs, stumps,
 * bushes, boulders and a path. A prompt rule saying "change only what was asked" was ignored. So a
 * request that is only about lighting gets a run whose changes are limited to Lighting.
 */

const LIGHT_WORDS =
  /\b(light|lights|lighting|lit|sun|sunny|sunset|sunrise|dusk|dawn|golden hour|dark|darker|bright|brighter|mood|moody|moodier|atmosphere|atmospheric|fog|foggy|haze|hazy|warm|warmer|cool|cooler|cold|colder|night|nighttime|daytime|time of day|glow|glowy|bloom|shadows?)\b/i;
/** Anything that asks for objects, code or layout to change is not a lighting-only request. */
const OTHER_WORK =
  /\b(add|adds|build|create|place|put|spawn|remove|delete|move|resize|scale|script|code|gui|ui|button|shop|coin|tree|trees|rock|rocks|house|part|parts|model|terrain|water|waterfall|island|crystal|crystals|npc|enemy|game|level|map|make (a|an|some|me)\b)/i;

export function isLightingOnlyRequest(text: string): boolean {
  return LIGHT_WORDS.test(text) && !OTHER_WORK.test(text);
}

const LIGHTING_PATH = /^(game\.)?Lighting(\.|$)/;
const LIGHTING_TOOLS = new Set(['set_mood', 'add_effect', 'remove_effect']);

/** Whether a project-changing call stays inside Lighting. */
export function staysInLighting(tool: string, argsJson: string | undefined): boolean {
  if (LIGHTING_TOOLS.has(tool)) return true;
  let a: Record<string, unknown>;
  try { a = JSON.parse(argsJson || '{}') as Record<string, unknown>; } catch { return false; }
  if (tool === 'set_properties') return typeof a.path === 'string' && LIGHTING_PATH.test(a.path);
  if (tool === 'delete_instances') return Array.isArray(a.paths) && a.paths.length > 0 && a.paths.every((p) => typeof p === 'string' && LIGHTING_PATH.test(p));
  if (tool === 'create_instances') {
    return Array.isArray(a.items) && a.items.length > 0
      && a.items.every((i) => i && typeof i === 'object' && typeof (i as Record<string, unknown>).parent === 'string' && LIGHTING_PATH.test((i as Record<string, unknown>).parent as string));
  }
  return false;
}

/**
 * A request to recreate an uploaded owner game (2026-09-29): in a fresh place, trusting an earlier
 * reply that said the game was recreated, the model planned a hand-built HUD instead. So until this
 * run has recreated it, changing the place any other way is refused.
 */
export function isOwnerRecreateRequest(text: string): boolean {
  return /\brecreat/i.test(text) && /\b(owner library|uploaded|my library)\b/i.test(text);
}

/** What a recreate request may call before the game is recreated. */
export function startsOwnerRecreate(tool: string): boolean {
  return tool === 'recreate_owner_game';
}

/**
 * A game built ONLY from owner library parts (2026-09-29): asked for a pet obby "only from parts of my uploaded
 * owner library games … do not generate parts", one run searched the Creator Store and then hand-built coloured
 * obby platforms. So such a request cannot create or insert content from anywhere but the library.
 */
export function isOwnerLibraryOnlyRequest(text: string): boolean {
  return /\b(owner library|uploaded|my library)\b/i.test(text)
    && /\b(only from|only use|do not generate|don'?t generate|not generated|never generate|no generated)\b/i.test(text);
}

const NOT_FROM_LIBRARY = new Set(['create_instances', 'edit_terrain', 'build_scene', 'run_luau', 'add_effect', 'install_module',
  'insert_asset', 'generate_model', 'insert_owner_component', 'insert_library_model', 'find_library_model', 'generate_model_external',
  'scatter_instances', 'shape_terrain', 'create_rig', 'build_ui', 'insert_sound', 'insert_vfx', 'insert_ui_component', 'design_sound',
  'assign_sounds']);

/** Whether a library-only run may call this tool: it may import, arrange, fix scripts and read, never make content. */
export function staysInOwnerLibrary(tool: string): boolean {
  return !NOT_FROM_LIBRARY.has(tool);
}
