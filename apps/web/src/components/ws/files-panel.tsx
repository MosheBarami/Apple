/**
 * THE DRAWER THAT OPENS THE PROJECT'S FILES.
 *
 * Apple writes notes, plans and generated data into the project workspace, and until this panel
 * existed the only way to read one was to ask Apple to read it back to you. Everything decided here
 * is decided in `files-model.ts`; this file is markup, a query, and five actions.
 *
 * Two things it deliberately does NOT offer:
 *
 *   NO "NEW FOLDER". The store is flat — a folder is a prefix two files share — so an empty folder
 *   cannot exist. A button that appears to work and leaves nothing behind is worse than its absence.
 *   NO UPLOAD. There is no object store behind this worker, and the write path takes text through
 *   the agent. Offering a file picker that can only accept a subset of text files, silently, would
 *   promise a feature the deployment does not have.
 */
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  downloadProjectFile,
  fetchFileHistory,
  fetchProjectFile,
  fetchProjectFiles,
  fileOp,
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
  previewOf,
  refusalCopy,
  revertConfirm,
  storageSummary,
  trashLine,
  type FileVersion,
} from './files-model';

export function FilesPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
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

  const refresh = useCallback(async () => {
    await listing.refetch();
    await file.refetch();
    await history.refetch();
  }, [listing, file, history]);

  /**
   * Every action goes through here, so a refusal is reported the same way whichever button sent it.
   *
   * `said` may be a FUNCTION of the result rather than a fixed sentence, because some of these
   * operations decide something the caller did not ask for and the user has to be told what it was:
   * a copy with no destination gets a free name chosen by the server. Returns the result on success
   * and null on refusal, so a caller that needs to follow the file — reopening it at its new path —
   * can.
   */
  const act = useCallback(
    async (
      body: Parameters<typeof fileOp>[1],
      said: string | ((result: Record<string, unknown>) => string),
    ): Promise<Record<string, unknown> | null> => {
      setBusy(true);
      setNotice(null);
      const res = await fileOp(projectId, body);
      setBusy(false);
      if (!res.ok) {
        setNotice(refusalCopy(res.code, res.error));
        // The list is refreshed on failure too: the commonest refusal is "that file is not there
        // any more", and leaving the stale row on screen invites the same click again.
        void listing.refetch();
        return null;
      }
      setNotice(typeof said === 'function' ? said(res.result) : said);
      await refresh();
      return res.result;
    },
    [projectId, listing, refresh],
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
    return <Failure error={listing.error} onRetry={() => void listing.refetch()} />;
  }

  const data = listing.data;
  const summary = storageSummary(data);
  const rows = browseRows(data.files, prefix);
  const crumbs = breadcrumbs(prefix);
  const now = Date.now();

  return (
    <div className="gx-files">
      <p className="gx-row__meta" style={{ marginBottom: '0.7rem' }}>
        {summary.lines.join(' · ')}
      </p>

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
          they are Golem’s own storage, not your Roblox place.
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
          <button
            key={row.path}
            type="button"
            className="gx-row"
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => {
              setPrefix(row.path);
              setOpen(null);
            }}
          >
            <Icon d={PATH.layers} size={14} />
            <span className="gx-row__main">
              {row.name}
              <span className="gx-row__meta">
                {row.fileCount} file{row.fileCount === 1 ? '' : 's'} · {formatFileBytes(row.bytes)}
              </span>
            </span>
            <Icon d={PATH.chevronRight} size={13} />
          </button>
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
                    void act({ op: 'rename', path: open, to }, `Renamed to ${to}`).then((result) => {
                      if (result) setOpen(to);
                    });
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
                    void act({ op: 'delete', path: open }, 'Moved to the trash').then((result) => {
                      if (result) setOpen(null);
                    });
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
