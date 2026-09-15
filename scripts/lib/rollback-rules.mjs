/**
 * The undo's rules, as functions of their inputs.
 *
 * WHY THIS FILE EXISTS AT ALL — docs/FAILURES.md F-62. The documented rollback for a bad static
 * deploy was `node infra/deploy-static.mjs --only file <local> <remote>`. That form matched no
 * branch, uploaded nothing, and printed `done`. It is the sharpest instance of the house pattern
 * in the repository for three compounding reasons: it is in the UNDO, the thing you reach for
 * when something has already gone wrong; it reported SUCCESS, so the operator stops looking; and
 * it is used only under pressure, which is exactly when nobody re-reads the source.
 *
 * So the rule the whole file is built around, and the one `judgeRestore` exists to enforce:
 *
 *      A RESTORE THAT TRANSFERRED NOTHING MAY NOT REPORT SUCCESS.
 *
 * That is not a slogan — it is a comparison between two counts that both have to be produced, and
 * every way of producing them vacuously is closed here:
 *
 *   - `uploaded` must be a finite integer. `results.uploaded ?? 0` defends undefined and null and
 *     nothing else: NaN, `'3'` and Infinity all sail through, and `NaN !== plan.restore.length` is
 *     true while `NaN > 0` is false, so a count that is not a number can produce either verdict
 *     depending on which comparison happens to be written. It is type-checked, not defaulted.
 *   - An empty plan is a FAILURE, not a trivial success. A capture with nothing in it cannot put
 *     anything back, and `0 === 0` is the cheapest possible green.
 *   - Uploading is not restoring. Every restored path is re-read from the origin and compared to
 *     the captured bytes, and an unverified upload is counted as unverified rather than as done.
 *
 * Nothing here fetches, spawns, reads a file or prints; `infra/rollback-static.mjs` does all of
 * that and asks these functions for the verdict. tests/rollback-rules.test.mjs hands them the
 * broken inputs a healthy tree never produces.
 */

/* ---------------------------------------------------------------- the plan --- */

