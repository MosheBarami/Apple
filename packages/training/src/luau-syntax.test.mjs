// A corpus check that reads the exit code reports 27,671 clean files it never looked at.
//
// WHY THIS EXISTS. `luau-analyze --formatter=plain` exits 0 on a file it could not parse:
//
//     $ luau-analyze --formatter=plain bad.luau     # contents: local x = = 1
//     ./bad.luau:1:11-11: (W0) SyntaxError: Expected identifier when parsing expression, got '='
//     $ echo $?
//     0
//
// So the obvious gate — run the analyzer, check `exitCode === 0` — passes every row in the corpus
// and prints the answer everyone expects a corpus check to print. The same shape has now cost this
// session repeatedly: an empty grep, a `timeout` that does not exist on macOS and made the shell
// exit 127 with nothing for `grep` to read, a checker reading an uncommitted working tree. In every
// one, a failure to observe rendered as an observation, and the observation was reassuring.
//
// WHAT THIS PROVES, STATED NARROWLY:
//
//   - the real binary, on a real file, really does exit 0 while reporting a SyntaxError, so the
//     premise the gate is built on is checked against the tool rather than asserted about it;
//   - `SyntaxError` is separated from `TypeError` and from lint kinds, because Roblox source
//     analysed outside Roblox reports `Unknown global 'game'` on nearly every interesting file and
//     a gate that counted those would reject the corpus for being Roblox code;
//   - a diagnostic's path is parsed from a line whose PATH may itself contain colons;
//   - the canary predicate is false for empty output — the case where the analyzer died — and
//     false when the canary produced only non-syntax diagnostics;
//   - the committed report's own arithmetic adds up, and its headline claim is not louder than
//     what the run measured.
//
// It proves nothing about whether any file that parses is worth training on. Parsing is the floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  parseDiagnosticLine,
  parseAnalyzerOutput,
  syntaxErrorsOf,
  canaryFired,
  CANARY_SOURCE,
  CANARY_NAME,
} from './check-luau-syntax.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = join(ROOT, 'runs/luau-syntax-github-v1.json');

const SYNTAX = './a/b.luau:1:11-11: (W0) SyntaxError: Expected identifier when parsing expression, got \'=\'';
const TYPE = './a/b.luau:3:11-14: (W0) TypeError: Unknown global \'game\'; consider assigning to it first';
const LINT = './a/b.luau:1:7-7: (W0) LocalUnused: Variable \'x\' is never used; prefix with \'_\' to silence';

test('a diagnostic line is parsed into path, position, kind and message', () => {
  const d = parseDiagnosticLine(SYNTAX);
  assert.equal(d.path, './a/b.luau');
  assert.equal(d.line, 1);
  assert.equal(d.column, 11);
  assert.equal(d.kind, 'SyntaxError');
  assert.match(d.message, /Expected identifier/);
  assert.equal(parseDiagnosticLine('not a diagnostic at all'), null);
});

test('a path containing a colon is not truncated at it', () => {
  // A repository may name a directory `a:b`. Anchoring the line/col tail from the LEFT would cut
  // the path at the first colon and file every diagnostic under the wrong name.
  const d = parseDiagnosticLine('./weird:dir/b.luau:2:3-4: (W0) SyntaxError: bad');
  assert.equal(d.path, './weird:dir/b.luau');
  assert.equal(d.line, 2);
});

test('SyntaxError is separated from TypeError and from lint kinds', () => {
  const byFile = parseAnalyzerOutput([SYNTAX, TYPE, LINT].join('\n'));
  const all = byFile.get('b.luau');
  assert.equal(all.length, 3, 'all three diagnostics should be grouped under the file');
  const syntax = syntaxErrorsOf(all);
  assert.equal(syntax.length, 1);
  assert.equal(syntax[0].kind, 'SyntaxError');
});

test('a file with only TypeError and lint diagnostics has no syntax errors', () => {
  // This is the whole corpus's normal state. Roblox source analysed outside Roblox reports
  // Unknown global on game, workspace and Instance; that is not a claim the bytes are not Luau.
  const byFile = parseAnalyzerOutput([TYPE, LINT].join('\n'));
  assert.equal(syntaxErrorsOf(byFile.get('b.luau')).length, 0);
});

test('a file with no diagnostics at all is absent from the map, and has no syntax errors', () => {
  const byFile = parseAnalyzerOutput('');
  assert.equal(byFile.has('b.luau'), false);
  assert.equal(syntaxErrorsOf(byFile.get('b.luau')).length, 0, 'undefined must be tolerated');
});

test('the canary predicate is false for empty output — the analyzer-died case', () => {
  assert.equal(canaryFired(parseAnalyzerOutput('')), false,
    'empty output must read as UNOBSERVED, never as clean');
});

