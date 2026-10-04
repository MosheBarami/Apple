/**
 * SOURCES a run used, for the web app's AI Elements Sources and the answer's [n] citations (owner, 2026-10-01: "I want
 * the agent to know the full Roblox Creator Store and docs API and cite the docs and links").
 *
 * Read from what tools actually returned, never invented: a Creator Docs page a search returned (create.roblox.com/docs),
 * a Creator Store model or sound a search returned (its store page), a creation skill's official references.
 */
import type { RunSource } from '@studpilot/shared';

const DOCS = /^https:\/\/create\.roblox\.com\/docs\//;
const MAX_PER_CALL = 8;

/** The sources in one tool result. Pure. */
export function sourcesIn(tool: string, result: unknown): RunSource[] {
  const out: RunSource[] = [];
  const seen = new Set<string>();
  const add = (s: RunSource) => { if (!seen.has(s.url) && out.length < MAX_PER_CALL) { seen.add(s.url); out.push(s); } };
  const store = tool === 'find_sound' || tool === 'insert_sound' || tool === 'find_library_model' || tool === 'insert_library_model' || tool === 'find_verified_asset';
  const walk = (v: unknown, depth: number) => {
    if (depth > 5 || out.length >= MAX_PER_CALL || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const o = v as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title : typeof o.name === 'string' ? o.name : undefined;
    if (typeof o.url === 'string' && DOCS.test(o.url) && title) add({ title: title.slice(0, 120), url: o.url, kind: 'docs' });
    const id = typeof o.assetId === 'number' ? o.assetId : typeof o.assetId === 'string' && /^\d{1,20}$/.test(o.assetId) ? Number(o.assetId) : undefined;
    if (store && id && title) {
      const sound = tool === 'find_sound' || tool === 'insert_sound';
      add({ title: title.slice(0, 120), url: `https://create.roblox.com/store/asset/${id}`, kind: 'creator_store', note: sound ? 'sound' : 'model' });
    }
    for (const [k, x] of Object.entries(o)) if (k !== 'excerpt' && k !== 'source') walk(x, depth + 1);
  };
  walk(result, 0);
  return out;
}

/** Adds sources to the run's list (deduplicated by url) and returns their 1-based numbers, in order. Pure on `list`. */
export function addSources(list: RunSource[], fresh: RunSource[]): number[] {
  return fresh.map((s) => {
    const at = list.findIndex((x) => x.url === s.url);
    if (at >= 0) return at + 1;
    list.push(s);
    return list.length;
  });
}
