#!/usr/bin/env node
/**
 * Rights clearance for the Roblox training corpus.
 *
 * Two questions, one artifact:
 *
 *   A. The six sources v1 actually shipped from — what licence do they carry, read from the
 *      publisher's own licence text AT THE PINNED REVISION, not from a metadata tag? Until this
 *      is answered per source, `training_approved` on a release file has nothing behind it.
 *
 *   B. Everything measured but not yet acquired — how many of those rows may we lawfully use?
 *      Volume alone ("2.6M rows exist") is not an acquisition plan. Volume filtered by a stated
 *      licence policy is.
 *
 * The distinction this file exists to preserve: a LICENCE FILE retrieved at a pinned revision and
 * a `license:` TAG on a dataset card are not the same evidence. A tag is the uploader's assertion
 * about a compilation they assembled; it is not, on its own, a grant covering each underlying
 * file. Sources whose only evidence is a tag are recorded as `publisher_declaration_only` and are
 * NOT cleared. Collapsing those two tiers is how an unlicensed corpus ends up in a model.
 *
 * Writes packages/training/runs/rights-clearance.json. Network is needed for part A only; part B
 * reads local registers. `--offline` skips A and keeps the previous A verdicts.
 *
 * Run: node packages/training/src/clear-rights.mjs [--offline]
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRAINING = path.resolve(HERE, '..');
const REPO = path.resolve(TRAINING, '../..');

const OUT = path.join(TRAINING, 'runs/rights-clearance.json');
const SOURCES_JSON = path.join(TRAINING, 'data/roblox-research-v1-20260920/release/sources.json');
const REGISTER = path.join(TRAINING, 'discovery/v2/hf-datasets.jsonl');
const MEASURED = path.join(TRAINING, 'runs/hf-luau-corpus-measured.jsonl');

/**
 * What the product may lawfully train on and ship inside a paid SaaS.
 *
 * The product charges money (subscriptions + credits), so a non-commercial clause is fatal, not
 * inconvenient. Share-alike and copyleft are excluded because the obligation would reach the
 * model weights and the service built on them, and nobody has decided to accept that. Both
 * exclusions are policy choices, recorded here so they can be argued with rather than discovered.
 */
const POLICY = {
  permit: {
    mit: 'notice must be retained',
    'apache-2.0': 'notice and NOTICE file must be retained',
    'cc-by-4.0': 'attribution required',
    'odc-by': 'attribution required',
    'cc0-1.0': 'no obligation',
    'bsd-3-clause': 'notice must be retained',
    'bsd-2-clause': 'notice must be retained',
    unlicense: 'no obligation',
  },
  block: {
    'cc-by-nc-4.0': 'non-commercial only; this product charges money',
    'cc-by-nc-sa-4.0': 'non-commercial only; this product charges money',
    'cc-by-nc-nd-4.0': 'non-commercial only, and forbids derivative works',
    'cc-by-nd-4.0': 'forbids derivative works; a trained model is a derivative',
    'gpl-3.0': 'copyleft would reach the model and the service',
    'agpl-3.0': 'copyleft would reach the model and the service',
    'cc-by-sa-4.0': 'share-alike would reach derivative weights',
    odbl: 'share-alike would reach derivative databases',
    openrail: 'carries downstream use restrictions nobody has reviewed',
    'creativeml-openrail-m': 'carries downstream use restrictions nobody has reviewed',
  },
};

/** Dispositions that keep a dataset out of training for a reason that is not its licence. */
const CONTAMINATION_DISPOSITIONS = new Set([
  'evaluation_only_held_out',
  'derivative_of_benchmark_held_out',
  'eval_only_and_a_correction_to_the_card_claim',
]);

const LICENCE_FILENAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'COPYING'];

