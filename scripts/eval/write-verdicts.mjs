#!/usr/bin/env node
// Write critic-a.json, critic-b.json, claims.json and verdict.json into each piece folder from the critics workflow's
// results (the value `scripts/eval/critics.workflow.js` returns).
//
//   node scripts/eval/write-verdicts.mjs <results.json> [--prepared <args.json from prepare-critics>]
//
// The pass rule is lib/verdict.mjs; this script only gathers its inputs from the folder (the play-test evidence, the
// pictures the piece was planned to have, whether it is a UI piece, how the run ended and the functional-check record all
// come from manifest.json, never from a model) and writes the files.
// With --prepared, a piece that was skipped by prepare-critics but whose agent run DID start (its screenshots failed, say)
// gets an `unevaluable` verdict naming the reason, so it is counted as attempted and never as a pass. A skipped piece with
// no agent run (a dry run, a harness abort before the run) gets no verdict: it was not attempted.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { playTestEvidence, plannedShotNames } from './lib/capture-plan.mjs';
import { readPiece } from './lib/piece-files.mjs';
import { computeVerdict } from './lib/verdict.mjs';

/** The workflow's return value may arrive bare, as an array of results, or wrapped by the tool as { result }. */
export function unwrapResults(doc) {
  const d = doc?.result && !doc.results ? doc.result : doc;
  const list = Array.isArray(d) ? d : Array.isArray(d?.results) ? d.results : null;
  if (!list) throw new Error('the results file has no `results` list: pass the value critics.workflow.js returned');
  return { results: list, rubricSha256: d?.rubricSha256 ?? null, rubricVersion: d?.rubricVersion ?? null };
}

/** The unsupported claims, from the list the auditor gave and from any claim it marked unsupported but left out of it. */
export function unsupportedClaims(claims) {
  if (!claims || !Array.isArray(claims.unsupported)) return null;
  const seen = new Map();
  for (const u of claims.unsupported) seen.set(String(u.claim).trim(), { claim: u.claim, why: u.why });
  for (const c of Array.isArray(claims.claims) ? claims.claims : []) {
    if (c.verdict === 'unsupported' && !seen.has(String(c.claim).trim())) seen.set(String(c.claim).trim(), { claim: c.claim, why: c.evidence });
  }
  return [...seen.values()];
}

/**
 * The pictures the piece was planned to have (from its kind, as recorded in the manifest) and which of them are missing: a
 * planned picture counts only when its capture was recorded with a file AND that file is in shots/. The files found on disk
 * are never the definition of "every picture": a piece with one picture of four is not a piece with all its pictures.
 */
export function plannedPictures(piece) {
  const names = plannedShotNames(piece.manifest?.build?.kind);
  if (!names) return null;
  const onDisk = new Set(piece.shots.map((s) => s.name));
  const missing = [];
  for (const name of names) {
    const rec = (piece.manifest?.captures ?? []).find((c) => c.name === name);
    if (rec?.file && onDisk.has(basename(rec.file))) continue;
    missing.push({ name, why: rec?.error ?? (rec?.file ? 'the file is not in shots/' : 'no capture was recorded') });
  }
  return { names, missing };
}

/** Why the UI area may not be N/A for this piece, or null when it may: the harness found a screen UI, or the request is a UI request. */
export function uiRequiredBecause(piece) {
  const kind = piece.manifest?.build?.kind;
  if (kind === 'ui' || kind === 'both') return 'the harness found a screen UI in what was built';
  if (piece.category === 'ui') return 'the request is in the UI category';
  return null;
}

export function verdictFor(piece, { criticA, criticB, claims, extraReasons = [] } = {}) {
  const m = piece.manifest ?? {};
  // The play test counts only with the evidence that the place ran: a record that says `errors: 0` without it is not read as 0.
  const evidence = playTestEvidence(m.playTest);
  const recorded = Number.isFinite(m.playTest?.errors) ? m.playTest.errors : null;
  const play = m.playTest
    ? { errors: recorded !== null && (recorded > 0 || evidence.established) ? recorded : null, warnings: m.playTest.warnings ?? null, why: evidence.missing }
    : null;
  const unsupported = unsupportedClaims(claims);
  const dryRun = m.harness?.dryRun === true;
  const verdict = computeVerdict({
    requestId: piece.id,
    criticA: criticA ?? null,
    criticB: criticB ?? null,
    shotsGiven: piece.shots.map((s) => s.name),
    planned: plannedPictures(piece),
    uiRequired: uiRequiredBecause(piece),
    playTest: play,
    functionalChecks: m.functionalChecks ?? { defined: false },
    claims: unsupported ? { unsupported } : null,
    run: { endedBy: dryRun ? 'dry-run' : m.aborted ? 'aborted' : m.run?.endedBy ?? 'unknown' },
  });
  verdict.reasons.push(...extraReasons);
  if (extraReasons.length && verdict.status === 'pass') verdict.status = 'unevaluable';
  verdict.pass = verdict.status === 'pass';
  verdict.claims = unsupported ? { unsupported } : null;
  return verdict;
}

export function writeVerdicts(doc, { prepared = null } = {}) {
  const { results, rubricSha256, rubricVersion } = unwrapResults(doc);
  const written = [];
  for (const r of results) {
    const piece = readPiece(r.dir);
    const verdict = verdictFor(piece, { criticA: r.criticA, criticB: r.criticB, claims: r.claims });
    const out = (name, body) => writeFileSync(join(piece.dir, name), JSON.stringify(body, null, 1) + '\n');
    out('critic-a.json', r.criticA ?? null);
    out('critic-b.json', r.criticB ?? null);
    out('claims.json', r.claims ?? null);
    out('verdict.json', {
      piece: { id: piece.id, category: piece.category },
      rubric: { version: rubricVersion, sha256: rubricSha256 },
      attempts: r.attempts ?? null,
      criticProblems: r.problems ?? null,
      shotsGiven: piece.shots.map((s) => s.name),
      ...verdict,
    });
    written.push({ id: piece.id, status: verdict.status, pass: verdict.pass });
  }
  const skippedWithRun = [];
  for (const s of prepared?.skipped ?? []) {
    if (results.some((r) => resolve(r.dir) === resolve(s.dir))) continue;
    const piece = readPiece(s.dir);
    if (!piece.manifest?.run) continue; // no agent run was made: not attempted, no verdict
    const verdict = verdictFor(piece, { extraReasons: [`not scored by critics: ${s.reason}`] });
    writeFileSync(join(piece.dir, 'verdict.json'), JSON.stringify({ piece: { id: piece.id, category: piece.category }, rubric: { version: rubricVersion, sha256: rubricSha256 }, ...verdict }, null, 1) + '\n');
    skippedWithRun.push({ id: piece.id, status: verdict.status, reason: s.reason });
  }
  return { written, skippedWithRun };
}

function main() {
  const argv = process.argv.slice(2);
  let file = null;
  let preparedFile = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--prepared') preparedFile = argv[++i];
    else if (argv[i].startsWith('--')) {
      console.error(`unknown flag ${argv[i]}`);
      process.exit(1);
    } else file = argv[i];
  }
  if (!file) {
    console.error('usage: write-verdicts.mjs <results.json> [--prepared <args.json>]');
    process.exit(1);
  }
  const summary = writeVerdicts(JSON.parse(readFileSync(file, 'utf8')), { prepared: preparedFile ? JSON.parse(readFileSync(preparedFile, 'utf8')) : null });
  for (const w of summary.written) console.log(`${w.id}: ${w.status}`);
  for (const w of summary.skippedWithRun) console.log(`${w.id}: ${w.status} (${w.reason})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
