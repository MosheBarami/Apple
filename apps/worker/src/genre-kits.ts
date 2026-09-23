// Genre kits: the agent asks for "horror" and gets a matched set instead of nine separate searches.
//
// WHY THIS IS A THING IN THE PRODUCT AND NOT A PROMPT. A model deciding on "a scary icon", then
// "a scary particle", then "a scary sound", one request at a time, gets three good answers that do
// not belong together — the failure is not quality, it is COHERENCE, and each decision is
// independently correct. A kit is the unit that carries coherence: one palette, one lighting state,
// one set of style tags, and the same set every time so a build is reproducible.
//
// ELEVEN KITS, NOT FORTY. These are the genres that actually carry Roblox's front page — obby,
// simulator, tycoon, roleplay, horror, anime battle (the fighting genre), tower defence, FPS (the
// shooter genre), survival, racing, adventure. Adventure was added on 2026-09-23 because the owner
// named it and no other kit covers exploration toward a landmark. A fortieth kit for a genre nobody
// ships would be a row in a table and nothing a person would pick.
//
// A KIT IS A BRIEF, NOT A BAG OF ASSETS. Every visual slot below says WHAT the genre needs and WHY,
// and the thing itself is made at build time — drawn by generate_image into the customer's own
// account, or built out of Parts. It used to be a query against Apple's curated library; the
// library was removed on 2026-09-20 and the briefs outlived it, because the `why` was always the
// valuable half and the query was only how it got filled.
//
// Only the SFX are pinned BY ID, and they survived intact: they are free, already-public Creator
// Store audio referenced by `rbxassetid://`, never uploaded and never hosted here, so nothing about
// the library's removal touches them. They are pinned because sound is the one slot where the set
// has to be stable — a horror kit whose jumpscare changes between two builds of the same game is
// not a kit — and each id in `packages/corpus/data/kit-pins.json` was probed against Roblox's own
// details endpoint for existence, type, licence and creator on a recorded date.
import type { AssetKind } from './assets';
// From ./licences directly: the single table, without dragging anything heavier into a module whose
// only question is about a string.
import { LICENCES, normaliseLicence } from './licences';

export const GENRE_KIT_IDS = [
  'horror',
  'obby',
  'tycoon',
  'simulator',
  'racing',
  'roleplay',
  'tower_defense',
  'fps_arena',
  'anime_battle',
  'survival',
  'adventure',
] as const;
export type GenreKitId = (typeof GENRE_KIT_IDS)[number];

/** A colour with the job it does. A palette of six unlabelled hexes is a swatch, not a system. */
export interface KitColour {
  role: 'base' | 'surface' | 'accent' | 'highlight' | 'danger' | 'text';
  hex: string;
  why: string;
}

/**
 * One thing the kit needs, as a BRIEF for making it. `why` is required and is the difference
 * between art direction and a shopping list.
 */
export interface KitSlot {
  need: AssetKind;
  /**
   * The subject, as a plain noun phrase — the same shape `generate_image` takes for `subject`, and
   * the same shape a build-it-from-Parts plan starts from. It was a retrieval query when there was
   * a catalogue to retrieve from; the words did not have to change when the catalogue went, because
   * "skull eye key lock hand warning" describes the icons either way.
   */
  query: string;
  /** Style tags. What keeps this slot coherent with the rest of the kit rather than merely correct. */
  tags: string[];
  /** How many to make. Small on purpose: a kit that asks for forty icons has made no choice. */
  count: number;
  why: string;
}

/**
 * An asset the kit names outright. Carries the licence VERBATIM as the source printed it, because
 * `admitToKit` re-derives the decision from that string — a pin that recorded only "it's fine"
 * would be a claim nobody can check.
 */
export interface PinnedAsset {
  id: string;
  name: string;
  kind: AssetKind;
  licence: string;
  robloxAssetId: number;
  author: string;
  /** What this sound is FOR in this genre: 'jumpscare', 'checkpoint', 'reload'. */
  role: string;
}

/**
 * Pure configuration — the `lighting` need, which is the highest quality-per-effort row there is.
 *
 * NO KIT MAY USE THE ENGINE DEFAULT AS A VALUE. Roblox ships clockTime 14.5 / brightness 3, and
 * roblox-defaults.ts is the single place those numbers are allowed to live, because the critic
 * asks "did anybody light this scene?" by comparing against them. Two kits had clockTime 14 —
 * near enough to read as the default at a glance, and `critic-wiring.test.mjs` failed the build
 * for it, correctly: a second file carrying the shape of the defaults table is how the question
 * gets two answers. They are now 13.5 and 12.5, which are choices rather than near-misses.
 */
export interface KitLighting {
  ambient: string;
  outdoorAmbient: string;
  brightness: number;
  clockTime: number;
  fogEnd: number;
  fogColor: string;
  /** Post-processing the kit expects: what add_effect should be called with. */
  effects: string[];
}

export interface GenreKit {
  id: GenreKitId;
  name: string;
  /** One line a person would recognise the genre by. Goes into the tool result verbatim. */
  pitch: string;
  palette: KitColour[];
  lighting: KitLighting;
  slots: KitSlot[];
  pinned: PinnedAsset[];
  /** What this kit should BUILD rather than fetch. Procedural wins almost everywhere. */
  procedural: string[];
}

// ---------------------------------------------------------------------------------------------
// The licence gate
// ---------------------------------------------------------------------------------------------

export interface KitAdmission {
  admitted: boolean;
  why: string;
  licenceId: string | null;
}

