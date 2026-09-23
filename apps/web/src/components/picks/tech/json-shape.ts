/**
 * THE SHAPE OF A DATA FILE — what the AI Elements `schema-display` pick draws.
 *
 * Upstream shows an API endpoint's request and response bodies as a tree of typed properties. The
 * data Apple keeps in a project's files is JSON it wrote itself (settings, tables, generated lists),
 * and the question a curious user has about one is the same: what fields are in here, and what
 * kind of value is each. This reads that out of the parsed value. It describes; it never validates.
 */

export interface SchemaProperty {
  name: string;
  /** `string`, `number`, `true/false`, `empty`, `object`, `list of …`. Plain words. */
  type: string;
  properties?: SchemaProperty[];
  /** Only for a list: how many items it holds. */
  count?: number;
}

/** Nested objects deeper than this are summarised by their type alone. */
const MAX_DEPTH = 6;
/** Keys per object beyond which the rest are not listed. */
const MAX_KEYS = 60;

function typeWord(value: unknown): string {
  if (value === null) return 'empty';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'boolean') return 'true/false';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

function describe(name: string, value: unknown, depth: number): SchemaProperty {
  if (Array.isArray(value)) {
    const kinds = [...new Set(value.map(typeWord))];
    const first = value.find((v) => v !== null && typeof v === 'object' && !Array.isArray(v));
    const item = kinds.length === 0 ? 'nothing yet' : kinds.length === 1 ? kinds[0] : 'mixed';
    const prop: SchemaProperty = { name, type: `list of ${item}`, count: value.length };
    if (first !== undefined && depth < MAX_DEPTH) prop.properties = objectProps(first, depth + 1);
    return prop;
  }
  if (value !== null && typeof value === 'object') {
    return { name, type: 'object', properties: depth < MAX_DEPTH ? objectProps(value, depth + 1) : undefined };
  }
  return { name, type: typeWord(value) };
}

function objectProps(value: object, depth: number): SchemaProperty[] {
  return Object.entries(value).slice(0, MAX_KEYS).map(([k, v]) => describe(k, v, depth));
}

/** The shape of a JSON text, or null when it does not parse — the panel then shows no shape at all. */
export function jsonShape(text: string): SchemaProperty | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return describe('file', value, 0);
}
