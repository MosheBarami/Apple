// What you wrote before you edited this message.
//
// The edit dialog next door says "That cannot be undone", and for the replies it is still true.
// What stopped being true is the PROMPT: the words typed the first time are the one thing in that
// transaction that cannot be reconstructed from anything else, and the worker now keeps them.
//
// READ-ONLY, ON PURPOSE. There is no "Restore" button here, and its absence is the design rather
// than an unfinished edge: restoring an old prompt means RUNNING it, which discards the whole
// conversation after it. That is exactly what the edit dialog does, and it asks first and says how
// many messages it is throwing away. A Restore here would be a second, quieter door into the most
// destructive action in the workspace, and the quiet one is the one people click by accident.
//
// The current text is rendered last, as part of the list. A column of drafts with no anchor is
// unreadable — the point of comparison is what is on screen now, so it has to be in the list, at
// the end, where it belongs in time.
import { useEffect, useState } from 'react';
import type { MessageRevisionDto } from '@golem/shared';
import { Modal } from '../modal';
import { fetchMessageRevisions, ApiError } from '../../lib/api';
import { clockTime } from '../../lib/format';
import {
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
} from '../ai-elements/message';
import { cn } from '../../lib/utils';

// PAGED, WITH THE CURRENT TEXT AS THE ANCHOR (AI Elements MessageBranch). The versions are pages —
// "2 of 3", Previous and Next — in the order they were written, opening on the one in force. While an
// older page is showing, what the message says now stays under it, because the point of this
// dialog is comparing the two. Still read-only: paging chooses what to READ, never what to run.

// A prompt's line breaks are part of what was typed (`whitespace-pre-wrap`), and a pasted id or URL has
// no break opportunity (`wrap-anywhere`), so neither may widen the dialog or be collapsed.
const ITEM = 'grid min-w-0 gap-1.5 py-3.5';
const WHEN = 'm-0 min-w-0 text-[11px] leading-normal tabular-nums text-muted-foreground';
const TEXT = 'm-0 min-w-0 whitespace-pre-wrap text-sm leading-relaxed wrap-anywhere';

export function RevisionsDialog({
  projectId,
  messageId,
  current,
  onClose,
}: {
  projectId: string;
  messageId: string;
  /** What the message says NOW, shown at the end of the list as the version in force. */
  current: string;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<MessageRevisionDto[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [page, setPage] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setRevisions(null);
    setFailed(null);
    fetchMessageRevisions(projectId, messageId)
      .then((res) => {
        if (live) setRevisions(res.revisions);
      })
      .catch((e: unknown) => {
        // A failed read and an empty history are different facts, and only one of them is true.
        // Rendering the failure as "you never edited this" would be the product asserting
        // something it does not know.
        if (live) setFailed(e instanceof ApiError ? e.message : 'Could not reach the server.');
      });
    return () => {
      live = false;
    };
  }, [projectId, messageId]);

  return (
    <Modal title="Earlier versions of this message" onClose={onClose}>
      {failed && <p className="danger-copy">Could not read the earlier versions — {failed}</p>}

      {!failed && revisions === null && <p className="page-note">Reading…</p>}

      {!failed && revisions !== null && (
        <MessageBranch className={cn('aie gx-revs grid min-w-0 gap-3')} defaultBranch={revisions.length} onBranchChange={setPage}>
          <MessageBranchContent className="border-b border-border motion-safe:animate-in motion-safe:fade-in-0">
            {[
              ...revisions.map((r) => (
                <div key={r.seq} className={ITEM}>
                  <p className={WHEN}>
                    {/* The stamp is the time the version was WRITTEN, carried across with the text, so
                        a draft from last week does not claim to be from the moment it was replaced. */}
                    Version {r.seq + 1}
                    {clockTime(new Date(r.createdAt).getTime()) ? ` · ${clockTime(new Date(r.createdAt).getTime())}` : ''}
                  </p>
                  <p className={cn(TEXT, 'text-muted-foreground')} dir="auto">
                    {r.content}
                  </p>
                </div>
              )),
              <div key="current" className={cn(ITEM, 'is-current')}>
                <p className={WHEN}>Current</p>
                <p className={cn(TEXT, 'text-foreground')} dir="auto">
                  {current}
                </p>
              </div>,
            ]}
          </MessageBranchContent>
          <MessageBranchSelector className="justify-center gap-1">
            <MessageBranchPrevious aria-label="Earlier version" />
            <MessageBranchPage aria-live="polite" className="min-w-16 justify-center tabular-nums" />
            <MessageBranchNext aria-label="Later version" />
          </MessageBranchSelector>
          {page !== null && page < revisions.length && (
            <div className="grid gap-1.5 rounded-md border border-border px-3.5 py-3">
              <p className={WHEN}>Now</p>
              <p className={cn(TEXT, 'text-foreground')} dir="auto">
                {current}
              </p>
            </div>
          )}
        </MessageBranch>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
