import { useEffect, useState } from 'react';
import type { VisualOption } from './asset-choice-model';
import { fetchImageObjectUrl } from '../../lib/api';
import './asset-choice.css';

/**
 * The snapshot through the same authenticated read as every StudPilot image (lib/api.ts fetchImageObjectUrl): a bare
 * <img src> carries no credential, so the project image route refused it (review 2026-10-02). Revoked on unmount.
 */
function useSnapshot(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const m = path ? /^\/api\/projects\/([^/]+)\/images\/([^/]+)$/.exec(path) : null;
    if (!m) return;
    let made: string | null = null;
    let live = true;
    fetchImageObjectUrl(m[1]!, m[2]!).then((u) => { if (live) { made = u; setUrl(u); } else URL.revokeObjectURL(u); }).catch(() => undefined);
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [path]);
  return url;
}

export function AssetChoice({ options, snapshot, disabled, onChoose }: {
  options: VisualOption[];
  /** The numbered models standing in the place (library-object.ts), when the search took a Studio snapshot. */
  snapshot?: string | null;
  disabled: boolean;
  onChoose: (index: number | null) => void;
}) {
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const shot = useSnapshot(snapshot);
  if (!options.length) return null;
  const inPlace = options.some((option) => option.assetId === undefined);
  return <section className="gx-asset-choice" aria-label="Choose a model preview">
    <p className="gx-asset-choice__title">Which one looks right?</p>
    {inPlace && <p className="gx-asset-choice__hint">They are standing in your place in Studio, numbered.</p>}
    {shot && <img className="gx-asset-choice__snapshot" src={shot} alt="The ready-made models standing in your place, numbered" />}
    <div className="gx-asset-choice__grid">
      {options.map((option, index) => {
        const number = option.index ?? index + 1;
        // A model already standing in the place, numbered, can be picked whether or not its thumbnail loads.
        const ready = option.index !== undefined || option.assetId === undefined || loaded[index];
        return <button
          key={`${option.assetId ?? 'n'}-${number}`}
          type="button"
          className="gx-asset-choice__option"
          disabled={disabled || !ready}
          onClick={() => onChoose(number)}
          aria-label={`Choose ${number}: ${option.name}`}
        >
          <span className="gx-asset-choice__image">
            {option.assetId !== undefined
              ? <img
                src={`/api/library-preview/${option.assetId}`}
                alt={`Preview of ${option.name}`}
                loading="lazy"
                onLoad={() => setLoaded((state) => ({ ...state, [index]: true }))}
                onError={() => setLoaded((state) => ({ ...state, [index]: false }))}
              />
              : <span className="gx-asset-choice__number" aria-hidden="true">{number}</span>}
          </span>
          <span className="gx-asset-choice__name">{option.name}</span>
          {option.where && <span className="gx-asset-choice__where">from {option.where}</span>}
          <span className="gx-asset-choice__action">{ready ? 'Choose this' : 'Preview unavailable'}</span>
        </button>;
      })}
    </div>
    <button type="button" className="gx-asset-choice__reject" disabled={disabled} onClick={() => onChoose(null)}>
      None of these look right
    </button>
  </section>;
}
