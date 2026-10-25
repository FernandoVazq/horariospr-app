// HorariosPR se mudó a horariospr.app: este service worker viejo se borra solo y suelta lo guardado
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll()) c.navigate('https://horariospr.app/movil.html');
})()));
