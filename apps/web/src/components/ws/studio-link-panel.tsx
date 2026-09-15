/**
 * THE STUDIO CONNECTION PANEL — the answer to "why is nothing happening".
 *
 * GET /api/projects/:id/studio/diagnostics has been owner-authorized, rich and tested on the worker
 * for a long time: the link summary, the plugin's self-report, the bound place against the place
 * Studio actually has open, the 30-day pairing clock, and the last 25 ops with their failure kinds.
 * Nothing in this app called it. A paying customer could read their own connection only with curl
 * and a JWT, and three shipped docs pages (docs/connect, docs/plugin, docs/troubleshooting) told
 * them to "disconnect from the web workspace" — a control that did not exist anywhere in the
 * product.
 *
 * WHAT THIS PANEL DECIDES: nothing. Every verdict on it is the worker's; studio-link-model.ts
 * chooses the words and is tested on its own. The panel places them.
 *
 * WHY DISCONNECT IS BEHIND A CONFIRM. It revokes the credential. The Studio on the other end finds
 * out on its next poll, in another window, as a status going grey — and the way back is a new
 * pairing code typed into the plugin. That is a small ceremony for a real consequence, not a habit
 * of putting dialogs in front of things.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { disconnectStudio, discardStudioQueue, rebindStudioPlace, studioDiagnostics } from '../../lib/api';
import { lastSeenLabel } from '../../lib/studio-connection';
import { ConfirmDialog } from '../confirm-dialog';
import { EmptyState } from '../empty-state';
import { Failure } from '../failure';
import { StatusIcon } from '../status-icon';
import { opOutcome, pairingNote, placeLine, pluginLine } from './studio-link-model';

export function StudioLinkPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['studio-diagnostics', projectId],
    queryFn: () => studioDiagnostics(projectId),
    enabled: projectId !== '',
    retry: false,
  });

  if (q.isPending) {
    return (
      <div className="sl" aria-busy="true">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
      </div>
    );
  }

  if (q.isError) {
    // A PANEL THAT CANNOT READ THE LINK SAYS SO. Rendering the empty shape here would draw a
    // project with no pairing, no queue and no ops — which is a real state, and not this one.
    return (
      <EmptyState
        state="connectionFailed"
        detail={<Failure error={q.error} compact />}
        action={
          <button type="button" className="gx-btn gx-btn--outline" onClick={() => void q.refetch()}>
            Try again
          </button>
        }
      />
    );
  }

  const d = q.data;
  const now = Date.now();
  const seen = lastSeenLabel(d.link.lastSeenAt, now);
  const expiry = pairingNote(d.pairingExpiresAt, now);

  /**
   * Every action on this panel, run the same way.
   *
   * The promise resolves to WHAT HAPPENED, not to a canned success: the discard reports the count
   * the server actually removed rather than the count this browser last saw, and those differ every
   * time an op was collected between the render and the click. The panel then refetches, because
   * the server is the only thing that knows the new state of the link.
   */
  const run = (what: Promise<string>) => {
    setBusy(true);
    what
      .then((said) => {
        setNotice(said);
        void qc.invalidateQueries({ queryKey: ['studio-diagnostics', projectId] });
      })
      .catch((e: unknown) => setNotice(e instanceof Error ? e.message : 'That did not work.'))
      .finally(() => {
        setBusy(false);
        setConfirming(false);
      });
  };

  return (
    <div className="sl">
      {/* Paired and connected are TWO facts, not one — a project keeps its pairing across a Studio
          restart, a laptop lid and a flight. Collapsing them would report "not paired" for a plugin
          that simply is not polling this second, and send the user to mint a code they do not need. */}
      <section className="sl-head">
        {/* Paired-but-quiet is `waiting`, not `error`: a Studio behind a closed laptop lid is
            coming back, and drawing that in the failure colour spends the loudest mark on the
            most ordinary state. */}
        <StatusIcon status={d.link.connected ? 'success' : d.link.paired ? 'waiting' : 'info'} size={18} />
        <div>
          <h3 className="sl-head__title">
            {d.link.connected ? 'Studio is connected' : d.link.paired ? 'Paired, not polling' : 'Not paired'}
          </h3>
          <p className="sl-head__body">
            {d.link.connected
              ? seen
                ? `Last heard from ${seen}.`
                : 'Waiting for its first poll.'
              : d.link.paired
                ? seen
                  ? `This project is still paired. Studio last polled ${seen}.`
                  : 'This project is paired, but Studio has never polled.'
                : 'No Studio has been paired with this project yet.'}
          </p>
        </div>
      </section>

      {expiry && (
        <p className={`sl-note${expiry.urgent ? ' sl-note--warn' : ''}`}>{expiry.text}</p>
      )}

      <dl className="sl-facts">
        <dt>Place</dt>
        <dd>{placeLine(d.link.place, d.openPlace)}</dd>

        <dt>Plugin</dt>
        <dd>{pluginLine(d.link.pluginVersion, d.link.pluginProtocol)}</dd>

        <dt>Waiting</dt>
        {/* The depth the worker actually holds. Zero is a real answer here — unlike the pill's
            detail line, a diagnostics row that goes blank reads as "we did not look".

            The discard is offered only when there IS something to discard: a button that can only
            report "nothing happened" teaches people that buttons here do nothing. */}
        <dd>
          {d.link.queuedOps === 0
            ? 'Nothing queued.'
            : `${d.link.queuedOps} change${d.link.queuedOps === 1 ? '' : 's'} waiting for Studio to collect.`}
          {d.link.queuedOps > 0 && (
            <button
              type="button"
              className="gx-btn gx-btn--outline sl-discard"
              disabled={busy}
              onClick={() =>
                run(
                  discardStudioQueue(projectId).then(
                    (r) => `Discarded ${r.discarded} waiting change${r.discarded === 1 ? '' : 's'}.`,
                  ),
                )
              }
            >
              Discard {d.link.queuedOps} waiting change{d.link.queuedOps === 1 ? '' : 's'}
            </button>
          )}
        </dd>

        <dt>Apple</dt>
        <dd>{d.agentStatus === 'idle' ? 'Idle.' : `Busy — ${d.agentStatus}.`}</dd>
      </dl>

      {d.placeMismatch && (
        <section className="sl-group sl-group--warn">
          {/* The worker's own sentence, not a second rendering of the same judgement. */}
          <p className="sl-mismatch">{d.placeMismatch.message}</p>
          <button
            type="button"
            className="gx-btn gx-btn--outline"
            disabled={busy}
            onClick={() => run(rebindStudioPlace(projectId).then(() => 'Bound to the place Studio has open.'))}
          >
            Use this place instead
          </button>
        </section>
      )}

      <section className="sl-group">
        <h4 className="sl-group__head">Recent changes sent to Studio</h4>
        {d.recentOps.length === 0 ? (
          // Never drawn as "everything succeeded". An empty log is an empty log.
          <p className="sl-empty">Nothing has been sent to Studio from this project yet.</p>
        ) : (
          <ul className="sl-ops">
            {d.recentOps.map((r) => (
              <li key={r.op_id} className={`sl-op${r.ok ? '' : ' is-failed'}`}>
                <span className="sl-op__kind gx-mono">{r.kind}</span>
                <span className="sl-op__what">{r.summary}</span>
                <span className="sl-op__outcome">{opOutcome(r)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {notice && (
        <p className="sl-note" role="status">
          {notice}
        </p>
      )}

      {/* The control docs/connect, docs/plugin and docs/troubleshooting have all been promising.
          Offered only when there is a pairing to revoke: a button that can only refuse is worse
          than no button. */}
      {d.link.paired && (
        <button type="button" className="gx-btn gx-btn--outline sl-disconnect" disabled={busy} onClick={() => setConfirming(true)}>
          Disconnect Studio
        </button>
      )}

      {confirming && (
        <ConfirmDialog
          title="Disconnect Studio?"
          ceremony="dialog"
          confirmLabel="Disconnect"
          busyLabel="Disconnecting…"
          busy={busy}
          onClose={() => setConfirming(false)}
          onConfirm={() => run(disconnectStudio(projectId).then(() => 'Studio was disconnected.'))}
        >
          This project&rsquo;s pairing is revoked. The Studio that has it will stop building here on
          its next check, and reconnecting means pairing again with a fresh code. Nothing in your
          place is changed or removed.
        </ConfirmDialog>
      )}
    </div>
  );
}
