#!/usr/bin/env node
/**
 * THE UI LIBRARY, AS ASSETS IN HAND RATHER THAN GENRES DESCRIBED.
 *
 * The standing ask: extract every kind of Roblox UI that exists into the model's internal library,
 * so that it almost never builds an interface from scratch — from thousands extracted there is
 * always something to find. That has been answered twice with the wrong number. First with a count
 * of GENRES covered, which is a count of the map. Then with a count of rows that construct a GUI
 * class (1,060), which is a measurement, not a library: nothing could be looked up in it.
 *
 *   node packages/training/src/build-ui-asset-library.mjs [--dir=...]
 *
 * This writes the index a lookup can use: `packages/corpus/data/ui-assets-github-v1.json`.
 *
 * WHAT AN ASSET IS KEYED BY, AND WHY IT IS NOT THE GENRE.
 *
 *   Genre classification of source code is guesswork, and it fails quietly. Keying on the file's
 *   path lands 65 of 1,060. Adding the names the code gives its own instances (`.Name = "ShopFrame"`)
 *   lands 109. That is the honest ceiling of self-description in this corpus: about a tenth of
 *   Roblox UI code says which screen it is, and the other nine tenths are `init.luau` inside a
 *   component folder. A library keyed only on genre would therefore be a library of 109 assets
 *   with 951 unreachable, and would print "16 genres covered" while being unable to answer a
 *   question.
 *
 *   So the PRIMARY key is the composition signature — the sorted set of GUI classes the file
 *   actually constructs, which `measure-ui-yield.mjs` already derives from Roblox's own engine
 *   reference. Every asset has one. "A scrolling list of cards" resolves to
 *   `Frame+ScrollingFrame+TextLabel+UIListLayout` without anybody having guessed a genre. The
 *   screen kind is a SECONDARY key, present on the assets that name themselves and absent —
 *   explicitly `null`, never "unknown-so-call-it-hud" — on the rest.
 *
 * WHY THE SOURCE IS NOT COPIED IN. 1,060 files is 25.9 MiB of other people's Luau. Every asset
 * carries its pinned revision and a permalink at that revision, which is how `repos.jsonl` already
 * treats the gitignored `rows.jsonl`: the index is the library, the bytes are re-fetchable, and
 * nothing here redistributes a stranger's repository into this one. Each asset also carries the
 * SPDX id, the licence file's path and its sha256, so a notice obligation can be discharged by
 * whoever eventually serves the file.
 *
 * WHY SYNTAX IS JOINED IN. `check-luau-syntax.mjs` records whether each row parses. A file that
 * does not parse is not an asset, whatever it constructs, and the count of assets must not include
 * it. When that report is absent the field is `null` and the totals say so — a missing measurement
 * is reported as missing, not as a pass.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveGuiClasses, classifyUi, stripLuauComments } from './measure-ui-yield.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const CLASSES = join(REPO, 'packages/corpus/raw/Roblox__creator-docs/content/en-us/reference/engine/classes');
const SCREEN_DIR = join(REPO, 'packages/corpus/data/ui-references');

/**
 * Split an identifier or path fragment into lowercase word tokens.
 *
 * `ShopFrame` -> shop, frame. `escape_menu` -> escape, menu. `UIListLayout` -> ui, list, layout.
 * Word tokens, not substrings: `heatmap` must not answer a query for `map`, and a substring match
 * would say it does.
 */
export function wordTokens(text) {
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+|\s+/)
    .map((s) => s.toLowerCase())
    .filter(Boolean);
}

/**
 * The screen vocabulary, read from the reference library's own filenames.
 *
 * Derived, never typed: the terms are each screen's id suffix plus its mechanical singular or
 * plural. Deriving richer vocabulary from the prose `label` fields was tried and abandoned — it
 * produced the terms `and`, `run` and `progres`, and leaked `hud` into three different screens,
 * which is a classifier that returns a confident wrong answer.
 */
export function deriveScreenVocabulary(dir) {
  const screens = [];
  for (const f of readdirSync(dir).sort()) {
    const m = /^(screen-(.+))\.json$/.exec(f);
    if (!m) continue;
    const suffix = m[2];
    const alt = suffix.endsWith('s') ? suffix.slice(0, -1) : `${suffix}s`;
    screens.push({ id: m[1], terms: [...new Set([suffix, alt])] });
  }
  return screens;
}

/**
 * The names a file gives the interface it builds.
 *
 * Two channels, both from code with comments already stripped: string literals assigned to `.Name`,
 * and the local variable names that receive `Instance.new("<a GUI class>")`. A variable called
 * `shopFrame` holding a Frame is the file telling you what it is; a comment saying "the shop" is
 * prose, and prose is what made four earlier scanners in this repository wrong.
 */
