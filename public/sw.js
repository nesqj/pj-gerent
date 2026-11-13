// Service worker do app: permite instalar na tela de início e abrir mesmo sem internet
// (busca sempre a versão nova; se estiver sem conexão, usa a última cópia guardada).
const CACHE = 'gerenciador-precos-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copia))
        }
        return res
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/'))),
  )
})

// Ao tocar num aviso, abre (ou foca) o app
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((abertas) => (abertas[0] ? abertas[0].focus() : self.clients.openWindow('/'))),
  )
})
