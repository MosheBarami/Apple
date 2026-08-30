/**
 * Adapters: real Golem data → generative-UI documents.
 *
 * These build *candidate* documents from first-party payloads (a Studio render,
 * a visual critique, checkpoint metadata, quota state). They are still passed
 * through the validator before rendering, so a producer bug degrades to the safe
 * fallback exactly like a hostile payload would. There is no trusted bypass.
 */
import type {
  CheckpointMeta,
  QuotaState,
  RenderViewResult,
  RenderedView,
  SceneLighting,
} from '@golem/shared';
import type { UIDocument } from './schema';
import { sanitizeDocument, type ValidationResult } from './validate';

// ---------------------------------------------------------------------------
// Pixels: the plugin returns packed RGB rows; the browser turns them into a PNG
// data URL so the validated schema's image rule (raster data URL only) holds.
// ---------------------------------------------------------------------------

function decodeBase64(input: string): Uint8Array | null {
  try {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Convert `RenderedView.rgbBase64` (width*height*3 bytes, row-major) into a PNG
 * data URL. Returns null in any non-browser or malformed case — callers then
 * show metrics without the image rather than failing.
 */
export function rgbBase64ToPngDataUrl(rgbBase64: string, width: number, height: number): string | null {
  if (typeof document === 'undefined' || !Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width <= 0 || height <= 0 || width > 4096 || height > 4096) return null;
  const bytes = decodeBase64(rgbBase64);
  if (!bytes || bytes.length < width * height * 3) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const image = ctx.createImageData(width, height);
    for (let i = 0, p = 0; i < width * height; i++, p += 3) {
      const o = i * 4;
      image.data[o] = bytes[p] ?? 0;
      image.data[o + 1] = bytes[p + 1] ?? 0;
      image.data[o + 2] = bytes[p + 2] ?? 0;
      image.data[o + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const url = canvas.toDataURL('image/png');
    return url.startsWith('data:image/png;base64,') ? url : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Render + critique
// ---------------------------------------------------------------------------

/** Shape of the worker's VisualCritique, restated so the web app owns no worker import. */
export interface CritiqueLike {
  score: number | null;
  passed: boolean;
  unavailable?: boolean;
  summary: string;
  defects: { view: string; dimension: string; severity: string; observed: string; fix: string }[];
  hardFails?: string[];
}

function lightingRows(lighting: SceneLighting | undefined) {
  if (!lighting) return undefined;
  const rows: { key: string; value: string }[] = [
    { key: 'Brightness', value: String(lighting.brightness) },
    { key: 'ClockTime', value: String(lighting.clockTime) },
    {
      key: 'Ambient',
      value: lighting.ambient.map((n) => Math.round(n * 255)).join(', '),
    },
    { key: 'Light instances', value: String(lighting.lightInstances) },
  ];
  if (lighting.exposureCompensation !== undefined) {
    rows.push({ key: 'Exposure', value: String(lighting.exposureCompensation) });
  }
  if (lighting.fogEnd !== undefined) rows.push({ key: 'FogEnd', value: String(lighting.fogEnd) });
  rows.push({ key: 'Effects', value: lighting.effects.length > 0 ? lighting.effects.join(', ') : 'none' });
  return rows;
}

function viewEntry(view: RenderedView) {
  const src = rgbBase64ToPngDataUrl(view.rgbBase64, view.meta.width, view.meta.height);
  return {
    name: view.name,
    image: src ? { src, alt: `${view.name} view of the scene`, width: view.meta.width, height: view.meta.height } : undefined,
    coverage: view.meta.subjectCoverage,
    partsVisible: view.meta.partsVisible,
    partsOffCamera: view.meta.partsOffCamera,
    distinctColours: view.meta.distinctColours,
  };
}

/** A render, optionally with its critique, as an approved document. */
export function renderResultToDocument(result: RenderViewResult, critique?: CritiqueLike | null): ValidationResult {
  const blocks: unknown[] = [
    {
      type: 'render_review',
      subject: result.subject,
      summary: `Bounds ${result.boundsSize.map((n) => Math.round(n)).join(' × ')} studs · ${result.views.length} view${
        result.views.length === 1 ? '' : 's'
      }`,
      score: critique ? critique.score : undefined,
      passed: critique ? critique.passed : undefined,
      unavailable: critique?.unavailable,
      views: result.views.map(viewEntry),
      lighting: lightingRows(result.lighting),
    },
  ];
  if (critique) blocks.push(critiqueBlock(critique));
  return sanitizeDocument({ v: 1, blocks });
}

function critiqueBlock(critique: CritiqueLike) {
  return {
    type: 'visual_critique',
    score: critique.score,
    passed: critique.passed,
    unavailable: critique.unavailable,
    summary: critique.summary,
    hardFails: critique.hardFails,
    defects: critique.defects.map((d) => ({
      view: d.view,
      dimension: d.dimension,
      severity: d.severity,
      observed: d.observed,
      fix: d.fix,
    })),
  };
}

export function critiqueToDocument(critique: CritiqueLike): ValidationResult {
  return sanitizeDocument({ v: 1, blocks: [critiqueBlock(critique)] });
}

/** Two renders side by side — the before/after view the visual loop produces. */
export function comparisonToDocument(
  before: { label: string; result: RenderViewResult },
  after: { label: string; result: RenderViewResult },
  note?: string,
): ValidationResult {
  const pick = (result: RenderViewResult) => result.views.find((v) => v.name === 'hero') ?? result.views[0];
  const side = (label: string, result: RenderViewResult) => {
    const view = pick(result);
    const entry = view ? viewEntry(view) : undefined;
    return {
      label,
      image: entry?.image,
      stats: view
        ? [
            { key: 'Coverage', value: `${Math.round(view.meta.subjectCoverage * 100)}%` },
            { key: 'Parts visible', value: String(view.meta.partsVisible) },
            { key: 'Distinct colours', value: String(view.meta.distinctColours) },
          ]
        : undefined,
    };
  };
  return sanitizeDocument({
    v: 1,
    blocks: [
      {
        type: 'scene_comparison',
        title: 'Before and after',
        before: side(before.label, before.result),
        after: side(after.label, after.result),
        note,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Checkpoints and quota
// ---------------------------------------------------------------------------

const CHECKPOINT_KIND_LABEL: Record<CheckpointMeta['kind'], string> = {
  auto: 'auto',
  manual: 'manual',
  pre_agent: 'pre-run',
};

export function checkpointComparisonToDocument(left: CheckpointMeta, right: CheckpointMeta): ValidationResult {
  const side = (cp: CheckpointMeta) => ({
    label: `${cp.label} (${CHECKPOINT_KIND_LABEL[cp.kind]})`,
    when: new Date(cp.createdAt).toLocaleString(),
    scriptCount: cp.scriptCount,
    instanceCount: cp.instanceCount,
    sizeBytes: cp.sizeBytes,
  });
  const changes: { kind: 'added' | 'removed' | 'changed'; path: string; note: string }[] = [];
  const scriptDelta = right.scriptCount - left.scriptCount;
  const instanceDelta = right.instanceCount - left.instanceCount;
  if (scriptDelta !== 0) {
    changes.push({
      kind: scriptDelta > 0 ? 'added' : 'removed',
      path: 'Scripts',
      note: `${Math.abs(scriptDelta)} script${Math.abs(scriptDelta) === 1 ? '' : 's'} ${scriptDelta > 0 ? 'added' : 'removed'}`,
    });
  }
  if (instanceDelta !== 0) {
    changes.push({
      kind: instanceDelta > 0 ? 'added' : 'removed',
      path: 'Instances',
      note: `${Math.abs(instanceDelta)} instance${Math.abs(instanceDelta) === 1 ? '' : 's'} ${
        instanceDelta > 0 ? 'added' : 'removed'
      }`,
    });
  }
  if (changes.length === 0) changes.push({ kind: 'changed', path: 'Contents', note: 'Same counts, different snapshot' });
  return sanitizeDocument({
    v: 1,
    blocks: [{ type: 'checkpoint_comparison', left: side(left), right: side(right), changes }],
  });
}

export function quotaToDocument(quota: QuotaState, series?: { day: string; value: number }[]): ValidationResult {
  return sanitizeDocument({
    v: 1,
    blocks: [
      {
        type: 'usage_summary',
        title: "Today's Sparks",
        remaining: quota.sparksRemaining,
        dailyLimit: quota.sparksDaily,
        usedToday: quota.sparksUsedToday,
        plan: quota.plan,
        series: series?.slice(-30),
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Opportunistic mapping of a tool result payload
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function looksLikeRenderResult(v: unknown): v is RenderViewResult {
  return isObject(v) && typeof v['subject'] === 'string' && Array.isArray(v['views']);
}

function looksLikeCritique(v: unknown): v is CritiqueLike {
  return isObject(v) && 'passed' in v && Array.isArray(v['defects']) && typeof v['summary'] === 'string';
}

/**
 * Turn a `tool_end.detail` payload into a panel when we recognise its shape.
 * Anything unrecognised returns null and the tool row stays a plain summary —
 * we never guess at a rendering for data we do not understand.
 */
export function documentFromToolDetail(detail: unknown): ValidationResult | null {
  if (!isObject(detail)) return null;

  // Already a generative-UI document.
  if (detail['v'] === 1 && Array.isArray(detail['blocks'])) return sanitizeDocument(detail);

  // { render: RenderViewResult, critique?: VisualCritique }
  const render = detail['render'] ?? detail['result'] ?? (looksLikeRenderResult(detail) ? detail : null);
  const critique = detail['critique'] ?? (looksLikeCritique(detail) ? detail : null);
  if (looksLikeRenderResult(render)) {
    return renderResultToDocument(render, looksLikeCritique(critique) ? critique : null);
  }
  if (looksLikeCritique(critique)) return critiqueToDocument(critique);

  return null;
}

/** Convenience for callers that just want the document or nothing. */
export function documentOrNull(result: ValidationResult | null): UIDocument | null {
  return result && result.ok ? result.doc : null;
}
