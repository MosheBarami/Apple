// The empty conversation: what Apple is for, and three ways to start.
//
// Built from AI Elements' ConversationEmptyState (the sheet) and Suggestions/Suggestion (the
// seeds), styled by upstream's own classes. The sheet is passed as children, so upstream's default
// "No messages yet" copy never renders; the region keeps its label and the `.start-sheet` class the
// workspace layout keys on (`.gx-thread:has(.start-sheet)`, `.gx-ws:has(.start-sheet) .gx-composer`).
//
// THE SEEDS ARRIVE ONE AFTER ANOTHER: each rises in (tw-animate's `animate-in`) staggered by its
// place in the row, and its arrow nudges toward the start when it is reached for
// (picks/chat/animated-icon). Both stop under reduced motion (`motion-reduce:`).
import { ArrowUpRightIcon } from 'lucide-react';
import { ConversationEmptyState } from '../ai-elements/conversation';
import { Suggestion, Suggestions } from '../ai-elements/suggestion';
import { ModelMark } from './model-mark';
import { AnimatedIcon } from '../picks/chat/animated-icon';

export function ChatWelcome({ seeds, onSeed }: {
  seeds: readonly { label: string; prompt: string }[];
  onSeed: (prompt: string) => void;
}) {
  return <ConversationEmptyState className="start-sheet" role="region" aria-labelledby="start-title">
    <div className="start-sheet__lead">
      <span className="start-sheet__identity"><ModelMark variant="apple" /></span>
      <h1 id="start-title">What do you want to build?</h1>
      <p>Describe the change. Apple will inspect the place, build it and verify the result.</p>
    </div>
    {/* The seeds wrap rather than scroll: the row is three short pills, and a scroll area's clip
        would cut the focus ring off the outer edge of each. */}
    <Suggestions className="w-full max-w-full flex-wrap justify-start whitespace-normal p-1">
      {seeds.map((seed, i) => <Suggestion
        key={seed.prompt}
        suggestion={seed.prompt}
        onClick={onSeed}
        aria-label={seed.label}
        className="h-9 gap-2 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-500 motion-reduce:animate-none"
        style={{ animationDelay: `${120 + i * 60}ms` }}
      >
        <span>{seed.label}</span>
        <AnimatedIcon motion="nudge">
          <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
        </AnimatedIcon>
      </Suggestion>)}
    </Suggestions>
  </ConversationEmptyState>;
}
