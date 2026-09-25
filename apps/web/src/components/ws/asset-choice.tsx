import { useState } from 'react';
import type { VisualOption } from './asset-choice-model';
import './asset-choice.css';

export function AssetChoice({ options, disabled, onChoose }: {
  options: VisualOption[];
  disabled: boolean;
  onChoose: (index: number | null) => void;
}) {
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  if (!options.length) return null;
  return <section className="gx-asset-choice" aria-label="Choose a model preview">
    <p className="gx-asset-choice__title">Which one looks right?</p>
    <div className="gx-asset-choice__grid">
      {options.map((option, index) => <button
        key={`${option.assetId}-${index}`}
        type="button"
        className="gx-asset-choice__option"
        disabled={disabled || !loaded[index]}
        onClick={() => onChoose(index + 1)}
        aria-label={`Choose ${option.name}`}
      >
        <span className="gx-asset-choice__image">
          <img
            src={`/api/library-preview/${option.assetId}`}
            alt={`Preview of ${option.name}`}
            loading="lazy"
            onLoad={() => setLoaded((state) => ({ ...state, [index]: true }))}
            onError={() => setLoaded((state) => ({ ...state, [index]: false }))}
          />
        </span>
        <span className="gx-asset-choice__name">{option.name}</span>
        <span className="gx-asset-choice__action">{loaded[index] ? 'Choose this' : 'Preview unavailable'}</span>
      </button>)}
    </div>
    <button type="button" className="gx-asset-choice__reject" disabled={disabled} onClick={() => onChoose(null)}>
      None of these look right
    </button>
  </section>;
}
