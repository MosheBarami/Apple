import { AppleGlyph } from '../glyphs';

/**
 * The Apple mark, wrapped for the places that size it with CSS (the rail brand, the welcome sheet,
 * the usage page). It was a folded sheet drawn here; it is the brick-and-chevron mark now, drawn once
 * in components/glyphs.tsx so there is exactly one logo in the product.
 *
 * `snap` is the Studio link as the shell knows it: "lifted" while Studio is disconnected, "seated"
 * otherwise. Callers that know nothing about Studio leave it off and get a seated mark.
 */
export function ModelMark({ variant = 'apple', live = false, snap = 'seated' }: { variant?: 'apple'; live?: boolean; snap?: 'seated' | 'lifted' }) {
  return <span aria-hidden="true" className={`model-signature model-signature--${variant}${live ? ' is-live' : ''}`}>
    <AppleGlyph size={30} state={snap} />
  </span>;
}
