#!/usr/bin/env node
// bootstrap.mjs — restore the corpus checkouts a fresh clone does not have.
//
// THE PROBLEM THIS FIXES. `packages/corpus/raw/` is gitignored, because it holds ~49MB
// of third-party repositories whose redistribution rights we do not have. The
// .gitignore has always said that content is "re-fetchable from raw/manifest.json" —
// but the ignore rule swallowed the manifest too, so a fresh clone had nothing to
// fetch FROM. The committed metadata described 38 checkouts that did not exist and
// could not be recreated: `data/sources.json` names urls, but not the COMMITS the
// rules, hashes, scan verdicts and quality scores were computed against.
//
// So the lock is now tracked and this reads it. The distinction that makes that
// lawful: the manifest is OUR metadata about third-party repositories — a url, a
// commit SHA, an SPDX id we read out of their LICENSE — and none of their content.
//
// WHAT THIS DOES NOT DO. It does not execute anything it downloads. It clones at a
// pinned SHA and stops; every consumer downstream (scan, hash, tag, extract) reads
// files as data. Third-party Roblox code is never run during acquisition, and
// GIT_LFS_SKIP_SMUDGE keeps LFS media as pointer files rather than payloads.
//
// It also refuses to fetch anything the classifier has not cleared, which is why the
// plan is filtered against `data/sources.json` rather than trusted from the lock
// alone: two files have to agree before a byte moves.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');
const LOCK = path.join(RAW, 'manifest.json');
const SOURCES_JSON = path.join(ROOT, 'data', 'sources.json');

/** Licence classes a checkout may be fetched under. Mirrors fetch.mjs deliberately:
 *  a source that has not been through classification cannot be fetched at all. */
export const FETCHABLE_CLASSES = new Set(['COMMERCIAL_REUSABLE', 'COPYLEFT', 'ATTRIBUTION_REQUIRED']);

const GIT_ENV = { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' };

function git(args, opts = {}) {
  return execFileSync('git', args, {
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: GIT_ENV, ...opts,
  });
}

function gitQuiet(args) {
  try { return git(args).trim(); } catch { return null; }
}

/**
 * What a bootstrap would do, as data. Pure: no filesystem, no network.
 *
 * Separated from the doing so the decisions can be tested. The interesting ones are
 * all refusals — an entry with no SHA cannot be reproduced, and an entry the corpus
 * has not classified must not be fetched however plausible its url looks.
 *
 * @param lock      the parsed raw/manifest.json
 * @param classOf   Map url -> licence class, from data/sources.json
 * @param present   Map dirName -> SHA currently checked out (empty on a fresh clone)
 */
export function planBootstrap(lock, classOf, present = new Map()) {
  const plan = { clone: [], checkout: [], satisfied: [], refused: [] };
  const sources = lock?.sources ?? {};

  for (const name of Object.keys(sources).sort()) {
    const entry = sources[name] ?? {};
    const url = typeof entry.url === 'string' ? entry.url.replace(/\.git$/, '') : null;
    const sha = typeof entry.sha === 'string' && /^[0-9a-f]{40}$/.test(entry.sha) ? entry.sha : null;

    //[[ THE KEY BECOMES A DIRECTORY, so it is validated like one.
    //
    //   `name` comes straight from the lock's object keys and was used as
    //   `path.join(RAW, name)` unchecked. A key of `../../../../tmp/pwn` resolves
    //   outside packages/corpus/raw/ and this would then git-init a third-party tree
    //   there. It needs a hostile manifest to reach — a tracked, generated, 544-line
    //   JSON file, which is exactly the kind a reviewer skims. ]]
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') {
      plan.refused.push({ name, why: 'the checkout name is not a plain directory name' });
      continue;
    }
    if (!url) {
      plan.refused.push({ name, why: 'the lock records no url, so there is nothing to fetch' });
      continue;
    }
    //[[ AND THE URL IS A URL, not a git transport.
    //
    //   Only the licence class was checked, never the scheme. Git's `ext::` transport
    //   RUNS its argument as a command during fetch, which would have falsified this
    //   file's own header claim that it executes nothing it downloads. The two-file
    //   agreement gate is a licence control, not an authentication one, and both files
    //   are editable in one PR. ]]
    if (!/^https:\/\//.test(url)) {
      plan.refused.push({ name, why: `the url is not https (${url.slice(0, 24)}…), so it is not a repository to clone` });
      continue;
    }
    if (!sha) {
      // Without a commit, "reproduce" means "fetch whatever HEAD is today", which is
      // not reproduction. Refusing is the honest answer.
      plan.refused.push({ name, why: 'the lock records no 40-character commit SHA, so the state cannot be reproduced' });
      continue;
    }
    const licenceClass = classOf.get(url) ?? null;
    if (!FETCHABLE_CLASSES.has(licenceClass)) {
      plan.refused.push({
        name,
        why: licenceClass
          ? `classified ${licenceClass}, which is not fetchable`
          : 'not present in data/sources.json, so it has never been through licence classification',
      });
      continue;
    }

    const have = present.get(name) ?? null;
    if (have === sha) plan.satisfied.push({ name, url, sha });
    else if (have) plan.checkout.push({ name, url, sha, from: have });
    else plan.clone.push({ name, url, sha });
  }
  return plan;
}

