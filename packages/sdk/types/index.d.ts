// The TypeScript surface of @golem/sdk.
//
// HAND-WRITTEN, AND WHY. The runtime is plain JavaScript (../src/*.mjs) so that a browser,
// a Worker, Node and the `apple` binary all load the same bytes with no build step. A
// declaration file is then the only way TypeScript callers get types — and it is a second
// description of one thing, which is drift waiting to happen. Two tests hold it to the
// implementation:
//
//   tests/types.test.mjs  — the declared names and the runtime exports must be the same
//                           set, and a deliberately WRONG call must fail to compile.
//   tests/protocol-parity.test.mjs — the runtime allowlists must equal the unions in
//                           @golem/shared.
//
// The wire types are IMPORTED from @golem/shared rather than restated. A client that
// redeclared `MessageDto` would become a second definition of the wire format, and the two
// would disagree the first time either changed.
import type {
  CheckpointMeta,
  ClientMsg,
  ProductMode,
  MessageDto,
  OpResult,
  PairingCodeDto,
  PendingOp,
  PlanId,
  PluginPollResponse,
  QuotaState,
  ServerMsg,
  StudioEvent,
  StudioEventState,
} from '@golem/shared';

export type { CheckpointMeta, ClientMsg, ProductMode, MessageDto, PlanId, QuotaState, ServerMsg };

// ------------------------------------------------------------------- numbers

export function isFiniteNumber(value: unknown): value is number;
export function finiteNumber(
  value: unknown,
  fallback: number,
  range?: { min?: number; max?: number },
): number;
export function finiteInt(value: unknown, fallback: number, range?: { min?: number; max?: number }): number;
export function retryAfterSeconds(raw: unknown): number | null;

// -------------------------------------------------------------------- errors

export class ApiError extends Error {
  constructor(
    message: string,
    status: number,
    options?: { body?: unknown; retryAfter?: number | null; attempts?: number; cause?: unknown },
  );
  /** 0 for a transport failure; otherwise the HTTP status the worker answered with. */
  readonly status: number;
  readonly body: unknown;
  readonly retryAfter: number | null;
  readonly attempts: number;
  readonly isTransport: boolean;
}

export function shouldRetry(input: {
  method: string;
  status: number;
  attempt: number;
  maxAttempts: number;
  retryNonIdempotent?: boolean;
}): boolean;

export function backoffMs(
  attempt: number,
  options?: { retryAfter?: number | string | null; jitter?: () => number; base?: number; cap?: number },
): number;

export function messageFromBody(body: unknown, status: number): string;

// ---------------------------------------------------------------------- wire

export const WS_SUBPROTOCOL: 'golem.v1';
export const WS_JWT_PREFIX: 'golem.jwt.';
export const DEFAULT_BASE_URL: string;
export const MODES: readonly ProductMode[];
export const PRESENCE_ACTIVITIES: readonly ('viewing' | 'typing' | 'building')[];
export const CLIENT_MSG_TYPES: readonly ClientMsg['type'][];
export const HEADERS: Readonly<{
  auth: 'Authorization';
  adminKey: 'X-Admin-Key';
  studioToken: 'X-Golem-Token';
  pluginVersion: 'X-Golem-Plugin-Version';
  pluginProtocol: 'X-Golem-Plugin-Protocol';
}>;
export function isProjectId(value: unknown): value is string;
export function projectPath(projectId: string, suffix?: string): string;
export function socketUrl(baseUrl: string, projectId: string): string;
export function socketProtocols(token: string): [string, string];
export function normalizeBaseUrl(baseUrl?: string): string;

// ----------------------------------------------------------------- transport

/** A string, or a function returning one (possibly async) for a session that refreshes. */
export type TokenSource = string | null | (() => string | null | Promise<string | null>);

export interface TransportOptions {
  baseUrl?: string;
  token?: TokenSource;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  jitter?: () => number;
  headers?: Record<string, string>;
}

export interface RequestInitLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  token?: TokenSource;
  as?: 'json' | 'text' | 'bytes';
  retryNonIdempotent?: boolean;
  signal?: AbortSignal;
}

export interface RawResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
  attempts: number;
}

export interface Transport {
  readonly baseUrl: string;
  request<T = unknown>(path: string, init?: RequestInitLike): Promise<T>;
  raw<T = unknown>(path: string, init?: RequestInitLike): Promise<RawResponse<T>>;
}

export function createTransport(options?: TransportOptions): Transport;

// -------------------------------------------------------------------- client

export const PLAN_IDS: readonly PlanId[];
export function filenameFromDisposition(raw: unknown): string | null;

export interface HealthResponse {
  ok: boolean;
  version: string;
  buildSha: string;
  time: string;
}

export interface MeResponse {
  userId: string;
  email: string | null;
  profile: { id: string; plan: string; is_admin: boolean; display_name: string | null } | null;
  quota: QuotaState;
  service?: { capacityRemaining: number; paused: boolean };
}

export interface UsageDay {
  day: string;
  credits: number;
  events: number;
}

export interface Memory {
  summary: string | null;
  facts: string[];
}

export interface MemoryResponse {
  memory: Memory;
  editedAt: string | null;
}

export interface ExportedTranscript {
  filename: string;
  contentType: string;
  body: string;
}

export interface AppleClientOptions extends TransportOptions {
  transport?: Transport;
  adminKey?: string;
}

