# Score + sound design for the reel, synthesised from scratch. Reads cues.json (exported from timeline.js).
# python audio.py cues.json out.wav
import json, sys
import numpy as np
from scipy import signal

SR = 48000
DUR = 30.0
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(7)

cues = json.load(open(sys.argv[1]))
out_path = sys.argv[2]

def T(sec): return np.arange(int(SR * sec)) / SR
def buf(): return np.zeros((2, N))
def place(dst, x, t, gain=1.0, pan=0.0):
    """add mono or stereo x into dst at time t with equal-power pan"""
    i = int(round(t * SR))
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.vstack([x * l * 1.414, x * r * 1.414])
    if i < 0: x = x[:, -i:]; i = 0
    n = min(x.shape[1], N - i)
    if n > 0: dst[:, i:i + n] += gain * x[:, :n]

def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, min(f, SR / 2.2), 'low', fs=SR, output='sos'), x)
def hp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, min(hi, SR / 2.2)], 'band', fs=SR, output='sos'), x)
def sweep_lp(x, f0, f1, block=256, curve=2.0, q=0.9):
    """time-varying low-pass (block-wise, state carried) from f0 to f1"""
    y = np.zeros_like(x); zi = None; nb = int(np.ceil(len(x) / block))
    for b in range(nb):
        u = (b / max(1, nb - 1)) ** curve
        f = f0 * (f1 / f0) ** u
        sos = signal.butter(2, min(f, SR / 2.3), 'low', fs=SR, output='sos')
        if zi is None: zi = signal.sosfilt_zi(sos) * 0
        seg = x[b * block:(b + 1) * block]
        y[b * block:b * block + len(seg)], zi = signal.sosfilt(sos, seg, zi=zi)
    return y
def env(n, a, d, shape=4.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) * shape / max(d, 1e-4))
    return e
def saw(f, t, ph=0.0): return 2 * ((f * t + ph) % 1) - 1
def supersaw(f, t, voices=7, det=0.18):
    s = np.zeros_like(t)
    for k in range(voices):
        d = (k - (voices - 1) / 2) / ((voices - 1) / 2) * det
        s += saw(f * 2 ** (d / 12), t, rng.random())
    return s / voices
def noise(n): return rng.standard_normal(n)
def midi(m): return 440 * 2 ** ((m - 69) / 12)

# ------------------------------------------------------------------ reverb send
def make_ir(sec=2.4, decay=3.2, bright=6000):
    n = int(SR * sec); t = np.arange(n) / SR
    ir = np.vstack([noise(n), noise(n)]) * np.exp(-t * decay)
    ir = np.vstack([lp(ir[0], bright), lp(ir[1], bright)])
    ir[:, :int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
IR = make_ir()
def reverb(x, ir=IR):
    return np.vstack([signal.fftconvolve(x[0], ir[0])[:N], signal.fftconvolve(x[1], ir[1])[:N]])

# ------------------------------------------------------------------ drum voices
def kick(big=1.0):
    t = T(0.55); f = 45 + 140 * np.exp(-t * 32) + 30 * np.exp(-t * 6)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * (6.5 / big))
    click = hp(noise(len(t)), 2500) * np.exp(-t * 300) * 0.35
    return np.tanh((body + click) * 1.8) * 0.9
def clap():
    t = T(0.4); n = bp(noise(len(t)), 900, 5200)
    e = np.zeros_like(t)
    for k, d in enumerate([0, 0.011, 0.022, 0.031]): e += (t >= d) * np.exp(-np.maximum(0, t - d) * (90 if k < 3 else 16))
    return n * e * 0.55
def hat(open_=False):
    t = T(0.25 if open_ else 0.06); n = hp(noise(len(t)), 7500, 4)
    return n * np.exp(-t * (14 if open_ else 80)) * 0.22
def snare():
    t = T(0.3); tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    n = bp(noise(len(t)), 1500, 9000) * np.exp(-t * 22) * 0.6
    return tone + n

# ------------------------------------------------------------------ sfx voices
def sfx_impact(size=1.0, tail=0):
    sec = 3.5 if tail else 2.4; t = T(sec)
    f = 32 + 90 * np.exp(-t * 9)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (1.6 / size)) * 1.1
    crack = bp(noise(len(t)), 600, 9000) * np.exp(-t * 18) * 0.7
    air = lp(noise(len(t)), 2500) * np.exp(-t * 3.5) * 0.25
    metal = sum(np.sin(2 * np.pi * fr * t + rng.random() * 6) * np.exp(-t * (2.5 + k)) for k, fr in enumerate([220, 331, 497, 742])) * 0.06 * size
    x = np.tanh((boom + crack + air + metal) * 1.4) * size
    return x
