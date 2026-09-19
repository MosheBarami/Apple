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
import { useCallback, useRef, useState } from 'react';
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
import { Icon, PATH } from './primitives';
import {
  breadcrumbs,
  browseRows,
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
  const rows = browseRows(data.files, prefix);
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

      <nav aria-label="Folder" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.6rem' }}>
        {crumbs.map((c, i) => (
          <span key={c.prefix} style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
            {i > 0 && <span aria-hidden="true">/</span>}
            <button
              type="button"
              className="gx-btn gx-btn--ghost"
              onClick={() => {
                setPrefix(c.prefix);
                setOpen(null);
              }}
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

      {rows.map((row) =>
        row.kind === 'folder' ? (
          // NOT one <button> around the whole row, which is what it was: the folder actions cannot
          // live inside another button — nested interactive elements are invalid HTML and the inner
          // control is unreachable by keyboard in some engines. The name is its own control.
          <div key={row.path} className="gx-row">
            <Icon d={PATH.layers} size={14} />
            {/* The button reset lives in the stylesheet, not here. It was seven inline
                properties — background, border, font, colour, padding, align, cursor — the whole
                UA reset written at one call site, invisible to every check that reads CSS and
                impossible to reuse at the next button that needs it. */}
            <button
              type="button"
              className="gx-row__main gx-row__main--button"
              onClick={() => {
                setPrefix(row.path);
                setOpen(null);
              }}
            >
              {row.name}
              <span className="gx-row__meta">
                {row.fileCount} file{row.fileCount === 1 ? '' : 's'} · {formatFileBytes(row.bytes)}
              </span>
            </button>
            {canEdit && (
              <>
                <button
                  type="button"
                  className="gx-btn gx-btn--outline"
                  disabled={busy}
                  onClick={() => {
                    const to = window.prompt(renameFolderPrompt(row.path), row.path);
                    if (!to || to === row.path) return;
                    void act({ op: 'move_folder', path: row.path, to }, (result) =>
                      `Moved ${result.moved ?? ''} file${result.moved === 1 ? '' : 's'} to ${to}`.replace('  ', ' '),
                    );
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="gx-btn gx-btn--outline"
                  disabled={busy}
                  onClick={() => {
                    // The count comes from the row, which is the worker's own count of the files
                    // under the prefix — including the ones a level down that are not on screen.
                    if (!window.confirm(deleteFolderConfirm(row.path, row.fileCount, data.trashRetentionDays))) return;
                    void act({ op: 'delete_folder', path: row.path }, (result) =>
                      `Moved ${result.deleted ?? ''} file${result.deleted === 1 ? '' : 's'} to the trash`.replace('  ', ' '),
                    );
                  }}
                >
                  Delete
                </button>
              </>
            )}
            <Icon d={PATH.chevronRight} size={13} />
          </div>
        ) : (
          <div key={row.path} className="gx-row">
            <span className="gx-row__main">
              {row.name}
              <span className="gx-row__meta">
                {/* A size that was never recorded says so. -1 must never render as "0 B". */}
                {row.bytes < 0 ? 'size not recorded' : formatFileBytes(row.bytes)}
                {row.updatedAt > 0 ? ` · ${new Date(row.updatedAt).toLocaleString()}` : ''}
              </span>
            </span>
            <button
              type="button"
              className="gx-btn gx-btn--outline"
              onClick={() => setOpen(open === row.path ? null : row.path)}
              aria-expanded={open === row.path}
            >
              {open === row.path ? 'Close' : 'Open'}
            </button>
          </div>
        ),
      )}

      {/* ------------------------------------------------------------- one file */}
      {open !== null && (
        <section aria-label={`Preview of ${open}`} style={{ marginTop: '0.9rem' }}>
          <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.4rem' }}>{open}</h3>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
            <button type="button" className="gx-btn gx-btn--outline" onClick={() => void downloadProjectFile(projectId, open)}>
              Download
            </button>
            {canEdit && (
              <>
                <button
                  type="button"
                  className="gx-btn gx-btn--outline"
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
                  className="gx-btn gx-btn--outline"
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
                  className="gx-btn gx-btn--outline"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(deleteConfirm(open, data.trashRetentionDays))) return;
                    void act({ op: 'delete', path: open }, 'Moved to the trash');
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </div>

          {file.isPending && <p className="gx-empty">Reading the file…</p>}
          {file.isError && (
            <p className="gx-pop__note" role="alert" style={{ padding: 0 }}>
              {file.error instanceof ApiError ? file.error.message : 'That file could not be read.'}
            </p>
          )}
          {file.data && <FilePreview path={open} content={file.data.content} />}

          {history.data && history.data.versions.length > 1 && (
            <div style={{ marginTop: '0.7rem' }}>
              <h4 style={{ fontSize: '0.8rem', margin: '0 0 0.35rem' }}>Earlier versions</h4>
              {history.data.versions.map((v: FileVersion) => (
                <div key={v.version} className="gx-row">
                  <span className="gx-row__main">
                    Version {v.version}
                    {v.current ? ' · current' : ''}
                    <span className="gx-row__meta">
                      {v.bytes < 0 ? 'size not recorded' : formatFileBytes(v.bytes)}
                      {v.savedAt > 0 ? ` · ${new Date(v.savedAt).toLocaleString()}` : ''}
                    </span>
                  </span>
                  {!v.current && canEdit && (
                    <button
                      type="button"
                      className="gx-btn gx-btn--outline"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(revertConfirm(open, v.version))) return;
                        void act({ op: 'revert', path: open, version: v.version }, `Put version ${v.version} back`);
                      }}
                    >
                      Put back
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
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

/** The preview itself. A CSV becomes a table, everything else becomes text, and a cut says so. */
function FilePreview({ path, content }: { path: string; content: string }) {
  const preview = previewOf(path, content);
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
    <div>
      <pre className="gx-files__text">{preview.text}</pre>
      {preview.truncated && (
        <p className="gx-row__meta">
          Showing the first {preview.text.split('\n').length} of {preview.lines} lines. Download the file for all of it.
        </p>
      )}
    </div>
  );
}
