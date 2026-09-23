// ASKING BEFORE SOMETHING THAT CANNOT BE UNDONE, as one block.
//
// AI Elements "Confirmation" (Apache-2.0; not vendored — re-built here with the same parts and
// names: Confirmation (its title a prop), ConfirmationBody, ConfirmationActions, ConfirmationAction).
// Upstream draws it for a tool that is waiting for approval; here it is the product's own question
// before a destructive step. The block holds the warning and the two answers together, so the
// sentence that says what will be lost sits directly over the button that loses it — never a
// warning at the top of a dialog and a button somewhere below the fold.
//
// It is a `role="group"` named by its title, not an alert: the dialog around it already took
// focus, and an alert would read the warning twice.
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import './confirmation.css';

export function Confirmation({
  title,
  className,
  children,
  tone = 'warn',
}: {
  /** The sentence that says what will happen. It names the block for assistive technology. */
  title: ReactNode;
  className?: string;
  /** ConfirmationBody and ConfirmationActions. */
  children: ReactNode;
  /** `warn` for a loss the reader is choosing; `plain` for a question with nothing at stake. */
  tone?: 'warn' | 'plain';
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} data-tone={tone} className={`pk-confirm${className ? ` ${className}` : ''}`}>
      <div className="pk-confirm__title" id={id}>
        <svg className="pk-confirm__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <div className="pk-confirm__words">{title}</div>
      </div>
      {children}
    </div>
  );
}

export function ConfirmationBody({ children }: { children: ReactNode }) {
  return <div className="pk-confirm__body">{children}</div>;
}

export function ConfirmationActions({ children }: { children: ReactNode }) {
  return <div className="pk-confirm__actions">{children}</div>;
}

export function ConfirmationAction({
  variant = 'plain',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'plain' | 'primary' }) {
  return (
    <button
      type={type}
      className={`btn${variant === 'primary' ? ' btn-primary' : ''} pk-confirm__action${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
