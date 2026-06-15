const CACHE = 'zam-v1';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/api.js', '/map.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  // Network first for HTML, cache first for assets
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});

// Push event from server (future)
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {title: 'ZAM Club', body: 'Neue Benachrichtigung'};
  e.waitUntil(
    self.registration.showNotification(data.title || 'ZAM Club', {
      body: data.body || '',
      icon: '/assets/icon-192.png',
      badge: '/assets/badge-72.png',
      tag: data.tag || 'zam-notif',
      data: data,
      vibrate: [200, 100, 200],
      actions: data.actions || []
    })
  );
});

// Click on notification
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
