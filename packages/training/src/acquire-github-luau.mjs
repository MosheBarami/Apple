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
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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

/**
 * Git's own name for a blob's contents: sha1("blob <len>\0" + bytes).
 *
 * The tree read recorded a sha per file. When a file is fetched one blob at a time rather than
 * inside a snapshot, that sha is a check worth making: it proves the bytes that arrived are the
 * bytes the pinned tree named, and a truncated or substituted response fails it. The tarball path
 * gets this integrity for free from the archive; the blob path has to ask for it.
 *
 * sha1 is git's, not a security choice here. It is being used to compare against git's own label.
 */
export function gitBlobSha1(buf) {
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
}

/**
 * Was this file written by a machine?
 *
 * The first repository this pipeline opened, `tijnepema/lucide-roblox`, contributed 8,187 rows —
 * a quarter of every Luau file in the 1,063 — and every one of them is a five-line icon stub
 * carrying the banner "This file was @generated by Tarmac. It is not intended for manual editing."
 * They are licensed, they are real files, and a corpus that counted them alongside hand-written
 * game code would report a number four times larger than the thing it is describing.
 *
 * So they are MARKED, not dropped. Dropping is a quality judgement and this file makes rights
 * judgements; what it owes the reader is a row count that can be split.
 */
export function isGeneratedLuau(text) {
  return /@generated|this file (was|is) generated|auto-?generated|generated by|do not edit/i.test(String(text).slice(0, 600));
}

/**
 * The SHAPE of a file: its source with every literal replaced by a placeholder.
 *
 * `normalisedSha256` collapses two files that are byte-identical after whitespace. It does not
 * collapse 8,187 icon stubs that differ only in the two numbers inside a `Vector2.new(...)`, so
 * content dedupe reports them as 8,187 distinct contributions when they are one template used
 * 8,187 times. Hashing the shape answers the question content hashing cannot: how many DIFFERENT
 * programs are in here.
 *
 * It is a measurement, never a filter. Two genuinely different functions can share a shape, and
 * that is acceptable for a statistic and would not be acceptable for a deletion.
 */
