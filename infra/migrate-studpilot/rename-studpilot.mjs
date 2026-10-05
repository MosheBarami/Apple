#!/usr/bin/env node
// One-time codemod: the product's names Apple (and the text forms of it) become StudPilot.
// StudPilot handoff task 1.2. It is the mechanical half; planning/proof/M1/PLAN.md lists the hand-made
// half (wire compatibility, env fallbacks, SDK aliases, docs, the guard's allowlist).
//
//   node infra/migrate-studpilot/rename-studpilot.mjs            dry run: counts per rule, files, path moves
//   node infra/migrate-studpilot/rename-studpilot.mjs --write    rewrite files and `git mv` paths
//
// WHAT IT NEVER TOUCHES, and why (each is an allowlist line in planning/rename-allowlist.txt):
//   * history and recorded data (SKIP): rewriting a record falsifies it;
//   * the six packages handoff task 3.2 deletes (SKIP): renaming code that M3 removes is wasted churn;
//   * names already written into users' Roblox places (PLACE): an `AppleEconomy` module or an
//     `AppleLibraryGame` attribute sits in games people saved; the agent and the plugin find them by
//     those names. They change in M4, when blocks write new names and read the old ones;
//   * stored identifiers (PROTECT): export formats, storage keys, ledger kinds, model and author ids;
//   * cloud-bound names (PROTECT): worker, D1, R2, queue, dataset and host names change in task 1.3,
//     in the same commit as the resource;
//   * third-party text (PROTECT): Apple Inc., -apple-system, apple-touch-icon, grapple, pineapple ...
//   * files edited by hand (HAND).
// "golem" is not rewritten at all: every live use is a compatibility shim, a cloud name or a record.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRITE = process.argv.includes('--write');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const SKIP = [
  // history and records
  /^docs\/(evidence|handoff|autonomy|audit|research|backlog|training|gauntlet|evals|sgsd|playbook)\//,
  /^docs\/(DECISIONS|FAILURES)\.md$/, /^docs\/operations\/GOLEM-REMOVAL-RUNBOOK\.md$/,
  /^(FINISH-THE-PRODUCT|WORKLIST)\.md$/, /^docs\/superpowers\//, /^docs\/spec\/DONE\.md$/,
  /^docs\/(MISSION-PROMPT|MISSION-LEDGER|FINISH-REPORT|FINISH-REPORT-100|PASS-LOG|PASS-STATE|SECURITY-TRIAGE-2026-08-31|model-serving-reality|frontier-for-roblox|knowledge-survivability|embedding-retrieval)\.md$/,
  /^(planning|research)\//, /^infra\/supabase\/migrations\//,
  /^packages\/corpus\/(raw|data|research)\//,
  /^packages\/evals\/(results|tasks|tasks-visual|fixtures)\//, /^packages\/evals\/owner-bench\/results\//,
  /^apps\/apple-plugin\/(release|proof)\//, /^apps\/[a-z-]+\/\.qa\//, /^apps\/apple-plugin\/THIRD_PARTY_NOTICES\.md$/,
  /^packages\/asset-library\/.*\.jsonl?$/, /^packages\/asset-library\/packs\//,
  // deleted in M3 (handoff 3.2)
  /^packages\/(training|langflow|owner-classify)\//, /^apps\/(plugin|benchmark|experiences)\//,
  // the old guard and codemod: replaced by scripts/check-old-names.mjs in this task
  /^scripts\/(check-no-golem\.mjs|golem-allowlist\.json|rename-golem\.mjs)$/,
  /^tests\/(no-golem-guard|rename-golem)\.test\.mjs$/,
  // this tool and its sibling migration tools say the old names on purpose
  /^infra\/migrate-studpilot\//,
  // generated: regenerated after the run instead (scripts/gen-components.mjs)
  /^apps\/worker\/src\/components\.generated\.ts$/,
];

