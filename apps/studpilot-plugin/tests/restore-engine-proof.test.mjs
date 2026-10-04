import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync(new URL('../proof/AppleRestoreEngineProof.luau', import.meta.url), 'utf8');
const project = JSON.parse(readFileSync(new URL('../proof/studio-restore-engine-proof.project.json', import.meta.url), 'utf8'));
const builder = readFileSync(new URL('../scripts/build-restore-engine-proof.mjs', import.meta.url), 'utf8');
const artifacts = readFileSync(new URL('../proof/ARTIFACTS.md', import.meta.url), 'utf8');

test('restore proof is one-shot and bound to an unpublished marked place', () => {
  assert.match(runner, /game\.PlaceId == 0/);
  assert.match(runner, /local ran = false/);
  assert.match(runner, /expect\(not ran,/);
  assert.equal(project.tree.Workspace.AppleRestoreEngineProofMarker.$attributes.AppleRestoreEngineProof, true);
  assert.match(runner, /RunService:IsStudio\(\)/);
  assert.match(runner, /RunService:IsEdit\(\)/);
});

test('restore proof exercises coverage, identity, source integrity, one recording and rollback', () => {
  for (const evidence of [
    'starter_player_protected_containers_are_snapshot_coverage',
    'default_new_place_restorable_supported_subset',
    'default new-place snapshot was not a restorable supported subset',
    'ChatWindowConfiguration',
    'ChatInputBarConfiguration',
    'ChannelTabsConfiguration',
    'BubbleChatConfiguration',
    'recordPreparation("commit-checkpoint-state"',
    'recordPreparation("commit-live-state"',
    'local liveExpected = captureCommitLiveState()',
    'restore_commit_single_recording_undo_redo',
    'tampered_source_hash_refuses_before_recording',
    'recordPreparation("rollback-checkpoint-state"',
    'recordPreparation("rollback-live-state"',
    'local rollbackExpected = captureRollbackLiveState()',
    'mid_restore_failure_cancels_and_rolls_back',
    'checkpoint_identity_and_consent_refuse_before_mutation',
    'sourceChars == #checkpointScript.source',
    'finishes[1] and finishes[1].committed',
    'finishes[1] and finishes[1].cancelled',
    'ChangeHistoryService:Undo()',
    'ChangeHistoryService:Redo()',
    '(expected=%s observed=%s)',
    'APPLE_RESTORE_ENGINE_PROOF',
  ]) assert.ok(runner.includes(evidence), `missing restore proof evidence: ${evidence}`);
  assert.doesNotMatch(runner, /FindFirstChild\("LiveBeforeFailure"\)\s*==\s*livePart/);
  assert.doesNotMatch(runner, /FindFirstChild\("RollbackGuard"\)\s*==\s*guard/);
  assert.doesNotMatch(runner, /undoPart\.Transparency\s*==\s*0\.9/);
  assert.doesNotMatch(runner, /undoExtra\.Transparency\s*==\s*0\.4/);
  assert.doesNotMatch(runner, /livePartAfter\.Transparency\s*==\s*0\.8/);
  assert.doesNotMatch(runner, /guardAfter\.Transparency\s*==\s*0\.6/);
  assert.match(runner, /assertCommitLiveState\(undoObserved, liveExpected, "undoLive"\)/);
  assert.match(runner, /assertRollbackLiveState\(rollbackObserved, rollbackExpected, "cancelLive"\)/);
  assert.match(runner, /undoExpectedPartTransparency = liveExpected\.partTransparency/);
  assert.match(runner, /cancelExpectedPartTransparency = rollbackExpected\.partTransparency/);
});

test('restore proof cannot perform network, asset, publication, generation or arbitrary source execution', () => {
  assert.doesNotMatch(runner, /\b(?:RequestAsync|GetAsync|PostAsync|HttpGet|LoadAsset|LoadLocalAsset|CreateAssetAsync|SavePlace|PublishAs|GenerateModelAsync)\s*\(/);
  assert.doesNotMatch(runner, /\b(?:loadstring|require)\s*\(\s*(?:\d|["'])/);
  assert.match(builder, /apple-restore-engine-proof-r4\.rbxl/);
  assert.match(builder, /inspect-plugin-build\.py/);
  assert.match(builder, /require\(game\.ServerScriptService\.AppleRestoreEngineProof\)\.run\(\)/);
});

test('restore artifact metadata preserves failed r2/r3 observations and the measured r4 pass separately', () => {
  assert.match(artifacts, /ed42c17834f41981c44a179b682bec12407ae0689a41d51c2e0e4df86936d9f4/);
  assert.match(artifacts, /docs\/evidence\/apple-restore-engine-2026-09-18\.json/);
  assert.match(artifacts, /82888a846057972dc4cffb40d3f014a56a1f88451f5d17c51f4486971043c50e/);
  assert.match(artifacts, /docs\/evidence\/apple-restore-engine-r2-2026-09-18\.json/);
  assert.match(artifacts, /float32 `Transparency` readback/);
  assert.match(artifacts, /0c28fdad64979136ede955458e9ab92e4eb8a397ef2609d7173d3326b457c65c/);
  assert.match(artifacts, /docs\/evidence\/apple-restore-engine-r3-2026-09-18\.json/);
  assert.match(artifacts, /docs\/evidence\/apple-restore-engine-r3-identity-2026-09-18\.json/);
  assert.match(artifacts, /Instance:Destroy\(\)/);
  assert.match(artifacts, /cc20a9cbfdb1bc6158a981cb3d7771b95c231d24e3381eb36f4cd89641caf355/);
  assert.match(artifacts, /apple-restore-engine-proof-r4\.rbxl/);
  assert.match(artifacts, /docs\/evidence\/apple-restore-engine-r4-2026-09-18\.json/);
  assert.match(artifacts, /2aaf31328517451ebaa1c9d2aa55cd246ea27f6d5326655767a833c00e2b04a2/);
  assert.match(artifacts, /docs\/evidence\/apple-restore-engine-r4-identity-2026-09-18\.json/);
  assert.match(artifacts, /all seven checks passed/i);
  assert.match(artifacts, /UI Play proof/);
});
