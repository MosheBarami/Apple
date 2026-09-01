// Turning a session into work-surface artifacts.
//
// Every structured payload the agent produces (`tool_end.detail`) is offered to
// the generative-UI validator. Whatever validates becomes a panel on the work
// surface; whatever does not is simply not shown. Nothing is rendered from an
// unvalidated shape.
import { documentFromToolDetail, sanitizeDocument } from './generative-ui';
import type { Block, RenderReviewBlock, UIDocument } from './generative-ui/schema';
import { labelForTool } from '../components/ws/tool-vocabulary';
import type { ChatItem, ToolEvent } from './use-project-socket';

export interface SurfacePanel {
  id: string;
  /** The event this artifact came from, so a caller can match it to a step. */
  toolId: string;
  tool: string;
  /** Short human label for the artifact header. */
  title: string;
  at: number;
  doc: UIDocument;
  /** True when the panel carries at least one render with pixels. */
  hasRender: boolean;
}

function hasRenderWithImage(blocks: Block[]): boolean {
  return blocks.some((b) => b.type === 'render_review' && b.views.some((v) => v.image !== undefined));
}

function titleFor(tool: string, doc: UIDocument): string {
  if (doc.title) return doc.title;
  const first = doc.blocks[0];
  if (first?.type === 'render_review') return `Render · ${first.subject}`;
  if (first?.type === 'visual_critique') return 'Visual quality gate';
  if (first?.type === 'code_diff') return `Diff · ${first.path}`;
  if (first?.type === 'test_report') return first.title ?? 'Test run';
  if (first?.type === 'error_diagnosis') return first.title;
  return labelForTool(tool);
}

/** Build a panel from one tool event, or null when its result is not presentable. */
export function panelFromTool(messageId: string, tool: ToolEvent, at: number): SurfacePanel | null {
  if (tool.detail === undefined || tool.detail === null) return null;
  const result = documentFromToolDetail(tool.detail);
  if (!result || !result.ok) return null;
  return {
    id: `${messageId}:${tool.toolId}`,
    toolId: tool.toolId,
    tool: tool.tool,
    title: titleFor(tool.tool, result.doc),
    at,
    doc: result.doc,
    hasRender: hasRenderWithImage(result.doc.blocks),
  };
}

/** All presentable panels in a conversation, newest first. */
export function extractPanels(messages: ChatItem[]): SurfacePanel[] {
  const panels: SurfacePanel[] = [];
  for (const message of messages) {
    for (const tool of message.tools) {
      const panel = panelFromTool(message.id, tool, message.createdAt);
      if (panel) panels.push(panel);
    }
  }
  return panels.reverse();
}

function heroView(block: RenderReviewBlock) {
  return block.views.find((v) => v.name === 'hero' && v.image) ?? block.views.find((v) => v.image);
}

function firstRender(panel: SurfacePanel): RenderReviewBlock | null {
  for (const block of panel.doc.blocks) if (block.type === 'render_review') return block;
  return null;
}

/**
 * A before/after wipe built from two render panels. Returns null unless both
 * sides actually have pixels — a comparison with one empty half is worse than
 * no comparison.
 */
export function buildComparison(before: SurfacePanel, after: SurfacePanel): UIDocument | null {
  const a = firstRender(before);
  const b = firstRender(after);
  if (!a || !b) return null;
  const av = heroView(a);
  const bv = heroView(b);
  if (!av?.image || !bv?.image) return null;

  const stats = (block: RenderReviewBlock, view: typeof av) => {
    const rows: { key: string; value: string }[] = [];
    if (view?.coverage !== undefined) rows.push({ key: 'Coverage', value: `${Math.round(view.coverage * 100)}%` });
    if (view?.distinctColours !== undefined) rows.push({ key: 'Colours', value: String(view.distinctColours) });
    if (typeof block.score === 'number') rows.push({ key: 'Score', value: `${block.score.toFixed(1)}/10` });
    return rows;
  };

  const result = sanitizeDocument({
    v: 1,
    title: 'Before and after',
    blocks: [
      {
        type: 'scene_comparison',
        title: `${a.subject}`,
        before: { label: new Date(before.at).toLocaleTimeString(), image: av.image, stats: stats(a, av) },
        after: { label: new Date(after.at).toLocaleTimeString(), image: bv.image, stats: stats(b, bv) },
        note: 'Drag the handle, or use the arrow keys, to wipe between the two renders.',
      },
    ],
  });
  return result.ok ? result.doc : null;
}
