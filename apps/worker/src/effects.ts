// AMBIENT EFFECTS — the difference between a model and a place.
//
// A scene built out of anchored Parts is inert: correct geometry, correct materials, and nothing
// moving in it. Fire that does not flicker, a forge with no embers, a waterfall with no mist. The
// agent could already write this Luau by hand, and when it tried it produced emitters with default
// white squares, rates in the hundreds, and no transparency ramp — the particle equivalent of
// default-grey Plastic.
//
// WHY THIS NEEDS NO ASSETS AT ALL, AND WHY THAT IS THE WHOLE POINT.
// `Paths.assetIdsIn` (apps/plugin/src/Paths.luau:244) returns nil for `rbxasset://`, and
// apps/plugin/tests/paths.spec.luau:111 asserts it: engine content is first-party and is never
// gated. But every preset here goes further and references NO content of any kind — no Texture, no
// SoundId, no MeshId. A ParticleEmitter with no Texture renders with the engine's own default
// sprite, which is always present in every place.
//
// That is a deliberate refusal, not an oversight. A `rbxasset://` path that does not exist does not
// error: the property accepts the string and the effect silently renders as nothing. The only
// game-usable engine paths this repository can actually evidence are one sound in
// apps/benchmark/crystal-canyon/src/client/Effects.luau:129 and two textures; the Roblox
// creator-docs corpus attests only `rbxasset://SystemCursors/*`, which are Studio cursors. Shipping
// a sound library on paths nobody here has verified would be a table of silent failures, so there
// is no sound library. Sounds arrive when a path can be confirmed in a live place, not before.
//
// These emit Luau rather than `create_instances` items because the properties that carry a look are
// ColorSequence and NumberSequence — the ramps — and `PropValue` in packages/shared supports
// neither. An emitter without its ramps is the default white square this module exists to replace.

/** One instance the preset creates under the target, as a class plus already-rendered Luau props. */
interface EffectPart {
  className: string;
  /** Property assignments, pre-rendered as Luau expressions. */
  props: Record<string, string>;
}

export interface EffectPreset {
  /** What a person would call it. */
  summary: string;
  /** When the agent should reach for it, in the words it will read. */
  use: string;
  parts: EffectPart[];
}

// --- small Luau constructors, so a preset reads as values rather than as string-building ---------

const c3 = (r: number, g: number, b: number) => `Color3.fromRGB(${r}, ${g}, ${b})`;
const range = (a: number, b: number) => `NumberRange.new(${a}, ${b})`;
const v3 = (x: number, y: number, z: number) => `Vector3.new(${x}, ${y}, ${z})`;
const v2 = (x: number, y: number) => `Vector2.new(${x}, ${y})`;

/** A colour ramp: [time, r, g, b] stops. */
const colorSeq = (stops: [number, number, number, number][]) =>
  `ColorSequence.new({${stops.map(([t, r, g, b]) => `ColorSequenceKeypoint.new(${t}, ${c3(r, g, b)})`).join(', ')}})`;

/** A scalar ramp: [time, value] stops. Used for Size and Transparency. */
const numSeq = (stops: [number, number][]) =>
  `NumberSequence.new({${stops.map(([t, v]) => `NumberSequenceKeypoint.new(${t}, ${v})`).join(', ')}})`;

// --- the library ---------------------------------------------------------------------------------
//
// Every preset is tuned rather than plausible. Rate stays low (a believable fire is ~15-25 particles
// a second, not 200), Transparency always ends at 1 so nothing pops out of existence, and Size
// always ramps so particles grow or shrink instead of scaling as rigid sprites.

