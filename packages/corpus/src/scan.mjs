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
  for (const name of names) {
    const v = scanCheckout(name);
    results[name] = v;
    if (!v.safe) unsafe += 1;
    const flag = v.safe ? 'safe  ' : `UNSAFE`;
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

  console.log(`[scan] ${names.length} checkout(s), ${unsafe} unsafe`);

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
