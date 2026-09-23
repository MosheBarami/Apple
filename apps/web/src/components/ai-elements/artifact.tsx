// AI Elements `artifact`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE and ./LICENSE) is a card for one thing a
// run produced: a header with title, description and icon actions, over the content. The export
// names follow upstream so a reader who knows AI Elements can find their way; the code is written
// here, dependency-free, with this app's tokens — no Tailwind, no Radix Tooltip (an action's label
// is its accessible name and its native title).
//
// Where it is used: the Files drawer draws the file you opened as an Artifact (files-panel.tsx).
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from 'react';
import { cn } from './lib/utils';
import './artifact.css';

export type ArtifactProps = HTMLAttributes<HTMLElement>;
export const Artifact = ({ className, ...props }: ArtifactProps) => (
  <section className={cn('ai-artifact', className)} {...props} />
);

export const ArtifactHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-artifact__header', className)} {...props} />
);

export const ArtifactTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('ai-artifact__title', className)} {...props} />
);

export const ArtifactDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('ai-artifact__description', className)} {...props} />
);

export const ArtifactActions = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-artifact__actions', className)} {...props} />
);

export type ArtifactActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Upstream's tooltip. Here it is the visible label unless `iconOnly`, and always the name. */
  tooltip?: string;
  label?: string;
  iconOnly?: boolean;
};

export const ArtifactAction = forwardRef<HTMLButtonElement, ArtifactActionProps>(
  ({ className, tooltip, label, iconOnly = false, children, type = 'button', ...props }, ref) => {
    const name = label ?? tooltip;
    return (
      <button
        ref={ref}
        type={type}
        className={cn('ai-artifact__action', iconOnly && 'ai-artifact__action--icon', className)}
        aria-label={iconOnly ? name : undefined}
        title={tooltip}
        {...props}
      >
        {children}
        {!iconOnly && name && <span>{name}</span>}
      </button>
    );
  },
);
ArtifactAction.displayName = 'ArtifactAction';

export const ArtifactClose = ({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" className={cn('ai-artifact__close', className)} aria-label="Close" {...props}>
    {children ?? (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ width: 14, height: 14 }}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    )}
  </button>
);

export const ArtifactContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-artifact__content', className)} {...props} />
);
