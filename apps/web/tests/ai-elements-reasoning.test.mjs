import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, 'src', 'components', 'ai-elements');
const REASONING = readFileSync(join(ROOT, 'reasoning.tsx'), 'utf8');
const COMPAT = readFileSync(join(ROOT, 'reasoning-compat.tsx'), 'utf8');
// The Collapsible moved out of reasoning-compat.tsx into ui/collapsible.tsx (the local counterpart
// of upstream's shadcn primitive); reasoning-compat re-exports it, so Reasoning's imports are as
// they were. Its disclosure semantics are asserted where they now live.
const COLLAPSIBLE = readFileSync(join(ROOT, 'ui', 'collapsible.tsx'), 'utf8');
const CSS = readFileSync(join(ROOT, 'reasoning.css'), 'utf8');
const NOTICE = readFileSync(join(ROOT, 'NOTICE'), 'utf8');
const LICENSE = readFileSync(join(ROOT, 'LICENSE'), 'utf8');

test('vendored Reasoning identifies the exact Apache-2.0 upstream revision', () => {
  assert.match(NOTICE, /vercel\/ai-elements/);
  assert.match(NOTICE, /6a9d5b1822ffb10bba4bd97175f01edd7d8651cd/);
  assert.match(NOTICE, /f138cddde35854f73632ff51d48230f8d6e16e0a49a74b44a93b51993a65550e/);
  assert.match(NOTICE, /Copyright 2023 Vercel, Inc\./);
  assert.match(LICENSE, /Copyright 2023 Vercel, Inc\./);
  assert.match(LICENSE, /Apache License, Version 2\.0/);
  assert.match(LICENSE, /http:\/\/www\.apache\.org\/licenses\/LICENSE-2\.0/);
});