/**
 * May this asset be part of a kit?
 *
 * A kit is the one place assets are handed over as a SET — "give me horror" returns nine things at
 * once — which is exactly where a share-alike or non-commercial row slips past, because nobody
 * inspects nine rows they asked for as one.
 */
export function admitToKit(rec: { id: string; name: string; kind: AssetKind; licence: string; robloxAssetId: number | null }): KitAdmission {
  // The verbatim string, through the one shared table. Not re-implemented here and not a second
  // allowlist: `allowedInLibrary` is the decision, and a kit is not a place where it gets relaxed.
  const licenceId = normaliseLicence(rec.licence ?? '');
  if (!licenceId) {
    return {
      admitted: false,
      // Refusing the unknown rather than guessing is the whole reason this returns a string and not
      // a boolean: "we did not recognise it" and "we checked and it is not allowed" are different
      // facts, and collapsing them is how an unrecognised licence becomes an assumed-permissive one.
      why: `"${rec.licence}" is not a recognised licence — add it to LICENCES deliberately rather than guessing`,
      licenceId: null,
    };
  }
  const rule = LICENCES[licenceId];
  if (!rule) return { admitted: false, why: `licence id ${licenceId} has no rule`, licenceId };
  if (!rule.allowedInLibrary) return { admitted: false, why: `${licenceId} is excluded: ${rule.why}`, licenceId };
  // Belt and braces, and not redundant: a future table entry could be marked allowed with
  // commercialUse false by mistake, and a customer's Roblox experience is a commercial use.
  if (!rule.commercialUse) return { admitted: false, why: `${licenceId} does not permit commercial use`, licenceId };
  return { admitted: true, why: `${licenceId}: ${rule.why}`, licenceId };
}

// ---------------------------------------------------------------------------------------------
// The kits
// ---------------------------------------------------------------------------------------------

/** Every pinned SFX carries the same verbatim string, because they all came off the same listing. */
const SFX_LICENCE = 'Roblox Terms of Use — free on the Creator Store audio library';

const sfx = (role: string, robloxAssetId: number, name: string, author: string): PinnedAsset => ({
  id: `creator_store/audio/${robloxAssetId}`,
  name,
  kind: 'sfx',
  licence: SFX_LICENCE,
  robloxAssetId,
  author,
  role,
});

const PINS: Record<GenreKitId, PinnedAsset[]> = {
  horror: [
    sfx("stinger", 104131914354223, "horror-stinger", "zwezyx"),
    sfx("jumpscare", 138850305566950, "eeriei-jumpscare-sound", "biosrot"),
    sfx("ambience", 108361277552912, "Creepy Night Ambience", "USA_COP1"),
    sfx("door", 140668969202393, "door_creaking", "coolandrichcatlover"),
    sfx("heartbeat", 135925258529833, "snd_Heartbeat_v2", "a_player200"),
  ],
  obby: [
    sfx("jump", 76062278836688, "player_jump", "0311_3"),
    sfx("checkpoint", 128062463831151, "896_CheckPoint", "StonePac1"),
    sfx("death", 140687955694469, "Two_time_respawnnew", "prhooor_test"),
    sfx("win", 1836860398, "Winning Spirit", "APMOfficial"),
    sfx("click", 139719503904449, "UI_3_Clicks_02_Hover", "CoreCraft Studio"),
  ],
  tycoon: [
    sfx("cash", 120891770644830, "cash-register-sound-fx", "hotmoldybanana"),
    sfx("dropper", 72015712234523, "DropperDropped.mp3", "Teriyaki's Games"),
    sfx("machine", 128897142753716, "Machine_Hum", "Mariolighyer"),
    sfx("upgrade", 85188753846582, "sfx_menu_upgrade", "fajnygosciu1234"),
    sfx("click", 88442833509532, "ui-simple-button-click", "AmbientSorcery"),
  ],
  simulator: [
    sfx("pop", 17779566040, "minimal-pop-click-ui", "Mister_Myrder"),
    sfx("collect", 4612375051, "coin_pickup_3", "thienbao2109"),
    sfx("sparkle", 86070307558627, "Prel_logo_sparkle_po0", "NumbreFlux"),
    sfx("rebirth", 116975598122611, "rebirth", "+1 Bao Speed Escape"),
    sfx("levelup", 112485797063762, "UI - Level Up", "SodaBreadle"),
  ],
  racing: [
    sfx("engine", 111337899640001, "T-62 engine reving", "AmericanCitizen_1"),
    sfx("screech", 92064318020143, "tire_screech", "Mavin_K"),
    sfx("crash", 82580692847509, "car-crash_OwBDipR", "haidertembex444"),
    sfx("boost", 83819844605546, "sfx_boost_confirm_nitro", "fajnygosciu1234"),
    sfx("countdown", 7743999789, "countdown-beep", "complexlint"),
  ],
  roleplay: [
    sfx("door", 129103908045263, "door_open", "coolandrichcatlover"),
    sfx("footstep", 9083826864, "Footsteps - Wood", "nebulimity"),
    sfx("phone", 70837357673530, "Ringing_Phone_2", "Carladvantures"),
    sfx("birds", 116218561571787, "birds ambient", "skibidisigma5419"),
    sfx("click", 111174530730534, "UI - Menu Select", "SodaBreadle"),
  ],
  tower_defense: [
    sfx("shoot", 140155471173433, "turret_shoot4", "Type's Community"),
    sfx("place", 17208380755, "Roblox GUI - Purchase", "Roblox"),
    sfx("wave", 121707436171206, "wave-start", "RRRRRRccccc001"),
    sfx("death", 123539442840355, "sfx-enemy_death", "TheTrueBaconHair572"),
    sfx("explosion", 136379732287161, "watermine_explosion", "poptart608"),
  ],
  fps_arena: [
    sfx("gunshot", 799958673, "SCAR-H Gunshot", "TheVogus"),
    sfx("reload", 134817048219417, "ar15_m4_reload", "poptart608"),
    sfx("impact", 131554175554758, "concrete_impact_bullet3", "daon2000"),
    sfx("grenade", 133026394404744, "grenade-explosion", "ben_sound"),
    sfx("headshot", 138750331387064, "rust_headshot", "quarxxii"),
  ],
  anime_battle: [
    sfx("charge", 73678054568493, "Energy_Charge", "Thanksforvsin"),
    sfx("slash", 137628815514180, "sword-slash-and-swing", "timutye"),
    sfx("aura", 124506570653129, "SFX_Powerup", "qoride"),
    sfx("impact", 1837829640, "HIT-Tonal Impact 02", "APMOfficial"),
    sfx("teleport", 81421335614255, "BA_Teleport_01b", "uboirael"),
  ],
  survival: [
    sfx("campfire", 134868242817030, "Fire_CampfireLoop2", "Osmel8311"),
    sfx("chop", 7091906373, "Axe Chopping Wood", "goodwood3"),
    sfx("craft", 102230222976522, "crafting item", "Rypyd"),
    sfx("eat", 9114225125, "Eating Food 1 (SFX)", "ProSoundEffects"),
    sfx("howl", 87663220945458, "wolf-howl", "XxFabio2004xX"),
  ],
  adventure: [
    sfx("treasure", 9120873380, "Wooden Chest Open Close Cedar Box 1 (SFX)", "ProSoundEffects"),
    sfx("pickup", 2575934454, "Item Pickup", "GnomeCode"),
    sfx("swing", 135315310485417, "sword-swing-whoosh-sound-effect-1-full-pack", "Akin_TR"),
    sfx("discovery", 9040172806, "Small Discoveries (sting b)", "APMOfficial"),
    sfx("portal", 134847459602515, "portal open", "TheNotSoGloriousFork"),
  ],
};

