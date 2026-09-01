// domain.mjs — the DOMAIN TAG stage of §1's pipeline.
//
// `contentRecord()` has carried `libraries`, `engineEra` and `deprecatedPatterns`
// since it was written, and nothing has ever filled them: every record on disk says
// `engineEra: 'unknown'` and `libraries: []`. This computes them.
//
// WHAT AN ERA IS, AND WHAT IT IS NOT.
//
// Era is a claim about which engine generation a codebase was written against, and
// it is decided by DENSITY rather than by presence. A modern, well-maintained
// library can contain one `wait()` in a five-year-old file; calling it legacy for
// that would make the tag useless, and the tag exists to answer "will learning from
// this teach Golem an API that no longer behaves the way this code assumes?"
//
// The markers are dated engine facts, not style preferences. `task.wait` versus
// bare `wait()` is not a matter of taste — `wait()` is throttled to roughly 30Hz
// and drifts without bound under load. The Body* movers are legacy physics with
// constraint equivalents. `:connect` is the pre-2016 casing.
//
// The legacy list is deliberately the SAME vocabulary the eval harness lints for in
// `roblox-antipatterns.mjs` under `deprecated-api`, and `domain.test.mjs` asserts
// that every construct that rule flags is recognised here. Two independent lists of
// deprecated APIs is precisely the arrangement where one of them quietly stops
// being true.

export const ERAS = Object.freeze(['modern', 'transitional', 'legacy', 'unknown']);

