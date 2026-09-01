/**
 * The drawer that answers "what do I owe, and can I publish this?".
 *
 * A reading surface with one action. Everything it states comes from the worker's
 * report; the only thing decided here is how to say it, and `credits-model.ts` holds
 * even that. See that file for why an empty ledger is never drawn as a clearance.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAttribution } from '../../lib/api';
import { StatusIcon } from '../status-icon';
import { EmptyState } from '../empty-state';
import {
  copyableCredits,
  creditLine,
  readiness,
  READINESS_TONE,
  type AttributionResponse,
  type CreditEntry,
} from './credits-model';

function Credit({ entry }: { entry: CreditEntry }) {
  return (
    <li className="cr-entry">
      <span className="cr-entry__line">{creditLine(entry)}</span>
      <span className="cr-entry__links">
        <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
          source
        </a>
        <a href={entry.licenceUrl} target="_blank" rel="noopener noreferrer">
          licence
        </a>
      </span>
    </li>
  );
}

export function CreditsPanel({ projectId }: { projectId: string }) {
  const [copied, setCopied] = useState(false);
  const q = useQuery({
    queryKey: ['attribution', projectId],
    queryFn: () => fetchAttribution(projectId),
    enabled: projectId !== '',
    retry: false,
  });

  if (q.isPending) {
    return (
      <div className="cr" aria-busy="true">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <EmptyState
        state="connectionFailed"
        detail={<p className="es__body">{(q.error as Error).message}</p>}
        action={
          <button type="button" className="gx-btn gx-btn--outline" onClick={() => void q.refetch()}>
            Try again
          </button>
        }
      />
    );
  }

  const res = q.data as AttributionResponse;
  const { attribution: a, commercialUse: c } = res;
  const verdict = readiness(res);
  const tone = READINESS_TONE[verdict.state];
  // Split for the same reason readiness() splits them: an asset whose licence was read
  // and found incompatible is a finding; an asset whose licence Golem never saw is not.
  const blockers = c.findings.filter((f) => f.severity === 'blocker' && f.code !== 'missing_provenance');
  const warnings = c.findings.filter((f) => f.severity === 'warning');
  const owes = a.required.length > 0 || a.sourceCredits.length > 0;
  // null when nothing is owed, and also when the worker did not send the document —
  // see copyableCredits. The section still renders; only the button depends on it.
  const copyable = copyableCredits(res);

  return (
    <div className="cr">
      {/* The verdict. Its tone is the verdict's, so it cannot be drawn as a success
          while it says something else — the §16.3 drift, in the one place on this
          panel where getting it wrong would matter most. */}
      <section className={`cr-verdict cr-verdict--${tone}`}>
        <span className="cr-verdict__mark">
          <StatusIcon
            status={
              verdict.state === 'clear'
                ? 'success'
                : verdict.state === 'blocked'
                  ? 'error'
                  : verdict.state === 'obligations' || verdict.state === 'unaccounted'
                    ? 'warning'
                    : 'info'
            }
            size={18}
          />
        </span>
        <div>
          <h3 className="cr-verdict__title">{verdict.title}</h3>
          <p className="cr-verdict__body">{verdict.body}</p>
        </div>
      </section>

      {blockers.length > 0 && (
        <section className="cr-group">
          <h4 className="cr-group__head">Cannot ship commercially</h4>
          <ul className="cr-findings">
            {blockers.map((f) => (
              <li key={`${f.assetId}:${f.code}`} className="cr-finding is-blocker">
                <span className="cr-finding__name">{f.name}</span>
                <span className="cr-finding__why">{f.why}</span>
                <span className="cr-finding__fix">{f.remediation}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {a.unaccounted.length > 0 && (
        <section className="cr-group">
          <h4 className="cr-group__head">Golem cannot account for these</h4>
          {/* Named rather than hidden. An asset with no provenance row is the one
              state this report treats as worse than a known obligation. */}
          <p className="cr-note">
            These were placed by Roblox asset id and are not in the curated library, so their
            licence is unknown. Nothing here is a claim that they are unusable — only that
            Golem cannot tell you either way.
          </p>
          <ul className="cr-ids">
            {a.unaccounted.map((id) => (
              <li key={id} className="gx-mono">
                {id.replace(/^unaccounted:roblox:/, 'Roblox asset ')}
              </li>
            ))}
          </ul>
        </section>
      )}

      {owes && (
        <section className="cr-group">
          <h4 className="cr-group__head">Credits to ship</h4>
          <ul className="cr-entries">
            {a.required.map((e) => (
              <Credit key={e.assetId} entry={e} />
            ))}
            {a.sourceCredits.map((s) => (
              <li key={s.url} className="cr-entry">
                <span className="cr-entry__line">{s.text}</span>
                <span className="cr-entry__links">
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.url.replace(/^https:\/\//, '')}
                  </a>
                </span>
              </li>
            ))}
          </ul>
          {copyable !== null && (
          <button
            type="button"
            className="gx-btn gx-btn--outline"
            onClick={() => {
              void navigator.clipboard?.writeText(copyable).then(
                () => setCopied(true),
                // A refused clipboard leaves the button alone. It is NOT reported —
                // an earlier version of this comment said it was, and nothing here
                // shows the user anything. What it does guarantee is the part that
                // matters: no tick appears for a copy that did not happen.
                () => setCopied(false),
              );
            }}
          >
            {copied ? 'Copied' : 'Copy the credits'}
          </button>
          )}
        </section>
      )}

      {warnings.length > 0 && (
        <section className="cr-group">
          <h4 className="cr-group__head">Obligations attached</h4>
          <ul className="cr-findings">
            {warnings.map((f) => (
              <li key={`${f.assetId}:${f.code}`} className="cr-finding">
                <span className="cr-finding__name">{f.name}</span>
                <span className="cr-finding__why">{f.why}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {a.courtesy.length > 0 && (
        <section className="cr-group">
          <h4 className="cr-group__head">No credit required</h4>
          <p className="cr-note">CC0 asks for nothing. Crediting anyway costs a line and is the decent thing.</p>
          <ul className="cr-entries">
            {a.courtesy.map((e) => (
              <Credit key={e.assetId} entry={e} />
            ))}
          </ul>
        </section>
      )}

      {/* The limits, all of them. Naming only the Studio-added case would tell a reader
          that everything Golem placed is on this list, which is false for any project
          older than this ledger and for any placement whose record failed to write. */}
      <p className="cr-stamp">
        Read from your project&rsquo;s asset ledger, which is not the same thing as your place. Golem
        records an asset when it places one, so this list cannot see anything you added in Studio
        yourself, anything placed before this ledger existed, or a placement whose record failed to
        save. A clean result here is a clean result for what is listed.
      </p>
    </div>
  );
}