const isCount = (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/**
 * What a restore from `manifest` would do, and every reason it must not start.
 *
 * `present` maps a remote path to what is actually on disk in the capture directory —
 * `{ bytes }`, or absent entirely. It is supplied by the caller because reading the directory is
 * I/O and this file has none.
 *
 * REFUSALS ARE THE PRODUCT HERE. The plan is easy; deciding that the capture is not fit to
 * restore from is the part that has to happen before an incident, and `capture-rollback.mjs`
 * already records everything needed to decide it — the counts, the additions, the failures. What
 * did not exist was anything that READ them.
 */
export function planRestore(manifest, present, { allowPartial = false } = {}) {
  const refusals = [];
  const restore = [];
  const leftPublished = [];

  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { restore, refusals: ['the manifest is not an object — there is no capture to read'], leftPublished, unlisted: [] };
  }
  const files = Array.isArray(manifest.files) ? manifest.files : null;
  if (files === null) {
    return { restore, refusals: ['the manifest has no "files" list — nothing states what was captured'], leftPublished, unlisted: [] };
  }

  // The manifest's own arithmetic. capture-rollback.mjs refuses to finish unless captured +
  // additions + unrestorable reconciles with the number of overwritable paths; a manifest that
  // does not reconcile was either hand-edited or written by a capture that failed part-way, and
  // in both cases the thing it describes is not the origin.
  for (const k of ['overwritable', 'captured', 'additions', 'unrestorable', 'failures']) {
    if (!isCount(manifest[k])) refusals.push(`the manifest's "${k}" is not a count: ${JSON.stringify(manifest[k])}`);
  }
  if (refusals.length === 0) {
    // FAILURES ARE PART OF THE ARITHMETIC. capture-rollback.mjs exits before its own reconcile
    // check when a path failed, so a manifest recording failures is written with a captured count
    // that is short by exactly that many. Leaving them out of the sum here would report every such
    // capture as "does not reconcile" and bury the real reason — that the capture has holes — under
    // an arithmetic complaint about the same holes.
    if (manifest.captured + manifest.additions + manifest.unrestorable + manifest.failures !== manifest.overwritable) {
      refusals.push(
        `the manifest does not reconcile: ${manifest.captured} captured + ${manifest.additions} additions `
        + `+ ${manifest.unrestorable} unrestorable + ${manifest.failures} failure(s) is not ${manifest.overwritable} overwritable path(s)`,
      );
    }
    if (files.length !== manifest.captured) {
      refusals.push(`the manifest says ${manifest.captured} file(s) were captured and lists ${files.length}`);
    }
    if (manifest.failures > 0 && !allowPartial) {
      refusals.push(
        `the capture recorded ${manifest.failures} failure(s) — it has holes in it, and a restore from it `
        + 'would leave those paths at whatever the bad deploy wrote (pass --partial to accept that knowingly)',
      );
    }
  }

  const seen = new Set();
  for (const [i, f] of files.entries()) {
    const at = `file ${i + 1}`;
    if (f === null || typeof f !== 'object' || typeof f.remote !== 'string' || f.remote === '') {
      refusals.push(`${at} in the manifest has no remote path`);
      continue;
    }
    if (seen.has(f.remote)) { refusals.push(`${f.remote} is listed twice in the manifest`); continue; }
    seen.add(f.remote);
    if (!isCount(f.bytes) || f.bytes === 0) {
      // A zero-byte backup is not a backup — capture-rollback refuses to write one, so a manifest
      // claiming one has been edited or truncated.
      refusals.push(`${f.remote} claims ${JSON.stringify(f.bytes)} bytes, which is not a length a capture can have`);
      continue;
    }
    const disk = present instanceof Map ? present.get(f.remote) : present?.[f.remote];
    if (disk === undefined) {
      refusals.push(`${f.remote} is in the manifest and not in the capture directory — the bytes to put back are missing`);
      continue;
    }
    if (!isCount(disk.bytes)) {
      refusals.push(`${f.remote} is on disk with an unreadable length: ${JSON.stringify(disk.bytes)}`);
      continue;
    }
    if (disk.bytes !== f.bytes) {
      refusals.push(`${f.remote} is ${disk.bytes} bytes on disk and ${f.bytes} in the manifest — the capture has been altered`);
      continue;
    }
    restore.push({ remote: f.remote, bytes: f.bytes, contentType: typeof f.contentType === 'string' ? f.contentType : null });
  }

  // Files sitting in the capture directory that the manifest never mentions. Uploading them would
  // publish bytes nothing recorded; ignoring them silently would hide that someone has been in
  // here. Named, and blocking, because an undo has to be exactly the thing that was captured.
  const diskPaths = present instanceof Map ? [...present.keys()] : Object.keys(present ?? {});
  const unlisted = diskPaths.filter((p) => !seen.has(p));
  for (const p of unlisted) refusals.push(`${p} is in the capture directory and not in the manifest — an undo restores what was captured, nothing else`);

  // ADDITIONS ARE STATED, NEVER SKIPPED. These paths did not exist on the origin when the capture
  // ran, so the restore cannot put anything back at them and the bad deploy's version stays
  // published. That difference — "restored" versus "cannot be restored" — is the entire value of
  // the manifest, and it has to survive into the operator's output.
  if (Array.isArray(manifest.additionPaths)) leftPublished.push(...manifest.additionPaths.filter((p) => typeof p === 'string'));
  if (Array.isArray(manifest.unrestorablePaths)) {
    leftPublished.push(...manifest.unrestorablePaths.map((u) => (typeof u === 'string' ? u : u?.remote)).filter((p) => typeof p === 'string'));
  }

  if (restore.length === 0 && refusals.length === 0) {
    refusals.push('the capture holds no restorable file — there is nothing to put back, so there is no undo here');
  }
  return { restore, refusals, leftPublished, unlisted };
}

