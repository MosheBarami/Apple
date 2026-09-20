#!/usr/bin/env node
/**
 * Convert licence-verified GitHub repositories into rows, at a rights tier the Hugging Face queue
 * cannot reach.
 *
 * WHY THIS ROUTE AND NOT MORE HUGGING FACE. `runs/rights-clearance.json` grades every one of the
 * six sources v1 shipped from. Four of them — every Hugging Face source — sit at
 * `publisher_declaration_only`: the repository ships no licence file, so the only evidence is a
 * card tag, and a tag is an uploader's assertion about a compilation they assembled out of other
 * people's files. `screen-row-licences.mjs` then measured what that assertion was covering on the
 * largest queued corpus: 808,084 `no_license` rows against 37,267 permissive. The tag was over a
 * corpus 95.6% unlicensed. Net-new licence-clean yield from Hugging Face measured zero rows.
 *
 * Going to the upstream repository instead answers the question the compilation cannot. The
 * repository's own LICENSE text is retrievable at a pinned commit, and it grants the files beneath
 * it directly. That is `licence_text` — the tier `clear-rights.mjs` reserves for retrieved text,
 * and the tier no Hugging Face dataset in the queue reaches.
 *
 *   GH_TOKEN=... node packages/training/src/acquire-github-luau.mjs [--limit=N] [--out=DIR]
 *
 * WHAT IT REFUSES TO DO.
 *
 *   It does not trust GitHub's SPDX tag. The licence TEXT is fetched and matched against the tag.
 *   A repository whose text does not corroborate its tag is recorded `licence_text_mismatch` and
 *   contributes no rows. The tag is a detection, and a detection that disagrees with the document
 *   it detected is a finding, not a rounding error.
 *
 *   It does not take vendored code. A wally `Packages/` or a `node_modules/` inside an MIT
 *   repository is other people's source, and this repository's LICENSE grants none of it. Those
 *   paths are excluded and the excluded count is reported per repository, because a corpus that
 *   swallowed its dependencies would look larger and be less defensible.
 *
 *   It does not flip anything. Every row is written `training_approved: false` and
 *   `semantic_quality_pass: null`. Rights clearance says a file MAY be used. Whether it SHOULD is
 *   a quality judgement nothing here has made.
 *
 * THE TOKEN IS READ FROM THE ENVIRONMENT AND NEVER WRITTEN ANYWHERE.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TREES = resolve(HERE, '..', 'discovery', 'v2', 'github-trees.jsonl');

/**
 * Path segments whose contents belong to somebody else.
 *
 * `Packages`, `DevPackages` and `ServerPackages` are the wally install convention and `_Index` is
 * its content-addressed store; `node_modules` is npm's. A file under any of them was written by a
 * third party and vendored, so the enclosing repository's LICENSE says nothing about it. Matching
 * on a whole path SEGMENT, not a substring, so `src/PackagesTest/thing.luau` is kept.
 */
const VENDOR_SEGMENTS = new Set(['node_modules', 'packages', 'devpackages', 'serverpackages', '_index', 'vendor', 'third_party', 'thirdparty']);

export function isVendoredPath(path) {
  return path.split('/').some((seg) => VENDOR_SEGMENTS.has(seg.toLowerCase()));
}

/**
 * Does the retrieved licence TEXT corroborate the SPDX id GitHub detected?
 *
 * Deliberately coarse: it looks for the phrase each licence family cannot be written without. The
 * job is not to re-derive SPDX from prose — it is to catch a repository whose LICENSE is a custom
 * "all rights reserved" notice that GitHub's detector called MIT. Returns `true` only on a
 * positive match, so an unrecognised text fails closed.
 */
