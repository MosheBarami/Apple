import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync(new URL('../proof/AppleGenerationEngineProof.luau', import.meta.url), 'utf8');
const project = JSON.parse(readFileSync(new URL('../proof/studio-generation-engine-proof.project.json', import.meta.url), 'utf8'));
const builder = readFileSync(new URL('../scripts/build-generation-engine-proof.mjs', import.meta.url), 'utf8');
const generation = readFileSync(new URL('../src/GenerationService.luau', import.meta.url), 'utf8');

test('generation proof is one-shot and bound to an unpublished marked place', () => {
  assert.match(runner, /game\.PlaceId == 0/);
  assert.match(runner, /local ran = false/);
  assert.match(runner, /expect\(not ran,/);
  assert.match(runner, /ran = true/);
  assert.equal(project.tree.Workspace.AppleGenerationEngineProofMarker.$attributes.AppleGenerationEngineProof, true);
  assert.equal(project.tree.Workspace.AppleGenerationProofDestination.$attributes.AppleGenerationProofDestination, true);
  assert.match(runner, /RunService:IsStudio\(\)/);
  assert.match(runner, /RunService:IsEdit\(\)/);
});

test('generation proof measures capability, detached QC, one recording, undo, redo and visual handoff', () => {
  for (const evidence of [
    'adapter:probe()',
    'one_generation_detached_qc_single_recording',
    'OnRecordingStarted:Connect',
    'OnRecordingFinished:Connect',
    'finishes[1].committed == true',
    'result.data.qc.detached == true',
    'result.data.qc.visualJudgementRequired == true',
    'ChangeHistoryService:Undo()',
    'ChangeHistoryService:Redo()',
    'visual_review_handoff',
    'APPLE_GENERATION_ENGINE_PROOF',
  ]) assert.ok(runner.includes(evidence), `missing proof evidence: ${evidence}`);
  assert.equal((runner.match(/op\s*=\s*"generate_model"/g) ?? []).length, 1);
});

test('generation proof has one adapter call site and no upload, publication, asset loader or HTTP request', () => {
  assert.doesNotMatch(runner, /\bGenerateModelAsync\s*\(/);
  assert.equal((generation.match(/GenerateModelAsync\s*\(/g) ?? []).length, 1);
  const combined = `${runner}\n${generation}`;
  assert.doesNotMatch(combined, /GetService\s*\(\s*["']AssetService["']\s*\)/);
  assert.doesNotMatch(combined, /\b(?:CreateAssetAsync|RequestAsync|GetAsync|PostAsync|HttpGet|LoadAsset|SavePlace|PublishAs)\s*\(/);
  assert.match(builder, /apple-generation-engine-proof\.rbxl/);
  assert.match(builder, /require\(game\.ServerScriptService\.AppleGenerationEngineProof\)\.run\(\)/);
  assert.match(builder, /Building did not call GenerationService/);
});
