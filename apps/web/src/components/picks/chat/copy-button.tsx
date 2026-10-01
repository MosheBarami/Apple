// COPYING, AND SAYING WHETHER IT WORKED.
//
// The reply's Copy is AI Elements' MessageAction now (ws/turn.tsx CopyAction): its icon turns into a
// tick, or a cross when the clipboard refused — the state the original picks did not have and the
// product needs, so a refused copy is never drawn as a copy that happened. This file keeps the one
// clipboard write every copy path shares.

export type CopyState = 'idle' | 'copied' | 'failed';

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
