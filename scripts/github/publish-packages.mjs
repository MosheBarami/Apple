#!/usr/bin/env node
// Publish the workspace packages that are meant to be consumed outside this repository to
// GitHub Packages (https://npm.pkg.github.com). Used by .github/workflows/publish-packages.yml.
// Read docs/operations/GITHUB.md ("Publishing packages") before changing it.
//
//   node scripts/github/publish-packages.mjs --list
//   node scripts/github/publish-packages.mjs --dry-run              # stage + `npm publish --dry-run`
//   node scripts/github/publish-packages.mjs --publish --tag packages-v0.1.0
//
// WHICH PACKAGES. A workspace package is publishable if, and only if, its package.json carries
//   "publishConfig": { "registry": "https://npm.pkg.github.com" }
// Nothing here names a package, so a package-scope rename needs no edit to this file.
//
// THE SCOPE PROBLEM. GitHub Packages only accepts an npm package whose scope equals the OWNER of
// the repository it is published for (owner MosheBarami => `@mosheberami/...`). The packages in this
// tree are named @apple/* (soon @apple/*), so publishing them under their in-repo name is refused by
// the registry. The in-repo name is load-bearing (every `workspace:*` dependency and `--filter`
// uses it), so this script never edits the source package.json. It STAGES a copy under a temp
// directory whose manifest has the name rewritten to `@<owner>/<basename>`, `private` removed and a
// `repository` field added (that field is what links the package to this repo on GitHub), then
// runs `npm publish` there. The base name is kept: @apple/sdk -> @mosheberami/sdk.
//
// IT REFUSES, rather than papers over:
//   - a publishable package with a `workspace:` / `file:` / `link:` dependency (it would be
//     unresolvable outside the repo);
//   - versions that differ between publishable packages, or a --tag that is not `packages-v<version>`
//     (the packages are released in lock-step, the tag is the release marker);
//   - a package@version that already exists on the registry is SKIPPED, not overwritten, so a
//     re-run of a half-failed release is safe.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const GITHUB_REGISTRY = 'https://npm.pkg.github.com';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_PARENTS = ['apps', 'packages'];
const LOCAL_DEP = /^(workspace|file|link|portal):/;

/** `@apple/sdk` -> `sdk`. An unscoped name is returned as is. */
export function baseName(name) {
  return name.includes('/') ? name.split('/').pop() : name;
}

/** GitHub requires the scope to be the repository owner, lower-cased. */
export function scopedName(name, owner) {
  const o = String(owner ?? '').trim().toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(o)) throw new Error(`not a usable GitHub owner: ${JSON.stringify(owner)}`);
  return `@${o}/${baseName(name)}`;
}

/** Every package.json one level under apps/ and packages/ that opts in through publishConfig. */
export function discoverPublishable(root = ROOT) {
  const found = [];
  for (const parent of SCAN_PARENTS) {
    const base = join(root, parent);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(base, entry.name);
      const file = join(dir, 'package.json');
      if (!existsSync(file)) continue;
      const manifest = JSON.parse(readFileSync(file, 'utf8'));
      if (manifest.publishConfig?.registry === GITHUB_REGISTRY) found.push({ dir, manifest });
    }
  }
  return found.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

/** Problems that make a set of packages unpublishable. Empty array = fine. */
export function validate(packages, tag) {
  const problems = [];
  if (packages.length === 0) problems.push('no package declares publishConfig.registry = ' + GITHUB_REGISTRY);
  for (const { manifest: m } of packages) {
    if (m.private === true) problems.push(`${m.name} is "private": true, so npm would refuse it`);
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [dep, range] of Object.entries(m[field] ?? {})) {
        if (LOCAL_DEP.test(String(range))) problems.push(`${m.name} ${field}.${dep} is "${range}", unresolvable outside this repo`);
      }
    }
  }
  const versions = new Set(packages.map((p) => p.manifest.version));
  if (versions.size > 1) {
    problems.push('versions differ (' + packages.map((p) => `${p.manifest.name}@${p.manifest.version}`).join(', ') + '); they release in lock-step');
  }
  if (tag && versions.size === 1 && tag !== `packages-v${[...versions][0]}`) {
    problems.push(`tag ${tag} does not match packages-v${[...versions][0]}`);
  }
  return problems;
}

