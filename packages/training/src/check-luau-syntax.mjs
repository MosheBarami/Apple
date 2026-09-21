#!/usr/bin/env node
/**
 * DOES THE CORPUS COMPILE? 27,671 rows and nobody had asked.
 *
 * `data/roblox-github-v1/dataset-card.json` says it plainly under `validation`:
 * `"luau_compiler": "not_run"`. Every row carries `training_approved: false` and
 * `semantic_quality_pass: null`, and the card's own `what_this_does_not_establish` lists
 * "That any file is worth training on. Nothing here ran the Luau compiler". This script runs it.
 *
 *   node packages/training/src/check-luau-syntax.mjs [--dir=...] [--limit=N] [--batch=N]
 *
 * It does NOT make anything training-approved. Parsing is the floor, not the bar: a file that
 * parses can still be worthless, and `training_approved` names evidence this script does not
 * produce. What it removes is the possibility of training on bytes that are not Luau at all.
 *
 * THE INSTRUMENT TRAP, WHICH COST THE FIRST DRAFT OF THIS FILE.
 *
 *   $ luau-analyze --formatter=plain bad.luau        # `local x = = 1`
 *   ./bad.luau:1:11-11: (W0) SyntaxError: Expected identifier when parsing expression, got '='
 *   $ echo $?
 *   0
 *
 * luau-analyze exits 0 on a file it could not parse. A gate built on `exitCode === 0` would have
 * called all 27,671 rows clean and been believed, because a clean result is what everyone expects
 * a corpus check to print. The signal is the TEXT — a `SyntaxError:` diagnostic carrying the
 * file's path — and the exit code is ignored on purpose.
 *
 * WHICH DIAGNOSTICS COUNT. Only `SyntaxError`. Roblox source analysed outside Roblox produces
 * `TypeError: Unknown global 'game'` on almost every interesting file, and lint warnings such as
 * `LocalUnused` on most of the rest. Neither says the bytes are not Luau. Counting them would
 * reject the corpus for the crime of being Roblox code.
 *
 * THE CANARY, which is what makes the clean answer worth anything. A file with a known syntax
 * error is appended to EVERY batch. If its diagnostic does not come back, this run did not observe
 * the batch — the analyzer died, or the output was truncated, or the binary changed under us — and
 * the batch is re-run one file at a time rather than recorded as clean. A failure to observe must
 * not render as an observation, and "no SyntaxError in the output" is exactly the shape that
 * failure takes here.
 *
 * THE THIRD OUTCOME, which the first run of this script discovered the hard way. It reached
 * 27,500 of 27,671 rows and then stopped, for twenty-two minutes, with no output and no error.
 * The cause was one row: `underonunicom/IsEvenLuau/IsEven.luau`, a 10.18 MB joke file that
 * hardcodes an answer for every integer. luau-analyze does not finish it. Without a timeout the
 * whole gate hangs on the last batch of the corpus; with a timeout but only two outcomes, the file
 * would have been filed as either parsing or not parsing, and both would be inventions.
 *
 * So a row has three possible fates — `parses`, `does not parse`, and `NOT MEASURED`, the last
 * carrying the reason. `rows_checked` is the sum of all three, and a run that could not read a
 * file says so in the artifact instead of quietly rounding it into the good news.
 *
 * NOTHING IS EXECUTED. `luau-analyze` parses and type-checks; it does not run the program. The
 * corpus is 1,022 strangers' repositories, and `luau file.luau` would run their code.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');

/** A file the analyzer must always be able to fail on. Not valid Luau in any dialect. */
export const CANARY_SOURCE = 'local canary = = 1\n';
export const CANARY_NAME = '__canary__.luau';

/** How long one file may take before this run admits it did not read it. */
export const SINGLE_FILE_TIMEOUT_MS = 30_000;

/**
 * One diagnostic line of `--formatter=plain` output, or null.
 *
 * Shape: `./path/to/file.luau:LINE:COL-COL: (W0) Kind: message`. The path may contain colons —
 * a repository is free to name a directory `a:b` — so the line/col/kind tail is anchored from the
 * RIGHT, and everything before it is the path.
 */
export function parseDiagnosticLine(line) {
  const m = /^(.*):(\d+):(\d+)-(\d+): \(W\d+\) ([A-Za-z]+): (.*)$/.exec(line);
  if (!m) return null;
  return { path: m[1], line: Number(m[2]), column: Number(m[3]), kind: m[5], message: m[6] };
}

