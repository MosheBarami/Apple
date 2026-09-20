#!/usr/bin/env node
/**
 * DRAW THE MAP THE MODEL BUILT, AS A PLAN, FROM THE PARTS IT ACTUALLY CREATED.
 *
 * The owner asked to see game maps alongside the UI. A map in Roblox is a tree of BaseParts with a
 * Size and a Position, so the honest picture of one — without a renderer, a camera or a single
 * upload to his account — is an architect's plan: look straight down, draw every part's footprint
 * at its real coordinates and real colour, and shade by height.
 *
 * THE THREE THINGS THIS CANNOT SEE, each counted rather than guessed, because a plan that silently
 * omits a third of the map is worse than no plan:
 *
 *   unplaceable   the part's Position was never set, or was set through CFrame. `ui-harness.luau`
 *                 models CFrame as opaque — it does not do the matrix arithmetic — so a part placed
 *                 by CFrame has no coordinates HERE. That is this process's gap, not the model's
 *                 mistake, and it is reported as its own number so nobody reads it as a defect in
 *                 the generated map.
 *   unsized       no Size, so there is no footprint to draw.
 *   unknownColour a BrickColor rather than a Color3. BrickColor is a named palette this harness
 *                 does not carry, so the part is drawn in a flat neutral and counted. Inventing the
 *                 colour would make the picture prettier and less true.
 *
 * Rotation is NOT modelled. Orientation and CFrame angles are ignored, so every footprint is drawn
 * axis-aligned. A rotated wall appears as its unrotated footprint. `note` says so on every output.
 */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Every class that has a Size and a Position and therefore occupies space in a plan. */
export const PART_CLASSES = new Set([
  'Part', 'MeshPart', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'UnionOperation', 'SpawnLocation', 'Seat', 'VehicleSeat',
]);

const vec3 = (node, name) => {
  const v = node.props?.[name];
  return v && v.k === 'Vector3' ? { x: v.x, y: v.y, z: v.z } : null;
};
const color3 = (node, name) => {
  const v = node.props?.[name];
  if (!v || v.k !== 'Color3') return null;
  const to255 = (c) => Math.max(0, Math.min(255, Math.round((Number(c) || 0) * 255)));
  return `rgb(${to255(v.r)},${to255(v.g)},${to255(v.b)})`;
};
const strProp = (node, name, fallback = '') => {
  const v = node.props?.[name];
  return v && v.k === 'str' ? v.v : fallback;
};

/** Collect the drawable parts out of a flat node list, with the three refusals counted. */
export function collectParts(nodes) {
  const parts = [];
  let unplaceable = 0;
  let unsized = 0;
  let unknownColour = 0;
  for (const n of nodes) {
    if (!PART_CLASSES.has(n.class)) continue;
    const size = vec3(n, 'Size');
    const pos = vec3(n, 'Position');
    if (!size) { unsized += 1; continue; }
    if (!pos) { unplaceable += 1; continue; }
    const colour = color3(n, 'Color');
    if (!colour) unknownColour += 1;
    parts.push({
      id: n.id,
      class: n.class,
      name: strProp(n, 'Name', n.class),
      size,
      pos,
      colour: colour ?? '#6f6f78',
      isSpawn: n.class === 'SpawnLocation',
    });
  }
  return { parts, unplaceable, unsized, unknownColour };
}

/**
 * Top-down plan. X runs left to right; Z runs top to bottom, which is how Roblox's own top view
 * reads. Parts are painted low-to-high so a roof covers the floor beneath it, exactly as looking
 * down would.
 */
export function renderMapPlan({ parts, width = 1600, height = 900, background = '#0d0f12', title = '' }) {
  if (!parts.length) {
    return { svg: null, reason: 'no part carried both a Size and a Position, so there is nothing to draw' };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of parts) {
    minX = Math.min(minX, p.pos.x - p.size.x / 2);
    maxX = Math.max(maxX, p.pos.x + p.size.x / 2);
    minZ = Math.min(minZ, p.pos.z - p.size.z / 2);
    maxZ = Math.max(maxZ, p.pos.z + p.size.z / 2);
    minY = Math.min(minY, p.pos.y);
    maxY = Math.max(maxY, p.pos.y);
  }
  const pad = 40;
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanZ);
  const ox = pad + ((width - pad * 2) - spanX * scale) / 2;
  const oz = pad + ((height - pad * 2) - spanZ * scale) / 2;
  const sx = (x) => ox + (x - minX) * scale;
  const sz = (z) => oz + (z - minZ) * scale;

  // Height shading: the lowest part keeps its colour, the highest is lifted toward white, so a plan
  // reads as a plan rather than as a pile of overlapping rectangles. The rule is stated here so the
  // brightness is never mistaken for a colour the model chose.
  const ySpan = Math.max(1, maxY - minY);
  const lift = (p) => 0.08 + 0.34 * ((p.pos.y - minY) / ySpan);

  const parts2 = [...parts].sort((a, b) => a.pos.y - b.pos.y || a.id - b.id);
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
      `font-family="'Helvetica Neue',Arial,sans-serif">`,
    `<rect width="${width}" height="${height}" fill="${background}"/>`,
  ];

  // A 32-stud grid, so the plan carries a scale a reader can count in.
  const step = 32;
  for (let gx = Math.ceil(minX / step) * step; gx <= maxX; gx += step) {
    out.push(`<line x1="${sx(gx).toFixed(1)}" y1="${sz(minZ).toFixed(1)}" x2="${sx(gx).toFixed(1)}" y2="${sz(maxZ).toFixed(1)}" stroke="#1b1f26" stroke-width="1"/>`);
  }
  for (let gz = Math.ceil(minZ / step) * step; gz <= maxZ; gz += step) {
    out.push(`<line x1="${sx(minX).toFixed(1)}" y1="${sz(gz).toFixed(1)}" x2="${sx(maxX).toFixed(1)}" y2="${sz(gz).toFixed(1)}" stroke="#1b1f26" stroke-width="1"/>`);
  }

  for (const p of parts2) {
    const x = sx(p.pos.x - p.size.x / 2);
    const y = sz(p.pos.z - p.size.z / 2);
    const w = Math.max(1, p.size.x * scale);
    const h = Math.max(1, p.size.z * scale);
    out.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" ` +
        `fill="${p.colour}" fill-opacity="0.92" stroke="#ffffff" stroke-opacity="${lift(p).toFixed(2)}" stroke-width="1"/>`,
    );
    if (p.isSpawn) {
      // A spawn is the one thing a reader looks for first, so it is marked rather than left to be
      // found among identical rectangles.
      const cx = sx(p.pos.x);
      const cy = sz(p.pos.z);
      out.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7" fill="none" stroke="#5ee08a" stroke-width="2.5"/>`);
      out.push(`<text x="${cx.toFixed(1)}" y="${(cy - 12).toFixed(1)}" text-anchor="middle" font-size="11" fill="#5ee08a">SPAWN</text>`);
    }
  }

  const studsWide = Math.round(spanX);
  const studsDeep = Math.round(spanZ);
  out.push(
    `<text x="${pad}" y="${height - 16}" font-size="13" fill="#7e8792">` +
      esc(`${title ? `${title} — ` : ''}${parts.length} parts · ${studsWide} x ${studsDeep} studs · height ${Math.round(minY)} to ${Math.round(maxY)} · plan view, rotation not modelled`) +
      `</text>`,
  );
  out.push('</svg>');
  return {
    svg: out.join('\n'),
    bounds: { minX, maxX, minZ, maxZ, minY, maxY, studsWide, studsDeep },
    drawn: parts2.length,
  };
}
