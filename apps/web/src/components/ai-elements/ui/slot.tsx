// Local stand-in for Radix's `Slot`, which the shadcn primitives use for `asChild`.
//
// `asChild` means "do not render your own element; give your props to my one child instead". The
// merge follows Radix: the child's own props win, except that event handlers run BOTH (the child's
// first), class names concatenate and styles merge. The ref is composed rather than replaced,
// because under React 18 a ref passed to a function component is dropped unless something forwards
// it — which is exactly how tooltips and popovers lose their anchor.
import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type CSSProperties,
  type HTMLAttributes,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { cn } from '../lib/utils';

type AnyProps = Record<string, unknown>;

export function composeRefs<T>(...refs: Array<Ref<T> | undefined>): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else (ref as MutableRefObject<T | null>).current = node;
    }
  };
}

function mergeProps(slotProps: AnyProps, childProps: AnyProps): AnyProps {
  const merged: AnyProps = { ...slotProps, ...childProps };
  for (const name of Object.keys(slotProps)) {
    const slotValue = slotProps[name];
    const childValue = childProps[name];
    if (/^on[A-Z]/.test(name) && typeof slotValue === 'function' && typeof childValue === 'function') {
      merged[name] = (...args: unknown[]) => {
        const result = (childValue as (...a: unknown[]) => unknown)(...args);
        (slotValue as (...a: unknown[]) => unknown)(...args);
        return result;
      };
    } else if (name === 'style') {
      merged.style = { ...(slotValue as CSSProperties), ...(childValue as CSSProperties) };
    } else if (name === 'className') {
      merged.className = cn(slotValue as string, childValue as string);
    }
  }
  return merged;
}

export type SlotProps = HTMLAttributes<HTMLElement> & { children?: ReactNode };

export const Slot = forwardRef<HTMLElement, SlotProps>(function Slot({ children, ...slotProps }, forwardedRef) {
  const child = Children.only(children);
  if (!isValidElement(child)) return null;
  const element = child as ReactElement<AnyProps> & { ref?: Ref<HTMLElement> };
  return cloneElement(element, {
    ...mergeProps(slotProps as AnyProps, element.props),
    ref: composeRefs(forwardedRef, element.ref),
  });
});