def sfx_subdrop():
    t = T(2.0); f = 70 * np.exp(-t * 1.4) + 24
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t * 30) * np.exp(-t * 1.1) * 0.9
def sfx_whoosh(len_=0.4, big=0):
    sec = len_ + 0.5; t = T(sec); n = noise(len(t))
    peak = len_ * 0.75
    e = np.exp(-((t - peak) / (len_ * (0.45 if big else 0.35))) ** 2)
    # bandpass centre sweeps up then down
    y = np.zeros_like(t); blk = 512; zi = None
    for b in range(0, len(t), blk):
        u = b / len(t); fc = 300 + 5200 * np.exp(-((u * sec - peak) / (len_ * 0.5)) ** 2)
        sos = signal.butter(2, [fc * 0.6, min(fc * 1.7, 20000)], 'band', fs=SR, output='sos')
        if zi is None: zi = signal.sosfilt_zi(sos) * 0
        y[b:b + blk], zi = signal.sosfilt(sos, n[b:b + blk], zi=zi)
    return y * e * (1.6 if big else 1.0)
def sfx_riser(len_=1.0, big=0):
    t = T(len_ + 0.05); u = np.minimum(1, t / len_)
    n = noise(len(t))
    y = sweep_lp(n, 300, 12000, curve=1.5) * u ** 2 * 0.5
    f = 200 * 2 ** (u * (4 if big else 3))
    tone = supersaw(1, t) * 0  # placeholder keeps shape
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * u ** 3 * 0.25 + np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR) * u ** 3 * 0.12
    return (y + tone) * (1.2 if big else 0.9)
def sfx_reverse(len_=1.0, suck=0):
    hit = sfx_impact(0.8)[: int(SR * len_)]
    cym = hp(noise(int(SR * len_)), 3000) * np.exp(-np.arange(int(SR * len_)) / SR * 3) * 0.5
    x = (hit * 0.6 + cym)[::-1]
    x *= np.linspace(0, 1, len(x)) ** (2 if suck else 1.2)
    return x * 1.1
def sfx_glass(pitch=1.0):
    t = T(1.6); partials = [1, 2.76, 5.4, 8.93, 13.34]
    x = sum(np.sin(2 * np.pi * 1180 * pitch * p * t + k) * np.exp(-t * (3 + k * 2.5)) / (1 + k * 0.7) for k, p in enumerate(partials))
    x += hp(noise(len(t)), 6000) * np.exp(-t * 120) * 0.3
    return x * 0.22
def sfx_tick(pitch=1.0):
    t = T(0.08); return np.sin(2 * np.pi * 2400 * pitch * t) * np.exp(-t * 90) * 0.35 + hp(noise(len(t)), 5000) * np.exp(-t * 400) * 0.25
def sfx_click():
    t = T(0.12); return np.sin(2 * np.pi * 900 * t * (1 - t * 3)) * np.exp(-t * 60) * 0.6 + hp(noise(len(t)), 3000) * np.exp(-t * 300) * 0.4
def sfx_key(i):
    t = T(0.05); f = 1800 + (i * 37 % 7) * 120
    return (hp(noise(len(t)), 2000) * np.exp(-t * 260) * 0.5 + np.sin(2 * np.pi * f * t) * np.exp(-t * 200) * 0.18) * (0.8 + 0.2 * ((i * 13) % 3))
def sfx_shock():
    t = T(1.2); f = 900 * np.exp(-t * 5) + 60
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4) * 0.4 + lp(noise(len(t)), 1500) * np.exp(-t * 6) * 0.4)
def sfx_flap(i):
    t = T(0.09); x = bp(noise(len(t)), 1200, 6000) * np.exp(-t * 120) * 0.7
    x += np.sin(2 * np.pi * (600 + i * 90) * t) * np.exp(-t * 70) * 0.35
    return x
def sfx_blip(i):
    t = T(0.12); f = midi(84 + [0, 3, 7, 10, 12, 15][i % 6])
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 35) * 0.25
def sfx_snareroll(len_=0.5):
    out = np.zeros(int(SR * (len_ + 0.3)))
    n = 16
    for k in range(n):
        s = snare() * (0.25 + 0.75 * k / n)
        i = int(k / n * len_ * SR); out[i:i + len(s)] += s[: len(out) - i]
    return out * 0.6
def sfx_thud(k):
    t = T(0.35); f = 80 + (k % 5) * 14 + 60 * np.exp(-t * 40)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    knock = bp(noise(len(t)), 300, 2400) * np.exp(-t * 45) * 0.5
    clack = np.sin(2 * np.pi * (1300 + (k % 4) * 170) * t) * np.exp(-t * 90) * 0.18  # plastic brick click
    return (body + knock + clack) * 0.55
