/**
 * A STUDDED map for a lane-defense idea, in the look of the owner's reference worlds (docs/ROBLOX-STYLE-SPEC.md and the
 * reference images of 2026-10-01): a raised grass island whose edge drops in BANDED rust cliffs into bright water, a
 * wide warm path with wooden curbs, dark soil plots in wooden frames with a sign, a gate the enemies come through, a sand
 * plaza at the base, a blue spawn pad. Every brick is Plastic; the composer's surface step then gives everything the
 * game is made of Resurface's classic studs on every face (surfaces.ts), so map, props and creatures share one surface.
 *
 * Built from parts on purpose: a studded world IS parts with studs (that is the style, not a stand-in for a model).
 * The props that would look poor as boxes (trees, barn, bushes, fences) come from the library (compose.ts).
 * Pure: the same layout and palette always give the same map. Names the systems read (Lanes, Plots, tiles tagged
 * AppleTile, OwnerName labels, Spawn) are kept exactly.
 *
 * A plot-simulator layout (hub-layout.ts: `layout.hub` present, `layout.lane` empty) gets a HUB instead of the gate, the
 * lane and the plaza: a stone plaza at the centre, a spoke road to every plot, a ShopPad and a SellPad. The island, the
 * water, the plots (Plots / Plot<n> / tiles tagged AppleTile / OwnerName) and the Spawn are the same pieces.
 */
import type { InstanceSpecLite, Layout, P2 } from './compose';
import { MOODS } from './worldbuilding';

export interface StudPalette {
  grass: string; grassLight: string; path: string; curb: string; soil: string; soilDark: string; frame: string;
  cliff: string; cliffDark: string; water: string; sand: string; gate: string; banner: string; spawn: string;
}

/** The style spec's palette (grass #5FC94A-#7ED957, path #C98A4B-#E0A45C, rust cliffs #B5533A/#8E3F2E, trunk/fence #7A5230-#96683E). */
export const STUD_PALETTE: StudPalette = {
  grass: '#62c94a', grassLight: '#9be35a', path: '#e0a45c', curb: '#8e5b32', soil: '#7a4a2a', soilDark: '#5e381f', frame: '#96683e',
  cliff: '#b5533a', cliffDark: '#8e3f2e', water: '#2fa6ea', sand: '#e8d3a9', gate: '#7a5230', banner: '#e5484d', spawn: '#4fc3ff',
};

const enumOf = (kind: string, item: string) => ({ t: 'EnumItem', v: `Enum.${kind}.${item}` });

/** A brick: Plastic and anchored (studded with everything else by the composer's surface step). */
export function brick(name: string, size: V3, at: V3, colour: string, opts: { faces?: string[]; collide?: boolean; extra?: Record<string, unknown>; attributes?: Record<string, string | number | boolean>; children?: InstanceSpecLite[] } = {}): InstanceSpecLite {
  return {
    className: 'Part', name,
    props: { Size: size, Position: at, Anchored: true, Color: colour, Material: 'Plastic', TopSurface: 'Smooth', BottomSurface: 'Smooth', ...(opts.collide === false ? { CanCollide: false } : {}), ...opts.extra },
    ...(opts.attributes ? { attributes: opts.attributes } : {}),
    ...(opts.children?.length ? { children: opts.children } : {}),
  };
}

type V3 = [number, number, number];

const SIDES = ['Top', 'Front', 'Back', 'Left', 'Right'];

/** An invisible marker on a plot's hub side, turned to face the hub. Pure. */
function plotSpawn([px, pz]: P2, [hx, hz]: P2, plotHalf: number): InstanceSpecLite {
  const len = Math.hypot(hx - px, hz - pz) || 1;
  const [ux, uz] = [(hx - px) / len, (hz - pz) / len];
  const at: [number, number, number] = [Math.round((px + ux * (plotHalf - 2)) * 10) / 10, 1.5, Math.round((pz + uz * (plotHalf - 2)) * 10) / 10];
  return { className: 'Part', name: 'Spawn', props: {
    Size: [2, 1, 2], Position: at, Orientation: [0, Math.round(Math.atan2(-ux, -uz) * 1800 / Math.PI) / 10, 0], Anchored: true,
    Transparency: 1, CanCollide: false, CanQuery: false, CanTouch: false,
  } };
}

