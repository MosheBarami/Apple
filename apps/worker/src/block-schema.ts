/**
 * Validates a block's parameters against its schema, with defaults filled in. It covers exactly the keywords
 * scripts/gen-blocks.mjs lets a block use, so nothing a block declares is silently ignored. Errors are field-level
 * ("title: at most 40 characters") because plan-fill.ts hands them back to the model to correct. Pure.
 */
import type { BlockContract, ParamSchema } from './block-types.ts';
import { RAW_STYLE } from './studkit.ts';

function checkValue(path: string, schema: ParamSchema, v: unknown, errors: string[]): void {
  const fail = (msg: string): void => { errors.push(`${path}: ${msg}`); };
  switch (schema.type) {
    case 'string': if (typeof v !== 'string') return fail('must be text'); break;
    case 'boolean': if (typeof v !== 'boolean') return fail('must be true or false'); break;
    case 'number': if (typeof v !== 'number' || !Number.isFinite(v)) return fail('must be a number'); break;
    case 'integer': if (!Number.isInteger(v)) return fail('must be a whole number'); break;
    case 'array': if (!Array.isArray(v)) return fail('must be a list'); break;
    case 'object': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('must be an object');
      const o = v as Record<string, unknown>;
      const fields = schema.properties ?? {};
      for (const key of Object.keys(o)) if (!(key in fields)) fail(`has no field ${key} (it has ${Object.keys(fields).join(', ')})`);
      for (const key of schema.required ?? []) if (!(key in o)) fail(`needs ${key}`);
      for (const [key, sub] of Object.entries(fields)) if (key in o) checkValue(`${path}.${key}`, sub, o[key], errors);
      return;
    }
  }
  if (schema.enum && !schema.enum.some((e) => e === v)) fail(`must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  if (typeof v === 'number') {
    if (schema.minimum !== undefined && v < schema.minimum) fail(`must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && v > schema.maximum) fail(`must be at most ${schema.maximum}`);
  }
  if (typeof v === 'string') {
    // Bible §5: the model fills text, numbers and NAMES; a raw look value (a hex colour, a font, an asset id) never passes.
    if (RAW_STYLE.test(v.trim())) fail('is a raw style value; name a kit colour, icon or style instead');
    if (schema.minLength !== undefined && v.length < schema.minLength) fail(`must be at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && v.length > schema.maxLength) fail(`must be at most ${schema.maxLength} characters`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(v)) fail(`must match ${schema.pattern}`);
  }
  if (Array.isArray(v)) {
    if (schema.minItems !== undefined && v.length < schema.minItems) fail(`must have at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && v.length > schema.maxItems) fail(`must have at most ${schema.maxItems} items`);
    if (schema.items) v.forEach((item, i) => checkValue(`${path}[${i}]`, schema.items!, item, errors));
  }
}

export type ParamResult = { ok: true; params: Record<string, unknown> } | { ok: false; errors: string[] };

/** `given` with every missing parameter set to its default, or the field-level errors. Unknown fields are errors. */
export function validateParams(contract: BlockContract, given: unknown): ParamResult {
  if (given !== undefined && (given === null || typeof given !== 'object' || Array.isArray(given))) {
    return { ok: false, errors: [`${contract.id}: parameters must be an object`] };
  }
  const input = (given ?? {}) as Record<string, unknown>;
  const props = contract.params.properties;
  const errors: string[] = [];
  for (const key of Object.keys(input)) if (!(key in props)) errors.push(`${key}: ${contract.id} has no such parameter (it has ${Object.keys(props).join(', ') || 'none'})`);
  const params: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(props)) {
    const v = key in input ? input[key] : structuredClone(schema.default);
    checkValue(key, schema, v, errors);
    params[key] = v;
  }
  return errors.length ? { ok: false, errors } : { ok: true, params };
}
