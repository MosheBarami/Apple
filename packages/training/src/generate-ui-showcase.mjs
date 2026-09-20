#!/usr/bin/env node
/**
 * ASK THE DEPLOYED MODEL TO BUILD ROBLOX UI FROM ITS OWN LIBRARY, THEN SHOW WHAT CAME BACK.
 *
 * WHY THIS EXISTS. The owner asked, on 2026-09-20, to see "ui שהמודל יצר מהספרייה שלו" — UI the
 * model made from its own library — brought into the chat. Everything in this repository up to now
 * measures that ability with a number. A number is not what he asked for.
 *
 * WHAT IS REAL HERE, and it is worth being precise because a picture is easy to fake:
 *
 *   1. THE MODEL is the deployed one. Every completion is an HTTP call to the live Worker at
 *      $API_BASE, routed by the lane name (`rune` = Apple MAX, `stone` = Apple). No local model,
 *      no fixture, no cached answer.
 *   2. THE LIBRARY is the product's own. `get_ui_construction` and `get_genre_kit` are tools the
 *      Worker serves out of `packages/corpus/data/`; this script imports THOSE MODULES, bundled
 *      from `apps/worker/src/` with esbuild, and injects exactly what the tool would return. It
 *      does not paraphrase the library or write its own version of it.
 *   3. THE PICTURE is the model's own instance tree. The returned Luau is compiled with
 *      `luau-compile`, executed under `ui-harness.luau`, resolved to absolute rectangles by
 *      `resolveLayout`, and painted by `render-ui-tree.mjs`.
 *
 * WHY THE TOOL PAYLOAD IS INJECTED RATHER THAN CALLED. `/api/admin/model-test` is the only
 * completion endpoint reachable without a live Roblox Studio socket, and it wires exactly one
 * throwaway tool (`echo_tool`) — the real registry in tools.ts is bound to a SessionDO run. So a
 * two-turn tool loop is not available here. Injecting the tool's verbatim output makes this a
 * measurement of "the model given its library", not "the model choosing to ask for its library".
 * Those are different claims and the manifest records which one this is: `libraryDelivery:
 * "injected"`. Nothing downstream may upgrade that to "the model retrieved it".
 *
 * WHAT THE OUTPUT IS NOT. Not a Roblox Studio screenshot. See the header of render-ui-tree.mjs for
 * the list of things Studio does that this deliberately does not model.
 *
 *   node packages/training/src/generate-ui-showcase.mjs --targets shop,inventory --genre tycoon
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { buildUiTree, indexTree, resolveLayout, guiDescendants, screenGuisInPlayerGui, fencedLuau } from './score-ui.mjs';
import { renderTreeToSvg } from './render-ui-tree.mjs';
import { mergeResults } from './showcase-manifest.mjs';

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


/**
 * The Worker's own library modules, bundled out of `apps/worker/src` so what is injected is what
 * the tool returns rather than a second copy that can drift. Bundled into a temp dir the run
 * deletes: this is a read of the product, not a build artifact anybody should ship.
 */
