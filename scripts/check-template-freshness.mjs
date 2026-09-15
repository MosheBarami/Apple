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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'packages', 'corpus', 'data', 'template-seeds.json');
const N = Number(process.argv.find((a) => a.startsWith('--n='))?.split('=')[1] ?? 250);
const SAMPLE = 12;

/**
 * Calls Roblox has REMOVED or formally deprecated, and what replaced each.
 *
 * `removed` means current clients throw or the member is gone — a template containing one is
 * BROKEN, not merely dated, so it is excluded. `deprecated` still runs, so it downgrades the row
 * and the replacement is recorded for whoever imports it.
 */
const API_RULES = [
  ['removed', /\bLoadLibrary\s*\(/, 'LoadLibrary was removed — use a ModuleScript with require()'],
  ['removed', /\bFilteringEnabled\b/, 'Workspace.FilteringEnabled was removed — filtering is always on'],
  ['removed', /:\s*remove\s*\(\s*\)/, ':remove() was removed — use :Destroy()'],
  ['removed', /:\s*children\s*\(\s*\)/, ':children() was removed — use :GetChildren()'],
  ['removed', /:\s*findFirstChild\s*\(/, ':findFirstChild() was removed — use :FindFirstChild()'],
  ['removed', /:\s*clone\s*\(\s*\)/, ':clone() was removed — use :Clone()'],
  ['removed', /\bgame\.Lighting\.Sky\b/, 'Lighting.Sky was replaced by a Sky instance'],
  ['deprecated', /\bBody(Velocity|Position|Gyro|Thrust|AngularVelocity)\b/, 'BodyMovers are deprecated — use LinearVelocity / AlignPosition / AlignOrientation'],
  ['deprecated', /(?<![.:\w])spawn\s*\(/, 'spawn() is deprecated — use task.spawn()'],
  ['deprecated', /(?<![.:\w])delay\s*\(/, 'delay() is deprecated — use task.delay()'],
  ['deprecated', /(?<![.:\w])wait\s*\(\s*[\d.]*\s*\)/, 'wait() is deprecated — use task.wait()'],
  ['deprecated', /GetService\(\s*["']Chat["']\s*\)/, 'the legacy Chat service is superseded by TextChatService'],
  ['deprecated', /\bRay\.new\s*\(/, 'Ray.new is superseded by workspace:Raycast()'],
  ['deprecated', /\bFindPartOnRay\w*\s*\(/, 'FindPartOnRay* is superseded by workspace:Raycast()'],
  ['deprecated', /\bDataStoreService:GetDataStore\([^)]*\)\s*:\s*GetAsync/, 'a bare GetAsync without UpdateAsync loses writes under contention — prefer UpdateAsync'],
];

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
