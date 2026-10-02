#!/usr/bin/env node
// Apply the repository rulesets in .github/rulesets/*.json to GitHub, idempotently (create, or
// update the ruleset with the same name). Read docs/operations/GITHUB.md ("Rulesets") first.
//
//   node scripts/github/apply-rulesets.mjs --dry-run      # print what WOULD be sent; changes nothing
//   node scripts/github/apply-rulesets.mjs                # apply (needs `gh` logged in as a repo admin)
//
// Options: --repo owner/name   (default: from the `origin` remote)
//          --file <path>       (default: every .github/rulesets/*.json)
//          --branch main       (the branch whose latest CI result is checked; default main)
//          --allow-red-main    (apply even though a required check is not green on that branch)
//
// THE ORDER MATTERS. A ruleset that requires a status check which is failing on main makes EVERY
// pull request unmergeable (the owner can still bypass through a PR, see the docs, but nothing else
// can). So before it changes anything this script reads the latest check-runs of <branch> and
// REFUSES to apply unless every required context has concluded `success` there. `--dry-run` reports
// the same thing and never refuses on it. The only requests it ever sends are the ruleset POST/PUT;
// everything else is a GET.
//
// It also refuses, in dry-run too, a required check name that is not the `name:` of a job in
// .github/workflows/ci.yml: GitHub matches the string, and a ruleset that waits for a check nobody
// ever reports waits forever.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Names of every required status check in a ruleset payload. */
export function requiredContexts(ruleset) {
  const out = [];
  for (const rule of ruleset.rules ?? []) {
    if (rule.type !== 'required_status_checks') continue;
    for (const c of rule.parameters?.required_status_checks ?? []) out.push(c.context);
  }
  return out;
}

/** Shape problems that GitHub would reject, found before asking it. */
export function validateRuleset(r) {
  const problems = [];
  if (typeof r.name !== 'string' || !r.name) problems.push('missing "name"');
  if (!['branch', 'tag', 'push'].includes(r.target)) problems.push('"target" must be branch, tag or push');
  if (!['active', 'evaluate', 'disabled'].includes(r.enforcement)) problems.push('"enforcement" must be active, evaluate or disabled');
  if (!Array.isArray(r.rules) || r.rules.length === 0) problems.push('"rules" must be a non-empty array');
  for (const rule of r.rules ?? []) if (typeof rule?.type !== 'string') problems.push('a rule has no "type"');
  return problems;
}

/** Required contexts that no `name:` line in the workflow text provides. */
export function contextsNotInWorkflow(contexts, workflowText) {
  const names = new Set(
    [...workflowText.matchAll(/^\s+name:\s*(.+?)\s*$/gm)].map((m) => m[1].replace(/^(['"])(.*)\1$/, '$2')),
  );
  return contexts.filter((c) => !names.has(c));
}

/** For each required context: the conclusion of its newest check-run, or "missing". */
export function summarizeChecks(checkRuns, contexts) {
  return contexts.map((context) => {
    const runs = checkRuns.filter((c) => c.name === context).sort((a, b) => b.id - a.id);
    return { context, state: runs.length === 0 ? 'missing' : (runs[0].conclusion ?? runs[0].status) };
  });
}

function gh(args, input) {
  const r = spawnSync('gh', args, { encoding: 'utf8', input });
  if (r.error) throw new Error(`cannot run gh: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}

function detectRepo() {
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' });
  const m = r.stdout.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\s*$/);
  if (!m) throw new Error('cannot read owner/repo from the origin remote; pass --repo owner/name');
  return m[1];
}

function parseArgs(argv) {
  const o = { dryRun: false, repo: null, files: [], branch: 'main', allowRed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--allow-red-main') o.allowRed = true;
    else if (a === '--repo') o.repo = argv[++i];
    else if (a === '--file') o.files.push(argv[++i]);
    else if (a === '--branch') o.branch = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const repo = o.repo ?? detectRepo();
  const dir = join(ROOT, '.github', 'rulesets');
  const files = o.files.length ? o.files.map((f) => resolve(f)) : (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => join(dir, f)) : []);
  if (files.length === 0) throw new Error('no ruleset files found');

  const ciFile = join(ROOT, '.github', 'workflows', 'ci.yml');
  const ciText = existsSync(ciFile) ? readFileSync(ciFile, 'utf8') : '';
  const lookup = (fn) => { try { return fn(); } catch (e) { return { error: e.message }; } };
  let blocked = false;

  const existing = lookup(() => JSON.parse(gh(['api', `repos/${repo}/rulesets`])));
  const checkRuns = lookup(() => JSON.parse(gh(['api', `repos/${repo}/commits/${o.branch}/check-runs?per_page=100`])).check_runs);

  for (const file of files) {
    const ruleset = JSON.parse(readFileSync(file, 'utf8'));
    console.log(`\n=== ${file.replace(ROOT + '/', '')} -> ${repo}`);
    const problems = validateRuleset(ruleset);
    const contexts = requiredContexts(ruleset);
    for (const c of contextsNotInWorkflow(contexts, ciText)) problems.push(`required check "${c}" is not the name of any job in .github/workflows/ci.yml`);
    if (problems.length) {
      for (const p of problems) console.error(`REFUSED: ${p}`);
      process.exit(1);
    }

    if (contexts.length) {
      if (Array.isArray(checkRuns)) {
        console.log(`Latest results on ${o.branch}:`);
        const summary = summarizeChecks(checkRuns, contexts);
        for (const s of summary) console.log(`  ${s.state === 'success' ? 'ok  ' : 'RED '} ${s.context}: ${s.state}`);
        if (summary.some((s) => s.state !== 'success')) {
          const msg = `${o.branch} is not green on every required check; applying this would make every pull request unmergeable.`;
          if (o.dryRun || o.allowRed) console.log(`WARNING: ${msg}`);
          else { console.error(`REFUSED: ${msg} Fix CI first, or pass --allow-red-main.`); blocked = true; continue; }
        }
      } else {
        console.log(`WARNING: could not read check-runs on ${o.branch} (${checkRuns.error}).`);
        if (!o.dryRun && !o.allowRed) { console.error('REFUSED: cannot prove main is green.'); blocked = true; continue; }
      }
    }

    const match = Array.isArray(existing) ? existing.find((e) => e.name === ruleset.name) : null;
    const method = match ? 'PUT' : 'POST';
    const path = match ? `repos/${repo}/rulesets/${match.id}` : `repos/${repo}/rulesets`;
    if (!Array.isArray(existing)) console.log(`NOTE: could not list existing rulesets (${existing.error}); assuming create.`);
    const body = JSON.stringify(ruleset, null, 2);
    if (o.dryRun) {
      console.log(`DRY RUN: would send ${method} /${path}\n${body}`);
      continue;
    }
    gh(['api', '-X', method, path, '--input', '-'], body);
    console.log(`${match ? 'Updated' : 'Created'} ruleset "${ruleset.name}".`);
  }
  if (blocked) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { console.error(`ERROR: ${e.message}`); process.exit(1); }
}
