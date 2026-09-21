import evidence from '../../../packages/corpus/data/style-visual-evidence.json' with { type: 'json' };
import genres from '../../../packages/corpus/data/genre-references.json' with { type: 'json' };

type Supplemental = {
  id: string;
  title: string;
  url: string;
  observation: string;
};

type Existing = {
  id: string;
  title: string;
  url: string;
  observations: { text: string }[];
};

const supplemental = new Map(
  (evidence.supplementalSources as Supplemental[]).map((item) => [item.id, item]),
);
const existing = new Map(
  (genres.externalReferences as Existing[]).map((item) => [item.id, item]),
);

export interface StyleVisualCue {
  sourceId: string;
  title: string;
  url: string;
  observation: string;
}

export function visualCuesForStyleFamily(styleFamily: string, limit = 3): StyleVisualCue[] {
  const ids = (evidence.styles as Record<string, string[]>)['family:' + styleFamily] ?? [];
  const cap = Math.max(0, Math.min(3, Math.trunc(limit)));
  return ids.slice(0, cap).flatMap((id) => {
    const fresh = supplemental.get(id);
    if (fresh) {
      return [{
        sourceId: id,
        title: fresh.title,
        url: fresh.url,
        observation: fresh.observation,
      }];
    }
    const old = existing.get(id);
    if (!old) return [];
    return [{
      sourceId: id,
      title: old.title,
      url: old.url,
      observation: old.observations[0]?.text ?? '',
    }];
  }).filter((item) => item.observation.length > 0);
}

export function styleVisualCueBlock(styleFamily: string): string | null {
  const cues = visualCuesForStyleFamily(styleFamily);
  if (!cues.length) return null;
  return [
    'REFERENCE-BACKED VISUAL CHECKS (' + styleFamily + '; observations only, never copy source media):',
    ...cues.map((cue) => '- ' + cue.observation),
  ].join('\n');
}
