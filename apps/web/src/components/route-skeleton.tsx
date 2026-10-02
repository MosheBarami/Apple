import './route-skeleton.css';

/**
 * WHAT A LAZY ROUTE SHOWS WHILE ITS CHUNK DOWNLOADS.
 *
 * Eight Suspense fallbacks in app.tsx were an empty `<div class="page" aria-busy>`: a blank screen for
 * as long as the chunk took (the workspace's took 3.5 s on the throttled mobile profile). This draws the
 * silhouette of the page that is coming, in the shared `.skeleton` primitive, so the wait shows
 * where things will be and the real page lands without moving anything.
 *
 *   page       a heading and a description, then a grid of cards (dashboard, usage, settings, roadmap)
 *   workspace  a thread of message blocks and the composer bar under it
 *
 * It says "Loading" to assistive technology and nothing else: the blocks are decoration.
 */
export function RouteSkeleton({ shape = 'page' }: { shape?: 'page' | 'workspace' }) {
  return (
    <div className={`page route-skeleton route-skeleton--${shape}`} aria-busy="true" role="status">
      <span className="visually-hidden">Loading</span>
      {shape === 'workspace' ? (
        <>
          <div className="route-skeleton__thread" aria-hidden="true">
            <span className="skeleton route-skeleton__line route-skeleton__line--user" />
            <span className="skeleton route-skeleton__block" />
            <span className="skeleton route-skeleton__line route-skeleton__line--user" />
            <span className="skeleton route-skeleton__block route-skeleton__block--tall" />
          </div>
          <span className="skeleton route-skeleton__composer" aria-hidden="true" />
        </>
      ) : (
        <>
          <span className="skeleton route-skeleton__title" aria-hidden="true" />
          <span className="skeleton route-skeleton__desc" aria-hidden="true" />
          <div className="route-skeleton__grid" aria-hidden="true">
            <span className="skeleton route-skeleton__card" />
            <span className="skeleton route-skeleton__card" />
            <span className="skeleton route-skeleton__card" />
          </div>
        </>
      )}
    </div>
  );
}
