"""Phase 2: the deterministic classifier for the owner library. READ-ONLY over owner-library/; writes one JSON line per
content hash (plus systems, UI kits and art-pack items) to a SIDECAR directory outside owner-library/, because the live
gateway reloads files inside owner-library/ when their signature changes.

    python3 classify.py [--lib DIR] [--out DIR] [--games N]

Everything here is derived from files already on disk (assets, verify entries, pieces, bounds, style, families, ui,
systems, media, knowledge cards): no model, no network, no Studio. Fields a model would add (a natural-language
sentence, theme tags) are left to the optional sample pass; every record says which fields are derived.

Schema (one record per content hash; see README.md):
  id, refs[], copies, type, subtype, name, name_clean, context, contains, description, tags[], game_tags[], look,
  colour{top[],hues[],saturation}, size{studs,class,conf}, composition{}, quality{score,band,reasons[]}, image{},
  provenance{}, near, confidence{}
"""
import argparse
import collections
import glob
import hashlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lexicon as L

DEFAULT_LIB = os.path.expanduser('~/Library/Application Support/Apple/owner-library')
DEFAULT_OUT = os.path.expanduser('~/Library/Application Support/Apple/owner-classify')
LICENCE = 'owner-attested-commercial-use'
THUMBS_PRESENT = False  # set by build() when <out>/thumbs holds pictures


