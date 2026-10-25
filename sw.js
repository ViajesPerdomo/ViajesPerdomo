const CACHE_VERSION = "v4";
const CACHE_NAME = "viajes-perdomo-" + CACHE_VERSION;

const ARCHIVOS_CACHE = [
  "./",
  "./index.html",
  "./admin.html",
  "./manifest.json",
  "./datos.json",
  "./datoscliente.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  console.log("📦 [SW] Instalando versión:", CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.allSettled(
          ARCHIVOS_CACHE.map(url =>
            cache.add(url).catch(err => {
              console.warn("⚠️ [SW] No se pudo cachear:", url, err);
            })
          )
        );
      })
      .then(() => {
        console.log("⚡ [SW] skipWaiting()");
        return self.skipWaiting();
      })
      .catch(err => console.error("❌ [SW] Error install:", err))
  );
});

self.addEventListener("activate", event => {
  console.log("🔄 [SW] Activando versión:", CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys.map(key => {
            if(key !== CACHE_NAME){
              console.log("🧹 [SW] Eliminando caché antigua:", key);
              return caches.delete(key);
            }
          });
        );
      })
      .then(() => {
        console.log("👑 [SW] clients.claim()");
        return self.clients.claim();
      })
      .then(() => {
        return self.clients.matchAll({ type: "window" }).then(clients => {
          clients.forEach(client => {
            client.postMessage({
              tipo: "SW_ACTUALIZADO",
              version: CACHE_VERSION
            });
          });
        });
      })
      .catch(err => console.error("❌ [SW] Error activate:", err))
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  if(url.origin !== self.location.origin) return;
  if(event.request.method !== "GET") return;

  if(url.pathname.endsWith("/datos.json") || url.pathname.endsWith("/datoscliente.json")){
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if(resp && resp.status === 200){
            const copia = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copia));
          }
          return resp;
        })
        .catch(() => {
          console.log("📴 [SW] Offline — usando caché:", url.pathname);
          return caches.match(event.request);
        })
    );
    return;
  }

  if(event.request.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/admin.html")){
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if(resp && resp.status === 200){
            const copia = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copia));
          }
          return resp;
        })
        .catch(() => {
          console.log("📴 [SW] Offline — usando HTML de caché");
          return caches.match(event.request).then(resp => {
            return resp || caches.match("./index.html");
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(resp => {
        if(resp) return resp;
        return fetch(event.request)
          .then(respuesta => {
            if(respuesta && respuesta.status === 200 && respuesta.type === "basic"){
              const copia = respuesta.clone();
              caches.open(CACHE_NAME).then(c => c.put(event.request, copia));
            }
            return respuesta;
          })
          .catch(() => {
            console.log("📴 [SW] Offline — recurso no disponible:", event.request.url);
          });
      })
  );
});

self.addEventListener("message", event => {
  if(event.data && event.data.tipo === "SKIP_WAITING"){
    console.log("⚡ [SW] SKIP_WAITING recibido");
    self.skipWaiting();
  }
});