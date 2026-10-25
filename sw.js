/* Service worker de la vista del teléfono (lo copia vite.movil.config.ts a dist-movil/sw.js con la lista de archivos).
   - Guarda la página y todos sus archivos al instalarse: abre sin conexión.
   - Página: primero la red; sin red, la guardada.
   - Archivos de la app (con hash en el nombre): primero lo guardado.
   - Datos de otro servidor (la nube, cuando llegue): primero la red y se guarda la última respuesta,
     así el último horario visto se ve sin conexión.
   - version.json (la versión mínima, "Actualiza HorariosPR"): siempre de la red, nunca guardado.
   - Avisos (web push, Orden 9): muestra el aviso que manda supabase/functions/avisar y, al tocarlo, abre la app.
   Solo funciona hospedado (https o localhost). Abriendo el archivo con doble clic (file://) no hay service worker. */
const VERSION = '2.0.0-beta.1-c83b400097';
const ARCHIVOS = [
  "./assets/MovilNube-BWbMzsry.css",
  "./assets/MovilNube-D9tmqVeU.js",
  "./assets/atkinson-hyperlegible-next-latin-wght-normal-BcXVPD7q.woff2",
  "./assets/borrar-BpujV5uS.js",
  "./assets/index-C7nSr84o.js",
  "./assets/index-DJolO0Q6.js",
  "./assets/index-jyOAJ8Vv.js",
  "./assets/movil-Dp5vw8EL.css",
  "./assets/movil-NLl9MTj0.js",
  "./assets/supabase-CVUJRtFi.js",
  "./assets/web-Dk6qAqBp.js",
  "./iconos/apple-touch-icon.png",
  "./iconos/icono-192.png",
  "./iconos/icono-512.png",
  "./iconos/icono-maskable-512.png",
  "./iconos/icono.svg",
  "./manifest.webmanifest",
  "./movil.html"
];
const APP = `horariospr-app-${VERSION}`;
const DATOS = 'horariospr-datos';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('horariospr-app-') && k !== APP).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const PAGINA = new URL('movil.html', self.registration.scope).href;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // la versión mínima siempre se pregunta a la red (sin red, la app sigue como está)
  if (url.origin === self.location.origin && url.pathname.endsWith('/version.json')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => new Response('null', { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // la app grande (/escritorio/) comparte el sitio pero no es de este service worker: ni se guarda ni se toca
  const relativa = url.origin === self.location.origin ? url.pathname.slice(new URL(self.registration.scope).pathname.length) : null;
  if (relativa !== null && relativa.startsWith('escritorio')) return;

  if (req.mode === 'navigate') {
    // solo las páginas del teléfono; cualquier otra navegación va directo a la red
    if (relativa === null || !['', 'movil.html', 'index.html'].includes(relativa)) return;
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) { const copia = r.clone(); caches.open(APP).then((c) => c.put(PAGINA, copia)); }
          return r;
        })
        .catch(() => caches.match(PAGINA, { ignoreSearch: true })),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(APP).then((c) => c.put(req, copia)); }
        return r;
      })),
    );
    return;
  }

  // otro servidor (datos publicados): red primero, copia de respaldo
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(DATOS).then((c) => c.put(req, copia)); }
        return r;
      })
      .catch(() => caches.open(DATOS).then((c) => c.match(req)).then((hit) => hit || Response.error())),
  );
});

// "Toca para actualizar": la página le pide al service worker nuevo que tome el control ya.
self.addEventListener('message', (e) => {
  if (e.data && e.data.tipo === 'saltar-espera') self.skipWaiting();
});

// Aviso al publicar. Solo trae titulo, cuerpo, etiqueta y url (cifrado de punta a punta con las llaves del teléfono).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data ? e.data.text() : '' }; }
  const titulo = typeof d.titulo === 'string' && d.titulo ? d.titulo : 'HorariosPR';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: typeof d.cuerpo === 'string' ? d.cuerpo : '',
    tag: typeof d.etiqueta === 'string' ? d.etiqueta : 'horariospr',
    renotify: true,
    icon: new URL('iconos/icono-192.png', self.registration.scope).href,
    badge: new URL('iconos/icono-192.png', self.registration.scope).href,
    lang: 'es',
    data: { url: typeof d.url === 'string' ? d.url : './' },
  }));
});

// Tocar el aviso: si la app está abierta, se trae al frente; si no, se abre. Solo dentro de este sitio.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const pedida = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope);
  const destino = pedida.origin === self.location.origin ? pedida.href : self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
      const abierta = ws.find((w) => w.url.startsWith(self.registration.scope));
      if (abierta) return abierta.focus().then((w) => (w && 'navigate' in w && w.url !== destino ? w.navigate(destino) : w));
      return self.clients.openWindow(destino);
    }),
  );
});
