/**
 * THE INTERFACE MAKES A SOUND, AND ONLY WHEN IT WAS ASKED TO.
 *
 * WHAT WAS HERE BEFORE. Base.astro carried a synthesised `tick()` that fired on ONE element — the
 * sound toggle itself — and on nothing else in the entire product. Sound could be switched on and
 * then every button in the interface was silent. Landing.astro had no sound system and no toggle at
 * all, so the front page could not make the noise the owner singled out even in principle. Both
 * readings of "we have interface sound" were true about the source and false about the experience.
 *
 * SO THIS FILE DOES NOT READ THE SOURCE FOR REASSURING WORDS. It extracts the shipped script and
 * RUNS it — in a vm, against a recording AudioContext and a small DOM — and counts what comes out
 * the other end. `apps/site/tests/flow-field-runs.test.mjs` exists because a hero effect passed
 * every source-shaped check while drawing nothing; a sound system is even easier to ship dead,
 * because silence looks exactly like "sound is off".
 *
 * THE FIVE PROPERTIES IT IS HERE TO PIN, each falsified by an aimed mutation before it was trusted:
 *   1. silent before the toggle is pressed
 *   2. audible after it
 *   3. a press on an ORDINARY button makes the sound, and only while armed
 *   4. no audio asset is fetched anywhere in apps/site — the click is synthesised, as the measured
 *      reference's is (packages/corpus/data/ui-references/web-landing.json, claim 16)
 *   5. the AudioContext is not constructed at load, in any state, including a restored "on"
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_FILE = join(SITE, 'src', 'sound', 'interface-sound.js');
const SCRIPT = readFileSync(SCRIPT_FILE, 'utf8');
const SNIPPET = readFileSync(join(SITE, 'src', 'layouts', 'InterfaceSound.astro'), 'utf8');
const DOCK = readFileSync(join(SITE, 'src', 'layouts', 'SoundDock.astro'), 'utf8');
const BASE = readFileSync(join(SITE, 'src', 'layouts', 'Base.astro'), 'utf8');
const LANDING = readFileSync(join(SITE, 'src', 'layouts', 'Landing.astro'), 'utf8');

/* Comments come off before any source is scanned for a forbidden spelling. This file's own
   subjects — `document.currentScript`, an audio extension — are named in the prose of the code it
   guards, and a scanner that reads prose reports the account of a defect as the defect. Four
   scanners in this repository have now needed this line. */
const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ============================================================================================
 * A BROWSER, IN THE WAYS THIS SCRIPT USES ONE.
 * ========================================================================================== */

/** A selector matcher small enough to read and real enough to be worth trusting. */
function matchesSelector(el, selector) {
  return String(selector).split(',').some((part) => {
    const one = part.trim();
    if (!one) return false;
    const parsed = /^([a-zA-Z]+)?((?:\.[-\w]+)*)((?:\[[^\]]+\])*)$/.exec(one);
    if (!parsed) return false;
    const [, tag, classPart, attrPart] = parsed;
    if (tag && tag.toUpperCase() !== el.tagName) return false;
    const classes = classPart ? classPart.slice(1).split('.') : [];
    if (!classes.every((c) => el._classes.has(c))) return false;
    const attrs = attrPart ? attrPart.match(/\[[^\]]+\]/g) ?? [] : [];
    return attrs.every((raw) => {
      const body = raw.slice(1, -1);
      const eq = body.indexOf('=');
      if (eq === -1) return body in el._attrs;
      const name = body.slice(0, eq);
      const want = body.slice(eq + 1).replace(/^["']|["']$/g, '');
      return String(el._attrs[name]) === want;
    });
  });
}