// Edited by hand (shims, guards that name the old words, files whose 'apple' means Apple Inc.).
const HAND = new Set([
  'packages/shared/src/legacy-wire.ts', 'scripts/lib/env-compat.mjs', 'scripts/lib/legacy-name.mjs',
  'scripts/check-rebrand.mjs', 'scripts/probe-s1.mjs', 'scripts/check-copy.mjs', 'scripts/clean-test-tmp.mjs',
  'scripts/check-old-names.mjs', 'scripts/inspect-plugin-build.py',
  'apps/web/src/lib/shortcuts.ts', 'apps/web/src/lib/send-key.ts', 'apps/web/tests/shortcuts.test.mjs',
  'scripts/owner-dashboard/cc/platforms/design-history.mjs', 'scripts/owner-dashboard/control/pages/design-history.js',
  'scripts/owner-dashboard/cc/design-history-era.test.mjs',
  'README.md', 'AGENTS.md', 'CLAUDE.md', 'GOAL.md',
  'apps/site/src/pages/changelog.astro',
  'packages/corpus/src/intake/contenthash.mjs',
  'scripts/autonomy/owner-launchagent.plist',
  // the owner's own working copies (uncommitted edits in the shared checkout): never rewritten by a tool
  '.claude/settings.json', '.claude/launch.json', '.codex/hooks.json',
]);

// Paths that keep their name even though it contains the word.
const KEEP_PATH = [
  /(^|\/)apple-touch-icon\.png$/, /resource_apple\.png$/,
  /^packages\/components\/.*\/_*Apple[A-Z][A-Za-z0-9]*(\.Client)?\.luau$/, // module names written into places
];

/* -------------------------------------------------------------- protection --- */

// Names written into users' places: every Apple<Name> that appears in Luau, plus the ones the worker
// writes from TypeScript string literals. Collected from the tree, not typed, so a new component is
// protected the day it is added.
function placeNames(files) {
  const names = new Set();
  const tok = /_*Apple[A-Z][A-Za-z0-9]*/g;
  for (const f of files) {
    if (!f.endsWith('.luau')) continue;
    if (SKIP.some((re) => re.test(f)) && !f.startsWith('apps/apple-plugin/proof/')) continue;
    for (const m of readFileSync(join(ROOT, f), 'utf8').matchAll(tok)) names.add(m[0]);
  }
  // Component module names come from their file names too (packages/components/*/Apple*.luau).
  for (const f of files) for (const m of f.matchAll(/(?<=\/)_*Apple[A-Z][A-Za-z0-9]*(?=(\.Client)?\.luau$)/g)) if (f.startsWith('packages/components/')) names.add(m[0]);
  // Written by the worker into places, found in its string literals (instances, attributes, tags).
  for (const n of ['AppleParts', 'AppleMap', 'AppleComponents', 'AppleLibraryGame', 'AppleLibraryPath', 'AppleUI', 'AppleBody',
    'AppleDefenders', 'AppleEffect', 'AppleEnemies', 'AppleHUD', 'AppleGameConfig', 'AppleEmitCount', 'AppleTycoonParts',
    'AppleMood', 'AppleShop', 'AppleRoot', 'ApplePreview', 'AppleMenuBinder', 'AppleClientConfig', 'AppleAnimations',
    'AppleUpgradesConfig', 'AppleSound', 'AppleProjectiles', 'ApplePreviewLineup', 'ApplePlace', 'AppleDress',
    'AppleBehaviours', 'AppleWaves', 'AppleVfx', 'AppleTycoon', 'AppleTile', 'AppleSunRays', 'AppleSilenced',
    'AppleMotionClient', 'AppleMotion', 'AppleMachines', 'AppleHidden', 'AppleGallery', 'AppleColour', 'AppleBloom',
    'AppleBehave', 'AppleAtmosphere', 'AppleAnimatePlayed', 'AppleAnimate', 'AppleAgent', 'AppleOwnerNodeId',
    'AppleOwnerNamespace', 'AppleQuickStart', 'AppleBaseVolume', 'AppleStudioData', 'AppleLoadedAsset', 'AppleStoodUp',
    'AppleLayoutCheck', 'AppleStudioWorkspaceV1', 'AppleStudioOpen', 'ApplePanel', 'ApplePalette', 'AppleMode',
    'AppleState', 'AppleCatalog', 'AppleBuy', 'AppleCreature', 'AppleEnemy', 'AppleFrontierFreshBaseplate', 'AppleBuilt',
    'AppleRobloxAssetLibrary', 'AppleTags', 'AppleBehave_open', 'AppleUIEngineProof', 'AppleUIProof', 'AppleUIProofTheme',
    'AppleUITheme', 'MyAppleUI', 'AppleEconomy1', 'AppleCompon', 'AppleInsert']) names.add(n);
  return names;
}

