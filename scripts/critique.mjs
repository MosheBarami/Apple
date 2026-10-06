#!/usr/bin/env node
// The harsh critique protocol (scripts/eval/lib/critique.mjs says why). Three commands:
//
//   node scripts/critique.mjs prepare <piece folder>   crops every picture (3x3 for shots, whole for play frames, twice
//                                                     the size, plus the open panel)
//                                                     into <piece>/critique/crops/, writes critique/expected.json and a
//                                                     critique.json skeleton, and prints what to Read.
//   node scripts/critique.mjs check <piece folder>     exit 1 with every reason the critique is not acceptable.
//   node scripts/critique.mjs nudge                    the PostToolUse hook's reminder after a Studio capture.
//   node scripts/critique.mjs gate [--hook]            the builds since the cutoff that have pictures and no critique
//                                                     that passes check; exit 1 if any (with --hook: the Stop hook's
//                                                     JSON, which blocks the session from ending).
//
// The pictures a critique covers: the UI shots (ui*.jpg), the play-test frames and the world cameras of the piece.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, SIGNATURES, checkCritique, defectKey, gridCells, measuredDefects, capsFor } from './eval/lib/critique.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Builds finished before the protocol existed are not owed a critique. */
export const CUTOFF = '2026-10-06T19:00:00Z';
const PROOF = join(ROOT, 'planning', 'proof');

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function pictures(dir) {
  const shots = join(dir, 'shots');
  if (!existsSync(shots)) return [];
  return readdirSync(shots).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().map((f) => `shots/${f}`);
}