async function loadWorkerLibrary() {
  // esbuild is a dependency of apps/worker, not of packages/training, and pnpm's store is not flat.
  // Resolving from the Worker's own package is what makes "the module the Worker bundles" true.
  const requireFromWorker = createRequire(join(WORKER_SRC, 'index.ts'));
  const esbuild = await import(pathToFileURL(requireFromWorker.resolve('esbuild')).href);
  const dir = mkdtempSync(join(tmpdir(), 'apple-uilib-'));
  const build = async (entry, out) => {
    await esbuild.build({
      entryPoints: [join(WORKER_SRC, entry)],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      outfile: join(dir, out),
      loader: { '.json': 'json' },
      logLevel: 'error',
    });
    return import(join(dir, out));
  };
  const construction = await build('ui-construction-guide.ts', 'construction.mjs');
  const genre = await build('genre-reference-guide.ts', 'genre.mjs');
  return { construction, genre, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const SYSTEM = [
  'You are Apple, an expert Roblox UI engineer.',
  'Reply with EXACTLY ONE fenced ```luau code block and nothing else — no prose before or after.',
  'Write a LocalScript body that builds the screen by creating instances in code and parenting the',
  'ScreenGui into game.Players.LocalPlayer.PlayerGui.',
  'Size and position with Scale wherever a thing should track the screen; Offset is for stroke',
  'weights, corner radii, padding and text sizes only.',
  'Set BackgroundColor3 and TextColor3 on every visible element — an element with no colour set is',
  'an element nobody can see.',
  'Put real, specific strings in every label. Never "Label", "Item 1" or lorem.',
  'Do not write an update loop, a while-true, or a RunService binding: build the screen and stop.',
].join(' ');

/** The prompt carries the library verbatim, under headings that say what each block is. */
function buildPrompt({ target, label, constructionPayload, genrePayload, genreId }) {
  const blocks = [];
  blocks.push(
    `Build the ${label} for a Roblox ${genreId.replace(/_/g, ' ')} game.`,
    '',
    'You have been handed two things out of your own library. Apply them literally — they were read',
    'off interfaces that actually shipped, and where they disagree with your instinct they win.',
    '',
    '=== HOW THIS SCREEN IS CONSTRUCTED (get_ui_construction) ===',
    JSON.stringify(constructionPayload, null, 1),
  );
  if (genrePayload) {
    blocks.push(
      '',
      '=== WHAT THIS GENRE LOOKS LIKE (get_genre_kit) ===',
      JSON.stringify(genrePayload, null, 1),
    );
  }
  blocks.push(
    '',
    'Build the whole screen, not a fragment: every part the construction names, in the order it',
    'names them, in the states it describes. One fenced luau block.',
  );
  return blocks.join('\n');
}

/**
 * ONE COMPLETION, WITH A DEADLINE.
 *
 * THE DEFECT THIS ANSWERS, measured 2026-09-20. `fetch` has no default timeout, and a request to
 * the gateway hung. The run sat on `screen-crafting` for twenty-five minutes with no output and no
 * error while the endpoint itself answered an unrelated probe in 812ms — so the pipeline was not
 * slow, it was stopped, and nothing said so. A silent stall is the worst shape a failure can take
 * here: it looks exactly like work in progress.
 *
 * A timed-out attempt is retried once, because a single hung socket is not evidence the model
 * cannot build the screen. A second timeout is reported as `request_failed` with the word timeout
 * in it, never as a failure of the model.
 */
async function complete({ model, system, prompt, maxTokens, timeoutMs = 180_000, attempts = 2 }) {
  let last = 'no attempt was made';
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/admin/model-test`, {
        method: 'POST',
        headers: { 'X-Admin-Key': ADMIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, system, maxTokens }),
        signal: AbortSignal.timeout(timeoutMs),
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
    } catch (e) {
      const why = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      last = `attempt ${i}/${attempts} ${why}`;
      if (i === attempts) return { ok: false, error: `timeout or network failure — ${last}` };
    }
  }
  return { ok: false, error: last };
}

/**
 * ONE TARGET, END TO END. Every outcome the pipeline can have is a distinct value of `outcome`,
 * kept separate for the same reason score-ui.mjs keeps them separate: "the model wrote prose",
 * "the model wrote Luau that does not compile" and "the model built a screen with a bug in it" are
 * three different findings and collapsing them would describe none of them.
 */
async function runTarget({ target, genreId, model, maxTokens, lib, outDir, viewport }) {
  const construction = lib.construction.getUIConstruction({ id: target, totalChars: 3400 });
  if (!construction.found) {
    return { target, outcome: 'not_in_library', detail: construction.notCovered };
  }
  const genrePayload = (() => {
    const g = lib.genre.getGenreReferenceGuide({ genre: genreId });
    return g && g.noMatch === false ? g : null;
  })();

  const label = construction.id.replace(/^screen-/, '').replace(/_/g, ' ');
  const prompt = buildPrompt({ target, label, constructionPayload: construction, genrePayload, genreId });

  const res = await complete({ model, system: SYSTEM, prompt, maxTokens });
  if (!res.ok) return { target, outcome: 'request_failed', detail: res.error };

  const code = fencedLuau(res.text);
  if (!code) {
    return { target, outcome: 'no_code_block', detail: `answer was ${res.text.length} chars of prose`, answerChars: res.text.length };
  }

  const built = buildUiTree(code);
  const base = `${construction.id}--${genreId}`;
  writeFileSync(join(outDir, `${base}.luau`), code);

  if (!built.ran) return { target, id: construction.id, outcome: 'harness_did_not_run', detail: built.reason, codeChars: code.length };
  if (built.compiled === false) return { target, id: construction.id, outcome: 'does_not_compile', detail: built.detail, codeChars: code.length };
  if (built.status === 'error') return { target, id: construction.id, outcome: 'runtime_error', detail: built.detail, codeChars: code.length };

  const tree = indexTree(built.nodes);
  const guis = screenGuisInPlayerGui(tree);
  if (!guis.length) {
    return { target, id: construction.id, outcome: 'no_screengui_in_playergui', detail: 'the build ran but nothing reached PlayerGui', codeChars: code.length };
  }

  const root = guis[0];
  const { rects } = resolveLayout(root, viewport);
  const guiNodes = guiDescendants(root);

  // TWO PICTURES, BECAUSE A MODAL SCREEN HAS TWO HONEST ANSWERS.
  //
  // `asScripted` is what a player sees the instant the LocalScript finishes: a shop that opens on a
  // click is a single button, and that is the truth. `opened` ignores `Visible` so the owner can
  // see the screen the model actually built. It is written ONLY when the as-scripted render found
  // hidden nodes, and the manifest carries `forcedVisible` so no caption can claim the script
  // opened it by itself. Collapsing these two into one picture is how the first run of this script
  // produced a shop that appeared to have a layout bug it did not have.
  const asScripted = renderTreeToSvg({ guiNodes, rects, viewport });
  writeFileSync(join(outDir, `${base}.svg`), asScripted.svg);

  const files = { luau: `${base}.luau`, svg: `${base}.svg` };
  let opened = null;
  if (asScripted.hidden > 0) {
    opened = renderTreeToSvg({ guiNodes, rects, viewport, forceVisible: true });
    writeFileSync(join(outDir, `${base}--opened.svg`), opened.svg);
    files.openedSvg = `${base}--opened.svg`;
  }

  return {
    target,
    id: construction.id,
    genre: genreId,
    outcome: 'built',
    codeChars: code.length,
    ms: res.ms,
    screenGuis: guis.length,
    guiNodes: guiNodes.length,
    asScripted: {
      painted: asScripted.painted,
      textNodes: asScripted.textNodes,
      hidden: asScripted.hidden,
      offscreen: asScripted.offscreen,
    },
    opened: opened
      ? { painted: opened.painted, textNodes: opened.textNodes, forcedVisible: opened.forcedVisible, offscreen: opened.offscreen }
      : null,
    scaledText: (opened ?? asScripted).scaledText,
    imagePlaceholders: (opened ?? asScripted).imagePlaceholders,
    sources: construction.sources?.length ?? 0,
    files,
  };
}

async function main() {
  if (!ADMIN) {
    console.error('GOLEM_ADMIN_KEY is not set. `set -a && . ./.env && set +a` first.');
    process.exit(2);
  }
  const lib = await loadWorkerLibrary();
  const model = arg('model', 'rune');
  const genreId = arg('genre', 'tycoon');
  const maxTokens = Number(arg('max-tokens', '6000'));
  const viewport = { id: 'desktop', w: Number(arg('width', '1600')), h: Number(arg('height', '900')) };
  const outDir = arg('out', join(REPO, 'docs/evidence/ui-showcase'));
  mkdirSync(outDir, { recursive: true });

  const targets = (arg('targets') ?? lib.construction.UI_CONSTRUCTION_SCREEN_IDS.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`base=${BASE} model=${model} genre=${genreId} targets=${targets.length} viewport=${viewport.w}x${viewport.h}`);
  const results = [];
  for (const target of targets) {
    process.stdout.write(`  ${target} ... `);
    let r;
    try {
      r = await runTarget({ target, genreId, model, maxTokens, lib, outDir, viewport });
    } catch (e) {
      r = { target, outcome: 'threw', detail: e instanceof Error ? e.message : String(e) };
    }
    results.push(r);
    console.log(
      r.outcome === 'built'
        ? `built ${r.guiNodes} nodes — as-scripted ${r.asScripted.painted} painted/${r.asScripted.textNodes} labels${r.opened ? `, opened ${r.opened.painted}/${r.opened.textNodes} (${r.opened.forcedVisible} forced)` : ''}`
        : `${r.outcome}: ${String(r.detail).slice(0, 110)}`,
    );
  }

  const merged = mergeResults(outDir, results);
  const manifest = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    model,
    lane: model === 'rune' ? 'Apple MAX' : model === 'stone' ? 'Apple' : model,
    genre: genreId,
    viewport,
    libraryDelivery: 'injected',
    libraryDeliveryMeaning:
      'The get_ui_construction / get_genre_kit payloads were placed in the prompt verbatim. The model was GIVEN its library; it did not choose to ask for it. /api/admin/model-test wires no real tools.',
    renderer: 'packages/training/src/render-ui-tree.mjs over resolveLayout — geometry, not a Studio screenshot',
    ranThisInvocation: results.map((r) => `${r.id ?? r.target}--${r.genre ?? ''}`),
    counts: {
      targets: merged.length,
      built: merged.filter((r) => r.outcome === 'built').length,
      byOutcome: merged.reduce((a, r) => ({ ...a, [r.outcome]: (a[r.outcome] ?? 0) + 1 }), {}),
    },
    results: merged,
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  lib.cleanup();
  console.log(
    `\n${results.filter((r) => r.outcome === 'built').length}/${results.length} built this run; ` +
      `${manifest.counts.built}/${merged.length} in the manifest -> ${outDir}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
