/** A folded sheet: three connected planes, drawn for Apple rather than a provider logo. */
export function ModelMark({ variant = 'max', live = false }: { variant?: 'apple' | 'max'; live?: boolean }) {
  return <span aria-hidden="true" className={`model-signature model-signature--${variant}${live ? ' is-live' : ''}`}>
    <svg viewBox="0 0 32 32" fill="none" focusable="false">
      <path d="M5 24 12 5 19 14 27 8 21 27 13 18Z" fill="currentColor" fillOpacity=".1" />
      <path d="m5 24 7-19 7 9 8-6-6 19-8-9-8 6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="m12 5 1 13 6-4 2 13" stroke="currentColor" strokeWidth="1.2" />
      {variant === 'max' && <path d="m8 24 5-3 8 9 5-17" stroke="currentColor" strokeWidth=".65" opacity=".55" />}
    </svg>
  </span>;
}
