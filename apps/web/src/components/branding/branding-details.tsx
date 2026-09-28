// The Branding details: what the worker made for the store page, and the fields to edit it.
//
// Presentational only; routes/branding.tsx owns the requests. Every picture carries the
// "Branding" badge and the worker's provenance line, because a composed icon over an enlarged
// capture must never be read as a screenshot of the game running (V3 gate G15).
import './branding.css';
import { Image } from '../ai-elements/image';
import type { BrandingArt, BrandingEdit, BrandingView } from '../../lib/branding-api';

export const BRANDING_LABEL = 'Branding art - not gameplay evidence';

export const EDIT_LIMITS = { selectedName: 50, tagline: 48, shortDescription: 160, longDescription: 1000 } as const;

/** The editable fields of a saved record, as the form starts them. */
export function draftFrom(view: BrandingView | undefined): BrandingEdit | null {
  const b = view?.branding;
  return b ? { selectedName: b.selectedName, shortDescription: b.shortDescription, longDescription: b.longDescription, tagline: b.tagline } : null;
}

export function isDirty(view: BrandingView | undefined, draft: BrandingEdit | null): boolean {
  const saved = draftFrom(view);
  if (!saved || !draft) return false;
  return (Object.keys(saved) as (keyof BrandingEdit)[]).some((k) => saved[k] !== draft[k]);
}

function artTitle(art: BrandingArt, index: number): string {
  return art.kind === 'icon' ? 'Game icon' : `Thumbnail ${index}`;
}

export interface BrandingDetailsProps {
  view: BrandingView;
  draft: BrandingEdit | null;
  onDraft: (next: BrandingEdit) => void;
  onSave: () => void;
  onRegenerate: () => void;
  onDownload?: (art: BrandingArt, filename: string) => void;
  saving?: boolean;
  generating?: boolean;
  /** A sentence to show above the form: a refusal, a needs-Studio answer, or a confirmation. */
  message?: { tone: 'error' | 'info'; text: string } | null;
}

export function BrandingDetails({ view, draft, onDraft, onSave, onRegenerate, onDownload, saving, generating, message }: BrandingDetailsProps) {
  const record = view.branding;
  const dirty = isDirty(view, draft);
  let thumbs = 0;
  const status = message ? (
    <p className={message.tone === 'error' ? 'brand__msg form-error' : 'brand__msg'} role={message.tone === 'error' ? 'alert' : 'status'}>
      {message.text}
    </p>
  ) : null;

  if (!record || !draft) {
    return (
      <section className="brand" aria-label="Branding">
        <div className="brand__empty card">
          <h2>No branding yet</h2>
          <p className="field-hint">
            Apple takes real pictures of your game from Roblox Studio, composes a 512x512 icon and 1920x1080 thumbnails from them, and
            suggests names and descriptions. Studio must be connected with this place open. Uses 1 Credit.
          </p>
          {status}
          <button type="button" className="btn btn-primary" onClick={onRegenerate} disabled={generating}>
            {generating ? 'Generating...' : 'Generate branding'}
          </button>
        </div>
      </section>
    );
  }

  const set = (key: keyof BrandingEdit, value: string) => onDraft({ ...draft, [key]: value });

  return (
    <section className="brand" aria-label="Branding">
      <p className="brand__label">
        <span className="brand__badge">Branding</span> {BRANDING_LABEL}
      </p>

      <div className="brand__gallery">
        {view.art.map((art) => {
          const title = art.kind === 'icon' ? artTitle(art, 0) : artTitle(art, ++thumbs);
          const filename = `${draft.selectedName || 'game'}-${art.kind}${art.kind === 'thumbnail' ? `-${thumbs}` : ''}.png`.replace(/[^A-Za-z0-9._-]+/g, '-');
          return (
            <figure key={art.id} className={`brand__art brand__art--${art.kind}`} data-branding="true">
              <Image
                base64={art.base64}
                mediaType={art.mediaType}
                alt={`Branding ${art.kind} for ${record.selectedName}, ${art.width}x${art.height}. Not a gameplay screenshot.`}
                width={art.width}
                height={art.height}
              />
              <figcaption>
                <span className="brand__badge">Branding</span> {title}, {art.width}x{art.height}
                <span className="brand__prov">{art.provenance}</span>
                {onDownload ? (
                  <button type="button" className="btn btn-ghost brand__dl" onClick={() => onDownload(art, filename)}>
                    Download PNG
                  </button>
                ) : null}
              </figcaption>
            </figure>
          );
        })}
      </div>

      {status}

      <form
        className="brand__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !saving) onSave();
        }}
      >
        <fieldset className="brand__names">
          <legend className="field-label">Name suggestions</legend>
          {record.names.map((name) => (
            <button
              key={name}
              type="button"
              className="btn btn-ghost brand__name"
              aria-pressed={draft.selectedName === name}
              onClick={() => set('selectedName', name)}
            >
              {name}
            </button>
          ))}
        </fieldset>

        <label className="field">
          <span className="field-label">Game name</span>
          <input name="selectedName" value={draft.selectedName} maxLength={EDIT_LIMITS.selectedName} onChange={(e) => set('selectedName', e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Tagline (on the art)</span>
          <input name="tagline" value={draft.tagline} maxLength={EDIT_LIMITS.tagline} onChange={(e) => set('tagline', e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Short description</span>
          <textarea
            name="shortDescription"
            rows={2}
            value={draft.shortDescription}
            maxLength={EDIT_LIMITS.shortDescription}
            onChange={(e) => set('shortDescription', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Description</span>
          <textarea
            name="longDescription"
            rows={8}
            value={draft.longDescription}
            maxLength={EDIT_LIMITS.longDescription}
            onChange={(e) => set('longDescription', e.target.value)}
          />
        </label>

        <div className="brand__actions">
          <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className="btn" onClick={onRegenerate} disabled={generating || saving}>
            {generating ? 'Regenerating...' : 'Regenerate'}
          </button>
          <span className="field-hint">
            Regenerate uses 1 Credit and replaces the names, descriptions and art. Saved {record.updatedAt.slice(0, 10)}.
          </span>
        </div>
      </form>

      <p className="brand__publish field-hint">{view.publish.note}</p>
    </section>
  );
}
