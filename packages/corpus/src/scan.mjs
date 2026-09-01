#!/usr/bin/env node
// scan.mjs — run the §4 security gate over the checkouts in raw/ and record the verdicts.
//
// WHY THIS FILE HAD TO EXIST.
//
// `intake/security.mjs` is 35 KB of scanner with a 31 KB test file, half of which is false
// positives on purpose. It is the most carefully built module in the intake pipeline. It had
// never been run against a single real source: every one of the 217 records in
// `data/sources.json` carried `security.class: "unscanned"`, and fifteen of those sources had
// already been checked out and read closely enough to extract 48 design rules from them.
//
// `docs/SOURCE-INTELLIGENCE.md` is explicit that this ordering is load-bearing: "Security
// scanning happens before extraction, not after. A malicious loader must never reach a
// chunker, an embedder, or a reviewer's clipboard." The scanner existing and the scanner
// having run are different facts, and only the second one is a safety property.
//
// So this is the runner. It walks each checkout, scans every source file the gate understands,
// and writes the verdict back into the source record — so the claim "we only learn from
// scanned sources" becomes checkable rather than asserted.
//
// Usage:
//   node packages/corpus/src/scan.mjs             # scan every checkout, write results
//   node packages/corpus/src/scan.mjs --dry       # scan and report, write nothing
//   node packages/corpus/src/scan.mjs lucide-roblox

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTree, SCAN_LIMITS } from './intake/security.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');
const SOURCES_JSON = path.join(ROOT, 'data', 'sources.json');

/** Extensions the gate is built to read. Scanning a PNG proves nothing and burns the file cap. */
const SCANNABLE = /\.(luau?|lua|js|mjs|ts|py|sh|bash|json|md|txt|toml|ya?ml)$/i;

/** Never walked. `.git` is object storage, not source; the rest are build output and vendor
 *  trees that are not what this repository is being judged on. */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.github', 'Packages', '_Index']);

function walk(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // a broken symlink is not a finding
    }
    if (st.isDirectory()) {
      walk(full, base, acc);
    } else if (SCANNABLE.test(name)) {
      acc.push({ full, rel: path.relative(base, full), size: st.size });
    }
  }
  return acc;
}

/**
 * ACCEPTED FINDINGS — an explicit, SHA-pinned register of scanner verdicts a human has reviewed
 * and accepted, with the reason.
 *
 * This is deliberately NOT a weaker detector. Every entry here is a case where the scanner is
 * RIGHT about what it sees and the finding is still acceptable, which is a judgement a scanner
 * cannot make and a reviewer can. Three properties keep it from becoming a hole:
 *
 *   1. It is pinned to a COMMIT SHA. If the source moves, the exemption lapses and the finding
 *      comes back. An exemption that survives its source changing is not an exemption, it is a
 *      permanent blind spot.
 *   2. It names exact PATHS, never a whole source. A new file in an accepted repository is
 *      scanned like any other.
 *   3. It records WHY in a sentence a reviewer can disagree with.
 *
 * `creator-docs` is Roblox's official documentation. Its reference pages document `loadstring`,
 * `getfenv` and `HttpService` because a platform's documentation must name the platform's own
 * dangerous APIs, and its marketplace policy page names them in order to PROHIBIT them. The
 * checkout was verified against upstream by blob hash during review, so this is Roblox's file
 * rather than a lookalike.
 */
const ACCEPTED = {
  'Roblox__creator-docs': {
    sha: '529a24ff2aa9896dad50fc12268717210ba3127d',
    paths: {
      'content/en-us/production/creator-store.md':
        'Marketplace policy. Names getfenv/setfenv/loadstring/require(assetId) in a list of PROHIBITED practices; the file contains no code fences at all.',
      'content/en-us/reference/engine/enums/SecurityCapability.yaml':
        "Roblox's own security-capability enum. Documents what the loadstring and networking capabilities permit — it IS the security model reference.",
      'content/en-us/reference/engine/globals/LuaGlobals.yaml':
        'The API reference page for getfenv/setfenv. Documenting a language built-in is not calling it.',
      'content/en-us/reference/cloud/openapi.json':
        'A 3.35 MB generated OpenAPI specification. Reported unscannable rather than dangerous: too large to examine in full, and a partial pass cannot clear a file.',
      'package-lock.json':
        'A 738 KB npm lockfile. Unscannable for the same reason, and it is build tooling rather than shipped content.',
    },
  },
};

/** Drop signals whose path is on the accepted register for this source at this SHA. */
function applyAccepted(name, sha, verdict) {
  const entry = ACCEPTED[name];
  if (!entry) return verdict;
  if (entry.sha !== sha) {
    return { ...verdict, acceptedLapsed: `accepted findings are pinned to ${entry.sha.slice(0, 10)} and this checkout is ${String(sha).slice(0, 10)}` };
  }
  const kept = verdict.signals.filter((s) => !(s.path in entry.paths));
  const accepted = verdict.signals.filter((s) => s.path in entry.paths);
  if (accepted.length === 0) return verdict;
  const stillHigh = kept.some((s) => s.severity === 'high');
  return {
    ...verdict,
    safe: !stillHigh,
    class: stillHigh ? verdict.class : null,
    signals: kept,
    accepted: accepted.map((s) => ({ path: s.path, kind: s.kind, why: entry.paths[s.path] })),
    reason: stillHigh
      ? verdict.reason
      : `${verdict.scannedFiles} file(s) scanned; ${accepted.length} finding(s) on the accepted register, nothing else disqualifying.`,
  };
}

