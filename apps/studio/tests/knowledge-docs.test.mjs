import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { d1FromSqlite } from './helpers/d1-sqlite.mjs';
import { apiUrl, buildFtsQueries, camelSplit, guideUrl, headingSlug, luauUrl } from '../src/knowledge/docs-text.ts';
import { allowedDocUrl, docsFreshness, readDoc, searchDocs } from '../src/knowledge/docs.ts';
import { buildSqlBatches, chunkApi, guideChunks, luauChunks } from '../../../scripts/docs-index/lib.mjs';

test('URL mapping', () => {
  assert.equal(guideUrl('content/en-us/ui/styling/compatibility.md'), 'https://create.roblox.com/docs/ui/styling/compatibility');
  assert.equal(guideUrl('content/en-us/ui/index.md'), 'https://create.roblox.com/docs/ui');
  assert.equal(guideUrl('content/en-us/index.md'), 'https://create.roblox.com/docs');
  assert.equal(apiUrl('classes', 'Players'), 'https://create.roblox.com/docs/reference/engine/classes/Players');
  assert.equal(apiUrl('classes', 'Players', 'Players:GetPlayerByUserId'), 'https://create.roblox.com/docs/reference/engine/classes/Players#GetPlayerByUserId');
  assert.equal(apiUrl('libraries', 'math', 'math.abs'), 'https://create.roblox.com/docs/reference/engine/libraries/math#abs');
  assert.equal(luauUrl('src/content/docs/getting-started/intro.md', 'getting-started'), 'https://luau.org/getting-started/');
  assert.equal(luauUrl('src/content/docs/types/tables.md'), 'https://luau.org/types/tables/');
  assert.equal(headingSlug('Type `annotations` & more'), 'type-annotations-more');
});

