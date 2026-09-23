// The small icon set the chat-tech picks draw with: 24-unit Lucide-style strokes, currentColor,
// aria-hidden. Shared by the AI Elements ports under components/ai-elements/ and the drawers.
import type { ReactNode } from 'react';

function Svg({ size = 16, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      // Inline, because the app's global `button svg { width:17px }` outranks the attributes.
      style={{ width: size, height: size, flex: 'none' }}
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const FolderIcon = ({ size }: P) => (
  <Svg size={size}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></Svg>
);
export const FolderOpenIcon = ({ size }: P) => (
  <Svg size={size}><path d="m6 14 1.5-2.9A2 2 0 0 1 9.2 10H20a2 2 0 0 1 1.9 2.5l-1.5 6A2 2 0 0 1 18.5 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H18a2 2 0 0 1 2 2v2" /></Svg>
);
export const FileIcon = ({ size }: P) => (
  <Svg size={size}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><path d="M14 2v6h6" /></Svg>
);
export const ChevronIcon = ({ size = 12 }: P) => <Svg size={size}><path d="m9 18 6-6-6-6" /></Svg>;
export const CopyIcon = ({ size = 14 }: P) => (
  <Svg size={size}><rect x="8" y="8" width="14" height="14" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></Svg>
);
export const CheckIcon = ({ size = 14 }: P) => <Svg size={size}><path d="M20 6 9 17l-5-5" /></Svg>;
export const PlusIcon = ({ size = 14 }: P) => <Svg size={size}><path d="M12 5v14M5 12h14" /></Svg>;
export const MinusIcon = ({ size = 14 }: P) => <Svg size={size}><path d="M5 12h14" /></Svg>;
export const FitIcon = ({ size = 14 }: P) => (
  <Svg size={size}><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></Svg>
);
export const CommentIcon = ({ size = 12 }: P) => (
  <Svg size={size}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M12 7v6M9 10h6" /></Svg>
);
export const CloseIcon = ({ size = 14 }: P) => <Svg size={size}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const BackIcon = ({ size = 14 }: P) => <Svg size={size}><path d="m15 18-6-6 6-6" /></Svg>;
export const ForwardIcon = ({ size = 14 }: P) => <Svg size={size}><path d="m9 18 6-6-6-6" /></Svg>;
export const ExpandIcon = ({ size = 14 }: P) => (
  <Svg size={size}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></Svg>
);
export const PassIcon = ({ size = 14 }: P) => (
  <Svg size={size}><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></Svg>
);
export const FailIcon = ({ size = 14 }: P) => (
  <Svg size={size}><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></Svg>
);
export const SkipIcon = ({ size = 14 }: P) => (
  <Svg size={size}><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /></Svg>
);
export const TerminalIcon = ({ size = 14 }: P) => <Svg size={size}><path d="m4 17 6-6-6-6M12 19h8" /></Svg>;
export const AlertIcon = ({ size = 14 }: P) => (
  <Svg size={size}><path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" /><path d="M12 9v4M12 17h.01" /></Svg>
);
export const DownloadIcon = ({ size = 14 }: P) => (
  <Svg size={size}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></Svg>
);
