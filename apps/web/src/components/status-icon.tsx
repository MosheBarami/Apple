import { STATUS, type StatusName } from './status-icon-model';

export type { StatusName };

/**
 * The renderer for the canonical status marks.
 *
 * Thin on purpose and holding no vocabulary of its own — everything it can say lives in
 * `status-icon-model.ts`, which is where the tests are.
 */

export interface StatusIconProps {
  status: StatusName;
  size?: number;
  /** The accessible name. Omit for a mark that only repeats adjacent text — the
   *  common case, and the one the loose `✓` characters kept getting wrong. */
  label?: string;
}

export function StatusIcon({ status, size = 14, label }: StatusIconProps) {
  const spec = STATUS[status];
  const spin = 'spin' in spec && spec.spin;
  return (
    <svg
      className={`st st--${spec.tone}${spin ? ' st--spin' : ''}`}
      data-canonical={spec.canonical}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      // Decorative unless it is the only thing carrying the meaning.
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      <path d={spec.path} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
