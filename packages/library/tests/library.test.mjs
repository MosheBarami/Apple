// The library's gatekeepers: licences (L2), the human-made check (L1), provenance (L3) and the search card (§3.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLicence } from '../src/licence.mjs';
import { aiCheck } from '../src/aicheck.mjs';
import { validateItem, reachesModel } from '../src/item.mjs';
import { toCard, cardLine } from '../src/card.mjs';

test('allowed licences map to their class', () => {
  for (const [w, c] of [['CC0 1.0 Universal', 'cc0'], ['Public Domain', 'cc0'], ['CC BY 4.0', 'cc-by-4.0'], ['CC-BY 3.0', 'cc-by-3.0'], ['MIT License', 'mit'], ['Apache License 2.0', 'apache-2.0'], ['SIL Open Font License', 'ofl-1.1'], ['Roblox Creator Store (Open Use)', 'roblox-creator-store']]) {
    assert.deepEqual([classifyLicence(w).ok, classifyLicence(w).class], [true, c], w);
  }
});

test('THE CONTROL: banned and unknown licences are refused, banned words first', () => {
  for (const w of ['CC BY-NC 4.0', 'CC BY-ND 4.0', 'Free for personal use', 'No redistribution', 'Mixamo', 'CC BY-SA 4.0', 'GPL-3.0', '', 'Free to use!']) {
    assert.equal(classifyLicence(w).ok, false, w);
  }
  assert.match(classifyLicence('CC0 but non-commercial').reason, /banned/);
});

test('the human-made check refuses AI words and unknown creators from 2024 on', () => {
  const known = new Set(['kenney']);
  assert.equal(aiCheck({ title: 'Oak tree', created: '2019-03-01', creator: 'someone' }, known).pass, true);
  assert.equal(aiCheck({ title: 'Oak tree', created: '2025-03-01', creator: 'Kenney' }, known).pass, true);
  assert.equal(aiCheck({ title: 'Oak tree', created: '2025-03-01', creator: 'someone' }, known).pass, false);
  assert.equal(aiCheck({ title: 'Meshy oak tree', created: '2019-03-01', creator: 'kenney' }, known).pass, false);
  assert.equal(aiCheck({ title: 'Tree', tags: ['AI generated'], created: '2019-01-01' }, known).pass, false);
  assert.equal(aiCheck({ title: 'Tree' }, known).pass, false, 'no date, no pass');
  assert.equal(aiCheck({ title: 'Cube Pets: cat', created: '2019-01-01' }, known).pass, true, 'Kenney Cube Pets is not Roblox Cube');
  assert.equal(aiCheck({ title: 'Sword made with Roblox Cube', created: '2019-01-01' }, known).pass, false);
});

const good = () => ({
  id: 'kenney:nature-kit:tree_oak', title: 'Oak tree', kind: 'prop', source_url: 'https://kenney.nl/assets/nature-kit',
  author: 'Kenney', licence_words: 'CC0 1.0 Universal', licence_class: 'cc0', licence_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  fetched_at: '2026-10-07T00:00:00Z', uploader: 'studpilot_group', file_sha256: 'ab'.repeat(32),
  ai_check: { pass: true, reasons: [], checked_at: '2026-10-07T00:00:00Z' }, grade: 'A',
});

test('a complete item passes; missing provenance, a mismatched class or a failed ai_check do not', () => {
  assert.deepEqual(validateItem(good()), []);
  assert.ok(validateItem({ ...good(), title: 'Meshy sword' }).some((e) => /Meshy/.test(e)), 'a stale ai_check cannot pass an AI title');
  const a = good(); delete a.licence_url; delete a.file_sha256;
  assert.ok(validateItem(a).some((e) => /licence_url/.test(e)));
  assert.ok(validateItem(a).some((e) => /file_sha256/.test(e)));
  const b = good(); b.licence_class = 'mit';
  assert.ok(validateItem(b).some((e) => /does not match/.test(e)));
  const c = good(); c.ai_check = { pass: false, reasons: ['x'] };
  assert.ok(validateItem(c).some((e) => /ai_check failed/.test(e)));
  const d = good(); d.licence_words = 'CC BY 4.0'; d.licence_class = 'cc-by-4.0';
  assert.ok(validateItem(d).some((e) => /attribution/.test(e)), 'CC BY needs attribution text');
});

test('only A and B reach the model; the card is text with the fields §3.3 names', () => {
  assert.equal(reachesModel({ grade: 'C' }), false);
  const card = toCard({ ...good(), family: 'kenney-nature', themes: ['forest'], size_studs: [6.04, 12, 6], triangles: 420, description: 'A round oak. Low poly.' });
  assert.deepEqual(Object.keys(card), ['id', 'title', 'kind', 'family', 'theme', 'size_studs', 'triangles', 'colours', 'grade', 'licence', 'line']);
  assert.match(cardLine(card), /kenney:nature-kit:tree_oak \| Oak tree \| prop \| family kenney-nature \| grade A \| 6x12x6 studs \| forest \| A round oak\./);
});

test('the standard Apache header and a padded MIT notice classify (code-luau ingestion, 2026-10-07)', () => {
  assert.equal(classifyLicence('Apache License Version 2.0, January 2004 http://www.apache.org/licenses/').class, 'apache-2.0');
  assert.equal(classifyLicence('Apache License, Version 2.0').class, 'apache-2.0');
  assert.equal(classifyLicence('MIT License: Copyright (c) 2020 Reselim Permission is hereby granted').class, 'mit');
});

test('the MIT grant classifies without the word MIT (Builder fonts, 2026-10-07)', () => {
  assert.equal(classifyLicence('Permission is hereby granted, free of charge, to any person obtaining a copy of this software').class, 'mit');
});

test('a font item: Creator Store fonts by asset id, built-ins by family file; designer and date from the evidence', async () => {
  const { fontItem, designerOf, firstDate } = await import('../src/ingest-fonts.mjs');
  assert.equal(designerOf('Type designer: Vernon Adams, Ben Nathan; embedded copyright'), 'Vernon Adams, Ben Nathan');
  assert.equal(firstDate('on Google Fonts since 2012-09-23; uploaded 2023-01-17'), '2012-09-23');
  const r = fontItem({ family: 'Akronim', url: 'https://create.roblox.com/store/asset/12187368317', roblox_ref: { asset_id: 'rbxassetid://12187368317' }, licence_words: 'This Font Software is licensed under the SIL Open Font License, Version 1.1.', licence_url: 'https://scripts.sil.org/OFL', mood: ['horror'], faces: 1, checked_at: '2026-10-07', human_made_evidence: 'Type designer: Grzegorz Klimczewski; on Google Fonts since 2012-09-23' }, '/nowhere');
  assert.equal(r.item.roblox_asset_id, 12187368317);
  assert.equal(r.item.licence_class, 'ofl-1.1');
  assert.match(r.item.attribution, /Akronim by Grzegorz Klimczewski/);
  assert.equal(r.item.ai_check.pass, true);
  assert.match(fontItem({ family: 'Ghost', url: 'https://x', roblox_ref: { family_uri: 'rbxasset://fonts/families/Ghost.json' }, licence_words: 'OFL', licence_url: 'https://x', checked_at: '2026-10-07', human_made_evidence: '2010-01-01' }, '/nowhere').error, /no asset id and no family file/);
});
