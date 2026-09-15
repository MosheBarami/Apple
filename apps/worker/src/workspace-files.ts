// THE PROJECT'S OWN FILES, AS A PERSON MANAGES THEM.
//
// webtools.ts owns the STORE — where the bytes live, how a version is archived, what the trash is.
// This file owns the RULES that sit between a request and that store, and it exists as its own
// module for one reason: the rules have to be identical whoever asks.
//
// The agent reaches the workspace through `workspace_read` / `workspace_write`. A person reaches it
// through `/api/projects/:id/files`. Those are two callers of one set of decisions —
//
//   BOTH PATHS ARE CHECKED, NEVER JUST THE ONE THE CALLER NAMED. A move validates the destination
//   with the same `checkWorkspacePath` as the source. The failure that makes this worth stating is
//   asymmetric validation: a caller who may write `notes/a.md` moves it to `../../other/b.md` and
//   the guard that refused the write never ran on the path that mattered.
//
//   A DESTINATION THAT EXISTS IS A REFUSAL, NOT AN OVERWRITE. Duplicating onto a live file destroys
//   the file the user was trying to preserve, and rename-onto-existing is the same event wearing a
//   different verb. `freeCopyPath` exists so a caller can offer a name instead of a rejection.
//
//   DELETION IS SOFT AND SAYS FOR HOW LONG. `remove` moves the bytes to the trash with a real TTL,
//   and the result reports `expiresAt` so a UI can say "recoverable until 14 October" rather than
//   implying it is recoverable forever.
//
//   REVERTING IS A WRITE, NOT AN ERASURE. Going back to version 3 makes a version 9 whose content is
//   version 3's. The intervening versions stay readable — a history that can be rewritten by using
//   it is not a history.
//
// Every failure is a NAMED code plus a sentence. The routes map codes to status; nothing downstream
// has to pattern-match on prose to tell "no such file" from "that name is taken".

import {
  WORKSPACE_EXTENSIONS,
  WORKSPACE_MAX_BYTES,
  WORKSPACE_MAX_VERSIONS,
  WORKSPACE_TRASH_TTL_SECONDS,
  checkWorkspacePath,
  type WorkspaceFile,
  type WorkspaceStore,
  type WorkspaceTrashEntry,
  type WorkspaceVersion,
} from './webtools';

export type WorkspaceOpCode =
  | 'bad_path'
  | 'bad_destination'
  | 'not_found'
  | 'occupied'
  | 'not_in_trash'
  | 'no_such_version'
  | 'same_path'
  | 'too_large';

export type WorkspaceOp<T> = ({ ok: true } & T) | { ok: false; code: WorkspaceOpCode; error: string };

const fail = (code: WorkspaceOpCode, error: string): { ok: false; code: WorkspaceOpCode; error: string } => ({
  ok: false,
  code,
  error,
});

/** The two paths a two-path operation needs, both checked, or the refusal that stopped it. */
function twoPaths(fromRaw: string, toRaw: string): { from: string; to: string } | { ok: false; code: WorkspaceOpCode; error: string } {
  const from = checkWorkspacePath(fromRaw ?? '');
  if (!from.ok) return fail('bad_path', from.detail);
  const to = checkWorkspacePath(toRaw ?? '');
  // A DIFFERENT CODE for the destination. Both sentences are about a path, and a caller that shows
  // "that path is not a usable name" against the wrong field sends the user to fix the wrong thing.
  if (!to.ok) return fail('bad_destination', to.detail);
  if (from.path === to.path) return fail('same_path', 'the source and the destination are the same file');
  return { from: from.path, to: to.path };
}

/* ------------------------------------------------------------------ reading --- */

export interface WorkspaceListing {
  prefix: string;
  files: WorkspaceFile[];
  /** Folders one level under the prefix, derived from the paths — the store is flat. */
  folders: { name: string; fileCount: number; bytes: number }[];
  fileCount: number;
  /** Total of the RECORDED sizes. -1 sizes are excluded and counted, never summed as zero. */
  totalBytes: number;
  unmeasured: number;
  limits: { maxFileBytes: number; maxVersions: number; trashDays: number; extensions: readonly string[] };
}

/**
 * What is in the workspace, plus what it costs.
 *
 * The size total is the reason this is not `store.list` with a different name. A row whose size was
 * never recorded reports -1, and summing those as zero produces a storage figure that is confidently
 * too small — the same defect the -1 exists to prevent, one layer up. They are counted in
 * `unmeasured` instead, so a caller can say "1.2 MB across 14 files, 2 not measured".
 */
