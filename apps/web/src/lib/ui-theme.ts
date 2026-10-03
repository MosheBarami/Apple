// The composer's UI theme choice, remembered per project.
//
// There is no per-project settings store on the web side (drafts and view state each keep their own
// localStorage key), so this follows draft.ts: keyed by project id, never throws, and falls back to
// the in-memory copy when storage is blocked so the choice still applies for the session.
import { asUiTheme, DEFAULT_UI_THEME, type UiTheme } from '@apple/shared';

const PREFIX = 'apple.uiTheme.';
const memory = new Map<string, UiTheme>();

export function readUiTheme(projectId: string): UiTheme {
  if (!projectId) return DEFAULT_UI_THEME;
  try {
    const stored = window.localStorage.getItem(`${PREFIX}${projectId}`);
    if (stored !== null) return asUiTheme(stored);
  } catch {
    /* private window or blocked storage: use the session copy */
  }
  return memory.get(projectId) ?? DEFAULT_UI_THEME;
}

export function writeUiTheme(projectId: string, theme: UiTheme): void {
  if (!projectId) return;
  memory.set(projectId, theme);
  try {
    window.localStorage.setItem(`${PREFIX}${projectId}`, theme);
  } catch {
    /* the choice lasts for this session only */
  }
}
