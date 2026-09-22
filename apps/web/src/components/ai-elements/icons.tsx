// Inline-SVG stand-ins for exactly the lucide-react icons the vendored AI Elements files import,
// under the same names, so each `import { XIcon } from "lucide-react"` becomes an import from here
// and nothing else in the component changes.
//
// The geometry is lucide's own (ISC-licensed path data, 24x24 grid). Two local choices:
//   * the default stroke is 1.7, the weight the app's own `Icon` draws with, rather than lucide's
//     2 — the same 16px arrow in two weights side by side reads as two icon sets;
//   * an icon is `aria-hidden` unless it is given an aria-*, role or title prop, which is lucide's own
//     rule. Each one sits inside a control that carries its own name, and a decorative SVG that
//     announces itself is noise; the Spinner, which names itself, is the exception lucide makes.
// Reasoning now draws its Brain and ChevronDown from here too, so the reasoning header and the chain
// of thought under it show one brain, not two drawings of one. The icons added with the chain of
// thought, tool, task and sources components (Brain onward, below Copy) take their geometry from
// lucide-react 1.31.0's own icon nodes, read from an installed copy of the package.
import { forwardRef, type ReactElement, type SVGProps } from 'react';
import { cn } from './lib/utils';

export type LucideProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  absoluteStrokeWidth?: boolean;
};

export type LucideIcon = ReturnType<typeof createIcon>;

function createIcon(name: string, shape: ReactElement) {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(function Icon(
    { size = 24, strokeWidth = 1.7, absoluteStrokeWidth = false, color = 'currentColor', className, ...props },
    ref,
  ) {
    const stroke = absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        // lucide's own rule (hasA11yProp): hidden unless the caller gave the icon an aria-*, role or
        // title prop — the Spinner is `role="status"` with a name, and must stay announced.
        aria-hidden={Object.keys(props).some((k) => k.startsWith('aria-') || k === 'role' || k === 'title') ? undefined : 'true'}
        focusable="false"
        className={cn('lucide', `lucide-${name}`, 'ai-icon', className)}
        {...props}
      >
        {shape}
      </svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}

export const ArrowDownIcon = /* @__PURE__ */ createIcon(
  'arrow-down',
  <>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </>,
);

export const DownloadIcon = /* @__PURE__ */ createIcon(
  'download',
  <>
    <path d="M12 15V3" />
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
  </>,
);

export const ChevronLeftIcon = /* @__PURE__ */ createIcon('chevron-left', <path d="m15 18-6-6 6-6" />);
export const ChevronRightIcon = /* @__PURE__ */ createIcon('chevron-right', <path d="m9 18 6-6-6-6" />);
export const ChevronDownIcon = /* @__PURE__ */ createIcon('chevron-down', <path d="m6 9 6 6 6-6" />);

// Drawn as a path, never as a character: a tick glyph brings its own font metrics and its own
// screen-reader announcement (tests/status-icon.test.mjs).
export const CheckIcon = /* @__PURE__ */ createIcon('check', <path d="M20 6 9 17l-5-5" />);

export const CopyIcon = /* @__PURE__ */ createIcon(
  'copy',
  <>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </>,
);

export const BrainIcon = /* @__PURE__ */ createIcon(
  'brain',
  <>
    <path d="M12 18V5" />
    <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
    <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
    <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
    <path d="M18 18a4 4 0 0 0 2-7.464" />
    <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
    <path d="M6 18a4 4 0 0 1-2-7.464" />
    <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
  </>,
);

export const DotIcon = /* @__PURE__ */ createIcon('dot', <circle cx="12" cy="12" r="1" />);

export const CircleIcon = /* @__PURE__ */ createIcon('circle', <circle cx="12" cy="12" r="10" />);

// lucide's CheckCircle is its circle-check-big. A path, never a tick character.
export const CheckCircleIcon = /* @__PURE__ */ createIcon(
  'circle-check-big',
  <>
    <path d="M21.801 10A10 10 0 1 1 17 3.335" />
    <path d="m9 11 3 3L22 4" />
  </>,
);

export const XCircleIcon = /* @__PURE__ */ createIcon(
  'circle-x',
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6" />
    <path d="m9 9 6 6" />
  </>,
);

export const ClockIcon = /* @__PURE__ */ createIcon(
  'clock',
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </>,
);

export const WrenchIcon = /* @__PURE__ */ createIcon(
  'wrench',
  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />,
);

export const SearchIcon = /* @__PURE__ */ createIcon(
  'search',
  <>
    <path d="m21 21-4.34-4.34" />
    <circle cx="11" cy="11" r="8" />
  </>,
);

export const BookIcon = /* @__PURE__ */ createIcon(
  'book',
  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />,
);

export const ListTodoIcon = /* @__PURE__ */ createIcon(
  'list-todo',
  <>
    <path d="M13 5h8" />
    <path d="M13 12h8" />
    <path d="M13 19h8" />
    <path d="m3 17 2 2 4-4" />
    <rect x="3" y="4" width="6" height="6" rx="1" />
  </>,
);

// The icons prompt-input, attachments, dropdown-menu, dialog, command and spinner import, also in
// lucide-react 1.31.0's own geometry. `Monitor` keeps upstream's unsuffixed import name, and
// `Loader2Icon` is lucide's alias for loader-circle.
export const CornerDownLeftIcon = /* @__PURE__ */ createIcon(
  'corner-down-left',
  <>
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    <path d="m9 10-5 5 5 5" />
  </>,
);

export const ArrowUpIcon = /* @__PURE__ */ createIcon(
  'arrow-up',
  <>
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </>,
);

export const ImageIcon = /* @__PURE__ */ createIcon(
  'image',
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </>,
);

export const Monitor = /* @__PURE__ */ createIcon(
  'monitor',
  <>
    <rect width="20" height="14" x="2" y="3" rx="2" />
    <line x1="8" x2="16" y1="21" y2="21" />
    <line x1="12" x2="12" y1="17" y2="21" />
  </>,
);

export const PlusIcon = /* @__PURE__ */ createIcon(
  'plus',
  <>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </>,
);

export const SquareIcon = /* @__PURE__ */ createIcon('square', <rect width="18" height="18" x="3" y="3" rx="2" />);

// A path, never the multiplication-sign character.
export const XIcon = /* @__PURE__ */ createIcon(
  'x',
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>,
);

export const FileTextIcon = /* @__PURE__ */ createIcon(
  'file-text',
  <>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
    <path d="M14 2v5a1 1 0 0 0 1 1h5" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </>,
);

export const GlobeIcon = /* @__PURE__ */ createIcon(
  'globe',
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </>,
);

export const Music2Icon = /* @__PURE__ */ createIcon(
  'music-2',
  <>
    <circle cx="8" cy="18" r="4" />
    <path d="M12 18V2l7 4" />
  </>,
);

export const PaperclipIcon = /* @__PURE__ */ createIcon(
  'paperclip',
  <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />,
);

export const VideoIcon = /* @__PURE__ */ createIcon(
  'video',
  <>
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </>,
);

export const Loader2Icon = /* @__PURE__ */ createIcon('loader-circle', <path d="M21 12a9 9 0 1 1-6.219-8.56" />);