def jload(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


# ---- reading the library (read-only) ---------------------------------------------------------------------------------

class Library:
    def __init__(self, lib):
        self.lib = lib
        j = lambda n, d=None: jload(os.path.join(lib, n), d)
        self.assets = (j('assets.json') or {}).get('assets', [])
        self.catalog = {g['id']: g for g in (j('catalog.json') or {}).get('games', []) if 'error' not in g}
        self.names = {k: v for k, v in (j('names.json') or {}).items() if v}
        fams = (j('families.json') or {}).get('families', [])
        self.family = {}
        for f in fams:
            for m in f['members']:
                self.family[m['id']] = dict(slug=f['id'], name=f.get('name'), primary=f['primary'], duplicate=bool(m.get('duplicate')),
                                            versions=len(f['members']))
        self.pieces = {(p['game'], p['path']): p for p in (j('pieces.json') or [])}
        self.style = (j('style.json') or {}).get('games', {})
        self.integrity = j('integrity.json') or {}
        self.systems = (j('systems.json') or {}).get('systems', [])
        ui = j('ui.json') or {}
        self.ui_screens = {(s['gameId'], s['path']): s for s in ui.get('screens', [])}
        self.ui_kits = ui.get('kits', [])
        self.media = (j('media.json') or {}).get('items', [])
        self.knowledge = {}
        for f in glob.glob(os.path.join(lib, 'knowledge', '*.json')):
            d = jload(f)
            if d and d.get('game'):
                self.knowledge[d['game']] = d

    def title(self, gid):
        g = self.catalog.get(gid, {})
        fam = self.family.get(gid)
        return self.names.get(gid[:12]) or (fam['name'] if fam and fam.get('name') and fam['primary'] == gid else g.get('name')) or gid[:12]

    def entries(self, gid):
        d = jload(os.path.join(self.lib, 'entries', gid + '.verify.json'))
        return (d or {}).get('assets', {})

    def bounds(self, gid):
        d = jload(os.path.join(self.lib, 'bounds', gid + '.profile.json'))
        return (d or {}).get('assets', {})


# ---- per-field derivations -------------------------------------------------------------------------------------------

def name_words(name):
    return [L.singular(w) for w in L.split_words(name)]


def is_generic(name):
    ws = L.split_words(name)
    return not ws or all(w in L.GENERIC_NAMES for w in ws)


def path_words(path, name):
    segs = [s for s in path.split('/') if s][:-1]
    segs = [s for s in segs if s.lower().replace(' ', '') not in L.SERVICE_SEGMENTS][-3:]
    return segs


def vote(words, lexicon, weight):
    out = collections.Counter()
    for w in words:
        for st, ws in lexicon.items():
            if any(v in ws for v in L.variants(w)):
                out[st] += weight
    return out


def subtype_for(type_, name, segs, children):
    lex = L.SUBTYPE_WORDS.get(type_)
    if not lex:
        return None
    votes = vote(name_words(name), lex, 3)
    for seg in segs:  # the nearest folder counts most
        votes.update(vote(name_words(seg), lex, 2))
    votes.update(vote([w for c in children for w in name_words(c)], lex, 1))
    if not votes:
        return 'other'
    return max(votes.items(), key=lambda kv: (kv[1], kv[0] != 'prop'))[0]


def kind_type(a, name_ws, segs):
    k = a['k']
    if k == 'sound':
        ws = set(name_ws) | {w for s in segs for w in name_words(s)}
        return 'music' if ws & L.MUSIC_WORDS else 'sfx'
    return {'model': 'model', 'map': 'map', 'tool': 'tool', 'ui': 'ui-screen', 'fx': 'vfx', 'animation': 'animation',
            'script': 'script'}[k]


def colour_block(hexes, shares=None):
    """Top colours of an item. `shares` (measured, by volume) when the pass has them, else rank weights 0.5/0.3/0.2."""
    hexes = [h for h in (hexes or []) if h and len(h) == 6]
    if not hexes:
        return None
    if shares and len(shares) == len(hexes) and sum(shares) > 0:
        weights, kind = list(shares), 'volume'
    else:
        weights, kind = ([0.5, 0.3, 0.2][:len(hexes)] if len(hexes) > 1 else [1.0]), 'rank'
    scale = sum(weights)
    top = []
    for h, w in zip(hexes, weights):
        n = L.colour_name(h)
        top.append(dict(hex=h, name=n, hue=L.colour_family(n), share=round(w / scale, 2)))
    rgb = L.hex_rgb(hexes[0])
    mx, mn = max(rgb), min(rgb)
    sat = 'neutral' if (mx - mn) < 24 else 'vivid' if (mx - mn) > 110 else 'muted'
    return dict(top=top, hues=sorted({t['hue'] for t in top}), saturation=sat, share_kind=kind)


def size_block(dims, src):
    if not dims or len(dims) != 3:
        return dict(studs=None, cls=None, conf='none')
    d = [round(float(x), 1) for x in dims]
    mx = max(d)
    if mx > 5000 or mx <= 0:
        return dict(studs=d, cls=None, conf='none')  # junk bounds (a sky plane, a 1,000,000-stud map): not trusted
    return dict(studs=d, cls=L.size_class(mx), conf='measured' if src == 'pieces' else 'bounds')


def dims_from_bounds(b):
    try:
        return [round(b['max'][i] - b['min'][i], 1) for i in range(3)]
    except (KeyError, TypeError, IndexError):
        return None


def look_for(style, row_ui, type_):
    """studded | flat | cartoon | glossy | minimal | default (UI) from the game's measured style and the UI category."""
    if type_ in ('ui-screen', 'ui-kit') and row_ui:
        cat = row_ui.get('category') or ''
        for key, out in (('glossy', 'glossy'), ('cartoon', 'cartoon'), ('minimal', 'minimal'), ('default', 'default'),
                         ('pixel', 'pixel'), ('flat', 'flat'), ('clean', 'minimal')):
            if key in cat:
                return out
    if style and style.get('parts'):
        if style.get('modernStudShare', 0) >= 0.15 or style.get('studShare', 0) >= 0.2:
            return 'studded'
        if style.get('colorShare', 0) >= 0.5:
            return 'cartoon'
        return 'flat'
    return None


def quality_block(rec):
    """Deterministic rubric, 100 points; criteria whose evidence does not exist yet are left out of the denominator."""
    r = rec['_q']
    t = rec['type']
    pts, avail, reasons = 0, 0, []

    def add(got, top, why_not=None):
        nonlocal pts, avail
        pts += got
        avail += top
        if why_not and got < top:
            reasons.append(why_not)

    add({'yes': 25, 'partly': 12}.get(r.get('works'), 6), 25, {'partly': 'code partly intact', 'looks only': 'looks only, code not working'}.get(r.get('works'), 'works unknown'))
    if t in ('model', 'map', 'tool', 'vfx', 'ui-screen', 'script'):
        add(15 if not r.get('needs') and not r.get('content') else 6, 15, 'needs outside content ids or other assets')
    if t in ('model', 'tool', 'vfx'):
        p = rec['composition']['parts']
        add(15 if 1 <= p <= 400 else 7 if p > 400 else 0, 15, 'empty' if p == 0 else 'very large (%d parts)' % p)
    elif t == 'map':
        add(15 if rec['composition']['parts'] >= 20 else 6, 15, 'sparse map')
    elif t == 'ui-screen':
        u = r.get('ui') or {}
        d = u.get('defects') or {}
        add(15 if u.get('clean') and not d.get('block') else 5, 15, 'UI defects found')
    add(0 if rec['_generic'] else 10, 10, 'generic name')
    integ = r.get('integrity') or {}
    add(10 if not integ.get('panicked') else 0, 10, 'script integrity problems')
    if t in ('model', 'tool', 'map', 'vfx'):
        s = rec['size']
        if s['studs'] and s['conf'] != 'none':
            add(10, 10)
        elif s['studs']:
            add(2, 10, 'junk or enormous bounds')
        else:
            add(5, 10, 'size unknown')
    # the visual-presence criterion (10 points) exists once thumbnails have been rendered for the physical types at all
    if THUMBS_PRESENT and t in ('model', 'tool', 'map', 'vfx'):
        add(10 if rec['image']['status'] == 'ok' else 0, 10, 'no usable thumbnail')
    add(5 if r.get('primary', True) else 0, 5, 'copy of a version of another game')
    score = round(100 * pts / avail) if avail else 0
    band = 'A' if score >= 80 else 'B' if score >= 60 else 'C' if score >= 40 else 'D'
    return dict(score=score, band=band, reasons=reasons[:4])


def describe(rec):
    parts = []
    c = rec.get('colour')
    if c and rec['type'] in ('model', 'tool', 'map', 'vfx'):
        parts.append(c['top'][0]['name'])
    s = rec['size']
    if s.get('cls') and rec['type'] in ('model', 'tool'):
        parts.append(s['cls'])
    what = rec['subtype'] if rec.get('subtype') not in (None, 'other') else rec['type']
    head = ' '.join(parts + [what])
    comp = rec['composition']
    bits = []
    if comp.get('parts'):
        bits.append('%d parts' % comp['parts'])
    if comp.get('humanoid'):
        bits.append('has a Humanoid')
    if comp.get('scripts'):
        bits.append('%d scripts' % comp['scripts'])
    text = '%s %s' % ((rec['name_clean'] if rec['type'] == 'map' else rec['name']) or rec['name'], '(%s)' % head)
    if bits:
        text += ', ' + ', '.join(bits)
    text += ', from %s' % rec['provenance']['game']
    if rec['contains']:
        text += '; has ' + ', '.join(rec['contains'][:4])
    return text[:160]


def make_tags(rec, niches):
    tags, seen = [], set()

    def add(t):
        t = t.strip().lower()
        if t and t not in seen and t not in L.STOP and len(t) > 1:
            seen.add(t)
            tags.append(t)
    for w in name_words(rec['name']):
        if w not in L.GENERIC_NAMES:
            add(w)
    for seg in rec['_segs']:
        for w in name_words(seg):
            if w not in L.GENERIC_NAMES:
                add(w)
    add(rec['type'])
    if rec.get('subtype') and rec['subtype'] != 'other':
        add(rec['subtype'])
    c = rec.get('colour')
    if c:
        for t in c['top'][:2]:
            add(t['name'])
    if rec['size'].get('cls'):
        add(rec['size']['cls'])
    if rec.get('look'):
        add(rec['look'])
    for n in niches[:2]:
        add(n)
    for w in rec['contains'][:3]:
        add(w)
    return tags[:12]


def contains_words(has):
    out, seen = [], set()
    for c in has or []:
        for w in name_words(c):
            if w in L.GENERIC_CHILDREN or w in L.GENERIC_NAMES or w in seen or len(w) < 3:
                continue
            seen.add(w)
            out.append(w)
        if len(out) >= 12:
            break
    return out[:12]


# ---- building the records ---------------------------------------------------------------------------------------------

def knowledge_tags(card):
    if not card:
        return [], ''
    g = card.get('genre') or {}
    tags = ([g['primary']] if g.get('primary') else []) + list(g.get('tags') or [])
    return [t for t in tags if isinstance(t, str)][:10], (card.get('summary') or '')


def build(lib, out, max_games=None, progress=True):
    global THUMBS_PRESENT
    THUMBS_PRESENT = os.path.isdir(os.path.join(out, 'thumbs')) and bool(os.listdir(os.path.join(out, 'thumbs')))
    t0 = time.time()
    L_ = Library(lib)
    games_rows = collections.defaultdict(list)
    for a in L_.assets:
        if a['game'] in L_.catalog:
            games_rows[a['game']].append(a)
    gids = sorted(games_rows)[:max_games] if max_games else sorted(games_rows)
    acc = {}  # id -> accumulating record
    for gi, gid in enumerate(gids):
        entries, bounds = L_.entries(gid), L_.bounds(gid)
        g12, title = gid[:12], L_.title(gid)
        fam = L_.family.get(gid)
        primary = (not fam) or (fam['primary'] == gid and not fam['duplicate'])
        style = L_.style.get(gid)
        card = L_.knowledge.get(gid)
        ktags, ksum = knowledge_tags(card)
        niches = L_.catalog[gid].get('niches', [])
        passed = {i['path']: i for i in (jload(os.path.join(out, 'pass', gid + '.json'), {}) or {}).get('items', [])}
        gworks = (L_.integrity.get(gid) or {}).get('works')
        for a in games_rows[gid]:
            v = entries.get(a['path']) or {}
            h = v.get('hash')
            rid = h[:12] if h else 'row:%s:%s' % (g12, hashlib.sha1(a['path'].encode()).hexdigest()[:8])
            piece = L_.pieces.get((gid, a['path'])) or {}
            dims, src = (piece.get('size'), 'pieces') if piece.get('size') else (dims_from_bounds(bounds.get(a['path'])), 'bounds')
            ui = L_.ui_screens.get((g12, a['path'])) if a['k'] == 'ui' else None
            ref = (g12, a['path'])
            cur = acc.get(rid)
            rank = (primary, a['n'], a['parts'])
            if cur is None:
                acc[rid] = cur = dict(id=rid, hash=h, refs=[ref], games={title: g12}, ktags=set(ktags), niches=set(niches), best=None,
                                      copies=a.get('copies') or 1)
            else:
                cur['refs'].append(ref)
                cur['games'].setdefault(title, g12)
                cur['ktags'].update(ktags)
                cur['niches'].update(niches)
            if cur['best'] is None or rank > cur['best']['rank']:
                cur['best'] = dict(rank=rank, a=a, v=v, piece=piece, dims=dims, src=src, ui=ui, gid=gid, title=title, primary=primary, passed=passed.get(a['path']), out=out,
                                   style=style, ksum=ksum, gworks=gworks)
        if progress and gi % 50 == 0:
            print('  games %d/%d  items %d  %.0fs' % (gi, len(gids), len(acc), time.time() - t0), file=sys.stderr)
    items = [finish(cur) for cur in acc.values()]
    items.extend(system_items(L_))
    items.extend(kit_items(L_))
    items.extend(media_items(L_))
    return items, dict(rows=len(L_.assets), games=len(gids), seconds=round(time.time() - t0, 1))


def thumb_for(out, iid):
    p = os.path.join(out or '', 'thumbs', iid.replace(':', '_') + '.png')
    return dict(kind='proxy-render', path='thumbs/' + iid.replace(':', '_') + '.png', status='ok') if out and os.path.exists(p) else dict(kind='none', path=None, status='none')


def finish(cur):
    b = cur['best']
    a, v, piece, ui = b['a'], b['v'], b['piece'], b['ui']
    name = a['name']
    segs = path_words(a['path'], name)
    nws = name_words(name)
    generic = is_generic(name)
    type_ = kind_type(a, nws, segs)
    has = a.get('has') or []
    contains = contains_words(has)
    if a['k'] == 'map':  # a Workspace row stands for its whole game: the game is the name, its card the description
        name_clean = b['title']
    else:
        name_clean = ' '.join(L.split_words(name)) or name
    if a['k'] == 'ui' and ui:
        subtype = ui.get('purpose') or 'other'
    elif type_ == 'map':
        subtype = None
    elif type_ == 'script':
        subtype = 'module' if a['class'] == 'ModuleScript' else 'local' if a['class'] == 'LocalScript' else 'server'
    elif type_ == 'music':
        subtype = 'music'
    else:
        subtype = subtype_for('model' if type_ == 'tool' else type_, name, segs, has)
    pas = b.get('passed') or {}
    if pas.get('colorsVol'):  # measured by volume: real shares
        colour = colour_block([c[0] for c in pas['colorsVol']], [c[1] for c in pas['colorsVol']])
    else:
        colour = colour_block(piece.get('colors') or pas.get('colors') or (ui or {}).get('palette'))
    dims, dsrc = cur['best']['dims'], b['src']
    if (not dims or dsrc == 'bounds') and pas.get('size'):  # the pass measures the visible parts, like pieces.json
        dims, dsrc = pas['size'], 'pieces'
    size = size_block(dims, dsrc) if type_ in ('model', 'tool', 'map', 'vfx') else dict(studs=None, cls=None, conf='none')
    rec = dict(
        id=cur['id'], refs=cur['refs'][:40], ref_count=len(cur['refs']), copies=max(cur['copies'], len(cur['refs'])),
        type=type_, subtype=subtype, name=name, name_clean=name_clean, kind=a['k'], className=a['class'],
        context=' / '.join(segs), contains=contains,
        look=look_for(b['style'], ui, type_), colour=colour, size=size,
        composition=dict(parts=a['parts'], instances=a['n'], scripts=a['scripts'], unions=piece.get('unions'),
                         humanoid='Humanoid' in has, animated=bool({'AnimationController', 'Animator'} & set(has)),
                         emitters=a.get('fx') or [], lines=a.get('lines'), buttons=(ui or {}).get('buttonCount'),
                         texts=((ui or {}).get('texts') or [])[:8], material=piece.get('material')),
        image=thumb_for(b.get('out'), cur['id']),
        provenance=dict(game=b['title'], gameId=b['gid'][:12], path=a['path'], licence=LICENCE,
                        games=sorted(cur['games'].items())[:6], source_hash=cur['hash']),
        game_tags=sorted(cur['ktags'])[:8],
        near=None,
        _generic=generic, _segs=segs,
        _q=dict(works=v.get('works'), needs=v.get('needs'), content=v.get('content'), integrity=v.get('integrity'), ui=ui,
                primary=b['primary']),
    )
    if a['k'] == 'map':
        rec['_card'] = b['ksum']
    if type_ in ('model', 'tool'):
        mx = round(max(size['studs'])) if size.get('studs') else None
        rec['near'] = '%s|%s|%s' % (name_clean.lower(), a['parts'], mx)
    rec['quality'] = quality_block(rec)
    rec['tags'] = make_tags(rec, sorted(cur['niches']))
    desc = describe(rec)
    if a['k'] == 'map' and b['ksum']:
        desc = b['ksum'].strip().replace('\n', ' ')[:160]
        rec['tags'] = (rec['tags'] + [t.lower() for t in cur['ktags']][:4])[:12]
    rec['description'] = desc
    rec['confidence'] = dict(type='derived', subtype='derived' if subtype not in (None, 'other') else 'none', colour='derived' if colour else 'none',
                             size='derived' if size['studs'] else 'none', description='template', tags='rule')
    for k in ('_generic', '_segs', '_q', '_card'):
        rec.pop(k, None)
    return rec


def system_items(lib):
    out = []
    for s in lib.systems:
        gid12 = s['gameId']
        gid = next((g for g in lib.catalog if g.startswith(gid12)), None)
        title = lib.title(gid) if gid else s['name']
        card = lib.knowledge.get(gid) if gid else None
        ktags, _ = knowledge_tags(card)
        rec = dict(id='system:' + gid12, refs=[(gid12, '/')], ref_count=1, copies=1, type='system', subtype=(s.get('tags') or ['other'])[0],
                   name=s['name'], name_clean=s['name'], context=' / '.join(s.get('tags') or []), contains=[], look=None, colour=None,
                   size=dict(studs=None, cls=None, conf='none'),
                   composition=dict(parts=0, instances=s.get('instances'), scripts=s.get('scripts'), humanoid=False, animated=False, emitters=[]),
                   image=dict(kind='none', path=None, status='none'),
                   provenance=dict(game=title, gameId=gid12, path='/', licence=LICENCE, games=[(title, gid12)]),
                   game_tags=ktags[:8], near=None, description=('%s: %s' % (s['name'], s.get('does', '')))[:160],
                   tags=[t for t in (s.get('tags') or [])][:12] + [w for w in L.split_words(s.get('does', '')) if w not in L.STOP][:6])
        works = s.get('works')
        pts = {'yes': 80, 'partly': 55}.get(works, 35)
        rec['quality'] = dict(score=pts, band='A' if pts >= 80 else 'B' if pts >= 60 else 'C' if pts >= 40 else 'D',
                              reasons=[] if works == 'yes' else ['code ' + str(works)])
        rec['confidence'] = dict(type='derived', subtype='derived', colour='none', size='none', description='template', tags='rule')
        out.append(rec)
    return out


def kit_items(lib):
    out = []
    for k in lib.ui_kits:
        purposes = list((k.get('purposes') or {}).keys()) if isinstance(k.get('purposes'), dict) else list(k.get('purposes') or [])
        style = (k.get('style') or {}).get('label') or (k.get('style') or {}).get('category') or ''
        cat = (k.get('style') or {}).get('category') or ''
        look = next((o for key, o in (('glossy', 'glossy'), ('cartoon', 'cartoon'), ('minimal', 'minimal'), ('default', 'default'),
                                      ('pixel', 'pixel'), ('flat', 'flat'), ('clean', 'minimal')) if key in cat), None)
        pal = [p[0] for p in ((k.get('fingerprint') or {}).get('palette') or [])][:3]
        gm = (k.get('games') or [{}])[0]
        q = float(k.get('quality') or 0)
        rec = dict(id='kit:' + k['id'], refs=[(gm.get('id'), '/StarterGui')], ref_count=len(k.get('games') or []), copies=k.get('gameCount') or 1,
                   type='ui-kit', subtype=None, name=k['name'], name_clean=k['name'], context=' '.join(purposes[:12]), contains=purposes[:12],
                   look=look, colour=colour_block(pal), size=dict(studs=None, cls=None, conf='none'),
                   composition=dict(parts=0, screens=k.get('screens'), scripts=0, humanoid=False, animated=False, emitters=[]),
                   image=dict(kind='none', path=None, status='none'),
                   provenance=dict(game=gm.get('name') or k['name'], gameId=gm.get('id'), path='/StarterGui', licence=LICENCE,
                                   games=[(g.get('name'), g.get('id')) for g in (k.get('games') or [])[:6]]),
                   game_tags=[], near=None,
                   description=('%s UI kit, %s style; %s screens covering %s' % (k['name'], style or 'unrated', k.get('screens'), ', '.join(purposes[:5])))[:160],
                   tags=[w for w in L.split_words(style)][:8] + purposes[:6] + ([look] if look else []))
        rec['quality'] = dict(score=round(q), band='A' if q >= 80 else 'B' if q >= 60 else 'C' if q >= 40 else 'D', reasons=[])
        rec['confidence'] = dict(type='derived', subtype='none', colour='derived' if pal else 'none', size='none', description='template', tags='rule')
        out.append(rec)
    return out


def media_items(lib):
    out = []
    for m in lib.media:
        words = [w for w in L.split_words(m['name'] + ' ' + m.get('pack', '')) if w not in L.STOP]
        rec = dict(id='media:' + m['id'][:12], refs=[], ref_count=1, copies=1, type='media-pack', subtype=m.get('kind'), name=m['name'],
                   name_clean=' '.join(L.split_words(m['name'])) or m['name'], context=m.get('pack', ''), contains=[], look=None, colour=None,
                   size=dict(studs=None, cls=None, conf='none'),
                   composition=dict(parts=0, scripts=0, humanoid=False, animated=False, emitters=[], width=m.get('width'), height=m.get('height')),
                   image=dict(kind='art-pack', path=m.get('thumb'), status='ok' if m.get('thumb') else 'none'),
                   provenance=dict(game=m.get('pack'), gameId=None, path=m.get('path'), licence=LICENCE, games=[]),
                   game_tags=[], near=None,
                   description=('%s, %s from the %s pack%s' % (m['name'], m.get('kind'), m.get('pack'), ' (%sx%s)' % (m['width'], m['height']) if m.get('width') else ''))[:160],
                   tags=(words[:8] + [m.get('kind') or 'media'])[:12])
        rec['quality'] = dict(score=60, band='B', reasons=['not individually checked'])
        rec['confidence'] = dict(type='derived', subtype='derived', colour='none', size='none', description='template', tags='rule')
        out.append(rec)
    return out


# ---- coverage ----------------------------------------------------------------------------------------------------------

FIELDS = {
    'type': lambda r: bool(r['type']),
    'subtype (non-other)': lambda r: r.get('subtype') not in (None, 'other'),
    'description': lambda r: bool(r.get('description')),
    'tags (>=5)': lambda r: len(r.get('tags') or []) >= 5,
    'tags (>=1)': lambda r: len(r.get('tags') or []) >= 1,
    'colour': lambda r: bool(r.get('colour')),
    'size class': lambda r: bool((r.get('size') or {}).get('cls')),
    'size (any dims)': lambda r: bool((r.get('size') or {}).get('studs')),
    'quality': lambda r: bool(r.get('quality')),
    'look': lambda r: bool(r.get('look')),
    'image': lambda r: (r.get('image') or {}).get('status') == 'ok',
    'provenance': lambda r: bool(r['provenance'].get('game') and r['provenance'].get('licence')),
}


def coverage(items, ref_rows=None):
    """Share of items (hashes) and of library rows (via ref_count) that have each field."""
    n_items = len(items)
    n_rows = sum(max(1, r.get('ref_count', 1)) for r in items)
    out = {}
    for name, fn in FIELDS.items():
        have = [r for r in items if fn(r)]
        out[name] = dict(items=round(100 * len(have) / n_items, 1), rows=round(100 * sum(max(1, r.get('ref_count', 1)) for r in have) / n_rows, 1))
    # applicability-aware: colour/size only apply to physical types
    phys = [r for r in items if r['type'] in ('model', 'tool', 'map', 'vfx')]
    if phys:
        out['colour (physical types only)'] = dict(items=round(100 * sum(1 for r in phys if r.get('colour')) / len(phys), 1), of=len(phys))
        out['size class (physical types only)'] = dict(items=round(100 * sum(1 for r in phys if r['size'].get('cls')) / len(phys), 1), of=len(phys))
    by = collections.Counter(r['type'] for r in items)
    # Applicability-aware: colour, size and a picture only mean something for a physical item that has parts.
    def physical(r):
        return r['type'] in ('model', 'tool', 'map', 'vfx') and (r['composition'].get('parts') or 0) >= 1
    base = lambda r: bool(r['type'] and r.get('description') and r.get('tags') and r.get('quality') and r['provenance'].get('game') and r['provenance'].get('licence'))
    phys = [r for r in items if physical(r)]
    pf = {'colour': lambda r: bool(r.get('colour')), 'size class': lambda r: bool(r['size'].get('cls')), 'image': lambda r: r['image']['status'] == 'ok'}
    pct = lambda n, d: round(100.0 * n / d, 1) if d else None
    appl = dict(physical_items_with_parts=len(phys))
    for k, fn in pf.items():
        appl[k + ' (physical items with parts)'] = pct(sum(1 for r in phys if fn(r)), len(phys))
    full_noimg = [r for r in items if base(r) and (not physical(r) or (pf['colour'](r) and pf['size class'](r)))]
    full_img = [r for r in full_noimg if not physical(r) or pf['image'](r)]
    appl['fully classified, without the picture'] = dict(items=pct(len(full_noimg), n_items), rows=pct(sum(max(1, r.get('ref_count', 1)) for r in full_noimg), n_rows))
    appl['fully classified, with the picture'] = dict(items=pct(len(full_img), n_items), rows=pct(sum(max(1, r.get('ref_count', 1)) for r in full_img), n_rows))
    appl['base fields only (type, description, tags, quality, provenance)'] = dict(items=pct(sum(1 for r in items if base(r)), n_items))
    return dict(items=n_items, rows=n_rows, by_type=dict(by), fields=out, applicable=appl)


def write(items, out_dir, meta):
    os.makedirs(out_dir, exist_ok=True)
    p = os.path.join(out_dir, 'items.jsonl')
    tmp = p + '.tmp'
    with open(tmp, 'w') as f:
        for r in items:
            f.write(json.dumps(r, separators=(',', ':'), ensure_ascii=False) + '\n')
    os.replace(tmp, p)
    cov = coverage(items)
    cov['meta'] = meta
    with open(os.path.join(out_dir, 'coverage.json'), 'w') as f:
        json.dump(cov, f, indent=1)
    return cov


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--lib', default=DEFAULT_LIB)
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--games', type=int, default=None, help='only the first N games (sorted by id), for timing a sample')
    a = ap.parse_args(argv)
    if os.path.realpath(a.out).startswith(os.path.realpath(a.lib) + os.sep) or os.path.realpath(a.out) == os.path.realpath(a.lib):
        sys.exit('refusing to write inside the library directory: the live gateway reloads files there')
    items, meta = build(a.lib, a.out, a.games)
    cov = write(items, a.out, meta)
    print(json.dumps(cov, indent=1))


if __name__ == '__main__':
    main()
