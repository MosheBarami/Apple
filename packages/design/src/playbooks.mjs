// playbooks.mjs — L3 of the ladder in docs/SOURCE-INTELLIGENCE.md §7.
//
// L2 is retrieval: a brief in, a ranked set of constraints out. That answers
// "what must be true of this interface?" and it answers nothing about ORDER, and
// nothing about whether the work was done at all.
//
// The gap is not theoretical. Run the six file-driven checks over this, properly,
// with `audit({ files: [{ path, source }] })`:
//
//     local gui = Instance.new("ScreenGui")
//     local frame = Instance.new("Frame")
//     frame.Size = UDim2.fromOffset(400, 300)
//
// Zero findings — and they are real zeroes, not the empty-spec `ok: true` that
// `audit(src, {})` returns by examining nothing at all. Every enforced check is a
// VIOLATION detector, and several are explicitly conditional on the thing being
// present: `checkFocusFeedback` returns early when a file has no `MouseEnter` to
// contradict. So a button with no hover state and no focus state passes the
// gamepad check, because the check exists to catch a hover that forgot its focus,
// not a button that forgot both. Omission is structurally invisible to a check
// layer built out of "this must not happen" and that is what L3 adds:
// a procedure whose steps have to be EVIDENCED, where absence of evidence is a
// finding rather than a silence.
//
// Two rules keep this from becoming a third place for the same knowledge to rot:
//
//   1. A step names rule IDs. It never restates rule prose. `composePlaybook()`
//      pulls the live text out of RULES at render time, so editing a rule edits
//      every playbook that cites it, and `assertPlaybookIntegrity()` fails the
//      build the moment a step cites an id that no longer exists.
//
//   2. Evidence signals are the names of GOLEM-OWNED PRIMITIVES — `Theme.panel`,
//      `Theme.well`, `Theme.counter` — not invented regexes. That is what makes
//      the third state below meaningful rather than decorative.

import { RULES } from './rules.mjs';
import { audit } from './checks.mjs';

const byId = new Map(RULES.map((r) => [r.id, r]));

// A step resolves to exactly one of these.
//
//   primitive — the owned primitive was used. The step was done the intended way.
//   manual    — a raw equivalent is present. The step was ATTEMPTED, but it went
//               around the library. This is the state that matters: §G's whole
//               complaint is that Golem "defaults to inventing every Roblox GUI
//               from a blank canvas", and `manual` is that defaulting, detected.
//               It is a warning and not a failure, because hand-rolling is
//               sometimes right and the correctness checks still run over it.
//   missing   — neither signal appears. The step did not happen.
export const STEP_STATUS = Object.freeze({ PRIMITIVE: 'primitive', MANUAL: 'manual', MISSING: 'missing' });

