// OpenRouter — the provider a customer's OWN key runs through (owner decisions D-BYOK-1, D-FREE-1).
//
// OpenRouter speaks OpenAI Chat Completions at https://openrouter.ai/api/v1, so the wire shape is
// the one openai.ts already encodes and decodes: tool calls, `finish_reason: "length"` (which the
// decoder turns into the `truncated` flag the gateway uses to drop half-written tool calls) and
// `usage.prompt_tokens` / `completion_tokens`. Checked against openrouter.ai/docs on 2026-09-23:
// the endpoint, `max_tokens`, `tools`, `response_format`, the normalised finish reasons
// (`tool_calls`, `stop`, `length`, `content_filter`, `error`), the attribution headers
// `HTTP-Referer` and `X-Title`, and `GET /api/v1/key` answering 401 for a bad key.
//
// WHAT IS DIFFERENT FROM THE OTHER ADAPTERS, AND WHY IT IS NOT IN THE REGISTRY.
//
// Every registered adapter is credentialed by one of THIS worker's secrets, so "is it available"
// has one answer for everybody. OpenRouter is credentialed by whoever is asking: the key arrives
// per call in `InvokeContext.customerApiKey`, decrypted for that run only (model-keys.ts), and
// nothing here reads env for it. Registering it would make auto-selection and the capability
// table claim something about every customer that is true only of some.
//
// THE KEY NEVER LEAVES THIS FILE IN ANY FORM. It goes into one Authorization header. Every error
// built here is a sentence this file wrote plus, at most, OpenRouter's own error text with the key
// scrubbed out of it — the gateway logs failures and the session can show them to the customer.
import type { Env } from '../env';
import {
  ProviderError,
  type ErrorClassification,
  type InvokeContext,
  type NormalizedRequest,
  type NormalizedResponse,
  type ProviderAdapter,
  type ProviderAvailability,
  type EncodedRequest,
  errorMessage,
} from './types';
import { classifyHttpError, decodeOpenAiChat, encodeOpenAiChat } from './openai';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
/** Attribution, per OpenRouter's docs. The canonical public origin of the product. */
export const OPENROUTER_REFERER = 'https://apple.moshe-barami111.workers.dev';
export const OPENROUTER_TITLE = 'Apple';

/**
 * A failure the CUSTOMER can fix — their key was refused, their OpenRouter balance is empty.
 *
 * Its own class so the session can show the sentence as it is, instead of the generic "That step
 * failed on our side", which would be false: nothing on Apple's side failed.
 */
export class CustomerKeyError extends ProviderError {
  readonly customerFacing = true;
  constructor(kind: ProviderError['kind'], message: string, status?: number) {
    super(kind, 'openrouter', message, status, false);
    this.name = 'CustomerKeyError';
  }
}

export function isCustomerKeyError(e: unknown): e is CustomerKeyError {
  return !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'CustomerKeyError';
}

/** Remove every occurrence of the key (and of any `sk-or-…` token) from text headed for a log. */
export function scrubKey(text: string, apiKey: string | undefined): string {
  let out = String(text);
  if (apiKey && apiKey.length >= 4) out = out.split(apiKey).join('[key]');
  return out.replace(/sk-or-[A-Za-z0-9_-]+/g, '[key]');
}

function headers(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': OPENROUTER_REFERER,
    'X-Title': OPENROUTER_TITLE,
  };
}

/**
 * OpenRouter's Chat Completions body. The OpenAI encoder, with one field renamed: OpenRouter's
 * reasoning control is the nested `reasoning: { effort }`, and the docs list no top-level
 * `reasoning_effort`. The gateway does not send an effort on customer-key runs today, so this only
 * matters if it starts to.
 */
export function encodeOpenRouterChat(req: NormalizedRequest): EncodedRequest {
  const encoded = encodeOpenAiChat(req);
  const payload = { ...(encoded.payload as Record<string, unknown>) };
  if ('reasoning_effort' in payload) {
    payload.reasoning = { effort: payload.reasoning_effort };
    delete payload.reasoning_effort;
  }
  return { payload, promptChars: encoded.promptChars };
}

function errorText(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: unknown } };
    if (typeof j?.error?.message === 'string') return j.error.message;
  } catch {
    /* not JSON */
  }
  return body;
}

