// AI Elements `edge`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) ships two React Flow edges: `Temporary`,
// a dashed line for a link that is not settled, and `Animated`, a line with a marker travelling
// along it. Export names follow upstream (`Edge.Temporary`, `Edge.Animated`); the code is written
// here, as SVG paths. The travelling marker is a CSS dash animation, so it stops under
// prefers-reduced-motion like everything else in the app.
//
// Where it is used: the "needs this first" lines on the roadmap's Map view — solid when the
// prerequisite has landed, dashed while it has not, moving into whatever is being built now
// (components/roadmap/dependency-map.tsx).
import { cn } from './lib/utils';
import './edge.css';

export interface EdgeProps {
  d: string;
  faded?: boolean;
}

const Solid = ({ d, faded }: EdgeProps) => <path className={cn('ai-edge', faded && 'is-faded')} d={d} />;

const Temporary = ({ d, faded }: EdgeProps) => (
  <path className={cn('ai-edge', 'ai-edge--temporary', faded && 'is-faded')} d={d} />
);

const Animated = ({ d, faded }: EdgeProps) => (
  <g className={cn('ai-edge-group', faded && 'is-faded')}>
    <path className="ai-edge ai-edge--animated" d={d} />
    <path className="ai-edge__flow" d={d} />
  </g>
);

export const Edge = { Solid, Temporary, Animated };
