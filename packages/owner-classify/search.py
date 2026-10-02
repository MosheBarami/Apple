"""Search over the classified owner library: by meaning (corpus-learned neighbours, optional dense vectors), style, colour,
size and type. Pure standard library (the gateway runs the system Python 3.9 with no numpy); the optional dense tier is a
separate resident process (embed.py) that this module talks to when it is present.

No subject-specific code (owner directive generalize-not-patch): the parser knows colour words, size words, number words,
type words and stop words, and nothing about any particular object a user might want.
"""
import collections
import difflib
import json
import math
import os
import re
import sqlite3
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lexicon as L

DEFAULT_DIR = os.path.expanduser('~/Library/Application Support/Apple/owner-classify')
BM25_W = '3.0, 2.0, 1.5, 1.0, 0.5'  # name, tags, descr, context, game
_TOK = re.compile(r"[a-z0-9]+")
AXIS_Y = {'tall', 'high', 'height'}
AXIS_XZ = {'across', 'wide', 'wideness', 'long', 'wide', 'diameter', 'width', 'length', 'big'}
MIN_CUE = ('over', 'above', 'taller than', 'bigger than', 'larger than', 'more than', 'at least', 'longer than', 'wider than', 'exceeding')
MAX_CUE = ('under', 'below', 'less than', 'smaller than', 'no bigger than', 'no larger than', 'at most', 'up to', 'within', 'no taller than',
           'shorter than', 'no more than', 'no wider than')
KIND_OF_TYPE = {'model': 'model', 'map': 'map', 'tool': 'tool', 'ui-screen': 'ui', 'vfx': 'fx', 'sfx': 'sound', 'music': 'sound',
                'animation': 'animation', 'script': 'script'}


def number_of(tokens, i):
    """A number at tokens[i:]: digits, 'k' suffix, or number words ('a thousand', 'seventy', 'a couple of'). -> (value, next index)."""
    t = tokens[i] if i < len(tokens) else ''
    m = re.fullmatch(r'(\d+(?:\.\d+)?)(k?)', t)
    if m:
        return float(m.group(1)) * (1000 if m.group(2) else 1), i + 1
    j = i
    if t in ('a', 'an') and i + 1 < len(tokens) and tokens[i + 1] in L.NUMBER_WORDS:
        j = i + 1
    t = tokens[j] if j < len(tokens) else ''
    if t in L.NUMBER_WORDS:
        v = float(L.NUMBER_WORDS[t])
        j += 1
        if j < len(tokens) and tokens[j] in ('hundred', 'thousand') and v < 100:
            v *= L.NUMBER_WORDS[tokens[j]]
            j += 1
        if j < len(tokens) and tokens[j] == 'of':
            j += 1
        return v, j
    return None, i


class Query:
    def __init__(self, text):
        self.text = text
        self.terms = []          # lexical words (singular, stop words removed)
        self.colours = []        # colour names asked for
        self.size = None         # dict(kind=min|max|approx, value, axis=y|xz|max)
        self.size_class = None
        self.type = None         # soft type boost
        self.notes = []
        self.name_only = set()   # size words: matched in names only (every item's tags carry its size class)


