// Who is in this project, and what they may do.
//
// The server has had all of this for a while — a roster merged from the Postgres rows and the KV
// grants a redeemed share link minted, invite, role change, suspend, reactivate and revoke, each
// gated on `manage_members` and each audited. None of it was reachable: nothing in the web app
// called a single one of those routes, so the only way to add a collaborator was curl.
//
// WHAT THIS PANEL REFUSES TO DO, and why each refusal is the feature:
//
//   IT DOES NOT HIDE WHAT YOU CANNOT DO. A viewer sees the member list with the controls visibly
//   off and a sentence saying their role cannot manage members. Hiding them teaches people the
//   product does not have the feature; showing them dead teaches people the product is broken;
//   showing them off, with the reason, is the only version that answers the question they have.
//
//   IT DOES NOT ENABLE ANYTHING ON AN UNVERIFIED PERMISSION. While the access check is in flight,
//   or after it has failed, every control is off — and the explanation says which of those two it
//   is rather than blaming the user's role for a request that never came back. See lib/capabilities.
//
//   IT DOES NOT PRESENT A SHORT LIST AS A WHOLE ONE. The roster answers `partial` when the link
//   grants could not all be read, and `matched`/`total` when a filter or the page window cut it.
//   Both are said out loud: a member list missing the person you are looking for, with no sign
//   that anything is missing, is how an admin concludes someone was removed.
//
//   IT DOES NOT OFFER A STATUS FILTER TO SOMEONE THE SERVER WILL REFUSE. `?status=revoked` needs
//   `manage_members` and answers 403 without it. Offering the control and rendering the refusal
//   would be the product asking a question it knows it cannot answer.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  bulkInviteMembers,
  createShareLink,
  fetchMemberEvents,
  fetchShareLinks,
  revokeShareLinkById,
  fetchMemberImpact,
  fetchMembers,
  inviteMember,
  reactivateMember,
  removeMember,
  suspendMember,
  type MemberRow,
} from '../../lib/api';
import {
  GRANTABLE_ROLES,
  LINKABLE_ROLES,
  ROLE_BLURBS,
  ROLE_LABELS,
  allows,
  isRole,
  roleLabel,
  whyNot,
  type AccessState,
  type GrantableRole,
  type LinkableRole,
} from '../../lib/capabilities';
import { rankMembers } from '../../lib/member-match';
import { BULK_INVITE_MAX, bulkRefusal, explainRejections, parseBulkIds, type BulkProblem } from '../../lib/bulk-invite';
import { MEMBER_REASON_MAX, describeEvent, historyGap, unauditedNote } from '../../lib/member-history';
import { readImpact } from '../../lib/member-impact';
import { linkInventoryGap, linkStanding, shareLinkUrl } from '../../lib/share-link';
import { relativeTime } from '../../lib/format';
import { useToast } from '../toast';
import { createUndoable } from '../../lib/undo';

