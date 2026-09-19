import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '../modal';
import { searchAssetCatalog } from '../../lib/api';
import { assetAvailability, catalogSourceLink, catalogPreviewUrl, catalogPreviewLabel, catalogDetails, type CatalogAsset } from '../../lib/asset-catalog';
import './asset-catalog.css';

function AssetPreview({ asset }: { asset: CatalogAsset }) {
  const url = catalogPreviewUrl(asset);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return <div className="apple-catalog__preview">
    {url && !failed ? <>
      {!loaded && <span className="apple-catalog__preview-note">Loading preview…</span>}
      <img src={url} alt={`Roblox preview of ${asset.name}`} width={150} height={150}
        loading="lazy" decoding="async" referrerPolicy="no-referrer" crossOrigin="anonymous"
        className={loaded ? 'is-loaded' : ''}
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      {loaded && <span className="apple-catalog__preview-caption">Roblox thumbnail</span>}
    </> : <>
      <svg aria-hidden="true" width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="m15 3 11 6.5v11L15 27 4 20.5v-11L15 3Zm0 13 11-6.5M15 16 4 9.5M15 16v11" />
      </svg>
      <span className="apple-catalog__preview-note">{catalogPreviewLabel(asset, failed)}</span>
    </>}
  </div>;
}

export function AssetCatalog({ onClose, onChoose }: {
  onClose: () => void;
  onChoose: (asset: CatalogAsset) => boolean;
}) {
  const [query, setQuery] = useState('');
  const [insertableOnly, setInsertableOnly] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [assets, setAssets] = useState<CatalogAsset[]>([]);
  const [searched, setSearched] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const previous = root.inert;
    root.inert = true;
    searchInput.current?.focus();
    return () => { root.inert = previous; };
  }, []);

  const search = async () => {
    const term = query.trim();
    if (!term || term.length > 120) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setState('loading'); setError(''); setAssets([]); setSearched(term);
    try {
      const result = await searchAssetCatalog(term, active.signal, insertableOnly);
      if (active.signal.aborted) return;
      setAssets(result.assets); setState('ready');
    } catch (e) {
      if (active.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Search failed. Try again.'); setState('error');
    }
  };

  return createPortal(<div className="apple-catalog-overlay"><Modal title="Asset library" onClose={onClose} wide>
    <div className="apple-catalog">
      <p className="muted">Choose a reference for your next message. Search and previews do not use AI Credits, start a build or upload assets.</p>
      <form className="apple-catalog__search" role="search" onSubmit={e => { e.preventDefault(); e.stopPropagation(); void search(); }}>
        <label className="sr-only" htmlFor="asset-catalog-query">Search assets</label>
        <input ref={searchInput} id="asset-catalog-query" value={query} maxLength={120} placeholder="Try tree, stone or coin" onChange={e => setQuery(e.target.value)} />
        <button type="submit" disabled={!query.trim() || state === 'loading'}>{state === 'loading' ? 'Searching…' : 'Search'}</button>
      </form>
      <label className="apple-catalog__filter">
        <input type="checkbox" checked={insertableOnly} onChange={e => {
          controller.current?.abort(); setInsertableOnly(e.target.checked); setState('idle'); setAssets([]); setError('');
        }} /> Only assets with a Roblox ID
      </label>
      <p className="apple-catalog__status muted" role="status">
        {state === 'idle' ? 'Search by name to compare assets, sources and recorded licences.'
          : state === 'loading' ? `Searching for “${searched}”…`
          : state === 'ready' ? assets.length ? `Showing ${assets.length} matches for “${searched}” (up to 20).` : `No matches for “${searched}”. Try a shorter name or a different word.` : ''}
      </p>
      {error && <p role="alert">{error}</p>}
      <ul className="apple-catalog__results" aria-label="Asset search results">
        {assets.map(asset => <li key={asset.id}>
          <AssetPreview key={`${asset.id}:${asset.preview?.state}:${asset.preview?.url}`} asset={asset} />
          <div className="apple-catalog__details">
            <span className="apple-catalog__kind muted">{asset.kind.replace(/_/g, ' ')} · {asset.source.replace(/_/g, ' ')}</span>
            <strong>{asset.name}</strong>
            {asset.author && <span className="muted">By {asset.author}</span>}
            <span className="apple-catalog__identifier muted" title={asset.id}>
              {Number.isSafeInteger(asset.robloxAssetId) && Number(asset.robloxAssetId) > 0 ? `Roblox #${asset.robloxAssetId}` : asset.id}
            </span>
            {catalogDetails(asset).length > 0 && <span className="apple-catalog__metadata muted">{catalogDetails(asset).join(' · ')}</span>}
            <span className="muted">{asset.licence || 'Licence not recorded'}{asset.attributionRequired ? ' · Attribution required' : ''}</span>
            {catalogSourceLink(asset.sourceUrl) && <a href={catalogSourceLink(asset.sourceUrl)!} target="_blank" rel="noopener noreferrer">View source</a>}
            <span className="muted">{assetAvailability(asset)}</span>
          </div>
          <button type="button" aria-label={`Add reference to ${asset.name}`} onClick={() => {
            if (onChoose(asset)) onClose();
            else setError('Your draft is too long to add this reference. Shorten it and try again.');
          }}>Add reference</button>
        </li>)}
      </ul>
      <p className="apple-catalog__footnote muted">Previews come from Roblox and are not safety or permission checks. Files marked “Needs import” are not ready for Studio. Your source choices still apply.</p>
    </div>
  </Modal></div>, document.body);
}
