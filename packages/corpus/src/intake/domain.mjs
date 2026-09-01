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

//[[ ERA MARKERS ARE COUNTED IN CODE, NOT IN PROSE OR IN TYPE DECLARATIONS.
//
//   Two false positives from the first run over the real corpus, both found by reading
//   the files the tagger pointed at rather than by trusting the counts:
//
//   `Sleitnick/RbxCameraShaker` reported 3 bare `wait()` calls in `src/CameraShaker/
//   init.lua`. All three are inside the usage example in the file's opening doc
//   comment. The library's own clock never appears in them — and five shake and motion
//   rules were extracted from this source, so an era claim about it is not idle.
//
//   `Reselim/Flipper` reported a bare `wait()` in `typings/Signal.d.ts`. The line is
//   `wait(): Parameters<T>` — a TypeScript method declaration for a method named
//   `wait`, which has nothing to do with the Roblox global.
//
//   The first of those is the THIRD time this repository has counted engine vocabulary
//   inside comments; F-43 is the roadmap doing it with genre words, and
//   `roblox-antipatterns.mjs` carries a `stripComments` written for the same reason.
//   So: blank comments before counting, and count era only in Luau. ]]
const LUAU_FILE = /\.luau?$/i;

/**
 * Blank comment bodies, preserving line structure and string CONTENTS.
 *
 * Deliberately a local implementation rather than an import: `packages/corpus` is
 * upstream of `packages/evals` and must not depend on it. `domain.test.mjs` asserts
 * this agrees with the eval harness's `stripComments` on a battery of samples, which
 * is the same guard the deprecation vocabulary gets — divergence is caught by a test
 * rather than prevented by a coupling.
 */
export function stripLuauComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const two = source.slice(i, i + 2);
    // A long bracket comment: --[[ ... ]] or --[=[ ... ]=]
    if (two === '--') {
      const long = /^--\[(=*)\[/.exec(source.slice(i));
      if (long) {
        const close = `]${long[1]}]`;
        const end = source.indexOf(close, i + long[0].length);
        const stop = end === -1 ? n : end + close.length;
        // Keep newlines so line numbers and line-anchored regexes still line up.
        out += source.slice(i, stop).replace(/[^\n]/g, ' ');
        i = stop;
        continue;
      }
      const eol = source.indexOf('\n', i);
      const stop = eol === -1 ? n : eol;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    // Skip over string literals so a comment marker inside one is not treated as a
    // comment, and so string contents survive.
    if (two[0] === '"' || two[0] === "'") {
      const quote = two[0];
      let j = i + 1;
      while (j < n && source[j] !== quote) {
        if (source[j] === '\\') j += 1;
        if (source[j] === '\n') break;
        j += 1;
      }
      out += source.slice(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

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
//[[ TWO KINDS OF MARKER, AND THEY NEED DIFFERENT VIEWS OF THE SOURCE.
//
//   `Instance.new("BodyVelocity")` is real deprecated usage and the evidence for it
//   lives entirely INSIDE a string literal, so string contents have to survive. But
//   `wait(` inside a string is prose, not a call — and pointing the tagger at this
//   repository's own code found exactly that: `apps/plugin/src/Ops.luau` contains
//
//       "refused: this code contains a loop with no yield in it (no task.wait, wait() or ..."
//
//   a refusal message that explains to a user which yields are allowed. It was the
//   single deprecated marker in 37 files of our own Luau, and it was not one.
//
//   So call-syntax markers are counted with string contents blanked, and class-name
//   markers with them kept. The split is by what the marker IS, not by a heuristic
//   about how the string looks. ]]
const LEGACY_MARKERS = Object.freeze([
  ['bare-wait', /(?<![.:\w])wait\s*\(/g, 'no-strings'],
  ['bare-spawn-delay', /(?<![.:\w])(?:spawn|delay)\s*\(/g, 'no-strings'],
  ['lowercase-connect', /:connect\s*\(/g, 'no-strings'],
  ['body-movers', /\bBody(?:Velocity|Position|Gyro|Thrust|Angular\w*)\b/g, 'with-strings'],
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

/**
 * Blank the CONTENTS of string literals, keeping the quotes and the line structure.
 * Used for markers that describe call syntax, which a string can only ever quote.
 */
export function blankStringContents(source) {
  return source.replace(/(['"])((?:\\.|(?!\1)[^\\\n])*)(\1?)/g, (m, q, body, close) =>
    q + ' '.repeat(body.length) + close);
}

/** Total matches for a marker set, plus which markers fired. */
function tally(source, markers, sourceNoStrings) {
  let total = 0;
  const hit = [];
  for (const [name, re, view] of markers) {
    const hay = view === 'no-strings' ? (sourceNoStrings ?? source) : source;
    // The regexes are module-level and `g`-flagged; matchAll does not mutate
    // lastIndex the way exec in a loop would, but reusing a stateful regex across
    // calls is the classic way this kind of scanner starts skipping files.
    const n = [...hay.matchAll(new RegExp(re.source, re.flags))].length;
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
 * @param {{repo?: string}} [opts]  the checkout's own repo name, e.g. `Sleitnick__Knit`
 * @returns {{engineEra: string, libraries: string[], deprecatedPatterns: object[],
 *            suppressed: object[],
 *            evidence: {modern: number, legacy: number, legacyShare: number|null}}}
 */
export function tagDomain(files = [], { repo = '' } = {}) {
  let modern = 0;
  let legacy = 0;
  const legacyByMarker = new Map();
  const libraries = new Set();
  const definesConnect = files.some(
    (file) => LUAU_FILE.test(String(file?.path ?? '')) && DEFINES_CONNECT.test(String(file?.source ?? '')),
  );
  const suppressed = [];

  for (const file of files) {
    const source = String(file?.source ?? '');
    if (!source) continue;

    // Era is a claim about Luau. A `.ts`, `.js` or `.d.ts` file in a Roblox repo is
    // tooling or typings, and its `wait(` is not the engine's.
    const isLuau = LUAU_FILE.test(String(file?.path ?? ''));
    const code = isLuau ? stripLuauComments(source) : '';

    const codeNoStrings = isLuau ? blankStringContents(code) : '';
    const m = tally(code, MODERN_MARKERS, codeNoStrings);
    const l = tally(code, LEGACY_MARKERS, codeNoStrings);
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
    // Same scoping as the era markers: a `require(` inside a doc comment is a usage
    // example, and a `.ts` import is not a Luau require.
    for (const [name, re] of LIBRARY_MARKERS) if (re.test(code)) libraries.add(name);
  }

  //[[ §1 defines this tag as "which library/libraries it BELONGS TO", and require-shape
  //   cannot see that a repository IS the library — `Sleitnick/Knit` has no
  //   `require(...Knit)` in its own runtime code, only in a fenced example inside a doc
  //   comment, so once comments stopped being counted Knit stopped belonging to knit.
  //   The repo name is the decidable half of "belongs to", and it is checked against the
  //   SAME marker vocabulary so a checkout cannot invent a library nothing else knows. ]]
  if (repo) {
    const own = String(repo).split(/__|\//).pop().toLowerCase();
    for (const [name] of LIBRARY_MARKERS) if (name === own) libraries.add(name);
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
