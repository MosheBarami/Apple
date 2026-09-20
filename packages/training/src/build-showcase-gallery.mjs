#!/usr/bin/env node
/**
 * ASSEMBLE THE SHOWCASE INTO ONE PAGE THE OWNER CAN OPEN.
 *
 * He is fifteen and not technical. The evidence for "the model can build Roblox UI" currently lives
 * in two manifests, thirty-odd PNGs and a pile of .luau files, which is evidence nobody will read.
 * This turns it into one page: every screen the model built, every map, and — with equal weight —
 * every screen it FAILED to build, with the actual reason.
 *
 * THE FAILURES ARE NOT AN APPENDIX. A gallery that shows twelve successes and quietly omits four
 * failures is a lie by composition, and it is the lie this repository is most careful about. Failed
 * targets get a card of the same size, in the same grid, carrying the exact outcome string and the
 * first line of the error.
 *
 *   node packages/training/src/build-showcase-gallery.mjs --out docs/evidence/showcase.html
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const readManifest = (dir) => {
  const p = join(dir, 'manifest.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

/** Plain words for an outcome, because the owner does not read enum names. */
const OUTCOME_WORDS = {
  built: 'built',
  no_code_block: 'answered in prose instead of code',
  does_not_compile: 'the Luau did not compile',
  runtime_error: 'the build threw while running',
  harness_did_not_run: 'the test harness could not run it',
  nothing_on_screen_or_on_a_surface: 'nothing reached the screen or a world surface',
  no_screengui_in_playergui: 'nothing reached the player’s screen',
  nothing_placeable: 'no part had both a size and a position',
  not_in_library: 'no construction recorded for this id',
  request_failed: 'the request to the model failed',
  threw: 'the pipeline itself threw',
};

function screenCard(r, uiDir, prefix) {
  const ok = r.outcome === 'built';
  const name = String(r.id ?? r.target).replace(/^screen-/, '').replace(/[-_]/g, ' ');
  const opened = ok && r.files?.openedSvg;
  const png = opened ? r.files.openedSvg.replace(/\.svg$/, '.png') : ok ? r.files.svg.replace(/\.svg$/, '.png') : null;
  const onDisk = png ? join(uiDir, png) : null;
  const hasPng = onDisk && existsSync(onDisk);

  if (!ok || !hasPng) {
    return `<article class="card card--failed">
      <div class="card__stripe" aria-hidden="true"></div>
      <div class="card__body">
        <h3 class="card__title">${esc(name)}</h3>
        <p class="card__verdict">${esc(OUTCOME_WORDS[r.outcome] ?? r.outcome)}</p>
        ${r.detail ? `<p class="card__detail">${esc(String(r.detail).slice(0, 320))}</p>` : ''}
        <dl class="stats">
          <div><dt>outcome</dt><dd class="mono">${esc(r.outcome)}</dd></div>
          ${r.codeChars ? `<div><dt>luau written</dt><dd class="mono">${r.codeChars.toLocaleString()} chars</dd></div>` : ''}
        </dl>
      </div>
    </article>`;
  }

  const a = r.asScripted ?? {};
  const o = r.opened;
  const s = r.surface;
  // A world UI and a full-screen UI are different things, and a caption that implied the board
  // filled the player's screen would misdescribe what the model built.
  const tag = s
    ? `on a ${s.partStuds.w} × ${s.partStuds.h} stud board in the world, not on the screen`
    : o
      ? 'shown opened — the script starts it hidden'
      : null;
  return `<article class="card">
    <figure class="shot">
      <img src="${esc(prefix + png)}" alt="${esc(name)} screen built by the model" loading="lazy" width="3200" height="1800">
      ${tag ? `<figcaption class="shot__tag">${esc(tag)}</figcaption>` : ''}
    </figure>
    <div class="card__body">
      <h3 class="card__title">${esc(name)}</h3>
      <dl class="stats">
        <div><dt>instances on screen</dt><dd class="mono">${(o ? o.painted + o.textNodes : a.painted + a.textNodes) || 0}</dd></div>
        <div><dt>gui objects built</dt><dd class="mono">${r.guiNodes ?? 0}</dd></div>
        <div><dt>written labels</dt><dd class="mono">${(o ? o.textNodes : a.textNodes) ?? 0}</dd></div>
        ${o ? `<div><dt>hidden until opened</dt><dd class="mono">${o.forcedVisible}</dd></div>` : ''}
        ${a.offscreen ? `<div class="warn"><dt>off screen</dt><dd class="mono">${a.offscreen}</dd></div>` : ''}
        ${r.imagePlaceholders ? `<div class="warn"><dt>asset refs not fetched</dt><dd class="mono">${r.imagePlaceholders}</dd></div>` : ''}
        ${s ? `<div><dt>canvas</dt><dd class="mono">${r.viewport?.w ?? '?'} × ${r.viewport?.h ?? '?'} px @ ${s.pixelsPerStud}/stud</dd></div>` : ''}
        <div><dt>references behind it</dt><dd class="mono">${r.sources ?? 0} shipped games</dd></div>
        <div><dt>luau written</dt><dd class="mono">${(r.codeChars ?? 0).toLocaleString()} chars</dd></div>
      </dl>
    </div>
  </article>`;
}

