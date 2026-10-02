"""Runs the 50 labelled queries (eval50.json) and reports top-1 / top-3 / top-10 hit rates, MRR, reject-probe false accepts and
per-field coverage.

    python3 eval50.py [--dir owner-classify]            in-process, against the sidecar index
    python3 eval50.py --url http://127.0.0.1:63799      through a gateway's /v1/library/find (read-only GETs)
    options: --dense (use the dense tier if embed.py is available), --json out.json, --verbose

A result is a hit when its id, or the id of any near-duplicate copy collapsed into it (same_as), is in the query's accept list:
the answer sets were written as rules over every distinct hash, so version copies of one thing are all right answers.
CAVEAT (kept in the report): the answer sets come from name/path/size/colour rules, so they favour name-bearing items and were
written before any search was run; weights in search.py were set from principle first and tuned afterwards on these same
queries, so the reported numbers are optimistic for unseen requests.
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def load_eval(path=None):
    d = json.load(open(path or os.path.join(HERE, 'eval50.json')))
    return d['items'], d['reject_probes']


def runner(args):
    if args.url:
        def run(q, limit=10):
            u = args.url.rstrip('/') + '/v1/library/find?' + urllib.parse.urlencode(dict(q=q, limit=limit))
            return json.load(urllib.request.urlopen(u, timeout=60))
        return run
    import search
    dense = None
    if args.dense:
        import embed
        dense = embed.client(args.dir)
    f = search.open_finder(args.dir, dense=dense)
    return lambda q, limit=10: f.search(q, limit=limit)


def evaluate(run, items, probes, verbose=False):
    rows, cats = [], {}
    for it in items:
        res = run(it['q'], 10)
        acc = set(it['accept'])
        rank = None
        for k, r in enumerate(res['items']):
            if acc & ({r['id']} | set(r.get('same_as') or [])):
                rank = k + 1
                break
        row = dict(id=it['id'], cat=it['cat'], q=it['q'], rank=rank, n_accept=len(acc), top=[r['name'] + ' [' + r['type'] + ']' for r in res['items'][:3]])
        rows.append(row)
        c = cats.setdefault(it['cat'], dict(n=0, top1=0, top3=0, top10=0, mrr=0.0))
        c['n'] += 1
        c['top1'] += rank == 1
        c['top3'] += bool(rank and rank <= 3)
        c['top10'] += bool(rank)
        c['mrr'] += 1.0 / rank if rank else 0.0
        if verbose:
            print('%-4s rank=%-4s %-60s -> %s' % (it['id'], rank, it['q'][:60], '; '.join(row['top'])), file=sys.stderr)
    n = len(rows)
    tot = dict(n=n, top1=sum(r['rank'] == 1 for r in rows), top3=sum(bool(r['rank'] and r['rank'] <= 3) for r in rows),
               top10=sum(bool(r['rank']) for r in rows), mrr=round(sum(1.0 / r['rank'] for r in rows if r['rank']) / n, 3))
    false_accept = []
    for p in probes:
        res = run(p['q'], 10)
        confident = bool(res['items']) and not res.get('no_strong_match', False)
        false_accept.append(dict(id=p['id'], q=p['q'], confident=confident, top=[r['name'] for r in res['items'][:2]]))
        if verbose:
            print('%-4s confident=%-5s %-40s -> %s' % (p['id'], confident, p['q'], false_accept[-1]['top']), file=sys.stderr)
    for c in cats.values():
        c['mrr'] = round(c['mrr'] / c['n'], 3)
    return dict(total=tot, by_category=cats, reject_probes=dict(false_accepts=sum(x['confident'] for x in false_accept), of=len(probes), detail=false_accept),
                misses=[r for r in rows if not r['rank'] or r['rank'] > 3])


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default=os.environ.get('APPLE_OWNER_CLASSIFY') or os.path.expanduser('~/Library/Application Support/Apple/owner-classify'))
    ap.add_argument('--url')
    ap.add_argument('--dense', action='store_true')
    ap.add_argument('--json')
    ap.add_argument('--verbose', action='store_true')
    ap.add_argument('--eval')
    a = ap.parse_args(argv)
    items, probes = load_eval(a.eval)
    rep = evaluate(runner(a), items, probes, a.verbose)
    cov = os.path.join(a.dir, 'coverage.json')
    if os.path.exists(cov):
        rep['coverage'] = json.load(open(cov))
    if a.json:
        json.dump(rep, open(a.json, 'w'), indent=1)
    t = rep['total']
    print('top-1 %d/%d  top-3 %d/%d (%.0f%%)  top-10 %d/%d  MRR %.3f  reject false-accepts %d/%d' % (
        t['top1'], t['n'], t['top3'], t['n'], 100.0 * t['top3'] / t['n'], t['top10'], t['n'], t['mrr'],
        rep['reject_probes']['false_accepts'], rep['reject_probes']['of']))
    for cat, c in rep['by_category'].items():
        print('  %-10s n=%-2d top1=%-2d top3=%-2d top10=%-2d mrr=%.2f' % (cat, c['n'], c['top1'], c['top3'], c['top10'], c['mrr']))
    return rep


if __name__ == '__main__':
    main()
