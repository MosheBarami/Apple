// Provider-neutral vocabulary for the model layer.
//
// Everything the gateway needs to talk to a model without knowing which company runs it lives
// here: the request/response shapes, the capability record, the availability verdict, and the
// error taxonomy. Adapters translate between this vocabulary and one provider's wire format.
//
// This file is the ONLY place a shared type is introduced for the provider layer; the rest of the
// worker imports it from `./providers`.
import type { Env } from '../env';
import type { GatewayContentPart, GatewayMessage, GatewayToolCall, GatewayToolDef } from '@golem/shared';

export type { GatewayContentPart, GatewayMessage, GatewayToolCall, GatewayToolDef };

// ---------------------------------------------------------------------------
// identity
// ---------------------------------------------------------------------------

/** Providers credentialed by THIS worker's own secrets: the registry's domain. */
export type PlatformProviderId = 'workers-ai';

export type ProviderId = PlatformProviderId;

/**
 * Fixed iteration order. Auto-selection sorts on cost and breaks ties with this list, so the
 * choice is deterministic rather than dependent on object key order.
 */
export const PROVIDER_ORDER: readonly PlatformProviderId[] = ['workers-ai'];

// ---------------------------------------------------------------------------
// capability metadata
// ---------------------------------------------------------------------------

export interface ProviderModel {
  id: string;
  displayName: string;
  provider: ProviderId;
  supportsTools: boolean;
  supportsVision: boolean;
  contextWindow: number;
  maxOutput: number;
  /** USD per 1M input tokens, as published by the provider */
  inputCostPer1M: number;
  /** USD per 1M output tokens, as published by the provider */
  outputCostPer1M: number;
  /**
   * Names of fields on THIS record that are conservative placeholders rather than numbers taken
   * from the provider's own documentation. Honesty has to be structural: a disabled provider whose
   * context window was guessed says so here instead of pretending to a precision it does not have.
   * Empty when every field is documented. A production route may still carry an explicitly named
   * conservative field when the provider does not publish that limit.
   */
  unverifiedFields: readonly string[];
}

/**
 * What each internal model key needs from whatever serves it. Mirrors DEFAULT_MODELS in gateway.ts:
 * `nativeTools` there is `tools` here, and `vision` is the only key that is ever handed an image.
 * Used to answer "can this provider serve this key at all?" without running anything.
 */
export const MODEL_KEY_NEEDS: Record<string, { tools: boolean; vision: boolean }> = {
  plan: { tools: true, vision: false },
  agent: { tools: true, vision: false },
  memory: { tools: false, vision: false },
  vision: { tools: false, vision: true },
};

// ---------------------------------------------------------------------------
// availability
// ---------------------------------------------------------------------------

/** Why a provider is not usable. `null` reason means it IS usable. */
export type UnavailableReason = 'no_credentials' | 'binding_missing';

export interface UnsupportedModelKey {
  key: string;
  reason: 'no_vision' | 'no_tools';
}

export interface ProviderAvailability {
  provider: ProviderId;
  /** computed from env at call time — never a literal in a table */
  available: boolean;
  reason: UnavailableReason | null;
  /** one sentence a UI can show verbatim */
  detail: string;
  /**
   * Model keys this provider could not serve even with credentials, because the model lacks a
   * capability the key requires (a text-only model reports `vision` here).
   */
  unsupportedModelKeys: UnsupportedModelKey[];
}

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

export type ProviderErrorKind =
  | 'rate_limit'
  | 'auth'
  | 'context_length'
  | 'content_filter'
  | 'transient'
  | 'unknown';

export interface ErrorClassification {
  kind: ProviderErrorKind;
  /**
   * True only when the provider refused BEFORE running the model, so nothing was billed and a
   * retry is free. This is deliberately separate from `kind`: a spent-quota refusal is still a
   * rate limit, but retrying it inside the same minute buys nothing.
   */
  retryable: boolean;
}

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly provider: ProviderId,
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ---------------------------------------------------------------------------
// request / response
// ---------------------------------------------------------------------------

export interface NormalizedRequest {
  /** the provider's own model id, already resolved from the internal model key */
  modelId: string;
  messages: GatewayMessage[];
  /**
   * Only present when the caller wants NATIVE tool calling. The prompted-tool fallback is a
   * gateway-level policy that rewrites messages before it reaches an adapter, so an adapter never
   * has to know about it.
   */
  tools?: GatewayToolDef[];
  /** Narrow a native finite workflow to an already offered tool. */
  requiredTool?: string;
  maxTokens: number;
  temperature: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  jsonSchema?: unknown;
  /** Workers AI fine-tune (LoRA adapter) to serve on top of modelId; other providers ignore it. */
  lora?: string;
}

export interface EncodedRequest {
  /** the provider's wire payload, opaque to everything above the adapter */
  payload: unknown;
  /**
   * Characters the pre-flight budget reservation is charged against. The adapter computes it
   * because only the adapter knows how big its own encoded tool definitions are.
   */
  promptChars: number;
}

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  /** neurons as reported by the provider, when it reports them — this is the billing truth */
  reportedNeurons?: number;
}

/** Shape-compatible with GatewayResponse: the gateway can build one from this without inventing fields. */
export interface NormalizedResponse {
  text: string;
  toolCalls: GatewayToolCall[];
  usage: NormalizedUsage;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  /**
   * The provider said the response was CUT at its output ceiling (finish_reason `length`,
   * `MAX_TOKENS`), whatever `finishReason` reports. `finishReason` answers "is there a tool call to
   * run", so it says `tool_calls` for a response that ends mid-way through one — and on 2026-09-22 a
   * create_instances call guillotined at 6,500 tokens was executed, failed, and its unparseable
   * arguments were sent back to the provider, which rejected the next request and ended two real
   * builds with nothing built. The gateway reads this to drop incomplete calls.
   */
  truncated?: boolean;
  provider: ProviderId;
  model: string;
}

export interface InvokeContext {
  modelId: string;
  /** spend-attribution label, forwarded to AI Gateway metadata where the provider supports it */
  kind: string;
  cacheTtl: number;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// the adapter contract
// ---------------------------------------------------------------------------

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly models: readonly ProviderModel[];
  /** computed from env every time; never cached, never hardcoded */
  availability(env: Env): ProviderAvailability;
  encode(req: NormalizedRequest): EncodedRequest;
  invoke(env: Env, payload: unknown, ctx: InvokeContext): Promise<unknown>;
  decode(raw: unknown, promptChars: number, modelId: string): NormalizedResponse;
  classifyError(e: unknown): ErrorClassification;
}

// ---------------------------------------------------------------------------
// small shared helpers
// ---------------------------------------------------------------------------

/**
 * Character weight of a message for the pre-flight reservation. Image parts are costed by their
 * base64 length, which over-states what a vision model actually charges for a small frame — the
 * safe direction, since under-reserving is the only way a bill escapes.
 */
export function contentChars(content: string | GatewayContentPart[]): number {
  if (typeof content === 'string') return content.length;
  return content.reduce(
    (n, p) => n + ('text' in p ? p.text.length : 0) + ('image_url' in p ? p.image_url.url.length : 0),
    0,
  );
}

/** Flatten mixed content to plain text. Used by providers that cannot take an image on a given path. */
export function contentText(content: string | GatewayContentPart[]): string {
  if (typeof content === 'string') return content;
  return content.map((p) => ('text' in p ? p.text : '[image]')).join('\n');
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