/** The manifest that is actually published: renamed, public, linked to the repo. */
export function stagedManifest(manifest, { owner, repo, directory }) {
  const out = { ...manifest };
  out.name = scopedName(manifest.name, owner);
  delete out.private;
  delete out.scripts; // lifecycle scripts (`prepublishOnly`, `check`, ...) must not run on the registry side
  // npm 11 reports `"./bin/x"` as an invalid bin on publish and may drop it; the bare form is equivalent.
  if (out.bin && typeof out.bin === 'object') {
    out.bin = Object.fromEntries(Object.entries(out.bin).map(([k, v]) => [k, String(v).replace(/^\.\//, '')]));
  } else if (typeof out.bin === 'string') out.bin = out.bin.replace(/^\.\//, '');
  out.publishConfig = { registry: GITHUB_REGISTRY };
  out.repository = { type: 'git', url: `git+https://github.com/${repo}.git`, directory };
  return out;
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts });
}

/** Copy exactly the files `npm pack` would ship, then write the rewritten manifest. */
function stage(pkg, ctx, outRoot) {
  const packed = JSON.parse(sh('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: pkg.dir }))[0];
  const target = join(outRoot, baseName(pkg.manifest.name));
  mkdirSync(target, { recursive: true });
  for (const f of packed.files) {
    if (f.path === 'package.json') continue;
    if (/(^|\/)__pycache__\//.test(f.path) || f.path.endsWith('.pyc')) continue;
    cpSync(join(pkg.dir, f.path), join(target, f.path), { recursive: true });
  }
  const directory = relative(ROOT, pkg.dir).split('\\').join('/');
  writeFileSync(join(target, 'package.json'), JSON.stringify(stagedManifest(pkg.manifest, { ...ctx, directory }), null, 2) + '\n');
  return target;
}

function alreadyPublished(name, version) {
  const r = spawnSync('npm', ['view', `${name}@${version}`, 'version', '--registry', GITHUB_REGISTRY], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim() === version) return true;
  if (r.status !== 0 && !/E404|404 Not Found|is not in this registry/i.test(`${r.stdout}${r.stderr}`)) {
    throw new Error(`could not tell whether ${name}@${version} exists (not a 404):\n${r.stderr.trim()}`);
  }
  return false;
}

function detectRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = sh('git', ['remote', 'get-url', 'origin'], { cwd: ROOT }).trim();
  const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`cannot read owner/repo from origin ${url}; pass --repo owner/name`);
  return m[1];
}

function parseArgs(argv) {
  const o = { mode: null, tag: null, repo: null, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') o.mode = 'list';
    else if (a === '--dry-run') o.mode = 'dry-run';
    else if (a === '--publish') o.mode = 'publish';
    else if (a === '--stage-only') o.mode = 'stage';
    else if (a === '--tag') o.tag = argv[++i];
    else if (a === '--repo') o.repo = argv[++i];
    else if (a === '--keep') o.keep = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.mode) throw new Error('say what to do: --list | --dry-run | --stage-only | --publish');
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const packages = discoverPublishable();
  if (o.mode === 'list') {
    for (const p of packages) console.log(`${p.manifest.name}@${p.manifest.version}\t${relative(ROOT, p.dir)}`);
    return;
  }
  const problems = validate(packages, o.mode === 'publish' ? o.tag : null);
  if (o.mode === 'publish' && !o.tag) problems.push('--publish needs --tag packages-v<version>');
  if (problems.length) {
    for (const p of problems) console.error(`REFUSED: ${p}`);
    process.exit(1);
  }
  const repo = o.repo ?? detectRepo();
  const owner = repo.split('/')[0];
  const ctx = { owner, repo };
  const outRoot = mkdtempSync(join(tmpdir(), 'apple-publish-'));
  let failed = false;
  try {
    for (const pkg of packages) {
      const target = stage(pkg, ctx, outRoot);
      const name = scopedName(pkg.manifest.name, owner);
      const version = pkg.manifest.version;
      console.log(`\n== ${pkg.manifest.name}@${version} -> ${name}@${version} (staged at ${target})`);
      if (o.mode === 'stage') continue;
      if (o.mode === 'publish' && alreadyPublished(name, version)) {
        console.log(`SKIPPED: ${name}@${version} is already on the registry; versions are immutable.`);
        continue;
      }
      const args = ['publish', '--registry', GITHUB_REGISTRY, ...(o.mode === 'dry-run' ? ['--dry-run'] : [])];
      const r = spawnSync('npm', args, { cwd: target, stdio: 'inherit' });
      if (r.status !== 0) failed = true;
    }
  } finally {
    if (o.mode === 'stage' || o.keep) console.log(`\nstaged files kept in ${outRoot}`);
    else rmSync(outRoot, { recursive: true, force: true });
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { console.error(`ERROR: ${e.message}`); process.exit(1); }
}