/** A sign: a post and a board with big white outlined words on both faces. `label` names the TextLabel (OwnerName on plots). */
export function sign(name: string, at: P2, facing: 'x' | 'z', text: string, colour: string, label = 'Words'): InstanceSpecLite {
  const board: V3 = facing === 'z' ? [9, 3.6, 0.8] : [0.8, 3.6, 9];
  const words = (face: string): InstanceSpecLite => ({
    className: 'SurfaceGui', name: `Face${face}`,
    props: { Face: enumOf('NormalId', face), SizingMode: enumOf('SurfaceGuiSizingMode', 'PixelsPerStud'), PixelsPerStud: 40, LightInfluence: 0 },
    children: [{
      className: 'TextLabel', name: label,
      props: { Size: { t: 'UDim2', v: [1, -20, 1, -16] }, Position: { t: 'UDim2', v: [0, 10, 0, 8] }, BackgroundTransparency: 1, Text: text, TextScaled: true, Font: enumOf('Font', 'FredokaOne'), TextColor3: '#ffffff' },
      children: [{ className: 'UIStroke', name: 'Outline', props: { Color: '#111111', Thickness: 4 } }],
    }],
  });
  const faces = facing === 'z' ? ['Front', 'Back'] : ['Left', 'Right'];
  return {
    className: 'Model', name,
    children: [
      brick('Post', [1, 5, 1], [at[0], 2.5, at[1]], STUD_PALETTE.gate, { faces: SIDES }),
      brick('Board', board, [at[0], 6.2, at[1]], colour, { faces: ['Top'], children: faces.map(words) }),
    ],
  };
}

export interface MapInput {
  layout: Layout; tile: number; plotTiles: (c: P2) => P2[]; plotHalf: number; laneWidth: number;
  words: { gate?: string; base?: string; plot?: string; shop?: string; sell?: string };
  seed: () => number;
}

