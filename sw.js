const CACHE = 'zam-club-v39';
const ASSETS = [
  '/', '/index.html', '/style.css', '/app.js', '/api.js', '/security.js', '/features.js', '/partnerdeal-workflow.js', '/map.html',
  '/manifest.json', '/assets/icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // HTML: network first, fallback to cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => { const c = r.clone(); caches.open(CACHE).then(cx => cx.put(e.request, c)); return r; })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
  // Assets: stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const fresh = fetch(e.request).then(r => {
          if (r.ok) cache.put(e.request, r.clone());
          return r;
        }).catch(() => null);
        return cached || fresh;
      })
    )
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {title: 'ZAM Club', body: 'Neue Benachrichtigung'};
  e.waitUntil(
    self.registration.showNotification(data.title || 'ZAM Club', {
      body: data.body || '',
      icon: '/assets/icon.svg',
      badge: '/assets/icon.svg',
      tag: data.tag || 'zam-notif',
      data: data,
      vibrate: [200, 100, 200],
      actions: data.actions || []
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({type: 'window'}).then(wcs => {
      for (const wc of wcs) {
        if (wc.url.includes(self.location.origin) && 'focus' in wc) {
          wc.postMessage({type: 'notif-click', data: e.notification.data});
          return wc.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
