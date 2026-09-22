/**
 * THE SITE IS SILENT, AND NOTHING ON IT OFFERS TO MAKE A SOUND.
 *
 * RESTATED 2026-09-22, WHEN THE INTERFACE SOUND WAS REMOVED.
 *
 * This file used to run src/sound/interface-sound.js in a vm against a recording AudioContext and
 * prove five properties of a synthesised keyswitch click: silent before its toggle, audible after,
 * fired by ordinary buttons, never an audio download, never an AudioContext at load. The owner's
 * final direction for the public site is calm and minimal, and names the floating SOUND dock as
 * decoration to remove. With the dock gone, the only thing left offering sound was a toggle in the
 * header, which is a control nobody needs on a marketing page — so the engine, the dock and the
 * toggle all went, and the page is silent.
 *
 * Two of the old properties outlive the feature and are kept, word for word in spirit, because
 * they are the ones a regression would break quietly:
 *   4. no audio asset is fetched anywhere in apps/site
 *   5. no AudioContext is ever constructed — now at load OR on a press, because nothing may make one
 * and the rest is restated as the new property: no layout mounts a sound engine, no page renders a
 * sound control, and the built pages carry neither.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Comments off before scanning, so an explanation of the removal is not reported as the thing. */
const decomment = (body) =>
  body
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.astro') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const FILES = [...walk(join(SITE, 'src')), ...walk(join(SITE, 'public'))];
const TEXT = FILES.filter((f) => /\.(?:astro|css|ts|tsx|js|mjs|json|html)$/.test(f))
  .map((f) => [f.slice(SITE.length), decomment(readFileSync(f, 'utf8'))]);

test('the walk read the site, so nothing below is vacuous', () => {
  assert.ok(FILES.length > 20, `the walk found ${FILES.length} files — this check would be vacuous`);
  assert.ok(TEXT.some(([f]) => f.endsWith('Base.astro')) && TEXT.some(([f]) => f.endsWith('Landing.astro')),
    'the two layouts were not among the files read');
});

test('no layout mounts a sound engine and no page renders a sound control', () => {
  for (const gone of ['src/sound/interface-sound.js', 'src/layouts/InterfaceSound.astro', 'src/layouts/SoundDock.astro']) {
    assert.ok(!existsSync(join(SITE, gone)), `${gone} is back — the interface sound was removed on purpose`);
  }
  const offenders = TEXT.filter(([, body]) =>
    /import\s+(?:InterfaceSound|SoundDock)\b|<(?:InterfaceSound|SoundDock)\b|data-sound-toggle|interface-sound\.js/.test(body))
    .map(([f]) => f);
  assert.deepEqual(offenders, [], `these still wire the interface sound: ${offenders.join(', ')}`);
});

test('4 — NO AUDIO ASSET IS FETCHED ANYWHERE IN apps/site', () => {
  const AUDIO = /\.(?:mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)\b/i;
  const assets = FILES.filter((f) => AUDIO.test(f));
  assert.deepEqual(assets.map((f) => f.slice(SITE.length)), [],
    'an audio file is checked into apps/site. The site is silent; a sample is bytes and a failure mode.');

  const offenders = [];
  for (const [file, body] of TEXT) {
    if (AUDIO.test(body)) offenders.push(`${file}  (audio file reference)`);
    if (/<audio\b/i.test(body)) offenders.push(`${file}  (<audio> element)`);
    if (/new\s+Audio\s*\(/.test(body)) offenders.push(`${file}  (new Audio())`);
    if (/decodeAudioData\s*\(/.test(body)) offenders.push(`${file}  (decodeAudioData)`);
  }
  assert.deepEqual(offenders, [], `the site references audio it would have to download:\n  ${offenders.join('\n  ')}`);
});

test('5 — NO AUDIOCONTEXT IS EVER CONSTRUCTED, in the source or in what was built', () => {
  const inSource = TEXT.filter(([, body]) => /\b(?:webkit)?AudioContext\b/.test(body)).map(([f]) => f);
  assert.deepEqual(inSource, [], `these construct or reference an AudioContext: ${inSource.join(', ')}`);

  const dist = join(SITE, 'dist');
  assert.ok(existsSync(join(dist, 'index.html')), 'apps/site/dist is missing — run `npx astro build` first');
  const built = walk(dist).filter((f) => /\.(?:html|js)$/.test(f));
  assert.ok(built.length >= 10, `only ${built.length} built files — the build walk has drifted`);
  const shipped = built.filter((f) => /\bAudioContext\b|data-sound-toggle/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(dist.length));
  assert.deepEqual(shipped, [], `the build still ships sound machinery in: ${shipped.join(', ')}`);
});

test('the guard has teeth: it fires on the markup and engine that shipped', () => {
  const shippedDock = '<button class="sound-dock" type="button" data-sound-toggle aria-pressed="false">Sound</button>';
  const shippedEngine = 'var ctx = new (window.AudioContext || window.webkitAudioContext)();';
  assert.match(decomment(shippedDock), /data-sound-toggle/);
  assert.match(decomment(shippedEngine), /\b(?:webkit)?AudioContext\b/);
  assert.doesNotMatch(decomment('/* the AudioContext that used to live here is gone */'), /AudioContext/,
    'the scanner reads comments, so it would report this file\'s own explanation as the defect');
});
