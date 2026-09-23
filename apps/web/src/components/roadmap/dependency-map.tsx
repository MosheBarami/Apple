// The roadmap as a map: the same plan as the list, laid out left to right so what unlocks what can
// be seen at once. Built from the AI Elements canvas pieces (ai-elements/canvas, node, edge,
// connection, panel, controls), re-implemented without React Flow.
//
// The list stays the default and the reading surface; spine.tsx explains why. The map adds the
// one thing a list cannot show, the shape of the plan, and keeps the list's rules: every node is
// a button in the tab order, every line is a prerequisite the worker declared, and nothing here
// is invented.
import { useMemo, useState } from 'react';
import { Canvas } from '../ai-elements/canvas';
import { Connection } from '../ai-elements/connection';
import { Controls } from '../ai-elements/controls';
import { Edge } from '../ai-elements/edge';
import { Node, NodeDescription, NodeHeader, NodeTitle } from '../ai-elements/node';
import { Panel } from '../ai-elements/panel';
import { READINESS_LABEL, ReadinessNode } from './marks';
import type { BriefIntent } from './milestone-card';
import type { RoadmapStage } from './model';
import { buildRoadmapMap, initialSelection, NODE_H, NODE_W } from './map-model';
import '../picks/tech/tech-ui.css';
import './dependency-map.css';

interface Props {
  stages: RoadmapStage[];
  currentId: string | null;
  onBrief: (milestoneId: string, intent: BriefIntent) => void;
  busy: { id: string; intent: BriefIntent } | null;
  /** Show this milestone in the list. */
  onShowInList: (milestoneId: string) => void;
}

export function DependencyMap({ stages, currentId, onBrief, busy, onShowInList }: Props) {
  const map = useMemo(() => buildRoadmapMap(stages), [stages]);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = (picked && map.nodes.some((n) => n.id === picked) ? picked : initialSelection(map, currentId));
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
  const byId = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map]);

  const layer = (
    <>
      <svg className="ai-canvas__edges" width={map.width} height={map.height} aria-hidden="true" focusable="false">
        {map.edges.map((e) => {
          const faded = selected !== null && e.from !== selected && e.to !== selected;
          if (e.kind === 'active') return <Edge.Animated key={e.id} d={e.d} faded={faded} />;
          if (e.kind === 'waiting') return <Edge.Temporary key={e.id} d={e.d} faded={faded} />;
          return <Edge.Solid key={e.id} d={e.d} faded={faded} />;
        })}
        {map.edges
          .filter((e) => e.from === selected || e.to === selected)
          .map((e) => {
            const to = byId.get(e.to);
            return to ? <Connection key={`c-${e.id}`} d={e.d} toX={to.x} toY={to.y + NODE_H / 2} /> : null;
          })}
      </svg>
      {map.nodes.map((n) => {
        const m = n.placed.milestone;
        return (
          <Node
            key={n.id}
            x={n.x}
            y={n.y}
            width={NODE_W}
            height={NODE_H}
            tone={n.placed.readiness}
            selected={n.id === selected}
            faded={selected !== null && !linked.has(n.id)}
            handles={{ target: n.placed.dependencies.length > 0, source: n.placed.unlocks.length > 0 }}
            label={`${m.title}, ${READINESS_LABEL[n.placed.readiness]}`}
            onSelect={() => setPicked(n.id)}
          >
            <NodeHeader>
              <span className={`rm-map__mark is-${n.placed.readiness}`}><ReadinessNode readiness={n.placed.readiness} size={14} /></span>
              {READINESS_LABEL[n.placed.readiness]}
            </NodeHeader>
            <NodeTitle>{m.title}</NodeTitle>
            {m.why && <NodeDescription>{m.why}</NodeDescription>}
          </Node>
        );
      })}
    </>
  );

  const focus = node ? { x: node.x, y: node.y, w: NODE_W, h: NODE_H } : null;

  return (
    <Canvas className="rm-map" width={map.width} height={map.height} label="Roadmap map" layer={layer} focus={focus}>
      <Panel position="top-left" className="rm-map__legend" aria-label="What the lines mean">
        <span className="rm-map__key"><svg width="22" height="6" aria-hidden="true"><path className="ai-edge" d="M1,3 H21" /></svg>Landed first</span>
        <span className="rm-map__key"><svg width="22" height="6" aria-hidden="true"><path className="ai-edge ai-edge--temporary" d="M1,3 H21" /></svg>Not yet</span>
      </Panel>
      <Controls />
      {node && (
        <Panel dock className="rm-map__detail" aria-live="polite">
          <p className="rm-map__detail-state">{READINESS_LABEL[node.placed.readiness]}</p>
          <p className="rm-map__detail-title">{node.placed.milestone.title}</p>
          {node.placed.milestone.why && <p className="rm-map__detail-why">{node.placed.milestone.why}</p>}
          {node.placed.waitingOn.length > 0 && (
            <p className="rm-map__detail-line">Needs first: {node.placed.waitingOn.map((r) => r.title).join(', ')}</p>
          )}
          {node.placed.unlocks.length > 0 && (
            <p className="rm-map__detail-line">Unlocks: {node.placed.unlocks.map((r) => r.title).join(', ')}</p>
          )}
          <div className="rm-map__detail-actions">
            <button type="button" className="tq-btn" onClick={() => onShowInList(node.id)}>Show in list</button>
            <button type="button" className="tq-btn" disabled={busy !== null} onClick={() => onBrief(node.id, 'plan')}>
              {busy?.id === node.id && busy.intent === 'plan' ? 'Reading…' : node.placed.readiness === 'landed' ? 'Plan changes' : 'Plan'}
            </button>
            {node.placed.readiness !== 'landed' && (
              <button type="button" className="tq-btn tq-btn--primary" disabled={busy !== null} onClick={() => onBrief(node.id, 'build')}>
                {busy?.id === node.id && busy.intent === 'build' ? 'Reading…' : 'Build'}
              </button>
            )}
          </div>
        </Panel>
      )}
    </Canvas>
  );
}