export function licenceTextCorroborates(spdx, text) {
  const t = String(text).toLowerCase().replace(/\s+/g, ' ');
  const id = String(spdx).toLowerCase();
  if (id === 'mit' || id === 'mit-0') return t.includes('permission is hereby granted, free of charge');
  if (id === 'apache-2.0') return t.includes('apache license') && t.includes('version 2.0');
  if (id === 'bsd-3-clause') return t.includes('redistribution and use in source and binary forms') && t.includes('name of the copyright holder');
  if (id === 'bsd-2-clause') return t.includes('redistribution and use in source and binary forms');
  if (id === 'isc') return t.includes('permission to use, copy, modify, and/or distribute this software');
  if (id === 'unlicense') return t.includes('this is free and unencumbered software released into the public domain');
  if (id === 'cc0-1.0') return t.includes('creative commons') && t.includes('cc0');
  if (id === '0bsd') return t.includes('permission to use, copy, modify, and/or distribute this software');
  if (id === 'zlib') return t.includes('this software is provided \'as-is\'') || t.includes('this software is provided "as-is"');
  return false;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Normalised for dedupe: line endings and trailing whitespace are not content. */
export function normalisedSha256(text) {
  return sha256(String(text).replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim());
}

/* c8 ignore start -- network and filesystem driver; the pure folds above are what the guard exercises */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const TOKEN = process.env.GH_TOKEN;
  if (!TOKEN) { console.error('GH_TOKEN is not set. Refusing.'); process.exit(2); }
  if (!existsSync(TREES)) { console.error(`${TREES} does not exist — run read-github-trees.mjs first.`); process.exit(2); }

  const arg = (name, dflt) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : dflt; };
  const limitRaw = Number(arg('limit', ''));
  const LIMIT = Number.isSafeInteger(limitRaw) && limitRaw > 0 ? limitRaw : Infinity;
  const OUT_DIR = resolve(arg('out', resolve(HERE, '..', 'data', 'roblox-github-v1')));
  const ROWS = join(OUT_DIR, 'rows.jsonl');
  const REPOS = join(OUT_DIR, 'repos.jsonl');
  mkdirSync(OUT_DIR, { recursive: true });

  const trees = readFileSync(TREES, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

  /** Admission by rights alone. Every clause is a separate, recorded reason. */
  const eligible = trees.filter((r) => r.tree_status === 'ok'
    && r.license_class === 'permissive_osi'
    && r.license_file_name          // a licence FILE exists at the root; without one there is no text to read
    && r.archived === false
    && r.fork === false             // a fork's licence is upstream's; take it from upstream
    && (r.luau_lua_file_count || 0) > 0)
    .sort((a, b) => (b.luau_lua_file_count || 0) - (a.luau_lua_file_count || 0));

  if (eligible.length === 0) { console.error('the eligible partition is empty — this run would acquire nothing. Refusing.'); process.exit(3); }
  console.error(`${eligible.length} repositories eligible by rights; ${Math.min(eligible.length, LIMIT)} in this run`);

  const doneRepos = new Set();
  if (existsSync(REPOS)) {
    for (const l of readFileSync(REPOS, 'utf8').trim().split('\n')) {
      if (!l) continue;
      try { doneRepos.add(JSON.parse(l).source_id); } catch { /* partial line */ }
    }
    console.error(`resuming: ${doneRepos.size} repositories already acquired`);
  }
  // Content-addressed dedupe across every repository, rebuilt from what is already on disk.
  const seen = new Set();
  if (existsSync(ROWS)) {
    for (const l of readFileSync(ROWS, 'utf8').split('\n')) {
      if (!l.trim()) continue;
      try { seen.add(JSON.parse(l).normalized_sha256); } catch { /* partial line */ }
    }
    console.error(`resuming: ${seen.size} distinct file contents already held`);
  }

  const gh = (url) => fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'apple-corpus-acquire' } });
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));

  let nRepo = 0; let nRows = 0; let nDup = 0; let nVendor = 0; let nMismatch = 0; let nFail = 0;

  for (const repo of eligible.slice(0, LIMIT === Infinity ? undefined : LIMIT)) {
    if (doneRepos.has(repo.source_id)) continue;
    const path = String(repo.source_url).replace(/^https:\/\/github\.com\//, '');
    const record = { source_id: repo.source_id, source_url: repo.source_url, api_license_guess: repo.api_license_guess };
    let work = null;
    try {
      // 1. Pin the revision. Everything below is quoted against this exact commit.
      const cRes = await gh(`https://api.github.com/repos/${path}/commits/HEAD`);
      if (cRes.status === 403 || cRes.status === 429) {
        console.error(`rate limited after ${nRepo} repositories; re-run to resume.`);
        break;
      }
      if (cRes.status !== 200) { throw new Error(`commits/HEAD http ${cRes.status}`); }
      const commit = await cRes.json();
      const sha = commit.sha;

      // 2. Read the licence TEXT at that revision. This is the tier lift, and it can fail.
      const lRes = await fetch(`https://raw.githubusercontent.com/${path}/${sha}/${repo.license_file_name}`);
      if (lRes.status !== 200) throw new Error(`licence text http ${lRes.status}`);
      const licenceText = await lRes.text();
      const corroborated = licenceTextCorroborates(repo.api_license_guess, licenceText);
      Object.assign(record, {
        revision: sha,
        licence_file_path: repo.license_file_name,
        licence_text_sha256: sha256(licenceText),
        licence_text_bytes: Buffer.byteLength(licenceText),
        licence_text_url: `https://raw.githubusercontent.com/${path}/${sha}/${repo.license_file_name}`,
        licence_text_corroborates_tag: corroborated,
        evidence_tier: corroborated ? 'licence_text' : 'licence_text_mismatch',
      });
      if (!corroborated) {
        nMismatch++;
        record.status = 'rejected_licence_text_mismatch';
        record.status_reason = `GitHub detected ${repo.api_license_guess} but the retrieved LICENSE text does not carry that licence's operative grant`;
        record.rows_written = 0;
        appendFileSync(REPOS, JSON.stringify(record) + '\n');
        nRepo++;
        continue;
      }

      // 3. One request for the whole snapshot, then keep only Luau. A blob-by-blob fetch would be
      //    one API call per file and would not finish.
      work = mkdtempSync(join(tmpdir(), 'acq-'));
      const tgz = join(work, 'r.tgz');
      const tRes = await fetch(`https://codeload.github.com/${path}/tar.gz/${sha}`);
      if (tRes.status !== 200) throw new Error(`tarball http ${tRes.status}`);
      writeFileSync(tgz, Buffer.from(await tRes.arrayBuffer()));
      const ex = join(work, 'x');
      mkdirSync(ex);
      // bsdtar exits non-zero when an --include pattern matches nothing, which is normal for a
      // repository that is all .luau and no .lua. The extraction is checked by walking the
      // directory below, not by this exit code — a pipeline whose verdict came from the wrong
      // process is the failure this comment exists to prevent.
      try { execFileSync('tar', ['-xzf', tgz, '-C', ex, '--include=*.luau', '--include=*.lua'], { stdio: 'ignore' }); } catch { /* checked by walk */ }

      const files = existsSync(ex) ? walk(ex) : [];
      const rows = [];
      let vendored = 0; let empty = 0;
      for (const abs of files) {
        // Strip the archive's `{owner}-{repo}-{sha}/` prefix to get the repository-relative path.
        const rel = relative(ex, abs).split('/').slice(1).join('/');
        if (!/\.(luau|lua)$/i.test(rel)) continue;
        if (isVendoredPath(rel)) { vendored++; continue; }
        const bytes = statSync(abs).size;
        if (bytes === 0) { empty++; continue; }
        const raw = readFileSync(abs);
        const text = raw.toString('utf8');
        const norm = normalisedSha256(text);
        if (!norm || seen.has(norm)) { nDup++; continue; }
        seen.add(norm);
        rows.push({
          id: sha256(`${repo.source_id} ${sha} ${rel}`).slice(0, 24),
          kind: 'source_code',
          lane: 'upstream_repository_licence_text_verified',
          text,
          provenance: {
            source_id: repo.source_id,
            source_url: repo.source_url,
            revision: sha,
            source_path: rel,
            retrieved_at: new Date().toISOString(),
            host: 'github',
            // Direct from the repository that holds the licence — no compilation in between.
            via_compilation: null,
          },
          rights: {
            status: 'upstream_licence_text_verified',
            spdx: repo.api_license_guess,
            licence_file_path: repo.license_file_name,
            licence_text_sha256: record.licence_text_sha256,
            licence_text_url: record.licence_text_url,
            obligation: /^(mit|mit-0|bsd-2-clause|bsd-3-clause|isc|zlib)$/i.test(repo.api_license_guess)
              ? 'notice must be retained'
              : /^apache-2\.0$/i.test(repo.api_license_guess) ? 'notice and NOTICE file must be retained' : 'no obligation',
            vendored_paths_excluded: true,
          },
          group: repo.source_id,
          bytes,
          content_sha256: sha256(raw),
          normalized_sha256: norm,
          // Rights clearance is not a quality judgement, and neither is it an approval.
          training_approved: false,
          semantic_quality_pass: null,
          production_training_ready: false,
        });
      }
      if (rows.length) appendFileSync(ROWS, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

      nVendor += vendored;
      nRows += rows.length;
      Object.assign(record, {
        status: 'acquired',
        luau_files_in_tree: repo.luau_lua_file_count,
        luau_files_extracted: files.filter((f) => /\.(luau|lua)$/i.test(f)).length,
        vendored_excluded: vendored,
        empty_skipped: empty,
        duplicate_of_existing_content: files.filter((f) => /\.(luau|lua)$/i.test(f)).length - vendored - empty - rows.length,
        rows_written: rows.length,
        tree_truncated: repo.tree_truncated,
      });
      appendFileSync(REPOS, JSON.stringify(record) + '\n');
    } catch (e) {
      nFail++;
      appendFileSync(REPOS, JSON.stringify({ ...record, status: 'failed', status_reason: e.message, rows_written: 0 }) + '\n');
    } finally {
      if (work) rmSync(work, { recursive: true, force: true });
    }

    if (++nRepo % 25 === 0) console.error(`${nRepo} repositories — ${nRows} rows, ${nDup} duplicates dropped, ${nVendor} vendored excluded, ${nMismatch} licence mismatches, ${nFail} failures`);
  }

  console.error(`\n${nRepo} repositories processed this run`);
  console.error(`rows written: ${nRows}`);
  console.error(`duplicate contents dropped: ${nDup}`);
  console.error(`vendored files excluded: ${nVendor}`);
  console.error(`repositories rejected for licence-text mismatch: ${nMismatch}`);
  console.error(`repositories failed: ${nFail}`);
  console.error(`rows at ${ROWS}`);
}
/* c8 ignore stop */
