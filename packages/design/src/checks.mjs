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

/** The rules this module can decide without a human. Kept as data so a test can assert it
 *  matches what the checks actually reference, rather than letting the two drift. */
export const ENFORCED_RULE_IDS = Object.freeze([
  'layout.cluster-origin-agreement',
  'layout.safe-area-is-opt-out-for-decoration-only',
  'icon.a-module-not-installed-is-a-module-absent',
  'motion.gate-at-the-service-not-the-call-site',
  'currency.never-restate-a-price-in-two-layers',
  'currency.one-value-one-motion-policy',
  'nav.every-destination-reachable-by-direction-alone',
  'studs.classic-palette-is-a-named-set-not-a-ramp',
  'studs.outlines-are-gone-and-no-surface-flag-brings-them-back',
  'state.selection-gained-is-the-gamepad-s-hover',
]);

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

/**
 * `layout.safe-area-is-opt-out-for-decoration-only`
 *
 * Screens are `{ name, ignoreGuiInset, screenInsets, interactive }`. Opting out of
 * the core-UI safe area is documented as a decision for NONINTERACTIVE content
 * ("you should only use None for a ScreenGui that contains noninteractive content
 * like background images"), so a surface that opts out while carrying controls is
 * a defect with an unambiguous right answer — no taste required.
 *
 * When another screen in the same UI kept the inset, that is said out loud. It is
 * the same evidence the wait-contract check relies on: one consumer has already
 * demonstrated the inset is load-bearing here, so the disagreement is the finding
 * rather than a matter of opinion.
 */
export function checkSafeArea(screens = []) {
  const optedOut = (s) => s.screenInsets === 'None' || s.ignoreGuiInset === true;
  const kept = screens.filter((s) => !optedOut(s)).map((s) => s.name);

  const findings = [];
  for (const s of screens) {
    if (!optedOut(s)) continue;
    const controls = typeof s.interactive === 'number' ? s.interactive : s.interactive ? 1 : 0;
    if (controls === 0) continue; // decoration: exactly what opting out is for
    findings.push(
      finding(
        'layout.safe-area-is-opt-out-for-decoration-only',
        `${s.name} opts out of the core-UI safe area but carries interactive content` +
          (typeof s.interactive === 'number' ? ` (${controls} control site(s))` : '') +
          `, so its controls may render under the Roblox top bar or a device camera cutout` +
          (kept.length
            ? `. ${kept.join(', ')} in the same UI kept the inset, so the inset demonstrably matters here.`
            : '.'),
        { screen: s.name, controls, keptInsetIn: kept },
      ),
    );
  }
  return findings;
}

/**
 * `nav.every-destination-reachable-by-direction-alone`
 *
 * Nodes are `{ name, selectable, selectionOrder, next: { up, down, left, right } }`.
 *
 * Three defects, all with a right answer that is a fact about the graph rather
 * than a judgement about the design:
 *
 *   1. a link pointing at an element that does not exist;
 *   2. a link pointing at an element that is not `Selectable` — the engine accepts
 *      this ("this property can be set to a GUI element even if it is not
 *      Selectable"), and the player experiences it as a direction that does nothing;
 *   3. a selectable element that no sequence of directions reaches from the entry.
 *
 * What this check does NOT do is judge the SHAPE of the graph. Whether a rail
 * should wrap, whether left should mirror right, whether the order matches the
 * visual order — those are design decisions, and §AK says they stay with the human.
 */
