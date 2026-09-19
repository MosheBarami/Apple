#!/usr/bin/env node
/**
 * Offline gate and redactor for first-party Apple tool trajectories.
 *
 * This module intentionally does not read SessionDO, Supabase, the filesystem, or a provider.
 * The caller must provide an explicit envelope containing a current consent proof, structured
 * tool observations, an observed outcome, and a provenance/licence record.  It returns a separate
 * staging record only; a staging record is never training-ready and always requires human review.
 *
 * The redactor removes credential-shaped values and common PII/identifier fields recursively.
 * That is a useful safety boundary, not a proof that arbitrary free text is anonymous: a project
 * name, a distinctive request, or source code can identify a person without matching a pattern.
 * `humanReviewRequired` is therefore always true and is deliberately not configurable away.
 *
 * Canonical input envelope (JSON only):
 *
 * {
 *   schemaVersion: "apple-trajectory-envelope-v1",
 *   consent: {
 *     optedIn: true, current: true, status: "active",
 *     policyVersion: "training-opt-in-v1",
 *     consentedAt: "...", verifiedAt: "...",
 *     proof: {
 *       source: "profiles.training_opt_in", value: true, current: true,
 *       policyVersion: "training-opt-in-v1", checkedAt: "..."
 *     }
 *   },
 *   provenance: {
 *     source: "apple-sessiondo" | "synthetic-fixture",
 *     sourceVersion: "session-export-v1", capturedAt: "...",
 *     runId: "opaque-run-id", traceHash: "sha256 hex",
 *     license: { kind: "first-party-consented" | "synthetic-fixture", status: "cleared" | "fixture-only" }
 *   },
 *   run: {
 *     id: "opaque-run-id", status: "succeeded", complete: true, verified: true,
 *     startedAt: "...", finishedAt: "..."
 *   },
 *   messages: [{ role: "user"|"assistant"|"tool"|"system", content: "..." }],
 *   toolTrace: [{ index: 0, name: "get_tree", arguments: {}, result: {}, ok: true, observed: true }],
 *   outcome: {
 *     status: "succeeded", observed: true, verified: true,
 *     observedAt: "...", evidence: { checks: ["..."] }
 *   }
 * }
 *
 * `stageEnvelope` is the main entry point. `validateEnvelope` is exported separately so an
 * exporter can test its own schema without receiving any sanitized payload from an invalid input.
 * The booleans in `consent.proof` are assertions, not authentication: this pure module cannot
 * query or verify Supabase. A production owner-scoped exporter must obtain the current row and
 * build the envelope; staged output records that authenticity is not proven here.
 */
import { createHash } from 'node:crypto';

export const ENVELOPE_SCHEMA_VERSION = 'apple-trajectory-envelope-v1';
export const STAGING_SCHEMA_VERSION = 'apple-trajectory-staging-v1';
export const STAGING_DATASET_NAME = 'apple-tool-trajectories-staging';

export const LIMITS = Object.freeze({
  maxEnvelopeBytes: 512 * 1024,
  maxDepth: 14,
  maxArrayItems: 512,
  maxObjectKeys: 128,
  maxTextChars: 32 * 1024,
  maxStructuredValueBytes: 128 * 1024,
  maxMessages: 256,
  maxToolSteps: 256,
  maxRedactionPaths: 256,
});
export const DEFAULT_MAX_CONSENT_AGE_MS = 24 * 60 * 60 * 1000;

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const SHA256 = /^(?:sha256:)?[0-9a-f]{64}$/i;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SAFE_TOOL_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant', 'tool']);
const ALLOWED_SOURCES = new Set(['apple-sessiondo', 'synthetic-fixture']);
const DISALLOWED_TOOLS = new Set([
  'run_code',
  'execute_code',
  'loadstring',
  'require',
  'insertservice:loadasset',
  'assetservice:loadassetasync',
]);

const REDACTION_MARKERS = Object.freeze({
  credential: '[REDACTED:CREDENTIAL]',
  pii: '[REDACTED:PII]',
  identifier: '[REDACTED:IDENTIFIER]',
});

