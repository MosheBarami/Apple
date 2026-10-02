/**
 * THE LANDING'S SMALL BEHAVIOURS: the Rail, the loop illustration, the example buttons, the Snap.
 *
 * Four independent set-ups, each wrapped so one failing cannot take the others down. Nothing here
 * draws on a canvas, nothing loops, and nothing creates content: every section is finished in the
 * markup before this runs. The script only responds.
 *
 *   Rail      marks each rail node as passed once its section crosses the 40% line of the window,
 *             and the section being read as the current one (aria-current="location").
 *   Loop      lights the four steps of the "How a run actually goes" illustration ONCE, 600ms apart,
 *             when it first scrolls into view, then rests on the final state. Under reduced motion
 *             it is simply drawn lit.
 *   Examples  a button fills the composer with its own words and moves focus there. Nothing types
 *             by itself and nothing replays.
 *   Snap      the logo's right-hand stud lifts the first time focus enters the composer and clicks
 *             down when the form is submitted. A picture of nothing: it reacts to the visitor.
 */

const safely = (name: string, fn: () => void) => {
  try {
    fn();
  } catch (err) {
    console.error('landing set-up failed: ' + name, err);
  }
};

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountLanding(): void {
  safely('rail', () => {
    const nodes = [...document.querySelectorAll<HTMLElement>('[data-rail]')];
    if (!nodes.length || !('IntersectionObserver' in window)) return;
    const byId = new Map(nodes.map((n) => [n.dataset.rail ?? '', n]));
    const passed = new Set<string>();

    const paint = () => {
      // The current stop is the last one passed.
      let current = '';
      for (const n of nodes) {
        const id = n.dataset.rail ?? '';
        const on = passed.has(id);
        n.classList.toggle('is-passed', on);
        if (on) current = id;
      }
      for (const [id, n] of byId) {
        if (id === current) n.setAttribute('aria-current', 'location');
        else n.removeAttribute('aria-current');
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const root = e.rootBounds;
          const line = root ? root.bottom : window.innerHeight * 0.4;
          if (e.boundingClientRect.top <= line) passed.add(e.target.id);
          else passed.delete(e.target.id);
        }
        paint();
      },
      { rootMargin: '0px 0px -60% 0px', threshold: [0, 1] },
    );
    for (const id of byId.keys()) {
      const section = document.getElementById(id);
      if (section) io.observe(section);
    }
  });

  safely('loop', () => {
    const cycle = document.querySelector<HTMLElement>('[data-cycle]');
    if (!cycle) return;
    const steps = [...cycle.querySelectorAll<HTMLElement>('.cycle-step')];
    if (!steps.length) return;
    if (reduced() || !('IntersectionObserver' in window)) {
      steps.forEach((s) => s.classList.add('is-lit'));
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        steps.forEach((s, i) => window.setTimeout(() => s.classList.add('is-lit'), 150 + i * 600));
      },
      { threshold: 0.35 },
    );
    io.observe(cycle);
    // A failsafe, like the reveal's: whatever else happens, the loop ends lit.
    window.setTimeout(() => steps.forEach((s) => s.classList.add('is-lit')), 9000);
  });

  safely('examples', () => {
    const field = document.getElementById('hero-start') as HTMLTextAreaElement | null;
    if (!field) return;
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-example]')) {
      button.addEventListener('click', () => {
        field.value = button.dataset.example ?? button.textContent ?? '';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      });
    }
  });

  safely('snap', () => {
    const composer = document.querySelector<HTMLFormElement>('form.composer');
    const marks = [...document.querySelectorAll<SVGElement>('#site-nav .apple-mark')];
    if (!composer || !marks.length) return;
    const set = (state: 'lifted' | 'seated') => marks.forEach((m) => m.setAttribute('data-state', state));
    // Focus is the trigger because a touch screen has no hover: the first time it enters the box.
    composer.addEventListener('focusin', () => set('lifted'), { once: true });
    composer.addEventListener('submit', () => set('seated'));
  });
}
