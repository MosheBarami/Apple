/**
 * WHAT AN EXPORT SAYS WHILE IT IS HAPPENING.
 *
 * Exporting a conversation fired one toast — "Preparing <project> as Markdown…" — and then said
 * nothing ever again: no completion, no size, and no way to tell a slow download from a dead one.
 * The three lines below are the whole of what the user is told, kept in one module so they cannot
 * drift apart: the row that starts is the row that updates and the row that reports the file.
 *
 * Pure and DOM-free so `tests/export-progress.test.mjs` runs it under `node --test`, because the
 * rule worth asserting is the one every progress meter gets wrong:
 *
 *   A TOTAL THAT WAS NEVER DECLARED IS NOT ZERO. `Content-Length` is absent on a chunked response,
 *   so `received / total` is `n / 0` — Infinity — and `Math.round(Infinity * 100)` prints as NaN%
 *   or as a bar that is instantly full. An absent total is `null`, it is a different sentence, and
 *   it says how much has ARRIVED, which is the only honest thing left to say.
 *
 *   A PERCENTAGE OVER 100 IS A MEASUREMENT FAULT, NOT A NUMBER TO SHOW. The bytes are counted after
 *   the browser has decompressed them while `Content-Length` describes the compressed body, so a
 *   gzipped export legitimately "receives" more than was "sent". Clamped rather than printed.
 *
 * Explicit .ts extension on the import, like lib/format.ts's own, so node's type stripping can load
 * this module directly with no build step in between.
 */
import { formatBytes } from './format.ts';

export type ExportFormat = 'md' | 'json';

export interface ExportProgress {
  /** Bytes read from the body so far. */
  received: number;
  /** What the server declared it was sending, or null when it declared nothing. */
  total: number | null;
}

const FORMAT_NAME: Record<ExportFormat, string> = { md: 'Markdown', json: 'JSON' };

/** 0–100, or null when the total is missing, zero or unusable. Never NaN, never over 100. */
export function exportPercent(p: ExportProgress): number | null {
  const { received, total } = p;
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(received) || received < 0) return null;
  return Math.min(100, Math.round((received / total) * 100));
}

export function exportStartLine(projectName: string, format: ExportFormat): string {
  return `Preparing ${projectName} as ${FORMAT_NAME[format] ?? String(format)}…`;
}

export function exportProgressLine(projectName: string, format: ExportFormat, p: ExportProgress): string {
  const pct = exportPercent(p);
  const head = `Preparing ${projectName} as ${FORMAT_NAME[format] ?? String(format)}`;
  if (pct === null) {
    // No denominator, so no proportion — the amount received is a fact, and a fact is better than
    // a fabricated fraction.
    const got = formatBytes(Math.max(0, Number.isFinite(p.received) ? p.received : 0));
    return `${head} — ${got} so far`;
  }
  return `${head} — ${pct}%`;
}

/** The end of the same row: the name the SERVER gave the file, not one invented here. */
export function exportDoneLine(filename: string): string {
  return `Saved ${filename}`;
}

/**
 * One key per project-and-format, so a progress row REPLACES itself instead of stacking.
 *
 * Without this every percentage is a new toast and a download becomes a column of forty rows. Two
 * exports of the same project in different formats are two events and get two rows.
 */
export function exportToastKey(projectId: string, format: ExportFormat): string {
  return `export:${projectId}:${format}`;
}
