/**
 * The canonical status marks — the DATA half.
 *
 * Split from the renderer the way empty-state-model, thinking-model and
 * activity-model are: the decisions are what is worth testing, and a module that
 * imports React cannot be loaded by `node --test`.
 *
 * §16.1 names a status vocabulary (I01–I12) and §16.4 asks for it as "semantic status
 * icon sets". What existed instead was the same idea drawn four different ways: a
 * literal `✓` character in `pairing-dialog.tsx` and `loading.tsx`, `✓ ✗ –` in
 * `generative-ui/render.tsx`, and inline SVG in `ws/activity.tsx`.
 *
 * A Unicode tick is not a small shortcut. It renders in whatever the font decides —
 * different weight, different baseline, different size from every other mark on the
 * page — and it is TEXT, so a screen reader reads "check mark" inline unless someone
 * remembers `aria-hidden` at each site. Three of the four call sites did remember.
 * Making it a component means the fourth cannot forget.
 *
 * TONE IS THE STATUS, not a prop, for the same reason it is in `empty-state-model.ts`:
 * a success drawn in the failure colour is the §16.3 drift, and it is one careless
 * copy away.
 */
/** The subset of §16.1's I-series this product can honestly show today. */
export const STATUS = {
  success: { canonical: 'I01', tone: 'good', path: 'M3 8.5l3.5 3.5L13 5' },
  error: { canonical: 'I02', tone: 'bad', path: 'M4 4l8 8M12 4l-8 8' },
  warning: { canonical: 'I03', tone: 'warn', path: 'M8 3.2 14.2 13.5H1.8zM8 7v3M8 11.6v.01' },
  info: { canonical: 'I04', tone: 'info', path: 'M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4zM8 7.2v4M8 5.1v.01' },
  // The one mark that means WORK IS HAPPENING, so it is the one that has to move: a
  // static three-quarter arc reads as a broken circle rather than as progress.
  pending: { canonical: 'I05', tone: 'muted', spin: true, path: 'M8 2.4a5.6 5.6 0 1 0 5.6 5.6' },
  waiting: { canonical: 'I06', tone: 'muted', path: 'M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4zM8 5v3.2l2.2 1.3' },
  skipped: { canonical: 'I09', tone: 'muted', path: 'M3.5 8h9' },
  locked: { canonical: 'I10', tone: 'warn', path: 'M4.2 7.2h7.6v6H4.2zM5.9 7.2V5.4a2.1 2.1 0 0 1 4.2 0v1.8' },
  experimental: { canonical: 'I12', tone: 'future', path: 'M6.4 2.4v3.9L3.2 12a1.4 1.4 0 0 0 1.2 2.1h7.2A1.4 1.4 0 0 0 12.8 12L9.6 6.3V2.4M5.6 2.4h4.8' },
} as const;

export type StatusName = keyof typeof STATUS;

/** Re-exported so a caller needing a plain path (an inline mark inside a larger SVG)
 *  takes it from here rather than drawing a fifth tick. */
export const STATUS_PATH = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, v.path]),
) as Record<StatusName, string>;

