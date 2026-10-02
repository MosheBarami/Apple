import { useState } from 'react';
import type { VisualOption } from './asset-choice-model';
import './asset-choice.css';

export function AssetChoice({ options, snapshot, disabled, onChoose }: {
  options: VisualOption[];
  /** The numbered models standing in the place (library-object.ts), when the search took a Studio snapshot. */
  snapshot?: string | null;
  disabled: boolean;
  onChoose: (index: number | null) => void;
}) {
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  if (!options.length) return null;
  const inPlace = options.some((option) => option.assetId === undefined);
  return <section className="gx-asset-choice" aria-label="Choose a model preview">
    <p className="gx-asset-choice__title">Which one looks right?</p>
    {inPlace && <p className="gx-asset-choice__hint">They are standing in your place in Studio, numbered.</p>}
    {snapshot && <img className="gx-asset-choice__snapshot" src={snapshot} alt="The ready-made models standing in your place, numbered" loading="lazy" />}
    <div className="gx-asset-choice__grid">
      {options.map((option, index) => {
        const number = option.index ?? index + 1;
        const ready = option.assetId === undefined || loaded[index];
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
