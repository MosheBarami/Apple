/**
 * VISUAL EVIDENCE FOR THE AGENT'S OWN MODEL (handoff 2026-10-09, part VI section 9).
 *
 * Frames a render_view call produced (the native Studio viewport and the software views of a target) become PNG images
 * the Studio agent passes to its model as image input (apps/studio agent.ts). Before this, frames reached only the
 * person's screen and the model was told "never sent to a model", so nothing it said about how a build looked rested on
 * pixels. Only rgb24 and png frames are accepted; anything else is dropped rather than guessed.
 */
import type { StudioFrame } from '@studpilot/shared';
import { toBase64 } from './image-gen.ts';
import { decodeRgbBase64, encodePng } from './png.ts';

export interface EvidenceImage {
  mediaType: 'image/png';
  base64: string;
  width: number;
  height: number;
  /** studio_viewport, or the software view's name (hero, front, ...). */
  label: string;
}

/** At most this many images per call: each one is paid as input on the step that sees it. */
export const MAX_EVIDENCE_IMAGES = 3;

export async function framesToImages(frames: readonly StudioFrame[]): Promise<EvidenceImage[]> {
  // The native viewport first: it is what the person sees in Studio, lighting and effects included.
  const ordered = [...frames].sort((a, b) => Number(b.source === 'studio_viewport') - Number(a.source === 'studio_viewport'));
  const out: EvidenceImage[] = [];
  for (const f of ordered) {
    if (out.length >= MAX_EVIDENCE_IMAGES) break;
    if (!f.rgbBase64 || !Number.isInteger(f.width) || !Number.isInteger(f.height) || f.width < 1 || f.height < 1) continue;
    const label = f.source === 'studio_viewport' ? 'studio_viewport' : String(f.view ?? 'view');
    if (f.encoding === 'png') {
      out.push({ mediaType: 'image/png', base64: f.rgbBase64, width: f.width, height: f.height, label });
      continue;
    }
    if ((f.encoding ?? 'rgb24') !== 'rgb24') continue;
    try {
      const png = await encodePng(decodeRgbBase64(f.rgbBase64), f.width, f.height);
      out.push({ mediaType: 'image/png', base64: toBase64(png), width: f.width, height: f.height, label });
    } catch {
      // a frame whose bytes do not match its size is not evidence
    }
  }
  return out;
}
