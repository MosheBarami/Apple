#!/usr/bin/env node
// S1 LAND, probed against the deployed origin, as a program rather than as a paragraph.
//
//   node scripts/probe-s1.mjs [--base <origin>] [--out <dir>]
//
// §3.4 says a station is PROVEN only by a probe of the DEPLOYED origin. Until now S1 was proven by
// a sequence of curls I ran and then described, which is evidence nobody else can re-run — and
// §16.1 wants at least one red-first gate tagged S1..S12, of which there were none.
//
// The four clauses are §3.4's, not paraphrases of them:
//   1. the site and /pricing return 200
//   2. zero user-visible "Golem"
//   3. zero "$0 forever" / "No card required, ever" / "never be charged"
//   4. the published free quota equals PLAN_LIMITS.free.creditsPerDay
//
// TWO THINGS THIS GETS RIGHT THAT THE HAND-RUN VERSION GOT WRONG.
//
// It CACHE-BUSTS every request. The live pages carry `cache-control: public, max-age=60`, and the
// first check after a fix returned the previous bytes while `content-length` already reported the
// new ones. A probe that reads a cached response is answering a question about Cloudflare.
//
// And it derives the expected quota from `packages/shared/src/index.ts` rather than holding a copy.
// A published figure compared against a number typed into the checker proves the two agree with
// each other, not with the product. When the constant cannot be read this EXITS NON-ZERO instead of
// skipping the clause: a station probe that quietly checks three of four clauses reports PROVEN
// over work it never looked at, which is the failure this repository keeps rediscovering.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRODUCT_ORIGIN } from './lib/product-origin.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// THE ORIGIN IS READ, NOT TYPED. It used to be a copy of the LEGACY hostname, so this program
// measured — and wrote into its evidence file as "origin" — a deployment nobody is sent to.
const DEPLOYED = PRODUCT_ORIGIN;

const argv = process.argv.slice(2);
let BASE = DEPLOYED;
let OUT = join(ROOT, 'docs', 'evidence', 'stations');
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--base') { BASE = argv[i + 1]; i += 1; continue; }
  if (a === '--out') { OUT = argv[i + 1]; i += 1; continue; }
  console.error(`probe-s1: unrecognised flag ${a} — use --base <origin> or --out <dir>`);
  process.exit(2);
}
BASE = BASE.replace(/\/$/, '');

// The hostname is on §12.5's CLOSED list and appears in canonical/og:url/twitter:image on every
// page. It is not user-visible copy and renaming it would break every client and the plugin.
const HOSTNAME_TOKEN = 'golem.moshe-barami111.workers.dev';
const FORBIDDEN = /\$0 forever|No card required, ever|never be charged/gi;

const findings = [];
const fail = (what, why) => findings.push({ what, why });

