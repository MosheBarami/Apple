// The art-direction brief's lifecycle, and the arithmetic that justifies dropping it.
//
// The brief is 7,000+ characters of the ~15,600-character Agent system prompt, and the whole
// transcript — system prompt included — is re-sent on every step. Carrying it through all 16 steps
// of a build is the single largest avoidable input cost in the product.
//
// These tests pin two things a future edit could quietly break: that collapsing it actually removes
// the brief while keeping the instructions that matter, and that the saving is the size
// docs/COST-MODEL.md claims. If someone re-inflates the reminder into a second brief, the neuron
// assertion fails rather than the cost silently coming back.
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

test('a visual Agent run carries the art-direction brief', () => {
  assert.ok(visual.includes(P.BRIEF_START) && visual.includes(P.BRIEF_END));
  assert.ok(visual.length > 14_000, `expected a large prompt, got ${visual.length} chars`);
});

test('a non-visual run never pays for the brief', () => {
  const plain = P.systemPrompt({ mode: 'agent', projectName: 'Test', studioConnected: true, memoryFacts: [], fenceId: 'ev4lf3nc' });
  assert.ok(!plain.includes(P.BRIEF_START));
  assert.ok(plain.length < visual.length - 6_000, 'the brief should be most of the difference');
});

test('collapsing removes the brief, keeps the instruction, and leaves no sentinel behind', () => {
  const collapsed = P.collapseArtDirection(visual);
  assert.ok(!collapsed.includes(P.BRIEF_START), 'the sentinel must not survive into the prompt');
  assert.ok(!collapsed.includes(P.BRIEF_END));
  assert.ok(collapsed.includes('one element dominant'), 'the reminder must carry the rule that matters');
  assert.ok(collapsed.length < visual.length - 6_000, 'the collapse must actually remove the brief');
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

test('the saving is the size docs/COST-MODEL.md claims', () => {
  const collapsed = P.collapseArtDirection(visual);
  const before = Pricing.neuronsFor(MODEL, tokens(visual.length), 0, 0);
  const after = Pricing.neuronsFor(MODEL, tokens(collapsed.length), 0, 0);
  const perStep = before - after;
  // Measured 2026-08-31: 60 -> 32 neurons of system-prompt input tax per step.
  assert.ok(perStep >= 22, `saving fell to ${perStep} neurons/step (was 28) — has the reminder grown?`);
  assert.ok(after < before * 0.7, 'the collapsed prompt should cost well under three quarters of the full one');
  // ~10 steps of a 16-step build run after the first mutating tool call.
  const perBuild = perStep * 10;
  assert.ok(perBuild >= 220 && perBuild <= 400, `per-build saving ${perBuild} outside the documented range`);
});
