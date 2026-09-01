#!/usr/bin/env node
// fetch.mjs — clone/update corpus sources into raw/ (gitignored), and record what is there.
//
// TWO JOBS, AND THEY USED TO BE ONE.
//
// This script used to carry a hardcoded list of two sources and write `raw/manifest.json`
// from that list alone. By the time anyone looked, `raw/` held FIFTEEN checkouts — the
// source-intelligence pass had cloned thirteen more directly — and the manifest still
// recorded two. Running this script would have silently DELETED the provenance of the other
// thirteen: the tool whose entire purpose is preserving provenance was one invocation away
// from destroying it.
//
// So the two jobs are now separate and the second one is unconditional:
//
//   1. FETCH the sources this run is asked for. Driven by `data/sources.json` — the classified
//      corpus — rather than by a list in this file, so a source that has been through
//      classification can be fetched without editing code, and one that has NOT been through
//      it cannot be fetched at all.
//   2. RECORD every checkout present in `raw/`, whoever created it, by reading git. A
//      directory that is a git checkout has a URL and a SHA whether or not this script cloned
//      it, and provenance is a property of what is on disk, not of what this process did.
//
// Job 2 runs even when job 1 fetches nothing, so `pnpm fetch --record-only` repairs the
// manifest without touching the network.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');
const SOURCES_JSON = path.join(ROOT, 'data', 'sources.json');

/** GIT_LFS_SKIP_SMUDGE keeps LFS-tracked media as tiny pointer files. */
const GIT_ENV = { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' };

function git(args, opts = {}) {
  return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: GIT_ENV, ...opts });
}

function gitQuiet(args) {
  try {
    return git(args).trim();
  } catch {
    return null;
  }
}

/**
 * Checkouts that need something other than a plain shallow clone.
 *
 * `creator-docs` stores ~7.5K media assets in Git LFS (tens of GB), so a plain shallow clone
 * smudges all of them. It is cloned blobless + sparse, docs only. This is a FETCH STRATEGY,
 * not a source list — the sources themselves come from the classified corpus.
 */
const STRATEGY = {
  'creator-docs': { sparse: ['/*', '!/content/en-us/assets/'] },
};

/**
 * Sources this tool is allowed to fetch, taken from the classified corpus.
 *
 * The filter is the licence gate, and it is deliberately the ONLY way in: a source is
 * fetchable when classification has already decided it may be reused, which means a new
 * source is added by classifying it, never by editing this file. `UNCLEAR_QUARANTINE` is
 * exactly what its name says — absence of evidence is not permission — so it is not here.
 *
 * `ATTRIBUTION_REQUIRED` is fetchable and carries its obligation forward in the manifest, so
 * whatever consumes a chunk can see that it owes a credit line.
 */
const FETCHABLE_CLASSES = new Set(['COMMERCIAL_REUSABLE', 'ATTRIBUTION_REQUIRED']);

/** `owner__repo` — unique per source, and still readable in an `ls`. */
function dirNameFor(url) {
  const parts = String(url).replace(/\.git$/, '').split('/').filter(Boolean);
  const repo = parts.pop();
  const owner = parts.pop();
  return owner ? `${owner}__${repo}` : repo;
}

/**
 * Rename any checkout still sitting under a bare repo name to its owner-scoped name.
 *
 * Runs before anything else reads `raw/`, so one pass migrates the whole corpus and the old
 * layout never has to be supported. A directory whose remote cannot be read is left alone: a
 * name this tool does not understand is not a name it should rewrite.
 */
function migrateBareNames() {
  const moved = [];
  for (const name of readdirSync(RAW)) {
    const dir = path.join(RAW, name);
    if (!existsSync(path.join(dir, '.git')) || name.includes('__')) continue;
    const url = gitQuiet(['-C', dir, 'config', '--get', 'remote.origin.url']);
    if (!url) continue;
    const want = dirNameFor(url);
    if (want === name) continue;
    const target = path.join(RAW, want);
    if (existsSync(target)) continue; // never clobber; that is the bug being fixed
    renameSync(dir, target);
    moved.push(`${name} -> ${want}`);
  }
  if (moved.length > 0) console.log(`[fetch] migrated ${moved.length} checkout(s) to owner-scoped names`);
  return moved;
}

