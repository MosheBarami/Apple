import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';

// Every screen has a mode from the first paint (the chat's toggle changes it later); the brand overrides key on it.
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.setAttribute('data-mode', dark ? 'dark' : 'light');
document.documentElement.style.colorScheme = dark ? 'dark' : 'light';

createRoot(document.getElementById('root')!).render(<App />);
