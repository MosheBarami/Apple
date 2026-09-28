/**
 * Pure adapters for UI06 Tool, UI01 Reasoning, UI02 Shimmer, UI21 Streaming Text.
 *
 * Input is only what the socket really carries: a ToolEvent (tool_start/tool_end) and an AgentStatus
 * (agent_status). Nothing is invented; a missing value stays undefined and the view says so.
 */
import type { AgentStatus, ToolEvent } from '../../../lib/use-project-socket';
import { phasePhrase } from '../../../lib/live-status';

const REDACTED = '[redacted]';
const SECRET_KEY = /token|secret|passw|api[-_]?key|authorization|cookie|credential|private[-_]?key|session|bearer|roblosecurity/i;
const SECRET_VALUE: RegExp[] = [
  /\bBearer\s+[\w.~+/=-]{8,}/gi,
  /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}/g, // JWT
  /\b(?:sk|pk|rk|ghp|gho|github_pat|xox[abp]|AKIA)[-_A-Za-z0-9]{12,}/g,
  /_\|WARNING:[^\s"']+/g, // .ROBLOSECURITY
  /([?&](?:token|key|api_key|apikey|secret|sig|signature|access_token)=)[^&\s"']+/gi,
  /\b[A-Fa-f0-9]{40,}\b/g,
  /\b[A-Za-z0-9+/_-]{48,}={0,2}/g,
];

/** Mask anything token/key-like inside one string. */
export function redactString(s: string): string {
  let out = s;
  for (const re of SECRET_VALUE) out = out.replace(re, (m, p1) => (typeof p1 === 'string' && m.startsWith(p1) ? p1 + REDACTED : REDACTED));
  return out;
}

const MAX_ITEMS = 20;
const MAX_DEPTH = 6;
export const MAX_DETAIL_CHARS = 2000;

/** Deep copy with secret keys and token-like strings masked and large arrays cut. */
export function redactValue(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return redactString(v);
  if (v === null || typeof v !== 'object') return v;
  if (depth >= MAX_DEPTH) return '[nested]';
  if (Array.isArray(v)) {
    const head = v.slice(0, MAX_ITEMS).map((x) => redactValue(x, depth + 1));
    return v.length > MAX_ITEMS ? [...head, `... ${v.length - MAX_ITEMS} more`] : head;
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = SECRET_KEY.test(k) ? REDACTED : redactValue(x, depth + 1);
  return out;
}

export interface ToolView {
  toolId: string;
  name: string;
  state: 'input-available' | 'output-available' | 'output-error';
  summary: string;
  target?: string;
  /** Redacted, truncated JSON of `detail`; undefined when the result carried none. */
  detail?: string;
  truncated: boolean;
  durationMs?: number;
  /** True when the tool ended without reporting ok/failed. */
  outcomeUnavailable: boolean;
}

export function toolView(t: ToolEvent | undefined): ToolView | null {
  if (!t || !t.tool) return null;
  let detail: string | undefined;
  let truncated = false;
  if (t.detail !== undefined && t.detail !== null) {
    let json: string | undefined;
    try {
      json = JSON.stringify(redactValue(t.detail), null, 2);
    } catch {
      json = undefined;
    }
    if (json !== undefined) {
      truncated = json.length > MAX_DETAIL_CHARS;
      detail = truncated ? json.slice(0, MAX_DETAIL_CHARS) : json;
    }
  }
  return {
    toolId: t.toolId,
    name: t.tool,
    state: !t.done ? 'input-available' : t.ok === false ? 'output-error' : 'output-available',
    summary: redactString(t.summary ?? ''),
    target: t.target ? redactString(t.target) : undefined,
    detail,
    truncated,
    durationMs: t.done ? t.durationMs : undefined,
    outcomeUnavailable: t.done && t.ok === undefined,
  };
}

export interface ReasoningView {
  phase: string;
  effort?: 'low' | 'medium' | 'high';
  reason?: string;
}

/** Public summary only: the policy's own one-line effortReason and the phase wording. */
export function reasoningView(s: AgentStatus | null | undefined): ReasoningView | null {
  if (!s || !s.phase) return null;
  const reason = s.effortReason?.trim();
  return { phase: phasePhrase(s.phase), effort: s.effort, reason: reason ? redactString(reason) : undefined };
}
