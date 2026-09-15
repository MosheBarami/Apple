// The release checker, run against trees that are wrong on purpose — and against the real one.
//
// `scripts/release.mjs` is the wiring: it reads docs/RELEASES.json, CHANGELOG.md, the release
// notes, the published changelog page and package.json, and asks the rules whether they agree.
// Pointed only at this repository it would walk the clean path forever, so every test below builds
// a small tree with `--root`, breaks exactly one thing in it, and watches the run go red.
//
// The last test points it at the REAL repository and requires it to be clean. That is the one test
// here that can go red without anybody editing this file, which is the point of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCb);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function release(args, cwd = ROOT) {
  try {
    const { stdout, stderr } = await execFile(process.execPath, [join(ROOT, 'scripts', 'release.mjs'), ...args], { cwd, encoding: 'utf8' });
    return { exit: 0, out: `${stdout}${stderr}` };
  } catch (e) {
    return { exit: typeof e.code === 'number' ? e.code : 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const LEDGER = {
  releases: [
    {
      version: '0.2.0',
      tag: 'v0.2.0',
      date: '2026-08-30',
      title: 'One model, measured',
      lede: 'One engine, chosen by measurement.',
      changes: [
        { kind: 'removed', breaking: true, text: 'Multi-model routing.' },
        { kind: 'added', text: 'Four spend gates.' },
      ],
    },
    {
      version: '0.1.0',
      tag: 'v0.1.0',
      date: '2026',
      title: 'First public release',
      changes: [{ kind: 'added', text: 'The workspace.' }],
    },
  ],
};

const PAGE = `---
import Base from '../layouts/Base.astro';
---
<h2><span class="release__tag">v0.2</span> One model, measured</h2>
<h2><span class="release__tag">v0.1</span> First public release</h2>
`;

/** A tree in the shape release.mjs reads, with the generated files written by --write. */
async function fixture({ ledger = LEDGER, page = PAGE, version = '0.2.0' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'golem-release-'));
  mkdirSync(join(dir, 'docs'), { recursive: true });
  mkdirSync(join(dir, 'apps', 'site', 'src', 'pages'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'RELEASES.json'), `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileSync(join(dir, 'apps', 'site', 'src', 'pages', 'changelog.astro'), page);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'fixture', version }, null, 2)}\n`);
  // `--write` renders the ledger AND reports the findings a `--check` would; several fixtures
  // below are deliberately wrong somewhere else in the tree, so what is required here is that the
  // rendering happened, not that the tree was already clean.
  const written = await release(['--write', '--root', dir]);
  assert.match(written.out, /wrote CHANGELOG\.md and 2 release note\(s\)/, written.out);
  return dir;
}

test('CONTROL: a tree whose ledger, changelog, notes and page agree is clean', async () => {
  const dir = await fixture();
  try {
    const r = await release(['--check', '--root', dir]);
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /RELEASE LEDGER CLEAN — 2 release\(s\)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a hand-edited CHANGELOG.md is drift, and the run says which line', async () => {
  // The changelog is the one document whose job is to be trusted about the past. An edit that
  // quietly becomes the truth is the failure; the check makes it a finding instead.
  const dir = await fixture();
  try {
    const path = join(dir, 'CHANGELOG.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('Four spend gates.', 'Five spend gates.'));
    const r = await release(['--check', '--root', dir]);
    assert.equal(r.exit, 1);
    assert.match(r.out, /CHANGELOG\.md has drifted from the ledger at line \d+/);
    assert.match(r.out, /Five spend gates/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a missing release note, and a release note for a release that does not exist, are both reported', async () => {
  const dir = await fixture();
  try {
    rmSync(join(dir, 'docs', 'releases', 'v0.1.0.md'));
    writeFileSync(join(dir, 'docs', 'releases', 'v9.9.9.md'), '## v9.9.9 — ghost\n');
    const r = await release(['--check', '--root', dir]);
    assert.equal(r.exit, 1);
    assert.match(r.out, /v0\.1\.0 has no release note/);
    assert.match(r.out, /v9\.9\.9\.md describes a release the ledger does not have/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a page advertising a version the ledger has never heard of fails the check', async () => {
  // The product claiming to have shipped something, with nothing behind the claim.
  const dir = await fixture({ page: `${PAGE}\n<h2><span>v9.9</span> The future</h2>\n` });
  try {
    const r = await release(['--check', '--root', dir]);
    assert.equal(r.exit, 1);
    assert.match(r.out, /advertises v9\.9, which is not in the ledger/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a release the page never announced fails the check too — the other direction', async () => {
  const dir = await fixture({ page: '<h2><span>v0.1</span> First public release</h2>\n' });
  try {
    const r = await release(['--check', '--root', dir]);
    assert.equal(r.exit, 1);
    assert.match(r.out, /v0\.2 is in the ledger and not on the changelog page/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a build declaring a version ahead of the ledger, or one nothing describes, fails', async () => {
  for (const [version, pattern] of [['0.9.0', /ahead of the ledger head/], ['0.1.5', /not a release in the ledger/], ['main', /which is not a version/]]) {
    const dir = await fixture({ version });
    try {
      const r = await release(['--check', '--root', dir]);
      assert.equal(r.exit, 1, `${version} should not pass`);
      assert.match(r.out, pattern);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('a build one release BEHIND the ledger is stated, not failed', async () => {
  // Between a release being written down and the package being bumped, this is the true state of
  // the tree. A check that failed on the truth would be red for the whole window in which it is
  // right — so the lag is printed and the run stays green.
  const dir = await fixture({ version: '0.1.0' });
  try {
    const r = await release(['--check', '--root', dir]);
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /package\.json is at 0\.1\.0; the ledger head is 0\.2\.0 — 1 release\(s\) behind/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a ledger whose version does not follow from its own changes fails the wired check, not just the rule', async () => {
  const bad = JSON.parse(JSON.stringify(LEDGER));
  bad.releases[0].version = '0.1.1';
  bad.releases[0].tag = 'v0.1.1';
  const dir = mkdtempSync(join(tmpdir(), 'golem-release-'));
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    mkdirSync(join(dir, 'apps', 'site', 'src', 'pages'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'RELEASES.json'), JSON.stringify(bad, null, 2));
    writeFileSync(join(dir, 'apps', 'site', 'src', 'pages', 'changelog.astro'), PAGE);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.1.1' }));
    const r = await release(['--check', '--root', dir]);
    assert.equal(r.exit, 1);
    assert.match(r.out, /does not follow from v0\.1\.0/);
    // And nothing was rendered from a ledger that does not validate.
    assert.match(r.out, /RELEASE LEDGER INCONSISTENT/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--next computes the version the unreleased changes produce, and refuses a set it cannot read', async () => {
  const withUnreleased = { ...LEDGER, unreleased: [{ kind: 'fixed', text: 'a bug' }] };
  const dir = await fixture({ ledger: withUnreleased });
  try {
    const r = await release(['--next', '--root', dir]);
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /next: 0\.2\.1   tag: v0\.2\.1/);
  } finally { rmSync(dir, { recursive: true, force: true }); }

  const unreadable = { ...LEDGER, unreleased: [{ kind: 'feat', text: 'a feature' }] };
  const dir2 = await fixture({ ledger: unreadable });
  try {
    const r = await release(['--next', '--root', dir2]);
    assert.equal(r.exit, 1);
    assert.match(r.out, /do not produce a version/);
  } finally { rmSync(dir2, { recursive: true, force: true }); }
});

test('the floor fails a run that evaluated fewer rules than were demanded', async () => {
  // `RELEASE LEDGER CLEAN` is a token an empty checker prints too. The floor is what a gutted
  // version of the script cannot reach.
  const dir = await fixture();
  try {
    const under = await release(['--check', '--root', dir, '--floor', '99']);
    assert.equal(under.exit, 1);
    assert.match(under.out, /RELEASE CHECK UNDER FLOOR/);
    const over = await release(['--check', '--root', dir, '--floor', '6']);
    assert.equal(over.exit, 0, over.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unrecognised flag, and a --floor with no number, are errors rather than silent no-ops', async () => {
  const flag = await release(['--chekc']);
  assert.equal(flag.exit, 2);
  assert.match(flag.out, /unrecognised flag --chekc/);
  const floor = await release(['--check', '--floor']);
  assert.equal(floor.exit, 2);
  assert.match(floor.out, /--floor needs a positive integer/);
});

test('THE REAL TREE: this repository\'s ledger, changelog, notes and published page agree', async () => {
  // The only test in this file that can go red without anyone editing it — which is what makes it
  // the one that is doing work on every suite run.
  const r = await release(['--check', '--floor', '6']);
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /RELEASE LEDGER CLEAN/);
});