// Each entry: a regular expression whose matches are kept verbatim. Order does not matter.
const PROTECT = [
  // third-party and platform names
  /-apple-system/g, /apple-touch-icon/g, /apple-mobile-web-app[\w-]*/g, /apple-itunes-app/g, /Apple Color Emoji/g,
  /[Gg]rapple\w*/g, /\w*[Pp]ine_?[Aa]pple\w*/g, /[Ss]n[Aa]pple\w*/g, /[Ss]l[Aa]pple\w*/g, /[Cc]rab[Aa]pple\w*/g, /bapple/g, /appleworks/gi,
  /isApplePlatform/g, /Apple Inc\.?/g, /Apple M\d( Pro| Max| Ultra)?/g, /Apple [Ss]ilicon/g, /apple-silicon/g, /Apple GPU/g,
  /Apple App Store/g, /Apple and Google/g, /Apple Pay/g, /Sign in with Apple/g, /Apple Developer/g, /Apple desktop/g,
  /Apple mobile/g, /Metal \(Apple\)/g, /AppleScript/g, /Apple Keyboard[^"\n]*/g, /-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN/g,
  /www\.apple\.com\/DTDs\/PropertyList-1\.0\.dtd/g, /podcasts\.apple\.com/g, /apple\/aimv2[\w.-]*/g, /apple-amlr/g,
  /apple\/ml-ferret/g, /Apple's SwiftUI/g, /AppleBlox/g, /appleblox/g, /Apple Silicon/g, /macOS \(Apple\)/g,
  /twitter\|apple\|android/g, // imagegen.ts BRAND_TERMS: Apple Inc.'s trademark
  // the Creator Store listing title, until the owner retitles it (deferred, rename-inventory)
  /Apple Studio \(asset/g, /"Apple Studio" listing/g,
  // stored identifiers: formats, keys and ids already saved by users or in our stores
  /apple-studio-snapshot-v\d+/g, /apple\.account-export\.v\d+/g, /apple\.memory\.v\d+/g, /apple-skill-cards-v\d+/g,
  /apple\.owner-corpus\.[\w.-]+/g, /apple-authored/g, /apple_library/g, /(['"`])apple-max\1/g, /appleMaxBase/g, /appleUserId/g,
  /apple:[a-z][\w:-]*/g, // spend-ledger kinds and the theme event
  /(['"`])apple[.-](?:theme|prefs|dir|view|uiTheme|tour|search|rail|pendingStart|interface-sound|draft|composer|admin-key)[\w.:-]*\1/g, // browser storage keys
  /(['"`])apple\1/g, // the bare id: product model, author, deploy target, consumer name (each changed by hand where it must)
  // cloud-bound names: changed with their resource in task 1.3
  /apple-media/g, /apple-notifications/g, /apple-model-upload/g, /apple-cf-probe[\w-]*/g, /apple_product_events/g,
  /apple_(SessionDO|QuotaDO|PairingDO|AdminDO|BudgetDO|DiscordDO)/g,
  /apple\.moshe-barami111\.workers\.dev/g, /MosheBarami\/Apple(\.git)?/g, /Apple\.git/g,
  /deploy-worker\.mjs apple/g, /'apple'\s*\|\s*'golem'/g,
  // the owner's on-disk state on his Mac (folders, launchd label): renamed with a fallback, by hand
  /Application Support\/Apple/g, /com\.moshe\.apple\.[\w.-]+/g, /Apple-OS/g, /mcp__apple-studio/g,
];

/* ----------------------------------------------------------------- rewrite --- */

const RULES = [
  ['scope', /@apple(\\?\/)/g, '@studpilot$1'],
  ['scope-dir', /(['"])@apple\1/g, '$1@studpilot$1'],
  ['plugin-dir', /apps(\\?\/)apple-plugin/g, 'apps$1studpilot-plugin'],
  ['plugin-dir-seg', /(['"/.])apple-plugin(?=['"/])/g, '$1studpilot-plugin'],
  ['article', /\b([Aa])n Apple\b/g, (_, a) => `${a} StudPilot`],
  ['UPPER', /APPLE/g, 'STUDPILOT'],
  ['Title', /Apple/g, 'StudPilot'],
  ['lower', /apple/g, 'studpilot'],
];

function rewrite(text, place) {
  const kept = [];
  const hold = (m) => { kept.push(m); return `\u0000${kept.length - 1}\u0000`; };
  let t = text;
  for (const re of PROTECT) t = t.replace(re, hold);
  t = t.replace(/_*Apple[A-Z][A-Za-z0-9]*/g, (m) => (place.has(m) ? hold(m) : m));
  const counts = {};
  for (const [name, re, to] of RULES) {
    let n = 0;
    t = t.replace(re, (...a) => { n++; return typeof to === 'function' ? to(...a) : a[0].replace(new RegExp(re.source, re.flags.replace('g', '')), to); });
    if (n) counts[name] = n;
  }
  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
  return { text: t, counts };
}

const renameSeg = (seg) => seg.replace(/APPLE/g, 'STUDPILOT').replace(/Apple/g, 'StudPilot').replace(/apple/g, 'studpilot');

/** The plugin's directory moves as a whole, records included; inside it, and elsewhere, a skipped or kept path keeps its name. */
function newPath(p, skipped) {
  const PLUGIN = 'apps/apple-plugin/';
  if (p.startsWith(PLUGIN)) {
    const rest = p.slice(PLUGIN.length);
    return 'apps/studpilot-plugin/' + (skipped || KEEP_PATH.some((re) => re.test(p)) ? rest : rest.split('/').map(renameSeg).join('/'));
  }
  if (skipped || KEEP_PATH.some((re) => re.test(p))) return p;
  return p.split('/').map(renameSeg).join('/');
}

/* -------------------------------------------------------------------- main --- */

const files = git('ls-files', '-z').split('\0').filter(Boolean);
const place = placeNames(files);
const totals = {}; const changed = []; const moves = [];
for (const f of files) {
  const skipped = SKIP.some((re) => re.test(f));
  const abs = join(ROOT, f);
  if (!existsSync(abs)) continue;
  if (!skipped && !HAND.has(f)) {
    const buf = readFileSync(abs);
    if (!buf.subarray(0, 8000).includes(0)) {
      const before = buf.toString('utf8');
      const { text, counts } = rewrite(before, place);
      if (text !== before) {
        changed.push([f, counts]);
        for (const [k, v] of Object.entries(counts)) totals[k] = (totals[k] ?? 0) + v;
        if (WRITE) writeFileSync(abs, text);
      }
    }
  }
  const np = newPath(f, skipped);
  if (np !== f) moves.push([f, np]);
}

// Directory-aware moves: git mv each file (git creates the directories).
if (WRITE) {
  for (const [from, to] of moves) {
    execFileSync('mkdir', ['-p', dirname(join(ROOT, to))]);
    git('mv', '-k', from, to);
  }
}

console.log(`${WRITE ? 'WROTE' : 'DRY RUN'}: ${changed.length} file(s) rewritten, ${moves.length} path(s) moved, ${place.size} place-written names protected`);
console.log('rule counts:', JSON.stringify(totals));
if (process.argv.includes('--list')) {
  for (const [f, c] of changed) console.log(`  ${f}  ${JSON.stringify(c)}`);
  for (const [a, b] of moves) console.log(`  MOVE ${a} -> ${b}`);
}
