/**
 * 서비스 워커 — 셸만 캐시(오프라인 진입), 데이터는 네트워크 우선.
 * DESIGN-V2: 룰 엔진/스크립트는 클라 자산이 아니므로 캐시 대상이 아니다.
 */
const CACHE = 'edopro-web-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // 해시가 붙은 빌드 산출물은 캐시 우선, 그 외는 네트워크 우선
  const isAsset = /\/assets\//.test(url.pathname);
  e.respondWith(
    (isAsset
      ? caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        }))
      : fetch(e.request).catch(() => caches.match(e.request))
    ).catch(() => caches.match('/index.html')),
  );
});
