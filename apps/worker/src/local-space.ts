// Building a structure in its own local space, then putting it where it goes.
//
// Owner benchmark 2026-10-02 (a canyon map): ~75 parts hand-placed in absolute world coordinates took 131 s and 155 s of
// thinking per step, and a structure built twice meant computing every coordinate twice. With an `origin` the batch is
// written around (0,0,0): this module rotates it about the vertical by `yaw` and moves it to `at`, so the structure is
// described once and put anywhere (and repeated with clone_instances' at / along / within).
//
// Only what can be transformed exactly is transformed, and the rest is refused by name:
//   Position (Vector3), Orientation (Vector3, Roblox's YXZ Euler: a world yaw adds to its Y exactly) and CFrame (12 numbers)
//   of the BASE PARTS in the batch. Everything else (sizes, colours, a light's offset, an Attachment's Position, which is
//   relative to its parent) is already independent of where the structure stands.
//
// Pure: takes items already typed by studio-props.ts normaliseItems, returns new items; the input is never mutated.

export interface Origin {
  at: [number, number, number];
  /** Degrees about the vertical (counter-clockwise seen from above), as place_copies and CFrame.Angles(0, yaw, 0) turn. */
  yaw?: number;
}

const BASE_PARTS = new Set(['Part', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'SpawnLocation', 'Seat', 'VehicleSeat']);
/** Props that name a place in the WORLD and cannot be moved by a local-space transform. */
const WORLD_PROPS = ['WorldPosition', 'WorldCFrame', 'WorldOrientation', 'WorldPivot', 'WorldAxis', 'WorldSecondaryAxis'];

type Tagged = { t: string; v?: unknown };

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const tagged = (v: unknown): v is Tagged => typeof v === 'object' && v !== null && typeof (v as { t?: unknown }).t === 'string';
const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** An origin as the model wrote it, or the sentence that says what is wrong. */
export function readOrigin(v: unknown, limit: number): Origin | { error: string } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'origin must be {at:[x,y,z], yaw?} (degrees).' };
  const o = v as { at?: unknown; yaw?: unknown };
  if (!Array.isArray(o.at) || o.at.length !== 3 || !o.at.every(finite) || (o.at as number[]).some((n) => Math.abs(n) > limit)) return { error: 'origin.at must be [x, y, z] inside the world.' };
  if (o.yaw !== undefined && (!finite(o.yaw) || Math.abs(o.yaw) > 36000)) return { error: 'origin.yaw must be a number of degrees.' };
  return { at: o.at as [number, number, number], ...(o.yaw !== undefined ? { yaw: o.yaw as number } : {}) };
}

/** `items` with every base part's Position, Orientation and CFrame moved from local space into the world. */
export function applyOrigin(items: readonly unknown[], origin: Origin): { items: unknown[] } | { error: string } {
  const yaw = origin.yaw ?? 0;
  const c = Math.cos((yaw * Math.PI) / 180);
  const s = Math.sin((yaw * Math.PI) / 180);
  const [ax, ay, az] = origin.at;
  const point = (p: [number, number, number]): [number, number, number] => [round(c * p[0] + s * p[2] + ax), round(p[1] + ay), round(-s * p[0] + c * p[2] + az)];
  const refusals: string[] = [];

  const visit = (raw: unknown, path: string): unknown => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const item = { ...(raw as Record<string, unknown>) };
    const className = typeof item.className === 'string' ? item.className : '';
    const props: Record<string, unknown> = { ...(typeof item.props === 'object' && item.props !== null ? (item.props as Record<string, unknown>) : {}) };
    for (const name of WORLD_PROPS) if (name in props) refusals.push(`${path}.props.${name} names a place in the world, which a local-space batch cannot move`);
    if (BASE_PARTS.has(className)) {
      const pos = props.Position;
      if (pos !== undefined && !(tagged(pos) && pos.t === 'Vector3' && Array.isArray(pos.v) && pos.v.length === 3 && pos.v.every(finite))) {
        refusals.push(`${path}.props.Position must be a Vector3 to be moved`);
      } else {
        const local = (pos && Array.isArray((pos as Tagged).v) ? ((pos as Tagged).v as [number, number, number]) : [0, 0, 0]) as [number, number, number];
        // The CFrame form carries its own position, so a part written with CFrame is moved through that instead.
        if (!('CFrame' in props)) props.Position = { t: 'Vector3', v: point(local) };
      }
      const orient = props.Orientation;
      if (orient !== undefined && !(tagged(orient) && orient.t === 'Vector3' && Array.isArray(orient.v) && orient.v.length === 3 && orient.v.every(finite))) {
        refusals.push(`${path}.props.Orientation must be a Vector3 to be turned`);
      } else if (yaw !== 0 && !('CFrame' in props)) {
        const o = (orient ? ((orient as Tagged).v as number[]) : [0, 0, 0]) as number[];
        // Roblox Orientation is Euler YXZ, so a turn about the world's vertical adds to its Y and changes nothing else.
        props.Orientation = { t: 'Vector3', v: [o[0]!, round((((o[1]! + yaw + 180) % 360) + 360) % 360 - 180), o[2]!] };
      }
      const cf = props.CFrame;
      if (cf !== undefined) {
        if (!(tagged(cf) && cf.t === 'CFrame' && Array.isArray(cf.v) && cf.v.length === 12 && cf.v.every(finite))) {
          refusals.push(`${path}.props.CFrame must be a CFrame of 12 numbers to be moved`);
        } else {
          const v = cf.v as number[];
          const [x, y, z] = point([v[0]!, v[1]!, v[2]!]);
          // R' = Ry * R, rows of R in place of the right-hand factor.
          const r = [v[3]!, v[4]!, v[5]!, v[6]!, v[7]!, v[8]!, v[9]!, v[10]!, v[11]!];
          const row0 = [c * r[0]! + s * r[6]!, c * r[1]! + s * r[7]!, c * r[2]! + s * r[8]!];
          const row2 = [-s * r[0]! + c * r[6]!, -s * r[1]! + c * r[7]!, -s * r[2]! + c * r[8]!];
          props.CFrame = { t: 'CFrame', v: [x, y, z, ...row0, r[3]!, r[4]!, r[5]!, ...row2].map((n, i) => (i < 3 ? n : round(n))) };
        }
      }
    }
    if (Object.keys(props).length) item.props = props;
    if (Array.isArray(item.children)) item.children = item.children.map((k, i) => visit(k, `${path}.children[${i}]`));
    return item;
  };

  const out = items.map((raw, i) => visit(raw, `items[${i}]`));
  if (refusals.length) return { error: `Nothing was created. origin cannot place this batch: ${refusals.slice(0, 6).join('; ')}.` };
  return { items: out };
}

/** The parent every top-level item shares, or the sentence that says they do not (a group needs one home). */
export function sharedParent(items: readonly unknown[]): string | { error: string } {
  const parents = [...new Set(items.map((i) => String((i as { parent?: unknown } | null)?.parent ?? 'game.Workspace')))];
  return parents.length === 1 ? parents[0]! : { error: `group needs every item to share one parent; found ${parents.slice(0, 4).join(', ')}.` };
}