function mapCard(r, mapDir, prefix) {
  const ok = r.outcome === 'built';
  const name = String(r.genre).replace(/_/g, ' ');
  const png = ok && r.files?.svg ? r.files.svg.replace(/\.svg$/, '.png') : null;
  const hasPng = png && existsSync(join(mapDir, png));
  if (!ok || !hasPng) {
    return `<article class="card card--failed">
      <div class="card__stripe" aria-hidden="true"></div>
      <div class="card__body">
        <h3 class="card__title">${esc(name)}</h3>
        <p class="card__verdict">${esc(OUTCOME_WORDS[r.outcome] ?? r.outcome)}</p>
        ${r.detail ? `<p class="card__detail">${esc(String(r.detail).slice(0, 320))}</p>` : ''}
      </div>
    </article>`;
  }
  const b = r.bounds ?? {};
  return `<article class="card">
    <figure class="shot shot--plan">
      <img src="${esc(prefix + png)}" alt="${esc(name)} map plan" loading="lazy" width="3200" height="1800">
      <figcaption class="shot__tag">plan view — looking straight down, rotation not modelled</figcaption>
    </figure>
    <div class="card__body">
      <h3 class="card__title">${esc(name)}</h3>
      <dl class="stats">
        <div><dt>parts placed</dt><dd class="mono">${r.parts ?? 0}</dd></div>
        <div><dt>footprint</dt><dd class="mono">${b.studsWide ?? '?'} × ${b.studsDeep ?? '?'} studs</dd></div>
        <div><dt>height range</dt><dd class="mono">${Math.round(b.minY ?? 0)} to ${Math.round(b.maxY ?? 0)}</dd></div>
        <div><dt>spawns</dt><dd class="mono">${r.spawns ?? 0}</dd></div>
        ${r.unplaceable ? `<div class="warn"><dt>placed by CFrame, not drawable here</dt><dd class="mono">${r.unplaceable}</dd></div>` : ''}
        ${r.unknownColour ? `<div class="warn"><dt>BrickColor, drawn neutral</dt><dd class="mono">${r.unknownColour}</dd></div>` : ''}
        <div><dt>luau written</dt><dd class="mono">${(r.codeChars ?? 0).toLocaleString()} chars</dd></div>
      </dl>
    </div>
  </article>`;
}

