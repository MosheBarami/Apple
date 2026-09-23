// /library — the free UI and icon packs the agent can use (packages/asset-library, D-UILIB-2).
//
// Everything here comes from the generated manifest: names, counts, licences and the three
// previews per pack. The images are served by the worker from its static store at
// /asset-library/<pack>/<path>, the same bytes `upload_ui_asset` sends to Roblox.
import manifest from '../../../../packages/asset-library/manifest.json';
import { formatNumber } from '../lib/format';
import './library.css';

const LICENCE_LABEL: Record<string, string> = {
  'CC0-1.0': 'CC0, public domain',
  'CC-BY-3.0': 'CC BY 3.0',
  'CC-BY-4.0': 'CC BY 4.0',
};

/** Manifest paths are relative to the package ("packs/<id>/..."); the store drops "packs/". */
const served = (rel: string) => '/asset-library/' + rel.replace(/^packs\//, '');

export function LibraryPage() {
  return (
    <div className="page library-page">
      <header className="library-page__head">
        <h1 className="page-title">UI library</h1>
        <p className="page-desc">
          {formatNumber(manifest.totalFiles)} free buttons, panels and icons in {manifest.packs.length} packs. Ask the
          agent for one ("use a heart icon from the library"): with a Roblox key connected in Settings it uploads the image
          to your own Roblox account so a button or ImageLabel can show it. Every pack is free to use in a published game.
        </p>
      </header>

      <ul className="library-grid">
        {manifest.packs.map((p) => (
          <li key={p.id} className="library-card">
            <div className="library-card__previews" aria-hidden="true">
              {p.previews.map((rel) => (
                <img key={rel} src={served(rel)} alt="" loading="lazy" decoding="async" />
              ))}
            </div>
            <div className="library-card__body">
              <h2 className="library-card__name">{p.name}</h2>
              <p className="library-card__what">{p.what}</p>
              <p className="library-card__meta">
                <span>{p.kind === 'ui' ? 'UI' : 'Icons'}</span>
                <span>{formatNumber(p.files)} files</span>
                <span>{LICENCE_LABEL[p.license] ?? p.license}</span>
              </p>
              {p.attribution && <p className="library-card__credit">Credit: {p.attribution}</p>}
              <a className="library-card__source" href={p.source} target="_blank" rel="noopener noreferrer">
                {p.author}
                <span className="gx-sr"> (opens in a new tab)</span>
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
