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
  fetchMembers,
  inviteMember,
  reactivateMember,
  removeMember,
  suspendMember,
  type MemberRow,
} from '../../lib/api';
import {
  GRANTABLE_ROLES,
  ROLE_BLURBS,
  ROLE_LABELS,
  allows,
  isRole,
  roleLabel,
  whyNot,
  type AccessState,
  type GrantableRole,
} from '../../lib/capabilities';
import { rankMembers } from '../../lib/member-match';
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
    onSuccess: (_r, v) => {
      toast(`Role changed to ${ROLE_LABELS[v.role]}.`, 'success');
      void invalidate();
    },
    onError: (e: Error) => toast(`Could not change the role: ${e.message}`, 'error'),
  });

  const remove = useMutation({
    mutationFn: (member: MemberRow) => removeMember(projectId, member.userId),
    onSuccess: (_r, member) => {
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

  const suspend = useMutation({
    mutationFn: (member: MemberRow) => suspendMember(projectId, member.userId, ''),
    onSuccess: () => {
      toast('Paused. They cannot open the project until you reactivate them.', 'success');
      void invalidate();
    },
    onError: (e: Error) => toast(`Could not pause them: ${e.message}`, 'error'),
  });

  const reactivate = useMutation({
    mutationFn: (member: MemberRow) => reactivateMember(projectId, member.userId),
    onSuccess: () => {
      toast('Back in.', 'success');
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
    (suspend.isPending && suspend.variables?.userId === userId) ||
    (reactivate.isPending && reactivate.variables?.userId === userId);

  return (
    <div className="mb">
      <p className="mb__role">
        You are <strong>{roleLabel(access)}</strong> here.
        {cannotManage && <span className="mb__why"> {cannotManage}</span>}
      </p>

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

                    {m.status === 'suspended' ? (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={!mayManage || busyFor(m.userId)}
                        title={cannotManage ?? undefined}
                        onClick={() => reactivate.mutate(m)}
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={!mayManage || busyFor(m.userId) || m.status === 'revoked'}
                        title={cannotManage ?? undefined}
                        onClick={() => suspend.mutate(m)}
                      >
                        Pause
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-quiet mb__remove"
                      disabled={!mayManage || busyFor(m.userId) || m.status === 'revoked'}
                      title={cannotManage ?? undefined}
                      onClick={() => remove.mutate(m)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <InviteForm projectId={projectId} mayManage={mayManage} cannotManage={cannotManage} onDone={invalidate} />
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
