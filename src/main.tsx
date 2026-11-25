import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        registration.addEventListener('updatefound', () => {
          const nextWorker = registration.installing;
          if (!nextWorker) return;
          nextWorker.addEventListener('statechange', () => {
            if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
              nextWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        const checkUpdate = () => {
          registration.update().catch(() => undefined);
        };
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            checkUpdate();
          }
        });
      })
      .catch(() => undefined);
  });
} else if ('serviceWorker' in navigator && !import.meta.env.PROD) {
  // En mode dev, enregistrer avec updateViaCache: 'none' pour validation sans bloquer HMR/Vite
  navigator.serviceWorker
    .register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
    .catch(() => undefined);
}

createRoot(document.getElementById('root')!).render(<App />);
