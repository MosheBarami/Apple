import { Sources, SourcesContent, SourcesTrigger, Source } from '../../ai-elements/sources';
import { Suggestions, Suggestion } from '../../ai-elements/suggestion';
import {
  agentCard,
  citationsFromTools,
  sourcesFromTools,
  suggestionsForTurn,
  type ToolLike,
} from './sources-model';
import type { StudioPlace } from '@golem/shared';
import './evidence.css';

/** UI03. Collapsed list of the lookups this turn actually read from. */
export function TurnSources({ tools, defaultOpen }: { tools: readonly ToolLike[] | undefined; defaultOpen?: boolean }) {
  const rows = sourcesFromTools(tools);
  if (rows.length === 0) return null;
  return (
    <Sources defaultOpen={defaultOpen}>
      <SourcesTrigger count={rows.length} />
      <SourcesContent>
        {rows.map((r) => (
          <Source key={r.id} title={r.title}>
            <span className="block font-medium">{r.title}</span>
            {r.note && r.note !== r.title ? <span className="ev-cite__note"> {r.note}</span> : null}
          </Source>
        ))}
      </SourcesContent>
    </Sources>
  );
}

/** UI10. Numbered references for the turn; each carries its source on hover or focus (title attribute, no invented locations). */
export function TurnCitations({ tools }: { tools: readonly ToolLike[] | undefined }) {
  const rows = citationsFromTools(tools);
  if (rows.length === 0) return null;
  return (
    <span className="ev-cite" aria-label="References">
      {rows.map((r) => (
        <sup key={r.id}>
          <span className="ev-cite__chip" tabIndex={0} title={r.note ? `${r.title}: ${r.note}` : r.title}>
            {r.n}
          </span>
        </sup>
      ))}
    </span>
  );
}

/** UI04. Follow-ups implied by how the turn ended; picking one only fills the composer via `onPick`. */
export function TurnSuggestions({
  turn,
  onPick,
}: {
  turn: { streaming?: boolean; stopReason?: string } | undefined;
  onPick: (prompt: string) => void;
}) {
  const rows = suggestionsForTurn(turn);
  if (rows.length === 0) return null;
  return (
    <Suggestions>
      {rows.map((r) => (
        <Suggestion key={r.label} suggestion={r.label} onClick={() => onPick(r.prompt)} />
      ))}
    </Suggestions>
  );
}

/** UI17. Public identity card: engine, connected Studio place, tools withheld. Never a prompt. */
export function AgentIdentityCard(props: {
  productModel?: string;
  studioConnected?: boolean;
  place?: StudioPlace | null;
  deniedTools?: string[];
}) {
  const card = agentCard(props);
  if (!card) return null;
  const studio =
    card.connected === null ? 'Studio: unavailable' : card.connected ? `Studio: connected${card.place ? ` to ${card.place}` : ''}` : 'Studio: not connected';
  return (
    <section className="ev-agent" aria-label="Agent">
      <h3 className="ev-agent__name">{card.name}</h3>
      <p className="ev-agent__blurb">{card.blurb}</p>
      <p className="ev-agent__row">{studio}</p>
      <p className="ev-agent__row">
        {card.denied.length > 0 ? `Withheld this run: ${card.denied.join(', ')}` : 'Tools withheld: none reported'}
      </p>
    </section>
  );
}