export const EFFECTS: Record<string, EffectPreset> = {
  fire: {
    summary: 'A small, warm, flickering flame with its own light.',
    use: 'Torches, campfires, braziers, forges, candles. Parent it to the thing that is burning.',
    parts: [
      {
        className: 'ParticleEmitter',
        props: {
          Name: '"Fire"',
          Rate: '18',
          Lifetime: range(0.55, 1.05),
          Speed: range(2, 3.6),
          SpreadAngle: v2(11, 11),
          Acceleration: v3(0, 7, 0),
          Drag: '1.4',
          LightEmission: '1',
          LightInfluence: '0',
          Rotation: range(-25, 25),
          RotSpeed: range(-45, 45),
          Color: colorSeq([[0, 255, 190, 92], [0.35, 247, 132, 40], [1, 138, 38, 18]]),
          Size: numSeq([[0, 0.35], [0.28, 0.72], [1, 0.05]]),
          Transparency: numSeq([[0, 0.35], [0.7, 0.55], [1, 1]]),
        },
      },
      {
        className: 'PointLight',
        props: { Name: '"FireLight"', Color: c3(255, 168, 92), Brightness: '1.6', Range: '14', Shadows: 'true' },
      },
    ],
  },

  embers: {
    summary: 'Sparse glowing motes drifting upward.',
    use: 'Over a fire or a forge, around lava, or anywhere a scene needs to feel hot. Reads well layered on top of `fire`.',
    parts: [
      {
        className: 'ParticleEmitter',
        props: {
          Name: '"Embers"',
          Rate: '7',
          Lifetime: range(1.8, 3.2),
          Speed: range(1.2, 2.6),
          SpreadAngle: v2(26, 26),
          Acceleration: v3(0.6, 3.2, 0),
          Drag: '0.9',
          LightEmission: '1',
          LightInfluence: '0',
          Color: colorSeq([[0, 255, 214, 138], [0.6, 255, 138, 52], [1, 120, 36, 14]]),
          Size: numSeq([[0, 0.09], [0.5, 0.13], [1, 0]]),
          Transparency: numSeq([[0, 0.1], [0.75, 0.35], [1, 1]]),
        },
      },
    ],
  },

  smoke: {
    summary: 'Slow, heavy grey smoke that widens as it rises.',
    use: 'Chimneys, wreckage, extinguished fires, industrial vents. Low rate on purpose — smoke reads by size, not by count.',
    parts: [
      {
        className: 'ParticleEmitter',
        props: {
          Name: '"Smoke"',
          Rate: '9',
          Lifetime: range(2.4, 4),
          Speed: range(1.1, 2.1),
          SpreadAngle: v2(17, 17),
          Acceleration: v3(0.5, 1.9, 0),
          Drag: '1.9',
          LightEmission: '0',
          LightInfluence: '0.75',
          Rotation: range(0, 360),
          RotSpeed: range(-16, 16),
          Color: colorSeq([[0, 92, 92, 96], [1, 46, 46, 50]]),
          Size: numSeq([[0, 0.7], [1, 3.4]]),
          Transparency: numSeq([[0, 1], [0.18, 0.62], [1, 1]]),
        },
      },
    ],
  },

  steam: {
    summary: 'Pale wisps that rise and fade fast.',
    use: 'Kettles, vents, hot springs, cooking. Lighter and quicker than `smoke`.',
    parts: [
      {
        className: 'ParticleEmitter',
        props: {
          Name: '"Steam"',
          Rate: '13',
          Lifetime: range(1.1, 2),
          Speed: range(1.8, 3),
          SpreadAngle: v2(21, 21),
          Acceleration: v3(0, 3.4, 0),
          Drag: '2.2',
          LightEmission: '0.35',
          LightInfluence: '0.9',
          Color: colorSeq([[0, 236, 240, 244], [1, 206, 212, 218]]),
          Size: numSeq([[0, 0.4], [1, 2.1]]),
          Transparency: numSeq([[0, 1], [0.22, 0.72], [1, 1]]),
        },
      },
    ],
  },

  dust: {
    summary: 'Fine motes hanging in the air, barely moving.',
    use: 'Sunbeams through a window, attics, ruins, disused interiors. This is the cheapest way to make an interior stop feeling sterile.',
    parts: [
      {
        className: 'ParticleEmitter',
        props: {
          Name: '"Dust"',
          Rate: '11',
          Lifetime: range(5, 9),
          Speed: range(0.15, 0.55),
          SpreadAngle: v2(180, 180),
          Acceleration: v3(0.12, -0.06, 0.12),
          Drag: '0.3',
          LightEmission: '0.55',
          LightInfluence: '0.6',
          Color: colorSeq([[0, 226, 218, 198], [1, 198, 188, 166]]),
          Size: numSeq([[0, 0.05], [0.5, 0.08], [1, 0.04]]),
          Transparency: numSeq([[0, 1], [0.3, 0.55], [0.7, 0.6], [1, 1]]),
        },
      },
    ],
  },

  mist: {
    summary: 'A broad, low, very soft ground haze.',
    use: 'Swamps, graveyards, valleys, anything at dawn. Pair with the `misty` lighting mood.',
    parts: [
      {
        className: 'ParticleEmitter',
        props: {
          Name: '"Mist"',
          Rate: '5',
          Lifetime: range(7, 11),
          Speed: range(0.3, 0.9),
          SpreadAngle: v2(90, 90),
          Acceleration: v3(0.35, 0.06, 0.2),
          Drag: '1.1',
          LightEmission: '0.25',
          LightInfluence: '1',
          Rotation: range(0, 360),
          RotSpeed: range(-4, 4),
          Color: colorSeq([[0, 214, 222, 228], [1, 176, 186, 196]]),
          Size: numSeq([[0, 5], [1, 11]]),
          Transparency: numSeq([[0, 1], [0.25, 0.82], [0.75, 0.85], [1, 1]]),
        },
      },
    ],
  },

  waterfall_mist: {
    summary: 'Churned white spray thrown up from moving water.',
    use: 'The BASE of a waterfall or a fountain, never the top. Water reads as water because of what happens where it lands.',
    parts: [
      {
        className: 'ParticleEmitter',
        props: {
          Name: '"Spray"',
          Rate: '26',
          Lifetime: range(0.9, 1.9),
          Speed: range(2.4, 5),
          SpreadAngle: v2(48, 48),
          Acceleration: v3(0, -3.4, 0),
          Drag: '2.6',
          LightEmission: '0.45',
          LightInfluence: '0.85',
          Color: colorSeq([[0, 244, 250, 252], [1, 206, 224, 232]]),
          Size: numSeq([[0, 0.3], [0.45, 1.5], [1, 0.4]]),
          Transparency: numSeq([[0, 0.55], [0.6, 0.78], [1, 1]]),
        },
      },
    ],
  },

  sparkle: {
    summary: 'Tight, bright, fast glints.',
    use: 'Pickups, treasure, enchanted objects, quest markers. Short lifetime is what makes it read as a glint instead of a cloud.',
    parts: [
      {
        className: 'ParticleEmitter',
        props: {
          Name: '"Sparkle"',
          Rate: '22',
          Lifetime: range(0.45, 0.95),
          Speed: range(0.9, 2.1),
          SpreadAngle: v2(180, 180),
          Acceleration: v3(0, 1.1, 0),
          Drag: '2.8',
          LightEmission: '1',
          LightInfluence: '0',
          Rotation: range(0, 360),
          RotSpeed: range(-150, 150),
          Color: colorSeq([[0, 255, 252, 226], [0.5, 255, 226, 138], [1, 255, 196, 78]]),
          Size: numSeq([[0, 0], [0.3, 0.26], [1, 0]]),
          Transparency: numSeq([[0, 0.15], [1, 1]]),
        },
      },
    ],
  },

  magic: {
    summary: 'Slow rising motes in cool arcane colours, with a matching light.',
    use: 'Portals, runes, altars, spell effects, anything enchanted. The light is what sells it at night.',
    parts: [
      {
        className: 'ParticleEmitter',
        props: {
          Name: '"Arcane"',
          Rate: '15',
          Lifetime: range(1.6, 3),
          Speed: range(0.7, 1.8),
          SpreadAngle: v2(34, 34),
          Acceleration: v3(0, 1.6, 0),
          Drag: '1.2',
          LightEmission: '1',
          LightInfluence: '0',
          Rotation: range(0, 360),
          RotSpeed: range(-70, 70),
          Color: colorSeq([[0, 186, 146, 255], [0.5, 126, 196, 255], [1, 78, 226, 216]]),
          Size: numSeq([[0, 0.08], [0.4, 0.3], [1, 0]]),
          Transparency: numSeq([[0, 0.25], [0.8, 0.6], [1, 1]]),
        },
      },
      {
        className: 'PointLight',
        props: { Name: '"ArcaneLight"', Color: c3(150, 170, 255), Brightness: '1.5', Range: '17', Shadows: 'false' },
      },
    ],
  },

  torchlight: {
    summary: 'Warm light only — no particles.',
    use: 'Lamps, sconces and windows that should glow at night without a visible flame. Cheapest possible way to make a night scene readable.',
    parts: [
      {
        className: 'PointLight',
        props: { Name: '"Torchlight"', Color: c3(255, 176, 104), Brightness: '2', Range: '20', Shadows: 'true' },
      },
    ],
  },
};

