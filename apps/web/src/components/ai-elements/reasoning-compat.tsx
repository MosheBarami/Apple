// React 18 stand-ins that the vendored Reasoning component needs and that have no upstream file
// of their own: Radix's controllable-state hook (also used by ./chain-of-thought.tsx).
//
// Reasoning's two lucide icons used to be drawn here, by hand; they are now ./icons.tsx's, drawn
// from lucide's own geometry, so the reasoning header and the chain of thought under it show the
// same brain.
//
// The Collapsible that used to live here is now ./ui/collapsible.tsx (the local counterpart of
// upstream's `packages/shadcn-ui/components/ui/collapsible.tsx`), and `cn` is ./lib/utils.ts. Both
// are re-exported so reasoning.tsx keeps importing them from one place.
import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

export { cn } from './lib/utils';
export {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  type CollapsibleContentProps,
  type CollapsibleProps,
  type CollapsibleTriggerProps,
} from './ui/collapsible';

interface ControllableStateProps<T> {
  prop?: T;
  defaultProp?: T;
  onChange?: (value: T) => void;
}

/**
 * Small React 18-compatible stand-in for Radix's controllable-state hook.
 * Controlled values only notify; uncontrolled values are stored locally.
 */
export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: ControllableStateProps<T>): [T | undefined, Dispatch<SetStateAction<T | undefined>>] {
  const controlled = prop !== undefined;
  const [uncontrolled, setUncontrolled] = useState<T | undefined>(defaultProp);
  const value = controlled ? prop : uncontrolled;
  const valueRef = useRef(value);
  valueRef.current = value;

  const setValue = useCallback<Dispatch<SetStateAction<T | undefined>>>(
    (next) => {
      const nextValue =
        typeof next === 'function'
          ? (next as (previous: T | undefined) => T | undefined)(valueRef.current)
          : next;

      if (Object.is(nextValue, valueRef.current)) return;
      if (!controlled) {
        valueRef.current = nextValue;
        setUncontrolled(nextValue);
      }
      if (nextValue !== undefined) onChange?.(nextValue);
    },
    [controlled, onChange],
  );

  return [value, setValue];
}
