/// <reference lib="webworker" />
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  addPlugins,
} from 'workbox-precaching';
import worldManifest from '../public/world/manifest.json';
import { registerRoute, NavigationRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string }>;
};
const worldAssets = new Map(worldManifest.assets.map((a) => [a.url, a]));
addPlugins([
  {
    cacheWillUpdate: async ({ request, response }) => {
      const asset = worldAssets.get(new URL(request.url).pathname);
      if (!asset) return response;
      const bytes = await response.clone().arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const sha = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      if (bytes.byteLength !== asset.bytes || sha !== asset.sha256)
        throw new Error('Globe asset integrity check failed');
      return response;
    },
  },
]);
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/auth\//, /^\/(packages|audio|glyphs)\//],
  }),
);
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/packages/') ||
      url.pathname.startsWith('/glyphs/') ||
      url.pathname.startsWith('/audio/'))
  ) {
    event.respondWith(
      (async () => {
        // Integrity repair and update checks must bypass a corrupt cached copy.
        if (
          event.request.cache === 'no-store' ||
          event.request.cache === 'reload'
        )
          return fetch(event.request);
        const cache = await caches.open('turnright-assets-v1');
        return (
          (await cache.match(event.request, { ignoreSearch: true })) ||
          fetch(event.request)
        );
      })(),
    );
  }
});
