// checks.mjs — the rules, made executable.
//
// §AN asks whether the design corpus MATERIALLY IMPROVES evaluation, not whether
// it exists. A rule that only a human can apply improves nothing automatically, so
// the rules that can be mechanised are mechanised here, and each check names the
// rule it enforces.
//
// A DELIBERATE LIMIT ON SCOPE. §AK: "Never promote a visual metric because it
// sounds reasonable." So these checks only cover things with an unambiguous right
// answer — geometry that overlaps or does not, a wait that is bounded or is not, a
// price stated in one place or two. Anything requiring taste stays with the human
// reviewer and the rendered screenshot. A check that guesses at beauty is worse
// than no check, because it will be believed.
//
// Every check is validated against REAL inputs from this repository's history —
// the geometry that actually shipped broken, and the geometry that replaced it.

import { RULES } from './rules.mjs';

const ruleById = new Map(RULES.map((r) => [r.id, r]));

function finding(ruleId, detail, extra = {}) {
  const rule = ruleById.get(ruleId);
  return {
    ruleId,
    ok: false,
    detail,
    prevents: rule?.prevents ?? null,
    rule: rule?.rule ?? null,
    ...extra,
  };
}

/**
 * `layout.cluster-origin-agreement`
 *
 * Clusters are `{ name, x1, y1, x2, y2 }` in absolute pixels at a stated viewport.
 * Overlap is not a matter of degree: any positive intersection area is a defect,
 * because the thing underneath is a control or a readout.
 */
export function checkClusterOverlap(clusters = [], { viewportHeight = null } = {}) {
  const findings = [];
  for (let i = 0; i < clusters.length; i += 1) {
    for (let j = i + 1; j < clusters.length; j += 1) {
      const a = clusters[i];
      const b = clusters[j];
      const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
      const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
      if (w > 0 && h > 0) {
        findings.push(
          finding(
            'layout.cluster-origin-agreement',
            `${a.name} and ${b.name} overlap by ${w}x${h} = ${w * h}px^2` +
              (viewportHeight ? ` at viewport height ${viewportHeight}` : ''),
            { area: w * h, pair: [a.name, b.name] },
          ),
        );
      }
    }
  }
  return findings;
}

/**
 * `icon.a-module-not-installed-is-a-module-absent`
 *
 * THE FIRST VERSION OF THIS CHECK WAS TOO BROAD AND IS WORTH RECORDING.
 *
 * It flagged every unbounded `WaitForChild`, and returned 26 findings against a
 * healthy client. Almost all were correct code: a client genuinely cannot run
 * without `Config`, `Palette`, `Remotes` or `Util`, and putting a timeout on those
 * converts a guaranteed wait into a crash. §AK's warning applies to code metrics as
 * much as visual ones — a check that fires on everything gets muted, and then it
 * catches nothing.
 *
 * The real defect is narrower and sharper: an **inconsistent contract**. If ANY
 * consumer treats a dependency as optional — bounded wait, then degrade — then
 * every consumer must, because the dependency demonstrably can be absent. That is
 * exactly the shape of the bug that shipped: `Hud` waits `WaitForChild("Icons", 5)`
 * and prints "drawing without pictograms", while `Panels` waits unbounded on the
 * same module and hangs forever. One module knew Icons was optional and the other
 * did not, and the disagreement is what made a missing module invisible.
 */
export function checkWaitContracts(files = []) {
  const BOUNDED = /WaitForChild\(\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*,\s*[\d.]+\s*\)/g;
  const UNBOUNDED = /WaitForChild\(\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*\)/g;

  const bounded = new Map(); // dependency -> [paths that treat it as optional]
  const unbounded = new Map(); // dependency -> [paths that block forever]

  for (const file of files) {
    const src = String(file.source ?? '');
    for (const m of src.matchAll(BOUNDED)) {
      if (!bounded.has(m[1])) bounded.set(m[1], []);
      bounded.get(m[1]).push(file.path);
    }
    for (const m of src.matchAll(UNBOUNDED)) {
      if (!unbounded.has(m[1])) unbounded.set(m[1], []);
      unbounded.get(m[1]).push(file.path);
    }
  }

  const findings = [];
  for (const [dep, blockers] of unbounded) {
    const optionalIn = bounded.get(dep);
    if (!optionalIn) continue; // nobody treats it as optional: a structural wait, correct
    findings.push(
      finding(
        'icon.a-module-not-installed-is-a-module-absent',
        `"${dep}" is treated as OPTIONAL in ${optionalIn.join(', ')} (bounded wait, degrades) but ` +
          `blocked on FOREVER in ${blockers.join(', ')}. One of the two is wrong, and while they ` +
          `disagree a missing "${dep}" is invisible: the bounded consumer keeps drawing.`,
        { dependency: dep, optionalIn, blockedIn: blockers },
      ),
    );
  }
  return findings;
}

/**
 * `currency.never-restate-a-price-in-two-layers`
 *
 * Layers are `{ layer, values }` maps of the same cost keys. Any key whose value
 * differs between layers is a user shown a price that is not the price charged.
 */
export function checkPriceAgreement(layers = []) {
  const findings = [];
  const keys = new Set(layers.flatMap((l) => Object.keys(l.values ?? {})));
  for (const key of keys) {
    const stated = layers
      .filter((l) => l.values && key in l.values)
      .map((l) => ({ layer: l.layer, value: l.values[key] }));
    const distinct = new Set(stated.map((s) => s.value));
    if (stated.length > 1 && distinct.size > 1) {
      findings.push(
        finding(
          'currency.never-restate-a-price-in-two-layers',
          `"${key}" is stated as ${stated.map((s) => `${s.layer}=${s.value}`).join(' vs ')}`,
          { key, stated },
        ),
      );
    }
  }
  return findings;
}

/**
 * `motion.gate-at-the-service-not-the-call-site`
 *
 * A module that creates tweens must obtain the tween service through the motion
 * gate, not from `game:GetService`. Counting sites is the point: the failure mode
 * is one module out of five, not all of them.
 */
export function checkMotionGate(files = []) {
  const findings = [];
  for (const file of files) {
    const src = String(file.source ?? '');
    const creates = (src.match(/TweenService:Create/g) ?? []).length;
    if (creates === 0) continue;
    const gated = /TweenService\s*(?::\s*any\s*)?=\s*Theme\.motion/.test(src) ||
      /TweenService\s*=\s*Theme\.motion/.test(src);
    if (!gated) {
      findings.push(
        finding(
          'motion.gate-at-the-service-not-the-call-site',
          `${file.path} creates ${creates} tween(s) but does not route through Theme.motion, so reduced motion is ignored there`,
          { path: file.path, sites: creates },
        ),
      );
    }
  }
  return findings;
}

/** Run everything that applies to the inputs given. */
export function audit({ clusters, files, priceLayers, viewportHeight } = {}) {
  const findings = [
    ...(clusters ? checkClusterOverlap(clusters, { viewportHeight }) : []),
    ...(files ? checkWaitContracts(files) : []),
    ...(files ? checkMotionGate(files) : []),
    ...(priceLayers ? checkPriceAgreement(priceLayers) : []),
  ];
  return { ok: findings.length === 0, findings, checked: RULES.length };
}
