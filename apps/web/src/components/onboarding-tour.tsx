// The tour — the RENDERER. Which step, and whether there is one at all, is decided in
// lib/onboarding.ts; this file only finds the element, measures it, and draws beside it.
//
// The single rule that shapes this component: IT NEVER DRAWS WITHOUT AN ELEMENT IN HAND. The model
// withholds a step whose anchor is not in the document, and this re-checks by querying for the
// element itself — because between the model's decision and the paint, a route can unmount. A card
// explaining a button that is not on screen is worse than no tour: it is the product confidently
// describing something that is not there.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isTypingTarget } from '../lib/shortcuts';
import './onboarding-tour.css';
// The owner's picked onboarding components (./picks/settings).
import { StepDots, StepSlide } from './picks/settings/stepper';
import './picks/settings/pop-in.css';
import {
  TOUR_STEPS,
  dismissTour,
  markSeen,
  nextTourStep,
  readProgress,
  writeProgress,
  type TourProgress,
} from '../lib/onboarding';

/** How often the document is re-scanned for anchors while the tour still has something to say. */
const SCAN_MS = 900;

function scanAnchors(): string[] {
  if (typeof document === 'undefined') return [];
  return Array.from(document.querySelectorAll('[data-tour]'))
    .map((el) => el.getAttribute('data-tour'))
    .filter((a): a is string => Boolean(a));
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// The tour is portalled out of #root, so root.inert cannot hide it when a modal
// opens. Suspend it without marking any step seen; the modal owns focus and Escape.
const modalIsOpen = () => typeof document !== 'undefined'
  && document.querySelector('.modal-overlay, [role="dialog"][aria-modal="true"]') !== null;

export function OnboardingTour({ done }: { done: Record<string, unknown> }) {
  const [progress, setProgress] = useState<TourProgress>(readProgress);
  const [anchors, setAnchors] = useState<string[]>(scanAnchors);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [modalOpen, setModalOpen] = useState(modalIsOpen);

  const step = nextTourStep(progress, { anchors, done });
  const anchor = step?.anchor ?? null;

  // Anchors come and go with routes and with the data behind them, so the set is polled rather than
  // captured once. `step === null` is NOT the end of the tour — a step whose anchor is on another
  // screen is withheld, not finished, and the poll is what notices when the user arrives there. It
  // stops only when there is genuinely nothing left, because an interval behind a finished tour is
  // a cost every user pays for the rest of their account's life.
  const over = progress.dismissed || TOUR_STEPS.every((s) => progress.seen.includes(s.id));
  useEffect(() => {
    if (over) return;
    const syncModal = () => setModalOpen(modalIsOpen());
    syncModal();
    const observer = new MutationObserver(syncModal);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
    return () => observer.disconnect();
  }, [over]);
  useEffect(() => {
    if (over) return;
    const scan = () => setAnchors((prev) => {
      const found = scanAnchors();
      return same(prev, found) ? prev : found;
    });
    scan();
    const timer = window.setInterval(scan, SCAN_MS);
    return () => window.clearInterval(timer);
  }, [over]);

  // Measured from the real element, and re-measured on anything that can move it. `null` means the
  // element vanished between the decision and now, and null renders nothing at all.
  useEffect(() => {
    if (!anchor) {
      setBox(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(`[data-tour="${anchor}"]`);
      if (!el) {
        setBox(null);
        return;
      }
      const r = el.getBoundingClientRect();
      // A zero-sized box is an element that is in the DOM and not on the screen — a collapsed rail,
      // a `display: none` branch. Pointing at it puts the card in the top-left corner.
      if (r.width === 0 || r.height === 0) {
        setBox(null);
        return;
      }
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const timer = window.setInterval(measure, SCAN_MS);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.clearInterval(timer);
    };
  }, [anchor]);

  const advance = useCallback(() => {
    if (!step) return;
    setProgress((prev) => {
      const next = markSeen(prev, step.id);
      writeProgress(next);
      return next;
    });
  }, [step]);

  const skip = useCallback(() => {
    setProgress((prev) => {
      const next = dismissTour(prev);
      writeProgress(next);
      return next;
    });
  }, []);

  // Escape means "get me out of here" here as everywhere else — but a modal that is open owns
  // Escape first, and dismissing the tour underneath someone closing a dialog is a keystroke doing
  // two things at once.
  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modalIsOpen()) return;
      skip();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, skip]);

  /**
   * Focus the card — UNLESS THE USER IS TYPING.
   *
   * This is the detail that decides whether a tour is help or sabotage. The composer step appears
   * the moment a composer is on screen, and that is frequently the moment someone is halfway
   * through a sentence. A card that grabs focus then eats the rest of the sentence, and the user
   * has no idea where it went. A screen-reader user still needs to be told the card exists, so it
   * is focused in every case where nothing is being typed into.
   */
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!step || !box) return;
    if (modalIsOpen()) return;
    if (isTypingTarget(document.activeElement)) return;
    cardRef.current?.focus();
    // The boolean is the mount edge of the portalled card. Depending on the measured box object
    // itself would re-focus the tour every 900ms and sabotage someone who moved on to the product.
  }, [step?.id, box !== null]);

  if (!step || !box || modalOpen) return null;

  const index = TOUR_STEPS.findIndex((s) => s.id === step.id);
  const last = index === TOUR_STEPS.length - 1;

  // Below the anchor when there is room, above it when there is not, and never off either edge.
  const CARD = 300;
  const GAP = 12;
  const below = box.top + box.height + GAP;
  const viewportH = typeof window === 'undefined' ? 800 : window.innerHeight;
  const viewportW = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const flip = below + 220 > viewportH && box.top > 240;
  const left = Math.max(GAP, Math.min(box.left, viewportW - CARD - GAP));

  return createPortal(
    <>
      <div
        className="tour-ring"
        aria-hidden="true"
        style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }}
      />
      <div
        ref={cardRef}
        // pk-pop: the card arrives like a small reward (picks: Motion "Pokopia: Modal").
        className={`tour-card pk-pop${flip ? ' is-above' : ''}`}
        role="dialog"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        // Focusable so it can be announced, and NOT modal: the tour explains things the user can
        // touch while it is open, and a tour you have to dismiss to use the product is a tour
        // people dismiss.
        aria-modal={false}
        tabIndex={-1}
        style={flip ? { bottom: Math.max(GAP, viewportH - box.top + GAP), left } : { top: Math.max(GAP, Math.min(below, viewportH - 232)), left }}
      >
        {/* Picks: React Bits "Stepper" — dots that fill as the tour goes, and each step's words
            slide in from the side of travel. The sentence stays for anyone not reading dots. */}
        <div className="tour-progress">
          <StepDots count={TOUR_STEPS.length} current={index} label="Tour progress" />
          <p className="tour-step">
            Step {index + 1} of {TOUR_STEPS.length}
          </p>
        </div>
        <StepSlide stepKey={step.id} index={index}>
          <h2 className="tour-title" id="tour-title">
            {step.title}
          </h2>
          <p className="tour-body" id="tour-body">
            {step.body}
          </p>
        </StepSlide>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={skip}>
            Skip the tour
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={advance}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </>, document.body
  );
}
