import { createRoot } from 'react-dom/client';
import { App } from './app';
import './styles.css';
// The gx- layer: the conversation-first workspace. Loaded after the older
// stylesheet so it wins on the surfaces that have moved over.
import './styles/workspace.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
