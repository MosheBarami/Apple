#!/usr/bin/env node
// Is the thing that was just deployed actually serving? And if not, put the old one back.
//
//   node infra/healthcheck.mjs --base <origin>
//   node infra/healthcheck.mjs --base <origin> --rollback-on-failure <capture-dir> --yes
//
//   --probe <path>[:<content-type>]   add a path to the checked set (repeatable)
//   --expect-sha <sha>                the build the origin is supposed to be serving
//   --allow-unknown-sha               accept `buildSha: unknown`, which means a deploy without one
//   --min-probes <n>                  fail unless at least n probes produced a result
//
// WHAT A HEALTH CHECK HAS TO BE, given what this repository has already shipped:
//
//   A STATUS CODE IS NOT HEALTH. `/pricing` answered 200 for weeks while every browser DOWNLOADED
//   it, because the stored object had no content type and the server's guess for an extensionless
//   key is application/octet-stream. curl passed it, grep passed it, the byte counts were right.
//   So every probe here asserts the content type as well as the status, and the JSON routes assert
//   the SHAPE of the body rather than that it parsed.
//
//   A CHECK THAT COULD NOT LOOK HAS NOT PASSED. Zero probes, a probe that threw, a run thinner
//   than the one that was asked for — none of those is health, and none of them is a failure of
//   the origin either. They are a third verdict, `unobserved`, with its own exit code (2), because
//   collapsing them into "healthy" is how a deploy is blessed by a checker that ran nothing, and
//   collapsing them into "unhealthy" makes an automatic rollback fire on a local network blip.
//
//   THE ROLLBACK IS THE POINT. docs/FAILURES.md F-62's rule is that an undo you have not watched
//   work is not an undo — so the undo is wired to the thing that notices, rather than to an
//   operator who has to notice first, read a runbook, and type a command that (as F-62 records)
//   did not work. `--rollback-on-failure` hands the capture directory to
//   infra/rollback-static.mjs, whose verdict decides this program's exit code: a rollback that
//   uploaded nothing cannot end the run quietly.
import { execFileSync } from 'node:child_process';
import { parseSemver } from '../scripts/lib/release-rules.mjs';
import { decideAutoRollback, judgeHealth, judgeProbe } from '../scripts/lib/rollback-rules.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

const argv = process.argv.slice(2);
let BASE = null;
let CAPTURE = null;
let YES = false;
let ALLOW_UNKNOWN_SHA = false;
let EXPECT_SHA = null;
let MIN_PROBES = 1;
const EXTRA = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--base') { BASE = argv[i + 1] ?? null; i += 1; continue; }
  if (a === '--rollback-on-failure') { CAPTURE = argv[i + 1] ?? null; i += 1; continue; }
  if (a === '--probe') { EXTRA.push(argv[i + 1] ?? ''); i += 1; continue; }
  if (a === '--expect-sha') { EXPECT_SHA = argv[i + 1] ?? null; i += 1; continue; }
  if (a === '--min-probes') {
    MIN_PROBES = Number(argv[i + 1]);
    // `Number(undefined)` is NaN, and every comparison against NaN is false — so a missing value
    // would pass a `< 1` test and become a floor of nothing.
    if (!Number.isInteger(MIN_PROBES) || MIN_PROBES < 1) { console.error('healthcheck: --min-probes needs a positive integer'); process.exit(2); }
    i += 1;
    continue;
  }
  if (a === '--allow-unknown-sha') { ALLOW_UNKNOWN_SHA = true; continue; }
  if (a === '--yes') { YES = true; continue; }
  console.error(`healthcheck: unrecognised flag ${a} — use --base <origin> [--probe <path>[:<type>]] [--rollback-on-failure <dir> --yes]`);
  process.exit(2);
}
if (!BASE) { console.error('healthcheck: --base <origin> is required'); process.exit(2); }
BASE = BASE.replace(/\/$/, '');
if (CAPTURE && !YES) { console.error('healthcheck: --rollback-on-failure writes to the origin; it needs --yes'); process.exit(2); }

/* ------------------------------------------------------------------ the probes --- */

const TWENTY_MINUTES = 20 * 60 * 1000;

/**
 * The health route is asked for a SHAPE, not for a 200.
 *
 * `version` must be a real version, because `/api/health` reporting something unparseable means
 * nothing downstream can say what is deployed. `buildSha` must not be `unknown`: that value is
 * what the worker returns when a deploy did not supply one, and it is the whole reason the field
 * exists — §10.2 requires comparing the deployed build to HEAD, and `unknown` makes that
 * unperformable while looking like an answer.
 */
