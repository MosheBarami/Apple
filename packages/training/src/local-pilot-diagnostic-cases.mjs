/** Known development failures only. These probes are NOT SFT rows or promotion holdouts. */
const probe = (id, category, call, expected) => ({
  id: `supplement:${id}`, kind: 'supplementary-contract-probe', category, call, expected,
  checks: `local observed = ${call}\nassert(observed == ${expected}, "APPLE_DIAG_ASSERT: expected " .. tostring(${expected}) .. "; observed " .. tostring(observed))`,
});

/** Supplemental checks address explicit prompt clauses absent from the frozen pilot checks.
 * The diagnostic executes the original reference against ALL probes before judging a response.
 * A probe passing says nothing about unrelated inputs, engine execution, or model promotion.
 */
export function supplementaryCases(id) {
  if (id === 'weighted-selection') return [
    probe('fractional-weights', 'numeric-domain', 'candidate({0.5, 1.5}, 0.25)', '1'),
    probe('fractional-ticket', 'numeric-domain', 'candidate({1, 2, 3}, 0.5)', '1'),
    probe('finite-large-weight', 'numeric-domain', 'candidate({1e16}, 0)', '1'),
    probe('half-open-boundary', 'interval-boundary', 'candidate({1, 2, 3}, 1)', '2'),
    probe('zero-weight-prefix', 'interval-boundary', 'candidate({0, 0, 2}, 0)', '3'),
    probe('exclusive-total', 'interval-boundary', 'candidate({1, 2, 3}, 6)', 'nil'),
    probe('sparse-array', 'array-shape', 'candidate({[1] = 1, [3] = 1}, 0)', 'nil'),
    probe('mixed-array', 'array-shape', 'candidate({1, 2, extra = 3}, 0)', 'nil'),
    probe('metatable-array', 'array-shape', 'candidate(setmetatable({1, 2}, {}), 0)', 'nil'),
    probe('number-array', 'invalid-input-no-throw', 'candidate(42, 0)', 'nil'),
    probe('nil-array', 'invalid-input-no-throw', 'candidate(nil, 0)', 'nil'),
    probe('string-ticket', 'invalid-input-no-throw', 'candidate({1, 2}, "0")', 'nil'),
    probe('nan-weight-suffix', 'non-finite-input', 'candidate({1, 0/0}, 0)', 'nil'),
  ];
  if (id === 'team-balance') return [
    probe('all-full', 'capacity-selection', 'candidate({3, 3}, 3)', 'nil'),
    probe('lowest-index-tie', 'tie-order', 'candidate({1, 1, 3}, 4)', '1'),
    probe('sparse-array', 'array-shape', 'candidate({[1] = 1, [3] = 2}, 4)', 'nil'),
    probe('mixed-array', 'array-shape', 'candidate({1, 2, extra = 3}, 4)', 'nil'),
    probe('metatable-array', 'array-shape', 'candidate(setmetatable({1, 2}, {}), 4)', 'nil'),
    probe('fractional-capacity', 'safe-integer-domain', 'candidate({0, 1}, 1.5)', 'nil'),
    probe('fractional-load', 'safe-integer-domain', 'candidate({0.5, 1}, 4)', 'nil'),
    probe('unsafe-capacity', 'safe-integer-domain', 'candidate({0, 1}, 9007199254740992)', 'nil'),
    probe('unsafe-load', 'safe-integer-domain', 'candidate({9007199254740992}, 9007199254740992)', 'nil'),
    probe('number-array', 'invalid-input-no-throw', 'candidate(42, 4)', 'nil'),
    probe('string-capacity', 'invalid-input-no-throw', 'candidate({0, 1}, "4")', 'nil'),
    probe('nan-capacity', 'non-finite-input', 'candidate({0, 1}, 0/0)', 'nil'),
  ];
  throw new Error(`no reviewed diagnostic probes for family: ${id}`);
}
