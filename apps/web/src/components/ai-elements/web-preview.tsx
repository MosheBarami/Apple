// AI Elements `web-preview`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) is a small browser around a generated
// page: a navigation bar with back / forward buttons and an address field, over the page's body.
// Export names follow upstream; the code is written here. Upstream's body is an <iframe> and its
// address field is editable; here the body is whatever the caller puts in it and the address is
// read-only, because the thing being viewed is a picture Studio sent, not a page anyone can visit.
//
// Where it is used: the Playtest card (components/ws/playtest-card.tsx). Back and forward step
// through the pictures this playtest sent, the address says what the camera was pointed at, and
// the last button opens the picture larger.
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './lib/utils';
import '../picks/tech/tech-ui.css';
import './web-preview.css';

export type WebPreviewProps = HTMLAttributes<HTMLDivElement>;
export const WebPreview = ({ className, ...props }: WebPreviewProps) => (
  <div className={cn('ai-webpreview', className)} {...props} />
);

export const WebPreviewNavigation = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-webpreview__nav', className)} {...props} />
);

export interface WebPreviewNavigationButtonProps {
  /** The button's name. Shown as its tooltip too, since the button is only an icon. */
  tooltip: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}
export const WebPreviewNavigationButton = ({ tooltip, onClick, disabled, pressed, children }: WebPreviewNavigationButtonProps) => (
  <button
    type="button"
    className="tq-btn tq-btn--icon tq-btn--bare ai-webpreview__btn"
    aria-label={tooltip}
    title={tooltip}
    aria-pressed={pressed}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
);

export interface WebPreviewUrlProps {
  /** What the address field shows. */
  value: string;
  /** Its accessible name. */
  label?: string;
  /** A short note at the end of the field, e.g. "2 of 5". */
  hint?: string;
}
export const WebPreviewUrl = ({ value, label = 'Address', hint }: WebPreviewUrlProps) => (
  <span className="ai-webpreview__url">
    <input className="ai-webpreview__input" value={value} readOnly aria-label={label} title={value} />
    {hint && <span className="ai-webpreview__hint">{hint}</span>}
  </span>
);

export const WebPreviewBody = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-webpreview__body', className)} {...props} />
);
