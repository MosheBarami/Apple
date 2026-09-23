// AI ELEMENTS' "CONTEXT", as this product means it: a small ring in the composer's footer that says
// how much of today's allowance is left, next to the button that spends it. Upstream's ring is a
// model's context window; the thing a young creator runs out of here is Credits, so the ring is the
// allowance and its hover card is the account's own sentences about it.
//
// Everything it says comes from usage-meter-model.ts — the same `meterView` the rail meter and the
// Usage page read — so the composer cannot phrase a balance differently from the rest of the
// product, and the rules in that file hold here too: a balance that is still being fetched, or that
// could not be read, draws NOTHING rather than a ring that claims full or empty. An unmetered
// (owner) account has no limit to show, and gets no ring.
//
// The number on the ring is Animate UI's "Sliding Number": it rolls down as a run spends.
//
// The quota is the workspace's own `['me']` query, read from the shared cache (no second request).
// Rendered outside a QueryClient — the specimen book, a server render in a test — it is absent.
import { useContext, useState } from 'react';
import { QueryClientContext, useQuery } from '@tanstack/react-query';
import { fetchMe } from '../../../lib/api';
import { meterView } from '../../usage-meter-model';
import {
  PromptInputHoverCard,
  PromptInputHoverCardContent,
  PromptInputHoverCardTrigger,
} from '../../ai-elements/prompt-input';
import { SlidingNumber } from './sliding-number';
import './credits-ring.css';

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function CreditsRing() {
  const client = useContext(QueryClientContext);
  if (!client) return null;
  return <Ring />;
}

function Ring() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 60_000, retry: 1 });
  const [open, setOpen] = useState(false);
  const quota = me.data?.quota;
  if (!quota || quota.unmetered) return null;
  const view = meterView(quota, Date.now(), { pending: me.isPending, failed: me.isError });
  if (view.tone !== 'good' && view.tone !== 'warn' && view.tone !== 'bad') return null;

  const R = 7;
  const C = 2 * Math.PI * R;
  const left = view.allowanceFraction;
  const label = `${view.headline}. ${view.detail}`;

  return (
    <PromptInputHoverCard open={open} onOpenChange={setOpen} openDelay={200} closeDelay={150}>
      <PromptInputHoverCardTrigger asChild>
        <button
          type="button"
          className={`pk-credits is-${view.tone}`}
          aria-label={label}
          aria-expanded={open}
          data-dock=""
          data-fx="press"
          onClick={() => setOpen((v) => !v)}
        >
          <svg className="pk-credits__ring" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r={R} className="pk-credits__track" />
            <circle
              cx="9" cy="9" r={R} className="pk-credits__fill"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - left)}
              transform="rotate(-90 9 9)"
            />
          </svg>
          {view.allowanceRemaining === 0 && view.credits > 0
            // The day's allowance is gone but the account is not empty: a bare "0" read as "you are
            // out" on an account holding extra credits (measured 2026-09-23). Show what is spendable.
            ? <span className="pk-credits__num">{COMPACT.format(view.credits)}</span>
            : <SlidingNumber value={view.allowanceRemaining} className="pk-credits__num" />}
        </button>
      </PromptInputHoverCardTrigger>
      <PromptInputHoverCardContent className="pk-credits__card" side="top">
        <p className="pk-credits__head">{view.headline}</p>
        <p className="pk-credits__detail">{view.detail}</p>
        {view.buildsHint && <p className="pk-credits__line">That is {view.buildsHint}.</p>}
        {view.resetsIn && <p className="pk-credits__line">{view.resetsIn.charAt(0).toUpperCase() + view.resetsIn.slice(1)}.</p>}
        {view.nextAction && <p className="pk-credits__line">{view.nextAction}</p>}
      </PromptInputHoverCardContent>
    </PromptInputHoverCard>
  );
}
