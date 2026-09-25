// The art-direction brief's lifecycle, and the arithmetic that justifies dropping it.
//
// The whole transcript — system prompt included — is re-sent on every step. The brief's size
// changes with art direction, so derive the removable block from the prompt instead of pinning an
// obsolete character count.
//
// These tests pin two things a future edit could quietly break: that collapsing it actually removes
// the brief while keeping the instructions that matter, and that the replacement remains much
// cheaper than carrying the full brief. A re-inflated reminder must make the cost test fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const WORKER = join(REPO, 'apps', 'worker');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

async function load(file) {
  const dest = join(tmpdir(), `golem-${file}-${process.pid}.mjs`);
  execFileSync(ESBUILD, [join(WORKER, 'src', `${file}.ts`), '--bundle', '--format=esm', '--target=es2022', `--outfile=${dest}`], {
    stdio: 'pipe',
    cwd: WORKER,
  });
  const mod = await import(`file://${dest}`);
  rmSync(dest, { force: true });
  return mod;
}

const P = await load('prompts');
const Pricing = await load('pricing');
const MODEL = '@cf/zai-org/glm-5.3-flash';
/** the estimator used throughout the cost model; stated so the numbers below are reproducible */
const tokens = (chars) => Math.round(chars / 3.6);

const visual = P.systemPrompt({
  mode: 'agent',
  projectName: 'Test',
  studioConnected: true,
  memoryFacts: [],
  sceneKind: 'a cosy tavern interior',
  fenceId: 'ev4lf3nc',
});
const artStart = visual.indexOf(P.BRIEF_START);
const artEnd = visual.indexOf(P.BRIEF_END) + P.BRIEF_END.length;
const artBlock = visual.slice(artStart, artEnd);

test('a visual Agent run carries the art-direction brief', () => {
  assert.ok(artStart >= 0 && artEnd > artStart);
  assert.ok(artBlock.length > P.BRIEF_REMINDER.length * 3, 'the initial brief must contain substantial guidance');
});

test('a non-visual run never pays for the brief', () => {
  const plain = P.systemPrompt({ mode: 'agent', projectName: 'Test', studioConnected: true, memoryFacts: [], fenceId: 'ev4lf3nc' });
  assert.ok(!plain.includes(P.BRIEF_START) && !plain.includes(P.BRIEF_END));
  assert.equal(plain, visual.replace(`\n\n${artBlock}`, ''), 'only the visual brief should differ');
});

test('collapsing removes the brief, keeps the instruction, and leaves no sentinel behind', () => {
  const collapsed = P.collapseArtDirection(visual);
  assert.ok(!collapsed.includes(P.BRIEF_START), 'the sentinel must not survive into the prompt');
  assert.ok(!collapsed.includes(P.BRIEF_END));
  assert.ok(collapsed.includes('one element dominant'), 'the reminder must carry the rule that matters');
  assert.equal(collapsed, visual.replace(artBlock, P.BRIEF_REMINDER), 'collapse must only replace the brief');
  // The rest of the prompt must be intact. Truncating it here is the failure that would quietly
  // lobotomise the agent while looking like a cost win.
  assert.ok(collapsed.includes('Never report a change you have not observed'));
  assert.ok(collapsed.includes('GATE THE BLOCKOUT'));
});

test('collapsing twice is a no-op, so calling it every step is safe', () => {
  const once = P.collapseArtDirection(visual);
  assert.equal(P.collapseArtDirection(once), once);
  const plain = P.systemPrompt({ mode: 'plan', projectName: 'T', studioConnected: false, memoryFacts: [], fenceId: 'ev4lf3nc' });
  assert.equal(P.collapseArtDirection(plain), plain);
});

test('the reminder retains at least 80% of the full brief input saving', () => {
  const collapsed = P.collapseArtDirection(visual);
  const plain = P.systemPrompt({ mode: 'agent', projectName: 'Test', studioConnected: true, memoryFacts: [], fenceId: 'ev4lf3nc' });
  const before = Pricing.neuronsFor(MODEL, tokens(visual.length), 0, 0);
  const after = Pricing.neuronsFor(MODEL, tokens(collapsed.length), 0, 0);
  const noBrief = Pricing.neuronsFor(MODEL, tokens(plain.length), 0, 0);
  const fullBriefCost = before - noBrief;
  const saved = before - after;
  assert.ok(fullBriefCost > 0, 'the visual brief must have a measurable input cost');
  assert.ok(saved >= fullBriefCost * 0.8,
    `reminder saves only ${saved} of ${fullBriefCost} neurons; it may have grown into a second brief`);
});
