"use client";

import { useEffect } from "react";

/**
 * The page's two scripted effects, both small: the scroll reveal (an IntersectionObserver that adds
 * .is-in) and the slow parallax of the stud pattern (transforms on [data-parallax] only, in one rAF).
 * Neither runs when the visitor asks for reduced motion.
 */
export function LandingFx() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (reduce || !("IntersectionObserver" in window)) {
      for (const el of targets) {
        el.classList.add("is-in");
      }
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    for (const el of targets) {
      io.observe(el);
    }

    const layers = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    let frame = 0;
    const update = () => {
      frame = 0;
      for (const el of layers) {
        const speed = Number(el.dataset.parallax) || 0.1;
        const rect = el.parentElement?.getBoundingClientRect();
        if (rect && rect.bottom > -200 && rect.top < window.innerHeight + 200) {
          el.style.transform = `translate3d(0, ${(rect.top * -speed).toFixed(1)}px, 0)`;
        }
      }
    };
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };
    if (layers.length) {
      update();
      window.addEventListener("scroll", onScroll, { passive: true });
    }
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, []);
  return null;
}
