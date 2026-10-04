"""Runs colour_pass.luau (Lune, no Studio, no script execution) over the library's source files, one process per game, at low CPU priority.

    python3 colour_pass.py [--lib DIR] [--out DIR] [--workers 2] [--games N] [--game ID] [--timeout 600]

Reads  <lib>/sources/<id>.rbx* and <lib>/entries/<id>.assets.json (read-only); writes <out>/pass/<id>.json (the sidecar, never inside
the library) and <out>/pass/_log.jsonl (seconds per game). Games whose pass file exists are skipped, so a stopped run resumes.
"""
import argparse
import concurrent.futures
import glob
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LIB = os.path.expanduser('~/Library/Application Support/Apple/owner-library')
DEFAULT_OUT = os.path.expanduser('~/Library/Application Support/Apple/owner-classify')
LUNE = os.path.expanduser('~/.rokit/tool-storage/lune-org/lune/0.10.5/lune')


def find_source(lib, gid):
    hits = glob.glob(os.path.join(lib, 'sources', gid + '.*'))
    return hits[0] if hits else None


def run_one(lib, out, gid, timeout):
    dst = os.path.join(out, 'pass', gid + '.json')
    if os.path.exists(dst):
        return gid, 'skip', 0.0
    src = find_source(lib, gid)
    assets = os.path.join(lib, 'entries', gid + '.assets.json')
    if not src or not os.path.exists(assets):
        return gid, 'nosource', 0.0
    t0 = time.time()
    tmp = dst + '.tmp'
    try:
        r = subprocess.run([LUNE, 'run', os.path.join(HERE, 'colour_pass.luau'), src, assets, gid, tmp], capture_output=True, text=True,
                           timeout=timeout, preexec_fn=lambda: os.nice(10))
    except subprocess.TimeoutExpired:
        return gid, 'timeout', time.time() - t0
    if r.returncode != 0 or not os.path.exists(tmp):
        return gid, 'error: ' + (r.stderr or r.stdout)[-200:], time.time() - t0
    os.replace(tmp, dst)
    return gid, 'ok', time.time() - t0


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--lib', default=DEFAULT_LIB)
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--workers', type=int, default=2)
    ap.add_argument('--games', type=int)
    ap.add_argument('--game')
    ap.add_argument('--timeout', type=int, default=600)
    a = ap.parse_args(argv)
    if os.path.realpath(a.out).startswith(os.path.realpath(a.lib) + os.sep):
        sys.exit('refusing to write inside the library directory')
    os.makedirs(os.path.join(a.out, 'pass'), exist_ok=True)
    ids = sorted(os.path.basename(p).split('.')[0] for p in glob.glob(os.path.join(a.lib, 'entries', '*.assets.json')))
    if a.game:
        ids = [i for i in ids if i.startswith(a.game)]
    if a.games:
        ids = ids[:a.games]
    t0 = time.time()
    done = 0
    log = open(os.path.join(a.out, 'pass', '_log.jsonl'), 'a')
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as ex:
        for gid, status, secs in ex.map(lambda g: run_one(a.lib, a.out, g, a.timeout), ids):
            done += 1
            size = 0
            src = find_source(a.lib, gid)
            if src:
                size = os.path.getsize(src)
            log.write(json.dumps(dict(game=gid, status=status, seconds=round(secs, 1), source_bytes=size)) + '\n')
            log.flush()
            if status not in ('ok', 'skip') or done % 25 == 0:
                print('%d/%d %s %s %.0fs (elapsed %.0fs)' % (done, len(ids), gid[:12], status, secs, time.time() - t0), file=sys.stderr)
    print('done %d games in %.0fs' % (done, time.time() - t0))


if __name__ == '__main__':
    main()