function element({ tag = 'button', className = '', attrs = {}, canvas = null, rect = null } = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    className,
    _attrs: { ...attrs },
    _classes: new Set(className.split(/\s+/).filter(Boolean)),
    parentNode: null,
    offsetWidth: 1,
    getAttribute: (k) => (k in el._attrs ? el._attrs[k] : null),
    setAttribute: (k, v) => { el._attrs[k] = v; },
    removeAttribute: (k) => { delete el._attrs[k]; },
    hasAttribute: (k) => k in el._attrs,
    matches: (sel) => matchesSelector(el, sel),
    closest: (sel) => {
      let node = el;
      while (node) {
        if (matchesSelector(node, sel)) return node;
        node = node.parentNode;
      }
      return null;
    },
    classList: {
      add: (c) => { el._classes.add(c); },
      remove: (c) => { el._classes.delete(c); },
      contains: (c) => el._classes.has(c),
    },
  };
  if (className) el._classes = new Set(className.split(/\s+/).filter(Boolean));
  if (canvas) Object.assign(el, canvas);
  if (rect) {
    el.getBoundingClientRect = () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
    });
  }
  return el;
}

/**
 * The recording AudioContext. It counts constructions, every node made, every gain target and
 * every start/stop, which is everything needed to answer "did a sound happen, what shape was it,
 * and how long did it last".
 */
function recorder() {
  const log = { contexts: 0, resumes: 0, sources: [], gains: [] };

  function param(owner, name) {
    const values = [];
    return {
      get value() { return values.length ? values[values.length - 1].value : 0; },
      set value(v) { values.push({ value: v, at: 0, how: 'value' }); },
      values,
      setValueAtTime(value, at) { values.push({ value, at, how: 'set' }); return this; },
      exponentialRampToValueAtTime(value, at) { values.push({ value, at, how: 'ramp' }); return this; },
      linearRampToValueAtTime(value, at) { values.push({ value, at, how: 'ramp' }); return this; },
      _owner: owner,
      _name: name,
    };
  }

  function node(kind) {
    const n = { kind, out: null, connect(dest) { n.out = dest; return dest; } };
    return n;
  }

  class FakeContext {
    constructor() {
      log.contexts += 1;
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.state = 'running';
      this.destination = { kind: 'destination', connect() { return this; } };
    }

    resume() { log.resumes += 1; this.state = 'running'; }

    createBuffer(channels, length, rate) {
      return { length, sampleRate: rate, getChannelData: () => new Float32Array(length) };
    }

    createBufferSource() {
      const n = node('bufferSource');
      n.buffer = null;
      n.start = (at) => { n.startedAt = at; log.sources.push(n); };
      n.stop = (at) => { n.stoppedAt = at; };
      return n;
    }

    createOscillator() {
      const n = node('oscillator');
      n.type = '';
      n.frequency = param(n, 'frequency');
      n.detune = param(n, 'detune');
      n.start = (at) => { n.startedAt = at; log.sources.push(n); };
      n.stop = (at) => { n.stoppedAt = at; };
      return n;
    }

    createBiquadFilter() {
      const n = node('filter');
      n.type = '';
      n.frequency = param(n, 'frequency');
      n.Q = param(n, 'Q');
      return n;
    }

    createGain() {
      const n = node('gain');
      n.gain = param(n, 'gain');
      log.gains.push(n);
      return n;
    }
  }

  return { log, FakeContext };
}