// A marker is [name, regex]. Names are reported, so a tag can be argued with.
const MODERN_MARKERS = Object.freeze([
  ['task.*', /\btask\s*\.\s*(?:wait|spawn|delay|defer|cancel)\s*\(/g],
  ['typed-luau', /^\s*--!\s*(?:strict|nonstrict|native)/gm],
  ['constraint-movers', /\b(?:LinearVelocity|AngularVelocity|AlignPosition|AlignOrientation|VectorForce|Torque)\b/g],
  ['signal-once', /:Once\s*\(/g],
  ['property-changed-signal', /:GetPropertyChangedSignal\s*\(/g],
  ['ui-layout-objects', /\b(?:UIListLayout|UIGridLayout|UIPadding|UICorner|UIAspectRatioConstraint)\b/g],
  ['tween-service', /\bTweenService\b/g],
  ['modern-stdlib', /\b(?:table\.clone|table\.freeze|buffer\.\w+|os\.clock)\s*\(/g],
]);

// A checkout that DEFINES its own `connect` method is using its own API, not the
// removed RBXScriptSignal alias. `Reselim__Flipper` ships a userland `Signal` class
// with `function Signal:connect(handler)`, and counting its seven call sites as
// deprecated engine usage classified the whole library `legacy` — which is how a
// tag that exists to answer "will this teach an API that no longer behaves as
// assumed?" ends up condemning a library for its own naming convention.
//
// Regex cannot type the receiver, so this is decided per CHECKOUT rather than per
// call: if the source defines the method, its calls are presumed to be its own. The
// cost is real and bounded — a repo that defines `:connect` AND genuinely calls
// `part.Touched:connect(f)` loses that finding — so the suppression is REPORTED
// rather than applied silently.
const DEFINES_CONNECT = /\bfunction\s+[\w.]+[.:]connect\s*\(|\bconnect\s*=\s*function\b/;

// Every entry here is also flagged by `deprecated-api` in the eval harness.
const LEGACY_MARKERS = Object.freeze([
  ['bare-wait', /(?<![.:\w])wait\s*\(/g],
  ['bare-spawn-delay', /(?<![.:\w])(?:spawn|delay)\s*\(/g],
  ['lowercase-connect', /:connect\s*\(/g],
  ['body-movers', /\bBody(?:Velocity|Position|Gyro|Thrust|Angular\w*)\b/g],
]);

// Detected by import shape, not by a name appearing in prose: a README that says
// "works great with Knit" is not a Knit dependency.
const LIBRARY_MARKERS = Object.freeze([
  ['knit', /require\s*\([^)]*\bKnit\b/i],
  ['roact', /require\s*\([^)]*\bRoact\b/i],
  ['fusion', /require\s*\([^)]*\bFusion\b/i],
  ['matter', /require\s*\([^)]*\bMatter\b/i],
  ['promise', /require\s*\([^)]*\bPromise\b/i],
  ['janitor', /require\s*\([^)]*\bJanitor\b/i],
  ['maid', /require\s*\([^)]*\bMaid\b/i],
  ['signal', /require\s*\([^)]*\b(?:GoodSignal|Signal)\b/],
  ['profileservice', /require\s*\([^)]*\bProfile(?:Service|Store)\b/i],
  ['flipper', /require\s*\([^)]*\bFlipper\b/i],
  ['otter', /require\s*\([^)]*\bOtter\b/i],
  ['testez', /require\s*\([^)]*\bTestEZ\b/i],
]);

/** Total matches for a marker set, plus which markers fired. */
function tally(source, markers) {
  let total = 0;
  const hit = [];
  for (const [name, re] of markers) {
    // The regexes are module-level and `g`-flagged; matchAll does not mutate
    // lastIndex the way exec in a loop would, but reusing a stateful regex across
    // calls is the classic way this kind of scanner starts skipping files.
    const n = [...source.matchAll(new RegExp(re.source, re.flags))].length;
    if (n > 0) {
      total += n;
      hit.push({ marker: name, count: n });
    }
  }
  hit.sort((a, b) => b.count - a.count || a.marker.localeCompare(b.marker));
  return { total, hit };
}

/**
 * Below this share of era-relevant markers being legacy, a codebase reads modern.
 * Above the upper bound it reads legacy. Between them it is transitional, which is
 * a real and common state — a maintained library part-way through a migration —
 * and collapsing it into either neighbour would be a lie about a third of the corpus.
 */
export const ERA_THRESHOLDS = Object.freeze({ modern: 0.2, legacy: 0.6 });

/** Fewer era markers than this in total and the evidence does not support a claim. */
export const ERA_MIN_EVIDENCE = 5;

/**
 * @param {{path: string, source: string}[]} files
 * @returns {{engineEra: string, libraries: string[], deprecatedPatterns: object[],
 *            suppressed: object[],
 *            evidence: {modern: number, legacy: number, legacyShare: number|null}}}
 */
export function tagDomain(files = []) {
  let modern = 0;
  let legacy = 0;
  const legacyByMarker = new Map();
  const libraries = new Set();
  const definesConnect = files.some((file) => DEFINES_CONNECT.test(String(file?.source ?? '')));
  const suppressed = [];

  for (const file of files) {
    const source = String(file?.source ?? '');
    if (!source) continue;

    const m = tally(source, MODERN_MARKERS);
    const l = tally(source, LEGACY_MARKERS);
    modern += m.total;
    for (const { marker, count } of l.hit) {
      if (marker === 'lowercase-connect' && definesConnect) {
        suppressed.push({ marker, count, path: file.path, reason: 'the checkout defines its own connect method' });
        continue;
      }
      legacy += count;
      if (!legacyByMarker.has(marker)) legacyByMarker.set(marker, { pattern: marker, count: 0, files: [] });
      const entry = legacyByMarker.get(marker);
      entry.count += count;
      if (file.path && entry.files.length < 5) entry.files.push(file.path);
    }
    for (const [name, re] of LIBRARY_MARKERS) if (re.test(source)) libraries.add(name);
  }

  const total = modern + legacy;
  //[[ An unknown era is a real answer. A file of pure data, a README-only checkout
  //   or a 40-line utility gives no evidence either way, and guessing `modern`
  //   because nothing legacy appeared would make the tag say "we checked" when the
  //   truth is "there was nothing to check". ]]
  const legacyShare = total >= ERA_MIN_EVIDENCE ? legacy / total : null;
  let engineEra = 'unknown';
  if (legacyShare !== null) {
    if (legacyShare <= ERA_THRESHOLDS.modern) engineEra = 'modern';
    else if (legacyShare >= ERA_THRESHOLDS.legacy) engineEra = 'legacy';
    else engineEra = 'transitional';
  }

  const deprecatedPatterns = [...legacyByMarker.values()].sort(
    (a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern),
  );

  return {
    engineEra,
    libraries: [...libraries].sort(),
    deprecatedPatterns,
    suppressed,
    evidence: { modern, legacy, legacyShare },
  };
}