const health = {
  name: '/api/health',
  path: '/api/health',
  status: 200,
  contentTypeIncludes: 'application/json',
  json: {
    ok: true,
    version: (v) => (parseSemver(v) === null ? `the deployed version is not a version: ${JSON.stringify(v)}` : true),
    buildSha: (s) => {
      if (typeof s !== 'string' || s === '') return 'no build sha at all';
      if (s === 'unknown' && !ALLOW_UNKNOWN_SHA) return 'buildSha is "unknown" — this build was deployed without one, so nothing can compare it to HEAD';
      if (EXPECT_SHA !== null && !s.startsWith(EXPECT_SHA) && !EXPECT_SHA.startsWith(s)) return `the origin serves ${s}, and ${EXPECT_SHA} was deployed`;
      return true;
    },
    time: (t) => {
      const ms = Date.parse(String(t));
      // `Number.isFinite`, not a truthiness test: Date.parse returns NaN for anything it cannot
      // read, and `NaN > x` is false, so a `>` comparison alone would accept an unparseable time.
      if (!Number.isFinite(ms)) return `the origin's clock reads ${JSON.stringify(t)}`;
      const skew = Math.abs(Date.now() - ms);
      return skew > TWENTY_MINUTES ? `the origin's clock is ${Math.round(skew / 60000)} minutes out — this response may be cached` : true;
    },
  },
};

const DEFAULT_PAGES = [
  { name: '/', path: '/', status: 200, contentTypeIncludes: 'text/html' },
  { name: '/pricing', path: '/pricing', status: 200, contentTypeIncludes: 'text/html' },
  { name: '/app/', path: '/app/', status: 200, contentTypeIncludes: 'text/html' },
];

const probes = [health, ...DEFAULT_PAGES];
for (const spec of EXTRA) {
  const [path, type] = spec.split(':');
  if (!path || !path.startsWith('/')) { console.error(`healthcheck: --probe takes an absolute path, not ${JSON.stringify(spec)}`); process.exit(2); }
  probes.push({ name: path, path, status: 200, contentTypeIncludes: type === undefined ? 'text/html' : type });
}

/* ------------------------------------------------------------------- the run --- */

const results = [];
for (const probe of probes) {
  let got;
  try {
    const res = await fetch(`${BASE}${probe.path}`, { redirect: 'follow' });
    got = { status: res.status, contentType: res.headers.get('content-type') ?? '', body: await res.text() };
  } catch (e) {
    // A probe that threw is scored as a failure, never dropped. Dropping it would let a total
    // outage read as "no failing probes".
    got = { error: e.message };
  }
  const verdict = judgeProbe(probe, got);
  results.push(verdict);
  console.log(`  ${verdict.ok ? 'ok  ' : 'FAIL'}  ${verdict.name}${verdict.ok ? '' : ` — ${verdict.why.join('; ')}`}`);
}

const verdict = judgeHealth(results, { minProbes: MIN_PROBES });
const decision = decideAutoRollback(verdict);
console.log(`${BASE}: ${verdict.verdict.toUpperCase()} — ${verdict.reason}`);

if (!decision.rollback) {
  if (decision.exit === 0) console.log(`HEALTH OK — ${verdict.ran} probe(s) passed against ${BASE}`);
  else console.error(`HEALTH UNDECIDED — ${decision.reason}`);
  process.exit(decision.exit);
}

if (!CAPTURE) {
  console.error(`HEALTH FAILED — ${decision.reason}; no capture directory was given, so nothing was rolled back`);
  process.exit(1);
}

console.error(decision.reason);
try {
  const out = execFileSync(process.execPath, [`${ROOT}infra/rollback-static.mjs`, '--from', CAPTURE, '--base', BASE, '--yes'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.stdout.write(out);
  // The rollback's own verdict, not this program's opinion of it: `ROLLBACK COMPLETE` is printed
  // only by a run that uploaded and read back every planned path.
  if (!/^ROLLBACK COMPLETE/m.test(out)) {
    console.error('HEALTH FAILED AND THE ROLLBACK DID NOT COMPLETE — the origin is serving a bad build and needs a person');
    process.exit(1);
  }
  console.error(`HEALTH FAILED AND WAS ROLLED BACK — ${BASE} has been restored from ${CAPTURE}; the deploy that failed is still a defect`);
  process.exit(1);
} catch (e) {
  process.stdout.write((e.stdout ?? '').toString());
  process.stderr.write((e.stderr ?? '').toString());
  console.error('HEALTH FAILED AND THE ROLLBACK DID NOT COMPLETE — the origin is serving a bad build and needs a person');
  process.exit(1);
}