/** Read an SPDX id out of licence TEXT. Returns null rather than guessing. */
export function spdxFromText(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const head = text.slice(0, 4000);
  // Creative Commons titles its variants "Attribution-NonCommercial 4.0 International" and
  // "Attribution-ShareAlike 4.0 International". Matching only the bare "Attribution 4.0" title
  // misses both, and a missed NC licence is the one that must never be missed: this product
  // charges money. The suffix is read from the title rather than from anywhere in the document,
  // because CC-BY's own preamble mentions the other variants by name.
  const ccTitle = head.match(/Attribution(-NonCommercial)?(-ShareAlike)?(-NoDerivatives)?\s+4\.0\s+International/i);
  if (ccTitle && /Creative Commons/i.test(head)) {
    const nc = Boolean(ccTitle[1]);
    const sa = Boolean(ccTitle[2]);
    const nd = Boolean(ccTitle[3]);
    if (nc && sa) return 'cc-by-nc-sa-4.0';
    if (nc && nd) return 'cc-by-nc-nd-4.0';
    if (nc) return 'cc-by-nc-4.0';
    if (sa) return 'cc-by-sa-4.0';
    if (nd) return 'cc-by-nd-4.0';
    return 'cc-by-4.0';
  }
  if (/^\s*MIT License/i.test(head) || /Permission is hereby granted, free of charge/i.test(head)) return 'mit';
  if (/Apache License/i.test(head) && /Version 2\.0/i.test(head)) return 'apache-2.0';
  if (/GNU GENERAL PUBLIC LICENSE/i.test(head) && /Version 3/i.test(head)) return 'gpl-3.0';
  if (/BSD 3-Clause/i.test(head) || /Redistributions of source code must retain/i.test(head)) return 'bsd-3-clause';
  if (/CC0 1\.0 Universal/i.test(head)) return 'cc0-1.0';
  if (/Open Data Commons Attribution License/i.test(head)) return 'odc-by';
  return null;
}

/** Pull `license:` out of a dataset card's YAML front matter. A declaration, not a grant. */
export function licenceFromCard(markdown) {
  if (typeof markdown !== 'string') return null;
  const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find((l) => /^license:\s*\S/.test(l));
  return line ? line.replace(/^license:\s*/, '').trim().replace(/^["']|["']$/g, '').toLowerCase() : null;
}

export function policyVerdict(spdx) {
  if (!spdx) return { allowed: false, bucket: 'no_grant', obligation: null, why: 'no licence identified' };
  const key = String(spdx).toLowerCase();
  if (POLICY.permit[key]) return { allowed: true, bucket: 'permit', obligation: POLICY.permit[key], why: 'licence permits commercial derivative use' };
  if (POLICY.block[key]) return { allowed: false, bucket: 'blocked', obligation: null, why: POLICY.block[key] };
  return { allowed: false, bucket: 'no_grant', obligation: null, why: `licence "${key}" is not in the policy; unreviewed licences are not permitted` };
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'apple-roblox-rights-clearance' } });
  if (!res.ok) return null;
  return await res.text();
}

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

function candidateUrls(source) {
  const { source_url: url, revision: rev, source_id: id } = source;
  if (url && url.includes('github.com')) {
    const repo = url.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
    return {
      host: 'github',
      licence: LICENCE_FILENAMES.map((f) => ({ path: f, url: `https://raw.githubusercontent.com/${repo}/${rev}/${f}` })),
      card: null,
    };
  }
  return {
    host: 'huggingface',
    licence: LICENCE_FILENAMES.map((f) => ({ path: f, url: `https://huggingface.co/datasets/${id}/resolve/${rev}/${f}` })),
    card: { path: 'README.md', url: `https://huggingface.co/datasets/${id}/resolve/${rev}/README.md` },
  };
}