/** Cache-busted, because a 60-second cache makes a stale body look like a failed deploy. */
async function get(path) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}_probe=${Date.now()}${Math.random().toString(36).slice(2)}`;
  const res = await fetch(url, { redirect: 'follow' });
  return { status: res.status, contentType: (res.headers.get('content-type') ?? '').toLowerCase(), body: await res.text() };
}

/* ------------------------------------------- clause 4's expected value, derived --- */

const shared = (() => {
  try { return readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8'); } catch { return null; }
})();
const freeMatch = shared?.match(/free: \{ creditsPerDay: ([\d_]+), creditsPerMonth: ([\d_]+) \}/);
if (!freeMatch) {
  console.error('probe-s1: cannot read PLAN_LIMITS.free from packages/shared/src/index.ts');
  console.error('Clause 4 compares the PUBLISHED quota against that constant. With the constant unreadable there is');
  console.error('nothing to compare against, and passing the other three clauses off as a proven station would be reporting');
  console.error('a station proven over a clause that was never checked.');
  process.exit(2);
}
const FREE_PER_DAY = Number(freeMatch[1].replace(/_/g, ''));
const FREE_PER_MONTH = Number(freeMatch[2].replace(/_/g, ''));

/* ------------------------------------------------------------------ the probe --- */

const pages = {};
for (const path of ['/', '/pricing']) {
  const r = await get(path);
  pages[path] = r;
  // CLAUSE 1
  if (r.status !== 200) fail(`${path} returned ${r.status}`, 'clause 1 — the site and /pricing must return 200');

  //[[ AND IT MUST BE A PAGE, NOT A DOWNLOAD. Beyond §3.4's letter, squarely inside its point.
  //
  //   /pricing served 200 with 36,951 correct bytes and `content-type: application/octet-stream`,
  //   so every browser DOWNLOADED the commercial page instead of rendering it. It passed a status
  //   check, a byte-count check, and every grep over its body, because curl and grep do not care
  //   what the content type is. §3.2's stranger test is "a person with a fresh browser can ___",
  //   and the answer for a file that downloads is: not read this page.
  //
  //   Checked here rather than in a checker of its own because it is the same question S1 asks. ]]
  if (r.status === 200 && !r.contentType.includes('text/html')) {
    fail(
      `${path} serves ${r.contentType || '(no content-type)'}, not text/html`,
      'a 200 that a browser downloads instead of rendering is not a page a stranger can read',
    );
  }
}

const both = `${pages['/'].body}\n${pages['/pricing'].body}`;

// CLAUSE 2 — every occurrence that is not the closed-list hostname.
const golem = [...both.matchAll(/golem[a-z0-9._-]*/gi)]
  .map((m) => m[0].toLowerCase())
  .filter((t) => t !== HOSTNAME_TOKEN);
if (golem.length) {
  const counted = [...new Set(golem)].map((t) => `${t} x${golem.filter((g) => g === t).length}`);
  fail(`${golem.length} user-visible Golem occurrence(s): ${counted.join(', ')}`, 'clause 2 — a stranger reads this, not the repository');
}

// CLAUSE 3
const forbidden = both.match(FORBIDDEN) ?? [];
if (forbidden.length) {
  fail(`${forbidden.length} forbidden phrase(s): ${[...new Set(forbidden)].join(', ')}`, 'clause 3 — §12.5 contractual terms');
}

// CLAUSE 4 — tolerant of Astro's scoping attributes on the element, which an earlier hand-written
// grep was not: it required a bare `<strong>` and read the page as publishing nothing at all.
const published = [...pages['/pricing'].body.matchAll(/<strong[^>]*>([\d,]+) Credits<\/strong>\s*per day[^0-9]*([\d,]+) a month/g)]
  .map((m) => ({ day: Number(m[1].replace(/,/g, '')), month: Number(m[2].replace(/,/g, '')) }));
if (!published.length) {
  fail('no per-day Credit figure is published on /pricing at all', 'clause 4 — nothing to compare against the constant');
} else if (!published.some((p) => p.day === FREE_PER_DAY && p.month === FREE_PER_MONTH)) {
  fail(
    `no published row matches the free plan: page has ${published.map((p) => `${p.day}/day`).join(', ')}, PLAN_LIMITS.free is ${FREE_PER_DAY}/day`,
    'clause 4 — the published free quota must equal PLAN_LIMITS.free.creditsPerDay',
  );
}

/* ------------------------------------------------------------------- evidence --- */

let sha = 'unknown';
try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* not a repo */ }
mkdirSync(OUT, { recursive: true });
const capture = {
  station: 'S1',
  origin: BASE,
  headSha: sha,
  clauses: {
    status: Object.fromEntries(Object.entries(pages).map(([p, r]) => [p, r.status])),
    contentType: Object.fromEntries(Object.entries(pages).map(([p, r]) => [p, r.contentType])),
    userVisibleGolem: golem.length,
    forbiddenPhrases: forbidden.length,
    publishedPerDay: published,
    planLimitsFree: { day: FREE_PER_DAY, month: FREE_PER_MONTH },
  },
  bodySha256: Object.fromEntries(
    Object.entries(pages).map(([p, r]) => [p, createHash('sha256').update(r.body).digest('hex')]),
  ),
  findings,
};
writeFileSync(join(OUT, 'S1.json'), `${JSON.stringify(capture, null, 2)}\n`);

console.log(`S1 probed against ${BASE} at HEAD ${sha.slice(0, 7)}`);
console.log(`  clause 1  / ${pages['/'].status} ${pages['/'].contentType}, /pricing ${pages['/pricing'].status} ${pages['/pricing'].contentType}`);
console.log(`  clause 2  user-visible Golem: ${golem.length}`);
console.log(`  clause 3  forbidden phrases: ${forbidden.length}`);
console.log(`  clause 4  published ${published.map((p) => p.day).join('/')} per day against PLAN_LIMITS.free ${FREE_PER_DAY}`);

if (findings.length) {
  for (const f of findings) console.error(`  ${f.what} — ${f.why}`);
  console.log(`S1 UNPROVEN — ${findings.length} finding(s)`);
  process.exit(1);
}
// THE SUCCESS TOKEN APPEARS EXACTLY ONCE IN THIS FILE, ON THE NEXT LINE, AND THAT IS LOAD-BEARING.
//
// It did not, until the first falsification of G-S1 caught it. The error branch above used to
// explain itself by quoting the token, so a failing run PRINTED the gate's EXPECT string and
// gate-check recorded EXPECT=matched on a run that exited 2. The gate was still red — a gate needs
// a zero exit AND a match — but the token had stopped discriminating, and any later failure path
// that exited 0 would have sailed straight through it.
//
// This is the sixth check in this repository found matching its own explanatory prose, and the
// first I have written INTO an oracle rather than found in one. Note that even this comment may
// not spell it: tests/probe-s1.test.mjs counts occurrences in the whole file and requires one.
console.log('S1 PROVEN — all four clauses hold against the deployed origin');