/** Turn an OpenRouter refusal into an error that says what happened and never carries the key. */
export function openRouterFailure(status: number, body: string, apiKey: string): ProviderError {
  const detail = scrubKey(errorText(body), apiKey).slice(0, 200);
  if (status === 401) {
    return new CustomerKeyError('auth', 'OpenRouter did not accept your key. Check it in Settings, or pick an Apple model.', status);
  }
  // 403 is NOT a bad key. OpenRouter's errors page (read 2026-09-23): "insufficient permissions,
  // guardrail block, or moderation flag". Telling a child their key is broken because a safety
  // filter flagged the prompt would send them to Settings to fix something that is fine.
  if (status === 403) {
    return new CustomerKeyError('content_filter', 'OpenRouter blocked this request. Try asking another way, or pick a different model.', status);
  }
  if (status === 402) {
    return new CustomerKeyError('unknown', 'Your OpenRouter account is out of credit. Top it up on openrouter.ai, or pick an Apple model.', status);
  }
  const cls = classifyHttpError(new ProviderError('unknown', 'openrouter', detail, status));
  return new ProviderError(cls.kind, 'openrouter', `openrouter HTTP ${status}: ${detail}`, status, cls.retryable);
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** POST one chat completion with the customer's key. */
export async function postOpenRouterChat(apiKey: string, payload: unknown, fetchImpl: FetchLike = fetch): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new ProviderError('transient', 'openrouter', `openrouter network error: ${scrubKey(errorMessage(e), apiKey).slice(0, 200)}`);
  }
  const body = await res.text().catch(() => '');
  if (!res.ok) throw openRouterFailure(res.status, body, apiKey);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ProviderError('transient', 'openrouter', 'openrouter returned a body that is not JSON');
  }
  // OpenRouter can answer 200 with an `error` object and no choices when the upstream provider
  // failed. Decoding that as an empty `stop` would render a failure as a finished, silent answer.
  const j = json as { choices?: unknown; error?: { code?: unknown; message?: unknown } };
  if (!Array.isArray(j.choices) && j.error) {
    const code = typeof j.error.code === 'number' ? j.error.code : 502;
    throw openRouterFailure(code, JSON.stringify({ error: { message: String(j.error.message ?? '') } }), apiKey);
  }
  return json;
}

/**
 * Is this key alive? `GET /api/v1/key` — authenticated, cheap, spends nothing.
 *
 * Three answers, not two: a network failure or an outage is `unchecked`, which is a different fact
 * from `invalid`, and the key route stores an unchecked key but refuses an invalid one.
 */
export async function checkOpenRouterKey(apiKey: string, fetchImpl: FetchLike = fetch): Promise<'valid' | 'invalid' | 'unchecked'> {
  try {
    const res = await fetchImpl(`${OPENROUTER_BASE_URL}/key`, { method: 'GET', headers: headers(apiKey) });
    if (res.ok) return 'valid';
    if (res.status === 401 || res.status === 403) return 'invalid';
    return 'unchecked';
  } catch {
    return 'unchecked';
  }
}

export const openrouterAdapter: ProviderAdapter = {
  id: 'openrouter',
  // Empty on purpose: the catalogue is read live (model-catalogue.ts), not declared here, and an
  // entry here would make `modelById` price a customer's call on Apple's ledger.
  models: [],

  availability(_env: Env): ProviderAvailability {
    return {
      provider: 'openrouter',
      available: false,
      reason: 'no_credentials',
      detail: 'OpenRouter runs only on a customer’s own key, supplied per run.',
      unsupportedModelKeys: [],
    };
  },

  encode: encodeOpenRouterChat,

  async invoke(_env: Env, payload: unknown, ctx: InvokeContext): Promise<unknown> {
    const key = ctx.customerApiKey?.trim();
    if (!key) throw new CustomerKeyError('auth', 'Add your OpenRouter key in Settings to use this model.');
    return postOpenRouterChat(key, payload);
  },

  decode(raw: unknown, promptChars: number, modelId: string): NormalizedResponse {
    return decodeOpenAiChat(raw, promptChars, modelId, 'openrouter');
  },

  classifyError(e: unknown): ErrorClassification {
    if (e instanceof ProviderError && e.provider === 'openrouter') return { kind: e.kind, retryable: e.retryable };
    return classifyHttpError(e);
  },
};
