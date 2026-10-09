// One clock for picture and sound. 120 BPM: a beat is 0.5 s, a bar is 2 s, the piece is 15 bars.
export const FPS = 60;
export const DUR = 30;
export const BEAT = 0.5;

export const SCENES = {
  cold: [0, 2],
  ask: [2, 6],
  pair: [6, 8],
  tunnel: [8, 12],
  build: [12, 18],
  checks: [18, 22],
  logo: [22, 30],
};

export const TYPE_TEXT = 'describe a piece of your game';
export const TYPE_START = 0.32;
export const TYPE_STEP = 0.036;

export const SLOT = [
  { t: 2.5, text: 'a shop screen' },
  { t: 3.5, text: 'a pet system with eggs' },
  { t: 4.5, text: 'a lava zone' },
];

export const CODE = 'K7Q2M9';
export const CODE_LAND = (i) => 6.2 + i * 0.125;

export const CHECK_SLAMS = [18.0, 18.5, 19.0];
export const TAG_WORDS = [
  { t: 20.0, w: 'Only' },
  { t: 20.25, w: 'what' },
  { t: 20.5, w: 'the' },
  { t: 20.75, w: 'checks' },
  { t: 21.0, w: 'prove.' },
];

// Brick landings in the build scene, quantised to 16ths (0.125 s); the page and the mixer both read this.
export const BUILD_LAND_START = 12.25;
export const BUILD_LAND_END = 15.0;
export const LAND_GROUPS = (() => {
  const out = [];
  for (let t = BUILD_LAND_START; t <= BUILD_LAND_END + 1e-6; t += 0.125) out.push(+t.toFixed(3));
  return out;
})();

// Everything the mixer places by hand. Types map to synth voices in audio.py.
export function cues() {
  const c = [];
  const add = (t, type, o = {}) => c.push({ t: +t.toFixed(4), type, ...o });
  // cold open
  add(0.05, 'line');
  for (let i = 0; i < TYPE_TEXT.length; i++) if (TYPE_TEXT[i] !== ' ') add(TYPE_START + i * TYPE_STEP, 'key', { i });
  add(0.9, 'reverse', { len: 1.1 });
  add(2.0, 'impact', { size: 1.0 });
  // ask
  add(2.0, 'glass', { pitch: 1.0 });
  for (const s of SLOT) { add(s.t - 0.12, 'whoosh', { len: 0.3, pan: 0.4 }); add(s.t, 'tick', { pitch: 1.4 }); add(s.t, 'glass', { pitch: 1.5 }); }
  add(5.25, 'tick', { pitch: 0.9 });
  add(5.5, 'click');
  add(5.5, 'shock');
  add(5.5, 'riser', { len: 0.5 });
  add(6.0, 'impact', { size: 0.6 });
  // pair
  for (let i = 0; i < CODE.length; i++) add(CODE_LAND(i), 'flap', { i });
  add(7.0, 'glass', { pitch: 2.0 });
  for (let i = 0; i < 6; i++) add(7.1 + i * 0.083, 'blip', { i });
  add(7.0, 'riser', { len: 1.0, big: 1 });
  add(7.5, 'snareroll', { len: 0.5 });
  add(8.0, 'impact', { size: 1.4 });
  add(8.0, 'subdrop');
  // tunnel
  add(9.0, 'whoosh', { len: 0.5, pan: -0.6 });
  add(10.0, 'whoosh', { len: 0.7, pan: 0.0, big: 1 });
  add(11.0, 'whoosh', { len: 0.5, pan: 0.6 });
  add(11.72, 'whoosh', { len: 0.32, pan: 0.9, big: 1 });
  add(12.0, 'impact', { size: 0.8 });
  // build
  for (const t of LAND_GROUPS) add(t, 'thud', { k: Math.round((t - BUILD_LAND_START) / 0.125) });
  add(14.0, 'glass', { pitch: 1.2 });
  for (let i = 0; i < 3; i++) add(14.25 + i * 0.125, 'tick', { pitch: 1.6 + i * 0.2 });
  add(15.4, 'riser', { len: 1.0 });
  add(16.4, 'crack');
  add(16.4, 'impact', { size: 0.7 });
  add(16.62, 'bloop');
  add(17.55, 'whoosh', { len: 0.45, pan: 0, big: 1 });
  add(18.0, 'impact', { size: 1.1 });
  // checks
  for (const t of CHECK_SLAMS) { add(t, 'slam'); add(t + 0.18, 'chime', { pitch: 1 + CHECK_SLAMS.indexOf(t) * 0.25 }); }
  add(19.4, 'scan', { len: 0.5 });
  for (const w of TAG_WORDS) add(w.t, 'stab', { last: w.w === 'prove.' ? 1 : 0 });
  add(21.4, 'reverse', { len: 0.6, suck: 1 });
  add(22.0, 'impact', { size: 1.5 });
  add(22.0, 'subdrop');
  // logo
  add(22.05, 'shimmer', { len: 3.0 });
  add(23.6, 'whoosh', { len: 0.5, pan: 0 });
  add(25.0, 'glass', { pitch: 1.0 });
  add(26.2, 'tick', { pitch: 1.2 });
  add(26.2, 'glass', { pitch: 1.6 });
  add(27.0, 'shimmer', { len: 1.2 });
  add(28.0, 'impact', { size: 1.0, tail: 1 });
  return c.sort((a, b) => a.t - b.t);
}

