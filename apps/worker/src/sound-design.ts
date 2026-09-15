// The audio half of a PLACE: reverb, buses, and 3D falloff — and not one asset id.
//
// effects.ts ends its header with "there is no sound library. Sounds arrive when a path can be
// confirmed in a live place, not before." This file is what can be built while that stays true,
// and it turns out to be most of what makes a place sound like somewhere:
//
//   * SoundService.AmbientReverb decides whether a room sounds like a cave or a carpeted hallway.
//     It is one enum assignment and it costs nothing.
//   * RolloffScale and DistanceFactor decide how fast sound falls away with distance — the single
//     biggest difference between "a noise is playing" and "something over there is making a noise".
//   * SoundGroups are a mixer. Every Sound assigned to one is trimmed by its Volume, so a player
//     volume slider, a duck-the-music-under-dialogue rule, or simply "the UI is too loud" become
//     one number instead of an edit to every Sound in the place.
//
// None of it references an asset, so none of it can fail a licence gate, a moderation gate, or the
// silent-`rbxasset://` failure effects.ts describes. What it CANNOT do is make a sound: a place
// configured by this file and containing no Sound instances is a very well-designed silence.
// `assignSoundsLuau` configures Sounds that already exist; nothing here invents a SoundId, and
// `refuseSoundId` exists to say so when a caller asks.
//
// EVERY CLASS, PROPERTY AND ENUM ITEM BELOW IS VERIFIED against apps/plugin/globalTypes.d.luau —
// the type dump shipped in this repository — and the test asserts that, class by class and
// property by property, against that file. An invented property does not error in Luau: assigning
// to an unknown property on an Instance throws at RUNTIME, inside the user's place, in a chunk
// nobody is watching. That is the same class of failure as a `rbxasset://` path that does not
// exist, and it gets the same treatment.
import { parseInstancePath } from './effects';

// ---------------------------------------------------------------------------------------------
// Verified vocabulary
// ---------------------------------------------------------------------------------------------

/**
 * Every item of `Enum.ReverbType`, from globalTypes.d.luau (EnumReverbType_INTERNAL).
 *
 * The whole list rather than a chosen subset, because the test checks this constant against the
 * type dump in both directions — a value here that the engine does not have would throw in a live
 * place, and an item the engine has that is missing here is just a preset nobody can reach.
 */
export const REVERB_TYPES = [
  'NoReverb',
  'GenericReverb',
  'PaddedCell',
  'Room',
  'Bathroom',
  'LivingRoom',
  'StoneRoom',
  'Auditorium',
  'ConcertHall',
  'Cave',
  'Arena',
  'Hangar',
  'CarpettedHallway',
  'Hallway',
  'StoneCorridor',
  'Alley',
  'Forest',
  'City',
  'Mountains',
  'Quarry',
  'Plain',
  'ParkingLot',
  'SewerPipe',
  'UnderWater',
] as const;
export type ReverbType = (typeof REVERB_TYPES)[number];

/** Every item of `Enum.RollOffMode` (EnumRollOffMode_INTERNAL in the same dump). */
export const ROLLOFF_MODES = ['Inverse', 'InverseTapered', 'Linear', 'LinearSquare'] as const;
export type RollOffMode = (typeof ROLLOFF_MODES)[number];

/**
 * The SoundService properties this file will write, and ONLY these.
 *
 * SoundService also exposes AcousticSimulationEnabled, OcclusionEnabled, DiffractionEnabled,
 * VolumetricAudio, RespectFilteringEnabled and the listener controls. They are not written here
 * because globalTypes.d.luau records a property's TYPE and not whether it is scriptable, and
 * assigning to a locked property throws at runtime — inside the user's place, from a chunk nobody
 * is watching. The four below are the long-standing scriptable mixer controls. Widening this list
 * is a change that needs evidence from a live place, not a guess from a type dump.
 */
export const WRITTEN_SOUND_SERVICE_PROPERTIES = ['AmbientReverb', 'RolloffScale', 'DistanceFactor', 'DopplerScale'] as const;

// ---------------------------------------------------------------------------------------------
// The buses
// ---------------------------------------------------------------------------------------------

export const BUS_NAMES = ['Music', 'Ambience', 'SFX', 'UI', 'Voice'] as const;
export type BusName = (typeof BUS_NAMES)[number];

