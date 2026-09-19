/** Development regressions for the already-exposed pilot holdouts. NOT SFT rows or a new benchmark. */
const call = (id, category, args, expected, scope = 'frozen-contract-example') =>
  ({ id, category, expression: `candidate(${args})`, expected, scope });
const extra = (id, category, args, expected) => call(id, category, args, expected, 'additional-development-probe');

export const PILOT_DIAGNOSTIC_CASES = {
  'weighted-selection': [
    call('lower-endpoint', 'selection', '{1, 2, 3}, 0', 1),
    call('fractional-ticket', 'finite-not-integer-domain', '{1, 2, 3}, 0.999', 1),
    call('first-internal-boundary', 'half-open-boundary', '{1, 2, 3}, 1', 2),
    call('fractional-middle', 'finite-not-integer-domain', '{1, 2, 3}, 2.999', 2),
    call('second-internal-boundary', 'half-open-boundary', '{1, 2, 3}, 3', 3),
    call('fractional-last', 'finite-not-integer-domain', '{1, 2, 3}, 5.999', 3),
    call('excluded-total', 'half-open-boundary', '{1, 2, 3}, 6', null),
    call('negative-ticket', 'invalid-input', '{1, 2, 3}, -0.01', null),
    call('zero-weight-prefix', 'half-open-boundary', '{0, 0, 2}, 0', 3),
    call('empty-array', 'array-shape', '{}, 0', null),
    call('negative-weight', 'invalid-input', '{1, -1}, 0', null),
    call('infinite-weight', 'finite-number-validation', '{1, math.huge}, 0', null),
    call('overflow-total', 'finite-number-validation', '{9e307, 9e307}, 0', null),
    call('nan-ticket', 'finite-number-validation', '{1, 2, 3}, 0/0', null),
    call('sparse-array', 'array-shape', '{[1] = 1, [3] = 1}, 0', null),
    call('zero-key', 'array-shape', '{[0] = 1}, 0', null),
    call('fractional-key', 'array-shape', '{[1.5] = 1}, 0', null),
    call('extra-map-key', 'array-shape', '{1, 2, extra = 3}, 0', null),
    { id: 'input-preserved', category: 'nonmutation', scope: 'frozen-contract-example',
      setup: 'local input = {1, 2, 3}\ncandidate(input, 1)',
      expression: 'input[1] == 1 and input[2] == 2 and input[3] == 3', expected: true },
    extra('fractional-weights', 'finite-not-integer-domain', '{0.5, 1.5}, 0.75', 2),
    extra('large-finite-weight', 'finite-not-integer-domain', '{1e16}, 0', 1),
    extra('zero-total', 'invalid-input', '{0, 0}, 0', null),
    extra('nan-weight', 'finite-number-validation', '{0/0, 1}, 0', null),
    extra('nil-array', 'type-guard-order', 'nil, 0', null),
    extra('number-array', 'type-guard-order', '42, 0', null),
    extra('false-array', 'type-guard-order', 'false, 0', null),
    extra('string-ticket', 'type-guard-order', '{1}, "0"', null),
    extra('table-ticket', 'type-guard-order', '{1}, {}', null),
    extra('nil-ticket', 'type-guard-order', '{1}, nil', null),
    extra('metatable-array', 'array-shape', 'setmetatable({1}, {}), 0', null),
    extra('infinite-ticket', 'finite-number-validation', '{1}, math.huge', null),
  ],
  'team-balance': [
    call('minimum-load', 'selection', '{3, 1, 2}, 4', 2),
    call('stable-tie', 'selection', '{1, 1, 3}, 4', 1),
    call('all-full', 'capacity-exclusion', '{4, 4}, 4', null),
    call('empty-team', 'selection', '{0, 2}, 4', 1),
    call('over-capacity-load', 'invalid-input', '{5, 1}, 4', null),
    call('negative-load', 'invalid-input', '{-1, 1}, 4', null),
    call('fractional-load', 'safe-integer-domain', '{1.5, 1}, 4', null),
    call('zero-capacity', 'invalid-input', '{1, 1}, 0', null),
    call('empty-array', 'array-shape', '{}, 4', null),
    call('infinite-load', 'finite-number-validation', '{1, math.huge}, 4', null),
    call('sparse-array', 'array-shape', '{[1] = 1, [3] = 2}, 4', null),
    call('fractional-key', 'array-shape', '{[1.5] = 1}, 4', null),
    { id: 'input-preserved', category: 'nonmutation', scope: 'frozen-contract-example',
      setup: 'local input = {2, 3}\ncandidate(input, 4)',
      expression: 'input[1] == 2 and input[2] == 3', expected: true },
    extra('extra-map-key', 'array-shape', '{1, 2, extra = 3}, 4', null),
    extra('metatable-array', 'array-shape', 'setmetatable({1}, {}), 4', null),
    extra('number-array', 'type-guard-order', '42, 4', null),
    extra('nil-array', 'type-guard-order', 'nil, 4', null),
    extra('string-array', 'type-guard-order', '"a", 4', null),
    extra('fractional-capacity', 'safe-integer-domain', '{1, 2}, 3.5', null),
    extra('unsafe-capacity', 'safe-integer-domain', '{1}, 9007199254740992', null),
    extra('unsafe-load-and-capacity', 'safe-integer-domain', '{9007199254740992}, 9007199254740992', null),
    extra('infinite-capacity', 'finite-number-validation', '{1}, math.huge', null),
    extra('nan-capacity', 'finite-number-validation', '{1}, 0/0', null),
    extra('string-capacity', 'type-guard-order', '{1}, "4"', null),
    extra('nan-load', 'finite-number-validation', '{0/0, 1}, 4', null),
    extra('negative-capacity', 'invalid-input', '{1}, -1', null),
    extra('largest-safe-capacity', 'safe-integer-domain', '{9007199254740990}, 9007199254740991', 1),
    extra('skip-full-team', 'capacity-exclusion', '{4, 3}, 4', 2),
    extra('zero-load-tie', 'selection', '{0, 0}, 1', 1),
  ],
};

// Registry is finite, immutable and deliberately not imported by any data builder.
for (const cases of Object.values(PILOT_DIAGNOSTIC_CASES)) {
  if (!cases.length || cases.length > 64 || new Set(cases.map(c => c.id)).size !== cases.length) {
    throw new Error('invalid diagnostic case registry');
  }
  for (const item of cases) Object.freeze(item);
  Object.freeze(cases);
}
Object.freeze(PILOT_DIAGNOSTIC_CASES);
