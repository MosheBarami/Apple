/**
 * A STUDDED map for a lane-defense idea, in the look of the owner's reference worlds (docs/ROBLOX-STYLE-SPEC.md and the
 * reference images of 2026-10-01): a raised grass island whose edge drops in BANDED rust cliffs into bright water, a
 * wide warm path with wooden curbs, dark soil plots in wooden frames with a sign, a gate the enemies come through, a sand
 * plaza at the base, a blue spawn pad, and the stud texture on every surface (the same public tile the studded GUI uses).
 *
 * Built from parts on purpose: a studded world IS parts with studs (that is the style, not a stand-in for a model).
 * The props that would look poor as boxes (trees, barn, bushes, fences) come from the library (compose.ts).
 * Pure: the same layout and palette always give the same map. Names the systems read (Lanes, Plots, tiles tagged
 * AppleTile, OwnerName labels, Spawn) are kept exactly.
 */
import type { InstanceSpecLite, Layout, P2 } from './compose';
import { STUD_IMAGE } from './stud-ui';

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

/** How many studs one stud image covers (the tile is a 4 x 4 grid of studs, so a stud is one stud wide, like a classic brick). */
export const STUDS_PER_TILE = 4;

type V3 = [number, number, number];

/** The stud texture on the faces of a part, tinted by the part's colour so the studs read as part of the brick. */
export function studs(colour: string, faces: string[] = ['Top']): InstanceSpecLite[] {
  return faces.map((face) => ({
    className: 'Texture', name: `Studs${face}`,
    props: { Texture: STUD_IMAGE, Face: enumOf('NormalId', face), StudsPerTileU: STUDS_PER_TILE, StudsPerTileV: STUDS_PER_TILE, Color3: colour, Transparency: 0 },
  }));
}

/** A studded brick: plastic, anchored, studs on the faces given. */
export function brick(name: string, size: V3, at: V3, colour: string, opts: { faces?: string[]; collide?: boolean; extra?: Record<string, unknown>; attributes?: Record<string, string | number | boolean>; children?: InstanceSpecLite[] } = {}): InstanceSpecLite {
  return {
    className: 'Part', name,
    props: { Size: size, Position: at, Anchored: true, Color: colour, Material: 'Plastic', TopSurface: 'Smooth', BottomSurface: 'Smooth', ...(opts.collide === false ? { CanCollide: false } : {}), ...opts.extra },
    ...(opts.attributes ? { attributes: opts.attributes } : {}),
    children: [...studs(colour, opts.faces ?? ['Top']), ...(opts.children ?? [])],
  };
}

const SIDES = ['Top', 'Front', 'Back', 'Left', 'Right'];

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
  words: { gate?: string; base?: string; plot?: string };
  seed: () => number;
}