/** Mirrors MEMBER_STATUSES in apps/worker/src/membership.ts, plus the 'all' the query accepts. */
const STATUS_FILTERS = ['active', 'suspended', 'revoked', 'expired', 'all'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_LABELS: Record<StatusFilter, string> = {
  active: 'Active',
  suspended: 'Suspended',
  revoked: 'Removed',
  expired: 'Expired',
  all: 'Everyone',
};

const STATUS_NOTE: Record<string, string> = {
  active: '',
  suspended: 'Paused — cannot open the project until reactivated.',
  revoked: 'Removed. A share link they still hold will not let them back in.',
  expired: 'Their invitation ran out.',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function MembersPanel({ projectId, access }: { projectId: string; access: AccessState }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  /**
   * "It happened, and we did not write it down."
   *
   * Every membership route answers `audited`, because the change lands before the history append
   * runs and a failed append must not undo it. Held here rather than toasted: a toast for an
   * unrecorded change is gone by the time anybody needs to say which change it was.
   */
  const [auditNote, setAuditNote] = useState<string | null>(null);
  /**
   * Which row has opened its second step, and which step. One at a time: two half-filled pause
   * reasons on screen is two chances to attach the wrong one to the wrong person.
   */
  const [pending, setPending] = useState<{ userId: string; kind: 'remove' | 'pause' | 'history' } | null>(null);

  const mayManage = allows(access, 'manage_members');
  const cannotManage = whyNot(access, 'manage_members');

  // The status filter is only sent when the caller may use it. Asking for 'revoked' without
  // `manage_members` is a 403 by design, and rendering that refusal would be this panel creating
  // an error it knew about in advance.
  const effectiveStatus: StatusFilter = mayManage ? status : 'active';
  const params = new URLSearchParams({ status: effectiveStatus });
  if (query.trim()) params.set('q', query.trim());

  const roster = useQuery({
    queryKey: ['members', projectId, effectiveStatus, query.trim()],
    queryFn: () => fetchMembers(projectId, params),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['members', projectId] });

  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: GrantableRole }) => inviteMember(projectId, { userId, role }),
    onSuccess: (res, v) => {
      toast(`Role changed to ${ROLE_LABELS[v.role]}.`, 'success');
      setAuditNote(unauditedNote(res));
      void invalidate();
    },
    onError: (e: Error) => toast(`Could not change the role: ${e.message}`, 'error'),
  });

  const remove = useMutation({
    mutationFn: (member: MemberRow) => removeMember(projectId, member.userId),
    onSuccess: (res, member) => {
      setAuditNote(unauditedNote(res));
      void invalidate();
      // Revoked rather than deleted, so putting it back is a re-invitation at the role they had.
      // Offered only when we still KNOW that role: re-inviting at a guessed one would hand someone
      // more access than they started with, which is the one mistake an undo must never make.
      const previous = member.role;
      if (isRole(previous) && previous !== 'owner') {
        const undo = createUndoable({
          label: 'Undo',
          reverse: () => inviteMember(projectId, { userId: member.userId, role: previous }).then(invalidate),
        });
        toast(`${member.handle} removed.`, 'success', { action: { label: 'Undo', run: () => void undo.undo() } });
      } else {
        toast(`${member.handle} removed. Their previous role is not recorded, so re-adding them is a new invitation.`, 'success');
      }
    },
    onError: (e: Error) => toast(`Could not remove them: ${e.message}`, 'error'),
  });

  // THE REASON IS PART OF THE ACT. The route stores it, audits it and returns it; this control
  // passed '' and so every suspension in the history said null — the server being careful about a
  // field the only caller never filled in.
  const suspend = useMutation({
    mutationFn: ({ member, reason }: { member: MemberRow; reason: string }) =>
      suspendMember(projectId, member.userId, reason.trim().slice(0, MEMBER_REASON_MAX)),
    onSuccess: (res) => {
      toast('Paused. They cannot open the project until you reactivate them.', 'success');
      setAuditNote(unauditedNote(res));
      void invalidate();
    },
    onError: (e: Error) => toast(`Could not pause them: ${e.message}`, 'error'),
  });

  const reactivate = useMutation({
    mutationFn: (member: MemberRow) => reactivateMember(projectId, member.userId),
    onSuccess: (res) => {
      toast('Back in.', 'success');
      setAuditNote(unauditedNote(res));
      void invalidate();
    },
    onError: (e: Error) => toast(`Could not reactivate them: ${e.message}`, 'error'),
  });

  // Ordered here, filtered there. The server decides WHICH members match — the list can be longer
  // than one page, and a client-side filter would answer "no such member" about someone on the
  // next one — while relevance decides the order, because alphabetical order and "the person you
  // just typed the name of" agree only by accident.
  const members = useMemo(() => rankMembers(roster.data?.members ?? [], query), [roster.data, query]);

  const busyFor = (userId: string) =>
    (setRole.isPending && setRole.variables?.userId === userId) ||
    (remove.isPending && remove.variables?.userId === userId) ||
    (suspend.isPending && suspend.variables?.member.userId === userId) ||
    (reactivate.isPending && reactivate.variables?.userId === userId);

  return (
    <div className="mb">
      <p className="mb__role">
        You are <strong>{roleLabel(access)}</strong> here.
        {cannotManage && <span className="mb__why"> {cannotManage}</span>}
      </p>

      {auditNote && (
        <p className="cs__note cs__note--warn" role="status">
          {auditNote}
        </p>
      )}

      <div className="mb__controls">
        <input
          className="cs__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members…"
          aria-label="Search members"
          autoComplete="off"
          spellCheck={false}
        />
        {mayManage && (
          <select
            className="cs__select"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label="Filter by membership status"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </div>

      {roster.isPending && (
        <p className="cs__note" aria-busy="true">
          Loading the member list…
        </p>
      )}

      {roster.isError && (
        <p className="cs__note cs__note--bad" role="alert">
          {roster.error instanceof ApiError ? roster.error.message : 'Could not load the member list.'}
        </p>
      )}

      {roster.isSuccess && (
        <>
          <p className="cs__count">
            {roster.data.matched === roster.data.total
              ? `${roster.data.total} ${roster.data.total === 1 ? 'member' : 'members'}`
              : `${roster.data.matched} of ${roster.data.total} members`}
          </p>

          {/* A list that could not be assembled in full says so. An admin looking for someone who
              is not on screen must be able to tell "they are not a member" from "we could not
              read part of the list". */}
          {roster.data.partial && (
            <p className="cs__note cs__note--warn" role="status">
              Part of this list could not be read, so someone may be missing from it.
            </p>
          )}
          {roster.data.more && (
            <p className="cs__note cs__note--warn" role="status">
              More members match than fit on this page — narrow the search to see the rest.
            </p>
          )}

          {members.length === 0 && (
            <p className="cs__note">
              {query.trim() ? `Nobody here matches “${query.trim()}”.` : 'Nobody else has access to this project.'}
            </p>
          )}

          <ul className="mb__list">
            {members.map((m) => (
              <li key={m.userId} className={`mb__row${m.status === 'active' ? '' : ' is-inactive'}`}>
                <div className="mb__who">
                  <span className="mb__handle">{m.displayName ?? m.handle}</span>
                  <span className="mb__sub">
                    {m.displayName ? `${m.handle} · ` : ''}
                    {/* The role a row CARRIES is shown even when the row is dead — "was an editor"
                        is the sentence an admin needs. A role string this build does not know is
                        printed as it came rather than dropped: a member rendered with no role at
                        all reads as a member with no access. */}
                    {m.role ? ROLE_LABELS[m.role as keyof typeof ROLE_LABELS] ?? m.role : 'No role recorded'}
                    {m.guest ? ' · joined by link' : ''}
                    {m.expiresAt ? ` · until ${relativeTime(m.expiresAt)}` : ''}
                  </span>
                  {m.status !== 'active' && <span className="mb__status">{STATUS_NOTE[m.status] ?? m.status}</span>}
                </div>

                {m.origin === 'owner' ? (
                  <span className="mb__owner">Owner</span>
                ) : (
                  <div className="mb__actions">
                    <label className="mb__role-label">
                      {/* `visually-hidden` is this app's utility (styles.css). The panel was
                          written against `sr-only`, which no stylesheet here defines, so the label
                          rendered as visible body text beside every row. */}
                      <span className="visually-hidden">Role for {m.handle}</span>
                      <select
                        className="cs__select"
                        value={GRANTABLE_ROLES.includes(m.role as GrantableRole) ? (m.role as GrantableRole) : ''}
                        disabled={!mayManage || busyFor(m.userId)}
                        title={cannotManage ?? undefined}
                        onChange={(e) => setRole.mutate({ userId: m.userId, role: e.target.value as GrantableRole })}
                      >
                        {/* An unrecognised or absent role keeps a placeholder option rather than
                            being snapped to the first one in the list: a select that silently
                            displays 'viewer' for a row that says something else is a control
                            lying about the state it is editing. */}
                        {!GRANTABLE_ROLES.includes(m.role as GrantableRole) && <option value="">{m.role ?? 'No role'}</option>}
                        {GRANTABLE_ROLES.map((r) => (
                          <option key={r} value={r} title={ROLE_BLURBS[r]}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </label>

                    {/* REACTIVATE IS OFFERED FOR A REMOVAL TOO, not only a pause. The route
                        clears revoked_at and the suspension together and restores at the role the
                        grant carried, so undoing a removal from the list is one press — it used to
                        require re-inviting, which records an invitation rather than a
                        reinstatement and lets the admin pick a role by accident. Not offered for
                        'expired': reactivate does not touch expires_at, so it would appear to work
                        and change nothing. */}
                    {m.status === 'suspended' || m.status === 'revoked' ? (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={!mayManage || busyFor(m.userId)}
                        title={cannotManage ?? undefined}
                        onClick={() => reactivate.mutate(m)}
                      >
                        {m.status === 'revoked' ? 'Put back' : 'Reactivate'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={!mayManage || busyFor(m.userId)}
                        title={cannotManage ?? undefined}
                        aria-expanded={pending?.userId === m.userId && pending.kind === 'pause'}
                        onClick={() =>
                          setPending((p) => (p?.userId === m.userId && p.kind === 'pause' ? null : { userId: m.userId, kind: 'pause' }))
                        }
                      >
                        Pause
                      </button>
                    )}

                    {/* THE HISTORY HAS A READER AT LAST. membership_events is append-only and
                        the route merges the link acceptances in from the KV grant, and neither had
                        a client function or a view: the record was written where nobody could read
                        it. Any member may read their own; reading somebody else's needs
                        manage_members and is a 403 without it, so this is offered only to a caller
                        the route will answer rather than rendering a refusal we knew about. */}
                    {mayManage && (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        aria-expanded={pending?.userId === m.userId && pending.kind === 'history'}
                        onClick={() =>
                          setPending((p) =>
                            p?.userId === m.userId && p.kind === 'history' ? null : { userId: m.userId, kind: 'history' },
                          )
                        }
                      >
                        History
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-quiet mb__remove"
                      disabled={!mayManage || busyFor(m.userId) || m.status === 'revoked'}
                      title={cannotManage ?? undefined}
                      aria-expanded={pending?.userId === m.userId && pending.kind === 'remove'}
                      onClick={() =>
                        setPending((p) => (p?.userId === m.userId && p.kind === 'remove' ? null : { userId: m.userId, kind: 'remove' }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                )}

                {pending?.userId === m.userId && pending.kind === 'pause' && (
                  <PauseForm
                    member={m}
                    busy={busyFor(m.userId)}
                    onCancel={() => setPending(null)}
                    onPause={(reason) => {
                      setPending(null);
                      suspend.mutate({ member: m, reason });
                    }}
                  />
                )}

                {pending?.userId === m.userId && pending.kind === 'history' && (
                  <MemberHistory projectId={projectId} member={m} />
                )}

                {pending?.userId === m.userId && pending.kind === 'remove' && (
                  <RemovePreview
                    projectId={projectId}
                    member={m}
                    busy={busyFor(m.userId)}
                    onCancel={() => setPending(null)}
                    onRemove={() => {
                      setPending(null);
                      remove.mutate(m);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <InviteForm projectId={projectId} mayManage={mayManage} cannotManage={cannotManage} onDone={invalidate} />
      <BulkInviteForm projectId={projectId} mayManage={mayManage} cannotManage={cannotManage} onDone={invalidate} />
      {/* Gated on `share` rather than `manage_members`: they are separate capabilities in
          COLLAB_ACTIONS and the mint route asks for the first one. */}
      <ShareLinkForm projectId={projectId} access={access} />
    </div>
  );
}

/**
 * Adding someone.
 *
 * IT ASKS FOR A USER ID, AND SAYS SO. The invite route takes a UUID, and there is no directory to
 * search: this product has no route that turns a name or an email into a user id, and inventing a
 * lookup here that guessed would be worse than asking. Stating the requirement plainly is the
 * honest version of a feature whose other half does not exist yet — the box does not pretend to
 * accept an email and then fail on it.
 */
function InviteForm({
  projectId,
  mayManage,
  cannotManage,
  onDone,
}: {
  projectId: string;
  mayManage: boolean;
  cannotManage: string | null;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<GrantableRole>('editor');
  const [expiresAt, setExpiresAt] = useState('');

  const invite = useMutation({
    mutationFn: () =>
      inviteMember(projectId, {
        userId: userId.trim(),
        role,
        // A date is a day; the grant should last to the END of it rather than expiring at the
        // midnight that opens it.
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59.999Z`).toISOString() : null,
      }),
    onSuccess: (res) => {
      toast(res.event === 'invited' ? 'Invited.' : 'Their access was updated.', 'success');
      setUserId('');
      setExpiresAt('');
      onDone();
    },
    onError: (e: Error) => toast(`Could not invite them: ${e.message}`, 'error'),
  });

  const wellFormed = UUID_RE.test(userId.trim());

  return (
    <form
      className="mb__invite"
      onSubmit={(e) => {
        e.preventDefault();
        if (mayManage && wellFormed) invite.mutate();
      }}
    >
      <h3 className="mb__invite-head">Add someone</h3>
      <p className="cs__note">
        Paste their Apple user ID. There is no name lookup yet, so an email or a handle will not
        work here.
      </p>
      <label className="field">
        <span className="field-label">User ID</span>
        <input
          className="cs__input mono"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          disabled={!mayManage}
          aria-invalid={userId.trim().length > 0 && !wellFormed}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {userId.trim().length > 0 && !wellFormed && (
        <p className="cs__note cs__note--warn">That is not a user ID — it should look like the example above.</p>
      )}
      <div className="mb__invite-row">
        <label className="field">
          <span className="field-label">Role</span>
          <select className="cs__select" value={role} onChange={(e) => setRole(e.target.value as GrantableRole)} disabled={!mayManage}>
            {GRANTABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Until (optional)</span>
          <input
            className="cs__date"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            disabled={!mayManage}
          />
        </label>
      </div>
      <p className="cs__note">{ROLE_BLURBS[role]}</p>
      <button type="submit" className="btn btn-primary" disabled={!mayManage || !wellFormed || invite.isPending} title={cannotManage ?? undefined}>
        {invite.isPending ? 'Adding…' : 'Add to project'}
      </button>
      {cannotManage && <p className="cs__note cs__note--warn">{cannotManage}</p>}
    </form>
  );
}

/**
 * Adding a class, a team or a playtest group in one go.
 *
 * The route has been there the whole time — capped at fifty, refused WHOLE rather than truncated,
 * every row validated before anything is written, one PostgREST call so the accepted rows land
 * together or not at all. Nothing in the app posted to it; unlike the single invite it did not even
 * have an orphaned control.
 *
 * WHAT THIS RENDERS THAT A COUNT WOULD NOT. The answer is per row: `rejected[]` names each refused
 * row by its index with a reason — bad_user, unknown_role, duplicate, bad_expiry. "3 of 5 added" is
 * the same information with the actionable half removed, and it leaves somebody bisecting their own
 * list to find the two lines they need to fix. lib/bulk-invite.ts turns those indexes back into the
 * LINES they typed, which is not the same number once a blank line is in the list.
 *
 * AND WHY THE BOX IS NOT REWRITTEN AFTERWARDS. The tempting nicety — drop the accepted rows and
 * leave the refused ones to fix — renumbers every line under the problem list that is pointing at
 * them. The text stays exactly as typed while there is anything to correct, and is cleared only
 * when there is nothing left to say.
 */
function BulkInviteForm({
  projectId,
  mayManage,
  cannotManage,
  onDone,
}: {
  projectId: string;
  mayManage: boolean;
  cannotManage: string | null;
  onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [role, setRole] = useState<GrantableRole>('viewer');
  const [problems, setProblems] = useState<BulkProblem[]>([]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [auditNote, setAuditNote] = useState<string | null>(null);

  const entries = useMemo(() => parseBulkIds(text), [text]);
  // Said before they press rather than after the server refuses: the batch is rejected whole, so a
  // fifty-first line costs them all fifty.
  const overCap = entries.length > BULK_INVITE_MAX;

  const clearAnswer = () => {
    setProblems([]);
    setRefusal(null);
    setAdded(null);
    setAuditNote(null);
  };

  const send = useMutation({
    mutationFn: () => bulkInviteMembers(projectId, entries.map((e) => ({ userId: e.userId, role }))),
    onSuccess: (res) => {
      const rejected = explainRejections(res.rejected, entries);
      setProblems(rejected);
      setRefusal(res.applied ? null : bulkRefusal(res.error, res.max));
      setAdded(res.counts?.invited ?? res.invited?.length ?? 0);
      setAuditNote(unauditedNote(res));
      if (res.applied && rejected.length === 0) setText('');
      onDone();
    },
    onError: (e: Error) => {
      // A 400 from this route is usually an ANSWER, not a failure: when every row is refused the
      // body carries the same per-row list a 201 would. Reading only `message` here would print
      // "Request failed (400)" over the top of the only useful thing the server said.
      const body = e instanceof ApiError ? (e.body as { rejected?: unknown; error?: unknown; max?: unknown } | null) : null;
      const rejected = explainRejections(body?.rejected, entries);
      setProblems(rejected);
      setRefusal(bulkRefusal(body?.error, body?.max) ?? (rejected.length > 0 ? null : e.message));
      setAdded(0);
      setAuditNote(null);
    },
  });

  return (
    <details className="mb__bulk">
      <summary className="mb__bulk-summary">Add several at once</summary>
      <form
        className="mb__bulk-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mayManage || entries.length === 0 || overCap) return;
          clearAnswer();
          send.mutate();
        }}
      >
        <p className="cs__note">
          One user ID per line. Everyone on the list is added at the same role — invite anyone who
          needs a different one on their own above.
        </p>
        <label className="field">
          <span className="field-label">User IDs</span>
          <textarea
            className="cs__input mb__textarea mono"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'00000000-0000-0000-0000-000000000000\n00000000-0000-0000-0000-000000000001'}
            disabled={!mayManage}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <p className="cs__count">{entries.length === 1 ? '1 person' : `${entries.length} people`}</p>
        {overCap && (
          <p className="cs__note cs__note--warn">
            That is more than {BULK_INVITE_MAX} at once, and the list is refused whole rather than
            cut short. Send it in batches of {BULK_INVITE_MAX} or fewer.
          </p>
        )}
        <label className="field">
          <span className="field-label">Role for everyone on the list</span>
          <select
            className="cs__select"
            value={role}
            onChange={(e) => setRole(e.target.value as GrantableRole)}
            disabled={!mayManage}
          >
            {GRANTABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <p className="cs__note">{ROLE_BLURBS[role]}</p>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!mayManage || entries.length === 0 || overCap || send.isPending}
          title={cannotManage ?? undefined}
        >
          {send.isPending ? 'Adding…' : `Add ${entries.length === 1 ? 'them' : 'them all'}`}
        </button>
        {cannotManage && <p className="cs__note cs__note--warn">{cannotManage}</p>}

        {added !== null && (
          <p className="cs__count" role="status">
            {added} added
          </p>
        )}
        {refusal && (
          <p className="cs__note cs__note--bad" role="alert">
            {refusal}
          </p>
        )}
        {auditNote && (
          <p className="cs__note cs__note--warn" role="status">
            {auditNote}
          </p>
        )}
        {problems.length > 0 && (
          <ul className="mb__problems">
            {problems.map((p) => (
              <li key={`${p.line ?? 'x'}-${p.userId ?? ''}-${p.message}`} className="mb__problem">
                <span className="mb__problem-line">{p.line === null ? 'On the list' : `Line ${p.line}`}</span>
                {p.userId && <span className="mb__problem-id mono">{p.userId}</span>}
                <span className="mb__problem-why">{p.message}</span>
              </li>
            ))}
          </ul>
        )}
      </form>
    </details>
  );
}

/**
 * WHAT IS STILL OPEN.
 *
 * A share link was revocable only by somebody who still held it, and nothing listed the links a
 * project had issued — so an administrator who minted one, sent it and closed the tab had handed
 * out access they could never withdraw. Adding the mint control above without this would have made
 * that worse rather than better, which is why they land together.
 *
 * NO TOKENS COME BACK, by design at the route. Each row is named by an opaque id, which is what
 * Revoke sends; the secret stays on the server and this screen stays safe to screenshot.
 *
 * A SHORT LIST IS SAID OUT LOUD, and it is not the same warning as the roster's. This is an
 * inventory of credentials: a link missing from it is a link still working, and an administrator
 * reading a complete-looking list concludes they have withdrawn everything.
 */
function OutstandingLinks({ projectId, mayShare }: { projectId: string; mayShare: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = Date.now();

  const links = useQuery({
    queryKey: ['share-links', projectId],
    queryFn: () => fetchShareLinks(projectId),
    enabled: mayShare,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeShareLinkById(projectId, id),
    onSuccess: () => {
      toast('That link will not let anybody else in.', 'success');
      void qc.invalidateQueries({ queryKey: ['share-links', projectId] });
    },
    onError: (e: Error) => toast(`Could not turn it off: ${e.message}`, 'error'),
  });

  if (!mayShare) return null;

  const gap = links.isSuccess ? linkInventoryGap(links.data) : null;
  const rows = links.data?.links ?? [];

  return (
    <div className="mb__links">
      <h4 className="mb__links-head">Links you have made</h4>

      {links.isPending && (
        <p className="cs__note" aria-busy="true">
          Reading them…
        </p>
      )}

      {links.isError && (
        <p className="cs__note cs__note--bad" role="alert">
          {/* Loudly, because the thing we cannot read is a list of working credentials. */}
          We could not read this project’s links, so we cannot tell you what is still open.
        </p>
      )}

      {gap && (
        <p className="cs__note cs__note--warn" role="status">
          {gap}
        </p>
      )}

      {links.isSuccess && rows.length === 0 && !gap && <p className="cs__note">None. Nothing is open by link.</p>}

      {rows.length > 0 && (
        <ul className="mb__links-list">
          {rows.map((row) => {
            const standing = linkStanding(row, now);
            return (
              <li key={row.id} className={`mb__linkrow${standing.dead ? ' is-inactive' : ''}`}>
                <div className="mb__who">
                  <span className="mb__handle">
                    {ROLE_LABELS[row.role as keyof typeof ROLE_LABELS] ?? row.role} link
                  </span>
                  <span className="mb__sub">
                    {standing.label}
                    {' · made '}
                    {relativeTime(row.createdAt)}
                    {row.expiresAt && !standing.dead ? ` · until ${relativeTime(row.expiresAt)}` : ''}
                    {` · used ${row.redeemed} ${row.redeemed === 1 ? 'time' : 'times'}`}
                  </span>
                </div>
                <div className="mb__actions">
                  <button
                    type="button"
                    className="btn btn-quiet mb__remove"
                    // Nothing to turn off on a link that is already off. An expired one is still
                    // offered: revoking it is how an administrator stops it coming back if the
                    // expiry was ever extended.
                    disabled={standing.state === 'revoked' || revoke.isPending}
                    onClick={() => revoke.mutate(row.id)}
                  >
                    Turn off
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Why removing somebody is not a ConfirmDialog.
 *
 * lib/confirm-model.ts decides ceremony from consequence, and a member removal is REVERSIBLE — the
 * route revokes rather than deletes, and Put back restores at the role the grant carried — and
 * destroys nothing the user made. `confirmationFor` therefore returns 'none', and putting a modal
 * "are you sure?" in front of it is precisely the habit that file exists to stop: a dialog in front
 * of a reversible action teaches people to dismiss dialogs, which is the training you do not want
 * them to arrive with when the permanent one appears.
 *
 * What this is instead is the ANSWER TO A QUESTION THEY CANNOT OTHERWISE ASK. `GET
 * /members/:userId/impact` counts what the departing member holds — in SQL, in the project's own
 * store — and states what the removal does and does not do. That is information, not friction, and
 * the moment it is worth reading is the moment somebody reaches for Remove. So it opens under the
 * row, not over the page; it is not modal, it traps no focus, and Cancel is a plain button rather
 * than a dismissal.
 *
 * IT DOES NOT BLOCK ON ITS OWN FAILURE. If the preview cannot be read, Remove is still offered
 * with the failure said out loud — refusing to let an administrator remove somebody because a
 * count did not come back would be this panel deciding that its own telemetry outranks the person
 * using it. What it must never do is render the missing count as a zero, which is the whole reason
 * lib/member-impact.ts is a module and not an inline `?? 0`.
 */
function RemovePreview({
  projectId,
  member,
  busy,
  onCancel,
  onRemove,
}: {
  projectId: string;
  member: MemberRow;
  busy: boolean;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const impact = useQuery({
    queryKey: ['member-impact', projectId, member.userId],
    queryFn: () => fetchMemberImpact(projectId, member.userId),
    // A preview is only worth showing while it is current; refetched each time the row is opened.
    staleTime: 0,
    gcTime: 0,
  });

  const reading = impact.isSuccess ? readImpact(impact.data) : null;

  return (
    <div className="mb__step" role="group" aria-label={`Remove ${member.handle}`}>
      <p className="mb__step-head">Remove {member.displayName ?? member.handle}?</p>

      {impact.isPending && (
        <p className="cs__note" aria-busy="true">
          Counting what they hold here…
        </p>
      )}

      {impact.isError && (
        <p className="cs__note cs__note--warn" role="status">
          We could not read what removing them would do. You can still remove them — we simply
          cannot tell you what they hold first.
        </p>
      )}

      {reading && (
        <>
          {reading.warnings.map((w) => (
            <p key={w} className="cs__note cs__note--warn" role="status">
              {w}
            </p>
          ))}

          {reading.counts === null ? null : (
            <ul className="mb__counts">
              {reading.counts.map((c) => (
                <li key={c.label} className="mb__count">
                  <span className="mb__count-n">{c.value}</span>
                  <span className="mb__count-label">{c.label}</span>
                </li>
              ))}
            </ul>
          )}

          <ul className="mb__effects">
            {reading.effects.map((e) => (
              <li key={e} className="mb__effect">
                {e}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mb__step-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-quiet mb__remove" onClick={onRemove} disabled={busy}>
          {busy ? 'Removing…' : 'Remove them'}
        </button>
      </div>
    </div>
  );
}

/**
 * Pausing somebody, and saying why.
 *
 * The route stores the reason, audits it, and hands it back on the roster row. The one control
 * that reached it passed `''`, so every suspension in the history said null — the server being
 * careful about a field its only caller never filled in, which is the same defect as an unmounted
 * panel one layer down.
 *
 * Optional, because a pause is reversible and demanding an essay before an admin may act is its own
 * kind of obstruction. Capped at the length the column actually holds: the route truncates
 * silently, and the end of a reason is usually the half that says what to do about it.
 */
function PauseForm({
  member,
  busy,
  onCancel,
  onPause,
}: {
  member: MemberRow;
  busy: boolean;
  onCancel: () => void;
  onPause: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <form
      className="mb__step"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onPause(reason);
      }}
    >
      <p className="mb__step-head">Pause {member.displayName ?? member.handle}</p>
      <p className="cs__note">
        They cannot open the project until you reactivate them. Nothing they have made is touched.
      </p>
      <label className="field">
        <span className="field-label">Why? (optional — it goes in the membership history)</span>
        <input
          className="cs__input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MEMBER_REASON_MAX}
          placeholder="Left the team for now"
          autoComplete="off"
          autoFocus
        />
      </label>
      <div className="mb__step-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-quiet" disabled={busy}>
          {busy ? 'Pausing…' : 'Pause them'}
        </button>
      </div>
    </form>
  );
}

/**
 * What has happened to one membership.
 *
 * Two stores, one list, and the route does the merging: `membership_events` in Postgres holds what
 * administrators did — invited, role changed, renewed, paused, reinstated, removed — and the
 * ACCEPTANCE of a share link lives on the grant in KV, because a stranger redeeming a link is not
 * yet a member of anything and an insert policy that let them write their own acceptance would let
 * anybody write any line into any project's history. Every entry says which store it came from.
 *
 * All of that was written where nobody could read it. api.ts had no function for the route and no
 * component rendered one — the acceptance in particular is the only moment in this product where
 * anybody actually says yes, and it was recorded, merged, tested and invisible.
 *
 * `partial` IS RENDERED. When the KV side cannot be read in full the route says so rather than
 * serving a short list as a whole one, and a history missing the entry somebody is looking for,
 * with nothing saying anything is missing, is how they conclude the event never happened. That is
 * the failure the route goes out of its way to avoid and a silent client undoes it.
 */
function MemberHistory({ projectId, member }: { projectId: string; member: MemberRow }) {
  const history = useQuery({
    queryKey: ['member-events', projectId, member.userId],
    queryFn: () => fetchMemberEvents(projectId, member.userId),
    staleTime: 0,
    gcTime: 0,
  });

  const gap = history.isSuccess ? historyGap(history.data) : null;
  const lines = history.isSuccess ? (history.data.events ?? []).map(describeEvent) : [];

  return (
    <div className="mb__step" role="group" aria-label={`History for ${member.handle}`}>
      <p className="mb__step-head">What has happened to {member.displayName ?? member.handle}</p>

      {history.isPending && (
        <p className="cs__note" aria-busy="true">
          Reading the history…
        </p>
      )}

      {history.isError && (
        <p className="cs__note cs__note--bad" role="alert">
          {history.error instanceof ApiError ? history.error.message : 'The history could not be read.'}
        </p>
      )}

      {gap && (
        <p className="cs__note cs__note--warn" role="status">
          {gap}
        </p>
      )}

      {history.isSuccess && lines.length === 0 && !gap && (
        // Distinguished from a history we could not read, above: the append-only table genuinely
        // has nothing for a grant older than the lifecycle migration.
        <p className="cs__note">Nothing is recorded for them yet.</p>
      )}

      {lines.length > 0 && (
        <ol className="mb__events">
          {lines.map((line, i) => (
            <li key={`${line.at ?? 'unknown'}-${i}`} className="mb__event">
              <span className="mb__event-what">{line.text}</span>
              <span className="mb__event-when">
                {line.at ? relativeTime(line.at) : 'time not recorded'}
                {/* Where it was read from. A reader who sees an acceptance with no administrator
                    behind it should be able to tell that it came from the grant rather than from
                    somebody's action. */}
                {line.source === 'grant' ? ' · from the share link' : ''}
              </span>
              {line.reason && <span className="mb__event-why">“{line.reason}”</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Sharing the project by link — the only way to make a GUEST.
 *
 * `origin: 'link'` has been a first-class member class since the roster was built: named, filtered,
 * suspended and revoked on the same terms as an invited member, and tested at every layer. It could
 * only be created by curl, because nothing in the app posted to POST /api/shared/:id/links — and
 * nothing could have opened the result either, which is why routes/join.tsx lands in the same
 * change. Half of this feature is worse than none of it.
 *
 * THE TOKEN IS SHOWN ONCE AND CANNOT BE ASKED FOR AGAIN. It is not on the roster, the membership
 * history deliberately never echoes it, and there is no route that lists a project's issued links.
 * So the panel says so plainly instead of letting somebody close the drawer and find out. It is
 * held in component state and not in the query cache, for the same reason.
 *
 * WHAT IT DOES NOT OFFER. No Admin in the role picker: the mint route redeems the link it is about
 * to hand out and refuses `role_too_strong` above editor, so that option would fail every time —
 * see LINKABLE_ROLES. And no scope picker: the narrower scopes need a `resourceId` naming the thing
 * the link opens, and this panel has nothing to name, so two of the three options would be dead.
 */
function ShareLinkForm({ projectId, access }: { projectId: string; access: AccessState }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const mayShare = allows(access, 'share');
  const cannotShare = whyNot(access, 'share');
  const [role, setRole] = useState<LinkableRole>('viewer');
  const [expiresAt, setExpiresAt] = useState('');
  const [link, setLink] = useState<string | null>(null);

  const mint = useMutation({
    mutationFn: () =>
      createShareLink(projectId, {
        role,
        // A date is a day, and the link should last to the end of it rather than expiring at the
        // midnight that opens it — the same reading the invite form gives the same control.
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59.999Z`).toISOString() : null,
      }),
    onSuccess: (res) => {
      setLink(shareLinkUrl(res.token, window.location.origin));
      // The inventory below is now one row out of date, and it is the only place this link can be
      // turned off from once the token leaves the screen.
      void qc.invalidateQueries({ queryKey: ['share-links', projectId] });
    },
    onError: (e: Error) => toast(`Could not make a link: ${e.message}`, 'error'),
  });

  const copy = () => {
    if (!link) return;
    // Clipboard access can be refused, and a Copy button that silently did nothing would send
    // somebody away believing they had the link.
    navigator.clipboard?.writeText(link).then(
      () => toast('Link copied.', 'success'),
      () => toast('Could not copy it — select the link and copy it by hand.', 'error'),
    );
  };

  return (
    <details className="mb__bulk">
      <summary className="mb__bulk-summary">Share by link</summary>
      <form
        className="mb__bulk-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (mayShare && !mint.isPending) mint.mutate();
        }}
      >
        <p className="cs__note">
          Anyone who opens the link joins this project at the role you choose. A link can never make
          somebody an administrator or an owner.
        </p>

        <div className="mb__invite-row">
          <label className="field">
            <span className="field-label">Role</span>
            <select
              className="cs__select"
              value={role}
              onChange={(e) => setRole(e.target.value as LinkableRole)}
              disabled={!mayShare}
            >
              {LINKABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Until (optional)</span>
            <input
              className="cs__date"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              disabled={!mayShare}
            />
          </label>
        </div>
        <p className="cs__note">{ROLE_BLURBS[role]}</p>

        <button type="submit" className="btn btn-primary" disabled={!mayShare || mint.isPending} title={cannotShare ?? undefined}>
          {mint.isPending ? 'Making a link…' : 'Make a link'}
        </button>
        {cannotShare && <p className="cs__note cs__note--warn">{cannotShare}</p>}

        {link && (
          <div className="mb__link" role="status">
            <p className="cs__note cs__note--warn">
              Copy it now. We cannot show it again — nothing stores it, not the member list and not
              the history. If you lose it, make another and turn this one off.
            </p>
            <input className="cs__input mono" value={link} readOnly onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
            <button type="button" className="btn btn-quiet" onClick={copy}>
              Copy link
            </button>
          </div>
        )}

        <OutstandingLinks projectId={projectId} mayShare={mayShare} />
      </form>
    </details>
  );
}