interface BusEffect {
  /** A creatable class name, verified against the CREATABLE_INSTANCES metadata in globalTypes. */
  className: 'CompressorSoundEffect' | 'EqualizerSoundEffect';
  /** Instance name, so re-running the pass retunes this effect rather than adding a second one. */
  name: string;
  /** Pre-rendered Luau expressions, keyed by a real property of `className`. */
  props: Record<string, string>;
}

export interface SoundBus {
  name: BusName;
  /** Starting volume. A mixer with everything at 1.0 is not a mixer. */
  volume: number;
  summary: string;
  effects: BusEffect[];
}

/**
 * The bus layout is FLAT, and that is a finding rather than a simplification.
 *
 * The obvious design is a Master group with the others routed into it, so one fader moves
 * everything. It is not emitted because SoundGroup, in both of this repository's records of the
 * API — globalTypes.d.luau and apps/plugin/api-docs.json — has exactly ONE property: Volume. There
 * is no property on a SoundGroup that routes it into another SoundGroup. Emitting `music.SoundGroup
 * = master` would therefore throw in a live place while looking completely reasonable here.
 *
 * So five sibling groups, and the master fader is the caller multiplying five numbers. That is the
 * honest shape of the API as this repository can evidence it.
 */
export const SOUND_BUSES: readonly SoundBus[] = [
  {
    name: 'Music',
    volume: 0.55,
    summary: 'Score and stingers. Starts low because music is the first thing players turn down.',
    effects: [
      {
        className: 'CompressorSoundEffect',
        name: 'MusicGlue',
        // A gentle bus compressor: enough to keep a score from ducking under an explosion, not
        // enough to pump. Threshold in dB, Ratio as :1, Attack/Release in seconds.
        props: { Threshold: '-16', Ratio: '3', Attack: '0.05', Release: '0.35', GainMakeup: '2' },
      },
    ],
  },
  {
    name: 'Ambience',
    volume: 0.5,
    summary: 'Wind, rain, room tone. Loops that should never be consciously noticed.',
    effects: [
      {
        className: 'EqualizerSoundEffect',
        name: 'AmbienceTilt',
        // Beds live under everything else, so the midrange — where speech and gameplay cues sit —
        // is pulled down and the extremes are left alone.
        props: { LowGain: '0', MidGain: '-4', HighGain: '-2' },
      },
    ],
  },
  {
    name: 'SFX',
    volume: 0.85,
    summary: 'One-shots: footsteps, impacts, doors, pickups. The loudest bus, because it is the feedback.',
    effects: [],
  },
  {
    name: 'UI',
    volume: 0.7,
    summary: 'Clicks, confirmations, errors. Not spatial — UI sound belongs at the listener.',
    effects: [],
  },
  {
    name: 'Voice',
    volume: 1,
    summary: 'Dialogue and narration. Sits at unity so nothing else has to fight it.',
    effects: [
      {
        className: 'CompressorSoundEffect',
        name: 'VoiceLeveller',
        // Harder than the music bus: dialogue intelligibility beats dialogue dynamics.
        props: { Threshold: '-14', Ratio: '6', Attack: '0.01', Release: '0.2', GainMakeup: '3' },
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// The environments
// ---------------------------------------------------------------------------------------------

export interface SoundEnvironment {
  summary: string;
  /** When to pick it, written for the model that reads it in a tool description. */
  use: string;
  reverb: ReverbType;
  /**
   * SoundService.RolloffScale. 1 is the engine default; ABOVE 1 makes sound fall away FASTER, so
   * an enclosed space uses a higher number and an open one a lower.
   */
  rolloffScale: number;
  /** SoundService.DistanceFactor: studs per metre for the attenuation model. 3.33 is the default. */
  distanceFactor: number;
  /** SoundService.DopplerScale. 0 turns the pitch shift off, which is right for anything static. */
  dopplerScale: number;
  /** Per-bus trims in dB for this environment. Absent means "leave the bus at its own volume". */
  busTrimDb?: Partial<Record<BusName, number>>;
}

export const SOUND_ENVIRONMENTS: Record<string, SoundEnvironment> = {
  open_world: {
    summary: 'Outdoors and unbounded: fields, rooftops, open water.',
    use: 'The default for any exterior. Sound carries, so the rolloff is gentle.',
    reverb: 'Plain',
    rolloffScale: 0.8,
    distanceFactor: 3.33,
    dopplerScale: 1,
  },
  forest: {
    summary: 'Outdoors with cover: trees, dense foliage, canopy.',
    use: 'Woods and jungle. Slightly faster falloff than open ground, because leaves absorb.',
    reverb: 'Forest',
    rolloffScale: 1,
    distanceFactor: 3.33,
    dopplerScale: 1,
    busTrimDb: { Ambience: 2 },
  },
  mountains: {
    summary: 'Big, far, reflective.',
    use: 'Cliffs, peaks, canyons. The long reverb is what sells the scale.',
    reverb: 'Mountains',
    rolloffScale: 0.7,
    distanceFactor: 4,
    dopplerScale: 1,
  },
  city: {
    summary: 'Hard surfaces at a distance, open above.',
    use: 'Streets and plazas. Pairs with an ambience bed; without one a city reads as a diorama.',
    reverb: 'City',
    rolloffScale: 1,
    distanceFactor: 3.33,
    dopplerScale: 1,
  },
  cave: {
    summary: 'Enclosed, stone, long tail.',
    use: 'Caverns, mines, anything underground. The most obviously different preset in the set.',
    reverb: 'Cave',
    rolloffScale: 1.4,
    distanceFactor: 3,
    dopplerScale: 0.5,
    busTrimDb: { Music: -3, Ambience: 2 },
  },
  stone_hall: {
    summary: 'A large interior of hard stone.',
    use: 'Castles, temples, cathedrals, boss arenas. Ring without the muddiness of a cave.',
    reverb: 'StoneRoom',
    rolloffScale: 1.2,
    distanceFactor: 3,
    dopplerScale: 0.5,
  },
  small_room: {
    summary: 'A domestic interior with soft furnishings.',
    use: 'Houses, shops, offices. Short tail, fast falloff — it should feel small.',
    reverb: 'LivingRoom',
    rolloffScale: 1.6,
    distanceFactor: 2.5,
    dopplerScale: 0,
    busTrimDb: { Ambience: -3 },
  },
  corridor: {
    summary: 'Narrow, hard, directional.',
    use: 'Hallways, vents, service tunnels. Tense by construction.',
    reverb: 'StoneCorridor',
    rolloffScale: 1.5,
    distanceFactor: 2.5,
    dopplerScale: 0.5,
  },
  arena: {
    summary: 'A large enclosed space with a crowd in it.',
    use: 'Stadiums, colosseums, PvP maps. Loud and reflective.',
    reverb: 'Arena',
    rolloffScale: 0.9,
    distanceFactor: 3.5,
    dopplerScale: 1,
    busTrimDb: { SFX: 2 },
  },
  hangar: {
    summary: 'Enormous, metal, industrial.',
    use: 'Warehouses, ship bays, factories. Everything rings.',
    reverb: 'Hangar',
    rolloffScale: 1.1,
    distanceFactor: 3.5,
    dopplerScale: 1,
  },
  underwater: {
    summary: 'Submerged: dull, close, no high end.',
    use: 'Swimming sections. Trim the UI bus too — interface clicks should not sound wet.',
    reverb: 'UnderWater',
    rolloffScale: 1.8,
    distanceFactor: 2,
    dopplerScale: 0,
    busTrimDb: { Music: -4, SFX: -3 },
  },
  sewer: {
    summary: 'Wet, enclosed, pipe-like.',
    use: 'Tunnels, drains, sewers. Distinct from `cave` — tighter and more metallic.',
    reverb: 'SewerPipe',
    rolloffScale: 1.5,
    distanceFactor: 2.5,
    dopplerScale: 0.5,
  },
  dry: {
    summary: 'No reverb at all.',
    use: 'Menus, lobbies, cutscenes, and any place whose own audio already carries its space. Also the honest choice when unsure — no reverb reads as neutral, the wrong reverb reads as broken.',
    reverb: 'NoReverb',
    rolloffScale: 1,
    distanceFactor: 3.33,
    dopplerScale: 0,
  },
};

export const ENVIRONMENT_NAMES = Object.keys(SOUND_ENVIRONMENTS);

export function environmentCatalogue(): { name: string; summary: string; use: string; reverb: ReverbType }[] {
  return ENVIRONMENT_NAMES.map((name) => {
    const e = SOUND_ENVIRONMENTS[name]!;
    return { name, summary: e.summary, use: e.use, reverb: e.reverb };
  });
}

// ---------------------------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------------------------

export interface SoundDesignRefusal {
  refused: true;
  reason: 'unknown_environment' | 'asset_id' | 'bad_path' | 'unknown_bus' | 'bad_parameter';
  message: string;
  offending?: string;
}

export function isRefusal(value: unknown): value is SoundDesignRefusal {
  return typeof value === 'object' && value !== null && (value as SoundDesignRefusal).refused === true;
}

const ASSET_SHAPES = [
  /rbxassetid:\/\//i,
  /rbxasset:\/\//i,
  /rbxhttp:\/\//i,
  /https?:\/\//i,
  /\bassetid\b/i,
  /^\s*\d{6,}\s*$/,
];

/**
 * Refuse anything that looks like a sound asset.
 *
 * The reasoning is effects.ts's, unchanged and worth repeating because it is counter-intuitive: an
 * asset id that does not resolve DOES NOT ERROR. `Sound.SoundId` accepts the string, the Sound
 * plays nothing, and the place is silent in exactly the way a place with no audio is silent. A
 * guessed id is therefore not a 90%-correct answer, it is a silent failure wearing the costume of
 * a working feature — and the user finds out by publishing and listening.
 *
 * This is why the whole file configures audio rather than supplying it.
 */
export function refuseSoundId(value: unknown): SoundDesignRefusal | null {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  if (text === '') return null;
  for (const shape of ASSET_SHAPES) {
    if (shape.test(text)) {
      return {
        refused: true,
        reason: 'asset_id',
        offending: text.slice(0, 80),
        message:
          'This pass configures audio; it never supplies it. An asset id cannot be guessed, because a SoundId that does not resolve plays silently rather than erroring — the place would sound broken and nothing would report it. Upload the audio to your own Roblox account, paste the id into the Sound yourself, and then use this to place it on a bus and give it a falloff.',
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------------------------

const q = (s: string): string => JSON.stringify(s);

/** A number rendered for Luau. Refuses non-finite, which would emit `NaN` and fail to parse. */
function num(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  return String(Number(value.toFixed(4)));
}

const dbToScale = (db: number): number => Math.pow(10, db / 20);

export interface SoundDesignOptions {
  /** Skip the per-bus effects and only set volumes. Cheaper to reason about on a busy place. */
  effects?: boolean;
  /** Master trim applied to every bus, in dB. */
  masterTrimDb?: number;
}

/**
 * Emit the Luau that configures SoundService and the bus mixer.
 *
 * IDEMPOTENT BY CONSTRUCTION, because this runs in a place a person is editing and will be run
 * again. Every instance is looked up by name before it is created, so a second pass RETUNES the
 * mixer instead of building a second one beside it — five duplicate SoundGroups is not a visible
 * error either, it is just a volume slider that stops doing anything.
 *
 * AND IT REFUSES RATHER THAN OVERWRITES. If `SoundService.Music` exists and is not a SoundGroup,
 * the chunk errors instead of destroying it. Deleting an instance a person put there, in their own
 * place, to make room for ours is not a trade this pass gets to make on its own.
 */
export function soundDesignLuau(environment: string, opts: SoundDesignOptions = {}): string | SoundDesignRefusal {
  if (!Object.prototype.hasOwnProperty.call(SOUND_ENVIRONMENTS, environment)) {
    return {
      refused: true,
      reason: 'unknown_environment',
      offending: String(environment).slice(0, 60),
      message: `"${String(environment).slice(0, 60)}" is not an environment. Choose one of: ${ENVIRONMENT_NAMES.join(', ')}.`,
    };
  }
  const env = SOUND_ENVIRONMENTS[environment]!;
  const masterTrimDb = typeof opts.masterTrimDb === 'number' && Number.isFinite(opts.masterTrimDb) ? opts.masterTrimDb : 0;
  if (masterTrimDb > 12 || masterTrimDb < -60) {
    return { refused: true, reason: 'bad_parameter', message: `a master trim of ${masterTrimDb} dB is outside the usable -60..+12 range` };
  }

  const lines: string[] = [
    `-- Golem sound design: ${environment}. Configuration only; no asset is referenced.`,
    'local SoundService = game:GetService("SoundService")',
    '',
    '-- Look up before creating, so a second run retunes rather than duplicating. A name held by a',
    '-- different class is an ERROR, not something to clear out of the way: it is the user\'s.',
    '-- No type annotations: this chunk is checked with luau-analyze WITHOUT the Roblox type',
    '-- definitions loaded, where `Instance` is an unknown type and an annotation using it is an',
    '-- error rather than a help. The place it actually runs in infers all of this anyway.',
    'local function ensure(parent, className, name)',
    '\tlocal existing = parent:FindFirstChild(name)',
    '\tif existing then',
    '\t\tif existing.ClassName == className then return existing end',
    '\t\terror(existing:GetFullName() .. " already exists and is a " .. existing.ClassName .. ", not a " .. className)',
    '\tend',
    '\tlocal created = Instance.new(className)',
    '\tcreated.Name = name',
    '\tcreated.Parent = parent',
    '\treturn created',
    'end',
    '',
    `SoundService.AmbientReverb = Enum.ReverbType.${env.reverb}`,
    `SoundService.RolloffScale = ${num(env.rolloffScale)}`,
    `SoundService.DistanceFactor = ${num(env.distanceFactor)}`,
    `SoundService.DopplerScale = ${num(env.dopplerScale)}`,
    '',
  ];

  for (const bus of SOUND_BUSES) {
    const trimDb = (env.busTrimDb?.[bus.name] ?? 0) + masterTrimDb;
    const volume = num(Math.max(0, Math.min(2, bus.volume * dbToScale(trimDb))));
    if (volume === null) return { refused: true, reason: 'bad_parameter', message: `bus ${bus.name} computed a volume that is not a number` };
    const local = bus.name.toLowerCase();
    lines.push(`local ${local} = ensure(SoundService, "SoundGroup", ${q(bus.name)})`);
    lines.push(`${local}.Volume = ${volume}`);
    if (opts.effects !== false) {
      for (const fx of bus.effects) {
        const varName = `${local}_${fx.name.toLowerCase()}`;
        lines.push(`local ${varName} = ensure(${local}, ${q(fx.className)}, ${q(fx.name)})`);
        for (const [prop, value] of Object.entries(fx.props)) lines.push(`${varName}.${prop} = ${value}`);
        lines.push(`${varName}.Enabled = true`);
      }
    }
    lines.push('');
  }

  lines.push(
    `return { environment = ${q(environment)}, reverb = ${q(env.reverb)}, buses = { ${SOUND_BUSES.map((b) => q(b.name)).join(', ')} } }`,
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Assigning existing Sounds to buses
// ---------------------------------------------------------------------------------------------

export interface SoundAssignment {
  /** Full instance path of an EXISTING Sound, e.g. game.Workspace.Forge.Fire.Crackle */
  path: string;
  bus: BusName;
  /** Volume trim in dB relative to the Sound's current volume. */
  volumeDb?: number;
  rollOffMode?: RollOffMode;
  /** Studs at which attenuation begins. Inside this radius the Sound is at full volume. */
  minDistance?: number;
  /** Studs at which it becomes inaudible. Must be greater than `minDistance`. */
  maxDistance?: number;
  looped?: boolean;
}

/**
 * Put existing Sounds on buses and give them a believable 3D falloff.
 *
 * WHY THE DISTANCES MATTER MORE THAN THEY LOOK. Roblox's default RollOffMinDistance is 10 studs and
 * the default max is 10,000 — which means an un-configured Sound is audible from a kilometre away
 * at almost full volume. That single default is why so many places sound like everything is
 * happening next to the player's head: not a missing feature, a number nobody changed.
 *
 * `volumeDb` is a TRIM, applied to whatever the Sound is already set to, so running this twice does
 * not compound: the emitted chunk records the original on an attribute the first time and always
 * computes from that. Without it, "turn this down 6 dB" applied twice is -12 and applied five times
 * is inaudible, and nothing in the place would say why.
 */
export function assignSoundsLuau(assignments: SoundAssignment[]): string | SoundDesignRefusal {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { refused: true, reason: 'bad_parameter', message: 'no sounds were given to assign' };
  }
  if (assignments.length > 200) {
    return { refused: true, reason: 'bad_parameter', message: `${assignments.length} assignments is more than one chunk should carry` };
  }

  const lines: string[] = [
    '-- Golem: route existing Sounds onto buses and give them a real falloff. No asset is written:',
    '-- this configures Sounds that already carry audio and never supplies any.',
    'local SoundService = game:GetService("SoundService")',
    'local assigned, missing = 0, {}',
    '',
    'local function resolve(path)',
    '\tlocal node = game',
    '\tfor _, seg in ipairs(path) do',
    '\t\tif not node then return nil end',
    '\t\tnode = node:FindFirstChild(seg)',
    '\tend',
    '\treturn node',
    'end',
    '',
  ];

  for (const a of assignments) {
    const assetRefusal = refuseSoundId(a.path);
    if (assetRefusal) return assetRefusal;
    const segments = parseInstancePath(String(a.path ?? ''));
    if (!segments) {
      return {
        refused: true,
        reason: 'bad_path',
        offending: String(a.path ?? '').slice(0, 80),
        message: `"${String(a.path ?? '').slice(0, 80)}" is not an instance path. Use the form other tools return, such as game.Workspace.Forge.Crackle or game.Workspace["Camp Fire"].Crackle.`,
      };
    }
    if (!(BUS_NAMES as readonly string[]).includes(a.bus)) {
      return { refused: true, reason: 'unknown_bus', offending: String(a.bus), message: `"${String(a.bus)}" is not a bus. Choose one of: ${BUS_NAMES.join(', ')}.` };
    }
    const minDistance = a.minDistance ?? 10;
    const maxDistance = a.maxDistance ?? 120;
    if (!Number.isFinite(minDistance) || !Number.isFinite(maxDistance) || minDistance < 0 || maxDistance <= minDistance) {
      return {
        refused: true,
        reason: 'bad_parameter',
        message: `${a.path}: a falloff from ${minDistance} to ${maxDistance} studs is not a range — the maximum must be greater than the minimum, and neither may be negative or NaN`,
      };
    }
    const volumeDb = a.volumeDb ?? 0;
    if (!Number.isFinite(volumeDb) || volumeDb > 12 || volumeDb < -60) {
      return { refused: true, reason: 'bad_parameter', message: `${a.path}: a trim of ${volumeDb} dB is outside the usable -60..+12 range` };
    }
    if (a.rollOffMode !== undefined && !(ROLLOFF_MODES as readonly string[]).includes(a.rollOffMode)) {
      return { refused: true, reason: 'bad_parameter', offending: String(a.rollOffMode), message: `"${String(a.rollOffMode)}" is not a RollOffMode. Choose one of: ${ROLLOFF_MODES.join(', ')}.` };
    }

    lines.push('do');
    lines.push(`\tlocal node = resolve({ ${segments.map((s) => q(s)).join(', ')} })`);
    lines.push(`\tif node and node.ClassName == "Sound" then`);
    lines.push(`\t\tlocal bus = SoundService:FindFirstChild(${q(a.bus)})`);
    lines.push(`\t\tif bus and bus.ClassName == "SoundGroup" then node.SoundGroup = bus end`);
    lines.push(`\t\tnode.RollOffMode = Enum.RollOffMode.${a.rollOffMode ?? 'InverseTapered'}`);
    lines.push(`\t\tnode.RollOffMinDistance = ${num(minDistance)}`);
    lines.push(`\t\tnode.RollOffMaxDistance = ${num(maxDistance)}`);
    if (a.looped !== undefined) lines.push(`\t\tnode.Looped = ${a.looped ? 'true' : 'false'}`);
    // The original volume is recorded once and every later trim is computed from it, so running
    // this twice is not -12 dB.
    lines.push('\t\tif node:GetAttribute("GolemBaseVolume") == nil then node:SetAttribute("GolemBaseVolume", node.Volume) end');
    lines.push(`\t\tnode.Volume = node:GetAttribute("GolemBaseVolume") * ${num(dbToScale(volumeDb))}`);
    lines.push('\t\tassigned += 1');
    lines.push('\telse');
    lines.push(`\t\ttable.insert(missing, ${q(a.path)})`);
    lines.push('\tend');
    lines.push('end');
  }

  // The count and the misses are BOTH returned. A pass that silently assigned three of eight
  // sounds and reported success is the shape this repository refuses: the caller must be able to
  // tell "all of them" from "the ones that were there".
  lines.push('return { assigned = assigned, missing = missing }');
  return lines.join('\n');
}