def parse(text):
    q = Query(text)
    low = re.sub(r"[-_/]", ' ', text.lower())
    low = re.sub(r"[^a-z0-9. ]", ' ', low)
    tokens = low.split()
    used = set()
    # colour phrases then words
    joined = ' '.join(tokens)
    for ph, name in L.COLOUR_PHRASES.items():
        if ph in joined:
            q.colours.append(name)
            joined = joined.replace(ph, ' ')
    tokens2 = joined.split()
    for t in tokens2:
        c = L.COLOUR_WORDS.get(t)
        if c and c not in q.colours:
            q.colours.append(c)
    tokens = low.split()
    # size: numbers tied to studs / an axis word, with a min / max / approx cue before them
    i = 0
    while i < len(tokens) and q.size is None:
        v, j = number_of(tokens, i)
        if v is not None:
            tail = tokens[j:j + 3]
            axis_word = next((w for w in tail if w in AXIS_Y or w in AXIS_XZ or w.startswith('stud')), None)
            if axis_word is not None or (j < len(tokens) and tokens[j].startswith('stud')):
                head = ' '.join(tokens[max(0, i - 3):i])
                kind = 'approx'
                for cue in MIN_CUE:
                    if head.endswith(cue) or (' ' + cue + ' ') in (' ' + head + ' '):
                        kind = 'min'
                for cue in MAX_CUE:
                    if head.endswith(cue) or (' ' + cue + ' ') in (' ' + head + ' '):
                        kind = 'max'
                axis = 'y' if any(w in AXIS_Y for w in tail) else 'xz' if any(w in AXIS_XZ for w in tail) else 'max'
                q.size = dict(kind=kind, value=v, axis=axis)
                used.update(range(i, j))
                used.update(k for k in range(j, j + 3) if k < len(tokens) and (tokens[k].startswith('stud') or tokens[k] in AXIS_Y or tokens[k] in AXIS_XZ))
                i = j
                continue
        i += 1
    for t in tokens:
        if t in L.SIZE_WORDS and L.SIZE_WORDS[t] and q.size_class is None and q.size is None:
            q.size_class = L.SIZE_WORDS[t]
    for t in tokens:
        if t in L.TYPE_WORDS and q.type is None:
            q.type = L.TYPE_WORDS[t]
    skip = {'stud', 'studs', 'tall', 'across', 'wide', 'high', 'coloured', 'colored', 'colour', 'color', 'shaped', 'looking'}
    for idx, t in enumerate(tokens):
        if idx in used or t in L.STOP or t in skip or t.isdigit() or len(t) < 2:
            continue
        if q.size is not None and t in L.NUMBER_WORDS:
            continue
        w = L.singular(t)
        if w not in q.terms:
            q.terms.append(w)
            if t in L.SIZE_WORDS:
                q.name_only.add(w)
    # canonical colour names count as words too ("golden" -> gold)
    for c in q.colours:
        for w in c.split():
            if w not in q.terms:
                q.terms.append(w)
    return q


def idf(df, n):
    return math.log(1 + (n - df + 0.5) / (df + 0.5))


def size_fit(item_dims, spec):
    """1 = the item's size is what was asked, falling off on a log scale; None when the item has no trusted size."""
    dx, dy, dz = item_dims
    d = dy if spec['axis'] == 'y' else max(dx, dz) if spec['axis'] == 'xz' else max(dx, dy, dz)
    if d is None or d <= 0:
        return None
    v = spec['value']
    r = math.log(d / v)
    if spec['kind'] == 'min':
        return 1.0 if d >= v else math.exp(-(r ** 2) / (2 * 0.35 ** 2))
    if spec['kind'] == 'max':
        return 1.0 if d <= v else math.exp(-(r ** 2) / (2 * 0.35 ** 2))
    return math.exp(-(r ** 2) / (2 * 0.6 ** 2))


HARD_TYPES = {'map': {'map'}, 'sfx': {'sfx', 'music'}, 'music': {'music'}, 'animation': {'animation'}, 'vfx': {'vfx'}, 'ui-kit': {'ui-kit', 'ui-screen'},
              'media-pack': {'media-pack'}, 'script': {'script'}}
SYSTEM_CUES = {'player', 'players', 'mechanic', 'mechanics', 'gameplay', 'feature', 'system'}
CLASS_MID = {'tiny': 1.0, 'small': 4.5, 'medium': 15, 'large': 60, 'huge': 400}


