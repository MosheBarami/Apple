import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { rowOf } from '../tools/list-oga.mjs';
import { wanted } from '../tools/fetch-oga.mjs';
import { packSounds } from '../src/ingest-oga-audio.mjs';

const page = `<title>Door open, door close | OpenGameArt.org</title>
<div class="field field-name-author-submitter field-type-ds field-label-above"><div class="field-label">Author:&nbsp;</div><div class="field-items"><div class="field-item even"><span class='username'><a href="/users/x">qubodup</a></span></div></div></div><div class="field field-name-post-date field-type-ds field-label-hidden"><div class="field-items"><div class="field-item even">Monday, March 8, 2010 - 04:05</div></div></div>
<div class="field field-name-field-art-tags"><div class="field-items"><a href="/t/door">door</a></div></div></div>
<div class="field field-name-field-art-licenses field-type-taxonomy-term-reference field-label-above"><div class="field-items"><div class="field-item even"><div class='license-icon'><a href='x'><div class='license-name'>GPL 2.0</div></a></div><div class='license-icon'><a href='y'><div class='license-name'>CC-BY 3.0</div></a></div></div></div></div><div class="field field-name-collect">Collections: <a>Doors</a></div></div></div>
<div class="field field-name-field-art-files"><a href="https://opengameart.org/sites/default/files/door.flac">door.flac</a></div></div></div>`;

test('a submission page becomes a ledger row: author, date, the allowed licence first, its files', () => {
  const r = rowOf(page, 'https://opengameart.org/content/door', 'audio-other', 11, '2026-10-08');
  assert.equal(r.pack, 'Door open, door close');
  assert.equal(r.human_made_evidence.startsWith('Posted 2010-03-08 by qubodup; not in'), true);
  assert.equal(r.licence_words, 'License(s): CC-BY 3.0 | GPL 2.0');
  assert.equal(r.licence_url, 'https://creativecommons.org/licenses/by/3.0/');
  assert.deepEqual(r.files, ['https://opengameart.org/sites/default/files/door.flac']);
  assert.equal(r.ai_assisted, false);
  assert.equal(wanted(r, true), true);
  assert.equal(wanted(r, false), false); // a model run does not take a sound pack
  assert.equal(wanted({ ...r, ai_assisted: true }, true), false); // OGA's AI-assisted collection is never fetched
});

test('a pack keeps one file per sound, the ogg over the wav, and leaves out macOS copies', () => {
  const d = mkdtempSync(join(tmpdir(), 'oga-audio-'));
  mkdirSync(join(d, 'x', 'sfx'), { recursive: true });
  mkdirSync(join(d, 'x', '__MACOSX'), { recursive: true });
  for (const f of ['x/sfx/hit.wav', 'x/sfx/hit.ogg', 'x/sfx/miss.wav', 'x/__MACOSX/hit.ogg', 'readme.txt']) writeFileSync(join(d, f), '');
  assert.deepEqual(packSounds(d).map((f) => basename(f)), ['hit.ogg', 'miss.wav']);
});
