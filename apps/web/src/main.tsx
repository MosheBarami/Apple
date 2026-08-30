import { createRoot } from 'react-dom/client';
import { App } from './app';
import './styles.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