async function prepare(dir) {
  const sharp = (await import('sharp')).default;
  const manifest = existsSync(join(dir, 'manifest.json')) ? readJson(join(dir, 'manifest.json')) : {};
  const out = join(dir, 'critique');
  mkdirSync(join(out, 'crops'), { recursive: true });
  const images = [];
  const crops = [];
  for (const file of pictures(dir)) {
    const bytes = readFileSync(join(dir, file));
    images.push({ file, sha256: sha(bytes) });
    const meta = await sharp(bytes).metadata();
    const base = file.replace(/^shots\//, '').replace(/\.[a-z]+$/i, '');
    const add = async (id, box) => {
      const [left, top, width, height] = box.map((v) => Math.max(0, Math.round(v)));
      if (width < 8 || height < 8) return;
      const path = join(out, 'crops', `${base}.${id}.png`);
      await sharp(bytes).extract({ left, top, width: Math.min(width, meta.width - left), height: Math.min(height, meta.height - top) })
        .resize({ width: Math.min(width, meta.width - left) * 2 }).png().toFile(path);
      crops.push({ id: `${base}.${id}`, path: relative(ROOT, path) });
    };
    const cap = (manifest.captures ?? []).find((c) => c.file === file) ?? (manifest.playTest?.frames ?? []).find((f) => f.file === file);
    const b = cap?.uiArea?.bounds;
    const v = cap?.uiArea?.viewport;
    if (b && v?.[0] && v?.[1]) {
      const sx = meta.width / v[0];
      const sy = meta.height / v[1];
      await add('panel', [b[0] * sx, b[1] * sy, (b[2] - b[0]) * sx, (b[3] - b[1]) * sy]);
    }
    // A UI shot or world camera is read in nine zoomed cells; a play-test frame repeats the UI, so it is read whole and by its panel.
    if (/^play-/.test(base)) await add('whole', [0, 0, meta.width, meta.height]);
    else for (const cell of gridCells(meta.width, meta.height)) await add(cell.id, cell.box);
  }
  const defects = measuredDefects(manifest);
  const expected = { piece: relative(ROOT, dir), images, crops, defects };
  writeFileSync(join(out, 'expected.json'), `${JSON.stringify(expected, null, 1)}\n`);
  const skeleton = join(out, 'critique.json');
  if (!existsSync(skeleton)) {
    writeFileSync(skeleton, `${JSON.stringify({
      images,
      crops: crops.map((c) => ({ id: c.id, seen: '', defects: [] })),
      measured: defects.map((d) => ({ key: defectKey(d), verdict: '', fix: '', reason: '' })),
      scores: Object.fromEntries(AREAS.map((a) => [a, { score: 0, defects: [], why: '' }])),
      signatures: Object.fromEntries(SIGNATURES.map((s) => [s.split(' ')[0], ''])),
      worst: '',
      fixes: [{ file: '', change: '' }],
      verdict: '',
    }, null, 1)}\n`);
  }
  const caps = capsFor(defects, []);
  console.log(`CRITIQUE PREPARED for ${relative(ROOT, dir)}: ${images.length} picture(s), ${crops.length} crop(s), ${defects.length} measured defect(s)`);
  console.log('\nRead every one of these, then fill critique/critique.json in your own words:');
  for (const c of crops) console.log(`  ${c.path}`);
  if (defects.length) {
    console.log('\nMeasured defects (answer each; real ones cap the scores):');
    for (const d of defects) console.log(`  [${d.rule}] ${d.detail || d.path}`);
    console.log(`\nCaps from the measurements: ${Object.entries(caps).map(([a, n]) => `${a} <= ${n}`).join(', ')}`);
  }
  console.log(`\nThen: node scripts/critique.mjs check ${relative(ROOT, dir)}`);
}

function check(dir, quiet = false) {
  const exp = join(dir, 'critique', 'expected.json');
  const got = join(dir, 'critique', 'critique.json');
  if (!existsSync(exp)) return [`not prepared: node scripts/critique.mjs prepare ${relative(ROOT, dir)}`];
  const expected = readJson(exp);
  // The pictures on disk now, not the ones prepare saw: a re-run build is a new build.
  expected.images = pictures(dir).map((file) => ({ file, sha256: sha(readFileSync(join(dir, file))) }));
  let critique;
  try {
    critique = readJson(got);
  } catch (e) {
    return [`critique.json unreadable: ${e.message}`];
  }
  const errs = checkCritique(critique, expected, (p) => existsSync(join(ROOT, p)));
  if (!quiet) {
    if (errs.length) {
      console.log(`CRITIQUE REFUSED for ${relative(ROOT, dir)}: ${errs.length} reason(s)`);
      for (const e of errs) console.log(`  - ${e}`);
    } else {
      console.log(`CRITIQUE ACCEPTED for ${relative(ROOT, dir)}: verdict ${critique.verdict}, ${AREAS.map((a) => `${a} ${critique.scores[a].score}`).join(', ')}`);
    }
  }
  return errs;
}

/** Piece folders under planning/proof with pictures, finished at or after the cutoff. */
function pieces(since) {
  const out = [];
  if (!existsSync(PROOF)) return out;
  for (const m of readdirSync(PROOF)) {
    const mdir = join(PROOF, m);
    if (!statSync(mdir).isDirectory()) continue;
    for (const p of readdirSync(mdir)) {
      const dir = join(mdir, p);
      if (!/^[A-Z]{1,2}\d{2}$/.test(p) || !statSync(dir).isDirectory() || !pictures(dir).length) continue;
      let finished = null;
      try {
        finished = readJson(join(dir, 'manifest.json')).harness?.finishedAt ?? null;
      } catch { /* no manifest: judged by the pictures' time */ }
      const t = finished ? Date.parse(finished) : Math.max(...pictures(dir).map((f) => statSync(join(dir, f)).mtimeMs));
      if (t >= Date.parse(since)) out.push(dir);
    }
  }
  return out;
}

function gate(args) {
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : CUTOFF;
  const owed = pieces(since).filter((dir) => check(dir, true).length > 0);
  if (args.includes('--hook')) {
    if (owed.length) {
      const list = owed.map((d) => relative(ROOT, d)).join(', ');
      console.log(JSON.stringify({
        decision: 'block',
        reason: `These builds have no accepted critique: ${list}. For each one: node scripts/critique.mjs prepare <folder>, Read every crop it lists, write critique/critique.json harshly in your own words, and run node scripts/critique.mjs check <folder> until it is accepted. Then fix the worst defect it names.`,
      }));
    }
    return 0;
  }
  if (!owed.length) {
    console.log(`CRITIQUE GATE CLEAN: every build since ${since} has an accepted critique`);
    return 0;
  }
  console.log(`CRITIQUE GATE: ${owed.length} build(s) owe a critique:`);
  for (const d of owed) console.log(`  ${relative(ROOT, d)}`);
  return 1;
}

const [cmd, target, ...rest] = process.argv.slice(2);
if (cmd === 'prepare' && target) await prepare(resolve(target));
else if (cmd === 'check' && target) process.exit(check(resolve(target)).length ? 1 : 0);
else if (cmd === 'gate') process.exit(gate([target, ...rest].filter(Boolean)));
else if (cmd === 'nudge') {
  // PostToolUse on a Studio capture or Luau run: the picture is judged now, not later.
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'If that produced a picture of a build: Read it now and judge it harshly against planning/STYLE-BIBLE.md before anything else (name at least 5 defects, worst first), then fix the worst. A build in planning/proof needs `node scripts/critique.mjs prepare|check <folder>`; the Stop hook enforces it.' } }));
}
else {
  console.error('usage: node scripts/critique.mjs prepare|check <piece folder> | gate [--hook] [--since <ISO time>]');
  process.exit(2);
}
