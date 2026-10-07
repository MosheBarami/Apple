import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { authorOf, firstLicence, noticeOf, packModels } from '../src/ingest-files.mjs';
import { wanted, fileLinks } from '../tools/fetch-oga.mjs';

test('the OGA licence line gives the first licence and the notice', () => {
  const line = 'License(s): CC-BY 4.0 | CC0 | Copyright/Attribution Notice: Credit "Ann" please';
  assert.equal(firstLicence(line), 'CC-BY 4.0');
  assert.equal(noticeOf(line), 'Credit "Ann" please');
  assert.equal(noticeOf('License(s): CC0'), undefined);
});

test('the evidence gives the post date and the author', () => {
  assert.deepEqual(authorOf('Posted 2021-06-18 by quaternius; OGA page carries no AI disclosure'), ['2021-06-18', 'quaternius']);
  assert.deepEqual(authorOf('no post line'), []);
});

test('one model per name, the best format first, texture and macOS folders skipped', () => {
  const d = mkdtempSync(join(tmpdir(), 'oga-'));
  for (const f of ['x/Tree.obj', 'x/Tree.fbx', 'x/Rock.dae', 'x/Rock.glb', 'x/textures/Leaf.obj', 'x/__MACOSX/Tree.glb', 'x/notes.txt']) {
    mkdirSync(join(d, f, '..'), { recursive: true }); writeFileSync(join(d, f), 'x');
  }
  assert.deepEqual(packModels(d).map((p) => basename(p)), ['Rock.glb', 'Tree.fbx']);
});

test('the fetcher skips refused licences, Kenney uploads and packs with no model format', () => {
  const row = { licence_words: 'License(s): CC0', human_made_evidence: 'Posted 2020-01-01 by Ann', formats: ['FBX'] };
  assert.equal(wanted(row), true);
  assert.equal(wanted({ ...row, licence_words: 'License(s): CC-BY-NC 3.0' }), false);
  assert.equal(wanted({ ...row, human_made_evidence: 'Posted 2018-04-12 by Kenney; x' }), false);
  assert.equal(wanted({ ...row, formats: ['BLEND'] }), true);
  assert.equal(wanted({ ...row, formats: ['PNG'] }), false);
});

test('the fetcher keeps only model and archive links from a page', () => {
  const html = '<a href="https://opengameart.org/sites/default/files/pack.zip">z</a> <img src="https://opengameart.org/sites/default/files/styles/thumb/a.png"> <a href="https://opengameart.org/sites/default/files/tree%20a.fbx">f</a>';
  assert.deepEqual(fileLinks(html), ['https://opengameart.org/sites/default/files/pack.zip', 'https://opengameart.org/sites/default/files/tree%20a.fbx']);
});

test('a pack whose MTLs hold only default grey and no texture is converted from its .blend', async () => {
  const { greyExports } = await import('../tools/blend-to-glb.mjs');
  assert.equal(greyExports(['newmtl A\nKd 0.640000 0.640000 0.640000\n', 'newmtl B\nKd 0.800000 0.800000 0.800000\n']), true);
  assert.equal(greyExports(['newmtl A\nKd 0.053442 0.029807 0.017608\n']), false);
  assert.equal(greyExports(['newmtl A\nKd 0.640000 0.640000 0.640000\nmap_Kd tex.png\n']), false);
  assert.equal(greyExports([]), false);
});

test('a converted GLB wins over the FBX of the same name only when its conversion succeeded', () => {
  const d = mkdtempSync(join(tmpdir(), 'oga-'));
  for (const f of ['x/FBX/Chair.fbx', 'x/FBX/Lamp.fbx', 'blend-glb/Chair.glb', 'blend-glb/Lamp.glb']) { mkdirSync(join(d, f, '..'), { recursive: true }); writeFileSync(join(d, f), 'x'); }
  writeFileSync(join(d, 'blend-glb/manifest.json'), JSON.stringify({ 'Chair.glb': { ok: true, from: 'x/Chair.blend' }, 'Lamp.glb': { ok: false } }));
  assert.deepEqual(packModels(d).map((p) => p.slice(d.length + 1)), ['blend-glb/Chair.glb', 'x/FBX/Lamp.fbx']);
});
