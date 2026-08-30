#!/usr/bin/env node
// fetch.mjs — clone/update corpus sources into raw/ (gitignored).
// Sources (see PROVENANCE.md):
//   1. Roblox/creator-docs  (prose CC-BY-4.0, code samples MIT)
//   2. luau-lang/site       (MIT) — luau.org markdown docs; skipped with a note if no license file is found.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');

const SOURCES = [
  {
    name: 'creator-docs',
    url: 'https://github.com/Roblox/creator-docs',
    dir: path.join(RAW, 'creator-docs'),
    licenseRequired: false, // dual license documented in repo README/LICENSE; verified 2026-08-30
    // The repo stores ~7.5K media assets in Git LFS (tens of GB). A plain shallow
    // clone smudges them all, so clone blobless + sparse (docs only, no assets)
    // with LFS smudging disabled.
    sparse: ['/*', '!/content/en-us/assets/'],
  },
  {
    name: 'luau-site',
    url: 'https://github.com/luau-lang/site',
    dir: path.join(RAW, 'luau-site'),
    licenseRequired: true, // MIT expected; verify LICENSE file exists, otherwise skip at chunk time
  },
];

// GIT_LFS_SKIP_SMUDGE keeps LFS-tracked media as tiny pointer files.
const GIT_ENV = { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' };

function git(args, opts = {}) {
  return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: GIT_ENV, ...opts });
}

function shallowCloneOrUpdate(src) {
  if (existsSync(path.join(src.dir, '.git'))) {
    console.log(`[fetch] updating ${src.name} ...`);
    try {
      git(['-C', src.dir, 'fetch', '--depth', '1', 'origin']);
      git(['-C', src.dir, 'reset', '--hard', 'origin/HEAD']);
    } catch (err) {
      // A default-branch symref may be missing on shallow clones; fall back to the current branch.
      try {
        const branch = git(['-C', src.dir, 'rev-parse', '--abbrev-ref', 'HEAD']).trim();
        git(['-C', src.dir, 'fetch', '--depth', '1', 'origin', branch]);
        git(['-C', src.dir, 'reset', '--hard', 'FETCH_HEAD']);
      } catch (err2) {
        console.warn(`[fetch] update failed for ${src.name} (${err2.message.split('\n')[0]}); keeping existing checkout.`);
      }
    }
  } else if (src.sparse) {
    console.log(`[fetch] cloning ${src.name} (shallow, blobless, sparse — no media assets) ...`);
    git(['clone', '--depth', '1', '--filter=blob:none', '--sparse', src.url, src.dir]);
    git(['-C', src.dir, 'sparse-checkout', 'set', '--no-cone', ...src.sparse]);
  } else {
    console.log(`[fetch] cloning ${src.name} (shallow) ...`);
    git(['clone', '--depth', '1', src.url, src.dir]);
  }
  const sha = git(['-C', src.dir, 'rev-parse', 'HEAD']).trim();
  console.log(`[fetch] ${src.name} @ ${sha.slice(0, 12)}`);
  return sha;
}

function findLicenseFile(dir) {
  const names = readdirSync(dir).filter((n) => /^(license|licence|copying)(\.|$)/i.test(n));
  return names.length > 0 ? path.join(dir, names[0]) : null;
}

function verifyLicense(src) {
  const file = findLicenseFile(src.dir);
  if (!file) {
    console.warn(`[fetch] WARNING: no LICENSE file found in ${src.name}.`);
    return { ok: false, detail: 'no license file' };
  }
  const text = readFileSync(file, 'utf8');
  const isMit = /MIT License|Permission is hereby granted, free of charge/i.test(text);
  const isCcBy = /Creative Commons Attribution 4\.0|CC-BY-4\.0|CC BY 4\.0/i.test(text);
  const detail = isMit ? 'MIT' : isCcBy ? 'CC-BY-4.0' : `unrecognized (${path.basename(file)})`;
  console.log(`[fetch] ${src.name} license: ${detail}`);
  return { ok: isMit || isCcBy, detail };
}

async function main() {
  await mkdir(RAW, { recursive: true });
  const manifest = { fetchedAt: new Date().toISOString(), sources: {} };

  for (const src of SOURCES) {
    try {
      const sha = shallowCloneOrUpdate(src);
      const license = verifyLicense(src);
      manifest.sources[src.name] = { url: src.url, sha, license };
      if (src.licenseRequired && !license.ok) {
        console.warn(`[fetch] ${src.name}: license unclear — chunk.mjs will SKIP this source.`);
      }
    } catch (err) {
      console.error(`[fetch] FAILED ${src.name}: ${err.message.split('\n')[0]}`);
      manifest.sources[src.name] = { url: src.url, error: err.message.split('\n')[0] };
      if (src.name === 'creator-docs') process.exitCode = 1; // primary source is required
    }
  }

  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(RAW, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[fetch] wrote raw/manifest.json`);
}

main().catch((err) => {
  console.error('[fetch] fatal:', err);
  process.exit(1);
});
