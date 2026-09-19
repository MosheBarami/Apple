// Synthetic-only tests for the offline consent/provenance staging boundary.
//
// These fixtures are not Apple runs and are never written into training/evaluation data. The
// validator checks the shape and consistency of an exporter assertion; it cannot authenticate a
// Supabase row or prove that a caller did not fabricate the booleans. A production owner-scoped
// exporter is still required before any real transcript can enter this staging format.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENVELOPE_SCHEMA_VERSION,
  STAGING_SCHEMA_VERSION,
  stageEnvelope,
  stageEnvelopes,
  stagingJsonl,
  validateEnvelope,
} from './consent-staging.mjs';

const NOW = '2026-09-18T12:00:00.000Z';
const STARTED = '2026-09-18T10:00:00.000Z';
const FINISHED = '2026-09-18T11:00:00.000Z';
const CHECKED = '2026-09-18T11:45:00.000Z';
const HASH = 'a'.repeat(64);

function envelope(overrides = {}) {
  const base = {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    consent: {
      optedIn: true,
      current: true,
      status: 'active',
      policyVersion: 'training-opt-in-v1',
      consentedAt: '2026-09-18T09:00:00.000Z',
      verifiedAt: CHECKED,
      proof: {
        source: 'profiles.training_opt_in',
        value: true,
        current: true,
        policyVersion: 'training-opt-in-v1',
        checkedAt: CHECKED,
        subjectRef: 'user-123',
      },
    },
    provenance: {
      source: 'synthetic-fixture',
      sourceVersion: 'session-export-v1',
      capturedAt: '2026-09-18T11:50:00.000Z',
      runId: 'run-123',
      traceHash: HASH,
      license: { kind: 'synthetic-fixture', status: 'fixture-only' },
    },
    run: {
      id: 'run-123',
      status: 'succeeded',
      complete: true,
      verified: true,
      startedAt: STARTED,
      finishedAt: FINISHED,
    },
    messages: [
      { role: 'user', content: 'Make a small folder in the workspace.' },
      { role: 'assistant', content: 'I inspected the place and made the requested change.' },
      { role: 'tool', content: 'observed result' },
    ],
    toolTrace: [
      {
        index: 0,
        name: 'get_tree',
        arguments: { depth: 2 },
        result: { ok: true, nodes: 3 },
        ok: true,
        observed: true,
      },
    ],
    outcome: {
      status: 'succeeded',
      observed: true,
      verified: true,
      observedAt: '2026-09-18T11:30:00.000Z',
      evidence: { checks: ['folder exists after the edit'] },
    },
  };
  return deepMerge(base, overrides);
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch ?? base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(out[key] && typeof out[key] === 'object' ? out[key] : {}, value)
      : value;
  }
  return out;
}

function codes(result) {
  return new Set((result.errors ?? []).map((item) => item.code));
}