export const GENRE_KITS: readonly GenreKit[] = [
  {
    id: 'horror',
    name: 'Horror',
    pitch: 'Almost no light, one colour of it, and the player hears the thing before they see it.',
    palette: [
      { role: 'base', hex: '#0b0d10', why: 'near-black, not black: pure black kills the silhouette the fog is supposed to sell' },
      { role: 'surface', hex: '#1a1d22', why: 'cold grey for walls, so the one warm light source is the only warm thing on screen' },
      { role: 'accent', hex: '#7a2e2e', why: 'dried blood rather than fire-engine red — saturated red reads as cartoon, not dread' },
      { role: 'highlight', hex: '#c9b27a', why: 'a single weak sodium-lamp warm, the colour of the flashlight and nothing else' },
      { role: 'danger', hex: '#b8342a', why: 'reserved exclusively for damage, so the player learns it means harm' },
      { role: 'text', hex: '#d6d3cd', why: 'off-white; pure white UI glows against a dark scene and breaks the mood' },
    ],
    lighting: {
      ambient: '#05070a', outdoorAmbient: '#0a0d12', brightness: 0.4, clockTime: 0.2,
      fogEnd: 90, fogColor: '#0d1014',
      effects: ['ColorCorrection saturation -0.4 contrast 0.2', 'Atmosphere density 0.5 haze 3', 'Bloom intensity 0.4 threshold 1.4'],
    },
    pinned: PINS.horror,
    slots: [
      { need: 'ui_icon', query: 'skull eye key lock hand warning', tags: ['horror', 'dark', 'outline'], count: 6, why: 'horror UI is objects, not verbs: a key, a lock, a hand. Outline icons read at low brightness where a filled glyph turns into a blob' },
      { need: 'particle', query: 'dust mote fog wisp smoke soft', tags: ['smoke', 'dust', 'soft'], count: 3, why: 'floating dust in a torch beam is the single cheapest thing that makes a dark room feel like a place instead of an empty box' },
      { need: 'texture', query: 'peeling paint concrete rust stained plaster', tags: ['grunge', 'dirty', 'worn'], count: 4, why: 'horror is a surface genre — clean geometry with a decayed surface reads as horror, the same geometry clean reads as unfinished' },
      { need: 'sfx', query: 'stinger jumpscare creak heartbeat ambience', tags: ['horror'], count: 5, why: 'the pinned five cover the whole loop: dread, reveal, environment, motion, and the player\'s own body' },
      { need: 'prop', query: 'chair crate barrel lamp door locker', tags: ['old', 'wood', 'metal'], count: 6, why: 'sparse, familiar objects. A cluttered horror room has nowhere for the player to look, which is the opposite of the effect' },
    ],
    procedural: ['corridors from a modular 4-stud grid — horror geometry is repetition, which is what procedural is best at', 'flicker a PointLight by tweening Brightness rather than toggling Enabled', 'fog is Lighting.FogEnd and Atmosphere, never a mesh'],
  },
  {
    id: 'obby',
    name: 'Obby',
    pitch: 'Saturated blocks on a void skybox, a checkpoint every twenty seconds, and instant, readable death.',
    palette: [
      { role: 'base', hex: '#4fc3f7', why: 'sky blue void — obbies are read against emptiness so the platforms pop' },
      { role: 'surface', hex: '#ffffff', why: 'white neutral platforms, so a coloured platform always means something' },
      { role: 'accent', hex: '#ffd54f', why: 'yellow is the safe/checkpoint colour in every obby a player has already played' },
      { role: 'highlight', hex: '#66bb6a', why: 'green for the goal and for anything that helps' },
      { role: 'danger', hex: '#ef5350', why: 'red kills. This must be the ONLY red in the kit or the convention breaks' },
      { role: 'text', hex: '#1a237e', why: 'dark navy on bright surfaces — dark-on-light is the only combination readable on a phone in sunlight' },
    ],
    lighting: {
      ambient: '#8f9fb5', outdoorAmbient: '#b0c4de', brightness: 2.5, clockTime: 13.5,
      fogEnd: 2000, fogColor: '#c3e8ff',
      effects: ['Bloom intensity 0.6 threshold 2', 'no ColorCorrection — flat, bright and honest is the look'],
    },
    pinned: PINS.obby,
    slots: [
      { need: 'ui_icon', query: 'arrow star trophy timer heart restart', tags: ['flat', 'bold', 'rounded'], count: 6, why: 'thick, filled, rounded icons — obby players are mostly on phones and a 1px stroke disappears at that size' },
      { need: 'particle', query: 'sparkle star burst confetti', tags: ['sparkle', 'bright'], count: 3, why: 'a checkpoint with no burst does not feel like a reward, and the burst is the entire reward' },
      { need: 'texture', query: 'plastic neon smooth grid', tags: ['clean', 'flat'], count: 3, why: 'obby surfaces must never be busy: the player is reading edges at speed, and texture detail hides the edge' },
      { need: 'sfx', query: 'jump checkpoint respawn fanfare click', tags: ['obby'], count: 5, why: 'jump and death are the two sounds a player hears a thousand times, so they are the two that must not be annoying' },
      { need: 'prop', query: 'platform spinner conveyor cone barrier', tags: ['simple', 'bright'], count: 5, why: 'obstacles are geometry, not decor — the few props that exist are there to signal danger' },
    ],
    procedural: ['every platform is a Part — there is no mesh in a good obby', 'killbricks are Touched + Humanoid.Health = 0, and the visual is BrickColor red', 'moving platforms are TweenService on CFrame, never a physics body'],
  },
  {
    id: 'tycoon',
    name: 'Tycoon',
    pitch: 'An empty plot, a button you can afford, and a number that goes up while you watch.',
    palette: [
      { role: 'base', hex: '#2e3b46', why: 'slate industrial floor — the plot must look unfinished so buying feels like progress' },
      { role: 'surface', hex: '#8d9ba6', why: 'brushed steel for machinery, the visual language of a factory' },
      { role: 'accent', hex: '#43a047', why: 'money green, on the buy button and the cash counter and nowhere else' },
      { role: 'highlight', hex: '#ffb300', why: 'amber for a thing you cannot afford yet — the colour of wanting' },
      { role: 'danger', hex: '#e53935', why: 'only for the steal/collect-loss mechanic, if the game has one' },
      { role: 'text', hex: '#f5f7fa', why: 'near-white on dark industrial surfaces' },
    ],
    lighting: {
      ambient: '#5a6570', outdoorAmbient: '#8a95a0', brightness: 2, clockTime: 11,
      fogEnd: 1200, fogColor: '#9fb0bf',
      effects: ['Bloom intensity 0.3 threshold 2.2', 'ColorCorrection contrast 0.08'],
    },
    pinned: PINS.tycoon,
    slots: [
      { need: 'ui_icon', query: 'coin cash gear upgrade box arrow-up', tags: ['flat', 'bold'], count: 6, why: 'a tycoon UI is four verbs — buy, upgrade, collect, rebirth — and each needs one unmistakable glyph' },
      { need: 'particle', query: 'spark smoke steam dust', tags: ['industrial', 'smoke'], count: 3, why: 'steam off a machine is what makes a static dropper look like it is working' },
      { need: 'texture', query: 'metal plate concrete floor diamond tread rust', tags: ['metal', 'industrial'], count: 4, why: 'tread plate and poured concrete are what a factory floor reads as, instantly, with no explanation' },
      { need: 'sfx', query: 'cash register conveyor machine hum upgrade click', tags: ['tycoon'], count: 5, why: 'the cash sound is the reward loop; the machine hum is the only thing telling the player their plot is alive while they are away' },
      { need: 'prop', query: 'crate conveyor pipe barrel generator button', tags: ['industrial', 'metal'], count: 6, why: 'a tycoon is built from repeated industrial modules — variety here is scale and rotation, not new meshes' },
    ],
    procedural: ['droppers, conveyors and the plot grid are all Parts on a 4-stud module', 'the buy button is a Part + ProximityPrompt + a SurfaceGui price', 'cash is a leaderstats IntValue, saved with UpdateAsync, never a client number'],
  },
  {
    id: 'simulator',
    name: 'Simulator',
    pitch: 'Click, a number pops, the number is bigger than last time, and a pet follows you.',
    palette: [
      { role: 'base', hex: '#7c4dff', why: 'candy violet — simulator worlds are unreal on purpose and a naturalistic ground kills the whole register' },
      { role: 'surface', hex: '#ffffff', why: 'white, so every orb and pet colour reads at full saturation against it' },
      { role: 'accent', hex: '#00e5ff', why: 'cyan for currency and collectables' },
      { role: 'highlight', hex: '#ffea00', why: 'yellow for the rarity flash and the big popup number' },
      { role: 'danger', hex: '#ff4081', why: 'pink rather than red — nothing in a simulator should feel genuinely threatening' },
      { role: 'text', hex: '#2b2140', why: 'dark plum: the popup numbers are the UI and they must survive a bright background' },
    ],
    lighting: {
      ambient: '#a99ad6', outdoorAmbient: '#cfc4f0', brightness: 3, clockTime: 12.5,
      fogEnd: 1500, fogColor: '#d8ccff',
      effects: ['Bloom intensity 1 threshold 1.6 — blown-out is the intent', 'ColorCorrection saturation 0.25'],
    },
    pinned: PINS.simulator,
    slots: [
      { need: 'ui_icon', query: 'gem coin egg pet star chest sparkle', tags: ['rounded', 'bold', 'colorful'], count: 8, why: 'the whole genre is a shop, so the icon set IS the product — eight is the minimum that covers currencies, eggs and rarities' },
      { need: 'particle', query: 'sparkle star glow burst orb', tags: ['sparkle', 'glow', 'bright'], count: 4, why: 'every single collect needs a burst; without it the click has no feedback and the loop dies' },
      { need: 'texture', query: 'gradient candy smooth glossy', tags: ['clean', 'bright'], count: 3, why: 'glossy flat colour, never a material — simulator surfaces are meant to look like plastic toys' },
      { need: 'sfx', query: 'pop coin pickup sparkle rebirth level up', tags: ['simulator'], count: 5, why: 'the pop is heard more than any other sound in the game, so it is pinned and never re-picked' },
      { need: 'prop', query: 'egg chest orb pedestal crystal coin', tags: ['rounded', 'bright'], count: 6, why: 'eggs and chests are the two objects the player walks toward — everything else in the world is scenery' },
    ],
    procedural: ['popup numbers are a BillboardGui tweened up and faded, not a particle', 'pets are a part following with a BodyPosition on a lerped offset, one per player', 'currency is a leaderstats value; the popup is cosmetic and client-side'],
  },
  {
    id: 'racing',
    name: 'Racing',
    pitch: 'Asphalt, a countdown, and a speed the player can feel without reading a number.',
    palette: [
      { role: 'base', hex: '#2b2f33', why: 'asphalt grey, the only ground colour that makes speed lines readable' },
      { role: 'surface', hex: '#e0e0e0', why: 'white kerbs and lane lines — the track edge must be the highest-contrast thing on screen' },
      { role: 'accent', hex: '#ff6d00', why: 'orange for boost pads and the nitro bar' },
      { role: 'highlight', hex: '#00b0ff', why: 'electric blue for the speed trail, so boost reads as cold and fast' },
      { role: 'danger', hex: '#d50000', why: 'red only on the wall, the crash flash, and the last lap warning' },
      { role: 'text', hex: '#fafafa', why: 'white on a dark HUD strip — a racing HUD is read peripherally' },
    ],
    lighting: {
      ambient: '#6b7480', outdoorAmbient: '#9aa5b1', brightness: 2.2, clockTime: 16.5,
      fogEnd: 2500, fogColor: '#b9c6d4',
      effects: ['SunRays intensity 0.15', 'Bloom intensity 0.5 threshold 1.9', 'low-angle sun at clockTime 16.5 casts long shadows across the track, which is what sells speed'],
    },
    pinned: PINS.racing,
    slots: [
      { need: 'ui_icon', query: 'flag speedometer trophy timer arrow car', tags: ['sharp', 'bold'], count: 6, why: 'a racing HUD is glanced at, never read — sharp angular glyphs are legible in a tenth of a second' },
      { need: 'particle', query: 'smoke spark dust trail speed line', tags: ['smoke', 'trail'], count: 4, why: 'tyre smoke and a boost trail are the only two things communicating speed when the camera is locked behind the car' },
      { need: 'texture', query: 'asphalt road tarmac concrete kerb tyre', tags: ['road', 'ground'], count: 4, why: 'the track surface is 80% of every frame in this genre, so it is the one texture worth being picky about' },
      { need: 'sfx', query: 'engine rev tire screech crash boost countdown', tags: ['racing'], count: 5, why: 'the engine loop is the game\'s heartbeat and the countdown is the only moment the player is not moving' },
      { need: 'prop', query: 'cone barrier tyre stack sign grandstand flag', tags: ['track', 'metal'], count: 6, why: 'track furniture is what turns a grey ribbon into a circuit, and it is all repeated instances of five objects' },
    ],
    procedural: ['the track is Parts with Enum.Material.Asphalt — terrain roads are the wrong tool, they cannot hold a racing line', 'the car is GenerationService PredefinedSchema "Car5", which returns a body and four wheels', 'speed feel is camera FOV tweened with velocity, not actual velocity'],
  },
  {
    id: 'roleplay',
    name: 'Roleplay',
    pitch: 'A warm suburban house with working doors, where the point is other people.',
    palette: [
      { role: 'base', hex: '#9ccc65', why: 'lawn green — roleplay maps are read from above as a neighbourhood' },
      { role: 'surface', hex: '#f5e6d3', why: 'warm cream for walls: domestic interiors are warm, and a cool interior reads as a hospital' },
      { role: 'accent', hex: '#8d6e63', why: 'wood brown, on every door, floor and table' },
      { role: 'highlight', hex: '#ffca28', why: 'lamp-light amber for interior lighting after dark' },
      { role: 'danger', hex: '#e57373', why: 'soft red — this genre has no real danger, only notifications' },
      { role: 'text', hex: '#3e2723', why: 'dark brown rather than black, which keeps UI in the same warm family as the world' },
    ],
    lighting: {
      ambient: '#94a0ad', outdoorAmbient: '#c8d2dc', brightness: 2, clockTime: 15,
      fogEnd: 1800, fogColor: '#d9e4ef',
      effects: ['Bloom intensity 0.35 threshold 2', 'ColorCorrection tint warm, saturation 0.1'],
    },
    pinned: PINS.roleplay,
    slots: [
      { need: 'ui_icon', query: 'house car phone chat heart shop person', tags: ['rounded', 'friendly'], count: 8, why: 'roleplay UI is a phone menu — it needs the app-icon vocabulary players already know, and eight is one screen of it' },
      { need: 'particle', query: 'dust sunbeam leaf rain', tags: ['soft', 'subtle'], count: 3, why: 'subtle only: a roleplay scene with visible effects looks like a different genre' },
      { need: 'texture', query: 'wood floor wallpaper brick fabric carpet tile', tags: ['interior', 'warm', 'wood'], count: 6, why: 'domestic interiors are entirely surface — the geometry is boxes and the texture is what makes it a home' },
      { need: 'sfx', query: 'door open footsteps phone birds menu select', tags: ['roleplay'], count: 5, why: 'a door that makes a sound is the single change that makes a roleplay house feel inhabited' },
      { need: 'prop', query: 'sofa bed table chair lamp fridge tv plant', tags: ['furniture', 'interior'], count: 8, why: 'furniture is the one place this genre must not go procedural — a boxy sofa is instantly recognisable as a boxy sofa' },
    ],
    procedural: ['houses are a modular kit on a 5-stud grid with wedge roofs', 'doors are a HingeConstraint or a CFrame tween, plus ProximityPrompt', 'a roleplay map is a grid of the same four house shells re-coloured'],
  },
  {
    id: 'tower_defense',
    name: 'Tower Defence',
    pitch: 'A fixed path, a wave counter, and a placement grid the player reads from above.',
    palette: [
      { role: 'base', hex: '#4e7a3f', why: 'field green — the camera is high and top-down, so the ground is the background' },
      { role: 'surface', hex: '#c9a66b', why: 'dirt path sand: the enemy route must be visible in one glance from the top-down camera' },
      { role: 'accent', hex: '#29b6f6', why: 'blue is the player\'s side — towers, range circles, the buy panel' },
      { role: 'highlight', hex: '#ffd600', why: 'gold for cash and for a tower that can be upgraded' },
      { role: 'danger', hex: '#e53935', why: 'red is the enemy and the base health bar, never anything the player owns' },
      { role: 'text', hex: '#ffffff', why: 'white on the dark HUD strip at the bottom' },
    ],
    lighting: {
      ambient: '#7b8a72', outdoorAmbient: '#aab89e', brightness: 2.4, clockTime: 13,
      fogEnd: 3000, fogColor: '#cfe0c0',
      effects: ['no fog in practice — a top-down player must see the whole path', 'Bloom intensity 0.4 threshold 2'],
    },
    pinned: PINS.tower_defense,
    slots: [
      { need: 'ui_icon', query: 'tower turret shield sword coin wave skull upgrade', tags: ['flat', 'bold', 'game'], count: 8, why: 'every tower needs a card icon, and the card is how the player chooses — this is the highest-traffic icon set of any kit here' },
      { need: 'particle', query: 'muzzle flash explosion spark hit impact', tags: ['impact', 'spark'], count: 4, why: 'at a top-down distance a bullet is invisible; the muzzle flash and the hit spark are the only proof the tower is firing' },
      { need: 'texture', query: 'grass dirt path stone cobble sand', tags: ['ground', 'stylised'], count: 4, why: 'path against field is the single readability decision this genre lives or dies on' },
      { need: 'sfx', query: 'turret shoot place wave start enemy death explosion', tags: ['tower-defense'], count: 5, why: 'firing is continuous so it must be quiet and short; the wave-start horn is the only loud sound' },
      { need: 'prop', query: 'turret cannon barricade crate flag rock', tags: ['stylised', 'chunky'], count: 6, why: 'towers are read by SILHOUETTE from above, so chunky and distinct beats detailed every time' },
    ],
    procedural: ['the path is a series of waypoint Parts; enemies walk it with Humanoid:MoveTo', 'the placement grid is a 4-stud snap on a transparent Part', 'range indicators are a flat cylinder Part, not a decal'],
  },
  {
    id: 'fps_arena',
    name: 'FPS Arena',
    pitch: 'A small symmetric map, three weapons that feel different, and a hit marker that never lies.',
    palette: [
      { role: 'base', hex: '#3a3f44', why: 'gunmetal — an arena is architecture, and neutral architecture makes players readable' },
      { role: 'surface', hex: '#6b7075', why: 'mid grey walls; the entire palette exists so an enemy silhouette is the brightest thing on screen' },
      { role: 'accent', hex: '#00e676', why: 'green is your team and your health, the one hard convention of the genre' },
      { role: 'highlight', hex: '#ffab00', why: 'amber for the hit marker and pickups' },
      { role: 'danger', hex: '#ff1744', why: 'red is the enemy team and damage direction, and nothing else may be this colour' },
      { role: 'text', hex: '#eceff1', why: 'cool white HUD, read at the edge of vision' },
    ],
    lighting: {
      ambient: '#4c5358', outdoorAmbient: '#7c858c', brightness: 2, clockTime: 12,
      fogEnd: 600, fogColor: '#8b9399',
      effects: ['ColorCorrection contrast 0.15 saturation -0.1 — desaturating the world is what makes team colours pop', 'Bloom intensity 0.3 threshold 2.4'],
    },
    pinned: PINS.fps_arena,
    slots: [
      { need: 'ui_icon', query: 'crosshair bullet skull shield ammo grenade knife', tags: ['sharp', 'military', 'outline'], count: 7, why: 'FPS UI is peripheral — thin sharp glyphs at the screen edge, never a filled cartoon icon' },
      { need: 'particle', query: 'muzzle flash smoke spark blood impact tracer', tags: ['impact', 'spark', 'smoke'], count: 5, why: 'muzzle flash, impact spark and tracer are the three things telling a player whether they hit; nothing in this genre matters more' },
      { need: 'texture', query: 'concrete metal panel crate industrial painted', tags: ['industrial', 'metal'], count: 4, why: 'arena surfaces must be low-contrast and non-busy or an enemy at 60 studs disappears into the wall' },
      { need: 'sfx', query: 'gunshot reload bullet impact grenade headshot', tags: ['fps'], count: 5, why: 'the headshot ding is the reward loop of the genre; the reload is how a player tracks their own state without looking' },
      { need: 'prop', query: 'crate barrier sandbag pillar ramp container', tags: ['cover', 'industrial'], count: 6, why: 'every prop in an arena is cover, so it is chosen for its hitbox first and its appearance second' },
    ],
    procedural: ['the arena is Parts on a 4-stud grid — symmetry is the design, and symmetry is a for-loop', 'shooting is a server-validated raycast; the client only plays the effect', 'the hit marker is a client GUI on a RemoteEvent the server fires'],
  },
  {
    id: 'anime_battle',
    name: 'Anime Battle',
    pitch: 'Stand still, charge, the screen shakes, and something enormous comes out of your hands.',
    palette: [
      { role: 'base', hex: '#1b1035', why: 'deep indigo night — the genre is read at night because every effect is emissive' },
      { role: 'surface', hex: '#3b2b63', why: 'violet stone, dark enough that an aura is the brightest thing in frame' },
      { role: 'accent', hex: '#00e5ff', why: 'cyan energy, the default ki colour players expect' },
      { role: 'highlight', hex: '#ff4081', why: 'magenta for the second element, so two players\' auras never read as the same power' },
      { role: 'danger', hex: '#ff3d00', why: 'orange-red for damage numbers, which are enormous in this genre' },
      { role: 'text', hex: '#ffffff', why: 'white with a heavy stroke — damage numbers must survive being drawn over a glowing aura' },
    ],
    lighting: {
      ambient: '#241a42', outdoorAmbient: '#3a2c66', brightness: 1.5, clockTime: 22,
      fogEnd: 1200, fogColor: '#241a42',
      effects: ['Bloom intensity 1.4 threshold 1.2 — the aura IS the bloom', 'ColorCorrection saturation 0.3 contrast 0.15'],
    },
    pinned: PINS.anime_battle,
    slots: [
      { need: 'ui_icon', query: 'sword fist star lightning fire aura skull scroll', tags: ['bold', 'energy', 'game'], count: 8, why: 'every ability needs a hotbar glyph and the hotbar is always visible, so this set is on screen 100% of the time' },
      { need: 'particle', query: 'energy aura lightning spark glow beam shockwave', tags: ['glow', 'energy', 'bright'], count: 6, why: 'this is the only kit where VFX is the gameplay rather than the dressing, which is why it takes six and every other kit takes three' },
      { need: 'texture', query: 'rock cracked stone cliff dirt ash', tags: ['rock', 'dark'], count: 3, why: 'the ground exists to be destroyed and to be dark — three is genuinely enough' },
      { need: 'sfx', query: 'energy charge sword slash power up impact teleport', tags: ['anime'], count: 5, why: 'charge-then-release is the entire combat grammar, and the charge sound is what makes the wait feel like power' },
      { need: 'prop', query: 'rock pillar crystal debris torii boulder', tags: ['rock', 'stylised'], count: 5, why: 'floating rubble around a charging player is the cheapest possible "this character is strong" signal' },
    ],
    procedural: ['auras are ParticleEmitter + PointLight + a Beam, all property values and zero assets', 'screen shake is a CFrame offset on the Camera in RenderStepped', 'damage numbers are pooled BillboardGuis, tweened and recycled — never created per hit'],
  },
  {
    id: 'survival',
    name: 'Survival',
    pitch: 'Night is coming, you have an axe, and the fire needs wood.',
    palette: [
      { role: 'base', hex: '#3e4a34', why: 'forest floor olive — desaturated nature so the fire is the only warm thing' },
      { role: 'surface', hex: '#6b5b4a', why: 'bark and mud brown for everything the player builds' },
      { role: 'accent', hex: '#ff8f00', why: 'firelight orange: the campfire is the safe zone and the only source of this colour' },
      { role: 'highlight', hex: '#a5d6a7', why: 'pale green for harvestable resources, so the player can scan for them' },
      { role: 'danger', hex: '#c62828', why: 'health and the night threat' },
      { role: 'text', hex: '#efebe9', why: 'bone white on the dark inventory panel' },
    ],
    lighting: {
      ambient: '#3c4636', outdoorAmbient: '#6d7a5e', brightness: 1.6, clockTime: 17.5,
      fogEnd: 700, fogColor: '#6f7a63',
      effects: ['Atmosphere density 0.4 haze 2', 'ColorCorrection saturation -0.15', 'the day/night cycle IS the game loop — tween ClockTime, do not set it once'],
    },
    pinned: PINS.survival,
    slots: [
      { need: 'ui_icon', query: 'axe wood fire food water heart backpack tent', tags: ['outline', 'rugged'], count: 8, why: 'survival UI is an inventory, and an inventory needs one legible glyph per resource or the player cannot read their own state' },
      { need: 'particle', query: 'fire ember smoke rain snow leaf', tags: ['fire', 'smoke', 'weather'], count: 5, why: 'fire and weather are the two systems the player watches; embers rising off a campfire is the signature frame of the genre' },
      { need: 'texture', query: 'bark wood grain dirt moss stone rock', tags: ['nature', 'organic'], count: 5, why: 'a survival world is entirely natural surface, and the built things are made of the same materials on purpose' },
      { need: 'sfx', query: 'campfire chop wood craft eat wolf howl', tags: ['survival'], count: 5, why: 'the fire loop is continuous safety and the howl is the only thing that interrupts it — the whole tension is those two sounds' },
      { need: 'foliage', query: 'tree pine bush fern grass rock', tags: ['nature', 'forest'], count: 6, why: 'the one kit where foliage is mandatory and procedural is banned: parts-and-wedges trees look amateur at any part count' },
    ],
    procedural: ['shelters are Parts on a 4-stud grid — the player builds them, so they must be cheap', 'the campfire is a ParticleEmitter, a PointLight and a Sound; no mesh is needed for fire', 'hunger and temperature are server timers, never client values'],
  },
  {
    id: 'adventure',
    name: 'Adventure',
    pitch: 'A landmark on the horizon, a path that bends toward it, and a chest just off the path for whoever looks.',
    palette: [
      { role: 'base', hex: '#4f7d3b', why: 'meadow green — the ground is walked across for the whole session, so it recedes and lets the route read' },
      { role: 'surface', hex: '#b59a72', why: 'weathered sandstone for paths, walls and ruins: the warm, light surface is the one the player follows' },
      { role: 'accent', hex: '#2fa3c9', why: 'river teal for points of interest — the shrine, the gate, the portal — so the next goal is a colour, not a waypoint arrow' },
      { role: 'highlight', hex: '#ffc93c', why: 'treasure gold on chests, collectibles and the quest marker only; gold anywhere else teaches the player to chase scenery' },
      { role: 'danger', hex: '#d64533', why: 'traps and enemies, and never used on decoration, so a red thing on the path always means stop' },
      { role: 'text', hex: '#fff8e7', why: 'parchment white with a dark stroke — the quest log and map read as paper against a bright outdoor scene' },
    ],
    lighting: {
      ambient: '#6f7f8f', outdoorAmbient: '#a8b8a0', brightness: 2.6, clockTime: 9.5,
      fogEnd: 1600, fogColor: '#bcd3d6',
      effects: ['Atmosphere density 0.3 haze 1.5 — aerial haze is what makes the far landmark read as far', 'SunRays intensity 0.1', 'Bloom intensity 0.4 threshold 2', 'morning sun at clockTime 9.5 throws long shadows that give cliffs and ruins depth'],
    },
    pinned: PINS.adventure,
    slots: [
      { need: 'ui_icon', query: 'compass map scroll key chest quest-marker heart backpack', tags: ['parchment', 'bold', 'outline'], count: 8, why: 'adventure UI is a quest log, a compass and a bag — each needs one glyph a child can find at a glance, and a quest marker that matches the gold highlight' },
      { need: 'particle', query: 'sparkle glint firefly waterfall mist dust', tags: ['sparkle', 'soft', 'nature'], count: 4, why: 'a glint on a collectible is how the world says "look here" without a HUD arrow; mist at a waterfall tells the player the area is worth walking to' },
      { need: 'texture', query: 'mossy stone sandstone brick grass dirt path wood planks', tags: ['stylised', 'nature', 'ancient'], count: 5, why: 'the path, the ruin and the meadow must be three different surfaces from a distance, because route-reading is the whole skill of the genre' },
      { need: 'sfx', query: 'chest open item pickup sword swing discovery sting portal', tags: ['adventure'], count: 5, why: 'the discovery sting and the chest are the reward loop; the swing is the only combat sound, and the portal marks leaving one zone for the next' },
      { need: 'prop', query: 'ruin pillar arch chest signpost bridge statue', tags: ['ancient', 'stylised', 'chunky'], count: 6, why: 'adventure props are landmarks and gates — chunky silhouettes the player navigates by, placed where the path turns' },
    ],
    procedural: ['the world is zones joined by chokepoints — a bridge, a gate, a cave mouth — each built from Parts and Terrain, with the next landmark visible from the chokepoint', 'chests are a Model + ProximityPrompt; the loot roll is on the server and the lid is a CFrame tween', 'quest steps are server-owned values sent to a client ScreenGui — the client never decides a quest is complete'],
  },
];

const BY_ID = new Map<string, GenreKit>(GENRE_KITS.map((k) => [k.id, k]));

/** Null for an unknown name — a kit that does not exist must not be invented. */
export function getGenreKit(id: string): GenreKit | null {
  return BY_ID.get(id) ?? null;
}

/** The needs a kit covers, in slot order. */
export function kitSlotNeeds(kit: GenreKit): AssetKind[] {
  return kit.slots.map((s) => s.need);
}
