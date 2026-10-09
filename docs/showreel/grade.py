# Per-frame post: shake, zoom blur, whip smear, chromatic aberration, glitch slices, flash, grain, vignette, fade.
# python grade.py fx.json in_dir out_dir [workers]
import json, os, sys
import numpy as np
from PIL import Image
from multiprocessing import Pool

FX = json.load(open(sys.argv[1]))
SRC, DST = sys.argv[2], sys.argv[3]
os.makedirs(DST, exist_ok=True)
W, H = 1920, 1080
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
VIG = (1 - 0.38 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) ** 1.3).clip(0.45, 1)[..., None]

def scale_about(img, s, cx=W / 2, cy=H / 2):
    if abs(s - 1) < 1e-4: return img
    a = 1 / s
    return img.transform((W, H), Image.AFFINE, (a, 0, cx - a * cx, 0, a, cy - a * cy), resample=Image.BILINEAR)

def work(name):
    f = int(name[1:6]); fx = FX[f]
    im = Image.open(os.path.join(SRC, name)).convert('RGB')
    rnd = np.random.default_rng(f * 7919)
    # zoom blur: average of copies scaled about the centre
    if fx['zoom'] > 0.01:
        n = 10; acc = np.zeros((H, W, 3), np.float32)
        for k in range(n): acc += np.asarray(scale_about(im, 1 + fx['zoom'] * 0.22 * k / (n - 1)), np.float32)
        a = acc / n
    else:
        a = np.asarray(im, np.float32)
    # horizontal whip smear (box blur along x via cumulative sum)
    if fx['smear'] > 0.01:
        r = int(fx['smear'] * 260) | 1
        c = np.cumsum(np.pad(a, ((0, 0), (r, r), (0, 0)), mode='edge'), axis=1)
        a = (c[:, 2 * r:2 * r + W] - c[:, 0:W]) / (2 * r)
    # chromatic aberration: R scaled out, B scaled in
    if fx['ca'] > 0.2:
        k = fx['ca'] / 900
        img = Image.fromarray(a.clip(0, 255).astype(np.uint8))
        r_, g_, b_ = img.split()
        a = np.dstack([np.asarray(scale_about(r_, 1 + k), np.float32), np.asarray(g_, np.float32), np.asarray(scale_about(b_, 1 - k), np.float32)])
    # glitch: displaced horizontal slices with channel split
    if fx['glitch'] > 0.05:
        for _ in range(int(4 + fx['glitch'] * 14)):
            y0 = int(rnd.integers(0, H - 10)); h = int(rnd.integers(4, 60)); dx = int(rnd.normal(0, 90 * fx['glitch']))
            a[y0:y0 + h] = np.roll(a[y0:y0 + h], dx, axis=1)
            a[y0:y0 + h, :, 0] = np.roll(a[y0:y0 + h, :, 0], int(dx * 0.4), axis=1)
    # shake (edge clamp)
    if fx['shake'] > 0.5:
        sx = int(round(np.sin(f * 1.7) * fx['shake'])); sy = int(round(np.cos(f * 2.3) * fx['shake'] * 0.7))
        p = abs(sx) + abs(sy) + 1
        a = np.pad(a, ((p, p), (p, p), (0, 0)), mode='edge')[p - sy:p - sy + H, p - sx:p - sx + W]
    # flash toward a violet-white
    if fx['flash'] > 0.01:
        a = a + (np.array([245, 238, 255], np.float32) - a) * fx['flash']
    a = a * VIG
    a += rnd.normal(0, 3.2, (H, W, 1)).astype(np.float32)
    if fx['fade'] > 0: a *= 1 - fx['fade']
    Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(os.path.join(DST, name.replace('.png', '.jpg')), quality=95)
    return name

if __name__ == '__main__':
    names = sorted(n for n in os.listdir(SRC) if n.startswith('f') and n.endswith('.png'))
    done = set(os.listdir(DST))
    names = [n for n in names if n.replace('.png', '.jpg') not in done]
    with Pool(int(sys.argv[4]) if len(sys.argv) > 4 else 4) as p:
        for i, _ in enumerate(p.imap_unordered(work, names, chunksize=4)):
            if i % 200 == 0: print(i, len(names), flush=True)
