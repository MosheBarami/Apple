// Adapted from AI Elements `packages/shadcn-ui/components/ui/badge.tsx` at the pinned commit (see
// ../NOTICE). Same exports, same variant names and the same inert Tailwind strings; the local
// substitutions are:
//   * `radix-ui` Slot            -> ./slot (asChild)
//   * `class-variance-authority` -> ../lib/cva
//   * a plain function component -> forwardRef, because React 18 drops a ref handed to a function
//     component, and a HoverCard trigger anchors to a Badge through `asChild` upstream.
// Each variant also carries an `ai-badge--*` class, which ./ui.css styles with the app's tokens.
import * as React from "react"
import { Slot } from "./slot"
import { cva, type VariantProps } from "../lib/cva"

import { cn } from "../lib/utils"
import "./ui.css"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden ai-badge",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90 ai-badge--default",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 ai-badge--secondary",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 ai-badge--destructive",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground ai-badge--outline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export type BadgeProps = React.ComponentPropsWithoutRef<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant, asChild = false, ...props },
  ref
) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      ref={ref as React.Ref<HTMLSpanElement & HTMLElement>}
      {...props}
    />
  )
})

export { Badge, badgeVariants }
