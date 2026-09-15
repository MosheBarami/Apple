/**
 * THE PROJECT'S FILES, REDUCED TO WHAT A DRAWER CAN DRAW.
 *
 * Apple has been writing files into the project workspace since the web tools shipped — notes,
 * plans, generated CSVs, design briefs — and the browser's only acknowledgement was a line in the
 * activity feed reading "Listed the project files". There was no way to open one. This module is
 * the decision half of the drawer that fixes that; `files-panel.tsx` is the markup.
 *
 * Pure and DOM-free so `tests/files-model.test.mjs` runs it under `node --test`, which is how the
 * rules below get asserted at all. The rules:
 *
 *   A SIZE THAT WAS NEVER RECORDED IS NOT A SIZE. The worker reports `bytes: -1` for a row whose
 *   metadata predates the versioned store, and counts those separately. The summary says
 *   "2 not measured" rather than folding them into the total as zeroes — a storage figure that is
 *   confidently too small is worse than one that admits what it could not see.
 *
 *   A DELETION IS DESCRIBED BY ITS DEADLINE. "Deleted" alone invites both wrong beliefs: that it is
 *   gone forever, and that it is kept forever. Every trash line carries the time left.
 *
 *   A PREVIEW NEVER PRETENDS TO BE THE WHOLE FILE. `previewOf` reports `truncated` when it cut, and
 *   the panel says so. A CSV preview that silently shows the first 50 rows of 4,000 is a picture of
 *   a smaller file than the user has.
 *
 *   A REFUSAL IS TRANSLATED BY ITS CODE, NOT BY ITS PROSE. The worker sends `code` alongside the
 *   sentence; matching on the sentence would break the first time either side reworded it.
 */

export interface ProjectFile {
  path: string;
  /** -1 means the size was never recorded. It is NOT zero. */
  bytes: number;
  /** -1 means the time was never recorded. */
  updatedAt: number;
}

export interface TrashedFile {
  path: string;
  bytes: number;
  deletedAt: number;
  expiresAt: number;
}

export interface FileVersion {
  version: number;
  bytes: number;
  savedAt: number;
  current: boolean;
}

export interface FilesResponse {
  prefix: string;
  files: ProjectFile[];
  folders: { name: string; fileCount: number; bytes: number }[];
  fileCount: number;
  totalBytes: number;
  unmeasured: number;
  limits: { maxFileBytes: number; maxVersions: number; trashDays: number; extensions: string[] };
  trash: TrashedFile[];
  trashRetentionDays: number;
}

/* ------------------------------------------------------------------ browsing --- */

export interface FolderRow {
  kind: 'folder';
  name: string;
  path: string;
  fileCount: number;
  bytes: number;
}

export interface FileRow {
  kind: 'file';
  name: string;
  path: string;
  bytes: number;
  updatedAt: number;
}

export type BrowseRow = FolderRow | FileRow;

/**
 * One level of the tree, from a flat listing.
 *
 * The store is flat KV — there are no folder objects — so a folder is a prefix that two paths share.
 * That has one consequence worth stating: an EMPTY folder cannot exist, and the panel must not offer
 * to create one. A control that appears to work and leaves nothing behind is worse than its absence.
 */
