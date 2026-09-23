#!/usr/bin/env python3
"""One side-by-side image per gauntlet round: our Apple MAX Studio shot against the real game.

The owner asked (2026-09-23) to see every comparison in the chat, so each round ends with this image
sent to him. Hebrew labels are laid out right-to-left by hand because PIL has no bidi.

  python3 docs/gauntlet/visual/compare.py --round 2 --ours shot.png --note "..." --note "..."

Since 2026-09-23 evening the target is a cartoon simulator, judged as three tests (owner): the map,
the 3D models, and the UI. `--test map|models|ui` compares against refs/simulator/<test>/; without
it the round compares against the retired Grow-a-Garden refs, so old rounds still rebuild.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
REFS = HERE / 'refs'
MAIN_REF = REFS / 'roblox-grow-a-garden-screenshot.png'
SIM = REFS / 'simulator'
TESTS = {'map': 'המפה', 'models': 'המודלים וה-3D', 'ui': 'ה-UI'}
FONT = next(p for p in ['/Library/Fonts/Arial Unicode.ttf', '/System/Library/Fonts/ArialHB.ttc'] if Path(p).exists())
W, PAD = 1800, 20
BG, PANEL, OURS, REAL, TEXT = (17, 20, 24), (28, 32, 38), (179, 38, 30), (30, 123, 52), (235, 238, 242)


def visual(text):
    """Logical Hebrew (with embedded Latin or digits) -> the left-to-right glyph order that reads RTL."""
    runs = []
    for word in text.split(' '):
        ltr = any(c.isascii() and c.isalnum() for c in word)
        if ltr and runs and runs[-1][0]:
            runs[-1][1].append(word)
        else:
            runs.append((ltr, [word]))
    mirror = str.maketrans('()[]', ')(][')  # a reversed RTL word shows each bracket facing the other way
    return ' '.join(' '.join(ws) if ltr else ' '.join(w[::-1].translate(mirror) for w in reversed(ws))
                    for ltr, ws in reversed(runs))


def font(size):
    return ImageFont.truetype(FONT, size)


def text_rtl(draw, right, y, text, size, fill=TEXT):
    f = font(size)
    s = visual(text)
    draw.text((right - draw.textlength(s, font=f), y), s, font=f, fill=fill)


def fit(path, w, h):
    im = Image.open(path).convert('RGB')
    im.thumbnail((w, h), Image.LANCZOS)
    box = Image.new('RGB', (w, h), PANEL)
    box.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return box


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--round', type=int, required=True)
    ap.add_argument('--ours', type=Path, required=True)
    ap.add_argument('--note', action='append', default=[])
    ap.add_argument('--out', type=Path)
    ap.add_argument('--test', choices=sorted(TESTS))
    a = ap.parse_args()
    if a.test:
        refs = sorted((SIM / a.test).glob('*.png'))
        main_ref, others = refs[0], refs[1:5]
    else:
        main_ref = MAIN_REF
        others = sorted(p for p in REFS.glob('*.png') if p != MAIN_REF and not p.name.startswith('apple-max'))[:4]

    half, big_h = (W - 3 * PAD) // 2, 490
    thumb_w = (W - (len(others) + 1) * PAD) // max(len(others), 1)
    thumb_h = thumb_w * 9 // 16
    notes_h = 50 + 42 * len(a.note) if a.note else 0
    H = 80 + 44 + big_h + PAD + 40 + thumb_h + PAD + notes_h + PAD
    canvas = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(canvas)
    title = f'Apple MAX מול המשחק האמיתי — סבב {a.round}'
    text_rtl(d, W - PAD, 18, title + (f' — מבחן {TESTS[a.test]}' if a.test else ''), 40)

    y = 80
    for x, label, colour, src in [(W - PAD - half, 'המשחק האמיתי', REAL, main_ref),
                                  (PAD, 'Apple MAX — מה שנבנה בסטודיו', OURS, a.ours)]:
        d.rectangle([x, y, x + half, y + 44], fill=colour)
        text_rtl(d, x + half - 12, y + 6, label, 28)
        canvas.paste(fit(src, half, big_h), (x, y + 44))
    y += 44 + big_h + PAD
    text_rtl(d, W - PAD, y, 'עוד תמונות מהמשחק האמיתי', 26, fill=(160, 200, 170))
    y += 40
    for i, p in enumerate(others):
        canvas.paste(fit(p, thumb_w, thumb_h), (W - PAD - (i + 1) * thumb_w - i * PAD, y))
    y += thumb_h + PAD
    if a.note:
        text_rtl(d, W - PAD, y, 'ההבדלים שאני רואה:', 30, fill=(255, 210, 120))
        for i, n in enumerate(a.note):
            text_rtl(d, W - PAD, y + 50 + 42 * i, f'• {n}', 27)

    out = a.out or HERE / 'rounds' / f'round-{a.round}{"-" + a.test if a.test else ""}-compare.jpg'
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, quality=88)
    print(out)


if __name__ == '__main__':
    main()
