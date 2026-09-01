// tag.mjs — run the DOMAIN TAG and QUALITY SCORE stages over every checkout.
//
// `contentRecord()` has carried `libraries`, `engineEra`, `deprecatedPatterns` and
// `qualityScore` since it was written. Every record in data/content.json said
// `engineEra: "unknown"`, `libraries: []`, `qualityScore: null` — the fields existed
// and no stage filled them, which meant `retrievalRank` scored all 23 records at the
// 0.5 fallback midpoint and ordered them by popularity alone.
//
// Provenance for each record comes from data/sources.json via `observedIn`, so a
// licence class and a security verdict are read from what those stages DECIDED
// rather than recomputed here — recomputing would create a second opinion on a
// question that already has an audited answer.
//
//   node src/tag.mjs           write data/content.json and data/sources.json
//   node src/tag.mjs --dry     report only

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tagDomain } from './intake/domain.mjs';
import { scoreQuality } from './intake/quality.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');
const SOURCES_JSON = path.join(ROOT, 'data', 'sources.json');
const CONTENT_JSON = path.join(ROOT, 'data', 'content.json');

// Deliberately WIDER than hash.mjs's HASHABLE: identity is carried by the source
// tree, but quality evidence is not. A LICENSE with no extension and a
// `.github/workflows/ci.yml` are exactly the files that decide two components, and
// hashing rules that correctly ignore them would make this scorer blind.
const READABLE = /\.(luau?|lua|ts|tsx|js|mjs|jsx|py|md|toml|ya?ml|json|txt|rst)$/i;
const NAMED = /^(?:LICEN[CS]E|README|CHANGELOG|NOTICE)$/i;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'Packages', '_Index']);
const MAX_FILES = 2_000;
// Source is only read for files that can carry a marker. A 300KB generated JSON
// contributes a path and nothing else.
const SCANNED = /\.(luau?|lua|ts|tsx|js|mjs|jsx)$/i;
const DOCFILE = /(?:^|\/)readme(?:\.md|\.rst|\.txt)?$/i;

function walk(dir, base = dir, acc = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, base, acc);
    else if ((READABLE.test(name) || NAMED.test(name)) && st.size < 400_000) {
      acc.push({ full, rel: path.relative(base, full) });
    }
  }
  return acc;
}

function readCheckout(name) {
  const found = walk(path.join(RAW, name)).sort((a, b) => a.rel.localeCompare(b.rel));
  const files = [];
  for (const f of found.slice(0, MAX_FILES)) {
    const wantsSource = SCANNED.test(f.rel) || DOCFILE.test(f.rel);
    let source = '';
    if (wantsSource) {
      try {
        source = readFileSync(f.full, 'utf8');
      } catch {
        // Unreadable is not scannable. The file still contributes its path, which is
        // what the `tested` and `maintained` components read.
      }
    }
    files.push({ path: f.rel, source });
  }
  return { files, discovered: found.length, truncated: found.length > MAX_FILES };
}

/** github.com/Owner/Repo@sha -> Owner__Repo, matching the checkout directory names. */
function dirNameFor(observedId) {
  const m = /github\.com\/([^/]+)\/([^/@]+)/.exec(String(observedId ?? ''));
  return m ? `${m[1]}__${m[2]}` : null;
}

async function main() {
  const dry = process.argv.includes('--dry');
  const sources = JSON.parse(readFileSync(SOURCES_JSON, 'utf8'));
  const content = JSON.parse(readFileSync(CONTENT_JSON, 'utf8'));

  // observedIn carries a provenance id like `github.com/Owner/Repo@sha`; sources.json
  // is keyed by seed id like `gh-owner-repo`. Join on the URL, which both carry.
  const byUrl = new Map();
  for (const rec of Object.values(sources.records)) {
    const m = /github\.com\/([^/]+)\/([^/#?]+)/.exec(String(rec.url ?? ''));
    if (m) byUrl.set(`${m[1]}/${m[2]}`.toLowerCase().replace(/\.git$/, ''), rec);
  }

  const rows = [];
  let tagged = 0;
  let scored = 0;

  for (const record of content.records) {
    const first = record.observedIn?.[0];
    const dir = dirNameFor(first);
    if (!dir || !existsSync(path.join(RAW, dir))) {
      rows.push({ dir: dir ?? String(first), status: 'no checkout on disk' });
      continue;
    }

    const { files, discovered, truncated } = readCheckout(dir);
    const domain = tagDomain(files);

    const m = /github\.com\/([^/]+)\/([^/@]+)/.exec(String(first));
    const prov = m ? byUrl.get(`${m[1]}/${m[2]}`.toLowerCase()) : null;
    const quality = scoreQuality({
      files,
      licenceClass: prov?.licence?.class ?? null,
      securitySafe: typeof prov?.security?.safe === 'boolean' ? prov.security.safe : null,
      engineEra: domain.engineEra,
    });

    record.libraries = domain.libraries;
    record.engineEra = domain.engineEra;
    record.deprecatedPatterns = domain.deprecatedPatterns;
    record.qualityScore = quality.score;
    // Kept beside the score, because a number with no breakdown is the thing
    // quality.mjs's header refuses to ship.
    record.qualityComponents = Object.fromEntries(
      Object.entries(quality.components).map(([k, v]) => [k, v.value]),
    );

    if (domain.engineEra !== 'unknown') tagged += 1;
    if (quality.score !== null) scored += 1;

    rows.push({
      dir,
      files: files.length,
      discovered,
      truncated,
      era: domain.engineEra,
      share: domain.evidence.legacyShare,
      libraries: domain.libraries,
      deprecated: domain.deprecatedPatterns.reduce((n, p) => n + p.count, 0),
      score: quality.score,
      undecided: quality.undecided,
    });
  }

  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || String(a.dir).localeCompare(String(b.dir)));
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`[tag] ${pad('checkout', 40)} ${pad('era', 14)} ${pad('score', 7)} deprecated  libraries`);
  for (const r of rows) {
    if (r.status) {
      console.log(`[tag] ${pad(r.dir, 40)} ${r.status}`);
      continue;
    }
    console.log(
      `[tag] ${pad(r.dir, 40)} ${pad(r.era, 14)} ${pad(r.score ?? '-', 7)} ${pad(r.deprecated, 11)} ${r.libraries.join(',') || '-'}`,
    );
  }

  const eras = {};
  for (const r of rows) if (r.era) eras[r.era] = (eras[r.era] ?? 0) + 1;
  console.log(`\n[tag] eras: ${JSON.stringify(eras)}`);
  console.log(`[tag] ${tagged} of ${content.records.length} records now carry an era; ${scored} carry a quality score`);

  if (dry) {
    console.log('[tag] --dry: nothing written');
    return;
  }
  content.generatedAt = new Date().toISOString().slice(0, 10);
  await writeFile(CONTENT_JSON, `${JSON.stringify(content, null, 2)}\n`);
  console.log(`[tag] wrote ${path.relative(ROOT, CONTENT_JSON)}`);
}

main().catch((e) => {
  console.error(`[tag] ${e instanceof Error ? e.stack : String(e)}`);
  process.exit(1);
});