/** Licence class per url, read from the tracked corpus ledger. */
export function loadClassOf(sourcesJson = SOURCES_JSON) {
  if (!existsSync(sourcesJson)) return new Map();
  const parsed = JSON.parse(readFileSync(sourcesJson, 'utf8'));
  const records = parsed.records ? Object.values(parsed.records) : [];
  const out = new Map();
  for (const r of records) {
    if (typeof r.url === 'string' && r.licence?.class) {
      out.set(r.url.replace(/\.git$/, ''), r.licence.class);
    }
  }
  return out;
}

/** SHA per checkout currently on disk. */
function presentShas() {
  const out = new Map();
  if (!existsSync(RAW)) return out;
  for (const name of readdirSync(RAW)) {
    const dir = path.join(RAW, name);
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, '.git'))) continue;
    const sha = gitQuiet(['-C', dir, 'rev-parse', 'HEAD']);
    if (sha) out.set(name, sha);
  }
  return out;
}

/** Clone at a pinned commit without downloading the whole history. */
function cloneAt(url, sha, dir) {
  git(['init', '--quiet', dir]);
  git(['-C', dir, 'remote', 'add', 'origin', url]);
  try {
    git(['-C', dir, 'fetch', '--quiet', '--depth', '1', 'origin', sha]);
    git(['-C', dir, 'checkout', '--quiet', 'FETCH_HEAD']);
  } catch {
    // Some hosts refuse to serve an arbitrary SHA to a shallow fetch. Fall back to a
    // full fetch of the default branch and check the commit out of that.
    git(['-C', dir, 'fetch', '--quiet', 'origin']);
    git(['-C', dir, 'checkout', '--quiet', sha]);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (!existsSync(LOCK)) {
    console.error('[bootstrap] packages/corpus/raw/manifest.json is missing. It is tracked;');
    console.error('            a checkout that lacks it is not a clean one.');
    return 1;
  }
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  const plan = planBootstrap(lock, loadClassOf(), presentShas());

  const todo = plan.clone.length + plan.checkout.length;
  console.log(
    `[bootstrap] ${Object.keys(lock.sources ?? {}).length} in the lock: ` +
      `${plan.satisfied.length} already at the pinned commit, ${plan.clone.length} to clone, ` +
      `${plan.checkout.length} to move, ${plan.refused.length} refused`,
  );
  for (const r of plan.refused) console.log(`  refused  ${r.name}: ${r.why}`);

  if (args.has('--plan')) {
    for (const c of plan.clone) console.log(`  clone    ${c.name.padEnd(44)} ${c.sha.slice(0, 12)} ${c.url}`);
    for (const c of plan.checkout) console.log(`  checkout ${c.name.padEnd(44)} ${c.from.slice(0, 12)} -> ${c.sha.slice(0, 12)}`);
    return 0;
  }
  if (todo === 0) {
    console.log('[bootstrap] nothing to do.');
    return 0;
  }

  await mkdir(RAW, { recursive: true });
  let failed = 0;
  for (const c of plan.clone) {
    process.stdout.write(`[bootstrap] cloning ${c.name} at ${c.sha.slice(0, 12)} ... `);
    try {
      cloneAt(c.url, c.sha, path.join(RAW, c.name));
      console.log('ok');
    } catch (err) {
      console.log('FAILED');
      console.error(`            ${String(err.message ?? err).split('\n')[0]}`);
      failed += 1;
    }
  }
  for (const c of plan.checkout) {
    process.stdout.write(`[bootstrap] moving ${c.name} to ${c.sha.slice(0, 12)} ... `);
    const dir = path.join(RAW, c.name);
    try {
      try { git(['-C', dir, 'checkout', '--quiet', c.sha]); }
      catch { git(['-C', dir, 'fetch', '--quiet', 'origin']); git(['-C', dir, 'checkout', '--quiet', c.sha]); }
      console.log('ok');
    } catch (err) {
      console.log('FAILED');
      console.error(`            ${String(err.message ?? err).split('\n')[0]}`);
      failed += 1;
    }
  }

  if (failed > 0) {
    console.error(`[bootstrap] ${failed} checkout(s) could not be restored.`);
    return 1;
  }
  console.log('[bootstrap] corpus restored to the pinned commits.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c));
}
