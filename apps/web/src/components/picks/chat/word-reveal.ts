// A STREAMED REPLY LANDS WORD BY WORD.
//
// Three GSAP picks, merged into one behaviour and re-implemented without GSAP (it is not installed,
// and its "Standard No Charge" licence is not one this repository vendors code under):
//   * SplitText (words) — each new word arrives through a soft blur, staggered (no rise: see the
//     stylesheet for why a word stays inline);
//   * nestedLinesSplit() — the split recurses into <strong>, <em>, <code> and links, so a formatted
//     reply animates exactly like a plain one instead of skipping its emphasised half;
//   * splitArabicText() — right-to-left text keeps its joined letter shapes. That helper exists
//     because splitting Arabic into CHARACTERS breaks the joins; this only ever splits at WORD
//     boundaries (Intl.Segmenter where there is one), so a Hebrew or Arabic word is one span and
//     its letters are never pulled apart.
//
// HOW IT STAYS SAFE AROUND REACT. The prose half of a reply is rendered by lib/markdown.tsx as
// sanitised HTML through `dangerouslySetInnerHTML`; React never reconciles the children of such a
// node, and it replaces them wholesale when the HTML changes. So the words are wrapped after each
// render, inside those nodes only — never inside a code block, which is a real React subtree — and
// a delta that re-renders the HTML simply gets wrapped again. Only words past the count already
// revealed are animated, so the text that was on screen does not flash on every delta.

import { useRef, type RefObject } from 'react';
import { useIsomorphicLayoutEffect } from '../../ai-elements/lib/use-isomorphic-layout-effect';
import { reducedMotion } from './motion';
import './word-reveal.css';

const SKIP = 'pre, code, .ai-code-block, .pk-word, svg';

type Segmenter = { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> };

function segmenter(): Segmenter | null {
  const Ctor = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => Segmenter }).Segmenter;
  return Ctor ? new Ctor(undefined, { granularity: 'word' }) : null;
}

/** Split a run of text into words and the spaces/punctuation between them, never inside a word. */
export function splitWords(text: string): string[] {
  const seg = segmenter();
  if (!seg) return text.split(/(\s+)/).filter(Boolean);
  const out: string[] = [];
  for (const { segment, isWordLike } of seg.segment(text)) {
    // Punctuation rides with the word before it, so "Done." arrives as one piece.
    if (!isWordLike && !/\s/.test(segment) && out.length && !/\s$/.test(out[out.length - 1]!)) {
      out[out.length - 1] += segment;
    } else out.push(segment);
  }
  return out;
}

/** Wrap every word under `root` in a span; returns all its word spans in reading order. */
function wrapWords(root: HTMLElement): HTMLElement[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.nodeValue && node.nodeValue.trim() && !node.parentElement?.closest(SKIP)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const node of texts) {
    const frag = doc.createDocumentFragment();
    for (const piece of splitWords(node.nodeValue ?? '')) {
      if (/^\s+$/.test(piece)) frag.append(piece);
      else {
        const span = doc.createElement('span');
        span.className = 'pk-word';
        span.textContent = piece;
        frag.append(span);
      }
    }
    node.replaceWith(frag);
  }
  return Array.from(root.querySelectorAll<HTMLElement>('.pk-word'));
}

/**
 * Reveal the words of `container`'s prose that were not on screen before. `seen` carries the
 * number already revealed across calls; the return value is the new count.
 */
export function revealNewWords(container: HTMLElement, seen: number): number {
  // Only the sanitised prose nodes: `.markdown > div` that is not a code block. A node whose HTML
  // did not change since the last pass is already wrapped, and its words still count.
  const all = Array.from(container.querySelectorAll<HTMLElement>('.markdown > div:not(.ai-code-block)')).flatMap(wrapWords);
  let fresh = 0;
  all.forEach((word, i) => {
    if (i < seen) return;
    word.classList.add('is-new');
    word.style.animationDelay = `${Math.min(fresh, 24) * 28}ms`;
    fresh += 1;
  });
  return Math.max(seen, all.length);
}

/**
 * Reveal a reply's words as they stream in. A reply that was already settled when it mounted — a
 * reloaded conversation — is never touched: nothing is wrapped and nothing animates.
 */
export function useWordReveal(ref: RefObject<HTMLElement>, content: string, live: boolean): void {
  const seen = useRef<number | null>(null);
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (seen.current === null) seen.current = live ? 0 : Number.POSITIVE_INFINITY;
    if (!el || seen.current === Number.POSITIVE_INFINITY || reducedMotion()) return;
    seen.current = revealNewWords(el, seen.current);
  }, [content, live]);
}