/**
 * Group analyzer output by file basename.
 *
 * Basename, not full path: the driver writes each row to a uniquely-named temp file, so the
 * basename IS the key, and it survives whatever prefix the analyzer chooses to print.
 */
export function parseAnalyzerOutput(text) {
  const byFile = new Map();
  for (const line of String(text).split('\n')) {
    const d = parseDiagnosticLine(line);
    if (!d) continue;
    const key = basename(d.path);
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(d);
  }
  return byFile;
}

/** The syntax errors among a file's diagnostics. TypeError and lint kinds are not syntax. */
export function syntaxErrorsOf(diagnostics) {
  return (diagnostics ?? []).filter((d) => d.kind === 'SyntaxError');
}

/**
 * Did this batch's output prove the analyzer was working?
 *
 * True only when the canary's own syntax error came back. Anything else — empty output, a crash,
 * a truncated stream, a binary that silently stopped reporting — is unobserved, not clean.
 */
export function canaryFired(byFile, canaryName = CANARY_NAME) {
  return syntaxErrorsOf(byFile.get(canaryName)).length > 0;
}

/* c8 ignore start -- filesystem and subprocess driver */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const arg = (name, fallback) => {
    const a = process.argv.find((x) => x.startsWith(`--${name}=`));
    return a ? a.split('=')[1] : fallback;
  };
  const DIR = resolve(arg('dir', join(HERE, '..', 'data', 'roblox-github-v1')));
  const ROWS = join(DIR, 'rows.jsonl');
  const BATCH = Number(arg('batch', '200'));
  const LIMIT = Number(arg('limit', '0'));

  if (!existsSync(ROWS)) {
    console.error(`${ROWS} does not exist — run acquire-github-luau.mjs first.`);
    process.exit(2);
  }

  // Prove the binary is there and behaves, before reading 290 MB.
  const work = mkdtempSync(join(tmpdir(), 'luau-syntax-'));
  /**
   * Returns `{ out, timedOut }`. A timeout is NOT an empty result — the canary check would read an
   * empty result as "unobserved" and retry forever, and the caller has to be able to tell the two
   * apart to record the row as not measured.
   */
  const runAnalyzer = (paths, timeoutMs) => {
    try {
      const out = execFileSync('luau-analyze', ['--formatter=plain', ...paths], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024, timeout: timeoutMs,
      });
      return { out, timedOut: false };
    } catch (err) {
      // Non-zero exit is not the signal either way; its stdout still carries the diagnostics.
      const killed = err.killed === true || err.signal === 'SIGTERM';
      return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, timedOut: killed };
    }
  };

  const canaryPath = join(work, CANARY_NAME);
  writeFileSync(canaryPath, CANARY_SOURCE);
  if (!canaryFired(parseAnalyzerOutput(runAnalyzer([canaryPath], SINGLE_FILE_TIMEOUT_MS).out))) {
    console.error('the canary did not fail. luau-analyze is absent, broken, or no longer reports');
    console.error('SyntaxError in --formatter=plain. Every row would be recorded as parsing. Refusing.');
    rmSync(work, { recursive: true, force: true });
    process.exit(3);
  }
  console.error('canary failed as designed — the analyzer reports syntax errors');

  let rows = readFileSync(ROWS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  if (LIMIT > 0) rows = rows.slice(0, LIMIT);
  console.error(`${rows.length} rows to parse, ${BATCH} per invocation`);

  const files = join(work, 'rows');
  mkdirSync(files, { recursive: true });
  const nameOf = (i) => `row-${String(i).padStart(6, '0')}.luau`;

  const failures = [];
  const notMeasured = [];
  let parsed = 0;
  let reRunSingly = 0;

  const describe = (r) => ({
    row_id: r.id,
    source_id: r.provenance.source_id,
    source_path: r.provenance.source_path,
    revision: r.provenance.revision,
    bytes: r.bytes,
    generated: r.generated === true,
  });

  const judge = (indexes, byFile) => {
    for (const i of indexes) {
      const errs = syntaxErrorsOf(byFile.get(nameOf(i)));
      if (errs.length === 0) { parsed += 1; continue; }
      failures.push({
        ...describe(rows[i]),
        first_error: `${errs[0].line}:${errs[0].column}: ${errs[0].message}`,
        syntax_error_count: errs.length,
      });
    }
  };

  // The batch budget scales with the batch so that one slow file cannot be hidden by a big batch.
  const batchTimeout = SINGLE_FILE_TIMEOUT_MS + BATCH * 1000;

  for (let start = 0; start < rows.length; start += BATCH) {
    const indexes = [];
    for (let i = start; i < Math.min(start + BATCH, rows.length); i += 1) {
      writeFileSync(join(files, nameOf(i)), rows[i].text);
      indexes.push(i);
    }
    const paths = indexes.map((i) => join(files, nameOf(i)));
    const batch = runAnalyzer([...paths, canaryPath], batchTimeout);
    const byFile = parseAnalyzerOutput(batch.out);

    if (!batch.timedOut && canaryFired(byFile)) {
      judge(indexes, byFile);
    } else {
      // The batch was not observed — the canary stayed silent, or one file in it never finished.
      // Do not record any of it as clean; ask again, one file at a time, each on its own clock.
      console.error(`  batch at ${start}: ${batch.timedOut ? 'timed out' : 'canary silent'} — re-running ${indexes.length} files singly`);
      reRunSingly += indexes.length;
      for (const i of indexes) {
        const single = runAnalyzer([join(files, nameOf(i)), canaryPath], SINGLE_FILE_TIMEOUT_MS);
        if (single.timedOut) {
          // This is the third outcome. Neither "parses" nor "does not parse" would be true.
          notMeasured.push({ ...describe(rows[i]), reason: `luau-analyze did not finish within ${SINGLE_FILE_TIMEOUT_MS} ms` });
          console.error(`    row ${i} NOT MEASURED: ${rows[i].provenance.source_id}/${rows[i].provenance.source_path} (${rows[i].bytes} bytes)`);
          continue;
        }
        const out = parseAnalyzerOutput(single.out);
        if (!canaryFired(out)) {
          console.error(`the canary stayed silent even alone with row ${i}. The analyzer is not answering. Refusing.`);
          rmSync(work, { recursive: true, force: true });
          process.exit(4);
        }
        judge([i], out);
      }
    }
    for (const i of indexes) rmSync(join(files, nameOf(i)), { force: true });
    if ((start / BATCH) % 20 === 0) console.error(`  ${start + indexes.length}/${rows.length}`);
  }

  const byRepo = new Map();
  for (const f of failures) byRepo.set(f.source_id, (byRepo.get(f.source_id) ?? 0) + 1);

  const report = {
    generated_at: new Date().toISOString(),
    generator: 'packages/training/src/check-luau-syntax.mjs',
    corpus: DIR.replace(`${REPO}/`, ''),
    analyzer: 'luau-analyze --formatter=plain',
    what_this_measures: 'whether the bytes parse as Luau. Nothing else.',
    what_this_does_not_measure: [
      'that a file does anything useful, or anything at all',
      'that a file is current Luau rather than Lua 5.1 that happens to parse',
      'type correctness — TypeError diagnostics are ignored, because Roblox source analysed outside Roblox reports Unknown global on game, workspace and Instance',
    ],
    signal: 'a SyntaxError diagnostic carrying the file path. luau-analyze exits 0 on files it cannot parse, so the exit code is deliberately unused.',
    canary: 'a file with a known syntax error rides in every invocation; a batch whose canary stays silent is re-run one file at a time rather than recorded as clean',
    rows_checked: rows.length,
    rows_that_parse: parsed,
    rows_that_do_not_parse: failures.length,
    rows_not_measured: notMeasured.length,
    not_measured_meaning: `luau-analyze did not finish within ${SINGLE_FILE_TIMEOUT_MS} ms. Neither "parses" nor "does not parse" is known of these rows, and rounding them into either would be an invention.`,
    parse_rate_percent: Number(((parsed / rows.length) * 100).toFixed(2)),
    parse_rate_denominator: 'rows_checked, INCLUDING the not-measured rows. Dropping them from the denominator would raise the headline by pretending the unread rows were read.',
    rows_re_run_singly_after_a_silent_canary_or_timeout: reRunSingly,
    repositories_with_a_failing_file: byRepo.size,
    failures_by_repository: Object.fromEntries([...byRepo].sort((a, b) => b[1] - a[1])),
    failures,
    not_measured: notMeasured,
  };

  const out = join(REPO, 'packages/training/runs/luau-syntax-github-v1.json');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  rmSync(work, { recursive: true, force: true });

  console.error(`\n${parsed} of ${rows.length} rows parse as Luau (${report.parse_rate_percent}%)`);
  console.error(`${failures.length} do not, across ${byRepo.size} repositories`);
  console.error(`${notMeasured.length} NOT MEASURED — the analyzer never finished them`);
  console.error(`wrote ${out}`);
}
/* c8 ignore stop */
