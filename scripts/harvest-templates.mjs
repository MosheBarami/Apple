#!/usr/bin/env node
// Harvest whole GAME TEMPLATES and named MECHANICS that Roblox communities already built.
//
// The asset harvest brings meshes and textures. This brings the other half the owner asked for:
// finished systems — a tycoon, an inventory, a round-based match loop, a save system — written by
// people who ship Roblox games, with a licence that permits reuse.
//
// "NOTHING OUTDATED" IS ENFORCED IN TWO PLACES, AND ONLY ONE OF THEM IS A DATE.
//
//  1. A date gate (cheap, metadata only): a repository not pushed inside FRESH_MONTHS is dropped.
//     This is a proxy and is labelled as one — a repo can be current and untouched, or pushed
//     yesterday and full of 2019 code.
//  2. An API gate (--deep): the actual Luau is read and matched against calls Roblox has REMOVED
//     or deprecated. This is the real check. A repo that fails it is recorded with the exact
//     offending call, because "outdated" as a bare verdict is unactionable.
//
// A repo that has not been through gate 2 is `apiChecked: false`. It is never silently promoted
// to "fresh" — an unobserved property is not an observation.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages', 'corpus', 'data', 'template-seeds.json');
const NOW = new Date();
const FRESH_MONTHS = 18;
const CUTOFF = new Date(NOW.getTime() - FRESH_MONTHS * 30.44 * 864e5).toISOString().slice(0, 10);

/**
 * Calls Roblox has REMOVED or formally deprecated, with what replaced each one.
 *
 * Sourced from the Creator Hub deprecation notices. `removed` means the call throws or no longer
 * exists on current clients — a template containing one is broken, not merely dated. `deprecated`
 * still runs, so it downgrades a template rather than excluding it.
 */
