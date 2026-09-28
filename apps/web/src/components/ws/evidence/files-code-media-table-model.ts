/**
 * Pure adapters for the files / code / media / table evidence renderers. Every input is a real run
 * shape (a `read_script` tool_end.detail, a StudioFrame, a BrandingArt, a validated table block, a
 * list of Studio paths); anything that is not there yields null, and the renderer draws nothing.
 * Types only are imported so `node --test` can bundle this without a DOM.
 */
import type { StudioFrame } from '@golem/shared';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

/* ------------------------------------------------------------------ UI18 / UI19: scripts --- */

export interface ScriptEvidence {
  path: string;
  className?: string;
  /** The worker's whole-file baseHash: the revision this source is. Absent means unavailable. */
  revision?: string;
  source: string;
  /** Present only when the detail is one page of a larger script. */
  page?: { startLine: number; endLine: number; totalLines: number };
}

/** A `read_script` / `edit_script` detail: `{ path, className?, source, baseHash?, complete?, ... }`. */
export function scriptOf(detail: unknown): ScriptEvidence | null {
  const d = rec(detail);
  const path = str(d?.path);
  const source = typeof d?.source === 'string' ? d.source : undefined;
  if (!d || !path || !source) return null;
  const { startLine, endLine, totalLines } = d as Record<string, unknown>;
  const paged = d.complete === false && [startLine, endLine, totalLines].every((n) => typeof n === 'number');
  return {
    path,
    className: str(d.className),
    revision: str(d.baseHash),
    source,
    page: paged ? { startLine: startLine as number, endLine: endLine as number, totalLines: totalLines as number } : undefined,
  };
}

/** The last segment of a Studio path, the name the header shows. */
export const leafName = (path: string): string => path.split('.').pop() || path;

/** A one-line reference worth copying: a path or short setting, never multi-line code. */
export function snippetOf(text: unknown): string | null {
  const t = typeof text === 'string' ? text.trim() : '';
  return t && !t.includes('\n') && t.length <= 200 ? t : null;
}

/* ------------------------------------------------------------------------ UI20: images --- */

export type ImageOrigin = 'capture' | 'attachment' | 'library_preview' | 'composed';

export const ORIGIN_LABEL: Record<ImageOrigin, string> = {
  capture: 'Studio capture',
  attachment: 'Your attachment',
  library_preview: 'Library preview',
  composed: 'Composed artwork',
};

export interface ImageEvidence {
  origin: ImageOrigin;
  base64: string;
  mediaType: string;
  alt: string;
  /** Where it came from, in the source's own words (view + subject, file name, asset name). */
  provenance?: string;
  /** Composed artwork is never test evidence; the renderer says so. */
  isTestEvidence: boolean;
}

/** Only PNG frames are an <img>; rgb24/rle24 need the canvas decoder and are unavailable here. */
export function captureImage(frame: StudioFrame | null | undefined): ImageEvidence | null {
  if (!frame || frame.encoding !== 'png' || !frame.rgbBase64) return null;
  return {
    origin: 'capture',
    base64: frame.rgbBase64,
    mediaType: 'image/png',
    alt: `Studio capture, ${frame.view} view of ${frame.subject}`,
    provenance: `${frame.view} view, ${frame.subject}`,
    isTestEvidence: frame.source === 'studio_viewport',
  };
}

/** Branding art composed by the worker from captures. */
export function composedImage(art: { base64: string; mediaType: string; label?: string } | null | undefined): ImageEvidence | null {
  if (!art?.base64 || !art.mediaType) return null;
  return {
    origin: 'composed',
    base64: art.base64,
    mediaType: art.mediaType,
    alt: art.label ?? 'Composed artwork',
    provenance: art.label,
    isTestEvidence: false,
  };
}

/** Bytes fetched for a chat attachment or an asset-library preview by the caller. */
export function fetchedImage(
  origin: 'attachment' | 'library_preview',
  bytes: { base64: string; mediaType: string } | null | undefined,
  name?: string,
): ImageEvidence | null {
  if (!bytes?.base64 || !bytes.mediaType.startsWith('image/')) return null;
  return { origin, ...bytes, alt: name ?? ORIGIN_LABEL[origin], provenance: name, isTestEvidence: false };
}

/* ------------------------------------------------------------------------- UI22: tables --- */

export const MAX_TABLE_ROWS = 50;

export interface TableEvidence {
  caption?: string;
  columns: string[];
  rows: string[][];
  /** Rows the source had beyond MAX_TABLE_ROWS. */
  hidden: number;
}

/** A validated table block (or any `{columns, rows}` real results). Empty rows means nothing to draw. */
export function tableOf(t: { columns?: unknown; rows?: unknown; caption?: string } | null | undefined): TableEvidence | null {
  if (!t || !Array.isArray(t.columns) || !Array.isArray(t.rows) || t.columns.length === 0 || t.rows.length === 0) return null;
  const columns = t.columns.map(String);
  const rows = (t.rows as unknown[]).map((r) => (Array.isArray(r) ? r : []).map((c) => (c == null || c === '' ? 'unavailable' : String(c))));
  return { caption: t.caption, columns, rows: rows.slice(0, MAX_TABLE_ROWS), hidden: Math.max(0, rows.length - MAX_TABLE_ROWS) };
}

/* -------------------------------------------------------------------------- UI23: tree --- */

export interface TreeRow {
  path: string;
  name: string;
  level: number;
  kind: 'folder' | 'file';
  /** True for the paths the run touched, false for the ancestors that only hold them. */
  affected: boolean;
}

/** Affected Studio paths ("game.Workspace.Lobby.Door") folded into reading-order rows with ancestors. */
export function treeOf(paths: readonly unknown[] | null | undefined): TreeRow[] | null {
  const valid = [...new Set((paths ?? []).filter((p): p is string => typeof p === 'string' && /^\w+(\.[^.\s][^.]*)*$/.test(p)))];
  if (valid.length === 0) return null;
  const affected = new Set(valid);
  const all = new Set<string>();
  for (const p of valid) {
    const parts = p.split('.');
    for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join('.'));
  }
  const sorted = [...all].sort((a, b) => a.split('.').join('\u0000').localeCompare(b.split('.').join('\u0000')));
  return sorted.map((path) => ({
    path,
    name: leafName(path),
    level: path.split('.').length,
    kind: sorted.some((o) => o.startsWith(`${path}.`)) ? 'folder' : 'file',
    affected: affected.has(path),
  }));
}

/** Paths a tool detail names: `{ paths: string[] }` or `{ path: string }`. */
export function pathsOf(detail: unknown): string[] {
  const d = rec(detail);
  if (!d) return [];
  const list = Array.isArray(d.paths) ? d.paths.filter((p): p is string => typeof p === 'string') : [];
  return str(d.path) ? [...list, d.path as string] : list;
}
