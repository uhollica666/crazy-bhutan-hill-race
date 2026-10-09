/**
 * Registers the offline service worker (production builds only).
 * `onUpdate` fires when a new version has installed while an older one is controlling the page,
 * so the player can choose when to reload instead of being interrupted mid-race.
 */
export function registerServiceWorker(onUpdate: () => void): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) onUpdate();
          });
        });
        window.setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
      })
      .catch((err) => console.warn('Service worker registration failed', err));
  });
}
