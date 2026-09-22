// Adapted from AI Elements `packages/elements/src/model-selector.tsx` at the pinned commit (see
// ./NOTICE, row "FILE model-selector.tsx"). Every export, its props and the inert Tailwind strings are
// upstream's; an `ai-model-selector…` class sits beside each upstream class string for
// ./model-selector.css. The one change of substance is the logo, and the NOTICE row says why:
// upstream hot-links `https://models.dev/logos/{provider}.svg` into an <img>, and this app loads no
// third-party image at run time. ModelSelectorLogo draws a vendored lobehub mark as a React <svg> in
// currentColor instead, and a provider with no vendored mark gets its initial in a neutral disc —
// never a logo somebody drew for the occasion.
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./ui/command";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { cn } from "./lib/utils";
import type { ComponentProps, ReactNode } from "react";
import { LOGO_MARKS } from "./logos/marks";
import "./model-selector.css";

export type ModelSelectorProps = ComponentProps<typeof Dialog>;

export const ModelSelector = (props: ModelSelectorProps) => (
  <Dialog {...props} />
);

export type ModelSelectorTriggerProps = ComponentProps<typeof DialogTrigger>;

export const ModelSelectorTrigger = (props: ModelSelectorTriggerProps) => (
  <DialogTrigger {...props} />
);

export type ModelSelectorContentProps = ComponentProps<typeof DialogContent> & {
  title?: ReactNode;
};

export const ModelSelectorContent = ({
  className,
  children,
  title = "Model Selector",
  ...props
}: ModelSelectorContentProps) => (
  <DialogContent
    aria-describedby={undefined}
    className={cn(
      "outline! border-none! p-0 outline-border! outline-solid! ai-model-selector",
      className
    )}
    {...props}
  >
    <DialogTitle className="sr-only ai-model-selector__title">{title}</DialogTitle>
    <Command className="**:data-[slot=command-input-wrapper]:h-auto ai-model-selector__command">
      {children}
    </Command>
  </DialogContent>
);

export type ModelSelectorDialogProps = ComponentProps<typeof CommandDialog>;

export const ModelSelectorDialog = (props: ModelSelectorDialogProps) => (
  <CommandDialog {...props} />
);

export type ModelSelectorInputProps = ComponentProps<typeof CommandInput>;

export const ModelSelectorInput = ({
  className,
  ...props
}: ModelSelectorInputProps) => (
  <CommandInput className={cn("h-auto py-3.5 ai-model-selector__input", className)} {...props} />
);

export type ModelSelectorListProps = ComponentProps<typeof CommandList>;

export const ModelSelectorList = (props: ModelSelectorListProps) => (
  <CommandList {...props} />
);

export type ModelSelectorEmptyProps = ComponentProps<typeof CommandEmpty>;

export const ModelSelectorEmpty = (props: ModelSelectorEmptyProps) => (
  <CommandEmpty {...props} />
);

export type ModelSelectorGroupProps = ComponentProps<typeof CommandGroup>;

export const ModelSelectorGroup = (props: ModelSelectorGroupProps) => (
  <CommandGroup {...props} />
);

export type ModelSelectorItemProps = ComponentProps<typeof CommandItem>;

export const ModelSelectorItem = (props: ModelSelectorItemProps) => (
  <CommandItem {...props} />
);

export type ModelSelectorShortcutProps = ComponentProps<typeof CommandShortcut>;

export const ModelSelectorShortcut = (props: ModelSelectorShortcutProps) => (
  <CommandShortcut {...props} />
);

export type ModelSelectorSeparatorProps = ComponentProps<
  typeof CommandSeparator
>;

export const ModelSelectorSeparator = (props: ModelSelectorSeparatorProps) => (
  <CommandSeparator {...props} />
);

/**
 * LOGO: upstream's `provider` union names models.dev's slugs, and its <img> fetched each one from
 * models.dev. Here `provider` names a vendored mark in ./logos (LOGO_MARKS), and `label` is the
 * provider's name, used as the accessible name and, for a provider with no vendored mark, as the
 * initial in the disc. The props are a <span>'s rather than an <img>'s, because nothing is fetched.
 */
export type ModelSelectorLogoProps = Omit<
  ComponentProps<"span">,
  "children"
> & {
  provider: string;
  label?: string;
};

export const ModelSelectorLogo = ({
  provider,
  label,
  className,
  ...props
}: ModelSelectorLogoProps) => {
  const mark = LOGO_MARKS[provider];
  const name = label ?? mark?.title ?? provider;
  return (
    <span
      {...props}
      role="img"
      aria-label={`${name} logo`}
      className={cn("size-3 dark:invert ai-model-selector__logo", mark ? undefined : "ai-model-selector__logo--initial", className)}
    >
      {mark ? (
        <svg viewBox={mark.viewBox} width="1em" height="1em" fill="currentColor" fillRule="evenodd" aria-hidden="true" focusable="false">
          <path d={mark.d} />
        </svg>
      ) : (
        <span aria-hidden="true">{(name.trim()[0] ?? "?").toUpperCase()}</span>
      )}
    </span>
  );
};

export type ModelSelectorLogoGroupProps = ComponentProps<"div">;

export const ModelSelectorLogoGroup = ({
  className,
  ...props
}: ModelSelectorLogoGroupProps) => (
  <div
    className={cn(
      "flex shrink-0 items-center -space-x-1 [&>img]:rounded-full [&>img]:bg-background [&>img]:p-px [&>img]:ring-1 dark:[&>img]:bg-foreground ai-model-selector__logo-group",
      className
    )}
    {...props}
  />
);

export type ModelSelectorNameProps = ComponentProps<"span">;

export const ModelSelectorName = ({
  className,
  ...props
}: ModelSelectorNameProps) => (
  <span className={cn("flex-1 truncate text-left ai-model-selector__name", className)} {...props} />
);
