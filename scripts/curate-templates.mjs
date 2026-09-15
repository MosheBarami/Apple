#!/usr/bin/env node
// Turn the 3,017-row GitHub search result into a mechanic library, and keep the receipts for
// everything it throws away.
//
// The harvest answered "what does GitHub return for roblox?". This answers the only question the
// agent can use: "who has already built a shop with gamepasses, and may we learn from it?"
//
// WHAT THIS READS. For every row that survives the metadata gate it fetches the repository's file
// TREE — the actual paths — and keeps the row only when a Luau file in it is NAMED after a
// mechanic. Then it fetches those specific files and runs them against the Roblox calls that have
// been REMOVED, so the currency verdict is about the file being cited rather than about a
// `pushed_at` date. A repository whose tree could not be read is `unverified` and is never kept;
// a tree GitHub truncated is recorded as truncated, because a partial listing that finds nothing
// has not established that there is nothing.
//
// NOTHING IS VENDORED. Not one line of anybody's Luau is written to the artefact. What ships is
// the mechanic, the path that proves it, the repository, its licence and its author.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { curate, excludeReason, API_RULES, MECHANICS } from './lib/template-curation.mjs';

const execFileP = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IN = join(ROOT, 'packages', 'corpus', 'data', 'template-seeds.json');
const OUT = join(ROOT, 'packages', 'corpus', 'data', 'mechanic-library.json');
const TS_OUT = join(ROOT, 'apps', 'worker', 'src', 'mechanic-citations.ts');
const LIMIT = Number(process.argv.find((a) => a.startsWith('--n='))?.split('=')[1] ?? Infinity);
const CONCURRENCY = 6;

const harvest = JSON.parse(readFileSync(IN, 'utf8'));

/* ------------------------------------------------- pass 1: metadata, no network, no excuses --- */

const ledger = [];
const needTree = [];
for (const repo of harvest.templates) {
  const verdict = curate(repo);
  if (verdict.exclusion.rule === 'tree_not_read') { needTree.push(repo); continue; }
  ledger.push({ fullName: repo.fullName, rule: verdict.exclusion.rule, class: verdict.exclusion.class, matched: verdict.exclusion.matched, field: verdict.exclusion.field });
}
process.stderr.write(`metadata: ${ledger.length} excluded, ${needTree.length} need their tree read\n`);

/* --------------------------------------------------------- pass 2: read the actual repository --- */

const gh = async (path) => JSON.parse((await execFileP('gh', ['api', '-X', 'GET', path], { maxBuffer: 128 << 20 })).stdout);

// Trees are cached so the CURATION RULES can be re-run without re-reading 653 repositories. The
// cache holds what GitHub said, never a verdict: re-running must be free to change its mind.
const CACHE = join(ROOT, '.cache', 'template-trees.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const fresh = process.argv.includes('--refresh');

async function treeOf(repo) {
  if (!fresh && cache[repo.fullName]) return cache[repo.fullName];
  let out;
  try {
    const res = await gh(`repos/${repo.fullName}/git/trees/${encodeURIComponent(repo.defaultBranch)}?recursive=1`);
    out = { paths: (res.tree ?? []).filter((n) => n.type === 'blob').map((n) => n.path), truncated: !!res.truncated };
  } catch (e) {
    out = { error: String(e.stderr || e.message || e).replace(/\s+/g, ' ').slice(0, 120) };
  }
  cache[repo.fullName] = out;
  return out;
}

/** The cited file, read and matched against calls Roblox has removed. Comments stripped first. */
async function currencyOf(repo, paths) {
  const findings = [];
  let read = 0;
  for (const path of paths) {
    const url = `https://raw.githubusercontent.com/${repo.fullName}/${repo.defaultBranch}/`
      + path.split('/').map(encodeURIComponent).join('/');
    let res;
    try { res = await fetch(url); } catch { continue; }
    if (!res.ok) continue;
    read++;
    const code = (await res.text()).replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '');
    for (const [severity, re, why] of API_RULES) if (re.test(code)) findings.push({ severity, why, file: path });
  }
  return { read, findings: [...new Map(findings.map((f) => [f.why + f.file, f])).values()] };
}

const kept = [];
const queue = needTree.slice(0, LIMIT === Infinity ? needTree.length : LIMIT);
let done = 0;

