// THE MODEL LIST'S HIGHLIGHT — Animate UI's "Highlight" inside AI Elements' ModelSelector.
//
// cmdk marks the row under the keyboard or the pointer with `data-selected="true"` and, by default,
// each row paints its own background, so moving through the list is a row blinking off and the
// next blinking on. This is the one shared backdrop instead: it sits behind the rows and travels
// to whichever row cmdk has marked, on Animate UI's spring (sliding-highlight.ts).
//
// Mounted as a child of the list (cmdk renders it inside its sizer, which the sheet positions), so
// the backdrop scrolls with the rows it is behind. It watches the one attribute cmdk changes and
// nothing else.
import { useEffect, useRef } from 'react';
import { moveHighlight } from './sliding-highlight';
import './model-list-fx.css';

export function ModelListHighlight() {
  const pill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = pill.current;
    const sizer = el?.parentElement;
    if (!el || !sizer) return;
    sizer.classList.add('pk-hl-host');
    const follow = () => moveHighlight(el, sizer.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]'));
    follow();
    const watch = new MutationObserver(follow);
    watch.observe(sizer, { subtree: true, attributes: true, attributeFilter: ['data-selected'], childList: true });
    return () => { watch.disconnect(); sizer.classList.remove('pk-hl-host'); };
  }, []);

  return <span ref={pill} className="pk-list-hl" aria-hidden="true" />;
}
