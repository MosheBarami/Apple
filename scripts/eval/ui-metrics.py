#!/usr/bin/env python3
"""StudPilot UI metrics (UI Spec v2, section 9). Planner's reference implementation, 2026-10-06.

Usage:
  python3 ui-metrics.py <image> --box x0,y0,x1,y1 [--pattern x0,y0,x1,y1 ...] [--dark-ok]

--box      the window (or UI) area in image pixels; it is resized to 480 px wide before measuring.
--pattern  one or more flat, text-free areas (a header strip, a card face, a button face) in image pixels.
--dark-ok  the request asked for a dark theme: skips the dark-share gate.

Prints JSON and exits 1 when any gate fails.
Thresholds come from measuring top games and 2026 kits (Pet Simulator 99, Bubble Gum Sim Infinity, Cartoony UI Kit,
Stud UI Pack) against StudPilot's own builds. See STUDPILOT-UI-CRITIQUE.md, section 2.
"""
import argparse, colorsys, json, statistics, sys
from PIL import Image, ImageFilter

GATES = {
    'contour_min': 0.88,     # share of strong edges with a dark pixel within 2 px. References 0.89-1.00; ours 0.18-0.87
    'edge_min': 34.0,        # mean edge strength. References 34-57; ours 26-31
    'dark_max': 0.20,        # share of dark pixels in the window (navy wells fail). Skip with --dark-ok
    'pattern_min': 0.015,    # studs/checker visible at all
    'pattern_max': 0.035,    # but quiet. Stud UI Pack 0.017-0.034, Cartoony kit 0.025; ours 0.046-0.056
}

def box(s):
    v = [int(x) for x in s.split(',')]
    assert len(v) == 4
    return tuple(v)

def window_metrics(im, b):
    w = im.crop(b)
    w = w.resize((480, max(1, int(480 * w.height / w.width))))
    px = list(w.getdata())
    hsv = [colorsys.rgb_to_hsv(*(c / 255 for c in p)) for p in px]
    n = len(hsv)
    lum = sorted(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] for p in px)
    g = w.convert('L')
    edges = g.filter(ImageFilter.FIND_EDGES)
    ev = list(edges.getdata())
    thr = max(sorted(ev)[int(n * 0.90)], 40)
    mins = list(g.filter(ImageFilter.MinFilter(5)).getdata())
    strong = [i for i, v in enumerate(ev) if v >= thr]
    contour = sum(1 for i in strong if mins[i] < 60) / max(1, len(strong))
    return {
        'contour': contour,
        'edge': sum(ev) / n,
        'darkest2': lum[int(n * 0.02)],
        'white': sum(1 for h in hsv if h[1] < 0.12 and h[2] > 0.85) / n,
        'dark': sum(1 for h in hsv if h[2] < 0.30) / n,
        'saturation': sum(h[1] for h in hsv) / n,
    }

def pattern_strength(im, b):
    g = im.convert('L').crop(b)
    blur = g.filter(ImageFilter.GaussianBlur(5))
    res = [a - c for a, c in zip(g.getdata(), blur.getdata())]
    mean = statistics.mean(g.getdata()) or 1
    return statistics.pstdev(res) / mean

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--box', type=box, required=True)
    ap.add_argument('--pattern', type=box, nargs='*', default=[])
    ap.add_argument('--dark-ok', action='store_true')
    a = ap.parse_args()
    im = Image.open(a.image).convert('RGB')
    m = window_metrics(im, a.box)
    m['pattern'] = [round(pattern_strength(im, b), 4) for b in a.pattern]
    fails = []
    if m['contour'] < GATES['contour_min']: fails.append(f"no dark contour on edges: {m['contour']:.2f} < {GATES['contour_min']}")
    if m['edge'] < GATES['edge_min']: fails.append(f"soft/flat: edge {m['edge']:.1f} < {GATES['edge_min']}")
    if not a.dark_ok and m['dark'] > GATES['dark_max']: fails.append(f"dark share {m['dark']:.3f} > {GATES['dark_max']}")
    for i, p in enumerate(m['pattern']):
        if not (GATES['pattern_min'] <= p <= GATES['pattern_max']):
            fails.append(f"pattern area {i}: {p:.3f} outside {GATES['pattern_min']}-{GATES['pattern_max']}")
    out = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in m.items()}
    out['pass'] = not fails
    out['fails'] = fails
    print(json.dumps(out, indent=1))
    sys.exit(0 if not fails else 1)

if __name__ == '__main__':
    main()
