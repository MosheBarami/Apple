#!/usr/bin/env node
// The host every unattended tool is pointed at, checked against the host the product lives on.
//
// THE FAILURE THIS COMES FROM, measured 2026-09-20. `.env` held
// `API_BASE=https://golem.moshe-barami111.workers.dev` — the pre-rename worker, still deployed and
// still serving. Twenty-three tools read that variable, among them infra/e2e.mjs, infra/smoke.mjs,
// infra/checkpoint-test.mjs, packages/evals/src/run.mjs and packages/training/src/eval-production.mjs.
// Every one of them had been exercising the OLD deployment while reporting on "the product".
//
// It survives because it does not look like a failure. scripts/lib/product-origin.mjs already
// records why: page routes on the legacy host 308 to the canonical origin and `/api/*` deliberately
// does NOT, so a page fetch looks perfectly current and an admin POST lands on the old deployment
// and succeeds quietly. On 2026-09-20 that cost four deploys of a fix that was already working:
// /api/admin/quota-reset answered 500 `no such column: credits` on the legacy worker and 200 on the
// product, from the same command, and the error was read as the product being broken.
//
// scripts/lib/product-origin.mjs solved this for five SCRIPTS. It was never applied to infra/ or
// packages/, which read the raw variable, and nothing anywhere refused a stale value. This does.
//
//   node scripts/check-api-base.mjs
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_ORIGIN, LEGACY_PRODUCT_HOST } from './lib/product-origin.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = join(ROOT, '.env');

/** Every tracked file that reads API_BASE, derived rather than listed, so the list cannot go stale. */
function readers() {
  try {
    const out = execFileSync('git', ['grep', '-l', 'API_BASE', '--', 'infra', 'packages', 'scripts', 'apps', 'tests'],
      { cwd: ROOT, encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean)
      // data files that merely contain the string are not readers of it
      .filter((f) => /\.(mjs|js|ts|tsx|sh)$/.test(f));
  } catch { return []; }
}

const problems = [];

//[[ NO .env IS NOT A PASS, IT IS A DIFFERENT QUESTION.
//   CI has no .env and must not fail here; a developer machine with tools pointed at a stale host
//   must. The two are told apart rather than collapsed, because a checker that returns green on a
//   machine it could not inspect is the exact defect this file exists to catch, one level up. ]]
if (!existsSync(ENV)) {
  console.log('API BASE NOT CHECKED — there is no .env in this checkout, so no tool here reads a host '
    + `from one. The product origin is ${PRODUCT_ORIGIN}. This is not a pass over a correct value; it `
    + 'is the absence of a value to check.');
  process.exit(0);
}

const declared = /^API_BASE=(.*)$/m.exec(readFileSync(ENV, 'utf8'));
const files = readers();

if (!declared) {
  if (files.length) {
    problems.push(`.env declares no API_BASE, and ${files.length} tracked file(s) read one — they will `
      + 'fall back to whatever the shell carries, or throw. Set it to ' + PRODUCT_ORIGIN);
  }
} else {
  const value = declared[1].trim().replace(/\/+$/, '');
  const host = (() => { try { return new URL(value).host; } catch { return ''; } })();
  if (!host) {
    problems.push(`API_BASE is "${value}", which is not a URL. Every tool below sends nowhere useful.`);
  } else if (host === LEGACY_PRODUCT_HOST.replace(/^https?:\/\//, '')) {
    problems.push(
      `API_BASE points at ${host}, the PRE-RENAME worker. It is still deployed and it still answers, `
      + 'which is what makes this dangerous rather than obvious: its page routes 308 to the product '
      + 'so a page fetch looks current, while /api/* does not redirect and lands on the old '
      + `deployment. Set it to ${PRODUCT_ORIGIN}.`,
    );
  } else if (value !== PRODUCT_ORIGIN.replace(/\/+$/, '')) {
    problems.push(`API_BASE is ${value}; the product is ${PRODUCT_ORIGIN}. Every tool below is `
      + 'measuring something other than the product.');
  }
}

if (problems.length) {
  console.error('API BASE WRONG\n');
  for (const p of problems) console.error(`  ${p}\n`);
  console.error(`  ${files.length} tracked file(s) read API_BASE and would be misdirected:`);
  for (const f of files.slice(0, 12)) console.error(`    ${f}`);
  if (files.length > 12) console.error(`    ... and ${files.length - 12} more`);
  process.exit(1);
}

console.log(`API BASE OK — ${PRODUCT_ORIGIN}, which is where the product is, and where all `
  + `${files.length} tracked file(s) that read API_BASE are therefore pointed.`);