/* -------------------------------------------------------------- the verdict --- */

/**
 * Did the restore actually restore?
 *
 * `results` is what the uploader reports: `{ uploaded, verified, failures: [{remote, why}] }`.
 * Every one of those is treated as a claim to be checked against the plan, not as a fact.
 */
export function judgeRestore(plan, results) {
  const problems = [];
  if (plan === null || typeof plan !== 'object' || !Array.isArray(plan.restore)) {
    return { ok: false, problems: ['there is no plan to judge'], restored: 0, planned: 0 };
  }
  for (const r of plan.refusals ?? []) problems.push(r);
  if (results === null || typeof results !== 'object') {
    return { ok: false, problems: [...problems, 'the uploader reported nothing at all'], restored: 0, planned: plan.restore.length };
  }

  // TYPE-CHECKED, NOT DEFAULTED. `results.uploaded ?? 0` defends undefined and null only: NaN,
  // Infinity and a numeric string all pass it, and each produces a different wrong verdict
  // depending on which comparison is reached first.
  if (!isCount(results.uploaded)) problems.push(`the uploader did not report a count of files written: ${JSON.stringify(results.uploaded)}`);
  if (!isCount(results.verified)) problems.push(`the uploader did not report a count of files verified: ${JSON.stringify(results.verified)}`);
  const failures = Array.isArray(results.failures) ? results.failures : null;
  if (failures === null) problems.push('the uploader did not report a list of failures — a missing list is not an empty one');

  const planned = plan.restore.length;
  if (planned === 0) problems.push('nothing was planned for restore — a rollback that puts nothing back has not rolled anything back');

  if (isCount(results.uploaded)) {
    // F-62, as an assertion. This is the line the documented rollback command would have failed.
    if (planned > 0 && results.uploaded === 0) {
      problems.push(`0 of ${planned} file(s) were uploaded — the restore transferred nothing, which is the one outcome that may never read as success`);
    } else if (results.uploaded !== planned) {
      problems.push(`${results.uploaded} of ${planned} file(s) were uploaded — a partial restore leaves the origin mixed`);
    }
  }
  if (isCount(results.verified) && isCount(results.uploaded) && results.verified !== results.uploaded) {
    // UPLOADING IS NOT RESTORING. A 200 from the upload route says the row was written, not that
    // the origin now serves those bytes — and "the origin serves the wrong thing under a 200" is a
    // defect this repository has already shipped once, on the pricing page.
    problems.push(`${results.verified} of ${results.uploaded} restored file(s) were read back and matched — an unverified upload is not a restore`);
  }
  if (failures !== null) for (const f of failures) problems.push(`${f?.remote ?? '(unnamed path)'} — ${f?.why ?? 'failed for an unstated reason'}`);

  return {
    ok: problems.length === 0,
    problems,
    restored: isCount(results.verified) ? results.verified : 0,
    planned,
  };
}

/* --------------------------------------------------------- the health gate --- */

/**
 * One probe's result against what it was supposed to find.
 *
 * `got` is `{ status, contentType, body }` — already fetched by the caller — or
 * `{ error: '...' }` when the fetch threw. A probe that THREW is a failure to observe and is
 * scored as a failure, never dropped: dropping it would let a total outage read as "no failing
 * probes", which is the exact shape docs/FAILURES.md warns about.
 */