export const EFFECT_NAMES = Object.keys(EFFECTS);

/** Everything the model needs to choose, short enough to sit in a tool description. */
export function effectCatalogue(): { name: string; summary: string; use: string }[] {
  return EFFECT_NAMES.map((name) => ({
    name,
    summary: EFFECTS[name]!.summary,
    use: EFFECTS[name]!.use,
  }));
}

/**
 * Luau that attaches one preset to `path`.
 *
 * Re-applying is idempotent: the marker attribute is how a second call finds and clears what the
 * first one made. Without it, "make the fire stronger" would stack a second emitter on the first and
 * double the rate while looking like it had edited one.
 *
 * `path` is NOT interpolated into the source. It is resolved through a quoted-string literal with
 * quotes and backslashes escaped, and any path containing a newline or a quote is rejected by the
 * caller before it reaches here.
 */
export function effectLuau(effect: string, path: string): string {
  const preset = EFFECTS[effect];
  if (!preset) return '';
  const segments = parseInstancePath(path);
  if (!segments) return '';
  const target = JSON.stringify(path); // Luau accepts JSON's double-quoted escaping for these
  const lines: string[] = [
    `local target = ${luauResolve(segments)}`,
    'if not target then error("no instance at " .. ' + target + ') end',
    '-- Clear anything a previous apply of THIS preset left, so re-applying tunes rather than stacks.',
    'for _, child in ipairs(target:GetChildren()) do',
    `\tif child:GetAttribute("AppleEffect") == ${JSON.stringify(effect)} then child:Destroy() end`,
    'end',
  ];
  for (const part of preset.parts) {
    lines.push(`do`);
    lines.push(`\tlocal fx = Instance.new(${JSON.stringify(part.className)})`);
    for (const [k, v] of Object.entries(part.props)) lines.push(`\tfx.${k} = ${v}`);
    lines.push(`\tfx:SetAttribute("AppleEffect", ${JSON.stringify(effect)})`);
    lines.push(`\tfx.Parent = target`);
    lines.push(`end`);
  }
  lines.push(`return { attached = ${JSON.stringify(preset.parts.length)}, to = target:GetFullName() }`);
  return lines.join('\n');
}

