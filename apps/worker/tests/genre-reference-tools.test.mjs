import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const worker = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'genre-reference-tools-'));
after(() => rmSync(temp, { recursive: true, force: true }));
async function bundle(source) {
  const target = join(temp, `${source}.mjs`);
  execFileSync(join(worker, 'node_modules/.bin/esbuild'), [
    join(worker, `src/${source}.ts`), '--bundle', '--platform=node', '--format=esm', `--outfile=${target}`,
  ], { stdio: 'pipe' });
  return import(pathToFileURL(target).href);
}
const { TOOLS, runTool, toolNames } = await bundle('tools');
const { toolsForMode } = await bundle('router');

test('genre references are available in Plan and all disconnected modes with no project access', async () => {
  const name = 'get_genre_references';
  assert.equal(TOOLS[name].studio, false);
  for (const mode of ['plan', 'agent', 'agent']) {
    assert.ok(toolsForMode(mode, false, toolNames()).has(name));
  }
  assert.ok(toolsForMode('plan', true, toolNames()).has(name));
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('reference retrieval must be offline'); };
  try {
    const result = await runTool({ studioConnected: () => false }, name,
      JSON.stringify({ genre: 'simulator', aspect: 'ui_hud' }));
    assert.equal(result.ok, true);
    assert.ok(result.resultForLlm.length <= 2700);
    const guide = JSON.parse(result.resultForLlm);
    assert.equal(guide.noMatch, false);
    assert.equal(guide.query.genre, 'simulator');
    assert.equal(guide.createdGame.visuallyVerified, false);
    assert.equal(guide.rights.copyPermission, false);
    assert.equal(guide.rights.trainingData, false);
    assert.ok(guide.sources.some(source => source.kind === 'visual_reference' && source.observations.length));
    assert.ok(guide.sources.every(source => new URL(source.url).protocol === 'https:'));
    assert.equal(guide.counts.returnedSources + guide.counts.omittedSources, guide.counts.matchedSources);
  } finally { globalThis.fetch = oldFetch; }
});

test('unknown and malformed filters are explicit; real visual gaps still provide official guidance', async () => {
  const call = args => TOOLS.get_genre_references.run({}, args);
  assert.equal((await call({ genre: 'missing' })).reason, 'unknown_genre');
  assert.equal((await call({ genre: 'horror', aspect: 'missing' })).reason, 'unknown_aspect');
  assert.ok((await call({ genre: ['horror'] })).error);
  assert.ok((await call({ genre: 'horror', aspect: null })).error);
  const gap = await call({ genre: 'horror', aspect: 'inventory' });
  assert.equal(gap.coverage.requestedExternalStatus, 'gap');
  assert.ok(gap.sources.length > 0);
  assert.ok(gap.sources.every(source => source.kind === 'official_implementation'));
  assert.equal(gap.createdGame.visuallyVerified, false);
});

test('the genre kit links to the same retrieval tool before model-context truncation', async () => {
  const result = await runTool({ studioConnected: () => false }, 'get_genre_kit',
    JSON.stringify({ genre: 'tower_defense' }));
  assert.equal(result.ok, true);
  assert.match(result.resultForLlm, /get_genre_references/);
  assert.match(result.resultForLlm, /reference_only/);
  assert.match(result.resultForLlm, /read_creation_skill/);
});

test('the active genre kit tool cannot hand a dark horror palette to cartoon-only Apple', async () => {
  const tool = TOOLS.get_genre_kit;
  assert.ok(!tool.def.parameters.properties.genre.enum.includes('horror'));
  const refused = await tool.run({}, { genre: 'horror' });
  assert.match(refused.error, /colorful cartoon/i);
  const available = await tool.run({}, { genre: 'simulator' });
  assert.ok(Array.isArray(available.palette));
  assert.ok(available.makeThese.length > 0);
  assert.ok(available.makeThese.every((slot) => !/generate_image|build.*from parts/i.test(slot.how)));
  assert.ok(available.buildTheseYourself.every((rule) => !/prop|model.*from parts/i.test(rule)));
});
