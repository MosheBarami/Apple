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