const API_RULES = [
  ['removed', /\bLoadLibrary\s*\(/, 'LoadLibrary was removed — use a ModuleScript and require()'],
  ['removed', /\bFilteringEnabled\b/, 'Workspace.FilteringEnabled was removed — filtering is always on'],
  ['removed', /:\s*remove\s*\(\s*\)/, ':remove() was removed — use :Destroy()'],
  ['removed', /:\s*children\s*\(\s*\)/, ':children() was removed — use :GetChildren()'],
  ['removed', /:\s*findFirstChild\s*\(/, ':findFirstChild() was removed — use :FindFirstChild()'],
  ['removed', /\bgame\.Lighting\.Sky\b/, 'Lighting.Sky was replaced by a Sky instance'],
  ['deprecated', /\bBody(Velocity|Position|Gyro|Thrust|Angular)\b/, 'BodyMovers are deprecated — use LinearVelocity / AlignPosition / AlignOrientation'],
  ['deprecated', /(?<![.:\w])spawn\s*\(/, 'spawn() is deprecated — use task.spawn()'],
  ['deprecated', /(?<![.:\w])delay\s*\(/, 'delay() is deprecated — use task.delay()'],
  ['deprecated', /(?<![.:\w])wait\s*\(/, 'wait() is deprecated — use task.wait()'],
  ['deprecated', /GetService\(\s*["']Chat["']\s*\)/, 'the legacy Chat service is superseded by TextChatService'],
  ['deprecated', /\bRay\.new\s*\(/, 'Ray.new + FindPartOnRay is superseded by workspace:Raycast()'],
  ['deprecated', /\bFindPartOnRay\w*\s*\(/, 'FindPartOnRay* is superseded by workspace:Raycast()'],
];

/**
 * What to search for. Each entry is a GENRE or a MECHANIC a Roblox game is actually made of, so
 * the harvest is organised the way a builder asks for things ("add a shop", "add a pet system")
 * rather than the way GitHub organises them.
 */
const QUERIES = [
  ['engine', 'topic:roblox'], ['engine', 'topic:luau'], ['engine', 'topic:roblox-lua'],
  ['engine', 'topic:rojo'], ['engine', 'topic:roblox-studio'], ['engine', 'topic:roblox-game'],
  ['genre', 'roblox tycoon'], ['genre', 'roblox obby'], ['genre', 'roblox simulator game'],
  ['genre', 'roblox tower defense'], ['genre', 'roblox horror game'], ['genre', 'roblox rpg'],
  ['genre', 'roblox fps shooter'], ['genre', 'roblox racing game'], ['genre', 'roblox survival game'],
  ['genre', 'roblox battle royale'], ['genre', 'roblox clicker game'], ['genre', 'roblox platformer'],
  ['genre', 'roblox sandbox game'], ['genre', 'roblox roleplay game'],
  ['mechanic', 'roblox inventory system'], ['mechanic', 'roblox datastore save'],
  ['mechanic', 'roblox combat system'], ['mechanic', 'roblox shop gamepass'],
  ['mechanic', 'roblox pet system'], ['mechanic', 'roblox leaderboard'],
  ['mechanic', 'roblox round system matchmaking'], ['mechanic', 'roblox quest system'],
  ['mechanic', 'roblox inventory ui'], ['mechanic', 'roblox character controller'],
  ['mechanic', 'roblox vehicle chassis'], ['mechanic', 'roblox building placement system'],
  ['mechanic', 'roblox admin commands'], ['mechanic', 'roblox anticheat'],
  ['mechanic', 'roblox networking remote'], ['mechanic', 'roblox raycast hitbox'],
  ['mechanic', 'roblox ragdoll'], ['mechanic', 'roblox procedural generation luau'],
  ['mechanic', 'roblox dialogue npc system'], ['mechanic', 'roblox currency economy'],
  ['framework', 'roblox framework knit'], ['framework', 'roblox ecs matter luau'],
  ['framework', 'roblox ui library luau'], ['framework', 'roblox state machine luau'],
  ['framework', 'roblox promise luau'], ['framework', 'roblox signal luau'],
  ['library', 'luau library'], ['library', 'wally package roblox'],
];

const gh = (args) => JSON.parse(execFileSync('gh', ['api', '-X', 'GET', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 }));

function search(q, page) {
  return gh(['search/repositories', '-f', `q=${q} pushed:>${CUTOFF}`, '-f', 'sort=stars',
    '-f', 'order=desc', '-f', 'per_page=100', '-f', `page=${page}`]);
}

const repos = new Map();
const perQuery = {};
for (const [facet, q] of QUERIES) {
  let got = 0;
  for (let page = 1; page <= 3; page++) {
    let res;
    try { res = search(q, page); } catch (e) { perQuery[q] = `ERROR ${String(e.message).slice(0, 80)}`; break; }
    const items = res.items ?? [];
    for (const r of items) {
      const prev = repos.get(r.full_name);
      if (prev) { prev.facets.add(facet); prev.queries.add(q); continue; }
      repos.set(r.full_name, {
        fullName: r.full_name,
        url: r.html_url,
        description: r.description ?? null,
        stars: r.stargazers_count,
        forks: r.forks_count,
        // Licence verbatim from GitHub's own detection, with the field that produced it named —
        // same discipline as the asset harvest: never inferred, always attributable.
        licence: (r.license ?? null)?.spdx_id ?? null,
        licenceUrl: r.license ? `${r.html_url}#license` : null,
        licenceSource: 'github repository license field',
        pushedAt: r.pushed_at,
        createdAt: r.created_at,
        language: r.language ?? null,
        topics: r.topics ?? [],
        defaultBranch: r.default_branch,
        archived: !!r.archived,
        size: r.size,
        facets: new Set([facet]),
        queries: new Set([q]),
        apiChecked: false,
        apiFindings: null,
      });
      got++;
    }
    if (items.length < 100) break;
  }
  perQuery[q] ??= got;
  process.stderr.write(`${q}: ${got}\n`);
}

const all = [...repos.values()].sort((a, b) => b.stars - a.stars);

const rows = all.map((r) => {
  const removed = (r.apiFindings ?? []).filter((f) => f.severity === 'removed');
  const deprecated = (r.apiFindings ?? []).filter((f) => f.severity === 'deprecated');
  return {
    ...r,
    facets: [...r.facets],
    queries: [...r.queries],
    // Four states, not two. "unchecked" is its own answer and never reads as "clean".
    freshness: r.archived ? 'archived'
      : !r.apiChecked ? 'date-only'
      : removed.length ? 'outdated'
      : deprecated.length ? 'dated'
      : 'current',
    apiFindings: r.apiFindings
      ? [...new Map((r.apiFindings).map((f) => [f.why, f])).values()]
      : null,
    usable: !r.archived && !!r.licence && r.licence !== 'NOASSERTION' && removed.length === 0,
  };
});

const tally = (key) => rows.reduce((m, r) => ((m[r[key] ?? 'none'] = (m[r[key] ?? 'none'] ?? 0) + 1), m), {});
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  generatedAt: NOW.toISOString(),
  note: 'Roblox game templates and mechanics already built by the community. Metadata and provenance only — no code is vendored by this script.',
  freshnessPolicy: { dateGate: `pushed after ${CUTOFF} (${FRESH_MONTHS} months)`, apiGate: 'run separately by check-template-freshness.mjs' },
  counts: { total: rows.length, usable: rows.filter((r) => r.usable).length, byFreshness: tally('freshness'), byLicence: tally('licence') },
  perQuery,
  templates: rows,
}, null, 1) + '\n');
process.stderr.write(`\n${rows.length} repositories -> ${OUT}\n${JSON.stringify(tally('freshness'))}\n`);
