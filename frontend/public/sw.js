self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : { title: 'Schulmanagement', body: 'Neue Aktivität verzeichnet' };
  } catch (err) {
    payload = {
      title: 'Schulmanagement',
      body: event.data ? event.data.text() : 'Mitteilung empfangen'
    };
  }

  const title = payload.title || 'Schulmanagement App';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    data: {
      url: payload.url || '/'
    },
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing application frame window if already active
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new instance view if currently minimized or fully suspended
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
