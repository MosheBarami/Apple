# StudPilot showreel (30 s)

A 30-second motion piece about StudPilot, rendered frame by frame from code. The picture and the sound
read one clock (`timeline.js`, 120 BPM), so every cut, slam and brick landing falls on a beat.

| File | What |
| --- | --- |
| `timeline.js` | Scene windows, text, cue list for the mixer, and the per-frame post effects |
| `index.html`, `main.js` | The page: three.js scenes (aurora with glass, ops tunnel, brick build and egg hatch, glass logo) under liquid-glass DOM layers |
| `render.mjs` | Serves the page and screenshots each frame at 60 fps through headless Chromium |
| `grade.py` | Post pass per frame: shake, zoom blur, whip smear, chromatic aberration, glitch, flash, grain, vignette |
| `audio.py` | The score and sound design, synthesised in numpy/scipy from the cue list |
| `spec.py` | Spectrogram + loudness lane with impact markers, to check the mix against the picture |

Rebuild (three@0.170.0 in `node_modules` next to these files, scipy for the audio):

```bash
for w in 0 1 2 3; do node render.mjs frames range=$((w*450)):$((w*450+450)) & done; wait
node -e "import('./timeline.js').then(m=>{const a=[];for(let f=0;f<1800;f++)a.push(m.fx(f/60));console.log(JSON.stringify(a))})" > fx.json
node -e "import('./timeline.js').then(m=>console.log(JSON.stringify(m.cues())))" > cues.json
python grade.py fx.json frames graded && python audio.py cues.json score.wav
ffmpeg -framerate 60 -i graded/f%05d.jpg -i score.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 256k studpilot-showreel.mp4
```