/** Clear one admitted source by retrieving whatever the publisher actually published. */
export async function clearSource(source) {
  const { host, licence, card } = candidateUrls(source);
  const base = {
    source_id: source.source_id,
    host,
    revision: source.revision,
    source_url: source.source_url,
    declared_license: source.declared_license ?? null,
  };

  for (const cand of licence) {
    const text = await fetchText(cand.url);
    if (!text) continue;
    const spdx = spdxFromText(text);
    const verdict = policyVerdict(spdx);
    const declared = source.declared_license ? String(source.declared_license).toLowerCase() : null;
    return {
      ...base,
      evidence_tier: 'licence_text',
      evidence_path: cand.path,
      evidence_url: cand.url,
      licence_text_sha256: sha256(text),
      licence_text_bytes: Buffer.byteLength(text, 'utf8'),
      license_spdx: spdx,
      declared_vs_retrieved: declared === null ? 'nothing_was_declared' : declared === spdx ? 'match' : 'mismatch',
      obligation: verdict.obligation,
      verdict: spdx === null ? 'unresolved' : verdict.allowed ? 'cleared' : 'blocked',
      verdict_reason:
        spdx === null
          ? 'a licence file was retrieved but no SPDX id could be read from its text'
          : verdict.why,
    };
  }

  if (card) {
    const text = await fetchText(card.url);
    if (text) {
      const declaredInCard = licenceFromCard(text);
      const verdict = policyVerdict(declaredInCard);
      return {
        ...base,
        evidence_tier: 'publisher_declaration',
        evidence_path: card.path,
        evidence_url: card.url,
        licence_text_sha256: sha256(text),
        licence_text_bytes: Buffer.byteLength(text, 'utf8'),
        license_spdx: declaredInCard,
        declared_vs_retrieved:
          source.declared_license == null
            ? 'nothing_was_declared'
            : String(source.declared_license).toLowerCase() === declaredInCard
              ? 'match'
              : 'mismatch',
        obligation: verdict.obligation,
        // A card tag is never a clearance. This is the whole point of the file.
        verdict: 'publisher_declaration_only',
        verdict_reason:
          'the repository ships no licence file at this revision; the only evidence is the uploader’s card tag, '
          + 'which asserts terms over a compilation and is not a grant covering each underlying file',
      };
    }
  }

  return {
    ...base,
    evidence_tier: 'none',
    evidence_path: null,
    evidence_url: null,
    licence_text_sha256: null,
    licence_text_bytes: 0,
    license_spdx: null,
    declared_vs_retrieved: 'nothing_retrieved',
    obligation: null,
    verdict: 'unresolved',
    verdict_reason: 'neither a licence file nor a card could be retrieved at the pinned revision',
  };
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** Part B: every measured Luau dataset, with a licence verdict and a reason it is or is not usable. */
export function buildAcquisitionQueue(registerRows, measuredRows) {
  const reg = new Map(registerRows.map((r) => [r.id, r]));
  const luau = measuredRows.filter((m) => m.isLuauCode);

  // Identical row counts across different uploaders are how re-uploads of one corpus present
  // themselves. Suspicion, not proof: recorded so the totals are not read as distinct rows.
  const byRows = new Map();
  for (const m of luau) {
    if (!m.rows) continue;
    if (!byRows.has(m.rows)) byRows.set(m.rows, []);
    byRows.get(m.rows).push(m.id);
  }

  const items = luau.map((m) => {
    const r = reg.get(m.id);
    const declared = r?.license_as_stated ?? null;
    const verdict = policyVerdict(declared);
    const disposition = r?.disposition ?? null;
    const contaminated = disposition ? CONTAMINATION_DISPOSITIONS.has(disposition) : false;
    const gated = r?.gated === true;
    const mirrors = (m.rows && byRows.get(m.rows)) || [];
    return {
      id: m.id,
      rows: m.rows ?? 0,
      bytes: m.bytes ?? 0,
      measured: (m.rows ?? 0) > 0,
      why_unmeasured: m.rows ? null : m.why || 'not stated by the measure script',
      in_register: Boolean(r),
      declared_license: declared,
      license_evidence_tier: 'publisher_declaration',
      disposition,
      gated,
      held_out_for_evaluation: contaminated,
      policy_bucket: verdict.bucket,
      obligation: verdict.obligation,
      acquirable: verdict.allowed && !contaminated && !gated,
      blocked_reason: verdict.allowed
        ? contaminated
          ? 'held out for evaluation; acquiring it would contaminate the eval set'
          : gated
            ? 'gated repository; access not granted'
            : null
        : verdict.why,
      suspected_mirror_of: mirrors.length > 1 ? mirrors.filter((x) => x !== m.id) : [],
    };
  });

  items.sort((a, b) => b.rows - a.rows);

  const sum = (f) => items.filter(f).reduce((a, b) => a + b.rows, 0);
  const count = (f) => items.filter(f).length;

  // Distinct rows: collapse each suspected-mirror group to its first member.
  const claimed = new Set();
  let distinctAcquirable = 0;
  for (const it of items) {
    if (!it.acquirable || !it.rows) continue;
    const key = String(it.rows);
    if (claimed.has(key)) continue;
    claimed.add(key);
    distinctAcquirable += it.rows;
  }

  return {
    items,
    totals: {
      datasets: items.length,
      datasets_measured: count((i) => i.measured),
      datasets_unmeasurable: count((i) => !i.measured),
      rows_measured: sum(() => true),
      rows_acquirable: sum((i) => i.acquirable),
      rows_acquirable_after_collapsing_suspected_mirrors: distinctAcquirable,
      rows_blocked_licence: sum((i) => !i.acquirable && i.policy_bucket === 'blocked'),
      rows_blocked_no_grant: sum((i) => !i.acquirable && i.policy_bucket === 'no_grant'),
      rows_held_out_for_evaluation: sum((i) => i.held_out_for_evaluation),
      datasets_acquirable: count((i) => i.acquirable),
    },
  };
}

async function main() {
  const offline = process.argv.includes('--offline');
  const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;

  let sources = [];
  if (fs.existsSync(SOURCES_JSON)) {
    sources = JSON.parse(fs.readFileSync(SOURCES_JSON, 'utf8')).sources;
  } else if (previous) {
    // The release tree is gitignored. In a clean clone the committed artifact is the source list.
    sources = previous.admitted_sources.map((s) => ({
      source_id: s.source_id,
      revision: s.revision,
      source_url: s.source_url,
      declared_license: s.declared_license,
    }));
  }

  let admitted;
  if (offline && previous) {
    admitted = previous.admitted_sources;
  } else {
    admitted = [];
    for (const s of sources) {
      process.stderr.write(`clearing ${s.source_id} @ ${String(s.revision).slice(0, 8)} ... `);
      const r = await clearSource(s);
      process.stderr.write(`${r.verdict} (${r.license_spdx ?? 'no spdx'}, ${r.evidence_tier})\n`);
      admitted.push(r);
    }
  }

  const register = readJsonl(REGISTER);
  const measured = readJsonl(MEASURED);
  const queue =
    register && measured
      ? buildAcquisitionQueue(register, measured)
      : { items: [], totals: null, unavailable: 'discovery register or measured corpus missing' };

  const out = {
    generated_at: new Date().toISOString(),
    generator: 'packages/training/src/clear-rights.mjs',
    method:
      'Licence evidence retrieved from the publishing host AT THE PINNED REVISION. A retrieved '
      + 'licence FILE can clear a source; a dataset-card TAG cannot, and is recorded as '
      + 'publisher_declaration_only.',
    policy: {
      product_is_commercial: true,
      permit: POLICY.permit,
      block: POLICY.block,
      unreviewed_licences: 'not permitted',
    },
    admitted_sources: admitted,
    admitted_summary: {
      total: admitted.length,
      cleared: admitted.filter((s) => s.verdict === 'cleared').length,
      publisher_declaration_only: admitted.filter((s) => s.verdict === 'publisher_declaration_only').length,
      blocked: admitted.filter((s) => s.verdict === 'blocked').length,
      unresolved: admitted.filter((s) => s.verdict === 'unresolved').length,
      mismatches: admitted.filter((s) => s.declared_vs_retrieved === 'mismatch').map((s) => s.source_id),
    },
    acquisition_queue: queue,
    limits: [
      'A cleared source means the publisher’s licence text was retrieved and read. It does not mean the publisher held the rights they granted.',
      'Per-row provenance inside a compiled corpus is not established by a repository-level licence.',
      'Suspected mirrors are grouped by identical row count, which is a heuristic and can group unrelated datasets.',
      // Was true on 2026-09-20 and is not any more. Kept as a corrected line rather than deleted,
      // because "absent here" is still true of this artifact and a reader needs to know WHY —
      // the GitHub corpus is graded in its own file, not silently missing from this one.
      'The GitHub corpus is absent from this artifact by scope, not by ignorance. The 4,269 leads were probed on 2026-09-20 (discovery/v2/github-probed.jsonl) and the 1,063 relevant, licence-verified repositories were tree-read on 2026-09-21 (discovery/v2/github-trees.jsonl). Their rights verdicts, including the sha256 of every LICENSE text that was read, live in data/*/repos.jsonl written by acquire-github-luau.mjs. This file grades the six sources v1 shipped from and the Hugging Face acquisition queue.',
      'Four of the six sources — every Hugging Face one — cap at publisher_declaration_only because none ships a licence FILE at its pinned revision. That is a measured ceiling, not pending work: the tree listing at each pinned revision was checked on 2026-09-21 and returned no LICENSE. Only the two GitHub sources reach licence_text.',
    ],
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  process.stderr.write(`\nwrote ${path.relative(REPO, OUT)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
