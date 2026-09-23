// The animated disclosure (Animate UI "Collapsible" merged with React Bits "Thought Line"), as two
// hooks any Collapsible owner can use without changing the Collapsible primitive itself.
//
//   useAnimatedClose  wraps an open-state setter so that CLOSING first runs the collapse and only
//                     then hides the content. Opening is passed straight through.
//   useExpandOnOpen   runs the expand once the content has become visible.
//
// The content is found by id — the id the caller already hands CollapsibleContent so that the
// trigger's aria-controls can name it — so no ref has to be threaded through the primitive.
import { useCallback, useRef } from 'react';
import { useIsomorphicLayoutEffect } from '../../ai-elements/lib/use-isomorphic-layout-effect';
import { collapse, expand } from './motion';

const byId = (id: string | null | undefined): HTMLElement | null =>
  id && typeof document !== 'undefined' ? document.getElementById(id) : null;

export function useAnimatedClose(
  contentId: { current: string | null },
  setOpenState: (open: boolean) => void,
): (open: boolean) => void {
  // A reopen while the collapse is still running must win: every request takes a ticket, and a
  // collapse only hides the content if nothing newer has been asked for since it started.
  const ticket = useRef(0);
  return useCallback(
    (next: boolean) => {
      const mine = ++ticket.current;
      if (next) {
        setOpenState(true);
        return;
      }
      void collapse(byId(contentId.current)).then(() => {
        if (ticket.current === mine) setOpenState(false);
      });
    },
    [contentId, setOpenState],
  );
}

export function useExpandOnOpen(id: string, open: boolean) {
  const was = useRef(open);
  useIsomorphicLayoutEffect(() => {
    if (open && !was.current) expand(byId(id));
    was.current = open;
  }, [id, open]);
}
