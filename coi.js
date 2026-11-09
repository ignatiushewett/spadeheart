// Cross-origin isolation for static hosts (GitHub Pages and the like).
//
// server.js sends the two headers that let the chunk workers share the city layout through a SharedArrayBuffer. A static host cannot
// send headers, so on one this file registers itself as a service worker that adds them to every response from this site, then reloads
// the page once so it comes up isolated. Where the page is already isolated (node server.js), or a service worker is not available, it
// does nothing, and the game falls back to giving each worker its own copy of the layout.

if (typeof window === 'undefined') {
  // --- The service worker ---
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
    // Only this site's own files: nothing else is loaded, and anything from elsewhere is left alone.
    if (new URL(req.url).origin !== self.location.origin) return;
    e.respondWith(fetch(req).then((res) => {
      if (res.status === 0) return res;
      const h = new Headers(res.headers);
      h.set('Cross-Origin-Opener-Policy', 'same-origin');
      h.set('Cross-Origin-Embedder-Policy', 'require-corp');
      h.set('Cross-Origin-Resource-Policy', 'same-origin');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }));
  });
} else if (!window.crossOriginIsolated && window.isSecureContext && 'serviceWorker' in navigator) {
  // --- The page ---
  const KEY = 'spadeheart-coi-reload';
  let reloaded = false;
  try { reloaded = sessionStorage.getItem(KEY) === '1'; } catch (e) { /* storage blocked: at worst no reload */ }
  const reloadOnce = () => {
    if (reloaded) return;
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { return; }   // without the flag a reload could loop
    window.location.reload();
  };
  navigator.serviceWorker.register(document.currentScript.src).then((reg) => {
    // Already in charge of this page but still not isolated: it was installed by an older visit; one reload picks the headers up.
    if (navigator.serviceWorker.controller) reloadOnce();
    else navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
    reg.update();
  }).catch((err) => console.warn('Cross-origin isolation worker not registered:', err));
} else if (window.crossOriginIsolated) {
  try { sessionStorage.removeItem('spadeheart-coi-reload'); } catch (e) { /* nothing to clear */ }
}
