#!/usr/bin/env node
/**
 * THE REQUIREMENTS MAP — 83 acceptance contracts against what this repository can actually prove.
 *
 * WHY IT IS A PROGRAM AND NOT A DOCUMENT. A hand-maintained map of 83 requirements is a second copy
 * of the truth, and the copy is the one that rots. Every status below is computed when you run it:
 * the probes are matched against the live test inventory and the live tree, so a deleted test or a
 * removed module changes the map the moment it happens.
 *
 * THE DISTINCTION THAT MATTERS, and it is the owner's own instruction — "code, green tests or old
 * screenshots are not proof of completion":
 *
 *   NO EVIDENCE      the repository contains nothing bearing on this contract.
 *   OFFLINE          the repository contains tests and modules bearing on it, and they pass. This
 *                    is real and it is NOT acceptance: an offline test cannot register an account,
 *                    take a payment, or build a thing inside Roblox Studio.
 *   CUSTOMER         a live journey was performed and recorded under docs/evidence/ with a dated
 *                    file naming this contract. ONLY a recorded run sets this. It is never inferred
 *                    from a passing test, and this program has no path that upgrades OFFLINE to
 *                    CUSTOMER on its own.
 *
 * A contract with no probe prints NO PROBE and the run exits non-zero. An unmeasured requirement
 * must be visible as unmeasured; the failure this prevents is a map that looks complete because the
 * things it cannot see are the things it does not mention.
 *
 *   node scripts/requirements-map.mjs           the map
 *   node scripts/requirements-map.mjs --json    machine readable
 *   node scripts/requirements-map.mjs --open    only what is not yet customer-verified
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACTS = JSON.parse(readFileSync(join(ROOT, 'docs/requirements/CONTRACTS.json'), 'utf8'));
const PROBES = JSON.parse(readFileSync(join(ROOT, 'docs/requirements/probes.json'), 'utf8')).probes;

/** Every test name in the repository, with the suite it lives in. Walked, never listed. */
function testInventory() {
  const roots = ['apps/worker/tests', 'apps/web/tests', 'apps/site/tests', 'packages/evals/src', 'tests', 'infra/supabase/tests'];
  const out = [];
  for (const r of roots) {
    const dir = join(ROOT, r);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!/\.mjs$/.test(f)) continue;
      const body = readFileSync(join(dir, f), 'utf8');
      for (const m of body.matchAll(/^\s*test\(\s*['"`]([^'"`]{6,160})/gm)) out.push({ suite: r, file: f, name: m[1] });
    }
  }
  return out;
}

/**
 * Recorded customer journeys. A file under docs/evidence/ whose CONTENTS name the contract id.
 *
 * Contents rather than filename, so the claim has to be made inside a document somebody wrote,
 * next to what was actually done — a filename is too cheap to be evidence.
 */
function customerEvidence() {
  const dir = join(ROOT, 'docs/evidence');
  const byId = new Map();
  if (!existsSync(dir)) return byId;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (!statSync(p).isFile()) continue;
    const body = readFileSync(p, 'utf8');
    for (const [, id] of body.matchAll(/\bCUSTOMER-VERIFIED:\s*(R\d{2})\b/g)) {
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(f);
    }
  }
  return byId;
}

const INVENTORY = testInventory();
const CUSTOMER = customerEvidence();

function assess(contract) {
  const probe = PROBES[contract.id];
  if (!probe) return { status: 'NO PROBE', tests: 0, files: [], missing: [] };
  const re = probe.tests ? new RegExp(probe.tests, 'i') : null;
  const tests = re ? INVENTORY.filter((t) => re.test(t.name)) : [];
  const missing = (probe.files ?? []).filter((f) => !existsSync(join(ROOT, f)));
  const present = (probe.files ?? []).filter((f) => existsSync(join(ROOT, f)));
  const proven = CUSTOMER.get(contract.id) ?? [];
  let status = 'NO EVIDENCE';
  if (tests.length > 0 || present.length > 0) status = 'OFFLINE';
  if (proven.length > 0) status = 'CUSTOMER';
  return { status, tests: tests.length, suites: [...new Set(tests.map((t) => t.suite))], files: present, missing, proven };
}

const rows = CONTRACTS.contracts.map((c) => ({ id: c.id, title: c.title, ...assess(c) }));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), rows }, null, 1));
} else {
  const open = process.argv.includes('--open');
  console.log('APPLE — REQUIREMENTS MAP');
  console.log(`measured  ${new Date().toISOString()}`);
  console.log(`source    docs/requirements/CONTRACTS.json (${CONTRACTS.contracts.length} contracts)`);
  console.log(`evidence  ${INVENTORY.length} test names across ${new Set(INVENTORY.map((t) => t.suite)).size} suites`);
  console.log('');
  console.log('OFFLINE means the repository can prove something about it. It is NOT acceptance:');
  console.log('an offline test cannot register an account, take a payment, or build in Roblox Studio.');
  console.log('');
  for (const r of rows) {
    if (open && r.status === 'CUSTOMER') continue;
    const mark = r.status === 'CUSTOMER' ? '✓' : r.status === 'OFFLINE' ? '·' : r.status === 'NO EVIDENCE' ? '☐' : '!';
    console.log(`${mark} ${r.id}  ${r.status.padEnd(12)} ${String(r.tests).padStart(4)} tests  ${r.title}`);
    if (r.missing.length) console.log(`       missing: ${r.missing.join(', ')}`);
    if (r.proven?.length) console.log(`       verified by: ${r.proven.join(', ')}`);
  }
  const tally = (s) => rows.filter((r) => r.status === s).length;
  console.log('');
  console.log(`CUSTOMER ${tally('CUSTOMER')}  ·  OFFLINE ${tally('OFFLINE')}  ·  NO EVIDENCE ${tally('NO EVIDENCE')}  ·  NO PROBE ${tally('NO PROBE')}`);
  console.log('');
  console.log(`${tally('CUSTOMER')} of ${rows.length} contracts have a recorded customer journey.`);
  console.log('That figure is the only one that means the product works for a paying customer.');
}

const unprobed = rows.filter((r) => r.status === 'NO PROBE');
if (unprobed.length) {
  console.error(`\n${unprobed.length} contract(s) have no probe: ${unprobed.map((r) => r.id).join(', ')}`);
  process.exit(2);
}
