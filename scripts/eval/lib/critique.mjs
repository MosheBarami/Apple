// The harsh critique protocol (owner, 2026-10-06: "enforce Claude Code to really look at the image and critique it
// really harsh"). Every build the agent makes is judged by the session that runs it, from its own pictures, before
// anything else happens: `scripts/critique.mjs prepare` cuts every picture into zoomed crops and writes the skeleton,
// the session reads every crop and fills `critique/critique.json`, and `check` refuses a critique that skipped a crop,
// ignored a measured defect, or scored above what the measured defects allow. The Stop hook
// (.claude/hooks/critique-gate.mjs) will not let a session end while a build has no critique that passes `check`.
//
// Pure functions only; the CLI does the file work.

export const AREAS = ['delivers', 'visual', 'layout', 'ui', 'life', 'polish', 'style'];
export const SIGNATURES = [
  '1 heavy rounded font with thick outline',
  '2 glossy gradient fills',
  '3 stud texture',
  '4 thick same-hue borders, small corners',
  '5 big 3D icons overflowing the frame',
  '6 candy colours by role',
  '7 game layout conventions',
];
export const PASS_SCORE = 8;

/**
 * The most an area may score when the build carries a measured defect: the measurement wins over the eye. A finding
 * marked a false positive (with its reason) lifts no cap.
 */
export const CAPS = {
  clipped: { layout: 4, delivers: 6 },
  spill: { layout: 5, polish: 5 },
  collision: { layout: 5, polish: 5 },
  'same-icon': { visual: 5, delivers: 6 },
  overflow: { polish: 5 },
  'tiny-text': { ui: 5 },
  'zero-size': { delivers: 6, layout: 5 },
  studs: { style: 6 },
  'price-word': { style: 6, ui: 6 },
  untagged: { style: 6 },
  nostroke: { style: 6 },
  font: { style: 5 },
  grey: { style: 5, visual: 6 },
  'play-error': { life: 4, polish: 5 },
  timeout: { delivers: 5 },
  'colour-gate': { style: 5, visual: 5 },
};

/** The measured defects of a piece, from its manifest: the lints, play-test errors, a timed-out run, the colour gate. */
export function measuredDefects(manifest) {
  const out = [];
  for (const f of manifest?.kitLint?.findings ?? []) out.push({ source: 'kit-lint', rule: f.rule, path: f.path, detail: f.detail ?? '' });
  for (const panel of manifest?.layoutLint ?? []) {
    for (const f of panel.findings ?? []) out.push({ source: `layout-lint ${panel.file ?? ''}`.trim(), rule: f.rule, path: f.path, detail: f.detail ?? '' });
  }
  const errors = manifest?.playTest?.errors ?? manifest?.playTest?.errorCount ?? 0;
  const n = Array.isArray(errors) ? errors.length : Number(errors) || 0;
  if (n > 0) out.push({ source: 'play-test', rule: 'play-error', path: '', detail: `${n} error(s) in the play test` });
  if (manifest?.run?.stopReason === 'timeout' || manifest?.agentRun?.stopReason === 'timeout') out.push({ source: 'agent-run', rule: 'timeout', path: '', detail: 'the run hit its time limit' });
  if (manifest?.gates?.colour && manifest.gates.colour.pass === false) out.push({ source: 'colour gate', rule: 'colour-gate', path: '', detail: (manifest.gates.colour.reasons ?? []).join('; ').slice(0, 200) });
  return out;
}

/** The key a critique uses to answer a measured defect. */
export const defectKey = (d) => `${d.rule}|${d.path}|${d.detail}`;

/** The lowest cap per area that the real (not false-positive) defects impose. */
export function capsFor(defects, answers) {
  const caps = {};
  for (const d of defects) {
    const a = answers.find((x) => x.key === defectKey(d));
    if (a && a.verdict === 'false-positive') continue;
    for (const [area, cap] of Object.entries(CAPS[d.rule] ?? {})) caps[area] = Math.min(caps[area] ?? 10, cap);
  }
  return caps;
}

const words = (s) => (typeof s === 'string' ? s.trim().split(/\s+/).filter(Boolean).length : 0);

/**
 * Every reason the critique is not acceptable; empty when it is. `expected` comes from `prepare`: the pictures with
 * their sha256, the crops, and the measured defects. `exists(path)` says whether a repository path exists.
 */