class Finder:
    def __init__(self, directory=DEFAULT_DIR, dense=None):
        self.dir = directory
        path = os.path.join(directory, 'find.sqlite')
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        self.db = sqlite3.connect('file:%s?mode=ro' % path, uri=True, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.n = int(self.db.execute("SELECT v FROM meta WHERE k='items'").fetchone()[0])
        self.df = {r[0]: r[1] for r in self.db.execute('SELECT term, df FROM words')}
        self.nbr = collections.defaultdict(list)
        for t, nb, w in self.db.execute('SELECT term, nb, w FROM nbr'):
            self.nbr[t].append((nb, w))
        self.by_len = collections.defaultdict(list)
        for t in self.df:
            self.by_len[len(t)].append(t)
        self.dense = dense
        self._lock = None

    # ---- term resolution ---------------------------------------------------------------------------------------------
    def resolve(self, term):
        """-> [(search term, weight)] : the term itself, else a prefix relative ('hippopotamus' -> 'hippo'), else the closest
        spelling ('ballon' -> 'balloon')."""
        if self.df.get(term, 0) >= 1:
            return [(term, 1.0)]
        for v in L.variants(term)[1:]:  # waving -> wave, groaning -> groan
            if self.df.get(v, 0) >= 1 and len(v) >= 3:
                return [(v, 0.95)]
        out = []
        # a longer or shorter word of the same stem: one is a prefix of the other, sharing at least 4 letters
        for ln in range(max(4, len(term) - 5), len(term) + 6):
            for cand in self.by_len.get(ln, ()):
                a, b = (term, cand) if len(term) <= len(cand) else (cand, term)
                if len(a) >= 4 and b.startswith(a) and len(a) >= 0.55 * len(b):
                    out.append((cand, 0.75, self.df[cand]))
        if out:
            out.sort(key=lambda x: -x[2])
            return [(c, w) for c, w, _ in out[:3]]
        best = []
        if len(term) >= 4:
            for ln in range(len(term) - 1, len(term) + 2):
                for cand in self.by_len.get(ln, ()):
                    if cand[0] != term[0] and cand[1:2] != term[1:2]:
                        continue
                    r = difflib.SequenceMatcher(None, term, cand).ratio()
                    if r >= 0.84:
                        best.append((r, cand))
        best.sort(reverse=True)
        return [(c, 0.7) for _, c in best[:2]]

    # ---- lexical retrieval ---------------------------------------------------------------------------------------------
    def lexical(self, terms, where, params, dense_terms=None, per_term=3000, expand=True, name_only=()):
        """Per-term BM25 (FTS5, weighted columns), summed with a weight per term: the word itself 1.0, a spelling/prefix relative 0.75,
        a dense-vocabulary neighbour (hippopotamus -> hippo) up to 0.8, a corpus-learned neighbour (LSI) 0.25. A document's coverage is
        the share of the request's total term weight (by IDF) that it matches; a word nobody in the library uses counts against it."""
        S = collections.defaultdict(float)
        M = collections.defaultdict(float)
        seen = set()
        weighted, notes, idf_of = [], [], {}
        dense_terms = dense_terms or {}
        for t in terms:
            res = self.resolve(t)
            known = bool(res) and res[0][0] == t
            if not res:
                notes.append('unknown word: ' + t)
            elif not known:
                notes.append('%s -> %s' % (t, ','.join(r[0] for r in res)))
            for st, w in res:
                weighted.append((t, st, w, 1.0))
            for nb, cos in (dense_terms.get(t) or [])[:3]:
                if self.df.get(nb, 0) >= 1 and cos >= (0.5 if not known else 0.62):
                    weighted.append((t, nb, (0.8 if not known else 0.4) * cos, 0.5))  # a meaning-neighbour counts half towards coverage
            if res:
                idf_of[t] = idf(self.df.get(res[0][0], 1), self.n)
                if expand and known:
                    for nb, sim in self.nbr.get(t, ()):
                        weighted.append((None, nb, 0.25 * sim, 0.0))
            else:
                idf_of[t] = idf(1, self.n)  # nobody has this word: the request asks for something the library lacks
        total = sum(idf_of.values())
        credit = {}
        for t, st, w, cr in weighted:
            if not _TOK.fullmatch(st):
                continue
            sql = ('SELECT f.rowid AS r, -bm25(fts, %s) AS s FROM fts f JOIN items i ON i.rowid=f.rowid WHERE fts MATCH ? %s '
                   'ORDER BY s DESC LIMIT %d') % (BM25_W, where, per_term)
            match = ('{name} : "%s"' if t in name_only else '"%s"') % st
            for row in self.db.execute(sql, [match] + params):
                S[row['r']] += w * row['s']
                if t is not None and cr > credit.get((t, row['r']), 0.0):
                    credit[(t, row['r'])] = cr
        for (t, r), cr in credit.items():
            M[r] += idf_of[t] * cr
        return S, M, total, notes

    # ---- what kind of thing the request is for ---------------------------------------------------------------------------
    TYPE_PRIOR = {'model': 1.0, 'tool': 0.95, 'map': 0.92, 'system': 0.9, 'ui-kit': 0.9, 'vfx': 0.8, 'animation': 0.7, 'sfx': 0.7,
                  'ui-screen': 0.7, 'music': 0.6, 'script': 0.5, 'media-pack': 0.45}

    def type_weights(self, q):
        """A prior per type: asking for a thing is mostly asking for a model; a request that is full of words only a sound,
        animation or effect has (siren, waving, sparks), or that names a type outright, moves the weight there."""
        w = dict(self.TYPE_PRIOR)
        n = max(1, len(q.terms))
        for t, lex in (('animation', L.SUBTYPE_WORDS['animation']), ('vfx', L.SUBTYPE_WORDS['vfx']), ('sfx', L.SUBTYPE_WORDS['sfx'])):
            words = set().union(*lex.values())
            hits = sum(1 for term in q.terms if any(v in words for v in L.variants(term)))
            if hits:
                w[t] *= 1 + 1.2 * hits / n
                if t == 'sfx':
                    w['music'] *= 1 + 0.6 * hits / n
        if SYSTEM_CUES & set(q.terms):
            w['system'] *= 1.6
        if q.type:
            for t in w:
                w[t] *= 1.35 if t == q.type or (q.type == 'ui-kit' and t == 'ui-screen') else 0.85
            if q.type == 'sfx':
                w['music'] *= 1.2
        return w

    # ---- search ------------------------------------------------------------------------------------------------------
    def search(self, text, type=None, subtype=None, colour=None, size=None, min_quality=None, limit=12, explain=False, game=None):
        t0 = time.time()
        q = parse(text)
        applied = {}
        where, params = '', []
        if type:
            where += ' AND i.type=?'
            params.append(type)
            applied['type'] = type
        if subtype:
            where += ' AND i.subtype=?'
            params.append(subtype)
            applied['subtype'] = subtype
        if size:
            where += ' AND i.size_cls=?'
            params.append(size)
            applied['size'] = size
        if colour:
            c = L.COLOUR_WORDS.get(colour.lower(), colour.lower())
            where += " AND i.hues LIKE ?"
            params.append('%% %s %%' % L.colour_family(c or colour.lower()))
            applied['colour'] = colour
        if game:
            where += ' AND (i.game LIKE ? OR i.gameid LIKE ?)'
            params += ['%' + game + '%', game + '%']
            applied['game'] = game
        if min_quality is not None:
            where += ' AND i.q>=?'
            params.append(int(min_quality))
            applied['min_quality'] = int(min_quality)
        elif not type:
            # D-band items are left out unless asked for; UI kits, systems and art packs are not graded on this rubric
            where += " AND (i.band!='D' OR i.type IN ('ui-kit','system','media-pack'))"
        parsed = {}
        if q.colours:
            parsed['colours'] = q.colours
        if q.size:
            parsed['size_constraint'] = q.size
        if q.size_class:
            parsed['size_class'] = q.size_class
        if q.type:
            parsed['type_hint'] = q.type
        notes = []
        dense_docs, dense_terms = None, {}
        if self.dense is not None:
            try:
                dense_docs, dense_terms = self.dense.search(text, 300, q.terms)
            except Exception as e:  # the dense tier is optional: fall back to lexical + facets
                notes.append('dense unavailable: %s' % e)
        S, M, total, lnotes = self.lexical(q.terms, where, params, dense_terms, name_only=q.name_only)
        notes += lnotes
        if not S and not dense_docs:
            S = {r: 0.01 for r in self.facet_only(q, where, params)}
        dense_map = dict(dense_docs or [])
        pool = set(sorted(S, key=S.get, reverse=True)[:800]) | set(dense_map) | set(self.facet_candidates(q, where, params))
        if dense_docs:
            try:  # a cosine for every pooled item, so the dense rank is taken over the same candidates as the lexical one
                dense_map.update(self.dense.score(text, [r for r in pool if r not in dense_map][:3000]))
            except Exception as e:
                notes.append('dense scoring unavailable: %s' % e)
        rows = self.fetch(pool, where, params)
        top_lex = max((S.get(r, 0.0) for r in rows), default=1.0) or 1.0
        lexs, info = {}, {}
        for rid, row in rows.items():
            cov = (M.get(rid, 0.0) / total) if total else 0.0
            lexs[rid] = (S.get(rid, 0.0) / top_lex) * (0.35 + 0.65 * cov)
            hit, factor, size_ok = [], 1.0, True
            if q.colours:
                if row['labs']:
                    m = self.colour_fit(q.colours, row['labs'])
                    factor *= 0.55 + 0.9 * m if m > 0.35 else 0.55
                    if m > 0.35:
                        hit.append('colour')
                else:
                    factor *= 0.85  # no palette on record: cannot confirm, not ruled out
            if q.size:
                f = size_fit((row['dx'], row['dy'], row['dz']), q.size) if row['dx'] is not None and row['size_conf'] != 'none' else None
                if f is None:
                    factor *= 0.6
                    size_ok = False
                else:
                    factor *= 0.2 + 0.8 * f
                    size_ok = f > 0.6
                    if size_ok:
                        hit.append('size')
            elif q.size_class and row['size_cls']:
                if row['size_cls'] == q.size_class:
                    factor *= 1.2
                    hit.append('size')
            if q.type and row['type'] == q.type:
                hit.append('type')
            info[rid] = (cov, hit, factor, size_ok)
        # A stated number is a filter: when enough items satisfy it, they are ranked among themselves (words and meaning),
        # and the rest only follow.
        keep = {r for r in rows if info[r][3]} if q.size else set(rows)
        if q.type in HARD_TYPES:  # a type named outright ("a tiny arena MAP", "a SOUND of ...") narrows the candidates when enough exist
            typed = {r for r in keep if rows[r]['type'] in HARD_TYPES[q.type]}
            if len(typed) >= 5:
                keep = typed
        if len(keep) < 5:
            keep = set(rows)

        def ranks(ids, key):
            return {r: k + 1 for k, r in enumerate(sorted(ids, key=lambda r: -key[r]))}
        lex_all = ranks([r for r in rows if S.get(r)], lexs)
        lex_keep = ranks([r for r in keep if S.get(r)], lexs)
        den_all = ranks([r for r in rows if r in dense_map], dense_map)
        den_keep = ranks([r for r in keep if r in dense_map], dense_map)
        lex_rank, dense_rank = lex_all, den_all
        tw = self.type_weights(q)
        K = 30.0
        norm = (2.0 if dense_docs else 1.0) / (K + 1)
        scored = []
        for rid, row in rows.items():
            cov, hit, factor, _ = info[rid]
            inside = rid in keep
            lr, dr = (lex_keep if inside else lex_all).get(rid), (den_keep if inside else den_all).get(rid)
            base = (1.0 / (K + lr) if lr else 0.0) + (1.0 / (K + dr) if dr else 0.0)
            base = base / norm if norm else 0.0
            if not inside:
                base *= 0.1
            score = base * factor * tw.get(row['type'], 0.7) * (0.9 + 0.2 * (row['q'] / 100.0))
            if self.generic_name(row['name']):
                score *= 0.7
            scored.append((score, rid, row, cov, hit, dense_map.get(rid)))
        scored.sort(key=lambda x: -x[0])
        out, groups, total_matches = [], {}, len(scored)
        for score, rid, row, cov, hit, d in scored:
            key = row['near'] or (None if self.generic_name(row['name']) else (row['type'], row['name'].lower()))
            if key is not None and key in groups:
                groups[key]['same_as'].append(row['id'])
                groups[key]['copies'] += row['copies']
                continue
            rec = json.loads(row['json'])
            item = self.brief(rec, row, score, lex_rank=lex_rank.get(rid), dense_rank=dense_rank.get(rid), hit=hit, cov=cov, explain=explain, cos=d)
            if key is not None:
                groups[key] = item
            out.append(item)
            if len(out) >= limit * 4:
                break
        out = out[:limit]
        top = out[0]['match']['score'] if out else 0.0
        strong = bool(out) and (out[0]['match']['coverage'] >= 0.6 or (out[0]['match'].get('dense') or 0) >= 0.62)
        return dict(q=text, filters_applied=dict(applied, parsed=parsed) if (applied or parsed) else {}, total_matches=total_matches, top_score=round(top, 3),
                    no_strong_match=not strong, items=out, notes=notes, tiers=dict(lexical=True, expansion=bool(self.nbr), dense=bool(dense_docs)),
                    ms=round((time.time() - t0) * 1000))

    @staticmethod
    def generic_name(name):
        ws = L.split_words(name)
        return not ws or all(w in L.GENERIC_NAMES for w in ws)

    def facet_candidates(self, q, where, params):
        """Items that satisfy a stated size number (and the type named), added to the pool even when no word of the request is
        in their text: a map is called by its game's name, so 'a tiny arena map under 70 studs' finds it by size alone."""
        if not q.size:
            return []
        col = {'y': 'i.dy', 'xz': 'MAX(i.dx, i.dz)', 'max': 'i.maxdim'}[q.size['axis']]
        op = {'min': '>=', 'max': '<=', 'approx': 'BETWEEN'}[q.size['kind']]
        v = q.size['value']
        cond, p = ('%s >= ?' % col, [v]) if q.size['kind'] == 'min' else ('%s <= ?' % col, [v]) if q.size['kind'] == 'max' else ('%s BETWEEN ? AND ?' % col, [v * 0.6, v * 1.7])
        t = ' AND i.type=?' if q.type in ('map', 'model', 'tool', 'vfx') else ''
        sql = "SELECT i.rowid FROM items i WHERE i.size_conf IN ('measured','bounds') AND %s %s %s ORDER BY i.q DESC LIMIT 400" % (cond, t, where)
        return [r[0] for r in self.db.execute(sql, p + ([q.type] if t else []) + params)]

    def facet_only(self, q, where, params):
        conds, p = [], []
        if q.type and q.type in ('model', 'map', 'tool', 'ui-screen', 'ui-kit', 'vfx', 'sfx', 'music', 'animation', 'system'):
            conds.append('i.type=?')
            p.append(q.type)
        if q.colours:
            conds.append('(' + ' OR '.join('i.hues LIKE ?' for _ in q.colours) + ')')
            p += ['%% %s %%' % L.colour_family(c) for c in q.colours]
        if q.size_class:
            conds.append('i.size_cls=?')
            p.append(q.size_class)
        sql = 'SELECT i.rowid FROM items i WHERE 1=1 %s %s ORDER BY i.q DESC LIMIT 300' % (where, (' AND ' + ' AND '.join(conds)) if conds else '')
        return [r[0] for r in self.db.execute(sql, params + p)]

    def fetch(self, ids, where='', params=()):
        out = {}
        ids = list(ids)
        for a in range(0, len(ids), 500):
            chunk = ids[a:a + 500]
            sql = 'SELECT i.* FROM items i WHERE i.rowid IN (%s) %s' % (','.join('?' * len(chunk)), where)
            for r in self.db.execute(sql, chunk + list(params)):
                out[r['rowid']] = r
        return out

    def colour_fit(self, wanted, labs_json):
        """Best match of any requested colour against the item's top-3 palette: 1 = the main colour is that colour."""
        try:
            labs = json.loads(labs_json)
        except ValueError:
            return 0.0
        best = 0.0
        for name in wanted:
            tgt = L.COLOUR_LAB.get(name)
            if not tgt:
                continue
            for k, (hexv, share) in enumerate(labs):
                d = L.dist(L.lab(L.hex_rgb(hexv)), tgt)
                m = max(0.0, 1 - d / 45.0) * (1.0 if k == 0 else 0.7 if k == 1 else 0.5)
                best = max(best, m)
        return best

    def brief(self, rec, row, score, lex_rank, dense_rank, hit, cov, explain, cos=None):
        c = rec.get('colour')
        comp = rec['composition']
        q = rec['quality']
        thumb = rec['image']['path'] if rec['image']['status'] == 'ok' else None
        item = dict(
            id=rec['id'], gameId=rec['provenance'].get('gameId'), path=rec['provenance'].get('path'),
            kind=rec.get('kind') or {'system': 'system', 'ui-kit': 'ui-kit', 'media-pack': 'media'}.get(rec['type'], rec['type']),
            className=rec.get('className'), type=rec['type'], subtype=rec.get('subtype'),
            name=(rec['name_clean'] if rec['type'] == 'map' else rec['name']) or rec['name'],
            description=rec['description'], tags=(rec.get('tags') or [])[:8], look=rec.get('look'),
            size=dict(studs=rec['size'].get('studs'), **{'class': rec['size'].get('cls')}, conf=rec['size'].get('conf')),
            colours=[dict(name=t['name'], hex='#' + t['hex'], share=t['share']) for t in (c['top'] if c else [])],
            parts=comp.get('parts'), instances=comp.get('instances'), scripts=comp.get('scripts'), humanoid=bool(comp.get('humanoid')),
            animated=bool(comp.get('animated')), contains=(rec.get('contains') or [])[:12],
            quality=dict(score=q['score'], band=q['band'], reasons=q['reasons'][:3]),
            provenance=dict(game=rec['provenance'].get('game'), path=rec['provenance'].get('path'), licence=rec['provenance'].get('licence')),
            copies=rec.get('copies') or 1, same_as=[], thumb=thumb,
            match=dict(score=round(score, 3), lexical_rank=lex_rank, dense_rank=dense_rank, facets_hit=hit, coverage=round(cov, 2),
                       **({'dense': round(cos, 3)} if cos is not None else {})))
        if explain:
            item['match']['why'] = ', '.join(hit) or 'text match'
        return item


def open_finder(directory=None, dense=None):
    return Finder(directory or os.environ.get('APPLE_OWNER_CLASSIFY') or DEFAULT_DIR, dense=dense)


if __name__ == '__main__':
    f = open_finder(os.environ.get('APPLE_OWNER_CLASSIFY'))
    r = f.search(' '.join(sys.argv[1:]) or 'treasure chest', explain=True)
    for it in r['items']:
        print(it['match']['score'], it['id'], it['type'], it['name'], '|', it['provenance']['game'], '|', it['size']['studs'], [c['name'] for c in it['colours']], it['match']['facets_hit'])
    print({k: v for k, v in r.items() if k != 'items'})
