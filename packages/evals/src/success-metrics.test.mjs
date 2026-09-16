// The success-metrics report is not allowed to invent a number.
//
// The report's whole value is that an unmeasurable metric prints "not measured, because <reason>"
// instead of a plausible figure — which is a promise, and a promise nothing checks is the exact
// shape of defect this repository keeps finding. These tests hold the promise against the report's
// own data, not against its text.
//
// Offline. Importing the report runs it; it prints nothing unless invoked as a script.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPORT } from './success-metrics.mjs';
import { BRIEF, REPO } from './acceptance.mjs';

test('every measure is either a real number or a stated reason, and never both and never neither', () => {
  assert.ok(REPORT.analytics.measures.length > 0, 'the report measures nothing at all');
  for (const m of REPORT.analytics.measures) {
    assert.ok(m.state === 'measured' || m.state === 'not-measured', `measure ${m.item} has state "${m.state}"`);
    if (m.state === 'measured') {
      assert.equal(typeof m.value, 'number', `measure ${m.item} ("${m.name}") is measured but its value is not a number`);
      // EVERY MEASURE THIS REPORT CAN COMPUTE IS A COUNT. A fractional value here means a rate
      // was estimated rather than counted, which is the one thing the report promises not to do —
      // and a plausible fraction is exactly what an invented metric looks like.
      assert.ok(
        Number.isInteger(m.value),
        `measure ${m.item} ("${m.name}") reported ${m.value}; every measure this report can compute is a count, so a fraction is a figure that was not counted`,
      );
      assert.ok(m.value >= 0, `measure ${m.item} reported a negative count`);
      assert.ok(m.unit && m.unit.length > 0, `measure ${m.item} reported a bare number with no unit`);
      assert.ok(m.how && m.how.length > 0, `measure ${m.item} does not say how it was measured`);
      // Where the things counted can be enumerated, the number is checked against the list rather
      // than believed. A count that has drifted from what it counts is the cheapest wrong number.
      if (m.counted) {
        assert.equal(
          m.value,
          m.counted.length,
          `measure ${m.item} reports ${m.value} and names ${m.counted.length} things: ${m.counted.join(', ')}`,
        );
      }
    } else {
      assert.equal(m.value, undefined, `measure ${m.item} is unmeasured and carries a value anyway`);
      assert.ok(
        typeof m.because === 'string' && m.because.length > 30,
        `measure ${m.item} ("${m.name}") prints "not measured" with no real reason`,
      );
    }
  }
});

test('a modelled figure is never offered as the measurement it stands in for', () => {
  for (const m of REPORT.analytics.measures) {
    if (m.state !== 'not-measured' || !m.note) continue;
    // A note may carry a modelled number, but only under a reason — so the reason must exist and
    // the note must say what it is not.
    assert.ok(m.because.length > 30, `measure ${m.item} has a note and no reason above it`);
    assert.ok(
      /not from users|not what|not this|must not be quoted|models against/i.test(m.note),
      `measure ${m.item}'s note carries a figure without saying what it is not: ${m.note}`,
    );
  }
});

test('the report says which commit it measured', () => {
  assert.ok(/^[0-9a-f]{40}$/.test(REPORT.provenance.commit ?? ''), 'the report does not name a commit');
  assert.ok(!Number.isNaN(Date.parse(REPORT.provenance.measuredAt)), 'the report does not name a date');
  assert.equal(typeof REPORT.provenance.treeDirty, 'boolean', 'the report does not say whether the tree was dirty');
});

