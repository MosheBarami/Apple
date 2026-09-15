// ============================================================================================
// Tool-argument grading.
//
// "The model called create_instance" is not the claim worth checking. Every wrong answer that
// gets past a `contains` check calls the right tool; what separates a working build from a
// broken one is whether `className` was a real class, whether `parent` was set at all, and
// whether a second, spurious call deleted something. So this grades ARGUMENTS, and it grades
// what the model did NOT call as well as what it did.
//
// The distinction this module is built around, and the reason it is not just a deepEqual:
//
//     actual === null   the run never captured tool calls        -> UNAVAILABLE, no score
//     actual === []     the run captured tool calls; there were none -> score 0, a real finding
//
// Those two are the same JSON shape away from each other and they mean opposite things. Folding
// the first into the second is how a harness that stopped recording tool calls reports every
// model as having stopped making them.
// ============================================================================================

/** Argument matcher kinds a task may declare. Closed set: an unknown key is a load error. */
export const ARG_MATCHERS = Object.freeze(['equals', 'matches', 'type', 'oneOf', 'present']);

const TYPES = Object.freeze(['string', 'number', 'boolean', 'object', 'array', 'null']);

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== 'object') return false;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

/**
 * Validate one expectation spec. Returns a list of error strings (empty = valid).
 * Called by tasks.mjs at LOAD time: a misspelled matcher is otherwise the cheapest possible way
 * to write a tool check that can never fail, which is the defect this repository keeps finding.
 */
export function validateExpectTools(expect, where = 'expectTools') {
  const errs = [];
  if (!Array.isArray(expect) || expect.length === 0) return [`${where}: must be a non-empty array`];
  expect.forEach((spec, i) => {
    const w = `${where}[${i}]`;
    if (!spec || typeof spec !== 'object') {
      errs.push(`${w}: must be an object`);
      return;
    }
    if (typeof spec.name !== 'string' || !spec.name) errs.push(`${w}: missing tool name`);
    if (spec.required != null && (!Array.isArray(spec.required) || spec.required.some((k) => typeof k !== 'string')))
      errs.push(`${w}: required must be an array of argument names`);
    if (spec.args != null) {
      if (typeof spec.args !== 'object' || Array.isArray(spec.args)) errs.push(`${w}: args must be an object`);
      else
        for (const [k, matcher] of Object.entries(spec.args)) {
          if (matcher === null || typeof matcher !== 'object' || Array.isArray(matcher)) continue; // literal
          const keys = Object.keys(matcher);
          const unknown = keys.filter((key) => !ARG_MATCHERS.includes(key) && key !== 'flags');
          if (unknown.length) errs.push(`${w}.args.${k}: unknown matcher(s) ${unknown.join(', ')} (allowed: ${ARG_MATCHERS.join(', ')})`);
          if (matcher.type != null && !TYPES.includes(matcher.type)) errs.push(`${w}.args.${k}: unknown type "${matcher.type}"`);
          if (matcher.oneOf != null && (!Array.isArray(matcher.oneOf) || matcher.oneOf.length === 0)) errs.push(`${w}.args.${k}: oneOf must be a non-empty array`);
          if (matcher.matches != null) {
            if (typeof matcher.matches !== 'string') errs.push(`${w}.args.${k}: matches must be a regex string`);
            else
              try {
                new RegExp(matcher.matches, matcher.flags ?? '');
              } catch (e) {
                errs.push(`${w}.args.${k}: invalid regex: ${e.message}`);
              }
          }
        }
    }
  });
  return errs;
}