export function checkGamepadReachability(nodes = [], { entry = null } = {}) {
  const findings = [];
  if (nodes.length === 0) return findings;

  const byName = new Map(nodes.map((n) => [n.name, n]));
  const selectable = nodes.filter((n) => n.selectable !== false);

  if (selectable.length === 0) {
    findings.push(
      finding(
        'nav.every-destination-reachable-by-direction-alone',
        `none of the ${nodes.length} element(s) are Selectable, so a gamepad cannot enter this navigation at all`,
        { unreachable: nodes.map((n) => n.name) },
      ),
    );
    return findings;
  }

  for (const n of nodes) {
    for (const [dir, target] of Object.entries(n.next ?? {})) {
      if (!target) continue;
      const dest = byName.get(target);
      if (!dest) {
        findings.push(
          finding(
            'nav.every-destination-reachable-by-direction-alone',
            `${n.name}.NextSelection${dir[0].toUpperCase()}${dir.slice(1)} points at "${target}", which is not in this navigation`,
            { from: n.name, direction: dir, target, reason: 'unknown-target' },
          ),
        );
      } else if (dest.selectable === false) {
        findings.push(
          finding(
            'nav.every-destination-reachable-by-direction-alone',
            `${n.name}.NextSelection${dir[0].toUpperCase()}${dir.slice(1)} points at "${target}", which is not Selectable — ` +
              `the engine accepts the link and the player gets a direction that does nothing`,
            { from: n.name, direction: dir, target, reason: 'not-selectable' },
          ),
        );
      }
    }
  }

  // SelectionOrder chooses the entry point and is documented not to affect
  // directional navigation, so reachability is measured from the entry outward.
  const start = entry
    ? byName.get(entry)
    : [...selectable].sort(
        (a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0) || nodes.indexOf(a) - nodes.indexOf(b),
      )[0];

  if (!start) {
    findings.push(
      finding(
        'nav.every-destination-reachable-by-direction-alone',
        `the named entry point "${entry}" is not in this navigation`,
        { entry, reason: 'unknown-entry' },
      ),
    );
    return findings;
  }

  const seen = new Set([start.name]);
  const queue = [start];
  while (queue.length > 0) {
    const n = queue.shift();
    for (const target of Object.values(n.next ?? {})) {
      const dest = target && byName.get(target);
      if (!dest || dest.selectable === false || seen.has(dest.name)) continue;
      seen.add(dest.name);
      queue.push(dest);
    }
  }

  const stranded = selectable.filter((n) => !seen.has(n.name)).map((n) => n.name);
  if (stranded.length > 0) {
    findings.push(
      finding(
        'nav.every-destination-reachable-by-direction-alone',
        `${stranded.join(', ')} ${stranded.length === 1 ? 'is' : 'are'} Selectable but unreachable from "${start.name}" ` +
          `by any sequence of directions, so a controller player can never get there`,
        { entry: start.name, unreachable: stranded, reason: 'unreachable' },
      ),
    );
  }
  return findings;
}

/**
 * `studs.classic-palette-is-a-named-set-not-a-ramp`
 *
 * Converting a colour to a named brick colour returns the CLOSEST entry "by finding
 * the BrickColor whose color has the smallest total distance (sum of absolute
 * differences per channel)". That is arithmetic, not taste, so the question "do two
 * colours I designed as different survive the conversion as different?" has one
 * right answer and can be asked before anything is built.
 *
 * Both inputs are supplied by the caller. This library does not vendor the engine's
 * colour table: the metric is the reusable part, and a check that carried a copy of
 * someone else's data table would be doing the thing the whole package exists to
 * avoid. Any consistent scale works, because the comparison is relative.
 *
 * Deliberately NOT checked: how far a colour moved. "Too far" is a judgement, and
 * §AK is explicit that a metric which sounds reasonable is the dangerous kind. A
 * COLLISION is different — two distinct intended colours becoming one rendered
 * colour is a fact, and it is the failure that flattens a ramp.
 */
export function checkPaletteCollisions(intended = [], palette = []) {
  if (palette.length === 0 || intended.length === 0) return [];
  const distance = (a, b) =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

  const landedOn = new Map(); // palette entry name -> [{ name, color }]
  for (const item of intended) {
    let best = null;
    for (const entry of palette) {
      const d = distance(item.color, entry.color);
      if (best === null || d < best.d) best = { d, entry };
    }
    if (!landedOn.has(best.entry.name)) landedOn.set(best.entry.name, []);
    landedOn.get(best.entry.name).push({ name: item.name, color: item.color, distance: best.d });
  }

  const findings = [];
  for (const [entryName, arrivals] of landedOn) {
    // Two swatches authored as the same colour are a duplicate, not a collision.
    const distinct = new Set(arrivals.map((a) => a.color.join(',')));
    if (arrivals.length < 2 || distinct.size < 2) continue;
    findings.push(
      finding(
        'studs.classic-palette-is-a-named-set-not-a-ramp',
        `${arrivals.map((a) => a.name).join(', ')} were designed as ${distinct.size} different colours and all convert to "${entryName}" — ` +
          `the palette that renders has ${distinct.size - 1} fewer step(s) than the one that was designed`,
        { entry: entryName, collapsed: arrivals.map((a) => a.name), distinctIntended: distinct.size },
      ),
    );
  }
  return findings;
}

/**
 * `studs.outlines-are-gone-and-no-surface-flag-brings-them-back`
 *
 * `SmoothNoOutlines` is documented as "no longer relevant since outlines have been
 * removed". Setting it is therefore provably a no-op — not a style disagreement, an
 * instruction the engine discards. This is the narrowest possible check and that is
 * the point: it fires on exactly one token, so it can never become the check that
 * flags everything and gets muted.
 */
export function checkInertSurfaceFlags(files = []) {
  const findings = [];
  for (const file of files) {
    const sites = (String(file.source ?? '').match(/SmoothNoOutlines/g) ?? []).length;
    if (sites === 0) continue;
    findings.push(
      finding(
        'studs.outlines-are-gone-and-no-surface-flag-brings-them-back',
        `${file.path} sets SmoothNoOutlines at ${sites} site(s); outlines were removed from the engine, so this changes nothing ` +
          `and the era cue it was reached for is still missing`,
        { path: file.path, sites },
      ),
    );
  }
  return findings;
}

