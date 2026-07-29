/* 우리팀을 만들자 — 서비스 워커
   방침: 네트워크 우선(network-first). 온라인이면 항상 새 파일을 받고,
   캐시는 오프라인일 때만 씁니다. "새 파일을 올려도 옛 버전이 뜨는" 문제를
   막기 위한 선택입니다.

   캐시 이름은 등록 URL의 ?v= 값에서 가져옵니다. index.html이
   sw.js?v=<APP_VERSION> 으로 등록하므로, APP_VERSION만 올리면
   이 파일을 건드리지 않아도 캐시가 자동으로 갈립니다. */

const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = 'ourteam-' + VERSION;
const PRECACHE = ['./', './index.html', './manifest.json',
                  './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      // 하나라도 실패하면 설치 전체가 실패하므로 개별로 처리한다.
      // 문서는 HTTP 캐시를 건너뛰고 받아야 옛 파일이 굳지 않는다.
      await Promise.all(PRECACHE.map(u => {
        const isDoc = /\.html?$/i.test(u) || u.endsWith('/');
        const r = isDoc ? new Request(u, {cache: 'reload'}) : u;
        return cache.add(r).catch(() => {});
      }));
    } catch (err) {
      // 프리캐시 실패는 치명적이지 않다. 설치는 계속한다.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('ourteam-') && k !== CACHE)
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  // 폰트 등 외부 도메인은 브라우저에 맡긴다.
  if (url.origin !== self.location.origin) return;

  // 문서(HTML)는 브라우저 HTTP 캐시를 건너뛰고 서버에서 직접 받는다.
  // 이걸 안 하면 fetch()가 GitHub Pages의 10분짜리 캐시를 그대로 돌려주어
  // 네트워크 우선으로 만들어도 새 파일이 오지 않는다.
  const isDoc = req.mode === 'navigate' ||
                (req.destination === 'document') ||
                /\.html?($|\?)/i.test(url.pathname + url.search) ||
                url.pathname.endsWith('/');

  event.respondWith((async () => {
    try {
      const fresh = isDoc
        ? await fetch(new Request(req.url, {cache: 'reload', credentials: 'same-origin'}))
        : await fetch(req);
      if (fresh && fresh.ok && fresh.type !== 'opaque') {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const idx = await caches.match('./index.html', { ignoreSearch: true });
        if (idx) return idx;
      }
      throw err;
    }
  })());
});

// 앱에서 즉시 적용을 요청할 때
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