/** Load the shipped script into a sandbox and hand back the handles a test needs. */
function boot({
  stored = null, reducedMotion = false, hidden = false, withScope = true,
  dockRect = null, controlRect = null,
} = {}) {
  const { log, FakeContext } = recorder();

  const nodes = [];
  const add = (spec) => { const el = element(spec); nodes.push(el); return el; };

  const dockBox = add({ tag: 'div', className: 'sound-dock', attrs: { 'data-sound-dock': '' }, rect: dockRect });
  const dock = add({ tag: 'button', className: 'sound-dock__btn', attrs: { 'data-sound-toggle': '', 'aria-pressed': 'false' } });
  dock.parentNode = dockBox;
  const primary = add({ tag: 'a', className: 'pill', attrs: { href: '/app' }, rect: controlRect });
  const secondary = add({ tag: 'button', className: 'iconbtn', attrs: {} });
  const themeToggle = add({ tag: 'button', className: 'iconbtn', attrs: { 'data-theme-toggle': '', 'aria-pressed': 'true' } });
  const prose = add({ tag: 'a', className: '', attrs: { href: '/docs' } });
  const silenced = add({ tag: 'button', className: 'pill', attrs: { 'data-sound': 'none' } });

  const drawn = [];
  const scope = withScope
    ? add({
      tag: 'canvas',
      className: 'sound-dock__scope',
      attrs: { 'data-sound-scope': '' },
      canvas: {
        width: 64,
        height: 20,
        getContext: () => ({
          clearRect: () => drawn.push('clear'),
          beginPath: () => drawn.push('begin'),
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => drawn.push('stroke'),
          strokeStyle: '',
          lineWidth: 0,
        }),
      },
    })
    : null;
  if (scope) scope.parentNode = dock;

  const store = new Map();
  if (stored !== null) store.set('apple-sound', stored);

  const clickListeners = [];
  const otherListeners = new Map();
  const windowListeners = new Map();
  const frames = [];
  let nextFrame = 1;

  const root = element({ tag: 'html' });

  const documentStub = {
    hidden,
    documentElement: root,
    querySelectorAll: (sel) => nodes.filter((n) => n.matches(sel)),
    querySelector: (sel) => nodes.find((n) => n.matches(sel)) ?? null,
    addEventListener: (type, fn) => {
      if (type === 'click') clickListeners.push(fn);
      else {
        if (!otherListeners.has(type)) otherListeners.set(type, []);
        otherListeners.get(type).push(fn);
      }
    },
    /* Present and null, exactly as a module script sees it. If the script ever reaches for it, the
       feature is dead in production and green here — which is the defect this repository already
       shipped once today. */
    currentScript: null,
  };

  const sandbox = {
    console,
    Math,
    Float32Array,
    String,
    document: documentStub,
    AudioContext: FakeContext,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
    matchMedia: (query) => ({
      matches: /prefers-reduced-motion/i.test(String(query)) ? reducedMotion : false,
      addEventListener: () => {},
      addListener: () => {},
    }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (fn) => { const id = nextFrame++; frames.push({ id, fn }); return id; },
    cancelAnimationFrame: (id) => { const at = frames.findIndex((f) => f.id === id); if (at > -1) frames.splice(at, 1); },
    addEventListener: (type, fn) => {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(SCRIPT, sandbox, { timeout: 5000, filename: 'interface-sound.js' });

  let clicks = 0;
  const click = (el) => {
    clicks += 1;
    /* Time moves between presses, the way it does in a browser. Everything recorded is therefore
       attributable to one press rather than smeared across all of them. */
    if (log.contexts) sandbox.__ctxTime = null;
    for (const fn of clickListeners) fn({ target: el, type: 'click' });
  };

  const since = (mark) => ({
    sources: log.sources.slice(mark.sources),
    gains: log.gains.slice(mark.gains),
    contexts: log.contexts - mark.contexts,
  });
  const mark = () => ({ sources: log.sources.length, gains: log.gains.length, contexts: log.contexts });

  return {
    log, store, dock, dockBox, primary, secondary, themeToggle, prose, silenced, scope, drawn, root,
    click, mark, since, frames, documentStub,
    clickListeners,
    listenerTypes: () => [...otherListeners.keys()],
    windowListenerTypes: () => [...windowListeners.keys()],
    runFrames: (count = 1) => {
      for (let i = 0; i < count; i++) {
        const next = frames.shift();
        if (!next) break;
        next.fn(i * 16);
      }
    },
    fire: (type) => { for (const fn of otherListeners.get(type) ?? []) fn({ type }); },
    peak: (gains) => gains.reduce(
      (top, g) => Math.max(top, ...g.gain.values.map((v) => v.value)), 0,
    ),
    span: (sources) => {
      if (!sources.length) return 0;
      const starts = sources.map((s) => s.startedAt ?? 0);
      const stops = sources.map((s) => s.stoppedAt ?? 0);
      return (Math.max(...stops) - Math.min(...starts)) * 1000;
    },
  };
}

/** Everything one press produced. */
function press(app, el) {
  const before = app.mark();
  app.click(el);
  const after = app.since(before);
  return {
    ...after,
    audible: after.sources.length > 0 && app.peak(after.gains) > 0.001,
    peak: app.peak(after.gains),
    spanMs: app.span(after.sources),
  };
}

/* ============================================================================================
 * THE FIVE PROPERTIES.
 * ========================================================================================== */

test('1 — SILENT BEFORE THE TOGGLE: a fresh visitor presses buttons and hears nothing', () => {
  const app = boot();
  assert.equal(app.log.contexts, 0, 'an AudioContext existed before anything was pressed');

  for (const el of [app.primary, app.secondary, app.themeToggle]) {
    const out = press(app, el);
    assert.equal(out.sources.length, 0,
      'a control made a sound on a page where sound was never switched on');
  }
  assert.equal(app.log.contexts, 0,
    'pressing ordinary controls constructed an AudioContext while sound was off');
});

test('2 — AUDIBLE AFTER IT: the toggle arms the sound and confirms itself with one press', () => {
  const app = boot();
  const out = press(app, app.dock);

  assert.equal(app.log.contexts, 1, 'the toggle did not construct exactly one AudioContext');
  assert.ok(out.sources.length > 0, 'arming the sound produced no sound at all');
  assert.ok(out.peak > 0.001, `the confirming press peaked at ${out.peak} — inaudible`);
  assert.ok(out.peak < 0.2, `the confirming press peaked at ${out.peak} — far too loud for a UI tick`);
  assert.equal(app.dock.getAttribute('aria-pressed'), 'true', 'the toggle does not state that it is on');
  assert.match(app.dock.getAttribute('aria-label'), /off/i,
    'the armed toggle does not offer to turn sound off');
});

test('3 — AN ORDINARY BUTTON MAKES THE SOUND, and only while armed', () => {
  const app = boot();

  assert.equal(press(app, app.primary).sources.length, 0, 'sound before it was asked for');

  app.click(app.dock);
  const primary = press(app, app.primary);
  assert.ok(primary.audible,
    'with sound ON, pressing the primary control was silent — this is exactly the defect: a sound '
    + 'system wired to its own toggle and to nothing else in the product');

  const secondary = press(app, app.secondary);
  assert.ok(secondary.audible, 'a secondary control is silent while sound is on');

  const theme = press(app, app.themeToggle);
  assert.ok(theme.audible, 'the theme toggle — a button like any other — is silent while sound is on');

  // ...and switching it off silences the same button again.
  app.click(app.dock);
  assert.equal(app.dock.getAttribute('aria-pressed'), 'false', 'the toggle will not switch off');
  assert.equal(press(app, app.primary).sources.length, 0,
    'a control still made a sound after sound was switched off');
});

test('4 — NO AUDIO ASSET IS FETCHED ANYWHERE IN apps/site', () => {
  /*
   * The measured reference fetches no mp3, wav, ogg, m4a or webm anywhere on its page while
   * AudioContext is available, which is how its keypress sound is known to be synthesised. Ours is
   * synthesised for the same reasons: a click costs no bytes, has no load state, and cannot be the
   * reason a button feels late. A sample checked in later would be a silent regression of a
   * measured decision, so it is caught here as a file AND as a reference.
   */
  const AUDIO = /\.(?:mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)\b/i;
  const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.astro') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else out.push(full);
    }
    return out;
  };

  const files = [...walk(join(SITE, 'src')), ...walk(join(SITE, 'public'))];
  assert.ok(files.length > 20, 'the walk found almost nothing — this check would be vacuous');

  const assets = files.filter((f) => AUDIO.test(f));
  assert.deepEqual(assets.map((f) => f.slice(SITE.length)), [],
    'an audio file is checked into apps/site. The click is synthesised; a sample is bytes, a load '
    + 'state and a failure mode we measured our way out of.');

  const offenders = [];
  for (const file of files) {
    if (!/\.(?:astro|css|ts|tsx|js|mjs|json|html)$/.test(file)) continue;
    const body = decomment(readFileSync(file, 'utf8'));
    if (AUDIO.test(body)) offenders.push(`${file.slice(SITE.length)}  (audio file reference)`);
    if (/<audio\b/i.test(body)) offenders.push(`${file.slice(SITE.length)}  (<audio> element)`);
    if (/new\s+Audio\s*\(/.test(body)) offenders.push(`${file.slice(SITE.length)}  (new Audio())`);
    if (/decodeAudioData\s*\(/.test(body)) offenders.push(`${file.slice(SITE.length)}  (decodeAudioData)`);
  }
  assert.deepEqual(offenders, [],
    `the site references audio it would have to download:\n  ${offenders.join('\n  ')}`);
});

test('5 — THE AUDIOCONTEXT IS NOT CONSTRUCTED AT LOAD, in any state', () => {
  // A context built at load is a permission prompt, a suspended context and, on some browsers, a
  // console warning — for a page that may never make a sound at all.
  assert.equal(boot().log.contexts, 0, 'loading the page constructed an AudioContext');
  assert.equal(boot({ stored: 'on' }).log.contexts, 0,
    'a page loaded with sound already chosen constructed an AudioContext before any gesture');
  assert.equal(boot({ stored: 'off' }).log.contexts, 0, 'a stored "off" still constructed a context');

  // And the construction, when it comes, is a press.
  const app = boot();
  app.click(app.dock);
  assert.equal(app.log.contexts, 1, 'the visitor\'s own press did not construct the context');
});

/* ============================================================================================
 * THE SHAPE OF THE SOUND — a keyswitch, not a beep.
 * ========================================================================================== */

test('a press is TWO layered events: a noise transient and a low body, under 60ms', () => {
  const app = boot();
  app.click(app.dock);
  const out = press(app, app.primary);

  const transient = out.sources.filter((s) => s.kind === 'bufferSource');
  const body = out.sources.filter((s) => s.kind === 'oscillator');
  assert.equal(transient.length, 1,
    'no noise transient — a single oscillator is a chisel tick, not the click of a keyswitch stem');
  assert.equal(body.length, 1, 'no low body — nothing bottoms out, so the press has no weight');

  const transientMs = (transient[0].stoppedAt - transient[0].startedAt) * 1000;
  const bodyMs = (body[0].stoppedAt - body[0].startedAt) * 1000;
  assert.ok(transientMs < bodyMs,
    `the transient (${transientMs}ms) is not shorter than the body (${bodyMs}ms)`);
  assert.ok(out.spanMs < 60, `the press lasts ${out.spanMs.toFixed(1)}ms — a keyswitch is over in under 60`);
  assert.ok(body[0].startedAt > transient[0].startedAt,
    'the body does not follow the transient, so the two events are not layered in order');

  const bandpass = out.gains.length >= 2;
  assert.ok(bandpass, 'the two events do not carry separate envelopes');
});

test('the interface has a voice rather than one beep: primary fuller, secondary lighter, toggle brighter', () => {
  /*
   * MEASURED OVER MANY PRESSES, WITH A MARGIN, AND THAT IS NOT FUSSINESS. Written first as a single
   * press per voice and a bare `<`, this assertion PASSED against a mutation that gave all three
   * voices identical numbers — because the ±2.5% wobble on each press made the comparison a coin
   * flip, and the coin landed right. A guard that is green a quarter of the time on a broken build
   * is worse than no guard: it reports luck as a property. The median of nine presses removes the
   * wobble, and the 1.15 margin is comfortably wider than the ±2.5% it can contribute (a 1.053
   * worst case) and comfortably narrower than the real gaps — 132 to 196 is 1.48, 196 to 240 is
   * 1.22.
   */
  const app = boot();
  app.click(app.dock);

  const median = (el) => {
    const pitches = [];
    for (let i = 0; i < 9; i++) {
      const out = press(app, el);
      const osc = out.sources.find((s) => s.kind === 'oscillator');
      assert.ok(osc, 'a press produced no body to read a pitch from');
      pitches.push(osc.frequency.values[0].value);
    }
    return pitches.sort((a, b) => a - b)[4];
  };

  const primary = median(app.primary);
  const secondary = median(app.secondary);
  const toggle = median(app.themeToggle);

  assert.ok(secondary > primary * 1.15,
    `the primary action (${primary.toFixed(0)}Hz) is not meaningfully lower and fuller than a `
    + `secondary one (${secondary.toFixed(0)}Hz) — the interface has one beep, not a voice`);
  assert.ok(toggle > secondary * 1.15,
    `a toggle (${toggle.toFixed(0)}Hz) is not meaningfully brighter than a secondary control `
    + `(${secondary.toFixed(0)}Hz)`);
});

test('two presses of the same control are not bit-identical', () => {
  // A sound repeated at exactly one frequency stops reading as a mechanism and starts reading as a
  // notification. The press carries a small wobble for that reason.
  const app = boot();
  app.click(app.dock);
  const pitches = new Set();
  for (let i = 0; i < 8; i++) {
    const out = press(app, app.primary);
    pitches.add(out.sources.find((s) => s.kind === 'oscillator').frequency.values[0].value);
  }
  assert.ok(pitches.size > 1, 'every press of one control is the identical frequency — it is a beep');
});

test('never on hover, never on load, never more than once per press', () => {
  const app = boot();
  assert.deepEqual(
    app.listenerTypes().filter((t) => /over|enter|move|focus|hover/i.test(t)),
    [],
    'the sound system listens for a pointer arriving somewhere — sound on hover is a car alarm',
  );
  assert.equal(app.clickListeners.length, 1,
    'more than one click listener: a press on the toggle would make two sounds, one from each');

  app.click(app.dock);
  const out = press(app, app.primary);
  assert.equal(out.sources.length, 2, `one press produced ${out.sources.length} sources, not one press`);

  // The toggle is a button too. Arming it must produce exactly one press, not a confirmation plus a
  // delegated press of the same button.
  const app2 = boot();
  const arming = press(app2, app2.dock);
  assert.equal(arming.sources.length, 2,
    `arming produced ${arming.sources.length / 2} presses — the toggle is being sounded twice`);
});

test('a bare prose link stays silent, and a control can opt out', () => {
  const app = boot();
  app.click(app.dock);
  assert.equal(press(app, app.prose).sources.length, 0,
    'a prose link makes a keystroke sound; navigation is not a key press');
  assert.equal(press(app, app.silenced).sources.length, 0,
    'data-sound="none" does not silence a control');
});

/* ============================================================================================
 * THE CHOICE, AND THE AMBIENT COST OF IT.
 * ========================================================================================== */

test('the choice persists the way the theme choice does', () => {
  const app = boot();
  app.click(app.dock);
  assert.equal(app.store.get('apple-sound'), 'on', 'arming the sound was not written down');
  app.click(app.dock);
  assert.equal(app.store.get('apple-sound'), 'off', 'switching it off was not written down');

  const next = boot({ stored: 'on' });
  assert.equal(next.dock.getAttribute('aria-pressed'), 'true',
    'a stored choice of "on" is not reflected by the toggle on the next page');
  assert.equal(next.log.contexts, 0, 'a restored choice built a context without a gesture');
  const out = press(next, next.primary);
  assert.ok(out.audible, 'a restored choice of "on" is silent until the toggle is pressed again');
});

test('the meter stops on a hidden tab and under reduced motion', () => {
  // Every ambient animation in this repository stops both ways. A backgrounded tab must not burn a
  // core to draw a line nobody is looking at.
  const live = boot();
  live.click(live.dock);
  live.runFrames(3);
  assert.ok(live.frames.length > 0, 'the meter never scheduled a frame, so this check is vacuous');
  assert.ok(live.drawn.includes('stroke'), 'the meter drew nothing at all');

  live.documentStub.hidden = true;
  live.fire('visibilitychange');
  live.runFrames(4);
  assert.equal(live.frames.length, 0, 'the meter keeps scheduling frames in a hidden tab');
  assert.equal(live.root.getAttribute('data-sound-still'), 'true',
    'the CSS ambient rules are not told to stop when the tab is hidden');

  const calm = boot({ reducedMotion: true });
  calm.click(calm.dock);
  calm.runFrames(4);
  assert.equal(calm.frames.length, 0,
    'the meter animates for somebody who asked for reduced motion');

  const off = boot();
  assert.equal(off.frames.length, 0, 'the meter runs before sound is even switched on');
});

test('a layout with no meter still makes sound', () => {
  // Base.astro's routes have no canvas; the synth must not depend on decoration existing.
  const app = boot({ withScope: false });
  app.click(app.dock);
  assert.ok(press(app, app.primary).audible, 'the sound system needs its meter to make a sound');
});

test('THE FLOATING CONTROL YIELDS RATHER THAN COVERING A CONTROL', () => {
  /*
   * MEASURED FIRST, GUARDED SECOND. The dock shipped floating in the bottom-right corner, and at
   * 740x360 — a phone held sideways — that corner landed on the composer with 66x13 of the SEND
   * BUTTON underneath it. Left was no better: the composer spans the width. No media query
   * expresses the boundary either, because 1280x480 is clear and 1024x540 is not.
   *
   * So the dock measures its own rectangle against every control on the page and stops floating
   * when it would cover one. Covering the primary control of the page with a preference toggle is
   * the worst version of "decoration yields to the composer": it does not merely sit behind the
   * control, it takes the press.
   */
  const covered = boot({
    dockRect: { left: 600, top: 300, width: 127, height: 32 },
    controlRect: { left: 560, top: 290, width: 120, height: 40 },
  });
  assert.ok(covered.dockBox.hasAttribute('data-flow'),
    'the dock kept floating over a control, where it takes the press meant for that control');

  const clear = boot({
    dockRect: { left: 1290, top: 848, width: 127, height: 32 },
    controlRect: { left: 300, top: 400, width: 120, height: 40 },
  });
  assert.equal(clear.dockBox.hasAttribute('data-flow'), false,
    'the dock fell back to the page bottom on a viewport where its corner is clear — the fallback '
    + 'has stopped being a fallback and become the layout');
});

test('the yield is re-measured when the window changes size, and not while scrolling', () => {
  const app = boot({
    dockRect: { left: 1290, top: 848, width: 127, height: 32 },
    controlRect: { left: 300, top: 400, width: 120, height: 40 },
  });
  assert.ok(app.windowListenerTypes().includes('resize'),
    'nothing re-measures the dock when the window is resized, so it is placed once and then wrong');
  assert.equal(app.windowListenerTypes().includes('scroll'), false,
    'the dock re-places itself on scroll — a control that jumps around while the page moves is '
    + 'worse than one that overlaps');
});

/* ============================================================================================
 * AND IT IS ACTUALLY SHIPPED, so none of the above is theatre.
 * ========================================================================================== */

test('both layouts ship THIS script, and there is only one of it', () => {
  assert.match(SNIPPET, /from\s+'\.\.\/sound\/interface-sound\.js\?raw'/,
    'InterfaceSound.astro does not inline the file this test runs');
  assert.match(SNIPPET, /<script is:inline set:html=\{SOURCE\}/,
    'the snippet does not emit the script inline — a hoisted module is where currentScript is null '
    + 'and where a feature shipped dead this morning');
  for (const [name, src] of [['Base.astro', BASE], ['Landing.astro', LANDING]]) {
    assert.match(src, /<InterfaceSound\s*\/>/, `${name} does not render the sound snippet`);
  }
  assert.doesNotMatch(BASE, /createOscillator|AudioContext/,
    'Base.astro still carries its own synth — that is the second copy this file exists to prevent');
  assert.doesNotMatch(LANDING, /createOscillator|AudioContext/,
    'Landing.astro carries its own synth rather than sharing one');
  assert.doesNotMatch(decomment(SCRIPT), /document\.currentScript/,
    'the sound script reaches for document.currentScript, which is null in a module script');
});

test('the landing has a toggle of its own, and it states its state', () => {
  assert.match(LANDING, /<SoundDock\s*\/>/, 'the front page renders no sound control');
  assert.match(DOCK, /data-sound-toggle/, 'the dock is not the hook the script listens for');
  assert.match(DOCK, /aria-pressed="false"/, 'the dock does not state its state before scripting');
  assert.match(DOCK, /aria-label="Turn interface sound on"/, 'the dock is unlabelled');
  assert.match(DOCK, /html\.no-js\)?\s*\.sound-dock\s*\{[^}]*display:\s*none/,
    'a control that needs scripting is offered to a visitor who has none');
});
