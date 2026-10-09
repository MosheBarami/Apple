import sys, json, numpy as np
from scipy.io import wavfile
from scipy import signal
from PIL import Image, ImageDraw
sr, x = wavfile.read(sys.argv[1]); x = x.astype(float).mean(axis=1) / 32768
cues = json.load(open(sys.argv[2]))
f, t, S = signal.spectrogram(x, sr, nperseg=2048, noverlap=1536)
S = 10 * np.log10(S + 1e-12); S = np.clip((S + 110) / 90, 0, 1)
# log-frequency rows 30Hz..18kHz
rows = 400; fl = np.geomspace(30, 18000, rows); idx = np.searchsorted(f, fl)
img = (S[idx][::-1] * 255).astype(np.uint8)
W = 3000; im = Image.fromarray(img).resize((W, rows)).convert('RGB')
# rms lane
H2 = 160; lane = Image.new('RGB', (W, H2)); d = ImageDraw.Draw(lane)
hop = len(x) / W; rms = [np.sqrt(np.mean(x[int(i*hop):int((i+1)*hop)]**2)) for i in range(W)]
for i, r in enumerate(rms): h = int(min(1, (20*np.log10(r+1e-9)+50)/50) * H2); d.line([(i, H2), (i, H2-h)], fill=(120, 200, 255))
full = Image.new('RGB', (W, rows + H2 + 30)); full.paste(im, (0, 0)); full.paste(lane, (0, rows))
d = ImageDraw.Draw(full)
for s in range(31): X = int(s / 30 * W); d.line([(X, 0), (X, rows + H2)], fill=(80, 80, 80)); d.text((X + 2, rows + H2 + 8), str(s), fill=(255, 255, 255))
for c in cues:
    if c['type'] in ('impact', 'slam', 'stab', 'subdrop'): X = int(c['t'] / 30 * W); d.line([(X, rows), (X, rows + H2)], fill=(255, 80, 80))
full.save(sys.argv[3])
