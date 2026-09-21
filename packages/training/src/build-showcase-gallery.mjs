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
  // THE MODEL'S, AND NAMED RATHER THAN SHOWN AS AN EMPTY PICTURE. The tree was built and parented,
  // and then nothing had a geometry the engine could use — see the blank-render branch in
  // generate-ui-showcase.mjs for the horror HUD that taught this.
  nothing_reached_the_canvas: 'the screen was built but nothing had a usable position or size',
  no_screengui_in_playergui: 'nothing reached the player’s screen',
  nothing_placeable: 'no part had both a size and a position',
  not_in_library: 'no construction recorded for this id',
  request_failed: 'the request to the model failed',
  threw: 'the pipeline itself threw',
};

/**
 * WHICH LINE OF *HIS* FILE THE COMPILER WAS TALKING ABOUT.
 *
 * `rebaseDiagnostic` in score-ui.mjs already converted the compiler's line number from the
 * concatenated harness+model program into a line of the model's own file, and emits one of two
 * shapes:
 *
 *   "line 207, col 37: SyntaxError: ..."                                  -> in the model's file
 *   "line 825 of the test harness, col 37 — not in the model's file: ..." -> NOT in it
 *
 * Only the first may be pointed at, and the second must return null rather than 825: highlighting
 * line 825 of a 438-line file would invent a location, which is the same class of mistake as the
 * temp path that number replaced. The anchor is required so a line number appearing anywhere else
 * in an error message — "attempt to index nil (line 4 of the stack)" — cannot be mistaken for the
 * compiler's own position.
 */