/** Every child of Workspace.AppleMap. */
export function studdedMap(input: MapInput, pal: StudPalette = STUD_PALETTE): InstanceSpecLite[] {
  const { layout, laneWidth } = input;
  const r = input.seed;
  const [gcx, gcz] = layout.ground.center, [gsx, gsz] = layout.ground.size;
  const items: InstanceSpecLite[] = [];
  // A hub map (hub-layout.ts) has no lane; its plots may be bigger or smaller than the composer's default.
  const hub = layout.hub && layout.lane.length === 0 ? layout.hub : null;
  const plotTilesOf: (c: P2) => P2[] = hub ? gridTiles(layout.plotTiles ?? Math.round((input.plotHalf * 2) / input.tile), input.tile) : input.plotTiles;
  const plotHalf = hub ? ((layout.plotTiles ?? Math.round((input.plotHalf * 2) / input.tile)) * input.tile) / 2 : input.plotHalf;

  // The island: grass on top, three banded cliff steps below it, each wider, down into the water.
  const island: InstanceSpecLite[] = [brick('Grass', [gsx, 2, gsz], [gcx, -1, gcz], pal.grass, { faces: SIDES })];
  const bands: [number, string][] = [[3, pal.cliff], [6, pal.cliffDark], [9, pal.cliff]];
  bands.forEach(([out, colour], k) => {
    island.push(brick(`Cliff${k + 1}`, [gsx + out * 2, 5, gsz + out * 2], [gcx, -4.5 - k * 5, gcz], colour, { faces: SIDES }));
  });
  // Lighter grass terraces: low studded steps that break the flat ground, away from the lane, the plots and the spawn.
  const free = (p: P2, room: number) => !layout.plots.some(([x, z]) => Math.abs(p[0] - x) < plotHalf + room && Math.abs(p[1] - z) < plotHalf + room)
    && Math.hypot(p[0] - layout.spawn[0], p[1] - layout.spawn[1]) > room + 8
    && (!hub || (Math.max(Math.abs(p[0] - hub.center[0]), Math.abs(p[1] - hub.center[1])) >= hub.radius + 2 + room
      && !hub.spokes.some((sp) => sp.slice(1).some((b, k) => flatDist(p, sp[k]!, b) < laneWidth / 2 + room))));
  let terraces = 0;
  // A hub map has library scenery instead (compose-plotsim.ts decor): the owner read the bare slabs as junk.
  for (let tries = 0; terraces < (hub ? 0 : 9) && tries < 400; tries++) {
    const w = 14 + Math.round(r() * 14), d = 14 + Math.round(r() * 14), h = r() < 0.5 ? 1 : 2;
    const p: P2 = [Math.round(gcx - gsx / 2 + w / 2 + r() * (gsx - w)), Math.round(gcz - gsz / 2 + d / 2 + r() * (gsz - d))];
    let clear = free(p, Math.max(w, d) / 2 + 2);
    for (let i = 0; clear && i < layout.lane.length - 1; i++) {
      const [a, b] = [layout.lane[i]!, layout.lane[i + 1]!];
      const lo = [Math.min(a[0], b[0]) - laneWidth, Math.min(a[1], b[1]) - laneWidth], hi = [Math.max(a[0], b[0]) + laneWidth, Math.max(a[1], b[1]) + laneWidth];
      if (p[0] + w / 2 > lo[0]! && p[0] - w / 2 < hi[0]! && p[1] + d / 2 > lo[1]! && p[1] - d / 2 < hi[1]!) clear = false;
    }
    if (!clear) continue;
    terraces++;
    island.push(brick(`Terrace${terraces}`, [w, h, d], [p[0], h / 2, p[1]], pal.grassLight, { faces: SIDES }));
  }
  items.push({ className: 'Model', name: 'Island', children: island });
  items.push(brick('Water', [900, 2, 900], [gcx, -12, gcz], pal.water, { extra: { Transparency: 0.15, CanCollide: false } }));

  if (hub) {
    items.push(...hubItems(hub, laneWidth, input.words, pal));
  } else {
    items.push({ className: 'Model', name: 'Road', children: roadPieces(layout.lane, laneWidth, pal) });
    items.push({ className: 'Folder', name: 'Lanes', children: [{ className: 'Folder', name: 'Lane1', children: layout.lane.map(([x, z], i) => ({
      className: 'Part', name: String(i + 1), props: { Size: [2, 1, 2], Position: [x, 1.5, z], Anchored: true, Transparency: 1, CanCollide: false, CanQuery: false },
    })) }] });

    // The gate the enemies come through, and the plaza the base stands on.
    const [g0x, g0z] = layout.lane[0]!;
    const half = laneWidth / 2 + 2;
    items.push({ className: 'Model', name: 'Gate', children: [
      brick('PillarA', [3, 16, 3], [g0x - half, 8, g0z], pal.gate, { faces: SIDES }),
      brick('PillarB', [3, 16, 3], [g0x + half, 8, g0z], pal.gate, { faces: SIDES }),
      brick('Beam', [half * 2 + 6, 3, 4], [g0x, 17.5, g0z], pal.banner, { faces: SIDES, children: ['Front', 'Back'].map((face) => ({
        className: 'SurfaceGui', name: `Face${face}`,
        props: { Face: enumOf('NormalId', face), SizingMode: enumOf('SurfaceGuiSizingMode', 'PixelsPerStud'), PixelsPerStud: 40, LightInfluence: 0 },
        children: [{ className: 'TextLabel', name: 'Words', props: { Size: { t: 'UDim2', v: [1, -20, 1, -10] }, Position: { t: 'UDim2', v: [0, 10, 0, 5] }, BackgroundTransparency: 1, Text: (input.words.gate ?? 'Enemy Gate').toUpperCase(), TextScaled: true, Font: enumOf('Font', 'FredokaOne'), TextColor3: '#ffffff' },
          children: [{ className: 'UIStroke', name: 'Outline', props: { Color: '#111111', Thickness: 4 } }] }],
      })) }),
      brick('CapA', [4, 1.5, 4], [g0x - half, 16.75, g0z], pal.cliffDark, { faces: SIDES }),
      brick('CapB', [4, 1.5, 4], [g0x + half, 16.75, g0z], pal.cliffDark, { faces: SIDES }),
    ] });
    const end = layout.lane[layout.lane.length - 1]!;
    items.push(brick('Plaza', [34, 0.5, 30], [end[0], 0.25, end[1] + 12], pal.sand, { collide: true }));
  }

  // Plots: a wooden frame, dark soil tiles (alternating), and a sign with the owner's name.
  items.push({ className: 'Folder', name: 'Plots', children: layout.plots.map(([px, pz], n) => {
    let signAt: P2, signFacing: 'x' | 'z';
    if (hub) {
      // On the side away from the hub, where no spoke comes in.
      const [dx, dz] = [px - hub.center[0], pz - hub.center[1]];
      if (Math.abs(dx) >= Math.abs(dz)) { signAt = [px + (dx < 0 ? -1 : 1) * (plotHalf + 2.5), pz]; signFacing = 'x'; }
      else { signAt = [px, pz + (dz < 0 ? -1 : 1) * (plotHalf + 2.5)]; signFacing = 'z'; }
    } else {
      const toLane = nearestLaneSide([px, pz], layout.lane);
      signAt = toLane === 'x' ? [px, pz + (plotHalf + 2.5) * (pz > 0 ? 1 : -1)] : [px + (plotHalf + 2.5) * (px > 0 ? 1 : -1), pz];
      signFacing = toLane === 'x' ? 'z' : 'x';
    }
    return {
      className: 'Model', name: `Plot${n + 1}`,
      children: [
        brick('Frame', [plotHalf * 2 + 2, 0.8, plotHalf * 2 + 2], [px, 0.4, pz], pal.frame, { faces: SIDES }),
        ...plotTilesOf([px, pz]).map(([tx, tz], i) => brick(`Tile${i + 1}`, [input.tile - 0.6, 1, input.tile - 0.6], [tx, 0.7, tz], i % 2 === 0 ? pal.soil : pal.soilDark, { attributes: { AppleTags: 'AppleTile' } })),
        sign('Sign', signAt, signFacing, input.words.plot ?? 'Free plot', pal.frame, 'OwnerName'),
        // Where its owner appears (AppleShop sends a player to their plot's Spawn): on the hub side, facing the hub, so
        // a player starts on their own base with the hub in view (live 2026-10-01: everyone spawned on the hub and no
        // one could tell which plot was theirs).
        ...(hub ? [plotSpawn([px, pz], hub.center, plotHalf)] : []),
      ],
    };
  }) });

  // The spawn: a bright studded pad.
  items.push({ className: 'SpawnLocation', name: 'Spawn', props: { Size: [10, 1, 10], Position: [layout.spawn[0], 0.5, layout.spawn[1]], Anchored: true, Color: pal.spawn, Material: 'Plastic', TopSurface: 'Smooth' } });

  // Painted guidance (never floating arrows): yellow chevrons on the grass from the spawn to the nearest plot, so the
  // first thing to do is obvious from the first second (docs/research/roblox-games/2026-09-25-direct-play.md).
  const [sx, sz] = layout.spawn;
  const target = hub ? undefined : [...layout.plots].sort((a, b) => Math.hypot(a[0] - sx, a[1] - sz) - Math.hypot(b[0] - sx, b[1] - sz))[0];
  if (target) {
    const dx = target[0] - sx, dz = target[1] - sz;
    const dist = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz) * 180 / Math.PI;
    const arrows: InstanceSpecLite[] = [];
    for (let k = 1, d = 9; d < dist - input.plotHalf - 3; d += 7, k++) {
      const [cx, cz] = [sx + dx * d / dist, sz + dz * d / dist];
      for (const side of [-1, 1]) {
        // Two bars meeting at the tip make one chevron pointing along (dx, dz).
        const ang = yaw + side * 135;
        const off: P2 = [Math.sin(ang * Math.PI / 180) * 1.6, Math.cos(ang * Math.PI / 180) * 1.6];
        arrows.push(brick(`Chevron${k}${side < 0 ? 'a' : 'b'}`, [1.2, 0.3, 4.2], [cx + off[0], 0.15, cz + off[1]], '#ffd633', { collide: false, extra: { Orientation: [0, Math.round(ang), 0] } }));
      }
    }
    items.push({ className: 'Model', name: 'Guide', children: arrows });
  }
  return items;
}

