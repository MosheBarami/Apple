#!/usr/bin/env node
/**
 * ASK THE DEPLOYED MODEL TO BUILD A PLAYABLE MAP, THEN DRAW WHAT IT BUILT.
 *
 * The companion to generate-ui-showcase.mjs, and the same three claims hold: the model is the
 * deployed one, the genre brief is the product's own `get_genre_kit` payload bundled out of
 * apps/worker/src, and the picture is the instance tree the model's Luau actually produced —
 * compiled, executed under ui-harness.luau, and drawn as a plan by render-map-plan.mjs.
 *
 * NOTHING IS UPLOADED. The owner's Roblox account had 299 assets pushed into it once without
 * permission and Roblox will not delete them. A map built out of Parts, Sizes, Positions and
 * Colour3s needs no asset, no upload and no Creator Store call, which is exactly why it is the map
 * this script asks for.
 *
 * THE ONE CONSTRAINT THIS PROMPT IMPOSES, AND IT IS DISCLOSED IN THE MANIFEST. The prompt asks for
 * parts placed with `.Position` and rotated with `.Orientation`. `ui-harness.luau` models CFrame as
 * opaque — it does no matrix arithmetic — so a part placed by `CFrame.new(...)` has no coordinates
 * this process can read, and would be counted `unplaceable` and vanish from the plan. Position and
 * Orientation are idiomatic Roblox for axis-aligned building, so this narrows style rather than
 * ability; `promptConstraint` in the manifest states it so no reader mistakes the plan for proof
 * that the model cannot use CFrame.
 *
 *   node packages/training/src/generate-map-showcase.mjs --genres tycoon,horror,obby
 */
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { buildUiTree, indexTree, descendants, fencedLuau } from './score-ui.mjs';
import { collectParts, renderMapPlan } from './render-map-plan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const WORKER_SRC = join(REPO, 'apps/worker/src');

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};

const BASE = process.env.API_BASE || 'https://apple.moshe-barami111.workers.dev';
const ADMIN = process.env.GOLEM_ADMIN_KEY;