/**
 * Luau that takes an effect back off.
 *
 * `add_effect` without this is half a feature: a user who says "take the fire off" has no path, and
 * the agent's only alternative is to write deletion Luau by hand against a place it is guessing at.
 *
 * IT REMOVES ONLY WHAT WE MARKED. Every instance this module creates carries an `AppleEffect`
 * attribute, and the removal is scoped to children carrying it. That is the difference between
 * "undo the thing you added" and "delete the children of this part" — the second is a request
 * nobody made, and the user's own ParticleEmitter is exactly the kind of thing that would be
 * sitting next to ours.
 *
 * `effect` of null removes every effect we placed there; naming one removes just that preset.
 */
export function removeEffectLuau(effect: string | null, path: string): string {
  const segments = parseInstancePath(path);
  if (!segments) return '';
  const target = JSON.stringify(path);
  const wanted = effect === null ? 'nil' : JSON.stringify(effect);
  return [
    `local target = ${luauResolve(segments)}`,
    'if not target then error("no instance at " .. ' + target + ') end',
    `local wanted = ${wanted}`,
    'local removed, kinds = 0, {}',
    'for _, child in ipairs(target:GetChildren()) do',
    // The attribute is the whole authority for touching anything. No name matching, no class
    // matching — either we put it there and said so, or we leave it alone.
    '	local mark = child:GetAttribute("AppleEffect")',
    '	if mark ~= nil and (wanted == nil or mark == wanted) then',
    '		if not table.find(kinds, mark) then table.insert(kinds, mark) end',
    '		child:Destroy()',
    '		removed += 1',
    '	end',
    'end',
    'return { removed = removed, effects = table.concat(kinds, ","), from = target:GetFullName() }',
  ].join('\n');
}