def sfx_crack():
    t = T(0.6); x = np.zeros_like(t)
    for k in range(9):
        d = k * 0.018 + rng.random() * 0.01; x += (t >= d) * hp(noise(len(t)), 1800) * np.exp(-np.maximum(0, t - d) * 140) * (1 - k / 12)
    return x * 0.6
def sfx_bloop():
    t = T(0.35); f = 300 + 900 * (1 - np.exp(-t * 18))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 0.45
def sfx_slam():
    t = T(0.9); f = 50 + 120 * np.exp(-t * 25)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
    return np.tanh((body + bp(noise(len(t)), 400, 7000) * np.exp(-t * 25) * 0.8) * 1.6) * 0.75
def sfx_chime(pitch=1.0):
    t = T(1.2); f = midi(81) * pitch
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 3)) * np.exp(-t * 3.5) * 0.18
def sfx_scan(len_=0.5):
    t = T(len_ + 0.2); u = np.minimum(1, t / len_)
    f = 400 * 2 ** (u * 3)
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.12 + np.sin(2 * np.pi * np.cumsum(f * 2) / SR) * 0.1
    return lp(x, 6000) * np.sin(np.pi * np.minimum(1, t / (len_ + 0.2))) * 0.8
def sfx_stab(last=0):
    t = T(0.9 if last else 0.45); chord = [57, 60, 64, 69] if not last else [57, 64, 69, 72, 76]
    x = sum(supersaw(midi(m), t, 5, 0.12) for m in chord) / len(chord)
    x = lp(x, 5200) * np.exp(-t * (3 if last else 8))
    k = kick(1.2)[: len(t)]; x[: len(k)] += k * 0.8
    return x * 0.9
def sfx_shimmer(len_=2.0):
    t = T(len_ + 1.0); x = np.zeros_like(t)
    notes = [81, 84, 88, 93, 96, 100]
    for k in range(int(len_ / 0.0625)):
        st = k * 0.0625; i = int(st * SR); m = notes[(k * 5) % len(notes)]
        tt = t[: len(t) - i]
        x[i:] += np.sin(2 * np.pi * midi(m) * tt) * np.exp(-tt * 9) * 0.06 * (1 - st / (len_ + 0.5))
    return x
def sfx_line():
    t = T(0.9); f = 300 * 2 ** (t * 4)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.9) * 0.12