export function shapeSha256(text) {
  const shape = String(text)
    .replace(/\[(=*)\[[\s\S]*?\]\1\]/g, '"S"')            // long-bracket strings, before short ones
    .replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, '')             // block comments
    .replace(/(["\'])(?:\\.|(?!\1)[^\\\n])*\1/g, '"S"')       // quoted strings
    .replace(/--[^\n]*/g, '')                               // line comments
    .replace(/\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, 'N')     // numbers
    .replace(/\s+/g, ' ')
    .trim();
  return sha256(shape);
}

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
  /** Snapshot cap. Two of the 1,063 are over a gigabyte and neither is a gigabyte of Luau. */
  const MAX_REPO_KB = Number(arg('max-repo-mib', '600')) * 1024;
  /**
   * --oversized: take the over-cap repositories one blob at a time instead of skipping them.
   *
   * The cap is on REPOSITORY size, and the two repositories over it hold 1,956 Luau files between
   * them — `sploithunter/HaloAndHorns` is 1.8 GiB of which 16 MB is 1,936 Luau files. Their status
   * line has always said so honestly ("its N Luau files are NOT in the corpus"), which is why this
   * is a gap and not a defect. Buffering a 1.8 GiB tarball would take the process down; fetching
   * 1,956 blobs against a 5,000/hour ceiling would not.
   *
   * The blobs are written into the same `{owner}-{repo}-{sha}/` layout the archive produces, so
   * EVERYTHING below — the walk, the vendored exclusion, the dedupe, the row literal, the counts —
   * is the same code on the same bytes. A second row builder would be a second definition of what
   * a row is, and the two would drift.
   */
  const OVERSIZED = process.argv.includes('--oversized');
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
    const ledger = [];
    for (const l of readFileSync(REPOS, 'utf8').trim().split('\n')) {
      if (!l) continue;
      try { ledger.push(JSON.parse(l)); } catch { /* partial line */ }
    }
    // A repository that was SKIPPED is not a repository that is done, and under --oversized it is
    // precisely the one we came back for. The first --oversized run reported "0 repositories
    // processed, rows written: 0" and exited 0, because both over-cap repositories were sitting in
    // the resume set wearing a skipped row. Nothing failed; nothing happened either.
    //
    // Their skipped rows are also dropped from the ledger here rather than left behind an appended
    // acquired row. One repository, one row: two would make repos.length larger than the number of
    // repositories and every count derived from it — the card's `eligible_by_rights`, its licence
    // tally — quietly wrong.
    const superseded = OVERSIZED ? ledger.filter((r) => r.status === 'skipped_repository_too_large') : [];
    if (superseded.length) {
      writeFileSync(REPOS, ledger.filter((r) => r.status !== 'skipped_repository_too_large')
        .map((r) => JSON.stringify(r)).join('\n') + '\n');
      console.error(`--oversized: retrying ${superseded.length} repositories skipped for size `
        + `(${superseded.map((r) => r.source_id).join(', ')}); their skipped ledger rows are superseded`);
    }
    for (const r of ledger) if (!superseded.includes(r)) doneRepos.add(r.source_id);
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

  let nRepo = 0; let nRows = 0; let nDup = 0; let nVendor = 0; let nMismatch = 0; let nFail = 0; let nGen = 0;
  const shapes = new Set();

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

      // 3. Materialise the Luau. One request for the whole snapshot, then keep only Luau — a
      //    blob-by-blob fetch is one API call per file and is not how you take a thousand
      //    repositories. For the two that are over the cap it is the only way to take them at
      //    all, because buffering a 1.8 GiB tarball takes the process down, and 2,000 requests
      //    against a 5,000/hour ceiling do not. Without --oversized they are skipped with a
      //    reason rather than being silently absent from the corpus.
      const tooLarge = (repo.size_kb || 0) > MAX_REPO_KB;
      if (tooLarge && !OVERSIZED) {
        record.status = 'skipped_repository_too_large';
        record.status_reason = `${Math.round(repo.size_kb / 1024)} MiB exceeds the ${Math.round(MAX_REPO_KB / 1024)} MiB snapshot cap; its ${repo.luau_lua_file_count} Luau files are NOT in the corpus and were not measured for content. Re-run with --oversized to take them one blob at a time.`;
        record.rows_written = 0;
        appendFileSync(REPOS, JSON.stringify(record) + '\n');
        nRepo++;
        continue;
      }
      work = mkdtempSync(join(tmpdir(), 'acq-'));
      const ex = join(work, 'x');
      mkdirSync(ex);
      // The archive's own prefix. The walk below strips one path segment to get the repo-relative
      // path, so the blob path has to reproduce this or every `rel` would lose its first directory.
      const prefix = `${path.replace('/', '-')}-${sha}`;

      if (tooLarge) {
        // One tree request at the PINNED sha — not HEAD — so the blobs are the revision every row
        // is about to be quoted against.
        const tr = await gh(`https://api.github.com/repos/${path}/git/trees/${sha}?recursive=1`);
        if (tr.status !== 200) throw new Error(`oversized tree http ${tr.status}`);
        const body = await tr.json();
        if (body.truncated === true) {
          // A truncated tree is a FLOOR. Acquiring from one would silently take a subset and record
          // it as the repository, which is the exact failure `estimated_rows_basis` exists to name.
          throw new Error('oversized tree came back truncated; a subset must not be recorded as the repository');
        }
        const blobs = (body.tree || []).filter((e) => e.type === 'blob' && /\.(luau|lua)$/i.test(e.path));
        record.oversized_blob_fetch = { blobs_in_tree: blobs.length, fetched: 0, integrity_failures: 0 };
        for (const b of blobs) {
          const br = await gh(`https://api.github.com/repos/${path}/git/blobs/${b.sha}`);
          if (br.status === 403 || br.status === 429) throw new Error(`rate limited fetching blobs after ${record.oversized_blob_fetch.fetched}`);
          if (br.status !== 200) continue;
          const j = await br.json();
          const buf = Buffer.from(j.content ?? '', j.encoding === 'base64' ? 'base64' : 'utf8');
          // The tree named this sha. If the bytes that arrived are not those bytes, they are not
          // this repository's file and are dropped rather than written under its licence.
          if (gitBlobSha1(buf) !== b.sha) { record.oversized_blob_fetch.integrity_failures++; continue; }
          const dest = join(ex, prefix, b.path);
          mkdirSync(dirname(dest), { recursive: true });
          writeFileSync(dest, buf);
          record.oversized_blob_fetch.fetched++;
        }
      } else {
        const tgz = join(work, 'r.tgz');
        const tRes = await fetch(`https://codeload.github.com/${path}/tar.gz/${sha}`);
        if (tRes.status !== 200) throw new Error(`tarball http ${tRes.status}`);
        await pipeline(Readable.fromWeb(tRes.body), createWriteStream(tgz));
        // bsdtar exits non-zero when an --include pattern matches nothing, which is normal for a
        // repository that is all .luau and no .lua. The extraction is checked by walking the
        // directory below, not by this exit code — a pipeline whose verdict came from the wrong
        // process is the failure this comment exists to prevent.
        try { execFileSync('tar', ['-xzf', tgz, '-C', ex, '--include=*.luau', '--include=*.lua'], { stdio: 'ignore' }); } catch { /* checked by walk */ }
      }

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
          // `\0` is the two-character ESCAPE, not a raw NUL byte, and must stay that way. It was a
          // raw byte, which made this file BINARY to grep, to file(1) and to every source-walking
          // checker here — `grep -c` over it prints nothing and exits 1, which a naive check reads
          // as "no matches" rather than "I could not look". The escape is byte-identical at runtime
          // (verified: the built string compares equal) and keeps the file text. The NUL itself is
          // load-bearing: it is the delimiter that stops `a|b` and `a` + `|b` hashing alike.
          id: sha256(`${repo.source_id}\0${sha}\0${rel}`).slice(0, 24),
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
          // Marked, never dropped. See isGeneratedLuau and shapeSha256.
          generated: isGeneratedLuau(text),
          shape_sha256: shapeSha256(text),
          // Rights clearance is not a quality judgement, and neither is it an approval.
          training_approved: false,
          semantic_quality_pass: null,
          production_training_ready: false,
        });
      }
      if (rows.length) appendFileSync(ROWS, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

      nVendor += vendored;
      nRows += rows.length;
      nGen += rows.filter((r) => r.generated).length;
      for (const r of rows) shapes.add(r.shape_sha256);
      Object.assign(record, {
        status: 'acquired',
        acquired_via: tooLarge ? 'git_blob_api_at_pinned_revision' : 'repository_tarball_at_pinned_revision',
        luau_files_in_tree: repo.luau_lua_file_count,
        luau_files_extracted: files.filter((f) => /\.(luau|lua)$/i.test(f)).length,
        vendored_excluded: vendored,
        empty_skipped: empty,
        duplicate_of_existing_content: files.filter((f) => /\.(luau|lua)$/i.test(f)).length - vendored - empty - rows.length,
        rows_written: rows.length,
        rows_machine_generated: rows.filter((r) => r.generated).length,
        distinct_shapes: new Set(rows.map((r) => r.shape_sha256)).size,
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
  console.error(`  of which machine-generated: ${nGen}`);
  console.error(`  distinct SHAPES among them: ${shapes.size} (literals placeholdered; a statistic, not a filter)`);
  console.error(`duplicate contents dropped: ${nDup}`);
  console.error(`vendored files excluded: ${nVendor}`);
  console.error(`repositories rejected for licence-text mismatch: ${nMismatch}`);
  console.error(`repositories failed: ${nFail}`);
  console.error(`rows at ${ROWS}`);
}
/* c8 ignore stop */
