/**
 * Pure adapters for the Sources, Inline Citation, Suggestion and Agent renderers.
 *
 * Every field comes from the turn's real tool events or from real wire facts. The wire carries no
 * source records with paths, hashes or line ranges, so none are produced: a source here is a lookup
 * tool that FINISHED OK, named with the vocabulary's own sentence. Nothing here implies live browsing.
 */
import { PRODUCT_MODEL_INFO, type StudioPlace } from '@apple/shared';
import { kindForTool, labelForTool } from '../tool-vocabulary.ts';

export interface ToolLike {
  toolId: string;
  tool: string;
  summary: string;
  target?: string;
  ok?: boolean;
  done: boolean;
}

export interface SourceRow {
  id: string;
  title: string;
  note?: string;
}

/** Lookups that read Apple's own knowledge and libraries. `browsing` is left out: not authorised provenance. */
export function sourcesFromTools(tools: readonly ToolLike[] | undefined): SourceRow[] {
  const seen = new Set<string>();
  const rows: SourceRow[] = [];
  for (const t of tools ?? []) {
    if (!t.done || t.ok !== true) continue;
    const kind = kindForTool(t.tool);
    if (kind !== 'searching_knowledge' && kind !== 'searching_assets') continue;
    if (seen.has(t.toolId)) continue;
    seen.add(t.toolId);
    const note = (t.target ?? t.summary)?.trim();
    rows.push({ id: t.toolId, title: labelForTool(t.tool), ...(note ? { note } : {}) });
  }
  return rows;
}

export interface CitationRow extends SourceRow {
  /** 1-based, stable for the turn. */
  n: number;
}

export const citationsFromTools = (tools: readonly ToolLike[] | undefined): CitationRow[] =>
  sourcesFromTools(tools).map((s, i) => ({ ...s, n: i + 1 }));

export interface SuggestionRow {
  label: string;
  prompt: string;
}

/** Follow-ups implied by how the turn really ended. A finished or running turn offers none. */
export function suggestionsForTurn(turn: { streaming?: boolean; stopReason?: string } | undefined): SuggestionRow[] {
  if (!turn || turn.streaming) return [];
  if (turn.stopReason === 'incomplete') return [{ label: 'Continue where you stopped', prompt: 'Continue where you stopped.' }];
  if (turn.stopReason === 'error') return [{ label: 'Try that again', prompt: 'Try that again.' }];
  return [];
}

export interface AgentCard {
  name: string;
  blurb: string;
  place: string | null;
  connected: boolean | null;
  denied: string[];
}

/** Absent everything → null, so no empty card. */
export function agentCard(input: {
  productModel?: string;
  studioConnected?: boolean;
  place?: StudioPlace | null;
  deniedTools?: string[];
}): AgentCard | null {
  const info = input.productModel ? (PRODUCT_MODEL_INFO as Record<string, { name: string; blurb: string } | undefined>)[input.productModel] : undefined;
  if (!info) return null;
  const placeName = input.place?.placeName?.trim();
  return {
    name: info.name,
    blurb: info.blurb,
    place: placeName || null,
    connected: typeof input.studioConnected === 'boolean' ? input.studioConnected : null,
    denied: (input.deniedTools ?? []).map((t) => labelForTool(t)),
  };
}
