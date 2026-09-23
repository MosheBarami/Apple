// AI Elements `panel`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) is React Flow's Panel dressed as a small
// card, pinned to a corner of the canvas. Export name follows upstream; the code is written here.
// `dock` takes a panel off the canvas and attaches it under it, full width, so something long
// enough to read never covers the nodes it is about.
//
// Where it is used: the legend and the selected milestone on the roadmap's Map view
// (components/roadmap/dependency-map.tsx).
import type { HTMLAttributes } from 'react';
import { cn } from './lib/utils';
import './panel.css';

export type PanelPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type PanelProps = HTMLAttributes<HTMLDivElement> & { position?: PanelPosition; dock?: boolean };

export const Panel = ({ position = 'top-left', dock, className, ...props }: PanelProps) => (
  <div className={cn('ai-panel', `ai-panel--${position}`, dock && 'ai-panel--dock', className)} data-canvas-still="" {...props} />
);
