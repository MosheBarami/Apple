// The automatic style checks of planning/STYLE-BIBLE.md §5 and §6, run before any critic: a piece that fails one is
// not sent to the critics (it fails anyway, and the critics cost money).
//
//   colour gate  the colour of each final screenshot, measured as the bible measured the references: the picture (or,
//                for a UI shot, the box the UI covers) shrunk to 160x90, then per pixel the HSV saturation; the mean, the
//                share of grey pixels (saturation < 0.15) and the share of vivid ones (saturation >= 0.5 and value >= 0.5).
//                Calibrated 2026-10-06 against the bible's table: the 27 reference images give medians 0.57 / 0.08 /
//                0.52, StudPilot's overview.jpg 0.07 / 0.93 and ui-1554x623.jpg 0.06 / 0.95.
//   reply rule   the reply makes no visual claim ("verified", "looks", "beautiful", "matches"): visual claims are the
//                critic's.
//   kit lint     read from the Studio check (scripts/eval/luau/kit-lint.luau): any finding fails.
//   layout lint  read from scripts/eval/luau/layout-lint.luau, run while each panel is shown: clipped, spilled or
//                colliding content, identical item icons, overflowing or tiny text, studs on a body, a price spelled
//                as a word. Any finding fails, and the critique protocol caps the scores it touches.

export const UI_FLOOR = { saturation: 0.45, grey: 0.35 };
export const WORLD_FLOOR = { saturation: 0.4, grey: 0.3, vivid: 0.3 };
export const VISUAL_CLAIM_WORDS = ['verified', 'looks', 'beautiful', 'matches'];

/** HSV saturation and value of an 8-bit RGB pixel. Pure. */
export function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return { s: max === 0 ? 0 : (max - min) / max, v: max / 255 };
}

/** The three measures of raw RGB pixels (3 bytes each). Pure. */
export function measurePixels(rgb) {
  let sum = 0;
  let grey = 0;
  let vivid = 0;
  const n = Math.floor(rgb.length / 3);
  for (let i = 0; i < n; i += 1) {
    const { s, v } = hsv(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    sum += s;
    if (s < 0.15) grey += 1;
    if (s >= 0.5 && v >= 0.5) vivid += 1;
  }
  return n ? { saturation: sum / n, grey: grey / n, vivid: vivid / n } : { saturation: 0, grey: 1, vivid: 0 };
}

/**
 * Measures one picture. `box` is [x0, y0, x1, y1] in the picture's own pixels (the UI area); without it the whole picture.
 * Needs sharp (a root devDependency).
 */
export async function measureImage(bytes, box = null) {
  const sharp = (await import('sharp')).default;
  let img = sharp(bytes).removeAlpha();
  if (box) {
    const meta = await sharp(bytes).metadata();
    const left = Math.max(0, Math.floor(box[0]));
    const top = Math.max(0, Math.floor(box[1]));
    const width = Math.min(meta.width - left, Math.ceil(box[2] - box[0]));
    const height = Math.min(meta.height - top, Math.ceil(box[3] - box[1]));
    if (width > 4 && height > 4) img = img.extract({ left, top, width, height });
  }
  const raw = await img.resize(160, 90, { fit: 'fill' }).raw().toBuffer();
  return measurePixels(raw);
}

/** Does one measured shot clear its floor? Pure. */
export function colourVerdict(kind, m) {
  const reasons = [];
  const f = kind === 'world' ? WORLD_FLOOR : UI_FLOOR;
  if (m.saturation < f.saturation) reasons.push(`mean saturation ${m.saturation.toFixed(2)} is below ${f.saturation}`);
  if (m.grey > f.grey) reasons.push(`grey share ${m.grey.toFixed(2)} is above ${f.grey}`);
  if (f.vivid !== undefined && m.vivid < f.vivid) reasons.push(`vivid share ${m.vivid.toFixed(2)} is below ${f.vivid}`);
  return { pass: reasons.length === 0, reasons };
}

/** The visual-claim words in a reply, as found. Pure. */
export function visualClaims(reply) {
  const found = [];
  for (const w of VISUAL_CLAIM_WORDS) {
    const m = new RegExp(`\\b${w}\\b`, 'i').exec(String(reply ?? ''));
    if (m) found.push(m[0]);
  }
  return found;
}

export function replyRule(reply) {
  const found = visualClaims(reply);
  return { pass: found.length === 0, reasons: found.map((w) => `the reply says "${w}"; visual claims are the critic's`) };
}

/** The kit lint result as a gate. Pure. */
export function kitLintGate(lint) {
  if (!lint || !Array.isArray(lint.findings)) return { pass: false, reasons: ['the kit lint did not run'] };
  const counts = lint.counts ?? {};
  const reasons = Object.entries(counts).map(([rule, n]) => `${n} ${rule}${lint.findings.find((f) => f.rule === rule) ? ` (e.g. ${lint.findings.find((f) => f.rule === rule).path})` : ''}`);
  return { pass: lint.findings.length === 0, reasons };
}

/** The layout lint's gate: every shown panel was measured, and none has a finding. Pure. */
export function layoutGate(panels) {
  if (!Array.isArray(panels) || !panels.length) return { pass: true, reasons: [], note: 'no panel shown' };
  const reasons = [];
  for (const p of panels) {
    if (p.error) reasons.push(`${p.file}: not measured (${p.error})`);
    for (const f of p.findings ?? []) reasons.push(`${p.file}: [${f.rule}] ${f.detail}`);
  }
  return { pass: reasons.length === 0, reasons };
}
