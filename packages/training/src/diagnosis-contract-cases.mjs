/** Development diagnostics only. Nothing here is exported into a training split. */
import { parseLuau, tokenize, findNodes } from '../../evals/src/luau-ast.mjs';

// These probes come from the EXISTING prompts, not new requirements. Keep them separate from
// the hash-bound original checks: discovering more defects must not rewrite a historical score.
const probes = {
  'weighted-selection': [
    ['fractional-ticket', 'finite-number-domain', 'candidate({1, 2, 3}, 0.5)', '1'],
    ['fractional-weights', 'finite-number-domain', 'candidate({0.25, 0.75}, 0.5)', '2'],
    ['large-finite-weight', 'finite-number-domain', 'candidate({1e16}, 0)', '1'],
    ['array-type', 'input-type-validation', 'candidate(7, 0)', 'nil'],
    ['ticket-type', 'input-type-validation', 'candidate({1, 2}, "1")', 'nil'],
    ['plain-table', 'plain-array-validation', 'candidate(setmetatable({1}, {}), 0)', 'nil'],
    ['nan-weight', 'finite-number-domain', 'candidate({0/0, 1}, 0)', 'nil'],
  ],
  'team-balance': [
    ['fractional-capacity', 'safe-integer-domain', 'candidate({0, 1}, 1.5)', 'nil'],
    ['unsafe-capacity', 'safe-integer-domain', 'candidate({0}, 9007199254740992)', 'nil'],
    ['infinite-capacity', 'safe-integer-domain', 'candidate({0}, math.huge)', 'nil'],
    ['array-type', 'input-type-validation', 'candidate(7, 4)', 'nil'],
    ['capacity-type', 'input-type-validation', 'candidate({1}, "4")', 'nil'],
    ['extra-array-key', 'plain-array-validation', 'candidate({1, 2, extra = 3}, 4)', 'nil'],
    ['plain-table', 'plain-array-validation', 'candidate(setmetatable({1}, {}), 4)', 'nil'],
  ],
};

function measuredAssertion(call, expected) {
  // Evaluate the candidate ONCE; a second call could change a stateful or mutating answer.
  return `do
local __apple_diag_value = ${call}
assert(__apple_diag_value == ${expected}, "APPLE-DIAG expected=${expected} actual=" .. tostring(__apple_diag_value))
end`;
}

/**
 * Extract real top-level assertions with the repository's AST, never a regex over comments.
 * Each case gets a fresh module/process. Earlier assertions still RUN, inside pcall, so their
 * candidate calls and side effects are retained but a failed assertion cannot hide later ones.
 * Other setup statements are unchanged. This is a diagnostic view, NOT equivalent scoring for
 * arbitrary stateful programs. The unmodified complete contract remains authoritative.
 */
export function originalContractCases(checks) {
  if (typeof checks !== 'string' || Buffer.byteLength(checks) > 16_000) throw new Error('bounded checks required');
  const parsed = parseLuau(checks);
  if (!parsed.ok) throw new Error('cannot diagnose unparseable checks');
  const allAssertions = findNodes(parsed.ast, 'CallExpression')
    .filter(node => node.base?.type === 'Identifier' && node.base.name === 'assert');
  if (tokenize(checks).tokens.some(t => t.value.startsWith('__apple_diag_'))) {
    throw new Error('reserved diagnostic identifier in checks');
  }
  const cases = [];
  let prefix = '';
  for (const statement of parsed.ast.body) {
    const text = checks.slice(statement.start, statement.end);
    const call = statement.type === 'CallStatement' ? statement.expression : null;
    if (call?.base?.type === 'Identifier' && call.base.name === 'assert') {
      const condition = call.arguments[0];
      let target = text;
      if (call.arguments.length === 1 && condition?.type === 'BinaryExpression' && condition.operator === '=='
        && condition.left.type === 'CallExpression' && condition.left.base?.name === 'candidate'
        && ['NumericLiteral', 'NilLiteral'].includes(condition.right.type)) {
        target = measuredAssertion(checks.slice(condition.left.start, condition.left.end),
          checks.slice(condition.right.start, condition.right.end));
      }
      cases.push({ id: `original-${cases.length + 1}`, origin: 'original-contract',
        category: 'canonical-contract', line: statement.line, endLine: statement.endLine,
        assertion: text, checks: prefix + target });
      prefix += `pcall(function()\n${text}\nend)\n`;
    } else {
      // Do not quietly omit nested assertions, loops, or shadowed harness functions.
      if (!['LocalStatement', 'CallStatement'].includes(statement.type)
        || statement.names?.some(n => ['candidate', 'assert', 'pcall', 'tostring'].includes(n.name))) {
        throw new Error('unsupported diagnostic setup; complete contract must remain authoritative');
      }
      prefix += text + '\n';
    }
  }
  if (!cases.length || cases.length > 64) throw new Error('expected 1..64 top-level assertions');
  if (cases.length !== allAssertions.length) throw new Error('nested assertions cannot be omitted from diagnostics');
  return cases;
}

export function supplementalContractCases(id) {
  if (!Object.hasOwn(probes, id)) throw new Error(`no reviewed diagnostic probes for ${id}`);
  return probes[id].map(([name, category, call, expected]) => ({
    id: name, origin: 'supplemental-prompt-contract', category,
    line: null, endLine: null, assertion: `assert(${call} == ${expected})`,
    checks: measuredAssertion(call, expected),
  }));
}
