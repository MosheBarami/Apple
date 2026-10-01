// THE REPLY'S TEXT, WITH ITS CITATIONS — AI Elements MessageResponse (Streamdown) and InlineCitation.
//
// The worker cites a source in the answer as `[1]`, `[2]`: a 1-based index into the `sources` frame
// of the same message (lib/run-trace.ts). Each run of adjacent markers is drawn as one AI Elements
// InlineCitation — the badge with the source's site, and a hover card naming the source and linking
// to it. A marker with no matching source stays plain text, so nothing points nowhere.
import type { RunSource } from '@golem/shared';
import { useMemo, type ComponentProps } from 'react';
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
  InlineCitationSource,
} from '../ai-elements/inline-citation';
import { MessageResponse } from '../ai-elements/message';
import { Source, Sources, SourcesContent, SourcesTrigger } from '../ai-elements/sources';
import { ChevronDownIcon } from 'lucide-react';
import { citationMarkdown, citedIndexes, safeSourceUrl } from '../../lib/run-trace';
import { cn } from '../../lib/utils';

function CitedSource({ source }: { source: RunSource }) {
  const href = safeSourceUrl(source.url);
  return (
    <InlineCitationSource title={source.title} url={source.url} description={source.note}>
      {href && (
        <a className="inline-block pt-1 font-medium text-primary text-xs underline" href={href} rel="noreferrer" target="_blank">
          Open the source
        </a>
      )}
    </InlineCitationSource>
  );
}

function Citation({ cited }: { cited: RunSource[] }) {
  const urls = cited.map((source) => source.url);
  return (
    <InlineCitation>
      <InlineCitationCard>
        <InlineCitationCardTrigger
          sources={urls}
          tabIndex={0}
          aria-label={`Source: ${cited.map((source) => source.title).join(', ')}`}
        />
        <InlineCitationCardBody>
          {cited.length === 1 ? (
            <div className="p-4"><CitedSource source={cited[0]!} /></div>
          ) : (
            <InlineCitationCarousel>
              <InlineCitationCarouselHeader>
                <InlineCitationCarouselPrev />
                <InlineCitationCarouselNext />
                <InlineCitationCarouselIndex />
              </InlineCitationCarouselHeader>
              <InlineCitationCarouselContent>
                {cited.map((source) => (
                  <InlineCitationCarouselItem key={source.url}>
                    <CitedSource source={source} />
                  </InlineCitationCarouselItem>
                ))}
              </InlineCitationCarouselContent>
            </InlineCitationCarousel>
          )}
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  );
}

type AnchorProps = ComponentProps<'a'> & { node?: unknown };

export function Answer({
  text,
  sources,
  ...rest
}: Omit<ComponentProps<typeof MessageResponse>, 'children' | 'components'> & {
  text: string;
  sources?: readonly RunSource[];
}) {
  const list = sources ?? [];
  const markdown = useMemo(() => citationMarkdown(text, list), [text, list]);
  const components = useMemo(
    () => ({
      a: ({ node: _node, href, children, className: linkClass, ...rest }: AnchorProps) => {
        const indexes = citedIndexes(href);
        const cited = indexes?.map((n) => list[n - 1]).filter((source): source is RunSource => Boolean(source));
        if (cited && cited.length > 0) return <Citation cited={cited} />;
        // Any other link is drawn as Streamdown draws one: new tab, no referrer.
        return (
          <a {...rest} className={cn('wrap-anywhere font-medium text-primary underline', linkClass)} data-streamdown="link" href={href} rel="noreferrer" target="_blank">
            {children}
          </a>
        );
      },
    }),
    [list],
  );
  return (
    <MessageResponse {...rest} components={components}>
      {markdown}
    </MessageResponse>
  );
}

/**
 * "Used N sources" under the reply — AI Elements Sources, closed until opened. Only the sources the
 * worker sent for THIS message, in its order (the `[n]` in the answer index into the same list);
 * a link that is not http(s) never reaches this list (lib/run-trace.ts withSources).
 */
export function RunSources({ sources }: { sources?: readonly RunSource[] }) {
  // Numbered by their place in the message's list, which is what `[n]` in the answer refers to.
  const list = (sources ?? []).flatMap((source, index) => {
    const href = safeSourceUrl(source.url);
    return href ? [{ source, href, n: index + 1 }] : [];
  });
  if (list.length === 0) return null;
  return (
    <Sources className="mb-0">
      {/* The trigger upstream draws ("Used N sources"), with the plural right for one. */}
      <SourcesTrigger count={list.length}>
        <p className="font-medium">Used {list.length} {list.length === 1 ? 'source' : 'sources'}</p>
        <ChevronDownIcon className="h-4 w-4" />
      </SourcesTrigger>
      <SourcesContent>
        {list.map(({ source, href, n }) => (
          <Source key={`${n}-${href}`} href={href} title={`${n}. ${source.title}`} />
        ))}
      </SourcesContent>
    </Sources>
  );
}