/** Every child of Workspace.AppleMap. */
export function studdedMap(input: MapInput, pal: StudPalette = STUD_PALETTE): InstanceSpecLite[] {
  const { layout, laneWidth } = input;
  const r = input.seed;
  const [gcx, gcz] = layout.ground.center, [gsx, gsz] = layout.ground.size;
  const items: InstanceSpecLite[] = [];

  // The island: grass on top, three banded cliff steps below it, each wider, down into the water.
  const island: InstanceSpecLite[] = [brick('Grass', [gsx, 2, gsz], [gcx, -1, gcz], pal.grass, { faces: SIDES })];
  const bands: [number, string][] = [[3, pal.cliff], [6, pal.cliffDark], [9, pal.cliff]];
  bands.forEach(([out, colour], k) => {
    island.push(brick(`Cliff${k + 1}`, [gsx + out * 2, 5, gsz + out * 2], [gcx, -4.5 - k * 5, gcz], colour, { faces: SIDES }));
  });
  // Lighter grass terraces: low studded steps that break the flat ground, away from the lane, the plots and the spawn.
  const free = (p: P2, room: number) => !layout.plots.some(([x, z]) => Math.abs(p[0] - x) < input.plotHalf + room && Math.abs(p[1] - z) < input.plotHalf + room)
    && Math.hypot(p[0] - layout.spawn[0], p[1] - layout.spawn[1]) > room + 8;
  let terraces = 0;
  for (let tries = 0; terraces < 9 && tries < 400; tries++) {
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
  items.push(brick('Water', [900, 2, 900], [gcx, -12, gcz], pal.water, { extra: { Material: 'SmoothPlastic', Transparency: 0.15, CanCollide: false } }));

  // The path: warm studded road with wooden curbs both sides.
  const road: InstanceSpecLite[] = [];
  for (let i = 0; i < layout.lane.length - 1; i++) {
    const [ax, az] = layout.lane[i]!, [bx, bz] = layout.lane[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az) + laneWidth;
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const [cx, cz] = [(ax + bx) / 2, (az + bz) / 2];
    road.push(brick(`Road${i + 1}`, along ? [len, 0.4, laneWidth] : [laneWidth, 0.4, len], [cx, 0.2, cz], pal.path, { collide: false }));
    for (const side of [-1, 1]) {
      const off = side * (laneWidth / 2 + 0.5);
      road.push(brick(`Curb${i + 1}${side < 0 ? 'a' : 'b'}`, along ? [len - laneWidth + 1, 0.8, 1] : [1, 0.8, len - laneWidth + 1],
        along ? [cx, 0.4, cz + off] : [cx + off, 0.4, cz], pal.curb, { faces: ['Top', 'Front', 'Back', 'Left', 'Right'] }));
    }
  }
  items.push({ className: 'Model', name: 'Road', children: road });
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

  // Plots: a wooden frame, dark soil tiles (alternating), and a sign with the owner's name.
  items.push({ className: 'Folder', name: 'Plots', children: layout.plots.map(([px, pz], n) => {
    const toLane = nearestLaneSide([px, pz], layout.lane);
    const signAt: P2 = toLane === 'x' ? [px, pz + (input.plotHalf + 2.5) * (pz > 0 ? 1 : -1)] : [px + (input.plotHalf + 2.5) * (px > 0 ? 1 : -1), pz];
    return {
      className: 'Model', name: `Plot${n + 1}`,
      children: [
        brick('Frame', [input.plotHalf * 2 + 2, 0.8, input.plotHalf * 2 + 2], [px, 0.4, pz], pal.frame, { faces: SIDES }),
        ...input.plotTiles([px, pz]).map(([tx, tz], i) => brick(`Tile${i + 1}`, [input.tile - 0.6, 1, input.tile - 0.6], [tx, 0.7, tz], i % 2 === 0 ? pal.soil : pal.soilDark, { attributes: { AppleTags: 'AppleTile' } })),
        sign('Sign', signAt, toLane === 'x' ? 'z' : 'x', input.words.plot ?? 'Free plot', pal.frame, 'OwnerName'),
      ],
    };
  }) });

  // The spawn: a bright studded pad.
  items.push({ className: 'SpawnLocation', name: 'Spawn', props: { Size: [10, 1, 10], Position: [layout.spawn[0], 0.5, layout.spawn[1]], Anchored: true, Color: pal.spawn, Material: 'Plastic', TopSurface: 'Smooth' }, children: studs(pal.spawn) });

  // Painted guidance (never floating arrows): yellow chevrons on the grass from the spawn to the nearest plot, so the
  // first thing to do is obvious from the first second (docs/research/roblox-games/2026-09-25-direct-play.md).
  const [sx, sz] = layout.spawn;
  const target = [...layout.plots].sort((a, b) => Math.hypot(a[0] - sx, a[1] - sz) - Math.hypot(b[0] - sx, b[1] - sz))[0];
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

/** Bright, saturated, soft-shadowed daylight (the style spec's lighting): Lighting properties and its effects. */
export function studLighting(): { props: Record<string, unknown>; effects: InstanceSpecLite[] } {
  return {
    props: { ClockTime: 14.5, Brightness: 2.4, Ambient: '#8c8c8c', OutdoorAmbient: '#9fb3c8', GlobalShadows: true, ShadowSoftness: 0.4, EnvironmentDiffuseScale: 1, EnvironmentSpecularScale: 0.4, ExposureCompensation: 0.15 },
    effects: [
      { className: 'Atmosphere', name: 'AppleAtmosphere', props: { Density: 0.22, Offset: 0.1, Color: '#d6ecff', Decay: '#9ccaf0', Glare: 0.2, Haze: 0.6 } },
      { className: 'ColorCorrectionEffect', name: 'AppleColour', props: { Saturation: 0.22, Contrast: 0.08, Brightness: 0.03, TintColor: '#fffaf0' } },
      { className: 'BloomEffect', name: 'AppleBloom', props: { Intensity: 0.35, Size: 24, Threshold: 1.4 } },
      { className: 'SunRaysEffect', name: 'AppleSunRays', props: { Intensity: 0.04, Spread: 0.6 } },
    ],
  };
}
