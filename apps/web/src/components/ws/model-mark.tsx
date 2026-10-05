import { MARK_PATH } from '../glyphs';

/** The StudPilot mark as the assistant's signature: the same drawing as the rail glyph. */
export function ModelMark({ variant = 'apple', live = false }: { variant?: 'apple'; live?: boolean }) {
  return <span aria-hidden="true" className={`model-signature model-signature--${variant}${live ? ' is-live' : ''}`}>
    <svg viewBox="0 0 32 32" fill="currentColor" focusable="false">
      <path fillRule="evenodd" d={MARK_PATH} />
    </svg>
  </span>;
}
