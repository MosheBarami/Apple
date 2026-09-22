// Adapted from AI Elements `packages/shadcn-ui/components/ui/button.tsx` at the pinned commit (see
// ../NOTICE). Same exports, same variant names and the same inert Tailwind strings; the local
// substitutions are:
//   * `radix-ui` Slot            -> ./slot (asChild)
//   * `class-variance-authority` -> ../lib/cva
//   * a plain function component -> forwardRef, because React 18 drops a ref handed to a function
//     component, and Tooltip/HoverCard triggers anchor to this button through `asChild`.
// Each variant also carries an `ai-button--*` class, which ./ui.css styles with the app's tokens.
import * as React from 'react';
import { Slot } from './slot';
import { cva, type VariantProps } from '../lib/cva';
import { cn } from '../lib/utils';
import './ui.css';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive ai-button",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 ai-button--default',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 ai-button--destructive',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 ai-button--outline',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 ai-button--secondary',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 ai-button--ghost',
        link: 'text-primary underline-offset-4 hover:underline ai-button--link',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3 ai-button--size-default',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 ai-button--sm',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4 ai-button--lg',
        icon: 'size-9 ai-button--icon',
        'icon-sm': 'size-8 ai-button--icon-sm',
        'icon-lg': 'size-10 ai-button--icon-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ButtonProps = React.ComponentPropsWithoutRef<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref as React.Ref<HTMLButtonElement & HTMLElement>}
      {...props}
    />
  );
});

export { Button, buttonVariants };
