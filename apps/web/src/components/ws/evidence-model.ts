/**
 * Evidence: the typed artifact a step actually produced, reduced to what a card
 * can draw.
 *
 * SOURCE OF TRUTH. Every field here comes from a `UIDocument` that has already
 * been through the generative-UI validator — the same document `lib/panels.ts`
 * builds and `Turn` renders below the prose. Raw `tool_end.detail` never reaches
 * this module, so a card cannot be drawn from a shape the schema does not
 * describe. What is new is the *state*, which the validated document alone
 * cannot express:
 *
 *   loading  ← `tool_start` seen, no `tool_end` yet. The tool NAME tells us
 *              which card is coming, so the skeleton is the right shape.
 *   error    ← `tool_end.ok === false` (the tool failed), or a `detail` that
 *              was present and did not validate (the result is unreadable).
 *              These are different sentences and are kept apart.
 *   empty    ← it validated and genuinely carries nothing: a render with no
 *              pixels, a report with no cases, a diff with no hunks.
 *   ready    ← there is something real to show.
 *
 * A tool that sent no `detail` at all produces NO card. "Nothing was returned"
 * is not an error and not an empty result; it is an absence, and an absence
 * gets no box.
 *
 * Pure and DOM-free so `tests/evidence-model.test.mjs` runs it under
 * `node --test`: this module imports types only.
 */
import type { Block, UIDocument } from '../../lib/generative-ui/schema';

export type EvidenceState = 'loading' | 'ready' | 'empty' | 'error';

/** Why an error card exists. The copy differs because the fault differs. */
export type EvidenceFault = 'tool_failed' | 'unreadable';

export type EvidenceKind = 'render' | 'diff' | 'test' | 'assets';

interface EvidenceBase {
  toolId: string;
  tool: string;
  state: EvidenceState;
  fault?: EvidenceFault;
  /** The worker's own one-line summary, when it sent one. Never written here. */
  note?: string;
}

export interface RenderEvidence extends EvidenceBase {
  kind: 'render';
  subject: string;
  views: { name: string; src?: string; alt?: string; coverage?: number }[];
  score?: number;
  passed?: boolean;
}

export interface DiffEvidence extends EvidenceBase {
  kind: 'diff';
  path: string;
  added: number;
  removed: number;
  language?: string;
  /** A short excerpt, capped. The full diff is the panel below the prose. */
  sample: { kind: string; text: string; n?: number }[];
}

export interface TestEvidence extends EvidenceBase {
  kind: 'test';
  title: string;
  passed: number;
  failed: number;
  skipped?: number;
  durationMs?: number;
  failing: { name: string; message?: string }[];
}

export interface AssetEvidence extends EvidenceBase {
  kind: 'assets';
  title: string;
  items: { id: string; name: string; assetKind: string; src?: string; alt?: string; creator?: string }[];
}

export type Evidence = RenderEvidence | DiffEvidence | TestEvidence | AssetEvidence;

/**
 * Which tool yields which card. Deliberately narrow: a tool is listed only when
 * its validated result reliably carries that block. `check_composition`,
 * `inspect_visually` and `visual_critique` are absent because their result is
 * already the Thinking card's Validation gate — showing it twice would make one
 * judgement look like two.
 */
const TOOL_EVIDENCE: Record<string, EvidenceKind> = {
  render_view: 'render',
  edit_script: 'diff',
  run_and_check: 'test',
  search_asset_library: 'assets',
  find_verified_asset: 'assets',
};

export function evidenceKindForTool(tool: string | undefined): EvidenceKind | null {
  if (!tool) return null;
  return TOOL_EVIDENCE[tool] ?? null;
}

/** Enough of a `ToolEvent` to know what state the evidence is in. */
export interface EvidenceSource {
  toolId: string;
  tool: string;
  summary?: string;
  ok?: boolean;
  done: boolean;
  /** True when `tool_end` carried a structured `detail`. False means no artifact was sent. */
  hasDetail: boolean;
}

const MAX_DIFF_SAMPLE = 6;
const MAX_FAILING = 4;
const MAX_ASSETS = 6;
const MAX_VIEWS = 5;

const clean = (s: unknown): string => (typeof s === 'string' ? s.trim() : '');

function firstBlock<T extends Block['type']>(doc: UIDocument, type: T): Extract<Block, { type: T }> | null {
  for (const block of doc.blocks) {
    if (block.type === type) return block as Extract<Block, { type: T }>;
  }
  return null;
}

function shell(source: EvidenceSource, kind: EvidenceKind, state: EvidenceState, fault?: EvidenceFault): Evidence {
  const base = { toolId: source.toolId, tool: source.tool, state, fault, note: clean(source.summary) || undefined };
  switch (kind) {
    case 'render':
      return { ...base, kind: 'render', subject: '', views: [] };
    case 'diff':
      return { ...base, kind: 'diff', path: '', added: 0, removed: 0, sample: [] };
    case 'test':
      return { ...base, kind: 'test', title: 'Playtest', passed: 0, failed: 0, failing: [] };
    case 'assets':
      return { ...base, kind: 'assets', title: 'Assets', items: [] };
  }
}