/** Test one argument value against one matcher. @returns {{ok: boolean, why: string}} */
export function matchArg(matcher, value, present) {
  if (matcher === null || typeof matcher !== 'object' || Array.isArray(matcher)) {
    if (!present) return { ok: false, why: `absent (expected ${JSON.stringify(matcher)})` };
    return deepEqual(matcher, value) ? { ok: true, why: 'equals' } : { ok: false, why: `got ${JSON.stringify(value)}, expected ${JSON.stringify(matcher)}` };
  }
  if (matcher.present === true && !present) return { ok: false, why: 'absent' };
  if (matcher.present === true && present && Object.keys(matcher).length === 1) return { ok: true, why: 'present' };
  if (!present) return { ok: false, why: 'absent' };
  if (matcher.equals !== undefined && !deepEqual(matcher.equals, value)) return { ok: false, why: `got ${JSON.stringify(value)}, expected ${JSON.stringify(matcher.equals)}` };
  if (matcher.type != null && typeOf(value) !== matcher.type) return { ok: false, why: `type ${typeOf(value)}, expected ${matcher.type}` };
  if (matcher.oneOf != null && !matcher.oneOf.some((c) => deepEqual(c, value))) return { ok: false, why: `got ${JSON.stringify(value)}, expected one of ${JSON.stringify(matcher.oneOf)}` };
  if (matcher.matches != null) {
    if (typeof value !== 'string') return { ok: false, why: `matches needs a string, got ${typeOf(value)}` };
    if (!new RegExp(matcher.matches, matcher.flags ?? '').test(value)) return { ok: false, why: `${JSON.stringify(value)} does not match /${matcher.matches}/` };
  }
  return { ok: true, why: 'ok' };
}

function argsOf(call) {
  const a = call?.args ?? call?.arguments ?? call?.input;
  return a && typeof a === 'object' && !Array.isArray(a) ? a : {};
}

/**
 * Grade a model's tool calls against a task's expectations.
 *
 * @param {object[]} expect  the task's `expectTools`
 * @param {object[]|null|undefined} actual  recorded tool calls; null/undefined = never recorded
 * @param {{strict?: boolean}} [opts] strict (default true) counts an unexpected call against the score
 * @returns {{available: boolean, reason?: string, score?: number, satisfied?: number, possible?: number,
 *           findings?: object[], matched?: object[]}}
 */
export function gradeToolCalls(expect, actual, opts = {}) {
  const strict = opts.strict !== false;
  if (!Array.isArray(expect) || expect.length === 0) return { available: false, reason: 'no_tool_expectations' };
  // NOT an empty array: `null` is "the harness never looked". See the header.
  if (actual == null) return { available: false, reason: 'no_tool_calls_recorded' };
  if (!Array.isArray(actual)) return { available: false, reason: 'malformed_tool_calls' };

  const remaining = actual.map((c, i) => ({ i, call: c, used: false }));
  const findings = [];
  const matched = [];
  let satisfied = 0;
  let possible = 0;

  for (const spec of expect) {
    possible += 1; // the call itself
    const constraints = Object.entries(spec.args ?? {});
    const required = spec.required ?? [];
    possible += constraints.length + required.length;

    const hit = remaining.find((r) => !r.used && String(r.call?.name ?? r.call?.tool ?? '') === spec.name);
    if (!hit) {
      findings.push({ kind: 'missing_call', tool: spec.name, why: 'the model never called it' });
      continue;
    }
    hit.used = true;
    satisfied += 1;
    const args = argsOf(hit.call);
    for (const key of required) {
      if (Object.prototype.hasOwnProperty.call(args, key) && args[key] !== undefined) satisfied += 1;
      else findings.push({ kind: 'missing_arg', tool: spec.name, arg: key, why: 'required argument absent' });
    }
    for (const [key, matcher] of constraints) {
      const present = Object.prototype.hasOwnProperty.call(args, key) && args[key] !== undefined;
      const r = matchArg(matcher, args[key], present);
      if (r.ok) satisfied += 1;
      else findings.push({ kind: 'bad_arg', tool: spec.name, arg: key, why: r.why });
    }
    matched.push({ tool: spec.name, index: hit.i });
  }

  const extras = remaining.filter((r) => !r.used);
  for (const e of extras) {
    const name = String(e.call?.name ?? e.call?.tool ?? '(unnamed)');
    findings.push({ kind: 'unexpected_call', tool: name, why: 'not in the task expectations' });
  }
  // An unexpected call is one more thing that could have been right and was not, so it enters the
  // denominator. Without this, a model that calls every tool it can think of scores 1.0 for having
  // included the right one somewhere in the pile.
  const denominator = possible + (strict ? extras.length : 0);
  return {
    available: true,
    score: denominator > 0 ? satisfied / denominator : 0,
    satisfied,
    possible: denominator,
    findings,
    matched,
  };
}