async function worker() {
  for (;;) {
    const repo = queue.shift();
    if (!repo) return;
    const tree = await treeOf(repo);
    const verdict = curate(repo, { tree: tree.paths ?? null, treeError: tree.error });
    if (++done % 50 === 0) process.stderr.write(`  ${done}/${needTree.length} trees\n`);

    if (!verdict.kept) {
      // A TRUNCATED TREE THAT FOUND NOTHING HAS NOT FOUND NOTHING. GitHub caps a recursive listing;
      // a repository large enough to hit that cap is exactly the sort that has a ShopService in it.
      const rule = verdict.exclusion.rule === 'no_mechanic_evidence' && tree.truncated
        ? 'tree_truncated' : verdict.exclusion.rule;
      const cls = rule === 'tree_truncated' ? 'unverified' : verdict.exclusion.class;
      ledger.push({ fullName: repo.fullName, rule, class: cls, matched: verdict.exclusion.matched, field: verdict.exclusion.field });
      continue;
    }

    const cited = [...new Set(verdict.mechanics.map((m) => m.where))].slice(0, 5);
    const currency = await currencyOf(repo, cited);
    const removed = currency.findings.filter((f) => f.severity === 'removed');

    if (!currency.read) {
      ledger.push({ fullName: repo.fullName, rule: 'cited_file_unreadable', class: 'unverified',
        matched: `${cited.length} paths`, field: 'raw' });
      continue;
    }
    if (removed.length) {
      // "Nothing outdated" with the offending call named. A bare verdict is unactionable.
      ledger.push({ fullName: repo.fullName, rule: 'removed_api', class: 'outdated',
        matched: removed[0].why, field: removed[0].file });
      continue;
    }

    kept.push({
      fullName: repo.fullName,
      owner: repo.fullName.split('/')[0],
      url: repo.url,
      description: repo.description,
      stars: repo.stars,
      pushedAt: repo.pushedAt,
      licence: repo.licence,
      licenceUrl: repo.licenceUrl,
      licenceSource: repo.licenceSource,
      mechanics: verdict.mechanics.map((m) => ({ id: m.id, where: m.where, matched: m.matched })),
      // What the author claims minus what the tree proves — kept apart on purpose.
      alsoClaims: verdict.claimed.filter((id) => !verdict.mechanics.some((m) => m.id === id)),
      treeTruncated: tree.truncated,
      currency: {
        filesRead: currency.read,
        // Only ever 'checked-clean' or 'checked-deprecated' here: 'removed' was excluded above and
        // 'unchecked' cannot occur, because a row that could not be read never reached this line.
        verdict: currency.findings.length ? 'deprecated-calls-present' : 'clean',
        findings: currency.findings.map((f) => ({ why: f.why, file: f.file })),
      },
    });
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

mkdirSync(dirname(CACHE), { recursive: true });
writeFileSync(CACHE, JSON.stringify(cache));

/* --------------------------------------------------------------------------- the artefacts --- */

kept.sort((a, b) => b.stars - a.stars);
const tally = (rows, key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] ?? 0) + 1), m), {});
const byMechanic = {};
for (const k of kept) for (const m of k.mechanics) (byMechanic[m.id] ??= []).push(k.fullName);

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: { file: 'packages/corpus/data/template-seeds.json', harvestedAt: harvest.generatedAt, rows: harvest.templates.length },
  method: 'metadata exclusion by named rule, then the repository file tree read over the network; a '
    + 'row is kept only when a Luau path in its own tree is named after a mechanic, and the cited '
    + 'files are then read and matched against Roblox calls that have been removed. No code is vendored.',
  counts: {
    harvested: harvest.templates.length,
    kept: kept.length,
    excludedByRule: tally(ledger, 'rule'),
    excludedByClass: tally(ledger, 'class'),
    byMechanic: Object.fromEntries(Object.entries(byMechanic).map(([k, v]) => [k, v.length])),
    mechanicsWithNoImplementation: MECHANICS.map((m) => m.id).filter((id) => !byMechanic[id]),
  },
  // The whole ledger, so any exclusion can be argued with by name.
  exclusions: ledger.sort((a, b) => a.fullName.localeCompare(b.fullName)),
  entries: kept,
}, null, 1) + '\n');

/* ------------------------------------- the shipped subset, as TypeScript the worker can import --- */

const cite = (k) => ({
  repo: k.fullName, owner: k.owner, url: k.url, stars: k.stars,
  licence: k.licence, licenceUrl: k.licenceUrl,
  mechanics: k.mechanics.map((m) => ({ id: m.id, file: m.where })),
  currency: k.currency.verdict,
  deprecated: k.currency.findings.map((f) => f.why),
});

writeFileSync(TS_OUT,
  '// GENERATED by scripts/curate-templates.mjs. Do not edit by hand — re-run the curator.\n'
  + '//\n'
  + '// Every row here survived: a named-rule exclusion sweep for exploits, macros, account abuse and\n'
  + '// client tampering; a licence that permits reuse; and a file tree read over the network in which\n'
  + '// a Luau path is NAMED after the mechanic it is cited for. The cited files were then read and\n'
  + '// contain no Roblox call that has been removed.\n'
  + '//\n'
  + '// NO CODE IS VENDORED. This is a bibliography. The licence and the author travel with every row\n'
  + '// because the agent is meant to READ the implementation and write its own, and a customer\'s game\n'
  + '// must never contain someone else\'s GPL Luau.\n'
  + `// Curated ${new Date().toISOString().slice(0, 10)} from a harvest of ${harvest.templates.length} repositories; ${kept.length} survived.\n`
  + '\nexport interface MechanicCitation {\n'
  + '  repo: string;\n  owner: string;\n  url: string;\n  stars: number;\n'
  + '  licence: string;\n  licenceUrl: string | null;\n'
  + '  /** The mechanic, and the path in that repository whose NAME is the evidence for it. */\n'
  + '  mechanics: { id: string; file: string }[];\n'
  + "  /** 'clean' = the cited files were read and hold no removed or deprecated call. */\n"
  + '  currency: string;\n'
  + '  /** Deprecated calls found in the cited files, named, so the agent does not copy them forward. */\n'
  + '  deprecated: string[];\n}\n\n'
  + `export const MECHANIC_CITATIONS: readonly MechanicCitation[] = ${JSON.stringify(kept.map(cite), null, 1)};\n`);

process.stderr.write(`\nkept ${kept.length} of ${harvest.templates.length}\n`);
process.stderr.write(`${JSON.stringify(tally(ledger, 'class'))}\n`);
process.stderr.write(`mechanics with an implementation: ${Object.keys(byMechanic).length} of ${MECHANICS.length}\n`);
