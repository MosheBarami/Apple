// Pairing dialog: mint a short-lived code, show it large with a countdown, and
// wait for Studio to claim it.
//
// This used to be the whole onboarding — a four-step wizard that opened over
// the conversation and told you where to download a .rbxm. The steps now live
// in the compact ConnectStudio block at the foot of the conversation
// (components/ws/connect-studio.tsx), so this dialog does exactly one thing:
// step 3, "pair your project".
//
// It reports two states and no others: waiting for the code to be claimed, and
// claimed. "Studio connected" is printed only on the `studio_status` signal
// passed in as `studioConnected` — never inferred from the code having been
// shown, and never as a claim that the plugin is installed, which the browser
// cannot know.
import { useCallback, useEffect, useState } from 'react';
import {
  STUDIO_PLUGIN_INSTALL_HREF,
  STUDIO_PLUGIN_STORE_LIVE,
  type PairingCodeDto,
} from '@golem/shared';
import { createPairingCode } from '../lib/api';
import { countdownTo } from '../lib/format';
import { Modal } from './modal';
import { Forge } from './loading';
import { StatusIcon } from './status-icon';

interface PairingDialogProps {
  projectId: string;
  /** The live bridge signal. The only thing that may turn this dialog green. */
  studioConnected: boolean;
  onClose: () => void;
}

export function PairingDialog({ projectId, studioConnected, onClose }: PairingDialogProps) {
  const [pairing, setPairing] = useState<PairingCodeDto | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [remaining, setRemaining] = useState<string | null>(null);

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

  useEffect(() => {
    mint();
  }, [mint]);

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
    <Modal title="Pair with Studio" onClose={onClose}>
      {studioConnected ? (
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
          {state === 'loading' && (
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

          <p className="pairing-how">
            In Roblox Studio, open the <strong>Apple</strong> plugin and enter this code.
          </p>

          <p className="pairing-waiting muted" aria-live="polite">
            <span className="pulse-dot" aria-hidden="true" /> Waiting for Studio…
          </p>

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
    </Modal>
  );
}
