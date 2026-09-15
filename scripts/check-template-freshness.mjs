#!/usr/bin/env node
// The REAL "nothing outdated" gate: read the Luau and match it against Roblox APIs that have been
// removed or deprecated.
//
// harvest-templates.mjs applies a DATE gate, which is a proxy and says so. This is the check that
// earns the word: a repository pushed last week can still be full of `LoadLibrary` and `:remove()`,
// and one untouched for a year can be perfectly current. So the verdict here comes from the code.
//
// It reads the harvest artefact rather than re-running the search — the search API allows 30 calls
// a minute and a deep pass that re-harvested first exhausted the budget and then degraded the very
// file it was enriching (a guard that damaged what it measured).
//
// THREE OUTCOMES, AND "UNCHECKED" IS ONE OF THEM. A repo whose tree or files could not be read is
// left `apiChecked: false` with the error recorded. It is never promoted to current — an
// unobserved property is not an observation.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// The rule table moved to lib/template-curation.mjs, which the curator reads too. It used to be
// declared here and copied there, and two lists that mean the same thing drift: the copy that
// misses a rule reports a repository as current for no reason a reader could see.
import { API_RULES } from './lib/template-curation.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'packages', 'corpus', 'data', 'template-seeds.json');
const N = Number(process.argv.find((a) => a.startsWith('--n='))?.split('=')[1] ?? 250);
const SAMPLE = 12;


const doc = JSON.parse(readFileSync(FILE, 'utf8'));
const byName = new Map(doc.templates.map((t) => [t.fullName, t]));
const target = doc.templates
  .filter((t) => !t.archived && t.licence && t.licence !== 'NOASSERTION' && !t.apiChecked)
  .slice(0, N);
process.stderr.write(`checking ${target.length} of ${doc.templates.length}\n`);

const gh = (p, ...f) => JSON.parse(execFileSync('gh', ['api', '-X', 'GET', p, ...f.flatMap((x) => ['-f', x])],
  { encoding: 'utf8', maxBuffer: 64 << 20 }));

let done = 0;
for (const r of target) {
  try {
    const tree = gh(`repos/${r.fullName}/git/trees/${r.defaultBranch}`, 'recursive=1');
    const lua = (tree.tree ?? []).filter((n) => /\.(lua|luau)$/i.test(n.path) && n.size > 0 && n.size < 200_000);
    r.luaFiles = lua.length;
    if (!lua.length) { r.apiChecked = true; r.apiSampled = 0; r.apiFindings = []; continue; }
    // A spread sample, stated as one: reading the first N files would miss a repo whose legacy
    // code sits in one folder the tree happens to list late.
    const step = Math.max(1, Math.floor(lua.length / SAMPLE));
    const sample = lua.filter((_, i) => i % step === 0).slice(0, SAMPLE);
    const findings = [];
    let read = 0;
    for (const f of sample) {
      const url = `https://raw.githubusercontent.com/${r.fullName}/${r.defaultBranch}/`
        + f.path.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(url);
      if (!res.ok) continue;
      read++;
      // Comments are stripped FIRST. A guard that reads its own commentary as data is a defect
      // this repo has caught three times — a file explaining "we replaced wait() with task.wait()"
      // must not be reported as containing wait().
      const code = (await res.text()).replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '');
      for (const [severity, re, why] of API_RULES) if (re.test(code)) findings.push({ severity, why, file: f.path });
    }
    if (!read) { r.apiError = 'no sampled file could be read'; continue; }
    r.apiChecked = true;
    r.apiSampled = read;
    r.apiFindings = [...new Map(findings.map((f) => [f.why, f])).values()];
  } catch (e) {
    r.apiError = String(e.message ?? e).slice(0, 140);
  }
  if (++done % 25 === 0) process.stderr.write(`${done}/${target.length}\n`);
}

for (const t of byName.values()) {
  const removed = (t.apiFindings ?? []).filter((f) => f.severity === 'removed');
  const deprecated = (t.apiFindings ?? []).filter((f) => f.severity === 'deprecated');
  t.freshness = t.archived ? 'archived'
    : !t.apiChecked ? 'date-only'
    : removed.length ? 'outdated'
    : deprecated.length ? 'dated'
    : 'current';
  t.usable = !t.archived && !!t.licence && t.licence !== 'NOASSERTION' && removed.length === 0;
}
const tally = (k) => doc.templates.reduce((m, r) => ((m[r[k] ?? 'none'] = (m[r[k] ?? 'none'] ?? 0) + 1), m), {});
doc.freshnessPolicy.apiGate = `code read for ${doc.templates.filter((t) => t.apiChecked).length} repositories, ${SAMPLE}-file spread sample each`;
doc.counts.byFreshness = tally('freshness');
doc.counts.usable = doc.templates.filter((t) => t.usable).length;
doc.counts.apiChecked = doc.templates.filter((t) => t.apiChecked).length;
writeFileSync(FILE, JSON.stringify(doc, null, 1) + '\n');
process.stderr.write(`\n${JSON.stringify(doc.counts.byFreshness)}\nusable ${doc.counts.usable}\n`);
