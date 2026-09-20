/**
 * THE COMPOSER'S REAL HEIGHT, PUBLISHED FOR THE THINGS THAT FLOAT OVER IT.
 *
 * WHAT WAS WRONG. components/toast.css lifts the toast stack clear of the composer with two
 * constants — 200px on a wide screen, 204px under 680px — each arrived at by ADDING UP the
 * composer's parts in a comment: "12px of top padding + a 64px textarea + a 57px tool bar …
 * ≈ 188px". That sum was a guess about a box nobody measured, and the box is not one size. Measured
 * in Chromium against the real workspace, with a toast on screen:
 *
 *     1440px   composer 198px tall, lift 200px  → clears by 2px
 *     1024px   composer 244px tall, lift 200px  → the toast covers its top 43px
 *      768px   composer 244px tall, lift 200px  → the toast covers its top 43px
 *      375px   composer 264px tall, lift 204px  → the toast covers the top 49px of an 85px
 *                                                 textarea, and `document.elementFromPoint` at the
 *                                                 field's first line returns the TOAST
 *
 * So on a phone a "Studio connected" confirmation lands on the message box: the placeholder is
 * half covered, and a thumb aimed at the first line of the field hits the toast instead. That is
 * the exact failure toast.css's own header says it exists to prevent — "a confirmation that blocks
 * the thing you were typing into is worse than no confirmation" — reintroduced by measuring the
 * composer on paper instead of on screen.
 *
 * WHY A CUSTOM PROPERTY AND NOT A THIRD CONSTANT. toast.css already named this fix and declined it
 * for being out of its lane: "the honest fix is a `--composer-h` custom property published by
 * ws/composer.css — a file this change does not own." A fourth breakpoint would be a fourth guess,
 * and it still could not cover the case that file admits it misses: the textarea GROWS to 220px as
 * somebody types, so a long draft reaches up behind the stack no matter which constant is chosen.
 * A measured value tracks all of it — width, tool bar wrapping, a staged attachment row, and the
 * draft the person is in the middle of writing.
 *
 * WHY ON `document.documentElement`. The toast stack is a portal at the root of the tree; it is
 * not a descendant of the composer and can inherit nothing from it. The root is the only element
 * both of them can see.
 *
 * THE CSS KEEPS ITS OWN FALLBACK. Every consumer reads this as `var(--composer-h, <the old
 * constant>)`, so the first paint — before the observer has measured anything — and any browser
 * without ResizeObserver land exactly where they landed before. This can improve that number; it
 * cannot take it away.
 */

/** The property every floating surface reads to stay clear of the composer. */
export const COMPOSER_HEIGHT_PROP = '--composer-h';

/**
 * The value to publish for a measured height, or `null` meaning "publish nothing".
 *
 * `null` for anything that is not a real, positive, finite measurement — a display:none composer
 * measures 0, and a detached one measures NaN. Writing `0px` in either case would drop the toast
 * stack onto the bottom edge of the screen, which is worse than the constant it replaced; clearing
 * the property instead hands the CSS fallback back.
 *
 * Rounded UP to a whole pixel. A fractional layout is normal — 264.5px — and rounding down leaves
 * the stack half a pixel inside the composer, which is the defect this exists to remove.
 */
export function composerHeightValue(height: number): string | null {
  if (!Number.isFinite(height) || height <= 0) return null;
  return `${Math.ceil(height)}px`;
}

/** Just enough of a style-carrying element to be swappable in a test. */
interface StyleTarget {
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): string };
}

/** Write a measured height, or clear the property when there is nothing honest to write. */
export function applyComposerHeight(target: StyleTarget, height: number): void {
  const value = composerHeightValue(height);
  if (value === null) target.style.removeProperty(COMPOSER_HEIGHT_PROP);
  else target.style.setProperty(COMPOSER_HEIGHT_PROP, value);
}

/**
 * Keep the property in step with an element's box for as long as it is mounted.
 *
 * Returns the teardown, which CLEARS the property rather than leaving the last height behind: a
 * composer that has unmounted is not 264px tall, and a stale value would hold the toast stack off
 * the bottom of a screen that has no composer on it at all.
 *
 * A missing `ResizeObserver` is not an error and not a reason to skip the first measurement — the
 * value is published once and then simply does not track. Same for a missing element: the caller
 * gets a no-op teardown rather than a thrown render.
 */
export function observeComposerHeight(element: Element | null, target: StyleTarget): () => void {
  if (!element) return () => {};
  const measure = () => applyComposerHeight(target, element.getBoundingClientRect().height);
  measure();
  const Observer = typeof ResizeObserver === 'function' ? ResizeObserver : null;
  if (!Observer) return () => target.style.removeProperty(COMPOSER_HEIGHT_PROP);
  const observer = new Observer(measure);
  observer.observe(element);
  return () => {
    observer.disconnect();
    target.style.removeProperty(COMPOSER_HEIGHT_PROP);
  };
}
