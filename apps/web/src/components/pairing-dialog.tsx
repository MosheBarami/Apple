// Pairing dialog: mint a short-lived code, show it huge with a countdown and
// step-by-step Studio plugin install instructions.
import { useCallback, useEffect, useState } from 'react';
import type { PairingCodeDto } from '@golem/shared';
import { createPairingCode } from '../lib/api';
import { countdownTo } from '../lib/format';
import { Modal } from './modal';

interface PairingDialogProps {
  projectId: string;
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
    <Modal title="Connect Roblox Studio" onClose={onClose} wide>
      {studioConnected ? (
        <div className="pairing-success" role="status">
          <span className="pairing-success-icon" aria-hidden="true">
            ✓
          </span>
          <h3>Studio connected</h3>
          <p className="muted">Golem can now build directly in your place.</p>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Start building
          </button>
        </div>
      ) : (
        <div className="pairing-grid">
          <div className="pairing-code-col">
            {state === 'loading' && (
              <div className="pairing-code-box" aria-busy="true">
                <span className="rune-spinner" aria-hidden="true" />
                <p className="muted">Carving a code…</p>
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
            <p className="pairing-waiting muted" aria-live="polite">
              <span className="pulse-dot" aria-hidden="true" /> Waiting for Studio…
            </p>
          </div>
          <ol className="pairing-steps">
            <li>
              <strong>Download the plugin</strong>
              <br />
              <a href="/plugin.rbxm" download className="pairing-link">
                Golem for Studio (.rbxm)
              </a>
            </li>
            <li>
              <strong>Install it</strong>
              <br />
              In Roblox Studio: Plugins tab → <em>Plugins Folder</em>, drop the file in, then restart Studio.
            </li>
            <li>
              <strong>Open Golem in Studio</strong>
              <br />
              Click the <em>Golem</em> button in the Plugins toolbar.
            </li>
            <li>
              <strong>Enter the code</strong>
              <br />
              Type the code shown here — the pill above turns green when you're linked.
            </li>
          </ol>
        </div>
      )}
    </Modal>
  );
}
