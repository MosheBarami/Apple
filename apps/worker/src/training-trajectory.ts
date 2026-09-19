/**
 * Bounded, in-memory capture for a future first-party training exporter.
 *
 * This module is deliberately unconnected to SessionDO, Supabase, account export, and the
 * provider path. It records nothing by itself. A future trusted integration may create one after
 * it has read an owner-scoped consent event and bound that event to this exact owner, project, and
 * run. The caller must supply that grant explicitly; a current profile boolean, assistant prose,
 * or a successful-looking tool summary is not accepted as consent or verification.
 *
 * The output is compatible with the structured part of `apple-trajectory-envelope-v1`: every
 * accepted call has an index, call ID, tool name, structured arguments/result, explicit status, and
 * an observation timestamp. It is still only a capture record. `trainingReady` is always false;
 * redaction, provenance hashing, final consent re-check, and human review belong to the separate
 * staging exporter in packages/training.
 */

export const TRAJECTORY_SCHEMA_VERSION = 'apple-trajectory-ledger-v1';
export const TRUSTED_CONSENT_SOURCE = 'training_consent_events';
export const DEFAULT_MAX_CONSENT_AGE_MS = 24 * 60 * 60 * 1000;

export const TRAJECTORY_LIMITS = Object.freeze({
  maxToolSteps: 256,
  maxLedgerBytes: 512 * 1024,
  maxStructuredValueBytes: 128 * 1024,
  maxDepth: 14,
  maxArrayItems: 512,
  maxObjectKeys: 128,
  maxTextChars: 32 * 1024,
  maxIdChars: 256,
  maxToolNameChars: 128,
  maxCallIdChars: 128,
  maxEvidenceSourceChars: 96,
  maxEvidenceChecks: 64,
  maxEvidenceCheckChars: 512,
  maxDurationMs: 60 * 60 * 1000,
});

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type StructuredValue = JsonValue[] | { [key: string]: JsonValue };

/**
 * This is an assertion produced by a future trusted consent adapter, not something this pure
 * module can authenticate. The run binding prevents a grant for one run from being reused for
 * another run by accident.
 */
export interface TrustedConsentGrant {
  source: typeof TRUSTED_CONSENT_SOURCE;
  trusted: true;
  grantId: string;
  ownerId: string;
  projectId: string;
  runId: string;
  optedIn: true;
  current: true;
  status: 'active';
  policyVersion: string;
  verifiedAt: string;
  checkedAt: string;
  expiresAt?: string;
}

export interface StartTrajectoryInput {
  ownerId: string;
  projectId: string;
  runId: string;
  startedAt: string;
  consentGrant: TrustedConsentGrant;
  /** Override only for a deliberately documented integration policy; defaults to 24 hours. */
  maxConsentAgeMs?: number;
}

export interface ToolCallInput {
  callId: string;
  name: string;
  arguments: StructuredValue;
  result: StructuredValue;
  ok: boolean;
  observedAt: string;
  durationMs?: number;
}

export interface ToolCallRecord extends ToolCallInput {
  index: number;
  observed: true;
}

export type TrajectoryOutcomeStatus = 'succeeded' | 'failed' | 'stopped';

/**
 * Evidence is intentionally separate from assistant text. A verifier may use a Studio/plugin
 * observation or another server-side check, but a model response cannot make `verified` true.
 */
export interface OutcomeEvidence {
  source: string;
  checks: string[];
  details?: StructuredValue;
}

export interface TrajectoryOutcomeInput {
  status: TrajectoryOutcomeStatus;
  complete: boolean;
  observed: boolean;
  verified: boolean;
  observedAt: string;
  evidence: OutcomeEvidence;
  /** Required when verified is true; deliberately no assistant/model-text alternative exists. */
  verifiedBy?: string;
}

export interface TrajectoryOutcome extends TrajectoryOutcomeInput {}

export type TrajectoryFailureCode =
  | 'consent_required'
  | 'consent_untrusted'
  | 'consent_invalid'
  | 'consent_mismatch'
  | 'consent_stale'
  | 'timestamp_invalid'
  | 'timestamp_order'
  | 'identity_invalid'
  | 'tool_invalid'
  | 'unsafe_tool'
  | 'duplicate_call'
  | 'structured_value_invalid'
  | 'limit_exceeded'
  | 'ledger_truncated'
  | 'capture_failed'
  | 'closed'
  | 'outcome_invalid'
  | 'no_tool_calls';