export async function listWorkspace(store: WorkspaceStore, prefixRaw = ''): Promise<WorkspaceListing> {
  const prefix = (prefixRaw ?? '').trim();
  const files = (await store.list(prefix)).sort((a, b) => a.path.localeCompare(b.path));
  let totalBytes = 0;
  let unmeasured = 0;
  const folders = new Map<string, { fileCount: number; bytes: number }>();
  for (const f of files) {
    if (f.bytes >= 0) totalBytes += f.bytes;
    else unmeasured += 1;
    const rest = f.path.slice(prefix.length);
    const cut = rest.indexOf('/');
    if (cut > 0) {
      const name = rest.slice(0, cut);
      const acc = folders.get(name) ?? { fileCount: 0, bytes: 0 };
      acc.fileCount += 1;
      if (f.bytes >= 0) acc.bytes += f.bytes;
      folders.set(name, acc);
    }
  }
  return {
    prefix,
    files,
    folders: [...folders.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => a.name.localeCompare(b.name)),
    fileCount: files.length,
    totalBytes,
    unmeasured,
    limits: {
      maxFileBytes: WORKSPACE_MAX_BYTES,
      maxVersions: WORKSPACE_MAX_VERSIONS,
      trashDays: Math.round(WORKSPACE_TRASH_TTL_SECONDS / 86_400),
      extensions: WORKSPACE_EXTENSIONS,
    },
  };
}

export interface WorkspaceHistory {
  path: string;
  versions: WorkspaceVersion[];
  /** True when the file itself is gone and only its archive remains. */
  deleted: boolean;
}

export async function historyOf(store: WorkspaceStore, pathRaw: string): Promise<WorkspaceOp<WorkspaceHistory>> {
  const verdict = checkWorkspacePath(pathRaw ?? '');
  if (!verdict.ok) return fail('bad_path', verdict.detail);
  const versions = await store.versions(verdict.path);
  // A path that never existed has no history AND no file. Reporting that as "deleted" would tell a
  // user their file was thrown away when it was only ever misspelled.
  if (!versions.length) return fail('not_found', `there is no file at ${verdict.path}`);
  return { ok: true, path: verdict.path, versions, deleted: !versions.some((v) => v.current) };
}

export async function readVersionOf(
  store: WorkspaceStore,
  pathRaw: string,
  version: number,
): Promise<WorkspaceOp<{ path: string; version: number; content: string; bytes: number; savedAt: number }>> {
  const verdict = checkWorkspacePath(pathRaw ?? '');
  if (!verdict.ok) return fail('bad_path', verdict.detail);
  if (!Number.isInteger(version) || version < 1) return fail('no_such_version', 'a version is a whole number from 1 upwards');
  const got = await store.readVersion(verdict.path, version);
  if (!got) return fail('no_such_version', `version ${version} of ${verdict.path} is not kept (the last ${WORKSPACE_MAX_VERSIONS} are)`);
  return { ok: true, path: verdict.path, version, content: got.content, bytes: got.bytes, savedAt: got.savedAt };
}

/* ------------------------------------------------------------------ writing --- */

/** Rename or relocate. One operation, because a rename IS a move within the same folder. */
export async function moveWorkspaceFile(
  store: WorkspaceStore,
  fromRaw: string,
  toRaw: string,
): Promise<WorkspaceOp<{ from: string; to: string; bytes: number; version: number }>> {
  const paths = twoPaths(fromRaw, toRaw);
  if ('ok' in paths) return paths;
  const res = await store.move(paths.from, paths.to);
  if (!res.ok) {
    return res.reason === 'occupied'
      ? fail('occupied', `there is already a file at ${paths.to}`)
      : fail('not_found', `there is no file at ${paths.from}`);
  }
  return { ok: true, from: paths.from, to: paths.to, bytes: res.bytes, version: res.version };
}

/**
 * Duplicate a file.
 *
 * The copy's history starts NOW, and `historyCopied: false` says so rather than leaving the caller
 * to assume either way. Carrying the source's archive onto the duplicate would make two files claim
 * the same past, and the first edit to either would make that claim false.
 */
