// The Studio connection, in one dialog: what this project is bound to now, and how to change it.
//
// This used to be step 3 of a four-step wizard, then just "here is a code". The setup steps live in
// the compact ConnectStudio block at the foot of the conversation (components/ws/connect-studio.tsx),
// so what is left is the two halves of one question — WHAT IS PAIRED, and PAIR SOMETHING.
//
// The record half calls three worker routes that had been served for weeks with nothing calling
// them: /studio/diagnostics, /studio/disconnect and /studio/place/rebind. docs/troubleshooting and
// docs/plugin both tell the reader to "disconnect from the web workspace", which was a promise with
// no control behind it, and the workspace could otherwise say nothing about the link beyond a live
// socket pill — not which place it is bound to, not when the pairing was made, and not that it runs
// out after 30 days.
//
// THREE STATES, KEPT APART. "We have not asked yet", "we asked and could not tell" and "nothing is
// paired" are three different sentences and only the last is a fact about the project. A failed
// diagnostics read rendered as "not connected" sends a user to re-pair a project that was already
// paired — and the second pairing supersedes the first, so the cost of that confusion is another
// person's Studio going quiet. The dashboard card demonstrates the same failure in its own way: it
// reads projects.place_name, which nothing writes, so it says "Not linked" about a live pairing.
//
// "Studio connected" is still printed only on the `studio_status` signal passed in as
// `studioConnected` — never inferred from the code having been shown, and never as a claim that the
// plugin is installed, which the browser cannot know.
import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  STUDIO_PLUGIN_INSTALL_HREF,
  STUDIO_PLUGIN_STORE_LIVE,
  type PairingCodeDto,
} from '@golem/shared';
import { createPairingCode, discardStudioQueue, disconnectStudio, fetchStudioDiagnostics, rebindPlace } from '../lib/api';
import { countdownTo, fullStamp, shortRelative } from '../lib/format';
import { Modal } from './modal';
import { Forge } from './loading';
import { Failure } from './failure';
import { StatusIcon } from './status-icon';

/** One cache entry, read by both halves of this dialog. */
const recordKey = (projectId: string) => ['studio-link', projectId];

function useStudioRecord(projectId: string) {
  return useQuery({
    queryKey: recordKey(projectId),
    queryFn: () => fetchStudioDiagnostics(projectId),
    // The pairing clock moves in days. Re-asking on every focus would be noise, and the two
    // controls below invalidate this key themselves the moment they change anything.
    staleTime: 30_000,
  });
}

/**
 * THE CONNECTION RECORD: what this project is bound to, and the two ways out.
 *
 * Renders nothing at all when the project has never been paired — a record of nothing is noise, and
 * the code box below is already the answer to "what do I do".
 */
