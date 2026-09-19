/**
 * Diagnostic-only probes for already-exposed development failures. NEVER training examples,
 * a replacement holdout, or an independent promotion benchmark. Original checks stay untouched.
 * Each case gets its own module/process; an exception cannot suppress the following case.
 */
export const DIAG_MISMATCH = 'APPLE-DIAG-MISMATCH actual=';

function probe(id, category, expression, expected, setup = '') {
  const literal = expected === null ? 'nil' : String(expected);
  return Object.freeze({ id, category, expression, expected, setup,
    checks: `${setup}\nlocal actual = ${expression}
local actualType = type(actual)
local label = "<" .. actualType .. ">"
if actualType == "number" or actualType == "boolean" or actualType == "nil" or actualType == "string" then
    label = string.sub(tostring(actual), 1, 120)
    label = string.gsub(label, "[\\r\\n\\t]", " ")
end
assert(actual == ${literal}, "${DIAG_MISMATCH}" .. label)`,
  });
}

const cases = new Map([
  ['weighted-selection', [
    probe('zero-ticket', 'selection', 'candidate({1, 2, 3}, 0)', 1),
    probe('fractional-ticket', 'numeric-domain', 'candidate({1, 2, 3}, 0.999)', 1),
    probe('first-boundary', 'half-open-boundary', 'candidate({1, 2, 3}, 1)', 2),
    probe('second-boundary', 'half-open-boundary', 'candidate({1, 2, 3}, 3)', 3),
    probe('zero-weight-buckets', 'half-open-boundary', 'candidate({0, 0, 2}, 0)', 3),
    probe('ticket-at-total', 'ticket-domain', 'candidate({1, 2, 3}, 6)', null),
    probe('negative-ticket', 'ticket-domain', 'candidate({1, 2, 3}, -0.01)', null),
    probe('fractional-weights', 'numeric-domain', 'candidate({0.5, 1.5}, 0.25)', 1),
    probe('fractional-weight-boundary', 'half-open-boundary', 'candidate({0.5, 1.5}, 0.5)', 2),
    probe('large-finite-weight', 'numeric-domain', 'candidate({1e16}, 0.5)', 1),
    probe('empty-array', 'array-shape', 'candidate({}, 0)', null),
    probe('all-zero-weights', 'weight-domain', 'candidate({0, 0}, 0)', null),
    probe('negative-weight', 'weight-domain', 'candidate({1, -1}, 0)', null),
    probe('infinite-weight', 'weight-domain', 'candidate({1, math.huge}, 0)', null),
    probe('overflow-total', 'weight-domain', 'candidate({9e307, 9e307}, 0)', null),
    probe('nan-weight', 'weight-domain', 'candidate({1, 0/0}, 0)', null),
    probe('nan-ticket', 'ticket-domain', 'candidate({1, 2}, 0/0)', null),
    probe('string-ticket', 'type-validation', 'candidate({1, 2}, "0")', null),
    probe('nil-array', 'type-validation', 'candidate(nil, 0)', null),
    probe('number-array', 'type-validation', 'candidate(7, 0)', null),
    probe('sparse-array', 'array-shape', 'candidate({[1] = 1, [3] = 1}, 0)', null),
    probe('mixed-key-array', 'array-shape', 'candidate({1, 2, extra = 3}, 0)', null),
    probe('zero-key-array', 'array-shape', 'candidate({[0] = 1, [1] = 1}, 0)', null),
    probe('fractional-key-array', 'array-shape', 'candidate({[1] = 1, [1.5] = 1}, 0)', null),
    probe('metatable-array', 'array-shape', 'candidate(setmetatable({1, 2}, {}), 0)', null),
    probe('input-preserved', 'mutation', 'weights[1] == 1 and weights[2] == 2 and weights[3] == 3', true,
      'local weights = {1, 2, 3}\ncandidate(weights, 1)'),
  ]],
  ['team-balance', [
    probe('smallest-load', 'selection', 'candidate({3, 1, 2}, 4)', 2),
    probe('stable-tie', 'selection', 'candidate({1, 1, 3}, 4)', 1),
    probe('all-full', 'capacity-filter', 'candidate({4, 4}, 4)', null),
    probe('empty-team', 'selection', 'candidate({0, 2}, 4)', 1),
    probe('skip-full-team', 'capacity-filter', 'candidate({4, 2}, 4)', 2),
    probe('over-capacity-load', 'load-domain', 'candidate({5, 1}, 4)', null),
    probe('negative-load', 'load-domain', 'candidate({-1, 1}, 4)', null),
    probe('fractional-load', 'integer-domain', 'candidate({1.5, 1}, 4)', null),
    probe('zero-capacity', 'capacity-domain', 'candidate({1, 1}, 0)', null),
    probe('fractional-capacity', 'integer-domain', 'candidate({0, 1}, 3.5)', null),
    probe('unsafe-capacity', 'safe-integer-domain', 'candidate({0, 1}, 9007199254740992)', null),
    probe('unsafe-load-and-capacity', 'safe-integer-domain', 'candidate({9007199254740992}, 9007199254740992)', null),
    probe('infinite-capacity', 'capacity-domain', 'candidate({0, 1}, math.huge)', null),
    probe('nan-capacity', 'capacity-domain', 'candidate({0, 1}, 0/0)', null),
    probe('infinite-load', 'load-domain', 'candidate({1, math.huge}, 4)', null),
    probe('nan-load', 'load-domain', 'candidate({0/0, 1}, 4)', null),
    probe('string-capacity', 'type-validation', 'candidate({1}, "4")', null),
    probe('nil-capacity', 'type-validation', 'candidate({1}, nil)', null),
    probe('empty-array', 'array-shape', 'candidate({}, 4)', null),
    probe('nil-array', 'type-validation', 'candidate(nil, 4)', null),
    probe('number-array', 'type-validation', 'candidate(7, 4)', null),
    probe('sparse-array', 'array-shape', 'candidate({[1] = 1, [3] = 2}, 4)', null),
    probe('mixed-key-array', 'array-shape', 'candidate({1, 2, extra = 0}, 4)', null),
    probe('zero-key-array', 'array-shape', 'candidate({[0] = 0, [1] = 1}, 4)', null),
    probe('fractional-key-array', 'array-shape', 'candidate({[1] = 1, [1.5] = 1}, 4)', null),
    probe('metatable-array', 'array-shape', 'candidate(setmetatable({1, 2}, {}), 4)', null),
    probe('input-preserved', 'mutation', 'loads[1] == 2 and loads[2] == 3', true,
      'local loads = {2, 3}\ncandidate(loads, 4)'),
  ]],
]);

for (const [id, probes] of cases) {
  if (!probes.length || probes.length > 32 || new Set(probes.map(p => p.id)).size !== probes.length) {
    throw new Error(`invalid bounded diagnostic cases: ${id}`);
  }
  Object.freeze(probes);
}

export function diagnosisCasesFor(id) {
  const probes = cases.get(id);
  if (!probes) throw new Error(`no reviewed diagnostic cases for ${id}`);
  return probes;
}
