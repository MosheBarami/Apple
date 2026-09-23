// AI Elements `environment-variables`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) lists named secrets: a header with a
// title and a show / hide switch, then one row per variable with its name, a masked value, a
// "required" badge and a copy button. Export names follow upstream; the code is written here.
//
// ONE DELIBERATE DIFFERENCE: THERE IS NO "SHOW". Upstream can reveal every value. The rows here are
// share links, and a share link's token is a bearer credential; a screenshot of the panel must not
// be one. So a row never receives the secret at all — only the short preview the caller already
// cut (lib/share-links.ts `tokenPreview`) — and the copy button asks the caller to copy, so the
// whole link goes to the clipboard without ever being drawn.
//
// Where it is used: the "Share links" list in the members panel (components/ws/members-panel.tsx).
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './lib/utils';
import { CopyIcon } from '../picks/tech/icons';
import '../picks/tech/tech-ui.css';
import './environment-variables.css';

export const EnvironmentVariables = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-env', className)} {...props} />
);

export const EnvironmentVariablesHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-env__header', className)} {...props} />
);

export const EnvironmentVariablesTitle = ({ children, count }: { children: ReactNode; count?: number }) => (
  <span className="ai-env__title">
    {children}
    {count !== undefined && <span className="ai-env__count">{count}</span>}
  </span>
);

export const EnvironmentVariablesContent = ({ className, ...props }: HTMLAttributes<HTMLUListElement>) => (
  <ul className={cn('ai-env__list', className)} role="list" {...props} />
);

export type EnvironmentVariableProps = HTMLAttributes<HTMLLIElement> & {
  /** False for a link that no longer opens anything: the row is drawn quieter. */
  live?: boolean;
};
export const EnvironmentVariable = ({ live = true, className, ...props }: EnvironmentVariableProps) => (
  <li className={cn('ai-env__row', !live && 'is-inactive', className)} {...props} />
);

export const EnvironmentVariableGroup = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-env__group', className)} {...props} />
);

export const EnvironmentVariableName = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-env__name', className)} {...props} />
);

/** The masked value: the preview the caller cut, then dots standing for the rest. */
export const EnvironmentVariableValue = ({ preview }: { preview: string }) => (
  <span className="ai-env__value tq-mono">
    {preview.replace(/…$/, '')}
    <span className="ai-env__mask" aria-hidden="true">••••••••</span>
    <span className="tq-sr">and the rest hidden</span>
  </span>
);

/** A short badge beside the name — upstream's "Required", used here for the link's state. */
export const EnvironmentVariableRequired = ({ children }: { children: ReactNode }) => (
  <span className="ai-env__badge">{children}</span>
);

export const EnvironmentVariableActions = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-env__actions', className)} {...props} />
);

export const EnvironmentVariableCopyButton = ({ onCopy, children }: { onCopy: () => void; children: ReactNode }) => (
  <button type="button" className="tq-btn ai-env__copy" onClick={onCopy}>
    <CopyIcon size={13} />
    {children}
  </button>
);

/** The quiet line under the name: role, scope, expiry. */
export const EnvironmentVariableNote = ({ children }: { children: ReactNode }) => (
  <span className="ai-env__meta">{children}</span>
);
