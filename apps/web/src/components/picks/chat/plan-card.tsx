// A PLAN-MODE REPLY IS A PLAN, SO IT LOOKS LIKE ONE.
//
// AI Elements "plan" (Apache-2.0; the vendored set has no copy of it, so this is written to its
// shape rather than adapted from its file): a collapsed card with a title, a one-line description
// and a "Build it" button, the steps folded inside. The description is the reply's own first line —
// nothing is summarised or invented — and the steps are the whole reply, rendered by the same
// renderer every reply uses.
//
// "Build it" is drawn only when the page hands this card a way to send it. A button that is
// present and does nothing is worse than no button.
import { useState, type ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ai-elements/ui/collapsible';
import { ChevronDownIcon, ListTodoIcon } from '../../ai-elements/icons';
import './plan-card.css';

/** The reply's first line of prose, without its markdown, as the card's one-line description. */
export function planSummary(markdown: string): string {
  for (const raw of markdown.split('\n')) {
    const line = raw
      .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/, '')
      .replace(/[*_`~]+/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .trim();
    if (line && !line.startsWith('```')) return line.length > 160 ? `${line.slice(0, 157).trimEnd()}…` : line;
  }
  return '';
}

export function PlanCard({
  content,
  streaming,
  onBuild,
  children,
}: {
  content: string;
  streaming: boolean;
  onBuild?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const summary = planSummary(content);
  return (
    <Collapsible className="pk-plan" open={open} onOpenChange={setOpen} data-streaming={streaming ? '' : undefined}>
      <div className="pk-plan__head">
        <ListTodoIcon size={16} className="pk-plan__icon" aria-hidden="true" />
        <div className="pk-plan__copy">
          <p className="pk-plan__title">{streaming ? 'Making a plan…' : 'Plan'}</p>
          {summary && <p className="pk-plan__summary" dir="auto">{summary}</p>}
        </div>
      </div>
      <CollapsibleContent className="pk-plan__steps">{children}</CollapsibleContent>
      <div className="pk-plan__foot">
        <CollapsibleTrigger className="pk-plan__toggle">
          {open ? 'Hide the steps' : 'Show the steps'}
          <ChevronDownIcon size={14} className="pk-plan__chevron" aria-hidden="true" />
        </CollapsibleTrigger>
        {onBuild && !streaming && (
          <button type="button" className="pk-plan__build" onClick={onBuild}>
            Build it
          </button>
        )}
      </div>
    </Collapsible>
  );
}