// Post effects the frame grader applies over the rendered page (CA, glitch, zoom blur, smear, flash).
export function fx(t) {
  const pulse = (at, len, amp = 1) => (t >= at && t < at + len ? amp * Math.pow(1 - (t - at) / len, 2) : 0);
  const ramp = (a, b, amp = 1) => (t >= a && t < b ? amp * ((t - a) / (b - a)) ** 2 : 0);
  let ca = 0, glitch = 0, zoom = 0, smear = 0, flash = 0, shake = 0;
  for (const [at, s] of [[2, 1], [6, 0.6], [8, 1.4], [12, 0.8], [16.4, 0.7], [18, 1.1], [22, 1.5], [28, 0.8]]) {
    ca += pulse(at, 0.45, 9 * s);
    shake += pulse(at, 0.4, 14 * s);
  }
  for (const w of TAG_WORDS) { ca += pulse(w.t, 0.18, 4); shake += pulse(w.t, 0.15, 5); }
  for (const at of CHECK_SLAMS) { ca += pulse(at, 0.25, 5); shake += pulse(at, 0.25, 8); }
  glitch += pulse(1.86, 0.14, 1) + pulse(8.0, 0.2, 1) + pulse(11.9, 0.1, 0.7) + pulse(21.85, 0.15, 1) + pulse(16.4, 0.12, 0.6);
  zoom += ramp(5.55, 6.0, 0.55) + pulse(6.0, 0.25, 0.4) + ramp(7.55, 8.0, 0.45) + pulse(8.0, 0.4, 0.5) + ramp(17.6, 18.0, 0.5) + pulse(22.0, 0.5, 0.45) + ramp(21.5, 22.0, 0.35);
  smear += ramp(11.7, 12.0, 1) + pulse(12.0, 0.18, 0.8);
  flash += pulse(1.97, 0.3, 1) + pulse(8.0, 0.35, 0.9) + pulse(22.0, 0.45, 1) + pulse(6.0, 0.2, 0.5) + pulse(16.4, 0.25, 0.6) + pulse(18.0, 0.2, 0.35);
  const fade = t > 29.2 ? Math.min(1, (t - 29.2) / 0.8) : t < 0.05 ? 1 - t / 0.05 : 0;
  return { ca, glitch, zoom, smear, flash: Math.min(flash, 1), shake, fade };
}
