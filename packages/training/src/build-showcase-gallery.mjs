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
 *
 * `--corpus <file>` overrides the ui-construction.json the library section is counted from. It
 * exists for showcase-gallery.test.mjs: on the real corpus a DERIVED count and a TYPED one render
 * the same bytes, so without a second corpus no test can tell the difference — which is exactly
 * what a mutation replacing `${lib.screens}` with a literal `16` demonstrated by staying green.
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

/**
 * THE LIBRARY, COUNTED RATHER THAN DESCRIBED.
 *
 * The owner asked for "every kind of Roblox UI that exists today", extracted into the model's own
 * library, "so the model almost never authors a UI from scratch". Half of that shipped and half of
 * it cannot, and the section built from this function is where he is told which half is which —
 * see `librarySection`. Every number there is read out of the corpus file the Worker serves, so
 * the page cannot drift from the library the way the asset refusal string drifted from the
 * catalogue for ten months.
 *
 * Returns null when the corpus is not on disk: the gallery still builds, and simply does not make
 * a claim it cannot support.
 */
function readLibrary(path = join(REPO, 'packages/corpus/data/ui-construction.json')) {
  try {
    const d = JSON.parse(readFileSync(path, 'utf8'));
    const all = [...(d.genres ?? []), ...(d.screens ?? [])];
    return {
      screens: (d.screens ?? []).length,
      genres: (d.genres ?? []).length,
      sources: new Set(all.flatMap((e) => e.sources ?? [])).size,
      note: String(d.note ?? ''),
    };
  } catch {
    return null;
  }
}

