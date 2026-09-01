#!/usr/bin/env node
// enumerate.mjs — walk the Wally and Pesde package indexes and emit REAL package records.
//
// WHY THIS REPLACES A NUMBER WITH A LIST.
//
// Mission §J: "Enumerate Wally and Pesde indexes rather than relying only on search engines."
// That was done once, by hand, and it produced `data/registries.json` — a set of AGGREGATE
// counts: 5,807 Wally packages, 781 Pesde, a histogram of declared licences, and the headline
// "30x the 217-URL floor". The mission ledger rated gate 22 PROVEN on it.
//
// An independent audit found the problem: **the 6,588 packages were counted and discarded.**
// There was no list, no re-runnable enumerator, and no handoff into intake — every one of the
// 217 records in `sources.json` still carries `origin: "seed-manifest"`, so nothing was
// expanded. A number is not a corpus.
//
// This is the enumerator. It clones the two index repositories, walks them, and writes one
// record per PACKAGE with its declared licence and its repository URL, so the result can be
// handed to classification instead of summarised and thrown away.
//
// THE ONE RULE THAT MATTERS, and §H states it: a licence DECLARED IN AN INDEX IS A CLAIM. The
// publisher typed it; nobody checked it against a LICENSE file. So every record here is a
// CANDIDATE carrying `declaredLicence` and `licenceEvidence: 'index-declaration'`, and none of
// them may enter the corpus as classified. `--emit-seeds` writes them where `discover.mjs` will
// resolve and classify them properly, which is the only route in.
//
// Usage:
//   node packages/corpus/src/enumerate.mjs               # clone/update, walk, write records
//   node packages/corpus/src/enumerate.mjs --no-fetch    # walk what is already on disk
//   node packages/corpus/src/enumerate.mjs --emit-seeds  # also write candidates for discover.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = path.join(ROOT, 'raw', '_registries');
const DATA = path.join(ROOT, 'data');

const INDEXES = [
  { key: 'wally', url: 'https://github.com/UpliftGames/wally-index', format: 'ndjson' },
  { key: 'pesde', url: 'https://github.com/pesde-pkg/index', format: 'toml' },
];

function git(args) {
  return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

function cloneOrUpdate(idx) {
  const dir = path.join(REG, idx.key);
  if (existsSync(path.join(dir, '.git'))) {
    try {
      git(['-C', dir, 'fetch', '--depth', '1', 'origin']);
      git(['-C', dir, 'reset', '--hard', 'origin/HEAD']);
    } catch {
      // Keep the existing checkout; a stale index still enumerates, and the SHA below says so.
    }
  } else {
    git(['clone', '--depth', '1', idx.url, dir]);
  }
  return { dir, sha: git(['-C', dir, 'rev-parse', 'HEAD']).trim() };
}

/** Normalise a declared licence string for spelling only. It stays a CLAIM either way. */
function normaliseLicence(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  const map = {
    mit: 'MIT',
    'apache-2.0': 'Apache-2.0',
    apache2: 'Apache-2.0',
    'mpl-2.0': 'MPL-2.0',
    'gpl-3.0': 'GPL-3.0',
    'lgpl-3.0': 'LGPL-3.0',
    'bsd-3-clause': 'BSD-3-Clause',
    unlicense: 'Unlicense',
    isc: 'ISC',
    cc0: 'CC0-1.0',
  };
  return map[s.toLowerCase()] ?? s;
}

/** Wally: one file per package, one JSON object per LINE, one line per published version. */
function readWally(dir) {
  const out = [];
  for (const scope of readdirSync(dir)) {
    if (scope.startsWith('.')) continue;
    const scopeDir = path.join(dir, scope);
    if (!statSync(scopeDir).isDirectory()) continue;
    for (const name of readdirSync(scopeDir)) {
      if (name === 'owners.json') continue;
      const file = path.join(scopeDir, name);
      let last = null;
      let versions = 0;
      try {
        for (const line of readFileSync(file, 'utf8').split('\n')) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            last = parsed.package ?? last;
            versions += 1;
          } catch {
            // A malformed line is one version, not a package; keep going.
          }
        }
      } catch {
        continue;
      }
      if (!last) continue;
      out.push({
        registry: 'wally',
        id: `wally-${scope}-${name}`,
        name: last.name ?? `${scope}/${name}`,
        scope,
        versions,
        declaredLicence: normaliseLicence(last.license),
        repository: last.repository ?? null,
        description: last.description ?? null,
      });
    }
  }
  return out;
}