function ConnectionRecord({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const record = useStudioRecord(projectId);
  const [confirming, setConfirming] = useState(false);
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: recordKey(projectId) });
  }, [qc, projectId]);
  const cut = useMutation({
    mutationFn: () => disconnectStudio(projectId),
    onSuccess: () => {
      setConfirming(false);
      refresh();
    },
  });
  const rebind = useMutation({ mutationFn: () => rebindPlace(projectId), onSuccess: refresh });
  //[[ THE FOURTH ROUTE, AND THE ONE THAT DID NOT EXIST UNTIL NOW.
  //
  //   Automatic cancellation was already built — a run that ends takes its own queued ops with it —
  //   and there was no way to say so deliberately. A user whose Studio closed mid-build watched the
  //   depth climb with no control over it: Stop reaches only the ops belonging to a live run, and
  //   everything else sat waiting to be applied whenever Studio came back, possibly to a place the
  //   person had since put right by hand. ]]
  const discard = useMutation({ mutationFn: () => discardStudioQueue(projectId), onSuccess: refresh });

  // A FAILURE TO OBSERVE IS NOT AN OBSERVATION. This route is owner-only, so a collaborator is
  // answered 404 — and 404, a timeout and a 500 must all read as "we could not tell", never as
  // "nothing is paired", which is a claim about the project that nobody has established.
  if (record.isError) return <p className="pairing-record__unknown" role="status">We couldn&rsquo;t read this project&rsquo;s connection record. That is not the same as nothing being paired &mdash; nothing here has changed.</p>;
  if (record.isPending) return <p className="pairing-record__unknown" role="status">Checking what this project is paired to&hellip;</p>;

  const link = record.data.link;
  // `paired` is the worker's own field. Deriving this from a falsy payload would collapse it with
  // the two states above, which is the whole defect this file is written against.
  if (!link.paired) return null;

  const place = link.place;
  const expires = record.data.pairingExpiresAt;
  const lapsed = expires !== null && expires <= Date.now();
  const busy = cut.isPending || rebind.isPending || discard.isPending;

  return (
    <section className="pairing-record" aria-label="This project's Studio connection">
      <header className="pairing-record__head">
        <StatusIcon status={link.connected ? 'success' : 'waiting'} size={16} />
        <div className="pairing-record__ident">
          <p className="pairing-record__place">{place ? place.placeName : 'Paired to a place Studio has not named'}</p>
          <p className="pairing-record__sub">
            {place ? `Place ${place.placeId}` : 'Studio has not reported which place it has open.'}
          </p>
        </div>
        <span className="pairing-record__state">
          {link.connected
            ? 'Studio is open'
            : link.lastSeenAt
              ? `last seen ${shortRelative(link.lastSeenAt)}`
              : 'not polling'}
        </span>
      </header>

      {/* The 30-day clock, which is the one thing a user cannot otherwise discover: a pairing that
          lapses reads as the plugin breaking. Unknown is printed as unknown. */}
      <dl className="pairing-record__facts">
        <div>
          <dt>Paired</dt>
          <dd>{record.data.pairedAt === null ? 'unknown' : fullStamp(record.data.pairedAt)}</dd>
        </div>
        <div>
          <dt>{lapsed ? 'Expired' : 'Expires'}</dt>
          <dd className={lapsed ? 'is-lapsed' : undefined}>{expires === null ? 'unknown' : fullStamp(expires)}</dd>
        </div>
      </dl>

      {record.data.placeMismatch && (
        <p className="pairing-record__mismatch" role="alert">
          <StatusIcon status="warning" size={15} />
          {/* THE WORKER'S OWN SENTENCE, QUOTED. studio-place.ts writes it with both place names and
              the reason the binding refused; a second wording here would drift from the one the
              plugin and the oplog carry, and the user would be reading two explanations of one
              event. */}
          <span>{record.data.placeMismatch.message}</span>
        </p>
      )}

      {record.data.recentOps.length > 0 && (
        <ul className="pairing-record__ops">
          {record.data.recentOps.slice(0, 3).map((op) => (
            <li key={op.op_id}>
              {/* ok is 1, 0, or null — SQLite has no boolean and an op that never reported has
                  neither. Unknown draws as waiting, never as failed. */}
              <StatusIcon status={op.ok === 1 ? 'success' : op.ok === 0 ? 'error' : 'waiting'} size={13} />
              <span className="pairing-record__op">{op.summary ?? op.kind ?? 'an operation'}</span>
              <span className="pairing-record__when">{shortRelative(op.created_at)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* WHAT IS WAITING, AND THE WAY TO BE RID OF IT. The depth is the worker's own count, and it
          is only mentioned when it is not zero — an empty queue is not news, and a control that can
          only report "nothing happened" teaches people that the controls here do nothing. */}
      {link.queuedOps > 0 && (
        <p className="pairing-record__queue">
          <span>
            {link.queuedOps} change{link.queuedOps === 1 ? '' : 's'} waiting for Studio to collect
            {link.connected ? '.' : ', and it will be applied when Studio comes back.'}
          </span>
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => discard.mutate()} disabled={busy}>
            {discard.isPending ? 'Discarding…' : `Discard ${link.queuedOps} waiting change${link.queuedOps === 1 ? '' : 's'}`}
          </button>
        </p>
      )}

      <div className="pairing-record__acts">
        <button type="button" className="btn btn-sm" onClick={() => rebind.mutate()} disabled={busy}>
          {rebind.isPending ? 'Rebinding…' : 'Use the place Studio has open now'}
        </button>
        {confirming ? (
          // Revoking is not undoable from a toast: the plugin's next poll is answered 401 and
          // Studio clears its saved session. So it takes a sentence and a second click.
          <span className="pairing-record__confirm" role="group" aria-label="Confirm disconnect">
            <span>Studio loses access on its next poll.</span>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => cut.mutate()} disabled={busy}>
              {cut.isPending ? 'Disconnecting…' : 'Disconnect'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setConfirming(true)} disabled={busy}>
            Disconnect this Studio
          </button>
        )}
      </div>

      {(cut.error || rebind.error || discard.error) && (
        <Failure error={cut.error ?? rebind.error ?? discard.error} compact />
      )}
    </section>
  );
}

interface PairingDialogProps {
  projectId: string;
  /** The live bridge signal. The only thing that may turn this dialog green. */
  studioConnected: boolean;
  onClose: () => void;
}

export function PairingDialog({ projectId, studioConnected, onClose }: PairingDialogProps) {
  const [pairing, setPairing] = useState<PairingCodeDto | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [remaining, setRemaining] = useState<string | null>(null);
  const record = useStudioRecord(projectId);

  const mint = useCallback(() => {
    setState('loading');
    setPairing(null);
    createPairingCode(projectId)
      .then((dto) => {
        setPairing(dto);
        setState('ready');
      })
      .catch((e: Error) => {
        setErrorMsg(e.message);
        setState('error');
      });
  }, [projectId]);

  //[[ A CODE IS NOT MINTED OVER AN EXISTING PAIRING WITHOUT BEING ASKED FOR.
  //
  //   This used to mint on mount, unconditionally. A second pairing supersedes the first — the
  //   session holds one plugin token — so simply opening this dialog to check what was connected
  //   started the process of taking it away. It now waits for the record, and a project that is
  //   already paired gets a button instead. An unreadable record is treated as "not paired" on
  //   purpose in this one direction: refusing to mint would leave a user with no way to pair at
  //   all, and minting costs nothing until a code is actually claimed. ]]
  const paired = record.data?.link.paired === true;
  useEffect(() => {
    if (record.isPending || paired || state !== 'idle') return;
    mint();
  }, [record.isPending, paired, state, mint]);

  useEffect(() => {
    if (!pairing) {
      setRemaining(null);
      return;
    }
    setRemaining(countdownTo(pairing.expiresAtIso));
    const t = window.setInterval(() => setRemaining(countdownTo(pairing.expiresAtIso)), 1000);
    return () => window.clearInterval(t);
  }, [pairing]);

  const expired = state === 'ready' && remaining === null;

  return (
    <Modal title="Studio connection" onClose={onClose}>
      <div className="pairing-col">
        <ConnectionRecord projectId={projectId} />

        {studioConnected && state === 'idle' ? (
          <div className="pairing-success" role="status">
            <span className="pairing-success-icon">
              <StatusIcon status="success" size={22} />
            </span>
            <h3>Studio connected</h3>
            <p className="muted">Apple can now build directly in your place.</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Start building
            </button>
          </div>
        ) : (
          <div className="pairing-code-col">
            {/* Paired already and nothing asked for: the record above is the answer. Pairing a
                different Studio is offered, and named for what it does to the current one. */}
            {state === 'idle' && paired && (
              <div className="pairing-code-box">
                <p className="pairing-how">
                  Pairing a different Studio ends the connection above &mdash; one project, one Studio.
                </p>
                <button type="button" className="btn" onClick={mint}>
                  Pair a different Studio
                </button>
              </div>
            )}
            {(state === 'loading' || (state === 'idle' && !paired)) && (
              <div className="pairing-code-box" aria-busy="true">
                <Forge kind="connecting" label="Carving a code" compact />
              </div>
            )}
            {state === 'error' && (
              <div className="pairing-code-box" role="alert">
                <p className="form-error">{errorMsg || "Couldn't create a pairing code."}</p>
                <button type="button" className="btn" onClick={mint}>
                  Try again
                </button>
              </div>
            )}
            {state === 'ready' && pairing && (
              <div className="pairing-code-box">
                {expired ? (
                  <>
                    <p className="muted">That code expired.</p>
                    <button type="button" className="btn btn-primary" onClick={mint}>
                      Generate a new code
                    </button>
                  </>
                ) : (
                  <>
                    <span className="pairing-label">Your pairing code</span>
                    <output className="pairing-code" aria-live="polite">
                      {pairing.code}
                    </output>
                    <span className="pairing-countdown" role="timer">
                      expires in {remaining}
                    </span>
                  </>
                )}
              </div>
            )}

            {state !== 'idle' && (
              <>
                <p className="pairing-how">
                  In Roblox Studio, open the <strong>Apple</strong> plugin and enter this code.
                </p>

                <p className="pairing-waiting muted" aria-live="polite">
                  <span className="pulse-dot" aria-hidden="true" /> Waiting for Studio…
                </p>
              </>
            )}

            {/* Deliberately understated, and deliberately not a promise: the asset
                is on the Creator Store but not yet distributed there, so this goes
                to the docs page that says so until it is. */}
            <p className="pairing-how">
              <a
                href={STUDIO_PLUGIN_INSTALL_HREF}
                target={STUDIO_PLUGIN_STORE_LIVE ? '_blank' : undefined}
                rel={STUDIO_PLUGIN_STORE_LIVE ? 'noopener noreferrer' : undefined}
                className="pairing-link"
              >
                Don&rsquo;t have the plugin? Install Apple for Studio
                {STUDIO_PLUGIN_STORE_LIVE ? ' ↗' : ''}
              </a>
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