/** Plain words for an outcome, because the owner does not read enum names. */
const OUTCOME_WORDS = {
  built: 'built',
  no_code_block: 'answered in prose instead of code',
  // OURS, NOT THE MODEL'S — the answer stopped inside an open code block because the run's own
  // token ceiling cut it off. Worded so a reader cannot mistake it for the model refusing.
  truncated_code_block: 'we cut the answer off mid-code — our token limit, not the model',
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

function screenCard(r, uiDir, prefix, { showGenre = false } = {}) {
  const ok = r.outcome === 'built';
  //[[ THE GENRE BELONGS IN THE TITLE THE MOMENT TWO GENRES ARE ON THE PAGE.
  //
  //   The card was titled by screen type alone, which was unambiguous while every row was a
  //   tycoon. It stops being unambiguous the second a cross-genre row lands: two cards both
  //   titled "hud", showing different interfaces, with nothing on either saying why they differ
  //   — a reader would take that for the model giving two answers to one question, when it is
  //   the model answering two different questions. The genre is the question. ]]
  const type = String(r.id ?? r.target).replace(/^screen-/, '').replace(/[-_]/g, ' ');
  const name = showGenre ? `${type} — ${String(r.genre ?? '').replace(/_/g, ' ')}` : type;
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

/**
 * THE HALF THAT SHIPPED AND THE HALF THAT CANNOT — told to him, not filed in docs/.
 *
 * LEDGER ROW `extract-every-roblox-ui-genre`. What he asked for, verbatim:
 *
 *   "אני דורש עליך לשלוף ui לכל סוג אפשרי שעולה היום ברובלוקס מהאנטנט כל סוג אפשרי מסוגו ואתה מכל
 *    אחד תחלץ כל מה שצריך לנכס מוכן ועובד לידע וספרייה הפנימית של המודל"
 *
 * — pull every kind of Roblox UI there is, and extract from each one everything needed for a
 * READY, WORKING ASSET in the model's own library. The first half is built and the pictures above
 * it are the proof. The second half — a store of ready-made assets the model drops in — is not,
 * and the reason is not effort.
 *
 * WHY IT CANNOT BE, measured and recorded in apps/worker/src/assets.ts where `library` was deleted
 * from ASSET_SOURCES on 2026-09-20: that catalogue held 511,208 provenance rows, and on the day it
 * was measured 0 of them were insertable. Every route from a file to a usable Roblox asset ends in
 * an upload into a real Roblox account; Roblox will not archive an Image or a Decal, so each upload
 * is permanent in HIS account, and the catalogue also carried rows named after other companies'
 * characters under one blanket licence claim. He removed it himself.
 *
 * THIS IS A STATEMENT, NOT A QUESTION. He has granted blanket autonomous authority and asked not to
 * be made to choose. So the page says which half exists, what it does instead, and what it would
 * take to change — and does not ask him to pick.
 *
 * IN BOTH LANGUAGES. He writes Hebrew and he is fifteen; this is the one section of the page whose
 * whole purpose is that he understands it. The Hebrew block carries its own `dir` and `lang` — see
 * apps/web/tests/bidi-content.test.mjs for why an RTL paragraph that inherits the document's
 * direction renders its punctuation in the wrong place.
 */
function librarySection(lib, ui) {
  if (!lib) return '';
  const built = ui?.counts?.built ?? 0;
  const targets = ui?.results?.length ?? 0;
  return `
  <h2 class="section">What the library actually is</h2>
  <div class="truth truth--library">
    <ul>
      <li><strong>It is real, and the model can ask for it.</strong> ${lib.screens} kinds of screen
        and ${lib.genres} genres, distilled from ${lib.sources.toLocaleString()} cited sources, served by two
        tools the model calls by name: <span class="mono">get_ui_construction</span> and
        <span class="mono">get_genre_kit</span>. ${built} of ${targets} screens above were built out of it.</li>
      <li><strong>It holds no files.</strong> No images, no meshes, no asset ids — the corpus says so
        itself: “${esc(lib.note)}” It holds how a screen is <em>put together</em>, and the model
        writes the Luau. That is what every picture on this page is.</li>
      <li><strong>There is no store of ready-made assets, and there will not be one.</strong> The
        catalogue that tried held 511,208 rows and <strong>0 of them could be inserted</strong> on
        the day it was measured. Every way of turning a file into a usable Roblox asset ends in an
        upload to a real account, Roblox will not archive an Image or a Decal, so every one of them
        would be permanent in <em>your</em> account — and some of those rows were other companies’
        characters under a single licence claim. You deleted it on 20 September. It stays deleted.</li>
      <li><strong>What that costs you:</strong> nothing on this page. A screen built from
        construction notes is a screen that compiles, runs and belongs to you. What it cannot do is
        hand you someone else’s finished artwork.</li>
    </ul>
    <div class="he" dir="rtl" lang="he">
      <p><strong>בעברית, בלי לייפות.</strong></p>
      <ul>
        <li><strong>הספרייה קיימת והמודל באמת קורא לה.</strong> ${lib.screens} סוגי מסך ו-${lib.genres} ז׳אנרים,
          מתוך ${lib.sources.toLocaleString()} מקורות מצוטטים. ${built} מתוך ${targets} המסכים כאן נבנו ממנה.</li>
        <li><strong>אין בה קבצים.</strong> לא תמונות, לא מודלים, לא מזהי אססט — רק איך מסך בנוי,
          והמודל כותב את הקוד בעצמו. זה מה שרואים בכל התמונות בעמוד הזה.</li>
        <li><strong>מחסן של אססטים מוכנים לא קיים, ולא יהיה.</strong> הקטלוג שניסה הכיל 511,208 שורות,
          ו-0 מהן היו ניתנות להכנסה ביום שבו נמדד. כל דרך להפוך קובץ לאססט עובד ברובלוקס מסתיימת
          בהעלאה לחשבון אמיתי, רובלוקס לא מוחקת תמונה או דיקאל, וכל העלאה כזאת נשארת לצמיתות
          <em>בחשבון שלך</em>. חלק מהשורות היו דמויות של חברות אחרות תחת טענת רישיון אחת גורפת.
          מחקת את זה ב-20 בספטמבר, וזה נשאר מחוק.</li>
        <li><strong>מה זה עולה לך:</strong> כלום ממה שכאן. מסך שנבנה מהספרייה מתקמפל, רץ, ושייך לך.
          מה שהוא לא יכול — לתת לך גרפיקה מוכנה של מישהו אחר.</li>
      </ul>
    </div>
  </div>
`;
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

function page({ ui, uiDir, maps, mapDir, uiPrefix, mapPrefix, library }) {
  const uiResults = ui?.results ?? [];
  //[[ TWO GRIDS, BECAUSE THEY ANSWER TWO DIFFERENT QUESTIONS.
  //
  //   The first grid is "every kind of screen, one game": the type axis, held at one genre so the
  //   types are what varies. The second is "one kind of screen, every genre": the genre axis, held
  //   at one type so the genre is what varies. Pouring both into a single grid makes neither
  //   readable — it becomes seventeen cards of which one is inexplicably different.
  //
  //   THE SPLIT IS READ OFF THE ROWS, NOT TYPED AND NOT TAKEN FROM `ui.genre`.
  //
  //   The section note used to say "all for a tycoon game" as a literal, which was true the day it
  //   was written and is exactly the shape of sentence this repository has been bitten by twice —
  //   the asset refusal that named a catalogue deleted in September, and Nav.astro's comment about
  //   sections that had come back.
  //
  //   `ui.genre` IS NOT THE ANSWER EITHER, and this was measured rather than reasoned: it records
  //   what the LAST RUN was asked for, so after generating one screen in anime_battle the manifest
  //   said `genre: "anime_battle"` and the split put ONE card in the one-game grid and the other
  //   twenty-one — every tycoon screen on the page — into the cross-genre band. The page inverted
  //   itself and the sentence above it stayed grammatical.
  //
  //   The genre the first grid is held at is a property of the rows: it is whichever genre covers
  //   the most of them. That cannot be desynchronised by a later one-screen run, and ties break
  //   alphabetically so the page is the same page twice.
  const genreCounts = new Map();
  for (const r of uiResults) if (r.genre) genreCounts.set(r.genre, (genreCounts.get(r.genre) ?? 0) + 1);
  const primaryGenre = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0]
    ?? ui?.genre ?? null;
  const primary = uiResults.filter((r) => (r.genre ?? primaryGenre) === primaryGenre);
  const crossGenre = uiResults.filter((r) => (r.genre ?? primaryGenre) !== primaryGenre);
  const crossBuilt = crossGenre.filter((r) => r.outcome === 'built').length;
  const primaryName = String(primaryGenre ?? 'single').replace(/_/g, ' ');
  // The type the cross-genre band is showing, named from the rows rather than assumed. If a future
  // run crosses more than one type, this says so instead of naming one of them and hiding the rest.
  const crossTypes = [...new Set(crossGenre.map((r) => String(r.id ?? r.target).replace(/^screen-/, '').replace(/[-_]/g, ' ')))];
  const crossType = crossTypes.length === 1 ? `same ${crossTypes[0]} screen` : `same ${crossTypes.length} screens`;
  // GENRES, NOT ROWS. The band is "one screen in N genres"; counting rows would say "five genres"
  // for five rows that happened to be two screens in three genres, which is a different claim.
  const crossGenreCount = new Set(crossGenre.map((r) => r.genre)).size;
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
  /* The library section carries the same panel, and a Hebrew half beneath it. The direction is set
     on the element, never inherited: an RTL list inside an LTR document puts its bullets and its
     full stops on the wrong side — see apps/web/tests/bidi-content.test.mjs. */
  .truth--library { margin-top: 30px; }
  .truth .he { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--line); }
  .truth .he p { margin: 0 0 11px; font-size: 14.5px; color: var(--ink); }
  .truth .he li { padding-left: 0; padding-right: 18px; }
  .truth .he li::before { left: auto; right: 0; }

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
    One screen per type the library covers, all for a ${esc(primaryName)} game. A screen that opens
    from a button starts hidden, so it is shown opened and labelled as such.
  </p>
  <div class="grid">${primary.map((r) => screenCard(r, uiDir, uiPrefix)).join('\n')}</div>
${crossGenre.length ? `
  <h2 class="section">The same screen, other genres</h2>
  <p class="section-note">
    The grid above is one game. This is the ${esc(crossType)} asked for in
    ${crossGenreCount} other ${crossGenreCount === 1 ? 'genre' : 'genres'}, same model, same
    tools, only <span class="mono">get_genre_kit</span> changed — so what differs between these
    cards is what the library knows about the genre and nothing else. ${crossBuilt} of
    ${crossGenre.length} came back building. The ones that did not are here at the same size.
  </p>
  <div class="grid">${crossGenre.map((r) => screenCard(r, uiDir, uiPrefix, { showGenre: true })).join('\n')}</div>` : ''}

  <h2 class="section">Maps</h2>
  <p class="section-note">
    Whole playable maps, one per genre, built out of parts with real sizes and positions — no asset,
    no upload. Drawn looking straight down, shaded by height, spawns circled.
  </p>
  <div class="grid">${mapResults.map((r) => mapCard(r, mapDir, mapPrefix)).join('\n')}</div>

  ${librarySection(library, ui)}

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
    library: readLibrary(arg('corpus', undefined)),
  });
  writeFileSync(out, html);
  console.log(`${out}  (${Math.round(html.length / 1024)} KB)`);
  console.log(`screens ${ui?.counts?.built ?? 0}/${ui?.results?.length ?? 0}, maps ${maps?.counts?.built ?? 0}/${maps?.results?.length ?? 0}`);
}

main();
