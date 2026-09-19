#!/usr/bin/env node
/**
 * The gauntlet ledger: record a blind comparison, and refuse to let the loop congratulate itself.
 *
 * THE FAILURE THIS EXISTS TO PREVENT. Until now the sentence "this matches the references" was
 * written by the agent that built the thing. That is not a comparison, it is a claim, and the
 * owner is right that it has to die. A gauntlet replaces it with a separate critic that sees both
 * artifacts with the labels stripped and picks one.
 *
 * But a critic that always picks ours is worth exactly as little. So the ledger enforces the
 * property that makes a verdict mean something:
 *
 *   A WIN DOES NOT COUNT UNTIL THE CRITIC HAS ALSO LOST US A ROUND.
 *
 * If a piece has never once been judged worse than its reference, the critic has not been
 * discriminating — it has been agreeing. `--gate` fails on that, on a verdict whose labels were
 * not stripped, and on a reference nobody can fetch again. Same shape as every other guard in this
 * repository: a check that cannot fail is not a check.
 *
 * Usage:
 *   gauntlet-verdict.mjs --record --piece <id> --bar <url-or-name> --winner ours|reference \
 *                        --gap "<the single biggest remaining gap>" --blind
 *   gauntlet-verdict.mjs --gate [--piece <id>]
 *   gauntlet-verdict.mjs --status
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(ROOT, 'docs/gauntlet/verdicts.json');

const load = () => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { rounds: [] });
const save = (data) => {
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(data, null, 2) + '\n');
};

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

function record() {
  const piece = arg('piece');
  const bar = arg('bar');
  const winner = arg('winner');
  const gap = arg('gap');
  if (!piece || !bar || !winner) throw new Error('--piece, --bar and --winner are required');
  if (!['ours', 'reference'].includes(winner)) throw new Error('--winner must be ours or reference');
  // A verdict reached while the critic knew which was which is not a blind verdict, and saying so
  // afterwards does not make it one. The flag is the critic's assertion, recorded so a run that
  // forgot it is visible rather than assumed.
  if (!flag('blind')) throw new Error('--blind is required: a verdict where the critic saw the labels is not a verdict');
  if (winner === 'ours' && (!gap || gap.trim().length < 12)) {
    throw new Error('a win still names the single biggest remaining gap; "nothing" is not an answer a harsh critic gives');
  }

  const data = load();
  data.rounds.push({
    piece, bar, winner,
    gap: gap ?? null,
    blind: true,
    at: new Date().toISOString(),
    round: data.rounds.filter((r) => r.piece === piece).length + 1,
  });
  save(data);
  const forPiece = data.rounds.filter((r) => r.piece === piece);
  console.log(`recorded round ${forPiece.length} for ${piece}: ${winner} won`);
  console.log(summarise(forPiece, piece));
}

function summarise(rounds, piece) {
  const lost = rounds.filter((r) => r.winner === 'reference').length;
  const won = rounds.filter((r) => r.winner === 'ours').length;
  const last = rounds.at(-1);
  const passing = last?.winner === 'ours' && lost > 0;
  return `  ${piece}: ${rounds.length} round(s), ours ${won} / reference ${lost}` +
    (passing ? '  PASSING' : lost === 0 && won > 0
      ? '  NOT PASSING — the critic has never once picked the reference, so it is agreeing rather than judging'
      : '  NOT PASSING');
}

function gate() {
  const data = load();
  const only = arg('piece');
  const pieces = [...new Set(data.rounds.map((r) => r.piece))].filter((p) => !only || p === only);
  if (!pieces.length) {
    console.error(only ? `no rounds recorded for ${only}` : 'no rounds recorded at all — the gauntlet has not run');
    process.exitCode = 1;
    return;
  }
  const failures = [];
  for (const piece of pieces) {
    const rounds = data.rounds.filter((r) => r.piece === piece);
    const last = rounds.at(-1);
    const lost = rounds.filter((r) => r.winner === 'reference').length;
    if (rounds.some((r) => !r.blind)) failures.push(`${piece}: a round was judged with the labels visible`);
    if (rounds.some((r) => !r.bar || r.bar.length < 6)) failures.push(`${piece}: a round names no fetchable bar`);
    if (last.winner !== 'ours') failures.push(`${piece}: the last blind comparison picked the REFERENCE — keep going`);
    else if (lost === 0) {
      failures.push(`${piece}: ours won every round and the reference never won one. A critic that has never ` +
        'preferred the bar is not discriminating; treat this as unproven, not as a pass.');
    }
    console.log(summarise(rounds, piece));
  }
  if (failures.length) {
    console.log('\nFAILING:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nall pieces pass: the last blind comparison picked ours, and the critic has lost us a round before.');
  }
}

function status() {
  const data = load();
  const pieces = [...new Set(data.rounds.map((r) => r.piece))];
  if (!pieces.length) return console.log('no rounds recorded');
  for (const piece of pieces) console.log(summarise(data.rounds.filter((r) => r.piece === piece), piece));
  const open = data.rounds.filter((r) => r.winner === 'ours').map((r) => r.gap).filter(Boolean);
  if (open.length) {
    console.log('\nmost recent named gaps:');
    for (const g of open.slice(-5)) console.log(`  - ${g}`);
  }
}

try {
  if (flag('record')) record();
  else if (flag('gate')) gate();
  else status();
} catch (e) {
  console.error(e.message);
  process.exitCode = 2;
}
