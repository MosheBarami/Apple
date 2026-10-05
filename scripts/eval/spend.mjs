#!/usr/bin/env node
// Print the Workers AI spend state (GET /api/admin/spend): run it before and after every test batch and log the two
// lines in planning/proof/ops/spend.md (handoff ground rule 5: test spend stays at or under $20 a month).
//
//   node scripts/eval/spend.mjs [--env-file <.env>] [--api-base <url>] [--max-month-usd 20]
//
// Exit 0 when under the ceiling, 3 when at or over it or the kill switch is on. The admin key is never printed.
import { pathToFileURL } from 'node:url';
import { makeAdminApi } from './lib/api.mjs';
import { loadHarnessEnv, redact } from './lib/env.mjs';
import { DEFAULTS, parseArgs } from './run-piece.mjs';

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const env = loadHarnessEnv({ envFile: flags['env-file'], apiBase: flags['api-base'] });
  const ceiling = Number(flags['max-month-usd'] ?? DEFAULTS.maxMonthUsd);
  try {
    const s = (await makeAdminApi({ apiBase: env.apiBase, adminKey: env.adminKey }).spend())?.state;
    if (!s) throw new Error('the spend report has no state');
    console.log(`${new Date().toISOString()}  month $${Number(s.estimatedMonthUsd).toFixed(2)} of the $${ceiling} test ceiling  |  month billable neurons ${s.monthBillableNeurons}  |  today ${s.dayNeurons} neurons  |  killed: ${s.killed}`);
    if (s.killed || Number(s.estimatedMonthUsd) >= ceiling) process.exitCode = 3;
  } catch (e) {
    console.error(redact(e.message, [env.adminKey]));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