/**
 * The path, as pieces that never overlap (overlapping bricks flicker and show doubled studs): a square at every
 * waypoint, a straight stretch between neighbours, and wooden curbs along the stretches and on the closed sides of each
 * corner square, so no curb ever crosses the road. Exported for its tests.
 */
export function roadPieces(lane: P2[], laneWidth: number, pal: Pick<StudPalette, 'path' | 'curb'>): InstanceSpecLite[] {
  const half = laneWidth / 2;
  const out: InstanceSpecLite[] = [];
  const unit = (a: P2, b: P2): P2 => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [Math.round((b[0] - a[0]) / d), Math.round((b[1] - a[1]) / d)]; };
  lane.forEach(([x, z], i) => {
    out.push(brick(`Corner${i + 1}`, [laneWidth, 0.4, laneWidth], [x, 0.2, z], pal.path, { collide: false }));
    // The square's open sides face its neighbours; the others get a curb.
    const open = [i > 0 ? unit(lane[i]!, lane[i - 1]!) : null, i < lane.length - 1 ? unit(lane[i]!, lane[i + 1]!) : null].filter(Boolean) as P2[];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as P2[]) {
      if (open.some(([ox, oz]) => ox === dx && oz === dz)) continue;
      // The first and last squares stay open at their far end too (the gate and the base).
      if ((i === 0 || i === lane.length - 1) && open.length === 1 && open[0]![0] === -dx && open[0]![1] === -dz) continue;
      out.push(brick(`Corner${i + 1}Curb${dx}${dz}`, dx !== 0 ? [1, 0.8, laneWidth + 2] : [laneWidth + 2, 0.8, 1],
        [x + dx * (half + 0.5), 0.4, z + dz * (half + 0.5)], pal.curb));
    }
  });
  for (let i = 0; i < lane.length - 1; i++) {
    const [ax, az] = lane[i]!, [bx, bz] = lane[i + 1]!;
    const span = Math.hypot(bx - ax, bz - az) - laneWidth; // between the two squares
    if (span <= 0.01) continue;
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const [cx, cz] = [(ax + bx) / 2, (az + bz) / 2];
    out.push(brick(`Road${i + 1}`, along ? [span, 0.4, laneWidth] : [laneWidth, 0.4, span], [cx, 0.2, cz], pal.path, { collide: false }));
    for (const side of [-1, 1]) {
      const off = side * (half + 0.5);
      out.push(brick(`Curb${i + 1}${side < 0 ? 'a' : 'b'}`, along ? [span, 0.8, 1] : [1, 0.8, span], along ? [cx, 0.4, cz + off] : [cx + off, 0.4, cz], pal.curb));
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the hub

/** Distance from p to segment ab on the ground plane (compose.ts segDist, kept here so this file imports no values from it). */
function flatDist(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** Every tile centre of a square plot of `size` x `size` tiles (compose.ts plotTiles, for a plot of any size). */
function gridTiles(size: number, tile: number): (c: P2) => P2[] {
  return (c) => {
    const out: P2[] = [];
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) out.push([c[0] + (i - (size - 1) / 2) * tile, c[1] + (j - (size - 1) / 2) * tile]);
    return out;
  };
}

/** The hub's own colours: a cool stone that no lane map uses, so the middle of the world reads at a glance. */
// A warm sand plaza with the tan roads and the yellow stage (the cold blue-violet clashed with both: owner's screenshots).
export const HUB_COLOURS = { plaza: '#f0dcae', inlay: '#fff1cf', shop: '#3ddc5f', sell: '#ff9f1a', rebirth: '#a46bff' };
/** A pad is this many studs on a side (hub-layout.ts PAD). */
const PAD_SIZE = 10;

/** A flat pad on the hub with big words on its top face: stepping on it is how the game opens the shop or sells. */
function pad(name: string, at: P2, colour: string, text: string): InstanceSpecLite {
  return brick(name, [PAD_SIZE, 0.6, PAD_SIZE], [at[0], 1.1, at[1]], colour, {
    collide: false, children: [{
      className: 'SurfaceGui', name: 'FaceTop',
      props: { Face: enumOf('NormalId', 'Top'), SizingMode: enumOf('SurfaceGuiSizingMode', 'PixelsPerStud'), PixelsPerStud: 40, LightInfluence: 0 },
      children: [{
        className: 'TextLabel', name: 'Words',
        props: { Size: { t: 'UDim2', v: [1, -24, 0.5, 0] }, Position: { t: 'UDim2', v: [0.5, 0, 0.5, 0] }, AnchorPoint: { t: 'Vector2', v: [0.5, 0.5] }, BackgroundTransparency: 1, Text: text.toUpperCase(), TextScaled: true, Font: enumOf('Font', 'FredokaOne'), TextColor3: '#ffffff' },
        children: [{ className: 'UIStroke', name: 'Outline', props: { Color: '#111111', Thickness: 4 } }],
      }],
    }],
  });
}

/**
 * What a hub map draws instead of a gate and a plaza: the stone plaza (on a wooden rim, with an inlay where the hero
 * stands), a straight road to every plot, and the ShopPad and the SellPad. The pads are named exactly so the game's
 * scripts find them.
 */
function hubItems(hub: NonNullable<Layout['hub']>, laneWidth: number, words: MapInput['words'], pal: StudPalette): InstanceSpecLite[] {
  const [cx, cz] = hub.center;
  const side = hub.radius * 2;
  return [
    {
      className: 'Model', name: 'Hub', children: [
        brick('HubRim', [side + 3, 0.3, side + 3], [cx, 0.15, cz], pal.curb),
        brick('Plaza', [side, 0.8, side], [cx, 0.4, cz], HUB_COLOURS.plaza, { faces: SIDES }),
        brick('Inlay', [side * 0.36, 0.1, side * 0.36], [hub.heroSpot[0], 0.85, hub.heroSpot[1]], HUB_COLOURS.inlay, { collide: false }),
      ],
    },
    { className: 'Model', name: 'Road', children: spokePieces(hub.spokes, laneWidth, pal) },
    pad('ShopPad', hub.shopPad, HUB_COLOURS.shop, words.shop ?? 'Shop'),
    // The REBIRTH pad wears the Rebirth button's purple.
    pad('SellPad', hub.sellPad, /rebirth/i.test(words.sell ?? '') ? HUB_COLOURS.rebirth : HUB_COLOURS.sell, words.sell ?? 'Sell'),
  ];
}

/**
 * A road of straight spokes at any angle: for every stretch one road brick and a curb on each side, turned about the
 * vertical so its length runs along the stretch. The curbs are lower than the hub's plaza and the plots' frames (both
 * 0.8), so where a spoke meets them the corners of its end are hidden under them instead of flickering. Exported for its tests.
 */
export function spokePieces(spokes: P2[][], laneWidth: number, pal: Pick<StudPalette, 'path' | 'curb'>): InstanceSpecLite[] {
  const out: InstanceSpecLite[] = [];
  const half = laneWidth / 2;
  spokes.forEach((spoke, i) => {
    for (let k = 0; k < spoke.length - 1; k++) {
      const [ax, az] = spoke[k]!, [bx, bz] = spoke[k + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len <= 0.01) continue;
      const [cx, cz] = [(ax + bx) / 2, (az + bz) / 2];
      const yaw = Math.round(Math.atan2(bx - ax, bz - az) * 18000 / Math.PI) / 100; // a part's length runs along its own Z
      const [nx, nz] = [(bz - az) / len, -(bx - ax) / len];                         // the unit across the road
      const turned = { Orientation: [0, yaw, 0] };
      const tag = spoke.length > 2 ? `${i + 1}_${k + 1}` : `${i + 1}`;
      out.push(brick(`Spoke${tag}`, [laneWidth, 0.4, len], [cx, 0.2, cz], pal.path, { collide: false, extra: turned }));
      for (const [side, mark] of [[-1, 'a'], [1, 'b']] as const) {
        const off = side * (half + 0.5);
        out.push(brick(`Spoke${tag}Curb${mark}`, [1, 0.6, len], [cx + nx * off, 0.3, cz + nz * off], pal.curb, { extra: turned }));
      }
    }
  });
  return out;
}

/** Which axis a plot's nearest lane stretch runs along, so its sign faces the road. */
function nearestLaneSide(p: P2, lane: P2[]): 'x' | 'z' {
  let best = Infinity, axis: 'x' | 'z' = 'x';
  for (let i = 0; i < lane.length - 1; i++) {
    const [a, b] = [lane[i]!, lane[i + 1]!];
    const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const d = Math.hypot(p[0] - mid[0], p[1] - mid[1]);
    if (d < best) { best = d; axis = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 'x' : 'z'; }
  }
  return axis;
}

/** The lighting of a studded game: worldbuilding.ts MOODS.studded (the owner's lighting tutorial), as composer steps. */
export function studLighting(): { props: Record<string, unknown>; effects: InstanceSpecLite[] } {
  const m = MOODS.studded!;
  const hex = (c: readonly number[]) => '#' + c.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m.scriptable)) props[k] = Array.isArray(v) ? hex(v) : v;
  const effects: InstanceSpecLite[] = [
    { className: 'Atmosphere', name: 'AppleAtmosphere', props: { ...m.atmosphere, Color: hex(m.atmosphere.Color), Decay: hex(m.atmosphere.Decay) } },
    { className: 'ColorCorrectionEffect', name: 'AppleColour', props: { ...m.colorCorrection, TintColor: hex(m.colorCorrection.TintColor) } },
    { className: 'BloomEffect', name: 'AppleBloom', props: { ...m.bloom } },
  ];
  if (m.sunRays) effects.push({ className: 'SunRaysEffect', name: 'AppleSunRays', props: { ...m.sunRays } });
  return { props, effects };
}