test('the canary predicate is false when the canary produced only a lint warning', () => {
  const only = `./tmp/${CANARY_NAME}:1:7-7: (W0) LocalUnused: Variable 'canary' is never used; prefix with '_' to silence`;
  assert.equal(canaryFired(parseAnalyzerOutput(only)), false,
    'the canary must be proven to still produce a SYNTAX error, not merely to be seen');
});

test('the canary predicate is true when the canary reported a syntax error', () => {
  const fired = `./tmp/${CANARY_NAME}:1:16-16: (W0) SyntaxError: Expected identifier when parsing expression, got '='`;
  assert.equal(canaryFired(parseAnalyzerOutput(fired)), true);
});

// ---------------------------------------------------------------------------------------------
// The premise, checked against the tool rather than asserted about it.
// ---------------------------------------------------------------------------------------------

const haveAnalyzer = (() => {
  try { execFileSync('which', ['luau-analyze'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

test('luau-analyze exits 0 on a file it cannot parse, which is why the exit code is unused',
  { skip: haveAnalyzer ? false : 'luau-analyze is not installed in this environment' }, () => {
    const work = mkdtempSync(join(tmpdir(), 'luau-syntax-test-'));
    try {
      const bad = join(work, CANARY_NAME);
      writeFileSync(bad, CANARY_SOURCE);
      let exitCode = null;
      let out = '';
      try {
        out = execFileSync('luau-analyze', ['--formatter=plain', bad], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        exitCode = 0;
      } catch (err) {
        exitCode = err.status;
        out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
      }
      assert.equal(canaryFired(parseAnalyzerOutput(out)), true,
        'the analyzer did not report a SyntaxError on source that is not Luau in any dialect');
      assert.equal(exitCode, 0,
        'luau-analyze now exits non-zero on a syntax error. The gate still works — it reads the '
        + 'text — but this test is the record of WHY it reads the text, so update the comment '
        + 'rather than deleting the assertion.');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

test('Roblox globals produce TypeError, not SyntaxError — the corpus must not fail for being Roblox',
  { skip: haveAnalyzer ? false : 'luau-analyze is not installed in this environment' }, () => {
    const work = mkdtempSync(join(tmpdir(), 'luau-syntax-test-'));
    try {
      const rbx = join(work, 'rbx.luau');
      writeFileSync(rbx, 'local p = Instance.new("Frame")\np.Parent = game:GetService("Players")\nreturn p\n');
      let out = '';
      try {
        out = execFileSync('luau-analyze', ['--formatter=plain', rbx], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) { out = `${err.stdout ?? ''}${err.stderr ?? ''}`; }
      const diags = parseAnalyzerOutput(out).get('rbx.luau') ?? [];
      assert.equal(syntaxErrorsOf(diags).length, 0,
        'ordinary Roblox source was reported as a syntax error');
      assert.ok(diags.some((d) => d.kind === 'TypeError'),
        'expected Unknown global TypeErrors, without which this test would pass on a silent analyzer');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

// ---------------------------------------------------------------------------------------------
// The committed report.
// ---------------------------------------------------------------------------------------------

test('the committed report adds up and does not overstate what it measured',
  { skip: existsSync(REPORT) ? false : 'runs/luau-syntax-github-v1.json is not in this checkout' }, () => {
    const r = JSON.parse(readFileSync(REPORT, 'utf8'));
    assert.equal(r.rows_that_parse + r.rows_that_do_not_parse + r.rows_not_measured, r.rows_checked,
      'parsed + failed + not-measured must equal checked — a row the analyzer never finished is a '
      + 'third outcome, and any arithmetic that omits it has rounded an unread row into a read one');
    assert.equal(r.failures.length, r.rows_that_do_not_parse,
      'the failure list must be the whole failure count, not a sample of it');
    assert.equal(r.not_measured.length, r.rows_not_measured);
    for (const n of r.not_measured) {
      assert.ok(n.reason, `${n.row_id} is recorded as not measured without saying why`);
    }
    // The headline must not be inflated by dropping the rows nobody could read.
    assert.equal(
      Number(((r.rows_that_parse / r.rows_checked) * 100).toFixed(2)), r.parse_rate_percent,
      'the parse rate denominator excludes the not-measured rows, which raises the headline by '
      + 'pretending the unread rows were read',
    );
    assert.equal(
      Object.values(r.failures_by_repository).reduce((a, b) => a + b, 0),
      r.rows_that_do_not_parse,
      'the per-repository tally must account for every failing row',
    );
    assert.equal(Object.keys(r.failures_by_repository).length, r.repositories_with_a_failing_file);
    assert.ok(r.rows_checked > 0, 'a report over zero rows would show a 0/0 rate and look clean');
    // The claim must stay narrow. Parsing is not approval, and the report must say so itself.
    assert.match(r.what_this_measures, /parse/i);
    assert.ok(Array.isArray(r.what_this_does_not_measure) && r.what_this_does_not_measure.length >= 2);
    assert.match(r.signal, /exit code/i,
      'the report must record that the exit code is unused, or the next reader will trust it');
  });
