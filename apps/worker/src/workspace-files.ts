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
  WORKSPACE_MAX_DEPTH,
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
  | 'too_large'
  // The BODY was wrong, not the path. Telling someone "that file name cannot be used" about a
  // missing payload sends them to fix the one field that was correct.
  | 'bad_content';

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

/**
 * Put text at a path, for a PERSON rather than for the agent.
 *
 * `workspace_write` (webtools.ts) is the agent's door and it replaces whatever is there, which is
 * right for a tool that has just read the file it is editing. A person picking a file off their own
 * disk has not read anything, and the name they are carrying — `plan.md` — is exactly the name Apple
 * is most likely to have used. So this refuses an occupied path by default, the same rule copy and
 * move already keep, and `overwrite` is how the user says they meant it.
 *
 * The overwrite is safe to offer because the store archives the previous text on every write: the
 * replaced version stays readable and revertible. An upload that destroyed the agent's work with no
 * way back would be a worse feature than no upload.
 *
 * The size is measured in BYTES of UTF-8, which is what the store holds and what the limit is
 * stated in. `content.length` would let a document of em dashes and emoji past a ceiling it is over.
 */
export async function writeWorkspaceFile(
  store: WorkspaceStore,
  pathRaw: string,
  content: unknown,
  opts: { overwrite?: boolean } = {},
): Promise<WorkspaceOp<{ path: string; bytes: number; version: number; created: boolean }>> {
  const verdict = checkWorkspacePath(pathRaw ?? '');
  if (!verdict.ok) return fail('bad_path', verdict.detail);
  if (typeof content !== 'string') return fail('bad_content', 'the file has to arrive as text');
  const bytes = new TextEncoder().encode(content).length;
  if (bytes > WORKSPACE_MAX_BYTES) {
    return fail('too_large', `${bytes} bytes is past the ${WORKSPACE_MAX_BYTES}-byte limit for one workspace file`);
  }
  // Asked before the write, because `write` replaces: "was something there" is a question that
  // stops having an answer the moment the write lands.
  const existing = await store.read(verdict.path);
  if (existing && opts.overwrite !== true) {
    return fail('occupied', `there is already a file at ${verdict.path}`);
  }
  const written = await store.write(verdict.path, content);
  return { ok: true, path: verdict.path, bytes: written.bytes, version: written.version, created: !existing };
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

/* ------------------------------------------------------------------ folders --- */

/**
 * A FOLDER IS A PREFIX. There is nothing else to validate.
 *
 * `checkWorkspacePath` cannot be reused directly — it requires a known file EXTENSION, which a
 * folder does not have — so this is the same segment rule with that one clause removed, and it is
 * deliberately written next to it rather than somewhere a reader would have to go looking. The
 * depth allowance is one less than a file's, because every file under this prefix needs a segment
 * of its own and a folder at the limit could hold nothing.
 */
function checkWorkspacePrefix(raw: string): { ok: true; prefix: string } | { ok: false; detail: string } {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return { ok: false, detail: 'no folder was given' };
  if (value.length > 190) return { ok: false, detail: 'that folder path is too long' };
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return { ok: false, detail: 'the folder must be inside the project workspace' };
  if (value.includes('\\')) return { ok: false, detail: 'use "/" as the separator' };
  const segments = value.split('/');
  if (segments.length > WORKSPACE_MAX_DEPTH - 1) return { ok: false, detail: `at most ${WORKSPACE_MAX_DEPTH - 1} folder levels` };
  for (const seg of segments) {
    if (seg === '') return { ok: false, detail: 'the folder path has an empty segment' };
    if (seg === '.' || seg === '..') return { ok: false, detail: '"." and ".." are not allowed in a workspace path' };
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(seg)) return { ok: false, detail: `"${seg.slice(0, 40)}" is not a usable folder name` };
  }
  return { ok: true, prefix: value };
}