async function loadGenreLibrary() {
  const requireFromWorker = createRequire(join(WORKER_SRC, 'index.ts'));
  const esbuild = await import(pathToFileURL(requireFromWorker.resolve('esbuild')).href);
  const dir = mkdtempSync(join(tmpdir(), 'apple-maplib-'));
  const outfile = join(dir, 'genre.mjs');
  await esbuild.build({
    entryPoints: [join(WORKER_SRC, 'genre-reference-guide.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile,
    loader: { '.json': 'json' },
    logLevel: 'error',
  });
  const mod = await import(outfile);
  return { mod, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const SYSTEM = [
  'You are Apple, an expert Roblox world builder.',
  'Reply with EXACTLY ONE fenced ```luau code block and nothing else — no prose before or after.',
  'Write a Script that builds a playable map by creating BaseParts and parenting them into',
  'workspace, grouped into Models by area.',
  'Place every part with .Position (a Vector3) and .Size (a Vector3). Rotate with .Orientation.',
  'Do NOT position with CFrame.',
  'Set .Anchored = true and .Color (a Color3) on every part — an unanchored map falls apart and an',
  'uncoloured map is grey.',
  'Include at least one SpawnLocation.',
  'Build the whole playable area: ground, boundaries, the structures the genre needs, and the',
  'circulation between them. No update loop, no while-true.',
].join(' ');

async function complete({ model, system, prompt, maxTokens }) {
  const res = await fetch(`${BASE}/api/admin/model-test`, {
    method: 'POST',
    headers: { 'X-Admin-Key': ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, system, maxTokens }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: `non-JSON response ${res.status}: ${text.slice(0, 300)}` };
  }
  if (!res.ok || json.ok === false) return { ok: false, error: json.error || `HTTP ${res.status}` };
  return { ok: true, text: String(json.text ?? ''), ms: json.ms };
}

async function runGenre({ genreId, model, maxTokens, genreMod, outDir, size }) {
  const kit = genreMod.getGenreReferenceGuide({ genre: genreId });
  if (!kit || kit.noMatch !== false) return { genre: genreId, outcome: 'not_in_library' };

  const prompt = [
    `Build the playable map for a Roblox ${genreId.replace(/_/g, ' ')} game.`,
    '',
    'This is your own library talking — what this genre looks like, read off games that shipped.',
    'Apply it literally, especially the map composition, materials and lighting notes.',
    '',
    '=== THE GENRE (get_genre_kit) ===',
    JSON.stringify(kit, null, 1),
    '',
    'Build the whole map, not a fragment. One fenced luau block.',
  ].join('\n');

  const res = await complete({ model, system: SYSTEM, prompt, maxTokens });
  if (!res.ok) return { genre: genreId, outcome: 'request_failed', detail: res.error };

  const code = fencedLuau(res.text);
  if (!code) return { genre: genreId, outcome: 'no_code_block', detail: `${res.text.length} chars of prose` };

  writeFileSync(join(outDir, `map--${genreId}.luau`), code);
  const built = buildUiTree(code);
  if (!built.ran) return { genre: genreId, outcome: 'harness_did_not_run', detail: built.reason };
  if (built.compiled === false) return { genre: genreId, outcome: 'does_not_compile', detail: built.detail };
  if (built.status === 'error') return { genre: genreId, outcome: 'runtime_error', detail: built.detail };

  const tree = indexTree(built.nodes);
  const all = tree.roots.flatMap((r) => descendants(r, [r]));
  const { parts, unplaceable, unsized, unknownColour } = collectParts(all);
  const plan = renderMapPlan({ parts, width: size.w, height: size.h, title: `${genreId} map` });
  if (!plan.svg) return { genre: genreId, outcome: 'nothing_placeable', detail: plan.reason, unplaceable, unsized };

  writeFileSync(join(outDir, `map--${genreId}.svg`), plan.svg);
  return {
    genre: genreId,
    outcome: 'built',
    codeChars: code.length,
    ms: res.ms,
    parts: parts.length,
    spawns: parts.filter((p) => p.isSpawn).length,
    unplaceable,
    unsized,
    unknownColour,
    bounds: plan.bounds,
    files: { luau: `map--${genreId}.luau`, svg: `map--${genreId}.svg` },
  };
}

async function main() {
  if (!ADMIN) {
    console.error('GOLEM_ADMIN_KEY is not set. `set -a && . ./.env && set +a` first.');
    process.exit(2);
  }
  const { mod: genreMod, cleanup } = await loadGenreLibrary();
  const model = arg('model', 'rune');
  const maxTokens = Number(arg('max-tokens', '6000'));
  const size = { w: Number(arg('width', '1600')), h: Number(arg('height', '900')) };
  const outDir = arg('out', join(REPO, 'docs/evidence/map-showcase'));
  mkdirSync(outDir, { recursive: true });
  const genres = (arg('genres') ?? 'tycoon,obby,horror,tower_defense').split(',').map((s) => s.trim()).filter(Boolean);

  console.log(`base=${BASE} model=${model} genres=${genres.length}`);
  const results = [];
  for (const genreId of genres) {
    process.stdout.write(`  ${genreId} ... `);
    let r;
    try {
      r = await runGenre({ genreId, model, maxTokens, genreMod, outDir, size });
    } catch (e) {
      r = { genre: genreId, outcome: 'threw', detail: e instanceof Error ? e.message : String(e) };
    }
    results.push(r);
    console.log(
      r.outcome === 'built'
        ? `${r.parts} parts, ${r.spawns} spawn(s), ${r.bounds.studsWide}x${r.bounds.studsDeep} studs` +
          (r.unplaceable ? `, ${r.unplaceable} unplaceable` : '')
        : `${r.outcome}: ${String(r.detail ?? '').slice(0, 110)}`,
    );
  }

  writeFileSync(
    join(outDir, 'manifest.json'),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        base: BASE,
        model,
        lane: model === 'rune' ? 'Apple MAX' : model === 'stone' ? 'Apple' : model,
        libraryDelivery: 'injected',
        promptConstraint:
          'The prompt asks for .Position/.Orientation rather than CFrame, because ui-harness.luau models CFrame as opaque and a CFrame-placed part would have no coordinates to draw. This narrows style, not ability.',
        uploads: 'none — every part is geometry and a Color3; nothing was sent to any Roblox account',
        renderer: 'packages/training/src/render-map-plan.mjs — plan view, rotation not modelled',
        counts: {
          genres: results.length,
          built: results.filter((r) => r.outcome === 'built').length,
          byOutcome: results.reduce((a, r) => ({ ...a, [r.outcome]: (a[r.outcome] ?? 0) + 1 }), {}),
        },
        results,
      },
      null,
      2,
    )}\n`,
  );
  cleanup();
  console.log(`\n${results.filter((r) => r.outcome === 'built').length}/${results.length} built -> ${outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
