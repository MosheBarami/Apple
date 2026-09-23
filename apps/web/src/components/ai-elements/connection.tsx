// AI Elements `connection`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) is the line React Flow draws while a
// connection is being made: an accent curve from the node it starts at, ending in a small circle.
// Export name follows upstream; the code is written here. Nobody draws new links on the roadmap,
// so here the same look marks the links that matter right now: the lines into and out of the
// milestone that is selected on the Map, drawn over the plain edges.
//
// Where it is used: components/roadmap/dependency-map.tsx.
import './connection.css';

export interface ConnectionProps {
  d: string;
  /** Where the end circle goes. */
  toX: number;
  toY: number;
}

export const Connection = ({ d, toX, toY }: ConnectionProps) => (
  <g className="ai-connection">
    <path className="ai-connection__line" d={d} />
    <circle className="ai-connection__end" cx={toX} cy={toY} r={3.5} />
  </g>
);
