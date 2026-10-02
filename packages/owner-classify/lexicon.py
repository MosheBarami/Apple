"""Generic vocabularies shared by the classifier (item side) and the query parser (request side).

Nothing here names a particular object a user might ask for: these are the closed taxonomy words (what KIND of thing a
word names), the colour words, the size words and the stop words. "generalize-not-patch": a request nobody has tried
is handled by the same word lists as one that was tried, and a new subject needs no new line of code.
"""
import re

# ---- text -------------------------------------------------------------------------------------------------------------

STOP = set('''a an the and or of for to in on at by with without from into onto over under about around near that this these those
it its is are be can could would should will shall may might do does did i me my mine we us our you your he she they them their
want need like make made build create give get spawn add have has had some any one two three please pls plz just really very
super too also as if so up out there here where when while which who whom what how than then no not only own more most much
many such using use used shows show showing see seen look looks looking something thing things stuff kind sort type game games
roblox'''.split())

# Words of a request that describe the thing's quality/size/colour, not its identity: kept as facets, not as search words.
GENERIC_NAMES = set('''model part parts handle mesh meshpart union unionoperation folder frame textlabel textbutton imagelabel
imagebutton screengui surfacegui billboardgui animation sound script localscript modulescript tool workspace object
objects item items new copy clone default template untitled cube sphere block cylinder wedge meshes mesh'''.split())

SERVICE_SEGMENTS = set('''workspace replicatedstorage serverstorage serverscriptservice startergui starterpack starterplayer
starterplayerscripts startercharacterscripts lighting soundservice replicatedfirst players teams chat textchatservice
gamemodules game'''.split())

# Child names that say nothing about what a thing is.
GENERIC_CHILDREN = set('''part parts handle mesh meshpart union unionoperation folder model weld wedge cylinder block sphere
wedgepart cornerwedgepart attachment motor6d script localscript modulescript uilistlayout uicorner uistroke uipadding
uigradient uiscale uigridlayout uiaspectratioconstraint frame textlabel textbutton imagelabel imagebutton decal texture
surfaceappearance sound pointlight spotlight surfacelight highlight sparkles configuration stringvalue numbervalue
boolvalue intvalue objectvalue clickdetector proximityprompt bodygyro bodyvelocity humanoid humanoidrootpart head torso
leftarm rightarm leftleg rightleg'''.split())


def singular(w):
    if len(w) > 4 and re.search(r'(ch|sh|x|s|z)es$', w):
        return w[:-2]
    if len(w) > 4 and w.endswith('ies'):
        return w[:-3] + 'y'
    if len(w) > 3 and w.endswith('s') and not w.endswith('ss') and not w.endswith('us'):
        return w[:-1]
    return w


def variants(w):
    """The forms a lexicon entry may take: waving -> wave, runs -> run, running -> run, jumped -> jump."""
    out = [w, singular(w)]
    for suf in ('ing', 'ed'):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            b = w[:-len(suf)]
            out += [b, b + 'e']
            if len(b) > 2 and b[-1] == b[-2]:
                out.append(b[:-1])
    return out


def split_words(text):
    """'ShopFrame', 'Skibidi_Toilet', 'dance3' -> shop frame / skibidi toilet / dance 3 (lower case, no digits-only words)."""
    text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
    text = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', text)
    text = re.sub(r'([A-Za-z])([0-9])', r'\1 \2', text)
    return [w for w in re.split(r'[^A-Za-z0-9]+', text.lower()) if w and not w.isdigit()]


# ---- colours ----------------------------------------------------------------------------------------------------------