function loadCorpus() {
  if (!existsSync(SOURCES_JSON)) return [];
  const parsed = JSON.parse(readFileSync(SOURCES_JSON, 'utf8'));
  const records = parsed.records ? Object.values(parsed.records) : [];
  return records
    .filter((r) => r.kind === 'repo' && typeof r.url === 'string' && /github\.com/.test(r.url))
    .filter((r) => FETCHABLE_CLASSES.has(r.licence?.class))
    .map((r) => ({
      id: r.id,
      //[[ OWNER-SCOPED, and the bug that forced it is worth keeping in view.
      //
      //   The directory used to be `url.split('/').pop()` — the bare repo name. Fetching both
      //   `LolplePlays/framer` and `Starstruck-Studios-Developers/framer` then wrote them to the
      //   SAME directory, so the second clone "updated" the first out of existence and the corpus
      //   silently held one fork where it believed it held two. Provenance survived only because
      //   `recordAll` reads the git remote rather than trusting the directory name.
      //
      //   That is not a one-repository accident. `framer`, `signal`, `promise`, `janitor` and
      //   `maid` all exist several times over in this ecosystem, and a fork ALWAYS shares its
      //   upstream's name — which makes the collision most likely in exactly the case §J cares
      //   about most, comparing a fork against what it forked. ]]
      name: dirNameFor(r.url),
      url: r.url,
      spdx: r.licence?.spdx ?? null,
      licenceClass: r.licence.class,
      category: r.category ?? null,
    }));
}

function findLicenseFile(dir) {
  const names = readdirSync(dir).filter((n) => /^(license|licence|copying)(\.|$)/i.test(n));
  return names.length > 0 ? path.join(dir, names[0]) : null;
}

/**
 * Read the licence OUT OF THE CHECKOUT, rather than trusting the classification.
 *
 * These are two independent facts and they are allowed to disagree: the classifier read a
 * repository page, this reads the file that shipped. A disagreement is a finding — the
 * manifest records both and marks the conflict rather than picking a winner, because
 * silently preferring either one is how a licence error becomes invisible.
 */
function readLicence(dir) {
  const file = findLicenseFile(dir);
  if (!file) return { ok: false, detail: 'no license file', spdx: null };
  const text = readFileSync(file, 'utf8');
  const spdx = /MIT License|Permission is hereby granted, free of charge/i.test(text)
    ? 'MIT'
    : /Apache License[\s\S]{0,80}Version 2\.0/i.test(text)
      ? 'Apache-2.0'
      : /Creative Commons Attribution 4\.0|CC-BY-4\.0|CC BY 4\.0/i.test(text)
        ? 'CC-BY-4.0'
        : /This is free and unencumbered software released into the public domain/i.test(text)
          ? 'Unlicense'
          : /ISC License|Permission to use, copy, modify, and\/or distribute/i.test(text)
            ? 'ISC'
            : /GNU (GENERAL|LESSER GENERAL) PUBLIC LICENSE/i.test(text)
              ? 'GPL-family'
              : null;
  return {
    ok: spdx != null && spdx !== 'GPL-family',
    detail: spdx ?? `unrecognized (${path.basename(file)})`,
    spdx,
  };
}

function shallowCloneOrUpdate(src) {
  const dir = path.join(RAW, src.name);
  const strategy = STRATEGY[src.name];
  if (existsSync(path.join(dir, '.git'))) {
    console.log(`[fetch] updating ${src.name} ...`);
    try {
      git(['-C', dir, 'fetch', '--depth', '1', 'origin']);
      git(['-C', dir, 'reset', '--hard', 'origin/HEAD']);
    } catch {
      // A default-branch symref may be missing on shallow clones; fall back to the branch.
      try {
        const branch = git(['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD']).trim();
        git(['-C', dir, 'fetch', '--depth', '1', 'origin', branch]);
        git(['-C', dir, 'reset', '--hard', 'FETCH_HEAD']);
      } catch (err) {
        console.warn(`[fetch] update failed for ${src.name} (${err.message.split('\n')[0]}); keeping checkout.`);
      }
    }
  } else if (strategy?.sparse) {
    console.log(`[fetch] cloning ${src.name} (shallow, blobless, sparse) ...`);
    git(['clone', '--depth', '1', '--filter=blob:none', '--sparse', src.url, dir]);
    git(['-C', dir, 'sparse-checkout', 'set', '--no-cone', ...strategy.sparse]);
  } else {
    console.log(`[fetch] cloning ${src.name} (shallow) ...`);
    git(['clone', '--depth', '1', src.url, dir]);
  }
  return dir;
}