/**
 * One step's evidence, or null when the step has none to give.
 *
 * `doc` is the validated document for this tool, or null when there was none.
 * Null with `hasDetail` true is the unreadable case; null with `hasDetail`
 * false means the worker simply sent no artifact, and that draws nothing.
 */
export function evidenceFor(source: EvidenceSource, doc: UIDocument | null): Evidence | null {
  const kind = evidenceKindForTool(source.tool);
  if (kind === null) return null;

  if (!source.done) return shell(source, kind, 'loading');
  if (source.ok === false) return shell(source, kind, 'error', 'tool_failed');
  if (!source.hasDetail) return null;
  if (!doc) return shell(source, kind, 'error', 'unreadable');

  const note = clean(source.summary) || undefined;
  const base = { toolId: source.toolId, tool: source.tool, note };

  if (kind === 'render') {
    const block = firstBlock(doc, 'render_review');
    if (!block) return shell(source, kind, 'empty');
    const views = block.views.slice(0, MAX_VIEWS).map((v) => ({
      name: v.name,
      src: v.image?.src,
      alt: v.image?.alt,
      coverage: v.coverage,
    }));
    // A render with no pixels in any view is empty, not ready: a card of five
    // grey rectangles claiming to be a render is worse than saying there is none.
    const state: EvidenceState = views.some((v) => v.src) ? 'ready' : 'empty';
    return {
      ...base,
      kind: 'render',
      state,
      subject: clean(block.subject),
      views,
      score: typeof block.score === 'number' ? block.score : undefined,
      passed: block.passed,
    };
  }

  if (kind === 'diff') {
    const block = firstBlock(doc, 'code_diff');
    if (!block) return shell(source, kind, 'empty');
    const lines = block.hunks.flatMap((h) => h.lines);
    const added = lines.filter((l) => l.kind === 'add').length;
    const removed = lines.filter((l) => l.kind === 'del').length;
    // A diff whose hunks contain only context lines changed nothing worth a card.
    const state: EvidenceState = added + removed > 0 ? 'ready' : 'empty';
    return {
      ...base,
      kind: 'diff',
      state,
      path: clean(block.path),
      added,
      removed,
      language: block.language,
      sample: lines
        .filter((l) => l.kind !== 'ctx')
        .slice(0, MAX_DIFF_SAMPLE)
        .map((l) => ({ kind: l.kind, text: l.text, n: l.n })),
    };
  }

  if (kind === 'test') {
    const block = firstBlock(doc, 'test_report');
    if (!block) return shell(source, kind, 'empty');
    const state: EvidenceState = block.cases.length > 0 || block.passed + block.failed > 0 ? 'ready' : 'empty';
    return {
      ...base,
      kind: 'test',
      state,
      title: clean(block.title) || 'Playtest',
      passed: block.passed,
      failed: block.failed,
      skipped: block.skipped,
      durationMs: block.durationMs,
      failing: block.cases
        .filter((c) => c.status === 'fail')
        .slice(0, MAX_FAILING)
        .map((c) => ({ name: clean(c.name), message: clean(c.message) || undefined })),
    };
  }

  const block = firstBlock(doc, 'asset_picker');
  if (!block) return shell(source, kind, 'empty');
  const items = block.assets.slice(0, MAX_ASSETS).map((a) => ({
    id: a.id,
    name: clean(a.name),
    assetKind: a.kind,
    src: a.thumbnail?.src,
    alt: a.thumbnail?.alt,
    creator: clean(a.creator) || undefined,
  }));
  return {
    ...base,
    kind: 'assets',
    state: items.length > 0 ? 'ready' : 'empty',
    title: clean(block.title) || 'Assets',
    items,
  };
}

/** Evidence for a whole turn, keyed by `toolId` so the timeline can match steps. */
export function buildEvidence(
  sources: EvidenceSource[],
  docs: Map<string, UIDocument>,
): Map<string, Evidence> {
  const out = new Map<string, Evidence>();
  for (const source of sources) {
    const evidence = evidenceFor(source, docs.get(source.toolId) ?? null);
    if (evidence) out.set(source.toolId, evidence);
  }
  return out;
}

/* ----------------------------------------------------------------- copy --- */

/** What an error card says. Two faults, two sentences — they are not the same event. */
export const FAULT_COPY: Record<EvidenceFault, string> = {
  tool_failed: 'This step reported a failure. Nothing was produced.',
  unreadable: 'A result came back in a shape Golem could not read, so none of it is shown.',
};

export const EMPTY_COPY: Record<EvidenceKind, string> = {
  render: 'The render came back with no pixels.',
  diff: 'The edit changed no lines.',
  test: 'The run reported no test cases.',
  assets: 'The search matched no assets.',
};

export const LOADING_COPY: Record<EvidenceKind, string> = {
  render: 'Rendering in Studio…',
  diff: 'Writing the edit…',
  test: 'Running the place…',
  assets: 'Searching the asset library…',
};
