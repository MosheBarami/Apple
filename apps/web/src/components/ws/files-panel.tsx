/**
 * THE DRAWER THAT OPENS THE PROJECT'S FILES.
 *
 * Apple writes notes, plans and generated data into the project workspace, and until this panel
 * existed the only way to read one was to ask Apple to read it back to you. Everything decided here
 * is decided in `files-model.ts`; this file is markup, a query, and five actions.
 *
 * What it offers and what it does not:
 *
 *   NO "NEW FOLDER". The store is flat — a folder is a prefix two files share — so an empty folder
 *   cannot exist. A button that appears to work and leaves nothing behind is worse than its absence.
 *   ADD A FILE, TEXT ONLY. This header used to say NO UPLOAD, on the grounds that there is no object
 *   store behind this worker — true of binary, and over-stated for text. The workspace IS a text
 *   store with a declared extension list and a per-file ceiling, so a .md or .csv can simply go in,
 *   and until it could the only way to get a design brief where Apple could read it was to paste the
 *   whole thing into the chat and spend a turn asking for it to be saved. The limits are printed
 *   next to the picker rather than discovered as a refusal, which is the part that was missing: a
 *   picker that silently accepts a subset would promise a feature the deployment does not have.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  downloadProjectArchive,
  downloadProjectFile,
  fetchFileHistory,
  fetchProjectFile,
  fetchProjectFiles,
  fileOp,
  uploadProjectFile,
  ApiError,
} from '../../lib/api';
import { Failure } from '../failure';
import { relativeTime } from '../../lib/format';
import type { CodeLanguage } from '../../lib/generative-ui/schema';
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from '../ai-elements/artifact';
import {
  Commit,
  CommitActions,
  CommitAuthorAvatar,
  CommitHash,
  CommitHeader,
  CommitInfo,
  CommitMessage,
  CommitMetadata,
  CommitSeparator,
  CommitTimestamp,
} from '../ai-elements/commit';
import { FileTree, FileTreeActions, FileTreeIcon, FileTreeMeta, FileTreeName, FileTreeRow, fileTreeMainProps } from '../ai-elements/file-tree';
import { JSXPreview, JSXPreviewContent } from '../ai-elements/jsx-preview';
import { SchemaDisplay } from '../ai-elements/schema-display';
import { Snippet, SnippetCopyButton, SnippetInput, SnippetText } from '../ai-elements/snippet';
import { CodeViewer } from '../picks/tech/code-viewer';
import { diffLines } from '../picks/tech/diff-model';
import { ancestorsOf, moveExpanded, treeRows } from '../picks/tech/file-tree-model';
import { DownloadIcon } from '../picks/tech/icons';
import { jsonShape } from '../picks/tech/json-shape';
import { lineQuestion } from '../picks/tech/line-thread';
import { VersionDiff } from '../picks/tech/version-diff';
import '../picks/tech/tech-ui.css';
import '../picks/tech/files-panel.css';
import {
  breadcrumbs,
  extensionOf,
  deleteConfirm,
  formatFileBytes,
  parentPrefix,
  deleteFolderConfirm,
  looksBinary,
  previewOf,
  refusalCopy,
  renameFolderPrompt,
  replaceConfirm,
  revertConfirm,
  storageSummary,
  trashLine,
  uploadCheck,
  type FileVersion,
  type UploadLimits,
} from './files-model';

export function FilesPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const picker = useRef<HTMLInputElement>(null);
  const [prefix, setPrefix] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Folders open in the tree, and the saved version being compared with the current one.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [compare, setCompare] = useState<number | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const listing = useQuery({
    queryKey: ['project-files', projectId],
    queryFn: () => fetchProjectFiles(projectId),
    enabled: projectId !== '',
    retry: false,
  });

  const file = useQuery({
    queryKey: ['project-file', projectId, open],
    queryFn: () => fetchProjectFile(projectId, open as string),
    enabled: open !== null,
    retry: false,
  });

  const history = useQuery({
    queryKey: ['project-file-history', projectId, open],
    queryFn: () => fetchFileHistory(projectId, open as string),
    enabled: open !== null,
    retry: false,
  });

  const older = useQuery({
    queryKey: ['project-file', projectId, open, 'version', compare],
    queryFn: () => fetchProjectFile(projectId, open as string, compare as number),
    enabled: open !== null && compare !== null,
    retry: false,
  });

  // A file opened somewhere the tree has folded (after a rename moved it, say) is shown in place.
  useEffect(() => {
    if (open === null) return;
    const need = ancestorsOf(open);
    setExpanded((e) => (need.every((p) => e.has(p)) ? e : new Set([...e, ...need])));
  }, [open]);

  /**
   * Hand a question to the message box. The workspace already reads a `seed` out of router state
   * (the roadmap's "Build" uses the same door), so this is a navigation to the page you are on with
   * the words attached — the composer fills, nothing is sent until you press send.
   */
  const askApple = useCallback(
    (text: string) => {
      navigate(location.pathname, { state: { seed: text } });
      setNotice('Your question is in the message box. Close this panel to send it.');
      return true;
    },
    [navigate, location.pathname],
  );

  const selection = useRef({ open, file, history });
  selection.current = { open, file, history };

  const refresh = useCallback(async () => {
    // Query refetch resolves an error result by default; callers need a rejected refresh to
    // distinguish a saved change from a refreshed view of it.
    await listing.refetch({ throwOnError: true });
    // The user can close/select a file while listing yields. The observers follow the NEW key,
    // so checking the old render's `open` could still request path=null despite the enabled flag.
    const current = selection.current;
    if (current.open !== null) {
      const results = await Promise.allSettled([
        current.file.refetch({ throwOnError: true }),
        current.history.refetch({ throwOnError: true }),
      ]);
      for (const result of results) if (result.status === 'rejected') throw result.reason;
    }
  }, [listing]);

  /**
   * Every action goes through here, so a refusal is reported the same way whichever button sent it.
   *
   * `said` may be a FUNCTION of the result rather than a fixed sentence, because some of these
   * operations decide something the caller did not ask for and the user has to be told what it was:
   * a copy with no destination gets a free name chosen by the server. A successful path change is
   * followed here, BEFORE refresh: the previous query observers still refer to the retired path.
   */
  const act = useCallback(
    async (
      body: Parameters<typeof fileOp>[1],
      said: string | ((result: Record<string, unknown>) => string),
    ): Promise<Record<string, unknown> | null> => {
      setBusy(true);
      setNotice(null);
      let confirmed = false;
      let refusal: string | null = null;
      try {
        const res = await fileOp(projectId, body);
        if (!res.ok) {
          refusal = refusalCopy(res.code, res.error);
          setNotice(refusal);
          // A stale row should not invite the same refused operation again.
          await listing.refetch({ throwOnError: true });
          return null;
        }
        confirmed = true;
        setNotice(typeof said === 'function' ? said(res.result) : said);

        const folder = body.op === 'move_folder' || body.op === 'delete_folder';
        const removed = body.op === 'delete' || body.op === 'delete_folder';
        const moved = body.op === 'rename' || body.op === 'move' || body.op === 'move_folder';
        if (removed || moved) {
          const from = folder ? body.path.replace(/\/+$/, '') : body.path;
          const destination = typeof res.result.to === 'string' ? res.result.to : body.to;
          const to = folder ? destination?.replace(/\/+$/, '') : destination;
          const affected = (path: string) => path === from || (folder && path.startsWith(`${from}/`));

          // Functional updates preserve navigation that happened while the request was in flight.
          // A newly selected file must not be replaced/closed by an older operation's completion.
          setOpen((current) => current !== null && affected(current)
            ? removed ? null : to !== undefined ? to + current.slice(from.length) : current
            : current);
          if (folder) {
            setPrefix((current) => affected(current)
              ? removed ? parentPrefix(from) : to !== undefined ? to + current.slice(from.length) : current
              : current);
          }
          // The next render's query key fetches the new path. Calling the OLD observers here
          // fetched deleted/renamed content and history, producing real 404s after successful writes.
          await listing.refetch({ throwOnError: true });
        } else {
          await refresh();
        }
        return res.result;
      } catch {
        // An interrupted transport is not proof the write failed. Do not invite a duplicate write.
        setNotice(refusal !== null
          ? `${refusal} Files could not be refreshed. Refresh files before trying again.`
          : confirmed
            ? 'The change was saved, but refreshed files could not be loaded. Refresh files to check the result.'
            : 'The change could not be confirmed. Refresh files before trying again.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [projectId, listing, refresh],
  );

  /**
   * Put a file the user picked into the workspace.
   *
   * THE LIMITS ARE CHECKED BEFORE THE FILE IS READ, so a 4 MB video is refused instantly with the
   * ceiling in the sentence rather than after a read and a round trip. The worker checks all of it
   * again — the client is not an authority on anything — this only stops the trip whose one
   * outcome was a confusing no.
   *
   * AN OCCUPIED PATH IS A QUESTION, NOT A FAILURE. The worker refuses rather than overwriting, and
   * the retry that follows a yes carries `overwrite`, so replacing the plan Apple wrote is always
   * something the user chose. The replaced text stays readable as a version, which is why the
   * question can be asked at all.
   */
  //
  // The limits and the folder are ARGUMENTS rather than closed over. `data` is derived below, after
  // the loading and failure returns, so a callback that captured it would either hold a stale copy
  // or — listed as a dependency — be evaluated before that `const` exists. Hooks cannot move past
  // an early return, so the values are passed in at the moment of the click instead.
  const addFile = useCallback(
    async (picked: File, limits: UploadLimits, folder: string) => {
      setNotice(null);
      const plan = uploadCheck({ name: picked.name, size: picked.size }, limits, folder);
      if (!plan.ok) {
        setNotice(plan.why);
        return;
      }
      setBusy(true);
      let confirmed = false;
      try {
        let text: string;
        try {
          text = await picked.text();
        } catch {
          setNotice('That file could not be read.');
          return;
        }
        if (looksBinary(text)) {
          // Caught here because an allowed extension does not establish that the bytes are text.
          setNotice('That file is not text. Only text files can be added here.');
          return;
        }
        let res = await uploadProjectFile(projectId, plan.path, text);
        if (!res.ok && res.code === 'occupied' && window.confirm(replaceConfirm(plan.path))) {
          res = await uploadProjectFile(projectId, plan.path, text, { overwrite: true });
        }
        if (!res.ok) {
          setNotice(refusalCopy(res.code, res.error));
          return;
        }
        confirmed = true;
        // Keep the adjusted name visible rather than making the user guess where the file went.
        setNotice(
          plan.renamed
            ? `Added as ${plan.path} — the name was adjusted to fit the workspace.`
            : `Added ${plan.path}`,
        );
        await refresh();
      } catch {
        // An interrupted transport is not proof that the server did not save the file.
        setNotice(confirmed
          ? 'The file was saved, but refreshed files could not be loaded. Refresh files to check the result.'
          : 'The upload could not be confirmed. Refresh files before trying again.');
      } finally {
        setBusy(false);
      }
    },
    [projectId, refresh],
  );

  if (listing.isPending) {
    return (
      <div aria-busy="true">
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
      </div>
    );
  }

  if (listing.isError) {
    return (
      <div>
        {notice && <p className="gx-pop__note" role="status">{notice}</p>}
        <Failure error={listing.error} onRetry={() => void listing.refetch()} />
      </div>
    );
  }

  const data = listing.data;
  const summary = storageSummary(data);
  const rows = treeRows(data.files, expanded);
  // Open a file, or close it when it is already the one open. A new file starts uncompared.
  const choose = (path: string) => {
    setOpen(open === path ? null : path);
    setCompare(null);
  };
  // A folder press opens or closes it and makes it the folder new files go into.
  const toggleFolder = (path: string, want?: boolean) => {
    setExpanded((e) => {
      const next = new Set(e);
      if (want ?? !e.has(path)) next.add(path);
      else next.delete(path);
      return next;
    });
    setPrefix(path);
  };
  const crumbs = breadcrumbs(prefix);
  const now = Date.now();

  return (
    <div className="gx-files">
      <p className="gx-row__meta gx-files__summary">{summary.lines.join(' · ')}</p>
      <div className="gx-files__toolbar">
        <button
          type="button"
          className="gx-btn gx-btn--ghost"
          aria-label="Refresh files"
          disabled={busy || listing.isFetching || file.isFetching || history.isFetching}
          onClick={() => {
            setNotice(null);
            void refresh().catch(() => setNotice('Files could not be refreshed. Check your connection and refresh again.'));
          }}
        >
          {listing.isFetching || file.isFetching || history.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
        {data.fileCount > 0 && (
            <button
              type="button"
              className="gx-btn gx-btn--ghost"
              onClick={() => {
                // Offered only when there is something to archive: the worker answers an empty
                // workspace with a refusal, and a button whose only outcome is that refusal is a
                // button that does nothing.
                setNotice(null);
                void downloadProjectArchive(projectId).catch((e: unknown) =>
                  setNotice(e instanceof ApiError ? e.message : 'Could not download those files.'),
                );
              }}
            >
              Download all
            </button>
        )}
      </div>

      {canEdit && (
        <div className="gx-files__upload">
          <button
            type="button"
            className="gx-btn gx-btn--outline"
            disabled={busy}
            onClick={() => picker.current?.click()}
          >
            Add a file
          </button>
            <input
              ref={picker}
              type="file"
              // The ACCEPT list is the server's own, carried in the listing, so it cannot drift from
              // what the write will allow. It is a hint the OS may ignore, which is why uploadCheck
              // runs on whatever actually comes back.
              accept={data.limits.extensions.join(',')}
              disabled={busy}
              style={{ display: 'none' }}
              onChange={(e) => {
                const picked = e.target.files?.[0];
                // Cleared so picking the SAME file twice fires a second change event — after a
                // refusal the user has fixed, re-choosing it is the obvious next move.
                e.target.value = '';
                if (picked) void addFile(picked, data.limits, prefix);
              }}
            />
          <span className="gx-row__meta">
            Text only — {data.limits.extensions.join(' ')}, up to {formatFileBytes(data.limits.maxFileBytes)}
            {prefix ? `, into ${prefix}` : ''}
          </span>
        </div>
      )}

      {notice && (
        <p className="gx-pop__note" role="status" style={{ padding: 0, marginBottom: '0.6rem' }}>
          {notice}
        </p>
      )}

      {/* The folder new files go into. The tree below opens folders in place; this trail says which
          one an added file will land in, and gets back to the top in one press. */}
      <nav aria-label="Folder" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.6rem' }}>
        {crumbs.map((c, i) => (
          <span key={c.prefix} style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
            {i > 0 && <span aria-hidden="true">/</span>}
            <button
              type="button"
              className="gx-btn gx-btn--ghost"
              onClick={() => setPrefix(c.prefix)}
              aria-current={i === crumbs.length - 1 ? 'page' : undefined}
            >
              {c.label}
            </button>
          </span>
        ))}
      </nav>

      {data.fileCount === 0 && (
        <p className="gx-empty">
          Apple has not written any files in this project yet. It keeps notes, plans and generated data here —
          they are Apple’s own storage, not your Roblox place.
        </p>
      )}

      {data.fileCount > 0 && rows.length === 0 && (
        <p className="gx-empty">
          Nothing in this folder.{' '}
          <button type="button" className="gx-btn gx-btn--ghost" onClick={() => setPrefix(parentPrefix(prefix))}>
            Go up
          </button>
        </p>
      )}

      {/* THE TREE (AI Elements file-tree + UI Layouts Tree Code Viewer). Folders open in place; a
          file opens in the viewer below. One flat list of rows, each with its own level, so the
          arrow keys walk it in reading order and every row keeps its own buttons. */}
      {rows.length > 0 && (
        <FileTree aria-label="Project files" onToggle={(path, want) => toggleFolder(path, want)}>
          {rows.map((row) =>
            row.kind === 'folder' ? (
              // NOT one <button> around the whole row: the folder actions cannot live inside another
              // button — nested interactive elements are invalid HTML and the inner control is
              // unreachable by keyboard in some engines. The name is its own control.
              <FileTreeRow key={row.path} level={row.depth} kind="folder" open={row.expanded}>
                <button
                  type="button"
                  className="ai-tree__main"
                  {...fileTreeMainProps(row.path, row.depth, 'folder', row.expanded)}
                  onClick={() => toggleFolder(row.path)}
                >
                  <FileTreeIcon kind="folder" open={row.expanded} />
                  <FileTreeName>{row.name}</FileTreeName>
                  <FileTreeMeta>
                    {row.fileCount} file{row.fileCount === 1 ? '' : 's'} · {formatFileBytes(row.bytes)}
                  </FileTreeMeta>
                </button>
                {canEdit && (
                  <FileTreeActions>
                    <button
                      type="button"
                      className="tq-btn"
                      disabled={busy}
                      onClick={() => {
                        const to = window.prompt(renameFolderPrompt(row.path), row.path);
                        if (!to || to === row.path) return;
                        void act({ op: 'move_folder', path: row.path, to }, (result) =>
                          `Moved ${result.moved ?? ''} file${result.moved === 1 ? '' : 's'} to ${to}`.replace('  ', ' '),
                        ).then((done) => { if (done) setExpanded((e) => moveExpanded(e, row.path, to)); });
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="tq-btn"
                      disabled={busy}
                      onClick={() => {
                        // The count comes from the row, which is the worker's own count of the files
                        // under the prefix — including the ones a level down that are not on screen.
                        if (!window.confirm(deleteFolderConfirm(row.path, row.fileCount, data.trashRetentionDays))) return;
                        void act({ op: 'delete_folder', path: row.path }, (result) =>
                          `Moved ${result.deleted ?? ''} file${result.deleted === 1 ? '' : 's'} to the trash`.replace('  ', ' '),
                        ).then((done) => { if (done) setExpanded((e) => moveExpanded(e, row.path, null)); });
                      }}
                    >
                      Delete
                    </button>
                  </FileTreeActions>
                )}
              </FileTreeRow>
            ) : (
              <FileTreeRow key={row.path} level={row.depth} kind="file" selected={open === row.path}>
                <button
                  type="button"
                  className="ai-tree__main"
                  {...fileTreeMainProps(row.path, row.depth, 'file')}
                  onClick={() => choose(row.path)}
                >
                  <FileTreeIcon kind="file" />
                  <FileTreeName>{row.name}</FileTreeName>
                  <FileTreeMeta>
                    {/* A size that was never recorded says so. -1 must never render as "0 B". */}
                    {row.bytes < 0 ? 'size not recorded' : formatFileBytes(row.bytes)}
                    {row.updatedAt > 0 ? ` · ${relativeTime(row.updatedAt)}` : ''}
                  </FileTreeMeta>
                </button>
              </FileTreeRow>
            ),
          )}
        </FileTree>
      )}

      {/* ------------------------------------------------------------- one file */}
      {/* AI Elements artifact: the file as one card — its name, what it is, the things you can do
          to it, and the file itself in the Tree Code Viewer pane. */}
      {open !== null && (
        <Artifact aria-label={`Preview of ${open}`} className="ft-artifact">
          <ArtifactHeader>
            <div>
              <ArtifactTitle>{open.split('/').pop()}</ArtifactTitle>
              <ArtifactDescription>
                {file.data
                  ? `${file.data.bytes < 0 ? 'size not recorded' : formatFileBytes(file.data.bytes)} · version ${file.data.version}${file.data.savedAt > 0 ? ` · saved ${relativeTime(file.data.savedAt)}` : ''}`
                  : 'Reading…'}
              </ArtifactDescription>
            </div>
            <ArtifactActions>
              <ArtifactAction iconOnly tooltip="Download" onClick={() => void downloadProjectFile(projectId, open)}>
                <DownloadIcon />
              </ArtifactAction>
              <ArtifactClose onClick={() => choose(open)} aria-label="Close the file" />
            </ArtifactActions>
          </ArtifactHeader>

          <ArtifactContent className="ft-body">
            {/* AI Elements snippet: the path, ready to paste into a message to Apple. */}
            <Snippet code={open}>
              <SnippetText>Path</SnippetText>
              <SnippetInput aria-label="File path" />
              <SnippetCopyButton label="Copy the path" />
            </Snippet>

            {canEdit && (
              <div className="ft-tools">
                <button
                  type="button"
                  className="tq-btn"
                  disabled={busy}
                  onClick={() => {
                    // The prompt takes a PATH, and says so. Rename and move are one operation on
                    // the worker — a rename is a move that happens to share a folder — so typing
                    // "notes/plan.md" here moves the file. There is no drag target and no folder
                    // picker, which makes this sentence the only place that capability exists.
                    const to = window.prompt('New path for this file — include a folder to move it', open);
                    if (!to || to === open) return;
                    void act({ op: 'rename', path: open, to }, `Renamed to ${to}`);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="tq-btn"
                  disabled={busy}
                  // No destination is sent, which is the branch where the server picks a free name
                  // by probing the store. So the server knows the answer and the user does not:
                  // the notice reads it back rather than saying "Duplicated" and leaving them to
                  // work out whether they now have plan-copy.md or plan-copy-2.md.
                  onClick={() =>
                    void act({ op: 'copy', path: open }, (result) =>
                      typeof result.to === 'string' ? `Duplicated as ${result.to}` : 'Duplicated',
                    )
                  }
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="tq-btn"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(deleteConfirm(open, data.trashRetentionDays))) return;
                    void act({ op: 'delete', path: open }, 'Moved to the trash');
                  }}
                >
                  Delete
                </button>
              </div>
            )}

            {file.isPending && <p className="gx-empty">Reading the file…</p>}
            {file.isError && (
              <p className="gx-pop__note" role="alert" style={{ padding: 0 }}>
                {file.error instanceof ApiError ? file.error.message : 'That file could not be read.'}
              </p>
            )}
            {file.data && (
              <FilePreview
                path={open}
                content={file.data.content}
                onAsk={(line, code, question) => askApple(lineQuestion(open, line, code, question))}
              />
            )}

            {/* AI Elements commit: every saved version on one rail, the current one lit. */}
            {history.data && history.data.versions.length > 1 && (
              <section aria-label="Earlier versions" className="ft-versions">
                <h4 className="ft-h">Earlier versions</h4>
                {history.data.versions.map((v: FileVersion) => (
                  <Commit key={v.version} current={v.current}>
                    <CommitHeader>
                      <CommitAuthorAvatar />
                      <CommitInfo>
                        <CommitMessage>
                          Version {v.version}
                          {v.current ? ' · current' : ''}
                        </CommitMessage>
                        <CommitMetadata>
                          <CommitHash>v{v.version}</CommitHash>
                          <CommitSeparator />
                          {v.savedAt > 0
                            ? <CommitTimestamp date={new Date(v.savedAt)}>{relativeTime(v.savedAt)}</CommitTimestamp>
                            : <span>time not recorded</span>}
                          <CommitSeparator />
                          <span>{v.bytes < 0 ? 'size not recorded' : formatFileBytes(v.bytes)}</span>
                        </CommitMetadata>
                      </CommitInfo>
                      {!v.current && (
                        <CommitActions>
                          <button
                            type="button"
                            className="tq-btn"
                            aria-pressed={compare === v.version}
                            onClick={() => setCompare(compare === v.version ? null : v.version)}
                          >
                            Compare
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              className="tq-btn"
                              disabled={busy}
                              onClick={() => {
                                if (!window.confirm(revertConfirm(open, v.version))) return;
                                void act({ op: 'revert', path: open, version: v.version }, `Put version ${v.version} back`);
                              }}
                            >
                              Put back
                            </button>
                          )}
                        </CommitActions>
                      )}
                    </CommitHeader>
                  </Commit>
                ))}
              </section>
            )}

            {/* Eldora GitHub Inline Comments, under an AI Elements package-info header: what changed
                between the version picked above and the current one. */}
            {compare !== null && (
              <section aria-label={`Changes since version ${compare}`} className="ft-compare">
                {older.isPending && <p className="gx-empty">Reading version {compare}…</p>}
                {older.isError && (
                  <p className="gx-pop__note" role="alert" style={{ padding: 0 }}>
                    {older.error instanceof ApiError ? older.error.message : `Version ${compare} could not be read.`}
                  </p>
                )}
                {older.data && file.data && (() => {
                  const diff = diffLines(older.data.content, file.data.content);
                  if (!diff) {
                    return (
                      <p className="gx-empty">
                        These versions are too long to compare here. Download both to compare them.
                      </p>
                    );
                  }
                  return (
                    <VersionDiff
                      path={open}
                      from={`Version ${compare}`}
                      to={`Version ${file.data.version}`}
                      diff={diff}
                      onAsk={(line, code, question) => askApple(lineQuestion(open, line, code, question))}
                    />
                  );
                })()}
              </section>
            )}
          </ArtifactContent>
        </Artifact>
      )}

      {/* --------------------------------------------------------------- trash */}
      {data.trash.length > 0 && (
        <section aria-label="Deleted files" style={{ marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.4rem' }}>Trash</h3>
          {data.trash.map((t) => (
            <div key={t.path} className="gx-row">
              <span className="gx-row__main">
                {t.path}
                <span className="gx-row__meta">
                  {formatFileBytes(t.bytes)} · {trashLine(t, now)}
                </span>
              </span>
              {canEdit && (
                <button
                  type="button"
                  className="gx-btn gx-btn--outline"
                  disabled={busy}
                  onClick={() => void act({ op: 'undelete', path: t.path }, `Brought ${t.path} back`)}
                >
                  Bring back
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/** Which highlighter a file's extension asks for. Anything unlisted is plain text, never a guess. */
function languageOf(path: string): CodeLanguage {
  const ext = extensionOf(path);
  if (ext === '.luau') return 'luau';
  if (ext === '.lua') return 'lua';
  if (ext === '.ts') return 'ts';
  if (ext === '.js') return 'js';
  if (ext === '.json') return 'json';
  return 'text';
}

/**
 * The preview itself. A CSV becomes a table; Markdown opens as a page (AI Elements jsx-preview,
 * through the app's one sanitised renderer) with its text one press away; everything else opens in
 * the code viewer. JSON also shows its shape (AI Elements schema-display) behind Details. A cut
 * always says so.
 */
function FilePreview({
  path,
  content,
  onAsk,
}: {
  path: string;
  content: string;
  onAsk: (line: number, code: string, question: string) => boolean;
}) {
  const preview = previewOf(path, content);
  const markdown = extensionOf(path) === '.md';
  const [page, setPage] = useState(true);
  const shape = useMemo(() => (extensionOf(path) === '.json' ? jsonShape(content) : null), [path, content]);

  if (preview.kind === 'table') {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table className="gx-files__table">
          <tbody>
            {preview.rows.map((cells, i) => (
              <tr key={i}>
                {cells.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {preview.truncated && (
          <p className="gx-row__meta">
            Showing the first {preview.rows.length} of {preview.totalRows} rows. Download the file for all of it.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="ft-preview">
      {markdown && (
        <div className="ft-switch" role="group" aria-label="How to show this file">
          <button type="button" className="tq-btn" aria-pressed={page} onClick={() => setPage(true)}>Page</button>
          <button type="button" className="tq-btn" aria-pressed={!page} onClick={() => setPage(false)}>Text</button>
        </div>
      )}
      {markdown && page ? (
        <JSXPreview jsx={preview.text} isStreaming={preview.truncated} className="ft-page">
          <JSXPreviewContent />
        </JSXPreview>
      ) : (
        <CodeViewer path={path} content={preview.text} language={languageOf(path)} onAsk={onAsk} />
      )}
      {preview.truncated && (
        <p className="gx-row__meta">
          Showing the first {preview.text.split('\n').length} of {preview.lines} lines. Download the file for all of it.
        </p>
      )}
      {shape && shape.properties && (
        <details className="tq-details">
          <summary>Details</summary>
          <div className="tq-details__body">
            <SchemaDisplay
              title="Data shape"
              description={shape.count !== undefined
                ? `A ${shape.type} (${shape.count}). Each item has these fields.`
                : 'The fields in this file and what kind of value each holds.'}
              properties={shape.properties}
            />
          </div>
        </details>
      )}
    </div>
  );
}
