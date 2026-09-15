// The one way a failure is shown. See lib/error-taxonomy.ts for why the wording is what it is.
//
// Every surface used to render `{(error as Error).message}` in its own shape, so the same failure
// looked different in three places and none of them said what to do. This renders the explanation
// in a fixed order — what happened, whether anything was lost, what to do — because that order is
// the order the questions arrive in.
import { Link } from 'react-router-dom';
import { explainFailure, type Explained } from '../lib/error-taxonomy';

export function Failure({
  error,
  onRetry,
  compact,
  explain = explainFailure,
}: {
  error: unknown;
  /** Offered ONLY when repeating the request could actually work. */
  onRetry?: () => void;
  /** Inside a card that already has its own heading. */
  compact?: boolean;
  /**
   * A narrower classifier for one surface, when the shared taxonomy would get it wrong.
   *
   * ONE RENDERER, TWO VOCABULARIES. The Roblox panel is the case this exists for: a revoked Open
   * Cloud key is a 401, and `explainFailure` reads every 401 as "your session has expired, sign in
   * again" — sending somebody to re-authenticate their Apple account over a credential on another
   * service. The shape of the answer, and the order it is read in, stays the same for both.
   */
  explain?: (err: unknown) => Explained;
}) {
  const e = explain(error);

  return (
    <div className={`failure is-${e.kind}${compact ? ' is-compact' : ''}`} role="alert">
      {!compact && <p className="failure__title">{e.title}</p>}
      {/* Did I lose anything — answered before anything else, because it is what they want to know. */}
      <p className="failure__safety">{compact ? `${e.title}. ${e.safety}` : e.safety}</p>

      {(e.next || (onRetry && e.retryable)) && (
        <p className="failure__next">
          {e.next && !e.href && <span>{e.next}</span>}
          {e.next && e.href && (
            <Link className="btn btn-sm" to={e.href}>
              {e.next}
            </Link>
          )}
          {onRetry && e.retryable && (
            <button type="button" className="btn btn-sm" onClick={onRetry}>
              Try again
            </button>
          )}
        </p>
      )}

      {/* The server's own words, available and not shouted. A screenshot of this is worth having. */}
      {e.detail && (
        <details className="failure__detail">
          <summary>Technical detail</summary>
          <code>{e.detail}</code>
        </details>
      )}
    </div>
  );
}
