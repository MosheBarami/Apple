// The empty conversation: what Apple is for, and three ways to start.
//
// Built from AI Elements' ConversationEmptyState (the sheet) and Suggestions/Suggestion (the
// seeds). The sheet is passed as children, so upstream's default "No messages yet" copy never
// renders; the region keeps its label and the `.start-sheet` class the workspace layout keys on
// (`.gx-thread:has(.start-sheet)`, `.gx-ws:has(.start-sheet) .gx-composer`).
import { ConversationEmptyState } from '../ai-elements/conversation';
import { Suggestion, Suggestions } from '../ai-elements/suggestion';
import { ModelMark } from './model-mark';
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
      {seeds.map((seed) => <Suggestion key={seed.prompt} suggestion={seed.prompt} onClick={onSeed}>
        <span>{seed.label}</span><span aria-hidden="true">↗</span>
      </Suggestion>)}
    </Suggestions>
  </ConversationEmptyState>;
}
