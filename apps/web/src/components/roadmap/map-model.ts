/**
 * THE ROADMAP AS A MAP — positions and lines, with no React and no imports beyond types.
 *
 * The list (spine.tsx) is the plan you read. The map is the same plan laid out left to right so
 * the "this unlocks that" lines can be seen at once. It draws only what the data carries: one
 * column per stage (buildRoadmapLayout's depth), one box per milestone, one line per declared
 * prerequisite. Nothing is placed by force or by guess, so the same plan always draws the same way.
 */
import type { PlacedMilestone, Readiness, RoadmapStage } from './model';

export const NODE_W = 208;
export const NODE_H = 88;
const COL_GAP = 72;
const ROW_GAP = 18;
const PAD = 24;

export interface MapNode {
  id: string;
  x: number;
  y: number;
  placed: PlacedMilestone;
}

export type EdgeKind = 'landed' | 'active' | 'waiting';

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  /** SVG path, a horizontal S-curve from the right side of `from` to the left side of `to`. */
  d: string;
  /** landed: the prerequisite is in. active: the next milestone is being built. waiting: not yet. */
  kind: EdgeKind;
}

export interface RoadmapMap {
  nodes: MapNode[];
  edges: MapEdge[];
  width: number;
  height: number;
}

/** The curve both the edges and the highlighted connections draw. */
export function curve(x1: number, y1: number, x2: number, y2: number): string {
  const bend = Math.max(24, (x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
}

function edgeKind(from: Readiness, to: Readiness): EdgeKind {
  if (from !== 'landed') return 'waiting';
  return to === 'in-progress' ? 'active' : 'landed';
}

export function buildRoadmapMap(stages: readonly RoadmapStage[]): RoadmapMap {
  const nodes: MapNode[] = [];
  const at = new Map<string, MapNode>();
  const tallest = Math.max(0, ...stages.map((s) => s.milestones.length));
  const columnH = tallest * NODE_H + Math.max(0, tallest - 1) * ROW_GAP;
  stages.forEach((stage, col) => {
    const h = stage.milestones.length * NODE_H + Math.max(0, stage.milestones.length - 1) * ROW_GAP;
    // Each column is centred on the tallest one, so a single milestone sits level with a branch.
    const top = PAD + (columnH - h) / 2;
    stage.milestones.forEach((placed, row) => {
      const node = { id: placed.milestone.id, x: PAD + col * (NODE_W + COL_GAP), y: top + row * (NODE_H + ROW_GAP), placed };
      nodes.push(node);
      at.set(node.id, node);
    });
  });
  const edges: MapEdge[] = [];
  for (const node of nodes) {
    for (const dep of node.placed.dependencies) {
      const from = at.get(dep.id);
      if (!from) continue;
      edges.push({
        id: `${from.id}->${node.id}`,
        from: from.id,
        to: node.id,
        d: curve(from.x + NODE_W, from.y + NODE_H / 2, node.x, node.y + NODE_H / 2),
        kind: edgeKind(from.placed.readiness, node.placed.readiness),
      });
    }
  }
  return {
    nodes,
    edges,
    width: stages.length === 0 ? 0 : PAD * 2 + stages.length * NODE_W + (stages.length - 1) * COL_GAP,
    height: tallest === 0 ? 0 : PAD * 2 + columnH,
  };
}

/** Which milestone the map opens on: whatever is happening now, else the first not landed. */
export function initialSelection(map: RoadmapMap, currentId: string | null): string | null {
  if (currentId && map.nodes.some((n) => n.id === currentId)) return currentId;
  return (map.nodes.find((n) => n.placed.readiness !== 'landed') ?? map.nodes[0])?.id ?? null;
}