function page({ ui, uiDir, maps, mapDir, uiPrefix, mapPrefix }) {
  const uiResults = ui?.results ?? [];
  const mapResults = maps?.results ?? [];
  const uiBuilt = uiResults.filter((r) => r.outcome === 'built').length;
  const mapBuilt = mapResults.filter((r) => r.outcome === 'built').length;
  const totalParts = mapResults.reduce((a, r) => a + (r.parts ?? 0), 0);
  const totalNodes = uiResults.reduce((a, r) => a + (r.guiNodes ?? 0), 0);
  const when = (ui?.generatedAt ?? maps?.generatedAt ?? new Date().toISOString()).slice(0, 10);

  return `<title>What Apple MAX Built</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root {
    --ground: #f6f6f3;
    --panel: #ffffff;
    --panel-2: #eeeeea;
    --line: #dedcd5;
    --ink: #17191a;
    --muted: #5f6669;
    --accent: #0f8a4d;
    --accent-soft: rgba(15,138,77,.10);
    --warn: #a56a12;
    --fail: #b23c30;
    --fail-soft: rgba(178,60,48,.07);
    --shot-ground: #101014;
    --radius: 10px;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #0d0f10;
      --panel: #151819;
      --panel-2: #1c2022;
      --line: #262b2d;
      --ink: #e8eaea;
      --muted: #8d9599;
      --accent: #35d17e;
      --accent-soft: rgba(53,209,126,.12);
      --warn: #e0a33a;
      --fail: #e0685a;
      --fail-soft: rgba(224,104,90,.09);
    }
  }
  :root[data-theme="dark"] {
    --ground: #0d0f10; --panel: #151819; --panel-2: #1c2022; --line: #262b2d;
    --ink: #e8eaea; --muted: #8d9599; --accent: #35d17e; --accent-soft: rgba(53,209,126,.12);
    --warn: #e0a33a; --fail: #e0685a; --fail-soft: rgba(224,104,90,.09);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--ground); color: var(--ink);
    font-family: Archivo, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1180px; margin: 0 auto; padding-inline: 20px; padding-block: 40px 72px; }
  .mono { font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }

  .eyebrow {
    font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
    color: var(--accent); font-weight: 600; margin: 0 0 12px;
  }
  h1 { font-size: clamp(28px, 5vw, 44px); line-height: 1.08; margin: 0 0 14px; text-wrap: balance; font-weight: 700; letter-spacing: -.02em; }
  .lede { font-size: 17px; line-height: 1.55; color: var(--muted); max-width: 62ch; margin: 0 0 28px; }

  .tally { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 30px; }
  .tally span {
    font-size: 13px; padding: 7px 12px; border-radius: 999px;
    background: var(--panel); border: 1px solid var(--line); color: var(--ink);
  }
  .tally b { font-weight: 600; }

  .truth {
    border: 1px solid var(--line); border-left: 3px solid var(--accent);
    background: var(--panel); border-radius: var(--radius);
    padding: 20px 22px; margin-bottom: 44px;
  }
  .truth h2 { font-size: 13px; letter-spacing: .1em; text-transform: uppercase; margin: 0 0 14px; color: var(--muted); font-weight: 600; }
  .truth ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 11px; }
  .truth li { font-size: 14.5px; line-height: 1.5; padding-left: 18px; position: relative; color: var(--ink); }
  .truth li::before { content: ""; position: absolute; left: 0; top: .6em; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
  .truth strong { font-weight: 600; }

  h2.section { font-size: 20px; margin: 0 0 6px; font-weight: 700; letter-spacing: -.01em; }
  .section-note { font-size: 14px; color: var(--muted); margin: 0 0 22px; max-width: 62ch; line-height: 1.5; }

  .grid { display: grid; gap: 22px; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); margin-bottom: 52px; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }

  .card {
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
    overflow: hidden; display: flex; flex-direction: column;
  }
  .card--failed { background: var(--fail-soft); border-color: var(--fail); flex-direction: row; align-items: stretch; }
  .card__stripe { width: 3px; background: var(--fail); flex: 0 0 3px; }
  .shot { margin: 0; background: var(--shot-ground); position: relative; }
  .shot img { display: block; width: 100%; height: auto; max-width: 100%; }
  .shot__tag {
    position: absolute; left: 10px; bottom: 10px;
    font-family: "IBM Plex Mono", monospace; font-size: 10.5px; letter-spacing: .02em;
    background: rgba(8,9,11,.82); color: #cfd4d8; padding: 5px 9px; border-radius: 5px;
  }
  .card__body { padding: 16px 18px 18px; flex: 1; }
  .card__title { margin: 0 0 12px; font-size: 16px; font-weight: 600; text-transform: capitalize; letter-spacing: -.005em; }
  .card__verdict { margin: 0 0 8px; font-size: 14.5px; color: var(--fail); font-weight: 600; }
  .card__detail {
    margin: 0 0 12px; font-size: 12.5px; line-height: 1.5; color: var(--muted);
    font-family: "IBM Plex Mono", monospace; word-break: break-word;
  }

  .stats { margin: 0; display: grid; gap: 0; }
  .stats > div {
    display: flex; justify-content: space-between; align-items: baseline; gap: 14px;
    padding: 6px 0; border-top: 1px solid var(--line);
  }
  .stats > div:first-child { border-top: 0; }
  .stats dt { font-size: 12.5px; color: var(--muted); }
  .stats dd { margin: 0; font-size: 13px; font-weight: 500; }
  .stats .warn dt, .stats .warn dd { color: var(--warn); }

  footer { border-top: 1px solid var(--line); padding-top: 20px; font-size: 13px; color: var(--muted); line-height: 1.6; }
  footer code { font-family: "IBM Plex Mono", monospace; font-size: 12px; background: var(--panel-2); padding: 1px 5px; border-radius: 4px; }
</style>

<div class="wrap">
  <p class="eyebrow">Generated ${esc(when)} · lane ${esc(ui?.lane ?? maps?.lane ?? 'Apple MAX')}</p>
  <h1>Roblox screens and maps, built by the model from its own library</h1>
  <p class="lede">
    Every picture below came out of the deployed product. The model was handed the construction
    library the product ships — what a shop is made of, how a tycoon plot reads — and asked to build
    the thing. What it wrote was then compiled and executed, and these are the shapes that came out.
  </p>

  <div class="tally">
    <span><b>${uiBuilt}</b> of ${uiResults.length} screens built</span>
    <span><b>${mapBuilt}</b> of ${mapResults.length} maps built</span>
    <span><b>${totalNodes.toLocaleString()}</b> interface objects</span>
    <span><b>${totalParts.toLocaleString()}</b> map parts placed</span>
  </div>

  <div class="truth">
    <h2>What these pictures are, exactly</h2>
    <ul>
      <li><strong>The model is the live one.</strong> Every screen is an HTTP call to the deployed
        Worker at <span class="mono">${esc(String(ui?.base ?? maps?.base ?? '').replace('https://', ''))}</span>. No local model, no cached answer.</li>
      <li><strong>The library is the product's own.</strong> The exact payload
        <span class="mono">get_ui_construction</span> and <span class="mono">get_genre_kit</span> return was put in
        the prompt. The model was <em>given</em> its library — on this endpoint it cannot ask for it,
        so nothing here shows that it would have chosen to.</li>
      <li><strong>These are not Studio screenshots.</strong> The model's Luau was executed and its
        instance tree resolved to real rectangles. Fonts, text wrapping and safe-area insets are not
        modelled, so treat this as an accurate plan rather than a photograph.</li>
      <li><strong>No artwork was invented.</strong> Where the model pointed at an image asset, the
        box is hatched and prints the id. Nothing was downloaded and
        <strong>nothing was uploaded to any Roblox account.</strong></li>
      <li><strong>The failures are here too</strong>, at the same size as the successes, with the
        reason each one gives.</li>
    </ul>
  </div>

  <h2 class="section">Interface screens</h2>
  <p class="section-note">
    One screen per type the library covers, all for a tycoon game. A screen that opens from a button
    starts hidden, so it is shown opened and labelled as such.
  </p>
  <div class="grid">${uiResults.map((r) => screenCard(r, uiDir, uiPrefix)).join('\n')}</div>

  <h2 class="section">Maps</h2>
  <p class="section-note">
    Whole playable maps, one per genre, built out of parts with real sizes and positions — no asset,
    no upload. Drawn looking straight down, shaded by height, spawns circled.
  </p>
  <div class="grid">${mapResults.map((r) => mapCard(r, mapDir, mapPrefix)).join('\n')}</div>

  <footer>
    Sources: <code>docs/evidence/ui-showcase/manifest.json</code> and
    <code>docs/evidence/map-showcase/manifest.json</code>. The Luau behind every card sits beside them.
    Rebuild with <code>packages/training/src/generate-ui-showcase.mjs</code> and
    <code>generate-map-showcase.mjs</code>.
  </footer>
</div>
`;
}

function main() {
  const uiDir = resolve(arg('ui', join(REPO, 'docs/evidence/ui-showcase')));
  const mapDir = resolve(arg('maps', join(REPO, 'docs/evidence/map-showcase')));
  const out = resolve(arg('out', join(REPO, 'docs/evidence/showcase.html')));
  const ui = readManifest(uiDir);
  const maps = readManifest(mapDir);
  if (!ui && !maps) {
    console.error('no manifest in either directory — run the generators first');
    process.exit(2);
  }
  const html = page({
    ui,
    uiDir,
    maps,
    mapDir,
    uiPrefix: arg('ui-prefix', 'ui-showcase/'),
    mapPrefix: arg('map-prefix', 'map-showcase/'),
  });
  writeFileSync(out, html);
  console.log(`${out}  (${Math.round(html.length / 1024)} KB)`);
  console.log(`screens ${ui?.counts?.built ?? 0}/${ui?.results?.length ?? 0}, maps ${maps?.counts?.built ?? 0}/${maps?.results?.length ?? 0}`);
}

main();