test('a complete, current, structured fixture is accepted only as staging', () => {
  const result = stageEnvelope(envelope(), { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.record.schemaVersion, STAGING_SCHEMA_VERSION);
  assert.equal(result.record.stagingOnly, true);
  assert.equal(result.record.trainingReady, false);
  assert.equal(result.record.promotionBlocked, true);
  assert.equal(result.record.humanReviewRequired, true);
  assert.equal(result.record.audit.arbitraryFreeTextNotProven, true);
  assert.equal(result.record.audit.consentAuthenticityProven, false);
  assert.equal(result.record.audit.productionExporterRequired, true);
  assert.equal(result.record.provenance.traceHash, HASH);
  assert.equal(result.record.run.finishedAt, FINISHED, 'timestamps are provenance, not generic digit PII');
  assert.equal(result.record.consent.proof.checkedAt, CHECKED, 'consent timestamp remains auditable');
  assert.equal(result.record.toolTrace[0].name, 'get_tree');
});

test('missing, withdrawn, or stale consent fails closed without returning a record', () => {
  const cases = [
    ['missing proof', { consent: { proof: undefined } }, 'consent_proof_required'],
    ['opted out', { consent: { optedIn: false, proof: { value: false, current: false } } }, 'consent_missing'],
    ['withdrawn', { consent: { status: 'withdrawn' } }, 'consent_withdrawn'],
    ['not current', { consent: { current: false } }, 'consent_not_current'],
    ['old verification', { consent: { verifiedAt: '2026-08-01T12:00:00.000Z', proof: { checkedAt: '2026-08-01T12:00:00.000Z' } } }, 'consent_stale'],
  ];
  for (const [label, patch, expected] of cases) {
    const result = stageEnvelope(envelope(patch), { now: NOW });
    assert.equal(result.ok, false, label);
    assert.equal(result.record, undefined, `${label}: invalid input must not produce a partial record`);
    assert.ok(codes(result).has(expected) || (expected === 'consent_stale' && codes(result).has('consent_timestamp_stale')), `${label}: ${[...codes(result)]}`);
  }
});

test('current means the proof is fresh and checked after the run, not merely a boolean', () => {
  const old = envelope({ consent: { verifiedAt: '2026-09-17T10:00:00.000Z', proof: { checkedAt: '2026-09-17T10:00:00.000Z' } } });
  const validation = validateEnvelope(old, { now: NOW });
  assert.equal(validation.ok, false);
  assert.ok(codes(validation).has('consent_timestamp_stale'));

  const beforeRun = envelope({ consent: { verifiedAt: '2026-09-18T10:30:00.000Z', proof: { checkedAt: '2026-09-18T10:30:00.000Z' } } });
  assert.ok(codes(validateEnvelope(beforeRun, { now: NOW })).has('consent_not_current'));
});

test('incomplete, unverified, failed, or unobserved runs never become samples', () => {
  const cases = [
    ['incomplete', { run: { complete: false } }, 'run_incomplete'],
    ['unverified run', { run: { verified: false } }, 'run_unverified'],
    ['failed run', { run: { status: 'failed' }, outcome: { status: 'failed' } }, 'run_not_successful'],
    ['unverified outcome', { outcome: { verified: false } }, 'outcome_unverified'],
    ['unobserved outcome', { outcome: { observed: false } }, 'outcome_unobserved'],
    ['unobserved tool', { toolTrace: [{ index: 0, name: 'get_tree', arguments: {}, result: {}, ok: true, observed: false }] }, 'tool_unobserved'],
    ['missing structured result', { toolTrace: [{ index: 0, name: 'get_tree', arguments: {}, ok: true, observed: true }] }, 'tool_result_missing'],
  ];
  for (const [label, patch, expected] of cases) {
    const result = stageEnvelope(envelope(patch), { now: NOW });
    assert.equal(result.ok, false, label);
    assert.ok(codes(result).has(expected), `${label}: ${[...codes(result)]}`);
  }
});

test('PII, credentials, and identifiers are redacted recursively while the input is untouched', () => {
  const input = envelope({
    consent: { proof: { subjectRef: 'user-123', nested: [{ email: 'alice@example.com' }] } },
    messages: [{ role: 'user', content: 'Contact alice@example.com; arbitrary project codename remains reviewable.' }, ...envelope().messages.slice(1)],
    toolTrace: [{
      index: 0,
      name: 'read_script',
      arguments: {
        userId: '987654',
        nested: [{ email: 'alice@example.com', phone: '+1 555 123-4567', authorization: 'Bearer secret-token-value-12345' }],
      },
      result: {
        placeId: '12345',
        nested: [{ checkpointId: 'checkpoint-123', note: 'trace id=01234567-89ab-4cde-8123-456789abcdef' }],
      },
      ok: true,
      observed: true,
    }],
    outcome: { evidence: { contact: 'alice@example.com', token: 'sk_test_12345678901234567890' } },
  });
  const before = JSON.stringify(input);
  const result = stageEnvelope(input, { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(input), before, 'sanitizing must not mutate the source envelope');

  const output = JSON.stringify(result.record);
  assert.equal(output.includes('alice@example.com'), false);
  assert.equal(output.includes('secret-token-value-12345'), false);
  assert.equal(output.includes('sk_test_12345678901234567890'), false);
  assert.equal(output.includes('checkpoint-123'), false);
  assert.match(output, /REDACTED:CREDENTIAL/);
  assert.match(output, /REDACTED:PII/);
  assert.match(output, /REDACTED:IDENTIFIER/);
  assert.ok(result.redactions.byCategory.credential >= 2);
  assert.ok(result.redactions.byCategory.pii >= 2);
  assert.ok(result.redactions.byCategory.identifier >= 3);
  assert.equal(result.record.audit.humanReviewRequired, undefined, 'review flag belongs at record root and is always true');
  assert.equal(result.record.humanReviewRequired, true);
});

test('unsafe tool names, malformed provenance, and empty outcome evidence are refused', () => {
  const unsafe = stageEnvelope(envelope({ toolTrace: [{ index: 0, name: 'run_code', arguments: {}, result: {}, ok: true, observed: true }] }), { now: NOW });
  assert.equal(unsafe.ok, false);
  assert.ok(codes(unsafe).has('unsafe_tool'));

  const noEvidenceInput = envelope();
  noEvidenceInput.outcome.evidence = {};
  const noEvidence = stageEnvelope(noEvidenceInput, { now: NOW });
  assert.equal(noEvidence.ok, false);
  assert.ok(codes(noEvidence).has('outcome_evidence_missing'));

  const noHash = stageEnvelope(envelope({ provenance: { traceHash: 'not-a-hash' } }), { now: NOW });
  assert.equal(noHash.ok, false);
  assert.ok(codes(noHash).has('provenance_hash'));
});

test('batch staging excludes invalid rows and remains explicitly non-promotable', () => {
  const batch = stageEnvelopes([envelope(), envelope({ run: { complete: false } })], { now: NOW });
  assert.equal(batch.ok, false);
  assert.deepEqual(batch.counts, { accepted: 1, rejected: 1 });
  assert.equal(batch.records.length, 1);
  assert.equal(batch.records[0].trainingReady, false);
  assert.equal(batch.failures[0].index, 1);

  const jsonl = stagingJsonl(batch.records);
  const line = JSON.parse(jsonl.trim());
  assert.equal(line.stagingOnly, true);
  assert.equal(line.trainingReady, false);
  assert.throws(() => stagingJsonl([{ stagingOnly: true, trainingReady: true, promotionBlocked: false }]), /staging-only record/);
});

test('bounded JSON-only inputs fail closed for cycles and unsafe values', () => {
  const cyclic = envelope();
  cyclic.toolTrace[0].arguments.cycle = cyclic.toolTrace[0].arguments;
  const result = stageEnvelope(cyclic, { now: NOW });
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('envelope_unserializable') || codes(result).has('cycle'));

  const nonFinite = envelope();
  nonFinite.toolTrace[0].arguments.value = Number.NaN;
  const invalid = stageEnvelope(nonFinite, { now: NOW });
  assert.equal(invalid.ok, false);
  assert.ok(codes(invalid).has('nonfinite_number'));
});
