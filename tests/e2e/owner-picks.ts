import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * WHERE THE OWNER'S PICKS DRAW A <canvas>, READ FROM THE PICKS THEMSELVES.
 *
 * Commit 3940085 built the site from the owner's picks, and some of them draw on a canvas (the
 * noise grounds, the footer's particle word, the pricing card's beam). A hand-written list of them
 * would outlive the picks, so this walks apps/site/src/components/picks*, drops frontmatter,
 * scripts, styles and comments, and returns a selector for each element that directly wraps a
 * <canvas> in a pick's markup: its data-* hook, which is what the pick's own script looks for.
 */
const COMPONENTS = join(__dirname, '..', '..', 'apps', 'site', 'src', 'components');

export function pickCanvasHosts(): string[] {
  const hosts = new Set<string>();
  for (const dir of readdirSync(COMPONENTS).filter((d) => d.startsWith('picks'))) {
    for (const file of readdirSync(join(COMPONENTS, dir)).filter((f) => f.endsWith('.astro'))) {
      const markup = readFileSync(join(COMPONENTS, dir, file), 'utf8')
        .replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
        .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '')
        .replace(/<!--[\s\S]*?-->|\{\/\*[\s\S]*?\*\/\}/g, '');
      for (const [, attrs] of markup.matchAll(/<\w+\b([^>]*)>\s*<canvas\b/g)) {
        for (const [, hook] of attrs.matchAll(/\b(data-[\w-]+)/g)) hosts.add(`[${hook}]`);
      }
    }
  }
  if (hosts.size === 0) throw new Error(`no pick under ${COMPONENTS} wraps a <canvas> — the walk read nothing`);
  return [...hosts];
}

/**
 * Every <canvas> on the page that is NOT an owner pick's drawing, or that assistive technology
 * would meet: a canvas is decoration here, so it must sit in a pick's host and be aria-hidden.
 */
export async function strayCanvases(page: Page): Promise<string[]> {
  return page.evaluate(
    (hosts) =>
      [...document.querySelectorAll('canvas')]
        .filter((c) => !c.parentElement?.matches(hosts) || !c.closest('[aria-hidden="true"]'))
        .map((c) => (c.parentElement?.outerHTML ?? '<canvas> with no parent').slice(0, 120)),
    pickCanvasHosts().join(', '),
  );
}