export interface TrajectoryFailure {
  ok: false;
  code: TrajectoryFailureCode;
  message: string;
  truncated: boolean;
  captureFailed: boolean;
}

export interface ToolCallAccepted {
  ok: true;
  call: ToolCallRecord;
}

export type RecordToolCallResult = ToolCallAccepted | TrajectoryFailure;

export interface FinishTrajectoryInput {
  finishedAt: string;
  outcome: TrajectoryOutcomeInput;
}

export interface TrajectorySnapshot {
  schemaVersion: typeof TRAJECTORY_SCHEMA_VERSION;
  ownerId: string;
  projectId: string;
  runId: string;
  startedAt: string;
  finishedAt?: string;
  consentGrant: TrustedConsentGrant;
  toolTrace: ToolCallRecord[];
  outcome?: TrajectoryOutcome;
  closed: boolean;
  captureFailed: boolean;
  truncated: boolean;
  /** Always false here; staging/export and human review have not happened. */
  trainingReady: false;
  bytes: number;
  failureCode?: TrajectoryFailureCode;
}

export interface FinishAccepted {
  ok: true;
  snapshot: TrajectorySnapshot;
}

export type FinishTrajectoryResult = FinishAccepted | TrajectoryFailure;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SAFE_CALL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_TOOL_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const UNSAFE_TOOLS = new Set([
  'run_code',
  'execute_code',
  'loadstring',
  'require',
  'insertservice:loadasset',
  'assetservice:loadassetasync',
]);
const UNSAFE_EVIDENCE_SOURCES = new Set(['assistant', 'assistant_text', 'model', 'llm']);

function isRecord(value: unknown): value is { [key: string]: unknown } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function jsonBytes(value: unknown): number {
  try {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? Number.POSITIVE_INFINITY : utf8ByteLength(encoded);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function cloneJson<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => cloneJson(item)) as T;
  const copy: { [key: string]: unknown } = {};
  for (const key of Object.keys(value)) copy[key] = cloneJson((value as { [key: string]: unknown })[key]);
  return copy as T;
}

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const canonical = new Date(parsed).toISOString();
  return canonical === value ? canonical : null;
}

function timestampMs(value: string): number {
  return Date.parse(value);
}

function validBoundedString(value: unknown, expression: RegExp, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && expression.test(value);
}