test('the acceptance tally accounts for every scenario the brief names', () => {
  const t = REPORT.acceptance.tally;
  assert.equal(t.total, BRIEF.itemCount, `the brief names ${BRIEF.itemCount} scenarios; the report tallied ${t.total}`);
  assert.equal(t.pass + t.fail + t.skip, t.total, 'the pass/fail/skip counts do not add up to the scenario count');
  for (const s of REPORT.acceptance.scenarios) {
    if (s.verdict === 'skip') {
      assert.ok(s.reason && s.reason.length > 40, `scenario ${s.n} is skipped with no real reason`);
    } else {
      assert.ok(s.checks && s.checks.length > 0, `scenario ${s.n} does not say what it checked`);
      assert.ok(s.notChecked && s.notChecked.length > 0, `scenario ${s.n} does not say what it left unchecked`);
    }
  }
});

test('the completion figure is recomputed from the marks, not copied from the header', () => {
  const c = REPORT.completion;
  // `total` is EVERY item; the four counts must account for all of them, not-planned included.
  // This read `done + partial + notFound + other` and fired on the very first ⊘ ever written —
  // 1200 !== 1199 — because that mark leaves the denominator but not the file.
  assert.equal(
    c.overall.total,
    c.overall.done + c.overall.partial + c.overall.notFound + c.overall.notPlanned + c.overall.other,
  );
  assert.equal(c.overall.counted, c.overall.total - c.overall.notPlanned, 'the counted set is everything except ⊘');
  assert.ok(c.overall.total > 0, 'the checklist parsed to zero items — the report would print a number from nothing');
  assert.ok(c.overall.weightedPct >= 0 && c.overall.weightedPct <= 100, 'the weighted figure is not a percentage');
});

// ---------------------------------------------------------------------------------------------
// THE HEADER IS A COPY OF THE MARKS, AND THE COPY IS THE ONE THAT ROTS.
//
// `docs/backlog/CHECKLIST-V2.md` carries its own totals in two places: one line at the top of the
// file and one beside every section heading. Both are hand-typed, both are read by a human who
// will never count 1,200 lines to check them, and both were wrong the moment a single mark moved.
// The file's own preamble says so — "A total typed at the top of a 3,440-line file is a number
// that will disagree with the lines below it" — and then asks the reader to trust it anyway.
//
// These tests are the thing that stops it. The header is not an assertion about the product; it
// is an assertion about the file, and a file can check that against itself. The report above
// PRINTS the disagreement; this one FAILS on it, because a disagreement nobody is stopped by is a
// disagreement that ships.
//
// The parse is deliberately independent of the report's parse and is then checked against it, so
// this file cannot drift into agreeing with a broken parser: if the two ever read the same marks
// differently, the first assertion below goes red rather than both of them going quiet.
// ---------------------------------------------------------------------------------------------
const CHECKLIST_PATH = join(REPO, BRIEF.file);
const CHECKLIST_TEXT = readFileSync(CHECKLIST_PATH, 'utf8');
const WEIGHT = { '✓': 1, '~': 0.5, '☐': 0 };

/** Every `## NN. TITLE — PP% ✓D ~P ☐N` heading and the marks that follow it, until the next one. */
function parseSections(text) {
  const sections = [];
  let current = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s/.test(line)) {
      // `⊘` is optional and trailing: a section with nothing not-planned reads exactly as before.
      const head = /^##\s+(\d+)\.\s+(.+?)\s+—\s+(\d+)%\s+✓(\d+)\s+~(\d+)\s+☐(\d+)(?:\s+⊘(\d+))?\s*$/.exec(line);
      // A heading that no longer matches would silently stop being checked, which is the failure
      // this file exists to prevent — so an unreadable heading is a red line, not a skipped one.
      assert.ok(head, `line ${i + 1} is a section heading this test cannot read, so its total would go unchecked: ${line}`);
      current = {
        number: +head[1],
        title: head[2],
        line: i + 1,
        claim: { pct: +head[3], done: +head[4], partial: +head[5], notFound: +head[6], notPlanned: +(head[7] ?? 0) },
        marks: [],
      };
      sections.push(current);
      continue;
    }
    const item = /^-\s+\[(.)\]\s+(.+)$/.exec(line);
    if (item && current) current.marks.push(item[1]);
  }
  return sections;
}