/**
 * `state.selection-gained-is-the-gamepad-s-hover`
 *
 * A file that gives a control a pointer hover response must give it a gamepad focus response
 * too. Mechanisable because it needs no taste: the question is whether the two signals reach
 * the code at all, not whether what they do is attractive.
 *
 * The case it is built from shipped. Every visible hover response in Crystal Canyon hung off
 * `MouseEnter`, `SelectionGained` appeared nowhere in the client, and `Selectable = false` was
 * being set in Panels — so the selection graph was live and a controller player navigated a UI
 * that never acknowledged them.
 *
 * This is deliberately NOT the same question as `checkGamepadReachability`, which proves the
 * selection graph is connected. A graph can be perfectly connected and completely invisible;
 * that is exactly what was shipping.
 */
export function checkFocusFeedback(files = []) {
  const findings = [];
  for (const file of files) {
    const source = String(file.source ?? '');
    //[[ `:Connect`, not a bare mention. Stories.luau — the isolated UI harness — drives its
    //   states by FIRING the MouseEnter connections it finds with `getconnections`, and the
    //   first version of this check reported that as a missing gamepad response. A check that
    //   reports the test harness as a defect gets switched off, which is worse than not
    //   having written it, so the signal is who SUBSCRIBES rather than who says the word. ]]
    const hover = (source.match(/\bMouseEnter:Connect\b/g) ?? []).length;
    if (hover === 0) continue;
    const focus = (source.match(/\bSelectionGained:Connect\b/g) ?? []).length;
    if (focus > 0) continue;
    findings.push(
      finding(
        'state.selection-gained-is-the-gamepad-s-hover',
        `${file.path} connects MouseEnter at ${hover} site(s) and SelectionGained at none, so every ` +
          `hover response it draws is invisible to a controller`,
        { path: file.path, hover, focus },
      ),
    );
  }
  return findings;
}

/** Run everything that applies to the inputs given. */
/**
 * `currency.one-value-one-motion-policy` — every surface showing one value must agree about
 * whether it animates.
 *
 * Unambiguous, which is why it belongs here: two surfaces either both count or both snap, and
 * no taste is required to tell which. The case it is built from shipped — `Panels.luau` routed
 * the shop footer through `Effects.countTo` while `Hud.luau` assigned the wallet text directly,
 * so the same number rolled in one place and jumped in another, side by side.
 *
 * `surfaces` is a list of `{ surface, value, animated }`. A value shown on exactly one surface
 * cannot disagree with itself and is never reported.
 */
export function checkCounterMotionAgreement(surfaces = []) {
  const byValue = new Map();
  for (const s of surfaces) {
    if (!s || typeof s.value !== 'string') continue;
    if (!byValue.has(s.value)) byValue.set(s.value, []);
    byValue.get(s.value).push(s);
  }

  const findings = [];
  for (const [value, shown] of byValue) {
    if (shown.length < 2) continue;
    const animated = shown.filter((s) => s.animated === true);
    const snapped = shown.filter((s) => s.animated !== true);
    if (animated.length === 0 || snapped.length === 0) continue;
    findings.push(
      finding(
        'currency.one-value-one-motion-policy',
        `"${value}" animates on ${animated.map((s) => s.surface).join(', ')} and snaps on ` +
          `${snapped.map((s) => s.surface).join(', ')}`,
        { value, animated: animated.map((s) => s.surface), snapped: snapped.map((s) => s.surface) },
      ),
    );
  }
  return findings;
}

export function audit({
  clusters,
  files,
  priceLayers,
  viewportHeight,
  screens,
  selection,
  palette,
  counters,
} = {}) {
  const findings = [
    ...(clusters ? checkClusterOverlap(clusters, { viewportHeight }) : []),
    ...(files ? checkWaitContracts(files) : []),
    ...(files ? checkMotionGate(files) : []),
    ...(files ? checkInertSurfaceFlags(files) : []),
    ...(files ? checkFocusFeedback(files) : []),
    ...(priceLayers ? checkPriceAgreement(priceLayers) : []),
    ...(screens ? checkSafeArea(screens) : []),
    ...(selection ? checkGamepadReachability(selection.nodes, { entry: selection.entry }) : []),
    ...(palette ? checkPaletteCollisions(palette.intended, palette.palette) : []),
    ...(counters ? checkCounterMotionAgreement(counters) : []),
  ];
  //[[ `enforced` is the number of rules this audit can actually decide, and it is reported
  //   separately from the library size on purpose. Returning only `checked: RULES.length`
  //   invited the reading that the whole library had been applied, when only the enforced
  //   set is mechanised and the rest need a human and a rendered screenshot. §AK: a metric that
  //   flatters is worse than no metric. ]]
  return { ok: findings.length === 0, findings, enforced: ENFORCED_RULE_IDS.length, library: RULES.length };
}
