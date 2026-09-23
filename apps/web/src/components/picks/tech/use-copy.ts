import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copy to the clipboard and say so for a moment — only after the write resolved. A refused write
 * (no permission, insecure origin) leaves `copied` false and calls `onError`, because a tick over a
 * clipboard that did not change is a claim outliving the fact.
 */
export function useCopy(timeout = 2000, onError?: (e: unknown) => void) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = useCallback(
    async (text: string) => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), timeout);
        return true;
      } catch (e) {
        onError?.(e);
        return false;
      }
    },
    [timeout, onError],
  );
  return { copied, copy };
}
