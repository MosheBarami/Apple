// The empty conversation: what Apple is for, and three ways to start.
//
// Built from AI Elements' ConversationEmptyState (the sheet) and Suggestions/Suggestion (the
// seeds). The sheet is passed as children, so upstream's default "No messages yet" copy never
// renders; the region keeps its label and the `.start-sheet` class the workspace layout keys on
// (`.gx-thread:has(.start-sheet)`, `.gx-ws:has(.start-sheet) .gx-composer`).
//
// THE SEEDS ARRIVE ONE AFTER ANOTHER (the Suggestion pick, given the chat's entrance): each is
// staggered by its place in the row, and its arrow nudges toward the start when it is reached for
// (picks/chat/animated-icon). chat-welcome.css holds both, and both stop under reduced motion.
import { ConversationEmptyState } from '../ai-elements/conversation';
import { Suggestion, Suggestions } from '../ai-elements/suggestion';
import { ModelMark } from './model-mark';
import { AnimatedIcon } from '../picks/chat/animated-icon';
import type { CSSProperties } from 'react';
import './chat-welcome.css';

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
    <Suggestions className="start-sheet__ideas">
      {seeds.map((seed, i) => <Suggestion key={seed.prompt} suggestion={seed.prompt} onClick={onSeed} style={{ '--i': i } as CSSProperties}>
        <span>{seed.label}</span>
        <AnimatedIcon motion="nudge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17 17 7" /><path d="M7 7h10v10" />
          </svg>
        </AnimatedIcon>
      </Suggestion>)}
    </Suggestions>
  </ConversationEmptyState>;
}
