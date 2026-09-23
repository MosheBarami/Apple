/*
 * The copy button shared by CodeTabs and Terminal (UI Layouts' Code Tabs, MIT): copies the text in
 * its data-copy attribute, swaps its icon for a tick for a moment, and says "Copied" to a screen
 * reader through the block's own status line. A browser that refuses the clipboard says so instead
 * of pretending.
 */
export function wireCopy(root: HTMLElement): void {
  const status = root.querySelector<HTMLElement>('[data-copy-status]');
  root.querySelectorAll<HTMLButtonElement>('button[data-copy]').forEach((button) => {
    let timer = 0;
    button.addEventListener('click', async () => {
      let ok = true;
      try {
        await navigator.clipboard.writeText(button.dataset.copy ?? '');
      } catch {
        ok = false;
      }
      if (status) status.textContent = ok ? 'Copied' : 'Could not copy — select the text instead';
      button.classList.toggle('is-done', ok);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        button.classList.remove('is-done');
        if (status) status.textContent = '';
      }, 1600);
    });
  });
}
