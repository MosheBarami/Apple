// node --test scripts/owner-dashboard/cc/repo.test.mjs
// Network-free: repos() runs with {health:false}; review() is only driven down its rejecting paths
// plus one approve into a scratch file, so the real review.json and OWNER_REVIEW_REJECTS.md are untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFindings, isAiCommit, review, tree, liveRef } from './repo.mjs';
import { repos, githubSlug } from './deps.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('findings parser reads open/closed and severity, ignores the format template line', () => {
  const text = [
    '- [open|closed][critical|high|medium|low] F-NNN: one-line observation — evidence: <where>',
    '- [open][high] F-059: The pill says Connected while Studio is closed — evidence: screenshot',
    '- [closed][critical] F-001: Build died twice',
    '  - [open][low] F-120: indented still counts',
    '- [OPEN][Medium] F-121: case does not matter',
    'F-122 mentioned in prose is not a finding',
  ].join('\n');
  const f = parseFindings(text);
  assert.deepEqual(f.open, { critical: 0, high: 1, medium: 1, low: 1 });
  assert.equal(f.closed, 1);
  assert.equal(f.list.length, 4);
  assert.deepEqual(f.list[0], { id: 'F-059', severity: 'high', status: 'open',
    title: 'The pill says Connected while Studio is closed — evidence: screenshot' });
  const long = parseFindings(`- [open][low] F-200: ${'x'.repeat(500)}`);
  assert.equal(long.list[0].title.length, 140);
});

test('AI-commit classifier: trailer (any case), author or committer name', () => {
  assert.equal(isAiCommit({ message: 'fix: x\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>', author: 'Moshe', committer: 'Moshe' }), true);
  assert.equal(isAiCommit({ message: 'x\n\nco-authored-by: claude <a@b>', author: 'Moshe', committer: 'Moshe' }), true);
  assert.equal(isAiCommit({ message: 'plain', author: 'Claude', committer: 'Moshe' }), true);
  assert.equal(isAiCommit({ message: 'plain', author: 'Moshe', committer: 'claude-bot' }), true);
  assert.equal(isAiCommit({ message: 'plain commit by a human', author: 'Moshe Barami', committer: 'Moshe Barami' }), false);
  assert.equal(isAiCommit({ message: 'Co-Authored-By: Someone Else <x@y>', author: 'Moshe', committer: 'Moshe' }), false);
});

test('review() refuses a non-hex sha, an unknown sha and a bad verdict', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-review-'));
  const opts = { reviewPath: path.join(scratch, 'review.json'), rejectsPath: path.join(scratch, 'rejects.md') };
  const bad = await review({ sha: 'not-a-sha; rm -rf /', verdict: 'approve' }, opts);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /[֐-׿]/);
  const unknown = await review({ sha: 'deadbeef'.repeat(5), verdict: 'reject' }, opts);
  assert.equal(unknown.ok, false);
  const head = execFileSync('git', ['rev-parse', await liveRef()], { cwd: REPO, encoding: 'utf8' }).trim();
  const verdict = await review({ sha: head, verdict: 'maybe' }, opts);
  assert.equal(verdict.ok, false);
  assert.equal(fs.existsSync(opts.reviewPath), false, 'nothing is written on a refusal');
  assert.equal(fs.existsSync(opts.rejectsPath), false);
  const ok = await review({ sha: head.slice(0, 10), verdict: 'reject' }, opts);
  assert.equal(ok.ok, true);
  assert.equal(ok.sha, head);
  assert.equal(JSON.parse(fs.readFileSync(opts.reviewPath, 'utf8'))[head].verdict, 'reject');
  assert.match(fs.readFileSync(opts.rejectsPath, 'utf8'), new RegExp(`^- \\[ \\] \\S+ reject ${head} .+ — the agent must revert this commit and report$`, 'm'));
});

test('tree() has Hebrew text for every top-level directory on the live branch', async () => {
  const live = await liveRef();
  const top = execFileSync('git', ['ls-tree', '-d', '--name-only', live], { cwd: REPO, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  assert.ok(top.length > 5);
  const t = await tree();
  assert.equal(t.ok, true);
  for (const name of top) {
    const node = t.root.dirs.find((d) => d.name === name);
    assert.ok(node, `${name} missing from tree()`);
    assert.match(node.he || '', /[֐-׿]/, `${name} has no Hebrew description in folders.json`);
    assert.ok(node.en, `${name} has no English description`);
  }
});

test('deps derivation finds more than 50 external GitHub repositories, network-free', async () => {
  const r = await repos({ health: false });
  assert.equal(r.ok, true);
  assert.ok(r.repos.length > 50, `only ${r.repos.length} repos derived`);
  const keys = r.repos.map((x) => `${x.owner}/${x.name}`.toLowerCase());
  assert.equal(new Set(keys).size, keys.length, 'deduped by lowercase owner/name');
  for (const s of ['npm', 'corpus', 'training', 'actions']) assert.ok(r.counts.bySource[s] > 0, `no ${s} repos`);
  assert.ok(r.repos.some((x) => x.npm === 'hono' && x.owner.toLowerCase() === 'honojs'));
});

test('githubSlug normalises the repository field shapes npm uses', () => {
  assert.deepEqual(githubSlug('git+https://github.com/honojs/hono.git'), { owner: 'honojs', name: 'hono' });
  assert.deepEqual(githubSlug({ type: 'git', url: 'https://github.com/facebook/react.git', directory: 'packages/react' }), { owner: 'facebook', name: 'react' });
  assert.deepEqual(githubSlug('github:vitejs/vite'), { owner: 'vitejs', name: 'vite' });
  assert.deepEqual(githubSlug('cure53/DOMPurify'), { owner: 'cure53', name: 'DOMPurify' });
  assert.deepEqual(githubSlug('git@github.com:panva/jose.git'), { owner: 'panva', name: 'jose' });
  assert.equal(githubSlug('https://gitlab.com/a/b'), null);
});