export function checkCritique(critique, expected, exists = () => true) {
  const errs = [];
  const c = critique ?? {};
  // Pictures: the critique is of these exact bytes.
  for (const img of expected.images) {
    const got = (c.images ?? []).find((x) => x.file === img.file);
    if (!got) errs.push(`picture ${img.file} is not critiqued`);
    else if (got.sha256 !== img.sha256) errs.push(`picture ${img.file} changed since the critique (sha256 differs): look again`);
  }
  // Crops: every one was looked at and described in the critic's own words.
  for (const crop of expected.crops) {
    const got = (c.crops ?? []).find((x) => x.id === crop.id);
    if (!got) { errs.push(`crop ${crop.id} has no entry: Read ${crop.path} and describe it`); continue; }
    if (words(got.seen) < 12) errs.push(`crop ${crop.id}: "seen" must say what is in it, in at least 12 words`);
    if (!Array.isArray(got.defects)) errs.push(`crop ${crop.id}: "defects" must be a list (empty only if the crop is clean)`);
  }
  // Measured defects: each one answered.
  const answers = Array.isArray(c.measured) ? c.measured : [];
  for (const d of expected.defects) {
    const a = answers.find((x) => x.key === defectKey(d));
    if (!a) { errs.push(`measured defect not answered: [${d.rule}] ${d.detail || d.path}`); continue; }
    if (a.verdict !== 'real' && a.verdict !== 'false-positive') errs.push(`measured defect ${d.rule}: verdict must be "real" or "false-positive"`);
    if (a.verdict === 'false-positive' && words(a.reason) < 8) errs.push(`measured defect ${d.rule}: a false positive needs a reason of at least 8 words`);
    if (a.verdict === 'real' && words(a.fix) < 6) errs.push(`measured defect ${d.rule}: a real defect needs the fix, in at least 6 words`);
  }
  // Scores: every area, capped by the measurements, defended by defects.
  const caps = capsFor(expected.defects, answers);
  const scores = c.scores ?? {};
  for (const area of AREAS) {
    const s = scores[area];
    if (!s || !Number.isInteger(s.score) || s.score < 1 || s.score > 10) { errs.push(`score for ${area} missing (an integer 1-10)`); continue; }
    if (caps[area] !== undefined && s.score > caps[area]) errs.push(`${area} scored ${s.score}, but a measured defect caps it at ${caps[area]}`);
    const defects = Array.isArray(s.defects) ? s.defects.filter((d) => words(d) >= 4) : [];
    if (s.score <= 7 && defects.length < 2) errs.push(`${area} scored ${s.score}: name at least 2 concrete defects (4+ words each)`);
    if (s.score === 8 && defects.length < 1) errs.push(`${area} scored 8: name what keeps it from 9`);
    if (s.score >= 9 && words(s.why) < 15) errs.push(`${area} scored ${s.score}: say why, against the reference board, in 15+ words`);
  }
  const allDefects = [...(c.crops ?? []).flatMap((x) => x.defects ?? []), ...AREAS.flatMap((a) => scores[a]?.defects ?? [])].filter((d) => words(d) >= 4);
  const low = AREAS.filter((a) => (scores[a]?.score ?? 0) < 9);
  if (low.length && allDefects.length < 8) errs.push(`only ${allDefects.length} defects named across the critique; a build below 9 anywhere has at least 8 to name`);
  // Signatures (bible §3.1).
  const sig = c.signatures ?? {};
  for (const s of SIGNATURES) {
    const v = sig[s.split(' ')[0]];
    if (!['present', 'weak', 'missing'].includes(v)) errs.push(`signature ${s}: rate it present, weak or missing`);
  }
  if (words(c.worst) < 8) errs.push('"worst": the single worst thing a player would notice first, in 8+ words');
  // Fixes: concrete, in files that exist.
  const fixes = Array.isArray(c.fixes) ? c.fixes : [];
  if (fixes.length < 3) errs.push('at least 3 fixes, each with the file to change');
  for (const f of fixes) {
    if (!f?.file || !exists(f.file)) errs.push(`fix names a file that does not exist: ${f?.file ?? '(none)'}`);
    if (words(f?.change) < 6) errs.push(`fix in ${f?.file ?? '?'}: say the change in 6+ words`);
  }
  // Verdict: computed, not chosen.
  const want = verdictOf(scores, sig, expected.defects, answers);
  if (c.verdict !== want) errs.push(`verdict must be "${want}" (computed from the scores, the signatures and the measured defects)`);
  return errs;
}

/** pass only when every area is at least 8, no signature is missing, and no measured defect is real. */
export function verdictOf(scores, signatures, defects, answers) {
  const allHigh = AREAS.every((a) => (scores?.[a]?.score ?? 0) >= PASS_SCORE);
  const noMissing = SIGNATURES.every((s) => (signatures ?? {})[s.split(' ')[0]] !== 'missing');
  const noReal = defects.every((d) => (answers ?? []).find((x) => x.key === defectKey(d))?.verdict === 'false-positive');
  return allHigh && noMissing && noReal ? 'pass' : 'fail';
}

/** The 3x3 grid cells of a picture, as extract boxes: [left, top, width, height]. Pure. */
export function gridCells(width, height, n = 3) {
  const out = [];
  const w = Math.floor(width / n);
  const h = Math.floor(height / n);
  for (let r = 0; r < n; r += 1) {
    for (let col = 0; col < n; col += 1) {
      out.push({ id: `r${r + 1}c${col + 1}`, box: [col * w, r * h, col === n - 1 ? width - col * w : w, r === n - 1 ? height - r * h : h] });
    }
  }
  return out;
}
