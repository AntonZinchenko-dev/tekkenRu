import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initApi } from './api';
import './styles.css';

if (location.search.includes('visiontest')) {
  import('./vision/vision').then((m) => ((window as unknown as { __vision: unknown }).__vision = m));
}

initApi().then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