# ------------------------------------------------------------------ score
mus = buf(); drums = buf(); bassb = buf(); padb = buf()
PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]  # Am F C G
ROOT = [45, 41, 36, 43]
def bar_of(t): return int(t // 2) % 4

# sections: intensity per time
def section(t):
    if t < 2: return 'intro'
    if t < 6: return 'ask'
    if t < 7.92: return 'pair'
    if t < 8: return 'gap'
    if t < 12: return 'drop'
    if t < 18: return 'build'
    if t < 21.45: return 'checks'
    if t < 22: return 'gap'
    if t < 28: return 'logo'
    return 'end'

# drums on a 16th grid
kick_times = []
for s16 in range(int(DUR / 0.125)):
    t = s16 * 0.125; sec = section(t); pos = s16 % 16  # 16 per bar
    on_beat = pos % 4 == 0
    if sec in ('ask', 'drop', 'build') and on_beat: place(drums, kick(1.0), t, 0.9); kick_times.append(t)
    if sec == 'pair' and on_beat and t < 7.5: place(drums, kick(0.8), t, 0.6); kick_times.append(t)
    if sec == 'logo' and on_beat and t < 26: place(drums, kick(1.1), t, 0.75 * (1 - (t - 22) / 5)); kick_times.append(t)
    if sec == 'checks' and pos in (0, 6, 10) and t < 20: place(drums, kick(1.3), t, 0.95); kick_times.append(t)
    if sec in ('drop', 'build') and pos in (4, 12): place(drums, clap(), t, 0.7, 0.05)
    if sec == 'ask' and pos in (4, 12) and t > 3.9: place(drums, clap(), t, 0.45)
    if sec in ('ask', 'build', 'pair') and pos % 4 == 2: place(drums, hat(True), t, 0.5, 0.3)
    if sec == 'drop': place(drums, hat(pos % 2 == 1 and pos % 4 == 2), t, 0.55 if pos % 2 == 0 else 0.35, -0.3 if pos % 2 else 0.3)
    if sec == 'build' and pos % 2 == 1: place(drums, hat(), t, 0.25, -0.35)
    if sec == 'checks' and t >= 20 and t < 21.4 and pos % 2 == 0: place(drums, hat(), t, 0.4)

# sidechain envelope from kicks
duck = np.ones(N)
for kt in kick_times:
    i = int(kt * SR); n = int(0.32 * SR); e = 1 - 0.75 * (1 - np.linspace(0, 1, n)) ** 2
    duck[i:i + n] = np.minimum(duck[i:i + n], e[: max(0, min(n, N - i))])

# pads: a supersaw chord per bar, filter opening with the arc of the piece
tt = np.arange(N) / SR
pad = np.zeros(N)
for b in range(15):
    t0 = b * 2.0; sec = section(t0 + 0.01)
    if sec == 'end': continue
    t = T(2.3); chord = PROG[b % 4] + [PROG[b % 4][0] + 12]
    x = sum(supersaw(midi(m), t, 7, 0.22) for m in chord) / len(chord)
    x *= np.minimum(1, t / 0.06) * np.minimum(1, (2.3 - t) / 0.3)
    place(padb, x, t0, 1.0 if sec != 'intro' else 0.0)
# final held chord into the ring-out
t = T(2.2); x = sum(supersaw(midi(m), t, 7, 0.22) for m in [45, 57, 64, 69, 72, 76]) / 6; x *= np.exp(-t * 1.4)
place(padb, x, 28.0, 1.0)
# intro drone
t = T(2.1); drone = (supersaw(midi(33), t, 5, 0.1) + 0.6 * np.sin(2 * np.pi * midi(45) * t)) * np.minimum(1, t / 0.8)
place(padb, drone * 0.8, 0.0, 1.0)
cut = np.interp(tt, [0, 2, 5.5, 6, 7.9, 8, 11.5, 12, 15.4, 16.4, 18, 21.4, 22, 26, 28, 30],
                    [500, 900, 3000, 1800, 6000, 2500, 5000, 2200, 1500, 9000, 3000, 6000, 1200, 7000, 4000, 2000])
padf = np.zeros_like(padb)
blk = 256; zl = None
for b0 in range(0, N, blk):
    sos = signal.butter(2, cut[b0], 'low', fs=SR, output='sos')
    if zl is None: zl = [signal.sosfilt_zi(sos) * 0, signal.sosfilt_zi(sos) * 0]
    for c in range(2): padf[c, b0:b0 + blk], zl[c] = signal.sosfilt(sos, padb[c, b0:b0 + blk], zi=zl[c])
padf *= duck
# widen pads: Haas on right
padf[1] = np.roll(padf[1], int(0.011 * SR))

# bass: 8th-note pulses (reese in the drop)
for e8 in range(int(DUR / 0.25)):
    t0 = e8 * 0.25; sec = section(t0)
    if sec not in ('ask', 'drop', 'build', 'logo', 'checks'): continue
    if sec == 'logo' and t0 > 27.5: continue
    if sec == 'checks' and t0 >= 21.4: continue
    r = ROOT[bar_of(t0)] - 12 + (12 if e8 % 2 and sec in ('drop', 'build') else 0)
    t = T(0.26)
    if sec == 'drop' or sec == 'checks':
        x = (supersaw(midi(r), t, 3, 0.25) * 0.7 + np.sin(2 * np.pi * midi(r) * t) * 0.6)
        x = lp(x, 900 + 500 * np.sin(e8 * 0.9) ** 2)
    else:
        x = np.sin(2 * np.pi * midi(r) * t) * 0.8 + saw(midi(r), t) * 0.15
        x = lp(x, 600)
    x *= np.minimum(1, t / 0.005) * np.exp(-t * 5)
    place(bassb, x, t0, 0.55)
bassb *= duck

# arps: 16th plucks in pair / build / logo
arp = buf()
for s16 in range(int(DUR / 0.125)):
    t0 = s16 * 0.125; sec = section(t0)
    if sec not in ('pair', 'drop', 'build', 'logo'): continue
    if sec == 'logo' and t0 > 27.9: continue
    ch = PROG[bar_of(t0)]; pat = [0, 1, 2, 3, 2, 1, 0, 2]
    k = pat[s16 % 8]; m = (ch + [ch[0] + 12])[k] + 12 + (12 if sec == 'drop' and s16 % 16 >= 8 else 0)
    t = T(0.2); x = (saw(midi(m), t) * 0.5 + np.sin(2 * np.pi * midi(m) * t)) * np.exp(-t * 22)
    x = lp(x, 4500)
    place(arp, x, t0, 0.13 if sec != 'logo' else 0.1, 0.45 if s16 % 2 else -0.45)

mus = drums * 1.0 + bassb * 1.0 + padf * 0.32 + arp * 1.0
# gaps: the music drops out right before each drop
gate = np.ones(N)
for a, b in [(7.92, 8.0), (21.45, 22.0)]:
    i, j = int(a * SR), int(b * SR); f = int(0.012 * SR)
    gate[i:j] = 0; gate[i - f:i] = np.linspace(1, 0, f)
mus = mus * gate
padf = padf * gate; arp = arp * gate; drums = drums * gate

# ------------------------------------------------------------------ sfx
sfx = buf()
V = {
    'line': lambda c: (sfx_line(), 1.0),
    'key': lambda c: (sfx_key(c['i']), 0.55),
    'reverse': lambda c: (sfx_reverse(c['len'], c.get('suck', 0)), 0.9),
    'impact': lambda c: (sfx_impact(c['size'], c.get('tail', 0)), 0.95),
    'glass': lambda c: (sfx_glass(c['pitch']), 0.9),
    'whoosh': lambda c: (sfx_whoosh(c['len'], c.get('big', 0)), 0.75),
    'tick': lambda c: (sfx_tick(c['pitch']), 0.8),
    'click': lambda c: (sfx_click(), 0.9),
    'shock': lambda c: (sfx_shock(), 0.9),
    'riser': lambda c: (sfx_riser(c['len'], c.get('big', 0)), 0.7),
    'flap': lambda c: (sfx_flap(c['i']), 0.9),
    'blip': lambda c: (sfx_blip(c['i']), 0.9),
    'snareroll': lambda c: (sfx_snareroll(c['len']), 0.8),
    'subdrop': lambda c: (sfx_subdrop(), 0.9),
    'thud': lambda c: (sfx_thud(c['k']), 0.75),
    'crack': lambda c: (sfx_crack(), 0.9),
    'bloop': lambda c: (sfx_bloop(), 0.8),
    'slam': lambda c: (sfx_slam(), 1.0),
    'chime': lambda c: (sfx_chime(c['pitch']), 0.9),
    'scan': lambda c: (sfx_scan(c['len']), 0.7),
    'stab': lambda c: (sfx_stab(c.get('last', 0)), 0.85),
    'shimmer': lambda c: (sfx_shimmer(c['len']), 0.9),
}
# whooshes that move: pan from -pan to +pan
for c in cues:
    x, g = V[c['type']](c)
    # whooshes and riser lead into their cue time; everything else starts on it
    start = c['t']
    if c['type'] == 'whoosh': start = c['t']
    if c['type'] == 'reverse': start = c['t']
    pan = c.get('pan', 0.0)
    if c['type'] == 'whoosh' and pan:
        n = len(x); p = np.linspace(-pan, pan, n)
        st = np.vstack([x * np.cos((p + 1) * np.pi / 4), x * np.sin((p + 1) * np.pi / 4)]) * 1.414
        place(sfx, st, start, g)
    elif c['type'] in ('key', 'flap', 'blip', 'thud'):
        place(sfx, x, start, g, ((c.get('i', c.get('k', 0)) % 5) - 2) * 0.18)
    else:
        place(sfx, x, start, g, pan)

# ------------------------------------------------------------------ mix
wet = reverb(sfx * 0.35 + padf * 0.12 + arp * 0.5 + drums * 0.06)
auto = np.interp(tt, [0, 1.9, 2.0, 5.4, 6.0, 7.9, 8.0, 11.9, 12.0, 17.9, 18.0, 21.4, 22.0, 27.9, 28.0, 30],
                     [0.35, 0.45, 0.5, 0.62, 0.55, 0.7, 1.0, 1.0, 0.8, 0.85, 0.95, 0.95, 0.85, 0.7, 0.8, 0.8])
mus = mus * auto
mus[0] = hp(mus[0], 32); mus[1] = hp(mus[1], 32)
mix = mus * 0.85 + sfx * 1.15 + wet * 0.5
mix = hp(mix, 25)
# master: glue + soft clip + normalise to -1 dBFS
mix = mix / np.percentile(np.abs(mix), 99.95) * 0.9
mix = np.tanh(mix * 1.05) / np.tanh(1.05)
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))
fo = int(0.8 * SR); mix[:, -fo:] *= np.linspace(1, 0, fo) ** 2
from scipy.io import wavfile
wavfile.write(out_path, SR, (mix.T * 32767).astype(np.int16))
print('wrote', out_path, 'peak', np.max(np.abs(mix)), 'rms dB', 20 * np.log10(np.sqrt(np.mean(mix ** 2))))