export function instanceNames(source, guiClasses) {
  const code = stripLuauComments(source);
  const names = [...code.matchAll(/\.Name\s*=\s*(["'])([^"']{1,64})\1/g)].map((m) => m[2]);
  const vars = [...code.matchAll(/local\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*Instance\s*\.\s*new\s*\(\s*(["'])([A-Za-z0-9_]+)\2/g)]
    .filter((m) => guiClasses.has(m[3]))
    .map((m) => m[1]);
  return [...new Set([...names, ...vars])];
}

/**
 * Which screen kind, if any, does this asset say it is?
 *
 * Returns `{ screen, evidence }` with `screen: null` when nothing in the file names one. Null is
 * the answer, not a gap to be filled: an asset filed under a screen it never claimed is worse than
 * an asset filed under none, because a lookup would return it and the caller would believe it.
 * Ties are resolved to null for the same reason — two claims are not one answer.
 */
export function classifyScreen(sourcePath, names, screens) {
  const pathTokens = new Set(wordTokens(String(sourcePath).replace(/\.[^./]+$/, '')));
  const nameTokens = new Set(names.flatMap(wordTokens));
  const hits = [];
  for (const s of screens) {
    const viaPath = s.terms.some((t) => pathTokens.has(t));
    const viaName = s.terms.some((t) => nameTokens.has(t));
    if (viaPath || viaName) hits.push({ id: s.id, evidence: viaPath ? 'source_path' : 'instance_name' });
  }
  if (hits.length !== 1) return { screen: null, evidence: hits.length === 0 ? 'none' : 'ambiguous' };
  return { screen: hits[0].id, evidence: hits[0].evidence };
}

/** The sorted set of GUI classes a file constructs, joined — the primary library key. */
export function compositionKey(classesConstructed) {
  return [...classesConstructed].sort().join('+');
}

/**
 * May this syntax report be used to answer for this corpus?
 *
 * Found while writing this file, not after shipping it: the join is by row id, and a syntax report
 * produced against a three-row FIXTURE has no row ids in common with the real corpus — so every
 * real asset would come back "not in the failure list", which reads as `syntaxOk: true`. A report
 * that never looked at these rows would have certified all 1,060 of them. The report therefore has
 * to say it is about this corpus and to have covered this many rows, or it is not used at all and
 * `syntaxOk` stays null.
 */
export function syntaxReportApplies(report, corpusRelPath, rowsInCorpus) {
  if (!report || typeof report !== 'object') return false;
  if (report.corpus !== corpusRelPath) return false;
  return report.rows_checked === rowsInCorpus;
}

/* c8 ignore start -- filesystem driver */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const a = process.argv.find((x) => x.startsWith('--dir='));
  const DIR = resolve(a ? a.split('=')[1] : join(HERE, '..', 'data', 'roblox-github-v1'));
  const ROWS = join(DIR, 'rows.jsonl');
  for (const [p, why] of [[ROWS, 'run acquire-github-luau.mjs first'], [CLASSES, 'the engine reference is not in this checkout'], [SCREEN_DIR, 'the UI reference library is not in this checkout']]) {
    if (!existsSync(p)) { console.error(`${p} does not exist — ${why}.`); process.exit(2); }
  }

  const { classes, class_files_read } = deriveGuiClasses(CLASSES);
  if (classes.size === 0) {
    console.error('the derived GUI class set is EMPTY — every file would land no UI and the library would be an empty list that looks like a clean run. Refusing.');
    process.exit(3);
  }
  const screens = deriveScreenVocabulary(SCREEN_DIR);
  if (screens.length === 0) {
    console.error('no screen-*.json found — every asset would be unclassified and that would look like a property of the corpus. Refusing.');
    process.exit(3);
  }

  const rows = readFileSync(ROWS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

  // The syntax gate, if it has been run AGAINST THIS CORPUS. Absent is recorded as absent, and a
  // report about some other corpus is treated as absent rather than as a clean bill of health.
  const SYNTAX = join(REPO, 'packages/training/runs/luau-syntax-github-v1.json');
  const corpusRel = DIR.replace(`${REPO}/`, '');
  let unparseable = null;
  let notMeasured = null;
  if (existsSync(SYNTAX)) {
    const rep = JSON.parse(readFileSync(SYNTAX, 'utf8'));
    if (syntaxReportApplies(rep, corpusRel, rows.length)) {
      unparseable = new Set(rep.failures.map((f) => f.row_id));
      notMeasured = new Set((rep.not_measured ?? []).map((f) => f.row_id));
    } else {
      console.error(`the syntax report at ${SYNTAX} is about ${rep.corpus} / ${rep.rows_checked} rows,`);
      console.error(`not ${corpusRel} / ${rows.length}. Ignoring it — syntaxOk stays null.`);
    }
  }
  const assets = [];
  for (const r of rows) {
    const c = classifyUi(r.text, classes);
    if (!c.constructs_ui) continue;
    const names = instanceNames(r.text, classes);
    const { screen, evidence } = classifyScreen(r.provenance.source_path, names, screens);
    const p = r.provenance;
    assets.push({
      id: r.id,
      screen,
      screenEvidence: evidence,
      constructs: c.classes_constructed,
      compositionKey: compositionKey(c.classes_constructed),
      shape: r.shape_sha256,
      bytes: r.bytes,
      machineGenerated: r.generated === true,
      // Three states, matching the gate: true, false, and null for "nobody read this row".
      syntaxOk: unparseable === null || notMeasured.has(r.id) ? null : !unparseable.has(r.id),
      provenance: {
        sourceId: p.source_id,
        sourcePath: p.source_path,
        revision: p.revision,
        permalink: `${p.source_url}/blob/${p.revision}/${p.source_path}`,
      },
      rights: {
        spdx: r.rights.spdx,
        status: r.rights.status,
        licenceFilePath: r.rights.licence_file_path,
        licenceTextSha256: r.rights.licence_text_sha256,
        obligation: r.rights.obligation,
      },
    });
  }

  // `usable` requires the parse to have been OBSERVED, not merely to be un-disproven. `syntaxOk`
  // is null for a row nobody read, and `!== false` would have swept those in — the same shape as
  // an empty grep read as a clean result. When the gate has not run, this is 0, which is the
  // honest answer to "how many are proven usable".
  const usable = assets.filter((x) => !x.machineGenerated && x.syntaxOk === true);
  const tallyOf = (list, pick) => {
    const m = new Map();
    for (const x of list) { const k = pick(x); if (k == null) continue; m.set(k, (m.get(k) ?? 0) + 1); }
    return Object.fromEntries([...m].sort((p, q) => q[1] - p[1]));
  };

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generator: 'packages/training/src/build-ui-asset-library.mjs',
    corpus: DIR.replace(`${REPO}/`, ''),
    policy: {
      purpose: 'lookup of rights-cleared Roblox UI already in hand, so an interface is adapted rather than invented',
      sourceBytesStored: false,
      sourceBytesNote: 'the index is the library; the bytes live in the gitignored rows.jsonl and are re-fetchable from each asset\'s pinned revision, exactly as repos.jsonl already treats them',
      primaryKey: 'compositionKey — the sorted GUI classes the file constructs. Every asset has one.',
      secondaryKey: 'screen — present only where the file names itself. null is an answer, not a gap.',
      trainingApproved: false,
      trainingApprovedNote: 'nothing here is approved for training. Every row carries training_approved:false and semantic_quality_pass:null upstream, and this file changes neither.',
    },
    derivedFrom: {
      guiClasses: classes.size,
      engineReferenceClassFilesRead: class_files_read,
      screenKinds: screens.length,
      screenVocabulary: Object.fromEntries(screens.map((s) => [s.id, s.terms])),
      syntaxReport: unparseable === null ? 'not run — syntaxOk is null on every asset' : 'packages/training/runs/luau-syntax-github-v1.json',
    },
    totals: {
      rowsInCorpus: rows.length,
      assets: assets.length,
      distinctShapes: new Set(assets.map((x) => x.shape)).size,
      handWritten: assets.filter((x) => !x.machineGenerated).length,
      machineGenerated: assets.filter((x) => x.machineGenerated).length,
      failsToParse: unparseable === null ? null : assets.filter((x) => x.syntaxOk === false).length,
      parseNotMeasured: assets.filter((x) => x.syntaxOk === null).length,
      usable: usable.length,
      usableDistinctShapes: new Set(usable.map((x) => x.shape)).size,
      usableMeaning: 'hand-written AND observed to parse. An asset whose parse was never measured is not counted here, because un-disproven is not proven — that is the shape an empty grep takes when it is read as a clean result. This is the number to quote when asked how many UI assets are in hand.',
      repositories: new Set(assets.map((x) => x.provenance.sourceId)).size,
      withAScreen: assets.filter((x) => x.screen).length,
      withoutAScreen: assets.filter((x) => !x.screen).length,
      screenSelfDescriptionNote: 'most Roblox UI source does not name the screen it builds; that is a fact about the corpus, and filing the rest under a guess would make the library confidently wrong',
    },
    byScreen: tallyOf(assets, (x) => x.screen),
    byComposition: tallyOf(assets, (x) => x.compositionKey),
    bySpdx: tallyOf(assets, (x) => x.rights.spdx),
    assets: assets.sort((x, y) => x.id.localeCompare(y.id)),
  };

  const out = join(REPO, 'packages/corpus/data/ui-assets-github-v1.json');
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  const t = manifest.totals;
  console.error(`${t.assets} UI assets indexed from ${t.rowsInCorpus} rows, across ${t.repositories} repositories`);
  console.error(`  usable (hand-written, parses): ${t.usable} — ${t.usableDistinctShapes} distinct shapes`);
  console.error(`  machine-generated: ${t.machineGenerated} | fails to parse: ${t.failsToParse === null ? 'not measured' : t.failsToParse}`);
  console.error(`  name a screen: ${t.withAScreen} of ${t.assets}; the other ${t.withoutAScreen} are filed under composition only`);
  console.error(`  distinct composition keys: ${Object.keys(manifest.byComposition).length}`);
  console.error(`wrote ${out}`);
}
/* c8 ignore stop */
