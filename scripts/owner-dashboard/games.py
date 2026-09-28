#!/usr/bin/env python3
"""Per-game extraction status of the owner's rbxl files, for the owner dashboard's library pages.

Reads the private corpus read-only (index.sqlite, inventory.json, failed-recovery, retained native chunks)
and the committed native-readiness index, and writes one JSON file outside the repo:
~/Library/Application Support/Apple/owner-dashboard/games.json (index) plus games/<id>.json (components). Nothing in the corpus is modified.

A component is a direct child of a top-level service (one level deeper under StarterPlayer). Each
component goes through six stages; its percent is the mean of them:
  extracted     node records with a content hash exist (always 1 once decoded)
  native        share of its instances converted to a verified native .rbxm chunk
  inserted      share of its instances in a chunk actually inserted into Roblox Studio
  visual        share in a chunk with captured visual evidence
  gameplay      share in a chunk whose gameplay was verified
  published     share in a chunk published live to the Apple library (the publisher has not run live)
A game's percent weights its components by instance count; the library's percent weights games the same way.
"""
import collections, json, os, sqlite3, sys, time

ROOT = os.path.expanduser('~/Library/Application Support/Apple/owner-corpus')
OUT = os.path.expanduser('~/Library/Application Support/Apple/owner-dashboard/games.json')
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
READINESS = os.path.join(REPO, 'docs/evidence/owner-corpus-20260926/native-readiness-index.json')
GAME_DIR = os.path.join(os.path.dirname(OUT), 'games')
STAGES = ['extracted', 'native', 'inserted', 'visual', 'gameplay', 'published']
SKIP = {'Camera'}
DEEP = {'StarterPlayer'}


def load(path, default=None):
    try:
        with open(path) as f:
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


