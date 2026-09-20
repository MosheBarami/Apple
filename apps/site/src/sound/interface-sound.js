/* =====================================================================================
 * INTERFACE SOUND — ONE IMPLEMENTATION, SHARED BY EVERY LAYOUT.
 *
 * This file is the whole sound system. Base.astro and Landing.astro both inline THIS TEXT
 * through layouts/InterfaceSound.astro, so there is one synth, one listener and one stored
 * preference for the entire site. Before this there was a copy in Base.astro and nothing at all
 * on the front page, which is two states that cannot agree and one page with no control.
 *
 * WHAT THE OWNER ASKED FOR. He played with rosebud.ai and singled out one thing: pressing a button
 * makes a satisfying mechanical keyboard click. Measured on that page the same day (recorded in
 * packages/corpus/data/ui-references/web-landing.json, claim 16): its resource timing list contains
 * no mp3, wav, ogg, m4a or webm anywhere, while AudioContext is available — so their click is
 * SYNTHESISED at interaction time, not downloaded. That is the cheaper technique and the one used
 * here. A synthesised click costs no bytes, has no load state, and cannot be the reason a button
 * feels late.
 *
 * WHAT A KEYSWITCH ACTUALLY SOUNDS LIKE, and why the old `tick()` did not. The retired version was
 * one triangle oscillator sliding down — a soft chisel tick, a single event. A mechanical key press
 * is TWO events layered: the CLICK OF THE STEM, a bright noise transient of a few milliseconds with
 * no pitch of its own, and the THOCK OF THE BOTTOM-OUT, a low short body as the key meets the
 * plate. Both are below, layered with the body starting 4ms after the transient, and the whole
 * envelope is finished inside 58ms at its longest voice.
 *
 * THE INTERFACE HAS A VOICE RATHER THAN A BEEP. Three voices, chosen the way the reference's accent
 * family is chosen — one object, three jobs: a primary action is lower and fuller, a secondary
 * lighter and shorter, a toggle a touch brighter. Every press also carries a ±2.5% wobble, because
 * a sound repeated at exactly one frequency stops reading as a mechanism and starts reading as a
 * notification.
 *
 * THE PROPERTIES THIS FILE MUST KEEP, all of them checked by tests/interface-sound.test.mjs:
 *   - OFF by default. Nothing is armed by loading a page.
 *   - The AudioContext is constructed by a PRESS and never by load — the visitor's press on the
 *     toggle, or, when a previous visit already chose sound, that session's first press. Both are
 *     real user gestures, which is what browsers require; neither is page load.
 *   - Nothing autoplays.
 *   - The choice persists exactly the way the theme choice does, in localStorage under
 *     `apple-sound`, and is read back on the next page.
 *   - Every toggle states its state in aria-pressed and aria-label.
 *   - Never on hover, never on load, never more than once per press: ONE delegated listener owns
 *     both the toggle and the press, so a press on the toggle cannot produce two sounds.
 *
 * NO `document.currentScript`. Astro hoists a component <script> into a module script where
 * currentScript is null by specification; a hero effect shipped that way this morning and never ran
 * at all. Everything here is found with querySelector, and every one of those lookups tolerates a
 * null.
 * ===================================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'apple-sound';

  /* Everything that reads as a press. Buttons and links-as-buttons across both layouts: the
     landing's `.pill`, the chrome's `.iconbtn` and `.nav__cta`, anything with an explicit
     role, and `[data-sound-press]` for a control that is none of those. A bare prose link is
     deliberately absent — navigation is not a keystroke. */
  var PRESSABLE = [
    'button',
    '[role="button"]',
    'input[type="submit"]',
    'input[type="button"]',
    'summary',
    'a.pill',
    'a.btn',
    'a.cta',
    'a.button',
    'a.nav__cta',
    'a.nav__signin',
    'a[data-cta]',
    '[data-sound-press]'
  ].join(', ');

  /* THE THREE VOICES. clickHz is the band the stem transient sits in, bodyHz the pitch of the
     bottom-out. Gains are deliberately low: this is a texture under a finger, not an alert. */
  var VOICES = {
    primary:   { clickHz: 2400, clickQ: 0.9, clickGain: 0.034, clickDur: 0.010, bodyHz: 132, bodyGain: 0.075, bodyDur: 0.044 },
    secondary: { clickHz: 3200, clickQ: 1.1, clickGain: 0.026, clickDur: 0.008, bodyHz: 196, bodyGain: 0.048, bodyDur: 0.032 },
    toggle:    { clickHz: 4200, clickQ: 1.3, clickGain: 0.036, clickDur: 0.007, bodyHz: 240, bodyGain: 0.052, bodyDur: 0.030 }
  };

  var audio = null;       // constructed by a press, never by load
  var grain = null;       // the noise buffer, built once per context
  var armed = stored();   // the visitor's persisted choice; false on a first visit

  /* ------------------------------------------------------------------ preference */

  function stored() {
    try {
      return localStorage.getItem(STORE_KEY) === 'on';
    } catch (err) {
      return false; /* private mode — off, which is the default anyway */
    }
  }

  function remember(on) {
    try {
      localStorage.setItem(STORE_KEY, on ? 'on' : 'off');
    } catch (err) {
      /* private mode — the choice still applies for this page view */
    }
  }

  /* ------------------------------------------------------------------ the synth */

  /** Construct the context. Called from the click handler and from nowhere else. */
  function ensureAudio() {
    if (audio) return audio;
    /* The prefixed name is Safari's, and it is still how an older iOS reaches this API. The cast
       is for the type checker only; there is no TypeScript in a file that ships as it is written. */
    var w = /** @type {any} */ (window);
    var Ctx = w.AudioContext || w.webkitAudioContext;
    if (!Ctx) return null;
    audio = new Ctx();
    return audio;
  }

  /** A short burst of decaying white noise, built once and re-triggered per press. */
  function noise(ac) {
    if (grain) return grain;
    var rate = ac.sampleRate || 44100;
    var len = Math.max(64, Math.floor(rate * 0.06));
    var buf = ac.createBuffer(1, len, rate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    grain = buf;
    return grain;
  }

  /**
   * ONE PRESS. Two layered events, under 60ms, at a low gain.
   * Silent unless armed, and silent unless a press has already built the context.
   */
  function press(kind) {
    if (!armed || !audio) return false;
    if (audio.state === 'suspended' && audio.resume) audio.resume();

    var v = VOICES[kind] || VOICES.secondary;
    var t = audio.currentTime;
    var wobble = 1 + (Math.random() - 0.5) * 0.05;

    /* 1. THE CLICK OF THE STEM — filtered noise, no pitch, gone in a few milliseconds. */
    var src = audio.createBufferSource();
    src.buffer = noise(audio);
    var band = audio.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(v.clickHz * wobble, t);
    band.Q.value = v.clickQ;
    var clickGain = audio.createGain();
    clickGain.gain.setValueAtTime(v.clickGain, t);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t + v.clickDur);
    src.connect(band).connect(clickGain).connect(audio.destination);
    src.start(t);
    src.stop(t + v.clickDur + 0.004);

    /* 2. THE THOCK OF THE BOTTOM-OUT — a low body, pitched down as it dies. */
    var at = t + 0.004;
    var osc = audio.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(v.bodyHz * wobble, at);
    osc.frequency.exponentialRampToValueAtTime(v.bodyHz * 0.55, at + v.bodyDur);
    var bodyGain = audio.createGain();
    bodyGain.gain.setValueAtTime(0.0001, at);
    bodyGain.gain.exponentialRampToValueAtTime(v.bodyGain, at + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + v.bodyDur);
    osc.connect(bodyGain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + v.bodyDur + 0.008);

    hit(v);
    return true;
  }

  /* ------------------------------------------------------------------ the toggles */

  function toggles() {
    return document.querySelectorAll('[data-sound-toggle]');
  }

  function paint() {
    var list = toggles();
    for (var i = 0; i < list.length; i++) {
      list[i].setAttribute('aria-pressed', String(armed));
      list[i].setAttribute(
        'aria-label',
        armed ? 'Turn interface sound off' : 'Turn interface sound on'
      );
    }
  }

  /* ------------------------------------------------------------------ the meter */

  /*
   * A CANVAS THAT SHOWS THE SOUND IT IS ABOUT TO MAKE. It is the toggle's own icon: a flat line
   * while sound is off, a live trace while it is on, and a kick on every press whose height is the
   * press's own body gain. It is entirely optional — a layout without one is silent about it and
   * every other line above still runs.
   *
   * IT IS THE ONLY AMBIENT MOTION THIS FILE OWNS, AND IT STOPS THREE WAYS: it never starts while
   * sound is off, it stops on prefers-reduced-motion, and it stops on visibilitychange. A
   * backgrounded tab must not burn a core for a line nobody is looking at.
   */
  var scope = null;
  var scopeCtx = null;
  var frame = 0;
  var energy = 0;
  var phase = 0;
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function findScope() {
    var el = document.querySelector('[data-sound-scope]');
    if (!el || !el.getContext) return;
    scope = el;
    scopeCtx = el.getContext('2d');
  }

  function stopped() {
    return !armed || document.hidden === true || !!(reduced && reduced.matches);
  }

  function paintScope() {
    if (!scope || !scopeCtx) return;
    var w = scope.width || 0;
    var h = scope.height || 0;
    if (!w || !h) return;
    var mid = h / 2;
    var ink = '';
    if (window.getComputedStyle) {
      ink = window.getComputedStyle(scope).getPropertyValue('color');
    }
    scopeCtx.clearRect(0, 0, w, h);
    scopeCtx.beginPath();
    for (var x = 0; x <= w; x += 2) {
      var k = x / w;
      var taper = Math.sin(Math.PI * k);
      var wave = Math.sin(k * 14 + phase) * 0.55 + Math.sin(k * 31 - phase * 1.7) * 0.45;
      var amp = (0.16 + energy * 0.84) * (mid - 1.5) * taper;
      var y = mid + wave * amp;
      if (x === 0) scopeCtx.moveTo(x, y);
      else scopeCtx.lineTo(x, y);
    }
    scopeCtx.strokeStyle = ink ? ink.trim() : 'currentColor';
    scopeCtx.lineWidth = 2;
    scopeCtx.stroke();
  }

  function tickScope() {
    if (stopped()) { frame = 0; paintScope(); return; }
    phase += 0.06;
    energy *= 0.9;
    if (energy < 0.004) energy = 0;
    paintScope();
    frame = window.requestAnimationFrame(tickScope);
  }

  function runScope() {
    /* The CSS half of the same stop. Every ambient rule in InterfaceSound.astro is paused by this
       attribute, so prefers-reduced-motion, a hidden tab and "sound is off" all halt the keyframes
       as well as the canvas — one predicate, not two that can disagree. */
    var still = stopped();
    if (document.documentElement && document.documentElement.setAttribute) {
      document.documentElement.setAttribute('data-sound-still', still ? 'true' : 'false');
    }
    if (!scope) return;
    if (frame) { window.cancelAnimationFrame(frame); frame = 0; }
    if (still) { paintScope(); return; }
    frame = window.requestAnimationFrame(tickScope);
  }

  /** The visible half of a press: the meter kicks, and the control flashes its ring. */
  function hit(v) {
    energy = Math.min(1, 0.55 + v.bodyGain * 6);
    runScope();
    var list = toggles();
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!el.classList) continue;
      el.classList.remove('is-hit');
      /* Reading offsetWidth restarts a CSS animation that is already running; without it a second
         press inside the animation's own duration adds a class that is already there and nothing
         plays. */
      void el.offsetWidth;
      el.classList.add('is-hit');
    }
  }

  /* ------------------------------------------------------------------ the dock's place */

  /*
   * A FLOATING CONTROL MUST NOT COVER A CONTROL, and this one did.
   *
   * MEASURED, on the built landing, at nine viewport sizes: at 740x360 and 667x375 — a phone held
   * sideways — the hero fills the screen, the corner the dock floats in lands ON the composer, and
   * 66x13 of the SEND BUTTON was underneath it. Both corners: moving it left is no fix, because the
   * composer spans the width. At 1440x900, 1280x620, 1280x480, 1024x700, 900x560, 800x560 and
   * 390x844 the corner is clear.
   *
   * A media query cannot express that boundary — 1280x480 is clear and 1024x540 is not, so it is
   * not a height rule or a width rule. The dock therefore MEASURES: if its own rectangle overlaps
   * any control, it stops floating and takes its place at the end of the page, where it cannot
   * steal a press. This is the same rule apps/web states as "decoration yields to the composer",
   * applied by the decoration rather than assumed by it.
   *
   * On load and on resize, never on scroll. The composer sits at the top of the page, so scrolling
   * carries it AWAY from a bottom corner; and a control that jumps around while the page scrolls is
   * worse than one that overlaps.
   */
  var CONTROLS = 'button, [role="button"], a[href], input, textarea, select, summary';

  function rectOf(el) {
    return el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  }

  function placeDock() {
    var dock = document.querySelector('[data-sound-dock]');
    if (!dock || !dock.getBoundingClientRect || !dock.setAttribute) return;
    /* Measure the floating position, not the one it was last given. */
    if (dock.removeAttribute) dock.removeAttribute('data-flow');
    var d = rectOf(dock);
    if (!d || !d.width || !d.height) return;
    var list = document.querySelectorAll(CONTROLS);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.closest && el.closest('[data-sound-dock]')) continue;
      var r = rectOf(el);
      if (!r || !r.width || !r.height) continue;
      if (r.left < d.right && r.right > d.left && r.top < d.bottom && r.bottom > d.top) {
        dock.setAttribute('data-flow', '');
        return;
      }
    }
  }

  var placing = 0;
  function schedulePlace() {
    if (placing) return;
    placing = window.requestAnimationFrame(function () { placing = 0; placeDock(); });
  }

  /* ------------------------------------------------------------------ the one listener */

  function voiceFor(el) {
    var explicit = el.getAttribute ? el.getAttribute('data-sound') : null;
    if (explicit === 'primary' || explicit === 'secondary' || explicit === 'toggle') return explicit;
    if (el.hasAttribute && (el.hasAttribute('aria-pressed') || el.hasAttribute('data-theme-toggle'))) {
      return 'toggle';
    }
    var name = el.className;
    if (name && typeof name !== 'string' && typeof name.baseVal === 'string') name = name.baseVal;
    var cls = ' ' + (typeof name === 'string' ? name : '') + ' ';
    if (/\bpill-quiet\b|\biconbtn\b|\bghost\b|\bquiet\b/.test(cls)) return 'secondary';
    if (/\bprimary\b|\bcta\b|\bpill\b/.test(cls)) return 'primary';
    if (el.getAttribute && el.getAttribute('type') === 'submit') return 'primary';
    return 'secondary';
  }

  /*
   * ONE LISTENER FOR BOTH JOBS, which is what makes "never more than once per press" structural
   * rather than a promise. The toggle is a button too: if arming were handled in one listener and
   * pressing in another, the press that arms the sound would make two sounds.
   */
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    var toggle = target.closest('[data-sound-toggle]');
    if (toggle) {
      armed = !armed;
      if (armed) {
        ensureAudio();
        if (audio && audio.resume) audio.resume();
      }
      remember(armed);
      paint();
      if (armed) press('toggle');
      runScope();
      return;
    }

    var control = target.closest(PRESSABLE);
    if (!control) return;
    if (control.getAttribute && control.getAttribute('data-sound') === 'none') return;
    if (control.hasAttribute && control.hasAttribute('disabled')) return;
    /* A choice carried over from a previous visit arms on this session's first press — still a
       gesture, still never at load. */
    if (armed && !audio) {
      ensureAudio();
      if (audio && audio.resume) audio.resume();
    }
    press(voiceFor(control));
  });

  document.addEventListener('visibilitychange', runScope);
  window.addEventListener('resize', schedulePlace);
  if (reduced) {
    if (reduced.addEventListener) reduced.addEventListener('change', runScope);
    else if (reduced.addListener) reduced.addListener(runScope);
  }

  /* ------------------------------------------------------------------ boot */

  findScope();
  placeDock();
  paint();
  paintScope();
  runScope();

  /* The public surface. `appleTick` is the retired name and is kept aimed at the new synth, so
     anything that already called it gets a keyswitch instead of a chisel tick rather than an
     error. */
  window.appleSound = {
    press: press,
    isOn: function () { return armed; },
    voices: VOICES
  };
  window.appleTick = function () { return press('secondary'); };
})();