test('identifier splitting and query building', () => {
  assert.equal(camelSplit('GetPlayerByUserId'), 'Get Player By User Id');
  assert.equal(camelSplit('UIListLayout'), 'UI List Layout');
  assert.equal(buildFtsQueries('   '), null);
  assert.equal(buildFtsQueries('"" ( ) * ^ :'), null);
  const q = buildFtsQueries('how do I use "GetPlayerByUserId" OR NOT (x*) AND');
  assert.ok(q);
  assert.match(q.and, /\("GetPlayerByUserId" OR ident:"get player by user id"\)/);
  assert.ok(!/\bhow\b/.test(q.and), 'stopwords dropped');
  assert.ok(q.and.includes(' AND ') && q.or.includes(' OR '));
  // no raw FTS syntax survives: every term is a quoted token of word characters
  assert.ok(!/[*^():]\s*[^"a-z]/.test(q.and.replace(/ident:/g, '').replace(/[()]/g, '')));
});

const guideMd = `---
title: Layouts
description: Arrange UI.
---

Intro text about layouts.

## Spacing

Use Padding on a UIListLayout to space items.

\`\`\`lua
-- ## not a heading
local x = 1
\`\`\`

## Alignment

Align items with HorizontalAlignment.
`;
const playersYaml = {
  name: 'Players',
  type: 'class',
  summary: 'A service of connected players.',
  description: 'Holds Player objects.',
  inherits: ['Instance'],
  tags: ['Service'],
  methods: [
    {
      name: 'Players:GetPlayerByUserId',
      summary: 'Returns the Player with the given UserId.',
      description: '',
      parameters: [{ name: 'userId', type: 'number', summary: 'The id.' }],
      returns: [{ type: 'Player', summary: 'The player or nil.' }],
      tags: [],
    },
  ],
  properties: [{ name: 'Players.MaxPlayers', type: 'int', summary: 'Max players allowed.' }],
};

function fixtureDb() {
  const chunks = [
    ...guideChunks('content/en-us/ui/layouts.md', guideMd),
    ...chunkApi(playersYaml, 'classes'),
    ...luauChunks('src/content/docs/types/tables.md', '---\nslug: types/tables\ntitle: Tables\n---\nTables hold values.\n\n## Arrays\n\nLuau type annotations for arrays.'),
  ];
  const raw = new DatabaseSync(':memory:');
  for (const b of buildSqlBatches(chunks, { built_at: '2026-01-01T00:00:00Z', roblox_creator_docs_sha: 'abc', luau_site_sha: 'def', chunk_count: String(chunks.length) })) raw.exec(b);
  return { db: d1FromSqlite(raw), chunks };
}

test('chunking: headings, fences, members and signatures', () => {
  const { chunks } = fixtureDb();
  const guide = chunks.filter((c) => c.page_url.endsWith('/ui/layouts'));
  assert.deepEqual(guide.map((c) => c.heading), ['', 'Spacing', 'Alignment']);
  assert.ok(guide[1].body.includes('not a heading'), 'fenced "## " is not a heading');
  assert.equal(guide[1].url, 'https://create.roblox.com/docs/ui/layouts#spacing');
  const m = chunks.find((c) => c.heading === 'GetPlayerByUserId');
  assert.match(m.body, /^Players:GetPlayerByUserId\(userId: number\): Player/);
  assert.equal(m.url, 'https://create.roblox.com/docs/reference/engine/classes/Players#GetPlayerByUserId');
  assert.ok(chunks.some((c) => c.heading === 'Overview' && /Members: .*GetPlayerByUserId/.test(c.body)));
});

test('searchDocs: ranking, identifier split match, OR fallback, source filter, hostile input', async () => {
  const { db } = fixtureDb();
  const a = await searchDocs(db, 'GetPlayerByUserId');
  assert.equal(a[0].heading, 'GetPlayerByUserId');
  assert.equal(a[0].source, 'Roblox Creator Docs');
  assert.equal(a[0].kind, 'api');
  const b = await searchDocs(db, 'player user id');
  assert.ok(b.some((h) => h.heading === 'GetPlayerByUserId'), 'camelCase member found by spaced words');
  const c = await searchDocs(db, 'UIListLayout padding');
  assert.ok(c.length && c[0].url.includes('/ui/layouts'));
  const d = await searchDocs(db, 'padding zzzunknownword');
  assert.ok(d.length, 'OR fallback returns partial matches');
  const e = await searchDocs(db, 'type annotations', { source: 'luau' });
  assert.ok(e.length && e.every((h) => h.source === 'Luau'));
  assert.equal((await searchDocs(db, 'type annotations', { source: 'roblox' })).length, 0);
  for (const hostile of ['"', 'a OR', 'NEAR(', '* *', 'x:y', "'; DROP TABLE chunks; --", '']) {
    assert.ok(Array.isArray(await searchDocs(db, hostile)));
  }
  assert.ok(a[0].snippet.length <= 320);
  assert.equal((await searchDocs(db, 'Players', { limit: 1 })).length, 1);
});

test('readDoc: stored page, member fragment, allowlist, live fallback', async () => {
  const { db } = fixtureDb();
  const page = await readDoc(db, 'https://create.roblox.com/docs/ui/layouts');
  assert.equal(page.from, 'index');
  assert.match(page.text, /Intro text/);
  assert.match(page.text, /Align items/);
  const member = await readDoc(db, 'https://create.roblox.com/docs/reference/engine/classes/Players#GetPlayerByUserId');
  assert.match(member.text, /Players:GetPlayerByUserId\(userId/);
  assert.ok(!member.text.includes('MaxPlayers'));
  const luau = await readDoc(db, 'https://luau.org/types/tables');
  assert.equal(luau.source, 'Luau');

  assert.equal(await readDoc(db, 'https://evil.example/docs/x'), null);
  assert.equal(await readDoc(db, 'http://create.roblox.com/docs/x'), null);
  assert.equal(await readDoc(db, 'https://create.roblox.com.evil.example/docs/x'), null);
  assert.equal(await readDoc(db, 'https://create.roblox.com/store/asset/1'), null);
  assert.equal(allowedDocUrl('https://user:pw@luau.org/x'), null);

  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    const res = new Response('---\ntitle: Live Page\n---\n' + 'x'.repeat(20000), { headers: { 'content-type': 'text/markdown' } });
    Object.defineProperty(res, 'url', { value: String(url) });
    return res;
  };
  const live = await readDoc(db, 'https://create.roblox.com/docs/not/indexed/', fetcher);
  assert.deepEqual(calls, ['https://create.roblox.com/docs/not/indexed.md']);
  assert.equal(live.from, 'live');
  assert.equal(live.title, 'Live Page');
  assert.equal(live.truncated, true);
  assert.equal(live.text.length, 12000);
});

test('docsFreshness', async () => {
  const { db, chunks } = fixtureDb();
  assert.deepEqual(await docsFreshness(db), { builtAt: '2026-01-01T00:00:00Z', robloxCreatorDocsSha: 'abc', luauSiteSha: 'def', chunks: chunks.length });
});