/**
 * Split an instance path into its segment names, or null if it is not a path.
 *
 * THIS EXISTS BECAUSE THE CANONICAL FORM IS NOT DOT-SEPARATED. `Paths.fullPath` in the plugin — the
 * format every other tool RETURNS to the model — brackets any name that is not a bare identifier:
 *
 *     game.Workspace["Camp Fire"].Logs
 *
 * Splitting that on '.' yields `Workspace["Camp Fire"]` and `Logs`, and FindFirstChild finds
 * neither. Together with a caller that rejected every path containing a quote, that made every
 * instance whose name has a space, a hyphen or a leading digit permanently unreachable by
 * add_effect and remove_effect — which is most model- and user-named geometry — while telling the
 * model its own system's path format was "not valid".
 *
 * Parsing here rather than in the emitted Luau keeps the path as DATA the whole way: the segments
 * go into the chunk as quoted string literals, so there is still nothing the model can name that
 * becomes code. This mirrors Paths.parse in the plugin, which is the authority on the format.
 */
export function parseInstancePath(path: string): string[] | null {
  if (path.length === 0 || path.length > 500) return null;
  // A control character is not part of any instance name and would break the emitted literal.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;

  const segs: string[] = [];
  let cur = '';
  let i = 0;
  while (i < path.length) {
    const ch = path[i];
    if (ch === '.') {
      if (cur.length > 0) segs.push(cur);
      cur = '';
      i += 1;
    } else if (ch === '[') {
      if (cur.length > 0) segs.push(cur);
      cur = '';
      const quote = path[i + 1];
      if (quote !== '"' && quote !== "'") return null;
      const close = path.indexOf(`${quote}]`, i + 2);
      if (close === -1) return null;
      const name = path.slice(i + 2, close);
      if (name.length === 0) return null;
      segs.push(name.replace(/\\(["'\\])/g, '$1'));
      i = close + 2;
    } else {
      // A quote, a backslash or a stray bracket outside a bracketed segment is malformed. Nothing
      // here could become code — every segment is emitted as an escaped string literal — but the
      // canonical form always brackets a name that needs a quote, so refusing keeps the boundary
      // crisp rather than silently accepting a path no tool would ever produce.
      if (ch === '"' || ch === "'" || ch === '\\' || ch === ']') return null;
      cur += ch;
      i += 1;
    }
  }
  if (cur.length > 0) segs.push(cur);
  if (segs.length < 2) return null;
  if (segs[0] !== 'game' && segs[0] !== 'Game') return null;
  return segs.slice(1);
}

/**
 * Resolve a path without `loadstring` and without indexing by a model-supplied expression.
 *
 * The segments arrive as quoted string literals and are walked with `FindFirstChild`, so the only
 * thing the model can do with a path is name a child that may not exist.
 */
function luauResolve(segments: string[]): string {
  return [
    '(function()',
    `\tlocal segs = { ${segments.map((sg) => JSON.stringify(sg)).join(', ')} }`,
    '\tlocal node = game',
    '\tfor _, seg in ipairs(segs) do',
    '\t\tnode = node:FindFirstChild(seg)',
    '\t\tif not node then return nil end',
    '\tend',
    '\treturn node',
    'end)()',
  ].join('\n');
}