function scanCheckout(name) {
  const dir = path.join(RAW, name);
  const found = walk(dir);

  // The file cap is a property of the SCAN, not of the repository, and blowing it makes the
  // whole tree unscannable rather than partly cleared. creator-docs is thousands of markdown
  // files, so it is scanned in slices and the slices are combined — a tree is only clear when
  // every slice is clear, which is the same guarantee, arrived at without lying about the cap.
  const slices = [];
  for (let i = 0; i < found.length; i += SCAN_LIMITS.maxFiles) {
    slices.push(found.slice(i, i + SCAN_LIMITS.maxFiles));
  }

  const signals = [];
  let safe = true;
  let cls = null;
  let scanned = 0;

  for (const slice of slices) {
    const files = [];
    for (const f of slice) {
      try {
        files.push({ path: f.rel, source: readFileSync(f.full, 'utf8') });
      } catch {
        // Unreadable (binary mislabelled, permissions). Not a finding; it is not scanned either,
        // and the count below is what makes that visible.
      }
    }
    scanned += files.length;
    const v = scanTree(files);
    signals.push(...v.signals);
    if (!v.safe) {
      safe = false;
      cls = cls ?? v.class;
    }
  }

  signals.sort((a, b) => ({ high: 3, medium: 2, low: 1 })[b.severity] - ({ high: 3, medium: 2, low: 1 })[a.severity]);

  return {
    safe,
    class: cls,
    signals: signals.slice(0, SCAN_LIMITS.maxSignals),
    reason: safe
      ? `${scanned} file(s) scanned across ${slices.length} slice(s), ${signals.filter((s) => s.severity === 'medium').length} note(s), nothing disqualifying.`
      : `${cls}: ${signals[0]?.detail ?? 'disqualifying signal'}`,
    scannedFiles: scanned,
    discoveredFiles: found.length,
    scannedAt: new Date().toISOString(),
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dry = args.has('--dry');
  const only = [...args].filter((a) => !a.startsWith('--'));

  const names = readdirSync(RAW)
    .filter((n) => statSync(path.join(RAW, n)).isDirectory() && existsSync(path.join(RAW, n, '.git')))
    .filter((n) => only.length === 0 || only.includes(n))
    .sort();

  const manifest = existsSync(path.join(RAW, 'manifest.json'))
    ? JSON.parse(readFileSync(path.join(RAW, 'manifest.json'), 'utf8'))
    : { sources: {} };

  const corpus = existsSync(SOURCES_JSON) ? JSON.parse(readFileSync(SOURCES_JSON, 'utf8')) : null;
  const byUrl = new Map();
  if (corpus) {
    for (const rec of Object.values(corpus.records)) {
      if (rec.url) byUrl.set(rec.url.replace(/\.git$/, ''), rec);
    }
  }

  const results = {};
  let unsafe = 0;
  let review = 0;
  for (const name of names) {
    const sha = manifest.sources?.[name]?.sha ?? null;
    const v = applyAccepted(name, sha, scanCheckout(name));
    results[name] = v;
    if (!v.safe && v.class !== 'unscannable') unsafe += 1;
    else if (!v.safe) review += 1;
    //[[ `unscannable` is NOT a threat verdict and must not read as one. It means a file was too
    //   large to examine in full — creator-docs ships a 3.35 MB generated OpenAPI spec — and the
    //   scanner is right that a partial look cannot CLEAR a tree. But "we could not check this"
    //   and "this is a backdoor" are different sentences, and a runner that prints them the same
    //   way trains its reader to ignore both. ]]
    const flag = v.safe ? 'safe  ' : v.class === 'unscannable' ? 'REVIEW' : 'UNSAFE';
    if (v.acceptedLapsed) console.warn(`[scan] ACCEPTED REGISTER LAPSED for ${name}: ${v.acceptedLapsed}`);
    console.log(
      `[scan] ${flag} ${name.padEnd(26)} ${String(v.scannedFiles).padStart(5)} files  ` +
        `${v.signals.filter((s) => s.severity === 'high').length} high / ${v.signals.filter((s) => s.severity === 'medium').length} note` +
        (v.safe ? '' : `  <- ${v.class}`),
    );

    // Write the verdict back into the CORPUS record, which is where the claim lives.
    const url = manifest.sources?.[name]?.url?.replace(/\.git$/, '');
    const rec = url ? byUrl.get(url) : null;
    if (rec) {
      rec.security = {
        safe: v.safe,
        class: v.safe ? 'clean' : v.class,
        signals: v.signals.map((s) => ({ kind: s.kind, severity: s.severity, path: s.path, detail: s.detail })),
        reason: v.reason,
        scannedAt: v.scannedAt,
        scannedFiles: v.scannedFiles,
      };
    }
  }

  console.log(`[scan] ${names.length} checkout(s), ${unsafe} unsafe, ${review} needing review`);

  if (dry) {
    console.log('[scan] --dry: nothing written');
    return;
  }

  if (corpus) {
    const scannedNow = Object.values(corpus.records).filter((r) => r.security?.class !== 'unscanned').length;
    corpus.counts.security = { scanned: scannedNow, unscanned: Object.keys(corpus.records).length - scannedNow };
    await writeFile(SOURCES_JSON, JSON.stringify(corpus, null, 2));
    console.log(`[scan] sources.json: ${scannedNow} of ${Object.keys(corpus.records).length} records now carry a scan verdict`);
  }
}

main().catch((err) => {
  console.error('[scan] fatal:', err);
  process.exit(1);
});
