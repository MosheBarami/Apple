// AI Elements `node`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) is a React Flow node drawn as a small
// card — header, title, description, content, footer — with connection handles on its sides.
// Export names follow upstream; the code is written here. A node here is a real <button> placed on
// the Canvas, so it is in the tab order, says whether it is the selected one, and is chosen with
// Enter or Space like any other button. The handles are drawn, not draggable: nobody edits the
// plan's lines by hand.
//
// Where it is used: one per milestone on the roadmap's Map view (components/roadmap/dependency-map.tsx).
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './lib/utils';
import './node.css';

export interface NodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  selected?: boolean;
  /** Dims the node when something else is selected and this one is not connected to it. */
  faded?: boolean;
  /** A state word for styling: e.g. landed, ready, waiting. */
  tone?: string;
  /** Which sides draw a handle. */
  handles?: { target?: boolean; source?: boolean };
  onSelect: () => void;
  label?: string;
  children: ReactNode;
}

export const Node = ({ x, y, width, height, selected, faded, tone, handles, onSelect, label, children }: NodeProps) => (
  <button
    type="button"
    className={cn('ai-node', tone && `ai-node--${tone}`, selected && 'is-selected', faded && 'is-faded')}
    style={{ left: x, top: y, width, height }}
    aria-pressed={selected}
    aria-label={label}
    onClick={onSelect}
  >
    {handles?.target && <span className="ai-node__handle ai-node__handle--target" aria-hidden="true" />}
    {children}
    {handles?.source && <span className="ai-node__handle ai-node__handle--source" aria-hidden="true" />}
  </button>
);

export const NodeHeader = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-node__header', className)} {...props} />
);
export const NodeTitle = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-node__title', className)} {...props} />
);
export const NodeDescription = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-node__desc', className)} {...props} />
);