export class AppleClient {
  constructor(options?: AppleClientOptions);
  readonly baseUrl: string;
  readonly transport: Transport;
  health(): Promise<HealthResponse>;
  providers(): Promise<{ ready: boolean; models: unknown[]; auto: { model: string | null; reasoning: string } }>;
  me(): Promise<MeResponse>;
  usage(): Promise<{ days: UsageDay[] }>;
  searchDocs(query: string): Promise<{ hits: unknown[]; error?: string }>;
  billingConfig(): Promise<{ checkout: boolean; purchasable: PlanId[] }>;
  startCheckout(plan: PlanId): Promise<{ url: string }>;
  billingPortal(): Promise<{ url: string }>;
  messages(projectId: string, options?: { limit?: number }): Promise<{ messages: MessageDto[] }>;
  searchConversation(projectId: string, query: string): Promise<unknown>;
  memory(projectId: string): Promise<MemoryResponse>;
  saveMemory(projectId: string, memory: Memory): Promise<MemoryResponse>;
  checkpoints(projectId: string): Promise<{ checkpoints: CheckpointMeta[] }>;
  createCheckpoint(projectId: string, label?: string): Promise<unknown>;
  restoreCheckpoint(projectId: string, checkpointId: string): Promise<unknown>;
  purge(projectId: string): Promise<{ ok: boolean }>;
  createPairingCode(projectId: string): Promise<PairingCodeDto>;
  attribution(projectId: string): Promise<unknown>;
  roadmap(projectId: string, options?: { polish?: boolean }): Promise<unknown>;
  nextMilestones(projectId: string): Promise<unknown>;
  milestoneBrief(projectId: string, milestoneId: string): Promise<unknown>;
  exportTranscript(projectId: string, format?: 'json' | 'md'): Promise<ExportedTranscript>;
  image(projectId: string, imageId: string): Promise<Uint8Array>;
  admin<T = unknown>(path: string, init?: RequestInitLike): Promise<T>;
  adminStats(): Promise<{ counters: { day: string; key: string; value: number }[] }>;
  adminSpend(): Promise<unknown>;
}

// -------------------------------------------------------------------- studio

export function isStudioToken(token: unknown): token is string;
export function pollWaitMs(
  response: unknown,
  fallback?: number,
  range?: { min?: number; max?: number },
): number;

export class StudioSessionEnded extends Error {}

export interface StudioClientOptions extends TransportOptions {
  transport?: Transport;
  token?: string | null;
  version?: string | null;
  protocol?: number | null;
}

export interface StudioClaim {
  token: string;
  projectId: string;
  projectName: string;
}

export class StudioClient {
  constructor(options?: StudioClientOptions);
  readonly baseUrl: string;
  token: string | null;
  headers(extra?: Record<string, string>): Record<string, string>;
  claim(code: string): Promise<StudioClaim>;
  poll(payload?: { results?: OpResult[]; events?: StudioEvent[]; state?: StudioEventState }): Promise<PluginPollResponse>;
}

export type { OpResult, PendingOp, PluginPollResponse, StudioEvent, StudioEventState, PairingCodeDto };

// -------------------------------------------------------------------- stream

export const STOP_REASONS: readonly string[];

export interface RunTool {
  toolId: string;
  tool: string;
  summary: string;
  ok: boolean | null;
  detail?: unknown;
}

export interface Run {
  msgId: string | null;
  mode: ProductMode | null;
  autonomous?: boolean;
  text: string;
  tools: RunTool[];
  phase: string | null;
  stopReason: string | null;
  stopReasonRecognised: boolean;
  creditsSpent: number | null;
  error: string | null;
  done: boolean;
  /** Deltas that named a message this run is not assembling. Counted, never merged. */
  orphanDeltas: number;
}

export function emptyRun(): Run;
export function applyServerMsg(run: Run, msg: ServerMsg | { type: string; [k: string]: unknown }): Run;
export function parseServerMsg(raw: unknown): ServerMsg | null;
export function validateClientMsg<T extends ClientMsg>(msg: T): T;

/** The minimum a socket must provide. The platform `WebSocket` satisfies it. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen?: ((event: unknown) => void) | null;
  onmessage?: ((event: { data: unknown }) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  onclose?: ((event: unknown) => void) | null;
}

export interface SessionStreamOptions {
  baseUrl: string;
  projectId: string;
  token: string;
  socketFactory?: (url: string, protocols: string[]) => SocketLike;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  jitter?: () => number;
  maxReconnects?: number;
}

export class SessionStream {
  constructor(options: SessionStreamOptions);
  readonly url: string;
  run: Run;
  connect(): this;
  on(type: string, handler: (payload: never, type?: string) => void): () => void;
  off(type: string, handler: (payload: never, type?: string) => void): void;
  send(msg: ClientMsg): boolean;
  sendChat(text: string, mode?: ProductMode, autonomous?: boolean): boolean;
  editAndResend(messageId: string, text: string, mode?: ProductMode, autonomous?: boolean): boolean;
  stop(): boolean;
  resume(): boolean;
  ping(): boolean;
  presence(activity: 'viewing' | 'typing' | 'building'): boolean;
  createCheckpoint(label?: string): boolean;
  restoreCheckpoint(checkpointId: string): boolean;
  close(code?: number, reason?: string): void;
  waitForRun(): Promise<Run>;
}

// ----------------------------------------------------------------------- cli

export interface CommandSpec {
  args: string[];
  flags?: Record<string, 'string' | 'number' | 'boolean'>;
  destructive?: boolean;
  describe: string;
}

export const COMMANDS: Readonly<Record<string, CommandSpec>>;

export class UsageError extends Error {}

export interface ParsedArgs {
  command: string | null;
  args: string[];
  flags: Record<string, string | number | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs;
export function helpText(): string;

export const SDK_VERSION: string;