export const PLAYBOOKS = Object.freeze([
  {
    id: 'panel.shop',
    taskClass: 'a shop or upgrades panel with purchasable rows',
    // The L2 brief this supersedes. Kept so the two layers can be compared on the
    // same task rather than on two different ones.
    brief: { component: 'panel', styleFamily: 'cartoon-simulator' },
    steps: [
      {
        id: 'plate',
        do: 'Build the body from the panel primitive so it inherits one plate language, and let depth come from the edge rather than a dropped shadow.',
        rules: ['panel.one-plate-language', 'panel.depth-is-an-edge-not-a-shadow', 'panel.depth-is-a-tone-step-and-the-steps-must-diminish'],
        primitive: /\bTheme\.panel\s*\(/,
        manual: /Instance\.new\s*\(\s*["']Frame["']/,
      },
      {
        id: 'footer',
        do: 'Reserve footer space before laying out rows, so the bottom edge is not paid for out of the last row.',
        rules: ['panel.reserve-footer-space-for-the-edge'],
        primitive: /\b(?:Theme\.)?well\s*\(/,
        manual: /\bfooter\b/i,
      },
      {
        id: 'rows',
        do: 'Lay the purchasable rows out as cards on the shared plate, grouped so the grouping survives if the plate is removed.',
        rules: ['minimalist.grouping-must-survive-the-loss-of-the-plate', 'layout.inner-spacing-is-a-separate-token-from-item-spacing'],
        primitive: /\bTheme\.(?:card|groupPlate)\s*\(/,
        manual: /\bUIListLayout\b|\bUIGridLayout\b/,
      },
      {
        id: 'price',
        do: 'State each price exactly once, in one layer, and give the currency one motion policy.',
        rules: ['currency.never-restate-a-price-in-two-layers', 'currency.one-value-one-motion-policy'],
        primitive: /\bTheme\.counter\s*\(/,
        manual: /\bprice\b/i,
      },
      {
        id: 'transition',
        do: 'Open and close through the shared transition, so the open overshoots, the close does not, and reduced motion is honoured at the service.',
        rules: ['motion.open-overshoots-close-does-not', 'motion.gate-at-the-service-not-the-call-site', 'motion.a-reversible-transition-must-land-exactly-on-rest'],
        primitive: /\bTheme\.(?:open|close)\s*\(/,
        manual: /\bTweenService\s*:\s*Create\b/,
      },
    ],
  },
  {
    id: 'hud.cluster',
    taskClass: 'a HUD cluster pinned to a screen edge',
    brief: { component: 'layout', styleFamily: 'cartoon-simulator' },
    steps: [
      {
        id: 'origin',
        do: 'Position every cluster on a given edge from the SAME origin, or position one relative to the other. Two origins means the viewport decides whether they collide.',
        rules: ['layout.cluster-origin-agreement', 'layout.step-down-on-collision'],
        primitive: /\bAnchorPoint\s*=/,
        manual: /\bUDim2\.(?:new|fromScale|fromOffset)\s*\(/,
      },
      {
        id: 'safe-area',
        do: 'Opt decoration out of the safe area; never opt content out of it.',
        rules: ['layout.safe-area-is-opt-out-for-decoration-only'],
        primitive: /\bScreenInsets\b|\bIgnoreGuiInset\b|\bsafeArea\b/i,
        manual: /\bTopbarInset\b|\bGetGuiInset\b/,
      },
      {
        id: 'touch-floor',
        do: 'Size from the smallest touch target upward, not from the desktop layout downward.',
        rules: ['layout.touch-floor-from-smallest-target', 'layout.a-ui-scale-is-meaningless-without-a-declared-design-resolution'],
        primitive: /\bTheme\.Metrics\b/,
        manual: /\bUIScale\b|\bminTouch\w*\b/i,
      },
      {
        id: 'z-band',
        do: 'Assign z-order out of a band with headroom, not off one shared number line.',
        rules: ['layout.z-order-is-bands-with-headroom-not-one-number-line'],
        primitive: /\bzAbove\s*\(|\bZ_?BAND\b|\bTheme\.Z\b/i,
        manual: /\bZIndex\s*=/,
      },
    ],
  },
  {
    id: 'button.interactive',
    taskClass: 'an interactive button with a full state map',
    brief: { component: 'button', styleFamily: 'cartoon-simulator' },
    steps: [
      {
        id: 'surface',
        do: 'Build the button from the primitive, so the hit target is a sibling surface rather than the artwork itself.',
        rules: ['button.the-hit-target-is-a-sibling-surface-not-the-artwork'],
        primitive: /\bTheme\.(?:button|actionButton)\s*\(/,
        manual: /Instance\.new\s*\(\s*["'](?:Text|Image)Button["']/,
      },
      {
        //[[ The first version of this step named `MouseButton1Down` as the primitive
        //   and `Activated` as the fallback. Grading Theme.luau returned `manual`,
        //   which sent me to read why — and the answer is at Theme.luau:1088. A press
        //   arrives on THREE devices and only one of them is a mouse button: the
        //   gamepad's ButtonA reaches the control through `InputBegan` once it holds
        //   selection, and wiring `Activated` instead produced a controller press that
        //   ran the game logic while the button never looked pressed. So the codebase
        //   had already outgrown the procedure I wrote down, and the playbook would
        //   have taught a generator the mouse-only path. `InputBegan` with a device
        //   predicate is the primitive; a bare mouse-button signal is the re-invention. ]]
        id: 'press',
        do: 'Make the press an instant depth change that moves the opposite way from hover, and detect it through InputBegan with a device predicate — a press arrives from mouse, touch and the gamepad ButtonA, and only one of those is a mouse button.',
        rules: ['button.press-is-a-hard-cut', 'button.press-moves-the-opposite-way-from-hover'],
        primitive: /\bInputBegan\s*:\s*Connect\b/,
        manual: /\bMouseButton1Down\b|\bActivated\s*:\s*Connect\b|\bMouseButton1Click\b/,
      },
      {
        id: 'gamepad',
        do: 'Wire SelectionGained and SelectionLost. On a gamepad they ARE hover; a button that only listens for a mouse has no hover state on a controller.',
        rules: ['state.selection-gained-is-the-gamepad-s-hover', 'state.interaction-states-are-a-total-map-not-a-set-of-overrides'],
        primitive: /\bSelectionGained\b/,
        manual: /\bMouseEnter\b/,
      },
      {
        id: 'release',
        do: 'Return the press to the state the device actually left it in — hover for a pointer whose cursor is still on the control, selected for a gamepad whose focus has not moved — not to a hardcoded rest.',
        rules: ['state.a-press-returns-to-the-state-the-device-actually-left-it-in'],
        primitive: /\bInputEnded\s*:\s*Connect\b/,
        manual: /\bMouseButton1Up\b/,
      },
    ],
  },
]);

export const PLAYBOOK_IDS = Object.freeze(PLAYBOOKS.map((p) => p.id));

export function getPlaybook(id) {
  const found = PLAYBOOKS.find((p) => p.id === id);
  if (!found) throw new Error(`playbook: unknown id "${id}" (have: ${PLAYBOOK_IDS.join(', ')})`);
  return found;
}

/**
 * Every cited rule must exist, every step must be able to reach both verdicts, and
 * no two steps or playbooks may share an id.
 *
 * This runs as a test rather than living only as a convention, because the failure
 * it guards against is silent: rename a rule in rules.mjs and a playbook step goes
 * on rendering with one fewer constraint than it claims to carry.
 */
export function assertPlaybookIntegrity({ playbooks = PLAYBOOKS, rules = RULES } = {}) {
  const known = new Set(rules.map((r) => r.id));
  const problems = [];
  const seenPlaybooks = new Set();

  for (const pb of playbooks) {
    if (seenPlaybooks.has(pb.id)) problems.push(`duplicate playbook id "${pb.id}"`);
    seenPlaybooks.add(pb.id);
    if (!pb.taskClass) problems.push(`${pb.id}: no taskClass`);
    if (!Array.isArray(pb.steps) || pb.steps.length === 0) {
      problems.push(`${pb.id}: no steps`);
      continue;
    }
    const seenSteps = new Set();
    for (const step of pb.steps) {
      const where = `${pb.id}.${step.id}`;
      if (seenSteps.has(step.id)) problems.push(`duplicate step id "${where}"`);
      seenSteps.add(step.id);
      if (!step.do) problems.push(`${where}: no instruction`);
      if (!Array.isArray(step.rules) || step.rules.length === 0) {
        problems.push(`${where}: cites no rules — a step with no rule behind it is prose, not a playbook step`);
      }
      for (const id of step.rules ?? []) {
        if (!known.has(id)) problems.push(`${where}: cites unknown rule "${id}"`);
      }
      if (!(step.primitive instanceof RegExp)) problems.push(`${where}: no primitive signal`);
      if (!(step.manual instanceof RegExp)) problems.push(`${where}: no manual signal`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`playbook integrity failed:\n  ${problems.join('\n  ')}`);
  }
  return { playbooks: playbooks.length, steps: playbooks.reduce((n, p) => n + p.steps.length, 0) };
}

/**
 * Render the procedure, with rule text pulled live from the library.
 *
 * Deliberately ORDERED and numbered. That is the whole difference from
 * `composeBrief`, which returns the same constraints ranked by relevance and says
 * nothing about what to do first — and "what first" is most of what goes wrong
 * when a panel is built footer-last.
 */
export function composePlaybook(id, { rules = RULES } = {}) {
  const pb = typeof id === 'string' ? getPlaybook(id) : id;
  const table = rules === RULES ? byId : new Map(rules.map((r) => [r.id, r]));
  const lines = [];
  const cited = [];

  lines.push(`PLAYBOOK: ${pb.taskClass}.`);
  lines.push(
    'Work the steps in order. Each one names the constraints it exists to satisfy.',
    'Where a Golem primitive is named, reach for it rather than rebuilding it.',
    '',
  );

  pb.steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step.do}`);
    for (const ruleId of step.rules) {
      const rule = table.get(ruleId);
      if (!rule) {
        // Reachable only if integrity was never asserted; say so rather than
        // rendering a step that looks complete and is not.
        lines.push(`    !! cites missing rule ${ruleId}`);
        continue;
      }
      cited.push(ruleId);
      lines.push(`    - ${rule.rule}`);
      lines.push(`      why: ${rule.because}`);
      if (rule.tokens && rule.provenance.kind !== 'reference-only') {
        const toks = Object.entries(rule.tokens).map(([k, v]) => `${k}=${v}`).join(', ');
        lines.push(`      values: ${toks}`);
      }
    }
    lines.push('');
  });

  return { text: lines.join('\n'), playbook: pb.id, steps: pb.steps.length, used: cited };
}

/**
 * Grade produced code against a playbook.
 *
 * Two halves, and they answer different questions:
 *
 *   completeness — did every step happen?      (L3. New here.)
 *   correctness  — was anything done wrongly?  (L2's `audit`, unchanged.)
 *
 * `ok` requires both. A panel that skipped its footer step is not ok even though
 * it violates nothing, and that is the entire point.
 */
export function gradePlaybook(code, id, { path = 'generated.luau', spec = {} } = {}) {
  const pb = typeof id === 'string' ? getPlaybook(id) : id;
  const src = String(code ?? '');

  const steps = pb.steps.map((step) => {
    let status = STEP_STATUS.MISSING;
    if (step.primitive.test(src)) status = STEP_STATUS.PRIMITIVE;
    else if (step.manual.test(src)) status = STEP_STATUS.MANUAL;
    return { id: step.id, status, rules: step.rules, did: step.do };
  });

  const missing = steps.filter((s) => s.status === STEP_STATUS.MISSING);
  const reinvented = steps.filter((s) => s.status === STEP_STATUS.MANUAL);
  //[[ `audit` takes a structured SPEC, not a source string. Calling it as
  //   `audit(src, {})` type-checks fine, destructures every field to undefined,
  //   runs ZERO of the eleven checks and returns `ok: true` — a green verdict that
  //   means "nothing was examined". The first probe written for this module made
  //   exactly that mistake and its `ok: true` was reported as evidence that the
  //   check layer is omission-blind. The layer IS omission-blind, but that probe
  //   did not show it. The file-driven checks are the ones a caller can supply
  //   from source alone; the rest need geometry or palettes the caller must pass
  //   through `spec`. ]]
  const correctness = audit({ ...spec, files: spec.files ?? [{ path, source: src }] });

  return {
    ok: missing.length === 0 && correctness.ok,
    playbook: pb.id,
    taskClass: pb.taskClass,
    steps,
    missing: missing.map((s) => s.id),
    reinvented: reinvented.map((s) => s.id),
    violations: correctness.findings,
    // Named so a caller cannot mistake one for the other in a log line.
    completeness: { total: steps.length, done: steps.length - missing.length, missing: missing.length },
  };
}
