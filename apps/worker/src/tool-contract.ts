// A TYPED CONTRACT FOR A TOOL'S ARGUMENTS, CHECKED AT RUNTIME.
//
// Every tool in tools.ts declares its parameters as a hand-written JSON-schema literal through
// `S({...})` and then reads them back with casts: `String(a.path ?? '')`, `(a.maxDepth as number)
// ?? 4`. That is fine for the Studio tools, because the Studio op on the far side re-validates
// everything and a bad path comes back as a refusal from Luau.
//
// It is NOT fine for a tool that reaches the network or a file store. There the argument IS the
// action: a `url` the model half-invented becomes an outbound request, and a `maxBytes` of NaN
// becomes a comparison that is false for every value it is ever given. This file is the layer that
// makes the schema a runtime promise instead of a description.
//
// THREE RULES IT EXISTS TO ENFORCE, each one a shape this repository has been bitten by:
//
//   1. `??` DEFENDS undefined AND null AND NOTHING ELSE. `(a.width as number) ?? 1024` accepts the
//      string "1024", accepts NaN, accepts Infinity — and every later `width > 0` comparison
//      against NaN is false, so the guard reads as "the value was fine" when in fact nothing was
//      measured. A number here must be `typeof 'number'` AND `Number.isFinite`.
//
//   2. A `Record<Union, T>` IS A COMPILE-TIME PROMISE. An `enum` is checked against an explicit
//      list at runtime, never by indexing a table with whatever arrived — `args.mode` of
//      `"__proto__"` would otherwise find `Object.prototype` and report a hit.
//
//   3. AN UNKNOWN KEY IS AN ERROR, NOT A NO-OP. A model that passes `{ uri: "..." }` to a tool
//      whose argument is `url` has misunderstood the tool. Silently dropping the key runs the
//      tool with no url at all, which fails somewhere further down with a worse message — or, for
//      a tool with defaults everywhere, succeeds at doing the wrong thing.
//
// The validator returns EVERY error rather than the first. A model that learns about one mistake
// per turn spends one whole inference step per mistake.

/** The argument kinds a web-facing tool actually needs. Deliberately small. */
export type ArgType = 'string' | 'number' | 'integer' | 'boolean' | 'string[]';

export interface ArgSpec {
  type: ArgType;
  /** Shown to the model. Required, because an undocumented argument is an argument nobody uses. */
  description: string;
  required?: boolean;
  /** Allowed values for a string. Checked against this array, never by table lookup. */
  enum?: readonly string[];
  /** Numbers: inclusive value bounds. Strings and arrays: inclusive length bounds. */
  min?: number;
  max?: number;
  /** Extra shape for a string, e.g. a repo's `owner/name`. */
  pattern?: RegExp;
  /** Per-element length cap for `string[]`. */
  itemMax?: number;
  /** A string that may legitimately contain newlines and tabs — file content, and little else. */
  multiline?: boolean;
  /** Used when the key is absent (or explicitly null on an optional argument). */
  default?: string | number | boolean | readonly string[];
}

export interface ToolContract {
  name: string;
  description: string;
  args: Record<string, ArgSpec>;
}

export type ValidatedArgs =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; errors: string[] };

/**
 * Keys that must never be accepted, whatever a contract says.
 *
 * The validator builds its output with a null prototype so an assignment could not pollute
 * anything, but refusing them is still the right answer rather than quietly dropping them: an
 * argument named `__proto__` is not a typo, and the tool should say so.
 */
const FORBIDDEN_KEYS = ['__proto__', 'prototype', 'constructor'];

/** The largest argument blob we will even look at. A megabyte of "arguments" is not a call. */
export const MAX_ARGS_CHARS = 64_000;

function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function checkString(key: string, spec: ArgSpec, raw: unknown, errors: string[]): unknown {
  if (typeof raw !== 'string') {
    errors.push(`${key} must be a string, got ${typeName(raw)}`);
    return undefined;
  }
  const min = Number.isFinite(spec.min) ? (spec.min as number) : 1;
  const max = Number.isFinite(spec.max) ? (spec.max as number) : 4000;
  if (raw.length < min) errors.push(`${key} must be at least ${min} characters, got ${raw.length}`);
  if (raw.length > max) errors.push(`${key} must be at most ${max} characters, got ${raw.length}`);
  // A control character in a string argument is either an encoding accident or an attempt to
  // smuggle a newline into something line-oriented (a header, a git ref, a path). `multiline`
  // opts an argument out — file CONTENT is the one place newlines and tabs are the point.
  const badControl = spec.multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (badControl.test(raw)) {
    errors.push(`${key} contains a control character`);
  }
  if (spec.enum) {
    // Explicit membership, never `spec.enum[raw]`-style lookup.
    if (!spec.enum.some((allowed) => allowed === raw)) {
      errors.push(`${key} must be one of: ${spec.enum.join(', ')} (got ${JSON.stringify(raw)})`);
    }
  }
  if (spec.pattern && !spec.pattern.test(raw)) {
    errors.push(`${key} is not in the expected form`);
  }
  return raw;
}