test('the public Reasoning API remains composable and dependency-local', () => {
  for (const name of ['Reasoning', 'ReasoningTrigger', 'ReasoningContent', 'useReasoning']) {
    assert.match(REASONING, new RegExp(`export (?:const|type )?${name}\\b|export const ${name}\\b`), `${name} is not exported`);
  }
  assert.match(REASONING, /export type ReasoningProps = ComponentProps<typeof Collapsible>/);
  assert.match(REASONING, /export type ReasoningTriggerProps = ComponentProps<\s*typeof CollapsibleTrigger\s*>/);
  assert.match(REASONING, /export type ReasoningContentProps = ComponentProps<\s*typeof CollapsibleContent\s*>/);
  //[[ RESTATED 2026-09-22 (A2). Upstream's `children: string` is the model's reasoning text, which
  //   this product never has. ReasoningContent now takes React nodes and renders them as they are,
  //   and a string still takes upstream's markdown path — so the upstream contract survives and the
  //   workspace can fill the disclosure with observed-activity components (NOTICE, reasoning.tsx). ]]
  assert.match(REASONING, /export type ReasoningContentProps = ComponentProps<\s*typeof CollapsibleContent\s*> & \{\s*children: ReactNode;/);
  assert.match(REASONING, /typeof children === 'string' \? <Markdown source=\{children\} \/> : children/,
    'a string must still render through markdown, as upstream renders it through Streamdown');
  assert.doesNotMatch(REASONING, /from ['"](?:@radix-ui|@repo\/shadcn-ui|streamdown|lucide-react|motion\/react)/);
  assert.doesNotMatch(COMPAT, /from ['"](?:@radix-ui|@repo\/shadcn-ui|streamdown|lucide-react|motion\/react)/);
  assert.doesNotMatch(COLLAPSIBLE, /from ['"](?:@radix-ui|radix-ui|@repo\/shadcn-ui)/);
  assert.match(COMPAT, /export \{[\s\S]*?\bCollapsible\b[\s\S]*?\} from '\.\/ui\/collapsible'/, 'reasoning-compat still supplies the Collapsible Reasoning imports');
});

test('streaming owns the initial open state and explicit defaultOpen=false opts out of auto-open', () => {
  assert.match(REASONING, /const resolvedDefaultOpen = defaultOpen \?\? isStreaming/);
  assert.match(REASONING, /const isExplicitlyClosed = defaultOpen === false/);
  assert.match(
    REASONING,
    /if \(isStreaming && !isOpen && !isExplicitlyClosed\) \{\s*setIsOpen\(true\)/,
  );
});

test('completion measures whole-second duration and auto-closes once after the upstream delay', () => {
  assert.match(REASONING, /const AUTO_CLOSE_DELAY = 1000/);
  assert.match(REASONING, /const MS_IN_S = 1000/);
  assert.match(REASONING, /startTimeRef\.current = Date\.now\(\)/);
  assert.match(
    REASONING,
    /setDuration\(Math\.ceil\(\(Date\.now\(\) - startTimeRef\.current\) \/ MS_IN_S\)\)/,
  );
  assert.match(REASONING, /hasEverStreamedRef\.current &&\s*!isStreaming &&\s*isOpen &&\s*!hasAutoClosed/);
  assert.match(REASONING, /setTimeout\(\(\) => \{\s*setIsOpen\(false\);\s*setHasAutoClosed\(true\);\s*\}, AUTO_CLOSE_DELAY\)/);
});

test('manual disclosure remains accessible and duration copy matches upstream fallbacks', () => {
  assert.match(COLLAPSIBLE, /'aria-expanded': context\.open/);
  assert.match(COLLAPSIBLE, /context\.setOpen\(!context\.open\)/);
  assert.match(REASONING, /if \(isStreaming \|\| duration === 0\)/);
  assert.match(REASONING, /Thought for a few seconds/);
  assert.match(REASONING, /Thought for \{duration\} seconds/);
});

test('local styles replace Tailwind mechanics without changing the component contract', () => {
  assert.match(REASONING, /import '\.\/reasoning\.css'/);
  assert.match(CSS, /\.ai-reasoning__trigger/);
  assert.match(CSS, /\.ai-reasoning__content/);
  assert.match(CSS, /\.ai-elements-shimmer/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
});

test('the trigger names its content only while that content is in the DOM', () => {
  // aria-controls pointing at an id that is not there sends assistive technology nowhere, and the
  // workspace's Thinking card used to mount no CollapsibleContent — so an unconditional id was a
  // dangling reference on every run. The id is named only while a content element has mounted.
  //[[ RESTATED 2026-09-22 (A2). The mounted content now REGISTERS ITS OWN ID (a caller may pass one,
  //   as Radix allows — ChainOfThought's header and content sit in two Collapsibles and are linked
  //   that way), so the trigger names exactly the id that is in the DOM. The property is unchanged:
  //   the trigger never names the generated id on its own, only what a mounted content registered
  //   (or what the caller explicitly linked). Measured in a browser on the Thinking card: closed,
  //   no aria-controls; open, aria-controls names the collapsible-content element. ]]
  const trigger = COLLAPSIBLE.slice(COLLAPSIBLE.indexOf('export const CollapsibleTrigger'), COLLAPSIBLE.indexOf('export type CollapsibleContentProps'));
  assert.ok(trigger.length > 200, 'the trigger source was not found');
  assert.match(trigger, /'aria-controls': controls \?\? context\.mountedContentId \?\? undefined/);
  assert.doesNotMatch(trigger, /context\.contentId/, 'the trigger must not name the generated id unless a content registered it');
  const content = COLLAPSIBLE.slice(COLLAPSIBLE.indexOf('export function CollapsibleContent'));
  assert.match(content, /const id = idProp \?\? context\.contentId/);
  assert.match(content, /setMountedContentId\(id\);\s*return \(\) => setMountedContentId\(null\)/, 'mounting registers the id, and unmounting takes it back');
  assert.match(content, /\bid,\n/, 'and the content carries the very id it registered');
});
