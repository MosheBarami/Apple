"""Builds the search index (a SQLite file with FTS5) from items.jsonl. Offline; reads only the sidecar directory.

    python3 index.py [--dir owner-classify] [--lsi]

Tiers (see README.md):
  T0  BM25 over fielded text (FTS5, porter stemming) + facets stored as columns.
  T1  LSI term neighbours (scipy svds over the same documents): query expansion by corpus co-occurrence, no model. OFF by default:
      on the 50 labelled queries it LOWERED top-3 (31 -> 29 without dense, 38 -> 37 with it), so it is built only with --lsi.
  T2  dense embeddings (embed.py), optional; built separately.
"""
import argparse
import collections
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

SCHEMA = '''
CREATE TABLE items(
  rowid INTEGER PRIMARY KEY, id TEXT UNIQUE, type TEXT, subtype TEXT, name TEXT, near TEXT, q INTEGER, band TEXT,
  size_cls TEXT, maxdim REAL, dx REAL, dy REAL, dz REAL, size_conf TEXT, hues TEXT, sat TEXT, look TEXT, parts INTEGER, humanoid INTEGER,
  scripts INTEGER, copies INTEGER, game TEXT, gameid TEXT, path TEXT, labs TEXT, json TEXT);
CREATE INDEX items_type ON items(type);
CREATE VIRTUAL TABLE fts USING fts5(name, tags, descr, context, game, tokenize='porter unicode61 remove_diacritics 2', prefix='2 3');
CREATE VIRTUAL TABLE vocab USING fts5vocab(fts, 'row');
CREATE TABLE nbr(term TEXT, nb TEXT, w REAL);
CREATE TABLE words(term TEXT PRIMARY KEY, df INTEGER);
CREATE INDEX nbr_term ON nbr(term);
CREATE TABLE meta(k TEXT PRIMARY KEY, v TEXT);
'''


def doc_fields(r):
    """The five weighted FTS columns. The template description is NOT indexed (it repeats 'parts', 'from', 'scripts' in every
    record and would only add noise); natural text (a game card summary, a system's purpose, a screen's own texts) is."""
    name = r['name_clean'] or r['name']
    split = ' '.join(L.split_words(name))
    if split and split != name.lower():
        name = name + ' ' + split  # TheFloorIsLava is also 'the floor is lava'
    tags = ' '.join(r.get('tags') or [])
    natural = ''
    if r['type'] == 'map' or r['type'] == 'system':
        natural = r['description']
    elif r['type'] == 'ui-screen':
        natural = ' '.join((r['composition'].get('texts') or []))
    ctx = ' '.join([r.get('context') or '', ' '.join(r.get('contains') or [])])
    game = ' '.join([r['provenance'].get('game') or '', ' '.join(r.get('game_tags') or [])])
    return name, tags, natural, ctx, game