/** Pesde: one TOML file per package, a `["<version> <target>"]` table per published version. */
function readPesde(dir) {
  const out = [];
  const field = (text, key) => {
    const m = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm').exec(text);
    return m ? m[1] : null;
  };
  for (const scope of readdirSync(dir)) {
    if (scope.startsWith('.')) continue;
    const scopeDir = path.join(dir, scope);
    if (!statSync(scopeDir).isDirectory()) continue;
    for (const name of readdirSync(scopeDir)) {
      if (name === 'scope.toml') continue;
      let text;
      try {
        text = readFileSync(path.join(scopeDir, name), 'utf8');
      } catch {
        continue;
      }
      out.push({
        registry: 'pesde',
        id: `pesde-${scope}-${name.replace(/\.toml$/, '')}`,
        name: `${scope}/${name.replace(/\.toml$/, '')}`,
        scope,
        versions: (text.match(/^\[".+"\]$/gm) ?? []).length,
        declaredLicence: normaliseLicence(field(text, 'license')),
        repository: field(text, 'repository'),
        description: field(text, 'description'),
      });
    }
  }
  return out;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  await mkdir(REG, { recursive: true });

  const registries = {};
  const packages = [];
  for (const idx of INDEXES) {
    const dir = path.join(REG, idx.key);
    let sha = null;
    if (!args.has('--no-fetch')) {
      console.log(`[enumerate] fetching ${idx.key} index ...`);
      ({ sha } = cloneOrUpdate(idx));
    } else if (existsSync(path.join(dir, '.git'))) {
      sha = git(['-C', dir, 'rev-parse', 'HEAD']).trim();
    }
    if (!existsSync(dir)) {
      console.warn(`[enumerate] ${idx.key}: not on disk and --no-fetch given; skipping`);
      continue;
    }
    const found = idx.format === 'ndjson' ? readWally(dir) : readPesde(dir);
    packages.push(...found);

    const byLicence = {};
    let withRepo = 0;
    for (const p of found) {
      const k = p.declaredLicence ?? '(none declared)';
      byLicence[k] = (byLicence[k] ?? 0) + 1;
      if (p.repository) withRepo += 1;
    }
    registries[idx.key] = {
      source: idx.url,
      sha,
      packages: found.length,
      versions: found.reduce((n, p) => n + p.versions, 0),
      scopes: new Set(found.map((p) => p.scope)).size,
      withRepositoryUrl: withRepo,
      declaredLicences: Object.fromEntries(Object.entries(byLicence).sort((a, b) => b[1] - a[1])),
    };
    console.log(
      `[enumerate] ${idx.key}: ${found.length} packages, ${registries[idx.key].versions} versions, ` +
        `${withRepo} with a repository URL`,
    );
  }

  await writeFile(
    path.join(DATA, 'registry-packages.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note:
          'One record per PACKAGE, not a count. `declaredLicence` is what the publisher typed into ' +
          'the index and is a CLAIM (§H), never verified evidence — nothing here enters the corpus ' +
          'as classified. Records with a repository URL are the ones that can be resolved and ' +
          'classified properly; the rest cannot be checked at all and stay out.',
        registries,
        counts: {
          packages: packages.length,
          withRepositoryUrl: packages.filter((p) => p.repository).length,
          resolvableGitHub: packages.filter((p) => /github\.com/.test(p.repository ?? '')).length,
        },
        packages,
      },
      null,
      2,
    ),
  );
  console.log(`[enumerate] wrote data/registry-packages.json — ${packages.length} packages`);

  //[[ THE HANDOFF, which is the half that was missing. A candidate is a URL plus the reason it
  //   is worth resolving; it is NOT a classification. `discover.mjs` resolves it, reads the
  //   actual LICENSE file, and decides — which is the only route into the corpus. ]]
  const resolvable = packages.filter((p) => /github\.com/.test(p.repository ?? ''));
  if (args.has('--emit-seeds')) {
    const seeds = resolvable.map((p) => ({
      url: p.repository.replace(/\.git$/, '').replace(/\/$/, ''),
      category: 'registry-package',
      kind: 'repo',
      origin: `registry:${p.registry}`,
      declaredLicence: p.declaredLicence,
      registryName: p.name,
      versions: p.versions,
    }));
    await writeFile(
      path.join(DATA, 'registry-seeds.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          note:
            'Candidates for discover.mjs. Each carries the licence its publisher DECLARED and no ' +
            'verdict at all — resolution reads the repository and classification decides. A ' +
            'declared MIT here is a claim to be checked, never a permission.',
          count: seeds.length,
          seeds,
        },
        null,
        2,
      ),
    );
    console.log(`[enumerate] wrote data/registry-seeds.json — ${seeds.length} resolvable candidates`);
  }

  console.log(
    `[enumerate] ${packages.length} packages enumerated, ${resolvable.length} resolvable on GitHub` +
      (args.has('--emit-seeds') ? '' : ' (run with --emit-seeds to hand them to discover.mjs)'),
  );
}

main().catch((err) => {
  console.error('[enumerate] fatal:', err);
  process.exit(1);
});
