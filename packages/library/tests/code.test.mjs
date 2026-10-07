// Code-module ingestion (category 14): the L4 scan flags what needs an audit, modules are what the repo ships, and the
// licence comes from the repo's own file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanSource, moduleRoots, repoItems } from '../src/ingest-code.mjs';

test('the L4 scan flags remote require, dynamic code, web and purchase services, and obfuscation', () => {
  assert.deepEqual(scanSource('local x = require(123456789)').flags, ['require-id']);
  assert.deepEqual(scanSource('local f = loadstring(s)').flags, ['dynamic-code']);
  assert.deepEqual(scanSource('game:GetService("HttpService")').flags, ['http']);
  assert.deepEqual(scanSource('local M = game:GetService("MarketplaceService")').flags, ['marketplace']);
  assert.deepEqual(scanSource('local x = require(script.Parent.Signal)').flags, [], 'a normal require is fine');
  assert.ok(scanSource('x="' + 'a'.repeat(2500) + '"').flags.includes('obfuscation'));
});

function repo(files, licence = 'MIT License\n\nCopyright (c) 2021 Someone\n\nPermission is hereby granted, free of charge, to any person') {
  const dir = join(mkdtempSync(join(tmpdir(), 'code-')), 'someone__thing');
  for (const [p, body] of Object.entries(files)) { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), body); }
  writeFileSync(join(dir, 'LICENSE'), licence);
  return dir;
}

test('the Rojo path is the module; a collection splits into its children; tests and specs stay out', () => {
  const one = repo({ 'default.project.json': JSON.stringify({ tree: { $path: 'src' } }), 'src/init.luau': 'return {}', 'src/x.spec.luau': '--' });
  assert.equal(moduleRoots(one, 1).length, 1);
  const many = repo({ 'modules/signal/init.luau': 'return {}', 'modules/trove/init.luau': 'return {}', 'modules/tests/init.luau': '--' });
  assert.deepEqual(moduleRoots(many, 2).map((p) => p.split('/').pop()).sort(), ['signal', 'trove']);
});

test('a repo becomes valid items with the attribution the licence asks for', () => {
  const dir = repo({ 'src/init.luau': 'local H = game:GetService("HttpService") return {}' });
  const r = repoItems({ url: 'https://github.com/someone/thing', item_count: 1, licence_words: 'MIT License', licence_url: 'https://github.com/someone/thing/blob/main/LICENSE', human_made_evidence: 'repo created 2021-05-01' }, dir, '2026-10-07T00:00:00.000Z');
  assert.equal(r.items.length, 1, JSON.stringify(r));
  const it = r.items[0];
  assert.equal(it.licence_class, 'mit');
  assert.match(it.attribution, /Copyright \(c\) 2021 Someone/);
  assert.equal(it.audit, 'required');
  assert.deepEqual(it.scan.flags, ['http']);
});

test('an Apache repo classifies from its own file; no creation date means no pass; no licence means skipped', () => {
  const apache = 'Apache License\n                  Version 2.0, January 2004';
  const row = { url: 'https://github.com/a/b', item_count: 1, licence_words: 'Apache', licence_url: 'https://x', human_made_evidence: 'repo created 2019-03-01' };
  assert.equal(repoItems(row, repo({ 'src/init.luau': 'return 1' }, apache), '2026-10-07T00:00:00.000Z').items[0].licence_class, 'apache-2.0');
  const undated = repoItems({ ...row, human_made_evidence: '' }, repo({ 'src/init.luau': 'return 1' }, apache), '2026-10-07T00:00:00.000Z');
  assert.equal(undated.items.length, 0);
  assert.match(undated.rejected[0], /ai_check failed/);
  assert.match(repoItems({ ...row, licence_words: 'MIT' }, repo({ 'src/init.luau': 'return 1' }, 'All rights reserved.'), '2026-10-07T00:00:00.000Z').skipped, /licence file/);
});