function tallyMarks(marks) {
  const t = { done: 0, partial: 0, notFound: 0, notPlanned: 0, other: 0, weight: 0 };
  for (const m of marks) {
    if (m === '⊘') { t.notPlanned += 1; continue; }
    if (m === '✓') t.done += 1;
    else if (m === '~') t.partial += 1;
    else if (m === '☐') t.notFound += 1;
    else t.other += 1;
    t.weight += WEIGHT[m] ?? 0;
  }
  t.total = marks.length;
  return t;
}

const SECTIONS_UNDER_TEST = parseSections(CHECKLIST_TEXT);
const ALL_MARKS = SECTIONS_UNDER_TEST.flatMap((s) => s.marks);
const WHOLE_FILE = tallyMarks(ALL_MARKS);

test('this test reads the same marks the report reads', () => {
  const c = REPORT.completion.overall;
  assert.deepEqual(
    { done: WHOLE_FILE.done, partial: WHOLE_FILE.partial, notFound: WHOLE_FILE.notFound, other: WHOLE_FILE.other, total: WHOLE_FILE.total },
    { done: c.done, partial: c.partial, notFound: c.notFound, other: c.other, total: c.total },
    'the report and this test disagree about what is written in the checklist; one of the two parsers is wrong and neither number can be trusted until they agree',
  );
});

test('no mark in the checklist is a character the weighting does not know', () => {
  // An unrecognised mark weighs 0, which silently reads as ☐ — a typo would quietly deflate the
  // figure and nothing above would say so.
  assert.equal(WHOLE_FILE.other, 0, `${WHOLE_FILE.other} item(s) carry a mark that is not ✓, ~, ☐ or ⊘`);
});

