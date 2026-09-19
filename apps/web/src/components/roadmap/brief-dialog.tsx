// §33: what Apple would actually be asked to do, before it is asked.
//
// The worker builds the brief from a fresh scan and returns the exact request
// text. Showing that text is the whole point of this dialog: the roadmap's Plan
// and Build buttons hand work to the agent, and a button that silently composes
// an instruction on the user's behalf is the kind of thing that should be
// readable before it runs, not afterwards in the transcript.
//
// The dialog can also fail honestly. Copying is offered because it always
// works; opening the conversation carries the request through the router, and
// the copy button is what the user falls back to if they would rather paste it
// themselves.
import { useState } from 'react';
import { PRODUCT_MODE_INFO, SPECIALIST_TO_PRODUCT_MODE, type ProductMode } from '@golem/shared';
import { Modal } from '../modal';
import type { MilestoneBrief } from './model';
import type { BriefIntent } from './milestone-card';
import './brief-dialog.css';

interface Props {
  brief: MilestoneBrief;
  intent: BriefIntent;
  onClose: () => void;
  onOpenConversation: (request: string, mode: ProductMode) => void;
}

/**
 * Plan always means Plan — the mode that inspects and proposes without touching
 * the place. Build defers to the specialist the worker chose for this milestone,
 * translated at the edge into the product's own vocabulary; the internal
 * specialist name (§1) never reaches the screen.
 */
export function modeForIntent(brief: MilestoneBrief, intent: BriefIntent): ProductMode {
  if (intent === 'plan') return 'plan';
  return SPECIALIST_TO_PRODUCT_MODE[brief.mode] ?? 'agent';
}

export function BriefDialog({ brief, intent, onClose, onOpenConversation }: Props) {
  const [copied, setCopied] = useState(false);
  const mode = modeForIntent(brief, intent);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief.request);
      setCopied(true);
    } catch {
      // Clipboard access can simply be denied. Say so rather than showing a
      // "Copied" that did not happen — the text is on screen and selectable.
      setCopied(false);
    }
  };

  return (
    <Modal title={brief.title} onClose={onClose} wide>
      <p className="rm-brief__lead">
        This is the request Apple would work from, in <strong>{PRODUCT_MODE_INFO[mode].name}</strong> mode.{' '}
        {PRODUCT_MODE_INFO[mode].blurb}
      </p>

      {!brief.ready && brief.blockedBy.length > 0 && (
        <p className="rm-brief__blocked" role="status">
          Something this needs has not landed yet, so the run may not have anything to build on.
        </p>
      )}

      {brief.context.length > 0 && (
        <section className="rm-brief__section">
          <h3 className="rm-brief__key">What Apple already knows about this project</h3>
          <ul className="rm-brief__list">
            {brief.context.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {brief.steps.length > 0 && (
        <section className="rm-brief__section">
          <h3 className="rm-brief__key">It would build</h3>
          <ul className="rm-brief__list">
            {brief.steps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {brief.acceptance.length > 0 && (
        <section className="rm-brief__section">
          <h3 className="rm-brief__key">It is finished when</h3>
          <ul className="rm-brief__list">
            {brief.acceptance.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {brief.touches.length > 0 && (
        <p className="rm-brief__touches">
          Touches <strong>{brief.touches.join(', ')}</strong>
        </p>
      )}

      <details className="rm-brief__raw">
        <summary>The exact request</summary>
        <pre className="rm-brief__pre">{brief.request}</pre>
      </details>

      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy the request'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onOpenConversation(brief.request, mode)}
        >
          Open the conversation
        </button>
      </div>
    </Modal>
  );
}
