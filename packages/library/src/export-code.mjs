// Bundles for insert_library_code (one JSON per A/B code module that is not unsafe): the instance tree, the package
// name, dependencies as library ids, the licence and the attribution that must travel with the code. Bundles go to R2
// (studpilot-media/library/code/<vector id>.json); the items file gets package_name, deps, standalone and bundle_key.
//
//   node packages/library/src/export-code.mjs <items.jsonl> <repos-dir> <bundles-out-dir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildTree, wallyInfo, packageName, needsLoader, allSource, countScripts } from './code-tree.mjs';
import { vectorId } from './embed.mjs';

const [itemsFile, reposDir, outDir] = process.argv.slice(2);
if (!itemsFile || !reposDir || !outDir) { console.error('usage: export-code.mjs <items.jsonl> <repos-dir> <bundles-out-dir>'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const items = readFileSync(itemsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const info = new Map();
for (const it of items) {
  const root = join(reposDir, it.file);
  const repoDir = join(reposDir, it.file.split('/')[0]);
  const wally = wallyInfo(root, repoDir);
  const repo = it.source_url.split('/').filter(Boolean).pop();
  const tree = buildTree(root, packageName(wally.name, it.file.split('/').pop().replace(/\.(lua|luau)$/i, ''), repo));
  info.set(it.id, { root, wally, tree });
}
// A wally name belongs to the item whose own wally.toml names it (the nearest file, so a collection's modules each own theirs).
const byWally = new Map();
for (const [id, i] of info) if (i.wally.name && !byWally.has(i.wally.name)) byWally.set(i.wally.name, id);
let exported = 0, standaloneCount = 0;
for (const it of items) {
  const { wally, tree } = info.get(it.id);
  const deps = Object.entries(wally.deps).map(([alias, name]) => ({ alias, id: byWally.get(name) ?? null, wally: name }));
  const src = allSource(tree);
  const usable = (it.grade === 'A' || it.grade === 'B') && it.audit !== 'unsafe' && tree;
  it.package_name = tree?.name;
  it.deps = deps;
  it.standalone = Boolean(usable) && !needsLoader(src) && deps.every((d) => d.id && info.get(d.id)?.tree);
  it.scripts = countScripts(tree);
  if (!usable) { delete it.bundle_key; continue; }
  it.bundle_key = `library/code/${vectorId(it.id)}.json`;
  writeFileSync(join(outDir, `${vectorId(it.id)}.json`), JSON.stringify({ id: it.id, name: tree.name, tree, deps, licence: it.licence_class, attribution: it.attribution, source_url: it.source_url, sha256: it.file_sha256 }));
  exported += 1;
  if (it.standalone) standaloneCount += 1;
}
writeFileSync(itemsFile, items.map((i) => JSON.stringify(i)).join('\n') + '\n');
console.log(`${exported} bundles (${standaloneCount} standalone with every dependency in the library) -> ${outDir}`);
