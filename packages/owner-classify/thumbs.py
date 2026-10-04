"""Proxy thumbnails for the classified library: a small isometric picture of each physical item, drawn with Pillow from the boxes
colour_pass.luau dumped (the largest parts of the item as world-aligned boxes with their colours).

    python3 thumbs.py [--out DIR] [--limit N] [--size 96] [--sample N]

HONEST LABEL: this is a proxy render (kind "proxy-render"), not a Studio screenshot. Meshes and unions are drawn as their bounding
box, rotated parts as the axis-aligned box that covers them, at most 80 parts per item. It shows silhouette, proportions and
colour, not detail. Writes <out>/thumbs/<id>.png (about 1-3 KB each) for items whose pass data exists; classify.py then marks
image.kind=proxy-render, status=ok for those whose picture is not blank. No Studio, no network, no model.
"""
import argparse
import json
import math
import os
import random
import sys
import time

from PIL import Image, ImageDraw

DEFAULT_OUT = os.path.expanduser('~/Library/Application Support/Apple/owner-classify')
BG = (236, 238, 241)
C30, S30 = math.cos(math.radians(30)), math.sin(math.radians(30))


def shade(rgb, k):
    return tuple(max(0, min(255, int(c * k))) for c in rgb)


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def proj(x, y, z):
    return ((x - z) * C30, -y + (x + z) * S30)


def render(boxes, size=96):
    """boxes: [[x0,y0,z0,x1,y1,z1,hex,transparency,mesh,shape], ...] -> PIL image (or None when there is nothing to draw)."""
    if not boxes:
        return None
    pts = []
    for b in boxes:
        for x in (b[0], b[3]):
            for y in (b[1], b[4]):
                for z in (b[2], b[5]):
                    pts.append(proj(x, y, z))
    minx, maxx = min(p[0] for p in pts), max(p[0] for p in pts)
    miny, maxy = min(p[1] for p in pts), max(p[1] for p in pts)
    w, h = maxx - minx, maxy - miny
    if w <= 0 and h <= 0:
        return None
    ss = 3  # supersample, then shrink: smooth edges without any anti-aliasing code
    pad = 6
    scale = (size - 2 * pad) * ss / max(w, h, 1e-6)
    ox = (size * ss - w * scale) / 2 - minx * scale
    oy = (size * ss - h * scale) / 2 - miny * scale
    img = Image.new('RGB', (size * ss, size * ss), BG)
    d = ImageDraw.Draw(img)
    P = lambda x, y, z: (proj(x, y, z)[0] * scale + ox, proj(x, y, z)[1] * scale + oy)
    for b in sorted(boxes, key=lambda b: (b[0] + b[3]) / 2 + (b[1] + b[4]) / 2 + (b[2] + b[5]) / 2):
        x0, y0, z0, x1, y1, z1, col, tr = b[:8]
        shape = b[9] if len(b) > 9 else 1
        base = hex_rgb(col)
        if tr and tr > 0.3:
            base = tuple(int(c * (1 - tr * 0.6) + BG[i] * tr * 0.6) for i, c in enumerate(base))
        if shape == 0:  # ball: a shaded disc at the box's centre
            cx, cy = P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
            r = max((x1 - x0), (y1 - y0), (z1 - z0)) / 2 * scale * 0.9
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=shade(base, 0.92), outline=shade(base, 0.6))
            continue
        top = [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)]
        px = [P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)]   # the +x face
        pz = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]   # the +z face
        edge = shade(base, 0.55)
        d.polygon(pz, fill=shade(base, 0.62), outline=edge)
        d.polygon(px, fill=shade(base, 0.8), outline=edge)
        d.polygon(top, fill=shade(base, 1.0), outline=edge)
    return img.resize((size, size), Image.LANCZOS)


def blank(img):
    """True when (almost) nothing but background was drawn."""
    px = img.getdata()
    other = sum(1 for p in px if abs(p[0] - BG[0]) + abs(p[1] - BG[1]) + abs(p[2] - BG[2]) > 18)
    return other < 0.012 * len(px)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--limit', type=int)
    ap.add_argument('--size', type=int, default=96)
    ap.add_argument('--sample', type=int, help='render N random items into <out>/thumbs-sample/ for review instead of all')
    a = ap.parse_args(argv)
    passes = {}
    todo = []
    with open(os.path.join(a.out, 'items.jsonl')) as f:
        for line in f:
            r = json.loads(line)
            if r['type'] not in ('model', 'tool', 'vfx', 'map') or not r['provenance'].get('gameId'):
                continue
            todo.append((r['id'], r['provenance']['gameId'], r['provenance']['path'], r['name']))
    if a.sample:
        random.seed(7)
        todo = random.sample(todo, min(a.sample, len(todo)))
    if a.limit:
        todo = todo[:a.limit]
    dst = os.path.join(a.out, 'thumbs-sample' if a.sample else 'thumbs')
    os.makedirs(dst, exist_ok=True)
    by_game = {}
    for t in todo:
        by_game.setdefault(t[1], []).append(t)
    pass_dir = os.path.join(a.out, 'pass')
    names = {n[:12]: n for n in os.listdir(pass_dir) if n.endswith('.json') and not n.startswith('_')}
    t0 = time.time()
    made = blanks = missing = 0
    for g12, items in by_game.items():
        fn = names.get(g12)
        if not fn:
            missing += len(items)
            continue
        data = json.load(open(os.path.join(pass_dir, fn)))
        byp = {i['path']: i for i in data['items']}
        for iid, _g, path, name in items:
            info = byp.get(path)
            if not info or not info.get('boxes'):
                missing += 1
                continue
            img = render(info['boxes'], a.size)
            if img is None or blank(img):
                blanks += 1
                continue
            img.convert('P', palette=Image.ADAPTIVE, colors=40).save(os.path.join(dst, iid.replace(':', '_') + '.png'), optimize=True)
            made += 1
    secs = time.time() - t0
    rep = dict(made=made, blank=blanks, no_pass_data=missing, seconds=round(secs, 1), per_item_ms=round(1000 * secs / max(1, made + blanks), 1), size=a.size)
    json.dump(rep, open(os.path.join(a.out, 'thumbs.meta.json' if not a.sample else 'thumbs-sample.meta.json'), 'w'))
    print(json.dumps(rep))


if __name__ == '__main__':
    main()
