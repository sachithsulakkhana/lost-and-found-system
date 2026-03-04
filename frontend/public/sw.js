// Lost & Found — Service Worker
// Handles Web Push notifications so alarms fire even when the browser tab is closed.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: '🚨 THEFT ALERT', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:             data.body,
      icon:             '/favicon.ico',
      badge:            '/favicon.ico',
      tag:              data.tag || 'theft-alarm',
      renotify:         data.renotify ?? true,
      requireInteraction: data.requireInteraction ?? true,  // stays until dismissed
      vibrate:          [300, 100, 300, 100, 300],
      data:             { url: '/alerts' }
    })
  );
});

// Clicking the notification opens the app and navigates to the Alerts page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If app is already open, focus it
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