export function errorLineOf(detail) {
  const m = /^line (\d+), col \d+: /.exec(String(detail ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * THE ONE THING THE PAGE NEVER SHOWED HIM WAS THE THING THE PRODUCT ACTUALLY PRODUCES.
 *
 * Every card above says how many objects the model built and how many labels it wrote. None of
 * them showed the Luau. The footer said "the Luau behind every card sits beside them" — beside
 * `manifest.json`, in a git checkout, on one laptop. He is fifteen, does not use git and has no
 * clone; that sentence pointed him at a file he cannot reach, which is the same defect as the
 * gallery that sat at `docs/evidence/showcase.html` while `GET /showcase` answered 404.
 *
 * The code is what he is buying. It goes on the page.
 *
 * FETCHED, NOT INLINED. The twenty-eight scripts are 265 KB of text against a 36 KB page, and he
 * reads this on a phone. Each `<details>` pulls its own file the first time it is opened, so the
 * page stays the size it was and a card he never opens costs nothing.
 *
 * THE LINK IS NOT THE ENHANCEMENT — it is always there, outside the script, and it is a real
 * `<a href>` to the same URL the fetch uses. With no JavaScript, a blocked fetch, or a 404, he
 * still gets the file, and the failure branch says which of those happened instead of leaving an
 * empty box. An empty box is a failure to observe rendering as an observation.
 *
 * LINKED ONLY WHEN THE FILE IS ON DISK, the same rule `hasPng` keeps, and for the same reason:
 * `infra/deploy-showcase.mjs` ships exactly what the built page references, so a card may not
 * reference something no upload will follow.
 */
function sourceBlock(r, dir, prefix) {
  const file = r.files?.luau;
  if (!file || !existsSync(join(dir, file))) return '';
  const bad = errorLineOf(r.detail);
  const url = prefix + file;
  return `<details class="src"${bad ? ' open' : ''}>
        <summary class="src__summary">the Luau the model wrote${r.codeChars ? ` <span class="mono">${r.codeChars.toLocaleString()} chars</span>` : ''}</summary>
        <pre class="src__code mono" data-src="${esc(url)}"${bad ? ` data-error-line="${bad}"` : ''}>opening this loads the file…</pre>
        <p class="src__direct"><a class="mono" href="${esc(url)}">${esc(file)}</a></p>
      </details>`;
}

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
        ${sourceBlock(r, uiDir, prefix)}
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
        ${/* THE DIFFERENCE BETWEEN "WROTE NO LABELS" AND "WROTE LABELS NOBODY CAN READ". The racing
             HUD's own helper never set Size, so eleven TextLabels were zero-area boxes — invisible
             in the engine too. The card showed empty panels over "written labels 0", which is true
             and is not an explanation. */ ''}
        ${r.unreadableText ? `<div class="warn"><dt>labels written into a box with no size</dt><dd class="mono">${r.unreadableText}</dd></div>` : ''}
        ${s ? `<div><dt>canvas</dt><dd class="mono">${r.viewport?.w ?? '?'} × ${r.viewport?.h ?? '?'} px @ ${s.pixelsPerStud}/stud</dd></div>` : ''}
        <div><dt>references behind it</dt><dd class="mono">${r.sources ?? 0} shipped games</dd></div>
        <div><dt>luau written</dt><dd class="mono">${(r.codeChars ?? 0).toLocaleString()} chars</dd></div>
      </dl>
      ${sourceBlock(r, uiDir, prefix)}
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
        ${sourceBlock(r, mapDir, prefix)}
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
      ${sourceBlock(r, mapDir, prefix)}
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

  //[[ THE CARDS ARE RENDERED BEFORE THE PROSE, SO THE PROSE CAN BE TOLD WHAT THE CARDS SAY.
  //
  //   "The code is here too" is a claim about the grids, and a claim about the grids has to be
  //   read OFF the grids. Typed as a literal it survives every future state in which it stops
  //   being true — a manifest whose rows lost their `files.luau`, a generator run whose scripts
  //   were not kept — and the page would go on promising him code it is not carrying. That is the
  //   same lie by composition the FAILURES section exists to refuse, aimed at a different target.
  //
  //   `sourceBlock` returns '' for any row whose .luau is not on disk, so this is true exactly
  //   when at least one card actually offers a file. ]]
  const primaryHtml = primary.map((r) => screenCard(r, uiDir, uiPrefix)).join('\n');
  const crossHtml = crossGenre.map((r) => screenCard(r, uiDir, uiPrefix, { showGenre: true })).join('\n');
  const mapHtml = mapResults.map((r) => mapCard(r, mapDir, mapPrefix)).join('\n');
  const hasSource = /<details class="src"/.test(primaryHtml + crossHtml + mapHtml);

  //[[ TWO META TAGS, BOTH MEASURED RATHER THAN COPIED IN FROM HABIT.
  //
  //   VIEWPORT. Without it a phone lays the page out at a 980px virtual width and scales the whole
  //   thing down — measured in a 375px browser on 2026-09-21: `document.documentElement
  //   .clientWidth` reported 980. The owner is fifteen and reads this on a phone, so the page he
  //   was actually being shown was the desktop page at 38% and every number on it unreadable. The
  //   `.grid` already has a one-column rule at 900px that nothing could ever trigger.
  //
  //   CHARSET. The worker sends `text/html; charset=utf-8`, so over HTTP this changes nothing. The
  //   committed copy at docs/evidence/showcase.html is opened from disk, where there is no header
  //   and the browser guesses — and the section this page exists for is written in Hebrew.
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>What Apple MAX Built</title>
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
  /* min-width:0 is not tidying. A flex item defaults to min-width:auto, so it refuses to shrink
     below its widest content — and a failed card is a ROW flex container, so the moment the code
     block went in, the body became 854px inside a 474px card and overflow:hidden silently ate the
     right-hand 380px of it: the compiler message truncated mid-word, and the outcome and
     luau-written values clipped away entirely. Measured in a browser before it shipped. */
  .card__body { padding: 16px 18px 18px; flex: 1; min-width: 0; }
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

  /* THE CODE, ON THE CARD THAT CLAIMS IT. See sourceBlock. Collapsed by default so a phone pays
     for nothing it is not reading, and the numbers live in ::before so selecting the block and
     copying it yields the script rather than the script interleaved with a gutter. */
  .home { display: inline-block; margin-bottom: 18px; font-size: 13px; color: var(--muted); text-decoration: none; border-bottom: 1px solid var(--line); padding-bottom: 2px; }
  .home:hover { color: var(--accent); border-color: var(--accent); }

  .src { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px; }
  .src__summary { cursor: pointer; font-size: 12.5px; color: var(--muted); list-style: none; display: flex; gap: 8px; align-items: baseline; }
  .src__summary::-webkit-details-marker { display: none; }
  .src__summary::before { content: "▸"; color: var(--accent); font-size: 10px; }
  .src[open] .src__summary::before { content: "▾"; }
  .src__summary:hover { color: var(--ink); }
  .src__summary .mono { font-size: 11.5px; color: var(--muted); }
  /* position:relative is load-bearing, not decoration: it makes this element the offsetParent of
     its lines, so offsetTop in the script below is measured from the top of the scrolling box.
     Static positioning measured it from the card instead, and the block scrolled to its own end
     rather than to the line the compiler named. Watched: without it, scrollTop landed at 7462 on
     a 439-line file whose marked line is 207. */
  .src__code {
    position: relative;
    margin: 10px 0 0; max-height: 380px; overflow: auto;
    background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px;
    padding: 10px 12px; font-size: 11.5px; line-height: 1.55; color: var(--ink);
    white-space: pre; tab-size: 2; counter-reset: none;
  }
  .src__code--failed { color: var(--fail); white-space: normal; }
  .src__line { display: block; padding-left: 46px; text-indent: -46px; }
  .src__line::before {
    content: attr(data-n); display: inline-block; width: 38px; margin-right: 8px;
    text-align: right; color: var(--muted); opacity: .65; user-select: none; text-indent: 0;
  }
  /* The line the compiler named, marked where he can see it — the number on the failure card is
     useless if the file it counts into is not on the page. */
  .src__line--bad { background: var(--fail-soft); box-shadow: inset 2px 0 0 var(--fail); }
  .src__line--bad::before { color: var(--fail); opacity: 1; }
  .src__direct { margin: 8px 0 0; font-size: 11.5px; }
  .src__direct a { color: var(--muted); }
  .src__direct a:hover { color: var(--accent); }
</style>

<div class="wrap">
  <!-- Every route INTO this page is a link; there was not one out of it. A reader who arrives from
       the nav and wants to go back has the browser's back button and nothing on the page. -->
  <a class="home" href="/">← back to the site</a>
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
      ${hasSource ? `<li><strong>The code is here too.</strong> Every card opens the actual Luau the model wrote,
        numbered by line. Where a script did not compile, the line the compiler named is marked in
        it.</li>` : ''}
    </ul>
  </div>

  <h2 class="section">Interface screens</h2>
  <p class="section-note">
    One screen per type the library covers, all for a ${esc(primaryName)} game. A screen that opens
    from a button starts hidden, so it is shown opened and labelled as such.
  </p>
  <div class="grid">${primaryHtml}</div>
${crossGenre.length ? `
  <h2 class="section">The same screen, other genres</h2>
  <p class="section-note">
    The grid above is one game. This is the ${esc(crossType)} asked for in
    ${crossGenreCount} other ${crossGenreCount === 1 ? 'genre' : 'genres'}, same model, same
    tools, only <span class="mono">get_genre_kit</span> changed — so what differs between these
    cards is what the library knows about the genre and nothing else. ${crossBuilt} of
    ${crossGenre.length} came back building. The ones that did not are here at the same size.
  </p>
  <div class="grid">${crossHtml}</div>` : ''}

  <h2 class="section">Maps</h2>
  <p class="section-note">
    Whole playable maps, one per genre, built out of parts with real sizes and positions — no asset,
    no upload. Drawn looking straight down, shaded by height, spawns circled.
  </p>
  <div class="grid">${mapHtml}</div>

  ${librarySection(library, ui)}

  <footer>
    Sources: <code>docs/evidence/ui-showcase/manifest.json</code> and
    <code>docs/evidence/map-showcase/manifest.json</code>. The Luau behind every card is on the card,
    under “the Luau the model wrote”.
    Rebuild with <code>packages/training/src/generate-ui-showcase.mjs</code> and
    <code>generate-map-showcase.mjs</code>.
  </footer>
</div>
<script>
  // PROGRESSIVE, NOT LOAD-BEARING. Each card already carries a plain <a> to the same URL, so a
  // reader with no JavaScript, a blocked fetch or a 404 still reaches the file. This only saves
  // him the trip.
  //
  // THE CATCH BRANCH PRINTS WHAT WENT WRONG. A fetch that fails must not leave the reader looking
  // at an empty box: an empty box reads as "the model wrote nothing", which would be this page
  // libelling its own model — the same mistake as the racing HUD drawn as blank bars.
  for (const d of document.querySelectorAll('details.src')) {
    const pre = d.querySelector('.src__code');
    if (!pre) continue;
    let loading = false;
    const load = async () => {
      if (loading || pre.dataset.loaded === '1') return;
      loading = true;
      try {
        const res = await fetch(pre.dataset.src);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        const bad = Number(pre.dataset.errorLine || 0);
        pre.textContent = '';
        const lines = text.replace(/\\n$/, '').split('\\n');
        for (let i = 0; i < lines.length; i++) {
          const el = document.createElement('span');
          el.className = 'src__line' + (i + 1 === bad ? ' src__line--bad' : '');
          el.setAttribute('data-n', String(i + 1));
          el.textContent = lines[i] + '\\n';
          pre.appendChild(el);
        }
        pre.dataset.loaded = '1';
        // Scroll the BLOCK, never the page: a card that yanked the viewport on load would move the
        // page out from under whoever is reading something else.
        const hit = pre.querySelector('.src__line--bad');
        if (hit) pre.scrollTop = Math.max(0, hit.offsetTop - pre.clientHeight / 2);
      } catch (e) {
        pre.textContent = 'could not load the code — ' + (e && e.message ? e.message : e)
          + '. The file itself is linked below.';
        pre.classList.add('src__code--failed');
      } finally {
        loading = false;
      }
    };
    d.addEventListener('toggle', () => { if (d.open) load(); });
    if (d.open) load();
  }
</script>
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
