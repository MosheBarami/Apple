// Inline SVG artwork. Everything uses currentColor or live theme tokens so the
// marks follow light/dark without a second asset.

export function GolemGlyph({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="28" height="28" rx="7" fill="var(--surface)" stroke="var(--line)" />
      <path d="M16 6.5l7.5 5v9l-7.5 5-7.5-5v-9z" stroke="var(--accent)" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M16 6.5v19M8.5 11.5l15 9M23.5 11.5l-15 9" stroke="var(--accent)" strokeWidth="0.8" opacity="0.4" />
      <circle cx="16" cy="16" r="2.5" fill="var(--accent)" />
    </svg>
  );
}

/** Small rune used for the agent avatar and live status. */
export function RunePulse({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="rune-pulse"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 1.5l5.5 3.5v6L8 14.5 2.5 11V5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function NavIcon({ d, size = 17 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const ICONS = {
  projects: 'M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  usage: 'M5 20V10m7 10V4m7 16v-7',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm8 3a8 8 0 0 0-.2-1.7l2-1.5-2-3.4-2.3 1a8 8 0 0 0-2.9-1.7L14.2 2h-4l-.4 2.4a8 8 0 0 0-2.9 1.7l-2.3-1-2 3.4 2 1.5A8 8 0 0 0 4 12c0 .6.1 1.1.2 1.7l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 2.9 1.7l.4 2.4h4l.4-2.4a8 8 0 0 0 2.9-1.7l2.3 1 2-3.4-2-1.5c.1-.6.2-1.1.2-1.7z',
  docs: 'M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm9 0v4h4M9 12h6M9 16h6',
  admin: 'M12 3l7 4v5c0 4.4-3 8-7 9-4-1-7-4.6-7-9V7z',
  lab: 'M9 3h6M10 3v6l-5 8.5A2 2 0 0 0 6.7 21h10.6a2 2 0 0 0 1.7-3.5L14 9V3',
  rail: 'M3 4h18v16H3zM15 4v16',
  surface: 'M3 4h18v16H3zM3 10h18',
  plus: 'M12 5v14M5 12h14',
} as const;

/** Empty-state mark for the project list. */
export function SummonIllustration() {
  return (
    <svg
      width="168"
      height="140"
      viewBox="0 0 180 150"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="90" cy="136" rx="52" ry="7" fill="var(--line)" opacity="0.55" />
      <rect x="58" y="62" width="64" height="58" rx="12" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.6" />
      <rect x="68" y="30" width="44" height="36" rx="10" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.6" />
      <circle cx="82" cy="48" r="3.4" fill="var(--accent)">
        <animate attributeName="opacity" values="1;0.35;1" dur="2.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="98" cy="48" r="3.4" fill="var(--accent)">
        <animate attributeName="opacity" values="1;0.35;1" dur="2.6s" begin="0.3s" repeatCount="indefinite" />
      </circle>
      <path d="M90 76l10 7v13l-10 7-10-7V83z" stroke="var(--acc-rune)" strokeWidth="1.8" strokeLinejoin="round" fill="none">
        <animate attributeName="opacity" values="0.55;1;0.55" dur="3.2s" repeatCount="indefinite" />
      </path>
      <circle cx="90" cy="90" r="2.4" fill="var(--acc-rune)" />
      <path d="M58 100h64" stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="4 6" opacity="0.6" />
      <rect x="40" y="70" width="15" height="33" rx="7" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.6" />
      <rect x="125" y="70" width="15" height="33" rx="7" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.6" />
      <circle cx="48" cy="52" r="1.9" fill="var(--accent)">
        <animate attributeName="cy" values="52;44;52" dur="3.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="134" cy="44" r="1.5" fill="var(--acc-rune)">
        <animate attributeName="cy" values="44;36;44" dur="4.1s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/** 404 mark. */
export function LostGolemIllustration() {
  return (
    <svg
      width="190"
      height="150"
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="100" cy="146" rx="60" ry="7" fill="var(--line)" opacity="0.55" />
      <g transform="rotate(-4 100 90)">
        <rect x="70" y="70" width="60" height="54" rx="12" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.6" />
        <rect x="78" y="38" width="44" height="36" rx="10" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.6" />
        <circle cx="92" cy="56" r="3.2" fill="var(--muted)" />
        <circle cx="108" cy="56" r="3.2" fill="var(--accent)">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <path
          d="M100 84l9 6v11l-9 6-9-6V90z"
          stroke="var(--muted)"
          strokeWidth="1.8"
          strokeLinejoin="round"
          fill="none"
          opacity="0.5"
        />
      </g>
      <g transform="rotate(9 152 100)">
        <rect x="138" y="86" width="30" height="24" rx="3" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.6" />
        <path d="M142 104l6-8 5 6 6-9 5 7" stroke="var(--acc-rune)" strokeWidth="1.5" fill="none" />
        <circle cx="160" cy="93" r="1.6" fill="var(--accent)" />
      </g>
      <text x="60" y="34" fill="var(--muted)" fontSize="18" fontFamily="var(--font-display)">
        ?
      </text>
      <text x="132" y="26" fill="var(--muted)" fontSize="13" fontFamily="var(--font-display)" opacity="0.7">
        ?
      </text>
    </svg>
  );
}

/** Marker for the "no renders yet" state on the work surface. */
export function CameraMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
      <rect x="3.5" y="9.5" width="33" height="23" rx="4" stroke="var(--line-strong)" strokeWidth="1.5" />
      <path d="M13 9.5l2.2-3.5h9.6L27 9.5" stroke="var(--line-strong)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="20" cy="21" r="6.5" stroke="var(--accent)" strokeWidth="1.5" />
      <circle cx="20" cy="21" r="2" fill="var(--accent)" opacity="0.55" />
    </svg>
  );
}