test('NOT-PLANNED IS THE ONLY MARK THAT LEAVES THE DENOMINATOR, so every one of them cites a decision', () => {
  //[[ `⊘` is the one mark that raises the percentage by REMOVING work rather than doing it, which
  //   makes it the cheapest possible way to make this number look better. The price is an ADR: the
  //   owner's own decision, written down, with an id the item names.
  //
  //   `docs/design/TENANCY.md` set this out before there was a mark for it — "What must NOT happen
  //   is the fourth option: leaving them 'not started' so the number stays at 1,200 while nobody
  //   intends to build them" — and ADR-021 is the first answer to it: 77 items describing
  //   organizations, workspaces and seats, for a product the owner has decided is one developer
  //   sharing per project.
  //
  //   Two halves, because either alone can be satisfied without the other: the mark must name a
  //   decision, and the decision must exist in the log. ]]
  const md = readFileSync(CHECKLIST_PATH, 'utf8');
  const lines = md.split('\n');
  const orphans = [];
  const cited = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^-\s+\[⊘\]/.test(lines[i])) continue;
    let body = lines[i];
    for (let j = i + 1; j < lines.length && !/^(-\s+\[|#)/.test(lines[j]); j += 1) body += '\n' + lines[j];
    const adr = /ADR-\d{3}/.exec(body);
    if (adr) cited.add(adr[0]);
    else orphans.push(lines[i].replace(/^-\s+\[⊘\]\s*/, '').slice(0, 70));
  }
  assert.deepEqual(orphans, [], 'a not-planned mark with no ADR is a deletion, not a decision');

  const decisions = readFileSync(new URL('../../../docs/DECISIONS.md', import.meta.url), 'utf8');
  for (const id of cited) {
    assert.match(decisions, new RegExp(`^##\\s+${id}\\b`, 'm'), `${id} is cited by a ⊘ item and is not in docs/DECISIONS.md`);
  }
});

test('the total typed at the top of the checklist is the total of the marks below it', () => {
  const claim = REPORT.completion.headerClaim;
  assert.ok(claim, 'the checklist no longer carries a header total this test can read — the check would pass by not looking');
  assert.equal(claim.done, WHOLE_FILE.done, `the header says ✓ ${claim.done}; the marks say ✓ ${WHOLE_FILE.done}`);
  assert.equal(claim.partial, WHOLE_FILE.partial, `the header says ~ ${claim.partial}; the marks say ~ ${WHOLE_FILE.partial}`);
  assert.equal(claim.notFound, WHOLE_FILE.notFound, `the header says ☐ ${claim.notFound}; the marks say ☐ ${WHOLE_FILE.notFound}`);
  assert.equal(claim.notPlanned, WHOLE_FILE.notPlanned, `the header says ⊘ ${claim.notPlanned}; the marks say ⊘ ${WHOLE_FILE.notPlanned}`);
  //[[ THE DENOMINATOR EXCLUDES ⊘, and this line divided by the whole file.
  //
  //   Dividing by `total` is arithmetically identical to marking all 73 not-planned items ☐ — the
  //   exact outcome ADR-021 exists to prevent — so the assertion meant to hold the header honest
  //   was demanding the dishonest number. It disagreed with the report (`counted`) and with the
  //   section-heading test two tests below (`t.total - t.notPlanned`), and nothing noticed because
  //   nothing was marked ⊘ when it was written.
  //
  //   That is the gap in how I falsified it: I proved the new assertion could turn RED with a
  //   planted mark, then removed the mark and committed. A suite proven able to fail was never once
  //   run green in the state it was built for. ]]
  const counted = WHOLE_FILE.total - WHOLE_FILE.notPlanned;
  const weighted = +((WHOLE_FILE.weight / counted) * 100).toFixed(1);
  assert.equal(
    claim.weightedPct,
    weighted,
    `the header says weighted ${claim.weightedPct}%; ✓=1 ~=0.5 ☐=0 over ${counted} counted items `
      + `(${WHOLE_FILE.total} less ${WHOLE_FILE.notPlanned} not planned) gives ${weighted}%`,
  );
});

test('every section heading is the total of the marks under that heading', () => {
  const wrong = [];
  for (const s of SECTIONS_UNDER_TEST) {
    const t = tallyMarks(s.marks);
    // NOT-PLANNED ITEMS ARE OUT OF THE DENOMINATOR, here as in the report — see ADR-021. A section
    // that is entirely not-planned has no percentage at all, which is the truthful answer: there is
    // nothing to be a fraction of.
    const counted = t.total - t.notPlanned;
    const pct = counted ? Math.round((t.weight / counted) * 100) : 0;
    if (
      t.done !== s.claim.done ||
      t.partial !== s.claim.partial ||
      t.notFound !== s.claim.notFound ||
      t.notPlanned !== s.claim.notPlanned ||
      pct !== s.claim.pct
    ) {
      wrong.push(
        `line ${s.line} — section ${s.number} says ${s.claim.pct}% ✓${s.claim.done} ~${s.claim.partial} ☐${s.claim.notFound}` +
          `${s.claim.notPlanned ? ` ⊘${s.claim.notPlanned}` : ''}, ` +
          `its ${t.total} marks say ${pct}% ✓${t.done} ~${t.partial} ☐${t.notFound}${t.notPlanned ? ` ⊘${t.notPlanned}` : ''}`,
      );
    }
  }
  assert.deepEqual(wrong, [], `${wrong.length} section heading(s) disagree with their own items:\n  ${wrong.join('\n  ')}`);
});

test('the checklist holds the number of sections and items it says it holds', () => {
  const prose = /(\d+)\s+sections,\s+([\d,]+)\s+items/.exec(CHECKLIST_TEXT);
  assert.ok(prose, 'the checklist no longer states how many sections and items it has');
  assert.equal(SECTIONS_UNDER_TEST.length, +prose[1], `the file says ${prose[1]} sections and carries ${SECTIONS_UNDER_TEST.length}`);
  assert.equal(WHOLE_FILE.total, +prose[2].replace(/,/g, ''), `the file says ${prose[2]} items and carries ${WHOLE_FILE.total}`);
});