def build(d, lsi=False):
    src = os.path.join(d, 'items.jsonl')
    dst = os.path.join(d, 'find.sqlite')
    tmp = dst + '.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    db = sqlite3.connect(tmp)
    db.executescript(SCHEMA)
    t0 = time.time()
    n = 0
    docs = []
    with open(src) as f:
        for line in f:
            r = json.loads(line)
            s, c = r['size'], r.get('colour')
            studs = s.get('studs') or [None, None, None]
            labs = ''
            if c:
                labs = json.dumps([[t['hex'], t['share']] for t in c['top']])
            db.execute('INSERT INTO items VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (
                n + 1, r['id'], r['type'], r.get('subtype'), r['name_clean'] or r['name'], r.get('near'), r['quality']['score'], r['quality']['band'],
                s.get('cls'), max(studs) if studs[0] is not None else None, studs[0], studs[1], studs[2], s.get('conf'),
                ' ' + ' '.join(c['hues']) + ' ' if c else None, c['saturation'] if c else None, r.get('look'), r['composition'].get('parts'),
                1 if r['composition'].get('humanoid') else 0, r['composition'].get('scripts'), r.get('copies') or 1,
                r['provenance'].get('game'), r['provenance'].get('gameId'), r['provenance'].get('path'), labs, line.rstrip('\n')))
            f4 = doc_fields(r)
            db.execute('INSERT INTO fts(rowid,name,tags,descr,context,game) VALUES(?,?,?,?,?,?)', (n + 1, *f4))
            docs.append(f4)
            n += 1
    db.commit()
    print('items %d in %.0fs' % (n, time.time() - t0), file=sys.stderr)
    df = collections.Counter()
    for f4 in docs:
        df.update(set(stem_tokens(' '.join(f4))))
    db.executemany('INSERT INTO words VALUES(?,?)', df.items())
    if lsi:
        try:
            nb = lsi_neighbours(docs)
            db.executemany('INSERT INTO nbr VALUES(?,?,?)', nb)
            print('LSI neighbour rows %d' % len(nb), file=sys.stderr)
        except ImportError as e:
            print('LSI skipped: %s' % e, file=sys.stderr)
    db.execute('INSERT INTO meta VALUES(?,?)', ('built', str(int(time.time()))))
    db.execute('INSERT INTO meta VALUES(?,?)', ('items', str(n)))
    db.commit()
    db.execute('PRAGMA optimize')
    db.close()
    os.replace(tmp, dst)
    return n


_TOK = re.compile(r'[a-z0-9]+')


def stem_tokens(text):
    return [L.singular(w) for w in _TOK.findall(text.lower()) if w not in L.STOP and not w.isdigit() and len(w) > 1]


def lsi_neighbours(docs, k=96, per_term=6, min_df=3, floor=0.55):
    """Latent-semantic neighbours of each term, learned from which words share documents (name, tags, context, purpose text;
    not the game name). 'pet' ends up near 'egg' and 'hatch' because the library puts them together; nothing is hand-listed."""
    import numpy as np
    from scipy import sparse
    from scipy.sparse.linalg import svds
    vocab, rows, cols, vals = {}, [], [], []
    df = collections.Counter()
    toks = []
    for name, tags, natural, ctx, _game in docs:
        t = collections.Counter(stem_tokens(' '.join([name, name, tags, natural, ctx])))
        toks.append(t)
        df.update(t.keys())
    keep = {w for w, c in df.items() if c >= min_df and not w.isdigit()}
    terms = sorted(keep)
    vocab = {w: i for i, w in enumerate(terms)}
    N = len(docs)
    for di, t in enumerate(toks):
        for w, c in t.items():
            j = vocab.get(w)
            if j is not None:
                rows.append(di)
                cols.append(j)
                vals.append((1 + math.log(c)) * math.log(N / df[w]))
    X = sparse.csr_matrix((vals, (rows, cols)), shape=(N, len(terms)), dtype=np.float32)
    k = min(k, min(X.shape) - 2)
    u, s, vt = svds(X, k=k)
    T = (vt.T * s)  # term vectors in latent space
    T /= (np.linalg.norm(T, axis=1, keepdims=True) + 1e-9)
    out = []
    B = 2048
    for a in range(0, len(terms), B):
        sims = T[a:a + B] @ T.T
        for i in range(sims.shape[0]):
            sims[i, a + i] = -1
        top = np.argpartition(-sims, per_term, axis=1)[:, :per_term]
        for i in range(sims.shape[0]):
            for j in top[i]:
                if sims[i, j] >= floor:
                    out.append((terms[a + i], terms[j], round(float(sims[i, j]), 3)))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default=DEFAULT_DIR)
    ap.add_argument('--lsi', action='store_true', help='also build the LSI term neighbours (off by default: measured to lower the hit rate)')
    a = ap.parse_args(argv)
    n = build(a.dir, lsi=a.lsi)
    print('built %s (%d items)' % (os.path.join(a.dir, 'find.sqlite'), n))


if __name__ == '__main__':
    main()
