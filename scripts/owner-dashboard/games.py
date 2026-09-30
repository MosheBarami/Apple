#!/usr/bin/env python3
"""The owner's library for the owner dashboard's library pages: every game and model the owner uploaded, as the library
now holds it (~/Library/Application Support/Apple/owner-library, built by packages/owner-corpus/library_*.py).

Writes one JSON index outside the repo, ~/Library/Application Support/Apple/owner-dashboard/games.json, plus games/<id>.json
(that game's assets). Nothing in the library is modified.

A component is one asset the agent can import on its own (a map, model, screen, effect, sound, animation, tool or script
system, as library_assets.py indexed it). Each goes through the whole-library pipeline; its percent is the mean of:
  stored      the original file is in the library's own store (it no longer depends on Downloads or the Desktop)
  cataloged   its game's services and top-level parts are cataloged
  indexed     it is a searchable asset with the exact path an import takes
  verified    cut out with its scripts and read back identical (library_verify.py round trip)
  mapped      what it needs to work (remotes, modules, server scripts, controllers) was worked out
  styled      its game's look was scanned (studs, colour, materials)
A game's percent weights its assets by instance count; the library's percent weights games the same way. What Studio
showed in live Apple builds is kept apart (owner-library/live-builds.json): it covers only the games those builds used.
"""
import json, os, sys, time

LIB = os.path.expanduser('~/Library/Application Support/Apple/owner-library')
OUT = os.path.expanduser('~/Library/Application Support/Apple/owner-dashboard/games.json')
GAME_DIR = os.path.join(os.path.dirname(OUT), 'games')
STAGES = ['stored', 'cataloged', 'indexed', 'verified', 'mapped', 'styled']
KIND_HE = {'map': 'מפה', 'model': 'מודל', 'ui': 'מסך', 'fx': 'אפקט', 'sound': 'צליל', 'animation': 'אנימציה', 'tool': 'כלי', 'script': 'מערכת קוד'}
LEAVES = {'map', 'sound', 'animation', 'fx'}   # nothing to map: they are imported whole, with no code of their own to follow


def load(name, default=None):
    try:
        with open(os.path.join(LIB, name)) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def safe(game_id):
    return ''.join(ch if ch.isalnum() or ch in '-_.' else '_' for ch in game_id)


def write(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, path)


def look_of(s):
    if not s or not s.get('parts'):
        return None
    return 'studded-modern' if s.get('modernStudShare', 0) >= 0.15 else 'studded' if s.get('studShare', 0) >= 0.2 else 'flat'


def percent(stages):
    return round(100 * sum(stages[k] for k in STAGES) / len(STAGES), 1)


