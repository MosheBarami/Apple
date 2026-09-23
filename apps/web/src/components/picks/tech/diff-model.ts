/**
 * TWO VERSIONS OF A FILE, LINE BY LINE.
 *
 * Drawn by the Eldora UI "GitHub Inline Comments" pick (MIT): a unified diff with old and new line
 * numbers, a hunk header, and a comment bubble on any line. This module is the diff; the component
 * is version-diff.tsx.
 *
 * A PLAIN LONGEST-COMMON-SUBSEQUENCE, and a ceiling. The drawer's files are notes and scripts, a few
 * hundred lines at most, and an LCS table over two such files is small. Past the ceiling the answer
 * is `null` and the drawer says the files are too long to compare here — a diff computed on a
 * truncated copy would show lines as removed that were only cut.
 */

export type DiffKind = 'ctx' | 'add' | 'del' | 'hunk';

export interface DiffLine {
  kind: DiffKind;
  /** Line number in the older version; null for an added line and for a hunk header. */
  oldNo: number | null;
  /** Line number in the newer version; null for a removed line and for a hunk header. */
  newNo: number | null;
  text: string;
}

export interface FileDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
}

/** Lines per side beyond which no diff is attempted. */
export const MAX_DIFF_LINES = 2_000;
/** Unchanged lines kept on each side of a change. */
export const DIFF_CONTEXT = 3;

const split = (s: string) => (s === '' ? [] : s.replace(/\r\n/g, '\n').split('\n'));

export function diffLines(older: string, newer: string, context = DIFF_CONTEXT): FileDiff | null {
  const a = split(older);
  const b = split(newer);
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) return null;

  // LCS lengths from the end, so the walk below reads forwards.
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const table = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * w + j] = a[i] === b[j]
        ? (table[(i + 1) * w + j + 1] ?? 0) + 1
        : Math.max(table[(i + 1) * w + j] ?? 0, table[i * w + j + 1] ?? 0);
    }
  }

  const all: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      all.push({ kind: 'ctx', oldNo: i + 1, newNo: j + 1, text: a[i] ?? '' });
      i++;
      j++;
    } else if (j < m && (i >= n || (table[i * w + j + 1] ?? 0) >= (table[(i + 1) * w + j] ?? 0))) {
      all.push({ kind: 'add', oldNo: null, newNo: j + 1, text: b[j] ?? '' });
      added++;
      j++;
    } else {
      all.push({ kind: 'del', oldNo: i + 1, newNo: null, text: a[i] ?? '' });
      removed++;
      i++;
    }
  }

  // Keep changes and `context` lines around them; everything else folds into a hunk header.
  const keep = all.map(() => false);
  all.forEach((line, k) => {
    if (line.kind === 'ctx') return;
    for (let d = Math.max(0, k - context); d <= Math.min(all.length - 1, k + context); d++) keep[d] = true;
  });
  const lines: DiffLine[] = [];
  let k = 0;
  while (k < all.length) {
    if (!keep[k]) {
      k++;
      continue;
    }
    const start = k;
    while (k < all.length && keep[k]) k++;
    const run = all.slice(start, k);
    const firstOld = run.find((l) => l.oldNo !== null)?.oldNo ?? 0;
    const firstNew = run.find((l) => l.newNo !== null)?.newNo ?? 0;
    const oldCount = run.filter((l) => l.kind !== 'add').length;
    const newCount = run.filter((l) => l.kind !== 'del').length;
    lines.push({ kind: 'hunk', oldNo: null, newNo: null, text: `@@ -${firstOld},${oldCount} +${firstNew},${newCount} @@` });
    lines.push(...run);
  }
  return { lines, added, removed };
}

/** The plain words for a comparison, for the header badge. */
export function changeWords(diff: FileDiff): string {
  if (diff.added === 0 && diff.removed === 0) return 'No changes';
  const parts: string[] = [];
  if (diff.added > 0) parts.push(`${diff.added} line${diff.added === 1 ? '' : 's'} added`);
  if (diff.removed > 0) parts.push(`${diff.removed} removed`);
  return parts.join(', ');
}
