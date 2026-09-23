// Motion "Fill text" (motion.dev/examples/js-loading-fill-text), re-implemented: the example is
// licensed LicenseRef-Motion-Plus, so none of its code is used. A headline drawn twice — once in a
// quiet colour, once in ink on top — with the ink copy revealed left to right (clip-path) over 3s,
// held, and run again.
//
// THE PERCENTAGE IS LEFT OUT ON PURPOSE. The example counts 0% -> 100% beside the word; nothing in
// this app knows how far a wait has got, and a number would be a claim about progress that is
// invented. The fill is a rhythm, like the Forge's steps: it says "alive", never "72% done".
//
// The resting frame is the fully inked word, so reduced motion shows a plain headline. The screen
// reader hears the word once: the ink copy is aria-hidden.
import type { ElementType } from 'react';
import './fill-text.css';

export function FillText({ children, as: Tag = 'p', className }: { children: string; as?: ElementType; className?: string }) {
  return (
    <Tag className={`picks-fill${className ? ` ${className}` : ''}`}>
      <span className="picks-fill__base">{children}</span>
      <span className="picks-fill__ink" aria-hidden="true">{children}</span>
    </Tag>
  );
}
