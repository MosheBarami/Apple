import { createRoot } from 'react-dom/client';
import { App } from './app';
import { initDirection } from './lib/direction.ts';
import { installSentry } from './lib/sentry.ts';
import './design/system.css';
import './design/apple-minimal.css';

// Before React mounts: a direction applied after first paint is a visible flip.
initDirection();

// ERROR MONITORING, BEFORE THE FIRST RENDER — and this is the only file in the app that reads the
// DSN. Installing after `createRoot().render()` would leave every error thrown during the first
// mount, which is where the interesting ones live, outside the handlers.
//
// THE DSN IS CONFIGURATION AND IS UNSET BY DEFAULT. Set `VITE_SENTRY_DSN` in apps/web/.env.local
// (untracked) or in the build environment; with no value `installSentry` registers no listeners
// and sends nothing, and the app behaves exactly as it does today. See lib/sentry.ts.
//
// Vite inlines `import.meta.env.*` at BUILD time, so the DSN is baked into the bundle — which is
// correct and is how every browser Sentry SDK works: a DSN carries a public key and grants only
// the ability to send this project events.
installSentry({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  release: import.meta.env.VITE_BUILD_SHA,
  environment: import.meta.env.MODE,
});

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