def main():
    t0 = time.time()
    con = sqlite3.connect('file:' + ROOT + '/index.sqlite?mode=ro&immutable=1', uri=True)
    inventory = load(ROOT + '/inventory.json', {'files': [], 'missing': []})
    readiness = load(READINESS, {'artifacts': [], 'ownerFirstRetrievalCandidates': []})
    failed = (load(ROOT + '/failed-recovery/manifest.json', {}) or {}).get('sources', {})

    # Every path the owner supplied, grouped by content hash (the same file can sit in several folders).
    paths = collections.defaultdict(list)
    for f in inventory['files']:
        if f['name'].lower().endswith(('.rbxl', '.rbxlx')):
            paths[f['id']].append(f['path'])
    sources = {r[0]: r for r in con.execute('select id,path,name,bytes,format,status,error from sources')}

    # Chunk readiness per game, and which chunks were emitted as publish candidates.
    chunk = {}
    unsupported = collections.Counter()
    for a in readiness['artifacts']:
        r = a.get('readiness') or {}
        key = (a.get('sourceSHA'), a.get('chunkId'))
        if a.get('importOperation') != 'model-chunk':
            unsupported[a.get('sourceSHA')] += 1
            continue
        chunk[key] = {'inserted': bool(r.get('realStudioInsertion')), 'visual': bool(r.get('visualEvidenceCaptured')),
                      'gameplay': bool(r.get('gameplayVerified')), 'published': False, 'cap': a.get('nativeCapStatus')}
    candidates = {(c.get('sourceSHA'), c.get('chunkId')) for c in readiness.get('ownerFirstRetrievalCandidates', [])}

    # Media references, counted once over the whole table (node ids start with the source hash).
    media = collections.defaultdict(lambda: [0, 0])
    for node_id, availability in con.execute('select node_id, availability from media'):
        m = media[node_id]
        m[0] += 1
        if availability != 'external-reference-only':
            m[1] += 1

    games = []
    for sid, locs in sorted(paths.items(), key=lambda kv: os.path.basename(kv[1][0]).lower()):
        src = sources.get(sid)
        name = os.path.basename(locs[0])
        g = {'id': sid, 'name': name, 'paths': sorted(locs), 'bytes': src[3] if src else None,
             'status': src[5] if src else 'not-indexed', 'failures': [], 'components': []}
        if src and src[6]:
            lossy = src[6].count('lossy string conversion')
            g['failures'].append({'kind': 'decode-warning', 'he': f'{lossy} מחרוזות הומרו באופן לא מדויק בפענוח (לא UTF-8)' if lossy else 'אזהרות פענוח', 'detail': src[6][:600]})
        if sid in failed:
            f = failed[sid]
            g['failures'].append({'kind': 'native-decode-failed', 'he': 'פענוח בינארי מלא נכשל; נשמר רק קוד המקור המדויק' + (f", {f['exactSourceProperties']} סקריפטים" if f.get('exactSourceProperties') else ''), 'detail': None})
        if unsupported[sid]:
            g['failures'].append({'kind': 'unsupported-import', 'he': f'{unsupported[sid]} יחידות שאינן נתמכות כרגע בהכנסה לסטודיו', 'detail': None})

        # Native conversion: node referent -> chunk, from the retained native map.
        rows = con.execute('select id,parent_id,referent,class,name,script_sha is not null from nodes where source_id=? order by rowid', (sid,)).fetchall()
        converted = {}
        nmap = os.path.join(ROOT, 'retained-native-xml', sid, 'native-map.jsonl')
        if os.path.exists(nmap):
            with open(nmap) as f:
                mapped = [json.loads(line) for line in f]
            mapped = [m for m in mapped if m.get('readbackVerified')]
            refs = {r[2] for r in rows}
            by_ref = {m['nodeId'].split(':RBX', 1)[-1]: m['chunkId'] for m in mapped}
            if sum(1 for k in by_ref if k in refs) * 2 >= len(by_ref):
                converted = by_ref
            else:
                # XML sources keep their own referent strings: align both preorder lists by class and name.
                i = 0
                for m in mapped:
                    j = i
                    while j < len(rows) and (rows[j][3], rows[j][4]) != (m.get('class'), m.get('name')):
                        j += 1
                    if j < len(rows):
                        converted[rows[j][2]] = m['chunkId']
                        i = j + 1
        g['instances'] = len(rows)
        if src and not rows:
            g['failures'].append({'kind': 'no-nodes', 'he': 'לא חולצו רכיבים מהקובץ', 'detail': None})
        if not src:
            g['failures'].append({'kind': 'not-indexed', 'he': 'הקובץ לא נקלט לאינדקס', 'detail': None})
        parent = {r[0]: r[1] for r in rows}
        info = {r[0]: r for r in rows}
        depth = {}
        for nid in parent:
            chain = []
            cur = nid
            while cur is not None and cur not in depth:
                chain.append(cur)
                cur = parent.get(cur)
            d = depth[cur] if cur is not None else 0
            for c in reversed(chain):
                d += 1
                depth[c] = d

        # Component of a node: its depth-2 ancestor (depth-3 under StarterPlayer), found through the parent chain.
        memo = {}
        def comp_of(nid):
            trail, cur = [], nid
            while cur is not None and cur not in memo:
                trail.append(cur)
                cur = parent.get(cur)
            res = memo.get(cur)
            for t in reversed(trail):
                d, p = depth[t], parent.get(t)
                svc_deep = d >= 2 and info[root_of[t]][3] in DEEP
                if d == 1 or (svc_deep and d == 2):
                    res = None
                elif (d == 2 and not svc_deep) or (svc_deep and d == 3):
                    res = t
                memo[t] = res
            return res

        root_of = {}
        for nid in parent:
            cur, trail = nid, []
            while cur is not None and cur not in root_of and parent.get(cur) is not None:
                trail.append(cur)
                cur = parent.get(cur)
            r = root_of.get(cur, cur)
            root_of[cur] = r
            for t in trail:
                root_of[t] = r

        comps = {}
        for r in rows:
            nid = r[0]
            comp = comp_of(nid)
            if comp is None or info[comp][3] in SKIP:
                continue
            c = comps.get(comp)
            if c is None:
                cr = info[comp]
                svc = info[parent[comp]][4] if depth[comp] == 2 else f"{info[root_of[comp]][4]}/{info[parent[comp]][4]}"
                c = comps[comp] = {'id': comp.split(':', 1)[1], 'name': cr[4], 'class': cr[3], 'service': svc,
                                   'instances': 0, 'scripts': 0, 'media': 0, 'mediaVerified': 0,
                                   'native': 0, 'inserted': 0, 'visual': 0, 'gameplay': 0, 'published': 0, 'candidate': 0, 'overCap': 0}
            c['instances'] += 1
            c['scripts'] += 1 if r[5] else 0
            m = media.get(nid)
            if m:
                c['media'] += m[0]
                c['mediaVerified'] += m[1]
            ch = converted.get(r[2])
            if ch:
                c['native'] += 1
                st = chunk.get((sid, ch), {})
                for k in ('inserted', 'visual', 'gameplay', 'published'):
                    c[k] += 1 if st.get(k) else 0
                c['candidate'] += 1 if (sid, ch) in candidates else 0

        total_w = 0
        stage_w = dict.fromkeys(STAGES, 0.0)
        for c in comps.values():
            n = c['instances']
            share = {'extracted': 1.0}
            for k in STAGES[1:]:
                share[k] = c[k] / n if n else 0.0
            c['stages'] = {k: round(v, 4) for k, v in share.items()}
            c['percent'] = round(100 * sum(share.values()) / len(STAGES), 1)
            fails = []
            if c['native'] < n:
                fails.append(f"{n - c['native']} מתוך {n} מופעים עוד לא הומרו לקובץ Roblox מקורי")
            if c['media'] > c['mediaVerified']:
                fails.append(f"{c['media'] - c['mediaVerified']} הפניות מדיה חיצוניות לא אומתו")
            if c['scripts']:
                fails.append(f"{c['scripts']} סקריפטים נשמרים כמקור בלבד (לא מורצים)")
            c['issues'] = fails
            total_w += n
            for k in STAGES:
                stage_w[k] += share[k] * n
        g['components'] = sorted(comps.values(), key=lambda c: (c['service'], -c['instances']))
        g['componentCount'] = len(comps)
        g['stages'] = {k: round(stage_w[k] / total_w, 4) if total_w else 0.0 for k in STAGES}
        g['percent'] = round(100 * sum(g['stages'].values()) / len(STAGES), 1) if total_w else 0.0
        g['weight'] = total_w
        games.append(g)

    for p in inventory.get('missing', []):
        if p.lower().endswith(('.rbxl', '.rbxlx')):
            games.append({'id': 'missing:' + os.path.basename(p), 'name': os.path.basename(p), 'paths': [p], 'bytes': None, 'status': 'missing',
                          'failures': [{'kind': 'missing', 'he': 'הקובץ לא נמצא בדיסק בזמן הקליטה', 'detail': p}], 'components': [],
                          'componentCount': 0, 'instances': 0, 'stages': dict.fromkeys(STAGES, 0.0), 'percent': 0.0, 'weight': 0})

    W = sum(g['weight'] for g in games)
    lib_stages = {k: round(sum(g['stages'][k] * g['weight'] for g in games) / W, 4) if W else 0.0 for k in STAGES}
    summary = {
        'games': len(games), 'files': sum(len(g['paths']) for g in games),
        'indexed': sum(1 for g in games if g['instances']), 'withFailures': sum(1 for g in games if g['failures']),
        'components': sum(g['componentCount'] for g in games), 'instances': W,
        'nativeGames': sum(1 for g in games if g['stages']['native'] > 0),
        'stages': lib_stages, 'percent': round(100 * sum(lib_stages.values()) / len(STAGES), 1),
        'meanGamePercent': round(sum(g['percent'] for g in games) / len(games), 1) if games else 0.0,
    }
    built = int(time.time() * 1000)
    os.makedirs(GAME_DIR, exist_ok=True)
    for g in games:
        write(os.path.join(GAME_DIR, safe(g['id']) + '.json'), {'schema': 'apple.owner-dashboard.game.v1', 'builtAt': built, 'stageOrder': STAGES, **g})
    write(OUT, {'schema': 'apple.owner-dashboard.games.v1', 'builtAt': built, 'stageOrder': STAGES, 'summary': summary,
                'games': [{k: v for k, v in g.items() if k != 'components'} for g in games]})
    print(json.dumps(summary, ensure_ascii=False), f'{time.time() - t0:.0f}s', file=sys.stderr)


if __name__ == '__main__':
    main()