function checkJsonValue(value: unknown, path: string, seen = new WeakSet<object>(), depth = 0): string | null {
  if (depth > TRAJECTORY_LIMITS.maxDepth) return `${path} exceeds depth ${TRAJECTORY_LIMITS.maxDepth}`;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string' && value.length > TRAJECTORY_LIMITS.maxTextChars) {
      return `${path} exceeds ${TRAJECTORY_LIMITS.maxTextChars} characters`;
    }
    return null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${path} must contain finite numbers`;
  if (typeof value !== 'object') return `${path} must be JSON-compatible`;
  if (seen.has(value)) return `${path} contains a cycle`;
  seen.add(value);
  let error: string | null = null;
  if (Array.isArray(value)) {
    if (value.length > TRAJECTORY_LIMITS.maxArrayItems) {
      error = `${path} exceeds ${TRAJECTORY_LIMITS.maxArrayItems} items`;
    } else {
      for (let index = 0; index < value.length; index += 1) {
        error = checkJsonValue(value[index], `${path}[${index}]`, seen, depth + 1);
        if (error) break;
      }
    }
  } else if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length > TRAJECTORY_LIMITS.maxObjectKeys) {
      error = `${path} exceeds ${TRAJECTORY_LIMITS.maxObjectKeys} keys`;
    } else {
      for (const key of keys) {
        if (key.length > TRAJECTORY_LIMITS.maxTextChars) {
          error = `${path} contains an oversized key`;
          break;
        }
        error = checkJsonValue(value[key], `${path}.${key}`, seen, depth + 1);
        if (error) break;
      }
    }
  } else {
    error = `${path} must contain only plain JSON objects and arrays`;
  }
  seen.delete(value);
  return error;
}

function validateStructured(value: unknown, path: string): string | null {
  if (!Array.isArray(value) && !isRecord(value)) return `${path} must be an object or array`;
  const shapeError = checkJsonValue(value, path);
  if (shapeError) return shapeError;
  if (jsonBytes(value) > TRAJECTORY_LIMITS.maxStructuredValueBytes) {
    return `${path} exceeds ${TRAJECTORY_LIMITS.maxStructuredValueBytes} bytes`;
  }
  return null;
}

function validEvidence(evidence: unknown): evidence is OutcomeEvidence {
  if (!isRecord(evidence)) return false;
  if (!validBoundedString(evidence.source, /^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/, TRAJECTORY_LIMITS.maxEvidenceSourceChars)) return false;
  if (UNSAFE_EVIDENCE_SOURCES.has(evidence.source.toLowerCase())) return false;
  if (!Array.isArray(evidence.checks) || evidence.checks.length < 1 || evidence.checks.length > TRAJECTORY_LIMITS.maxEvidenceChecks) return false;
  if (!evidence.checks.every((check): check is string => typeof check === 'string' && check.length > 0 && check.length <= TRAJECTORY_LIMITS.maxEvidenceCheckChars)) return false;
  if (Object.prototype.hasOwnProperty.call(evidence, 'details')) {
    if (validateStructured(evidence.details, '$.outcome.evidence.details')) return false;
  }
  return true;
}

function failure(code: TrajectoryFailureCode, message: string, truncated = false, captureFailed = true): TrajectoryFailure {
  return { ok: false, code, message, truncated, captureFailed };
}

function validateGrant(input: StartTrajectoryInput): TrajectoryFailure | null {
  if (!isRecord(input)) return failure('consent_required', 'a trajectory start record is required', false, false);
  if (!isRecord(input.consentGrant)) return failure('consent_required', 'a trusted consent grant is required', false, false);
  const grant = input.consentGrant;
  if (grant.source !== TRUSTED_CONSENT_SOURCE || grant.trusted !== true) {
    return failure('consent_untrusted', 'consent must come from a trusted consent-event adapter', false, false);
  }
  if (grant.optedIn !== true || grant.current !== true || grant.status !== 'active') {
    return failure('consent_invalid', 'consent must be active and explicitly opted in', false, false);
  }
  if (!validBoundedString(input.ownerId, SAFE_ID, TRAJECTORY_LIMITS.maxIdChars) ||
      !validBoundedString(input.projectId, SAFE_ID, TRAJECTORY_LIMITS.maxIdChars) ||
      !validBoundedString(input.runId, SAFE_ID, TRAJECTORY_LIMITS.maxIdChars) ||
      !validBoundedString(grant.grantId, SAFE_ID, TRAJECTORY_LIMITS.maxIdChars)) {
    return failure('identity_invalid', 'owner, project, run, and grant IDs must be bounded opaque IDs', false, false);
  }
  if (grant.ownerId !== input.ownerId || grant.projectId !== input.projectId || grant.runId !== input.runId) {
    return failure('consent_mismatch', 'consent grant is not bound to this owner, project, and run', false, false);
  }
  if (!validBoundedString(grant.policyVersion, SAFE_VERSION, 64)) {
    return failure('consent_invalid', 'consent policy version is invalid', false, false);
  }
  const startedAt = canonicalTimestamp(input.startedAt);
  const verifiedAt = canonicalTimestamp(grant.verifiedAt);
  const checkedAt = canonicalTimestamp(grant.checkedAt);
  if (!startedAt || !verifiedAt || !checkedAt) return failure('timestamp_invalid', 'run and consent timestamps must be canonical UTC ISO timestamps', false, false);
  const startMs = timestampMs(startedAt);
  const verifiedMs = timestampMs(verifiedAt);
  const checkedMs = timestampMs(checkedAt);
  if (verifiedMs > startMs || checkedMs > startMs || checkedMs < verifiedMs) {
    return failure('timestamp_order', 'consent verification must precede the run and follow its grant verification', false, false);
  }
  const maxConsentAgeMs = input.maxConsentAgeMs ?? DEFAULT_MAX_CONSENT_AGE_MS;
  if (!Number.isFinite(maxConsentAgeMs) || maxConsentAgeMs < 0 || maxConsentAgeMs > 30 * 24 * 60 * 60 * 1000) {
    return failure('consent_invalid', 'maxConsentAgeMs is outside the bounded policy range', false, false);
  }
  if (startMs - checkedMs > maxConsentAgeMs) return failure('consent_stale', 'consent verification is stale for this run', false, false);
  if (grant.expiresAt !== undefined) {
    const expiresAt = canonicalTimestamp(grant.expiresAt);
    if (!expiresAt || timestampMs(expiresAt) <= checkedMs || timestampMs(expiresAt) <= startMs) {
      return failure('consent_invalid', 'consent expiry must be valid and cover the run start', false, false);
    }
  }
  return null;
}

function cloneGrant(grant: TrustedConsentGrant): TrustedConsentGrant {
  return {
    source: TRUSTED_CONSENT_SOURCE,
    trusted: true,
    grantId: grant.grantId,
    ownerId: grant.ownerId,
    projectId: grant.projectId,
    runId: grant.runId,
    optedIn: true,
    current: true,
    status: 'active',
    policyVersion: grant.policyVersion,
    verifiedAt: grant.verifiedAt,
    checkedAt: grant.checkedAt,
    ...(grant.expiresAt === undefined ? {} : { expiresAt: grant.expiresAt }),
  };
}

export class TrajectoryStartError extends Error {
  readonly code: TrajectoryFailureCode;

  constructor(result: TrajectoryFailure) {
    super(`${result.code}: ${result.message}`);
    this.name = 'TrajectoryStartError';
    this.code = result.code;
  }
}

/** Start capture only after a trusted, fresh, run-bound consent grant has been checked. */
export function createTrajectoryLedger(input: StartTrajectoryInput): TrainingTrajectoryLedger {
  return TrainingTrajectoryLedger.start(input);
}

export class TrainingTrajectoryLedger {
  private readonly ownerId: string;
  private readonly projectId: string;
  private readonly runId: string;
  private readonly startedAt: string;
  private readonly consentGrant: TrustedConsentGrant;
  private readonly toolTrace: ToolCallRecord[] = [];
  private finishedAt: string | undefined;
  private outcome: TrajectoryOutcome | undefined;
  private closed = false;
  private captureFailed = false;
  private truncated = false;
  private failureCode: TrajectoryFailureCode | undefined;

  private constructor(input: StartTrajectoryInput, consentGrant: TrustedConsentGrant) {
    this.ownerId = input.ownerId;
    this.projectId = input.projectId;
    this.runId = input.runId;
    this.startedAt = input.startedAt;
    this.consentGrant = consentGrant;
  }

  /** The only construction path; it keeps consent validation beside the private constructor. */
  static start(input: StartTrajectoryInput): TrainingTrajectoryLedger {
    const grantError = validateGrant(input);
    if (grantError) throw new TrajectoryStartError(grantError);
    return new TrainingTrajectoryLedger(input, cloneGrant(input.consentGrant));
  }

  recordToolCall(input: ToolCallInput): RecordToolCallResult {
    if (this.truncated) return failure('ledger_truncated', 'capture is closed because a size limit was exceeded', true);
    if (this.closed) return failure('closed', 'the trajectory is already closed', this.truncated, this.captureFailed);
    if (this.captureFailed) return failure('capture_failed', 'the trajectory has a prior rejected capture step', this.truncated);
    const invalid = this.validateToolCall(input);
    if (invalid) return this.reject(invalid.code, invalid.message, invalid.truncated);

    const call: ToolCallRecord = {
      index: this.toolTrace.length,
      callId: input.callId,
      name: input.name,
      arguments: cloneJson(input.arguments),
      result: cloneJson(input.result),
      ok: input.ok,
      observed: true,
      observedAt: input.observedAt,
      ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    };
    const candidate = this.candidateWith(call);
    const bytes = jsonBytes(candidate);
    if (bytes > TRAJECTORY_LIMITS.maxLedgerBytes) return this.reject('limit_exceeded', `trajectory exceeds ${TRAJECTORY_LIMITS.maxLedgerBytes} bytes`, true);
    this.toolTrace.push(call);
    return { ok: true, call: cloneJson(call) as ToolCallRecord };
  }

  finish(input: FinishTrajectoryInput): FinishTrajectoryResult {
    if (this.truncated) return failure('ledger_truncated', 'capture is incomplete because a size limit was exceeded', true);
    if (this.closed) return failure('closed', 'the trajectory is already closed', this.truncated, this.captureFailed);
    if (this.captureFailed) return failure('capture_failed', 'the trajectory contains a rejected capture step', this.truncated);
    const finishedAt = canonicalTimestamp(input.finishedAt);
    if (!finishedAt) return this.reject('timestamp_invalid', 'finishedAt must be a canonical UTC ISO timestamp');
    if (timestampMs(finishedAt) < timestampMs(this.startedAt)) return this.reject('timestamp_order', 'finishedAt cannot precede startedAt');
    const lastCall = this.toolTrace[this.toolTrace.length - 1];
    if (lastCall && timestampMs(lastCall.observedAt) > timestampMs(finishedAt)) return this.reject('timestamp_order', 'finishedAt cannot precede an observed tool call');
    if (this.toolTrace.length > TRAJECTORY_LIMITS.maxToolSteps) return this.reject('limit_exceeded', 'tool trace exceeds the bounded step limit', true);
    const outcomeError = this.validateOutcome(input.outcome, finishedAt);
    if (outcomeError) return this.reject(outcomeError.code, outcomeError.message, outcomeError.truncated);
    if (input.outcome.status === 'succeeded' && this.toolTrace.length === 0) return this.reject('no_tool_calls', 'a successful trajectory must contain an observed tool call');

    const normalizedOutcome: TrajectoryOutcome = {
      status: input.outcome.status,
      complete: input.outcome.complete,
      observed: input.outcome.observed,
      verified: input.outcome.verified,
      observedAt: input.outcome.observedAt,
      evidence: {
        source: input.outcome.evidence.source,
        checks: [...input.outcome.evidence.checks],
        ...(input.outcome.evidence.details === undefined ? {} : { details: cloneJson(input.outcome.evidence.details) }),
      },
      ...(input.outcome.verifiedBy === undefined ? {} : { verifiedBy: input.outcome.verifiedBy }),
    };
    const candidate = this.snapshot();
    candidate.finishedAt = finishedAt;
    candidate.outcome = normalizedOutcome;
    candidate.closed = true;
    candidate.bytes = 0;
    candidate.bytes = jsonBytes(candidate);
    const candidateBytes = jsonBytes(candidate);
    if (candidateBytes > TRAJECTORY_LIMITS.maxLedgerBytes) {
      return this.reject('limit_exceeded', `trajectory exceeds ${TRAJECTORY_LIMITS.maxLedgerBytes} bytes after outcome evidence`, true);
    }

    this.finishedAt = finishedAt;
    this.outcome = normalizedOutcome;
    this.closed = true;
    return { ok: true, snapshot: this.snapshot() };
  }

  snapshot(): TrajectorySnapshot {
    const snapshot: TrajectorySnapshot = {
      schemaVersion: TRAJECTORY_SCHEMA_VERSION,
      ownerId: this.ownerId,
      projectId: this.projectId,
      runId: this.runId,
      startedAt: this.startedAt,
      ...(this.finishedAt === undefined ? {} : { finishedAt: this.finishedAt }),
      consentGrant: cloneGrant(this.consentGrant),
      toolTrace: this.toolTrace.map((call) => cloneJson(call) as ToolCallRecord),
      ...(this.outcome === undefined ? {} : { outcome: cloneJson(this.outcome) as TrajectoryOutcome }),
      closed: this.closed,
      captureFailed: this.captureFailed,
      truncated: this.truncated,
      trainingReady: false,
      bytes: 0,
      ...(this.failureCode === undefined ? {} : { failureCode: this.failureCode }),
    };
    snapshot.bytes = jsonBytes(snapshot);
    return snapshot;
  }

  private candidateWith(call: ToolCallRecord): TrajectorySnapshot {
    const snapshot = this.snapshot();
    snapshot.toolTrace.push(call);
    return snapshot;
  }

  private reject(code: TrajectoryFailureCode, message: string, truncated = false): TrajectoryFailure {
    this.captureFailed = true;
    this.closed = true;
    this.truncated ||= truncated;
    this.failureCode = truncated ? 'limit_exceeded' : code;
    return failure(code, message, this.truncated);
  }

  private validateToolCall(input: ToolCallInput): TrajectoryFailure | null {
    if (!isRecord(input)) return failure('tool_invalid', 'tool call must be an object');
    if (!validBoundedString(input.callId, SAFE_CALL_ID, TRAJECTORY_LIMITS.maxCallIdChars)) return failure('tool_invalid', 'callId is invalid or unbounded');
    if (!validBoundedString(input.name, SAFE_TOOL_NAME, TRAJECTORY_LIMITS.maxToolNameChars)) return failure('tool_invalid', 'tool name is invalid or unbounded');
    if (UNSAFE_TOOLS.has(input.name.toLowerCase())) return failure('unsafe_tool', 'unsafe execution or asset-loading tools cannot enter a training trajectory');
    if (this.toolTrace.some((call) => call.callId === input.callId)) return failure('duplicate_call', 'callId must be unique within a run');
    if (this.toolTrace.length >= TRAJECTORY_LIMITS.maxToolSteps) return failure('limit_exceeded', `tool trace exceeds ${TRAJECTORY_LIMITS.maxToolSteps} steps`, true);
    if (typeof input.ok !== 'boolean') return failure('tool_invalid', 'ok must be an explicit boolean');
    const observedAt = canonicalTimestamp(input.observedAt);
    if (!observedAt) return failure('timestamp_invalid', 'observedAt must be a canonical UTC ISO timestamp');
    if (timestampMs(observedAt) < timestampMs(this.startedAt)) return failure('timestamp_order', 'observedAt cannot precede startedAt');
    const previous = this.toolTrace[this.toolTrace.length - 1];
    if (previous && timestampMs(observedAt) < timestampMs(previous.observedAt)) return failure('timestamp_order', 'tool observations must be ordered by time');
    const argumentsError = validateStructured(input.arguments, '$.toolTrace[].arguments');
    if (argumentsError) return failure(argumentsError.includes('exceeds') ? 'limit_exceeded' : 'structured_value_invalid', argumentsError, argumentsError.includes('exceeds'));
    const resultError = validateStructured(input.result, '$.toolTrace[].result');
    if (resultError) return failure(resultError.includes('exceeds') ? 'limit_exceeded' : 'structured_value_invalid', resultError, resultError.includes('exceeds'));
    if (input.durationMs !== undefined && (!Number.isFinite(input.durationMs) || input.durationMs < 0 || input.durationMs > TRAJECTORY_LIMITS.maxDurationMs)) {
      return failure('tool_invalid', `durationMs must be finite and between 0 and ${TRAJECTORY_LIMITS.maxDurationMs}`);
    }
    return null;
  }

  private validateOutcome(input: TrajectoryOutcomeInput, finishedAt: string): TrajectoryFailure | null {
    if (!isRecord(input)) return failure('outcome_invalid', 'outcome evidence is required');
    if (input.status !== 'succeeded' && input.status !== 'failed' && input.status !== 'stopped') return failure('outcome_invalid', 'outcome status is invalid');
    if (typeof input.complete !== 'boolean' || input.complete !== true) return failure('outcome_invalid', 'a terminal outcome must explicitly be complete');
    if (typeof input.observed !== 'boolean' || input.observed !== true) return failure('outcome_invalid', 'outcome must be explicitly observed');
    if (typeof input.verified !== 'boolean') return failure('outcome_invalid', 'verified must be an explicit boolean');
    const observedAt = canonicalTimestamp(input.observedAt);
    if (!observedAt) return failure('timestamp_invalid', 'outcome observedAt must be a canonical UTC ISO timestamp');
    if (timestampMs(observedAt) < timestampMs(finishedAt)) return failure('timestamp_order', 'outcome evidence cannot precede finishedAt');
    if (!validEvidence(input.evidence)) return failure('outcome_invalid', 'outcome evidence must contain a non-empty verifier source and checks');
    if (input.verified === true) {
      if (!validBoundedString(input.verifiedBy, /^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/, TRAJECTORY_LIMITS.maxEvidenceSourceChars)) {
        return failure('outcome_invalid', 'verified outcomes require an explicit non-text verifier identity');
      }
      if (UNSAFE_EVIDENCE_SOURCES.has(input.verifiedBy.toLowerCase())) return failure('outcome_invalid', 'assistant/model text cannot verify an outcome');
    }
    if (input.evidence.details !== undefined && validateStructured(input.evidence.details, '$.outcome.evidence.details')) {
      return failure('structured_value_invalid', 'outcome evidence details must be bounded structured JSON');
    }
    const expiresAt = this.consentGrant.expiresAt;
    if (expiresAt !== undefined && timestampMs(finishedAt) > timestampMs(expiresAt)) return failure('consent_invalid', 'run finished after the consent grant expired');
    return null;
  }
}