function checkNumber(key: string, spec: ArgSpec, raw: unknown, errors: string[]): unknown {
  // THE WHOLE POINT OF THIS FUNCTION. Not `Number(raw)`, which turns "" into 0 and "12px" into
  // NaN, and not `typeof raw === 'number'` alone, which admits NaN and Infinity.
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    errors.push(`${key} must be a finite number, got ${typeName(raw) === 'number' ? String(raw) : typeName(raw)}`);
    return undefined;
  }
  if (spec.type === 'integer' && !Number.isInteger(raw)) {
    errors.push(`${key} must be a whole number, got ${raw}`);
    return undefined;
  }
  if (Number.isFinite(spec.min) && raw < (spec.min as number)) errors.push(`${key} must be >= ${spec.min}, got ${raw}`);
  if (Number.isFinite(spec.max) && raw > (spec.max as number)) errors.push(`${key} must be <= ${spec.max}, got ${raw}`);
  return raw;
}

function checkStringArray(key: string, spec: ArgSpec, raw: unknown, errors: string[]): unknown {
  if (!Array.isArray(raw)) {
    errors.push(`${key} must be an array of strings, got ${typeName(raw)}`);
    return undefined;
  }
  const min = Number.isFinite(spec.min) ? (spec.min as number) : 0;
  const max = Number.isFinite(spec.max) ? (spec.max as number) : 50;
  if (raw.length < min) errors.push(`${key} must have at least ${min} entries, got ${raw.length}`);
  if (raw.length > max) errors.push(`${key} must have at most ${max} entries, got ${raw.length}`);
  const itemMax = Number.isFinite(spec.itemMax) ? (spec.itemMax as number) : 400;
  // Counted BEFORE this argument's own checks. Reading the shared `errors.length` instead would
  // discard a perfectly good array because some OTHER argument was wrong — the sort of coupling
  // that turns one bad field into a second, invented complaint.
  const before = errors.length;
  raw.forEach((item, i) => {
    if (typeof item !== 'string') errors.push(`${key}[${i}] must be a string, got ${typeName(item)}`);
    else if (item.length > itemMax) errors.push(`${key}[${i}] must be at most ${itemMax} characters`);
  });
  return errors.length > before ? undefined : raw;
}

/**
 * Check a raw argument object against a contract.
 *
 * `raw` is whatever came out of `JSON.parse` on the model's tool call, so it is `unknown` in the
 * strongest sense: it may be an array, a string, a number, or an object with keys nobody declared.
 */
export function validateArgs(contract: ToolContract, raw: unknown): ValidatedArgs {
  const errors: string[] = [];
  if (raw === undefined || raw === null) raw = {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: [`arguments must be a JSON object, got ${typeName(raw)}`] };
  }

  const given = raw as Record<string, unknown>;
  const declared = Object.keys(contract.args);

  for (const key of Object.keys(given)) {
    if (FORBIDDEN_KEYS.includes(key)) {
      errors.push(`${key} is not an argument name`);
      continue;
    }
    if (!declared.includes(key)) {
      errors.push(`unknown argument ${key}; ${contract.name} takes: ${declared.join(', ') || '(none)'}`);
    }
  }

  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, spec] of Object.entries(contract.args)) {
    // `null` is what a model emits for "I am not passing this". For an optional argument that is
    // the same as absent; for a required one it is a missing argument, and it is named as such.
    const present = Object.prototype.hasOwnProperty.call(given, key) && given[key] !== null && given[key] !== undefined;
    if (!present) {
      if (spec.required) {
        errors.push(`${key} is required`);
      } else if (spec.default !== undefined) {
        out[key] = spec.default;
      }
      continue;
    }
    const value = given[key];
    let checked: unknown;
    if (spec.type === 'string') checked = checkString(key, spec, value, errors);
    else if (spec.type === 'number' || spec.type === 'integer') checked = checkNumber(key, spec, value, errors);
    else if (spec.type === 'boolean') {
      if (typeof value !== 'boolean') errors.push(`${key} must be true or false, got ${typeName(value)}`);
      else checked = value;
    } else checked = checkStringArray(key, spec, value, errors);
    if (checked !== undefined) out[key] = checked;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, args: out };
}

/**
 * The contract as the JSON schema the gateway sends to the model.
 *
 * Derived, never written twice. The bug this avoids is the ordinary one: a schema that advertises
 * `maxBytes` while the validator calls it `max_bytes`, so every call is rejected for passing an
 * unknown argument it was told to pass.
 */
export function contractParameters(contract: ToolContract): unknown {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, spec] of Object.entries(contract.args)) {
    const jsonType = spec.type === 'string[]' ? 'array' : spec.type === 'integer' ? 'integer' : spec.type;
    const prop: Record<string, unknown> = { type: jsonType, description: spec.description };
    if (spec.enum) prop.enum = [...spec.enum];
    if (spec.type === 'string[]') prop.items = { type: 'string' };
    if ((spec.type === 'number' || spec.type === 'integer') && Number.isFinite(spec.min)) prop.minimum = spec.min;
    if ((spec.type === 'number' || spec.type === 'integer') && Number.isFinite(spec.max)) prop.maximum = spec.max;
    if (spec.default !== undefined) prop.default = spec.default;
    properties[key] = prop;
    if (spec.required) required.push(key);
  }
  return { type: 'object', properties, required };
}

/** One line a model can act on, rather than a stack of them it will re-read badly. */
export function errorsToMessage(contract: ToolContract, errors: string[]): string {
  return `${contract.name}: ${errors.join('; ')}`;
}
