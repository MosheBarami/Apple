// Opening a share link.
//
// This page is the other half of the mint control in the member panel, and neither is worth
// shipping without it: a token with nowhere to present it is a control that produces a useless
// string, and a redemption route nothing can reach is the same dead branch from the server's side.
// The worker has had POST /api/shared/links/redeem the whole time — it writes the KV grant that
// makes somebody a GUEST, `origin: 'link'`, which the roster has always been able to name and
// filter and suspend and revoke, and which until now could only be created by curl.
//
// THREE THINGS IT REFUSES TO DO:
//
//   IT DOES NOT SAY "FORBIDDEN". The route answers nine different refusals and they are not
//   variations on no: expired and revoked are things the person can ask the sender to fix; the
//   wrong_* three mean the link is for something else; and removed_from_project means an
//   administrator removed them and pressing it again will never work. lib/share-link.ts has the
//   sentence for each, and prints an unrecognised one as itself rather than as a blank page.
//
//   IT DOES NOT REDEEM ON ITS OWN. A GET that grants access is a link that any preview fetcher,
//   mail scanner or chat unfurler can spend on the recipient's behalf — and this one grants
//   membership of somebody else's project. The person presses Join.
//
//   IT DOES NOT ASSUME THE TOKEN IS IN THE URL. A link pasted into a chat client loses its query
//   string often enough that "nothing happened" is a common way to arrive here, so there is a box.
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, redeemShareLink } from '../lib/api';
import { readToken, redeemRefusal, tokenFrom } from '../lib/share-link';

export function JoinPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(() => readToken(location.search) ?? '');

  const join = useMutation({
    mutationFn: () => redeemShareLink(tokenFrom(token) ?? ''),
    onSuccess: (res) => {
      // `replace`, so Back does not return to a page whose only purpose was to spend a token that
      // is now spent.
      navigate(`/projects/${encodeURIComponent(res.projectId)}`, { replace: true });
    },
  });

  const refusal =
    join.error instanceof ApiError
      ? (redeemRefusal((join.error.body as { error?: unknown } | null)?.error) ?? join.error.message)
      : join.error
        ? 'Something went wrong opening that link.'
        : null;

  return (
    <div className="page">
      <div className="join">
        <h2 className="join__head">Join a project</h2>
        <p className="join__lede">
          Somebody shared a project with you. Opening it adds you to their project at the role their
          link carries — a link can never make you an administrator or an owner.
        </p>

        <form
          className="join__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (tokenFrom(token) !== null && !join.isPending) join.mutate();
          }}
        >
          <label className="field">
            <span className="field-label">Invitation link or code</span>
            <input
              className="mono"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste the link you were sent"
              autoComplete="off"
              spellCheck={false}
              // Focused only when the URL did not carry one: moving the caret for somebody who
              // arrived by clicking the link is interrupting them to fill in a box they cannot see
              // the point of.
              autoFocus={readToken(location.search) === null}
            />
          </label>

          <button type="submit" className="btn btn-primary" disabled={tokenFrom(token) === null || join.isPending}>
            {join.isPending ? 'Opening…' : 'Join the project'}
          </button>
        </form>

        {refusal && (
          <p className="join__refusal" role="alert">
            {refusal}
          </p>
        )}

        <Link to="/" className="join__back">
          Back to your projects
        </Link>
      </div>
    </div>
  );
}