COLOURS = {
    'red': 'cc2222', 'dark red': '8b1a1a', 'maroon': '6b1428', 'crimson': 'dc143c', 'orange': 'f08a24', 'gold': 'e6b422',
    'yellow': 'f5d530', 'lime': 'a4d62e', 'green': '3aa645', 'dark green': '1f5d2a', 'olive': '6b7a2a', 'teal': '1f8f8f',
    'cyan': '25d3e8', 'sky blue': '7ec8f0', 'blue': '2f6fd8', 'navy': '1b2a6b', 'purple': '7e3fb8', 'violet': 'a06be0',
    'magenta': 'd02ba8', 'pink': 'f28cb8', 'hot pink': 'ff3d9a', 'brown': '7a4a28', 'tan': 'c9a574', 'beige': 'e6d5b8',
    'white': 'f2f2f2', 'light grey': 'c4c4c4', 'grey': '8a8a8a', 'dark grey': '4a4a4a', 'black': '161616', 'silver': 'b8bcc2',
}
# Request words -> the colour they ask for (also what an item palette entry is named by).
COLOUR_WORDS = {
    'red': 'red', 'scarlet': 'red', 'ruby': 'red', 'crimson': 'crimson', 'maroon': 'maroon', 'burgundy': 'maroon',
    'orange': 'orange', 'amber': 'orange', 'tangerine': 'orange', 'gold': 'gold', 'golden': 'gold', 'yellow': 'yellow',
    'lemon': 'yellow', 'blonde': 'yellow', 'lime': 'lime', 'green': 'green', 'emerald': 'green', 'olive': 'olive',
    'teal': 'teal', 'turquoise': 'cyan', 'cyan': 'cyan', 'aqua': 'cyan', 'blue': 'blue', 'azure': 'sky blue', 'navy': 'navy',
    'purple': 'purple', 'violet': 'violet', 'lavender': 'violet', 'magenta': 'magenta', 'pink': 'pink', 'rose': 'pink',
    'brown': 'brown', 'chocolate': 'brown', 'tan': 'tan', 'beige': 'beige', 'cream': 'beige', 'white': 'white',
    'grey': 'grey', 'gray': 'grey', 'silver': 'silver', 'black': 'black', 'dark': None, 'light': None, 'bright': None,
}
COLOUR_PHRASES = {'hot pink': 'hot pink', 'light blue': 'sky blue', 'sky blue': 'sky blue', 'dark blue': 'navy',
                  'dark green': 'dark green', 'dark red': 'dark red', 'dark grey': 'dark grey', 'dark gray': 'dark grey',
                  'light grey': 'light grey', 'light gray': 'light grey', 'neon pink': 'hot pink'}


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lab(rgb):
    r, g, b = (_lin(c) for c in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


# Fully saturated screen colours (Roblox's "Really blue" is 0000ff) sit far from the mid-tone anchors above; they are extra
# anchors for the plain names, so a pure blue is called blue and a request for blue matches it.
BRIGHT = {'red': 'ff0000', 'orange': 'ff8000', 'yellow': 'ffff00', 'green': '00ff00', 'cyan': '00ffff', 'blue': '0000ff', 'magenta': 'ff00ff',
          'pink': 'ff66cc', 'purple': '8000ff', 'lime': '80ff00'}
COLOUR_LAB = {n: lab(hex_rgb(h)) for n, h in COLOURS.items()}
ANCHORS = {n: [l] for n, l in COLOUR_LAB.items()}
for _n, _h in BRIGHT.items():
    ANCHORS[_n].append(lab(hex_rgb(_h)))


def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def colour_name(hexv):
    """Nearest named colour to a hex value, and its hue family (what a person would call it)."""
    try:
        L = lab(hex_rgb(hexv))
    except (ValueError, TypeError):
        return None
    return min(ANCHORS, key=lambda n: min(dist(L, a) for a in ANCHORS[n]))


FAMILY = {'dark red': 'red', 'maroon': 'red', 'crimson': 'red', 'lime': 'green', 'dark green': 'green', 'olive': 'green',
          'teal': 'cyan', 'sky blue': 'blue', 'navy': 'blue', 'violet': 'purple', 'magenta': 'pink', 'hot pink': 'pink',
          'tan': 'brown', 'beige': 'white', 'light grey': 'grey', 'dark grey': 'grey', 'silver': 'grey'}


def colour_family(name):
    return FAMILY.get(name, name)


# ---- size -------------------------------------------------------------------------------------------------------------

SIZE_CLASSES = [('tiny', 2), ('small', 8), ('medium', 30), ('large', 120), ('huge', 1e12)]


def size_class(maxdim):
    for name, top in SIZE_CLASSES:
        if maxdim < top:
            return name
    return 'huge'


# Request size words -> class (a soft preference unless a number was given).
SIZE_WORDS = {'tiny': 'tiny', 'mini': 'tiny', 'miniature': 'tiny', 'microscopic': 'tiny', 'small': 'small', 'little': 'small',
              'medium': 'medium', 'large': 'large', 'big': 'large', 'huge': 'huge', 'giant': 'huge', 'gigantic': 'huge',
              'massive': 'huge', 'enormous': 'huge', 'colossal': 'huge', 'towering': 'huge', 'tall': None}
NUMBER_WORDS = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
                'couple': 2, 'few': 3, 'dozen': 12, 'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
                'seventy': 70, 'eighty': 80, 'ninety': 90, 'hundred': 100, 'thousand': 1000}

