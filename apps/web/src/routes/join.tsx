// Where a share link lands.
//
// The worker has redeemed links since the feature was written, and until now nothing could reach
// that route: there was no page in this app that a link could point at, so every link this product
// could mint was a token with nowhere to take it. A "Copy link" button without this page would be
// the exact defect this codebase keeps finding — a control wired to nothing.
//
// IT REDEEMS ONCE, AND SAYS WHICH THING HAPPENED. Three outcomes are genuinely different and are
// rendered differently: you are in (and are taken to the project), the link was READ AND REFUSED
// (and the reason is named — revoked, expired, removed), or the REQUEST ITSELF FAILED. The third
// is not a refusal: the link may be perfectly good, so it offers a retry instead of telling
// somebody to go and ask for a replacement.
//
// THE TOKEN LEAVES THE ADDRESS BAR once it has been spent or judged dead. It is a bearer secret,
// and leaving it in history costs nothing to avoid. It is deliberately NOT cleared when the
// request failed, because the retry needs it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, redeemShareLinkToken } from '../lib/api';
import { redeemRefusal } from '../lib/share-links';

type JoinState =
  | { status: 'redeeming' }
  | { status: 'joined'; projectId: string; role: string }
  /** The link was read and refused. A sentence, not a retry. */
  | { status: 'refused'; detail: string }
  /** No answer came back. Not a refusal, and must never be shown as one. */
  | { status: 'failed'; detail: string }
  | { status: 'no_token' };

export function JoinPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<JoinState>(token ? { status: 'redeeming' } : { status: 'no_token' });
  // A redemption is a WRITE — it mints a membership — so it runs once per arrival rather than once
  // per render, including under React's development double-invoke. The retry below clears this
  // deliberately, which is the only way it runs twice.
  const spent = useRef(false);

  const redeem = useCallback(
    async (value: string) => {
      if (value === '' || spent.current) return;
      spent.current = true;
      setState({ status: 'redeeming' });
      try {
        const out = await redeemShareLinkToken(value);
        setParams(new URLSearchParams(), { replace: true });
        setState({ status: 'joined', projectId: out.projectId, role: out.role });
      } catch (e) {
        // 403 and 404 are the link being JUDGED; anything else is the request failing to arrive,
        // and showing the two as one sentence is how somebody throws away a working link.
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
          setParams(new URLSearchParams(), { replace: true });
          setState({ status: 'refused', detail: redeemRefusal(e.message) });
        } else {
          // The token stays in the address bar here, because the retry needs it.
          spent.current = false;
          setState({ status: 'failed', detail: e instanceof Error ? e.message : 'The request did not go through.' });
        }
      }
    },
    [setParams],
  );

  useEffect(() => {
    void redeem(token);
  }, [token, redeem]);

  useEffect(() => {
    if (state.status !== 'joined') return;
    const t = setTimeout(() => navigate(`/projects/${state.projectId}`, { replace: true }), 900);
    return () => clearTimeout(t);
  }, [state, navigate]);

  return (
    <div className="page">
      <div className="empty-state">
        {state.status === 'redeeming' && (
          <>
            <h2>Opening the link…</h2>
            <p aria-busy="true">Checking whether it still works.</p>
          </>
        )}

        {state.status === 'no_token' && (
          <>
            <h2>This link is incomplete</h2>
            <p>There is no token in the address, so there is nothing to open. Ask whoever sent it for the whole link.</p>
            <Link to="/" className="btn btn-primary">
              Back to your projects
            </Link>
          </>
        )}

        {state.status === 'joined' && (
          <>
            <h2>You&rsquo;re in</h2>
            <p>
              You joined as <strong>{state.role}</strong>. Taking you to the project…
            </p>
            <Link to={`/projects/${state.projectId}`} className="btn btn-primary">
              Open it now
            </Link>
          </>
        )}

        {state.status === 'refused' && (
          <>
            <h2>This link didn&rsquo;t work</h2>
            <p role="alert">{state.detail}</p>
            <Link to="/" className="btn btn-primary">
              Back to your projects
            </Link>
          </>
        )}

        {state.status === 'failed' && (
          <>
            <h2>We couldn&rsquo;t check this link</h2>
            {/* Deliberately NOT "your link is invalid". We do not know that, and saying it would
                send somebody to ask for a replacement for a link that is perfectly good. */}
            <p role="alert">{state.detail} The link may still be fine.</p>
            <button type="button" className="btn btn-primary" onClick={() => void redeem(token)}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