/**
 * Rename or relocate a whole folder.
 *
 * NOTHING MOVES UNTIL EVERYTHING CAN. Every destination is built, validated and checked for
 * occupancy before the first write, because KV has no transaction and a batch that stops halfway
 * leaves the folder existing twice — partly under each name — with nothing to tell a user which
 * half is which. Pre-checking cannot make this atomic against a concurrent writer; it removes the
 * failure this product can actually cause, which is the destination that was already taken.
 *
 * Moving a folder INTO ITSELF is refused rather than resolved. `notes` -> `notes/archive` would
 * walk every file into its own new parent, and a caller who asked for that asked for something
 * this cannot do; rewriting their request into a different one is how a guard becomes a bug.
 */
export async function moveWorkspaceFolder(
  store: WorkspaceStore,
  fromRaw: string,
  toRaw: string,
): Promise<WorkspaceOp<{ from: string; to: string; moved: number; files: { from: string; to: string }[] }>> {
  const from = checkWorkspacePrefix(fromRaw);
  if (!from.ok) return fail('bad_path', from.detail);
  const to = checkWorkspacePrefix(toRaw);
  if (!to.ok) return fail('bad_destination', to.detail);
  if (from.prefix === to.prefix) return fail('same_path', 'the folder already has that name');
  if (to.prefix.startsWith(`${from.prefix}/`)) {
    return fail('occupied', `${to.prefix} is inside ${from.prefix}, so the folder cannot move there`);
  }

  const files = await store.list(`${from.prefix}/`);
  if (!files.length) return fail('not_found', `there is no folder at ${from.prefix}`);

  const planned: { from: string; to: string }[] = [];
  for (const file of files) {
    const destination = `${to.prefix}/${file.path.slice(from.prefix.length + 1)}`;
    const verdict = checkWorkspacePath(destination);
    if (!verdict.ok) return fail('bad_destination', `${destination} would not be a usable path: ${verdict.detail}`);
    if (await store.read(verdict.path)) return fail('occupied', `there is already a file at ${verdict.path}`);
    planned.push({ from: file.path, to: verdict.path });
  }

  const moved: { from: string; to: string }[] = [];
  for (const one of planned) {
    const res = await store.move(one.from, one.to);
    // Reported rather than thrown: the files already moved are moved, and a caller told only
    // "failed" would have no idea the folder is now in two places. This is the concurrent-writer
    // case the pre-check cannot close.
    if (!res.ok) {
      return fail(
        res.reason === 'occupied' ? 'occupied' : 'not_found',
        `moved ${moved.length} of ${planned.length} files, then stopped at ${one.from} — the folder is now in two places`,
      );
    }
    moved.push(one);
  }
  return { ok: true, from: from.prefix, to: to.prefix, moved: moved.length, files: moved };
}

/**
 * Delete a whole folder, recoverably.
 *
 * One `remove` per file, which is the ORDINARY soft delete: each lands in the same trash with the
 * same deadline and comes back through the same undelete. A bulk path that deleted outright would
 * be the only deletion in this product a user cannot undo, and it would be the one that removes the
 * most at once.
 */
export async function deleteWorkspaceFolder(
  store: WorkspaceStore,
  prefixRaw: string,
): Promise<WorkspaceOp<{ prefix: string; deleted: number; paths: string[]; deletedAt: number; expiresAt: number }>> {
  const verdict = checkWorkspacePrefix(prefixRaw);
  if (!verdict.ok) return fail('bad_path', verdict.detail);
  const files = await store.list(`${verdict.prefix}/`);
  if (!files.length) return fail('not_found', `there is no folder at ${verdict.prefix}`);

  const paths: string[] = [];
  let deletedAt = 0;
  let expiresAt = 0;
  for (const file of files) {
    const res = await store.remove(file.path);
    if (!res) continue;
    paths.push(file.path);
    // The LAST deadline written, so the sentence the UI shows is one that is true of every file in
    // the batch rather than of the first one.
    deletedAt = res.deletedAt;
    expiresAt = res.expiresAt;
  }
  if (!paths.length) return fail('not_found', `there is no folder at ${verdict.prefix}`);
  return { ok: true, prefix: verdict.prefix, deleted: paths.length, paths, deletedAt, expiresAt };
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
  bad_content: 400,
  not_found: 404,
  not_in_trash: 404,
  no_such_version: 404,
  occupied: 409,
  same_path: 409,
  too_large: 413,
};
