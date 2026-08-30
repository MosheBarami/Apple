// Inline SVG artwork: golem rune glyph, empty-state and 404 illustrations.
// All strokes use currentColor or CSS vars so they follow the theme.

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
      <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--surface, #121826)" stroke="var(--line, #232D3F)" />
      <path d="M16 6.5l7.5 5v9l-7.5 5-7.5-5v-9z" stroke="var(--amber, #FFB454)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16 6.5v19M8.5 11.5l15 9M23.5 11.5l-15 9" stroke="var(--amber, #FFB454)" strokeWidth="0.9" opacity="0.45" />
      <circle cx="16" cy="16" r="2.6" fill="var(--amber, #FFB454)" />
    </svg>
  );
}

/** Small animated rune used in the agent status line. */
export function RunePulse({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="rune-pulse" aria-hidden="true" focusable="false">
      <path d="M8 1.5l5.5 3.5v6L8 14.5 2.5 11V5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** Friendly golem for the "summon your first project" empty state. */
export function SummonIllustration() {
  return (
    <svg width="180" height="150" viewBox="0 0 180 150" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      {/* pedestal */}
      <ellipse cx="90" cy="136" rx="52" ry="8" fill="var(--line)" opacity="0.5" />
      {/* body */}
      <rect x="58" y="62" width="64" height="58" rx="14" fill="var(--raised)" stroke="var(--line)" strokeWidth="2" />
      {/* head */}
      <rect x="68" y="30" width="44" height="36" rx="12" fill="var(--raised)" stroke="var(--line)" strokeWidth="2" />
      {/* eyes */}
      <circle cx="82" cy="48" r="4" fill="var(--amber)">
        <animate attributeName="opacity" values="1;0.35;1" dur="2.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="98" cy="48" r="4" fill="var(--amber)">
        <animate attributeName="opacity" values="1;0.35;1" dur="2.6s" begin="0.3s" repeatCount="indefinite" />
      </circle>
      {/* chest rune */}
      <path d="M90 76l10 7v13l-10 7-10-7V83z" stroke="var(--violet)" strokeWidth="2" strokeLinejoin="round" fill="none">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="3.2s" repeatCount="indefinite" />
      </path>
      <circle cx="90" cy="90" r="2.6" fill="var(--violet)" />
      {/* molten seam */}
      <path d="M58 100h64" stroke="var(--amber)" strokeWidth="1.4" strokeDasharray="4 6" opacity="0.65" />
      {/* arms */}
      <rect x="40" y="70" width="16" height="34" rx="8" fill="var(--raised)" stroke="var(--line)" strokeWidth="2" />
      <rect x="124" y="70" width="16" height="34" rx="8" fill="var(--raised)" stroke="var(--line)" strokeWidth="2" />
      {/* sparks */}
      <circle cx="48" cy="52" r="2" fill="var(--amber)">
        <animate attributeName="cy" values="52;44;52" dur="3.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="134" cy="44" r="1.6" fill="var(--violet)">
        <animate attributeName="cy" values="44;36;44" dur="4.1s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/** A lost little golem looking at a map, for the 404 page. */
export function LostGolemIllustration() {
  return (
    <svg width="200" height="160" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <ellipse cx="100" cy="146" rx="62" ry="8" fill="var(--line)" opacity="0.5" />
      {/* body tilted */}
      <g transform="rotate(-4 100 90)">
        <rect x="70" y="70" width="60" height="54" rx="14" fill="var(--raised)" stroke="var(--line)" strokeWidth="2" />
        <rect x="78" y="38" width="44" height="36" rx="12" fill="var(--raised)" stroke="var(--line)" strokeWidth="2" />
        {/* puzzled eyes */}
        <circle cx="92" cy="56" r="3.6" fill="var(--muted)" />
        <circle cx="108" cy="56" r="3.6" fill="var(--amber)">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite" />
        </circle>
        {/* faded chest rune */}
        <path d="M100 84l9 6v11l-9 6-9-6V90z" stroke="var(--muted)" strokeWidth="2" strokeLinejoin="round" fill="none" opacity="0.5" />
      </g>
      {/* upside-down map */}
      <g transform="rotate(9 152 100)">
        <rect x="138" y="86" width="30" height="24" rx="3" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
        <path d="M142 104l6-8 5 6 6-9 5 7" stroke="var(--violet)" strokeWidth="1.6" fill="none" />
        <circle cx="160" cy="93" r="1.8" fill="var(--amber)" />
      </g>
      {/* question sparks */}
      <text x="60" y="34" fill="var(--muted)" fontSize="18" fontFamily="var(--font-display, Sora)">?</text>
      <text x="132" y="26" fill="var(--muted)" fontSize="13" fontFamily="var(--font-display, Sora)" opacity="0.7">?</text>
    </svg>
  );
}
