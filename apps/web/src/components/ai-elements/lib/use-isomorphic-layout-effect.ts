// `useLayoutEffect` in the browser, `useEffect` anywhere without a DOM.
//
// The positioning and follow-the-edge effects here must run before paint — a tooltip measured a
// frame late flashes at 0,0, a transcript followed a frame late shows the new line below the fold
// first. But React warns for every layout effect rendered without a DOM (a server render, or the
// node test that renders these components to markup), and there is nothing to measure there.
import { useEffect, useLayoutEffect } from 'react';

export const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
