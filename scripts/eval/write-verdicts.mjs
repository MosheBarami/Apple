#!/usr/bin/env node
// Write critic-a.json, critic-b.json, claims.json and verdict.json into each piece folder from the critics workflow's
// results (the value `scripts/eval/critics.workflow.js` returns).
//
//   node scripts/eval/write-verdicts.mjs <results.json> [--prepared <args.json from prepare-critics>]
//
// The pass rule is lib/verdict.mjs; this script only gathers its inputs from the folder (play-test errors and the
// functional-check record come from manifest.json, never from a model) and writes the files.
// With --prepared, a piece that was skipped by prepare-critics but whose agent run DID start (its screenshots failed, say)
// gets an `unevaluable` verdict naming the reason, so it is counted as attempted and never as a pass. A skipped piece with
// no agent run (a dry run, a harness abort before the run) gets no verdict: it was not attempted.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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

export function verdictFor(piece, { criticA, criticB, claims, extraReasons = [] } = {}) {
  const m = piece.manifest ?? {};
  const play = m.playTest && Number.isFinite(m.playTest.errors) ? { errors: m.playTest.errors, warnings: m.playTest.warnings ?? null } : null;
  const unsupported = unsupportedClaims(claims);
  const dryRun = m.harness?.dryRun === true;
  const verdict = computeVerdict({
    requestId: piece.id,
    criticA: criticA ?? null,
    criticB: criticB ?? null,
    shotsGiven: piece.shots.map((s) => s.name),
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