export function judgeProbe(probe, got) {
  const why = [];
  const name = typeof probe?.name === 'string' ? probe.name : '(unnamed probe)';
  if (got === null || typeof got !== 'object') return { name, ok: false, why: ['the probe returned nothing'] };
  if (typeof got.error === 'string' && got.error !== '') return { name, ok: false, why: [`the request failed: ${got.error}`] };

  if (!Number.isInteger(got.status)) why.push(`no HTTP status came back: ${JSON.stringify(got.status)}`);
  else if (Number.isInteger(probe?.status) && got.status !== probe.status) why.push(`HTTP ${got.status}, expected ${probe.status}`);

  if (typeof probe?.contentTypeIncludes === 'string' && probe.contentTypeIncludes !== '') {
    const ct = typeof got.contentType === 'string' ? got.contentType.toLowerCase() : '';
    // A 200 whose type contradicts the route is broken for every client that trusts the status
    // code — the pricing page answered 200 and browsers DOWNLOADED it. Status alone is not health.
    if (!ct.includes(probe.contentTypeIncludes.toLowerCase())) {
      why.push(`content-type ${ct === '' ? '(none)' : ct}, expected something containing ${probe.contentTypeIncludes}`);
    }
  }

  if (probe?.json !== undefined) {
    let parsed = null;
    try { parsed = JSON.parse(String(got.body)); } catch { parsed = null; }
    if (parsed === null || typeof parsed !== 'object') why.push('the body is not a JSON object');
    else {
      for (const [key, expected] of Object.entries(probe.json)) {
        const actual = parsed[key];
        if (typeof expected === 'function') {
          const verdict = expected(actual);
          if (verdict !== true) why.push(`${key}: ${typeof verdict === 'string' ? verdict : `unacceptable value ${JSON.stringify(actual)}`}`);
        } else if (actual !== expected) {
          why.push(`${key} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
        }
      }
    }
  }
  return { name, ok: why.length === 0, why };
}

/**
 * Healthy, unhealthy, or UNOBSERVED — three states, because the third is real.
 *
 * A run in which no probe produced a result has not found the origin healthy; it has found out
 * nothing. Collapsing that into `healthy` is how a deploy script concludes everything is fine
 * because its probe list was empty, and collapsing it into `unhealthy` would make an automatic
 * rollback fire on a local network blip. It is its own verdict, and the caller must decide.
 */
export function judgeHealth(results, { minProbes = 1 } = {}) {
  if (!Array.isArray(results) || results.length === 0) {
    return { verdict: 'unobserved', reason: 'no probe produced a result — nothing was observed, which is not the same as nothing being wrong', failed: [], ran: 0 };
  }
  if (!Number.isInteger(minProbes) || minProbes < 1) {
    return { verdict: 'unobserved', reason: `minProbes is not a positive integer: ${JSON.stringify(minProbes)}`, failed: [], ran: results.length };
  }
  if (results.length < minProbes) {
    return {
      verdict: 'unobserved',
      reason: `${results.length} probe(s) ran and at least ${minProbes} were required — a thinner check than the one that was asked for has not passed`,
      failed: [],
      ran: results.length,
    };
  }
  // `ok !== true`, not `!ok`: a probe whose ok is undefined, missing, or a truthy non-boolean is a
  // probe that did not answer the question, and it counts against health.
  const failed = results.filter((r) => r?.ok !== true);
  if (failed.length > 0) {
    return { verdict: 'unhealthy', reason: `${failed.length} of ${results.length} probe(s) failed`, failed, ran: results.length };
  }
  return { verdict: 'healthy', reason: `${results.length} probe(s) passed`, failed: [], ran: results.length };
}

/**
 * Whether a deploy should be undone automatically.
 *
 * ONLY `unhealthy` ROLLS BACK. `unobserved` does not: rolling back because the checker could not
 * see is how a flapping network un-deploys a working release, and reporting it as healthy is the
 * forbidden direction. It produces its own exit code and a person decides.
 */
export function decideAutoRollback(health) {
  if (health?.verdict === 'unhealthy') return { rollback: true, exit: 1, reason: `rolling back: ${health.reason}` };
  if (health?.verdict === 'healthy') return { rollback: false, exit: 0, reason: `no rollback: ${health.reason}` };
  return {
    rollback: false,
    exit: 2,
    reason: `undecided: ${health?.reason ?? 'the health check produced no verdict'} — no rollback was triggered and no clean bill of health is claimed`,
  };
}
