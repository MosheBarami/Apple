// AI Elements `commit`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) draws one git commit: an author avatar,
// the message, a short hash, a relative timestamp and actions, with an optional file list. Export
// names follow upstream; the code is written here, dependency-free.
//
// Where it is used: each saved version of a file in the Files drawer is drawn as a Commit — the
// version number in the hash slot, when it was saved, its size, and Compare / Put back as the
// actions (files-panel.tsx). The store records no author, so no author is drawn.
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './lib/utils';
import './commit.css';

export type CommitProps = HTMLAttributes<HTMLDivElement> & { current?: boolean };
export const Commit = ({ className, current = false, ...props }: CommitProps) => (
  <div className={cn('ai-commit', current && 'is-current', className)} {...props} />
);

export const CommitHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-commit__header', className)} {...props} />
);

/** The dot on the history rail. Upstream's avatar slot; here it marks the current version. */
export const CommitAuthorAvatar = ({ initials, className }: { initials?: string; className?: string }) => (
  <span className={cn('ai-commit__avatar', className)} aria-hidden="true">{initials}</span>
);

export const CommitInfo = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-commit__info', className)} {...props} />
);

export const CommitMessage = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-commit__message', className)} {...props} />
);

export const CommitMetadata = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-commit__meta', className)} {...props} />
);

export const CommitHash = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-commit__hash', className)} {...props} />
);

export const CommitSeparator = ({ children = '·' }: { children?: ReactNode }) => (
  <span className="ai-commit__sep" aria-hidden="true">{children}</span>
);

export const CommitTimestamp = ({ date, children, className }: { date: Date; children?: ReactNode; className?: string }) => (
  <time className={cn('ai-commit__time', className)} dateTime={date.toISOString()} title={date.toLocaleString()}>
    {children ?? date.toLocaleString()}
  </time>
);

export const CommitActions = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-commit__actions', className)} {...props} />
);
