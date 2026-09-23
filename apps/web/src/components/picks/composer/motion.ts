// THE MOTION TOOLKIT FOR THE COMPOSER'S PICKS, written here because apps/web ships no motion library.
//
// The owner's picks came from Motion, Animate UI, GSAP and React Bits. None of those packages is
// installed, and none may be: everything they did for the composer is re-implemented on the
// platform — the Web Animations API for the springs, CSS custom properties for anything pointer
// driven, requestAnimationFrame where a value has to be integrated over time. No source was copied
// from a Motion+ or GSAP file; the behaviour is rebuilt from what each one was described as doing.
//
//   spring()      Motion's `type: 'spring'` (stiffness, damping, mass), baked into a CSS linear()
//                 easing so the browser runs it off the main thread.
//   shuffle()     gsap.utils.shuffle — a fresh deck, so ideas are dealt without repeats.
//   random()      gsap.utils.random(min, max) — the hand-placed tilt on a dealt card.
//   reducedMotion() the one question every picked animation asks first.

/** True when the person has asked their system for less motion. Server rendering reads as "yes". */
export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True for a mouse or trackpad. Hover-driven effects are skipped on touch, where hover is a lie. */
export function finePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export interface SpringOptions {
  stiffness?: number;
  damping?: number;
  mass?: number;
}

export interface SpringCurve {
  /** A CSS easing: `linear(...)` where the browser supports it, an overshooting bezier otherwise. */
  easing: string;
  /** Milliseconds until the spring has settled to within a thousandth of its target. */
  duration: number;
}

const curves = new Map<string, SpringCurve>();
let linearSupported: boolean | null = null;

function supportsLinear(): boolean {
  if (linearSupported !== null) return linearSupported;
  linearSupported =
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('transition-timing-function', 'linear(0, 1)');
  return linearSupported;
}

/**
 * A damped spring from 0 to 1, integrated numerically and sampled into a linear() easing.
 *
 * Numerical rather than closed-form so the three damping regimes need no separate formulas, and
 * cached, because the same four or five springs are asked for on every hover in the bar.
 */
export function spring({ stiffness = 400, damping = 25, mass = 1 }: SpringOptions = {}): SpringCurve {
  const key = `${stiffness}/${damping}/${mass}`;
  const cached = curves.get(key);
  if (cached) return cached;

  const dt = 1 / 1000;
  let x = 0;
  let v = 0;
  let t = 0;
  let settledFor = 0;
  const samples: number[] = [0];
  const every = 16; // one sample per ~16 ms of spring time
  let step = 0;
  while (t < 3) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
    t += dt;
    step += 1;
    if (step % every === 0) samples.push(x);
    settledFor = Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.01 ? settledFor + dt : 0;
    if (settledFor > 0.05) break;
  }
  samples.push(1);
  const duration = Math.max(120, Math.round(t * 1000));
  const easing = supportsLinear()
    ? `linear(${samples.map((s) => Number(s.toFixed(4))).join(', ')})`
    : 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  const curve = { easing, duration };
  curves.set(key, curve);
  return curve;
}

/** A copy of `items` in a random order (Fisher–Yates). The input is never touched. */
export function shuffle<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** A number in [min, max). */
export function random(min: number, max: number, rand: () => number = Math.random): number {
  return min + (max - min) * rand();
}

/**
 * A deck that deals every item once before any item repeats, reshuffling when it runs out — and
 * never dealing the last card of one deck as the first of the next.
 */
export function makeDeck<T>(items: readonly T[], rand: () => number = Math.random) {
  let pile: T[] = [];
  let last: T | undefined;
  return {
    deal(): T | undefined {
      if (!items.length) return undefined;
      if (!pile.length) {
        pile = shuffle(items, rand);
        if (pile.length > 1 && pile[pile.length - 1] === last) [pile[0], pile[pile.length - 1]] = [pile[pile.length - 1] as T, pile[0] as T];
      }
      last = pile.pop();
      return last;
    },
    hand(n: number): T[] {
      const out: T[] = [];
      for (let i = 0; i < n && i < items.length; i += 1) {
        const card = this.deal();
        if (card !== undefined && !out.includes(card)) out.push(card);
      }
      return out;
    },
  };
}

/** The element's current `scale`, read through any running animation. */
export function currentScale(el: Element): number {
  const raw = getComputedStyle(el).scale;
  if (!raw || raw === 'none') return 1;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 1;
}

const running = new WeakMap<Element, Animation>();

/**
 * Spring the element's `scale` to `to`, starting from wherever it is now — so a hover that ends
 * half-way through its press animation continues from the half-way point instead of jumping.
 *
 * `scale` (the individual transform property), not `transform`: the magnetic dock owns `transform`
 * on the same buttons, and the two multiply instead of fighting.
 */
export function springScale(el: HTMLElement, to: number, options?: SpringOptions): void {
  if (typeof el.animate !== 'function') return;
  const from = currentScale(el);
  running.get(el)?.cancel();
  if (from === to) return;
  const { easing, duration } = spring(options);
  const anim = el.animate([{ scale: String(from) }, { scale: String(to) }], { duration, easing, fill: 'forwards' });
  running.set(el, anim);
  if (to === 1) anim.onfinish = () => { if (running.get(el) === anim) { anim.cancel(); running.delete(el); } };
}
