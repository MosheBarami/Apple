// A DOCUMENTATION LINK THAT SHOWS WHERE IT GOES BEFORE YOU LEAVE.
//
// Three picks doing one job, merged into one card:
//   * AI Elements "inline-citation" — one hover card per source, no carousel;
//   * Animate UI "Hover Card" (MIT + Commons Clause, re-implemented) — the card grows from half size
//     out of the link with a spring;
//   * Animate UI "Preview Link Card" (same licence, re-implemented) — the card previews the page.
// The original preview draws a screenshot of the site. Apple has no screenshot of a docs page and
// fetching one would mean sending the reader's links to a third party, so the preview is what is
// actually known: the page's title, the site, and where on the site it lives.
//
// Built on this app's own vendored AI Elements HoverCard, which already opens on hover AND focus,
// closes on Escape, and never opens from a touch (a tap on a phone follows the link).
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../../ai-elements/ui/hover-card';
import { BookIcon } from '../../ai-elements/icons';
import './source-preview.css';

/** "create.roblox.com" and ["docs", "reference", "engine"] from a URL — or nothing for a bad one. */
export function describeUrl(href: string): { host: string; trail: string[] } | null {
  try {
    const url = new URL(href);
    const trail = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part).replace(/[-_]/g, ' '));
    return { host: url.host.replace(/^www\./, ''), trail };
  } catch {
    return null;
  }
}

export function SourcePreview({ href, title }: { href: string; title: string }) {
  const where = describeUrl(href);
  return (
    <HoverCard openDelay={350} closeDelay={150}>
      <HoverCardTrigger className="flex items-center gap-2 ai-sources__source" href={href} rel="noreferrer" target="_blank">
        <BookIcon className="h-4 w-4 ai-sources__icon" />
        <span className="block font-medium ai-sources__title">{title}</span>
      </HoverCardTrigger>
      <HoverCardContent className="pk-preview" side="top" align="start" sideOffset={8}>
        <p className="pk-preview__site">
          <BookIcon size={14} aria-hidden="true" />
          {where?.host ?? 'Documentation'}
        </p>
        <p className="pk-preview__title" dir="auto">{title}</p>
        {where && where.trail.length > 1 && (
          <p className="pk-preview__trail" dir="ltr">{where.trail.slice(0, -1).join(' › ')}</p>
        )}
        <p className="pk-preview__note">Opens in a new tab</p>
      </HoverCardContent>
    </HoverCard>
  );
}