export async function copyWorkspaceFile(
  store: WorkspaceStore,
  fromRaw: string,
  toRaw: string,
): Promise<WorkspaceOp<{ from: string; to: string; bytes: number; historyCopied: false }>> {
  const paths = twoPaths(fromRaw, toRaw);
  if ('ok' in paths) return paths;
  const src = await store.read(paths.from);
  if (!src) return fail('not_found', `there is no file at ${paths.from}`);
  // Checked before the write rather than after: `write` replaces, so "did it exist" has to be asked
  // while the answer still exists.
  const dst = await store.read(paths.to);
  if (dst) return fail('occupied', `there is already a file at ${paths.to}`);
  if (src.bytes > WORKSPACE_MAX_BYTES) return fail('too_large', `${src.bytes} bytes is past the ${WORKSPACE_MAX_BYTES}-byte limit`);
  const written = await store.write(paths.to, src.content);
  return { ok: true, from: paths.from, to: paths.to, bytes: written.bytes, historyCopied: false };
}

/** Delete, recoverably. The result carries the deadline, so the UI never has to guess it. */
export async function deleteWorkspaceFile(
  store: WorkspaceStore,
  pathRaw: string,
): Promise<WorkspaceOp<{ path: string; bytes: number; deletedAt: number; expiresAt: number }>> {
  const verdict = checkWorkspacePath(pathRaw ?? '');
  if (!verdict.ok) return fail('bad_path', verdict.detail);
  const res = await store.remove(verdict.path);
  if (!res) return fail('not_found', `there is no file at ${verdict.path}`);
  return { ok: true, path: verdict.path, ...res };
}

export async function restoreWorkspaceFile(
  store: WorkspaceStore,
  pathRaw: string,
): Promise<WorkspaceOp<{ path: string; bytes: number; version: number }>> {
  const verdict = checkWorkspacePath(pathRaw ?? '');
  if (!verdict.ok) return fail('bad_path', verdict.detail);
  const res = await store.restore(verdict.path);
  if (!res.ok) {
    return res.reason === 'occupied'
      ? fail('occupied', `a different file now lives at ${verdict.path} — rename it first, or the undelete would destroy it`)
      : fail('not_in_trash', `${verdict.path} is not in the trash (deleted files are kept for ${Math.round(WORKSPACE_TRASH_TTL_SECONDS / 86_400)} days)`);
  }
  return { ok: true, path: verdict.path, bytes: res.bytes, version: res.version };
}

/**
 * Put an earlier version back as the current one.
 *
 * APPEND-ONLY. The old content becomes a NEW version; nothing between is deleted. A revert that
 * truncated the history would destroy the very evidence someone reverting is usually trying to
 * compare against, and it would be unrepeatable in the other direction.
 */
export async function revertWorkspaceFile(
  store: WorkspaceStore,
  pathRaw: string,
  version: number,
): Promise<WorkspaceOp<{ path: string; restoredFrom: number; version: number; bytes: number }>> {
  const got = await readVersionOf(store, pathRaw, version);
  if (!got.ok) return got;
  const written = await store.write(got.path, got.content);
  return { ok: true, path: got.path, restoredFrom: version, version: written.version, bytes: written.bytes };
}

export async function trashOf(store: WorkspaceStore): Promise<{ entries: WorkspaceTrashEntry[]; retentionDays: number }> {
  return { entries: await store.trash(), retentionDays: Math.round(WORKSPACE_TRASH_TTL_SECONDS / 86_400) };
}

/* ------------------------------------------------------------------- naming --- */

/**
 * A free name near `path`, for a caller that wants to offer one instead of a refusal.
 *
 * `notes/plan.md` -> `notes/plan-copy.md` -> `notes/plan-copy-2.md` … and it CHECKS each candidate
 * against the store rather than trusting the pattern: two duplications in a row of the same file
 * otherwise produce the same "free" name twice, and the second one is a collision the caller was
 * told could not happen.
 *
 * Null when every candidate is taken or the result would not be a legal path — a name this function
 * cannot supply must come back as an absence, not as a guess the write then refuses.
 */
export async function freeCopyPath(store: WorkspaceStore, pathRaw: string, limit = 50): Promise<string | null> {
  const verdict = checkWorkspacePath(pathRaw ?? '');
  if (!verdict.ok) return null;
  const path = verdict.path;
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; i <= limit; i += 1) {
    const candidate = `${dir}${stem}-copy${i === 1 ? '' : `-${i}`}${ext}`;
    if (!checkWorkspacePath(candidate).ok) return null;
    if (!(await store.read(candidate))) return candidate;
  }
  return null;
}

/** HTTP status for a refusal, so every route maps the codes the same way. */
export const WORKSPACE_OP_STATUS: Record<WorkspaceOpCode, 400 | 404 | 409 | 413> = {
  bad_path: 400,
  bad_destination: 400,
  not_found: 404,
  not_in_trash: 404,
  no_such_version: 404,
  occupied: 409,
  same_path: 409,
  too_large: 413,
};