const CREDENTIAL_KEY = /(?:api[_-]?key|access[_-]?key|auth(?:orization)?|bearer|cookie|credential|client[_-]?secret|password|passphrase|private[_-]?key|refresh[_-]?token|secret|session[_-]?token|token|webhook[_-]?secret)/i;
const PII_KEY = /^(?:address|city|country|display[_-]?name|email|e[_-]?mail|first[_-]?name|full[_-]?name|last[_-]?name|phone|postal[_-]?code|real[_-]?name|street|telephone|username|user[_-]?name|zip)$/i;
const IDENTIFIER_KEY = /^(?:id|uuid|guid|(?:account|asset|checkpoint|creator|device|experience|job|message|owner|place|project|request|run|server|session|subscription|trace|transaction|universe|user|call|toolcall|correlation|record|row|resource|parent|child|revision|source)[_-]?(?:id|uuid|guid|ref)?)$/i;

const STRING_REDACTIONS = [
  // Private keys must be removed before the smaller token patterns inspect their contents.
  { kind: 'credential', re: /-----BEGIN [^-]{1,80}-----[\s\S]*?-----END [^-]{1,80}-----/gi },
  { kind: 'credential', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi },
  { kind: 'credential', re: /\b(?:sk|rk|pk|ghp|gho|github_pat|xoxb|xoxp|AKIA|ASIA)[A-Za-z0-9_-]{12,}\b/g },
  { kind: 'credential', re: /([?&](?:access[_-]?token|api[_-]?key|auth|key|password|secret|token)=)[^&#\s]+/gi },
  { kind: 'pii', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  // Keep this deliberately format-specific: a generic digit run would redact ISO timestamps and
  // Roblox numeric properties, which are provenance/teaching data rather than phone numbers.
  { kind: 'pii', re: /(?:\+\d{1,3}[ .-])?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}\b/g },
  { kind: 'pii', re: /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g },
  { kind: 'identifier', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi },
  // This catches an identifier in prose or a serialized result without deleting ordinary numbers.
  { kind: 'identifier', re: /\b(?:account|asset|checkpoint|creator|experience|job|message|place|project|request|run|server|session|trace|transaction|universe|user)[ _-]?(?:id|uuid|guid|ref)\s*[:=]\s*["']?[A-Za-z0-9._:-]{2,}["']?/gi },
];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function error(code, path, message) {
  return { code, path, message };
}

function pushError(errors, code, path, message) {
  errors.push(error(code, path, message));
}

function pathFor(path, key, category = null) {
  // A redaction report must not re-emit a user-controlled object key as a "safe" path.
  if (category) return `${path}.${category}`;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}.[key]`;
}

function asDateMs(value) {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) return null;
  const date = new Date(value);
  const canonical = date.toISOString();
  // Requiring an ISO round-trip prevents locale strings and ambiguous timestamps from entering a
  // provenance record. Millisecond precision is accepted because it is what JSON exports use.
  if (canonical !== value) return null;
  return date.getTime();
}

function nowMs(value) {
  if (value === undefined) return Date.now();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = asDateMs(value);
  return parsed === null ? NaN : parsed;
}

function checkTimestamp(value, path, errors, clock, { notBefore = null } = {}) {
  const ms = asDateMs(value);
  if (ms === null) {
    pushError(errors, 'timestamp_invalid', path, 'timestamp must be canonical ISO-8601 UTC');
    return null;
  }
  if (Number.isFinite(clock) && ms > clock + MAX_CLOCK_SKEW_MS) {
    pushError(errors, 'timestamp_future', path, 'timestamp is in the future');
  }
  if (notBefore !== null && ms < notBefore) {
    pushError(errors, 'timestamp_order', path, 'timestamp precedes the run boundary');
  }
  return ms;
}

function checkNonEmptyString(value, path, errors, max = 256) {
  if (typeof value !== 'string' || !value.trim()) {
    pushError(errors, 'string_required', path, 'a non-empty string is required');
    return false;
  }
  if (value.length > max) pushError(errors, 'string_too_long', path, `string exceeds ${max} characters`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    pushError(errors, 'control_character', path, 'control characters are not allowed');
  }
  return true;
}

function checkVersion(value, path, errors) {
  checkNonEmptyString(value, path, errors, 64);
  if (typeof value === 'string' && !SAFE_VERSION.test(value)) {
    pushError(errors, 'version_invalid', path, 'version contains unsafe characters');
  }
}

function checkJsonShape(value, path, errors, { depth = 0, seen = new WeakSet() } = {}) {
  if (depth > LIMITS.maxDepth) {
    pushError(errors, 'depth_exceeded', path, `value exceeds depth ${LIMITS.maxDepth}`);
    return;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    if (typeof value === 'number' && !Number.isFinite(value)) pushError(errors, 'nonfinite_number', path, 'numbers must be finite');
    if (typeof value === 'string' && value.length > LIMITS.maxTextChars) pushError(errors, 'string_too_long', path, `string exceeds ${LIMITS.maxTextChars} characters`);
    return;
  }
  if (typeof value !== 'object') {
    pushError(errors, 'json_value_required', path, 'value must be JSON-compatible');
    return;
  }
  if (seen.has(value)) {
    pushError(errors, 'cycle', path, 'cyclic values are not accepted');
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > LIMITS.maxArrayItems) pushError(errors, 'array_too_large', path, `array exceeds ${LIMITS.maxArrayItems} items`);
    for (let i = 0; i < Math.min(value.length, LIMITS.maxArrayItems); i += 1) checkJsonShape(value[i], `${path}[${i}]`, errors, { depth: depth + 1, seen });
  } else if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length > LIMITS.maxObjectKeys) pushError(errors, 'object_too_large', path, `object exceeds ${LIMITS.maxObjectKeys} keys`);
    for (const key of keys.slice(0, LIMITS.maxObjectKeys)) {
      if (key.length > 256) pushError(errors, 'key_too_long', `${path}.[key]`, 'object key is too long');
      checkJsonShape(value[key], pathFor(path, key), errors, { depth: depth + 1, seen });
    }
  } else {
    pushError(errors, 'json_object_required', path, 'objects must be plain JSON objects');
  }
  seen.delete(value);
}

function checkStructuredValue(value, path, errors) {
  if (!isRecord(value) && !Array.isArray(value)) {
    pushError(errors, 'structured_value_required', path, 'tool arguments/results must be objects or arrays');
    return;
  }
  const before = errors.length;
  checkJsonShape(value, path, errors);
  try {
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes > LIMITS.maxStructuredValueBytes) pushError(errors, 'structured_value_too_large', path, `structured value exceeds ${LIMITS.maxStructuredValueBytes} bytes`);
  } catch {
    if (errors.length === before) pushError(errors, 'json_unserializable', path, 'structured value cannot be serialized');
  }
}

function validateConsent(consent, errors, clock, runFinishedAt, maxConsentAgeMs) {
  const path = '$.consent';
  if (!isRecord(consent)) {
    pushError(errors, 'consent_required', path, 'explicit consent proof is required');
    return;
  }
  if (consent.optedIn !== true) pushError(errors, 'consent_missing', `${path}.optedIn`, 'opt-in must be explicitly true');
  if (consent.current !== true) pushError(errors, 'consent_not_current', `${path}.current`, 'consent must be marked current');
  if (consent.status !== 'active') pushError(errors, 'consent_withdrawn', `${path}.status`, 'withdrawn or unknown consent cannot be staged');
  if (hasOwn(consent, 'withdrawnAt') && consent.withdrawnAt !== null) pushError(errors, 'consent_withdrawn', `${path}.withdrawnAt`, 'withdrawn consent cannot be staged');
  if (hasOwn(consent, 'revokedAt') && consent.revokedAt !== null) pushError(errors, 'consent_withdrawn', `${path}.revokedAt`, 'revoked consent cannot be staged');
  checkVersion(consent.policyVersion, `${path}.policyVersion`, errors);
  const consentedAt = checkTimestamp(consent.consentedAt, `${path}.consentedAt`, errors, clock);
  const verifiedAt = checkTimestamp(consent.verifiedAt, `${path}.verifiedAt`, errors, clock, { notBefore: consentedAt });
  if (verifiedAt !== null && Number.isFinite(clock) && clock - verifiedAt > maxConsentAgeMs) {
    pushError(errors, 'consent_timestamp_stale', `${path}.verifiedAt`, `consent verification is older than ${maxConsentAgeMs}ms`);
  }

  if (!isRecord(consent.proof)) {
    pushError(errors, 'consent_proof_required', `${path}.proof`, 'current profile opt-in proof is required');
    return;
  }
  const proof = consent.proof;
  if (proof.source !== 'profiles.training_opt_in') pushError(errors, 'consent_proof_source', `${path}.proof.source`, 'proof must come from profiles.training_opt_in');
  if (proof.value !== true || proof.current !== true) pushError(errors, 'consent_proof_false', `${path}.proof`, 'proof must confirm the current opt-in value');
  if (proof.policyVersion !== consent.policyVersion) pushError(errors, 'consent_policy_mismatch', `${path}.proof.policyVersion`, 'proof and consent policy versions must match');
  const checkedAt = checkTimestamp(proof.checkedAt, `${path}.proof.checkedAt`, errors, clock, { notBefore: consentedAt });
  if (checkedAt !== null && Number.isFinite(clock) && clock - checkedAt > maxConsentAgeMs) {
    pushError(errors, 'consent_timestamp_stale', `${path}.proof.checkedAt`, `consent verification is older than ${maxConsentAgeMs}ms`);
  }
  if (verifiedAt !== null && checkedAt !== null && checkedAt < verifiedAt) {
    pushError(errors, 'consent_timestamp_order', `${path}.proof.checkedAt`, 'proof check must not precede consent verification');
  }
  if (runFinishedAt !== null && checkedAt !== null && checkedAt < runFinishedAt) {
    pushError(errors, 'consent_not_current', `${path}.proof.checkedAt`, 'opt-in must be rechecked at or after run completion');
  }
}

function validateRun(run, errors, clock) {
  const path = '$.run';
  if (!isRecord(run)) {
    pushError(errors, 'run_required', path, 'run metadata is required');
    return { startedAt: null, finishedAt: null };
  }
  checkNonEmptyString(run.id, `${path}.id`, errors, 256);
  if (run.status !== 'succeeded') pushError(errors, 'run_not_successful', `${path}.status`, 'only explicitly successful runs may be staged');
  if (run.complete !== true) pushError(errors, 'run_incomplete', `${path}.complete`, 'run must be complete');
  if (run.verified !== true) pushError(errors, 'run_unverified', `${path}.verified`, 'run must be independently verified');
  const startedAt = checkTimestamp(run.startedAt, `${path}.startedAt`, errors, clock);
  const finishedAt = checkTimestamp(run.finishedAt, `${path}.finishedAt`, errors, clock, { notBefore: startedAt });
  return { startedAt, finishedAt };
}

function validateMessages(messages, errors) {
  const path = '$.messages';
  if (!Array.isArray(messages) || messages.length < 2) {
    pushError(errors, 'messages_required', path, 'at least a user and assistant message are required');
    return;
  }
  if (messages.length > LIMITS.maxMessages) pushError(errors, 'messages_too_many', path, `messages exceed ${LIMITS.maxMessages}`);
  const roles = new Set();
  for (let i = 0; i < Math.min(messages.length, LIMITS.maxMessages); i += 1) {
    const message = messages[i];
    const itemPath = `${path}[${i}]`;
    if (!isRecord(message)) {
      pushError(errors, 'message_shape', itemPath, 'message must be an object');
      continue;
    }
    if (!ALLOWED_ROLES.has(message.role)) pushError(errors, 'message_role', `${itemPath}.role`, 'message role is not allowed');
    else roles.add(message.role);
    if (hasOwn(message, 'content')) {
      if (typeof message.content !== 'string') pushError(errors, 'message_content', `${itemPath}.content`, 'message content must be text');
      else if (message.content.length > LIMITS.maxTextChars) pushError(errors, 'message_too_long', `${itemPath}.content`, `message exceeds ${LIMITS.maxTextChars} characters`);
    } else if (message.role !== 'tool') {
      pushError(errors, 'message_content', `${itemPath}.content`, 'message content is required');
    }
    checkJsonShape(message, itemPath, errors);
  }
  if (!roles.has('user')) pushError(errors, 'user_message_missing', path, 'a user request is required');
  if (!roles.has('assistant')) pushError(errors, 'assistant_message_missing', path, 'an assistant response is required');
}

function validateToolTrace(toolTrace, errors) {
  const path = '$.toolTrace';
  if (!Array.isArray(toolTrace) || toolTrace.length < 1) {
    pushError(errors, 'tool_trace_required', path, 'at least one observed tool step is required');
    return;
  }
  if (toolTrace.length > LIMITS.maxToolSteps) pushError(errors, 'tool_trace_too_long', path, `tool trace exceeds ${LIMITS.maxToolSteps} steps`);
  const indices = new Set();
  for (let i = 0; i < Math.min(toolTrace.length, LIMITS.maxToolSteps); i += 1) {
    const step = toolTrace[i];
    const itemPath = `${path}[${i}]`;
    if (!isRecord(step)) {
      pushError(errors, 'tool_step_shape', itemPath, 'tool step must be an object');
      continue;
    }
    if (!Number.isInteger(step.index) || step.index < 0) pushError(errors, 'tool_step_index', `${itemPath}.index`, 'tool step index must be a non-negative integer');
    else if (indices.has(step.index)) pushError(errors, 'tool_step_index', `${itemPath}.index`, 'tool step indices must be unique');
    else indices.add(step.index);
    if (typeof step.name !== 'string' || !SAFE_TOOL_NAME.test(step.name)) pushError(errors, 'tool_name', `${itemPath}.name`, 'tool name is invalid');
    else if (DISALLOWED_TOOLS.has(step.name.toLowerCase())) pushError(errors, 'unsafe_tool', `${itemPath}.name`, 'unsafe execution or asset-loading tools are not stageable');
    if (step.observed !== true) pushError(errors, 'tool_unobserved', `${itemPath}.observed`, 'tool result must be marked observed');
    if (typeof step.ok !== 'boolean') pushError(errors, 'tool_status', `${itemPath}.ok`, 'tool result must carry an explicit boolean status');
    if (!hasOwn(step, 'arguments')) pushError(errors, 'tool_arguments_missing', `${itemPath}.arguments`, 'structured tool arguments are required');
    else checkStructuredValue(step.arguments, `${itemPath}.arguments`, errors);
    if (!hasOwn(step, 'result')) pushError(errors, 'tool_result_missing', `${itemPath}.result`, 'structured observed tool result is required');
    else checkStructuredValue(step.result, `${itemPath}.result`, errors);
    if (hasOwn(step, 'durationMs') && (!Number.isFinite(step.durationMs) || step.durationMs < 0 || step.durationMs > 60 * 60 * 1000)) {
      pushError(errors, 'duration_invalid', `${itemPath}.durationMs`, 'durationMs must be finite and bounded');
    }
    checkJsonShape(step, itemPath, errors);
  }
}

function validateOutcome(outcome, errors, clock, runFinishedAt) {
  const path = '$.outcome';
  if (!isRecord(outcome)) {
    pushError(errors, 'outcome_required', path, 'an observed outcome is required');
    return;
  }
  if (outcome.status !== 'succeeded') pushError(errors, 'outcome_not_successful', `${path}.status`, 'outcome must be explicitly successful');
  if (outcome.observed !== true) pushError(errors, 'outcome_unobserved', `${path}.observed`, 'outcome must be observed');
  if (outcome.verified !== true) pushError(errors, 'outcome_unverified', `${path}.verified`, 'outcome must be independently verified');
  const observedAt = checkTimestamp(outcome.observedAt, `${path}.observedAt`, errors, clock, { notBefore: runFinishedAt });
  if (!hasOwn(outcome, 'evidence') && !hasOwn(outcome, 'checks')) {
    pushError(errors, 'outcome_evidence_missing', path, 'observed outcome must include evidence or checks');
  } else if (hasOwn(outcome, 'evidence')) {
    if (!isRecord(outcome.evidence) && !Array.isArray(outcome.evidence)) pushError(errors, 'outcome_evidence_shape', `${path}.evidence`, 'outcome evidence must be structured');
    else {
      if ((Array.isArray(outcome.evidence) && outcome.evidence.length === 0) || (isRecord(outcome.evidence) && Object.keys(outcome.evidence).length === 0)) {
        pushError(errors, 'outcome_evidence_missing', `${path}.evidence`, 'outcome evidence cannot be empty');
      }
      checkJsonShape(outcome.evidence, `${path}.evidence`, errors);
    }
  }
  if (hasOwn(outcome, 'checks')) {
    if (!Array.isArray(outcome.checks) || outcome.checks.length < 1) pushError(errors, 'outcome_checks_shape', `${path}.checks`, 'outcome checks must be a non-empty array');
    else checkJsonShape(outcome.checks, `${path}.checks`, errors);
  }
  if (observedAt === null) return;
}

function validateProvenance(provenance, errors, run, clock) {
  const path = '$.provenance';
  if (!isRecord(provenance)) {
    pushError(errors, 'provenance_required', path, 'source, licence, timestamp, and trace hash are required');
    return;
  }
  if (!ALLOWED_SOURCES.has(provenance.source)) pushError(errors, 'provenance_source', `${path}.source`, 'source must be Apple first-party export or an explicit synthetic fixture');
  checkVersion(provenance.sourceVersion, `${path}.sourceVersion`, errors);
  const capturedAt = checkTimestamp(provenance.capturedAt, `${path}.capturedAt`, errors, clock, { notBefore: null });
  if (run?.finishedAt && capturedAt !== null) {
    const finishedAt = asDateMs(run.finishedAt);
    if (finishedAt !== null && capturedAt < finishedAt) pushError(errors, 'provenance_before_run', `${path}.capturedAt`, 'capture must occur after run completion');
  }
  checkNonEmptyString(provenance.runId, `${path}.runId`, errors, 256);
  if (run?.id && provenance.runId !== run.id) pushError(errors, 'provenance_run_mismatch', `${path}.runId`, 'provenance runId must match run.id');
  if (typeof provenance.traceHash !== 'string' || !SHA256.test(provenance.traceHash)) pushError(errors, 'provenance_hash', `${path}.traceHash`, 'traceHash must be a SHA-256 hex digest');
  if (!isRecord(provenance.license)) {
    pushError(errors, 'license_required', `${path}.license`, 'licence basis is required');
  } else {
    const expectedKind = provenance.source === 'synthetic-fixture' ? 'synthetic-fixture' : 'first-party-consented';
    const expectedStatus = provenance.source === 'synthetic-fixture' ? 'fixture-only' : 'cleared';
    if (provenance.license.kind !== expectedKind) pushError(errors, 'license_kind', `${path}.license.kind`, 'licence kind does not match source');
    if (provenance.license.status !== expectedStatus) pushError(errors, 'license_status', `${path}.license.status`, 'licence status does not match source');
  }
}

/** Validate the explicit envelope without returning any input payload. */
export function validateEnvelope(envelope, { now = undefined, maxConsentAgeMs = DEFAULT_MAX_CONSENT_AGE_MS } = {}) {
  const errors = [];
  if (!isRecord(envelope)) {
    return { ok: false, errors: [error('envelope_required', '$', 'a plain JSON envelope is required')], bytes: null };
  }
  const clock = nowMs(now);
  if (!Number.isFinite(clock)) pushError(errors, 'clock_invalid', '$.now', 'validation clock is invalid');
  if (!Number.isFinite(maxConsentAgeMs) || maxConsentAgeMs <= 0) {
    pushError(errors, 'consent_age_config', '$.maxConsentAgeMs', 'consent freshness window must be a positive finite duration');
  }
  let bytes = null;
  try {
    bytes = Buffer.byteLength(JSON.stringify(envelope));
    if (bytes > LIMITS.maxEnvelopeBytes) pushError(errors, 'envelope_too_large', '$', `envelope exceeds ${LIMITS.maxEnvelopeBytes} bytes`);
  } catch {
    pushError(errors, 'envelope_unserializable', '$', 'envelope must be JSON serializable');
  }
  checkJsonShape(envelope, '$', errors);
  if (envelope.schemaVersion !== ENVELOPE_SCHEMA_VERSION) pushError(errors, 'schema_version', '$.schemaVersion', `expected ${ENVELOPE_SCHEMA_VERSION}`);

  // Run is parsed first because consent/provenance timestamps are only "current" relative to it.
  const runBounds = validateRun(envelope.run, errors, clock);
  validateConsent(envelope.consent, errors, clock, runBounds.finishedAt, maxConsentAgeMs);
  validateMessages(envelope.messages, errors);
  validateToolTrace(envelope.toolTrace, errors);
  validateOutcome(envelope.outcome, errors, clock, runBounds.finishedAt);
  validateProvenance(envelope.provenance, errors, envelope.run, clock);
  return {
    ok: errors.length === 0,
    errors,
    bytes,
    counts: {
      messages: Array.isArray(envelope.messages) ? envelope.messages.length : 0,
      toolSteps: Array.isArray(envelope.toolTrace) ? envelope.toolTrace.length : 0,
    },
  };
}

function classifyKey(key, path = '') {
  if (typeof key !== 'string') return null;
  if (CREDENTIAL_KEY.test(key)) return 'credential';
  if (PII_KEY.test(key)) return 'pii';
  if (IDENTIFIER_KEY.test(key)) return 'identifier';
  // Tool names are part of the learnable trace vocabulary, but a name elsewhere can be a person,
  // project, or place name. Keep only the explicitly safe tool-step name field.
  if (/^name$/i.test(key) && !/^\$\.toolTrace\[\d+\]$/.test(path)) return 'pii';
  if (/^(?:project|place|experience|account|creator|owner)[_-]?name$/i.test(key)) return 'pii';
  return null;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function redactString(value, path, report) {
  let output = value;
  for (const { kind, re } of STRING_REDACTIONS) {
    // A fresh regex is required for global expressions; reusing a stateful `lastIndex` can skip a
    // second credential in the same result after another fixture has exercised the first one.
    const matcher = new RegExp(re.source, re.flags);
    output = output.replace(matcher, () => {
      recordRedaction(report, kind, path);
      return REDACTION_MARKERS[kind];
    });
  }
  return output;
}

function recordRedaction(report, kind, path) {
  report.count += 1;
  report.byCategory[kind] = (report.byCategory[kind] ?? 0) + 1;
  if (report.paths.length < LIMITS.maxRedactionPaths) report.paths.push({ kind, path });
  else report.pathsTruncated = true;
}

function setOwn(object, key, value) {
  // `__proto__` must remain data, not become a prototype mutation while creating the redacted row.
  Object.defineProperty(object, key, { value, enumerable: true, configurable: true, writable: true });
}

function redactValue(value, path, report, seen, depth = 0) {
  if (typeof value === 'string') return redactString(value, path, report);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (depth > LIMITS.maxDepth) return REDACTION_MARKERS.identifier;
  if (seen.has(value)) return REDACTION_MARKERS.identifier;
  seen.add(value);
  if (Array.isArray(value)) {
    const output = value.map((item, index) => redactValue(item, `${path}[${index}]`, report, seen, depth + 1));
    seen.delete(value);
    return output;
  }
  if (!isRecord(value)) {
    seen.delete(value);
    return REDACTION_MARKERS.identifier;
  }
  const output = {};
  for (const key of Object.keys(value)) {
    const kind = classifyKey(key, path);
    const childPath = pathFor(path, key, kind);
    if (kind) {
      recordRedaction(report, kind, childPath);
      setOwn(output, key, REDACTION_MARKERS[kind]);
    } else {
      setOwn(output, key, redactValue(value[key], childPath, report, seen, depth + 1));
    }
  }
  seen.delete(value);
  return output;
}

function emptyRedactionReport() {
  return { count: 0, byCategory: { credential: 0, pii: 0, identifier: 0 }, paths: [], pathsTruncated: false };
}

function sanitizedInput(envelope, report) {
  const seen = new WeakSet();
  const cleanConsent = redactValue(envelope.consent, '$.consent', report, seen);
  const cleanProvenance = redactValue(envelope.provenance, '$.provenance', report, seen);
  const cleanRun = redactValue(envelope.run, '$.run', report, seen);
  const cleanMessages = redactValue(envelope.messages, '$.messages', report, seen);
  const cleanToolTrace = redactValue(envelope.toolTrace, '$.toolTrace', report, seen);
  const cleanOutcome = redactValue(envelope.outcome, '$.outcome', report, seen);
  const content = { cleanConsent, cleanProvenance, cleanRun, cleanMessages, cleanToolTrace, cleanOutcome };
  return {
    schemaVersion: STAGING_SCHEMA_VERSION,
    dataset: STAGING_DATASET_NAME,
    stagingOnly: true,
    trainingReady: false,
    promotionBlocked: true,
    humanReviewRequired: true,
    consentAuthenticityProven: false,
    productionExporterRequired: true,
    consent: cleanConsent,
    provenance: cleanProvenance,
    run: cleanRun,
    messages: cleanMessages,
    toolTrace: cleanToolTrace,
    outcome: cleanOutcome,
    audit: {
      redaction: report,
      arbitraryFreeTextNotProven: true,
      consentAuthenticityProven: false,
      productionExporterRequired: true,
      contentHash: sha256(canonicalJson(content)),
    },
  };
}

/**
 * Validate and sanitize one envelope. Invalid input is returned only as bounded diagnostics; the
 * caller never receives a partially sanitized record that could be mistaken for a valid sample.
 */
export function stageEnvelope(envelope, options = {}) {
  const validation = validateEnvelope(envelope, options);
  const base = {
    ok: validation.ok,
    stagingOnly: true,
    trainingReady: false,
    promotionBlocked: true,
    humanReviewRequired: true,
    consentAuthenticityProven: false,
    productionExporterRequired: true,
    errors: validation.errors,
    counts: validation.counts ?? { messages: 0, toolSteps: 0 },
  };
  if (!validation.ok) return base;
  const redactions = emptyRedactionReport();
  return {
    ...base,
    record: sanitizedInput(envelope, redactions),
    redactions,
    warnings: [
      'Pattern redaction cannot guarantee anonymity for arbitrary free text, project content, or source code.',
      'Human review is required before any promotion; this record is staging-only.',
    ],
  };
}

/** Stage a batch without allowing one bad envelope to enter the accepted records. */
export function stageEnvelopes(envelopes, options = {}) {
  if (!Array.isArray(envelopes)) {
    return {
      ok: false,
      stagingOnly: true,
      trainingReady: false,
      promotionBlocked: true,
      humanReviewRequired: true,
      records: [],
      failures: [{ index: null, errors: [error('batch_required', '$', 'an array of envelopes is required')] }],
    };
  }
  const records = [];
  const failures = [];
  for (let i = 0; i < envelopes.length; i += 1) {
    const result = stageEnvelope(envelopes[i], options);
    if (result.ok) records.push(result.record);
    else failures.push({ index: i, errors: result.errors });
  }
  return {
    ok: failures.length === 0,
    stagingOnly: true,
    trainingReady: false,
    promotionBlocked: true,
    humanReviewRequired: true,
    records,
    failures,
    counts: { accepted: records.length, rejected: failures.length },
  };
}

/**
 * Serialize already-staged records for a caller-owned staging file. This helper refuses records
 * that do not carry the non-promotable flags, and never writes to disk itself.
 */
export function stagingJsonl(records) {
  if (!Array.isArray(records)) throw new TypeError('stagingJsonl expects an array of records');
  return records.map((record, index) => {
    if (!isRecord(record) || record.stagingOnly !== true || record.trainingReady !== false || record.promotionBlocked !== true || record.humanReviewRequired !== true || record.consentAuthenticityProven !== false) {
      throw new TypeError(`record ${index} is not a staging-only record`);
    }
    return JSON.stringify(record);
  }).join('\n') + (records.length ? '\n' : '');
}

export const sanitizeTrajectoryEnvelope = stageEnvelope;
