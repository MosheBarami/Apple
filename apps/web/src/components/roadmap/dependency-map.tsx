// The roadmap as a map: the same plan as the list, laid out left to right so what unlocks what can
// be seen at once. Built from the genuine AI Elements canvas pieces (ai-elements/canvas, node, edge,
// connection, panel, controls) on @xyflow/react.
//
// The list stays the default and the reading surface; spine.tsx explains why. The map adds the
// one thing a list cannot show, the shape of the plan, and keeps the list's rules: every node holds
// a button in the tab order that says whether it is the selected one, every line is a prerequisite
// the worker declared, and nothing here is invented. Positions come from map-model.ts (one column
// per stage), not from a layout engine, so the same plan always draws the same way.
import { useMemo, useState } from 'react';
import type { Edge as FlowEdge, Node as FlowNode, NodeProps as FlowNodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { Canvas } from '../ai-elements/canvas';
import { Connection } from '../ai-elements/connection';
import { Controls } from '../ai-elements/controls';
import { Edge } from '../ai-elements/edge';
import { Node, NodeDescription, NodeHeader, NodeTitle } from '../ai-elements/node';
import { Panel } from '../ai-elements/panel';
import { READINESS_LABEL, ReadinessNode } from './marks';
import type { BriefIntent } from './milestone-card';
import type { PlacedMilestone, RoadmapStage } from './model';
import { buildRoadmapMap, initialSelection, NODE_H, NODE_W } from './map-model';

interface Props {
  stages: RoadmapStage[];
  currentId: string | null;
  onBrief: (milestoneId: string, intent: BriefIntent) => void;
  busy: { id: string; intent: BriefIntent } | null;
  /** Show this milestone in the list. */
  onShowInList: (milestoneId: string) => void;
}

interface MilestoneData extends Record<string, unknown> {
  placed: PlacedMilestone;
  selected: boolean;
  /** Dimmed when something else is selected and this one is not connected to it. */
  faded: boolean;
  onSelect: () => void;
}
type MilestoneFlowNode = FlowNode<MilestoneData, 'milestone'>;

function MilestoneNode({ data }: FlowNodeProps<MilestoneFlowNode>) {
  const { placed, selected, faded, onSelect } = data;
  const m = placed.milestone;
  const active = placed.readiness === 'in-progress' || placed.readiness === 'ready';
  return (
    <Node
      handles={{ target: placed.dependencies.length > 0, source: placed.unlocks.length > 0 }}
      data-tone={placed.readiness}
      className={cn(
        'h-[88px] w-[208px] overflow-hidden transition-opacity',
        selected && 'border-primary ring-2 ring-primary/60',
        // The focus ring is the CARD's, an OUTLINE drawn outside it and clear of the selection ring (4px offset). The button is the whole
        // card and the card clips (overflow-hidden), so a ring on the button was drawn outside the clip and never seen, on every node; an
        // inset one is painted under the header's fill; and a box-shadow ring on the card replaces the selected node's own ring, so a
        // focused selected node looked the same as an unfocused one (1.4:1 against it).
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-ring',
        // A faded node comes back to full strength while it has focus: a ring on a card at 40% is drawn at 40% (about 1.2:1).
        faded && 'opacity-40 focus-within:opacity-100',
      )}
    >
      {/* A real button over the whole card: in the tab order, chosen with Enter or Space, and it
          says whether it is the selected one. The card around it is only presentation, and draws the focus ring (see above). */}
      <button
        type="button"
        className="flex size-full flex-col items-stretch text-left outline-none"
        aria-pressed={selected}
        aria-label={`${m.title}, ${READINESS_LABEL[placed.readiness]}`}
        onClick={onSelect}
      >
        <NodeHeader className={cn('flex items-center gap-1.5 py-1.5 text-xs', active ? 'text-primary' : 'text-muted-foreground')}>
          <ReadinessNode readiness={placed.readiness} size={14} />
          {READINESS_LABEL[placed.readiness]}
        </NodeHeader>
        <div className="grid gap-1 px-3 py-2">
          <NodeTitle className="line-clamp-1 text-sm">{m.title}</NodeTitle>
          {m.why && <NodeDescription className="line-clamp-2 text-xs">{m.why}</NodeDescription>}
        </div>
      </button>
    </Node>
  );
}

const nodeTypes = { milestone: MilestoneNode };
const edgeTypes = { active: Edge.Animated, waiting: Edge.Temporary };

export function DependencyMap({ stages, currentId, onBrief, busy, onShowInList }: Props) {
  const map = useMemo(() => buildRoadmapMap(stages), [stages]);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked && map.nodes.some((n) => n.id === picked) ? picked : initialSelection(map, currentId);
  const node = map.nodes.find((n) => n.id === selected) ?? null;
  const linked = useMemo(() => {
    const ids = new Set<string>();
    if (!selected) return ids;
    ids.add(selected);
    for (const e of map.edges) {
      if (e.from === selected) ids.add(e.to);
      if (e.to === selected) ids.add(e.from);
    }
    return ids;
  }, [map, selected]);

  const nodes = useMemo<MilestoneFlowNode[]>(
    () =>
      map.nodes.map((n) => ({
        id: n.id,
        type: 'milestone',
        position: { x: n.x, y: n.y },
        width: NODE_W,
        height: NODE_H,
        // The button inside the card is the one tab stop; the wrapper React Flow draws is not a second.
        focusable: false,
        draggable: false,
        data: {
          placed: n.placed,
          selected: n.id === selected,
          faded: selected !== null && !linked.has(n.id),
          onSelect: () => setPicked(n.id),
        },
      })),
    [map, selected, linked],
  );

  const edges = useMemo<FlowEdge[]>(
    () =>
      map.edges.map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        // landed: the prerequisite is in (a plain line). active: the next milestone is being built
        // (a travelling dot). waiting: not yet (dashed).
        type: e.kind === 'landed' ? 'default' : e.kind,
        focusable: false,
        style: { stroke: 'var(--color-muted-foreground)' },
        className: selected !== null && e.from !== selected && e.to !== selected ? 'opacity-20' : undefined,
      })),
    [map, selected],
  );

  return (
    <div
      role="group"
      aria-label="Roadmap map"
      className="aie rm-map relative mt-4 h-[clamp(360px,62vh,680px)] min-w-0 overflow-hidden rounded-md border border-border"
    >
      <Canvas
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineComponent={Connection}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        nodesFocusable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        minZoom={0.4}
      >
        <Panel position="top-left" className="m-3 flex gap-3 px-3 py-1.5 text-xs text-muted-foreground" aria-label="What the lines mean">
          <span className="inline-flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden="true" className="overflow-visible"><path d="M1,3 H21" className="stroke-muted-foreground" fill="none" /></svg>
            Landed first
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden="true" className="overflow-visible"><path d="M1,3 H21" className="stroke-ring" strokeDasharray="5 5" fill="none" /></svg>
            Not yet
          </span>
        </Panel>
        <Controls />
        {node && (
          <Panel position="bottom-left" className="m-3 grid max-w-[min(72ch,calc(100%-24px))] gap-1 p-3" aria-live="polite">
            <p className="m-0 text-[11px] text-muted-foreground">{READINESS_LABEL[node.placed.readiness]}</p>
            <p className="m-0 font-semibold text-sm text-foreground">{node.placed.milestone.title}</p>
            {node.placed.milestone.why && (
              <p className="m-0 text-[12.5px] text-muted-foreground leading-snug">{node.placed.milestone.why}</p>
            )}
            {node.placed.waitingOn.length > 0 && (
              <p className="m-0 text-[12.5px] text-muted-foreground leading-snug">Needs first: {node.placed.waitingOn.map((r) => r.title).join(', ')}</p>
            )}
            {node.placed.unlocks.length > 0 && (
              <p className="m-0 text-[12.5px] text-muted-foreground leading-snug">Unlocks: {node.placed.unlocks.map((r) => r.title).join(', ')}</p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => onShowInList(node.id)}>Show in list</Button>
              {node.placed.readiness !== 'landed' && (
                <Button type="button" size="sm" disabled={busy !== null} onClick={() => onBrief(node.id, 'build')}>
                  {busy?.id === node.id && busy.intent === 'build' ? 'Reading…' : 'Build'}
                </Button>
              )}
            </div>
          </Panel>
        )}
      </Canvas>
    </div>
  );
}
