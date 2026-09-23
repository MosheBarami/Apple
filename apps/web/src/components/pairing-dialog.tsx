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
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  STUDIO_PLUGIN_INSTALL_HREF,
  STUDIO_PLUGIN_STORE_LIVE,
  type PairingCodeDto,
} from '@golem/shared';
import { createPairingCode, discardStudioQueue, disconnectStudio, fetchStudioDiagnostics, rebindPlace } from '../lib/api';
import { countdownTo, fullStamp, shortRelative } from '../lib/format';
import { pairingAttemptConnected, type PairingAttemptBaseline } from '../lib/pairing-confirmation';
import { Modal } from './modal';
import { Forge } from './loading';
import { Failure } from './failure';
import { StatusIcon } from './status-icon';
import './pairing-dialog.css';
// The owner's picked onboarding components (./picks/settings).
import { DecryptedText } from './picks/settings/decrypted-text';
import './picks/settings/pop-in.css';

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
  // THE ADMISSION OF FAILURE STAYS ON THE GUARD'S OWN LINE. tests/studio-diagnostics.test.mjs reads
  // the first line after `isError` and requires the words "could not" / "couldn't" to be in it —
  // the gate that stops this branch quietly becoming "nothing is paired" again. Wrapping the JSX
  // onto a second line would read better and would defeat that check, so it stays where it is.
  if (record.isError) return <div className="pairing-record__unknown pairing-record__unknown--failed" role="status"><p className="pairing-record__unknown-text">We couldn&rsquo;t read this project&rsquo;s connection record. That is not the same as nothing being paired &mdash; nothing here has changed.</p>
    {/* A FAILED READ NEEDS A SECOND ATTEMPT, not just an apology. Until now the only way to re-ask
        was to close the dialog and open it again, which a reader takes as the product telling them
        there is nothing here to see. */}
    <button type="button" className="btn btn-sm" onClick={() => void record.refetch()} disabled={record.isFetching}>
      {record.isFetching ? 'Checking…' : 'Try again'}
    </button>
  </div>;
  if (record.isPending) return <p className="pairing-record__unknown pairing-record__unknown--waiting" role="status"><span className="pulse-dot" aria-hidden="true" />Checking what this project is paired to&hellip;</p>;

  const link = record.data.link;
  // `paired` is the worker's own field. Deriving this from a falsy payload would collapse it with
  // the two states above, which is the whole defect this file is written against.
  if (!link.paired) return null;

  const place = link.place;
  // A place never published to Roblox reports placeId 0 and is never BOUND (studio-place.ts refuses
  // to bind what it cannot compare later), but Studio still named it. Measured 2026-09-22 (F-008):
  // the dock read "Apple-Acceptance-2026-09-22.rbxl" while this row said Studio "has not named" it.
  const open = record.data.openPlace;
  const expires = record.data.pairingExpiresAt;
  const lapsed = expires !== null && expires <= Date.now();
  const busy = cut.isPending || rebind.isPending || discard.isPending;

  return (
    <section className="pairing-record" aria-label="This project's Studio connection">
      <header className="pairing-record__head">
        <StatusIcon status={link.connected ? 'success' : 'waiting'} size={16} />
        <div className="pairing-record__ident">
          <p className="pairing-record__place">{place ? place.placeName : open ? open.placeName : 'Paired to a place Studio has not named'}</p>
          <p className="pairing-record__sub">
            {place
              ? `Place ${place.placeId}`
              : open
                ? open.placeId > 0
                  ? `Place ${open.placeId}`
                  : 'Not published to Roblox yet, so it has no place ID. Apple builds in it as it is.'
                : 'Studio has not reported which place it has open.'}
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
  //[[ THE CODE IS TYPED INTO ANOTHER APPLICATION, so offering to put it on the clipboard is the
  //   whole of the help this dialog can give. Three states rather than two: `navigator.clipboard`
  //   is absent outside a secure context and can be refused by permission policy, and a copy
  //   button that silently does nothing teaches a reader that the controls here are decorative. ]]
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const record = useStudioRecord(projectId);
  const mintGenerationRef = useRef(0);
  const attemptRef = useRef<(PairingAttemptBaseline & { projectId: string; generation: number }) | null>(null);

  // A mint may still be in flight when the workspace switches projects or this dialog unmounts.
  // Advancing the generation makes both late success and late failure settlements inert.
  useEffect(() => {
    mintGenerationRef.current += 1;
    attemptRef.current = null;
    setPairing(null);
    setState('idle');
    setErrorMsg('');
    setRemaining(null);
    setCopied('idle');
    return () => {
      mintGenerationRef.current += 1;
    };
  }, [projectId]);

  const mint = useCallback(() => {
    const generation = mintGenerationRef.current + 1;
    mintGenerationRef.current = generation;
    attemptRef.current = {
      projectId,
      generation,
      studioConnected,
      diagnosticsKnown: record.data !== undefined,
      pairedAt: record.data?.pairedAt ?? null,
      lastSeenAt: record.data?.link.lastSeenAt ?? null,
    };
    setState('loading');
    setPairing(null);
    setErrorMsg('');
    // A new code is a different code: "Copied" left standing over it would be a claim about the
    // clipboard that stopped being true the moment the old one was replaced.
    setCopied('idle');
    createPairingCode(projectId)
      .then((dto) => {
        if (mintGenerationRef.current !== generation || attemptRef.current?.projectId !== projectId) return;
        setPairing(dto);
        setState('ready');
      })
      .catch((e: Error) => {
        if (mintGenerationRef.current !== generation || attemptRef.current?.projectId !== projectId) return;
        setErrorMsg(e.message);
        setState('error');
      });
  }, [projectId, record.data, studioConnected]);

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

  // The confirmation is a moment, not a mode. Two seconds is long enough to be read and short
  // enough that it cannot still be on screen when the reader looks back.
  useEffect(() => {
    if (copied !== 'done') return;
    const t = window.setTimeout(() => setCopied('idle'), 2200);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copyCode = useCallback(() => {
    const code = pairing?.code;
    if (!code) return;
    const clip = navigator.clipboard;
    if (!clip?.writeText) {
      setCopied('failed');
      return;
    }
    void clip.writeText(code).then(() => setCopied('done')).catch(() => setCopied('failed'));
  }, [pairing]);

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
  const attempt = attemptRef.current;
  const mintedCodeConnected = state === 'ready' && pairing !== null && attempt?.projectId === projectId
    ? pairingAttemptConnected(
        attempt,
        studioConnected,
        record.data
          ? {
              pairedAt: record.data.pairedAt,
              connected: record.data.link.connected,
              lastSeenAt: record.data.link.lastSeenAt,
            }
          : null,
      )
    : false;

  // While a visible code can still be claimed, re-read the server's connection record. This is
  // especially important for replacement pairing: the browser's existing `true` bridge signal is
  // the old Studio until a new token issuance and a heartbeat after it are observed. The refresh
  // stops at the code's deadline (plus one final two-second observation window for an in-flight
  // claim) and is cleaned up on every attempt/project/unmount transition.
  useEffect(() => {
    if (state !== 'ready' || !pairing || mintedCodeConnected) return;
    const expiresAt = Date.parse(pairing.expiresAtIso);
    const watchUntil = Number.isFinite(expiresAt) ? expiresAt + 2_000 : Date.now();
    const refresh = () => {
      if (Date.now() <= watchUntil) void record.refetch();
    };
    refresh();
    const t = window.setInterval(() => {
      if (Date.now() > watchUntil) {
        window.clearInterval(t);
        return;
      }
      void record.refetch();
    }, 1_000);
    return () => window.clearInterval(t);
  }, [state, pairing, mintedCodeConnected, record.refetch]);

  // A first-time socket transition can beat the next diagnostics tick. Once it does, refresh the
  // shared record immediately so the connection card above names the Studio that actually claimed.
  useEffect(() => {
    if (!mintedCodeConnected) return;
    void record.refetch();
  }, [mintedCodeConnected, record.refetch]);

  const showConnected = state === 'idle'
    ? studioConnected
    : mintedCodeConnected;

  return (
    <Modal title="Studio connection" onClose={onClose}>
      <div className="pairing-col">
        <ConnectionRecord projectId={projectId} />

        {showConnected ? (
          // pk-pop: "Studio connected" arrives like a reward (picks: Motion "Pokopia: Modal").
          <div className="pairing-success pk-pop" role="status">
            <span className="pairing-success-icon pk-pop__icon">
              <StatusIcon status="success" size={22} />
            </span>
            <h3>Studio connected</h3>
            <p className="muted">Apple changes your place only while the Apple panel in Studio shows edits allowed for this connection.</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Start building
            </button>
            {state === 'idle' && paired && (
              <button type="button" className="btn" onClick={mint}>
                Pair a different Studio
              </button>
            )}
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
                <Forge kind="connecting" label="Creating a pairing code" compact />
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
                      {/* Picks: React Bits "Decrypted Text" — a fresh code resolves into place. */}
                      <DecryptedText text={pairing.code} />
                    </output>
                    <span className="pairing-countdown" role="timer">
                      expires in {remaining}
                    </span>
                    <button type="button" className="pairing-copy btn btn-sm" onClick={copyCode}>
                      {copied === 'done' ? 'Copied' : 'Copy code'}
                    </button>
                    {copied === 'failed' && (
                      <p className="pairing-copy__failed" role="alert">
                        Your browser blocked the clipboard. Select the code above and copy it.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {state === 'ready' && pairing && !expired && (
              <>
                <p className="pairing-how">
                  In Roblox Studio, click <strong>Apple</strong> in the Plugins tab, enter this code and
                  press <strong>Connect to Apple</strong>. Edits stay off until you allow them for this
                  connection.
                </p>

                <p className="pairing-waiting muted" aria-live="polite">
                  <span className="pulse-dot" aria-hidden="true" /> Waiting for Studio…
                </p>
              </>
            )}

            {/* Deliberately understated: most people reading this dialog already have the
                plugin. The destination follows STUDIO_PLUGIN_STORE_LIVE — the Creator Store page
                in a new tab while the listing is distributed (true since 2026-09-22), and the
                same-origin /docs/plugin, which says why, if it is ever withdrawn. */}
            <p className="pairing-how">
              <a
                href={STUDIO_PLUGIN_INSTALL_HREF}
                target={STUDIO_PLUGIN_STORE_LIVE ? '_blank' : undefined}
                rel={STUDIO_PLUGIN_STORE_LIVE ? 'noopener noreferrer' : undefined}
                className="pairing-link"
              >
                {STUDIO_PLUGIN_STORE_LIVE ? 'Get Apple Studio from the Creator Store' : 'Public installation unavailable — see status'}
                {STUDIO_PLUGIN_STORE_LIVE ? ' ↗' : ''}
              </a>
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
