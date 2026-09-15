/**
 * ONE icon set.
 *
 * There were two: `PATH` in `ws/primitives.tsx` for the workspace, and `ICONS` in
 * `glyphs.tsx` for the nav. They overlapped on three names, and two of those three were
 * DRAWN DIFFERENTLY — `settings` and `docs` rendered as different glyphs depending on
 * which part of the product you were in, which is the thing a design system exists to
 * stop. Both files render them identically otherwise (24x24 viewBox, 1.7 stroke, round
 * caps and joins), so the paths were always interchangeable and nothing but the
 * duplication kept them apart.
 *
 * Both modules re-export from here, so every existing call site is untouched and there
 * is one place a name can be defined. A new icon goes here, once.
 */
export const ICON_PATH = {
  plus: 'M12 5v14M5 12h14',
  chevronRight: 'M9 6l6 6-6 6',
  /** Leaves Apple for somewhere else — same glyph the landing uses. */
  arrowUpRight: 'M7 17 17 7m0 0H8.5M17 7v8.5',
  chevronDown: 'M6 9l6 6 6-6',
  /** Collapse / expand the rail. */
  panelLeft: 'M4 5h16v14H4zM10 5v14',
  /** New chat. */
  compose: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z M13.5 6.5l4 4',
  /** View all chats. */
  listAll: 'M4 7h16M4 12h16M4 17h9',
  /** Checkpoints — stacked project states. */
  layers: 'M12 3l8 4.5-8 4.5-8-4.5zM4 12l8 4.5 8-4.5M4 16.5L12 21l8-4.5',
  /** The Thinking card's mark. Amber, static. */
  creditle: 'M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z',
  attach:
    'M20 11.5l-8.1 8.1a4.6 4.6 0 0 1-6.5-6.5l8.6-8.6a3.1 3.1 0 0 1 4.4 4.4l-8.6 8.6a1.6 1.6 0 0 1-2.2-2.2l7.9-7.9',
  mic: 'M12 3.5a2.8 2.8 0 0 1 2.8 2.8v5.4a2.8 2.8 0 0 1-5.6 0V6.3A2.8 2.8 0 0 1 12 3.5zM5.5 11.2a6.5 6.5 0 0 0 13 0M12 17.7V21',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a3 3 0 0 0 4 2.8M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a3 3 0 0 1-4 2.8M12 4v15',
  close: 'M6 6l12 12M18 6L6 18',
  send: 'M12 19V5M5 12l7-7 7 7',
  stop: 'M8 8h8v8H8z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  /** Kept from the workspace set. The nav drew a twelve-tooth cog, which at 17px with a
   *  1.7 stroke is a grey smudge; this one reads at that size. */
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 3 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  gauge: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1',
  /** Kept from the workspace set: the nav's added an inner fold and two text rules that
   *  merge into a solid block below about 20px. */
  docs: 'M7 3h7l5 5v13H7zM14 3v5h5',
  shield: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z',
  /** Credits and clearance to publish — a document with a seal. Deliberately NOT
   *  `shield`, which already means Admin, and not `docs`, which means the manual. */
  licence: 'M6 3h9l4 4v8H6zM15 3v4h4M9.5 18.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM7.9 18.2 7 22l2.5-1.4L12 22l-.9-3.8',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  projects: 'M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.8M18 13.5a6.5 6.5 0 0 1 3.5 5.8',
  usage: 'M5 20V10m7 10V4m7 16v-7',
  admin: 'M12 3l7 4v5c0 4.4-3 8-7 9-4-1-7-4.6-7-9V7z',
  lab: 'M9 3h6M10 3v6l-5 8.5A2 2 0 0 0 6.7 21h10.6a2 2 0 0 0 1.7-3.5L14 9V3',
  /** Members and sharing. Two figures, the second half-drawn behind the first — one head
   *  and shoulders reads as "account", which already means the profile menu. */
  people: 'M9.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6.5 6.5 0 0 1 13 0M16.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3 5.8',
  rail: 'M3 4h18v16H3zM15 4v16',
  surface: 'M3 4h18v16H3zM3 10h18',
} as const;

export type IconName = keyof typeof ICON_PATH;