# ---- taxonomy ---------------------------------------------------------------------------------------------------------

TYPES = ('model', 'map', 'system', 'ui-kit', 'ui-screen', 'tool', 'animation', 'vfx', 'sfx', 'music', 'script', 'media-pack')

# Request words that name a TYPE outright.
TYPE_WORDS = {
    'map': 'map', 'level': 'map', 'arena': 'map', 'world': 'map', 'island': 'map', 'obby': 'map',
    'interface': 'ui-kit', 'ui': 'ui-kit', 'gui': 'ui-kit', 'hud': 'ui-kit', 'menu': 'ui-kit', 'menus': 'ui-kit',
    'screen': 'ui-screen', 'window': 'ui-screen', 'panel': 'ui-screen',
    'sound': 'sfx', 'sfx': 'sfx', 'noise': 'sfx', 'audio': 'sfx', 'music': 'music', 'song': 'music', 'soundtrack': 'music',
    'animation': 'animation', 'animations': 'animation', 'emote': 'animation',
    'effect': 'vfx', 'vfx': 'vfx', 'particle': 'vfx', 'particles': 'vfx', 'tool': 'tool', 'gadget': 'tool',
    'script': 'script', 'icon': 'media-pack', 'icons': 'media-pack', 'system': 'system',
}

SUBTYPES = {
    'model': {
        'creature': '''pet animal monster creature beast dragon dinosaur dino zombie alien dog cat horse cow pig sheep goat
            chicken duck goose turkey rabbit bunny mouse rat squirrel fox wolf bear lion tiger leopard cheetah panther elephant
            giraffe zebra hippo hippopotamus rhino rhinoceros monkey ape gorilla orangutan chimp panda koala kangaroo camel llama
            alpaca deer moose bison buffalo bat owl eagle hawk falcon parrot toucan penguin flamingo peacock swan crow raven
            pigeon seagull bird dolphin whale shark fish octopus squid crab lobster turtle tortoise frog toad snake lizard
            crocodile alligator gecko spider scorpion ant bee wasp butterfly beetle bug worm snail slug trex raptor stegosaurus
            unicorn pegasus griffin phoenix kraken yeti bigfoot goblin ogre troll skeleton mummy werewolf demon imp slime
            blob puppy kitten cub hamster pony donkey rooster hen chick cockroach mosquito fly jellyfish seal otter sloth
            hedgehog skunk raccoon badger boar pigeon brainrot mob egg pets animals creatures monsters mobs dinos''',
        'character': '''character npc player human man woman boy girl kid child person people avatar hero villain knight
            soldier guard police cop doctor nurse chef farmer pirate ninja wizard mage witch king queen prince princess robot
            mannequin rig dummy civilian villager skin morph characters npcs outfit''',
        'vehicle': '''car truck bus van bike bicycle motorcycle scooter boat ship yacht submarine plane airplane jet helicopter
            heli tank train tram rocket spaceship ufo cart wagon taxi ambulance tractor kart vehicle jeep limo canoe raft sled
            paddleboat vehicles cars bikes boats planes trucks''',
        'building': '''house building tower castle hut cabin shop store hospital school church temple barn shed garage station
            mansion skyscraper apartment hotel bank restaurant cafe hall prison jail lighthouse bridge gate wall stairs room
            base bunker tent igloo pyramid fort mill windmill buildings houses shops structure arch fountain statue monument
            pavilion gazebo booth kiosk stand''',
        'furniture': '''chair sofa couch bed table desk lamp shelf bookshelf cabinet wardrobe dresser stool bench bathtub toilet
            sink fridge stove oven tv television mirror rug carpet curtain piano drawer nightstand throne bookcase fireplace
            cupboard counter furniture armchair ottoman closet sofas chairs beds tables lamps''',
        'plant': '''tree bush flower plant grass palm cactus mushroom leaf vine crop bamboo fern pine oak seed wheat rose
            trees plants flowers bushes shrub hedge sapling stump log''',
        'weapon': '''sword gun rifle pistol bow arrow axe knife dagger spear shield bomb grenade cannon laser blaster staff wand
            katana shotgun sniper smg revolver machete whip mace flail weapon weapons swords guns''',
        'food': '''food burger pizza cake cookie donut doughnut apple banana orange lemon fruit bread cheese taco burrito sandwich
            hotdog fries soda cola drink juice coffee tea milk candy chocolate icecream pie soup sushi steak bacon pasta noodle
            watermelon pineapple avocado strawberry grape carrot vegetable foods fruits drinks snack''',
        'trap': '''trap spike spikes mine landmine hazard saw pit traps killbrick obstacle''',
        'pickup': '''coin gem diamond crystal key orb powerup pickup collectible token star heart potion loot treasure ticket
            gift present coins gems keys potions chest crate''',
        'terrain': '''rock stone boulder mountain hill cliff island cave ground terrain path road lava water river lake pond
            waterfall volcano floor baseplate sand dune ice rocks stones''',
        'machine': '''treadmill pump machine engine generator computer laptop keyboard phone radio camera printer robot arm
            conveyor elevator escalator door gate switch button lever fan turbine clock gauge sign signpost'''
    },
    'vfx': {
        'fire': 'fire flame flames burn burning torch campfire ember embers lava exhaust',
        'explosion': 'explosion explode blast bomb boom meteor fireball impact crash shockwave nuke',
        'smoke': 'smoke steam mist fog cloud dust spray vapor haze',
        'magic': 'magic spell aura shield heal healing sparkle sparkles glow rune enchant buff power charge teleport portal',
        'water': 'water splash wave bubble bubbles rain waterfall drip ripple',
        'electric': 'lightning thunder electric electricity spark sparks shock zap tesla',
        'weather': 'snow rain storm wind tornado blizzard leaves petals',
        'combat': 'slash hit blood punch trail swing sword muzzle bullet shot hurt damage',
    },
    'sfx': {
        'ui': 'click button pop hover ding notification menu select tick beep chime blip confirm cancel error buy',
        'impact': 'hit punch explosion explode crash smash break boom thud slam bang',
        'weapon': 'gun shot shoot reload sword slash swing laser bullet fire cannon',
        'vehicle': 'engine horn siren car honk motor ambulance police train plane helicopter',
        'voice': 'scream groan laugh cry voice hello hurt pain yell shout cough sneeze talk whisper grunt moan burp',
        'ambient': 'wind rain ocean waves birds crowd ambience ambient forest cave night crickets thunder fire river',
        'pickup': 'coin collect pickup reward win success level powerup',
        'footstep': 'footstep footsteps step walk run jump land',
        'music': 'music song theme loop soundtrack ost bgm track melody',
    },
    'animation': {
        'locomotion': 'idle walk run jump fall climb swim sprint crouch crawl fly float',
        'emote': 'dance wave point cheer laugh salute sit bow clap hello greet shrug sleep celebrate',
        'combat': 'attack punch slash shoot swing kick block dodge stab throw aim reload death die hit',
        'tool': 'equip hold unequip use tool drink eat open',
    },
}
SUBTYPE_WORDS = {t: {st: set(ws.split()) for st, ws in d.items()} for t, d in SUBTYPES.items()}

# Folder words that say what everything beneath them is (weighted higher than a lone name word).
MUSIC_WORDS = set('music song theme soundtrack ost bgm track melody loop'.split())
