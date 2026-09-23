// A SMALL BURST OF DOTS FROM A BUTTON THAT WAS JUST PRESSED.
//
// Animate UI "Icon Button" (MIT + Commons Clause, re-implemented): its ParticlesEffect throws a ring
// of neutral dots out of the control on click. Here it is a function rather than a wrapper
// component, because the one control that uses it (pinning a chat) is already a button with its own
// markup. The dots are drawn in the button's own ink, live in a fixed layer for 600ms, and are never
// created at all for a reader who asked for less motion.
import { canAnimate } from './motion';
import './particles.css';

export function burst(from: HTMLElement, count = 8): void {
  if (!canAnimate(from) || typeof document === 'undefined') return;
  const box = from.getBoundingClientRect();
  const layer = document.createElement('span');
  layer.className = 'pk-burst';
  layer.style.left = `${box.left + box.width / 2}px`;
  layer.style.top = `${box.top + box.height / 2}px`;
  layer.style.color = getComputedStyle(from).color;
  document.body.append(layer);
  const done: Promise<unknown>[] = [];
  for (let i = 0; i < count; i += 1) {
    const dot = document.createElement('i');
    layer.append(dot);
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const reach = 14 + Math.random() * 10;
    done.push(
      dot.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(angle) * reach}px), calc(-50% + ${Math.sin(angle) * reach}px)) scale(0)`, opacity: 0 },
        ],
        { duration: 520 + Math.random() * 120, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' },
      ).finished.catch(() => undefined),
    );
  }
  void Promise.all(done).then(() => layer.remove());
}
