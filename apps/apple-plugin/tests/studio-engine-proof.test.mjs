import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync(new URL('../proof/AppleStudioEngineProof.luau', import.meta.url), 'utf8');
const project = JSON.parse(readFileSync(new URL('../proof/studio-engine-proof.project.json', import.meta.url), 'utf8'));
const builder = readFileSync(new URL('../scripts/build-studio-engine-proof.mjs', import.meta.url), 'utf8');

test('disposable engine proof is bound to an unpublished marked place', () => {
  assert.match(runner, /game\.PlaceId == 0/);
  assert.match(runner, /AppleStudioEngineProofMarker/);
  assert.equal(project.tree.Workspace.AppleStudioEngineProofMarker.$attributes.AppleStudioEngineProof, true);
  assert.match(runner, /RunService:IsStudio\(\)/);
  assert.match(runner, /RunService:IsEdit\(\)/);
});

test('engine proof measures rollback, consent, hashes, snapshot and teardown', () => {
  for (const evidence of [
    'FinishRecording(recording :: string, Enum.FinishRecordingOperation.Cancel)',
    'ChangeHistoryService:Undo()',
    'ChangeHistoryService:Redo()',
    'edit_consent_then_disconnect_gate',
    'source_hash_conflict_preserves_studio_edit',
    '{ op = "snapshot", root = "game", includeScripts = true, checkpointId = "proof-general-place" }',
    'restore_is_delegated_to_dedicated_engine_proof',
    'AppleRestoreEngineProof',
    'commands:destroy()',
    'fixture_cleanup',
  ]) assert.ok(runner.includes(evidence), `missing proof evidence: ${evidence}`);
});

test('proof cannot perform network, asset, publishing or generation work', () => {
  assert.doesNotMatch(runner, /\b(?:RequestAsync|GetAsync|PostAsync|LoadAsset|SavePlace|GenerateModelAsync)\s*\(/);
  assert.doesNotMatch(runner, /GetService\s*\(\s*["']GenerationService["']\s*\)/);
  assert.match(runner, /generation_stays_unavailable_without_qc/);
  assert.match(runner, /no substitute/);
  assert.match(builder, /inspect-plugin-build\.py/);
  assert.match(builder, /apple-studio-engine-proof\.rbxl/);
  assert.match(builder, /require\(game\.ServerScriptService\.AppleStudioEngineProof\)\.run\(\)/);
  assert.doesNotMatch(builder, /restore and generate_model remain disabled/);
});
