// COPY, AS ONE CONTROL WITH THREE STATES.
//
// Three picks did this job and they are merged here rather than stacked:
//   * Animate UI "Copy Button" (MIT + Commons Clause) — the icon leaves at scale 0 with a 4px blur
//     and the tick arrives the same way;
//   * Motion "Copy button" (Motion+ licence, so NOTHING of its code is used — re-implemented from
//     what it does) — a small "Copied" tip rises beside the control;
//   * Motion "Multi state badge" (Motion+, re-implemented) — the control is a badge whose WORD
//     changes (Copy → Copied / Couldn't copy) and whose width springs between the words instead of
//     jumping.
// The failed state is the one the originals did not have and the product needs: a refused
// clipboard says so rather than drawing a tick for a copy that did not happen.
import { useEffect, useRef, useState } from 'react';
import { useIsomorphicLayoutEffect } from '../../ai-elements/lib/use-isomorphic-layout-effect';
import { CheckIcon, CopyIcon, XIcon } from '../../ai-elements/icons';
import { tweenWidth } from './motion';
import './copy-button.css';

export type CopyState = 'idle' | 'copied' | 'failed';

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const WORD: Record<CopyState, string> = { idle: 'Copy', copied: 'Copied', failed: "Couldn't copy" };

export function CopyButton({
  getText,
  label = WORD.idle,
  className,
  timeout = 2000,
  title,
}: {
  /** Read at the moment of the click, so a reply that is still arriving copies what is there. */
  getText: () => string;
  label?: string;
  className?: string;
  timeout?: number;
  title?: string;
}) {
  const [state, setState] = useState<CopyState>('idle');
  const button = useRef<HTMLButtonElement>(null);
  const width = useRef<number | null>(null);

  useEffect(() => {
    if (state === 'idle') return;
    const id = window.setTimeout(() => setState('idle'), timeout);
    return () => window.clearTimeout(id);
  }, [state, timeout]);

  // The badge's width follows its word: measured after the word changed, played from the last one.
  useIsomorphicLayoutEffect(() => {
    if (button.current) width.current = tweenWidth(button.current, width.current);
  }, [state]);

  const word = state === 'idle' ? label : WORD[state];
  const Icon = state === 'copied' ? CheckIcon : state === 'failed' ? XIcon : CopyIcon;

  return (
    <button
      ref={button}
      type="button"
      className={`pk-copy${className ? ` ${className}` : ''}`}
      data-state={state}
      title={title}
      onClick={() => {
        if (state === 'copied') return;
        void writeClipboard(getText()).then((ok) => setState(ok ? 'copied' : 'failed'));
      }}
    >
      {/* Keyed by state: each icon mounts fresh, so its entrance plays every time it changes. */}
      <Icon key={state} size={14} className="pk-copy__icon" aria-hidden="true" />
      <span className="pk-copy__word">{word}</span>
      <span className="gx-sr" role="status">
        {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Could not copy' : ''}
      </span>
    </button>
  );
}