export function browseRows(files: ProjectFile[], prefix: string): BrowseRow[] {
  const at = prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix;
  const folders = new Map<string, { fileCount: number; bytes: number }>();
  const rows: BrowseRow[] = [];
  for (const f of files) {
    if (at && !f.path.startsWith(at)) continue;
    const rest = f.path.slice(at.length);
    const cut = rest.indexOf('/');
    if (cut < 0) {
      rows.push({ kind: 'file', name: rest, path: f.path, bytes: f.bytes, updatedAt: f.updatedAt });
      continue;
    }
    const name = rest.slice(0, cut);
    const acc = folders.get(name) ?? { fileCount: 0, bytes: 0 };
    acc.fileCount += 1;
    // An unrecorded size is skipped here too: a folder that says "0 B" over three real files is the
    // same false claim as a total that does.
    if (f.bytes >= 0) acc.bytes += f.bytes;
    folders.set(name, acc);
  }
  const folderRows: BrowseRow[] = [...folders.entries()]
    .map(([name, v]) => ({ kind: 'folder' as const, name, path: `${at}${name}`, fileCount: v.fileCount, bytes: v.bytes }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Folders first, then files: a listing that interleaves them makes the reader re-sort it by eye.
  return [...folderRows, ...rows.sort((a, b) => a.name.localeCompare(b.name))];
}

/** The crumbs for a prefix, always starting at the root. */
export function breadcrumbs(prefix: string): { label: string; prefix: string }[] {
  const out = [{ label: 'Files', prefix: '' }];
  const parts = prefix.split('/').filter(Boolean);
  let acc = '';
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    out.push({ label: p, prefix: acc });
  }
  return out;
}

/** The prefix one level up, or '' at the root. */
export const parentPrefix = (prefix: string): string => {
  const parts = prefix.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
};

/* ------------------------------------------------------------------- storage --- */

export interface StorageSummary {
  fileCount: number;
  totalBytes: number;
  unmeasured: number;
  maxFileBytes: number;
  /** Rendered sentence fragments, so the panel does not reassemble this in three places. */
  lines: string[];
}

const kb = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export { kb as formatFileBytes };

/**
 * What the workspace costs, stated including what could not be measured.
 *
 * The per-file ceiling is named here rather than only at the moment a write is refused: a limit the
 * user meets for the first time as an error is a limit they were never told about.
 */
export function storageSummary(listing: FilesResponse): StorageSummary {
  const lines = [
    `${listing.fileCount} file${listing.fileCount === 1 ? '' : 's'}`,
    `${kb(listing.totalBytes)} stored`,
    `${kb(listing.limits.maxFileBytes)} per file`,
    `${listing.limits.maxVersions} versions kept`,
  ];
  if (listing.unmeasured > 0) lines.push(`${listing.unmeasured} not measured`);
  if (listing.trash.length > 0) lines.push(`${listing.trash.length} in the trash`);
  return {
    fileCount: listing.fileCount,
    totalBytes: listing.totalBytes,
    unmeasured: listing.unmeasured,
    maxFileBytes: listing.limits.maxFileBytes,
    lines,
  };
}

/** How long a deleted file has left, as a sentence. Past its deadline it says so plainly. */
export function trashLine(entry: TrashedFile, now: number): string {
  const leftMs = entry.expiresAt - now;
  if (leftMs <= 0) return 'no longer recoverable';
  const days = Math.floor(leftMs / 86_400_000);
  if (days >= 1) return `recoverable for ${days} more day${days === 1 ? '' : 's'}`;
  const hours = Math.max(1, Math.round(leftMs / 3_600_000));
  return `recoverable for ${hours} more hour${hours === 1 ? '' : 's'}`;
}

/* ------------------------------------------------------------------ previews --- */

export type PreviewKind = 'prose' | 'table' | 'data' | 'code';

const KIND_BY_EXTENSION: Record<string, PreviewKind> = {
  '.md': 'prose',
  '.txt': 'prose',
  '.csv': 'table',
  '.json': 'data',
  '.yml': 'data',
  '.yaml': 'data',
  '.luau': 'code',
  '.lua': 'code',
  '.ts': 'code',
  '.js': 'code',
};

export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/** How to draw this file. An unknown extension reads as prose rather than as nothing. */
export const previewKindFor = (path: string): PreviewKind => KIND_BY_EXTENSION[extensionOf(path)] ?? 'prose';

export const MAX_PREVIEW_LINES = 200;
export const MAX_TABLE_ROWS = 50;

export type Preview =
  | { kind: 'prose' | 'data' | 'code'; text: string; truncated: boolean; lines: number }
  | { kind: 'table'; rows: string[][]; truncated: boolean; columns: number; totalRows: number };

/**
 * A file, cut to a size a drawer can show, saying when it cut.
 *
 * The CSV split is deliberately naive — it does not handle quoted commas — and that is why the
 * table is labelled a preview and the download hands over the real bytes. A parser that silently
 * mangles a quoted field would produce a table that looks authoritative and is wrong; one that
 * admits it is a preview does not.
 */
export function previewOf(path: string, content: string): Preview {
  const kind = previewKindFor(path);
  if (kind === 'table') {
    const all = content.split(/\r?\n/).filter((l) => l.length > 0);
    const rows = all.slice(0, MAX_TABLE_ROWS).map((l) => l.split(','));
    return {
      kind,
      rows,
      truncated: all.length > MAX_TABLE_ROWS,
      columns: rows.reduce((n, r) => Math.max(n, r.length), 0),
      totalRows: all.length,
    };
  }
  const lines = content.split(/\r?\n/);
  const truncated = lines.length > MAX_PREVIEW_LINES;
  return {
    kind,
    text: (truncated ? lines.slice(0, MAX_PREVIEW_LINES) : lines).join('\n'),
    truncated,
    lines: lines.length,
  };
}

/* ------------------------------------------------------------------- copy --- */

export type FileOpCode =
  | 'bad_path'
  | 'bad_destination'
  | 'not_found'
  | 'occupied'
  | 'not_in_trash'
  | 'no_such_version'
  | 'same_path'
  | 'too_large';

/**
 * What to show the user when the worker refuses.
 *
 * Keyed by CODE. The worker sends a sentence too, and it is a good sentence, but it is written for
 * whoever reads the API; these are written for the person who just clicked Rename. An unrecognised
 * code falls back to the worker's own words rather than to a generic apology — the server knows
 * something the browser does not, and hiding it would be the browser deciding the user should not
 * hear it.
 */
export function refusalCopy(code: string | undefined, serverSaid: string): string {
  switch (code as FileOpCode) {
    case 'bad_path':
      return 'That file name cannot be used. Letters, numbers, dashes and dots, in folders separated by "/".';
    case 'bad_destination':
      return 'That new name cannot be used. It has to stay inside the project, and keep a known file type.';
    case 'not_found':
      return 'That file is not there any more. The list below has been refreshed.';
    case 'occupied':
      return 'There is already a file with that name. Pick another, or rename the existing one first.';
    case 'not_in_trash':
      return 'That file is not in the trash, so there is nothing to bring back.';
    case 'no_such_version':
      return 'That version is no longer kept. Only the most recent ones are.';
    case 'same_path':
      return 'That is the name it already has.';
    case 'too_large':
      return 'That file is past the size limit for this workspace.';
    default:
      return serverSaid;
  }
}

/** The sentence on the delete confirmation. It states the window, because that is the whole point. */
export const deleteConfirm = (path: string, retentionDays: number): string =>
  `Delete ${path}? It goes to the trash and can be brought back for ${retentionDays} days.`;

/** The sentence on the revert confirmation. */
export const revertConfirm = (path: string, version: number): string =>
  `Put version ${version} of ${path} back? The current text is kept as its own version, so this can be undone.`;