def main():
    t0 = time.time()
    sources = {s['id']: s for s in load('sources.json', {'sources': []})['sources']}
    catalog = {g['id']: g for g in load('catalog.json', {'games': []})['games']}
    style = load('style.json', {'games': {}})['games']
    integrity = load('integrity.json', {})
    names = load('names.json', {})
    families = load('families.json', {'families': []})['families']
    systems = load('systems.json', {'systems': []})
    systems = systems.get('systems', []) if isinstance(systems, dict) else systems
    builds = load('live-builds.json', {'builds': []})['builds']
    media = load('media.json', {'items': [], 'packs': []})
    family_of = {m['id']: fam for fam in families for m in fam['members']}
    does, live = {}, {}
    for s in systems:
        does.setdefault(s.get('gameId', '')[:12], []).append(s.get('does') or s.get('name'))
    for b in builds:
        for gid in b.get('games', []):
            live.setdefault(gid[:12], []).append(b.get('title'))

    built = int(time.time() * 1000)
    os.makedirs(GAME_DIR, exist_ok=True)
    games = []
    for sid, src in sorted(sources.items(), key=lambda kv: kv[1]['names'][0].lower()):
        g = catalog.get(sid) or {}
        ok_catalog = bool(g) and 'error' not in g
        try:
            with open(os.path.join(LIB, 'entries', sid + '.verify.json')) as f:
                assets = json.load(f).get('assets', {})
        except (OSError, ValueError):
            assets = {}
        styled = 1.0 if sid in style else 0.0
        components = []
        for path, a in assets.items():
            parts = path.strip('/').split('/')
            st = {'stored': 1.0, 'cataloged': 1.0 if ok_catalog else 0.0, 'indexed': 1.0, 'verified': 1.0 if a.get('ok') else 0.0,
                  'mapped': 1.0 if a.get('k') in LEAVES or ('needs' in a and 'usedBy' in a) else 0.0, 'styled': styled}
            integ = a.get('integrity') or {}
            stripped = (integ.get('empty') or 0) + (integ.get('panicked') or 0)
            brings = len(a.get('needs') or []) + len(a.get('usedBy') or [])
            issues = ([f'לא יצא שלם: {str(a["error"])[:200]}'] if a.get('error') else []) \
                + ([f'{stripped} מתוך {integ.get("scripts")} הסקריפטים ריקים בעותק השמור'] if stripped else []) \
                + ([f'מגיע יחד עם {brings} חלקים שהוא צריך כדי לעבוד'] if brings else [])
            components.append({'id': path, 'name': (parts[-1] or names.get(sid) or src['names'][0]).replace('%2F', '/'),
                               'class': KIND_HE.get(a.get('k'), a.get('k')), 'kind': a.get('k'),
                               'service': parts[0] if g.get('place') and parts[0] else 'Model',
                               'instances': a.get('instances') or 0, 'scripts': a.get('scripts') or 0,
                               'media': len(a.get('content') or []), 'mediaVerified': None, 'works': a.get('works'),
                               'stages': st, 'percent': percent(st), 'issues': issues})
        weight = sum(c['instances'] for c in components)
        if weight:
            stages = {k: round(sum(c['stages'][k] * c['instances'] for c in components) / weight, 4) for k in STAGES}
        else:
            stages = {'stored': 1.0, 'cataloged': 1.0 if ok_catalog else 0.0, 'indexed': 0.0, 'verified': 0.0, 'mapped': 0.0, 'styled': styled}
        integ = integrity.get(sid, {})
        stripped = (integ.get('empty') or 0) + (integ.get('panicked') or 0)
        failures = [{'kind': 'repaired', 'he': 'הקובץ תוקן כדי שייקרא: ' + fix, 'detail': None} for fix in src.get('fixes', [])]
        if not ok_catalog:
            failures.append({'kind': 'catalog-failed', 'he': 'הקובץ לא נקרא', 'detail': g.get('error')})
        bad = sum(1 for c in components if not c['stages']['verified'])
        if bad:
            failures.append({'kind': 'verify-failed', 'he': f'{bad} נכסים לא יצאו שלמים', 'detail': None})
        if integ.get('scripts') and stripped * 2 >= integ['scripts']:
            failures.append({'kind': 'stripped-scripts', 'he': f'{stripped} מתוך {integ["scripts"]} הסקריפטים ריקים בעותק השמור, ולכן המסכים שלו לא יגיבו כמו במקור', 'detail': None})
        fam = family_of.get(sid)
        head = {'id': sid, 'name': names.get(sid) or src['names'][0], 'paths': src.get('origins', []), 'bytes': src.get('bytes'),
                'status': 'indexed' if ok_catalog else 'failed', 'failures': failures, 'instances': g.get('instances') or 0,
                'componentCount': len(components), 'stages': stages, 'percent': percent(stages), 'weight': weight or 1,
                'kind': 'place' if g.get('place') else 'model', 'niches': g.get('niches', []),
                'family': fam['name'] if fam else None, 'primary': bool(fam) and fam['primary'] == sid, 'versions': len(fam['members']) if fam else 1,
                'look': look_of(style.get(sid)), 'works': integ.get('works'), 'scripts': integ.get('scripts') or g.get('scripts') or 0,
                'stripped': stripped, 'systems': does.get(sid[:12], [])[:4], 'liveBuilds': live.get(sid[:12], [])}
        write(os.path.join(GAME_DIR, safe(sid) + '.json'), {'schema': 'apple.owner-dashboard.game.v2', 'builtAt': built, 'stageOrder': STAGES,
                                                            **head, 'components': components})
        games.append(head)

    W = sum(g['weight'] for g in games)
    lib_stages = {k: round(sum(g['stages'][k] * g['weight'] for g in games) / W, 4) if W else 0.0 for k in STAGES}
    works = {}
    for g in games:
        if g['works']:
            works[g['works']] = works.get(g['works'], 0) + 1
    summary = {
        'games': len(games), 'files': sum(len(g['paths']) for g in games), 'indexed': sum(1 for g in games if g['status'] == 'indexed'),
        'withFailures': sum(1 for g in games if any(f['kind'] in ('catalog-failed', 'verify-failed') for f in g['failures'])),
        'components': sum(g['componentCount'] for g in games), 'instances': sum(g['instances'] for g in games),
        'stages': lib_stages, 'percent': percent(lib_stages),
        'meanGamePercent': round(sum(g['percent'] for g in games) / len(games), 1) if games else 0.0,
        'families': len(families), 'studded': sum(1 for g in games if g['look'] in ('studded', 'studded-modern')), 'works': works,
        'systems': len(systems), 'media': len(media.get('items', [])), 'mediaPacks': len(media.get('packs', [])),
        'repaired': sum(1 for s in sources.values() if s.get('fixes')), 'liveBuilds': len(builds), 'liveGames': len(live),
    }
    write(OUT, {'schema': 'apple.owner-dashboard.games.v2', 'builtAt': built, 'stageOrder': STAGES, 'summary': summary, 'games': games, 'builds': builds})
    print(json.dumps(summary, ensure_ascii=False), f'{time.time() - t0:.0f}s', file=sys.stderr)


if __name__ == '__main__':
    main()