/**
 * JOB 2. Every checkout on disk, described from git and from its own LICENSE file.
 *
 * Unconditional and independent of what was fetched this run. A checkout this tool has never
 * heard of still gets a URL, a SHA and a licence reading, and is marked so that its origin is
 * visible rather than implied.
 */
function recordAll(corpusById) {
  const sources = {};
  const dirs = readdirSync(RAW).filter((n) => {
    const p = path.join(RAW, n);
    return statSync(p).isDirectory() && existsSync(path.join(p, '.git'));
  });

  for (const name of dirs.sort()) {
    const dir = path.join(RAW, name);
    const sha = gitQuiet(['-C', dir, 'rev-parse', 'HEAD']);
    const url = gitQuiet(['-C', dir, 'config', '--get', 'remote.origin.url']);
    const licence = readLicence(dir);
    const known = corpusById.get(url?.replace(/\.git$/, '')) ?? null;

    const record = {
      url: url ?? null,
      sha,
      licence: { ...licence, classifiedAs: known?.licenceClass ?? null, classifiedSpdx: known?.spdx ?? null },
      corpusId: known?.id ?? null,
      category: known?.category ?? null,
      // A checkout with no corpus record was created outside the classification gate. That is
      // not automatically wrong — the two original sources predate the corpus — but it must be
      // visible, because "we only read licence-clear sources" is a claim about this field.
      classified: known != null,
    };

    if (known && licence.spdx && known.spdx && licence.spdx !== known.spdx) {
      record.licence.conflict = `checkout says ${licence.spdx}, classification says ${known.spdx}`;
    }
    sources[name] = record;
  }
  return sources;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const recordOnly = args.has('--record-only');
  const wanted = [...args].filter((a) => !a.startsWith('--'));

  await mkdir(RAW, { recursive: true });
  migrateBareNames();
  const corpus = loadCorpus();
  const corpusById = new Map(corpus.map((c) => [c.url.replace(/\.git$/, ''), c]));

  if (!recordOnly) {
    // Fetch only what was asked for by name. Cloning all 68 unbidden is a lot of network and
    // disk for a command someone ran to refresh one source, and an accidental 68-repo clone is
    // exactly the kind of thing that gets a tool disabled.
    const targets = wanted.length > 0 ? corpus.filter((c) => wanted.includes(c.name) || wanted.includes(c.id)) : [];
    if (wanted.length > 0 && targets.length === 0) {
      console.error(`[fetch] none of [${wanted.join(', ')}] is a fetchable classified source.`);
      console.error(`[fetch] fetchable: ${corpus.length} sources classified reusable. Try --list.`);
      process.exitCode = 1;
    }
    for (const src of targets) {
      try {
        shallowCloneOrUpdate(src);
      } catch (err) {
        console.error(`[fetch] FAILED ${src.name}: ${err.message.split('\n')[0]}`);
        process.exitCode = 1;
      }
    }
  }

  if (args.has('--list')) {
    console.log(`[fetch] ${corpus.length} fetchable (classified reusable) sources:`);
    for (const c of corpus) console.log(`  ${c.id.padEnd(36)} ${(c.spdx ?? '?').padEnd(12)} ${c.url}`);
  }

  const sources = recordAll(corpusById);
  const manifest = {
    recordedAt: new Date().toISOString(),
    note:
      'Every git checkout present in raw/, described from git and from its own LICENSE file. ' +
      'Written unconditionally so that a checkout this tool did not create still keeps its provenance.',
    counts: {
      checkouts: Object.keys(sources).length,
      classified: Object.values(sources).filter((s) => s.classified).length,
      licenceConflicts: Object.values(sources).filter((s) => s.licence.conflict).length,
      fetchableInCorpus: corpus.length,
    },
    sources,
  };
  await writeFile(path.join(RAW, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const c = manifest.counts;
  console.log(
    `[fetch] recorded ${c.checkouts} checkouts (${c.classified} classified, ${c.licenceConflicts} licence conflicts); ` +
      `${c.fetchableInCorpus} sources are fetchable from the corpus`,
  );
}

main().catch((err) => {
  console.error('[fetch] fatal:', err);
  process.exit(1);
});
