/**
 * The file add_behaviour writes into a model: a ModuleScript named AppleBehaviours that the AppleBehave runtime reads
 * (packages/components/behave). It is DATA written as a Luau table, so a person can read and edit it, and it carries the same
 * records as one line of JSON in a marker comment so the next add_behaviour call can add to it without parsing Luau.
 *
 * The marker is trusted for nothing: every record read back goes through the same validation as a new one. And the Luau body
 * is compared with what the marker would render, so a hand edit is DETECTED (`edited`) rather than silently overwritten.
 */
import { luau } from './compose';

export const BEHAVIOUR_MODULE = 'AppleBehaviours';
export const CONFIG_VERSION = 1;
const MARKER = '-- apple:behaviours/1 ';

export type BehaviourRecord = Record<string, unknown> & { id: string; verb: string };

function body(records: readonly BehaviourRecord[]): string {
  return `return ${luau({ v: CONFIG_VERSION, behaviours: records })}\n`;
}

/** The whole source of the module for these records. */
export function renderConfigSource(modelName: string, records: readonly BehaviourRecord[]): string {
  const name = modelName.replace(/[\r\n]/g, ' ').slice(0, 80);
  return (
    `-- What the parts of ${name} do, and when. Written by StudPilot (add_behaviour); AppleBehave in ServerScriptService reads it when the game runs.\n` +
    `-- Each behaviour is a verb (swing, slide, spin, bob, fade, light, sound, emit, bounce) done to a part when a trigger fires. Edit freely;\n` +
    `-- after a hand edit, add_behaviour will not merge into this file unless told to replace it.\n` +
    `${MARKER}${JSON.stringify(records)}\n` +
    body(records)
  );
}

/** The records in a module this file wrote, and whether its Luau body still says what they say. */
export function parseConfigSource(source: string): { records: BehaviourRecord[]; edited: boolean } | { error: string } {
  const at = source.indexOf(MARKER);
  if (at < 0) return { error: `${BEHAVIOUR_MODULE} has no marker line, so it was not written by add_behaviour` };
  const lineEnd = source.indexOf('\n', at);
  if (lineEnd < 0) return { error: `${BEHAVIOUR_MODULE} ends at its marker line` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.slice(at + MARKER.length, lineEnd));
  } catch {
    return { error: `${BEHAVIOUR_MODULE}'s marker line is not readable` };
  }
  if (!Array.isArray(parsed) || parsed.some((r) => !r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string' || typeof (r as { verb?: unknown }).verb !== 'string')) {
    return { error: `${BEHAVIOUR_MODULE}'s marker line does not hold a list of behaviours` };
  }
  const records = parsed as BehaviourRecord[];
  const edited = source.slice(lineEnd + 1).trimEnd() !== body(records).trimEnd();
  return { records, edited };
}
