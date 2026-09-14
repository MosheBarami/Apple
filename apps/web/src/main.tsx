import { createRoot } from 'react-dom/client';
import { App } from './app';
import { initDirection } from './lib/direction.ts';
import './styles.css';
// The gx- layer: the conversation-first workspace. Loaded after the older
// stylesheet so it wins on the surfaces that have moved over.
import './styles/workspace.css';

// Before React mounts: a direction applied after first paint is a visible flip.
initDirection();

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
